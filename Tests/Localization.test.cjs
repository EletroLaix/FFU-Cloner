const test = require('node:test');
const assert = require('node:assert/strict');

test('system language detection supports regional variants and falls back to English', async () => {
	const { resolveLanguage } = await import('../Source/Interface/Localization/Localization.mjs');
	for (const [locale, expected] of [
		['en-US', 'en'],
		['it-IT', 'it'],
		['de-DE', 'de'],
		['de_AT', 'de'],
		['fr-FR', 'fr'],
		['es-ES', 'es'],
		['pl-PL', 'pl'],
		['ja-JP', 'en'],
		['', 'en'],
		[null, 'en']
	])
		assert.equal(resolveLanguage(locale), expected);
});
test('all locales contain the same nonempty keys and placeholders', async () => {
	const { messages, translate } = await import('../Source/Interface/Localization/Localization.mjs');
	const expected = Object.keys(messages.en).sort();
	for (const [code, values] of Object.entries(messages)) {
		assert.deepEqual(Object.keys(values).sort(), expected);
		for (const key of expected) {
			assert.ok(values[key].trim());
			assert.deepEqual(
				(values[key].match(/\{\w+\}/g) || []).sort(),
				(messages.en[key].match(/\{\w+\}/g) || []).sort(),
				`${code}.${key}`
			);
		}
		assert.ok(translate(code, 'selectedDisk', { number: 7 }).includes('7'));
	}
});

test('English engine states and errors resolve to localized interface messages', async () => {
	const { stageKeys, translate, translateError } =
		await import('../Source/Interface/Localization/Localization.mjs');
	for (const [stage, key] of Object.entries(stageKeys)) {
		assert.notEqual(translate('it', key), stage);
		assert.notEqual(translate('de', key), stage);
	}
	assert.equal(translateError('it', 'Invalid operation.'), translate('it', 'invalidOperation'));
	assert.equal(translateError('de', 'Run FFU Cloner as administrator.'), translate('de', 'adminRequired'));
});
