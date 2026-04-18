---
title: Database Schema
status: active
owner: platform
last_reviewed: 2026-04-18
canonical: false
source_hash: 70db60a158c8dcbb
---

# Database Schema

This file is generated from `xuejian/src-tauri/src/migrations/*.sql`.

- Source hash: `70db60a158c8dcbb`

## Migrations
- `V1__initial_schema.sql`
- `V2__workflow_and_fts_foundation.sql`
- `V3__card_generation_workflow.sql`
- `V4__points_ledger.sql`
- `V5__card_animations.sql`

## Tables

### V1__initial_schema.sql

#### `users`

```sql
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    settings JSON
);
```

#### `api_configs`

```sql
CREATE TABLE IF NOT EXISTS api_configs (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    provider TEXT NOT NULL,
    name TEXT NOT NULL,
    base_url TEXT,
    model TEXT,
    budget_limit REAL,
    is_enabled BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `documents`

```sql
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT DEFAULT 'pdf',
    file_size INTEGER,
    page_count INTEGER,
    content_hash TEXT,
    status TEXT DEFAULT 'uploading',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `document_chunks`

```sql
CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    page_start INTEGER,
    page_end INTEGER,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `document_anchors`

```sql
CREATE TABLE IF NOT EXISTS document_anchors (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    page INTEGER NOT NULL,
    paragraph INTEGER,
    text_quote TEXT NOT NULL,
    rects JSON,
    hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `card_groups`

```sql
CREATE TABLE IF NOT EXISTS card_groups (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES documents(id),
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `card_candidates`

```sql
CREATE TABLE IF NOT EXISTS card_candidates (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    anchor_id TEXT REFERENCES document_anchors(id),
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    tags JSON,
    confidence REAL,
    dedupe_key TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `cards`

```sql
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    group_id TEXT REFERENCES card_groups(id),
    document_id TEXT REFERENCES documents(id),
    anchor_id TEXT REFERENCES document_anchors(id),
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    source_page INTEGER,
    source_paragraph INTEGER,
    source_coordinates JSON,
    tags JSON,
    -- FSRS参数
    difficulty REAL DEFAULT 0.3,
    stability REAL DEFAULT 1.0,
    retrievability REAL,
    state TEXT DEFAULT 'new',
    next_review DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `highlights`

```sql
CREATE TABLE IF NOT EXISTS highlights (
    id TEXT PRIMARY KEY,
    card_id TEXT REFERENCES cards(id),
    document_id TEXT REFERENCES documents(id),
    anchor_id TEXT REFERENCES document_anchors(id),
    page_number INTEGER NOT NULL,
    rectangles JSON NOT NULL,
    text_content TEXT NOT NULL,
    color TEXT DEFAULT '#F8E16C',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `review_logs`

```sql
CREATE TABLE IF NOT EXISTS review_logs (
    id TEXT PRIMARY KEY,
    card_id TEXT REFERENCES cards(id),
    rating TEXT NOT NULL,
    reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    state TEXT,
    difficulty REAL,
    stability REAL,
    retrievability REAL,
    next_review DATE,
    interval_days INTEGER
);
```

#### `daily_stats`

```sql
CREATE TABLE IF NOT EXISTS daily_stats (
    id TEXT PRIMARY KEY,
    date DATE UNIQUE,
    new_cards INTEGER DEFAULT 0,
    review_cards INTEGER DEFAULT 0,
    learning_time INTEGER DEFAULT 0,
    correct_rate REAL
);
```

#### `knowledge_scopes`

```sql
CREATE TABLE IF NOT EXISTS knowledge_scopes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    document_ids JSON,
    card_group_ids JSON,
    tags JSON,
    page_ranges JSON,
    include_highlights BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `agent_presets`

```sql
CREATE TABLE IF NOT EXISTS agent_presets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    model_profile_id TEXT REFERENCES api_configs(id),
    knowledge_scope_id TEXT REFERENCES knowledge_scopes(id),
    prompt_template TEXT NOT NULL,
    enabled_tools JSON,
    budget_limit REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `agent_runs`

```sql
CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    preset_id TEXT NOT NULL REFERENCES agent_presets(id),
    status TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    checkpoint_ref TEXT,
    approval_payload JSON,
    cost_usd REAL,
    error_message TEXT,
    started_at DATETIME,
    finished_at DATETIME
);
```

### V2__workflow_and_fts_foundation.sql

#### `workflow_runs`

```sql
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
```

#### `workflow_checkpoints`

```sql
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
```

#### `workflow_events`

```sql
CREATE TABLE IF NOT EXISTS workflow_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    message TEXT,
    progress REAL,
    payload JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `document_chunks_fts`

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
    content,
    content='document_chunks',
    content_rowid='rowid',
    tokenize='trigram'
);
```

### V4__points_ledger.sql

#### `points_ledger`

```sql
CREATE TABLE IF NOT EXISTS points_ledger (
    id TEXT PRIMARY KEY,
    review_log_id TEXT UNIQUE NOT NULL REFERENCES review_logs(id),
    card_id TEXT NOT NULL REFERENCES cards(id),
    points INTEGER NOT NULL,
    transaction_type TEXT NOT NULL,   -- 'review_new', 'review_learning', 'review_correct', 'review_easy'
    rating TEXT NOT NULL,             -- 'again', 'hard', 'good', 'easy'
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### V5__card_animations.sql

#### `card_animations`

```sql
CREATE TABLE IF NOT EXISTS card_animations (
    id          TEXT PRIMARY KEY,
    card_id     TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    run_id      TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
    anim_type   TEXT NOT NULL,     -- 'flashcard_reveal' | 'keyword_emphasis'
    script_json TEXT NOT NULL,     -- AnimationScript JSON (pure data, no code)
    status      TEXT NOT NULL DEFAULT 'queued',  -- 'queued' | 'generating' | 'ready' | 'failed'
    error_message TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Indexes

### V1__initial_schema.sql

#### `idx_documents_status`

```sql
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
```

#### `idx_cards_document_id`

```sql
CREATE INDEX IF NOT EXISTS idx_cards_document_id ON cards(document_id);
```

#### `idx_cards_next_review`

```sql
CREATE INDEX IF NOT EXISTS idx_cards_next_review ON cards(next_review);
```

#### `idx_cards_state`

```sql
CREATE INDEX IF NOT EXISTS idx_cards_state ON cards(state);
```

#### `idx_review_logs_card_id`

```sql
CREATE INDEX IF NOT EXISTS idx_review_logs_card_id ON review_logs(card_id);
```

#### `idx_review_logs_reviewed_at`

```sql
CREATE INDEX IF NOT EXISTS idx_review_logs_reviewed_at ON review_logs(reviewed_at);
```

#### `idx_document_anchors_document_id`

```sql
CREATE INDEX IF NOT EXISTS idx_document_anchors_document_id ON document_anchors(document_id);
```

#### `idx_highlights_document_id`

```sql
CREATE INDEX IF NOT EXISTS idx_highlights_document_id ON highlights(document_id);
```

#### `idx_card_candidates_document_id`

```sql
CREATE INDEX IF NOT EXISTS idx_card_candidates_document_id ON card_candidates(document_id);
```

#### `idx_agent_runs_status`

```sql
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
```

### V2__workflow_and_fts_foundation.sql

#### `idx_workflow_runs_status`

```sql
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
```

#### `idx_workflow_runs_created_at`

```sql
CREATE INDEX IF NOT EXISTS idx_workflow_runs_created_at ON workflow_runs(created_at DESC);
```

#### `idx_workflow_checkpoints_run_id`

```sql
CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_run_id ON workflow_checkpoints(run_id);
```

#### `idx_workflow_events_run_id`

```sql
CREATE INDEX IF NOT EXISTS idx_workflow_events_run_id ON workflow_events(run_id, created_at DESC);
```

### V3__card_generation_workflow.sql

#### `idx_card_candidates_workflow_run_id`

```sql
CREATE INDEX IF NOT EXISTS idx_card_candidates_workflow_run_id
ON card_candidates(workflow_run_id);
```

#### `idx_card_candidates_status`

```sql
CREATE INDEX IF NOT EXISTS idx_card_candidates_status
ON card_candidates(status);
```

#### `idx_card_candidates_document_dedupe_key`

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_card_candidates_document_dedupe_key
ON card_candidates(document_id, dedupe_key)
WHERE dedupe_key IS NOT NULL;
```

#### `idx_cards_document_dedupe_key`

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_document_dedupe_key
ON cards(document_id, dedupe_key)
WHERE dedupe_key IS NOT NULL;
```

### V4__points_ledger.sql

#### `idx_points_ledger_card_id`

```sql
CREATE INDEX IF NOT EXISTS idx_points_ledger_card_id ON points_ledger(card_id);
```

#### `idx_points_ledger_created_at`

```sql
CREATE INDEX IF NOT EXISTS idx_points_ledger_created_at ON points_ledger(created_at);
```

#### `idx_points_ledger_transaction_type`

```sql
CREATE INDEX IF NOT EXISTS idx_points_ledger_transaction_type ON points_ledger(transaction_type);
```

### V5__card_animations.sql

#### `idx_card_animations_card_id`

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_card_animations_card_id
ON card_animations(card_id);
```

#### `idx_card_animations_status`

```sql
CREATE INDEX IF NOT EXISTS idx_card_animations_status
ON card_animations(status);
```

#### `idx_card_animations_run_id`

```sql
CREATE INDEX IF NOT EXISTS idx_card_animations_run_id
ON card_animations(run_id);
```
