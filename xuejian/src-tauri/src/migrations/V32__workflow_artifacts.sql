CREATE TABLE IF NOT EXISTS workflow_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  summary TEXT NOT NULL,
  source_refs_json TEXT NOT NULL,
  quality_envelope_json TEXT NOT NULL,
  error_category TEXT,
  created_by TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_artifacts_run_id
ON workflow_artifacts(run_id);

CREATE INDEX IF NOT EXISTS idx_workflow_artifacts_type
ON workflow_artifacts(artifact_type);

CREATE INDEX IF NOT EXISTS idx_workflow_artifacts_lifecycle
ON workflow_artifacts(lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_workflow_artifacts_run_type
ON workflow_artifacts(run_id, artifact_type);
