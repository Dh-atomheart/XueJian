ALTER TABLE knowledge_nodes ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE knowledge_nodes ADD COLUMN community_id TEXT;
ALTER TABLE knowledge_nodes ADD COLUMN parent_community_id TEXT;
ALTER TABLE knowledge_nodes ADD COLUMN degree INTEGER NOT NULL DEFAULT 0;
ALTER TABLE knowledge_nodes ADD COLUMN has_embedding INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_community ON knowledge_nodes(community_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_parent_community ON knowledge_nodes(parent_community_id);

PRAGMA foreign_keys = OFF;

CREATE TABLE knowledge_edges_v2 (
    id              TEXT PRIMARY KEY,
    from_node_id    TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    to_node_id      TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    relation        TEXT NOT NULL CHECK (relation IN (
        'is_a', 'part_of', 'depends_on', 'causes',
        'related_to', 'similar_to', 'uses', 'produces'
    )),
    confidence      REAL NOT NULL DEFAULT 0.5,
    source_ids_json TEXT NOT NULL DEFAULT '[]',
    inferred        INTEGER NOT NULL DEFAULT 0,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO knowledge_edges_v2 (
    id, from_node_id, to_node_id, relation, confidence,
    source_ids_json, inferred, metadata_json, created_at, updated_at
)
SELECT
    id,
    from_node_id,
    to_node_id,
    CASE
        WHEN lower(relation) IN (
            'is_a', 'part_of', 'depends_on', 'causes',
            'related_to', 'similar_to', 'uses', 'produces'
        ) THEN lower(relation)
        WHEN lower(relation) LIKE '%type%' OR lower(relation) LIKE '%kind%' OR lower(relation) LIKE '%subclass%' THEN 'is_a'
        WHEN lower(relation) LIKE '%component%' OR lower(relation) LIKE '%contain%' OR lower(relation) LIKE '%part%' THEN 'part_of'
        WHEN lower(relation) LIKE '%require%' OR lower(relation) LIKE '%need%' OR lower(relation) LIKE '%prerequisite%' THEN 'depends_on'
        WHEN lower(relation) LIKE '%cause%' OR lower(relation) LIKE '%lead%' OR lower(relation) LIKE '%result%' OR lower(relation) LIKE '%enable%' THEN 'causes'
        WHEN lower(relation) LIKE '%use%' OR lower(relation) LIKE '%apply%' OR lower(relation) LIKE '%utilize%' THEN 'uses'
        WHEN lower(relation) LIKE '%produce%' OR lower(relation) LIKE '%generate%' OR lower(relation) LIKE '%create%' OR lower(relation) LIKE '%output%' THEN 'produces'
        WHEN lower(relation) LIKE '%similar%' OR lower(relation) LIKE '%analogous%' OR lower(relation) LIKE '%equivalent%' THEN 'similar_to'
        ELSE 'related_to'
    END,
    confidence,
    source_ids_json,
    0,
    '{}',
    created_at,
    updated_at
FROM knowledge_edges;

DROP TABLE knowledge_edges;
ALTER TABLE knowledge_edges_v2 RENAME TO knowledge_edges;

CREATE INDEX IF NOT EXISTS idx_knowledge_edges_from ON knowledge_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_to ON knowledge_edges(to_node_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_relation ON knowledge_edges(relation);
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_edges_signature ON knowledge_edges(from_node_id, to_node_id, relation);

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS knowledge_communities (
    id                   TEXT PRIMARY KEY NOT NULL,
    level                INTEGER NOT NULL,
    title                TEXT NOT NULL DEFAULT '',
    member_node_ids_json TEXT NOT NULL DEFAULT '[]',
    parent_community_id  TEXT,
    summary_json         TEXT,
    node_count           INTEGER NOT NULL DEFAULT 0,
    edge_count           INTEGER NOT NULL DEFAULT 0,
    collapsed            INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_communities_level ON knowledge_communities(level);
CREATE INDEX IF NOT EXISTS idx_communities_parent ON knowledge_communities(parent_community_id);

CREATE TABLE IF NOT EXISTS entity_embeddings (
    node_id          TEXT PRIMARY KEY NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    embedding_model  TEXT NOT NULL,
    vector_json      TEXT NOT NULL DEFAULT '[]',
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE graph_build_runs ADD COLUMN communities_detected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE graph_build_runs ADD COLUMN current_stage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE graph_build_runs ADD COLUMN incremental INTEGER NOT NULL DEFAULT 0;