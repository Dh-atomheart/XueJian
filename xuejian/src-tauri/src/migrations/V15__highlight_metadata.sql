ALTER TABLE highlights ADD COLUMN note TEXT;
ALTER TABLE highlights ADD COLUMN page_card_index INTEGER;

CREATE INDEX IF NOT EXISTS idx_highlights_document_page_card_index
ON highlights(document_id, page_number, page_card_index);