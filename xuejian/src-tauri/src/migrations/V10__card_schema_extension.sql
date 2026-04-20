-- V10: Card schema extension + api_configs provider normalization
-- Adds title, card_type, cluster_id, export_guid to cards and card_candidates.
-- Reverts 'openai_compatible' provider back to 'custom' and adds explicit protocol column.

-- cards: new columns
ALTER TABLE cards ADD COLUMN title TEXT;
ALTER TABLE cards ADD COLUMN card_type TEXT NOT NULL DEFAULT 'qa';
ALTER TABLE cards ADD COLUMN cluster_id TEXT;
ALTER TABLE cards ADD COLUMN export_guid TEXT;

-- card_candidates: new columns
ALTER TABLE card_candidates ADD COLUMN title TEXT;
ALTER TABLE card_candidates ADD COLUMN card_type TEXT NOT NULL DEFAULT 'qa';

-- api_configs: revert V9 provider rename; add protocol column
ALTER TABLE api_configs ADD COLUMN protocol TEXT;

UPDATE api_configs
SET provider = 'custom',
    protocol = 'openai-compatible'
WHERE provider = 'openai_compatible';

UPDATE api_configs
SET protocol = 'native'
WHERE provider IN ('openai', 'anthropic') AND protocol IS NULL;

-- Unique index on export_guid (nullable; only unique when not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_export_guid ON cards (export_guid)
WHERE export_guid IS NOT NULL;
