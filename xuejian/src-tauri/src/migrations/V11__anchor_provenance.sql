-- V11: DocumentAnchor provenance extension
-- Adds hierarchy_path (JSON array from Docling) and quote_hash (SHA-256 of normalised text_quote).
-- The old 'hash' column is retained but deprecated; Rust/TS layers should use quote_hash going forward.

ALTER TABLE document_anchors ADD COLUMN hierarchy_path JSON;
ALTER TABLE document_anchors ADD COLUMN quote_hash TEXT;

-- Index for fast anchor lookup by quote_hash (deduplication + drift detection)
CREATE INDEX IF NOT EXISTS idx_document_anchors_quote_hash ON document_anchors (quote_hash)
WHERE quote_hash IS NOT NULL;
