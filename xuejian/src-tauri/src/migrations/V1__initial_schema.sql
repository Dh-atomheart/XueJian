-- V1: Initial schema for MVP
-- 用户配置表
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    settings JSON
);

-- API配置表（不存储明文密钥，只存储元数据）
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

-- 文档表
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

-- 文档分块表（用于FTS5与后续RAG基础）
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

-- 文档锚点表
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

-- 卡片组表
CREATE TABLE IF NOT EXISTS card_groups (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES documents(id),
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 卡片候选表（用户确认前）
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

-- 正式卡片表
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

-- 高亮表
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

-- 复习记录表
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

-- 每日统计表
CREATE TABLE IF NOT EXISTS daily_stats (
    id TEXT PRIMARY KEY,
    date DATE UNIQUE,
    new_cards INTEGER DEFAULT 0,
    review_cards INTEGER DEFAULT 0,
    learning_time INTEGER DEFAULT 0,
    correct_rate REAL
);

-- 知识范围表
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

-- Agent预设表
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

-- Agent运行表
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

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_cards_document_id ON cards(document_id);
CREATE INDEX IF NOT EXISTS idx_cards_next_review ON cards(next_review);
CREATE INDEX IF NOT EXISTS idx_cards_state ON cards(state);
CREATE INDEX IF NOT EXISTS idx_review_logs_card_id ON review_logs(card_id);
CREATE INDEX IF NOT EXISTS idx_review_logs_reviewed_at ON review_logs(reviewed_at);
CREATE INDEX IF NOT EXISTS idx_document_anchors_document_id ON document_anchors(document_id);
CREATE INDEX IF NOT EXISTS idx_highlights_document_id ON highlights(document_id);
CREATE INDEX IF NOT EXISTS idx_card_candidates_document_id ON card_candidates(document_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);

-- 插入默认用户（如果不存在）
INSERT OR IGNORE INTO users (id, name) VALUES ('default', '默认用户');
