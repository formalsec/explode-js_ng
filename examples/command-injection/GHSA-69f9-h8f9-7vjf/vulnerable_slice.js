"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
//system-deps.js
const os = require("os");
//composer-cmds.js
const path = require("path");
const childProcess = require("child_process");

const composerCmd = 'composer --version';
const composerShowCmd = 'composer show -p';
const pharCmd = `php ${path.resolve(path.resolve() + '/composer.phar')} show -p --format=json`;

function cmdReturnsOk(cmd) {
    return cmd && childProcess.spawnSync(cmd, { shell: true }).status === 0;
}

// run a cmd in a specific folder and it's result should be there
function execWithResult(cmd, basePath) {
    return childProcess.execSync(cmd, { cwd: basePath }).toString();
}

//system-deps.js
function isSet(variable) {
    return typeof variable !== 'undefined';
}
function systemDeps(basePath, options) {
    const composerOk = isSet(options.composerIsFine) ? options.composerIsFine : cmdReturnsOk(composerCmd);
    const composerPharOk = isSet(options.composerPharIsFine) ?
        options.composerPharIsFine : cmdReturnsOk(pharCmd);
    let finalVersionsObj = {};
    if (options.systemVersions && (Object.keys(options.systemVersions).length > 0)) {
        // give first preference to a stub
        finalVersionsObj = options.systemVersions;
    }
    else if (composerOk) {
        const lines = execWithResult(composerShowCmd, basePath).split(os.EOL);
        lines.forEach((line) => {
            const [part1, part2] = line.split(/\s+/);
            if (part2) {
                finalVersionsObj[part1] = part2;
            }
        });
    }
    else if (composerPharOk) {
        const output = execWithResult(pharCmd, basePath);
        const versionsObj = JSON.parse(output).platform;
        versionsObj.forEach(({ name, version }) => {
            finalVersionsObj[name] = version;
        });
    }
    else {
        // TODO: tell the user we are not reporting accurately system versions, so some version info may not be exact
    }
    return finalVersionsObj;
}
exports.systemDeps = systemDeps;
//# sourceMappingURL=system-deps.js.map

