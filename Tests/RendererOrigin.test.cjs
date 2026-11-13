const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { canonicalFile, isTrustedRenderer } = require('../Source/Application/RendererOrigin.cjs');

const folder = path.resolve('Output/Validation/OriginFixture');
fs.mkdirSync(folder, { recursive: true });
const archive = path.join(folder, 'app.asar');
fs.writeFileSync(archive, 'fixture');
const entry = path.join(archive, 'dist', 'index.html');
const contents = { mainFrame: { processId: 5, routingId: 8 } };
const event = {
	sender: contents,
	senderFrame: { processId: 5, routingId: 8, url: pathToFileURL(entry).href }
};

test('accepts a separate frame wrapper for the same main frame and encoded local path', () => {
	assert.equal(isTrustedRenderer(event, contents, entry), true);
});
test('canonical archive identity normalizes Windows casing', { skip: process.platform !== 'win32' }, () => {
	assert.equal(canonicalFile(entry.toUpperCase()), canonicalFile(entry));
});
test('rejects other windows, subframes, remote pages and other archive entries', () => {
	for (const changed of [
		{ sender: {} },
		{ senderFrame: null },
		{ senderFrame: { ...event.senderFrame, routingId: 9 } },
		{ senderFrame: { ...event.senderFrame, processId: 6 } },
		{ senderFrame: { ...event.senderFrame, url: 'https://example.com/' } },
		{ senderFrame: { ...event.senderFrame, url: pathToFileURL(path.join(archive, 'other.html')).href } },
		{ senderFrame: { ...event.senderFrame, url: event.senderFrame.url + '?unexpected=1' } }
	])
		assert.equal(isTrustedRenderer({ ...event, ...changed }, contents, entry), false);
});
