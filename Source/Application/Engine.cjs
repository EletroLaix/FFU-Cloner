// Select the platform adapter and reject operations on unsupported systems.
function createEngine(platform = process.platform) {
	if (platform === 'win32') {
		return require('./Windows/Engine.cjs');
	}
	const unavailable = async () => {
		throw new Error('FFU operations require Windows.');
	};
	return {
		environment: async () => ({ windows: false, admin: false }),
		listDisks: unavailable,
		clone: unavailable
	};
}

module.exports = createEngine();
module.exports.createEngine = createEngine;
