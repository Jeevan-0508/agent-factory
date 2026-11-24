import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../../server/api.mjs';
import { run } from '../../server/db.mjs';

const root = path.resolve(import.meta.dirname, '../..');

async function makeApp() {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-security-'));
  const app = createApp({ root, dataDirectory, port: 0 });
  const address = await app.start();
  return { app, base: `http://127.0.0.1:${address.port}` };
}

async function request(base, pathName, options = {}, cookie = '') {
  const response = await fetch(`${base}${pathName}`, { ...options, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  const setCookie = response.headers.get('set-cookie') || '';
  return { response, body, setCookie, cookie: setCookie.split(';')[0] || cookie };
}

function rawRequest(base, pathName, headers = {}) {
  const target = new URL(pathName, base);
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: target.hostname, port: target.port, path: target.pathname, method: 'GET', headers }, (response) => {
      response.resume();
      response.once('end', () => resolve(response));
    });
    request.once('error', reject);
    request.end();
  });
}

test('pins the intentional loopback session bootstrap trust boundary', async () => {
  const { app, base } = await makeApp();
  try {
    const session = await request(base, '/api/v1/session');
    assert.equal(session.response.status, 200);
    assert.equal(session.body.mode, 'local-session');
    assert.match(session.setCookie, /HttpOnly/);
    assert.match(session.setCookie, /SameSite=Strict/);
    assert.match(session.setCookie, /Max-Age=28800/);
    assert.equal((await request(base, '/api/v1/agents')).response.status, 401);
    const hostileBootstrap = await request(base, '/api/v1/session', { headers: { Origin: 'https://evil.example' } });
    assert.equal(hostileBootstrap.response.status, 403);
    assert.equal(hostileBootstrap.setCookie, '');
    assert.equal((await request(base, '/api/v1/agents', { headers: { Origin: 'https://evil.example' } }, session.cookie)).response.status, 403);
    assert.equal((await rawRequest(base, '/api/v1/session', { Host: 'evil.example' })).statusCode, 403);
  } finally { await app.close(); }
});

test('denies unauthenticated, unsafe-tool, cross-origin, registry-only, and kill-switch execution paths', async () => {
  const { app, base } = await makeApp();
  try {
    assert.equal((await request(base, '/api/v1/agents')).response.status, 401);
    assert.equal((await request(base, '/api/v1/agents', { headers: { Origin: 'https://evil.example' } })).response.status, 403);
    const session = await request(base, '/api/v1/session');
    const cookie = session.cookie;
    const unsafe = await request(base, '/api/v1/tasks', { method: 'POST', body: JSON.stringify({ agent_id: 'solution_architect', input: {}, allowed_tools: ['shell.exec'] }) }, cookie);
    assert.equal(unsafe.response.status, 403);
    const registryOnly = await request(base, '/api/v1/tasks', { method: 'POST', body: JSON.stringify({ agent_id: 'risk_analyst', input: {} }) }, cookie);
    assert.equal(registryOnly.response.status, 403);
    const task = await request(base, '/api/v1/tasks', { method: 'POST', body: JSON.stringify({ agent_id: 'solution_architect', input: { requirements: ['kill switch'] }, allowed_tools: ['schema.validate'] }) }, cookie);
    await request(base, `/api/v1/tasks/${task.body.id}/validate`, { method: 'POST', body: '{}' }, cookie);
    await request(base, `/api/v1/tasks/${task.body.id}/request-approval`, { method: 'POST', body: '{}' }, cookie);
    await request(base, `/api/v1/tasks/${task.body.id}/approve`, { method: 'POST', body: '{}' }, cookie);
    assert.equal((await request(base, '/api/v1/runtime/kill-switch', { method: 'POST', body: JSON.stringify({ active: true }) }, cookie)).body.active, true);
    const blocked = await request(base, `/api/v1/tasks/${task.body.id}/execute`, { method: 'POST', body: '{}' }, cookie);
    assert.equal(blocked.response.status, 423);
    await request(base, '/api/v1/runtime/kill-switch', { method: 'POST', body: JSON.stringify({ active: false }) }, cookie);
  } finally { await app.close(); }
});

test('rejects stale approval hashes and preserves an immutable plan boundary', async () => {
  const { app, base } = await makeApp();
  try {
    const session = await request(base, '/api/v1/session');
    const cookie = session.cookie;
    const task = await request(base, '/api/v1/tasks', { method: 'POST', body: JSON.stringify({ agent_id: 'solution_architect', input: { requirements: ['hash'] }, allowed_tools: ['schema.validate'] }) }, cookie);
    await request(base, `/api/v1/tasks/${task.body.id}/validate`, { method: 'POST', body: '{}' }, cookie);
    await request(base, `/api/v1/tasks/${task.body.id}/request-approval`, { method: 'POST', body: '{}' }, cookie);
    run(app.db, 'UPDATE tasks SET plan_hash = ? WHERE id = ?', ['tampered-plan', task.body.id]);
    const stale = await request(base, `/api/v1/tasks/${task.body.id}/approve`, { method: 'POST', body: '{}' }, cookie);
    assert.equal(stale.response.status, 409);
    assert.equal(stale.body.error, 'stale_approval');
  } finally { await app.close(); }
});
