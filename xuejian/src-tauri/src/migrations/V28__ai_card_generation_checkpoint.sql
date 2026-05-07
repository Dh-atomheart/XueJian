-- V28: Persist resumable checkpoints for direct AI card generation jobs.

ALTER TABLE background_jobs
ADD COLUMN checkpoint_json TEXT;
