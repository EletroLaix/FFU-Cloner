const { contextBridge, ipcRenderer } = require('electron');

// Unwrap IPC responses and expose backend failures as ordinary errors.
async function invoke(channel, value) {
	const result = await ipcRenderer.invoke(channel, value);
	if (!result.ok) {
		throw new Error(result.error);
	}
	return result.value;
}
contextBridge.exposeInMainWorld('ffu', {
	environment: () => invoke('environment'),
	listDisks: () => invoke('list-disks'),
	pickImage: (mode, language) => invoke('pick-image', { mode, language }),
	startClone: (request) => invoke('start-clone', request),
	cancelClone: () => invoke('cancel-clone'),
	readLogs: (selected) => invoke('read-logs', selected),
	openLogs: () => invoke('open-logs'),
	minimize: () => invoke('minimize-window'),
	close: () => invoke('close-window'),
	fitWindow: (height) => invoke('fit-window', height),
	onProgress: (callback) => {
		const listener = (_event, update) => callback(update);
		ipcRenderer.on('clone-progress', listener);
		return () => ipcRenderer.removeListener('clone-progress', listener);
	}
});
