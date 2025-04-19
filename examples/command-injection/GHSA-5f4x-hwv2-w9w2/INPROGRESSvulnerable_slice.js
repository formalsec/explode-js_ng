"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNNING_AS_SERVICE = exports.runCmd = exports.getDrives = exports.getDiskSpaces = exports.getDiskSpaceSync = void 0;
const path_1 = require("path");
const fs_1 = require("fs");
const child_process_1 = require("child_process");
const misc_1 = require("./misc");
const lodash_1 = __importDefault(require("lodash"));
const node_process_1 = require("node:process");
const util_1 = require("util");
const const_1 = require("./const");
function getDiskSpaceSync(path) {
    if (const_1.IS_WINDOWS) {
        const drive = (0, path_1.resolve)(path).slice(0, 2).toUpperCase();
        const out = (0, child_process_1.execSync)('wmic logicaldisk get Size,FreeSpace,Name /format:list').toString().replace(/\r/g, '');
        const one = parseKeyValueObjects(out).find(x => x.Name === drive);
        if (!one)
            throw Error('miss');
        return { free: Number(one.FreeSpace), total: Number(one.Size) };
    }
    while (path && !(0, fs_1.existsSync)(path))
        path = (0, path_1.dirname)(path);
    const out = (0, misc_1.try_)(() => (0, child_process_1.execSync)(`df -k "${path}"`).toString(), err => { throw err.status === 1 ? Error('miss') : err.status === 127 ? Error('unsupported') : err; });
    if (!(out === null || out === void 0 ? void 0 : out.startsWith('Filesystem')))
        throw Error('unsupported');
    const one = out.split('\n')[1];
    const [used, free] = one.split(/\s+/).slice(2, 4).map(x => Number(x) * 1024);
    return { free, total: used + free };
}
exports.getDiskSpaceSync = getDiskSpaceSync;

