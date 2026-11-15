const { runEngine, quote } = require('./EngineProcess.cjs');

// Explain why a disk is unsafe or unsuitable for the requested operation.
function blockReason(disk, mode) {
	if (disk.system || disk.boot || disk.paging) {
		return 'Protected system disk';
	}
	if (
		!String(disk.uniqueId || '').trim() ||
		!Number.isSafeInteger(disk.size) ||
		disk.size <= 0
	) {
		return 'Disk identity unavailable';
	}
	if (mode === 'apply' && disk.readOnly) {
		return 'Disk is read-only';
	}
	if (mode === 'capture' && disk.style !== 'GPT') {
		return 'Capture requires GPT';
	}
	return null;
}

// Extract a valid percentage from DISM output using either decimal separator.
function percentOf(line) {
	const match = line.match(/(?<![\d.])(\d{1,3}(?:[.,]\d+)?)%/);
	const value = match ? Number(match[1].replace(',', '.')) : NaN;
	return value >= 0 && value <= 100 ? value : null;
}

// Accept only nonnegative integer throughput messages from the engine.
function speedOf(line) {
	if (!/^FFU_SPEED:\d+$/.test(line)) {
		return null;
	}
	const value = Number(line.slice(10));
	return Number.isSafeInteger(value) ? value : null;
}

// Read Windows availability and the current process administrator status.
async function environment() {
	if (process.platform !== 'win32') {
		return { windows: false, admin: false };
	}
	return { windows: true, ...JSON.parse(await runEngine('environment')) };
}

// Read the disk inventory returned by the PowerShell engine.
async function listDisks() {
	return JSON.parse(await runEngine('list'));
}

// Validate the operation and translate engine output into structured progress updates.
async function clone(request, onProgress, signal) {
	if (!['apply', 'capture'].includes(request.mode)) {
		throw new Error('Invalid operation.');
	}
	if (
		!request.disk ||
		!Number.isSafeInteger(request.disk.number) ||
		request.disk.number < 0
	) {
		throw new Error('Invalid disk.');
	}
	const reason = blockReason(request.disk, request.mode);
	if (reason) {
		throw new Error(reason);
	}
	if (request.confirmation !== `DISK ${request.disk.number}`) {
		throw new Error('Invalid confirmation.');
	}
	let result;
	await runEngine(
		'clone',
		request,
		(line) => {
			if (line.startsWith('FFU_RESULT:')) {
				result = JSON.parse(line.slice(11));
			} else if (line.startsWith('FFU_LOG:')) {
				onProgress({ logPath: line.slice(8) });
			} else if (line.startsWith('FFU_STAGE:')) {
				onProgress({ stage: line.slice(10) });
			} else if (line === 'FFU_SPEED:unavailable') {
				onProgress({ bytesPerSecond: null });
			} else if (speedOf(line) !== null) {
				onProgress({ bytesPerSecond: speedOf(line) });
			} else if (percentOf(line) !== null) {
				onProgress({ percent: percentOf(line) });
			}
		},
		signal
	);
	if (!result?.success) {
		throw new Error('DISM did not confirm completion. See the log.');
	}
	return result;
}

module.exports = {
	blockReason,
	percentOf,
	speedOf,
	quote,
	environment,
	listDisks,
	clone,
	runEngine
};
