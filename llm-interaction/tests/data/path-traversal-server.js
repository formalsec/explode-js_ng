const http = require('http');
const fs = require('fs');
const url = require('url');
const path = require('path');

const PORT = 3071;

const server = http.createServer((req, res) => {
	const queryObject = url.parse(req.url, true).query;

	if (!queryObject.path) {
		res.writeHead(400, { 'Content-Type': 'text/plain' });
		return res.end('Missing "path" query parameter.');
	}

	const filePath = queryObject.path;

	// Insecure: No validation or sanitization of the file path
	fs.readFile(filePath, 'utf8', (err, data) => {
		if (err) {
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			return res.end('File not found or error reading file.');
		}

		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end(data);
	});
});

server.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}`);
});

