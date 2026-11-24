CREATE TABLE IF NOT EXISTS olympus_organizations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  objective TEXT NOT NULL,
  budget_limit INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, name)
);
CREATE INDEX IF NOT EXISTS idx_olympus_org_workspace ON olympus_organizations(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS olympus_departments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  organization_id TEXT NOT NULL REFERENCES olympus_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  parent_id TEXT REFERENCES olympus_departments(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id, name)
);
CREATE INDEX IF NOT EXISTS idx_olympus_departments_org ON olympus_departments(organization_id);

CREATE TABLE IF NOT EXISTS olympus_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  organization_id TEXT NOT NULL REFERENCES olympus_organizations(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  reports_to TEXT,
  department_id TEXT REFERENCES olympus_departments(id),
  capabilities_json TEXT NOT NULL,
  availability TEXT NOT NULL DEFAULT 'available',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(organization_id, agent_id)
);
CREATE INDEX IF NOT EXISTS idx_olympus_members_org ON olympus_members(organization_id, availability);

CREATE TABLE IF NOT EXISTS olympus_projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  organization_id TEXT NOT NULL REFERENCES olympus_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  owner_agent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_olympus_projects_org ON olympus_projects(organization_id, status);

CREATE TABLE IF NOT EXISTS olympus_objectives (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  organization_id TEXT NOT NULL REFERENCES olympus_organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_olympus_objectives_org ON olympus_objectives(organization_id, status);

CREATE TABLE IF NOT EXISTS olympus_activity (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  organization_id TEXT NOT NULL REFERENCES olympus_organizations(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_olympus_activity_org_time ON olympus_activity(organization_id, created_at);
