import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tasks = JSON.parse(fs.readFileSync(path.join(root, 'benchmarks', 'tasks.json'), 'utf8'));
console.log(JSON.stringify({
  mode: 'definition-only',
  executed: false,
  reason: 'No Codex/provider execution was authorized for this run; no success or improvement metrics are claimed.',
  comparisons: ['standard-codex', 'agent-factory'],
  tasks
}, null, 2));
