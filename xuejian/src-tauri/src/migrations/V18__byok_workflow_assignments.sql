ALTER TABLE api_configs ADD COLUMN key_verified_at TEXT;
ALTER TABLE api_configs ADD COLUMN key_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE api_configs ADD COLUMN display_name TEXT;

UPDATE api_configs
SET provider = 'deepseek',
    protocol = 'openai-compatible'
WHERE lower(provider) = 'openai_compatible'
  AND lower(ifnull(base_url, '')) LIKE '%deepseek.com%';

UPDATE api_configs
SET provider = 'custom_google',
    protocol = 'native'
WHERE lower(provider) = 'openai_compatible'
  AND (
    lower(ifnull(base_url, '')) LIKE '%generativelanguage.googleapis.com%'
    OR lower(ifnull(base_url, '')) LIKE '%googleapis.com%/v1beta%'
    OR lower(ifnull(base_url, '')) LIKE '%vertex%'
  );

UPDATE api_configs
SET provider = 'custom_anthropic',
    protocol = 'native'
WHERE lower(provider) = 'openai_compatible'
  AND (
    lower(ifnull(protocol, '')) = 'native'
    OR lower(ifnull(base_url, '')) LIKE '%anthropic%'
  );

UPDATE api_configs
SET provider = 'custom_openai',
    protocol = 'openai-compatible'
WHERE lower(provider) IN ('openai_compatible', 'custom', 'qianfan');

CREATE TABLE workflow_model_assignments (
    workflow_type TEXT PRIMARY KEY,
    api_config_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (api_config_id) REFERENCES api_configs(id) ON DELETE CASCADE
);

CREATE INDEX idx_wma_api_config_id ON workflow_model_assignments(api_config_id);

CREATE TABLE provider_budget_usage (
    id TEXT PRIMARY KEY,
    api_config_id TEXT NOT NULL,
    period TEXT NOT NULL,
    estimated_cost_usd REAL NOT NULL DEFAULT 0.0,
    workflow_runs_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (api_config_id) REFERENCES api_configs(id) ON DELETE CASCADE,
    UNIQUE(api_config_id, period)
);

CREATE INDEX idx_pbu_config_period ON provider_budget_usage(api_config_id, period);

INSERT OR IGNORE INTO workflow_model_assignments (workflow_type, api_config_id, assigned_at, updated_at)
SELECT 'card_generation', id, datetime('now'), datetime('now')
FROM api_configs
WHERE is_default = TRUE AND is_enabled = TRUE
LIMIT 1;

INSERT OR IGNORE INTO workflow_model_assignments (workflow_type, api_config_id, assigned_at, updated_at)
SELECT 'document_embedding', id, datetime('now'), datetime('now')
FROM api_configs
WHERE is_default = TRUE AND is_enabled = TRUE
LIMIT 1;

INSERT OR IGNORE INTO workflow_model_assignments (workflow_type, api_config_id, assigned_at, updated_at)
SELECT 'knowledge_qa', id, datetime('now'), datetime('now')
FROM api_configs
WHERE is_default = TRUE AND is_enabled = TRUE
LIMIT 1;

INSERT OR IGNORE INTO workflow_model_assignments (workflow_type, api_config_id, assigned_at, updated_at)
SELECT 'podcast_generation', id, datetime('now'), datetime('now')
FROM api_configs
WHERE is_default = TRUE AND is_enabled = TRUE
LIMIT 1;

