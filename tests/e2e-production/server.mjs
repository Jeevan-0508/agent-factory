import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const port = Number(process.env.PORT || 4173);
const prefix = '/agent-factory';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp' };

function safePath(requestUrl) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(requestUrl, `http://127.0.0.1:${port}`).pathname); } catch { return null; }
  if (pathname === `${prefix}/`) pathname = `${prefix}/index.html`;
  if (!pathname.startsWith(`${prefix}/`)) return null;
  const relative = pathname.slice(prefix.length);
  const candidate = path.resolve(root, `.${relative}`);
  return candidate.startsWith(root + path.sep) ? candidate : null;
}

const server = http.createServer((request, response) => {
  const candidate = safePath(request.url || '/');
  if (!candidate || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': types[path.extname(candidate)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'" });
  fs.createReadStream(candidate).pipe(response);
});

server.listen(port, '127.0.0.1', () => console.log(`Production build test server listening on http://127.0.0.1:${port}${prefix}/`));
