import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import Header from './Components/Header.jsx';
import Introduction from './Components/Introduction.jsx';
import ImageCard from './Components/ImageCard.jsx';
import DiskCard from './Components/DiskCard.jsx';
import OperationPanel from './Components/OperationPanel.jsx';
import ConfirmationDialog from './Components/ConfirmationDialog.jsx';
import LogsDialog from './Components/LogsDialog.jsx';
import { useLanguage } from './Hooks/UseLanguage.js';
import { useWindowHeight } from './Hooks/UseWindowHeight.js';
import { unavailable } from './Helpers/Disks.mjs';
import { previewDisks } from './Preview/Disks.mjs';
import { stageKeys } from './Localization/Localization.mjs';
const api = window.ffu;
const preview = import.meta.env.DEV && !api;

// This component owns the workflow; presentation components receive data and callbacks.
export default function App() {
	const { language, chooseLanguage, setSystemLanguage, t } = useLanguage();
	const [mode, setMode] = useState('apply');
	const [environment, setEnvironment] = useState({ windows: null, admin: false, version: __APP_VERSION__ });
	const [disks, setDisks] = useState([]);
	const [disk, setDisk] = useState(null);
	const [choosingDisk, setChoosingDisk] = useState(true);
	const [image, setImage] = useState(null);
	const [loading, setLoading] = useState(true);
	const [diskError, setDiskError] = useState('');
	const [busy, setBusy] = useState(false);
	const [stopping, setStopping] = useState(false);
	const [status, setStatus] = useState(null);
	const [percent, setPercent] = useState(null);
	const [speed, setSpeed] = useState(null);
	const [speedSamples, setSpeedSamples] = useState([]);
	const [confirm, setConfirm] = useState(false);
	const [showLogs, setShowLogs] = useState(false);
	const generation = useRef(0);
	const capture = mode === 'capture';
	const ready =
		api &&
		environment.windows &&
		environment.admin &&
		image &&
		disk &&
		!unavailable(disk, mode) &&
		!busy &&
		!loading;

	useWindowHeight(api, busy || (!!image && !!disk && !choosingDisk));
	async function refresh() {
		const ticket = ++generation.current;
		setLoading(true);
		setDisk(null);
		setChoosingDisk(true);
		setDiskError('');
		try {
			const found = api ? await api.listDisks() : preview ? previewDisks : [];
			if (ticket === generation.current) setDisks(found);
		} catch (error) {
			if (ticket === generation.current) {
				setDisks([]);
				setDiskError(error.message);
			}
		} finally {
			if (ticket === generation.current) setLoading(false);
		}
	}
	useEffect(() => {
		if (api)
			api.environment()
				.then((value) => {
					setEnvironment(value);
					setSystemLanguage(value.locale);
				})
				.catch((error) => setStatus({ error: true, title: error.message }));
		refresh();
		return api?.onProgress((update) => {
			if (update.stage) setStatus({ key: stageKeys[update.stage], title: update.stage + '…' });
			if (update.percent != null) setPercent(update.percent);
			if ('bytesPerSecond' in update) {
				const value =
					Number.isFinite(update.bytesPerSecond) && update.bytesPerSecond >= 0
						? update.bytesPerSecond
						: null;
				const time = performance.now();
				setSpeed(value);
				setSpeedSamples((previous) =>
					[...previous.filter((sample) => sample.time >= time - 60000), { time, value }].slice(-60)
				);
			}
		});
	}, []);
	function switchMode(value) {
		if (busy || confirm || value === mode) return;
		setMode(value);
		setImage(null);
		setDisk(null);
		setStatus(null);
		setPercent(null);
	}
	async function pickImage() {
		if (!api) return;
		try {
			const result = await api.pickImage(mode, language);
			if (result) {
				setImage(result);
				setStatus(null);
			}
		} catch (error) {
			setStatus({ error: true, title: error.message });
		}
	}
	async function start() {
		if (!ready) return;
		setConfirm(false);
		setBusy(true);
		setSpeed(null);
		setSpeedSamples([]);
		setStopping(false);
		setPercent(null);
		setStatus({ key: 'stagePreflight' });
		try {
			const request = { mode, token: disk.token, image: image.path };
			if (!capture) request.confirmed = true;
			const result = await api.startClone(request);
			if (result.cancelled) {
				setStatus({ cancelled: true, key: 'cancelled' });
				setPercent(null);
				if (capture) setImage(null);
				return;
			}
			setPercent(100);
			setStatus({ success: true, key: capture ? 'imageSaved' : 'diskRestored' });
			if (capture) setImage(null);
		} catch (error) {
			setStatus({ error: true, title: error.message });
			if (capture) setImage(null);
		} finally {
			setBusy(false);
			setStopping(false);
			await refresh();
		}
	}
	async function cancelOperation() {
		if (stopping) return;
		setStopping(true);
		try {
			await api.cancelClone();
		} catch (error) {
			setStopping(false);
			setStatus({ error: true, title: error.message });
		}
	}
	async function windowAction(action) {
		try {
			await api?.[action]();
		} catch (error) {
			setStatus({ error: true, title: error.message });
		}
	}

	const imageCard = (
		<ImageCard
			t={t}
			mode={mode}
			image={image}
			busy={busy}
			confirm={confirm}
			available={!!api}
			onPick={pickImage}
		/>
	);
	const diskCard = (
		<DiskCard
			t={t}
			mode={mode}
			language={language}
			disk={disk}
			disks={disks}
			choosingDisk={choosingDisk}
			loading={loading}
			diskError={diskError}
			busy={busy}
			confirm={confirm}
			onRefresh={refresh}
			onChooseDisk={() => setChoosingDisk(true)}
			onSelect={(item) => {
				setDisk(item);
				setChoosingDisk(false);
				setStatus(null);
			}}
		/>
	);
	return (
		<main className={`app-shell ${busy ? 'running' : ''}`}>
			<Header
				t={t}
				language={language}
				onLanguageChange={chooseLanguage}
				busy={busy}
				confirm={confirm}
				available={!!api}
				onLogs={() => setShowLogs(true)}
				onMinimize={() => windowAction('minimize')}
				onClose={() => windowAction('close')}
			/>
			<Introduction t={t} mode={mode} busy={busy} confirm={confirm} onModeChange={switchMode} />
			<div className="workflow">
				{capture ? diskCard : imageCard}
				<span className="flow-arrow">
					<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor">
						<path d="M5 12h14m-6-6 6 6-6 6" />
					</svg>
				</span>
				{capture ? imageCard : diskCard}
			</div>
			<OperationPanel
				t={t}
				language={language}
				mode={mode}
				status={status}
				busy={busy}
				stopping={stopping}
				ready={!!ready}
				percent={percent}
				speed={speed}
				speedSamples={speedSamples}
				environment={environment}
				available={!!api}
				preview={preview}
				hasDisk={!!disk}
				hasImage={!!image}
				onStart={capture ? start : () => setConfirm(true)}
				onStop={cancelOperation}
			/>
			<footer>
				{!busy && (
					<span>
						<ShieldCheck size={13} />
						{t('footerSafety')}
					</span>
				)}
				<span>{preview ? t('previewData') : `v${environment.version}`}</span>
			</footer>
			{confirm && (
				<ConfirmationDialog
					t={t}
					language={language}
					disk={disk}
					onClose={() => setConfirm(false)}
					onConfirm={start}
				/>
			)}
			{showLogs && <LogsDialog t={t} api={api} onClose={() => setShowLogs(false)} />}
		</main>
	);
}
