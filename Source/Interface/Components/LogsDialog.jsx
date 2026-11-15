import React, { useEffect, useRef, useState } from 'react';
import { FileText, FolderOpen, RefreshCw, X } from 'lucide-react';

// Browse session logs while preserving focus and refreshing the selected entry.
export default function LogsDialog({ t, api, onClose }) {
	const [data, setData] = useState(null);
	const [error, setError] = useState('');
	const [selected, setSelected] = useState(null);
	const closeButton = useRef(null);
	const latest = useRef(0);
	useEffect(() => {
		const previousFocus = document.activeElement;
		closeButton.current?.focus();
		const escape = (event) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};
		document.addEventListener('keydown', escape);
		return () => {
			document.removeEventListener('keydown', escape);
			previousFocus?.focus();
		};
	}, []);

	// Load the selected log and ignore results from superseded requests.
	async function refresh(name = selected) {
		const ticket = ++latest.current;
		try {
			const result = await api.readLogs(name);
			if (ticket === latest.current) {
				setData(result);
				setError('');
			}
		} catch (error) {
			if (ticket === latest.current) {
				setError(error.message);
			}
		}
	}
	useEffect(() => {
		refresh();
		const timer = setInterval(() => refresh(), 3000);
		return () => {
			clearInterval(timer);
			latest.current++;
		};
	}, [selected]);

	// Open the log directory through the desktop bridge and report failures.
	async function openFolder() {
		try {
			await api.openLogs();
		} catch (error) {
			setError(error.message);
		}
	}
	return (
		<div className="modal-backdrop">
			<section
				className="logs-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="logs-title"
				onKeyDown={(event) => {
					if (event.key !== 'Tab') {
						return;
					}
					const items = [
						...event.currentTarget.querySelectorAll(
							'button:not(:disabled), select:not(:disabled), [tabindex="0"]'
						)
					];
					if (event.shiftKey && document.activeElement === items[0]) {
						event.preventDefault();
						items.at(-1).focus();
					} else if (
						!event.shiftKey &&
						document.activeElement === items.at(-1)
					) {
						event.preventDefault();
						items[0].focus();
					}
				}}
			>
				<div className="logs-heading">
					<span className="logs-icon">
						<FileText size={22} />
					</span>
					<div>
						<span className="logs-eyebrow">FFU CLONER</span>
						<h2 id="logs-title">{t('logsTitle')}</h2>
						<p>{t('logsSubtitle')}</p>
					</div>
					<button
						ref={closeButton}
						className="icon-button"
						aria-label={t('close')}
						onClick={onClose}
					>
						<X size={20} />
					</button>
				</div>
				<div className="logs-toolbar">
					<select
						aria-label={t('logsSelect')}
						value={data?.selected || ''}
						disabled={!data?.files.length}
						onChange={(event) => setSelected(event.target.value)}
					>
						{data?.files.length ? (
							data.files.map((file) => (
								<option
									key={file.name}
									value={file.name}
								>
									{file.name}
								</option>
							))
						) : (
							<option value="">{t('logsEmpty')}</option>
						)}
					</select>
					<button
						className="logs-button"
						onClick={() => refresh()}
						title={t('logsRefresh')}
						aria-label={t('logsRefresh')}
					>
						<RefreshCw size={15} />
					</button>
					<button
						className="logs-button"
						onClick={openFolder}
					>
						<FolderOpen size={15} />
						{t('logsFolder')}
					</button>
				</div>
				{data?.truncated && <p className="logs-notice">{t('logsTruncated')}</p>}
				<div
					className="logs-content"
					tabIndex="0"
					aria-label={t('logsContent')}
				>
					{error ? (
						<p
							className="logs-error"
							role="alert"
						>
							{error}
						</p>
					) : !data ? (
						<p>{t('logsLoading')}</p>
					) : !data.files.length ? (
						<p>{t('logsEmpty')}</p>
					) : (
						data.text.split(/\r?\n/).map((line, index) => {
							const match = line.match(
								/^(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:[.,]\d+)?(?:Z|[+-]\d\d:\d\d)?)(.*)$/
							);
							return (
								<div
									className="log-line"
									key={index}
								>
									{match ? (
										<>
											<span className="log-time">{match[1]}</span>
											{match[2]}
										</>
									) : (
										line || '\u00a0'
									)}
								</div>
							);
						})
					)}
				</div>
			</section>
		</div>
	);
}
