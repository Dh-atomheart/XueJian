-- V5: Card animation assets generated from card content via LLM
-- One animation per card; regeneration replaces the existing row.

CREATE TABLE IF NOT EXISTS card_animations (
    id          TEXT PRIMARY KEY,
    card_id     TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    run_id      TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
    anim_type   TEXT NOT NULL,     -- 'flashcard_reveal' | 'keyword_emphasis'
    script_json TEXT NOT NULL,     -- AnimationScript JSON (pure data, no code)
    status      TEXT NOT NULL DEFAULT 'queued',  -- 'queued' | 'generating' | 'ready' | 'failed'
    error_message TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_animations_card_id
ON card_animations(card_id);

CREATE INDEX IF NOT EXISTS idx_card_animations_status
ON card_animations(status);

CREATE INDEX IF NOT EXISTS idx_card_animations_run_id
ON card_animations(run_id);
