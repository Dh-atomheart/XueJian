-- V2: Add workflow persistence and real FTS5 support for document chunks

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

CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
    content,
    content='document_chunks',
    content_rowid='rowid',
    tokenize='trigram'
);

INSERT INTO document_chunks_fts(rowid, content)
SELECT rowid, content
FROM document_chunks
WHERE rowid NOT IN (SELECT rowid FROM document_chunks_fts);

CREATE TRIGGER IF NOT EXISTS document_chunks_ai
AFTER INSERT ON document_chunks
BEGIN
    INSERT INTO document_chunks_fts(rowid, content)
    VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS document_chunks_ad
AFTER DELETE ON document_chunks
BEGIN
    INSERT INTO document_chunks_fts(document_chunks_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS document_chunks_au
AFTER UPDATE OF content ON document_chunks
BEGIN
    INSERT INTO document_chunks_fts(document_chunks_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
    INSERT INTO document_chunks_fts(rowid, content)
    VALUES (new.rowid, new.content);
END;
