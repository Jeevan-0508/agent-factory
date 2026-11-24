import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../../server/api.mjs';

const root = path.resolve(import.meta.dirname, '../..');

async function request(base, pathname, options = {}, cookie = '') {
  const response = await fetch(`${base}${pathname}`, { ...options, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) } });
  return { response, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

test('task routing selects a minimum catalog-backed specialist set without execution', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-routing-'));
  const app = createApp({ root, dataDirectory, port: 0 });
  const address = await app.start();
  try {
    const base = `http://127.0.0.1:${address.port}`;
    const session = await request(base, '/api/v1/session');
    const result = await request(base, '/api/v1/task-routing/preview', { method: 'POST', body: JSON.stringify({ objective: 'Review authentication and add regression tests', repository: 'server' }) }, session.cookie);
    assert.equal(result.response.status, 200);
    assert.ok(result.body.selected_roles.includes('security_engineer'));
    assert.ok(result.body.selected_roles.includes('qa_test_engineer'));
    assert.equal(result.body.execution_mode, 'selection-preview-only');
  } finally { await app.close(); }
});

test('knowledge proposals require independent approval and support reversible acceptance', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-knowledge-'));
  const app = createApp({ root, dataDirectory, port: 0 });
  const address = await app.start();
  try {
    const base = `http://127.0.0.1:${address.port}`;
    const session = await request(base, '/api/v1/session');
    const proposed = await request(base, '/api/v1/knowledge', { method: 'POST', body: JSON.stringify({ category: 'workflow', title: 'Bounded repair', content: 'Run tests after every repair.' }) }, session.cookie);
    assert.equal(proposed.response.status, 201);
    const selfApproval = await request(base, `/api/v1/knowledge/${proposed.body.id}/approve`, { method: 'POST', body: JSON.stringify({}) }, session.cookie);
    assert.equal(selfApproval.response.status, 403);
    const accepted = app.knowledge.approve({ workspaceId: 'local-workspace', actorId: 'independent-reviewer', itemId: proposed.body.id });
    assert.equal(accepted.status, 'ACCEPTED');
    const reverted = app.knowledge.revert({ workspaceId: 'local-workspace', actorId: 'operator', itemId: proposed.body.id });
    assert.equal(reverted.status, 'REVERTED');
  } finally { await app.close(); }
});
