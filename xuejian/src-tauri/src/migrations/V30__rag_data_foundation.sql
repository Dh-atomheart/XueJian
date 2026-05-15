-- V30: RAG data foundation metadata and chunk profile tracking.

ALTER TABLE documents ADD COLUMN chunking_profile JSON;
ALTER TABLE documents ADD COLUMN chunking_profile_revision INTEGER NOT NULL DEFAULT 0;

ALTER TABLE document_chunks ADD COLUMN content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_document_chunks_content_hash
ON document_chunks(content_hash)
WHERE content_hash IS NOT NULL;