import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase, closeDatabase } from '../../server/db.mjs';
import { loadCatalog } from '../../server/catalog.mjs';
import { ensureWorkspace } from '../../server/auth.mjs';
import { createRuntime } from '../../server/runtime.mjs';

const root = path.resolve(import.meta.dirname, '../..');

test('SQLite migrations create the durable schema and deterministic runtime persists a completed task', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-runtime-'));
  const db = openDatabase(path.join(directory, 'runtime.sqlite'), path.join(root, 'server/migrations'));
  const { catalog, roles } = loadCatalog(root);
  const workspaceId = ensureWorkspace(db);
  const runtime = createRuntime({ db, catalog: { catalog, roles }, killSwitch: () => false });
  const task = runtime.createTask({ actorId: 'test-operator', workspaceId, agentId: 'solution_architect', input: { requirements: ['audit trail'] }, allowedTools: ['schema.validate'] });
  runtime.validateTask(task.id, workspaceId, 'test-operator');
  runtime.requestApproval(task.id, workspaceId, 'test-operator');
  runtime.approveTask(task.id, workspaceId, 'test-operator');
  const completed = await runtime.executeTask(task.id, workspaceId, 'test-operator');
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.output.execution_mode, 'deterministic-local');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_events').get().count >= 5, true);
  closeDatabase(db);
});

test('registry-only roles are denied unless an explicit grant is present', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-auth-'));
  const db = openDatabase(path.join(directory, 'runtime.sqlite'), path.join(root, 'server/migrations'));
  const { catalog, roles } = loadCatalog(root);
  const workspaceId = ensureWorkspace(db);
  const runtime = createRuntime({ db, catalog: { catalog, roles }, killSwitch: () => false });
  assert.throws(() => runtime.createTask({ actorId: 'test-operator', workspaceId, agentId: 'risk_analyst', input: {}, allowedTools: ['risk.score'] }), (error) => error.code === 'registry_only_denied');
  const granted = runtime.createTask({ actorId: 'test-operator', workspaceId, agentId: 'risk_analyst', input: { risk: { likelihood: 3, impact: 4, control_effectiveness: 0.5 } }, allowedTools: ['risk.score'], explicitGrants: ['risk_analyst'] });
  assert.equal(granted.agent_id, 'risk_analyst');
  closeDatabase(db);
});
