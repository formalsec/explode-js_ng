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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiAssertTypes = exports.AsapStream = exports.asyncGeneratorToReadable = exports.same = exports.makeNetMatcher = exports.isLocalHost = exports.onOff = exports.pattern2filter = exports.onFirstEvent = exports.onProcessExit = void 0;
const path_1 = require("path");
const assert_1 = __importDefault(require("assert"));
__exportStar(require("./util-http"), exports);
__exportStar(require("./util-files"), exports);
__exportStar(require("./cross"), exports);
__exportStar(require("./debounceAsync"), exports);
const stream_1 = require("stream");
const node_net_1 = require("node:net");
const apiMiddleware_1 = require("./apiMiddleware");
const const_1 = require("./const");
const cross_1 = require("./cross");
const net_1 = require("net");
const cbs = new Set();
function onProcessExit(cb) {
    cbs.add(cb);
    return () => cbs.delete(cb);
}
exports.onProcessExit = onProcessExit;
onFirstEvent(process, ['exit', 'SIGQUIT', 'SIGTERM', 'SIGINT', 'SIGHUP'], signal => Promise.allSettled(Array.from(cbs).map(cb => cb(signal))).then(() => process.exit(0)));
function onFirstEvent(emitter, events, cb) {
    let already = false;
    for (const e of events)
        emitter.once(e, (...args) => {
            if (already)
                return;
            already = true;
            cb(...args);
        });
}
exports.onFirstEvent = onFirstEvent;
function pattern2filter(pattern) {
    const matcher = (0, cross_1.makeMatcher)(pattern.includes('*') ? pattern // if you specify *, we'll respect its position
        : pattern.split('|').map(x => `*${x}*`).join('|'));
    return (s) => !s || !pattern || matcher((0, path_1.basename)(s));
}
exports.pattern2filter = pattern2filter;
// install multiple handlers and returns a handy 'uninstall' function which requires no parameter. Pass a map {event:handler}
function onOff(em, events) {
    events = { ...events }; // avoid later modifications, as we need this later for uninstallation
    for (const [k, cb] of Object.entries(events))
        for (const e of k.split(' '))
            em.on(e, cb);
    return () => {
        for (const [k, cb] of Object.entries(events))
            for (const e of k.split(' '))
                em.off(e, cb);
    };
}
exports.onOff = onOff;
function isLocalHost(c) {
    const ip = typeof c === 'string' ? c : c.socket.remoteAddress; // don't use Context.ip as it is subject to proxied ips, and that's no use for localhost detection
    return ip && (0, cross_1.isIpLocalHost)(ip);
}
exports.isLocalHost = isLocalHost;
function makeNetMatcher(mask, emptyMaskReturns = false) {
    var _a;
    if (!mask)
        return () => emptyMaskReturns;
    if (!mask.includes('/'))
        return (0, cross_1.makeMatcher)(mask);
    const all = mask.split('|');
    const neg = ((_a = all[0]) === null || _a === void 0 ? void 0 : _a[0]) === '!';
    if (neg)
        all[0] = all[0].slice(1);
    const bl = new node_net_1.BlockList();
    for (const x of all) {
        const m = /^([.:\da-f]+)(?:\/(\d+)|-(.+)|)$/i.exec(x);
        if (!m) {
            console.warn("error in network mask", x);
            continue;
        }
        const address = parseAddress(m[1]);
        if (m[2])
            bl.addSubnet(address, Number(m[2]));
        else if (m[3])
            bl.addRange(address, parseAddress(m[2]));
        else
            bl.addAddress(address);
    }
    return (ip) => neg !== bl.check(parseAddress(ip));
}
exports.makeNetMatcher = makeNetMatcher;
function parseAddress(s) {
    return new node_net_1.SocketAddress({ address: s, family: (0, net_1.isIPv6)(s) ? 'ipv6' : 'ipv4' });
}
function same(a, b) {
    try {
        assert_1.default.deepStrictEqual(a, b);
        return true;
    }
    catch (_a) {
        return false;
    }
}
exports.same = same;
function asyncGeneratorToReadable(generator) {
    const iterator = generator[Symbol.asyncIterator]();
    return new stream_1.Readable({
        objectMode: true,
        destroy() {
            var _a;
            (_a = iterator.return) === null || _a === void 0 ? void 0 : _a.call(iterator);
        },
        read() {
            iterator.next().then(it => this.push(it.done ? null : it.value));
        }
    });
}
exports.asyncGeneratorToReadable = asyncGeneratorToReadable;
// produces as promises resolve, not sequentially
class AsapStream extends stream_1.Readable {
    constructor(promises) {
        super({ objectMode: true });
        this.promises = promises;
        this.finished = false;
    }
    _read() {
        if (this.finished)
            return;
        this.finished = true;
        for (const p of this.promises)
            p.then(x => x !== undefined && this.push(x), e => this.emit('error', e));
        Promise.allSettled(this.promises).then(() => this.push(null));
    }
}
exports.AsapStream = AsapStream;
function apiAssertTypes(paramsByType) {
    for (const [types, params] of Object.entries(paramsByType))
        for (const type of types.split('_'))
            for (const [name, val] of Object.entries(params))
                if (type === 'array' ? !Array.isArray(val) : typeof val !== type)
                    throw new apiMiddleware_1.ApiError(const_1.HTTP_BAD_REQUEST, 'bad ' + name);
}
exports.apiAssertTypes = apiAssertTypes;
