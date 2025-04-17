"use strict";
// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFile = exports.parseFileCache = exports.loadFileAttr = exports.storeFileAttr = exports.isValidFileName = exports.createFileWithPath = exports.prepareFolder = exports.unzip = exports.dirStream = exports.adjustStaticPathForGlob = exports.dirTraversal = exports.watchDir = exports.readFileBusy = exports.isDirectory = void 0;
const promises_1 = __importStar(require("fs/promises"));
const misc_1 = require("./misc");
const util_1 = require("util");
const fs_1 = require("fs");
const path_1 = require("path");
const fast_glob_1 = __importDefault(require("fast-glob"));
const const_1 = require("./const");
const util_os_1 = require("./util-os");
const stream_1 = require("stream");
// @ts-ignore
const unzip_stream_1 = __importDefault(require("unzip-stream"));
// @ts-ignore
const fs_x_attributes_1 = __importDefault(require("fs-x-attributes"));
async function isDirectory(path) {
    try {
        return (await promises_1.default.stat(path)).isDirectory();
    }
    catch (_a) { }
}
exports.isDirectory = isDirectory;
async function readFileBusy(path) {
    return promises_1.default.readFile(path, 'utf8').catch(e => {
        if ((e === null || e === void 0 ? void 0 : e.code) !== 'EBUSY')
            throw e;
        console.debug('busy');
        return (0, misc_1.wait)(100).then(() => readFileBusy(path));
    });
}
exports.readFileBusy = readFileBusy;
function watchDir(dir, cb) {
    let watcher;
    let paused = false;
    try {
        watcher = (0, fs_1.watch)(dir, controlledCb);
    }
    catch (_a) {
        // failing watching the content of the dir, we try to monitor its parent, but filtering events only for our target dir
        const base = (0, path_1.basename)(dir);
        try {
            watcher = (0, fs_1.watch)((0, path_1.dirname)(dir), (event, name) => {
                if (name !== base)
                    return;
                try {
                    watcher.close(); // if we succeed, we give up the parent watching
                    watcher = (0, fs_1.watch)(dir, controlledCb); // attempt at passing to a more specific watching
                }
                catch (_a) { }
                controlledCb();
            });
        }
        catch (e) {
            console.debug(String(e));
        }
    }
    return {
        working() { return Boolean(watcher); },
        stop() { watcher === null || watcher === void 0 ? void 0 : watcher.close(); },
        pause() { paused = true; },
        unpause() { paused = false; },
    };
    function controlledCb() {
        if (!paused)
            cb();
    }
}
exports.watchDir = watchDir;
function dirTraversal(s) {
    return s && /(^|[/\\])\.\.($|[/\\])/.test(s);
}
exports.dirTraversal = dirTraversal;
// apply this to paths that may contain \ as separator (not supported by fast-glob) and other special chars to be escaped (parenthesis)
function adjustStaticPathForGlob(path) {
    return fast_glob_1.default.escapePath(path.replace(/\\/g, '/'));
}
exports.adjustStaticPathForGlob = adjustStaticPathForGlob;
async function* dirStream(path, { depth = 0, onlyFiles = false, onlyFolders = false } = {}) {
    if (!await isDirectory(path))
        throw Error('ENOTDIR');
    const dirStream = fast_glob_1.default.stream(depth ? '**/*' : '*', {
        cwd: path,
        dot: true,
        deep: depth + 1,
        onlyFiles,
        onlyDirectories: onlyFolders,
        suppressErrors: true,
        objectMode: true,
    });
    const skip = await getItemsToSkip(path);
    for await (const entry of dirStream) {
        let { path, dirent } = entry;
        const isDir = dirent.isDirectory();
        if (!isDir && !dirent.isFile())
            continue;
        path = String(path);
        if (!(skip === null || skip === void 0 ? void 0 : skip.includes(path)))
            yield [path, isDir];
    }
    async function getItemsToSkip(path) {
        if (!const_1.IS_WINDOWS)
            return;
        const winPath = path.replace(/\//g, '\\');
        const out = await (0, util_os_1.runCmd)('dir', ['/ah', '/b', depth ? '/s' : '/c', winPath]) // cannot pass '', so we pass /c as a noop parameter
            .catch(() => ''); // error in case of no matching file
        return out.split('\r\n').slice(0, -1).map(x => !depth ? x : x.slice(winPath.length + 1).replace(/\\/g, '/'));
    }
}
exports.dirStream = dirStream;
async function unzip(stream, cb) {
    let pending = Promise.resolve();
    return new Promise((resolve, reject) => stream.pipe(unzip_stream_1.default.Parse())
        .on('end', () => pending.then(resolve))
        .on('error', reject)
        .on('entry', (entry) => pending = pending.then(async () => {
        const { path, type } = entry;
        const dest = await (0, misc_1.try_)(() => cb(path), e => {
            console.warn(String(e));
            return false;
        });
        if (!dest || type !== 'File')
            return entry.autodrain();
        console.debug('unzip', dest);
        await prepareFolder(dest);
        const thisFile = entry.pipe((0, fs_1.createWriteStream)(dest).on('error', reject));
        await (0, stream_1.once)(thisFile, 'finish');
    })));
}
exports.unzip = unzip;
async function prepareFolder(path, dirnameIt = true) {
    if (dirnameIt)
        path = (0, path_1.dirname)(path);
    if ((0, misc_1.isWindowsDrive)(path))
        return;
    try {
        await promises_1.default.mkdir(path, { recursive: true });
        return true;
    }
    catch (_a) {
        return false;
    }
}
exports.prepareFolder = prepareFolder;
function createFileWithPath(path, options) {
    const folder = (0, path_1.dirname)(path);
    if (!(0, misc_1.isWindowsDrive)(folder))
        try {
            (0, fs_1.mkdirSync)(folder, { recursive: true });
        }
        catch (_a) {
            return;
        }
    return (0, fs_1.createWriteStream)(path, options);
}
exports.createFileWithPath = createFileWithPath;
function isValidFileName(name) {
    return !/[/*?<>|\\]/.test(name) && !dirTraversal(name);
}
exports.isValidFileName = isValidFileName;
const FILE_ATTR_PREFIX = 'user.hfs.'; // user. prefix to be linux compatible
function storeFileAttr(path, k, v) {
    return (0, util_1.promisify)(fs_x_attributes_1.default.set)(path, FILE_ATTR_PREFIX + k, JSON.stringify(v))
        .then(() => true, (e) => {
        console.error("couldn't store metadata on", path, String(e.message || e));
        return false;
    });
}
exports.storeFileAttr = storeFileAttr;
async function loadFileAttr(path, k) {
    var _a;
    return (_a = (0, misc_1.tryJson)(String(await (0, util_1.promisify)(fs_x_attributes_1.default.get)(path, FILE_ATTR_PREFIX + k)))) !== null && _a !== void 0 ? _a : undefined; // normalize, as we get null instead of undefined on windows
}
exports.loadFileAttr = loadFileAttr;
// read and parse a file, caching unless timestamp has changed
exports.parseFileCache = new Map();
async function parseFile(path, parse) {
    const { mtime: ts } = await (0, promises_1.stat)(path);
    const cached = exports.parseFileCache.get(path);
    if (cached && Number(ts) === Number(cached.ts))
        return cached.parsed;
    const raw = await (0, promises_1.readFile)(path);
    const parsed = parse(raw);
    exports.parseFileCache.set(path, { ts, parsed });
    return parsed;
}
exports.parseFile = parseFile;
