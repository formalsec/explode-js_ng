const http = require('http');
const util = require('util');

var port = 8080;
var route = '~/api/get_ls?path=\"./\"'

var url = util.format("http://localhost:%s/%s", port, route)

console.log(util.format('Payload: %s', url));

http.get(url, function (res) {
  var data = '';

  res.on('data', function (chunk) {
    data += chunk;
  })

  res.on('end', function () {
    console.log(data);
  });
});
