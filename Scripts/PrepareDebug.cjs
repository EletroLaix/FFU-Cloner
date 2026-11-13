const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

process.chdir(path.join(__dirname, '..'));
function run(args) {
	const windows = process.platform === 'win32';
	const command = windows ? process.env.ComSpec || 'cmd.exe' : 'npm';
	const commandArgs = windows ? ['/d', '/s', '/c', 'npm.cmd', ...args] : args;
	const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

const dependencies = ['electron', 'vite', 'react', 'react-dom', 'lucide-react'];
const electronBinary = path.join('node_modules', 'electron', 'dist', 'electron.exe');
if (
	!dependencies.every((name) => fs.existsSync(path.join('node_modules', name, 'package.json'))) ||
	(process.platform === 'win32' && !fs.existsSync(electronBinary))
) {
	console.log('Installing project dependencies...');
	run(['ci']);
}
run(['run', 'build', '--', '--sourcemap']);
