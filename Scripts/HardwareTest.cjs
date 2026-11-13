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
			size > 30e9 &&
			size < 34e9 &&
			!engine.blockReason(initial, 'apply'),
		'Authorized 32 GB test disk must match exactly'
	);
	log('AUTHORIZED TEST DISK: ' + JSON.stringify(initial));
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
		version: '0.2.0'
	};
	await engine.clone(
		{ ...request, mode: 'capture', disk: (await engine.listDisks()).find((d) => d.number === number) },
		progress
	);
	log('Capture succeeded; removing partition table before apply.');
	storage('clear');
	await engine.clone(
		{ ...request, mode: 'apply', disk: (await engine.listDisks()).find((d) => d.number === number) },
		progress
	);
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
