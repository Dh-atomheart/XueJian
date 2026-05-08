CREATE TABLE IF NOT EXISTS query_embedding_cache (
    cache_key TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES embedding_profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    task_type TEXT NOT NULL,
    question_hash TEXT NOT NULL,
    vector_json TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    hit_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_query_embedding_cache_profile
ON query_embedding_cache(profile_id);

CREATE INDEX IF NOT EXISTS idx_query_embedding_cache_last_used
ON query_embedding_cache(last_used_at);
