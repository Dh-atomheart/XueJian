-- V26: Bridge legacy V1-V25 schema to the MVP0 runtime repositories.
-- The current desktop commands use the mvp0 repositories for documents/basic-cards/study,
-- so older local databases need the newer columns/tables before the app can boot cleanly.

CREATE TABLE IF NOT EXISTS source_anchors (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    chunk_id TEXT REFERENCES document_chunks(id),
    page INTEGER NOT NULL,
    quote TEXT NOT NULL,
    bbox_json TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_anchors_document_id ON source_anchors(document_id);
CREATE INDEX IF NOT EXISTS idx_source_anchors_chunk_id ON source_anchors(chunk_id);
CREATE INDEX IF NOT EXISTS idx_source_anchors_page ON source_anchors(page);

ALTER TABLE documents ADD COLUMN original_filename TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN file_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN parse_status TEXT NOT NULL DEFAULT 'pending';

UPDATE documents
SET original_filename = CASE
        WHEN trim(original_filename) <> '' THEN original_filename
        WHEN trim(file_path) <> '' THEN file_path
        WHEN trim(title) <> '' THEN title
        ELSE id
    END,
    file_hash = CASE
        WHEN trim(file_hash) <> '' THEN file_hash
        WHEN content_hash IS NOT NULL AND trim(content_hash) <> '' THEN content_hash
        ELSE id
    END,
    file_size = COALESCE(file_size, 0),
    parse_status = CASE lower(COALESCE(status, ''))
        WHEN 'parsed' THEN 'parsed'
        WHEN 'ready' THEN 'parsed'
        WHEN 'embedding' THEN 'parsed'
        WHEN 'embedding_failed' THEN 'parsed'
        WHEN 'embedding_stale' THEN 'parsed'
        WHEN 'failed' THEN 'failed'
        WHEN 'error' THEN 'failed'
        WHEN 'unsupported' THEN 'unsupported'
        ELSE 'pending'
    END;

CREATE INDEX IF NOT EXISTS idx_documents_parse_status ON documents(parse_status);
CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash);

ALTER TABLE document_chunks ADD COLUMN text TEXT NOT NULL DEFAULT '';
ALTER TABLE document_chunks ADD COLUMN char_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE document_chunks ADD COLUMN parser TEXT NOT NULL DEFAULT 'legacy';

UPDATE document_chunks
SET text = CASE
        WHEN trim(text) <> '' THEN text
        WHEN content IS NOT NULL THEN content
        ELSE ''
    END,
    char_count = CASE
        WHEN char_count > 0 THEN char_count
        ELSE length(CASE WHEN trim(text) <> '' THEN text ELSE COALESCE(content, '') END)
    END,
    parser = CASE
        WHEN trim(parser) <> '' THEN parser
        ELSE 'legacy'
    END,
    page_start = COALESCE(page_start, 1),
    page_end = COALESCE(page_end, page_start, 1);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_page_start ON document_chunks(page_start);
CREATE INDEX IF NOT EXISTS idx_document_chunks_chunk_index ON document_chunks(chunk_index);

INSERT INTO source_anchors (id, document_id, chunk_id, page, quote, bbox_json, created_at)
SELECT da.id, da.document_id, NULL, da.page, da.text_quote, da.rects, da.created_at
FROM document_anchors da
WHERE NOT EXISTS (
    SELECT 1 FROM source_anchors sa WHERE sa.id = da.id
);

ALTER TABLE card_groups ADD COLUMN color TEXT;
ALTER TABLE card_groups ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE card_groups ADD COLUMN updated_at TEXT;
ALTER TABLE card_groups ADD COLUMN deleted_at TEXT;

UPDATE card_groups
SET color = color,
    is_enabled = COALESCE(is_enabled, 1),
    updated_at = COALESCE(updated_at, created_at);

CREATE INDEX IF NOT EXISTS idx_card_groups_name ON card_groups(name);
CREATE INDEX IF NOT EXISTS idx_card_groups_is_enabled ON card_groups(is_enabled);
CREATE INDEX IF NOT EXISTS idx_card_groups_deleted_at ON card_groups(deleted_at);

ALTER TABLE cards ADD COLUMN source_document_id TEXT REFERENCES documents(id);
ALTER TABLE cards ADD COLUMN source_anchor_id TEXT REFERENCES source_anchors(id);
ALTER TABLE cards ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE cards ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE cards ADD COLUMN deleted_at TEXT;

UPDATE cards
SET source_document_id = COALESCE(source_document_id, document_id),
    source_anchor_id = COALESCE(source_anchor_id, anchor_id),
    title = COALESCE(NULLIF(title, ''), front),
    tags_json = CASE
        WHEN trim(tags_json) <> '' THEN tags_json
        WHEN tags IS NOT NULL AND trim(tags) <> '' THEN tags
        ELSE '[]'
    END,
    origin = CASE
        WHEN trim(origin) <> '' THEN origin
        ELSE 'manual'
    END;

CREATE INDEX IF NOT EXISTS idx_cards_group_id ON cards(group_id);
CREATE INDEX IF NOT EXISTS idx_cards_source_anchor_id ON cards(source_anchor_id);
CREATE INDEX IF NOT EXISTS idx_cards_title ON cards(title);
CREATE INDEX IF NOT EXISTS idx_cards_origin ON cards(origin);
CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at);
CREATE INDEX IF NOT EXISTS idx_cards_deleted_at ON cards(deleted_at);
CREATE INDEX IF NOT EXISTS idx_cards_source_document_id ON cards(source_document_id);

CREATE TABLE IF NOT EXISTS review_states (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL UNIQUE REFERENCES cards(id),
    state TEXT NOT NULL,
    due_at TEXT NOT NULL,
    last_reviewed_at TEXT,
    review_count INTEGER NOT NULL,
    lapse_count INTEGER NOT NULL,
    stability REAL,
    difficulty REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_states_state ON review_states(state);
CREATE INDEX IF NOT EXISTS idx_review_states_due_at ON review_states(due_at);

INSERT INTO review_states (
    id, card_id, state, due_at, last_reviewed_at, review_count, lapse_count,
    stability, difficulty, created_at, updated_at
)
SELECT
    lower(hex(randomblob(16))),
    c.id,
    CASE
        WHEN c.state IN ('new', 'learning', 'review', 'relearning') THEN c.state
        ELSE 'new'
    END,
    COALESCE(c.next_review, c.updated_at, c.created_at, CURRENT_TIMESTAMP),
    (SELECT MAX(rl.reviewed_at) FROM review_logs rl WHERE rl.card_id = c.id),
    COALESCE((SELECT COUNT(*) FROM review_logs rl WHERE rl.card_id = c.id), 0),
    0,
    c.stability,
    c.difficulty,
    COALESCE(c.created_at, CURRENT_TIMESTAMP),
    COALESCE(c.updated_at, c.created_at, CURRENT_TIMESTAMP)
FROM cards c
WHERE NOT EXISTS (
    SELECT 1 FROM review_states rs WHERE rs.card_id = c.id
);

CREATE TABLE IF NOT EXISTS study_events (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id),
    group_id TEXT NOT NULL REFERENCES card_groups(id),
    rating TEXT NOT NULL,
    started_at TEXT,
    answered_at TEXT NOT NULL,
    duration_ms INTEGER,
    previous_due_at TEXT,
    next_due_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_study_events_card_id ON study_events(card_id);
CREATE INDEX IF NOT EXISTS idx_study_events_group_id ON study_events(group_id);
CREATE INDEX IF NOT EXISTS idx_study_events_rating ON study_events(rating);
CREATE INDEX IF NOT EXISTS idx_study_events_answered_at ON study_events(answered_at);
CREATE INDEX IF NOT EXISTS idx_study_events_next_due_at ON study_events(next_due_at);

CREATE TABLE IF NOT EXISTS background_jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    result_json TEXT,
    error_message TEXT,
    error_details TEXT,
    progress_current INTEGER,
    progress_total INTEGER,
    progress_message TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    cancel_requested_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_type ON background_jobs(type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_target_type ON background_jobs(target_type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_target_id ON background_jobs(target_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_created_at ON background_jobs(created_at);
