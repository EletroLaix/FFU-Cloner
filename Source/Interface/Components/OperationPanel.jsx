import React from 'react';
import {
	CircleAlert,
	CheckCheck,
	LoaderCircle,
	ShieldCheck,
	X,
	Upload,
	Download,
	ArrowRight
} from 'lucide-react';
import SpeedHistory from './SpeedHistory.jsx';
import { translateError } from '../Localization/Localization.mjs';

function operationTitle({ status, t, language, available, preview, environment, ready, hasDisk, hasImage }) {
	const message = status?.key ? t(status.key) : translateError(language, status?.title);
	if (message) return message;
	if (!available) return t(preview ? 'previewTitle' : 'bridgeError');
	if (environment.windows === null) return t('connecting');
	if (!environment.windows) return t('windowsRequired');
	if (!environment.admin) return t('adminRequired');
	if (ready) return t('ready');
	if (!hasDisk && !hasImage) return t('selectBoth');
	return t(!hasImage ? 'selectImage' : 'selectDisk');
}
export default function OperationPanel(props) {
	const {
		t,
		language,
		mode,
		status,
		busy,
		stopping,
		ready,
		percent,
		speed,
		speedSamples,
		onStart,
		onStop
	} = props;
	const capture = mode === 'capture';
	const title = operationTitle(props);
	const hint = status?.cancelled
		? t(capture ? 'cancelledCaptureHint' : 'cancelledApplyHint')
		: status?.error
			? t('errorHint')
			: status?.success
				? t('successHint')
				: capture
					? t('captureHint')
					: t('applyHint');
	const StatusIcon = status?.error
		? CircleAlert
		: status?.success || ready
			? CheckCheck
			: busy
				? LoaderCircle
				: ShieldCheck;
	return (
		<section
			className={`operation ${status?.error ? 'error' : ''} ${status?.success ? 'success' : ''}`}
			aria-live="polite"
		>
			<div className="operation-row">
				<span className="status-symbol">
					<StatusIcon size={22} className={busy ? 'spin' : ''} />
				</span>
				<div className="operation-copy">
					<strong title={title}>{title}</strong>
					{!busy && <p>{hint}</p>}
				</div>
				{busy && (
					<div className="speed-telemetry">
						<span title={t('speedHistory')}>
							<SpeedHistory samples={speedSamples} label={t('speedHistory')} />
						</span>
						<span className="transfer-speed" title={t('speedHint')}>
							{speed == null
								? '—'
								: new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(
										speed / 1e6
									)}{' '}
							<small>MB/s</small>
						</span>
					</div>
				)}
				{busy ? (
					<button
						className="secondary"
						data-testid="cancel-operation"
						onClick={onStop}
						disabled={stopping}
						title={t(capture ? 'cancelledCaptureHint' : 'cancelledApplyHint')}
					>
						<X size={17} />
						{t(stopping ? 'stopping' : 'stopOperation')}
					</button>
				) : (
					<button className="primary" disabled={!ready} onClick={onStart}>
						{capture ? <Upload size={18} /> : <Download size={18} />}
						<span>{capture ? t('captureDisk') : t('restoreDisk')}</span>
						<ArrowRight size={17} />
					</button>
				)}
			</div>
			<div className="progress-row">
				<div
					className={`progress ${busy && percent == null ? 'indeterminate' : ''}`}
					role="progressbar"
					aria-label={t('progress')}
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={percent ?? undefined}
				>
					<span style={{ width: `${percent ?? 0}%` }} />
				</div>
				{percent != null && <span>{percent.toFixed(1)}%</span>}
			</div>
		</section>
	);
}
