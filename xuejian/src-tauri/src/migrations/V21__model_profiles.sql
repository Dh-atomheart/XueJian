CREATE TABLE model_profiles (
    id TEXT PRIMARY KEY,
    api_config_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    display_name TEXT,
    capabilities_json TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_default_for_connection BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (api_config_id) REFERENCES api_configs(id) ON DELETE CASCADE
);

CREATE INDEX idx_model_profiles_api_config_id ON model_profiles(api_config_id);
CREATE UNIQUE INDEX idx_model_profiles_connection_model
ON model_profiles(api_config_id, model_id);
CREATE UNIQUE INDEX idx_model_profiles_default_connection
ON model_profiles(api_config_id)
WHERE is_default_for_connection = TRUE;

INSERT INTO model_profiles (
    id,
    api_config_id,
    model_id,
    display_name,
    capabilities_json,
    is_enabled,
    is_default_for_connection,
    created_at,
    updated_at
)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6))),
    id,
    model,
    COALESCE(display_name, name, model),
    '[]',
    is_enabled,
    TRUE,
    COALESCE(created_at, datetime('now')),
    COALESCE(created_at, datetime('now'))
FROM api_configs
WHERE trim(COALESCE(model, '')) <> ''
  AND NOT EXISTS (
      SELECT 1
      FROM model_profiles existing
      WHERE existing.api_config_id = api_configs.id
  );

ALTER TABLE workflow_model_assignments RENAME TO workflow_model_assignments_legacy;

CREATE TABLE workflow_model_assignments (
    workflow_type TEXT PRIMARY KEY,
    model_profile_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (model_profile_id) REFERENCES model_profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_wma_model_profile_id ON workflow_model_assignments(model_profile_id);

INSERT INTO workflow_model_assignments (workflow_type, model_profile_id, assigned_at, updated_at)
SELECT
    legacy.workflow_type,
    profiles.id,
    legacy.assigned_at,
    legacy.updated_at
FROM workflow_model_assignments_legacy legacy
JOIN model_profiles profiles
    ON profiles.api_config_id = legacy.api_config_id
   AND profiles.is_default_for_connection = TRUE;

DROP TABLE workflow_model_assignments_legacy;

INSERT OR IGNORE INTO workflow_model_assignments (workflow_type, model_profile_id, assigned_at, updated_at)
SELECT
    workflow_type,
    (
        SELECT id
        FROM model_profiles
        WHERE is_default_for_connection = TRUE
        ORDER BY created_at ASC
        LIMIT 1
    ),
    datetime('now'),
    datetime('now')
FROM (
    SELECT 'card_generation' AS workflow_type
    UNION ALL SELECT 'document_embedding'
    UNION ALL SELECT 'knowledge_qa'
    UNION ALL SELECT 'podcast_generation'
    UNION ALL SELECT 'knowledge_graph'
    UNION ALL SELECT 'card_animation'
) seed
WHERE EXISTS (
    SELECT 1
    FROM model_profiles
    WHERE is_default_for_connection = TRUE
);
