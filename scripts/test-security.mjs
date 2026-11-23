import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = ['dashboard/index.html', 'dashboard/app.js', 'dashboard/experiences.js', 'scripts/build-site.mjs', 'tests/e2e/server.mjs'].map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]);
for (const [file, source] of sources) {
  assert.equal(source.includes('innerHTML'), false, `${file} contains innerHTML`);
  assert.equal(source.includes('insertAdjacentHTML'), false, `${file} contains insertAdjacentHTML`);
}
const server = fs.readFileSync(path.join(root, 'tests/e2e/server.mjs'), 'utf8');
assert.match(server, /Content-Security-Policy/);
assert.match(server, /X-Content-Type-Options/);
assert.match(server, /publicFiles = new Set/);
assert.match(server, /decodeURIComponent.*catch/);
assert.match(server, /candidate\.startsWith\(root \+ path\.sep\)/);
const app = fs.readFileSync(path.join(root, 'dashboard/app.js'), 'utf8');
assert.match(app, /noopener noreferrer/);
assert.match(app, /allowedHosts/);
console.log(JSON.stringify({ ok: true, checks: 10, scope: 'DOM sinks, URL allowlist, static server containment, security headers' }, null, 2));
