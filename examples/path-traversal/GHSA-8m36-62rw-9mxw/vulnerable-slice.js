#!/usr/bin/env node

var defaultPort = 5555,
    commander = require('commander'),
    program = new commander.Command()
      .name('mapshaper-gui')
      .usage('[options] [file ...]')
      .option('-p, --port <port>', 'http port of server on localhost', defaultPort)
      .option('-q, --quick-view', 'load files with default options, bypassing import dialog')
      .option('-s, --direct-save', 'save files outside the browser\'s download folder')
      .option('-f, --force-save', 'allow overwriting input files with output files')
      .option('-a, --display-all', 'turn on initial visibility of all layers')
      .option('-n, --name <name(s)>', 'rename input layer or layers')
      .option('-c, --commands <string>', 'console commands to run initially')
      .option('-t, --target <name>', 'name of layer to select initially')
      .addOption(new commander.Option('-b, --blurb <text>',
        'replace the default blurb on the import screen').hideHelp())
      .helpOption('-h, --help', 'show this help message')
      .version('0.6.43')
      .parse(process.argv),
    opts = program.opts(),
    http = require("http"),
    path = require("path"),
    url = require("url"),
    fs = require("fs"),
    Cookies = require("cookies"),
    opn = require("opn"),
    webRoot = path.join(__dirname, "../www"),
    port = parseInt(opts.port, 10) || defaultPort,
    dataFiles = expandShapefiles(program.args),
    probeCount = 0,
    sessionId = null;
validateFiles(dataFiles);

process.on('uncaughtException', function(err) {
  // added 'code' for Node.js v16
  if (err.errno === 'EADDRINUSE' || err.code === 'EADDRINUSE') {
    // probe for an open port, unless user has specified a non-default port
    if (port == defaultPort && probeCount < 10) {
      probeCount++;
      startServer(port + probeCount);
      return;
    }
    console.error("Port " + port + ' is in use (Run mapshaper-gui -h for help).');
  } else {
    console.error(err);
  }
  process.exit(1);
});

startServer(port);

function getRandomSessionId() {
  var str = Math.random().toString(16) + Math.random().toString(16);
  return str.replace(/0\./g, '').substr(0, 20);
}

function startServer(port) {
  var timeout;

  http.createServer(function(request, response) {
    var uri = url.parse(request.url).pathname;
    clearTimeout(timeout);
    if (uri == '/close') {
      // end process when page closes, unless page is immediately refreshed
      timeout = setTimeout(function() {
        process.exit(0);
      }, 200);
    } else if (uri == "/manifest.js") {
      if (!sessionId && opts.directSave) {
        // create a session id for authenticating requests to save files
        // (see saveContent())
        sessionId = getRandomSessionId();
        new Cookies(request, response).set('session_id', sessionId);
      }
      // serve JS file containing manifest of files for mapshaper to load
      serveContent(getManifestJS(dataFiles, opts), response, getMimeType(uri));
    } else if (uri.indexOf('/data/') === 0) {
      // serve a file from a path relative to this script
      // assumed to be a data file from the cmd line (!)
      serveFile(getDataFilePath(uri), response);
    } else if (uri.indexOf('/save') === 0) {
      saveContent(request, response);
    } else {
      // serve a file from the web root
      if (uri == '/') {
        uri = '/index.html';
      }
      serveFile(getAssetFilePath(uri), response);
    }
  }).listen(port, 'localhost', function() {
    opn("http://localhost:" + port);
  });
}

function getAssetFilePath(uri) {
  // allowing loading of assets from paths relative to the cwd (in addition to
  // the www/ directory of the mapshaper intall); this is useful
  // for displaying svg icons in the web ui; svg output then embeds the icons
  // in the output file.
  var webPath = path.join(webRoot, uri),
      relPath = path.join(process.cwd(), uri);
  return fs.existsSync(webPath) ? webPath : relPath;
}

function getDataFilePath(uri) {
  // tilde is added by the web ui; allows accessing a single level of parent
  // directory when loading data files (an attempt to add a bit of flexibility
  // without giving access to the entire filesystem)
  return decodeURI(uri).replace('/~/', '/../').replace('/data/', '');
}

function serveError(text, code, response) {
  response.writeHead(code, {"Content-Type": "text/plain"});
  response.write(text);
  response.end();
}

function serveFile(filename, response) {
  fs.readFile(filename, function(err, content) {
    if (err) {
      serveError("404 Not Found\n", 404, response);
    } else {
      serveContent(content, response, getMimeType(filename));
    }
  });
}

function serveContent(content, response, mimeType) {
  if (mimeType) {
    response.setHeader('Content-Type', mimeType);
  }
  response.setHeader('Cache-Control', 'no-cache');
  response.writeHead(200);
  response.write(content, "binary");
  response.end();
}

function readPostData(req, cb) {
  var buffers = [];
  if (req.method != 'POST') return cb('expected a post request');
  // TODO: consider quitting if a size limit is reached
  req.on('data', function(data) {buffers.push(data);});
  req.on('end', function () {
    cb(null, Buffer.concat(buffers));
  });
}

function findInputFile(ofile) {
  var matches = dataFiles.filter(function(ifile) {
    return path.parse(ifile).base == ofile;
  });
  return matches.length == 1 ? matches[0] : null;
}

function saveContent(req, res) {
  var requestId = new Cookies(req, res).get('session_id'),
      ip = req.connection.remoteAddress,
      urlData = url.parse(req.url),
      query = require('querystring').parse(urlData.query),
      file = query.file;

  if (opts.forceSave) {
    // match output file to input file (including original path to the input file)
    // otherwise, the output file will be saved to the cwd instead of replacing the
    // original file.
    file = findInputFile(file) || file;
  }

  // Only requests containing a cookie with the original session id are allowed to save.
  // This should limit direct saving to the user who is running mapshaper-gui,
  // preventing another user who has the URL of this Node service from saving.
  if (!sessionId || requestId != sessionId) return fail('invalid session id');
  if (ip != '::ffff:127.0.0.1' && ip != '::1' && ip != '127.0.0.1') return fail('saving is only allowed from localhost');
  if (err = validateOutputFile(file)) return fail(err);
  readPostData(req, function(err, buf) {
    if (err) return fail(err);
    if (!Buffer.isBuffer(buf)) return fail('malformed file content');
    try {
      fs.writeFileSync(file, buf);
    } catch(e) {
      return fail(e);
    }
    serveContent('File saved', res, 'text/plain');
  });

  function fail(err) {
    console.error('Unable to save ' + file + ":", err);
    serveError(err, 400, res);
  }
}

function validateOutputFile(file) {
  var relPath = path.relative('.', file);
  // TODO: remove path restrictions?
  if (relPath.indexOf('..') > -1) {
    return 'parent directories are blocked';
  }
  if (!opts.forceSave) {
    for (var i=0; i<dataFiles.length; i++) {
      if (!path.relative(file, dataFiles[i])) {
        return 'tried to overwrite a source file';
      }
    }
  }
  return '';
}

function getManifestJS(files, opts) {
  var o = {
    files: files,
    target: opts.target,
    allow_saving: opts.directSave,
    display_all: opts.displayAll,
    quick_view: opts.quickView,
    name: opts.name,
    commands: opts.commands,
    blurb: opts.blurb
  };
  return "mapshaper.manifest = " + JSON.stringify(o) + ";\n";
}

// print an error and exit if a file is unreadable
function validateFiles(files) {
  files.forEach(function(f) {
    var stat, msg;
    if (isUrl(f)) return;
    try {
      stat = fs.statSync(f);
      if (!stat.isFile()) {
        msg = 'Not a readable file';
      }
    } catch(e) {
      msg = 'File not found';
    }
    if (msg) {
      console.error(msg + ": " + f);
      process.exit(1);
    }
  });
}

// pull in auxiliary files along with .shp, if they exist
function expandShapefiles(files) {
  var shps = files.filter(function(f) {return extname(f).toLowerCase() == 'shp';});
  shps.forEach(function(f) {
    if (isUrl(f)) return; // TODO: try to load aux files from URLs
    addAuxFile(files, f, '.dbf');
    addAuxFile(files, f, '.prj');
    addAuxFile(files, f, '.shx');
    addAuxFile(files, f, '.cpg');
  });
  return files;
}

function getMimeType(filename) {
  return {
    css: 'text/css',
    js: 'application/javascript',
    html: 'text/html',
    png: 'image/png',
    svg: 'image/svg+xml'
  }[extname(filename)] || null;
}

function extname(filename) {
  return path.extname(filename).replace('.', '');
}

function isUrl(name) {
  return /:\/\//.test(name);
}

function containsStringCI(arr, str) {
  str = str.toLowerCase();
  for (var i=0; i<arr.length; i++) {
    if (arr[i].toLowerCase() == str) return true;
  }
  return false;
}

// append auxiliary file, if it exists in the filesystem but not in the file list
function addAuxFile(files, file, ext) {
  var extRx = /\.[^.]+$/;
  // handle UC and LC extensions
  // TODO: match any combination of UC and LC characters in filename
  var aux = file.replace(extRx, ext.toLowerCase());
  var AUX = file.replace(extRx, ext.toUpperCase());
  if (!containsStringCI(files, aux)) {
    if (fs.existsSync(aux)) {
      files.push(aux);
    } else if (fs.existsSync(AUX)) {
      files.push(AUX);
    }
  }
}

