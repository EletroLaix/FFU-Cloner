const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../Source/Application/Engine.cjs');
const dism = require('../Source/Application/Windows/Dism.cjs');

test('unsupported platforms fail closed without starting a Windows engine', async () => {
	for (const platform of ['linux', 'darwin']) {
		const engine = createEngine(platform);
		assert.deepEqual(await engine.environment(), { windows: false, admin: false });
		await assert.rejects(engine.listDisks(), /require Windows/);
		await assert.rejects(engine.clone({ mode: 'apply', confirmed: true }), /require Windows/);
	}
});

test('Windows adapter requires confirmation and forwards requests, progress and cancellation', async () => {
	const engine = createEngine('win32');
	const original = dism.clone;
	const controller = new AbortController();
	const progress = () => {};
	let calls = 0;
	dism.clone = async (request, callback, signal) => {
		calls++;
		assert.equal(request.confirmation, 'DISK 4');
		assert.equal(callback, progress);
		assert.equal(signal, controller.signal);
		return { success: true };
	};
	try {
		await assert.rejects(
			engine.clone({ mode: 'apply', disk: { number: 4 } }, progress, controller.signal),
			/confirmation/
		);
		assert.equal(calls, 0);
		assert.deepEqual(
			await engine.clone(
				{ mode: 'apply', disk: { number: 4 }, confirmed: true },
				progress,
				controller.signal
			),
			{ success: true }
		);
		assert.deepEqual(
			await engine.clone({ mode: 'capture', disk: { number: 4 } }, progress, controller.signal),
			{ success: true }
		);
		assert.equal(calls, 2);
	} finally {
		dism.clone = original;
	}
});
