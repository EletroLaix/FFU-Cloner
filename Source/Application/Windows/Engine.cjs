const dism = require('./Dism.cjs');

// Translate the shared request into the Windows engine's confirmation protocol.
async function clone(request, onProgress, signal) {
	if (request?.mode === 'apply' && request.confirmed !== true) {
		throw new Error('Invalid disk confirmation.');
	}
	const confirmation = `DISK ${request?.disk?.number}`;
	return dism.clone({ ...request, confirmation }, onProgress, signal);
}

module.exports = { environment: dism.environment, listDisks: dism.listDisks, clone };
