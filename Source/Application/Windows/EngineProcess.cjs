const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Escape a value as a literal PowerShell string without interpolation.
function quote(value) {
	return "'" + String(value).replaceAll("'", "''") + "'";
}

// Manage the PowerShell process, cancellation marker, timeout, and capture space guard.
function runEngine(action, request = {}, onLine = () => {}, signal) {
	if (process.platform !== 'win32') {
		return Promise.reject(new Error('FFU operations require Windows.'));
	}
	if (signal?.aborted) {
		return Promise.reject(
			Object.assign(new Error('Operation cancelled.'), { code: 'CANCELLED' })
		);
	}
	const cancelDirectory =
		action === 'clone' ? fs.mkdtempSync(path.join(os.tmpdir(), 'FFUCloner-')) : null;
	const cancelFile = cancelDirectory && path.join(cancelDirectory, 'cancel');
	if (cancelFile) {
		request = { ...request, cancelFile };
	}
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
		let output = '';
		let errors = '';
		let stopped = false;
		let cancelled = false;
		let engineError = '';
		// Let PowerShell stop DISM and restore disk state before it exits.
		const cancel = () => {
			if (cancelFile) {
				fs.writeFileSync(cancelFile, 'cancel');
			}
		};
		signal?.addEventListener('abort', cancel, { once: true });
		if (signal?.aborted) {
			cancel();
		}
		let cleaned = false;
		// Remove the abort listener and temporary cancellation files exactly once.
		const cleanup = () => {
			if (cleaned) {
				return;
			}
			cleaned = true;
			signal?.removeEventListener('abort', cancel);
			if (cancelFile) {
				fs.rmSync(cancelFile, { force: true });
			}
			if (cancelDirectory) {
				fs.rmdirSync(cancelDirectory);
			}
		};
		// Preserve protocol errors while forwarding complete output lines.
		const finishLine = (line) => {
			if (line) {
				if (line === 'FFU_CANCELLED') {
					cancelled = true;
				}
				if (line.startsWith('FFU_ERROR:')) {
					engineError = line.slice(10);
				}
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
					if (index) {
						errors += line + '\n';
					} else {
						finishLine(line);
					}
				}
			});
			stream.on('end', () => {
				if (pending) {
					if (index) {
						errors += pending;
					} else {
						finishLine(pending);
					}
				}
			});
		}
		// Inventory calls have a timeout; clone cancellation uses the marker instead.
		const kill = () => {
			if (stopped) {
				return;
			}
			stopped = true;
			const killer = spawn(
				path.join(
					process.env.SystemRoot || 'C:\\Windows',
					'System32',
					'taskkill.exe'
				),
				['/PID', String(child.pid), '/T', '/F'],
				{ windowsHide: true }
			);
			killer.on('error', () => child.kill());
		};
		const timeout = action !== 'clone' ? setTimeout(kill, 45000) : null;
		// Ask the engine to stop capture before the destination volume fills up.
		const stopCapture = () => {
			if (stopped) {
				return;
			}
			stopped = true;
			cancel();
		};
		// Low-space protection affects capture only; user cancellation is cooperative in PowerShell.
		const guard =
			action === 'clone' && request.mode === 'capture'
				? setInterval(() => {
						try {
							const volume = fs.statfsSync(path.dirname(request.image));
							if (volume.bavail * volume.bsize < 1024 ** 3) {
								stopCapture();
							}
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
			if (timeout) {
				clearTimeout(timeout);
			}
			if (guard) {
				clearInterval(guard);
			}
			cleanup();
			if (cancelled && !stopped) {
				reject(
					Object.assign(new Error('Operation cancelled.'), {
						code: 'CANCELLED'
					})
				);
				return;
			}
			if (stopped) {
				let message = 'Timed out while listing disks.';
				if (action === 'clone') {
					message =
						'Capture stopped: insufficient free space or volume unavailable. The incomplete file was deleted.';
					if (engineError && !cancelled) {
						message = engineError;
					}
				}
				reject(new Error(message));
			} else if (code !== 0) {
				reject(
					new Error(
						engineError ||
							errors.trim() ||
							`Operation failed (code ${code}). See the log.`
					)
				);
			} else {
				resolve(output.trim());
			}
		});
	});
}

module.exports = { runEngine, quote };
