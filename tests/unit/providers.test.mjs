import assert from 'node:assert/strict';
import test from 'node:test';
import { createMockPaperclipAdapter, createPaperclipAdapter, createProviderRegistry } from '../../server/providers.mjs';

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

test('Paperclip is disabled unless explicitly enabled with server-side configuration', async () => {
  const registry = createProviderRegistry({ env: {} });
  assert.equal(registry.list().find((provider) => provider.id === 'paperclip').status, 'disabled');
  await assert.rejects(Promise.resolve().then(() => registry.get('paperclip').health()), (error) => error.code === 'provider_disabled');
});

test('Paperclip adapter uses exact documented routes and never exposes the bearer token', async () => {
  const calls = [];
  const adapter = createPaperclipAdapter({
    baseUrl: 'https://paperclip.example.test',
    token: 'server-token-value',
    fetchImpl: async (url, options) => { calls.push({ url, options }); return response(200, { status: 'ok', serverVersion: 'v2026.609.0' }); }
  });
  const health = await adapter.health();
  await adapter.discoverOrganizations();
  await adapter.discoverAgents('company-1');
  assert.equal(health.version, 'v2026.609.0');
  assert.equal(calls[0].url, 'https://paperclip.example.test/api/health');
  assert.equal(calls[1].url, 'https://paperclip.example.test/api/companies?scope=accessible');
  assert.equal(calls[2].url, 'https://paperclip.example.test/api/companies/company-1/agents');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer server-token-value');
  assert.equal(JSON.stringify(adapter.metadata).includes('server-token-value'), false);
});

test('Paperclip adapter fails closed on version drift and timeout', async () => {
  const drift = createPaperclipAdapter({ baseUrl: 'https://paperclip.example.test', token: 'server-token-value', expectedVersion: 'v2026.610.0', fetchImpl: async () => response(200, { status: 'ok', serverVersion: 'v2026.609.0' }) });
  await assert.rejects(drift.health(), (error) => error.code === 'provider_version_mismatch');
  const timeout = createPaperclipAdapter({ baseUrl: 'https://paperclip.example.test', token: 'server-token-value', timeoutMs: 100, fetchImpl: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error); })) });
  await assert.rejects(timeout.health(), (error) => error.code === 'provider_timeout');
});

test('mock adapter provides deterministic contract fixtures without network access', async () => {
  const calls = [];
  const mock = createMockPaperclipAdapter({ calls });
  const registry = createProviderRegistry({ env: {}, mockAdapter: mock });
  assert.deepEqual(await registry.invoke('mock-paperclip', 'health'), { provider: 'mock-paperclip', connected: true, version: 'v2026.609.0', status: 'ok' });
  assert.equal((await registry.invoke('mock-paperclip', 'discoverOrganizations'))[0].id, 'mock-company');
  assert.deepEqual(calls.map(([operation]) => operation), ['health', 'discoverOrganizations']);
});
