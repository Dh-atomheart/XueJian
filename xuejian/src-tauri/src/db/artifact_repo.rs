use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::db::{Database, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowArtifact {
    pub id: String,
    pub run_id: String,
    pub artifact_type: String,
    pub schema_version: i64,
    pub summary: String,
    pub source_refs: serde_json::Value,
    pub quality_envelope: serde_json::Value,
    pub error_category: Option<String>,
    pub created_by: String,
    pub lifecycle_status: String,
    pub payload: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct UpsertWorkflowArtifactRequest {
    pub id: String,
    pub run_id: String,
    pub artifact_type: String,
    pub schema_version: i64,
    pub summary: String,
    pub source_refs: serde_json::Value,
    pub quality_envelope: serde_json::Value,
    pub error_category: Option<String>,
    pub created_by: String,
    pub lifecycle_status: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Default, Clone)]
pub struct WorkflowArtifactFilters {
    pub run_id: Option<String>,
    pub artifact_type: Option<String>,
    pub lifecycle_status: Option<String>,
    pub limit: Option<i64>,
}

pub struct ArtifactRepository<'a> {
    db: &'a Database,
}

impl<'a> ArtifactRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn upsert(&self, req: UpsertWorkflowArtifactRequest) -> Result<WorkflowArtifact> {
        let existing = self.get(&req.id)?;
        let now = chrono::Utc::now().to_rfc3339();
        self.db.connection().execute(
            "INSERT INTO workflow_artifacts (
                id, run_id, artifact_type, schema_version, summary, source_refs_json,
                quality_envelope_json, error_category, created_by, lifecycle_status,
                payload_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            ON CONFLICT(id) DO UPDATE SET
                run_id = excluded.run_id,
                artifact_type = excluded.artifact_type,
                schema_version = excluded.schema_version,
                summary = excluded.summary,
                source_refs_json = excluded.source_refs_json,
                quality_envelope_json = excluded.quality_envelope_json,
                error_category = excluded.error_category,
                created_by = excluded.created_by,
                lifecycle_status = excluded.lifecycle_status,
                payload_json = excluded.payload_json,
                updated_at = excluded.updated_at",
            params![
                req.id,
                req.run_id,
                req.artifact_type,
                req.schema_version,
                req.summary,
                req.source_refs,
                req.quality_envelope,
                req.error_category,
                req.created_by,
                req.lifecycle_status,
                req.payload,
                existing
                    .as_ref()
                    .map(|artifact| artifact.created_at.as_str())
                    .unwrap_or(&now),
                now,
            ],
        )?;
        self.get(&req.id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows.into())
    }

    pub fn get(&self, id: &str) -> Result<Option<WorkflowArtifact>> {
        self.db
            .connection()
            .query_row(
                "SELECT id, run_id, artifact_type, schema_version, summary, source_refs_json,
                        quality_envelope_json, error_category, created_by, lifecycle_status,
                        payload_json, created_at, updated_at
                 FROM workflow_artifacts
                 WHERE id = ?1",
                [id],
                map_workflow_artifact,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list(&self, filters: WorkflowArtifactFilters) -> Result<Vec<WorkflowArtifact>> {
        let limit = filters.limit.unwrap_or(100).clamp(1, 500);
        let mut sql = String::from(
            "SELECT id, run_id, artifact_type, schema_version, summary, source_refs_json,
                    quality_envelope_json, error_category, created_by, lifecycle_status,
                    payload_json, created_at, updated_at
             FROM workflow_artifacts
             WHERE 1 = 1",
        );
        let mut values = Vec::<String>::new();
        if let Some(run_id) = filters.run_id {
            sql.push_str(" AND run_id = ?");
            values.push(run_id);
        }
        if let Some(artifact_type) = filters.artifact_type {
            sql.push_str(" AND artifact_type = ?");
            values.push(artifact_type);
        }
        if let Some(lifecycle_status) = filters.lifecycle_status {
            sql.push_str(" AND lifecycle_status = ?");
            values.push(lifecycle_status);
        }
        sql.push_str(" ORDER BY created_at DESC LIMIT ?");

        let mut params = values
            .iter()
            .map(|value| value as &dyn rusqlite::ToSql)
            .collect::<Vec<_>>();
        params.push(&limit);
        let mut stmt = self.db.connection().prepare(&sql)?;
        let rows = stmt.query_map(params.as_slice(), map_workflow_artifact)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn mark_lifecycle(&self, id: &str, lifecycle_status: &str) -> Result<Option<WorkflowArtifact>> {
        let now = chrono::Utc::now().to_rfc3339();
        self.db.connection().execute(
            "UPDATE workflow_artifacts
             SET lifecycle_status = ?2, updated_at = ?3
             WHERE id = ?1",
            params![id, lifecycle_status, now],
        )?;
        self.get(id)
    }

    pub fn upsert_from_workflow_result(
        &self,
        run_id: &str,
        result: &serde_json::Value,
    ) -> Result<usize> {
        let Some(artifacts) = result.get("artifacts") else {
            return Ok(0);
        };
        let values = if let Some(items) = artifacts.as_array() {
            items.clone()
        } else if let Some(object) = artifacts.as_object() {
            object.values().cloned().collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        let mut stored = 0usize;
        for artifact in values {
            if let Some(req) = artifact_payload_to_request(run_id, artifact) {
                self.upsert(req)?;
                stored += 1;
            }
        }
        Ok(stored)
    }
}

pub fn artifact_payload_to_request(
    fallback_run_id: &str,
    mut artifact: serde_json::Value,
) -> Option<UpsertWorkflowArtifactRequest> {
    redact_sensitive_json(&mut artifact);
    let artifact_id = artifact["artifactId"].as_str().map(str::trim)?;
    let artifact_type = artifact["artifactType"].as_str().map(str::trim)?;
    let schema_version = artifact["schemaVersion"].as_i64()?;
    let summary = artifact["summary"].as_str().map(str::trim)?;
    let created_by = artifact["createdBy"].as_str().map(str::trim)?;
    if artifact_id.is_empty()
        || summary.is_empty()
        || schema_version <= 0
        || !artifact["qualityEnvelope"].is_object()
        || !matches!(
            artifact_type,
            "evidence"
                | "answer"
                | "card_candidate"
                | "formal_card_write"
                | "learning_advice"
                | "study_schedule_write"
                | "trace"
        )
        || !matches!(
            created_by,
            "langgraph_rag" | "langgraph_card" | "langgraph_study" | "langgraph_multi_agent"
        )
    {
        return None;
    }
    let run_id = artifact["runId"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback_run_id);
    if run_id.is_empty() {
        return None;
    }
    let lifecycle_status = artifact["lifecycleStatus"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("created");
    if !matches!(
        lifecycle_status,
        "created" | "consumed" | "superseded" | "rolled_back" | "expired"
    ) {
        return None;
    }
    let source_refs = if artifact["sourceRefs"].is_array() {
        artifact["sourceRefs"].clone()
    } else {
        serde_json::json!([])
    };
    let error_category = artifact["errorCategory"].as_str().map(str::to_string);
    Some(UpsertWorkflowArtifactRequest {
        id: artifact_id.to_string(),
        run_id: run_id.to_string(),
        artifact_type: artifact_type.to_string(),
        schema_version,
        summary: summary.to_string(),
        source_refs,
        quality_envelope: artifact["qualityEnvelope"].clone(),
        error_category,
        created_by: created_by.to_string(),
        lifecycle_status: lifecycle_status.to_string(),
        payload: artifact,
    })
}

fn redact_sensitive_json(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                redact_sensitive_json(item);
            }
        }
        serde_json::Value::Object(map) => {
            let keys = map.keys().cloned().collect::<Vec<_>>();
            for key in keys {
                let lower = key.to_ascii_lowercase();
                if matches!(
                    lower.as_str(),
                    "prompt"
                        | "messages"
                        | "chain_of_thought"
                        | "chainofthought"
                        | "api_key"
                        | "apikey"
                        | "authorization"
                ) {
                    map.remove(&key);
                    continue;
                }
                if let Some(item) = map.get_mut(&key) {
                    redact_sensitive_json(item);
                }
            }
        }
        _ => {}
    }
}

fn map_workflow_artifact(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkflowArtifact> {
    Ok(WorkflowArtifact {
        id: row.get(0)?,
        run_id: row.get(1)?,
        artifact_type: row.get(2)?,
        schema_version: row.get(3)?,
        summary: row.get(4)?,
        source_refs: row.get(5)?,
        quality_envelope: row.get(6)?,
        error_category: row.get(7)?,
        created_by: row.get(8)?,
        lifecycle_status: row.get(9)?,
        payload: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::*;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().expect("in-memory sqlite");
        conn.execute_batch(include_str!("../migrations/V1__initial_schema.sql"))
            .expect("apply v1 migration");
        conn.execute_batch(include_str!(
            "../migrations/V2__workflow_and_fts_foundation.sql"
        ))
        .expect("apply v2 migration");
        conn.execute_batch(include_str!("../migrations/V32__workflow_artifacts.sql"))
            .expect("apply artifact migration");
        Database { conn }
    }

    #[test]
    fn artifact_roundtrip_and_lifecycle() {
        let db = test_db();
        let workflow_repo = crate::db::WorkflowRepository::new(&db);
        let run = workflow_repo
            .create_run(crate::db::CreateWorkflowRunRequest {
                workflow_type: "agent_task".to_string(),
                preset_id: None,
                status: "completed".to_string(),
                thread_id: "thread-1".to_string(),
                started_at: None,
            })
            .expect("create run");
        let repo = ArtifactRepository::new(&db);
        let artifact = repo
            .upsert(UpsertWorkflowArtifactRequest {
                id: "artifact-1".to_string(),
                run_id: run.id.clone(),
                artifact_type: "trace".to_string(),
                schema_version: 1,
                summary: "trace summary".to_string(),
                source_refs: serde_json::json!([]),
                quality_envelope: serde_json::json!({"riskLevel": "low"}),
                error_category: None,
                created_by: "langgraph_multi_agent".to_string(),
                lifecycle_status: "created".to_string(),
                payload: serde_json::json!({"artifactId": "artifact-1"}),
            })
            .expect("upsert artifact");

        assert_eq!(artifact.id, "artifact-1");
        assert_eq!(repo.get("artifact-1").expect("get artifact").unwrap().summary, "trace summary");
        assert_eq!(
            repo.list(WorkflowArtifactFilters {
                run_id: Some(run.id),
                artifact_type: Some("trace".to_string()),
                lifecycle_status: Some("created".to_string()),
                limit: None,
            })
            .expect("list artifacts")
            .len(),
            1
        );
        let rolled_back = repo
            .mark_lifecycle("artifact-1", "rolled_back")
            .expect("mark lifecycle")
            .unwrap();
        assert_eq!(rolled_back.lifecycle_status, "rolled_back");
    }
}
