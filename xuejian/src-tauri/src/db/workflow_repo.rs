use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::{Database, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRun {
    pub id: String,
    pub workflow_type: String,
    pub preset_id: Option<String>,
    pub status: String,
    pub thread_id: String,
    pub checkpoint_ref: Option<String>,
    pub approval_payload: Option<serde_json::Value>,
    pub cost_usd: Option<f64>,
    pub error_message: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowCheckpoint {
    pub id: String,
    pub run_id: String,
    pub checkpoint_ref: String,
    pub step_key: Option<String>,
    pub payload: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowEvent {
    pub id: String,
    pub run_id: String,
    pub event_type: String,
    pub message: Option<String>,
    pub progress: Option<f64>,
    pub payload: Option<serde_json::Value>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkflowRunRequest {
    pub workflow_type: String,
    pub preset_id: Option<String>,
    pub status: String,
    pub thread_id: String,
    pub started_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWorkflowRunRequest {
    pub status: Option<String>,
    pub checkpoint_ref: Option<String>,
    pub approval_payload: Option<serde_json::Value>,
    pub cost_usd: Option<f64>,
    pub error_message: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertWorkflowCheckpointRequest {
    pub run_id: String,
    pub checkpoint_ref: String,
    pub step_key: Option<String>,
    pub payload: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct AppendWorkflowEventRequest {
    pub run_id: String,
    pub event_type: String,
    pub message: Option<String>,
    pub progress: Option<f64>,
    pub payload: Option<serde_json::Value>,
}

pub struct WorkflowRepository<'a> {
    db: &'a Database,
}

impl<'a> WorkflowRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn create_run(&self, req: CreateWorkflowRunRequest) -> Result<WorkflowRun> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let preset_id = req.preset_id;
        let started_at = req.started_at;

        self.db.connection().execute(
            "INSERT INTO workflow_runs (
                id, workflow_type, preset_id, status, thread_id,
                started_at, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                &id,
                &req.workflow_type,
                preset_id.as_deref(),
                &req.status,
                &req.thread_id,
                started_at.as_deref(),
                &now,
                &now,
            ],
        )?;

        Ok(WorkflowRun {
            id,
            workflow_type: req.workflow_type,
            preset_id,
            status: req.status,
            thread_id: req.thread_id,
            checkpoint_ref: None,
            approval_payload: None,
            cost_usd: None,
            error_message: None,
            started_at,
            finished_at: None,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn list_runs(&self, limit: Option<i64>) -> Result<Vec<WorkflowRun>> {
        let limit = limit.unwrap_or(20);
        let mut stmt = self.db.connection().prepare(
            "SELECT id, workflow_type, preset_id, status, thread_id, checkpoint_ref,
                    approval_payload, cost_usd, error_message, started_at, finished_at,
                    created_at, updated_at
             FROM workflow_runs
             ORDER BY created_at DESC
             LIMIT ?1",
        )?;

        let runs = stmt.query_map(params![limit], map_workflow_run)?;
        runs.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn get_run(&self, id: &str) -> Result<Option<WorkflowRun>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, workflow_type, preset_id, status, thread_id, checkpoint_ref,
                    approval_payload, cost_usd, error_message, started_at, finished_at,
                    created_at, updated_at
             FROM workflow_runs
             WHERE id = ?1",
        )?;

        stmt.query_row(params![id], map_workflow_run)
            .optional()
            .map_err(Into::into)
    }

    pub fn update_run(
        &self,
        id: &str,
        req: UpdateWorkflowRunRequest,
    ) -> Result<Option<WorkflowRun>> {
        let Some(current) = self.get_run(id)? else {
            return Ok(None);
        };

        let now = chrono::Utc::now().to_rfc3339();
        let status = req.status.unwrap_or(current.status);
        let checkpoint_ref = req.checkpoint_ref.or(current.checkpoint_ref);
        let approval_payload = req.approval_payload.or(current.approval_payload);
        let cost_usd = req.cost_usd.or(current.cost_usd);
        let error_message = req.error_message.or(current.error_message);
        let started_at = req.started_at.or(current.started_at);
        let finished_at = req.finished_at.or(current.finished_at);

        self.db.connection().execute(
            "UPDATE workflow_runs
             SET status = ?1,
                 checkpoint_ref = ?2,
                 approval_payload = ?3,
                 cost_usd = ?4,
                 error_message = ?5,
                 started_at = ?6,
                 finished_at = ?7,
                 updated_at = ?8
             WHERE id = ?9",
            params![
                status,
                checkpoint_ref,
                approval_payload,
                cost_usd,
                error_message,
                started_at,
                finished_at,
                &now,
                id,
            ],
        )?;

        self.get_run(id)
    }

    pub fn upsert_checkpoint(
        &self,
        req: UpsertWorkflowCheckpointRequest,
    ) -> Result<WorkflowCheckpoint> {
        let existing = self.get_checkpoint(&req.run_id, &req.checkpoint_ref)?;
        let now = chrono::Utc::now().to_rfc3339();
        let id = existing
            .as_ref()
            .map(|checkpoint| checkpoint.id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        self.db.connection().execute(
            "INSERT INTO workflow_checkpoints (
                id, run_id, checkpoint_ref, step_key, payload, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(run_id, checkpoint_ref) DO UPDATE SET
                step_key = excluded.step_key,
                payload = excluded.payload,
                updated_at = excluded.updated_at",
            params![
                &id,
                &req.run_id,
                &req.checkpoint_ref,
                req.step_key,
                &req.payload,
                existing
                    .as_ref()
                    .map(|checkpoint| checkpoint.created_at.as_str())
                    .unwrap_or(&now),
                &now,
            ],
        )?;

        self.get_checkpoint(&req.run_id, &req.checkpoint_ref)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows.into())
    }

    pub fn get_checkpoint(
        &self,
        run_id: &str,
        checkpoint_ref: &str,
    ) -> Result<Option<WorkflowCheckpoint>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, run_id, checkpoint_ref, step_key, payload, created_at, updated_at
             FROM workflow_checkpoints
             WHERE run_id = ?1 AND checkpoint_ref = ?2",
        )?;

        stmt.query_row(params![run_id, checkpoint_ref], map_workflow_checkpoint)
            .optional()
            .map_err(Into::into)
    }

    pub fn get_latest_checkpoint(&self, run_id: &str) -> Result<Option<WorkflowCheckpoint>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, run_id, checkpoint_ref, step_key, payload, created_at, updated_at
             FROM workflow_checkpoints
             WHERE run_id = ?1
             ORDER BY updated_at DESC
             LIMIT ?2",
        )?;

        stmt.query_row(params![run_id, 1], map_workflow_checkpoint)
            .optional()
            .map_err(Into::into)
    }

    pub fn list_events(&self, run_id: &str, limit: Option<i64>) -> Result<Vec<WorkflowEvent>> {
        let limit = limit.unwrap_or(50);
        let mut stmt = self.db.connection().prepare(
            "SELECT id, run_id, event_type, message, progress, payload, created_at
             FROM workflow_events
             WHERE run_id = ?1
             ORDER BY created_at DESC
             LIMIT ?2",
        )?;

        let events = stmt.query_map(params![run_id, limit], map_workflow_event)?;
        events
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn append_event(&self, req: AppendWorkflowEventRequest) -> Result<WorkflowEvent> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        self.db.connection().execute(
            "INSERT INTO workflow_events (
                id, run_id, event_type, message, progress, payload, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                &id,
                &req.run_id,
                &req.event_type,
                req.message,
                req.progress,
                req.payload,
                &now,
            ],
        )?;

        Ok(WorkflowEvent {
            id,
            run_id: req.run_id,
            event_type: req.event_type,
            message: req.message,
            progress: req.progress,
            payload: req.payload,
            created_at: now,
        })
    }
}

fn map_workflow_run(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkflowRun> {
    Ok(WorkflowRun {
        id: row.get(0)?,
        workflow_type: row.get(1)?,
        preset_id: row.get(2)?,
        status: row.get(3)?,
        thread_id: row.get(4)?,
        checkpoint_ref: row.get(5)?,
        approval_payload: row.get(6)?,
        cost_usd: row.get(7)?,
        error_message: row.get(8)?,
        started_at: row.get(9)?,
        finished_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn map_workflow_checkpoint(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkflowCheckpoint> {
    Ok(WorkflowCheckpoint {
        id: row.get(0)?,
        run_id: row.get(1)?,
        checkpoint_ref: row.get(2)?,
        step_key: row.get(3)?,
        payload: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn map_workflow_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkflowEvent> {
    Ok(WorkflowEvent {
        id: row.get(0)?,
        run_id: row.get(1)?,
        event_type: row.get(2)?,
        message: row.get(3)?,
        progress: row.get(4)?,
        payload: row.get(5)?,
        created_at: row.get(6)?,
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

        Database { conn }
    }

    #[test]
    fn workflow_run_checkpoint_and_event_roundtrip() {
        let db = test_db();
        let repo = WorkflowRepository::new(&db);

        let run = repo
            .create_run(CreateWorkflowRunRequest {
                workflow_type: "card_generation".to_string(),
                preset_id: Some("preset-1".to_string()),
                status: "queued".to_string(),
                thread_id: "thread-1".to_string(),
                started_at: None,
            })
            .expect("create workflow run");

        let updated_run = repo
            .update_run(
                &run.id,
                UpdateWorkflowRunRequest {
                    status: Some("running".to_string()),
                    checkpoint_ref: Some("step-1".to_string()),
                    approval_payload: Some(serde_json::json!({ "reviewer": "user" })),
                    cost_usd: Some(0.42),
                    error_message: None,
                    started_at: Some("2026-04-16T00:00:00Z".to_string()),
                    finished_at: None,
                },
            )
            .expect("update workflow run")
            .expect("workflow run exists");

        assert_eq!(updated_run.status, "running");
        assert_eq!(updated_run.checkpoint_ref.as_deref(), Some("step-1"));

        let checkpoint = repo
            .upsert_checkpoint(UpsertWorkflowCheckpointRequest {
                run_id: run.id.clone(),
                checkpoint_ref: "step-1".to_string(),
                step_key: Some("extract-candidates".to_string()),
                payload: serde_json::json!({ "cursor": 3 }),
            })
            .expect("upsert checkpoint");

        assert_eq!(checkpoint.step_key.as_deref(), Some("extract-candidates"));

        let event = repo
            .append_event(AppendWorkflowEventRequest {
                run_id: run.id.clone(),
                event_type: "progress".to_string(),
                message: Some("chunk 3/10".to_string()),
                progress: Some(0.3),
                payload: Some(serde_json::json!({ "chunkIndex": 3 })),
            })
            .expect("append event");

        assert_eq!(event.progress, Some(0.3));

        let listed_runs = repo.list_runs(Some(10)).expect("list runs");
        let listed_events = repo.list_events(&run.id, Some(10)).expect("list events");

        assert_eq!(listed_runs.len(), 1);
        assert_eq!(listed_events.len(), 1);
        assert_eq!(listed_events[0].event_type, "progress");
    }
}
