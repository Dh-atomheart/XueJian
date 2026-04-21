-- V13: Agent-driven document workflow foundation

CREATE TABLE IF NOT EXISTS document_sections (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    section_index INTEGER NOT NULL,
    heading TEXT,
    hierarchy_path JSON,
    page_start INTEGER,
    page_end INTEGER,
    anchor_start_id TEXT REFERENCES document_anchors(id),
    anchor_end_id TEXT REFERENCES document_anchors(id),
    content TEXT NOT NULL,
    token_count INTEGER,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, section_index)
);

CREATE INDEX IF NOT EXISTS idx_document_sections_document_id
ON document_sections(document_id, section_index);

ALTER TABLE document_chunks ADD COLUMN section_id TEXT REFERENCES document_sections(id);
ALTER TABLE document_chunks ADD COLUMN anchor_id TEXT REFERENCES document_anchors(id);
ALTER TABLE document_chunks ADD COLUMN chunk_kind TEXT NOT NULL DEFAULT 'semantic';

CREATE INDEX IF NOT EXISTS idx_document_chunks_section_id
ON document_chunks(section_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_anchor_id
ON document_chunks(anchor_id);

CREATE TABLE IF NOT EXISTS embedding_profiles (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    distance_metric TEXT NOT NULL DEFAULT 'cosine',
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    revision INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_profiles_active
ON embedding_profiles(is_active)
WHERE is_active = TRUE;

ALTER TABLE card_candidates ADD COLUMN section_id TEXT REFERENCES document_sections(id);
ALTER TABLE card_candidates ADD COLUMN score_overall REAL;
ALTER TABLE card_candidates ADD COLUMN score_details JSON;
ALTER TABLE card_candidates ADD COLUMN visibility_bucket TEXT;
ALTER TABLE card_candidates ADD COLUMN generation_mode TEXT NOT NULL DEFAULT 'llm';
ALTER TABLE card_candidates ADD COLUMN fallback_reason TEXT;
ALTER TABLE card_candidates ADD COLUMN evaluation_summary TEXT;
ALTER TABLE card_candidates ADD COLUMN source_chunk_ids JSON;

CREATE INDEX IF NOT EXISTS idx_card_candidates_section_id
ON card_candidates(section_id);

CREATE INDEX IF NOT EXISTS idx_card_candidates_visibility_bucket
ON card_candidates(visibility_bucket);