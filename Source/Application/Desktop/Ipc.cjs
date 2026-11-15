const { app, dialog, ipcMain, shell, powerSaveBlocker, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const engine = require('../Engine.cjs');
const { readLogs } = require('../Logs.cjs');
const { isTrustedRenderer } = require('../RendererOrigin.cjs');
const dialogText = {
	en: require('../../Resources/Locales/en.json'),
	it: require('../../Resources/Locales/it.json'),
	de: require('../../Resources/Locales/de.json'),
	fr: require('../../Resources/Locales/fr.json'),
	es: require('../../Resources/Locales/es.json'),
	pl: require('../../Resources/Locales/pl.json')
};

// Keep all privileged operations behind the same trusted-renderer check.
module.exports = function registerIpc(window, indexFile) {
	let busy = false;
	let chosenImage = null;
	let lastLog = null;
	let operationController = null;
	const disks = new Map();
	const logDirectory = path.join(
		process.env.LOCALAPPDATA || app.getPath('userData'),
		'FFUCloner',
		'Logs'
	);

	// Wrap each IPC handler with origin validation and a consistent response format.
	function handle(name, action) {
		ipcMain.handle(name, async (event, ...args) => {
			try {
				if (!window || !isTrustedRenderer(event, window.webContents, indexFile)) {
					throw new Error('Unauthorized origin.');
				}
				return { ok: true, value: await action(...args) };
			} catch (error) {
				return { ok: false, error: error.message };
			}
		});
	}

	handle('environment', async () => ({
		...(await engine.environment()),
		version: app.getVersion(),
		locale: app.getPreferredSystemLanguages()[0] || app.getLocale()
	}));
	handle('minimize-window', () => window.minimize());
	handle('close-window', () => window.close());
	handle('fit-window', (height) => {
		if (![512, 721].includes(height)) {
			throw new Error('Invalid window height.');
		}
		const bounds = window.getBounds();
		const area = screen.getDisplayMatching(bounds).workArea;
		height = Math.min(Math.max(320, height), area.height);
		if (height === bounds.height) {
			return;
		}
		const y = Math.max(
			area.y,
			Math.min(
				area.y + area.height - height,
				Math.round(bounds.y + (bounds.height - height) / 2)
			)
		);
		window.setBounds({ ...bounds, y, height });
	});
	handle('list-disks', async () => {
		if (busy) {
			throw new Error('Wait for the operation to finish.');
		}
		disks.clear();
		return (await engine.listDisks()).map((disk) => {
			const token = crypto.randomUUID();
			disks.set(token, disk);
			return { ...disk, token };
		});
	});
	handle('pick-image', async ({ mode, language = 'en' } = {}) => {
		if (busy || !['apply', 'capture'].includes(mode)) {
			throw new Error('Operation unavailable.');
		}
		const text = dialogText[language] || dialogText.en;
		const options = {
			title: mode === 'apply' ? text.dialogOpen : text.dialogSave,
			filters: [{ name: 'Full Flash Update', extensions: ['ffu'] }]
		};
		const result =
			mode === 'apply'
				? await dialog.showOpenDialog(window, {
						...options,
						properties: ['openFile']
					})
				: await dialog.showSaveDialog(window, {
						...options,
						defaultPath: 'Image.ffu',
						properties: ['showOverwriteConfirmation']
					});
		if (result.canceled) {
			return null;
		}
		const image = result.filePath || result.filePaths[0];
		let overwrite = null;
		if (mode === 'capture' && fs.existsSync(image)) {
			const stat = fs.lstatSync(image);
			if (!stat.isFile() || stat.isSymbolicLink()) {
				throw new Error('Invalid image file.');
			}
			overwrite = { size: stat.size, modified: Math.floor(stat.mtimeMs) };
		}
		chosenImage = { mode, path: image, overwrite };
		return { path: image, name: path.basename(image) };
	});
	handle('start-clone', async (request) => {
		if (busy) {
			throw new Error('An operation is already running.');
		}
		if (!request || !['apply', 'capture'].includes(request.mode)) {
			throw new Error('Invalid operation.');
		}
		const disk = disks.get(request.token);
		if (
			!disk ||
			!chosenImage ||
			chosenImage.mode !== request.mode ||
			chosenImage.path !== request.image
		) {
			throw new Error('Select the image and disk again.');
		}
		if (request.mode === 'apply' && request.confirmed !== true) {
			throw new Error('Invalid disk confirmation.');
		}
		busy = true;
		operationController = new AbortController();
		lastLog = null;
		const blocker = powerSaveBlocker.start('prevent-app-suspension');
		try {
			const result = await engine.clone(
				{
					mode: request.mode,
					disk,
					image: chosenImage.path,
					overwrite: chosenImage.overwrite,
					confirmed: request.confirmed === true,
					logDirectory,
					version: app.getVersion(),
					appPaths: [process.execPath]
				},
				(update) => {
					if (update.logPath) {
						lastLog = update.logPath;
					}
					if (!window.isDestroyed()) {
						window.webContents.send('clone-progress', update);
					}
				},
				operationController.signal
			);
			disks.clear();
			if (request.mode === 'capture') {
				chosenImage = null;
			}
			return result;
		} catch (error) {
			if (error.code === 'CANCELLED') {
				return { cancelled: true };
			}
			if (!lastLog) {
				try {
					fs.mkdirSync(logDirectory, { recursive: true });
					lastLog = path.join(logDirectory, `startup-${Date.now()}.txt`);
					fs.writeFileSync(
						lastLog,
						`${new Date().toISOString()} ${error.stack}\n`
					);
				} catch {
					/* Keep the original operation error if logging is unavailable. */
				}
			}
			throw error;
		} finally {
			busy = false;
			operationController = null;
			powerSaveBlocker.stop(blocker);
		}
	});
	handle('cancel-clone', () => {
		if (!busy || !operationController) {
			return false;
		}
		operationController.abort();
		return true;
	});
	handle('read-logs', (selected) => readLogs(logDirectory, selected));
	handle('open-logs', async () => {
		fs.mkdirSync(logDirectory, { recursive: true });
		const error = await shell.openPath(logDirectory);
		if (error) {
			throw new Error(error);
		}
	});

	return { isBusy: () => busy };
};
