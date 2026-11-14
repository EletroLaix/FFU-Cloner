const { BrowserWindow, screen } = require('electron');
const path = require('node:path');

// Keep the window width fixed while switching between full and compact heights.
module.exports = function createWindow() {
	const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
	const width = Math.min(1120, area.width);
	const height = Math.min(820, area.height);
	const window = new BrowserWindow({
		width,
		height,
		x: area.x + Math.floor((area.width - width) / 2),
		y: area.y + Math.floor((area.height - height) / 2),
		resizable: false,
		maximizable: false,
		fullscreenable: false,
		frame: false,
		backgroundColor: '#070707',
		autoHideMenuBar: true,
		icon: path.join(__dirname, '..', '..', 'Resources', 'Images', 'Icon.png'),
		webPreferences: {
			preload: path.join(__dirname, '..', 'Preload.cjs'),
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true
		}
	});
	window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
	window.webContents.on('will-navigate', (event) => event.preventDefault());

	return window;
};
