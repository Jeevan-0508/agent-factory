import { HttpError } from './util.mjs';

const PAPERCLIP_UPSTREAM = 'paperclipai/paperclip';
const PAPERCLIP_INSPECTED_COMMIT = '28aa32e7d7ba72d8f83c03ffd45625c096813e6b';
const PAPERCLIP_VERSION = 'v2026.609.0';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const PROVIDER_METADATA = [
  { id: 'deterministic-local', status: 'configured', network: 'none', credentials: 'not applicable', execution_mode: 'rule-based local contract' },
  { id: 'paperclip', status: 'disabled', network: 'server-only', credentials: 'server-side environment only', execution_mode: 'optional external orchestration', upstream: PAPERCLIP_UPSTREAM, inspected_commit: PAPERCLIP_INSPECTED_COMMIT },
  { id: 'mock-paperclip', status: 'test-only', network: 'none', credentials: 'not applicable', execution_mode: 'deterministic contract fixture' }
];

function assertId(value, label) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new HttpError(400, `${label} is invalid`, 'invalid_provider_identifier');
  return value;
}

function assertBaseUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new HttpError(400, 'Paperclip API URL is invalid', 'provider_config_invalid'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new HttpError(400, 'Paperclip API URL must be an HTTP(S) origin without credentials or query state', 'provider_config_invalid');
  if (parsed.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) throw new HttpError(400, 'Non-loopback Paperclip URLs must use HTTPS', 'provider_config_invalid');
  return parsed.href.replace(/\/$/, '');
}

function disabledPaperclip() {
  throw new HttpError(503, 'Paperclip integration is disabled or not configured', 'provider_disabled');
}

function cleanHealth(payload) {
  return {
    status: payload?.status ?? null,
    version: payload?.serverVersion ?? payload?.version ?? null,
    commit: payload?.commit ?? null,
    deployment_mode: payload?.deploymentMode ?? null,
    database: payload?.database ?? null
  };
}

export function createPaperclipAdapter({ baseUrl, token, fetchImpl = globalThis.fetch, timeoutMs = 5_000, expectedVersion = null } = {}) {
  if (typeof fetchImpl !== 'function') throw new HttpError(500, 'Paperclip adapter requires a fetch implementation', 'provider_config_invalid');
  const origin = assertBaseUrl(baseUrl);
  if (typeof token !== 'string' || token.length < 8 || token.length > 4096) throw new HttpError(400, 'Paperclip API token is invalid', 'provider_config_invalid');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) throw new HttpError(400, 'Paperclip timeout is outside the safety bounds', 'provider_config_invalid');

  async function request(method, pathname, body = undefined, extraHeaders = {}) {
    if (!pathname.startsWith('/api/') || pathname.includes('..')) throw new HttpError(500, 'Paperclip adapter attempted an invalid route', 'provider_route_invalid');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${origin}${pathname}`, {
        method,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const raw = await response.text();
      let payload = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
      if (!response.ok) throw new HttpError(502, 'Paperclip request failed', 'provider_request_failed', { provider: 'paperclip', status: response.status, route: pathname });
      return payload;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(error?.name === 'AbortError' ? 504 : 502, error?.name === 'AbortError' ? 'Paperclip request timed out' : 'Paperclip is unavailable', error?.name === 'AbortError' ? 'provider_timeout' : 'provider_unavailable', { provider: 'paperclip', route: pathname });
    } finally { clearTimeout(timer); }
  }

  async function health() {
    const healthPayload = cleanHealth(await request('GET', '/api/health'));
    if (expectedVersion && healthPayload.version !== expectedVersion) throw new HttpError(412, 'Paperclip version is outside the configured compatibility pin', 'provider_version_mismatch', { expected: expectedVersion, observed: healthPayload.version });
    return { provider: 'paperclip', connected: true, inspected_commit: PAPERCLIP_INSPECTED_COMMIT, ...healthPayload };
  }

  return {
    id: 'paperclip',
    metadata: { id: 'paperclip', status: 'configured', network: 'server-only', credentials: 'server-side environment only', execution_mode: 'optional external orchestration', upstream: PAPERCLIP_UPSTREAM, inspected_commit: PAPERCLIP_INSPECTED_COMMIT },
    health,
    async openApi() { return request('GET', '/api/openapi.json'); },
    async discoverOrganizations() { return request('GET', '/api/companies?scope=accessible'); },
    async discoverAgents(companyId) { return request('GET', `/api/companies/${encodeURIComponent(assertId(companyId, 'company id'))}/agents`); },
    async getAgent(agentId) { return request('GET', `/api/agents/${encodeURIComponent(assertId(agentId, 'agent id'))}`); },
    async getDashboard(companyId) { return request('GET', `/api/companies/${encodeURIComponent(assertId(companyId, 'company id'))}/dashboard`); },
    async getBudget(companyId) { return request('GET', `/api/companies/${encodeURIComponent(assertId(companyId, 'company id'))}/costs/summary`); },
    async createTask({ companyId, title, description = '', assigneeAgentId, projectId = undefined, goalId = undefined, priority = 'medium' } = {}) {
      if (typeof title !== 'string' || title.length < 1 || title.length > 240) throw new HttpError(400, 'Paperclip task title is invalid', 'provider_input_invalid');
      return request('POST', `/api/companies/${encodeURIComponent(assertId(companyId, 'company id'))}/issues`, { title, description, assigneeAgentId: assertId(assigneeAgentId, 'agent id'), ...(projectId ? { projectId: assertId(projectId, 'project id') } : {}), ...(goalId ? { goalId: assertId(goalId, 'goal id') } : {}), priority, status: 'todo' });
    },
    async getTask(issueId) { return request('GET', `/api/issues/${encodeURIComponent(assertId(issueId, 'issue id'))}`); },
    async cancelRun(runId) { return request('POST', `/api/heartbeat-runs/${encodeURIComponent(assertId(runId, 'run id'))}/cancel`, {}); }
  };
}

export function createMockPaperclipAdapter({ calls = [] } = {}) {
  const organizations = [{ id: 'mock-company', name: 'Mock Paperclip Company', status: 'active', budgetMonthlyCents: 0 }];
  const agents = [{ id: 'mock-agent', name: 'Mock Agent', role: 'engineer', companyId: 'mock-company', status: 'idle' }];
  return {
    id: 'mock-paperclip',
    metadata: { id: 'mock-paperclip', status: 'test-only', network: 'none', credentials: 'not applicable', execution_mode: 'deterministic contract fixture' },
    async health() { calls.push(['health']); return { provider: 'mock-paperclip', connected: true, version: PAPERCLIP_VERSION, status: 'ok' }; },
    async openApi() { calls.push(['openApi']); return { openapi: '3.0.0', info: { title: 'Mock Paperclip API' } }; },
    async discoverOrganizations() { calls.push(['discoverOrganizations']); return organizations.map((item) => ({ ...item })); },
    async discoverAgents(companyId) { calls.push(['discoverAgents', companyId]); return companyId === 'mock-company' ? agents.map((item) => ({ ...item })) : []; },
    async getAgent(agentId) { calls.push(['getAgent', agentId]); return agents.find((item) => item.id === agentId) || null; },
    async getDashboard(companyId) { calls.push(['getDashboard', companyId]); return { companyId, agents: { active: 1, running: 0 }, tasks: { open: 0 }, costs: { monthSpendCents: 0, monthBudgetCents: 0 } }; },
    async getBudget(companyId) { calls.push(['getBudget', companyId]); return { companyId, monthSpendCents: 0, monthBudgetCents: 0 }; },
    async createTask(input) { calls.push(['createTask', input]); return { id: 'mock-issue', status: 'todo', ...input }; },
    async getTask(issueId) { calls.push(['getTask', issueId]); return { id: issueId, status: 'todo' }; },
    async cancelRun(runId) { calls.push(['cancelRun', runId]); return { id: runId, status: 'cancelled' }; }
  };
}

export function createProviderRegistry({ env = process.env, fetchImpl = globalThis.fetch, mockAdapter = null } = {}) {
  const enabled = env.PAPERCLIP_ENABLED === 'true';
  const hasConfig = Boolean(env.PAPERCLIP_API_URL && env.PAPERCLIP_API_TOKEN);
  const paperclip = enabled && hasConfig ? createPaperclipAdapter({ baseUrl: env.PAPERCLIP_API_URL, token: env.PAPERCLIP_API_TOKEN, fetchImpl, expectedVersion: env.PAPERCLIP_EXPECTED_VERSION || null }) : null;
  const paperclipStatus = enabled && !hasConfig ? 'misconfigured' : paperclip ? 'configured' : 'disabled';
  return {
    list() { return PROVIDER_METADATA.map((provider) => provider.id === 'paperclip' ? { ...provider, status: paperclipStatus } : { ...provider }); },
    get(providerId) {
      if (providerId === 'paperclip') return paperclip || { id: 'paperclip', health: disabledPaperclip };
      if (providerId === 'mock-paperclip') return mockAdapter || { id: 'mock-paperclip', health: disabledPaperclip };
      if (providerId === 'deterministic-local') return { id: 'deterministic-local', metadata: PROVIDER_METADATA[0] };
      throw new HttpError(404, 'Provider not found', 'provider_not_found');
    },
    async invoke(providerId, operation, input = {}) {
      if (providerId === 'deterministic-local') throw new HttpError(501, 'Deterministic execution is implemented by the local runtime contract, not a remote provider call', 'provider_not_applicable');
      const provider = this.get(providerId);
      if (typeof provider[operation] !== 'function') throw new HttpError(400, 'Provider operation is not supported', 'provider_operation_not_supported');
      return provider[operation](input);
    }
  };
}
