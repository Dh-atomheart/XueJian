ALTER TABLE api_configs ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'api_key';

UPDATE api_configs
SET provider = 'openai_compatible'
WHERE provider = 'custom';