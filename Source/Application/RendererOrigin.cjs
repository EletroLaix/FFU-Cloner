const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

// Windows paths can have short and long forms. Compare physical files, not URL strings.
function canonicalFile(file) {
	const parts = path.resolve(file).split(path.sep);
	const archive = parts.findIndex((part) => part.toLowerCase().endsWith('.asar'));
	const physical = archive < 0 ? file : parts.slice(0, archive + 1).join(path.sep);
	const resolved = fs.realpathSync.native(physical);
	const result =
		archive < 0 ? resolved : path.join(resolved, ...parts.slice(archive + 1));
	return process.platform === 'win32' ? result.toLowerCase() : result;
}

// Accept privileged requests only from the main frame of the packaged interface.
function isTrustedRenderer(event, contents, entryFile) {
	try {
		const frame = event.senderFrame;
		const main = contents.mainFrame;
		if (
			event.sender !== contents ||
			!frame ||
			!main ||
			!Number.isInteger(frame.processId) ||
			!Number.isInteger(frame.routingId) ||
			frame.processId !== main.processId ||
			frame.routingId !== main.routingId
		) {
			return false;
		}
		const url = new URL(frame.url);
		if (url.protocol !== 'file:' || url.hostname || url.search || url.hash) {
			return false;
		}
		return canonicalFile(fileURLToPath(url)) === canonicalFile(entryFile);
	} catch {
		return false;
	}
}

module.exports = { canonicalFile, isTrustedRenderer };
