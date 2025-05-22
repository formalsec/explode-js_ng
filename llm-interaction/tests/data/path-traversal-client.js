const http = require('http');
const path = require('path');

// Replace with the actual path you want to read
const filePath = path.resolve('./example.txt'); 

const options = {
  hostname: 'localhost',
  port: 3000,
  path: `/??path=${encodeURIComponent(filePath)}`,
  method: 'GET'
};

const req = http.request(options, res => {
  let data = '';

  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Response from server:');
    console.log(data);
  });
});

req.on('error', error => {
  console.error('Error:', error);
});

req.end();

