const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_BYTES = 256 * 1024;

async function readLogs(directory, selected) {
	let entries;
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (error.code === 'ENOENT') return { files: [], selected: null, text: '', truncated: false };
		throw error;
	}
	const files = (
		await Promise.all(
			entries
				.filter((entry) => entry.isFile() && /\.(txt|log)$/i.test(entry.name))
				.map(async (entry) => {
					try {
						const stat = await fs.lstat(path.join(directory, entry.name));
						return stat.isFile() ? { name: entry.name, modified: stat.mtimeMs } : null;
					} catch (error) {
						if (error.code === 'ENOENT') return null;
						throw error;
					}
				})
		)
	)
		.filter(Boolean)
		.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name))
		.slice(0, 50);
	const name = files.find((file) => file.name === selected)?.name || files[0]?.name;
	if (!name) return { files, selected: null, text: '', truncated: false };
	const file = await fs.open(path.join(directory, name), 'r');
	try {
		const stat = await file.stat();
		if (!stat.isFile()) throw new Error('Log file is unavailable.');
		const size = Math.min(stat.size, MAX_BYTES);
		const buffer = Buffer.alloc(size);
		const { bytesRead } = await file.read(buffer, 0, size, Math.max(0, stat.size - size));
		let text = buffer.subarray(0, bytesRead).toString('utf8');
		if (stat.size > size) text = text.substring(text.indexOf('\n') + 1);
		return { files, selected: name, text, truncated: stat.size > size };
	} finally {
		await file.close();
	}
}

module.exports = { readLogs };
