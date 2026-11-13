const { app, Menu, session } = require('electron');
const path = require('node:path');
const createWindow = require('./Desktop/Window.cjs');
const registerIpc = require('./Desktop/Ipc.cjs');
const indexFile = path.join(__dirname, '..', '..', 'Output', 'Renderer', 'index.html');
let window, operations;

if (!app.requestSingleInstanceLock()) app.quit();
else {
	app.on('second-instance', () => {
		if (window) {
			window.restore();
			window.focus();
		}
	});
	app.whenReady().then(() => {
		app.setName('FFU Cloner');
		Menu.setApplicationMenu(null);
		session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
			callback(false)
		);
		window = createWindow();
		operations = registerIpc(window, indexFile);
		window.on('close', (event) => {
			if (operations.isBusy()) {
				event.preventDefault();
				window.webContents.send('clone-progress', {
					stage: 'Wait for the operation to finish before closing.'
				});
			}
		});
		window.loadFile(indexFile);
	});
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', (event) => {
	if (operations?.isBusy()) event.preventDefault();
});
