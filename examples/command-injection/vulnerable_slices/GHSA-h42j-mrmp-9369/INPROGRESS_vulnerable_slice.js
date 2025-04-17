"use strict";

var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};

Object.defineProperty(exports, "__esModule", {
  value: true
});

var execa_1 = __importDefault(require("execa"));

//var is_git_repository_1 = __importDefault(require("is-git-repository"));

var path_1 = __importDefault(require("path"));

var regex = /\s+([\s\S]*)/g; // matches everything after the first whitespace

var gitCommitInfo =async function (options) {
  var _a, _b, _c, _d;

  if (options === void 0) {
    options = {};
  }

  var _e = options.cwd,
      cwd = _e === void 0 ? process.cwd() : _e,
      commit = options.commit;
  var thisCommit = commit || '';
  var thisPath = path_1.default.resolve(cwd);
  const { default: is_git_repository_1 } = await import('is-git-repository');
  if (!is_git_repository_1(thisPath)) {
    return {};
  }

  try {
    console.log("[execa.commandSync] Running:", "git --no-pager show " + thisCommit + " --summary");
    var stdout = execa_1.default.commandSync("git --no-pager show " + thisCommit + " --summary", {
      cwd: cwd
    }).stdout;
    var info_1 = stdout.split('\n').filter(function (entry) {
      return entry.length !== 0;
    });
    var mergeIndex = ((_a = info_1[1]) === null || _a === void 0 ? void 0 : _a.indexOf('Merge')) === -1 ? 0 : 1;
    var hash = (new RegExp(regex).exec(info_1[0]) || [])[1];
    var shortHash = hash.slice(0, 7);

    var getInfo = function (index) {
      var _a = new RegExp(regex).exec(info_1[index]) || [],
          extractedInfo = _a[1];

      return extractedInfo;
    };

    var author = (_c = (((_b = getInfo(1 + mergeIndex)) === null || _b === void 0 ? void 0 : _b.match(/([^<]+)/)) || [])[1]) === null || _c === void 0 ? void 0 : _c.trim();

    var _f = ((_d = getInfo(1 + mergeIndex)) === null || _d === void 0 ? void 0 : _d.match(/<([^>]+)>/)) || [],
        email = _f[1];

    var date = getInfo(2 + mergeIndex);
    var message = stdout.split('\n\n')[1].trim();
    return {
      hash: hash,
      shortHash: shortHash,
      commit: hash,
      shortCommit: shortHash,
      author: author,
      email: email,
      date: date,
      message: message
    };
  } catch (error) {
    return {
      error: error
    };
  }
};

exports.default = gitCommitInfo;
module.exports = exports.default;
