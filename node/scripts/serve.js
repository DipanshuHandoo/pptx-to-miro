#!/usr/bin/env node
'use strict';

// Tiny static file server for the preview. Usage: node serve.js <rootDir> <port>
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || process.cwd());
const port = parseInt(process.argv[3], 10) || 5599;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/preview.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`preview server: http://localhost:${port} (root: ${root})`));
