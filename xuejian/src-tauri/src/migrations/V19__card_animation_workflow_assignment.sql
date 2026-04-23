INSERT OR IGNORE INTO workflow_model_assignments (workflow_type, api_config_id, assigned_at, updated_at)
SELECT 'card_animation', id, datetime('now'), datetime('now')
FROM api_configs
WHERE is_default = TRUE AND is_enabled = TRUE
LIMIT 1;

INSERT OR IGNORE INTO workflow_model_assignments (workflow_type, api_config_id, assigned_at, updated_at)
SELECT 'card_animation', id, datetime('now'), datetime('now')
FROM api_configs
WHERE is_enabled = TRUE
ORDER BY is_default DESC, created_at ASC
LIMIT 1;
