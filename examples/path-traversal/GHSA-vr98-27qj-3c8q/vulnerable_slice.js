/* node_modules/rollup-plugin-serve/dist/index.cjs.js */
function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = require('fs');
var https = require('https');
var http = require('http');
var path = require('path');
var mime = _interopDefault(require('mime'));
var opener = _interopDefault(require('opener'));

function serve(options) {
  if ( options === void 0 ) options = { contentBase: '' };

  if (Array.isArray(options) || typeof options === 'string') {
    options = { contentBase: options };
  }
  options.contentBase = Array.isArray(options.contentBase) ? options.contentBase : [options.contentBase];
  options.host = options.host || 'localhost';
  options.port = options.port || 10001;
  options.headers = options.headers || {};
  options.https = options.https || false;
  mime.default_type = 'text/plain';

  var requestListener = function (request, response) {
    // Remove querystring
    var urlPath = decodeURI(request.url.split('?')[0]);

    Object.keys(options.headers).forEach(function (key) {
      response.setHeader(key, options.headers[key]);
    });

    // support cors request
    if (options.allowCrossOrigin) {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Request-Method', '*');
      response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
      response.setHeader('Access-Control-Allow-Headers', '*');

      if (request.method === 'OPTIONS' ) {
        response.writeHead(200);
        response.end();
        return;
      }
    }

    readFileFromContentBase(options.contentBase, urlPath, function (error, content, filePath) {
      if (!error) {
        if (hasRange(request)) {
          return serveWithRanges(request, response, content)
        }
        return found(response, filePath, content)
      }
      if (error.code !== 'ENOENT') {
        response.writeHead(500);
        response.end('500 Internal Server Error' +
          '\n\n' + filePath +
          '\n\n' + Object.keys(error).map(function (k) {
            return error[k]
          }).join('\n') +
          '\n\n(rollup-plugin-serve)', 'utf-8');
        return
      }
      if (request.url === '/favicon.ico') {
        filePath = path.resolve(__dirname, '../dist/favicon.ico');
        fs.readFile(filePath, function (error, content) {
          if (error) {
            notFound(response, filePath);
          } else {
            found(response, filePath, content);
          }
        });
      } else if (options.historyApiFallback) {
        readFileFromContentBase(options.contentBase, '/index.html', function (error, content, filePath) {
          if (error) {
            notFound(response, filePath);
          } else {
            found(response, filePath, content);
          }
        });
      } else {
        notFound(response, filePath);
      }
    });
  };

  // If HTTPS options are available, create an HTTPS server
  var server;
  if (options.https) {
    server = https.createServer(options.https, requestListener).listen(options.port);
  } else {
    server = http.createServer(requestListener).listen(options.port);
  }

  closeServerOnTermination(server);

  var running = options.verbose === false;

  return {
    name: 'serve',
    ongenerate: function ongenerate() {
      if (!running) {
        running = true;

        // Log which url to visit
        var url = (options.https ? 'https' : 'http') + '://' + options.host + ':' + options.port;
        options.contentBase.forEach(function (base) {
          console.log(green(url) + ' -> ' + path.resolve(base));
        });

        // Open browser
        if (options.open) {
          opener(url);
        }
      }
    }
  }
}

function readFileFromContentBase(contentBase, urlPath, callback) {
  var filePath = path.resolve(contentBase[0] || '.', '.' + urlPath);

  // Load index.html in directories
  if (urlPath.endsWith('/')) {
    filePath = path.resolve(filePath, 'index.html');
  }

  fs.readFile(filePath, function (error, content) {
    if (error && contentBase.length > 1) {
      // Try to read from next contentBase
      readFileFromContentBase(contentBase.slice(1), urlPath, callback);
    } else {
      // We know enough
      callback(error, content, filePath);
    }
  });
}

function found(response, filePath, content) {
  response.writeHead(200, { 'Content-Type': mime.lookup(filePath) });
  response.end(content, 'utf-8');
}

function hasRange(request) {
  var range = request.headers.range || '';
  var parts = range.replace(/bytes=/, "").split("-");
  var partialstart = parts[0];
  var partialend = parts[1];
  return partialstart && partialend
}

function closeServerOnTermination(server) {
  var terminationSignals = ['SIGINT', 'SIGTERM'];
  terminationSignals.forEach(function (signal) {
    process.on(signal, function () {
      server.close();
      process.exit();
    });
  });
}



/* App driver */
serve({
  host: "localhost",
  port: 10001,
});
