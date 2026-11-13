const fs = require('node:fs');
const path = require('node:path');

function releaseNotes(tag, version, changelog) {
	if (!/^v\d+\.\d+\.\d+$/.test(tag) || tag !== `v${version}`)
		throw new Error('The release tag must match the package version, for example v0.1.0.');
	const sections = changelog.split(/(?=^## Release: )/m);
	const section = sections.find((part) => part.split(/\r?\n/, 1)[0] === `## Release: ${version}`);
	if (!section) throw new Error(`The changelog has no section for ${version}.`);
	return section.trim() + '\n';
}

if (require.main === module) {
	try {
		const root = path.join(__dirname, '..');
		const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
		const changelog = fs.readFileSync(path.join(root, 'Documentation/Changelog.md'), 'utf8');
		const notes = releaseNotes(process.argv[2] || '', version, changelog);
		const output = path.join(root, 'Output/Release');
		fs.mkdirSync(output, { recursive: true });
		fs.writeFileSync(path.join(output, 'Notes.md'), notes);
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}

module.exports = { releaseNotes };
