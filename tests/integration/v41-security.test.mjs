import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../../server/api.mjs';
import { run } from '../../server/db.mjs';
import { sleep } from '../../server/util.mjs';

const root = path.resolve(import.meta.dirname, '../..');

async function makeServer() {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-v41-'));
  const app = createApp({ root, dataDirectory, port: 0 });
  const address = await app.start();
  return { app, base: `http://127.0.0.1:${address.port}` };
}

async function request(base, pathName, options = {}, cookie = '') {
  const response = await fetch(`${base}${pathName}`, { ...options, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  return { response, body, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
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

function createTask(app, agentId = 'solution_architect', input = { requirements: ['v41'] }, options = {}) {
  const task = app.runtime.createTask({ actorId: 'local-operator', workspaceId: 'local-workspace', agentId, input, allowedTools: options.allowedTools || ['schema.validate'], timeLimitMs: options.timeLimitMs, grantContext: options.grantContext });
  app.runtime.validateTask(task.id, 'local-workspace', 'local-operator');
  app.runtime.requestApproval(task.id, 'local-workspace', 'local-operator');
  return task;
}

function approveTask(app, taskId, decision = 'APPROVED') {
  return app.runtime.approveTask(taskId, 'local-workspace', 'local-operator', decision, 'V4.1 test decision');
}

test('rejects malicious client grants across task, custom workflow, and scenario APIs', async () => {
  const { app, base } = await makeServer();
  try {
    const session = await request(base, '/api/v1/session');
    const cookie = session.cookie;
    const task = await request(base, '/api/v1/tasks', { method: 'POST', body: JSON.stringify({ agent_id: 'risk_analyst', input: {}, explicit_grants: ['risk_analyst'], allowed_tools: ['risk.score'] }) }, cookie);
    assert.equal(task.response.status, 403);
    const workflow = await request(base, '/api/v1/workflows', { method: 'POST', body: JSON.stringify({ name: 'Malicious grants', definition: { max_concurrency: 1, steps: [{ id: 'risk', agent_id: 'risk_analyst', input_contract: { type: 'object' }, output_contract: { type: 'object' } }] } }) }, cookie);
    assert.equal(workflow.response.status, 201);
    const customGrant = await request(base, `/api/v1/workflows/${workflow.body.id}/runs`, { method: 'POST', body: JSON.stringify({ input: {}, allowed_tools: ['risk.score'], explicit_grants: ['risk_analyst'] }) }, cookie);
    assert.equal(customGrant.response.status, 403);
    const customNoGrant = await request(base, `/api/v1/workflows/${workflow.body.id}/runs`, { method: 'POST', body: JSON.stringify({ input: {}, allowed_tools: ['risk.score'] }) }, cookie);
    assert.equal(customNoGrant.response.status, 403);
    const scenarioPolicy = await request(base, '/api/v1/scenarios/run', { method: 'POST', body: JSON.stringify({ scenario_id: 'risk-assessment', allowed_tools: ['shell.exec'], explicit_grants: ['risk_analyst'] }) }, cookie);
    assert.equal(scenarioPolicy.response.status, 403);
    const normalScenario = await request(base, '/api/v1/scenarios/run', { method: 'POST', body: JSON.stringify({ scenario_id: 'risk-assessment' }) }, cookie);
    assert.equal(normalScenario.response.status, 202);
    assert.equal(normalScenario.body.approval_mode, 'demo');
    assert.equal(normalScenario.body.human_authorization, false);
    const hostDenied = await rawRequest(base, '/api/v1/health', { Host: 'evil.example' });
    assert.equal(hostDenied.statusCode, 403);
    const malformedCookie = await request(base, '/api/v1/agents', { headers: { Cookie: 'af_session=%ZZ' } });
    assert.equal(malformedCookie.response.status, 401);
  } finally { await app.close(); }
});

test('enforces one-way approval transitions and rejects revoked or forged executions', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-v41-approval-'));
  const app = createApp({ root, dataDirectory, port: 0 });
  try {
    const task = createTask(app);
    approveTask(app, task.id);
    assert.throws(() => approveTask(app, task.id), (error) => error.code === 'invalid_state');
    const cancelled = createTask(app);
    app.runtime.cancelTask(cancelled.id, 'local-workspace', 'local-operator');
    assert.throws(() => approveTask(app, cancelled.id), (error) => error.code === 'invalid_state');
    const rejected = createTask(app);
    approveTask(app, rejected.id, 'REJECTED');
    assert.throws(() => approveTask(app, rejected.id), (error) => error.code === 'invalid_state');
    const revoked = createTask(app);
    approveTask(app, revoked.id);
    run(app.db, 'UPDATE execution_authorizations SET revoked_at = ? WHERE id = ?', [new Date().toISOString(), revoked.authorization_id]);
    await assert.rejects(() => app.runtime.executeTask(revoked.id, 'local-workspace', 'local-operator'), (error) => error.code === 'authorization_invalid');
    const forged = createTask(app);
    approveTask(app, forged.id);
    run(app.db, 'UPDATE tasks SET plan_hash = ? WHERE id = ?', ['forged-plan-hash', forged.id]);
    await assert.rejects(() => app.runtime.executeTask(forged.id, 'local-workspace', 'local-operator'), (error) => error.code === 'plan_hash_mismatch');
  } finally { app.close(); }
});

test('cancellation and timeout remain authoritative for tasks and tools', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-v41-cancel-'));
  const app = createApp({ root, dataDirectory, port: 0 });
  try {
    const cancelled = createTask(app, 'solution_architect', { requirements: ['cancel'], simulated_delay_ms: 500 });
    approveTask(app, cancelled.id);
    const running = app.runtime.executeTask(cancelled.id, 'local-workspace', 'local-operator');
    await sleep(30);
    assert.equal(app.runtime.cancelTask(cancelled.id, 'local-workspace', 'local-operator').status, 'CANCELLED');
    const cancelledResult = await running;
    assert.equal(cancelledResult.status, 'CANCELLED');
    assert.equal(cancelledResult.output, null);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE entity_id = ? AND event_type = 'TASK_COMPLETED'").get(cancelled.id).count, 0);
    const timedOut = createTask(app, 'solution_architect', { requirements: ['timeout'], simulated_delay_ms: 500 }, { timeLimitMs: 100 });
    approveTask(app, timedOut.id);
    const timeoutResult = await app.runtime.executeTask(timedOut.id, 'local-workspace', 'local-operator');
    assert.equal(timeoutResult.status, 'TIMED_OUT');
    const toolTimedOut = createTask(app, 'solution_architect', { requirements: ['tool timeout'], simulated_tool_delay_ms: 1_000 }, { timeLimitMs: 5_000 });
    approveTask(app, toolTimedOut.id);
    const toolTimeoutResult = await app.runtime.executeTask(toolTimedOut.id, 'local-workspace', 'local-operator');
    assert.equal(toolTimeoutResult.status, 'TIMED_OUT');
    assert.equal(app.db.prepare("SELECT status FROM tool_invocations WHERE task_id = ? ORDER BY created_at DESC LIMIT 1").get(toolTimedOut.id).status, 'TIMED_OUT');
  } finally { await app.close(); }
});

test('cancels active workflow steps and resumes only durable completed checkpoints', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-v41-recovery-'));
  const first = createApp({ root, dataDirectory, port: 0 });
  try {
    const definition = { max_concurrency: 1, steps: [
      { id: 'architecture', agent_id: 'solution_architect', input_contract: { type: 'object' }, output_contract: { type: 'object' }, input_template: { requirements: ['checkpoint'] } },
      { id: 'security', agent_id: 'security_engineer', depends_on: ['architecture'], input_contract: { type: 'object' }, output_contract: { type: 'object' }, input_template: { requirements: ['checkpoint'], simulated_delay_ms: 500 } }
    ] };
    const workflow = first.workflows.createWorkflow({ workspaceId: 'local-workspace', name: 'V4.1 recovery', definition });
    const runRecord = first.workflows.createRun({ workspaceId: 'local-workspace', actorId: 'local-operator', workflowId: workflow.id, input: {}, authorization: { allowedTools: ['schema.validate'], timeLimitMs: 5_000, budgetLimit: 2 } });
    first.workflows.requestApproval(runRecord.id, 'local-workspace', 'local-operator');
    first.workflows.approveRun(runRecord.id, 'local-workspace', 'local-operator');
    first.workflows.start(runRecord.id, 'local-workspace', 'local-operator');
    await sleep(30);
    const cancelled = first.workflows.cancel(runRecord.id, 'local-workspace', 'local-operator');
    assert.equal(cancelled.status, 'CANCELLED');
    await first.workflows.active.get(runRecord.id)?.promise;
    const second = createApp({ root, dataDirectory, port: 0 });
    try {
      const partial = second.workflows.createRun({ workspaceId: 'local-workspace', actorId: 'local-operator', workflowId: workflow.id, input: {}, authorization: { allowedTools: ['schema.validate'], timeLimitMs: 5_000, budgetLimit: 2 } });
      second.workflows.requestApproval(partial.id, 'local-workspace', 'local-operator');
      second.workflows.approveRun(partial.id, 'local-workspace', 'local-operator');
      run(second.db, 'UPDATE workflow_runs SET status = ? WHERE id = ?', ['RUNNING', partial.id]);
      run(second.db, 'UPDATE workflow_run_steps SET status = ?, attempts = ?, output_json = ?, evidence_json = ?, completed_at = ? WHERE workflow_run_id = ? AND step_id = ?', ['COMPLETED', 1, JSON.stringify({ checkpoint: true }), JSON.stringify([{ checkpoint: true }]), new Date().toISOString(), partial.id, 'architecture']);
      second.workflows.recover();
      assert.equal(second.workflows.getRun(partial.id, 'local-workspace').status, 'RECOVERABLE');
      second.workflows.start(partial.id, 'local-workspace', 'local-operator');
      for (let index = 0; index < 50; index += 1) { const current = second.workflows.getRun(partial.id, 'local-workspace'); if (current.status === 'COMPLETED') { assert.equal(current.steps[0].attempts, 1); assert.equal(current.steps[1].status, 'COMPLETED'); return; } await sleep(25); }
      assert.fail('checkpointed workflow did not complete');
    } finally { await second.close(); }
  } finally { await first.close(); }
});

test('rejects cycles, forward dependencies, invalid concurrency, and unauthorized workflow steps', () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-v41-graph-'));
  const app = createApp({ root, dataDirectory, port: 0 });
  try {
    const base = (stepExtra = {}, definitionExtra = {}) => ({ max_concurrency: 1, ...definitionExtra, steps: [{ id: 'a', agent_id: 'solution_architect', input_contract: { type: 'object' }, output_contract: { type: 'object' }, ...stepExtra }] });
    assert.throws(() => app.workflows.createWorkflow({ workspaceId: 'local-workspace', name: 'self', definition: base({ depends_on: ['a'] }) }), (error) => error.code === 'invalid_workflow');
    assert.throws(() => app.workflows.createWorkflow({ workspaceId: 'local-workspace', name: 'cycle', definition: { max_concurrency: 1, steps: [{ id: 'a', agent_id: 'solution_architect', depends_on: ['b'], input_contract: { type: 'object' }, output_contract: { type: 'object' } }, { id: 'b', agent_id: 'security_engineer', depends_on: ['a'], input_contract: { type: 'object' }, output_contract: { type: 'object' } }] } }), (error) => error.code === 'invalid_workflow');
    assert.throws(() => app.workflows.createWorkflow({ workspaceId: 'local-workspace', name: 'concurrency', definition: base({}, { max_concurrency: 3 }) }), (error) => error.code === 'invalid_workflow');
    const unauthorized = app.workflows.createWorkflow({ workspaceId: 'local-workspace', name: 'unauthorized', definition: { max_concurrency: 1, steps: [{ id: 'risk', agent_id: 'risk_analyst', input_contract: { type: 'object' }, output_contract: { type: 'object' } }] } });
    assert.throws(() => app.workflows.createRun({ workspaceId: 'local-workspace', actorId: 'local-operator', workflowId: unauthorized.id, input: {}, authorization: { allowedTools: ['risk.score'] } }), (error) => error.code === 'registry_only_denied');
  } finally { app.close(); }
});

test('keeps workflow demo approval separate from human approval and rechecks revocation', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-v41-workflow-approval-'));
  const app = createApp({ root, dataDirectory, port: 0 });
  try {
    const workflow = app.workflows.createWorkflow({ workspaceId: 'local-workspace', name: 'approval boundary', definition: { max_concurrency: 1, steps: [{ id: 'architecture', agent_id: 'solution_architect', input_contract: { type: 'object' }, output_contract: { type: 'object' } }] } });
    const runRecord = app.workflows.createRun({ workspaceId: 'local-workspace', actorId: 'local-operator', workflowId: workflow.id, input: {}, authorization: { allowedTools: ['schema.validate'] } });
    app.workflows.requestApproval(runRecord.id, 'local-workspace', 'local-operator');
    app.workflows.approveRun(runRecord.id, 'local-workspace', 'local-operator');
    assert.throws(() => app.workflows.approveRun(runRecord.id, 'local-workspace', 'local-operator'), (error) => error.code === 'invalid_state');
    run(app.db, 'UPDATE execution_authorizations SET revoked_at = ? WHERE id = ?', [new Date().toISOString(), runRecord.authorization_id]);
    assert.throws(() => app.workflows.start(runRecord.id, 'local-workspace', 'local-operator'), (error) => error.code === 'authorization_invalid');

    const demoWorkflow = app.workflows.createWorkflow({ workspaceId: 'local-workspace', name: 'demo boundary', definition: { max_concurrency: 1, steps: [{ id: 'risk', agent_id: 'risk_analyst', input_contract: { type: 'object' }, output_contract: { type: 'object' } }] } });
    const demoRun = app.workflows.createRun({ workspaceId: 'local-workspace', actorId: 'local-operator', workflowId: demoWorkflow.id, input: {}, authorization: { allowedTools: ['risk.score'], grantContext: { source: 'offline-demo', scenarioId: 'risk-assessment' } } });
    app.workflows.requestApproval(demoRun.id, 'local-workspace', 'local-operator', { approvalMode: 'demo' });
    assert.throws(() => app.workflows.approveRun(demoRun.id, 'local-workspace', 'local-operator'), (error) => error.code === 'demo_approval_denied');
    app.workflows.approveRun(demoRun.id, 'local-workspace', 'local-operator', 'APPROVED', 'trusted test demo', { trustedDemo: true });
  } finally { await app.close(); }
});
