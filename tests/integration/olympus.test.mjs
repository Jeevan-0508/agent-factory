import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../../server/api.mjs';

const root = path.resolve(import.meta.dirname, '../..');

async function makeApp() {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-olympus-'));
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

test('OLYMPUS builds a workspace-scoped organization without promoting registry-only roles', async () => {
  const { app, base } = await makeApp();
  try {
    const templates = await request(base, '/api/v1/olympus/templates');
    assert.equal(templates.response.status, 401);
    const session = await request(base, '/api/v1/session');
    const cookie = session.cookie;
    const listedTemplates = await request(base, '/api/v1/olympus/templates', {}, cookie);
    assert.equal(listedTemplates.response.status, 200);
    assert.equal(listedTemplates.body.templates.length, 7);

    const created = await request(base, '/api/v1/olympus/organizations', { method: 'POST', body: JSON.stringify({ template_id: 'software-engineering-company', name: 'Olympus Engineering', objective: 'Ship governed systems', budget_limit: 0 }) }, cookie);
    assert.equal(created.response.status, 201);
    const organizationId = created.body.id;
    const engineering = created.body.departments.find((item) => item.name === 'Engineering');

    const architect = await request(base, `/api/v1/olympus/organizations/${organizationId}/members`, { method: 'POST', body: JSON.stringify({ agent_id: 'solution_architect', department_id: engineering.id }) }, cookie);
    assert.equal(architect.response.status, 201);
    assert.equal(architect.body.runtime_status, 'typed-runtime');
    const analyst = await request(base, `/api/v1/olympus/organizations/${organizationId}/members`, { method: 'POST', body: JSON.stringify({ agent_id: 'risk_analyst', reports_to: 'solution_architect', department_id: engineering.id }) }, cookie);
    assert.equal(analyst.response.status, 201);
    assert.equal(analyst.body.runtime_status, 'registry-only');

    const cycle = await request(base, `/api/v1/olympus/organizations/${organizationId}/members/solution_architect`, { method: 'PATCH', body: JSON.stringify({ reports_to: 'risk_analyst' }) }, cookie);
    assert.equal(cycle.response.status, 409);
    assert.equal(cycle.body.error, 'organization_cycle');
    const promotion = await request(base, `/api/v1/olympus/organizations/${organizationId}/members/risk_analyst`, { method: 'PATCH', body: JSON.stringify({ execution_mode: 'deterministic-local' }) }, cookie);
    assert.equal(promotion.response.status, 403);
    assert.equal(promotion.body.error, 'role_promotion_denied');

    const objective = await request(base, `/api/v1/olympus/organizations/${organizationId}/objectives`, { method: 'POST', body: JSON.stringify({ title: 'Governed delivery', description: 'Keep execution bounded and reviewable' }) }, cookie);
    assert.equal(objective.response.status, 201);
    const project = await request(base, `/api/v1/olympus/organizations/${organizationId}/projects`, { method: 'POST', body: JSON.stringify({ name: 'Runtime hardening', objective: 'Improve evidence and controls', owner_agent_id: 'solution_architect' }) }, cookie);
    assert.equal(project.response.status, 201);

    const view = await request(base, `/api/v1/olympus/organizations/${organizationId}`, {}, cookie);
    assert.equal(view.body.counts.members, 2);
    assert.equal(view.body.counts.typed_runtime, 1);
    assert.equal(view.body.counts.registry_only, 1);
    assert.ok(view.body.activity.some((event) => event.event_type === 'MEMBER_RECRUITED'));

    const exported = await request(base, `/api/v1/olympus/organizations/${organizationId}/export`, {}, cookie);
    assert.equal(exported.response.status, 200);
    const imported = await request(base, '/api/v1/olympus/organizations/import', { method: 'POST', body: JSON.stringify(exported.body) }, cookie);
    assert.equal(imported.response.status, 201);
    assert.notEqual(imported.body.id, organizationId);
    assert.match(imported.body.name, /imported 1/);
    assert.equal(imported.body.counts.members, 2);
  } finally { await app.close(); }
});
