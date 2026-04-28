CREATE INDEX IF NOT EXISTS idx_review_logs_reviewed_at
ON review_logs(reviewed_at);

CREATE INDEX IF NOT EXISTS idx_points_ledger_created_at
ON points_ledger(created_at);
