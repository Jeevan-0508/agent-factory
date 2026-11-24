import { all, get, run, transaction } from './db.mjs';
import { HttpError, assertObject, id, now } from './util.mjs';

const STATUS_VALUES = new Set(['active', 'paused', 'archived']);
const AVAILABILITY_VALUES = new Set(['available', 'busy', 'paused']);
const PROJECT_STATUS_VALUES = new Set(['draft', 'active', 'paused', 'completed']);
const OBJECTIVE_STATUS_VALUES = new Set(['active', 'paused', 'completed']);

export const OLYMPUS_TEMPLATES = [
  { id: 'software-engineering-company', name: 'Software engineering company', objective: 'Build and operate reliable software products.', departments: ['Product', 'Engineering', 'Quality & Security'] },
  { id: 'ai-governance-consultancy', name: 'AI governance consultancy', objective: 'Help organizations deploy AI with accountable governance.', departments: ['Governance', 'Risk & Compliance', 'Research'] },
  { id: 'enterprise-risk-management-team', name: 'Enterprise risk management team', objective: 'Identify, quantify, and govern material enterprise risk.', departments: ['ERM', 'Controls', 'Assurance'] },
  { id: 'fraud-intelligence-organization', name: 'Fraud intelligence organization', objective: 'Detect, investigate, and reduce fraud exposure.', departments: ['Intelligence', 'Investigation', 'Prevention'] },
  { id: 'research-laboratory', name: 'Research laboratory', objective: 'Run evidence-constrained research and evaluation programs.', departments: ['Research', 'Evaluation', 'Knowledge'] },
  { id: 'product-development-studio', name: 'Product development studio', objective: 'Turn validated opportunities into usable products.', departments: ['Product', 'Design', 'Delivery'] },
  { id: 'supply-chain-operations-team', name: 'Supply chain operations team', objective: 'Coordinate resilient, observable supply chain operations.', departments: ['Planning', 'Operations', 'Supplier Risk'] }
];

function text(value, label, max = 240) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > max) throw new HttpError(400, `${label} is invalid`, 'invalid_organization_input');
  return value.trim();
}

function integer(value, label, max = 1_000_000_000) {
  if (!Number.isInteger(value) || value < 0 || value > max) throw new HttpError(400, `${label} is invalid`, 'invalid_organization_input');
  return value;
}

function templateById(templateId) {
  const template = OLYMPUS_TEMPLATES.find((item) => item.id === templateId);
  if (!template) throw new HttpError(400, 'Organization template is not supported', 'invalid_organization_template');
  return template;
}

export function createOlympus({ db, catalog }) {
  const roles = new Map(catalog.roles.map((role) => [role.name, role]));

  function organization(workspaceId, organizationId) {
    const row = get(db, 'SELECT * FROM olympus_organizations WHERE workspace_id = ? AND id = ?', [workspaceId, organizationId]);
    if (!row) throw new HttpError(404, 'Organization not found', 'organization_not_found');
    return row;
  }

  function department(workspaceId, organizationId, departmentId) {
    const row = get(db, 'SELECT * FROM olympus_departments WHERE workspace_id = ? AND organization_id = ? AND id = ?', [workspaceId, organizationId, departmentId]);
    if (!row) throw new HttpError(404, 'Department not found', 'department_not_found');
    return row;
  }

  function member(workspaceId, organizationId, agentId) {
    const row = get(db, 'SELECT * FROM olympus_members WHERE workspace_id = ? AND organization_id = ? AND agent_id = ?', [workspaceId, organizationId, agentId]);
    if (!row) throw new HttpError(404, 'Organization member not found', 'organization_member_not_found');
    return row;
  }

  function record(workspaceId, organizationId, actorId, eventType, entityType, entityId, payload = {}) {
    run(db, 'INSERT INTO olympus_activity(id, workspace_id, organization_id, actor_id, event_type, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id('olympus_activity'), workspaceId, organizationId, actorId, eventType, entityType, entityId, JSON.stringify(payload), now()]);
  }

  function assertNoDepartmentCycle(workspaceId, organizationId, departmentId, parentId) {
    if (!parentId) return;
    if (parentId === departmentId) throw new HttpError(409, 'Department cannot report to itself', 'organization_cycle');
    let current = parentId;
    const seen = new Set();
    while (current) {
      if (seen.has(current)) throw new HttpError(409, 'Department hierarchy contains a cycle', 'organization_cycle');
      seen.add(current);
      const row = department(workspaceId, organizationId, current);
      current = row.parent_id;
      if (current === departmentId) throw new HttpError(409, 'Department hierarchy contains a cycle', 'organization_cycle');
    }
  }

  function assertNoReportingCycle(workspaceId, organizationId, agentId, reportsTo) {
    if (!reportsTo) return;
    if (reportsTo === agentId) throw new HttpError(409, 'Agent cannot report to itself', 'organization_cycle');
    const seen = new Set([agentId]);
    let current = reportsTo;
    while (current) {
      if (seen.has(current)) throw new HttpError(409, 'Reporting hierarchy contains a cycle', 'organization_cycle');
      seen.add(current);
      const row = member(workspaceId, organizationId, current);
      current = row.reports_to;
    }
  }

  function roleView(agentId) {
    const role = roles.get(agentId);
    if (!role) throw new HttpError(400, 'Agent role is not in the 100-role catalog', 'unknown_catalog_role');
    return { agent_id: role.name, title: role.title, display_name: role.display_name, family: role.family, runtime_status: role.runtime ? 'typed-runtime' : 'registry-only', capabilities: role.capabilities };
  }

  function memberView(row) {
    return { ...row, capabilities: JSON.parse(row.capabilities_json), ...roleView(row.agent_id), reports_to: row.reports_to || null, department_id: row.department_id || null };
  }

  function getOrganization(workspaceId, organizationId) {
    const org = organization(workspaceId, organizationId);
    const departments = all(db, 'SELECT * FROM olympus_departments WHERE workspace_id = ? AND organization_id = ? ORDER BY name', [workspaceId, organizationId]);
    const members = all(db, 'SELECT * FROM olympus_members WHERE workspace_id = ? AND organization_id = ? ORDER BY created_at, agent_id', [workspaceId, organizationId]).map(memberView);
    const projects = all(db, 'SELECT * FROM olympus_projects WHERE workspace_id = ? AND organization_id = ? ORDER BY created_at', [workspaceId, organizationId]);
    const objectives = all(db, 'SELECT * FROM olympus_objectives WHERE workspace_id = ? AND organization_id = ? ORDER BY created_at', [workspaceId, organizationId]);
    const activity = all(db, 'SELECT * FROM olympus_activity WHERE workspace_id = ? AND organization_id = ? ORDER BY created_at DESC LIMIT 100', [workspaceId, organizationId]).map((row) => ({ ...row, payload: JSON.parse(row.payload_json) }));
    return { ...org, budget_limit: Number(org.budget_limit), departments, members, projects, objectives, activity, counts: { departments: departments.length, members: members.length, projects: projects.length, objectives: objectives.length, typed_runtime: members.filter((item) => item.runtime_status === 'typed-runtime').length, registry_only: members.filter((item) => item.runtime_status === 'registry-only').length } };
  }

  function createOrganization({ workspaceId, actorId, name, templateId, objective, budgetLimit = 0 }) {
    const template = templateById(templateId);
    const orgName = text(name, 'Organization name');
    const orgObjective = text(objective || template.objective, 'Organization objective', 1_000);
    const budget = integer(budgetLimit, 'Organization budget');
    const organizationId = id('org');
    transaction(db, () => {
      run(db, 'INSERT INTO olympus_organizations(id, workspace_id, name, template_id, objective, budget_limit, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [organizationId, workspaceId, orgName, template.id, orgObjective, budget, 'active', now(), now()]);
      for (const departmentName of template.departments) run(db, 'INSERT INTO olympus_departments(id, workspace_id, organization_id, name, objective, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id('dept'), workspaceId, organizationId, departmentName, `${departmentName} responsibilities for ${orgName}.`, null, now(), now()]);
      record(workspaceId, organizationId, actorId, 'ORGANIZATION_CREATED', 'organization', organizationId, { template_id: template.id });
    });
    return getOrganization(workspaceId, organizationId);
  }

  function createDepartment({ workspaceId, actorId, organizationId, name, objective, parentId = null }) {
    organization(workspaceId, organizationId);
    const departmentName = text(name, 'Department name');
    if (parentId) { assertNoDepartmentCycle(workspaceId, organizationId, null, parentId); department(workspaceId, organizationId, parentId); }
    const departmentId = id('dept');
    transaction(db, () => {
      run(db, 'INSERT INTO olympus_departments(id, workspace_id, organization_id, name, objective, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [departmentId, workspaceId, organizationId, departmentName, text(objective || `${departmentName} responsibilities.`, 'Department objective', 1_000), parentId, now(), now()]);
      record(workspaceId, organizationId, actorId, 'DEPARTMENT_CREATED', 'department', departmentId, { parent_id: parentId });
    });
    return get(db, 'SELECT * FROM olympus_departments WHERE id = ?', [departmentId]);
  }

  function recruitMember({ workspaceId, actorId, organizationId, agentId, title, reportsTo = null, departmentId = null, capabilities = [], availability = 'available' }) {
    organization(workspaceId, organizationId);
    roleView(agentId);
    if (get(db, 'SELECT 1 FROM olympus_members WHERE organization_id = ? AND agent_id = ?', [organizationId, agentId])) throw new HttpError(409, 'Agent is already recruited into this organization', 'organization_member_exists');
    if (!AVAILABILITY_VALUES.has(availability)) throw new HttpError(400, 'Availability is invalid', 'invalid_organization_input');
    if (!Array.isArray(capabilities) || capabilities.some((item) => typeof item !== 'string' || item.length > 120) || capabilities.length > 30) throw new HttpError(400, 'Capabilities are invalid', 'invalid_organization_input');
    if (reportsTo) { member(workspaceId, organizationId, reportsTo); assertNoReportingCycle(workspaceId, organizationId, agentId, reportsTo); }
    if (departmentId) department(workspaceId, organizationId, departmentId);
    transaction(db, () => {
      run(db, 'INSERT INTO olympus_members(workspace_id, organization_id, agent_id, title, reports_to, department_id, capabilities_json, availability, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [workspaceId, organizationId, agentId, text(title || roleView(agentId).title, 'Member title'), reportsTo, departmentId, JSON.stringify(capabilities), availability, now(), now()]);
      record(workspaceId, organizationId, actorId, 'MEMBER_RECRUITED', 'member', agentId, { runtime_status: roleView(agentId).runtime_status });
    });
    return memberView(member(workspaceId, organizationId, agentId));
  }

  function updateMember({ workspaceId, actorId, organizationId, agentId, changes }) {
    assertObject(changes, 'Member changes must be an object');
    if (['runtime_status', 'execution_mode', 'permissions', 'role', 'enabled', 'promote'].some((field) => Object.hasOwn(changes, field))) throw new HttpError(403, 'Catalog runtime status and permissions cannot be promoted through OLYMPUS', 'role_promotion_denied');
    const current = member(workspaceId, organizationId, agentId);
    const nextReportsTo = changes.reports_to === undefined ? current.reports_to : changes.reports_to || null;
    if (nextReportsTo) { member(workspaceId, organizationId, nextReportsTo); assertNoReportingCycle(workspaceId, organizationId, agentId, nextReportsTo); }
    const nextDepartment = changes.department_id === undefined ? current.department_id : changes.department_id || null;
    if (nextDepartment) department(workspaceId, organizationId, nextDepartment);
    const nextAvailability = changes.availability === undefined ? current.availability : changes.availability;
    if (!AVAILABILITY_VALUES.has(nextAvailability)) throw new HttpError(400, 'Availability is invalid', 'invalid_organization_input');
    const nextTitle = changes.title === undefined ? current.title : text(changes.title, 'Member title');
    transaction(db, () => {
      run(db, 'UPDATE olympus_members SET title = ?, reports_to = ?, department_id = ?, availability = ?, updated_at = ? WHERE workspace_id = ? AND organization_id = ? AND agent_id = ?', [nextTitle, nextReportsTo, nextDepartment, nextAvailability, now(), workspaceId, organizationId, agentId]);
      record(workspaceId, organizationId, actorId, 'MEMBER_UPDATED', 'member', agentId, { availability: nextAvailability });
    });
    return memberView(member(workspaceId, organizationId, agentId));
  }

  function createProject({ workspaceId, actorId, organizationId, name, objective, ownerAgentId, status = 'draft' }) {
    organization(workspaceId, organizationId);
    member(workspaceId, organizationId, ownerAgentId);
    if (!PROJECT_STATUS_VALUES.has(status)) throw new HttpError(400, 'Project status is invalid', 'invalid_organization_input');
    const projectId = id('project');
    run(db, 'INSERT INTO olympus_projects(id, workspace_id, organization_id, name, objective, owner_agent_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [projectId, workspaceId, organizationId, text(name, 'Project name'), text(objective, 'Project objective', 1_000), ownerAgentId, status, now(), now()]);
    record(workspaceId, organizationId, actorId, 'PROJECT_CREATED', 'project', projectId, { owner_agent_id: ownerAgentId });
    return get(db, 'SELECT * FROM olympus_projects WHERE id = ?', [projectId]);
  }

  function createObjective({ workspaceId, actorId, organizationId, title, description, status = 'active' }) {
    organization(workspaceId, organizationId);
    if (!OBJECTIVE_STATUS_VALUES.has(status)) throw new HttpError(400, 'Objective status is invalid', 'invalid_organization_input');
    const objectiveId = id('objective');
    run(db, 'INSERT INTO olympus_objectives(id, workspace_id, organization_id, title, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [objectiveId, workspaceId, organizationId, text(title, 'Objective title'), text(description, 'Objective description', 1_000), status, now(), now()]);
    record(workspaceId, organizationId, actorId, 'OBJECTIVE_CREATED', 'objective', objectiveId, {});
    return get(db, 'SELECT * FROM olympus_objectives WHERE id = ?', [objectiveId]);
  }

  function listOrganizations(workspaceId) {
    return all(db, 'SELECT * FROM olympus_organizations WHERE workspace_id = ? ORDER BY created_at', [workspaceId]).map((org) => ({ ...org, budget_limit: Number(org.budget_limit), member_count: get(db, 'SELECT COUNT(*) AS count FROM olympus_members WHERE organization_id = ?', [org.id]).count }));
  }

  function exportOrganization(workspaceId, organizationId) {
    const value = getOrganization(workspaceId, organizationId);
    return { schema_version: 1, exported_at: now(), organization: value };
  }

  function importOrganization({ workspaceId, actorId, payload }) {
    assertObject(payload, 'Organization import must be an object');
    if (payload.schema_version !== 1 || !payload.organization) throw new HttpError(400, 'Organization import schema is unsupported', 'invalid_organization_import');
    const source = payload.organization;
    const existing = new Set(listOrganizations(workspaceId).map((item) => item.name));
    let name = text(source.name, 'Organization name');
    let suffix = 1;
    while (existing.has(name)) name = `${text(source.name, 'Organization name')} (imported ${suffix++})`;
    const created = createOrganization({ workspaceId, actorId, name, templateId: source.template_id, objective: source.objective, budgetLimit: Number(source.budget_limit) || 0 });
    const departmentMap = new Map((created.departments || []).map((item) => [item.name, item.id]));
    for (const item of source.departments || []) {
      const parentId = item.parent_id ? departmentMap.get(item.parent_id) || null : null;
      const existingId = departmentMap.get(item.name);
      const createdDepartment = existingId ? { id: existingId } : createDepartment({ workspaceId, actorId, organizationId: created.id, name: item.name, objective: item.objective, parentId });
      departmentMap.set(item.id, createdDepartment.id);
    }
    for (const item of source.members || []) recruitMember({ workspaceId, actorId, organizationId: created.id, agentId: item.agent_id, title: item.title, reportsTo: item.reports_to || null, departmentId: departmentMap.get(item.department_id) || null, capabilities: item.capabilities || [], availability: item.availability || 'available' });
    for (const item of source.objectives || []) createObjective({ workspaceId, actorId, organizationId: created.id, title: item.title, description: item.description, status: item.status });
    for (const item of source.projects || []) createProject({ workspaceId, actorId, organizationId: created.id, name: item.name, objective: item.objective, ownerAgentId: item.owner_agent_id, status: item.status });
    return getOrganization(workspaceId, created.id);
  }

  return { templates: () => OLYMPUS_TEMPLATES.map((template) => ({ ...template, departments: [...template.departments] })), listOrganizations, getOrganization, createOrganization, createDepartment, recruitMember, updateMember, createProject, createObjective, exportOrganization, importOrganization, roleView };
}
