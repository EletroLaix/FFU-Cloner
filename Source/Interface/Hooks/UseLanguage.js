import { useEffect, useState } from 'react';
import { languages, resolveLanguage, translate } from '../Localization/Localization.mjs';
function storedLanguage() {
	try {
		const value = localStorage.getItem('ffu.language');
		return Object.hasOwn(languages, value) ? value : null;
	} catch {
		return null;
	}
}

// A manual choice takes precedence over the operating system language.
export function useLanguage() {
	const [language, setLanguage] = useState(() => storedLanguage() || resolveLanguage(navigator.language));
	useEffect(() => {
		document.documentElement.lang = language;
	}, [language]);
	function chooseLanguage(code) {
		setLanguage(code);
		try {
			localStorage.setItem('ffu.language', code);
		} catch {}
	}
	function setSystemLanguage(locale) {
		if (!storedLanguage()) setLanguage(resolveLanguage(locale));
	}
	return {
		language,
		chooseLanguage,
		setSystemLanguage,
		t: (key, values) => translate(language, key, values)
	};
}
