const fs = require('node:fs');
const path = require('node:path');

// Replace the engine before loading the app so checks never enumerate physical disks.
module.exports = function simulatedApplication(directory, pending = false) {
	const application = path.resolve(process.env.FFU_APP_PATH || '.');
	const bootstrap = path.resolve(directory, 'Application.cjs');
	fs.mkdirSync(directory, { recursive: true });
	fs.writeFileSync(
		bootstrap,
		`const engine = require(${JSON.stringify(path.join(application, 'Source/Application/Engine.cjs'))});
engine.environment = () => ${pending ? 'new Promise(() => {})' : 'Promise.resolve({ windows: true, admin: true })'};
engine.listDisks = () => ${pending ? 'new Promise(() => {})' : 'Promise.resolve([])'};
engine.clone = async () => { throw new Error('Unexpected engine operation during simulated validation.'); };
require(${JSON.stringify(path.join(application, 'Source/Application/Main.cjs'))});
`
	);
	return bootstrap;
};
