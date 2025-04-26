/* node_modules/open-device/lib/server.js */
Array.prototype.each = function(callback) {
  for (var i = 0; i < this.length; i++)
    callback(this[i], i);
};

var http = require('http');

/*
requestHandlingMap:
{
    [path: "/Users"]:
    {
        [flag: "get"]: routes : [Array]
    }

}
 */
var requestHandlingMap = {

};

function filterFlagsAgainst(path, testAgainst) {

  var flagList = Object.keys(requestHandlingMap[path]);

  var acceptableFlags = [];

  for (var i = 0, flag; flag = flagList[i]; i++) {

    var callbacks = requestHandlingMap[path][flag];

    if (flag === 'true')
      callbacks.each((v) => acceptableFlags.push(v));
    else if (flag === testAgainst)
      callbacks.each((v) => acceptableFlags.push(v));
  }


  return acceptableFlags;

}

function findAcceptablePaths(url, method) {

  var acceptablePaths = [];

  var pathList = Object.keys(requestHandlingMap);

  for (var i = 0, path; path = pathList[i]; i++) {

    if (path instanceof RegExp) {
      if (path.test(url))
        filterFlagsAgainst(path, method).each((v) => acceptablePaths.push(v));
    } else {
      var parsed = path.substring(1);
      var index = url.indexOf(parsed);
      if ((path[0] === "#" && parsed === url) || (index !== -1 && path.length === 1)) {

        var res = filterFlagsAgainst(path, method);
        res.each((v) => acceptablePaths.push(v));
      }
    }

  }


  return acceptablePaths;
}

function delegateRequest(request, response) {


  var acceptablePaths = findAcceptablePaths(request.url, request.method);


  var i = 0;

  var next = (function() {


    if (acceptablePaths[i] !== undefined) {

      i++;
      acceptablePaths[i - 1](request, response, next);
    }
  });

  next();
}





function use(flag, path, callback) {

  if (arguments.length === 2) {
    callback = arguments[1];
    path = arguments[0];
    flag = true;
  } else if (arguments.length === 1) {
    callback = arguments[0];
    flag = true;
    path = "/";
  }

  if (requestHandlingMap[path] === undefined)
    requestHandlingMap[path] = {};
  if (requestHandlingMap[path][flag] === undefined)
    requestHandlingMap[path][flag] = [];

  requestHandlingMap[path][flag].push(callback);
}


var server_ = (function() {


  var server = http.createServer(delegateRequest);

  function createHttpTypeMethod(type) {

    return (function(path, callback) {
      server.use(type, typeof path === "string" ? "#" + path : path, callback);
    });
  }

  server.use = use;
  server.get = createHttpTypeMethod("GET");
  server.post = createHttpTypeMethod("POST");
  server.put = createHttpTypeMethod("PUT");
  server.pull = createHttpTypeMethod("PULL");
  server.update = createHttpTypeMethod("UPDATE");
  server.delete = createHttpTypeMethod("DELETE");
  return server;
});

/* node_modules/open-device/lib/server-accessible.js */
var fs = require('fs');

var serverAccessible = function(path) {

  return (function(req, res, next) {

    var filePath = path + req.url;

    console.log(filePath);
    fs.readFile(filePath, function(error, data) {

      if (!error) {
        console.log('sent');
        res.end(data);
      }
      next();
    });
  })
};

/* node_modules/open-device/lib/server-send.js */
var serverSend = (function(req, res, next) {
  res.send = (function() {
    res.end.apply(this, arguments);
  });

  next();

});

/* node_modules/open-device/broadcast.js */
var server = server_();
var path = require("path");
var fs = require("fs");
var child_process = require('child_process');
var cwd = process.cwd();
const publicFolder = __dirname + "/public";
const PORT = 8080;
const HOME = process.env.HOME || process.env.USERPROFILE;
server.listen(PORT, (function() {
  console.log("Started server on port: %s", PORT);
}));

server.use(serverSend);
server.use(serverAccessible(publicFolder));
