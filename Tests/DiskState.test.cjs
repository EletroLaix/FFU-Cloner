const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test(
	'restores disk and partition states and rejects changed disk identity',
	{ skip: process.platform !== 'win32' },
	() => {
		const result = spawnSync(
			'powershell.exe',
			['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'DiskState.ps1')],
			{ encoding: 'utf8', windowsHide: true }
		);
		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.match(result.stdout, /Disk state safety checks passed/);
	}
);
