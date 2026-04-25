ALTER TABLE card_animations ADD COLUMN mode TEXT NOT NULL DEFAULT 'quick_preview';
ALTER TABLE card_animations ADD COLUMN video_path TEXT;
ALTER TABLE card_animations ADD COLUMN poster_path TEXT;
ALTER TABLE card_animations ADD COLUMN render_log_path TEXT;
ALTER TABLE card_animations ADD COLUMN error_code TEXT;
ALTER TABLE card_animations ADD COLUMN retryable INTEGER NOT NULL DEFAULT 1;
