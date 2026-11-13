import React, { useEffect, useRef } from 'react';
import { X, CircleAlert, HardDrive, Download } from 'lucide-react';
import { formatSize } from '../Helpers/Disks.mjs';

// Keep keyboard focus inside the destructive confirmation until it is dismissed.
export default function ConfirmationDialog({ t, language, disk, onClose, onConfirm }) {
	const confirmButton = useRef(null);
	const gb = (size) => formatSize(size, language);
	useEffect(() => {
		confirmButton.current?.focus();
		const escape = (event) => {
			if (event.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', escape);
		return () => document.removeEventListener('keydown', escape);
	}, [onClose]);
	return (
		<div className="modal-backdrop">
			<section
				className="confirmation"
				role="dialog"
				aria-modal="true"
				aria-labelledby="confirm-title"
				onKeyDown={(event) => {
					if (event.key !== 'Tab') return;
					const focusable = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
					if (event.shiftKey && document.activeElement === focusable[0]) {
						event.preventDefault();
						focusable.at(-1).focus();
					} else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
						event.preventDefault();
						focusable[0].focus();
					}
				}}
			>
				<button
					className="icon-button close"
					aria-label={t('confirmClose')}
					onClick={() => onClose()}
				>
					<X size={20} />
				</button>
				<span className="confirm-icon">
					<CircleAlert size={26} />
				</span>
				<h2 id="confirm-title">{t('confirmApply')}</h2>
				<div className="confirm-disk">
					<HardDrive size={24} />
					<div>
						<strong>{disk.name}</strong>
						<span>
							{t('disk')} {disk.number} · {gb(disk.size)} GB · {disk.bus}
						</span>
						<small>S/N {disk.serial || disk.uniqueId}</small>
					</div>
				</div>
				<p>{t('applyWarning')}</p>
				<div className="confirm-actions">
					<button className="primary" ref={confirmButton} onClick={onConfirm}>
						<Download size={17} /> {t('eraseRestore')}
					</button>
				</div>
			</section>
		</div>
	);
}
