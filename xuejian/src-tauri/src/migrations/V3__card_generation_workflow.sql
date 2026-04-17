-- V3: Card generation workflow persistence and idempotent promotion

ALTER TABLE card_candidates
ADD COLUMN workflow_run_id TEXT;

ALTER TABLE cards
ADD COLUMN dedupe_key TEXT;

CREATE INDEX IF NOT EXISTS idx_card_candidates_workflow_run_id
ON card_candidates(workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_card_candidates_status
ON card_candidates(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_candidates_document_dedupe_key
ON card_candidates(document_id, dedupe_key)
WHERE dedupe_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_document_dedupe_key
ON cards(document_id, dedupe_key)
WHERE dedupe_key IS NOT NULL;
