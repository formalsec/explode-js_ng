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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIME_AUTO = exports.APP_PATH = exports.IS_BINARY = exports.IS_MAC = exports.IS_WINDOWS = exports.HFS_REPO_BRANCH = exports.RUNNING_BETA = exports.VERSION = exports.BUILD_TIMESTAMP = exports.HFS_STARTED = exports.ORIGINAL_CWD = exports.DEV = exports.argv = exports.HFS_REPO = exports.COMPATIBLE_API_VERSION = exports.API_VERSION = void 0;
const minimist_1 = __importDefault(require("minimist"));
const fs = __importStar(require("fs"));
const os_1 = require("os");
const fs_1 = require("fs");
const path_1 = require("path");
__exportStar(require("./cross-const"), exports);
exports.API_VERSION = 8.72;
exports.COMPATIBLE_API_VERSION = 1; // while changes in the api are not breaking, this number stays the same, otherwise it is made equal to API_VERSION
exports.HFS_REPO = 'rejetto/hfs';
exports.argv = (0, minimist_1.default)(process.argv.slice(2));
exports.DEV = process.env.DEV || exports.argv.dev ? 'DEV' : '';
exports.ORIGINAL_CWD = process.cwd();
exports.HFS_STARTED = new Date();
const PKG_PATH = (0, path_1.join)(__dirname, '..', 'package.json');
exports.BUILD_TIMESTAMP = "2024-06-11T12:54:37.285Z";
const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
exports.VERSION = pkg.version;
exports.RUNNING_BETA = exports.VERSION.includes('-');
exports.HFS_REPO_BRANCH = exports.RUNNING_BETA ? exports.VERSION.split('.')[1] : 'main';
exports.IS_WINDOWS = process.platform === 'win32';
exports.IS_MAC = process.platform === 'darwin';
exports.IS_BINARY = !(0, path_1.basename)(process.execPath).includes('node'); // this won't be node if pkg was used
exports.APP_PATH = (0, path_1.dirname)(exports.IS_BINARY ? process.execPath : __dirname);
exports.MIME_AUTO = 'auto';
// we want this to be the first stuff to be printed, then we print it in this module, that is executed at the beginning
if (exports.DEV)
    console.clear();
else
    console.debug = () => { };
console.log(`HFS ~ HTTP File Server`);
console.log(`© Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt`);
console.log('started', exports.HFS_STARTED.toLocaleString(), exports.DEV);
console.log('version', exports.VERSION || '-');
console.log('build', exports.BUILD_TIMESTAMP || '-');
const winExe = exports.IS_WINDOWS && process.execPath.match(/(?<!node)\.exe$/i);
if (exports.argv.cwd)
    process.chdir(exports.argv.cwd);
else if (!winExe) { // still considering whether to use this behavior with Windows users, who may be less accustomed to it
    const dir = (0, path_1.join)((0, os_1.homedir)(), '.hfs');
    try {
        (0, fs_1.mkdirSync)(dir);
    }
    catch (e) {
        if (e.code !== 'EEXIST')
            console.error(e);
    }
    process.chdir(dir);
}
console.log('cwd', process.cwd());
console.log('node', process.version);
console.log('platform', process.platform);
console.log('pid', process.pid);
