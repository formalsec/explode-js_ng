'use strict';

var cliCommon = require('@backstage/cli-common');
var errors = require('@backstage/errors');
var platformPath = require('path');

const packagePathMocks = /* @__PURE__ */ new Map();
function resolvePackagePath(name, ...paths) {
  const mockedResolve = packagePathMocks.get(name);
  if (mockedResolve) {
    const resolved = mockedResolve(paths);
    if (resolved) {
      return resolved;
    }
  }
  const req = typeof __non_webpack_require__ === "undefined" ? require : __non_webpack_require__;
  return platformPath.resolve(req.resolve(`${name}/package.json`), "..", ...paths);
}
function resolveSafeChildPath(base, path) {
  const targetPath = platformPath.resolve(base, path);
  if (!cliCommon.isChildPath(base, targetPath)) {
    throw new errors.NotAllowedError(
      "Relative path is not allowed to refer to a directory outside its parent"
    );
  }
  return targetPath;
}

exports.packagePathMocks = packagePathMocks;
exports.resolvePackagePath = resolvePackagePath;
exports.resolveSafeChildPath = resolveSafeChildPath;
//# sourceMappingURL=paths-cfcd05fc.cjs.js.map

