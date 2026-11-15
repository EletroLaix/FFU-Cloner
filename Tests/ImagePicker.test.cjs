const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { createImagePicker } = require('../Source/Application/Desktop/ImagePicker.cjs');

const text = { dialogOpen: 'Select an FFU image', dialogSave: 'Save an FFU image' };

// Keep preferences and file fixtures inside the ignored validation directory.
async function fixture(t) {
	const root = path.resolve('Output/Validation/ImagePicker');
	await fs.mkdir(root, { recursive: true });
	const directory = await fs.mkdtemp(path.join(root, 'case-'));
	const desktop = path.join(directory, 'Desktop');
	const images = path.join(directory, 'Images');
	const preferencesFile = path.join(directory, 'Preferences.json');
	await fs.mkdir(desktop);
	await fs.mkdir(images);
	t.after(async () => {
		assert.ok(directory.startsWith(root + path.sep));
		await fs.rm(directory, { recursive: true, force: true });
	});
	return { desktop, images, preferencesFile, window: {} };
}

// Wait for the externally visible preference rather than blocking the picker on storage.
async function savedDirectory(file, expected) {
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			if (JSON.parse(await fs.readFile(file, 'utf8')).imageDirectory === expected) {
				return;
			}
		} catch {
			// The asynchronous preference write may still be in progress.
		}
		await delay(10);
	}
	assert.fail('The selected folder was not saved.');
}

test('starts on Desktop and shares the last successful folder across modes and restarts', async (t) => {
	const options = await fixture(t);
	const image = path.join(options.images, 'Existing.ffu');
	await fs.writeFile(image, 'EXISTING IMAGE');
	const calls = [];
	let cancelled = false;
	const dialog = {
		showOpenDialog: async (_window, settings) => {
			calls.push(settings);
			return { canceled: cancelled, filePaths: [image] };
		},
		showSaveDialog: async (_window, settings) => {
			calls.push(settings);
			return {
				canceled: cancelled,
				filePath: path.join(options.desktop, 'New.ffu')
			};
		}
	};
	const picker = createImagePicker({ ...options, dialog });
	assert.equal((await picker.pick('apply', text)).path, image);
	assert.equal(calls.at(-1).defaultPath, options.desktop);
	await picker.pick('capture', text);
	assert.equal(calls.at(-1).defaultPath, path.join(options.images, 'Image.ffu'));
	await savedDirectory(options.preferencesFile, options.desktop);
	const restarted = createImagePicker({ ...options, dialog });
	cancelled = true;
	assert.equal(await restarted.pick('apply', text), null);
	assert.equal(calls.at(-1).defaultPath, options.desktop);
	cancelled = false;
	await restarted.pick('apply', text);
	await savedDirectory(options.preferencesFile, options.images);
	const restored = createImagePicker({ ...options, dialog });
	cancelled = true;
	assert.equal(await restored.pick('capture', text), null);
	assert.equal(calls.at(-1).defaultPath, path.join(options.images, 'Image.ffu'));
	await restored.pick('apply', text);
	assert.equal(calls.at(-1).defaultPath, options.images);
});

test('rejects overlapping dialogs and releases the picker after cancellation or failure', async (t) => {
	const options = await fixture(t);
	let finish;
	let calls = 0;
	const dialog = {
		showOpenDialog: () => {
			calls++;
			return new Promise((resolve) => {
				finish = resolve;
			});
		}
	};
	const picker = createImagePicker({ ...options, dialog });
	const pending = picker.pick('apply', text);
	assert.equal(picker.isPicking(), true);
	await assert.rejects(picker.pick('capture', text), /unavailable/);
	while (!finish) {
		await delay(1);
	}
	finish({ canceled: true });
	assert.equal(await pending, null);
	assert.equal(calls, 1);
	assert.equal(picker.isPicking(), false);
	dialog.showOpenDialog = async () => {
		throw new Error('Native dialog failed');
	};
	await assert.rejects(picker.pick('apply', text), /Native dialog failed/);
	assert.equal(picker.isPicking(), false);
});

test('keeps overwrite identity checks and handles malformed preferences and invalid targets', async (t) => {
	const options = await fixture(t);
	await fs.writeFile(options.preferencesFile, '{invalid');
	const image = path.join(options.images, 'Existing.ffu');
	await fs.writeFile(image, 'ORIGINAL');
	let target = image;
	const dialog = {
		showSaveDialog: async (_window, settings) => {
			assert.equal(settings.defaultPath, path.join(options.desktop, 'Image.ffu'));
			return { canceled: false, filePath: target };
		}
	};
	const picker = createImagePicker({ ...options, dialog });
	const result = await picker.pick('capture', text);
	const stat = await fs.lstat(image);
	assert.deepEqual(result.overwrite, {
		size: stat.size,
		modified: Math.floor(stat.mtimeMs)
	});
	await savedDirectory(options.preferencesFile, options.images);
	target = options.images;
	dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
	await assert.rejects(picker.pick('capture', text), /Invalid image file/);
	assert.equal(await fs.readFile(image, 'utf8'), 'ORIGINAL');
});
