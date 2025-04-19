"use strict";
// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpStream = exports.httpWithBody = exports.httpString = exports.stream2string = void 0;
const node_https_1 = __importDefault(require("node:https"));
const node_http_1 = __importDefault(require("node:http"));
const node_stream_1 = require("node:stream");
const lodash_1 = __importDefault(require("lodash"));
const consumers_1 = require("node:stream/consumers");
Object.defineProperty(exports, "stream2string", { enumerable: true, get: function () { return consumers_1.text; } });
async function httpString(url, options) {
    return await (0, consumers_1.text)(await httpStream(url, options));
}
exports.httpString = httpString;
async function httpWithBody(url, options) {
    const req = await httpStream(url, options);
    return Object.assign(req, {
        ok: lodash_1.default.inRange(req.statusCode, 200, 300),
        body: req.statusCode ? await (0, consumers_1.buffer)(req) : undefined,
    });
}
exports.httpWithBody = httpWithBody;
function httpStream(url, { body, jar, noRedirect, httpThrow, ...options } = {}) {
    return new Promise((resolve, reject) => {
        var _a, _b;
        var _c;
        (_a = options.headers) !== null && _a !== void 0 ? _a : (options.headers = {});
        if (body) {
            options.method || (options.method = 'POST');
            if (!(body instanceof node_stream_1.Readable))
                (_b = (_c = options.headers)['Content-Length']) !== null && _b !== void 0 ? _b : (_c['Content-Length'] = Buffer.byteLength(body));
        }
        if (jar)
            options.headers.cookie = lodash_1.default.map(jar, (v, k) => `${k}=${v}; `).join('')
                + (options.headers.cookie || ''); // preserve parameter
        const proto = url.startsWith('https:') ? node_https_1.default : node_http_1.default;
        const req = proto.request(url, options, res => {
            console.debug("http responded", res.statusCode, "to", url);
            if (jar)
                for (const entry of res.headers['set-cookie'] || []) {
                    const [, k, v] = /(.+?)=([^;]+)/.exec(entry) || [];
                    if (!k)
                        continue;
                    if (v)
                        jar[k] = v;
                    else
                        delete jar[k];
                }
            if (!res.statusCode || (httpThrow !== null && httpThrow !== void 0 ? httpThrow : true) && res.statusCode >= 400)
                return reject(new Error(String(res.statusCode), { cause: res }));
            if (res.headers.location && !noRedirect)
                return resolve(httpStream(res.headers.location, options));
            resolve(res);
        }).on('error', e => {
            reject(req.res || e);
        });
        if (body && body instanceof node_stream_1.Readable)
            body.pipe(req).on('end', () => req.end());
        else
            req.end(body);
    });
}
exports.httpStream = httpStream;
