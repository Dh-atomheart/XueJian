ALTER TABLE podcast_episodes ADD COLUMN document_ids TEXT NOT NULL DEFAULT '[]';

UPDATE podcast_episodes
SET document_ids = CASE
  WHEN document_id IS NOT NULL AND TRIM(document_id) <> '' THEN json_array(document_id)
  ELSE '[]'
END
WHERE document_ids = '[]';

ALTER TABLE podcast_episodes ADD COLUMN style TEXT NOT NULL DEFAULT 'interview';
ALTER TABLE podcast_episodes ADD COLUMN language TEXT NOT NULL DEFAULT 'zh-CN';
ALTER TABLE podcast_episodes ADD COLUMN duration_tier TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE podcast_episodes ADD COLUMN tts_provider TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE podcast_episodes ADD COLUMN audio_format TEXT NOT NULL DEFAULT 'mp3';
ALTER TABLE podcast_episodes ADD COLUMN outline_json TEXT;
ALTER TABLE podcast_episodes ADD COLUMN evaluation_json TEXT;
ALTER TABLE podcast_episodes ADD COLUMN current_stage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE podcast_episodes ADD COLUMN completed_segments INTEGER NOT NULL DEFAULT 0;
ALTER TABLE podcast_episodes ADD COLUMN total_segments INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_podcast_episodes_created_at ON podcast_episodes(created_at DESC);

CREATE TABLE IF NOT EXISTS podcast_audio_segments (
  id TEXT PRIMARY KEY NOT NULL,
  episode_id TEXT NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
  dialogue_segment_id TEXT NOT NULL,
  speaker TEXT NOT NULL,
  file_path TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  tts_provider TEXT NOT NULL,
  voice_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_podcast_audio_segments_episode
  ON podcast_audio_segments(episode_id);