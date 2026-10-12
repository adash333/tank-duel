const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
http.createServer((req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  const allowed = name === '/' || name === '/index.html' || name === '/styles.css' || /^\/src\/[a-z-]+\.js$/.test(name);
  if (!allowed) { res.writeHead(404).end('Not found'); return; }
  const file = path.join(root, name === '/' ? 'index.html' : name.slice(1));
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}).listen(port, '0.0.0.0', () => console.log(`TANK DUEL: http://localhost:${port}`));
