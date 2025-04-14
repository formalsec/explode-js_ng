"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultLoaders = void 0;
const path = require("path");
const fs = require("fs");
const os = require("os");

const jsonLoader = (_, content) => JSON.parse(content);

const dynamicImport = async (id) => {
    try {
        const mod = await eval(`import('${id}')`);
        return mod.default;
    }
    catch (e) {
        try {
            return require(id);
        }
        catch (requireE) {
            if (requireE.code === 'ERR_REQUIRE_ESM' ||
                (requireE instanceof SyntaxError &&
                    requireE
                        .toString()
                        .includes('Cannot use import statement outside a module'))) {
                throw e;
            }
            throw requireE;
        }
    }
};
exports.defaultLoaders = Object.freeze({
    '.js': dynamicImport,
    '.mjs': dynamicImport,
    '.cjs': dynamicImport,
    '.json': jsonLoader,
    noExt: jsonLoader,
});

