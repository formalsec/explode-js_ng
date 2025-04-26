/* node_modules/m-server/lib/utils.js */
var os = require('os');

var utils = {};

utils.getIP = function () {
    var network = os.networkInterfaces();
    var list = [];
    for (var p in network) {
        if (network.hasOwnProperty(p)) {
            network[p].forEach(function (val) {
                if (val.family == 'IPv4') {
                    list.push(val.address);
                }
            })
        }
    }
    return list;
}

utils.parseArg = function (envOption) {
    var argv = process.argv;
    argv && argv.forEach(function (val, ind) {
        if (val === '-p') {
            var port = parseInt(argv[ind + 1]);
            if (port && port > 0) {
                envOption.port = port;
            }
        }
    });
    return envOption;
}

function sort(a, b) {
    var a1 = a.toLocaleLowerCase()
    var b1 = b.toLocaleLowerCase();
    if (a1 < b1) {
        return -1;
    } else if (a1 > b1) {
        return 1
    } else {
        return 0;
    }
}
utils.sort = sort;

utils.render = function (path, dirs, files) {
    var html = [];
    var parentPath;
    html.push("<h1>" + path + "</h1>");
    html.push('<ul>');
    if (path !== '/') {
        parentPath = path.split('/').slice(0, -1).join('/');
        if (parentPath == '') {
            parentPath = '/';
        }
        html.push('<li><a href="' + parentPath + '">../</a><li>');
    } else {
        path = "";
    }
    dirs.sort(sort).forEach(function (val) {
        html.push('<li><a href="' + path + '/' + val + '">' + val + '</a></li>');
    });
    files.sort(sort).forEach(function (val) {
        html.push('<li><a download href="' + path + '/' + val + '">' + val + '</a></li>');
    });
    html.push('</ul>');
    return html.join('');
}
function assignObject(target) {
    for (var t = 1; t < arguments.length; t++) {
        var n = arguments[t];
        for (var a in n){
            Object.prototype.hasOwnProperty.call(n, a) && (target[a] = n[a])
        }
    }
    return target;
}

utils.assign = function (target) {
    if (Object.assign) {
        return Object.assign.apply(null, arguments);
    } else {
        assignObject.apply(null, arguments)
    }
}

/* node_modules/m-server/lib/index.js */
var http = require('http');
var fs = require('fs');
var rootPath = process.cwd();
var path = require('path');

let index_ = {};

function HttpServer(option) {
    var server = http.createServer(function (req, res) {
        var targetPath = path.join(rootPath, req.url);
        if (fs.existsSync(targetPath)) {
            var targetType = fs.lstatSync(targetPath);
            if (targetType.isFile()) {
                res.end(fs.readFileSync(targetPath))
            } else if (targetType.isDirectory()) {
                fs.readdir(targetPath, function (error, list) {
                    if (error) {
                        console.log(error);
                        res.end(error.toString())
                    }
                    var dirs = [];
                    var files = [];
                    list.forEach(function (val) {
                        var file = fs.lstatSync(path.join(targetPath, val));
                        if (file.isFile()) {
                            files.push(val)
                        } else if (file.isDirectory()) {
                            dirs.push(val);
                        }
                    });
                    res.writeHead(200);
                    res.write(utils.render(req.url, dirs, files));
                    res.end()
                })
            } else {
                res.end('error')
            }
        } else {
            res.writeHead(404, {'Content-Type': 'text/plain'});
            res.end('not found');
        }
        req.on('error', function (e) {
            console.log(e);
        })
        res.on('error', function (e) {
            console.log(e);
        })
    });

    server.listen(option.port, function () {
        var print = [];
        print.push('-------------------------------------------------------------')
        print.push('Mini http server running on port ' + option.port + ' !');
        print.push('You can open the floowing urls to view files.');
        utils.getIP().forEach(function (val) {
            print.push('\x1b[32m' + val + ":" + option.port + '\x1b[0m');
        });
        print.push('Have fun ^_^');
        print.push('-------------------------------------------------------------');
        var prev = '\t';
        var length = print.length;
        print.forEach(function (val, ind) {
            if (ind === 0 || ind === length - 1) {
                console.log(val);
            } else {
                console.log(prev + val);
            }
        })
    })
    server.on('error', function (e) {
        console.log(e);
    })
    return server;
}

index_.createServer = function(option) {
    var defaultOption = {
        port: 7000
    }
    var envOption = {}
    utils.parseArg(envOption);
    var httpOption = utils.assign({},defaultOption,envOption, option);
    return new HttpServer(httpOption);
}

/* node_modules/m-server/index.js */
index_.createServer();
