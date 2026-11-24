CREATE TABLE IF NOT EXISTS engineering_knowledge (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  proposed_by TEXT NOT NULL,
  approved_by TEXT,
  supersedes_id TEXT REFERENCES engineering_knowledge(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_engineering_knowledge_workspace ON engineering_knowledge(workspace_id, status, updated_at);
