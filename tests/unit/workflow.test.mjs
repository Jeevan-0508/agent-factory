import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../../server/api.mjs';

const root = path.resolve(import.meta.dirname, '../..');

test('schedules independent steps in a bounded parallel batch', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-parallel-'));
  const app = createApp({ root, dataDirectory, port: 0 });
  try {
    const workflow = app.workflows.createWorkflow({ workspaceId: 'local-workspace', name: 'Bounded parallel proof', definition: {
      max_concurrency: 2,
      steps: [
        { id: 'architecture', agent_id: 'solution_architect', input_contract: { type: 'object' }, output_contract: { type: 'object' }, input_template: { requirements: ['parallel A'] }, retry_limit: 0 },
        { id: 'security', agent_id: 'security_engineer', input_contract: { type: 'object' }, output_contract: { type: 'object' }, input_template: { requirements: ['parallel B'] }, retry_limit: 0 }
      ]
    } });
    const created = app.workflows.createRun({ workspaceId: 'local-workspace', actorId: 'local-operator', workflowId: workflow.id, input: {}, authorization: { allowedTools: ['schema.validate'], timeLimitMs: 5_000, budgetLimit: 2 } });
    app.workflows.requestApproval(created.id, 'local-workspace', 'local-operator');
    app.workflows.approveRun(created.id, 'local-workspace', 'local-operator');
    app.workflows.start(created.id, 'local-workspace', 'local-operator');
    for (let index = 0; index < 40; index += 1) {
      const current = app.workflows.getRun(created.id, 'local-workspace');
      if (current.status === 'COMPLETED') {
        assert.deepEqual(current.steps.map((step) => step.status), ['COMPLETED', 'COMPLETED']);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.fail('parallel workflow did not complete');
  } finally { await app.close(); }
});
