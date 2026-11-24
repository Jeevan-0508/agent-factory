import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../../server/api.mjs';

const root = path.resolve(import.meta.dirname, '../..');

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

test('Paperclip discovery routes require local auth and remain disabled by default', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-provider-'));
  const app = createApp({ root, dataDirectory, port: 0 });
  const address = await app.start();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const unauthenticated = await fetch(`${base}/api/v1/providers/paperclip/health`);
    assert.equal(unauthenticated.status, 401);
    const session = await fetch(`${base}/api/v1/session`);
    const cookie = session.headers.get('set-cookie').split(';')[0];
    const disabled = await fetch(`${base}/api/v1/providers/paperclip/health`, { headers: { Cookie: cookie } });
    assert.equal(disabled.status, 503);
    const body = await disabled.json();
    assert.equal(body.error, 'provider_disabled');
    const events = app.db.prepare("SELECT event_type, payload_json FROM audit_events WHERE event_type = 'PROVIDER_READ'").all();
    assert.equal(events.length, 1);
    assert.equal(JSON.parse(events[0].payload_json).status, 'failed');
  } finally { await app.close(); }
});

test('enabled Paperclip rejects missing or mismatched bindings before any upstream call', async () => {
  const baseEnv = { PAPERCLIP_ENABLED: 'true', PAPERCLIP_API_URL: 'https://paperclip.example.test', PAPERCLIP_API_TOKEN: 'server-token-value' };
  const cases = [
    { env: { ...baseEnv, PAPERCLIP_COMPANY_ID: 'company-a' }, path: '/api/v1/providers/paperclip/health', code: 'provider_workspace_unbound' },
    { env: { ...baseEnv, PAPERCLIP_WORKSPACE_ID: 'local-workspace' }, path: '/api/v1/providers/paperclip/companies', code: 'provider_company_unbound' },
    { env: { ...baseEnv, PAPERCLIP_WORKSPACE_ID: 'local-workspace', PAPERCLIP_COMPANY_ID: 'company-a' }, path: '/api/v1/providers/paperclip/companies/company-b/agents', code: 'provider_company_mismatch' },
    { env: { ...baseEnv, PAPERCLIP_WORKSPACE_ID: 'other-workspace', PAPERCLIP_COMPANY_ID: 'company-a' }, path: '/api/v1/providers/paperclip/health', code: 'provider_workspace_mismatch' }
  ];

  for (const testCase of cases) {
    const calls = [];
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-provider-boundary-'));
    const app = createApp({ root, dataDirectory, port: 0, providerEnv: testCase.env, providerFetch: async (...args) => { calls.push(args); return response(200, []); } });
    const address = await app.start();
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const session = await fetch(`${base}/api/v1/session`);
      const cookie = session.headers.get('set-cookie').split(';')[0];
      const upstreamBlocked = await fetch(`${base}${testCase.path}`, { headers: { Cookie: cookie } });
      assert.equal(upstreamBlocked.status, testCase.code === 'provider_company_mismatch' || testCase.code === 'provider_workspace_mismatch' ? 403 : 503);
      assert.equal((await upstreamBlocked.json()).error, testCase.code);
      assert.equal(calls.length, 0);
    } finally { await app.close(); }
  }
});

test('Paperclip organization discovery returns only the explicitly bound company', async () => {
  const calls = [];
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-provider-filter-'));
  const app = createApp({
    root,
    dataDirectory,
    port: 0,
    providerEnv: { PAPERCLIP_ENABLED: 'true', PAPERCLIP_API_URL: 'https://paperclip.example.test', PAPERCLIP_API_TOKEN: 'server-token-value', PAPERCLIP_WORKSPACE_ID: 'local-workspace', PAPERCLIP_COMPANY_ID: 'company-a' },
    providerFetch: async (url, options) => { calls.push({ url, options }); return response(200, [{ id: 'company-a', name: 'Bound' }, { id: 'company-b', name: 'Foreign' }]); }
  });
  const address = await app.start();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const session = await fetch(`${base}/api/v1/session`);
    const cookie = session.headers.get('set-cookie').split(';')[0];
    const organizations = await fetch(`${base}/api/v1/providers/paperclip/companies`, { headers: { Cookie: cookie } });
    assert.equal(organizations.status, 200);
    assert.deepEqual(await organizations.json(), [{ id: 'company-a', name: 'Bound' }]);
    assert.equal(calls.length, 1);
  } finally { await app.close(); }
});
