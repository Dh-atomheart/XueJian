-- V6: Podcast episodes for AI-generated learning podcasts
CREATE TABLE IF NOT EXISTS podcast_episodes (
    id              TEXT PRIMARY KEY,
    document_id     TEXT REFERENCES documents(id) ON DELETE SET NULL,
    run_id          TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
    title           TEXT NOT NULL DEFAULT '',
    scope_description TEXT NOT NULL DEFAULT '',
    script_json     TEXT NOT NULL DEFAULT '{}',
    audio_path      TEXT,
    duration_ms     INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'queued',
    error_message   TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_podcast_episodes_status ON podcast_episodes(status);
CREATE INDEX IF NOT EXISTS idx_podcast_episodes_document_id ON podcast_episodes(document_id);
CREATE INDEX IF NOT EXISTS idx_podcast_episodes_run_id ON podcast_episodes(run_id);
