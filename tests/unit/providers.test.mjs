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

test('enabled Paperclip rejects missing or mismatched bindings before upstream calls', async () => {
  const baseEnv = { PAPERCLIP_ENABLED: 'true', PAPERCLIP_API_URL: 'https://paperclip.example.test', PAPERCLIP_API_TOKEN: 'server-token-value' };
  const cases = [
    { env: { ...baseEnv, PAPERCLIP_COMPANY_ID: 'company-a' }, operation: 'health', input: {}, code: 'provider_workspace_unbound' },
    { env: { ...baseEnv, PAPERCLIP_WORKSPACE_ID: 'local-workspace' }, operation: 'discoverOrganizations', input: {}, code: 'provider_company_unbound' },
    { env: { ...baseEnv, PAPERCLIP_WORKSPACE_ID: 'local-workspace', PAPERCLIP_COMPANY_ID: 'company-a' }, operation: 'discoverAgents', input: { companyId: 'company-b' }, code: 'provider_company_mismatch' }
  ];

  for (const testCase of cases) {
    const calls = [];
    const registry = createProviderRegistry({ env: testCase.env, fetchImpl: async (...args) => { calls.push(args); return response(200, []); } });
    await assert.rejects(registry.invoke('paperclip', testCase.operation, testCase.input), (error) => error.code === testCase.code);
    assert.equal(calls.length, 0);
  }
});

test('Paperclip organization discovery exposes only the explicitly bound company', async () => {
  const calls = [];
  const registry = createProviderRegistry({
    env: { PAPERCLIP_ENABLED: 'true', PAPERCLIP_API_URL: 'https://paperclip.example.test', PAPERCLIP_API_TOKEN: 'server-token-value', PAPERCLIP_WORKSPACE_ID: 'local-workspace', PAPERCLIP_COMPANY_ID: 'company-a' },
    fetchImpl: async (url, options) => { calls.push({ url, options }); return response(200, [{ id: 'company-a', name: 'Bound' }, { id: 'company-b', name: 'Foreign' }]); }
  });

  const organizations = await registry.invoke('paperclip', 'discoverOrganizations');
  assert.deepEqual(organizations, [{ id: 'company-a', name: 'Bound' }]);
  assert.equal(calls.length, 1);
});

test('Paperclip adapter uses exact documented routes and never exposes the bearer token', async () => {
  const calls = [];
  const adapter = createPaperclipAdapter({
    baseUrl: 'https://paperclip.example.test',
    token: 'server-token-value',
    fetchImpl: async (url, options) => { calls.push({ url, options }); if (url.includes('/companies?')) return response(200, []); if (url.includes('/agents')) return response(200, []); return response(200, { status: 'ok', serverVersion: 'v2026.609.0' }); }
  });
  const health = await adapter.health();
  await adapter.discoverOrganizations();
  await adapter.discoverAgents('company-1');
  assert.equal(health.version, 'v2026.609.0');
  assert.equal(calls[0].url, 'https://paperclip.example.test/api/health');
  assert.equal(calls[1].url, 'https://paperclip.example.test/api/companies?scope=accessible');
  assert.equal(calls[2].url, 'https://paperclip.example.test/api/companies/company-1/agents');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer server-token-value');
  assert.equal(calls[0].options.redirect, 'error');
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

test('provider registry forwards parameterized read-only inputs as scalar operation arguments', async () => {
  const calls = [];
  const mock = createMockPaperclipAdapter({ calls });
  const registry = createProviderRegistry({ env: {}, mockAdapter: mock });
  const cases = [
    ['discoverAgents', { companyId: 'mock-company' }, ['discoverAgents', 'mock-company']],
    ['getAgent', { agentId: 'mock-agent' }, ['getAgent', 'mock-agent']],
    ['getDashboard', { companyId: 'mock-company' }, ['getDashboard', 'mock-company']],
    ['getBudget', { companyId: 'mock-company' }, ['getBudget', 'mock-company']]
  ];

  for (const [operation, input, expectedCall] of cases) {
    const argument = expectedCall[1];
    const directResult = await mock[operation](argument);
    const result = await registry.invoke('mock-paperclip', operation, input);
    assert.deepEqual(calls.at(-1), expectedCall);
    assert.deepEqual(result, directResult);
  }
});

test('provider registry rejects parameterized calls outside the configured company binding', async () => {
  const calls = [];
  const registry = createProviderRegistry({
    env: { PAPERCLIP_COMPANY_ID: 'company-a' },
    mockAdapter: createMockPaperclipAdapter({ calls })
  });

  await assert.rejects(
    registry.invoke('mock-paperclip', 'getBudget', { companyId: 'company-b' }),
    (error) => error.code === 'provider_company_mismatch'
  );
  assert.equal(calls.length, 0);
});

test('provider registry rejects an agent record returned from another company', async () => {
  const calls = [];
  const mock = createMockPaperclipAdapter({ calls });
  mock.getAgent = async (agentId) => {
    calls.push(['getAgent', agentId]);
    return { id: agentId, name: 'Foreign Agent', companyId: 'company-b' };
  };
  const registry = createProviderRegistry({
    env: { PAPERCLIP_COMPANY_ID: 'company-a' },
    mockAdapter: mock
  });

  await assert.rejects(
    registry.invoke('mock-paperclip', 'getAgent', { agentId: 'foreign-agent' }),
    (error) => error.code === 'provider_company_mismatch'
  );
  assert.deepEqual(calls, [['getAgent', 'foreign-agent']]);
});

test('provider registry rejects an agent record without company ownership when bound', async () => {
  const mock = createMockPaperclipAdapter();
  mock.getAgent = async (agentId) => ({ id: agentId, name: 'Unscoped Agent' });
  const registry = createProviderRegistry({
    env: { PAPERCLIP_COMPANY_ID: 'company-a' },
    mockAdapter: mock
  });

  await assert.rejects(
    registry.invoke('mock-paperclip', 'getAgent', { agentId: 'unscoped-agent' }),
    (error) => error.code === 'provider_company_mismatch'
  );
});

test('provider registry rejects execution operations and requires explicit workspace/company bindings', async () => {
  const calls = [];
  const registry = createProviderRegistry({ env: { PAPERCLIP_ENABLED: 'true', PAPERCLIP_API_URL: 'https://paperclip.example.test', PAPERCLIP_API_TOKEN: 'server-token-value', PAPERCLIP_WORKSPACE_ID: 'workspace-a', PAPERCLIP_COMPANY_ID: 'company-a' }, fetchImpl: async () => response(200, []) });
  await assert.rejects(registry.invoke('paperclip', 'createTask', {}), (error) => error.code === 'provider_operation_not_authorized');
  const mockRegistry = createProviderRegistry({ env: {}, mockAdapter: createMockPaperclipAdapter() });
  await assert.rejects(mockRegistry.invoke('mock-paperclip', 'toString'), (error) => error.code === 'provider_operation_not_authorized');
  assert.throws(() => registry.assertWorkspace('workspace-b'), (error) => error.code === 'provider_workspace_mismatch');
  assert.throws(() => registry.assertCompany('company-b'), (error) => error.code === 'provider_company_mismatch');
  registry.assertWorkspace('workspace-a');
  registry.assertCompany('company-a');
  assert.equal(calls.length, 0);
});

test('provider response size and schema checks fail closed', async () => {
  const oversized = createPaperclipAdapter({ baseUrl: 'https://paperclip.example.test', token: 'server-token-value', fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'x'.repeat(1_000_001) }) });
  await assert.rejects(oversized.health(), (error) => error.code === 'provider_response_too_large');
  const malformed = createPaperclipAdapter({ baseUrl: 'https://paperclip.example.test', token: 'server-token-value', fetchImpl: async () => response(200, 'bad') });
  await assert.rejects(malformed.health(), (error) => error.code === 'provider_response_invalid');
});
