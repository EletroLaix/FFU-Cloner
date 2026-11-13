const { _electron } = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const simulatedApplication = require('./SimulatedApplication.cjs');
(async () => {
	const env = { ...process.env };
	delete env.ELECTRON_RUN_AS_NODE;
	env.LOCALAPPDATA = path.resolve('Output/Validation/ElectronLocal');
	const logDirectory = path.join(env.LOCALAPPDATA, 'FFUCloner', 'Logs');
	fs.mkdirSync(logDirectory, { recursive: true });
	fs.writeFileSync(path.join(logDirectory, 'sample.txt'), '2026-11-13T12:34:56Z Simulated log entry\n');
	const app = await _electron.launch({
		executablePath: require('electron'),
		args: [
			simulatedApplication('Output/Validation/Electron'),
			'--user-data-dir=' + path.resolve('Output/Validation/ElectronProfile')
		],
		env
	});
	try {
		const page = await app.firstWindow();
		await page.locator('h1').waitFor();
		assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu()), null);
		assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
		assert.equal(await page.evaluate(() => typeof window.ffu.startClone), 'function');
		const environment = await page.evaluate(() => window.ffu.environment());
		assert.equal(environment.windows, process.platform === 'win32');
		assert.equal(typeof environment.admin, 'boolean');
		assert.equal(
			await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isResizable()),
			false
		);
		assert.equal(
			await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximizable()),
			false
		);
		assert.equal(await page.evaluate(() => getComputedStyle(document.body).userSelect), 'none');
		for (const width of [1120, 860]) {
			await app.evaluate(({ BrowserWindow }, width) => {
				const window = BrowserWindow.getAllWindows()[0];
				window.setBounds({ ...window.getBounds(), width });
			}, width);
			await page.waitForFunction((width) => window.innerWidth === width, width);
			const regions = await page.evaluate(() => {
				const at = (x, y) =>
					getComputedStyle(document.elementFromPoint(x, y)).getPropertyValue('-webkit-app-region');
				return {
					edges: [1, 10, Math.floor(innerWidth / 2), innerWidth - 11, innerWidth - 2].flatMap((x) =>
						[1, 10, 20].map((y) => at(x, y))
					),
					buttons: [...document.querySelectorAll('header button')].map((button) =>
						getComputedStyle(button).getPropertyValue('-webkit-app-region')
					)
				};
			});
			assert.ok(
				regions.edges.every((region) => region === 'drag'),
				`Top edge regions: ${regions.edges}`
			);
			assert.ok(
				regions.buttons.every((region) => region === 'no-drag'),
				`Header buttons: ${regions.buttons}`
			);
		}
		await app.evaluate(({ BrowserWindow }) => {
			const window = BrowserWindow.getAllWindows()[0];
			window.setBounds({ ...window.getBounds(), width: 1120 });
		});
		await app.evaluate(({ dialog, shell, BrowserWindow }) => {
			globalThis.nativeCalls = { open: 0, save: 0, logs: 0, close: 0 };
			dialog.showOpenDialog = async () => {
				globalThis.nativeCalls.open++;
				return { canceled: true };
			};
			dialog.showSaveDialog = async () => {
				globalThis.nativeCalls.save++;
				return { canceled: true };
			};
			shell.openPath = async (location) => {
				globalThis.nativeCalls.logs++;
				globalThis.logFolder = location;
				return '';
			};
			BrowserWindow.getAllWindows()[0].once('close', (event) => {
				event.preventDefault();
				globalThis.nativeCalls.close++;
			});
		});
		await page.getByTestId('pick-image').click();
		await page.evaluate(() => window.ffu.pickImage('capture'));
		await page.getByTestId('open-logs').click();
		const logsDialog = page.getByRole('dialog');
		await logsDialog.locator('.log-time').waitFor();
		assert.equal(await logsDialog.locator('.log-time').textContent(), '2026-11-13T12:34:56Z');
		assert.match(await logsDialog.locator('.logs-content').textContent(), /Simulated log entry/);
		assert.equal(
			await logsDialog
				.locator('.logs-content')
				.evaluate((element) => getComputedStyle(element).userSelect),
			'text'
		);
		assert.equal((await app.evaluate(() => globalThis.nativeCalls)).logs, 0);
		await logsDialog.locator('.logs-button').last().click();
		assert.equal(await app.evaluate(() => globalThis.logFolder), logDirectory);
		await page.keyboard.press('Escape');
		await logsDialog.waitFor({ state: 'hidden' });
		const nativeCalls = await app.evaluate(() => globalThis.nativeCalls);
		assert.ok(nativeCalls.open >= 1 && nativeCalls.save >= 1 && nativeCalls.logs >= 1);
		await app.evaluate(({ dialog }) => {
			globalThis.dialogTitles = [];
			dialog.showOpenDialog = async (_window, options) => {
				globalThis.dialogTitles.push(options.title);
				return { canceled: true };
			};
		});
		for (const language of ['fr', 'es', 'pl'])
			await page.evaluate((language) => window.ffu.pickImage('apply', language), language);
		assert.deepEqual(await app.evaluate(() => globalThis.dialogTitles), [
			'Sélectionner une image FFU',
			'Seleccionar una imagen FFU',
			'Wybierz obraz FFU'
		]);
		// Real IPC and cancellation lifecycle, with only the disk engine replaced by a harmless promise.
		await app.evaluate(({ app, dialog }) => {
			const require = process
				.getBuiltinModule('module')
				.createRequire(
					process.env.FFU_APP_PATH
						? process.env.FFU_APP_PATH + '/package.json'
						: process.cwd() + '/package.json'
				);
			const engine = require('./Source/Application/Engine.cjs');
			const saved = {
				clone: engine.clone,
				listDisks: engine.listDisks,
				environment: engine.environment,
				open: dialog.showOpenDialog,
				save: dialog.showSaveDialog
			};
			globalThis.restoreEngine = () => {
				engine.clone = saved.clone;
				engine.listDisks = saved.listDisks;
				engine.environment = saved.environment;
				dialog.showOpenDialog = saved.open;
				dialog.showSaveDialog = saved.save;
			};
			const image = require('node:path').join(app.getPath('temp'), 'FFU-Test-' + Date.now() + '.ffu');
			engine.listDisks = async () => [
				{ number: 1, name: 'Simulated drive', size: 32017047552, uniqueId: 'TEST', style: 'GPT' }
			];
			engine.environment = async () => ({ windows: true, admin: true });
			dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [image] });
			dialog.showSaveDialog = async () => ({ canceled: false, filePath: image });
			engine.clone = async (_request, _progress, signal) =>
				new Promise((_resolve, reject) => {
					globalThis.cloneStarted = true;
					globalThis.cloneProgress = _progress;
					signal.addEventListener(
						'abort',
						() => reject(Object.assign(new Error('Operation cancelled.'), { code: 'CANCELLED' })),
						{ once: true }
					);
				});
		});
		await page.reload();
		await page.getByRole('radio').first().waitFor();
		await page.waitForTimeout(200);
		const fullHeight = await app.evaluate(
			({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().height
		);
		await page.getByRole('radio').first().click();
		await page.getByTestId('pick-image').click();
		await page.waitForTimeout(200);
		const compactHeight = await app.evaluate(
			({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().height
		);
		assert.ok(compactHeight < fullHeight - 100, `Dynamic height: ${fullHeight} -> ${compactHeight}`);
		assert.equal(
			await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isResizable()),
			false
		);
		await page.screenshot({ path: 'Output/Validation/Interface/native-compact.png' });
		const invalidHeightRejected = await page.evaluate(async () => {
			try {
				await window.ffu.fitWindow(0);
				return false;
			} catch {
				return true;
			}
		});
		assert.equal(invalidHeightRejected, true);
		await page.locator('.mode-switch button').nth(1).click();
		await page.waitForTimeout(200);
		const captureHeight = await app.evaluate(
			({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().height
		);
		for (let cycle = 0; cycle < 2; cycle++) {
			await page.getByRole('radio').first().click();
			await page.getByTestId('pick-image').click();
			await page.locator('.operation .primary').click();
			await page.getByTestId('cancel-operation').waitFor();
			await app.evaluate(() => globalThis.cloneProgress({ percent: 15, bytesPerSecond: 1000000 }));
			await page.getByTestId('cancel-operation').click();
			await page.getByRole('radio').first().waitFor();
			await page.waitForTimeout(200);
			const restoredHeight = await app.evaluate(
				({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().height
			);
			assert.equal(restoredHeight, captureHeight, 'Full window height restored after cancellation');
			assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), null);
			assert.ok(
				await page
					.locator('.image-description')
					.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
				'Image description is not clipped'
			);
		}
		for (const mode of ['apply', 'capture']) {
			await app.evaluate(() => {
				globalThis.cloneStarted = false;
			});
			await page.evaluate(async (mode) => {
				const [disk] = await window.ffu.listDisks();
				const image = await window.ffu.pickImage(mode, 'en');
				const request = { mode, token: disk.token, image: image.path };
				if (mode === 'apply') {
					try {
						await window.ffu.startClone(request);
						throw new Error('Missing write confirmation accepted');
					} catch (error) {
						if (!error.message.includes('confirmation')) throw error;
					}
					request.confirmed = true;
				}
				window.pendingClone = window.ffu
					.startClone(request)
					.then((result) => (result.cancelled ? 'CANCELLED' : 'SUCCESS'));
			}, mode);
			await app.evaluate(async () => {
				for (let i = 0; i < 40 && !globalThis.cloneStarted; i++)
					await new Promise((resolve) => setTimeout(resolve, 25));
				if (!globalThis.cloneStarted) throw new Error('Simulated engine did not start');
			});
			assert.equal(await page.evaluate(() => window.ffu.cancelClone()), true);
			assert.equal(await page.evaluate(() => window.pendingClone), 'CANCELLED');
			assert.equal(await page.evaluate(() => window.ffu.cancelClone()), false);
		}
		await app.evaluate(() => globalThis.restoreEngine());
		await page.getByTestId('minimize-window').click();
		await app.evaluate(async ({ BrowserWindow }) => {
			const window = BrowserWindow.getAllWindows()[0];
			for (let i = 0; i < 20 && !window.isMinimized(); i++)
				await new Promise((resolve) => setTimeout(resolve, 50));
			if (!window.isMinimized()) throw new Error('Minimize control did not reach native window');
			window.restore();
		});
		await page.getByTestId('close-window').click();
		assert.equal(await app.evaluate(() => globalThis.nativeCalls.close), 1);
		const rejected = await page.evaluate(async () => {
			try {
				await window.ffu.startClone({ mode: 'apply', token: 'INVALID' });
				return false;
			} catch {
				return true;
			}
		});
		assert.equal(rejected, true);
		await page.screenshot({ path: 'Output/Validation/Interface/native-electron.png' });
		console.log(
			'ELECTRON PASS: native actions, fixed window, isolated bridge, confirmation rejection and actual cancellation IPC for apply/capture with simulated engine. No disk writes.'
		);
	} finally {
		await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
		await app.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
