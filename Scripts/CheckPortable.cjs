// Attach only to a locally launched diagnostic portable (no cloning is invoked).
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');

async function connectInspector() {
	const targets = await (await fetch('http://127.0.0.1:9232/json/list')).json();
	const socket = new WebSocket(targets[0].webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		socket.addEventListener('open', resolve, { once: true });
		socket.addEventListener('error', reject, { once: true });
	});
	let id = 0;
	const pending = new Map();
	socket.addEventListener('message', (event) => {
		const data = JSON.parse(String(event.data));
		const item = pending.get(data.id);
		if (!item) return;
		pending.delete(data.id);
		clearTimeout(item.timer);
		if (data.error || data.result?.exceptionDetails)
			item.reject(new Error(JSON.stringify(data.error || data.result.exceptionDetails)));
		else item.resolve(data.result.result.value);
	});
	return {
		evaluate(fn) {
			return new Promise((resolve, reject) => {
				const request = ++id;
				const timer = setTimeout(() => {
					pending.delete(request);
					reject(new Error('Main-process diagnostic timeout'));
				}, 15000);
				pending.set(request, { resolve, reject, timer });
				socket.send(
					JSON.stringify({
						id: request,
						method: 'Runtime.evaluate',
						params: {
							expression: `(function(require) { return (${fn.toString()})(); })(process.getBuiltinModule('module').createRequire(process.resourcesPath + '/app.asar/package.json'))`,
							returnByValue: true,
							awaitPromise: true
						}
					})
				);
			});
		},
		close: () => socket.close()
	};
}

(async () => {
	fs.mkdirSync('Output/Validation/Portable', { recursive: true });
	const inspector = await connectInspector();
	let browser;
	try {
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				browser = await chromium.connectOverCDP('http://127.0.0.1:9231');
				break;
			} catch (error) {
				if (attempt === 99) throw error;
				await new Promise((resolve) => setTimeout(resolve, 250));
			}
		}
	} catch (error) {
		inspector.close();
		throw error;
	}
	let hooks = false;
	try {
		const page = browser
			.contexts()
			.flatMap((context) => context.pages())
			.find((page) => page.url().endsWith('/index.html'));
		assert.ok(page, 'Portable renderer');
		const environment = await page.evaluate(() => window.ffu.environment());
		assert.equal(environment.version, require('../package.json').version);
		assert.equal(environment.admin, true);
		const drives = await page.evaluate(() => window.ffu.listDisks());
		assert.ok(drives.some((d) => d.system));
		const properties = await inspector.evaluate(() => {
			const { app, BrowserWindow } = require('electron');
			const window = BrowserWindow.getAllWindows()[0];
			return {
				packaged: app.isPackaged,
				resizable: window.isResizable(),
				maximizable: window.isMaximizable(),
				bounds: window.getBounds()
			};
		});
		assert.equal(properties.packaged, true);
		assert.equal(properties.resizable, false);
		assert.equal(properties.maximizable, false);
		assert.equal(await page.evaluate(() => getComputedStyle(document.body).userSelect), 'none');
		// Exercise the real shell action. It only opens the existing log directory.
		await page.evaluate(() => window.ffu.openLogs());
		await inspector.evaluate(() => {
			const { dialog, BrowserWindow } = require('electron');
			globalThis.portableOriginalDialogs = { open: dialog.showOpenDialog, save: dialog.showSaveDialog };
			globalThis.portableNativeCalls = { open: [], save: [], close: 0 };
			dialog.showOpenDialog = async (_window, options) => {
				globalThis.portableNativeCalls.open.push(options.title);
				return { canceled: true };
			};
			dialog.showSaveDialog = async (_window, options) => {
				globalThis.portableNativeCalls.save.push(options.title);
				return { canceled: true };
			};
			BrowserWindow.getAllWindows()[0].once('close', (event) => {
				event.preventDefault();
				globalThis.portableNativeCalls.close++;
			});
		});
		hooks = true;
		for (const [language, name] of [
			['en', 'English'],
			['it', 'Italiano'],
			['de', 'Deutsch']
		]) {
			await page.getByTestId('language-toggle').click();
			await page.getByRole('menuitemradio', { name: new RegExp(name) }).click();
			assert.equal(await page.locator('html').getAttribute('lang'), language);
			await inspector.evaluate(() => {
				const calls = globalThis.portableNativeCalls;
				globalThis.portableBeforeClick = calls.open.length + calls.save.length;
			});
			await page.getByTestId('pick-image').click();
			await inspector.evaluate(async () => {
				for (let i = 0; i < 30; i++) {
					const calls = globalThis.portableNativeCalls;
					if (calls.open.length + calls.save.length > globalThis.portableBeforeClick) return;
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
				throw new Error('Image button did not reach a native dialog request');
			});
			await page.evaluate((language) => window.ffu.pickImage('apply', language), language);
			await page.evaluate((language) => window.ffu.pickImage('capture', language), language);
			await page.screenshot({ path: `Output/Validation/Portable/${language}.png` });
		}
		const calls = await inspector.evaluate(() => globalThis.portableNativeCalls);
		assert.ok(calls.open.length >= 3);
		assert.ok(calls.save.length >= 3);
		assert.ok(calls.open.includes('Select an FFU image'));
		assert.ok(calls.open.includes('FFU-Abbild auswählen'));
		await page.getByTestId('minimize-window').click();
		await inspector.evaluate(async () => {
			const window = require('electron').BrowserWindow.getAllWindows()[0];
			for (let i = 0; i < 20 && !window.isMinimized(); i++)
				await new Promise((resolve) => setTimeout(resolve, 50));
			if (!window.isMinimized()) throw new Error('Minimize button failed');
			window.restore();
		});
		await page.getByTestId('close-window').click();
		calls.close = await inspector.evaluate(() => globalThis.portableNativeCalls.close);
		assert.equal(calls.close, 1);
		const report = {
			passed: true,
			environment,
			properties,
			dialogs: calls,
			driveCount: drives.length,
			renderer: page.url(),
			finished: new Date().toISOString()
		};
		fs.writeFileSync('Output/Validation/Portable/result.json', JSON.stringify(report, null, 2));
		console.log(
			'PORTABLE PASS: real launcher, administrator environment, drive scan, real log-folder opening, file dialog requests in EN/IT/DE, fixed window and native minimize/close. No disk writes.'
		);
	} finally {
		if (hooks)
			await inspector.evaluate(() => {
				const { dialog } = require('electron');
				dialog.showOpenDialog = globalThis.portableOriginalDialogs.open;
				dialog.showSaveDialog = globalThis.portableOriginalDialogs.save;
				delete globalThis.portableOriginalDialogs;
				delete globalThis.portableNativeCalls;
				delete globalThis.portableBeforeClick;
			});
		inspector.close();
		for (const page of browser.contexts().flatMap((context) => context.pages())) await page.close();
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
