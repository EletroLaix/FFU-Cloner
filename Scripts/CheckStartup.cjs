const { _electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const simulatedApplication = require('./SimulatedApplication.cjs');

(async () => {
	const directory = 'Output/Validation/Startup';
	const bootstrap = simulatedApplication(directory, true);
	const env = { ...process.env };
	delete env.ELECTRON_RUN_AS_NODE;
	const launches = [];
	for (let trial = 0; trial < 3; trial++) {
		const started = performance.now();
		const app = await _electron.launch({
			executablePath: require('electron'),
			args: [bootstrap, '--user-data-dir=' + path.resolve(directory, 'Profile')],
			env
		});
		try {
			const page = await app.firstWindow();
			await page.locator('h1').waitFor({ state: 'visible' });
			await page.evaluate(
				() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
			);
			const elapsed = Math.round(performance.now() - started);
			assert.equal(await page.getByTestId('pick-image').isEnabled(), true);
			assert.equal(await page.locator('.disk-list .spin').count(), 1);
			assert.equal(await page.locator('.operation .primary').isDisabled(), true);
			await page.evaluate(() => window.ffu.minimize());
			assert.equal(
				await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()),
				true
			);
			launches.push(elapsed);
			console.log(
				`Launch ${trial + 1}: interface painted in ${elapsed} ms with engine queries still pending.`
			);
		} finally {
			await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
			await app.close();
		}
	}
	fs.writeFileSync(
		path.join(directory, 'Result.json'),
		JSON.stringify(
			{
				application: path.resolve(process.env.FFU_APP_PATH || '.'),
				launchMilliseconds: launches,
				averageMilliseconds: Math.round(
					launches.reduce((sum, value) => sum + value, 0) / launches.length
				),
				excludes: ['archive extraction', 'UAC', 'physical disk discovery'],
				finished: new Date().toISOString()
			},
			null,
			2
		)
	);
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
