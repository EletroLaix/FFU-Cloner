const test = require('node:test');
const assert = require('node:assert/strict');
const { releaseNotes } = require('../Scripts/PrepareRelease.cjs');

test('release notes match the exact version and exclude other releases', () => {
	const changelog = '# Changelog\n\n## Release: 1.2.3\n\nNew\n\n## Release: 1.2.2\n\nOld\n';
	assert.equal(releaseNotes('v1.2.3', '1.2.3', changelog), '## Release: 1.2.3\n\nNew\n');
	assert.throws(() => releaseNotes('v1.2.2', '1.2.3', changelog), /must match/);
	assert.throws(() => releaseNotes('v1.2.30', '1.2.30', changelog), /no section/);
	assert.throws(() => releaseNotes('v1.2.3-rc1', '1.2.3-rc1', changelog), /must match/);
});
