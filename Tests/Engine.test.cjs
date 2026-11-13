const test = require('node:test');
const assert = require('node:assert/strict');
const {
	blockReason,
	percentOf,
	speedOf,
	quote,
	clone,
	runEngine
} = require('../Source/Application/Windows/Dism.cjs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const disk = {
	number: 1,
	name: 'Test',
	uniqueId: 'TEST-ONLY',
	serial: 'SERIAL',
	size: 32017047552,
	style: 'GPT'
};

for (const mode of ['apply', 'capture']) {
	for (const flag of ['system', 'boot', 'paging'])
		test(`${mode}: blocks ${flag} disk`, () => {
			assert.ok(blockReason({ ...disk, [flag]: true }, mode));
		});
}
test('read-only target blocked; read-only source allowed', () => {
	assert.ok(blockReason({ ...disk, readOnly: true }, 'apply'));
	assert.equal(blockReason({ ...disk, readOnly: true }, 'capture'), null);
});
test('capture requires GPT; apply accepts a cleared disk', () => {
	assert.ok(blockReason({ ...disk, style: 'MBR' }, 'capture'));
	assert.equal(blockReason({ ...disk, style: 'RAW' }, 'apply'), null);
});
test('missing identity and invalid capacity blocked', () => {
	for (const invalid of [
		{ uniqueId: '' },
		{ uniqueId: '   ' },
		{ size: 0 },
		{ size: -1 },
		{ size: Number.MAX_SAFE_INTEGER + 1 }
	])
		assert.ok(blockReason({ ...disk, ...invalid }, 'apply'));
});
test('progress supports CR output and decimal separators', () => {
	assert.equal(percentOf('\r[=== 42.8% ====]'), 42.8);
	assert.equal(percentOf('100,0%'), 100);
	assert.equal(percentOf('DISM error 87'), null);
	assert.equal(percentOf('101%'), null);
	assert.equal(percentOf('1234%'), null);
});
test('PowerShell literals preserve quotes and prevent interpolation', () => {
	assert.equal(quote("C:\\Image's folder\\$(calc).ffu"), "'C:\\Image''s folder\\$(calc).ffu'");
});
test('speed accepts actual nonnegative byte counters only', () => {
	assert.equal(speedOf('FFU_SPEED:125000000'), 125000000);
	assert.equal(speedOf('FFU_SPEED:0'), 0);
	for (const line of ['42.8%', 'FFU_SPEED:-1', 'FFU_SPEED:NaN', 'FFU_SPEED:9007199254740992'])
		assert.equal(speedOf(line), null);
});
test('clone rejects unsafe requests before starting a process', async () => {
	for (const request of [
		{ mode: 'erase', disk },
		{ mode: 'apply', disk: { ...disk, number: '1;calc' } },
		{ mode: 'apply', disk: { ...disk, system: true } },
		{ mode: 'apply', disk, confirmation: 'DISK 0' },
		{ mode: 'apply', disk, confirmation: 'disk 1' }
	])
		await assert.rejects(clone(request, () => {}));
});

test('actual PowerShell engine safety checks and syntax', { skip: process.platform !== 'win32' }, () => {
	const result = spawnSync(
		path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
		['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'EngineSafety.ps1')],
		{ encoding: 'utf8', windowsHide: true }
	);
	assert.equal(result.status, 0, result.stderr || result.stdout);
	assert.match(result.stdout, /safety checks passed/);
});
test(
	'PowerShell engine reports a clean error before any disk operation',
	{ skip: process.platform !== 'win32' },
	async () => {
		await assert.rejects(runEngine('clone', { mode: 'invalid' }), (error) => {
			assert.doesNotMatch(error.message, /CLIXML|<Objs|schemas\.microsoft/);
			assert.match(error.message, /administrator|Invalid operation/);
			return true;
		});
	}
);
