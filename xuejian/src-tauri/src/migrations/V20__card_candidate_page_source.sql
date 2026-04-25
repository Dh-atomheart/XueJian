-- V20: Persist page-level provenance for generated candidates that do not have an exact anchor.

ALTER TABLE card_candidates ADD COLUMN source_page INTEGER;
ALTER TABLE card_candidates ADD COLUMN source_quote TEXT;

CREATE INDEX IF NOT EXISTS idx_card_candidates_source_page
ON card_candidates(document_id, source_page)
WHERE source_page IS NOT NULL;
