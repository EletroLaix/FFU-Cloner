// DESTRUCTIVE, opt-in integration test. Never invoked by npm test/build.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const engine = require('../Source/Application/Windows/Dism.cjs');
const args = process.argv.slice(2);
if (args.length !== 5 || args[0] !== '--erase-test-disk') {
	console.error('DESTRUCTIVE: --erase-test-disk <number> <uniqueId> <serial> <bytes>');
	process.exit(2);
}
const number = Number(args[1]),
	uniqueId = args[2],
	serial = args[3],
	size = Number(args[4]);
const output = path.resolve('Output/Validation/Hardware', new Date().toISOString().replaceAll(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
function log(text) {
	console.log(text);
	fs.appendFileSync(path.join(output, 'test.log'), new Date().toISOString() + ' ' + text + '\n');
}
function storage(action) {
	const result = spawnSync(
		path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
		[
			'-NoProfile',
			'-NonInteractive',
			'-File',
			path.join(__dirname, 'HardwareStorage.ps1'),
			'-Action',
			action,
			'-Number',
			String(number),
			'-UniqueId',
			uniqueId,
			'-Serial',
			serial,
			'-Size',
			String(size),
			'-OutputPath',
			output,
			'-AppPath',
			process.execPath
		],
		{ encoding: 'utf8', windowsHide: true }
	);
	if (result.status !== 0) throw new Error(result.stderr || result.error || 'Storage command failed');
	return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}
function hash(file) {
	return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
(async () => {
	const env = await engine.environment();
	assert.equal(env.admin, true, 'Administrator required');
	const initial = (await engine.listDisks()).find((d) => d.number === number);
	assert.ok(
		initial &&
			initial.uniqueId === uniqueId &&
			initial.serial === serial &&
			initial.size === size &&
			initial.bus === 'USB' &&
			Number.isSafeInteger(size) &&
			size >= 1024 ** 3 &&
			!engine.blockReason(initial, 'apply'),
		'Authorized USB test disk must match exactly'
	);
	log('AUTHORIZED TEST DISK: ' + JSON.stringify(initial));
	assert.ok(
		fs.statfsSync(output).bavail * fs.statfsSync(output).bsize >= 5 * 1024 ** 3,
		'At least 5 GiB of test output space required'
	);
	const reference = storage('prepare');
	assert.match(reference.letter, /^[A-Za-z]$/);
	const root = reference.letter + ':\\';
	let seed = 20261111;
	const payload = Buffer.alloc(32 * 1024 * 1024);
	for (let i = 0; i < payload.length; i++) {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		payload[i] = seed & 255;
	}
	const samples = {
		'payload.bin': payload,
		'identity.txt': Buffer.from('FFU Electron / React hardware roundtrip\n' + JSON.stringify(initial)),
		'empty.bin': Buffer.alloc(0)
	};
	for (const [name, content] of Object.entries(samples)) {
		const handle = fs.openSync(path.join(root, name), 'wx');
		try {
			fs.writeFileSync(handle, content);
			fs.fsyncSync(handle);
		} finally {
			fs.closeSync(handle);
		}
	}
	const hashes = Object.fromEntries(
		Object.keys(samples).map((name) => [name, hash(path.join(root, name))])
	);
	const image = path.join(output, 'roundtrip.ffu');
	const logs = [];
	let lastPercent = -10;
	const progress = (update) => {
		if (update.logPath) logs.push(update.logPath);
		if (update.stage) {
			log(update.stage);
			lastPercent = -10;
		}
		if (update.percent != null && update.percent >= lastPercent + 10) {
			log(update.percent + '%');
			lastPercent = update.percent;
		}
	};
	const request = {
		image,
		confirmation: 'DISK ' + number,
		logDirectory: path.join(output, 'logs'),
		appPaths: [process.execPath, __filename],
		version: require('../package.json').version
	};
	const currentDisk = async () => (await engine.listDisks()).find((d) => d.number === number);
	// Exercise real preflight rejection before any disk preparation or DISM write.
	await assert.rejects(
		engine.clone(
			{ ...request, mode: 'capture', disk: await currentDisk(), image: path.join(root, 'unsafe.ffu') },
			progress
		),
		/another disk/
	);
	log('PASS: image on source disk rejected.');
	const cancelledImage = path.join(output, 'cancelled.ffu');
	storage('offline');
	assert.equal((await currentDisk()).offline, true);
	const cancel = new AbortController();
	await assert.rejects(
		engine.clone(
			{ ...request, image: cancelledImage, mode: 'capture', disk: await currentDisk() },
			(update) => {
				progress(update);
				if (update.stage === 'Capturing') cancel.abort();
			},
			cancel.signal
		),
		(error) => error.code === 'CANCELLED'
	);
	assert.equal(fs.existsSync(cancelledImage), false);
	assert.equal(
		fs.readdirSync(output).some((name) => name.endsWith('.partial.ffu')),
		false
	);
	log('PASS: capture cancellation before DISM leaves no image or partial file.');
	assert.equal((await currentDisk()).offline, true, 'Offline source state after cancellation');
	storage('online');
	async function cancelDuringOperation(mode) {
		const controller = new AbortController();
		let reachedProgress = false;
		await assert.rejects(
			engine.clone(
				{
					...request,
					mode,
					image: mode === 'capture' ? cancelledImage : image,
					disk: await currentDisk()
				},
				(update) => {
					progress(update);
					if (update.percent >= 10) {
						reachedProgress = true;
						controller.abort();
					}
				},
				controller.signal
			),
			(error) => error.code === 'CANCELLED'
		);
		assert.equal(reachedProgress, true, 'DISM must report progress before cancellation');
		if (mode === 'capture') {
			assert.equal(fs.existsSync(cancelledImage), false);
			assert.equal(
				fs.readdirSync(output).some((name) => name.endsWith('.partial.ffu')),
				false
			);
		}
		log('PASS: ' + mode + ' cancellation after DISM progress; operation can be retried.');
	}
	await cancelDuringOperation('capture');
	assert.equal((await currentDisk()).offline, false, 'Online source state after cancellation');
	fs.writeFileSync(image, 'ORIGINAL IMAGE');
	const originalStat = fs.statSync(image);
	const overwrite = { size: originalStat.size, modified: Math.floor(originalStat.mtimeMs) };
	const cancelReplacement = new AbortController();
	await assert.rejects(
		engine.clone(
			{ ...request, mode: 'capture', disk: await currentDisk(), overwrite },
			(update) => {
				if (update.stage === 'Capturing') cancelReplacement.abort();
			},
			cancelReplacement.signal
		),
		(error) => error.code === 'CANCELLED'
	);
	assert.equal(fs.readFileSync(image, 'utf8'), 'ORIGINAL IMAGE');
	log('PASS: cancelled replacement preserved the original image.');
	await engine.clone({ ...request, mode: 'capture', disk: await currentDisk(), overwrite }, progress);
	assert.equal((await currentDisk()).offline, false, 'Online source state after capture');
	log('Capture succeeded; removing partition table before apply.');
	storage('clear');
	const cancelApply = new AbortController();
	await assert.rejects(
		engine.clone(
			{ ...request, mode: 'apply', disk: await currentDisk() },
			(update) => {
				progress(update);
				if (update.stage === 'Restoring') cancelApply.abort();
			},
			cancelApply.signal
		),
		(error) => error.code === 'CANCELLED'
	);
	log('PASS: restore cancellation before DISM; retrying the same target.');
	assert.equal((await currentDisk()).offline, false, 'Online target state after cancellation');
	await cancelDuringOperation('apply');
	assert.equal((await currentDisk()).offline, false, 'Online target state after interrupted restore');
	await engine.clone(
		{ ...request, mode: 'apply', disk: (await engine.listDisks()).find((d) => d.number === number) },
		progress
	);
	assert.equal((await currentDisk()).offline, false, 'Online target state after restore');
	storage('offline');
	await engine.clone({ ...request, mode: 'apply', disk: await currentDisk() }, progress);
	assert.equal((await currentDisk()).offline, true, 'Offline target state after restore');
	log('PASS: initially offline target returned offline after restore.');
	const restored = storage('online');
	assert.deepEqual(restored.layout, reference.layout, 'Partition layout');
	for (const [name, expected] of Object.entries(hashes)) {
		assert.equal(hash(path.join(restored.letter + ':\\', name)), expected, 'SHA256 ' + name);
		log('SHA256 MATCH: ' + name + ' ' + expected);
	}
	const report = {
		passed: true,
		disk: initial,
		image,
		hashes,
		layout: restored.layout,
		logs,
		finished: new Date().toISOString()
	};
	fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
	fs.writeFileSync('Output/Validation/Hardware/latest.json', JSON.stringify(report, null, 2));
	log('PASS: disk -> FFU -> cleared disk; layout and all SHA256 hashes match.');
})().catch((error) => {
	log('FAIL: ' + error.stack);
	fs.writeFileSync(
		path.join(output, 'result.json'),
		JSON.stringify({ passed: false, error: error.stack }, null, 2)
	);
	process.exitCode = 1;
});
