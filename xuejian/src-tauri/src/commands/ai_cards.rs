use std::collections::HashSet;
use std::time::{Duration, Instant};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::{
    commands::background_jobs::BackgroundJobDto,
    commands::{AppState, CommandError, CommandResult},
    db::{
        CreateMvp0BackgroundJobRequest, Mvp0BackgroundJobRepository, Mvp0CardRepository,
        Mvp0DocumentChunk, Mvp0DocumentRepository, SettingsRepository,
        UpdateMvp0BackgroundJobStatusRequest,
    },
};

const AI_CARD_GENERATION_JOB_TYPE: &str = "ai_card_generation";
const AI_CARD_GENERATION_WORKFLOW_PATH: &str = "/workflows/ai-card-generation";
const AI_CARD_CHUNK_TIMEOUT_SECONDS: u64 = 90;
const AI_CARD_JOB_TIMEOUT_SECONDS: u64 = 20 * 60;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAiCardGenerationDto {
    pub document_id: String,
    pub group_id: String,
    pub page_start: Option<i32>,
    pub page_end: Option<i32>,
    pub density: String,
    pub provider_config_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiCardGenerationResponse {
    status: String,
    #[serde(default)]
    cards: Vec<AiGeneratedCard>,
    #[serde(default)]
    discarded_count: usize,
    #[serde(default)]
    retry_count: usize,
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiGeneratedCard {
    title: String,
    front: String,
    back: String,
    source: AiGeneratedCardSource,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiGeneratedCardSource {
    chunk_id: Option<String>,
    page: i32,
    quote: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiCardGenerationCheckpoint {
    document_id: String,
    group_id: String,
    page_start: Option<i32>,
    page_end: Option<i32>,
    density: String,
    provider_config_id: String,
    next_chunk_index: usize,
    total_chunks: usize,
    #[serde(default)]
    selected_chunk_ids: Vec<String>,
    #[serde(default)]
    cards: Vec<AiGeneratedCard>,
    #[serde(default)]
    discarded_count: usize,
    #[serde(default)]
    skipped_chunk_count: usize,
    #[serde(default)]
    retry_count: usize,
    #[serde(default)]
    timeout_count: usize,
    phase: String,
    message: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiCardGenerationChunkRequest<'a> {
    id: &'a str,
    document_id: &'a str,
    page_start: i32,
    page_end: i32,
    chunk_index: i32,
    text: &'a str,
    content: &'a str,
}

#[derive(Debug)]
struct ChunkGenerationFailure {
    message: String,
    is_timeout: bool,
}

#[derive(Debug, Clone)]
struct ValidatedAiCard {
    title: String,
    front: String,
    back: String,
    source: AiGeneratedCardSource,
    tags: Vec<String>,
}

#[derive(Debug, Clone, Default)]
struct AiCardValidationStats {
    discarded: usize,
    empty_title: usize,
    empty_front: usize,
    empty_back: usize,
    invalid_page: usize,
    empty_quote: usize,
    invalid_chunk_id: usize,
}

impl AiCardValidationStats {
    fn merge(&mut self, other: &Self) {
        self.discarded += other.discarded;
        self.empty_title += other.empty_title;
        self.empty_front += other.empty_front;
        self.empty_back += other.empty_back;
        self.invalid_page += other.invalid_page;
        self.empty_quote += other.empty_quote;
        self.invalid_chunk_id += other.invalid_chunk_id;
    }

    fn summary(&self) -> String {
        let mut parts = Vec::new();
        if self.invalid_chunk_id > 0 {
            parts.push(format!("chunkId 无效或缺失 {}", self.invalid_chunk_id));
        }
        if self.empty_quote > 0 {
            parts.push(format!("引用为空 {}", self.empty_quote));
        }
        if self.invalid_page > 0 {
            parts.push(format!("页码无效 {}", self.invalid_page));
        }
        if self.empty_title > 0 {
            parts.push(format!("标题为空 {}", self.empty_title));
        }
        if self.empty_front > 0 {
            parts.push(format!("正面为空 {}", self.empty_front));
        }
        if self.empty_back > 0 {
            parts.push(format!("背面为空 {}", self.empty_back));
        }
        if parts.is_empty() {
            format!("被过滤 {}", self.discarded)
        } else {
            parts.join("；")
        }
    }
}

#[tauri::command]
pub fn start_ai_card_generation(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    data: StartAiCardGenerationDto,
) -> CommandResult<BackgroundJobDto> {
    validate_density(&data.density)?;

    let job = {
        let db = state.lock_db()?;
        let document_repo = Mvp0DocumentRepository::new(db.connection());
        let card_repo = Mvp0CardRepository::new(db.connection());
        let settings_repo = SettingsRepository::new(&db);

        let document = document_repo
            .find_document_by_id(&data.document_id)?
            .ok_or(CommandError::NotFound)?;
        if document.deleted_at.is_some() {
            return Err(CommandError::NotFound);
        }

        let chunks = filter_chunks(
            document_repo.list_chunks(&document.id)?,
            data.page_start,
            data.page_end,
        );
        if chunks.is_empty() {
            return Err(CommandError::InvalidInput(
                "The selected page range has no parsed text".to_string(),
            ));
        }
        if !can_generate_ai_cards_from_status(&document.parse_status) {
            if can_repair_ai_generation_status(&document.parse_status) {
                document_repo.update_parse_status(&document.id, "parsed")?;
            } else {
                return Err(CommandError::InvalidInput(
                    "Document must be parsed before AI card generation".to_string(),
                ));
            }
        }

        let group = card_repo
            .find_group_by_id(&data.group_id)?
            .ok_or(CommandError::NotFound)?;
        if group.deleted_at.is_some() {
            return Err(CommandError::InvalidInput(
                "Cannot generate cards into a deleted group".to_string(),
            ));
        }

        let provider_config = settings_repo
            .get_api_config(&data.provider_config_id)?
            .ok_or_else(|| CommandError::InvalidInput("Provider config not found".to_string()))?;
        if !provider_config.is_enabled {
            return Err(CommandError::InvalidInput(
                "Provider config is disabled".to_string(),
            ));
        }

        let payload_json = serde_json::to_string(&data)
            .map_err(|error| CommandError::Internal(error.to_string()))?;
        let page_count =
            effective_generation_page_count(document.page_count, data.page_start, data.page_end);
        let chunk_limit = dynamic_chunk_limit(&data.density, page_count);
        let selected_chunks =
            rank_generation_chunks(chunks, data.page_start, data.page_end, chunk_limit);
        if selected_chunks.is_empty() {
            return Err(CommandError::InvalidInput(
                "The selected page range has no high-value text for AI cards".to_string(),
            ));
        }
        let repo = Mvp0BackgroundJobRepository::new(db.connection());
        let job = repo.create_job(CreateMvp0BackgroundJobRequest {
            job_type: AI_CARD_GENERATION_JOB_TYPE.to_string(),
            target_type: "document".to_string(),
            target_id: document.id.clone(),
            payload_json,
            progress_total: Some(selected_chunks.len() as i32),
        })?;
        let checkpoint = initial_checkpoint(
            &data,
            selected_chunks.len(),
            selected_chunks
                .iter()
                .map(|chunk| chunk.id.clone())
                .collect(),
        );
        let checkpoint_json = serde_json::to_string(&checkpoint)
            .map_err(|error| CommandError::Internal(error.to_string()))?;
        repo.update_checkpoint(&job.id, Some(&checkpoint_json))?
    };

    spawn_ai_card_generation_worker(app_handle, job.id.clone());
    Ok(job.into())
}

#[tauri::command]
pub fn resume_ai_card_generation(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    job_id: String,
) -> CommandResult<BackgroundJobDto> {
    let job = {
        let db = state.lock_db()?;
        let repo = Mvp0BackgroundJobRepository::new(db.connection());
        let job = repo.find_by_id(&job_id)?.ok_or(CommandError::NotFound)?;
        if job.job_type != AI_CARD_GENERATION_JOB_TYPE {
            return Err(CommandError::InvalidInput(
                "Background job is not an AI card generation job".to_string(),
            ));
        }
        if job.status != "failed" {
            return Err(CommandError::InvalidInput(
                "Only failed AI card generation jobs can be resumed".to_string(),
            ));
        }
        if job.checkpoint_json.is_none() {
            return Err(CommandError::InvalidInput(
                "AI card generation job has no checkpoint to resume".to_string(),
            ));
        }
        repo.reset_failed_for_resume(&job_id)?
    };

    spawn_ai_card_generation_worker(app_handle, job.id.clone());
    Ok(job.into())
}

fn spawn_ai_card_generation_worker(app_handle: AppHandle, job_id: String) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_ai_card_generation_job(&app_handle, &job_id).await {
            log::error!("AI card generation job {job_id} failed: {error}");
            let _ = mark_job_failed(&app_handle, &job_id, &error.to_string(), None);
        }
    });
}

async fn execute_ai_card_generation_job(app_handle: &AppHandle, job_id: &str) -> CommandResult<()> {
    let payload = mark_job_running_and_load_payload(app_handle, job_id)?;
    let curated_mode = true;
    if curated_mode {
        return execute_ai_card_generation_job_curated(app_handle, job_id, payload.clone()).await;
    }

    let response = call_ai_card_generation_workflow(app_handle, job_id, &payload).await?;
    if response.status == "cancelled" {
        mark_job_cancelled(app_handle, job_id)?;
        return Ok(());
    }
    if response.status != "ok" {
        return Err(CommandError::Internal(
            response
                .error
                .unwrap_or_else(|| "AI card generation failed".to_string()),
        ));
    }
    if job_is_cancel_requested_or_cancelled(app_handle, job_id)? {
        mark_job_cancelled(app_handle, job_id)?;
        return Ok(());
    }

    let (created_count, discarded_count) = {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let document_repo = Mvp0DocumentRepository::new(db.connection());
        let chunks = filter_chunks(
            document_repo.list_chunks(&payload.document_id)?,
            payload.page_start,
            payload.page_end,
        );
        let valid_chunk_ids = chunks
            .iter()
            .map(|chunk| chunk.id.clone())
            .collect::<HashSet<_>>();

        let (valid_cards, validation_stats) = validate_ai_cards(response.cards, &valid_chunk_ids);
        if valid_cards.is_empty() {
            return Err(CommandError::InvalidInput(
                "所有卡片均未通过来源校验".to_string(),
            ));
        }

        let created_count = commit_ai_cards(
            db.connection(),
            job_id,
            &payload.group_id,
            &payload.document_id,
            &valid_cards,
        )?;
        (
            created_count,
            response.discarded_count + validation_stats.discarded,
        )
    };

    mark_job_succeeded(app_handle, job_id, created_count, discarded_count)?;
    Ok(())
}

fn job_is_cancel_requested_or_cancelled(
    app_handle: &AppHandle,
    job_id: &str,
) -> CommandResult<bool> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let job = repo.find_by_id(job_id)?.ok_or(CommandError::NotFound)?;
    Ok(job.status == "cancelled" || job.cancel_requested_at.is_some())
}

async fn execute_ai_card_generation_job_curated(
    app_handle: &AppHandle,
    job_id: &str,
    payload: StartAiCardGenerationDto,
) -> CommandResult<()> {
    let started_at = Instant::now();
    let (selected_chunks, valid_chunk_ids, card_limit) = {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let document_repo = Mvp0DocumentRepository::new(db.connection());
        let document = document_repo
            .find_document_by_id(&payload.document_id)?
            .ok_or(CommandError::NotFound)?;
        let page_count = effective_generation_page_count(
            document.page_count,
            payload.page_start,
            payload.page_end,
        );
        let chunk_limit = dynamic_chunk_limit(&payload.density, page_count);
        let card_limit = dynamic_card_limit(&payload.density, page_count);
        let chunks = rank_generation_chunks(
            document_repo.list_chunks(&payload.document_id)?,
            payload.page_start,
            payload.page_end,
            chunk_limit,
        );
        if chunks.is_empty() {
            return Err(CommandError::InvalidInput(
                "The selected page range has no high-value text for AI cards".to_string(),
            ));
        }
        let valid_chunk_ids = chunks
            .iter()
            .map(|chunk| chunk.id.clone())
            .collect::<HashSet<_>>();
        (chunks, valid_chunk_ids, card_limit)
    };

    let mut checkpoint = load_checkpoint(app_handle, job_id)?.unwrap_or_else(|| {
        initial_checkpoint(
            &payload,
            selected_chunks.len(),
            selected_chunks
                .iter()
                .map(|chunk| chunk.id.clone())
                .collect(),
        )
    });
    checkpoint.total_chunks = selected_chunks.len();
    checkpoint.selected_chunk_ids = selected_chunks
        .iter()
        .map(|chunk| chunk.id.clone())
        .collect();
    checkpoint.phase = "generating".to_string();
    checkpoint.message = "AI card generation running in curated mode".to_string();
    checkpoint.updated_at = chrono::Utc::now().to_rfc3339();
    persist_checkpoint(app_handle, job_id, &checkpoint)?;
    update_job_progress(
        app_handle,
        job_id,
        checkpoint.next_chunk_index as i32,
        Some(selected_chunks.len() as i32),
        &checkpoint.message,
    )?;

    while checkpoint.next_chunk_index < selected_chunks.len() && checkpoint.cards.len() < card_limit
    {
        if job_is_cancel_requested_or_cancelled(app_handle, job_id)? {
            mark_job_cancelled(app_handle, job_id)?;
            return Ok(());
        }
        if started_at.elapsed() >= Duration::from_secs(AI_CARD_JOB_TIMEOUT_SECONDS) {
            return Err(CommandError::Internal(
                "AI card generation timed out after 20 minutes".to_string(),
            ));
        }

        let chunk = &selected_chunks[checkpoint.next_chunk_index];
        match call_ai_card_generation_chunk_workflow(app_handle, job_id, &payload, chunk).await {
            Ok(response) if response.status == "cancelled" => {
                mark_job_cancelled(app_handle, job_id)?;
                return Ok(());
            }
            Ok(response) if response.status == "ok" => {
                let (mut valid_cards, validation_stats) =
                    validate_ai_cards(response.cards, &valid_chunk_ids);
                let remaining = card_limit.saturating_sub(checkpoint.cards.len());
                if valid_cards.len() > remaining {
                    checkpoint.discarded_count += valid_cards.len() - remaining;
                    valid_cards.truncate(remaining);
                }
                checkpoint
                    .cards
                    .extend(valid_cards.into_iter().map(|card| AiGeneratedCard {
                        title: card.title,
                        front: card.front,
                        back: card.back,
                        source: card.source,
                        tags: card.tags,
                    }));
                checkpoint.discarded_count += response.discarded_count + validation_stats.discarded;
                checkpoint.retry_count += response.retry_count;
            }
            Ok(response) => {
                checkpoint.skipped_chunk_count += 1;
                checkpoint.discarded_count += response.discarded_count;
                log::warn!(
                    "AI card generation skipped chunk {} for job {}: {}",
                    chunk.id,
                    job_id,
                    response
                        .error
                        .unwrap_or_else(|| "model returned failed status".to_string())
                );
            }
            Err(error) => {
                checkpoint.skipped_chunk_count += 1;
                if error.is_timeout {
                    checkpoint.timeout_count += 1;
                }
                log::warn!(
                    "AI card generation skipped chunk {} for job {}: {}",
                    chunk.id,
                    job_id,
                    error.message
                );
            }
        }

        checkpoint.next_chunk_index += 1;
        checkpoint.phase = "generating".to_string();
        checkpoint.message = format!(
            "Generated {} card candidates from {}/{} selected chunks",
            checkpoint.cards.len(),
            checkpoint.next_chunk_index,
            selected_chunks.len()
        );
        checkpoint.updated_at = chrono::Utc::now().to_rfc3339();
        persist_checkpoint(app_handle, job_id, &checkpoint)?;
        update_job_progress(
            app_handle,
            job_id,
            checkpoint.next_chunk_index as i32,
            Some(selected_chunks.len() as i32),
            &checkpoint.message,
        )?;
    }

    if checkpoint.cards.is_empty() {
        return Err(no_valid_ai_cards_error(&checkpoint, None));
    }

    let created_count = {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let (valid_cards, validation_stats) =
            validate_ai_cards(checkpoint.cards.clone(), &valid_chunk_ids);
        checkpoint.discarded_count += validation_stats.discarded;
        if valid_cards.is_empty() {
            return Err(no_valid_ai_cards_error(
                &checkpoint,
                Some(&validation_stats),
            ));
        }
        commit_ai_cards(
            db.connection(),
            job_id,
            &payload.group_id,
            &payload.document_id,
            &valid_cards,
        )?
    };

    checkpoint.phase = "completed".to_string();
    checkpoint.message = format!("AI cards created: {created_count}");
    checkpoint.updated_at = chrono::Utc::now().to_rfc3339();
    persist_checkpoint(app_handle, job_id, &checkpoint)?;
    mark_job_succeeded_curated(app_handle, job_id, created_count, &checkpoint)?;
    Ok(())
}

fn mark_job_running_and_load_payload(
    app_handle: &AppHandle,
    job_id: &str,
) -> CommandResult<StartAiCardGenerationDto> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let job = repo.find_by_id(job_id)?.ok_or(CommandError::NotFound)?;
    if job.status == "cancelled" || job.cancel_requested_at.is_some() {
        return Err(CommandError::InvalidInput("Job was cancelled".to_string()));
    }
    if job.job_type != AI_CARD_GENERATION_JOB_TYPE {
        return Err(CommandError::InvalidInput(
            "Background job is not an AI card generation job".to_string(),
        ));
    }
    repo.update_status(
        job_id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "running".to_string(),
            result_json: None,
            error_message: None,
            error_details: None,
            progress_current: Some(current_checkpoint_index(&job)),
            progress_total: job.progress_total,
            progress_message: Some("AI card generation running".to_string()),
        },
    )?;
    serde_json::from_str(&job.payload_json)
        .map_err(|error| CommandError::Internal(error.to_string()))
}

async fn call_ai_card_generation_workflow(
    app_handle: &AppHandle,
    job_id: &str,
    payload: &StartAiCardGenerationDto,
) -> CommandResult<AiCardGenerationResponse> {
    let state = app_handle.state::<AppState>();
    let health = state
        .orchestration
        .health()
        .await
        .map_err(|error| CommandError::Internal(error.to_string()))?;
    let endpoint = health.endpoint.ok_or(CommandError::Internal(
        "Orchestration service not available".to_string(),
    ))?;
    if health.status != "healthy" && health.status != "degraded" {
        return Err(CommandError::Internal(format!(
            "Orchestration service status: {}",
            health.status
        )));
    }

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|error| CommandError::Internal(error.to_string()))?;

    let response = client
        .post(format!("{endpoint}{AI_CARD_GENERATION_WORKFLOW_PATH}"))
        .json(&json!({
            "jobId": job_id,
            "documentId": payload.document_id,
            "groupId": payload.group_id,
            "pageStart": payload.page_start,
            "pageEnd": payload.page_end,
            "density": payload.density,
            "providerConfigId": payload.provider_config_id,
            "checkpoint": load_checkpoint_for_request(app_handle, job_id)?,
        }))
        .send()
        .await
        .map_err(|error| {
            CommandError::Internal(format!("Orchestration request failed: {error}"))
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Internal(format!(
            "Orchestration returned {status}: {body}"
        )));
    }

    response
        .json::<AiCardGenerationResponse>()
        .await
        .map_err(|error| CommandError::Internal(error.to_string()))
}

async fn call_ai_card_generation_chunk_workflow(
    app_handle: &AppHandle,
    job_id: &str,
    payload: &StartAiCardGenerationDto,
    chunk: &Mvp0DocumentChunk,
) -> Result<AiCardGenerationResponse, ChunkGenerationFailure> {
    let state = app_handle.state::<AppState>();
    let health = state
        .orchestration
        .health()
        .await
        .map_err(|error| ChunkGenerationFailure {
            message: format!("Orchestration health check failed: {error}"),
            is_timeout: false,
        })?;
    let endpoint = health.endpoint.ok_or_else(|| ChunkGenerationFailure {
        message: "Orchestration service not available".to_string(),
        is_timeout: false,
    })?;
    if health.status != "healthy" && health.status != "degraded" {
        return Err(ChunkGenerationFailure {
            message: format!("Orchestration service status: {}", health.status),
            is_timeout: false,
        });
    }

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(AI_CARD_CHUNK_TIMEOUT_SECONDS))
        .build()
        .map_err(|error| ChunkGenerationFailure {
            message: error.to_string(),
            is_timeout: false,
        })?;

    let chunk_payload = AiCardGenerationChunkRequest {
        id: &chunk.id,
        document_id: &chunk.document_id,
        page_start: chunk.page_start,
        page_end: chunk.page_end,
        chunk_index: chunk.chunk_index,
        text: &chunk.text,
        content: &chunk.text,
    };

    let response = client
        .post(format!("{endpoint}{AI_CARD_GENERATION_WORKFLOW_PATH}"))
        .json(&json!({
            "jobId": job_id,
            "documentId": payload.document_id,
            "groupId": payload.group_id,
            "pageStart": payload.page_start,
            "pageEnd": payload.page_end,
            "density": payload.density,
            "providerConfigId": payload.provider_config_id,
            "chunk": chunk_payload,
        }))
        .send()
        .await
        .map_err(|error| ChunkGenerationFailure {
            is_timeout: error.is_timeout(),
            message: format!("Orchestration request failed: {error}"),
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(ChunkGenerationFailure {
            message: format!("Orchestration returned {status}: {body}"),
            is_timeout: false,
        });
    }

    response
        .json::<AiCardGenerationResponse>()
        .await
        .map_err(|error| ChunkGenerationFailure {
            message: format!("Invalid orchestration response: {error}"),
            is_timeout: false,
        })
}

fn initial_checkpoint(
    payload: &StartAiCardGenerationDto,
    total_chunks: usize,
    selected_chunk_ids: Vec<String>,
) -> AiCardGenerationCheckpoint {
    AiCardGenerationCheckpoint {
        document_id: payload.document_id.clone(),
        group_id: payload.group_id.clone(),
        page_start: payload.page_start,
        page_end: payload.page_end,
        density: payload.density.clone(),
        provider_config_id: payload.provider_config_id.clone(),
        next_chunk_index: 0,
        total_chunks,
        selected_chunk_ids,
        cards: Vec::new(),
        discarded_count: 0,
        skipped_chunk_count: 0,
        retry_count: 0,
        timeout_count: 0,
        phase: "queued".to_string(),
        message: "AI card generation queued".to_string(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    }
}

fn current_checkpoint_index(job: &crate::db::Mvp0BackgroundJob) -> i32 {
    job.checkpoint_json
        .as_deref()
        .and_then(|raw| serde_json::from_str::<AiCardGenerationCheckpoint>(raw).ok())
        .map(|checkpoint| checkpoint.next_chunk_index as i32)
        .unwrap_or(0)
}

fn load_checkpoint_for_request(
    app_handle: &AppHandle,
    job_id: &str,
) -> CommandResult<Option<serde_json::Value>> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let job = repo.find_by_id(job_id)?.ok_or(CommandError::NotFound)?;
    job.checkpoint_json
        .as_deref()
        .map(|raw| {
            serde_json::from_str(raw).map_err(|error| CommandError::Internal(error.to_string()))
        })
        .transpose()
}

fn load_checkpoint(
    app_handle: &AppHandle,
    job_id: &str,
) -> CommandResult<Option<AiCardGenerationCheckpoint>> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let job = repo.find_by_id(job_id)?.ok_or(CommandError::NotFound)?;
    job.checkpoint_json
        .as_deref()
        .map(|raw| {
            serde_json::from_str(raw).map_err(|error| CommandError::Internal(error.to_string()))
        })
        .transpose()
}

fn persist_checkpoint(
    app_handle: &AppHandle,
    job_id: &str,
    checkpoint: &AiCardGenerationCheckpoint,
) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let checkpoint_json = serde_json::to_string(checkpoint)
        .map_err(|error| CommandError::Internal(error.to_string()))?;
    repo.update_checkpoint(job_id, Some(&checkpoint_json))?;
    Ok(())
}

fn update_job_progress(
    app_handle: &AppHandle,
    job_id: &str,
    current: i32,
    total: Option<i32>,
    message: &str,
) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let job = repo.find_by_id(job_id)?.ok_or(CommandError::NotFound)?;
    if job.status != "running" {
        return Ok(());
    }
    repo.update_status(
        job_id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "running".to_string(),
            result_json: job.result_json,
            error_message: job.error_message,
            error_details: job.error_details,
            progress_current: Some(current),
            progress_total: total,
            progress_message: Some(message.to_string()),
        },
    )?;
    Ok(())
}

fn validate_ai_cards(
    cards: Vec<AiGeneratedCard>,
    valid_chunk_ids: &HashSet<String>,
) -> (Vec<ValidatedAiCard>, AiCardValidationStats) {
    let mut valid_cards = Vec::new();
    let mut stats = AiCardValidationStats::default();
    let single_chunk_id = if valid_chunk_ids.len() == 1 {
        valid_chunk_ids.iter().next().cloned()
    } else {
        None
    };

    for card in cards {
        let title = card.title.trim().to_string();
        let front = card.front.trim().to_string();
        let back = card.back.trim().to_string();
        let quote = card.source.quote.trim().to_string();
        let chunk_id = card
            .source
            .chunk_id
            .clone()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| single_chunk_id.clone())
            .unwrap_or_default();
        let mut invalid = false;
        if title.is_empty() {
            stats.empty_title += 1;
            invalid = true;
        }
        if front.is_empty() {
            stats.empty_front += 1;
            invalid = true;
        }
        if back.is_empty() {
            stats.empty_back += 1;
            invalid = true;
        }
        if card.source.page <= 0 {
            stats.invalid_page += 1;
            invalid = true;
        }
        if quote.is_empty() {
            stats.empty_quote += 1;
            invalid = true;
        }
        if !valid_chunk_ids.contains(&chunk_id) {
            stats.invalid_chunk_id += 1;
            invalid = true;
        }
        if invalid {
            stats.discarded += 1;
            continue;
        }

        let tags = card
            .tags
            .into_iter()
            .map(|tag| tag.trim().to_string())
            .filter(|tag| !tag.is_empty())
            .take(8)
            .collect();

        valid_cards.push(ValidatedAiCard {
            title,
            front,
            back,
            source: AiGeneratedCardSource {
                chunk_id: Some(chunk_id),
                page: card.source.page,
                quote,
            },
            tags,
        });
    }

    (valid_cards, stats)
}

fn no_valid_ai_cards_error(
    checkpoint: &AiCardGenerationCheckpoint,
    validation_stats: Option<&AiCardValidationStats>,
) -> CommandError {
    let mut stats = AiCardValidationStats {
        discarded: checkpoint.discarded_count,
        ..Default::default()
    };
    if let Some(validation_stats) = validation_stats {
        stats.merge(validation_stats);
    }
    CommandError::InvalidInput(format!(
        "没有生成可保存的 AI 卡片。已选 {} 个文本块，跳过 {} 个，超时 {} 次，重试 {} 次；过滤原因：{}。请重试或降低页码范围后再生成。",
        checkpoint.selected_chunk_ids.len(),
        checkpoint.skipped_chunk_count,
        checkpoint.timeout_count,
        checkpoint.retry_count,
        stats.summary()
    ))
}

fn commit_ai_cards(
    conn: &Connection,
    _job_id: &str,
    group_id: &str,
    document_id: &str,
    cards: &[ValidatedAiCard],
) -> crate::db::Result<usize> {
    let tx = conn.unchecked_transaction()?;
    let now = chrono::Utc::now().to_rfc3339();

    for card in cards {
        let anchor_id = Uuid::new_v4().to_string();
        let card_id = Uuid::new_v4().to_string();
        let review_state_id = Uuid::new_v4().to_string();
        let tags_json = serde_json::to_string(&card.tags)?;

        tx.execute(
            "INSERT INTO source_anchors (
                id, document_id, chunk_id, page, quote, bbox_json, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6)",
            params![
                &anchor_id,
                document_id,
                &card.source.chunk_id,
                card.source.page,
                &card.source.quote,
                &now,
            ],
        )?;

        tx.execute(
            "INSERT INTO cards (
                id, group_id, document_id, anchor_id, front, back, source_page, source_paragraph,
                source_coordinates, tags, difficulty, stability, retrievability, state, next_review,
                created_at, updated_at, title, card_type, cluster_id, export_guid,
                source_document_id, source_anchor_id, tags_json, origin, deleted_at
             ) VALUES (
                ?1, ?2, ?3, NULL, ?4, ?5, ?6, NULL,
                NULL, ?7, 0.3, 1.0, NULL, 'new', ?8,
                ?8, ?8, ?9, 'qa', NULL, NULL,
                ?3, ?10, ?7, 'ai', NULL
             )",
            params![
                &card_id,
                group_id,
                document_id,
                &card.front,
                &card.back,
                card.source.page,
                &tags_json,
                &now,
                &card.title,
                &anchor_id,
            ],
        )?;

        tx.execute(
            "INSERT INTO review_states (
                id, card_id, state, due_at, last_reviewed_at, review_count, lapse_count,
                stability, difficulty, created_at, updated_at
             ) VALUES (?1, ?2, 'new', ?3, NULL, 0, 0, 1.0, 0.3, ?3, ?3)",
            params![&review_state_id, &card_id, &now],
        )?;
    }

    tx.commit()?;
    Ok(cards.len())
}

fn mark_job_succeeded_curated(
    app_handle: &AppHandle,
    job_id: &str,
    created_count: usize,
    checkpoint: &AiCardGenerationCheckpoint,
) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    repo.update_status(
        job_id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "succeeded".to_string(),
            result_json: Some(
                json!({
                    "createdCount": created_count,
                    "discardedCount": checkpoint.discarded_count,
                    "selectedChunkCount": checkpoint.selected_chunk_ids.len(),
                    "skippedChunkCount": checkpoint.skipped_chunk_count,
                    "retryCount": checkpoint.retry_count,
                    "timeoutCount": checkpoint.timeout_count,
                    "qualityMode": "curated",
                })
                .to_string(),
            ),
            error_message: None,
            error_details: None,
            progress_current: Some(checkpoint.next_chunk_index as i32),
            progress_total: Some(checkpoint.total_chunks as i32),
            progress_message: Some("AI cards created".to_string()),
        },
    )?;
    Ok(())
}

fn mark_job_succeeded(
    app_handle: &AppHandle,
    job_id: &str,
    created_count: usize,
    discarded_count: usize,
) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    repo.update_status(
        job_id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "succeeded".to_string(),
            result_json: Some(
                json!({
                    "createdCount": created_count,
                    "discardedCount": discarded_count,
                })
                .to_string(),
            ),
            error_message: None,
            error_details: None,
            progress_current: Some(created_count as i32),
            progress_total: None,
            progress_message: Some("AI cards created".to_string()),
        },
    )?;
    Ok(())
}

fn mark_job_failed(
    app_handle: &AppHandle,
    job_id: &str,
    message: &str,
    details: Option<String>,
) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let Some(job) = repo.find_by_id(job_id)? else {
        return Ok(());
    };
    if matches!(job.status.as_str(), "failed" | "succeeded" | "cancelled") {
        return Ok(());
    }
    repo.update_status(
        job_id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "failed".to_string(),
            result_json: None,
            error_message: Some(message.to_string()),
            error_details: details.or_else(|| Some(message.to_string())),
            progress_current: job.progress_current,
            progress_total: job.progress_total,
            progress_message: Some("AI card generation failed".to_string()),
        },
    )?;
    Ok(())
}

fn mark_job_cancelled(app_handle: &AppHandle, job_id: &str) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let job = repo.find_by_id(job_id)?.ok_or(CommandError::NotFound)?;
    if job.status == "cancelled" {
        return Ok(());
    }
    repo.update_status(
        job_id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "cancelled".to_string(),
            result_json: None,
            error_message: None,
            error_details: None,
            progress_current: job.progress_current,
            progress_total: job.progress_total,
            progress_message: Some("AI card generation cancelled".to_string()),
        },
    )?;
    Ok(())
}

fn validate_density(density: &str) -> CommandResult<()> {
    match density {
        "low" | "medium" | "high" => Ok(()),
        _ => Err(CommandError::InvalidInput(
            "density must be one of low, medium or high".to_string(),
        )),
    }
}

fn can_generate_ai_cards_from_status(parse_status: &str) -> bool {
    matches!(
        parse_status,
        "parsed" | "ready" | "embedding_stale" | "embedding_failed" | "embedding"
    )
}

fn can_repair_ai_generation_status(parse_status: &str) -> bool {
    matches!(parse_status, "pending" | "parsing" | "failed")
}

fn effective_generation_page_count(
    document_page_count: Option<i32>,
    page_start: Option<i32>,
    page_end: Option<i32>,
) -> usize {
    if let (Some(start), Some(end)) = (page_start, page_end) {
        if start > 0 && end >= start {
            return (end - start + 1) as usize;
        }
    }

    document_page_count
        .filter(|count| *count > 0)
        .map(|count| count as usize)
        .unwrap_or(1)
}

fn dynamic_card_limit(density: &str, page_count: usize) -> usize {
    let pages = page_count.max(1);
    match density {
        "low" => pages.div_ceil(2).max(6).min(40),
        "high" => pages.saturating_mul(3).div_ceil(2).max(20).min(120),
        _ => pages.max(12).min(80),
    }
}

fn dynamic_chunk_limit(density: &str, page_count: usize) -> usize {
    let pages = page_count.max(1);
    match density {
        "low" => pages.saturating_mul(3).div_ceil(2).max(10).min(80),
        "high" => pages.saturating_mul(3).max(28).min(200),
        _ => pages.saturating_mul(9).div_ceil(4).max(18).min(140),
    }
}

fn rank_generation_chunks(
    chunks: Vec<Mvp0DocumentChunk>,
    page_start: Option<i32>,
    page_end: Option<i32>,
    chunk_limit: usize,
) -> Vec<Mvp0DocumentChunk> {
    let mut seen = HashSet::new();
    let mut scored = filter_chunks(chunks, page_start, page_end)
        .into_iter()
        .filter_map(|chunk| {
            let normalized = normalize_chunk_text(&chunk.text);
            if normalized.len() < 80 || is_low_value_chunk(&normalized) {
                return None;
            }
            let fingerprint: String = normalized.chars().take(240).collect();
            if !seen.insert(fingerprint) {
                return None;
            }
            let score = chunk_quality_score(&normalized);
            (score > 0).then_some((score, chunk))
        })
        .collect::<Vec<_>>();
    scored.sort_by(|(left_score, left_chunk), (right_score, right_chunk)| {
        right_score
            .cmp(left_score)
            .then_with(|| left_chunk.chunk_index.cmp(&right_chunk.chunk_index))
    });
    scored
        .into_iter()
        .take(chunk_limit)
        .map(|(_, chunk)| chunk)
        .collect()
}

fn normalize_chunk_text(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn is_low_value_chunk(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.len() < 80 {
        return true;
    }
    let low_value_markers = [
        "references",
        "bibliography",
        "acknowledgement",
        "copyright",
        "all rights reserved",
        "table of contents",
        "目录",
        "参考文献",
        "致谢",
        "版权所有",
    ];
    low_value_markers
        .iter()
        .any(|marker| trimmed.contains(marker))
}

fn chunk_quality_score(text: &str) -> i32 {
    let mut score = 0;
    for marker in [
        "定义",
        "概念",
        "原因",
        "因此",
        "所以",
        "步骤",
        "方法",
        "比较",
        "区别",
        "结论",
        "公式",
        "principle",
        "definition",
        "therefore",
        "because",
        "method",
        "compare",
        "result",
        "conclusion",
    ] {
        if text.contains(marker) {
            score += 3;
        }
    }
    if text.contains('：') || text.contains(':') {
        score += 1;
    }
    if text.contains('。') || text.contains('.') {
        score += 1;
    }
    if (160..=1600).contains(&text.len()) {
        score += 2;
    }
    score
}

fn filter_chunks(
    chunks: Vec<Mvp0DocumentChunk>,
    page_start: Option<i32>,
    page_end: Option<i32>,
) -> Vec<Mvp0DocumentChunk> {
    chunks
        .into_iter()
        .filter(|chunk| {
            if chunk.text.trim().is_empty() {
                return false;
            }
            if let Some(page_start) = page_start {
                if chunk.page_end < page_start {
                    return false;
                }
            }
            if let Some(page_end) = page_end {
                if chunk.page_start > page_end {
                    return false;
                }
            }
            true
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::TestDatabase;
    use crate::db::{CreateMvp0CardGroupRequest, CreateMvp0DocumentRequest};

    fn ranking_test_chunk(index: i32) -> Mvp0DocumentChunk {
        let text = format!(
            "Definition {index}: this method explains a learning principle because it compares evidence, result, and conclusion. The paragraph contains enough distinct explanatory content for a high quality card candidate and keeps a unique fingerprint for ranking."
        );
        Mvp0DocumentChunk {
            id: format!("chunk-{index}"),
            document_id: "doc".to_string(),
            page_start: index,
            page_end: index,
            chunk_index: index,
            char_count: text.len() as i32,
            text,
            parser: "test".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    #[test]
    fn commit_ai_cards_writes_anchor_card_and_review_state_transactionally() {
        let test_db = TestDatabase::new();
        let document_repo = Mvp0DocumentRepository::new(test_db.connection());
        let card_repo = Mvp0CardRepository::new(test_db.connection());
        let document = document_repo
            .create_document(CreateMvp0DocumentRequest {
                title: "Doc".to_string(),
                original_filename: "doc.pdf".to_string(),
                file_path: "E:/doc.pdf".to_string(),
                file_hash: "hash-ai-card".to_string(),
                file_size: 10,
                page_count: Some(1),
                parse_status: Some("parsed".to_string()),
            })
            .expect("document");
        let chunk_id = Uuid::new_v4().to_string();
        test_db
            .connection()
            .execute(
                "INSERT INTO document_chunks (
                    id, document_id, page_start, page_end, chunk_index, content, token_count,
                    metadata, created_at, text, char_count, parser
                 ) VALUES (?1, ?2, 1, 1, 0, ?3, 8, NULL, ?4, ?3, 8, 'pymupdf::child')",
                params![
                    &chunk_id,
                    &document.id,
                    "系统思维强调反馈回路。",
                    chrono::Utc::now().to_rfc3339(),
                ],
            )
            .expect("chunk");
        let group = card_repo
            .create_group(CreateMvp0CardGroupRequest {
                name: "Deck".to_string(),
                description: None,
                color: None,
                is_enabled: Some(true),
            })
            .expect("group");

        let cards = vec![ValidatedAiCard {
            title: "系统思维".to_string(),
            front: "系统思维强调什么？".to_string(),
            back: "系统思维强调反馈回路。".to_string(),
            source: AiGeneratedCardSource {
                chunk_id: Some(chunk_id),
                page: 1,
                quote: "系统思维强调反馈回路".to_string(),
            },
            tags: vec!["系统思维".to_string()],
        }];

        let created = commit_ai_cards(
            test_db.connection(),
            "job-1",
            &group.id,
            &document.id,
            &cards,
        )
        .expect("commit");
        assert_eq!(created, 1);

        let card_count: i64 = test_db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM cards WHERE origin = 'ai'",
                [],
                |row| row.get(0),
            )
            .expect("card count");
        let anchor_count: i64 = test_db
            .connection()
            .query_row("SELECT COUNT(*) FROM source_anchors", [], |row| row.get(0))
            .expect("anchor count");
        let review_count: i64 = test_db
            .connection()
            .query_row("SELECT COUNT(*) FROM review_states", [], |row| row.get(0))
            .expect("review count");

        assert_eq!(card_count, 1);
        assert_eq!(anchor_count, 1);
        assert_eq!(review_count, 1);
    }

    #[test]
    fn rust_validation_discards_missing_chunk_source() {
        let cards = vec![AiGeneratedCard {
            title: "Title".to_string(),
            front: "Front".to_string(),
            back: "Back".to_string(),
            source: AiGeneratedCardSource {
                chunk_id: Some("missing".to_string()),
                page: 1,
                quote: "Quote".to_string(),
            },
            tags: vec![],
        }];
        let valid_chunk_ids = HashSet::from(["chunk-1".to_string()]);
        let (valid, stats) = validate_ai_cards(cards, &valid_chunk_ids);
        assert!(valid.is_empty());
        assert_eq!(stats.discarded, 1);
        assert_eq!(stats.invalid_chunk_id, 1);
    }

    #[test]
    fn rust_validation_infers_missing_chunk_id_for_single_chunk_scope() {
        let cards = vec![AiGeneratedCard {
            title: "Title".to_string(),
            front: "Front".to_string(),
            back: "Back".to_string(),
            source: AiGeneratedCardSource {
                chunk_id: None,
                page: 1,
                quote: "Quote".to_string(),
            },
            tags: vec![],
        }];
        let valid_chunk_ids = HashSet::from(["chunk-1".to_string()]);

        let (valid, stats) = validate_ai_cards(cards, &valid_chunk_ids);

        assert_eq!(valid.len(), 1);
        assert_eq!(valid[0].source.chunk_id.as_deref(), Some("chunk-1"));
        assert_eq!(stats.discarded, 0);
    }

    #[test]
    fn dynamic_ai_card_limits_scale_by_effective_page_count() {
        assert_eq!(dynamic_card_limit("low", 1), 6);
        assert_eq!(dynamic_card_limit("medium", 1), 12);
        assert_eq!(dynamic_card_limit("high", 1), 20);
        assert_eq!(dynamic_card_limit("medium", 30), 30);
        assert_eq!(dynamic_card_limit("high", 30), 45);
        assert_eq!(dynamic_card_limit("medium", 200), 80);
        assert_eq!(dynamic_card_limit("high", 200), 120);
    }

    #[test]
    fn effective_ai_card_page_count_prefers_valid_range() {
        assert_eq!(
            effective_generation_page_count(Some(100), Some(10), Some(19)),
            10
        );
        assert_eq!(effective_generation_page_count(Some(100), None, None), 100);
        assert_eq!(effective_generation_page_count(None, None, None), 1);
        assert_eq!(effective_generation_page_count(Some(50), Some(9), Some(3)), 50);
    }

    #[test]
    fn dynamic_chunk_limits_scale_for_long_documents() {
        assert_eq!(dynamic_chunk_limit("low", 1), 10);
        assert_eq!(dynamic_chunk_limit("medium", 1), 18);
        assert_eq!(dynamic_chunk_limit("high", 1), 28);
        assert_eq!(dynamic_chunk_limit("high", 30), 90);
        assert_eq!(dynamic_chunk_limit("medium", 200), 140);
        assert_eq!(dynamic_chunk_limit("high", 200), 200);
    }

    #[test]
    fn curated_chunk_ranking_skips_low_value_and_limits_by_density() {
        let now = chrono::Utc::now().to_rfc3339();
        let mut chunks = vec![
            Mvp0DocumentChunk {
                id: "toc".to_string(),
                document_id: "doc".to_string(),
                page_start: 1,
                page_end: 1,
                chunk_index: 0,
                text: "目录 table of contents references copyright".repeat(8),
                char_count: 200,
                parser: "test".to_string(),
                created_at: now.clone(),
            },
            Mvp0DocumentChunk {
                id: "definition".to_string(),
                document_id: "doc".to_string(),
                page_start: 2,
                page_end: 2,
                chunk_index: 1,
                text: "定义：间隔重复是一种根据遗忘曲线安排复习的方法，因此可以提高长期记忆保持率。这个概念强调反馈和下一次复习时间。".to_string(),
                char_count: 80,
                parser: "test".to_string(),
                created_at: now.clone(),
            },
        ];
        for index in 2..20 {
            chunks.push(Mvp0DocumentChunk {
                id: format!("method-{index}"),
                document_id: "doc".to_string(),
                page_start: index,
                page_end: index,
                chunk_index: index,
                text: "方法：学习者先回答一个具体问题，然后根据反馈调整复习间隔，因此系统可以比较稳定地强化关键概念。".to_string(),
                char_count: 70,
                parser: "test".to_string(),
                created_at: now.clone(),
            });
        }

        let chunk_limit = dynamic_chunk_limit("low", 1);
        let ranked = rank_generation_chunks(chunks, None, None, chunk_limit);
        assert!(!ranked.iter().any(|chunk| chunk.id == "toc"));
        assert!(ranked.iter().any(|chunk| chunk.id == "definition"));
        assert!(ranked.len() <= chunk_limit);
    }

    #[test]
    fn curated_chunk_ranking_accepts_more_than_old_high_limit_for_long_documents() {
        let chunks = (1..=60).map(ranking_test_chunk).collect::<Vec<_>>();

        let ranked = rank_generation_chunks(chunks, None, None, dynamic_chunk_limit("high", 30));

        assert!(ranked.len() > 28);
        assert_eq!(ranked.len(), 60);
    }

    #[test]
    fn ai_card_generation_accepts_ready_and_embedding_terminal_statuses() {
        for status in [
            "parsed",
            "ready",
            "embedding",
            "embedding_failed",
            "embedding_stale",
        ] {
            assert!(
                can_generate_ai_cards_from_status(status),
                "{status} should allow AI card generation"
            );
            assert!(
                !can_repair_ai_generation_status(status),
                "{status} should not be rewritten before AI card generation"
            );
        }
    }

    #[test]
    fn ai_card_generation_repairs_legacy_stale_statuses_only() {
        for status in ["pending", "parsing", "failed"] {
            assert!(
                !can_generate_ai_cards_from_status(status),
                "{status} should not be directly accepted"
            );
            assert!(
                can_repair_ai_generation_status(status),
                "{status} should be repairable when parsed chunks exist"
            );
        }

        assert!(!can_generate_ai_cards_from_status("unknown"));
        assert!(!can_repair_ai_generation_status("unknown"));
    }
}
