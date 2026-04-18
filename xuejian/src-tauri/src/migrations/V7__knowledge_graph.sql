-- V7: Knowledge graph — nodes, edges, and build runs
CREATE TABLE IF NOT EXISTS knowledge_nodes (
    id              TEXT PRIMARY KEY,
    node_type       TEXT NOT NULL DEFAULT 'concept',
    label           TEXT NOT NULL,
    aliases_json    TEXT NOT NULL DEFAULT '[]',
    source_ids_json TEXT NOT NULL DEFAULT '[]',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_edges (
    id              TEXT PRIMARY KEY,
    from_node_id    TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    to_node_id      TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    relation        TEXT NOT NULL,
    confidence      REAL NOT NULL DEFAULT 0.5,
    source_ids_json TEXT NOT NULL DEFAULT '[]',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS graph_build_runs (
    id              TEXT PRIMARY KEY,
    run_id          TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
    scope_description TEXT NOT NULL DEFAULT '',
    document_ids_json TEXT NOT NULL DEFAULT '[]',
    nodes_created   INTEGER NOT NULL DEFAULT 0,
    edges_created   INTEGER NOT NULL DEFAULT 0,
    nodes_merged    INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'queued',
    error_message   TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_type ON knowledge_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_label ON knowledge_nodes(label);
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_from ON knowledge_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_to ON knowledge_edges(to_node_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_relation ON knowledge_edges(relation);
CREATE INDEX IF NOT EXISTS idx_graph_build_runs_status ON graph_build_runs(status);
