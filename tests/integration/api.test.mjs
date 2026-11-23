import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../../server/api.mjs';

const root = path.resolve(import.meta.dirname, '../..');

async function makeApp() {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-api-'));
  const app = createApp({ root, dataDirectory, port: 0 });
  const address = await app.start();
  return { app, base: `http://127.0.0.1:${address.port}` };
}

async function request(base, pathName, options = {}, cookie = '') {
  const headers = { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) };
  const response = await fetch(`${base}${pathName}`, { ...options, headers });
  const body = await response.json();
  return { response, body, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

async function waitForRun(base, runId, cookie) {
  for (let index = 0; index < 40; index += 1) {
    const result = await request(base, `/api/v1/workflow-runs/${runId}`, {}, cookie);
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(result.body.status)) return result.body;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('workflow did not reach a terminal state');
}

test('API enforces session, approval lifecycle, deterministic execution, and evidence events', async () => {
  const { app, base } = await makeApp();
  try {
    const health = await request(base, '/api/v1/health');
    assert.equal(health.body.ok, true);
    const unauthenticated = await request(base, '/api/v1/agents');
    assert.equal(unauthenticated.response.status, 401);
    const session = await request(base, '/api/v1/session');
    const cookie = session.cookie;
    const created = await request(base, '/api/v1/tasks', { method: 'POST', body: JSON.stringify({ agent_id: 'solution_architect', input: { requirements: ['bounded execution'] }, allowed_tools: ['schema.validate'] }) }, cookie);
    assert.equal(created.response.status, 201);
    const taskId = created.body.id;
    const replay = await request(base, '/api/v1/tasks', { method: 'POST', body: JSON.stringify({ agent_id: 'solution_architect', input: { requirements: ['bounded execution'] }, allowed_tools: ['schema.validate'], idempotency_key: 'api-lifecycle-task-1' }) }, cookie);
    const replayAgain = await request(base, '/api/v1/tasks', { method: 'POST', body: JSON.stringify({ agent_id: 'solution_architect', input: { requirements: ['different input must not replay without same key'] }, allowed_tools: ['schema.validate'], idempotency_key: 'api-lifecycle-task-1' }) }, cookie);
    assert.equal(replay.body.id, replayAgain.body.id);
    assert.equal((await request(base, `/api/v1/tasks/${taskId}/validate`, { method: 'POST', body: '{}' }, cookie)).body.status, 'VALIDATED');
    assert.equal((await request(base, `/api/v1/tasks/${taskId}/request-approval`, { method: 'POST', body: '{}' }, cookie)).body.status, 'AWAITING_APPROVAL');
    assert.equal((await request(base, `/api/v1/tasks/${taskId}/approve`, { method: 'POST', body: '{}' }, cookie)).body.status, 'APPROVED');
    const executed = await request(base, `/api/v1/tasks/${taskId}/execute`, { method: 'POST', body: '{}' }, cookie);
    assert.equal(executed.body.status, 'COMPLETED');
    const events = await request(base, `/api/v1/tasks/${taskId}/events`, {}, cookie);
    assert.ok(events.body.events.some((event) => event.event_type === 'TASK_COMPLETED'));
  } finally { await app.close(); }
});

test('five offline scenarios use real persisted workflow runs and bounded failure recovery', async () => {
  const { app, base } = await makeApp();
  try {
    const session = await request(base, '/api/v1/session');
    const cookie = session.cookie;
    const scenarios = (await request(base, '/api/v1/scenarios', {}, cookie)).body.scenarios;
    assert.equal(scenarios.length, 5);
    for (const scenario of scenarios) {
      const started = await request(base, `/api/v1/scenarios/run`, { method: 'POST', body: JSON.stringify({ scenario_id: scenario.id }) }, cookie);
      assert.equal(started.response.status, 202);
      const completed = await waitForRun(base, started.body.run.id, cookie);
      assert.ok(['COMPLETED', 'FAILED'].includes(completed.status));
      if (scenario.id === 'workflow-recovery') assert.equal(completed.status, 'FAILED');
      else assert.equal(completed.status, 'COMPLETED');
      const evidence = await request(base, `/api/v1/workflow-runs/${completed.id}/events`, {}, cookie);
      assert.ok(Array.isArray(evidence.body.events));
    }
  } finally { await app.close(); }
});
