use std::{collections::HashMap, time::Duration};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use tokio::time::sleep;

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        AppendWorkflowEventRequest, Card, CardCandidate, CardCandidateCounts, CardFilters,
        CardRepository, CreateCardCandidateRequest, CreateCardRequest, CreateHighlightRequest,
        CreateWorkflowRunRequest, Document, DocumentAnchor, DocumentAnchorRect, DocumentChunk,
        DocumentRepository, Highlight, HighlightFilters, UpdateCardCandidateRequest,
        UpdateHighlightRequest, UpdateWorkflowRunRequest, UpsertWorkflowCheckpointRequest,
        WorkflowRepository, WorkflowRun,
    },
};

const CARD_GENERATION_PRESET_ID: &str = "m3-card-production-line";
const DEFAULT_MAX_CANDIDATES: usize = 24;
const MAX_MAX_CANDIDATES: usize = 64;
const DEFAULT_HIGHLIGHT_COLOR: &str = "#F8E16C";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardDto {
    pub id: String,
    pub group_id: Option<String>,
    pub front: String,
    pub back: String,
    pub document_id: Option<String>,
    pub anchor_id: Option<String>,
    pub source_page: Option<i32>,
    pub source_paragraph: Option<i32>,
    pub source_coordinates: Option<serde_json::Value>,
    pub retrievability: Option<f64>,
    pub tags: Vec<String>,
    pub difficulty: f64,
    pub stability: f64,
    pub state: String,
    pub next_review: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<Card> for CardDto {
    fn from(card: Card) -> Self {
        Self {
            id: card.id,
            group_id: card.group_id,
            front: card.front,
            back: card.back,
            document_id: card.document_id,
            anchor_id: card.anchor_id,
            source_page: card.source_page,
            source_paragraph: card.source_paragraph,
            source_coordinates: card.source_coordinates,
            retrievability: card.retrievability,
            tags: decode_card_tags(card.tags),
            difficulty: card.difficulty,
            stability: card.stability,
            state: card.state,
            next_review: card.next_review,
            created_at: card.created_at,
            updated_at: card.updated_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightDto {
    pub id: String,
    pub card_id: Option<String>,
    pub document_id: String,
    pub anchor_id: Option<String>,
    pub page_number: i32,
    pub rectangles: Vec<DocumentAnchorRect>,
    pub text_content: String,
    pub color: String,
    pub created_at: String,
}

impl From<Highlight> for HighlightDto {
    fn from(highlight: Highlight) -> Self {
        Self {
            id: highlight.id,
            card_id: highlight.card_id,
            document_id: highlight.document_id,
            anchor_id: highlight.anchor_id,
            page_number: highlight.page_number,
            rectangles: highlight.rectangles,
            text_content: highlight.text_content,
            color: highlight.color,
            created_at: highlight.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardCandidateDto {
    pub id: String,
    pub workflow_run_id: Option<String>,
    pub document_id: String,
    pub anchor_id: Option<String>,
    pub source_page: Option<i32>,
    pub source_paragraph: Option<i32>,
    pub source_quote: Option<String>,
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
    pub confidence: f64,
    pub dedupe_key: String,
    pub status: String,
    pub created_at: String,
}

impl From<CardCandidate> for CardCandidateDto {
    fn from(candidate: CardCandidate) -> Self {
        Self {
            id: candidate.id,
            workflow_run_id: candidate.workflow_run_id,
            document_id: candidate.document_id,
            anchor_id: candidate.anchor_id,
            source_page: candidate.source_page,
            source_paragraph: candidate.source_paragraph,
            source_quote: candidate.source_quote,
            front: candidate.front,
            back: candidate.back,
            tags: candidate.tags,
            confidence: candidate.confidence,
            dedupe_key: candidate.dedupe_key,
            status: candidate.status,
            created_at: candidate.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalizeCardGenerationResultDto {
    pub created_count: usize,
    pub skipped_duplicates: usize,
    pub rejected_count: usize,
    pub run: WorkflowRun,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCardDto {
    pub front: String,
    pub back: String,
    pub document_id: Option<String>,
    pub anchor_id: Option<String>,
    pub source_page: Option<i32>,
    pub source_paragraph: Option<i32>,
    pub source_coordinates: Option<DocumentAnchorRect>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReviewDto {
    pub difficulty: f64,
    pub stability: f64,
    pub retrievability: f64,
    pub state: String,
    pub next_review: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartCardGenerationDto {
    pub document_id: String,
    pub max_candidates: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCardCandidateDto {
    pub front: Option<String>,
    pub back: Option<String>,
    pub tags: Option<Vec<String>>,
    pub confidence: Option<f64>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkUpdateCardCandidateStatusesDto {
    pub workflow_run_id: String,
    pub ids: Vec<String>,
    pub status: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCardsFiltersDto {
    pub document_id: Option<String>,
    pub anchor_id: Option<String>,
    pub page_number: Option<i32>,
    pub limit: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListHighlightsFiltersDto {
    pub document_id: Option<String>,
    pub card_id: Option<String>,
    pub page_number: Option<i32>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHighlightDto {
    pub card_id: Option<String>,
    pub document_id: String,
    pub anchor_id: Option<String>,
    pub page_number: i32,
    pub rectangles: Vec<DocumentAnchorRect>,
    pub text_content: String,
    pub color: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateHighlightDto {
    pub card_id: Option<Option<String>>,
    pub anchor_id: Option<Option<String>>,
    pub rectangles: Option<Vec<DocumentAnchorRect>>,
    pub text_content: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CardGenerationCheckpointPayload {
    document_id: String,
    document_title: String,
    chunk_cursor: usize,
    total_chunks: usize,
    generated_count: usize,
    duplicate_count: usize,
    pending_count: usize,
    max_candidates: usize,
    phase: String,
    last_chunk_index: Option<usize>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChunkMetadata {
    #[serde(default)]
    anchor_hashes: Vec<String>,
}

#[tauri::command]
pub fn list_due_cards(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> CommandResult<Vec<CardDto>> {
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let cards = repo.find_due_cards(limit)?;
    Ok(cards.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn list_cards(
    state: State<'_, AppState>,
    filters: Option<ListCardsFiltersDto>,
) -> CommandResult<Vec<CardDto>> {
    let filters = filters.unwrap_or_default();
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let cards = repo.list_cards(CardFilters {
        document_id: filters.document_id.as_deref(),
        anchor_id: filters.anchor_id.as_deref(),
        page_number: filters.page_number,
        limit: filters.limit,
    })?;
    Ok(cards.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn create_card(state: State<'_, AppState>, data: CreateCardDto) -> CommandResult<CardDto> {
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let request = CreateCardRequest {
        front: data.front,
        back: data.back,
        document_id: data.document_id,
        anchor_id: data.anchor_id,
        source_page: data.source_page,
        source_paragraph: data.source_paragraph,
        source_coordinates: data.source_coordinates,
        tags: data.tags,
    };
    Ok(repo.create(request)?.into())
}

#[tauri::command]
pub fn list_highlights(
    state: State<'_, AppState>,
    filters: Option<ListHighlightsFiltersDto>,
) -> CommandResult<Vec<HighlightDto>> {
    let filters = filters.unwrap_or_default();
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let highlights = repo.list_highlights(HighlightFilters {
        document_id: filters.document_id.as_deref(),
        card_id: filters.card_id.as_deref(),
        page_number: filters.page_number,
        limit: filters.limit,
    })?;
    Ok(highlights.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn create_highlight(
    state: State<'_, AppState>,
    data: CreateHighlightDto,
) -> CommandResult<HighlightDto> {
    validate_highlight_input(&data.rectangles, &data.text_content)?;

    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let highlight = repo.create_highlight(CreateHighlightRequest {
        card_id: data.card_id,
        document_id: data.document_id,
        anchor_id: data.anchor_id,
        page_number: data.page_number,
        rectangles: data.rectangles,
        text_content: data.text_content.trim().to_string(),
        color: sanitize_highlight_color(data.color.as_deref()),
    })?;

    Ok(highlight.into())
}

#[tauri::command]
pub fn update_highlight(
    state: State<'_, AppState>,
    id: String,
    data: UpdateHighlightDto,
) -> CommandResult<HighlightDto> {
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let current = repo.get_highlight(&id)?.ok_or(CommandError::NotFound)?;

    let rectangles = data.rectangles.unwrap_or(current.rectangles.clone());
    let text_content = data
        .text_content
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| current.text_content.clone());
    validate_highlight_input(&rectangles, &text_content)?;

    let updated = repo
        .update_highlight(
            &id,
            UpdateHighlightRequest {
                card_id: data.card_id.unwrap_or(current.card_id.clone()),
                anchor_id: data.anchor_id.unwrap_or(current.anchor_id.clone()),
                rectangles,
                text_content,
                color: sanitize_highlight_color(data.color.as_deref().or(Some(&current.color))),
            },
        )?
        .ok_or(CommandError::NotFound)?;

    Ok(updated.into())
}

#[tauri::command]
pub fn delete_highlight(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let db = state.lock_db()?;
    CardRepository::new(&db).delete_highlight(&id)?;
    Ok(())
}

#[tauri::command]
pub fn update_card_review(
    state: State<'_, AppState>,
    id: String,
    data: UpdateReviewDto,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    CardRepository::new(&db).update_review(
        &id,
        data.difficulty,
        data.stability,
        data.retrievability,
        &data.state,
        &data.next_review,
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_card_candidates(
    state: State<'_, AppState>,
    workflow_run_id: Option<String>,
    document_id: Option<String>,
    status: Option<String>,
    limit: Option<i64>,
) -> CommandResult<Vec<CardCandidateDto>> {
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let candidates = repo.list_candidates(
        workflow_run_id.as_deref(),
        document_id.as_deref(),
        status.as_deref(),
        limit,
    )?;
    Ok(candidates.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn update_card_candidate(
    state: State<'_, AppState>,
    id: String,
    data: UpdateCardCandidateDto,
) -> CommandResult<CardCandidateDto> {
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let current = repo.get_candidate(&id)?.ok_or(CommandError::NotFound)?;
    let front = data.front.unwrap_or(current.front.clone());
    let back = data.back.unwrap_or(current.back.clone());
    let tags = data.tags.unwrap_or(current.tags.clone());
    let confidence = data.confidence.unwrap_or(current.confidence);
    let status = data.status.unwrap_or(current.status.clone());
    validate_candidate_status(&status)?;

    let updated = repo
        .update_candidate(
            &id,
            UpdateCardCandidateRequest {
                front: front.clone(),
                back: back.clone(),
                tags,
                confidence,
                dedupe_key: compute_candidate_dedupe_key(
                    &current.document_id,
                    current.anchor_id.as_deref(),
                    &front,
                    &back,
                ),
                status,
            },
        )?
        .ok_or(CommandError::NotFound)?;

    if let Some(run_id) = updated.workflow_run_id.as_deref() {
        sync_card_generation_run_summary(&db, run_id)?;
    }

    Ok(updated.into())
}

#[tauri::command]
pub fn bulk_update_card_candidate_statuses(
    state: State<'_, AppState>,
    data: BulkUpdateCardCandidateStatusesDto,
) -> CommandResult<usize> {
    validate_candidate_status(&data.status)?;
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let affected =
        repo.update_candidate_statuses(&data.workflow_run_id, &data.ids, &data.status)?;
    sync_card_generation_run_summary(&db, &data.workflow_run_id)?;
    Ok(affected)
}

#[tauri::command]
pub fn start_card_generation_workflow(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    data: StartCardGenerationDto,
) -> CommandResult<WorkflowRun> {
    let max_candidates = sanitize_max_candidates(data.max_candidates);
    let run = {
        let db = state.lock_db()?;
        let document_repo = DocumentRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);
        let document = document_repo
            .find_by_id(&data.document_id)?
            .ok_or(CommandError::NotFound)?;
        ensure_document_is_ready_for_card_generation(&document)?;
        let chunks = document_repo.list_chunks(&document.id)?;
        if chunks.is_empty() {
            return Err(CommandError::InvalidInput(
                "The document has no parsed chunks".to_string(),
            ));
        }

        let run = workflow_repo.create_run(CreateWorkflowRunRequest {
            workflow_type: "card_generation".to_string(),
            preset_id: Some(CARD_GENERATION_PRESET_ID.to_string()),
            status: "queued".to_string(),
            thread_id: format!("card-generation:{}", document.id),
            started_at: None,
        })?;

        let payload = CardGenerationCheckpointPayload {
            document_id: document.id.clone(),
            document_title: document.title.clone(),
            chunk_cursor: 0,
            total_chunks: chunks.len(),
            generated_count: 0,
            duplicate_count: 0,
            pending_count: 0,
            max_candidates,
            phase: "queued".to_string(),
            last_chunk_index: None,
        };
        let summary = build_run_summary(&payload, &CardCandidateCounts::default());
        workflow_repo.upsert_checkpoint(UpsertWorkflowCheckpointRequest {
            run_id: run.id.clone(),
            checkpoint_ref: "queued".to_string(),
            step_key: Some("queue-run".to_string()),
            payload: serialize_checkpoint_payload(&payload)?,
        })?;
        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run.id.clone(),
            event_type: "queued".to_string(),
            message: Some(format!("Queued card generation for {}", document.title)),
            progress: Some(0.0),
            payload: Some(summary.clone()),
        })?;
        workflow_repo
            .update_run(
                &run.id,
                UpdateWorkflowRunRequest {
                    status: Some("queued".to_string()),
                    checkpoint_ref: Some("queued".to_string()),
                    approval_payload: Some(summary),
                    cost_usd: None,
                    error_message: None,
                    started_at: None,
                    finished_at: None,
                },
            )?
            .ok_or(CommandError::NotFound)?
    };

    spawn_card_generation_worker(app_handle, run.id.clone());
    Ok(run)
}

#[tauri::command]
pub fn resume_card_generation_workflow(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    run_id: String,
) -> CommandResult<WorkflowRun> {
    let run = {
        let db = state.lock_db()?;
        let workflow_repo = WorkflowRepository::new(&db);
        let run = workflow_repo
            .get_run(&run_id)?
            .ok_or(CommandError::NotFound)?;
        if run.workflow_type != "card_generation" {
            return Err(CommandError::InvalidInput(
                "Only card generation runs can be resumed here".to_string(),
            ));
        }
        match run.status.as_str() {
            "completed" | "cancelled" => {
                return Err(CommandError::InvalidInput(format!(
                    "Workflow run {run_id} is already {}",
                    run.status
                )))
            }
            "waiting_confirmation" => return Ok(run),
            _ => {}
        }

        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run.id.clone(),
            event_type: "queued".to_string(),
            message: Some("Resuming from the latest checkpoint".to_string()),
            progress: None,
            payload: None,
        })?;
        workflow_repo
            .update_run(
                &run.id,
                UpdateWorkflowRunRequest {
                    status: Some("queued".to_string()),
                    checkpoint_ref: run.checkpoint_ref.clone(),
                    approval_payload: run.approval_payload.clone(),
                    cost_usd: None,
                    error_message: None,
                    started_at: run.started_at.clone(),
                    finished_at: None,
                },
            )?
            .ok_or(CommandError::NotFound)?
    };

    spawn_card_generation_worker(app_handle, run.id.clone());
    Ok(run)
}

#[tauri::command]
pub fn finalize_card_generation_workflow(
    state: State<'_, AppState>,
    run_id: String,
) -> CommandResult<FinalizeCardGenerationResultDto> {
    let db = state.lock_db()?;
    let workflow_repo = WorkflowRepository::new(&db);
    let card_repo = CardRepository::new(&db);
    let run = workflow_repo
        .get_run(&run_id)?
        .ok_or(CommandError::NotFound)?;
    if run.workflow_type != "card_generation" {
        return Err(CommandError::InvalidInput(
            "Only card generation runs can be finalized here".to_string(),
        ));
    }
    if matches!(run.status.as_str(), "queued" | "running") {
        return Err(CommandError::InvalidInput(
            "Wait until candidate generation reaches review".to_string(),
        ));
    }

    let mut payload = load_card_generation_payload(&workflow_repo, &run)?;
    let result = card_repo.finalize_candidates_for_run(&run_id)?;
    let counts = card_repo.count_candidates_for_run(&run_id)?;
    payload.pending_count = counts.pending as usize;
    payload.phase = "completed".to_string();

    workflow_repo.upsert_checkpoint(UpsertWorkflowCheckpointRequest {
        run_id: run_id.clone(),
        checkpoint_ref: "completed".to_string(),
        step_key: Some("save-cards".to_string()),
        payload: serialize_checkpoint_payload(&payload)?,
    })?;
    let updated_run = workflow_repo
        .update_run(
            &run_id,
            UpdateWorkflowRunRequest {
                status: Some("completed".to_string()),
                checkpoint_ref: Some("completed".to_string()),
                approval_payload: Some(build_run_summary(&payload, &counts)),
                cost_usd: None,
                error_message: None,
                started_at: run.started_at.clone(),
                finished_at: Some(chrono::Utc::now().to_rfc3339()),
            },
        )?
        .ok_or(CommandError::NotFound)?;
    workflow_repo.append_event(AppendWorkflowEventRequest {
        run_id,
        event_type: "completed".to_string(),
        message: Some(format!(
            "Created {} cards and skipped {} duplicates",
            result.created_count, result.skipped_duplicates
        )),
        progress: Some(1.0),
        payload: Some(build_run_summary(&payload, &counts)),
    })?;

    Ok(FinalizeCardGenerationResultDto {
        created_count: result.created_count,
        skipped_duplicates: result.skipped_duplicates,
        rejected_count: result.rejected_count,
        run: updated_run,
    })
}

fn spawn_card_generation_worker(app_handle: AppHandle, run_id: String) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_card_generation_worker(&app_handle, &run_id).await {
            log::error!("Card generation workflow {run_id} failed: {error}");
            let _ = mark_card_generation_run_failed(&app_handle, &run_id, &error.to_string());
        }
    });
}

async fn execute_card_generation_worker(app_handle: &AppHandle, run_id: &str) -> CommandResult<()> {
    let (document, _chunks, _anchors, mut payload, run) =
        load_generation_context(app_handle, run_id)?;

    {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let workflow_repo = WorkflowRepository::new(&db);
        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run_id.to_string(),
            event_type: "started".to_string(),
            message: Some(format!("Started preset workflow for {}", document.title)),
            progress: Some(progress_ratio(payload.chunk_cursor, payload.total_chunks)),
            payload: run.approval_payload.clone(),
        })?;
        workflow_repo.update_run(
            run_id,
            UpdateWorkflowRunRequest {
                status: Some("running".to_string()),
                checkpoint_ref: run.checkpoint_ref.clone(),
                approval_payload: run.approval_payload.clone(),
                cost_usd: None,
                error_message: None,
                started_at: Some(
                    run.started_at
                        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                ),
                finished_at: None,
            },
        )?;
    }

    // Try Python orchestration service first
    let orchestration_result = try_orchestration_card_generation(app_handle, run_id, &document, &payload).await;

    if let Ok(generated_count) = orchestration_result {
        payload.generated_count = generated_count;
        payload.phase = "generating".to_string();
        log::info!("Python orchestration generated {generated_count} candidates for run {run_id}");
    } else {
        // Fallback to local rule-based generation
        log::warn!("Python orchestration unavailable, falling back to local rule-based generation for run {run_id}");
        {
            let state = app_handle.state::<AppState>();
            let db = state.lock_db()?;
            let workflow_repo = WorkflowRepository::new(&db);
            workflow_repo.append_event(AppendWorkflowEventRequest {
                run_id: run_id.to_string(),
                event_type: "fallback".to_string(),
                message: Some("Orchestration service unavailable, using local rule-based generation".to_string()),
                progress: None,
                payload: None,
            })?;
        }

        let (_, chunks, anchors, _, _) = load_generation_context(app_handle, run_id)?;
        let anchor_index = anchors
            .into_iter()
            .map(|anchor| (anchor.hash.clone(), anchor))
            .collect::<HashMap<_, _>>();

        for chunk in chunks.iter().skip(payload.chunk_cursor) {
            if payload.generated_count >= payload.max_candidates {
                break;
            }

            let budget = payload
                .max_candidates
                .saturating_sub(payload.generated_count);
            let requests = build_candidates_for_chunk(run_id, &document, chunk, &anchor_index, budget);
            let counts = {
                let state = app_handle.state::<AppState>();
                let db = state.lock_db()?;
                let card_repo = CardRepository::new(&db);
                if !requests.is_empty() {
                    let result = card_repo.insert_generated_candidates(requests)?;
                    payload.generated_count += result.inserted_count;
                    payload.duplicate_count += result.duplicate_count;
                }
                card_repo.count_candidates_for_run(run_id)?
            };

            payload.pending_count = counts.pending as usize;
            payload.chunk_cursor = (chunk.chunk_index as usize).saturating_add(1);
            payload.last_chunk_index = Some(chunk.chunk_index as usize);
            payload.phase = "generating".to_string();
            let checkpoint_ref = format!("chunk-{}", chunk.chunk_index);
            persist_generation_progress(app_handle, run_id, &payload, &counts, &checkpoint_ref)?;

            if payload.generated_count >= payload.max_candidates {
                break;
            }

            sleep(Duration::from_millis(60)).await;
        }
    }

    let final_counts = {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        CardRepository::new(&db).count_candidates_for_run(run_id)?
    };

    payload.pending_count = final_counts.pending as usize;
    let waiting_review = final_counts.total > 0;
    payload.phase = if waiting_review {
        "waiting_confirmation".to_string()
    } else {
        "completed".to_string()
    };

    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let workflow_repo = WorkflowRepository::new(&db);
    let checkpoint_ref = if waiting_review {
        "waiting_confirmation"
    } else {
        "completed"
    };
    workflow_repo.upsert_checkpoint(UpsertWorkflowCheckpointRequest {
        run_id: run_id.to_string(),
        checkpoint_ref: checkpoint_ref.to_string(),
        step_key: Some(if waiting_review {
            "review-candidates".to_string()
        } else {
            "complete-no-candidates".to_string()
        }),
        payload: serialize_checkpoint_payload(&payload)?,
    })?;
    workflow_repo.update_run(
        run_id,
        UpdateWorkflowRunRequest {
            status: Some(if waiting_review {
                "waiting_confirmation".to_string()
            } else {
                "completed".to_string()
            }),
            checkpoint_ref: Some(checkpoint_ref.to_string()),
            approval_payload: Some(build_run_summary(&payload, &final_counts)),
            cost_usd: None,
            error_message: None,
            started_at: None,
            finished_at: (!waiting_review).then(|| chrono::Utc::now().to_rfc3339()),
        },
    )?;
    workflow_repo.append_event(AppendWorkflowEventRequest {
        run_id: run_id.to_string(),
        event_type: checkpoint_ref.to_string(),
        message: Some(if waiting_review {
            format!("Generated {} reviewable candidates", final_counts.total)
        } else {
            "Workflow finished without new candidates".to_string()
        }),
        progress: Some(1.0),
        payload: Some(build_run_summary(&payload, &final_counts)),
    })?;

    Ok(())
}

async fn try_orchestration_card_generation(
    app_handle: &AppHandle,
    run_id: &str,
    document: &Document,
    payload: &CardGenerationCheckpointPayload,
) -> Result<usize, String> {
    let state = app_handle.state::<AppState>();
    let health = state.orchestration.health().await.map_err(|e| e.to_string())?;

    let endpoint = health.endpoint.ok_or("No orchestration endpoint")?;
    if health.status != "healthy" && health.status != "degraded" {
        return Err(format!("Orchestration service status: {}", health.status));
    }

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .post(format!("{endpoint}/workflows/card-generation"))
        .json(&serde_json::json!({
            "runId": run_id,
            "documentId": document.id,
            "maxCandidates": payload.max_candidates,
        }))
        .send()
        .await
        .map_err(|e| format!("Orchestration request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Orchestration returned {status}: {body}"));
    }

    let result: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let generated = result["generatedCount"].as_u64().unwrap_or(0) as usize;
    Ok(generated)
}

fn load_generation_context(
    app_handle: &AppHandle,
    run_id: &str,
) -> CommandResult<(
    Document,
    Vec<DocumentChunk>,
    Vec<DocumentAnchor>,
    CardGenerationCheckpointPayload,
    WorkflowRun,
)> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let workflow_repo = WorkflowRepository::new(&db);
    let document_repo = DocumentRepository::new(&db);
    let run = workflow_repo
        .get_run(run_id)?
        .ok_or(CommandError::NotFound)?;
    if run.workflow_type != "card_generation" {
        return Err(CommandError::InvalidInput(
            "Only card generation runs can be processed here".to_string(),
        ));
    }

    let payload = load_card_generation_payload(&workflow_repo, &run)?;
    let document = document_repo
        .find_by_id(&payload.document_id)?
        .ok_or(CommandError::NotFound)?;
    Ok((
        document.clone(),
        document_repo.list_chunks(&document.id)?,
        document_repo.list_anchors(&document.id)?,
        payload,
        run,
    ))
}

fn persist_generation_progress(
    app_handle: &AppHandle,
    run_id: &str,
    payload: &CardGenerationCheckpointPayload,
    counts: &CardCandidateCounts,
    checkpoint_ref: &str,
) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let workflow_repo = WorkflowRepository::new(&db);
    workflow_repo.upsert_checkpoint(UpsertWorkflowCheckpointRequest {
        run_id: run_id.to_string(),
        checkpoint_ref: checkpoint_ref.to_string(),
        step_key: Some("generate-candidates".to_string()),
        payload: serialize_checkpoint_payload(payload)?,
    })?;
    workflow_repo.update_run(
        run_id,
        UpdateWorkflowRunRequest {
            status: Some("running".to_string()),
            checkpoint_ref: Some(checkpoint_ref.to_string()),
            approval_payload: Some(build_run_summary(payload, counts)),
            cost_usd: None,
            error_message: None,
            started_at: None,
            finished_at: None,
        },
    )?;
    workflow_repo.append_event(AppendWorkflowEventRequest {
        run_id: run_id.to_string(),
        event_type: "progress".to_string(),
        message: Some(format!(
            "Processed chunk {}/{}",
            payload.chunk_cursor.min(payload.total_chunks),
            payload.total_chunks
        )),
        progress: Some(progress_ratio(payload.chunk_cursor, payload.total_chunks)),
        payload: Some(build_run_summary(payload, counts)),
    })?;
    Ok(())
}

fn mark_card_generation_run_failed(
    app_handle: &AppHandle,
    run_id: &str,
    error: &str,
) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let workflow_repo = WorkflowRepository::new(&db);
    let card_repo = CardRepository::new(&db);
    let run = workflow_repo
        .get_run(run_id)?
        .ok_or(CommandError::NotFound)?;
    let mut payload = load_card_generation_payload(&workflow_repo, &run)?;
    let counts = card_repo.count_candidates_for_run(run_id)?;
    payload.pending_count = counts.pending as usize;
    payload.phase = "failed".to_string();
    let checkpoint_ref = run
        .checkpoint_ref
        .clone()
        .unwrap_or_else(|| "failed".to_string());
    workflow_repo.upsert_checkpoint(UpsertWorkflowCheckpointRequest {
        run_id: run_id.to_string(),
        checkpoint_ref: checkpoint_ref.clone(),
        step_key: Some("failed".to_string()),
        payload: serialize_checkpoint_payload(&payload)?,
    })?;
    workflow_repo.update_run(
        run_id,
        UpdateWorkflowRunRequest {
            status: Some("failed".to_string()),
            checkpoint_ref: Some(checkpoint_ref),
            approval_payload: Some(build_run_summary(&payload, &counts)),
            cost_usd: None,
            error_message: Some(error.to_string()),
            started_at: None,
            finished_at: None,
        },
    )?;
    workflow_repo.append_event(AppendWorkflowEventRequest {
        run_id: run_id.to_string(),
        event_type: "failed".to_string(),
        message: Some(error.to_string()),
        progress: None,
        payload: Some(build_run_summary(&payload, &counts)),
    })?;
    Ok(())
}

fn sync_card_generation_run_summary(
    db: &crate::db::Database,
    run_id: &str,
) -> CommandResult<Option<WorkflowRun>> {
    let workflow_repo = WorkflowRepository::new(db);
    let card_repo = CardRepository::new(db);
    let run = workflow_repo
        .get_run(run_id)?
        .ok_or(CommandError::NotFound)?;
    let counts = card_repo.count_candidates_for_run(run_id)?;
    let mut payload = load_card_generation_payload(&workflow_repo, &run)?;
    payload.pending_count = counts.pending as usize;
    workflow_repo
        .update_run(
            run_id,
            UpdateWorkflowRunRequest {
                status: None,
                checkpoint_ref: run.checkpoint_ref.clone(),
                approval_payload: Some(build_run_summary(&payload, &counts)),
                cost_usd: None,
                error_message: None,
                started_at: run.started_at.clone(),
                finished_at: run.finished_at.clone(),
            },
        )
        .map_err(Into::into)
}

fn load_card_generation_payload(
    workflow_repo: &WorkflowRepository<'_>,
    run: &WorkflowRun,
) -> CommandResult<CardGenerationCheckpointPayload> {
    let checkpoint = match run.checkpoint_ref.as_deref() {
        Some(checkpoint_ref) => workflow_repo.get_checkpoint(&run.id, checkpoint_ref)?,
        None => workflow_repo.get_latest_checkpoint(&run.id)?,
    }
    .or_else(|| workflow_repo.get_latest_checkpoint(&run.id).ok().flatten())
    .ok_or_else(|| {
        CommandError::InvalidInput(format!("Workflow run {} is missing its checkpoint", run.id))
    })?;

    serde_json::from_value::<CardGenerationCheckpointPayload>(checkpoint.payload).map_err(|error| {
        CommandError::InvalidInput(format!("Invalid workflow checkpoint payload: {error}"))
    })
}

fn serialize_checkpoint_payload(
    payload: &CardGenerationCheckpointPayload,
) -> CommandResult<serde_json::Value> {
    serde_json::to_value(payload)
        .map_err(|error| CommandError::Internal(format!("Failed to serialize checkpoint: {error}")))
}

fn build_run_summary(
    payload: &CardGenerationCheckpointPayload,
    counts: &CardCandidateCounts,
) -> serde_json::Value {
    serde_json::json!({
        "documentId": payload.document_id,
        "documentTitle": payload.document_title,
        "phase": payload.phase,
        "chunkCursor": payload.chunk_cursor,
        "totalChunks": payload.total_chunks,
        "generatedCount": payload.generated_count,
        "duplicateCount": payload.duplicate_count,
        "pendingCount": counts.pending,
        "acceptedCount": counts.accepted,
        "rejectedCount": counts.rejected,
        "maxCandidates": payload.max_candidates,
        "lastChunkIndex": payload.last_chunk_index,
    })
}

fn ensure_document_is_ready_for_card_generation(document: &Document) -> CommandResult<()> {
    if document.status == "ready" {
        return Ok(());
    }
    Err(CommandError::InvalidInput(format!(
        "Document {} is {}, not ready for generation",
        document.title, document.status
    )))
}

fn sanitize_max_candidates(max_candidates: Option<usize>) -> usize {
    max_candidates
        .unwrap_or(DEFAULT_MAX_CANDIDATES)
        .clamp(1, MAX_MAX_CANDIDATES)
}

fn validate_candidate_status(status: &str) -> CommandResult<()> {
    if matches!(status, "pending" | "accepted" | "rejected") {
        return Ok(());
    }
    Err(CommandError::InvalidInput(format!(
        "Unsupported status: {status}"
    )))
}

fn validate_highlight_input(
    rectangles: &[DocumentAnchorRect],
    text_content: &str,
) -> CommandResult<()> {
    if rectangles.is_empty() {
        return Err(CommandError::InvalidInput(
            "Highlight rectangles cannot be empty".to_string(),
        ));
    }

    if text_content.trim().is_empty() {
        return Err(CommandError::InvalidInput(
            "Highlight text cannot be empty".to_string(),
        ));
    }

    Ok(())
}

fn sanitize_highlight_color(color: Option<&str>) -> String {
    let trimmed = color.unwrap_or(DEFAULT_HIGHLIGHT_COLOR).trim();
    if trimmed.starts_with('#') && (trimmed.len() == 7 || trimmed.len() == 9) {
        trimmed.to_uppercase()
    } else {
        DEFAULT_HIGHLIGHT_COLOR.to_string()
    }
}

fn decode_card_tags(value: Option<serde_json::Value>) -> Vec<String> {
    value
        .and_then(|raw| serde_json::from_value::<Vec<String>>(raw).ok())
        .unwrap_or_default()
}

fn build_candidates_for_chunk(
    run_id: &str,
    document: &Document,
    chunk: &DocumentChunk,
    anchor_index: &HashMap<String, DocumentAnchor>,
    remaining_budget: usize,
) -> Vec<CreateCardCandidateRequest> {
    if remaining_budget == 0 {
        return Vec::new();
    }

    let metadata = chunk
        .metadata
        .as_ref()
        .and_then(|value| serde_json::from_value::<ChunkMetadata>(value.clone()).ok())
        .unwrap_or_default();

    let mut anchors = metadata
        .anchor_hashes
        .into_iter()
        .filter_map(|hash| anchor_index.get(&hash))
        .collect::<Vec<_>>();

    if anchors.is_empty() {
        anchors = anchor_index
            .values()
            .filter(|anchor| {
                let after_start = chunk
                    .page_start
                    .map(|page| anchor.page >= page)
                    .unwrap_or(true);
                let before_end = chunk
                    .page_end
                    .map(|page| anchor.page <= page)
                    .unwrap_or(true);
                after_start && before_end
            })
            .collect();
        anchors.sort_by_key(|anchor| (anchor.page, anchor.paragraph.unwrap_or_default()));
    }

    anchors
        .into_iter()
        .take(remaining_budget)
        .filter_map(|anchor| {
            build_flashcard_from_anchor(anchor).map(|(front, back, confidence)| {
                CreateCardCandidateRequest {
                    workflow_run_id: Some(run_id.to_string()),
                    document_id: document.id.clone(),
                    anchor_id: Some(anchor.id.clone()),
                    front: front.clone(),
                    back: back.clone(),
                    tags: build_candidate_tags(anchor),
                    confidence,
                    dedupe_key: compute_candidate_dedupe_key(
                        &document.id,
                        Some(&anchor.id),
                        &front,
                        &back,
                    ),
                }
            })
        })
        .collect()
}

fn build_flashcard_from_anchor(anchor: &DocumentAnchor) -> Option<(String, String, f64)> {
    let text = normalize_card_text(&anchor.text_quote);
    if text.chars().count() < 18 {
        return None;
    }

    if let Some((term, definition)) =
        extract_chinese_definition(&text).or_else(|| extract_english_definition(&text))
    {
        return Some((
            format!("What is {term}?"),
            truncate_answer(&definition),
            0.82,
        ));
    }

    if text.contains("contains")
        || text.contains("\u{5305}\u{62ec}")
        || text.contains("\u{5305}\u{542b}")
    {
        let topic = extract_focus_phrase(&text);
        return Some((
            format!("What are the key points about {topic}?"),
            truncate_answer(&text),
            0.71,
        ));
    }

    let location = match anchor.paragraph {
        Some(paragraph) => format!("Page {}, paragraph {}", anchor.page, paragraph),
        None => format!("Page {}", anchor.page),
    };
    let focus = extract_focus_phrase(&text);

    Some((
        format!("{location}: what is the key idea about {focus}?"),
        truncate_answer(&text),
        0.64,
    ))
}

fn extract_chinese_definition(text: &str) -> Option<(String, String)> {
    for marker in [
        "\u{662f}\u{6307}",
        "\u{6307}\u{7684}\u{662f}",
        "\u{53eb}\u{505a}",
        "\u{610f}\u{5473}\u{7740}",
        "\u{662f}",
    ] {
        let (left, right) = text.split_once(marker)?;
        let term = normalize_card_text(left);
        let definition = normalize_card_text(right);
        if (2..=32).contains(&term.chars().count()) && definition.chars().count() >= 12 {
            return Some((term, definition));
        }
    }
    None
}

fn extract_english_definition(text: &str) -> Option<(String, String)> {
    let (left, right) = text.split_once(" is ")?;
    let term = normalize_card_text(left);
    let definition = normalize_card_text(right);
    if (2..=32).contains(&term.chars().count()) && definition.chars().count() >= 12 {
        return Some((term, definition));
    }
    None
}

fn extract_focus_phrase(text: &str) -> String {
    let phrase = text
        .split([
            '\u{3002}', '\u{ff01}', '\u{ff1f}', '.', '!', '?', '\u{ff1b}', ';', '\u{ff0c}', ',',
        ])
        .find(|segment| !segment.trim().is_empty())
        .unwrap_or(text);
    let normalized = normalize_card_text(phrase);
    let mut result = String::new();
    for character in normalized.chars().take(18) {
        result.push(character);
    }
    if result.is_empty() {
        "this passage".to_string()
    } else {
        result
    }
}

fn truncate_answer(text: &str) -> String {
    let normalized = normalize_card_text(text);
    if normalized.chars().count() <= 220 {
        return normalized;
    }
    normalized.chars().take(217).collect::<String>() + "..."
}

fn build_candidate_tags(anchor: &DocumentAnchor) -> Vec<String> {
    let mut tags = vec![format!("page-{}", anchor.page)];
    if let Some(paragraph) = anchor.paragraph {
        tags.push(format!("paragraph-{}", paragraph));
    }
    tags
}

fn compute_candidate_dedupe_key(
    document_id: &str,
    anchor_id: Option<&str>,
    front: &str,
    back: &str,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(document_id.as_bytes());
    hasher.update(b"::");
    hasher.update(anchor_id.unwrap_or("document").as_bytes());
    hasher.update(b"::");
    hasher.update(normalize_card_text(front).as_bytes());
    hasher.update(b"::");
    hasher.update(normalize_card_text(back).as_bytes());
    format!("{:x}", hasher.finalize())
}

fn normalize_card_text(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_lowercase()
}

fn progress_ratio(cursor: usize, total: usize) -> f64 {
    if total == 0 {
        0.0
    } else {
        (cursor.min(total) as f64 / total as f64).clamp(0.0, 1.0)
    }
}
