const fs = require('fs');
const path = require('path');
const Module = require('module');

const logPath = process.env.SPY_FS_LOG_PATH;
console.log("LogPath at spyFs: ", logPath);
const logs = [];

const spyFs = new Proxy(fs, {
	get(target, prop) {
		const orig = target[prop];
		if (typeof orig === 'function') {
			return (...args) => {
				const [firstArg] = args;
				if (['readFileSync', 'readFile', 'writeFileSync', 'writeFile', 'unlinkSync'].includes(prop)) {
					//console.log("detected");
					//console.log(prop);
					logs.push(`${prop.toUpperCase().replace('SYNC', '').replace('FILE', '')}: ${firstArg}`);
					console.log(logs);
				}
				return orig.apply(target, args);
			};
		}
		return orig;
	}
});

// Override built-in 'fs' globally
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
	if (request === 'fs') {
		return spyFs;
	}
	return originalLoad.apply(this, arguments);
};

// Save logs to file on exit
process.on('exit', writeLogs);
process.on('SIGINT', writeLogs);
process.on('SIGTERM', writeLogs);
process.on('uncaughtException', (err) => {
	console.error("Uncaught exception:", err);
	writeLogs();
	process.exit(1);
});

let didWrite = false;
function writeLogs() {
	if (didWrite) return;
	didWrite = true;
	try {
		require('fs').writeFileSync(logPath, logs.join('\n'), 'utf-8');
		console.log("Logs Written to", logPath);
	} catch (err) {
		console.error("Failed to write logs:", err);
	}
}/*
process.on('exit', () => {

	try {
		require('fs').writeFileSync(logPath, logs.join('\n'), 'utf-8');
		console.log("Logs Written to", logPath);
	} catch (err) {
		console.error("Failed to write logs:", err);
	}
});*/

