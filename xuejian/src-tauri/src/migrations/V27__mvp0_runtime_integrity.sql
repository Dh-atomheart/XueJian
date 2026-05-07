-- V27: Tighten the MVP0 runtime bridge used by document import, parsing,
-- embedding, search, and card generation.

CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_type TEXT NOT NULL,
    preset_id TEXT,
    status TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    checkpoint_ref TEXT,
    approval_payload JSON,
    cost_usd REAL,
    error_message TEXT,
    started_at DATETIME,
    finished_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow_checkpoints (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    checkpoint_ref TEXT NOT NULL,
    step_key TEXT,
    payload JSON NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(run_id, checkpoint_ref)
);

CREATE TABLE IF NOT EXISTS workflow_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    message TEXT,
    progress REAL,
    payload JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_created_at ON workflow_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_run_id ON workflow_checkpoints(run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_run_id ON workflow_events(run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS source_anchors (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    chunk_id TEXT REFERENCES document_chunks(id),
    page INTEGER NOT NULL,
    quote TEXT NOT NULL,
    bbox_json TEXT,
    created_at TEXT NOT NULL
);

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

CREATE INDEX IF NOT EXISTS idx_source_anchors_document_id ON source_anchors(document_id);
CREATE INDEX IF NOT EXISTS idx_source_anchors_chunk_id ON source_anchors(chunk_id);
CREATE INDEX IF NOT EXISTS idx_source_anchors_page ON source_anchors(page);
CREATE INDEX IF NOT EXISTS idx_background_jobs_type ON background_jobs(type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_target_type ON background_jobs(target_type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_target_id ON background_jobs(target_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_created_at ON background_jobs(created_at);

UPDATE documents
SET file_hash = id
WHERE trim(COALESCE(file_hash, '')) = '';

WITH ranked_hashes AS (
    SELECT rowid AS document_rowid,
           ROW_NUMBER() OVER (
               PARTITION BY file_hash
               ORDER BY created_at ASC, id ASC
           ) AS duplicate_rank
    FROM documents
    WHERE deleted_at IS NULL
      AND trim(COALESCE(file_hash, '')) <> ''
)
UPDATE documents
SET file_hash = file_hash || ':' || id
WHERE rowid IN (
    SELECT document_rowid
    FROM ranked_hashes
    WHERE duplicate_rank > 1
);

UPDATE document_chunks
SET content = text,
    token_count = char_count
WHERE trim(COALESCE(text, '')) <> ''
  AND (content IS NULL OR trim(content) = '' OR content <> text);

UPDATE document_chunks
SET text = content,
    char_count = length(content)
WHERE trim(COALESCE(text, '')) = ''
  AND trim(COALESCE(content, '')) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_active_file_hash_unique
ON documents(file_hash)
WHERE deleted_at IS NULL AND trim(file_hash) <> '';
