/* node_modules/node-srv/lib/server.js */
var Server, _, fs, http, mime, minimatch, path, pkg, url;

pkg = { name : "node-srv", version : "latest" };

fs = require('fs');

_ = require('underscore');

mime = require('mime');

http = require('http');

url = require('url');

path = require('path');

minimatch = require('minimatch');

Server = (function() {
  Server.prototype.name = pkg.name;

  Server.prototype.version = pkg.version;

  Server.prototype.defaults = function() {
    return {
      port: 8000,
      host: '0.0.0.0',
      logs: false,
      index: 'index.html'
    };
  };

  function Server(options, exitCallback) {
    if (options == null) {
      options = {};
    }
    this.exitCallback = exitCallback;
    this.options = _.extend(this.defaults(), options);
    this._initLogs();
    this._bindCloseEvents();
    this.start();
  }

  Server.prototype.start = function() {
    return this.server = http.createServer(_.bind(this.request, this)).listen(Number(this.options.port), this.options.host);
  };

  Server.prototype.stop = function(callback) {
    var ref, ref1;
    if ((ref = this.server) != null) {
      ref.close();
    }
    if ((ref1 = this._loger) != null) {
      ref1.end();
    }
    if (typeof this.exitCallback === "function") {
      this.exitCallback();
    }
    return typeof callback === "function" ? callback() : void 0;
  };

  Server.prototype._bindCloseEvents = function() {
    var exit;
    exit = (function(_this) {
      return function() {
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        return _this.stop(function() {
          return process.exit();
        });
      };
    })(this);
    process.on('SIGINT', exit);
    return process.on('SIGTERM', exit);
  };

  Server.prototype._initLogs = function() {
    if (this.options.logs) {
      if (typeof this.options.logs === 'string') {
        return this._logger = fs.createWriteStream(this.options.logs, {
          flags: 'a'
        });
      } else {
        return this._log = console.log;
      }
    }
  };

  Server.prototype.request = function(req, res) {
    var filePath, time;
    time = new Date();
    filePath = null;
    return new Promise((function(_this) {
      return function(resolve, reject) {
        var uri;
        uri = url.parse(req.url);
        return resolve(uri.pathname);
      };
    })(this)).then((function(_this) {
      return function(pathname) {
        filePath = pathname;
        filePath = filePath.replace(/\/$/, "/" + _this.options.index);
        filePath = filePath.replace(/^\//, "");
        filePath = path.resolve(process.cwd(), _this.options.root || './', filePath);
        return _this.processRequest(res, filePath);
      };
    })(this), (function(_this) {
      return function(err) {
        return _this.errorCode(res, 400, "Message: " + err.message + "\nURL: " + req.url + "\n\n" + err.stack);
      };
    })(this))["catch"]((function(_this) {
      return function(err) {
        if (err.code === 'ENOENT') {
          return _this.handlerNotFound(res, err.path);
        } else {
          _this.log("[" + (time.toJSON()) + "] Error: " + err.message + ", Code: " + err.code);
          return _this.errorCode(res, 500, "Message: " + err.message + "\nCode: " + err.code + "\n\n" + err.stack);
        }
      };
    })(this))["catch"]((function(_this) {
      return function(err) {
        _this.log("[" + (time.toJSON()) + "] Error: " + err.message);
        return _this.errorCode(res, 500, "Message: " + err.message + "\nCode: " + err.code + "\n\n" + err.stack);
      };
    })(this)).then((function(_this) {
      return function(code) {
        var host, log;
        host = path.join(req.headers.host || 'localhost:' + _this.options.port, req.url);
        log = "[" + (time.toJSON()) + "]";
        log += " (+" + (Date.now() - time) + "ms):";
        log += " " + code;
        log += " " + host;
        if (filePath) {
          log += " - " + filePath;
        }
        if (req.headers['user-agent']) {
          log += " (" + req.headers['user-agent'] + ")";
        }
        return _this.log(log);
      };
    })(this));
  };

  Server.prototype.getHeaders = function(filePath) {
    var headers;
    headers = {
      "Server": this.name + "/" + this.version
    };
    if (filePath) {
      headers["Content-Type"] = mime.lookup(filePath);
    }
    return headers;
  };

  Server.prototype.processRequest = function(res, filePath) {
    var handler;
    if (handler = this.handle(filePath)) {
      return handler.call(this(res, filePath));
    } else {
      return this.handlerStaticFile(res, filePath);
    }
  };

  Server.prototype.handle = function(filePath) {
    var handlers, pattern;
    handlers = _.result(this, 'handlers');
    for (pattern in handlers) {
      if (minimatch(filePath, pattern)) {
        return handlers[pattern];
      }
    }
    return null;
  };

  Server.prototype.handlers = function() {
    return {};
  };

  Server.prototype.handlerStaticFile = function(res, filePath) {
    var server;
    server = this;
    return new Promise(function(resolve, reject) {
      return fs.createReadStream(filePath).on('open', function() {
        return res.writeHead(200, server.getHeaders(filePath));
      }).on('error', function(err) {
        return reject(err);
      }).on('data', function(data) {
        return res.write(data);
      }).on('end', function() {
        res.end();
        return resolve(200);
      });
    });
  };

  Server.prototype.handlerNotFound = function(res, filePath) {
    var errorPath, notFound;
    notFound = (function(_this) {
      return function() {
        return _this.errorCode(res, 404, "Path: " + filePath);
      };
    })(this);
    if (!this.options['404']) {
      return notFound();
    }
    errorPath = path.resolve(process.cwd(), this.options['404']);
    return new Promise((function(_this) {
      return function(resolve, reject) {
        return fs.createReadStream(errorPath).on('open', function() {
          return res.writeHead(404, _.extend(this.getHeaders(), {
            "Content-Type": "text/html"
          }));
        }).on('error', function(err) {
          return reject(err);
        }).on('data', function(data) {
          return res.write(data);
        }).on('end', function() {
          res.end();
          return resolve(404);
        });
      };
    })(this));
  };

  Server.prototype.errorCode = function(res, code, text) {
    if (text == null) {
      text = '';
    }
    if (text) {
      text = "<pre>" + text + "</pre>";
    }
    res.writeHead(code, _.extend(this.getHeaders(), {
      "Content-Type": "text/html"
    }));
    res.write(("<h1>" + code + " " + http.STATUS_CODES[code] + "</h1>") + text);
    res.end();
    return code;
  };

  Server.prototype.log = function(string) {
    var ref;
    if ((ref = this._logger) != null) {
      ref.write(string + '\n');
    }
    return typeof this._log === "function" ? this._log(string) : void 0;
  };

  return Server;

})();

/* App driver */
let srv = new Server(
  {
    port: 8081,
    root: "./",
    logs: true,
  },
  function () {}
);

// srv.stop();
