-- V4: Auditable points ledger for learning incentives
-- Design: one ledger row per review_log, review_log_id UNIQUE prevents double-counting.

CREATE TABLE IF NOT EXISTS points_ledger (
    id TEXT PRIMARY KEY,
    review_log_id TEXT UNIQUE NOT NULL REFERENCES review_logs(id),
    card_id TEXT NOT NULL REFERENCES cards(id),
    points INTEGER NOT NULL,
    transaction_type TEXT NOT NULL,   -- 'review_new', 'review_learning', 'review_correct', 'review_easy'
    rating TEXT NOT NULL,             -- 'again', 'hard', 'good', 'easy'
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_points_ledger_card_id ON points_ledger(card_id);
CREATE INDEX IF NOT EXISTS idx_points_ledger_created_at ON points_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_points_ledger_transaction_type ON points_ledger(transaction_type);
