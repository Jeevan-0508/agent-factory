CREATE TABLE IF NOT EXISTS god_loop_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  objective TEXT NOT NULL,
  repository_scope TEXT NOT NULL,
  acceptance_criteria_json TEXT NOT NULL,
  allowed_tools_json TEXT NOT NULL,
  authorized_agents_json TEXT NOT NULL,
  max_iterations INTEGER NOT NULL,
  max_concurrent_agents INTEGER NOT NULL,
  max_time_ms INTEGER NOT NULL,
  spending_limit INTEGER NOT NULL DEFAULT 0,
  approval_required INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  current_iteration INTEGER NOT NULL DEFAULT 0,
  stop_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_god_loop_workspace ON god_loop_runs(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS god_loop_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  run_id TEXT NOT NULL REFERENCES god_loop_runs(id) ON DELETE CASCADE,
  iteration INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_god_loop_events_run ON god_loop_events(run_id, created_at);
