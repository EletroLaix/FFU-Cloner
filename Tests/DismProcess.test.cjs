const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

for (const scenario of ['success', 'failure', 'cancel', 'stream-error', 'speed-capture', 'speed-apply']) {
	test(
		`real DISM process loop: ${scenario}, without disk access`,
		{ skip: process.platform !== 'win32', timeout: 15000 },
		async () => {
			const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'FFU-Test-'));
			const marker = path.join(directory, 'cancel');
			try {
				const speedTest = scenario.startsWith('speed-');
				let firstSpeedBeforeEnd = false;
				const result = await new Promise((resolve, reject) => {
					const child = spawn(
						'powershell.exe',
						[
							'-NoProfile',
							'-NonInteractive',
							'-File',
							path.join(__dirname, 'DismProcess.ps1'),
							'-CancelFile',
							marker,
							'-Scenario',
							scenario
						],
						{ windowsHide: true }
					);
					let output = '',
						errors = '';
					child.stdout.on('data', (data) => {
						output += data.toString();
						if (/FFU_SPEED:\d+/.test(output) && !output.includes('TEST_SUCCESS'))
							firstSpeedBeforeEnd = true;
						if (scenario === 'cancel' && /(?:^|\n)FFU_TEST_READY[ \t]*\r?\n/.test(output))
							fs.writeFileSync(marker, 'cancel');
					});
					child.stderr.on('data', (data) => (errors += data.toString()));
					child.on('error', reject);
					child.on('close', (code) => resolve({ code, output, errors }));
				});
				assert.equal(
					result.code,
					scenario === 'success' || speedTest ? 0 : scenario === 'cancel' ? 2 : 1,
					JSON.stringify(result)
				);
				assert.match(
					['failure', 'stream-error'].includes(scenario) ? result.errors : result.output,
					scenario === 'success' || speedTest
						? /100%[\s\S]*TEST_SUCCESS/
						: scenario === 'cancel'
							? /FFU_CANCELLED/
							: scenario === 'stream-error'
								? /Simulated log failure/
								: /code 7/
				);
				if (speedTest) {
					assert.equal(
						firstSpeedBeforeEnd,
						true,
						'Speed must arrive while the child process is running'
					);
					const speed = Number(result.output.match(/FFU_SPEED:(\d+)/)[1]);
					assert.ok(speed > (scenario === 'speed-capture' ? 700000 : 1400000));
					assert.doesNotMatch(result.output, /FFU_SPEED:unavailable/);
				} else if (scenario !== 'success') assert.doesNotMatch(result.output, /TEST_SUCCESS/);
			} finally {
				fs.rmSync(marker, { force: true });
				fs.rmdirSync(directory);
			}
		}
	);
}
