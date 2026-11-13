// UI eligibility mirrors the backend checks so protected drives cannot be selected.
export function unavailable(disk, mode) {
	if (disk.system || disk.boot || disk.paging) return 'protectedDisk';
	if (!String(disk.uniqueId || '').trim() || disk.size <= 0) return 'unknownIdentity';
	if (mode === 'apply' && disk.readOnly) return 'readOnly';
	if (mode === 'capture' && disk.style !== 'GPT') return 'gptRequired';
	return null;
}

export function formatSize(size, language) {
	return new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(size / 1e9);
}
