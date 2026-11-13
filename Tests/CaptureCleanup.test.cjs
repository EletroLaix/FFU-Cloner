const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test(
	'capture removes partial files after cancellation/errors and preserves completed images',
	{ skip: process.platform !== 'win32' },
	() => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'FFU-Cleanup-Test-'));
		try {
			const result = spawnSync(
				'powershell.exe',
				[
					'-NoProfile',
					'-NonInteractive',
					'-File',
					path.join(__dirname, 'CaptureCleanup.ps1'),
					'-Directory',
					directory
				],
				{ encoding: 'utf8', windowsHide: true }
			);
			assert.equal(result.status, 0, result.stderr || result.stdout);
			assert.match(result.stdout, /5 capture cleanup checks passed/);
		} finally {
			for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
			fs.rmdirSync(directory);
		}
	}
);
