ALTER TABLE god_loop_runs ADD COLUMN active_agents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE god_loop_runs ADD COLUMN spending_used INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_god_loop_status ON god_loop_runs(workspace_id, status, updated_at);
