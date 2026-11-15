const fs = require('node:fs/promises');
const path = require('node:path');

// Share one remembered folder and one native dialog between capture and restore.
function createImagePicker({ dialog, window, desktop, preferencesFile }) {
	let directory = desktop;
	let picking = false;
	let saving = Promise.resolve();
	const loaded = fs
		.readFile(preferencesFile, 'utf8')
		.then((text) => {
			const saved = JSON.parse(text).imageDirectory;
			if (typeof saved === 'string' && path.isAbsolute(saved)) {
				directory = saved;
			}
		})
		.catch(() => {
			// Missing or unreadable preferences leave the initial Desktop folder in place.
		});

	// Remember immediately in memory and save without delaying the selected file's display.
	function remember(image) {
		directory = path.dirname(image);
		const preferences = JSON.stringify({ imageDirectory: directory }, null, '\t');
		saving = saving
			.then(async () => {
				await fs.mkdir(path.dirname(preferencesFile), { recursive: true });
				await fs.writeFile(preferencesFile, preferences + '\n');
			})
			.catch(() => {
				// A preference write failure must not prevent selecting or using an image.
			});
	}

	// Keep filesystem metadata checks asynchronous so slow volumes do not block Electron.
	async function pick(mode, text) {
		if (picking || !['apply', 'capture'].includes(mode)) {
			throw new Error('Operation unavailable.');
		}
		picking = true;
		try {
			await loaded;
			const options = {
				title: mode === 'apply' ? text.dialogOpen : text.dialogSave,
				defaultPath:
					mode === 'apply' ? directory : path.join(directory, 'Image.ffu'),
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
							properties: ['showOverwriteConfirmation']
						});
			if (result.canceled) {
				return null;
			}
			const image = result.filePath || result.filePaths[0];
			let overwrite = null;
			if (mode === 'capture') {
				try {
					const stat = await fs.lstat(image);
					if (!stat.isFile() || stat.isSymbolicLink()) {
						throw new Error('Invalid image file.');
					}
					overwrite = { size: stat.size, modified: Math.floor(stat.mtimeMs) };
				} catch (error) {
					if (error.code !== 'ENOENT') {
						throw error;
					}
				}
			}
			remember(image);
			return { mode, path: image, overwrite };
		} finally {
			picking = false;
		}
	}

	return { pick, isPicking: () => picking };
}

module.exports = { createImagePicker };
