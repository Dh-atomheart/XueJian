use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use tauri::State;

use crate::{
    commands::{
        documents::repair_stuck_document_jobs_for_db, AppState, CommandError, CommandResult,
    },
    db::{Mvp0BackgroundJob, Mvp0BackgroundJobRepository, UpdateMvp0BackgroundJobStatusRequest},
};

const AI_CARD_GENERATION_JOB_TYPE: &str = "ai_card_generation";
const QUEUED_STALE_AFTER_MINUTES: i64 = 5;
const RUNNING_NO_PROGRESS_STALE_AFTER_MINUTES: i64 = 5;
const RUNNING_STALE_AFTER_MINUTES: i64 = 20;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundJobDto {
    pub id: String,
    pub job_type: String,
    pub status: String,
    pub target_type: String,
    pub target_id: String,
    pub payload_json: String,
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

impl From<Mvp0BackgroundJob> for BackgroundJobDto {
    fn from(job: Mvp0BackgroundJob) -> Self {
        Self {
            id: job.id,
            job_type: job.job_type,
            status: job.status,
            target_type: job.target_type,
            target_id: job.target_id,
            payload_json: job.payload_json,
            result_json: job.result_json,
            error_message: job.error_message,
            error_details: job.error_details,
            progress_current: job.progress_current,
            progress_total: job.progress_total,
            progress_message: job.progress_message,
            created_at: job.created_at,
            started_at: job.started_at,
            finished_at: job.finished_at,
            cancel_requested_at: job.cancel_requested_at,
        }
    }
}

#[tauri::command]
pub fn list_background_jobs(
    state: State<'_, AppState>,
    job_type: Option<String>,
    status: Option<String>,
    target_type: Option<String>,
    target_id: Option<String>,
) -> CommandResult<Vec<BackgroundJobDto>> {
    let db = state.lock_db()?;
    let document_repairs = repair_stuck_document_jobs_for_db(&db)?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let ai_repairs = repair_stale_ai_card_generation_jobs(&repo)?;
    if document_repairs + ai_repairs > 0 {
        log::info!(
            "background_jobs.repair.completed scope=background_jobs documents={} ai_card_generation={}",
            document_repairs,
            ai_repairs
        );
    }
    let jobs = repo.list_jobs(
        job_type.as_deref(),
        status.as_deref(),
        target_type.as_deref(),
        target_id.as_deref(),
    )?;
    Ok(jobs.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn get_background_job(
    state: State<'_, AppState>,
    job_id: String,
) -> CommandResult<Option<BackgroundJobDto>> {
    let db = state.lock_db()?;
    let document_repairs = repair_stuck_document_jobs_for_db(&db)?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let ai_repairs = repair_stale_ai_card_generation_jobs(&repo)?;
    if document_repairs + ai_repairs > 0 {
        log::info!(
            "background_jobs.repair.completed scope=background_job documents={} ai_card_generation={}",
            document_repairs,
            ai_repairs
        );
    }
    let job = repo.find_by_id(&job_id)?;
    Ok(job.map(Into::into))
}

#[tauri::command]
pub fn cancel_background_job(
    state: State<'_, AppState>,
    job_id: String,
) -> CommandResult<BackgroundJobDto> {
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let next = cancel_background_job_record(&repo, &job_id)?;

    Ok(next.into())
}

fn cancel_background_job_record(
    repo: &Mvp0BackgroundJobRepository<'_>,
    job_id: &str,
) -> CommandResult<Mvp0BackgroundJob> {
    let current = repo.find_by_id(job_id)?.ok_or(CommandError::NotFound)?;

    let next = match current.status.as_str() {
        "queued" => repo.update_status(
            job_id,
            UpdateMvp0BackgroundJobStatusRequest {
                status: "cancelled".to_string(),
                result_json: current.result_json.clone(),
                error_message: current.error_message.clone(),
                error_details: current.error_details.clone(),
                progress_current: current.progress_current,
                progress_total: current.progress_total,
                progress_message: Some("Task cancelled".to_string()),
            },
        )?,
        "running" if current.job_type == AI_CARD_GENERATION_JOB_TYPE => {
            repo.request_cancel(job_id)?;
            let requested = repo.find_by_id(job_id)?.ok_or(CommandError::NotFound)?;
            repo.update_status(
                job_id,
                UpdateMvp0BackgroundJobStatusRequest {
                    status: "cancelled".to_string(),
                    result_json: requested.result_json.clone(),
                    error_message: requested.error_message.clone(),
                    error_details: requested.error_details.clone(),
                    progress_current: requested.progress_current,
                    progress_total: requested.progress_total,
                    progress_message: Some("Task cancelled".to_string()),
                },
            )?
        }
        "running" => {
            repo.request_cancel(job_id)?;
            repo.find_by_id(job_id)?.ok_or(CommandError::NotFound)?
        }
        _ => current,
    };

    Ok(next)
}

pub(crate) fn repair_stale_ai_card_generation_jobs(
    repo: &Mvp0BackgroundJobRepository<'_>,
) -> CommandResult<usize> {
    let now = Utc::now();
    let jobs = repo.list_jobs(Some(AI_CARD_GENERATION_JOB_TYPE), None, None, None)?;
    let mut repaired = 0usize;

    for job in jobs {
        if !matches!(job.status.as_str(), "queued" | "running") {
            continue;
        }

        let Some(next_status) = stale_repair_status(&job, now) else {
            continue;
        };

        repo.update_status(
            &job.id,
            UpdateMvp0BackgroundJobStatusRequest {
                status: next_status.to_string(),
                result_json: job.result_json.clone(),
                error_message: if next_status == "failed" {
                    Some("AI card generation job was interrupted or timed out".to_string())
                } else {
                    job.error_message.clone()
                },
                error_details: if next_status == "failed" {
                    Some("Stale ai_card_generation background job repaired by host".to_string())
                } else {
                    job.error_details.clone()
                },
                progress_current: job.progress_current,
                progress_total: job.progress_total,
                progress_message: Some(if next_status == "cancelled" {
                    "Task cancelled".to_string()
                } else {
                    "AI card generation timed out".to_string()
                }),
            },
        )?;
        repaired += 1;
    }

    Ok(repaired)
}

fn stale_repair_status(job: &Mvp0BackgroundJob, now: DateTime<Utc>) -> Option<&'static str> {
    if job.cancel_requested_at.is_some() {
        return Some("cancelled");
    }

    let started_time = parse_job_time(job.started_at.as_deref())
        .or_else(|| parse_job_time(Some(&job.created_at)))?;
    let progress_time = checkpoint_updated_at(job).unwrap_or(started_time);
    let age = now.signed_duration_since(started_time);
    let idle_age = now.signed_duration_since(progress_time);

    match job.status.as_str() {
        "queued" if age >= Duration::minutes(QUEUED_STALE_AFTER_MINUTES) => Some("failed"),
        "running"
            if job.progress_current.unwrap_or(0) <= 0
                && idle_age >= Duration::minutes(RUNNING_NO_PROGRESS_STALE_AFTER_MINUTES) =>
        {
            Some("failed")
        }
        "running" if age >= Duration::minutes(RUNNING_STALE_AFTER_MINUTES) => Some("failed"),
        _ => None,
    }
}

fn parse_job_time(value: Option<&str>) -> Option<DateTime<Utc>> {
    value
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc))
}

fn checkpoint_updated_at(job: &Mvp0BackgroundJob) -> Option<DateTime<Utc>> {
    let raw = job.checkpoint_json.as_deref()?;
    let value: serde_json::Value = serde_json::from_str(raw).ok()?;
    parse_job_time(value.get("updatedAt").and_then(|value| value.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{test_support::TestDatabase, CreateMvp0BackgroundJobRequest};

    fn create_ai_job(repo: &Mvp0BackgroundJobRepository<'_>) -> Mvp0BackgroundJob {
        repo.create_job(CreateMvp0BackgroundJobRequest {
            job_type: AI_CARD_GENERATION_JOB_TYPE.to_string(),
            target_type: "document".to_string(),
            target_id: "doc-1".to_string(),
            payload_json: "{}".to_string(),
            progress_total: Some(10),
        })
        .expect("create job")
    }

    #[test]
    fn running_ai_job_cancel_finishes_immediately() {
        let db = TestDatabase::new();
        let repo = Mvp0BackgroundJobRepository::new(db.connection());
        let job = create_ai_job(&repo);
        repo.update_status(
            &job.id,
            UpdateMvp0BackgroundJobStatusRequest {
                status: "running".to_string(),
                result_json: None,
                error_message: None,
                error_details: None,
                progress_current: Some(0),
                progress_total: Some(10),
                progress_message: Some("running".to_string()),
            },
        )
        .expect("mark running");

        let cancelled = cancel_background_job_record(&repo, &job.id).expect("cancel job");

        assert_eq!(cancelled.status, "cancelled");
        assert!(cancelled.finished_at.is_some());
        assert!(cancelled.cancel_requested_at.is_some());
    }

    #[test]
    fn running_non_ai_job_cancel_only_requests_cancel() {
        let db = TestDatabase::new();
        let repo = Mvp0BackgroundJobRepository::new(db.connection());
        let job = repo
            .create_job(CreateMvp0BackgroundJobRequest {
                job_type: "document_embedding".to_string(),
                target_type: "document".to_string(),
                target_id: "doc-1".to_string(),
                payload_json: "{}".to_string(),
                progress_total: Some(10),
            })
            .expect("create job");
        repo.update_status(
            &job.id,
            UpdateMvp0BackgroundJobStatusRequest {
                status: "running".to_string(),
                result_json: None,
                error_message: None,
                error_details: None,
                progress_current: Some(0),
                progress_total: Some(10),
                progress_message: Some("running".to_string()),
            },
        )
        .expect("mark running");

        let requested = cancel_background_job_record(&repo, &job.id).expect("cancel job");

        assert_eq!(requested.status, "running");
        assert!(requested.finished_at.is_none());
        assert!(requested.cancel_requested_at.is_some());
    }

    #[test]
    fn stale_ai_jobs_repair_to_failed_or_cancelled() {
        let db = TestDatabase::new();
        let repo = Mvp0BackgroundJobRepository::new(db.connection());
        let stale_running = create_ai_job(&repo);
        repo.update_status(
            &stale_running.id,
            UpdateMvp0BackgroundJobStatusRequest {
                status: "running".to_string(),
                result_json: None,
                error_message: None,
                error_details: None,
                progress_current: Some(0),
                progress_total: Some(10),
                progress_message: Some("running".to_string()),
            },
        )
        .expect("mark running");
        db.connection()
            .execute(
                "UPDATE background_jobs SET started_at = ?2 WHERE id = ?1",
                rusqlite::params![
                    &stale_running.id,
                    (Utc::now() - Duration::minutes(16)).to_rfc3339()
                ],
            )
            .expect("age running job");

        let cancelled_running = create_ai_job(&repo);
        repo.update_status(
            &cancelled_running.id,
            UpdateMvp0BackgroundJobStatusRequest {
                status: "running".to_string(),
                result_json: None,
                error_message: None,
                error_details: None,
                progress_current: Some(2),
                progress_total: Some(10),
                progress_message: Some("running".to_string()),
            },
        )
        .expect("mark cancelled running");
        repo.request_cancel(&cancelled_running.id)
            .expect("request cancel");

        let repaired = repair_stale_ai_card_generation_jobs(&repo).expect("repair jobs");

        assert_eq!(repaired, 2);
        assert_eq!(
            repo.find_by_id(&stale_running.id)
                .expect("find stale")
                .expect("stale exists")
                .status,
            "failed"
        );
        assert_eq!(
            repo.find_by_id(&cancelled_running.id)
                .expect("find cancelled")
                .expect("cancelled exists")
                .status,
            "cancelled"
        );
    }
}
