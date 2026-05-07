use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::{DbError, Result};

use super::now_utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mvp0BackgroundJob {
    pub id: String,
    pub job_type: String,
    pub status: String,
    pub target_type: String,
    pub target_id: String,
    pub payload_json: String,
    pub checkpoint_json: Option<String>,
    pub result_json: Option<String>,
    pub error_message: Option<String>,
    pub error_details: Option<String>,
    pub progress_current: Option<i32>,
    pub progress_total: Option<i32>,
    pub progress_message: Option<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub cancel_requested_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateMvp0BackgroundJobRequest {
    pub job_type: String,
    pub target_type: String,
    pub target_id: String,
    pub payload_json: String,
    pub progress_total: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMvp0BackgroundJobStatusRequest {
    pub status: String,
    pub result_json: Option<String>,
    pub error_message: Option<String>,
    pub error_details: Option<String>,
    pub progress_current: Option<i32>,
    pub progress_total: Option<i32>,
    pub progress_message: Option<String>,
}

pub struct Mvp0BackgroundJobRepository<'a> {
    conn: &'a Connection,
}

impl<'a> Mvp0BackgroundJobRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn create_job(&self, req: CreateMvp0BackgroundJobRequest) -> Result<Mvp0BackgroundJob> {
        let job = Mvp0BackgroundJob {
            id: Uuid::new_v4().to_string(),
            job_type: req.job_type,
            status: "queued".to_string(),
            target_type: req.target_type,
            target_id: req.target_id,
            payload_json: req.payload_json,
            checkpoint_json: None,
            result_json: None,
            error_message: None,
            error_details: None,
            progress_current: Some(0),
            progress_total: req.progress_total,
            progress_message: None,
            created_at: now_utc(),
            started_at: None,
            finished_at: None,
            cancel_requested_at: None,
        };

        self.conn.execute(
            "INSERT INTO background_jobs (
                id, type, status, target_type, target_id, payload_json, checkpoint_json,
                result_json, error_message, error_details, progress_current, progress_total,
                progress_message, created_at, started_at, finished_at, cancel_requested_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, NULL, NULL, ?7, ?8, NULL, ?9, NULL, NULL, NULL)",
            params![
                &job.id,
                &job.job_type,
                &job.status,
                &job.target_type,
                &job.target_id,
                &job.payload_json,
                job.progress_current,
                job.progress_total,
                &job.created_at,
            ],
        )?;

        Ok(job)
    }

    pub fn find_by_id(&self, id: &str) -> Result<Option<Mvp0BackgroundJob>> {
        self.conn
            .query_row(
                "SELECT id, type, status, target_type, target_id, payload_json, checkpoint_json, result_json,
                        error_message, error_details, progress_current, progress_total,
                        progress_message, created_at, started_at, finished_at, cancel_requested_at
                 FROM background_jobs WHERE id = ?1",
                [id],
                map_background_job,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_by_target(
        &self,
        target_type: &str,
        target_id: &str,
    ) -> Result<Vec<Mvp0BackgroundJob>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, type, status, target_type, target_id, payload_json, checkpoint_json, result_json,
                    error_message, error_details, progress_current, progress_total,
                    progress_message, created_at, started_at, finished_at, cancel_requested_at
             FROM background_jobs
             WHERE target_type = ?1 AND target_id = ?2
             ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![target_type, target_id], map_background_job)?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn find_latest_by_target(
        &self,
        target_type: &str,
        target_id: &str,
        job_type: Option<&str>,
    ) -> Result<Option<Mvp0BackgroundJob>> {
        let sql = if job_type.is_some() {
            "SELECT id, type, status, target_type, target_id, payload_json, checkpoint_json, result_json,
                    error_message, error_details, progress_current, progress_total,
                    progress_message, created_at, started_at, finished_at, cancel_requested_at
             FROM background_jobs
             WHERE target_type = ?1 AND target_id = ?2 AND type = ?3
             ORDER BY created_at DESC
             LIMIT 1"
        } else {
            "SELECT id, type, status, target_type, target_id, payload_json, checkpoint_json, result_json,
                    error_message, error_details, progress_current, progress_total,
                    progress_message, created_at, started_at, finished_at, cancel_requested_at
             FROM background_jobs
             WHERE target_type = ?1 AND target_id = ?2
             ORDER BY created_at DESC
             LIMIT 1"
        };

        if let Some(job_type) = job_type {
            self.conn
                .query_row(
                    sql,
                    params![target_type, target_id, job_type],
                    map_background_job,
                )
                .optional()
                .map_err(Into::into)
        } else {
            self.conn
                .query_row(sql, params![target_type, target_id], map_background_job)
                .optional()
                .map_err(Into::into)
        }
    }

    pub fn list_jobs(
        &self,
        job_type: Option<&str>,
        status: Option<&str>,
        target_type: Option<&str>,
        target_id: Option<&str>,
    ) -> Result<Vec<Mvp0BackgroundJob>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, type, status, target_type, target_id, payload_json, checkpoint_json, result_json,
                    error_message, error_details, progress_current, progress_total,
                    progress_message, created_at, started_at, finished_at, cancel_requested_at
             FROM background_jobs
             WHERE (?1 IS NULL OR type = ?1)
               AND (?2 IS NULL OR status = ?2)
               AND (?3 IS NULL OR target_type = ?3)
               AND (?4 IS NULL OR target_id = ?4)
             ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(
            params![job_type, status, target_type, target_id],
            map_background_job,
        )?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn request_cancel(&self, id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE background_jobs SET cancel_requested_at = ?2 WHERE id = ?1",
            params![id, now_utc()],
        )?;
        Ok(())
    }

    pub fn update_checkpoint(
        &self,
        id: &str,
        checkpoint_json: Option<&str>,
    ) -> Result<Mvp0BackgroundJob> {
        self.conn.execute(
            "UPDATE background_jobs SET checkpoint_json = ?2 WHERE id = ?1",
            params![id, checkpoint_json],
        )?;
        self.find_by_id(id)?.ok_or_else(|| {
            DbError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("background job {id} disappeared after checkpoint update"),
            ))
        })
    }

    pub fn reset_failed_for_resume(&self, id: &str) -> Result<Mvp0BackgroundJob> {
        let current = self.find_by_id(id)?.ok_or_else(|| {
            DbError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("background job {id} not found"),
            ))
        })?;
        if current.status != "failed" {
            return Err(DbError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!(
                    "only failed background jobs can be resumed, got {}",
                    current.status
                ),
            )));
        }

        self.conn.execute(
            "UPDATE background_jobs
             SET status = 'queued',
                 result_json = NULL,
                 error_message = NULL,
                 error_details = NULL,
                 progress_message = 'AI card generation queued for resume',
                 started_at = NULL,
                 finished_at = NULL,
                 cancel_requested_at = NULL
             WHERE id = ?1",
            params![id],
        )?;

        self.find_by_id(id)?.ok_or_else(|| {
            DbError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("background job {id} disappeared after resume reset"),
            ))
        })
    }

    pub fn update_status(
        &self,
        id: &str,
        req: UpdateMvp0BackgroundJobStatusRequest,
    ) -> Result<Mvp0BackgroundJob> {
        let current = self.find_by_id(id)?.ok_or_else(|| {
            DbError::Json(serde_json::Error::io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("background job {id} not found"),
            )))
        })?;

        if !is_valid_transition(&current.status, &req.status) {
            return Err(DbError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!(
                    "invalid background job transition: {} -> {}",
                    current.status, req.status
                ),
            )));
        }

        let started_at = if current.started_at.is_none() && req.status == "running" {
            Some(now_utc())
        } else {
            current.started_at.clone()
        };
        let finished_at = if matches!(req.status.as_str(), "succeeded" | "failed" | "cancelled") {
            Some(now_utc())
        } else {
            current.finished_at.clone()
        };

        self.conn.execute(
            "UPDATE background_jobs
             SET status = ?2,
                 result_json = ?3,
                 error_message = ?4,
                 error_details = ?5,
                 progress_current = ?6,
                 progress_total = ?7,
                 progress_message = ?8,
                 started_at = ?9,
                 finished_at = ?10
             WHERE id = ?1",
            params![
                id,
                req.status,
                req.result_json,
                req.error_message,
                req.error_details,
                req.progress_current,
                req.progress_total,
                req.progress_message,
                started_at,
                finished_at,
            ],
        )?;

        self.find_by_id(id)?.ok_or_else(|| {
            DbError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("background job {id} disappeared after update"),
            ))
        })
    }
}

fn is_valid_transition(current: &str, next: &str) -> bool {
    if current == next {
        return true;
    }

    matches!(
        (current, next),
        ("queued", "running")
            | ("queued", "cancelled")
            | ("queued", "failed")
            | ("running", "succeeded")
            | ("running", "failed")
            | ("running", "cancelled")
    )
}

fn map_background_job(row: &Row<'_>) -> rusqlite::Result<Mvp0BackgroundJob> {
    Ok(Mvp0BackgroundJob {
        id: row.get(0)?,
        job_type: row.get(1)?,
        status: row.get(2)?,
        target_type: row.get(3)?,
        target_id: row.get(4)?,
        payload_json: row.get(5)?,
        checkpoint_json: row.get(6)?,
        result_json: row.get(7)?,
        error_message: row.get(8)?,
        error_details: row.get(9)?,
        progress_current: row.get(10)?,
        progress_total: row.get(11)?,
        progress_message: row.get(12)?,
        created_at: row.get(13)?,
        started_at: row.get(14)?,
        finished_at: row.get(15)?,
        cancel_requested_at: row.get(16)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::TestDatabase;

    #[test]
    fn background_job_state_machine() {
        let test_db = TestDatabase::new();
        let repo = Mvp0BackgroundJobRepository::new(test_db.connection());
        let job = repo
            .create_job(CreateMvp0BackgroundJobRequest {
                job_type: "document_parse".to_string(),
                target_type: "document".to_string(),
                target_id: "doc-1".to_string(),
                payload_json: "{}".to_string(),
                progress_total: Some(3),
            })
            .expect("job should be created");

        let running = repo
            .update_status(
                &job.id,
                UpdateMvp0BackgroundJobStatusRequest {
                    status: "running".to_string(),
                    result_json: None,
                    error_message: None,
                    error_details: None,
                    progress_current: Some(1),
                    progress_total: Some(3),
                    progress_message: Some("parsing".to_string()),
                },
            )
            .expect("queued -> running should succeed");
        assert_eq!(running.status, "running");
        assert!(
            running.started_at.is_some(),
            "running transition should set started_at"
        );

        let invalid = repo.update_status(
            &job.id,
            UpdateMvp0BackgroundJobStatusRequest {
                status: "queued".to_string(),
                result_json: None,
                error_message: None,
                error_details: None,
                progress_current: Some(1),
                progress_total: Some(3),
                progress_message: None,
            },
        );
        assert!(invalid.is_err(), "running -> queued must be rejected");

        let succeeded = repo
            .update_status(
                &job.id,
                UpdateMvp0BackgroundJobStatusRequest {
                    status: "succeeded".to_string(),
                    result_json: Some("{\"pages\": 12}".to_string()),
                    error_message: None,
                    error_details: None,
                    progress_current: Some(3),
                    progress_total: Some(3),
                    progress_message: Some("done".to_string()),
                },
            )
            .expect("running -> succeeded should succeed");
        assert_eq!(succeeded.status, "succeeded");
        assert!(
            succeeded.finished_at.is_some(),
            "terminal transition should set finished_at"
        );
    }

    #[test]
    fn latest_job_lookup_prefers_newest_matching_record() {
        let test_db = TestDatabase::new();
        let repo = Mvp0BackgroundJobRepository::new(test_db.connection());

        let older = repo
            .create_job(CreateMvp0BackgroundJobRequest {
                job_type: "document_parse".to_string(),
                target_type: "document".to_string(),
                target_id: "doc-1".to_string(),
                payload_json: "{}".to_string(),
                progress_total: Some(2),
            })
            .expect("older job should be created");
        let newer = repo
            .create_job(CreateMvp0BackgroundJobRequest {
                job_type: "document_parse".to_string(),
                target_type: "document".to_string(),
                target_id: "doc-1".to_string(),
                payload_json: "{}".to_string(),
                progress_total: Some(4),
            })
            .expect("newer job should be created");

        let latest = repo
            .find_latest_by_target("document", "doc-1", Some("document_parse"))
            .expect("latest lookup should succeed")
            .expect("latest job should exist");

        assert_eq!(latest.id, newer.id);
        assert_ne!(latest.id, older.id);
    }

    #[test]
    fn checkpoint_can_be_persisted_and_failed_job_reset_for_resume() {
        let test_db = TestDatabase::new();
        let repo = Mvp0BackgroundJobRepository::new(test_db.connection());
        let job = repo
            .create_job(CreateMvp0BackgroundJobRequest {
                job_type: "ai_card_generation".to_string(),
                target_type: "document".to_string(),
                target_id: "doc-1".to_string(),
                payload_json: "{}".to_string(),
                progress_total: Some(2),
            })
            .expect("job should be created");

        let checkpoint = r#"{"nextChunkIndex":1,"cards":[]}"#;
        let checkpointed = repo
            .update_checkpoint(&job.id, Some(checkpoint))
            .expect("checkpoint should persist");
        assert_eq!(checkpointed.checkpoint_json.as_deref(), Some(checkpoint));

        repo.update_status(
            &job.id,
            UpdateMvp0BackgroundJobStatusRequest {
                status: "failed".to_string(),
                result_json: None,
                error_message: Some("timeout".to_string()),
                error_details: Some("timeout".to_string()),
                progress_current: Some(1),
                progress_total: Some(2),
                progress_message: Some("failed".to_string()),
            },
        )
        .expect("queued -> failed should succeed");

        let reset = repo
            .reset_failed_for_resume(&job.id)
            .expect("failed job should reset for resume");
        assert_eq!(reset.status, "queued");
        assert!(reset.error_message.is_none());
        assert!(reset.finished_at.is_none());
        assert_eq!(reset.checkpoint_json.as_deref(), Some(checkpoint));
    }
}
