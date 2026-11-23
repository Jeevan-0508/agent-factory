import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'pages-dist');
const dashboardOutput = path.join(output, 'dashboard');
const catalogOutput = path.join(output, 'catalog');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(dashboardOutput, { recursive: true });
fs.mkdirSync(catalogOutput, { recursive: true });

for (const file of ['index.html', 'app.js', 'experiences.js', 'styles.css']) {
  fs.copyFileSync(path.join(root, 'dashboard', file), path.join(dashboardOutput, file));
}
fs.copyFileSync(path.join(root, 'catalog', 'roles.json'), path.join(catalogOutput, 'roles.json'));
fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Agent Factory</title><meta http-equiv="refresh" content="0; url=./dashboard/"></head><body><p><a href="./dashboard/">Open Agent Factory</a></p><script>location.replace('./dashboard/');</script></body></html>\n`);
fs.writeFileSync(path.join(output, '.nojekyll'), '');

console.log(JSON.stringify({ ok: true, output, files: 7 }));
