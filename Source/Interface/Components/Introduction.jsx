import React from 'react';
import { Download, Upload } from 'lucide-react';
export default function Introduction({ t, mode, busy, confirm, onModeChange }) {
	const capture = mode === 'capture';
	return (
		<div className="intro">
			<div>
				<span className="eyebrow intro-label">FULL FLASH UPDATE</span>
				<h1>
					{t('headlineA')}
					<br />
					<span>{t('headlineB')}</span>
				</h1>
				<p>{t('subtitle')}</p>
			</div>
			{!busy && (
				<div className="mode-switch" aria-label={t('mode')}>
					<button
						className={!capture ? 'active' : ''}
						onClick={() => onModeChange('apply')}
						disabled={busy || confirm}
						aria-pressed={!capture}
					>
						<Download size={17} />
						{t('restore')}
					</button>
					<button
						className={capture ? 'active' : ''}
						onClick={() => onModeChange('capture')}
						disabled={busy || confirm}
						aria-pressed={capture}
					>
						<Upload size={17} />
						{t('capture')}
					</button>
				</div>
			)}
		</div>
	);
}
