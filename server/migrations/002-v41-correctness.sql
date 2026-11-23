ALTER TABLE execution_authorizations ADD COLUMN revoked_at TEXT;
ALTER TABLE execution_authorizations ADD COLUMN grant_context_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE approvals ADD COLUMN approval_mode TEXT NOT NULL DEFAULT 'human';
