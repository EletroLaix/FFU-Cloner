import en from '../../Resources/Locales/en.json' with { type: 'json' };
import it from '../../Resources/Locales/it.json' with { type: 'json' };
import de from '../../Resources/Locales/de.json' with { type: 'json' };
import fr from '../../Resources/Locales/fr.json' with { type: 'json' };
import es from '../../Resources/Locales/es.json' with { type: 'json' };
import pl from '../../Resources/Locales/pl.json' with { type: 'json' };

export const languages = {
	en: 'English',
	it: 'Italiano',
	de: 'Deutsch',
	fr: 'Français',
	es: 'Español',
	pl: 'Polski'
};
export const messages = { en, it, de, fr, es, pl };

// Match a regional locale to a supported language, falling back to English.
export function resolveLanguage(locale) {
	const code = String(locale || '')
		.toLowerCase()
		.split(/[-_]/)[0];
	return Object.hasOwn(messages, code) ? code : 'en';
}

// Resolve a message and substitute its named values.
export function translate(language, key, values = {}) {
	const text = (messages[language] || en)[key] || en[key] || key;
	return text.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
}
export const stageKeys = {
	'Inspecting image': 'stageInspect',
	'Preparing disk': 'stagePrepare',
	Capturing: 'stageCapture',
	Restoring: 'stageApply',
	'Wait for the operation to finish before closing.': 'waitClose'
};
const errorKeys = {
	'Unauthorized origin.': 'unauthorized',
	'An operation is already running.': 'busyError',
	'Wait for the operation to finish.': 'waitClose',
	'Invalid operation.': 'invalidOperation',
	'Operation unavailable.': 'invalidOperation',
	'Select the image and disk again.': 'reselect',
	'Invalid disk confirmation.': 'invalidConfirmation',
	'The file already exists. Choose a new name.': 'imageExists',
	'The selected image has changed. Select it again.': 'imageChanged',
	'FFU operations require Windows.': 'windowsRequired',
	'Run FFU Cloner as administrator.': 'adminRequired',
	'Disk is read-only.': 'readOnly',
	'FFU capture requires a GPT disk.': 'gptRequired'
};

// Translate known backend errors and preserve diagnostic details for other failures.
export function translateError(language, message) {
	return errorKeys[message] ? translate(language, errorKeys[message]) : message;
}
