import React, { useEffect, useRef, useState } from 'react';
import { Copy, Globe2, ChevronDown, Check, FolderOpen, Minus, X } from 'lucide-react';
import { languages } from '../Localization/Localization.mjs';

// Display language, log, and window controls for the current workflow.
export default function Header({
	t,
	language,
	onLanguageChange,
	busy,
	confirm,
	available,
	onLogs,
	onMinimize,
	onClose
}) {
	const [languageOpen, setLanguageOpen] = useState(false);
	const languageControl = useRef(null);

	// Apply the selected language and remember it for the next session.
	function chooseLanguage(code) {
		onLanguageChange(code);
		setLanguageOpen(false);
	}
	useEffect(() => {
		if (!languageOpen) {
			return;
		}
		const dismiss = (event) => {
			if (!languageControl.current?.contains(event.target)) {
				setLanguageOpen(false);
			}
		};
		const escape = (event) => {
			if (event.key === 'Escape') {
				setLanguageOpen(false);
			}
		};
		document.addEventListener('pointerdown', dismiss);
		document.addEventListener('keydown', escape);
		return () => {
			document.removeEventListener('pointerdown', dismiss);
			document.removeEventListener('keydown', escape);
		};
	}, [languageOpen]);

	return (
		<header>
			<div className="brand">
				<span className="brand-symbol">
					<Copy size={23} />
				</span>
				<div>
					<b>
						FFU Cloner<span className="brand-dot">.</span>
					</b>
				</div>
			</div>
			<div className="header-actions">
				<div
					className="language-control"
					ref={languageControl}
				>
					<button
						className="language-toggle"
						data-testid="language-toggle"
						aria-label={t('language')}
						title={t('language')}
						aria-expanded={languageOpen}
						aria-haspopup="menu"
						disabled={busy || confirm}
						onClick={() => setLanguageOpen(!languageOpen)}
					>
						<Globe2 size={14} />
						<span>{language.toUpperCase()}</span>
						<ChevronDown size={11} />
					</button>
					{languageOpen && (
						<div
							className="language-options"
							role="menu"
							aria-label={t('language')}
						>
							{Object.entries(languages).map(([code, name]) => (
								<button
									role="menuitemradio"
									aria-checked={language === code}
									key={code}
									onClick={() => chooseLanguage(code)}
								>
									<span className="language-code">
										{code.toUpperCase()}
									</span>
									<span>{name}</span>
									{language === code && <Check size={12} />}
								</button>
							))}
						</div>
					)}
				</div>

				<button
					data-testid="open-logs"
					className="quiet"
					onClick={onLogs}
					disabled={!available || confirm}
					title={t('openLogs')}
				>
					<FolderOpen size={17} />
					{t('logs')}
				</button>
				<div className="window-controls">
					<button
						data-testid="minimize-window"
						className="icon-button"
						aria-label={t('minimize')}
						title={t('minimize')}
						disabled={!available}
						onClick={() => onMinimize()}
					>
						<Minus size={17} />
					</button>
					<button
						data-testid="close-window"
						className="icon-button window-close"
						aria-label={t('close')}
						title={busy ? t('waitClose') : t('close')}
						disabled={!available || busy}
						onClick={() => onClose()}
					>
						<X size={17} />
					</button>
				</div>
			</div>
		</header>
	);
}
