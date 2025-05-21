const fs = require('fs');
const path = require('path');
const logPath = process.env.SPY_FS_LOG_PATH;

const logs = [];

const spyFs = new Proxy(fs, {
  get(target, prop) {
    const orig = target[prop];
    if (typeof orig === 'function') {
      return (...args) => {
        const [firstArg] = args;
        if (['readFileSync', 'writeFileSync', 'unlinkSync'].includes(prop)) {
          logs.push(`${prop.toUpperCase().replace('SYNC', '')}: ${firstArg}`);
        }
        return orig.apply(target, args);
      };
    }
    return orig;
  }
});

// Overwrite Node's internal fs cache
require.cache[require.resolve('fs')].exports = spyFs;

// Write logs on process exit
process.on('exit', () => {
  if (logPath) {
    fs.writeFileSync(logPath, logs.join('\n'), 'utf-8');
  }
});

