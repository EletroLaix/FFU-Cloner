const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
	fs.mkdirSync('Output/Validation/Interface', { recursive: true });
	const browser = await chromium.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true
	});
	try {
		const page = await browser.newPage({
			viewport: { width: 1120, height: 800 },
			deviceScaleFactor: 1,
			reducedMotion: 'reduce'
		});
		await page.addInitScript(() => localStorage.setItem('ffu.language', 'it'));
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(process.env.FFU_UI_URL || 'http://127.0.0.1:5173');
		await page.getByRole('radio').first().waitFor();
		assert.equal(
			await page.evaluate(
				async () => (await document.fonts.load('600 16px "Space Grotesk"'))[0]?.status
			),
			'loaded'
		);
		assert.equal(
			await page.getByRole('button', { name: 'Ripristina disco', exact: true }).isDisabled(),
			true
		);
		await page.screenshot({ path: 'Output/Validation/Interface/preview.png' });
		await page.addInitScript((version) => {
			window.__starts = 0;
			window.__sizes = [];
			window.ffu = {
				environment: async () => ({ windows: true, admin: true, version, locale: 'it-IT' }),
				listDisks: async () => [
					{
						token: 'test',
						number: 1,
						name: 'JMicron Generic',
						size: 32017047552,
						serial: '0123456789ABCDEF',
						bus: 'USB',
						style: 'GPT',
						uniqueId: 'TEST'
					},
					{
						token: 'mbr',
						number: 2,
						name: 'MBR USB',
						size: 2000398934016,
						bus: 'USB',
						style: 'MBR',
						uniqueId: 'MBR-TEST'
					},
					{
						token: 'protected',
						number: 0,
						name: 'SAMSUNG NVMe',
						size: 512110190592,
						serial: 'SISTEMA',
						bus: 'NVMe',
						style: 'GPT',
						uniqueId: 'SYSTEM',
						system: true
					}
				],
				pickImage: async () => ({
					path: 'C:\\Images\\Production.ffu',
					name: 'Production.ffu'
				}),
				startClone: async () => {
					window.__starts++;
					if (window.__hold)
						return new Promise((resolve, reject) => {
							window.__resolve = resolve;
							window.__reject = reject;
						});
					return { success: true };
				},
				cancelClone: async () => {
					window.__cancelRequested = true;
					return true;
				},
				openLogs: async () => {},
				minimize: async () => {},
				close: async () => {},
				fitWindow: async (height) => {
					window.__sizes.push(height);
				},
				onProgress: (callback) => {
					window.__progress = callback;
					return () => {};
				}
			};
		}, require('../package.json').version);
		await page.reload();
		await page.getByRole('radio').first().waitFor();
		await page.waitForFunction(() => window.__sizes.length > 0);
		const fullHeight = await page.evaluate(() => window.__sizes.at(-1));
		assert.equal(await page.getByRole('radio', { name: /SAMSUNG NVMe/ }).isDisabled(), true);
		assert.equal(await page.getByRole('radio', { name: /MBR USB/ }).isEnabled(), true);
		await page.getByRole('button', { name: 'Seleziona immagine FFU' }).click();
		const imageBox = await page.locator('.image-card').boundingBox();
		const diskBox = await page.locator('.disk-card').boundingBox();
		assert.ok(Math.abs(imageBox.y + imageBox.height / 2 - diskBox.y - diskBox.height / 2) < 1);
		assert.equal(await page.locator('.image-card .card-heading .accent').count(), 0);
		await page.screenshot({ path: 'Output/Validation/Interface/image-selected.png' });
		await page.getByRole('radio').first().click();
		await page.waitForFunction((height) => window.__sizes.at(-1) < height - 100, fullHeight);
		const start = page.getByRole('button', { name: 'Ripristina disco', exact: true });
		assert.equal(await start.isEnabled(), true);
		await page.screenshot({ path: 'Output/Validation/Interface/restore.png' });
		const intro = await page.locator('.intro > div').first().textContent();
		await start.click();
		const final = page.getByRole('button', { name: 'Cancella e ripristina' });
		assert.equal(await final.isEnabled(), true);
		assert.equal(await page.getByRole('dialog').getByRole('textbox').count(), 0);
		assert.equal(await page.getByRole('dialog').getByRole('button').count(), 2);
		await page.screenshot({ path: 'Output/Validation/Interface/confirmation.png' });
		await page.keyboard.press('Escape');
		assert.equal(await page.evaluate(() => window.__starts), 0);
		await start.click();
		await final.click();
		await page.getByText('Disco ripristinato', { exact: true }).waitFor();
		assert.equal(await page.evaluate(() => window.__starts), 1);
		await page.getByRole('radio').first().click();
		await page.evaluate(() => {
			window.__hold = true;
		});
		await start.click();
		await final.click();
		await page.clock.install();
		await page.evaluate(() => window.__progress({ percent: 25, bytesPerSecond: 125000000 }));
		await page.waitForFunction(() =>
			document.querySelector('.transfer-speed')?.textContent.includes('125')
		);
		assert.match(await page.locator('.transfer-speed').textContent(), /125.*MB\/s/);
		assert.equal(await page.getByRole('radiogroup').count(), 0);
		assert.equal(await page.getByRole('button', { name: 'Aggiorna dischi' }).count(), 0);
		assert.equal(await page.getByRole('button', { name: 'Cambia file' }).count(), 0);
		assert.equal(await page.locator('.card.compact').count(), 2);
		assert.equal(await page.locator('.intro > div').first().textContent(), intro);
		assert.equal(await page.locator('.mode-switch').count(), 0);
		for (const speed of [90, 130, 100, 110, 105, 140, 117, 115.5]) {
			await page.clock.runFor(6000);
			await page.evaluate(
				(speed) => window.__progress({ stage: 'Restoring', bytesPerSecond: speed * 1e6 }),
				speed
			);
		}
		await page.waitForFunction(() =>
			document.querySelector('.transfer-speed')?.textContent.includes('115,5')
		);
		assert.equal(await page.locator('.speed-chart .speed-line').count(), 1);
		assert.ok((await page.locator('.speed-line').getAttribute('d')).split('L').length > 5);
		for (let i = 0; i < 2; i++) {
			const content = await page.locator('.app-shell').boundingBox();
			await page.setViewportSize({ width: 1120, height: Math.ceil(content.height) });
		}
		await page.screenshot({ path: 'Output/Validation/Interface/running.png' });
		await page.setViewportSize({ width: 940, height: 710 });
		const stopBox = await page.getByTestId('cancel-operation').boundingBox();
		const operationBox = await page.locator('.operation').boundingBox();
		assert.ok(stopBox.x + stopBox.width <= operationBox.x + operationBox.width - 10);
		await page.screenshot({ path: 'Output/Validation/Interface/running-minimum.png' });
		await page.setViewportSize({ width: 1120, height: 800 });
		await page.clock.runFor(1000);
		await page.evaluate(() => window.__progress({ bytesPerSecond: null }));
		await page.clock.runFor(1000);
		await page.evaluate(() => window.__progress({ bytesPerSecond: 120000000 }));
		await page.waitForFunction(() => document.querySelectorAll('.speed-line').length === 2);
		await page.getByTestId('cancel-operation').click();
		assert.equal(await page.getByTestId('cancel-operation').isDisabled(), true);
		assert.equal(await page.evaluate(() => window.__cancelRequested), true);
		await page.evaluate(() => window.__resolve({ cancelled: true }));
		await page.getByText('Operazione interrotta', { exact: true }).waitFor();
		await page.getByText('Il disco è incompleto.', { exact: false }).waitFor();
		await page.getByRole('button', { name: 'Acquisisci', exact: true }).click();
		const mbr = page.getByRole('radio', { name: /MBR USB/ });
		assert.equal(await mbr.isDisabled(), true);
		assert.match(await mbr.textContent(), /GPT.*MBR/);
		assert.equal(await page.locator('.workflow .card h2').first().textContent(), 'Disco sorgente');
		await page.screenshot({ path: 'Output/Validation/Interface/capture.png' });
		await page.getByRole('radio').first().click();
		await page.getByTestId('pick-image').click();
		await page.getByRole('button', { name: 'Acquisisci disco', exact: true }).click();
		assert.equal(await page.getByRole('dialog').count(), 0);
		assert.equal(await page.locator('.speed-line').count(), 0);
		await page.evaluate(() =>
			window.__progress({ stage: 'Capturing', percent: 40, bytesPerSecond: 32000000 })
		);
		await page.waitForFunction(() =>
			document.querySelector('.transfer-speed')?.textContent.includes('32')
		);
		assert.equal(await page.getByRole('radiogroup').count(), 0);
		await page.screenshot({ path: 'Output/Validation/Interface/capture-running.png' });
		await page.getByTestId('cancel-operation').click();
		await page.evaluate(() => window.__resolve({ cancelled: true }));
		await page.getByText('Il file incompleto è stato eliminato.', { exact: false }).waitFor();
		await page.setViewportSize({ width: 940, height: 710 });
		await page.locator('footer').scrollIntoViewIfNeeded();
		await page.screenshot({ path: 'Output/Validation/Interface/minimum.png' });
		assert.ok(
			await page
				.locator('footer')
				.evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight),
			'Footer visible at minimum size'
		);
		assert.deepEqual(errors, []);
		assert.equal(await page.evaluate(() => getComputedStyle(document.body).userSelect), 'none');
		for (const [name, code, button] of [
			['English', 'en', 'Capture'],
			['Deutsch', 'de', 'Erfassen'],
			['Français', 'fr', 'Capturer'],
			['Español', 'es', 'Capturar'],
			['Polski', 'pl', 'Utwórz obraz'],
			['Italiano', 'it', 'Acquisisci']
		]) {
			await page.getByTestId('language-toggle').click();
			await page.getByRole('menuitemradio', { name: new RegExp(name) }).click();
			assert.equal(await page.locator('html').getAttribute('lang'), code);
			await page.getByRole('button', { name: button, exact: true }).waitFor();
			await page.screenshot({ path: `Output/Validation/Interface/language-${code}.png` });
		}
		await page.reload();
		assert.equal(await page.locator('html').getAttribute('lang'), 'it');

		console.log(
			'UI PASS: protected disks, mode order, single-button confirmation, cancel, simulated success, minimum layout; no page errors.'
		);
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
