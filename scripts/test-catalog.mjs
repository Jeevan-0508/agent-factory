import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot, validateCatalog } from './validate-catalog.mjs';

const root = projectRoot();
const result = validateCatalog(root);
assert.deepEqual(result.errors, [], result.errors.join('\n'));
assert.equal(result.total_roles, 100);
assert.equal(result.runtime_supported, 30);
assert.equal(result.registry_only, 70);

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog', 'roles.json'), 'utf8'));
assert.equal(catalog.roles.length, 100);
assert.equal(catalog.workflow_templates.length, 5);
assert.ok(catalog.roles.every((role) => role.example_tasks.length >= 3));
assert.ok(catalog.roles.every((role) => role.prompt.length >= 200));
assert.ok(catalog.workflow_templates.every((workflow) => workflow.steps.every((step) => catalog.roles.some((role) => role.name === step.role))));

const dashboard = fs.readFileSync(path.join(root, 'dashboard', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'dashboard', 'app.js'), 'utf8');
const generator = fs.readFileSync(path.join(root, 'scripts', 'generate.mjs'), 'utf8');
assert.match(dashboard, /styles\.css/);
assert.match(dashboard, /app\.js/);
assert.ok(!app.includes('innerHTML'));
assert.ok(!app.includes('insertAdjacentHTML'));
assert.ok(!generator.includes('innerHTML'));
assert.ok(!generator.includes('insertAdjacentHTML'));
assert.ok(catalog.sources.every((source) => /^https:\/\//.test(source.url)));

const windowsLikeUrl = 'file:///C:/Users/HP/Documents/ChatGPT/agent-factory/scripts/validate-catalog.mjs';
assert.ok(!projectRoot(windowsLikeUrl).startsWith('C:\\C:'));
assert.equal(fileURLToPath(import.meta.url), path.join(root, 'scripts', 'test-catalog.mjs'));
console.log(JSON.stringify({ ok: true, checks: 12, root }, null, 2));
