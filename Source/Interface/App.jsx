import React from 'react';
import { ShieldCheck } from 'lucide-react';
import Header from './Components/Header.jsx';
import Introduction from './Components/Introduction.jsx';
import ImageCard from './Components/ImageCard.jsx';
import DiskCard from './Components/DiskCard.jsx';
import OperationPanel from './Components/OperationPanel.jsx';
import ConfirmationDialog from './Components/ConfirmationDialog.jsx';
import LogsDialog from './Components/LogsDialog.jsx';
import { useLanguage } from './Hooks/UseLanguage.js';
import { useWorkflow } from './Hooks/UseWorkflow.js';

// Compose the page from workflow state and focused presentation components.
export default function App() {
	const { language, chooseLanguage, setSystemLanguage, t } = useLanguage();
	const {
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
	} = useWorkflow(language, setSystemLanguage);

	const imageCard = (
		<ImageCard
			t={t}
			mode={mode}
			image={image}
			selecting={selectingImage}
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
			<Introduction
				t={t}
				mode={mode}
				busy={busy}
				confirm={confirm}
				onModeChange={switchMode}
			/>
			<div className="workflow">
				{capture ? diskCard : imageCard}
				<span className="flow-arrow">
					<svg
						width="19"
						height="19"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
					>
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
			{showLogs && (
				<LogsDialog
					t={t}
					api={api}
					onClose={() => setShowLogs(false)}
				/>
			)}
		</main>
	);
}
