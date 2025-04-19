const { newRequest } = require('../../packages/GHSA-rjq5-w47x-x359/hono-node-server-1.4.0/package/dist/request')


const { Readable } = require('stream');

// Mock a Node.js IncomingMessage
const mockIncoming = {
  method: 'GET',
  url: '/static/../foo.txt',
  headers: {
    host: 'localhost'
  },
  rawHeaders: [
    'Host', 'localhost'
  ],
  pipe() {}, // required by stream.Readable.toWeb
  on() {},   // required by stream.Readable.toWeb
  once() {}, // required by stream.Readable.toWeb
};

// Turn it into a web-standard Request
const req = newRequest(mockIncoming);

console.log(req.url); // http://localhost/static/../foo.txt
console.log(req.method); // GET

