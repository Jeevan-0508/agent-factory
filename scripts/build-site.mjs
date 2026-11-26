import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'catalog'), { recursive: true });

for (const file of ['index.html', 'app.js', 'experiences.js', 'styles.css']) {
  fs.copyFileSync(path.join(root, 'dashboard', file), path.join(output, file));
}
fs.cpSync(path.join(root, 'dashboard', 'divine-council'), path.join(output, 'divine-council'), { recursive: true });
fs.copyFileSync(path.join(root, 'catalog', 'roles.json'), path.join(output, 'catalog', 'roles.json'));

console.log(JSON.stringify({ ok: true, output, files: 6 }));
