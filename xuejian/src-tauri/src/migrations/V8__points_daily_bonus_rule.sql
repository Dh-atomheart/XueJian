ALTER TABLE points_ledger ADD COLUMN grant_scope TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_points_ledger_grant_scope_unique
ON points_ledger(grant_scope)
WHERE grant_scope IS NOT NULL;