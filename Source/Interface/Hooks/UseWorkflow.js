import { useEffect, useRef, useState } from 'react';
import { useWindowHeight } from './UseWindowHeight.js';
import { unavailable } from '../Helpers/Disks.mjs';
import { previewDisks } from '../Preview/Disks.mjs';
import { stageKeys } from '../Localization/Localization.mjs';

const api = window.ffu;
const preview = import.meta.env.DEV && !api;

// Own selection, progress, and operation lifecycle independently of the page layout.
export function useWorkflow(language, setSystemLanguage) {
	const [mode, setMode] = useState('apply');
	const [environment, setEnvironment] = useState({
		windows: null,
		admin: false,
		version: __APP_VERSION__
	});
	const [disks, setDisks] = useState([]);
	const [disk, setDisk] = useState(null);
	const [choosingDisk, setChoosingDisk] = useState(true);
	const [image, setImage] = useState(null);
	const [selectingImage, setSelectingImage] = useState(false);
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
	const selectionGeneration = useRef(0);
	const selectionPending = useRef(false);
	const capture = mode === 'capture';
	const ready =
		api &&
		environment.windows &&
		environment.admin &&
		image &&
		disk &&
		!unavailable(disk, mode) &&
		!busy &&
		!selectingImage &&
		!loading;

	useWindowHeight(api, busy || (!!image && !!disk && !choosingDisk));

	// Refresh the displayed list and ignore results from superseded requests.
	async function refresh() {
		const ticket = ++generation.current;
		setLoading(true);
		setDisk(null);
		setChoosingDisk(true);
		setDiskError('');
		try {
			const found = api ? await api.listDisks() : preview ? previewDisks : [];
			if (ticket === generation.current) {
				setDisks(found);
			}
		} catch (error) {
			if (ticket === generation.current) {
				setDisks([]);
				setDiskError(error.message);
			}
		} finally {
			if (ticket === generation.current) {
				setLoading(false);
			}
		}
	}
	useEffect(() => {
		if (api) {
			api.environment()
				.then((value) => {
					setEnvironment(value);
					setSystemLanguage(value.locale);
				})
				.catch((error) => setStatus({ error: true, title: error.message }));
		}
		refresh();
		return api?.onProgress((update) => {
			if (update.stage) {
				setStatus({ key: stageKeys[update.stage], title: update.stage + '…' });
			}
			if (update.percent != null) {
				setPercent(update.percent);
			}
			if ('bytesPerSecond' in update) {
				const value =
					Number.isFinite(update.bytesPerSecond) && update.bytesPerSecond >= 0
						? update.bytesPerSecond
						: null;
				const time = performance.now();
				setSpeed(value);
				setSpeedSamples((previous) =>
					[
						...previous.filter((sample) => sample.time >= time - 60000),
						{ time, value }
					].slice(-60)
				);
			}
		});
	}, []);

	// Reset the selection when changing between capture and restore.
	function switchMode(value) {
		if (busy || confirm || value === mode) {
			return;
		}
		setMode(value);
		selectionGeneration.current++;
		setImage(null);
		setDisk(null);
		setStatus(null);
		setPercent(null);
	}

	// Open the native image picker and retain the selected file.
	async function pickImage() {
		if (!api || busy || confirm || selectionPending.current) {
			return;
		}
		const ticket = ++selectionGeneration.current;
		selectionPending.current = true;
		setSelectingImage(true);
		try {
			const result = await api.pickImage(mode, language);
			if (result && ticket === selectionGeneration.current) {
				setImage(result);
				setStatus(null);
			}
		} catch (error) {
			if (ticket === selectionGeneration.current) {
				setStatus({ error: true, title: error.message });
			}
		} finally {
			selectionPending.current = false;
			setSelectingImage(false);
		}
	}

	// Run the selected operation and reset transient state after every outcome.
	async function start() {
		if (!ready) {
			return;
		}
		setConfirm(false);
		setBusy(true);
		setSpeed(null);
		setSpeedSamples([]);
		setStopping(false);
		setPercent(null);
		setStatus({ key: 'stagePreflight' });
		try {
			const request = { mode, token: disk.token, image: image.path };
			if (!capture) {
				request.confirmed = true;
			}
			const result = await api.startClone(request);
			if (result.cancelled) {
				setStatus({ cancelled: true, key: 'cancelled' });
				setPercent(null);
				if (capture) {
					setImage(null);
				}
				return;
			}
			setPercent(100);
			setStatus({ success: true, key: capture ? 'imageSaved' : 'diskRestored' });
			if (capture) {
				setImage(null);
			}
		} catch (error) {
			setStatus({ error: true, title: error.message });
			if (capture) {
				setImage(null);
			}
		} finally {
			setBusy(false);
			setStopping(false);
			await refresh();
		}
	}

	// Request cooperative cancellation and keep the stop button disabled while waiting.
	async function cancelOperation() {
		if (stopping) {
			return;
		}
		setStopping(true);
		try {
			await api.cancelClone();
		} catch (error) {
			setStopping(false);
			setStatus({ error: true, title: error.message });
		}
	}

	// Forward window controls and surface any backend error in the workflow.
	async function windowAction(action) {
		try {
			await api?.[action]();
		} catch (error) {
			setStatus({ error: true, title: error.message });
		}
	}

	return {
		api,
		preview,
		mode,
		environment,
		disks,
		disk,
		choosingDisk,
		image,
		selectingImage,
		loading,
		diskError,
		busy,
		stopping,
		status,
		percent,
		speed,
		speedSamples,
		confirm,
		showLogs,
		capture,
		ready,
		refresh,
		switchMode,
		pickImage,
		start,
		cancelOperation,
		windowAction,
		setChoosingDisk,
		setDisk,
		setStatus,
		setConfirm,
		setShowLogs
	};
}
