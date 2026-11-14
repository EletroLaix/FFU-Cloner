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
if (!dependencies.every((name) => fs.existsSync(path.join('node_modules', name, 'package.json')))) {
	console.log('Installing project dependencies...');
	run(['ci']);
}
if (process.platform === 'win32' && !fs.existsSync(electronBinary)) {
	console.log('Installing the Electron runtime...');
	const result = spawnSync(process.execPath, [require.resolve('electron/install.js')], {
		stdio: 'inherit'
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
	if (!fs.existsSync(electronBinary)) {
		console.error(`Electron runtime is missing: ${electronBinary}`);
		process.exit(1);
	}
}
run(['run', 'build', '--', '--sourcemap']);
if (process.platform === 'win32') {
	const result = spawnSync(
		path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
		['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'StartDebug.ps1')],
		{ stdio: 'inherit' }
	);
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
} else {
	console.error('Elevated debugging requires Windows.');
	process.exit(1);
}
