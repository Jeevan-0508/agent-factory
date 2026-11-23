import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../../server/api.mjs';
import { run } from '../../server/db.mjs';

const root = path.resolve(import.meta.dirname, '../..');

async function request(base, pathName, options = {}, cookie = '') {
  const response = await fetch(`${base}${pathName}`, { ...options, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) } });
  const body = await response.json();
  return { response, body, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

test('marks interrupted workflow runs recoverable after restart and resumes them', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-recovery-'));
  const first = createApp({ root, dataDirectory, port: 0 });
  const address = await first.start();
  const base = `http://127.0.0.1:${address.port}`;
  const session = await request(base, '/api/v1/session');
  const workflow = await request(base, '/api/v1/workflows', { method: 'POST', body: JSON.stringify({ name: 'Recovery proof', description: 'restart proof', definition: { max_concurrency: 1, steps: [{ id: 'architect', agent_id: 'solution_architect', input_contract: { type: 'object' }, output_contract: { type: 'object' }, input_template: { requirements: ['restart'] }, retry_limit: 0 }] } }) }, session.cookie);
  const created = await request(base, `/api/v1/workflows/${workflow.body.id}/runs`, { method: 'POST', body: JSON.stringify({ input: { requirements: ['restart'] }, allowed_tools: ['schema.validate'] }) }, session.cookie);
  await request(base, `/api/v1/workflow-runs/${created.body.id}/request-approval`, { method: 'POST', body: '{}' }, session.cookie);
  await request(base, `/api/v1/workflow-runs/${created.body.id}/approve`, { method: 'POST', body: '{}' }, session.cookie);
  run(first.db, 'UPDATE workflow_runs SET status = ? WHERE id = ?', ['RUNNING', created.body.id]);
  await first.close();

  const second = createApp({ root, dataDirectory, port: 0 });
  try {
    const recovered = second.workflows.getRun(created.body.id, 'local-workspace');
    assert.equal(recovered.status, 'RECOVERABLE');
    second.workflows.start(created.body.id, 'local-workspace', 'local-operator');
    for (let index = 0; index < 40; index += 1) {
      const current = second.workflows.getRun(created.body.id, 'local-workspace');
      if (current.status === 'COMPLETED') return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.fail('recovered workflow did not complete');
  } finally { await second.close(); }
});
