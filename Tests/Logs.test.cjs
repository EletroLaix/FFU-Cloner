const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { readLogs } = require('../Source/Application/Logs.cjs');

test('reads only recent log files, selects safely and limits large files', async () => {
	const root = path.resolve('Output/Validation/Logs');
	await fs.mkdir(root, { recursive: true });
	const directory = await fs.mkdtemp(path.join(root, 'case-'));
	try {
		assert.deepEqual(await readLogs(path.join(directory, 'missing')), {
			files: [],
			selected: null,
			text: '',
			truncated: false
		});
		await fs.writeFile(path.join(directory, 'older.txt'), 'First entry\n');
		await fs.utimes(path.join(directory, 'older.txt'), new Date('2020-01-01'), new Date('2020-01-01'));
		await fs.writeFile(path.join(directory, 'newer.log'), 'x'.repeat(270000) + '\nLast entry\n');
		await fs.writeFile(path.join(directory, 'ignored.json'), 'Not a log');
		const newest = await readLogs(directory, '../ignored.json');
		assert.deepEqual(
			newest.files.map((file) => file.name),
			['newer.log', 'older.txt']
		);
		assert.equal(newest.selected, 'newer.log');
		assert.equal(newest.truncated, true);
		assert.equal(newest.text, 'Last entry\n');
		const older = await readLogs(directory, 'older.txt');
		assert.equal(older.text, 'First entry\n');
		assert.equal(older.truncated, false);
	} finally {
		for (const name of ['older.txt', 'newer.log', 'ignored.json'])
			await fs.unlink(path.join(directory, name)).catch((error) => {
				if (error.code !== 'ENOENT') throw error;
			});
		await fs.rmdir(directory);
	}
});
