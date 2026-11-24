import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../../server/api.mjs';

const root = path.resolve(import.meta.dirname, '../..');

async function makeApp() {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-loop-'));
  const app = createApp({ root, dataDirectory, port: 0 });
  const address = await app.start();
  return { app, base: `http://127.0.0.1:${address.port}` };
}

async function request(base, pathName, options = {}, cookie = '') {
  const response = await fetch(`${base}${pathName}`, { ...options, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) } });
  return { response, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

test('Engineering Council is catalog-backed and GOD LOOP stays bounded and approval-gated', async () => {
  const { app, base } = await makeApp();
  try {
    const session = await request(base, '/api/v1/session');
    const cookie = session.cookie;
    const council = await request(base, '/api/v1/olympus/council', { method: 'POST', body: JSON.stringify({}) }, cookie);
    assert.equal(council.response.status, 201);
    assert.equal(council.body.name, 'OLYMPUS ENGINEERING COUNCIL');
    assert.equal(council.body.counts.members, 10);
    assert.ok(council.body.members.some((member) => member.agent_id === 'ai_governance_manager'));
    assert.ok(council.body.members.filter((member) => member.reports_to === 'solution_architect').length >= 9);
    const councilAgain = await request(base, '/api/v1/olympus/council', { method: 'POST', body: JSON.stringify({}) }, cookie);
    assert.equal(councilAgain.body.id, council.body.id);
    assert.equal(councilAgain.body.counts.members, 10);

    const created = await request(base, '/api/v1/god-loops', { method: 'POST', body: JSON.stringify({ objective: 'Verify a reversible dashboard repair', repository_scope: 'dashboard/app.js', acceptance_criteria: ['Regression test passes', 'No accessibility regression'], allowed_tools: ['schema.validate'], authorized_agents: ['solution_architect', 'qa_test_engineer'], max_iterations: 2, max_concurrent_agents: 2, max_time_ms: 60000, spending_limit: 0, approval_required: true }) }, cookie);
    assert.equal(created.response.status, 201);
    assert.equal(created.body.status, 'AWAITING_APPROVAL');
    const loopId = created.body.id;
    const beforeApproval = await request(base, `/api/v1/god-loops/${loopId}/events`, { method: 'POST', body: JSON.stringify({ event_type: 'INSPECTION_RECORDED', payload: { finding: 'none' } }) }, cookie);
    assert.equal(beforeApproval.response.status, 409);
    const approved = await request(base, `/api/v1/god-loops/${loopId}/approve`, { method: 'POST', body: JSON.stringify({}) }, cookie);
    assert.equal(approved.body.status, 'APPROVED');
    await request(base, `/api/v1/god-loops/${loopId}/events`, { method: 'POST', body: JSON.stringify({ event_type: 'INSPECTION_RECORDED', iteration: 1, payload: { evidence_ref: 'operator-noted' } }) }, cookie);
    const backward = await request(base, `/api/v1/god-loops/${loopId}/events`, { method: 'POST', body: JSON.stringify({ event_type: 'INSPECTION_RECORDED', iteration: 0, payload: {} }) }, cookie);
    assert.equal(backward.response.status, 409);
    const completed = await request(base, `/api/v1/god-loops/${loopId}/events`, { method: 'POST', body: JSON.stringify({ event_type: 'ITERATION_COMPLETED', iteration: 2, payload: { acceptance_checked: true } }) }, cookie);
    assert.equal(completed.body.status, 'BLOCKED');
    assert.equal(completed.body.stop_reason, 'iteration_limit');
    const duplicate = await request(base, `/api/v1/god-loops/${loopId}/approve`, { method: 'POST', body: JSON.stringify({}) }, cookie);
    assert.equal(duplicate.response.status, 409);

    const recursive = await request(base, '/api/v1/god-loops', { method: 'POST', body: JSON.stringify({ objective: 'Invalid loop', repository_scope: 'server', acceptance_criteria: ['stop'], authorized_agents: ['self'] }) }, cookie);
    assert.equal(recursive.response.status, 400);
    const invalidConcurrency = await request(base, '/api/v1/god-loops', { method: 'POST', body: JSON.stringify({ objective: 'Invalid bounds', repository_scope: 'server', acceptance_criteria: ['stop'], authorized_agents: ['solution_architect'], max_concurrent_agents: 6 }) }, cookie);
    assert.equal(invalidConcurrency.response.status, 400);
    const invalidRole = await request(base, '/api/v1/god-loops', { method: 'POST', body: JSON.stringify({ objective: 'Invalid role', repository_scope: 'server', acceptance_criteria: ['stop'], authorized_agents: ['invented_agent'] }) }, cookie);
    assert.equal(invalidRole.response.status, 400);
    const invalidTool = await request(base, '/api/v1/god-loops', { method: 'POST', body: JSON.stringify({ objective: 'Invalid tool', repository_scope: 'server', acceptance_criteria: ['stop'], allowed_tools: ['shell.exec'], authorized_agents: ['solution_architect'] }) }, cookie);
    assert.equal(invalidTool.response.status, 400);
    const forgedCompletion = await request(base, `/api/v1/god-loops/${loopId}/stop`, { method: 'POST', body: JSON.stringify({ reason: 'acceptance_satisfied' }) }, cookie);
    assert.equal(forgedCompletion.response.status, 409);

    const usage = await request(base, '/api/v1/god-loops', { method: 'POST', body: JSON.stringify({ objective: 'Reject untrusted usage claims', repository_scope: 'server', acceptance_criteria: ['usage is trusted'], allowed_tools: ['schema.validate'], authorized_agents: ['solution_architect'] }) }, cookie);
    const usageApproved = await request(base, `/api/v1/god-loops/${usage.body.id}/approve`, { method: 'POST', body: JSON.stringify({}) }, cookie);
    assert.equal(usageApproved.body.status, 'APPROVED');
    const forgedUsage = await request(base, `/api/v1/god-loops/${usage.body.id}/events`, { method: 'POST', body: JSON.stringify({ event_type: 'IMPLEMENTATION_RECORDED', payload: { active_agents: 999, spending_used: 999 } }) }, cookie);
    assert.equal(forgedUsage.response.status, 403);
    assert.equal(forgedUsage.body.error, 'machine_usage_evidence_required');
    assert.throws(() => app.godLoop.completeVerified({ workspaceId: 'local-workspace', actorId: 'local-operator', runId: usage.body.id, verification: { source: 'machine', evidence_origin: 'machine_generated', criteria_passed: true, evidence_ref: 'forged' } }), (error) => error.code === 'machine_verification_invalid');
  } finally { await app.close(); }
});
