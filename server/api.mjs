import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, get, all, run, closeDatabase } from './db.mjs';
import { loadCatalog, publicRole } from './catalog.mjs';
import { audit, ensureWorkspace, LOCAL_WORKSPACE, createAuth } from './auth.mjs';
import { createRuntime } from './runtime.mjs';
import { createWorkflowEngine } from './workflow-engine.mjs';
import { createProviderRegistry } from './providers.mjs';
import { createOlympus } from './olympus.mjs';
import { createEngineeringCouncil } from './council.mjs';
import { createGodLoop } from './god-loop.mjs';
import { listTools } from './tools.mjs';
import { createTaskRouter } from './task-routing.mjs';
import { createKnowledgeStore } from './knowledge.mjs';
import { SCENARIOS, scenarioById, scenarioDefinition } from './scenarios.mjs';
import { HttpError, jsonResponse, readJson, id, now } from './util.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

export function createApp({ root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), dataDirectory = path.join(root, '.data'), port = Number(process.env.PORT || 8787), providerEnv = process.env, providerFetch = globalThis.fetch } = {}) {
  const db = openDatabase(path.join(dataDirectory, 'agent-factory.sqlite'), path.join(root, 'server', 'migrations'));
  const { catalog, roles } = loadCatalog(root);
  const auth = createAuth(db);
  const workspaceId = ensureWorkspace(db);
  seedCatalog(db, catalog, workspaceId);
  let killSwitch = Boolean(get(db, 'SELECT kill_switch FROM workspaces WHERE id = ?', [workspaceId])?.kill_switch);
  const trustedGrantResolver = ({ grantContext, agentId }) => {
    if (!grantContext || grantContext.source !== 'offline-demo') return [];
    const scenario = scenarioById(grantContext.scenarioId);
    return scenario && scenario.grants.includes(agentId) ? [agentId] : [];
  };
  const runtime = createRuntime({ db, catalog: { catalog, roles }, killSwitch: () => killSwitch, grantResolver: trustedGrantResolver });
  const workflows = createWorkflowEngine({ db, catalog: { catalog, roles }, runtime, killSwitch: () => killSwitch });
  const providers = createProviderRegistry({ env: providerEnv, fetchImpl: providerFetch });
  const olympus = createOlympus({ db, catalog });
  const council = createEngineeringCouncil({ olympus });
  const godLoop = createGodLoop({ db, catalog, allowedTools: listTools().map((tool) => tool.id) });
  const taskRouter = createTaskRouter({ catalog: { roles: catalog.roles } });
  const knowledge = createKnowledgeStore({ db });
  workflows.recover();
  const rate = new Map();

  const server = http.createServer(async (request, response) => {
    try {
      if (!hostAllowed(request, port)) throw new HttpError(403, 'Host is not allowed', 'host_denied');
      if (!originAllowed(request, port)) throw new HttpError(403, 'Origin is not allowed', 'origin_denied');
      if (!rateAllowed(request)) throw new HttpError(429, 'Too many requests', 'rate_limited');
      const requestUrl = new URL(request.url || '/', `http://127.0.0.1:${port}`);
      if (requestUrl.pathname.startsWith('/api/')) return await handleApi(request, response, requestUrl);
      return serveStatic(request, response, requestUrl.pathname, root);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      jsonResponse(response, status, { error: error.code || 'internal_error', message: status === 500 ? 'Internal server error' : error.message, details: error.details || undefined });
    }
  });

  async function handleApi(request, response, url) {
    const parts = url.pathname.split('/').filter(Boolean);
    const body = ['POST', 'PUT', 'PATCH'].includes(request.method) ? await readJson(request) : {};
    if (url.pathname === '/api/v1/health' && request.method === 'GET') return jsonResponse(response, 200, { ok: true, service: 'agent-factory-runtime', version: 'v4', database: 'sqlite', execution_mode: 'deterministic-local', kill_switch: killSwitch });
    if (url.pathname === '/api/v1/session' && request.method === 'GET') { const session = auth.issue(); return jsonResponse(response, 200, { actor_id: session.actorId, workspace_id: session.workspaceId, mode: 'local-session' }, { 'Set-Cookie': auth.cookie(session) }); }
    const session = auth.require(request);
    if (url.pathname === '/api/v1/agents' && request.method === 'GET') return jsonResponse(response, 200, { total: catalog.total_roles, runtime_supported: catalog.runtime_supported_roles.length, registry_only: catalog.registry_only_roles.length, roles: catalog.roles.map(publicRole) });
    if (url.pathname.startsWith('/api/v1/agents/') && request.method === 'GET') { const role = roles.get(parts[3]); if (!role) throw new HttpError(404, 'Agent not found', 'agent_not_found'); return jsonResponse(response, 200, { role: { ...role, prompt: role.prompt } }); }
    if (url.pathname === '/api/v1/tools' && request.method === 'GET') return jsonResponse(response, 200, { tools: (await import('./tools.mjs')).listTools() });
    if (url.pathname === '/api/v1/task-routing/preview' && request.method === 'POST') return jsonResponse(response, 200, taskRouter.preview({ objective: body.objective, repository: body.repository, requirements: body.requirements }));
    if (url.pathname === '/api/v1/knowledge' && request.method === 'GET') return jsonResponse(response, 200, { items: knowledge.list(session.workspaceId) });
    if (url.pathname === '/api/v1/knowledge' && request.method === 'POST') return jsonResponse(response, 201, knowledge.propose({ workspaceId: session.workspaceId, actorId: session.actorId, category: body.category, title: body.title, content: body.content, supersedesId: body.supersedes_id }));
    if (parts[2] === 'knowledge' && parts[3] && parts[4] === 'approve' && request.method === 'POST') return jsonResponse(response, 200, knowledge.approve({ workspaceId: session.workspaceId, actorId: session.actorId, itemId: parts[3] }));
    if (parts[2] === 'knowledge' && parts[3] && parts[4] === 'revert' && request.method === 'POST') return jsonResponse(response, 200, knowledge.revert({ workspaceId: session.workspaceId, actorId: session.actorId, itemId: parts[3] }));
    if (url.pathname === '/api/v1/scenarios' && request.method === 'GET') return jsonResponse(response, 200, { scenarios: SCENARIOS });
    if (url.pathname === '/api/v1/providers' && request.method === 'GET') return jsonResponse(response, 200, { providers: providers.list() });
    if (url.pathname === '/api/v1/providers/paperclip/health' && request.method === 'GET') return jsonResponse(response, 200, await providerRead('health', () => { providers.assertPaperclipReady(session.workspaceId); return providers.get('paperclip').health(); }, session));
    if (url.pathname === '/api/v1/providers/paperclip/companies' && request.method === 'GET') return jsonResponse(response, 200, await providerRead('discoverOrganizations', () => { providers.assertPaperclipReady(session.workspaceId); return providers.get('paperclip').discoverOrganizations(); }, session));
    if (parts[2] === 'providers' && parts[3] === 'paperclip' && parts[4] === 'companies' && parts[5] && parts[6] === 'agents' && request.method === 'GET') return jsonResponse(response, 200, await providerRead('discoverAgents', () => { providers.assertPaperclipReady(session.workspaceId); providers.assertCompany(parts[5]); return providers.get('paperclip').discoverAgents(parts[5]); }, session));
    if (url.pathname === '/api/v1/olympus/templates' && request.method === 'GET') return jsonResponse(response, 200, { templates: olympus.templates() });
    if (url.pathname === '/api/v1/olympus/council' && request.method === 'POST') return jsonResponse(response, 201, council.ensure({ workspaceId: session.workspaceId, actorId: session.actorId }));
    if (url.pathname === '/api/v1/olympus/council' && request.method === 'GET') return jsonResponse(response, 200, { name: council.name, members: council.members, workflow: ['DISCOVER', 'PLAN', 'CHALLENGE', 'APPROVE', 'IMPLEMENT', 'TEST', 'REVIEW', 'REPAIR', 'VERIFY', 'RELEASE'] });
    if (url.pathname === '/api/v1/olympus/organizations' && request.method === 'GET') return jsonResponse(response, 200, { organizations: olympus.listOrganizations(session.workspaceId) });
    if (url.pathname === '/api/v1/olympus/organizations' && request.method === 'POST') return jsonResponse(response, 201, olympus.createOrganization({ workspaceId: session.workspaceId, actorId: session.actorId, name: body.name, templateId: body.template_id, objective: body.objective, budgetLimit: body.budget_limit }));
    if (url.pathname === '/api/v1/olympus/organizations/import' && request.method === 'POST') return jsonResponse(response, 201, olympus.importOrganization({ workspaceId: session.workspaceId, actorId: session.actorId, payload: body }));
    if (parts[2] === 'olympus' && parts[3] === 'organizations' && parts[4] && request.method === 'GET' && !parts[5]) return jsonResponse(response, 200, olympus.getOrganization(session.workspaceId, parts[4]));
    if (parts[2] === 'olympus' && parts[3] === 'organizations' && parts[4] && parts[5] === 'export' && request.method === 'GET') return jsonResponse(response, 200, olympus.exportOrganization(session.workspaceId, parts[4]));
    if (parts[2] === 'olympus' && parts[3] === 'organizations' && parts[4] && parts[5] === 'departments' && request.method === 'POST') return jsonResponse(response, 201, olympus.createDepartment({ workspaceId: session.workspaceId, actorId: session.actorId, organizationId: parts[4], name: body.name, objective: body.objective, parentId: body.parent_id }));
    if (parts[2] === 'olympus' && parts[3] === 'organizations' && parts[4] && parts[5] === 'members' && parts[6] && request.method === 'PATCH') return jsonResponse(response, 200, olympus.updateMember({ workspaceId: session.workspaceId, actorId: session.actorId, organizationId: parts[4], agentId: parts[6], changes: body }));
    if (parts[2] === 'olympus' && parts[3] === 'organizations' && parts[4] && parts[5] === 'members' && request.method === 'POST') return jsonResponse(response, 201, olympus.recruitMember({ workspaceId: session.workspaceId, actorId: session.actorId, organizationId: parts[4], agentId: body.agent_id, title: body.title, reportsTo: body.reports_to, departmentId: body.department_id, capabilities: body.capabilities, availability: body.availability }));
    if (parts[2] === 'olympus' && parts[3] === 'organizations' && parts[4] && parts[5] === 'projects' && request.method === 'POST') return jsonResponse(response, 201, olympus.createProject({ workspaceId: session.workspaceId, actorId: session.actorId, organizationId: parts[4], name: body.name, objective: body.objective, ownerAgentId: body.owner_agent_id, status: body.status }));
    if (parts[2] === 'olympus' && parts[3] === 'organizations' && parts[4] && parts[5] === 'objectives' && request.method === 'POST') return jsonResponse(response, 201, olympus.createObjective({ workspaceId: session.workspaceId, actorId: session.actorId, organizationId: parts[4], title: body.title, description: body.description, status: body.status }));
    if (url.pathname === '/api/v1/god-loops' && request.method === 'GET') return jsonResponse(response, 200, { runs: godLoop.list(session.workspaceId) });
    if (url.pathname === '/api/v1/god-loops' && request.method === 'POST') return jsonResponse(response, 201, godLoop.create({ workspaceId: session.workspaceId, actorId: session.actorId, objective: body.objective, repositoryScope: body.repository_scope, acceptanceCriteria: body.acceptance_criteria, allowedTools: body.allowed_tools, authorizedAgents: body.authorized_agents, maxIterations: body.max_iterations, maxConcurrentAgents: body.max_concurrent_agents, maxTimeMs: body.max_time_ms, spendingLimit: body.spending_limit }));
    if (parts[2] === 'god-loops' && parts[3] && !parts[4] && request.method === 'GET') return jsonResponse(response, 200, godLoop.view(session.workspaceId, parts[3]));
    if (parts[2] === 'god-loops' && parts[3] && parts[4] === 'approve' && request.method === 'POST') return jsonResponse(response, 200, godLoop.approve({ workspaceId: session.workspaceId, actorId: session.actorId, runId: parts[3] }));
    if (parts[2] === 'god-loops' && parts[3] && parts[4] === 'events' && request.method === 'POST') return jsonResponse(response, 200, godLoop.appendEvent({ workspaceId: session.workspaceId, actorId: session.actorId, runId: parts[3], eventType: body.event_type, payload: body.payload, iteration: body.iteration }));
    if (parts[2] === 'god-loops' && parts[3] && parts[4] === 'stop' && request.method === 'POST') return jsonResponse(response, 200, godLoop.stop({ workspaceId: session.workspaceId, actorId: session.actorId, runId: parts[3], reason: body.reason }));
    if (url.pathname === '/api/v1/runtime/kill-switch') {
      if (request.method === 'GET') return jsonResponse(response, 200, { active: killSwitch });
      if (request.method === 'POST') { killSwitch = Boolean(body.active); run(db, 'UPDATE workspaces SET kill_switch = ? WHERE id = ?', [killSwitch ? 1 : 0, session.workspaceId]); audit(db, { workspaceId: session.workspaceId, actorId: session.actorId, correlationId: id('corr'), eventType: killSwitch ? 'KILL_SWITCH_ENABLED' : 'KILL_SWITCH_DISABLED', entityType: 'workspace', entityId: session.workspaceId, payload: { active: killSwitch } }); return jsonResponse(response, 200, { active: killSwitch }); }
    }
    if (url.pathname === '/api/v1/tasks' && request.method === 'POST') { if (body.explicit_grants !== undefined) throw new HttpError(403, 'Client-controlled explicit grants are not accepted', 'client_grants_not_allowed'); const task = runtime.createTask({ actorId: session.actorId, workspaceId: session.workspaceId, agentId: body.agent_id, input: body.input || {}, requestedCapabilities: body.requested_capabilities || [], allowedTools: body.allowed_tools || [], dataScope: body.data_scope, timeLimitMs: body.time_limit_ms, budgetLimit: body.budget_limit, idempotencyKey: request.headers['idempotency-key'] || body.idempotency_key || null }); return jsonResponse(response, 201, task); }
    if (url.pathname === '/api/v1/tasks' && request.method === 'GET') return jsonResponse(response, 200, { tasks: all(db, 'SELECT id, agent_id, status, plan_hash, correlation_id, created_at, started_at, completed_at, error_code, error_message FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100', [session.workspaceId]) });
    if (parts[2] === 'tasks' && parts[3]) return await taskRoute(request, response, parts[3], parts[4], body, session);
    if (url.pathname === '/api/v1/workflows' && request.method === 'GET') return jsonResponse(response, 200, { workflows: workflows.listWorkflows(session.workspaceId) });
    if (url.pathname === '/api/v1/workflows' && request.method === 'POST') return jsonResponse(response, 201, workflows.createWorkflow({ workspaceId: session.workspaceId, name: body.name, description: body.description, definition: body.definition }));
    if (parts[2] === 'workflows' && parts[3] && parts[4] === 'runs' && request.method === 'POST') { if (body.explicit_grants !== undefined) throw new HttpError(403, 'Client-controlled explicit grants are not accepted', 'client_grants_not_allowed'); return jsonResponse(response, 201, workflows.createRun({ workspaceId: session.workspaceId, actorId: session.actorId, workflowId: parts[3], input: body.input || {}, idempotencyKey: request.headers['idempotency-key'] || body.idempotency_key, authorization: { allowedTools: body.allowed_tools || [], dataScope: body.data_scope, timeLimitMs: body.time_limit_ms, budgetLimit: body.budget_limit } })); }
    if (parts[2] === 'workflows' && parts[3] && request.method === 'GET') return jsonResponse(response, 200, workflows.getWorkflow(parts[3], session.workspaceId));
    if (parts[2] === 'workflow-runs' && parts[3]) return await workflowRunRoute(request, response, parts[3], parts[4], body, session);
    if (parts[2] === 'scenarios' && parts[3] === 'run' && request.method === 'POST') return await runScenario(response, body, session);
    throw new HttpError(404, 'API route not found', 'route_not_found');
  }

  async function taskRoute(request, response, taskId, action, body, session) {
    if (request.method === 'GET' && !action) return jsonResponse(response, 200, runtime.getTask(taskId, session.workspaceId));
    if (request.method === 'POST' && action === 'validate') return jsonResponse(response, 200, runtime.validateTask(taskId, session.workspaceId, session.actorId));
    if (request.method === 'POST' && action === 'request-approval') return jsonResponse(response, 200, runtime.requestApproval(taskId, session.workspaceId, session.actorId));
    if (request.method === 'POST' && action === 'approve') return jsonResponse(response, 200, runtime.approveTask(taskId, session.workspaceId, session.actorId, body.decision || 'APPROVED', body.reason || ''));
    if (request.method === 'POST' && action === 'execute') return jsonResponse(response, 202, await runtime.executeTask(taskId, session.workspaceId, session.actorId));
    if (request.method === 'POST' && action === 'cancel') return jsonResponse(response, 200, runtime.cancelTask(taskId, session.workspaceId, session.actorId));
    if (request.method === 'GET' && action === 'events') return jsonResponse(response, 200, { events: all(db, 'SELECT * FROM audit_events WHERE entity_type = ? AND entity_id = ? ORDER BY created_at', ['task', taskId]).map(parseAudit) });
    throw new HttpError(404, 'Task route not found', 'route_not_found');
  }

  async function workflowRunRoute(request, response, runId, action, body, session) {
    if (request.method === 'GET' && !action) return jsonResponse(response, 200, workflows.getRun(runId, session.workspaceId));
    if (request.method === 'POST' && action === 'request-approval') return jsonResponse(response, 200, workflows.requestApproval(runId, session.workspaceId, session.actorId));
    if (request.method === 'POST' && action === 'approve') return jsonResponse(response, 200, workflows.approveRun(runId, session.workspaceId, session.actorId, body.decision || 'APPROVED', body.reason || ''));
    if (request.method === 'POST' && action === 'execute') return jsonResponse(response, 202, workflows.start(runId, session.workspaceId, session.actorId));
    if (request.method === 'POST' && action === 'resume') return jsonResponse(response, 202, workflows.start(runId, session.workspaceId, session.actorId));
    if (request.method === 'POST' && action === 'cancel') return jsonResponse(response, 200, workflows.cancel(runId, session.workspaceId, session.actorId));
    if (request.method === 'GET' && action === 'events') return jsonResponse(response, 200, { events: all(db, 'SELECT * FROM audit_events WHERE entity_type = ? AND entity_id = ? ORDER BY created_at', ['workflow_run', runId]).map(parseAudit), handoffs: all(db, 'SELECT * FROM handoffs WHERE workflow_run_id = ? ORDER BY created_at', [runId]).map((row) => ({ ...row, input: JSON.parse(row.input_json), output: row.output_json ? JSON.parse(row.output_json) : null, evidence: JSON.parse(row.evidence_json) })) });
    throw new HttpError(404, 'Workflow run route not found', 'route_not_found');
  }

  async function runScenario(response, body, session) {
    if (body.explicit_grants !== undefined || body.grants !== undefined || body.allowed_tools !== undefined) throw new HttpError(403, 'Scenario execution policy is server-controlled', 'client_policy_not_allowed');
    const scenario = scenarioById(body.scenario_id);
    if (!scenario) throw new HttpError(404, 'Scenario not found', 'scenario_not_found');
    const workflow = workflows.createWorkflow({ workspaceId: session.workspaceId, name: `${scenario.name} demo`, description: scenario.description, definition: scenarioDefinition(scenario) });
    const created = workflows.createRun({ workspaceId: session.workspaceId, actorId: session.actorId, workflowId: workflow.id, input: body.input || scenario.input, authorization: { allowedTools: scenario.tools, grantContext: { source: 'offline-demo', scenarioId: scenario.id }, timeLimitMs: 5_000, budgetLimit: scenario.agents.length }, idempotencyKey: body.idempotency_key });
    workflows.requestApproval(created.id, session.workspaceId, session.actorId, { approvalMode: 'demo' });
    workflows.approveRun(created.id, session.workspaceId, session.actorId, 'APPROVED', 'Trusted offline demonstration policy approval; not independent human authorization', { trustedDemo: true });
    const started = workflows.start(created.id, session.workspaceId, session.actorId);
    return jsonResponse(response, 202, { scenario_id: scenario.id, run: started, expected_mode: 'deterministic-local', approval_mode: 'demo', human_authorization: false });
  }

  async function providerRead(operation, callback, session) {
    try {
      const value = await callback();
      audit(db, { workspaceId: session.workspaceId, actorId: session.actorId, correlationId: id('corr'), eventType: 'PROVIDER_READ', entityType: 'provider', entityId: 'paperclip', payload: { operation, status: 'success' } });
      return value;
    } catch (error) {
      audit(db, { workspaceId: session.workspaceId, actorId: session.actorId, correlationId: id('corr'), eventType: 'PROVIDER_READ', entityType: 'provider', entityId: 'paperclip', payload: { operation, status: 'failed', error_code: error.code || 'provider_error' } });
      throw error;
    }
  }

  return {
    server,
    db,
    runtime,
    workflows,
    olympus,
    council,
    godLoop,
    taskRouter,
    knowledge,
    catalog,
    start: () => new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server.address()))),
    close: () => new Promise((resolve, reject) => {
      if (!server.listening) { closeDatabase(db); resolve(); return; }
      server.close((error) => { closeDatabase(db); error ? reject(error) : resolve(); });
    })
  };
}

function seedCatalog(db, catalog, workspaceId) {
  for (const role of catalog.roles) run(db, 'INSERT OR IGNORE INTO agent_configs(agent_id, enabled, config_json, updated_at) VALUES (?, ?, ?, ?)', [role.name, role.runtime ? 1 : 0, JSON.stringify({ catalog_runtime: role.runtime, execution_mode: role.runtime ? 'deterministic-local' : 'registry-only' }), now()]);
  for (const template of catalog.workflow_templates) {
    const definition = { max_concurrency: 1, steps: template.steps.map((step, index) => ({ id: `${template.id}-${index + 1}`, agent_id: step.role, depends_on: index ? [`${template.id}-${index}`] : [], input_contract: { type: 'object' }, output_contract: { type: 'object' }, input_template: {}, retry_limit: 0 })) };
    run(db, 'INSERT OR IGNORE INTO workflows(id, workspace_id, name, description, definition_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [template.id, workspaceId, template.name, template.description, JSON.stringify(definition), 1, now(), now()]);
  }
}

function parseAudit(row) { return { ...row, payload: JSON.parse(row.payload_json) }; }
function hostAllowed(request, port) {
  const header = request.headers.host;
  if (!header) return false;
  try {
    const parsed = new URL(`http://${header}`);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) return false;
    return port === 0 || parsed.port === String(port);
  } catch { return false; }
}
function originAllowed(request, port) { const origin = request.headers.origin; if (!origin) return true; if (port === 0) return origin === `http://${request.headers.host}`; return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`; }
function rateAllowed(request) { const key = request.socket.remoteAddress || 'local'; const current = rateMap.get(key) || { started: Date.now(), count: 0 }; if (Date.now() - current.started > 60_000) { current.started = Date.now(); current.count = 0; } current.count += 1; rateMap.set(key, current); return current.count <= 240; }
const rateMap = new Map();

function serveStatic(request, response, pathname, root) {
  if (pathname === '/') { response.writeHead(302, { Location: '/dashboard/' }); return response.end(); }
  const normalized = pathname === '/dashboard' ? '/dashboard/' : pathname;
  const allowed = new Set(['/dashboard/index.html', '/dashboard/app.js', '/dashboard/experiences.js', '/dashboard/styles.css', '/catalog/roles.json']);
  const targetPath = normalized.endsWith('/') ? `${normalized}index.html` : normalized;
  if (!allowed.has(targetPath)) throw new HttpError(404, 'Not found', 'not_found');
  const file = path.resolve(root, `.${targetPath}`);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) throw new HttpError(404, 'Not found', 'not_found');
  response.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
  fs.createReadStream(file).pipe(response);
}
