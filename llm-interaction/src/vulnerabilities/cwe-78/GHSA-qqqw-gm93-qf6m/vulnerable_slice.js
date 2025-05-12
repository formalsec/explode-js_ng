"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGradleVersion = void 0;
//sub-process.js
const childProcess = require("child_process");
const debugModule = require("debug");
const shescape_1 = require("shescape");
const debugLogging = debugModule('snyk-gradle-plugin');
// Executes a subprocess. Resolves successfully with stdout contents if the exit code is 0.
function execute(command, args, options, perLineCallback) {
    const spawnOptions = {
        shell: true,
        env: { ...process.env },
    };
    if (options === null || options === void 0 ? void 0 : options.cwd) {
        spawnOptions.cwd = options.cwd;
    }
    if (options === null || options === void 0 ? void 0 : options.env) {
        spawnOptions.env = { ...process.env, ...options.env };
    }
    args = (0, shescape_1.quoteAll)(args, spawnOptions);
    // Before spawning an external process, we look if we need to restore the system proxy configuration,
    // which overides the cli internal proxy configuration.
    if (process.env.SNYK_SYSTEM_HTTP_PROXY !== undefined) {
        spawnOptions.env.HTTP_PROXY = process.env.SNYK_SYSTEM_HTTP_PROXY;
    }
    if (process.env.SNYK_SYSTEM_HTTPS_PROXY !== undefined) {
        spawnOptions.env.HTTPS_PROXY = process.env.SNYK_SYSTEM_HTTPS_PROXY;
    }
    if (process.env.SNYK_SYSTEM_NO_PROXY !== undefined) {
        spawnOptions.env.NO_PROXY = process.env.SNYK_SYSTEM_NO_PROXY;
    }
    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        const proc = childProcess.spawn(command, args, spawnOptions);
        proc.stdout.on('data', (data) => {
            const strData = data.toString();
            stdout = stdout + strData;
            if (perLineCallback) {
                strData.split('\n').forEach(perLineCallback);
            }
        });
        proc.stderr.on('data', (data) => {
            stderr = stderr + data;
        });
        proc.on('close', (code) => {
            if (code !== 0) {
                const fullCommand = command + ' ' + args.join(' ');
                return reject(new Error(`
>>> command: ${fullCommand}
>>> exit code: ${code}
>>> stdout:
${stdout}
>>> stderr:
${stderr}
`));
            }
            if (stderr) {
                debugLogging('subprocess exit code = 0, but stderr was not empty: ' + stderr);
            }
            resolve(stdout);
        });
    });
}
//
//index.js
let logger = null;
function debugLog(s) {
    if (logger === null) {
        // Lazy init: Snyk CLI needs to process the CLI argument "-d" first.
        // TODO(BST-648): more robust handling of the debug settings
        if (process.env.DEBUG) {
            debugModule.enable(process.env.DEBUG);
        }
        logger = debugModule('snyk-gradle-plugin');
    }
    logger(s);
}


async function getGradleVersion(root, command) {
    debugLog('`gradle -v` command run: ' + command);
    let gradleVersionOutput = '[COULD NOT RUN gradle -v]';
    try {
        gradleVersionOutput = await execute(command, ['-v'], {
            cwd: root,
        });
    }
    catch (err) {
        console.error('[PoC Error Caught]', err.message);
    }
    return gradleVersionOutput;
}
exports.getGradleVersion = getGradleVersion;

