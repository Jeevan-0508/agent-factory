import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.toml': 'text/plain; charset=utf-8', '.webp': 'image/webp' };
const publicFiles = new Set(['/dashboard/index.html', '/dashboard/app.js', '/dashboard/experiences.js', '/dashboard/styles.css', '/catalog/roles.json', '/dashboard/divine-council/divine-council.js', '/dashboard/divine-council/assets/council-clean.webp']);

function safePath(requestUrl) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(requestUrl, `http://127.0.0.1:${port}`).pathname); } catch { return null; }
  if (!publicFiles.has(pathname)) return null;
  const candidate = path.resolve(root, `.${pathname}`);
  return candidate.startsWith(root + path.sep) ? candidate : null;
}

const server = http.createServer((request, response) => {
  const candidate = safePath(request.url || '/');
  if (!candidate) { response.writeHead(400); response.end('Bad request'); return; }
  const filePath = fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(candidate, 'index.html');
  if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath)) { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'" });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => console.log(`Agent Factory test server listening on http://127.0.0.1:${port}`));
