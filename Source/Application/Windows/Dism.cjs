const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function blockReason(disk, mode) {
	if (disk.system || disk.boot || disk.paging) return 'Protected system disk';
	if (!String(disk.uniqueId || '').trim() || !Number.isSafeInteger(disk.size) || disk.size <= 0)
		return 'Disk identity unavailable';
	if (mode === 'apply' && disk.readOnly) return 'Disk is read-only';
	if (mode === 'capture' && disk.style !== 'GPT') return 'Capture requires GPT';
	return null;
}

function percentOf(line) {
	const match = line.match(/(?<![\d.])(\d{1,3}(?:[.,]\d+)?)%/);
	const value = match ? Number(match[1].replace(',', '.')) : NaN;
	return value >= 0 && value <= 100 ? value : null;
}

function quote(value) {
	return "'" + String(value).replaceAll("'", "''") + "'";
}
function speedOf(line) {
	if (!/^FFU_SPEED:\d+$/.test(line)) return null;
	const value = Number(line.slice(10));
	return Number.isSafeInteger(value) ? value : null;
}

function runEngine(action, request = {}, onLine = () => {}, signal) {
	if (process.platform !== 'win32') return Promise.reject(new Error('FFU operations require Windows.'));
	if (signal?.aborted)
		return Promise.reject(Object.assign(new Error('Operation cancelled.'), { code: 'CANCELLED' }));
	const cancelDirectory = action === 'clone' ? fs.mkdtempSync(path.join(os.tmpdir(), 'FFUCloner-')) : null;
	const cancelFile = cancelDirectory && path.join(cancelDirectory, 'cancel');
	if (cancelFile) request = { ...request, cancelFile };
	const engine = path
		.join(__dirname, 'Engine.ps1')
		.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
	const script = `& ${quote(engine)} -Action ${quote(action)} -RequestJson ${quote(JSON.stringify(request))}`;
	const powershell = path.join(
		process.env.SystemRoot || 'C:\\Windows',
		'System32',
		'WindowsPowerShell',
		'v1.0',
		'powershell.exe'
	);
	return new Promise((resolve, reject) => {
		const child = spawn(
			powershell,
			[
				'-NoLogo',
				'-NoProfile',
				'-NonInteractive',
				'-InputFormat',
				'Text',
				'-OutputFormat',
				'Text',
				'-EncodedCommand',
				Buffer.from(script, 'utf16le').toString('base64')
			],
			{ windowsHide: true, shell: false }
		);
		let output = '',
			errors = '',
			stopped = false,
			cancelled = false;
		let engineError = '';
		const cancel = () => {
			if (cancelFile) fs.writeFileSync(cancelFile, 'cancel');
		};
		signal?.addEventListener('abort', cancel, { once: true });
		if (signal?.aborted) cancel();
		let cleaned = false;
		const cleanup = () => {
			if (cleaned) return;
			cleaned = true;
			signal?.removeEventListener('abort', cancel);
			if (cancelFile) fs.rmSync(cancelFile, { force: true });
			if (cancelDirectory) fs.rmdirSync(cancelDirectory);
		};
		const finishLine = (line) => {
			if (line) {
				if (line === 'FFU_CANCELLED') cancelled = true;
				if (line.startsWith('FFU_ERROR:')) engineError = line.slice(10);
				output += line + '\n';
				onLine(line);
			}
		};
		const streams = [child.stdout, child.stderr];
		for (const [index, stream] of streams.entries()) {
			let pending = '';
			stream.setEncoding('utf8');
			stream.on('data', (chunk) => {
				pending += chunk;
				const lines = pending.split(/[\r\n]+/);
				pending = lines.pop();
				for (const line of lines) {
					if (index) errors += line + '\n';
					else finishLine(line);
				}
			});
			stream.on('end', () => {
				if (pending) {
					if (index) errors += pending;
					else finishLine(pending);
				}
			});
		}
		const kill = () => {
			if (stopped) return;
			stopped = true;
			const killer = spawn(
				path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
				['/PID', String(child.pid), '/T', '/F'],
				{ windowsHide: true }
			);
			killer.on('error', () => child.kill());
		};
		const timeout = action !== 'clone' ? setTimeout(kill, 45000) : null;
		const stopCapture = () => {
			if (stopped) return;
			stopped = true;
			cancel();
		};
		// Low-space protection affects capture only; user cancellation is cooperative in PowerShell.
		const guard =
			action === 'clone' && request.mode === 'capture'
				? setInterval(() => {
						try {
							const volume = fs.statfsSync(path.dirname(request.image));
							if (volume.bavail * volume.bsize < 1024 ** 3) stopCapture();
						} catch {
							stopCapture();
						}
					}, 1000)
				: null;
		child.on('error', (error) => {
			cleanup();
			reject(error);
		});
		child.on('close', (code) => {
			if (timeout) clearTimeout(timeout);
			if (guard) clearInterval(guard);
			cleanup();
			if (cancelled && !stopped) {
				reject(Object.assign(new Error('Operation cancelled.'), { code: 'CANCELLED' }));
				return;
			}
			if (stopped)
				reject(
					new Error(
						action === 'clone'
							? engineError && !cancelled
								? engineError
								: 'Capture stopped: insufficient free space or volume unavailable. The incomplete file was deleted.'
							: 'Timed out while listing disks.'
					)
				);
			else if (code !== 0)
				reject(
					new Error(engineError || errors.trim() || `Operation failed (code ${code}). See the log.`)
				);
			else resolve(output.trim());
		});
	});
}

async function environment() {
	if (process.platform !== 'win32') return { windows: false, admin: false };
	return { windows: true, ...JSON.parse(await runEngine('environment')) };
}
async function listDisks() {
	return JSON.parse(await runEngine('list'));
}

async function clone(request, onProgress, signal) {
	if (!['apply', 'capture'].includes(request.mode)) throw new Error('Invalid operation.');
	if (!request.disk || !Number.isSafeInteger(request.disk.number) || request.disk.number < 0)
		throw new Error('Invalid disk.');
	const reason = blockReason(request.disk, request.mode);
	if (reason) throw new Error(reason);
	if (request.confirmation !== `DISK ${request.disk.number}`) throw new Error('Invalid confirmation.');
	let result;
	await runEngine(
		'clone',
		request,
		(line) => {
			if (line.startsWith('FFU_RESULT:')) result = JSON.parse(line.slice(11));
			else if (line.startsWith('FFU_LOG:')) onProgress({ logPath: line.slice(8) });
			else if (line.startsWith('FFU_STAGE:')) {
				onProgress({ stage: line.slice(10) });
			} else if (line === 'FFU_SPEED:unavailable') onProgress({ bytesPerSecond: null });
			else if (speedOf(line) !== null) onProgress({ bytesPerSecond: speedOf(line) });
			else if (percentOf(line) !== null) onProgress({ percent: percentOf(line) });
		},
		signal
	);
	if (!result?.success) throw new Error('DISM did not confirm completion. See the log.');
	return result;
}

module.exports = { blockReason, percentOf, speedOf, quote, environment, listDisks, clone, runEngine };
