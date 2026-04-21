use std::{collections::HashMap, time::Duration};

use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tokio::time::sleep;

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        AppendWorkflowEventRequest, Card, CardCandidate, CardCandidateCounts, CardFilters,
        CardRepository, CreateCardCandidateRequest, CreateCardRequest, CreateHighlightRequest,
        CreateReviewLogRequest, CreateWorkflowRunRequest, Document, DocumentAnchor,
        DocumentAnchorRect, DocumentChunk, DocumentRepository, Highlight, HighlightFilters,
        ReviewLog, UpdateCardCandidateRequest, UpdateCardRequest, UpdateHighlightRequest, UpdateWorkflowRunRequest,
        UpsertWorkflowCheckpointRequest, WorkflowRepository, WorkflowRun,
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
    pub title: Option<String>,
    pub card_type: String,
    pub cluster_id: Option<String>,
    pub export_guid: Option<String>,
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
            title: card.title,
            card_type: card.card_type,
            cluster_id: card.cluster_id,
            export_guid: card.export_guid,
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
    pub note: Option<String>,
    pub page_card_index: Option<i32>,
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
            note: highlight.note,
            page_card_index: highlight.page_card_index,
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
    pub section_id: Option<String>,
    pub anchor_id: Option<String>,
    pub title: Option<String>,
    pub card_type: String,
    pub source_page: Option<i32>,
    pub source_paragraph: Option<i32>,
    pub source_quote: Option<String>,
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
    pub confidence: f64,
    pub dedupe_key: String,
    pub status: String,
    pub score_overall: Option<f64>,
    pub score_details: Option<serde_json::Value>,
    pub visibility_bucket: Option<String>,
    pub generation_mode: String,
    pub fallback_reason: Option<String>,
    pub evaluation_summary: Option<String>,
    pub source_chunk_ids: Option<Vec<String>>,
    pub created_at: String,
}

impl From<CardCandidate> for CardCandidateDto {
    fn from(candidate: CardCandidate) -> Self {
        Self {
            id: candidate.id,
            workflow_run_id: candidate.workflow_run_id,
            document_id: candidate.document_id,
            section_id: candidate.section_id,
            anchor_id: candidate.anchor_id,
            title: candidate.title,
            card_type: candidate.card_type,
            source_page: candidate.source_page,
            source_paragraph: candidate.source_paragraph,
            source_quote: candidate.source_quote,
            front: candidate.front,
            back: candidate.back,
            tags: candidate.tags,
            confidence: candidate.confidence,
            dedupe_key: candidate.dedupe_key,
            status: candidate.status,
            score_overall: candidate.score_overall,
            score_details: candidate.score_details,
            visibility_bucket: candidate.visibility_bucket,
            generation_mode: candidate.generation_mode,
            fallback_reason: candidate.fallback_reason,
            evaluation_summary: candidate.evaluation_summary,
            source_chunk_ids: candidate.source_chunk_ids,
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
    pub card_type: Option<String>,
    pub document_id: Option<String>,
    pub anchor_id: Option<String>,
    pub source_page: Option<i32>,
    pub source_paragraph: Option<i32>,
    pub source_coordinates: Option<DocumentAnchorRect>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCardDto {
    pub front: String,
    pub back: String,
    pub card_type: Option<String>,
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
    pub card_type: Option<String>,
    pub front: Option<String>,
    pub back: Option<String>,
    pub tags: Option<Vec<String>>,
    pub confidence: Option<f64>,
    pub status: Option<String>,
    pub score_overall: Option<Option<f64>>,
    pub score_details: Option<Option<serde_json::Value>>,
    pub visibility_bucket: Option<Option<String>>,
    pub generation_mode: Option<String>,
    pub fallback_reason: Option<Option<String>>,
    pub evaluation_summary: Option<Option<String>>,
    pub source_chunk_ids: Option<Option<Vec<String>>>,
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
    pub note: Option<String>,
    pub page_card_index: Option<i32>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateHighlightDto {
    pub card_id: Option<Option<String>>,
    pub anchor_id: Option<Option<String>>,
    pub rectangles: Option<Vec<DocumentAnchorRect>>,
    pub text_content: Option<String>,
    pub color: Option<String>,
    pub note: Option<Option<String>>,
    pub page_card_index: Option<Option<i32>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchCreateHighlightsForCardsDto {
    pub run_id: String,
    pub document_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchCreateHighlightsForCardsResultDto {
    pub created: usize,
    pub skipped: usize,
    pub unlinked: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAnnotatedPdfDto {
    pub document_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAnnotatedPdfResultDto {
    pub output_path: String,
    pub highlight_count: usize,
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
    #[serde(default = "default_card_generation_mode")]
    generation_mode: String,
    #[serde(default)]
    fallback_reason: Option<String>,
}

fn default_card_generation_mode() -> String {
    "unknown".to_string()
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
        card_type: data.card_type,
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
pub fn update_card(
    state: State<'_, AppState>,
    id: String,
    data: UpdateCardDto,
) -> CommandResult<CardDto> {
    let front = data.front.trim();
    let back = data.back.trim();

    if front.is_empty() || back.is_empty() {
        return Err(CommandError::InvalidInput(
            "Card front and back must not be empty".to_string(),
        ));
    }

    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let updated = repo
        .update_card(
            &id,
            UpdateCardRequest {
                front: front.to_string(),
                back: back.to_string(),
                card_type: data.card_type,
                tags: data.tags,
            },
        )?
        .ok_or(CommandError::NotFound)?;

    Ok(updated.into())
}

#[tauri::command]
pub fn delete_card(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let db = state.lock_db()?;
    CardRepository::new(&db).delete_card(&id)?;
    Ok(())
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
        note: data
            .note
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        page_card_index: data.page_card_index,
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
                note: data
                    .note
                    .unwrap_or(current.note.clone())
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty()),
                page_card_index: data.page_card_index.unwrap_or(current.page_card_index),
            },
        )?
        .ok_or(CommandError::NotFound)?;

    Ok(updated.into())
}

#[tauri::command]
pub fn batch_create_highlights_for_cards(
    state: State<'_, AppState>,
    data: BatchCreateHighlightsForCardsDto,
) -> CommandResult<BatchCreateHighlightsForCardsResultDto> {
    let db = state.lock_db()?;
    let result = CardRepository::new(&db)
        .create_missing_highlights_for_run(&data.run_id, &data.document_id)?;

    Ok(BatchCreateHighlightsForCardsResultDto {
        created: result.created,
        skipped: result.skipped,
        unlinked: result.unlinked,
    })
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewLogDto {
    pub id: String,
    pub card_id: String,
    pub rating: String,
    pub reviewed_at: String,
    pub state: String,
    pub difficulty: f64,
    pub stability: f64,
    pub retrievability: Option<f64>,
    pub next_review: Option<String>,
    pub interval_days: Option<i32>,
}

impl From<ReviewLog> for ReviewLogDto {
    fn from(log: ReviewLog) -> Self {
        Self {
            id: log.id,
            card_id: log.card_id,
            rating: log.rating,
            reviewed_at: log.reviewed_at,
            state: log.state,
            difficulty: log.difficulty,
            stability: log.stability,
            retrievability: log.retrievability,
            next_review: log.next_review,
            interval_days: log.interval_days,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReviewLogDto {
    pub card_id: String,
    pub rating: String,
    pub state: String,
    pub difficulty: f64,
    pub stability: f64,
    pub retrievability: Option<f64>,
    pub next_review: Option<String>,
    pub interval_days: Option<i32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyStatsDto {
    pub new_cards: i64,
    pub review_cards: i64,
    pub correct_rate: Option<f64>,
}

#[tauri::command]
pub fn create_review_log(
    state: State<'_, AppState>,
    data: CreateReviewLogDto,
) -> CommandResult<ReviewLogDto> {
    let valid_ratings = ["again", "hard", "good", "easy"];
    if !valid_ratings.contains(&data.rating.as_str()) {
        return Err(CommandError::InvalidInput(format!(
            "Invalid rating: {}. Expected one of: again, hard, good, easy",
            data.rating
        )));
    }

    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let log = repo.create_review_log(CreateReviewLogRequest {
        card_id: data.card_id,
        rating: data.rating,
        state: data.state,
        difficulty: data.difficulty,
        stability: data.stability,
        retrievability: data.retrievability,
        next_review: data.next_review,
        interval_days: data.interval_days,
    })?;
    Ok(log.into())
}

#[tauri::command]
pub fn list_review_logs(
    state: State<'_, AppState>,
    card_id: Option<String>,
    limit: Option<i64>,
) -> CommandResult<Vec<ReviewLogDto>> {
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let logs = repo.list_review_logs(card_id.as_deref(), limit)?;
    Ok(logs.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn get_daily_stats(state: State<'_, AppState>) -> CommandResult<DailyStatsDto> {
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let (new_cards, review_cards, correct_rate) = repo.get_daily_stats(&today)?;
    Ok(DailyStatsDto {
        new_cards,
        review_cards,
        correct_rate,
    })
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
    let card_type = data.card_type.unwrap_or(current.card_type.clone());
    let front = data.front.unwrap_or(current.front.clone());
    let back = data.back.unwrap_or(current.back.clone());
    let tags = data.tags.unwrap_or(current.tags.clone());
    let confidence = data.confidence.unwrap_or(current.confidence);
    let status = data.status.unwrap_or(current.status.clone());
    let score_overall = data.score_overall.unwrap_or(current.score_overall);
    let score_details = data.score_details.unwrap_or(current.score_details.clone());
    let visibility_bucket = data.visibility_bucket.unwrap_or(current.visibility_bucket.clone());
    let generation_mode = data
        .generation_mode
        .unwrap_or_else(|| current.generation_mode.clone());
    let fallback_reason = data
        .fallback_reason
        .unwrap_or(current.fallback_reason.clone());
    let evaluation_summary = data
        .evaluation_summary
        .unwrap_or(current.evaluation_summary.clone());
    let source_chunk_ids = data
        .source_chunk_ids
        .unwrap_or(current.source_chunk_ids.clone());
    validate_candidate_status(&status)?;

    let updated = repo
        .update_candidate(
            &id,
            UpdateCardCandidateRequest {
                card_type,
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
                score_overall,
                score_details,
                visibility_bucket,
                generation_mode,
                fallback_reason,
                evaluation_summary,
                source_chunk_ids,
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
            generation_mode: "model".to_string(),
            fallback_reason: None,
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
    let highlight_result = card_repo.create_missing_highlights_for_run(&run_id, &payload.document_id)?;
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
            "Created {} cards, skipped {} duplicates, linked {} highlights",
            result.created_count, result.skipped_duplicates, highlight_result.created
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
        payload.generation_mode = "model".to_string();
        payload.fallback_reason = None;
        log::info!("Python orchestration generated {generated_count} candidates for run {run_id}");
    } else {
        // Fallback to local rule-based generation
        log::warn!("Python orchestration unavailable, falling back to local rule-based generation for run {run_id}");
        payload.generation_mode = "rule_based_fallback".to_string();
        payload.fallback_reason = Some("python_orchestration_unavailable".to_string());
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
        "generationMode": payload.generation_mode,
        "fallbackReason": payload.fallback_reason,
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
    if document.status == "ready" || document.status == "parsed" {
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
                    section_id: chunk.section_id.clone(),
                    anchor_id: Some(anchor.id.clone()),
                    title: None,
                    card_type: None,
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
                    score_overall: None,
                    score_details: None,
                    visibility_bucket: Some("default".to_string()),
                    generation_mode: Some("fallback_rule".to_string()),
                    fallback_reason: Some("rule_based_anchor_generation".to_string()),
                    evaluation_summary: Some("Legacy fallback generation from anchor extraction".to_string()),
                    source_chunk_ids: Some(vec![chunk.id.clone()]),
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

// ── CSV Export ────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCardsCsvDto {
    pub output_path: String,
    pub document_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCardsCsvResultDto {
    pub card_count: usize,
    pub output_path: String,
}

#[tauri::command]
pub fn export_cards_csv(
    state: State<'_, AppState>,
    data: ExportCardsCsvDto,
) -> CommandResult<ExportCardsCsvResultDto> {
    use std::io::Write;

    let output_path = data.output_path.trim().to_string();
    if output_path.is_empty() {
        return Err(CommandError::InvalidInput("Missing output path".to_string()));
    }

    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let filters = CardFilters {
        document_id: data.document_id.as_deref(),
        anchor_id: None,
        page_number: None,
        limit: Some(10000),
    };
    let cards = repo.list_cards(filters)?;

    let mut file = std::fs::File::create(&output_path)
        .map_err(|e| CommandError::Internal(format!("Failed to create CSV file: {e}")))?;

    // UTF-8 BOM for Excel compatibility
    file.write_all(b"\xEF\xBB\xBF")
        .map_err(|e| CommandError::Internal(format!("Write error: {e}")))?;

    // Header
    writeln!(file, "front,back,tags,state,difficulty,stability,next_review,created_at")
        .map_err(|e| CommandError::Internal(format!("Write error: {e}")))?;

    let card_count = cards.len();
    for card in &cards {
        let tags = decode_card_tags(card.tags.clone()).join(";");
        writeln!(
            file,
            "{},{},{},{},{:.2},{:.2},{},{}",
            csv_escape(&card.front),
            csv_escape(&card.back),
            csv_escape(&tags),
            csv_escape(&card.state),
            card.difficulty,
            card.stability,
            csv_escape(card.next_review.as_deref().unwrap_or("")),
            csv_escape(&card.created_at),
        )
        .map_err(|e| CommandError::Internal(format!("Write error: {e}")))?;
    }

    Ok(ExportCardsCsvResultDto {
        card_count,
        output_path,
    })
}

fn csv_escape(field: &str) -> String {
    if field.contains(',') || field.contains('"') || field.contains('\n') {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.to_string()
    }
}

// ── Dialog-based CSV Export ─────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickExportCsvDto {
    pub document_id: Option<String>,
}

#[tauri::command]
pub async fn pick_and_export_csv(
    app: AppHandle,
    state: State<'_, AppState>,
    data: PickExportCsvDto,
) -> CommandResult<Option<ExportCardsCsvResultDto>> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("CSV", &["csv"])
        .set_title("导出卡片为 CSV")
        .set_file_name("xuejian-cards.csv")
        .blocking_save_file()
    else {
        return Ok(None);
    };

    let output_path = file_path
        .into_path()
        .map_err(|e| CommandError::InvalidInput(e.to_string()))?
        .to_string_lossy()
        .to_string();

    let result = export_cards_csv(state, ExportCardsCsvDto {
        output_path,
        document_id: data.document_id,
    })?;

    Ok(Some(result))
}

#[tauri::command]
pub async fn export_annotated_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    data: ExportAnnotatedPdfDto,
) -> CommandResult<Option<ExportAnnotatedPdfResultDto>> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .set_title("导出带注释的 PDF")
        .set_file_name("xuejian-annotated.pdf")
        .blocking_save_file()
    else {
        return Ok(None);
    };

    let output_path = file_path
        .into_path()
        .map_err(|e| CommandError::InvalidInput(e.to_string()))?
        .to_string_lossy()
        .to_string();

    let (document_file_path, highlight_payload) = {
        let db = state.lock_db()?;
        let document_repo = DocumentRepository::new(&db);
        let card_repo = CardRepository::new(&db);
        let document = document_repo
            .find_by_id(&data.document_id)?
            .ok_or(CommandError::NotFound)?;

        if document.file_type.to_lowercase() != "pdf" {
            return Err(CommandError::InvalidInput(
                "Only PDF documents can be exported with annotations".to_string(),
            ));
        }

        let highlights = card_repo.list_highlights(HighlightFilters {
            document_id: Some(&data.document_id),
            card_id: None,
            page_number: None,
            limit: Some(10_000),
        })?;

        (
            document.file_path,
            highlights.into_iter().map(HighlightDto::from).collect::<Vec<_>>(),
        )
    };

    let health = state
        .orchestration
        .health()
        .await
        .map_err(|e| CommandError::Internal(format!("Orchestration service unavailable: {e}")))?;

    let endpoint = health.endpoint.ok_or(CommandError::Internal(
        "No orchestration endpoint available".to_string(),
    ))?;

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| CommandError::Internal(format!("HTTP client error: {e}")))?;

    let response = client
        .post(format!("{endpoint}/exports/annotated-pdf"))
        .json(&serde_json::json!({
            "filePath": document_file_path,
            "outputPath": output_path,
            "highlights": highlight_payload,
        }))
        .send()
        .await
        .map_err(|e| CommandError::Internal(format!("Annotated PDF export request failed: {e}")))?;

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_else(|_| "<no body>".to_string());
        return Err(CommandError::Internal(format!(
            "Annotated PDF export failed: {body}"
        )));
    }

    let payload = response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| CommandError::Internal(format!("Invalid export response: {e}")))?;

    Ok(Some(ExportAnnotatedPdfResultDto {
        output_path: payload
            .get("outputPath")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
        highlight_count: payload
            .get("highlightCount")
            .and_then(|value| value.as_u64())
            .unwrap_or(0) as usize,
    }))
}

// ── Card Media Commands ────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardMediaDto {
    pub id: String,
    pub card_id: String,
    pub file_name: String,
    pub mime_type: String,
    pub file_size: Option<i64>,
    pub storage_key: String,
    pub created_at: String,
}

impl From<crate::db::CardMedia> for CardMediaDto {
    fn from(m: crate::db::CardMedia) -> Self {
        Self {
            id: m.id,
            card_id: m.card_id,
            file_name: m.file_name,
            mime_type: m.mime_type,
            file_size: m.file_size,
            storage_key: m.storage_key,
            created_at: m.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadCardMediaDto {
    pub card_id: String,
    pub file_path: String,
}

#[tauri::command]
pub async fn upload_card_media(
    app: AppHandle,
    state: State<'_, AppState>,
    data: UploadCardMediaDto,
) -> CommandResult<CardMediaDto> {
    use std::path::PathBuf;

    let source = PathBuf::from(&data.file_path);
    if !source.exists() {
        return Err(CommandError::InvalidInput(format!(
            "File does not exist: {}", data.file_path
        )));
    }

    let file_name = source
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let mime_type = match source.extension().and_then(|e| e.to_str()) {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
    .to_string();

    let file_size = std::fs::metadata(&source)
        .map(|m| m.len() as i64)
        .ok();

    let media_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|_| CommandError::Internal("Failed to resolve app local data dir".to_string()))?
        .join("card-media");
    std::fs::create_dir_all(&media_dir)
        .map_err(|e| CommandError::Internal(format!("Failed to create media dir: {e}")))?;

    let storage_key = format!("{}.{}", uuid::Uuid::new_v4(), source.extension().and_then(|e| e.to_str()).unwrap_or("bin"));
    let dest = media_dir.join(&storage_key);

    std::fs::copy(&source, &dest)
        .map_err(|e| CommandError::Internal(format!("Failed to copy media file: {e}")))?;

    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let media = repo.create_card_media(crate::db::CreateCardMediaRequest {
        card_id: data.card_id,
        file_name,
        mime_type,
        file_size,
        storage_key,
    })?;

    Ok(media.into())
}

#[tauri::command]
pub fn list_card_media(
    state: State<'_, AppState>,
    card_id: String,
) -> CommandResult<Vec<CardMediaDto>> {
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let media = repo.list_card_media(&card_id)?;
    Ok(media.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub async fn delete_card_media(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);

    if let Some(media) = repo.delete_card_media(&id)? {
        let media_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|_| CommandError::Internal("Failed to resolve app local data dir".to_string()))?
            .join("card-media");
        let file_path = media_dir.join(&media.storage_key);
        if file_path.exists() {
            let _ = std::fs::remove_file(file_path);
        }
    }

    Ok(())
}

// ── APKG Import ──────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportApkgResultDto {
    pub imported_count: usize,
    pub skipped_duplicates: usize,
    pub deck_name: String,
}

#[tauri::command]
pub async fn import_cards_apkg(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<ImportApkgResultDto> {
    let health = state.orchestration.health().await
        .map_err(|e| CommandError::Internal(format!("Orchestration service unavailable: {e}")))?;

    let endpoint = health.endpoint.ok_or(CommandError::Internal(
        "No orchestration endpoint available".to_string()
    ))?;

    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("Anki Package", &["apkg"])
        .set_title("导入 Anki 卡片包")
        .blocking_pick_file()
    else {
        return Err(CommandError::InvalidInput("No file selected".to_string()));
    };

    let path_str = file_path
        .into_path()
        .map_err(|e| CommandError::InvalidInput(e.to_string()))?
        .to_string_lossy()
        .to_string();

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| CommandError::Internal(format!("HTTP client error: {e}")))?;

    let response = client
        .post(format!("{endpoint}/imports/apkg"))
        .json(&serde_json::json!({ "filePath": path_str }))
        .send()
        .await
        .map_err(|e| CommandError::Internal(format!("Import request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Internal(format!(
            "Import failed ({status}): {body}"
        )));
    }

    let result: serde_json::Value = response.json().await
        .map_err(|e| CommandError::Internal(format!("Invalid import response: {e}")))?;

    let cards_data = result["cards"]
        .as_array()
        .ok_or(CommandError::Internal("No cards in import response".to_string()))?;

    let deck_name = result["deckName"]
        .as_str()
        .unwrap_or("Imported Deck")
        .to_string();

    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let mut imported_count = 0usize;
    let mut skipped_duplicates = 0usize;

    for card_data in cards_data {
        let front = card_data["front"].as_str().unwrap_or("").trim().to_string();
        let back = card_data["back"].as_str().unwrap_or("").trim().to_string();
        if front.is_empty() || back.is_empty() {
            continue;
        }

        let card_type = card_data["cardType"]
            .as_str()
            .unwrap_or("qa")
            .to_string();

        let tags: Option<Vec<String>> = card_data["tags"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect());

        let dedupe_key = {
            let mut hasher = Sha256::new();
            hasher.update(front.to_lowercase().as_bytes());
            hasher.update(b"::");
            hasher.update(back.to_lowercase().as_bytes());
            format!("{:x}", hasher.finalize())
        };

        let exists: bool = db.connection().query_row(
            "SELECT EXISTS(SELECT 1 FROM cards WHERE dedupe_key = ?1)",
            params![&dedupe_key],
            |row| row.get(0),
        ).unwrap_or(false);

        if exists {
            skipped_duplicates += 1;
            continue;
        }

        let created = repo.create(crate::db::CreateCardRequest {
            front,
            back,
            card_type: Some(card_type),
            document_id: None,
            anchor_id: None,
            source_page: None,
            source_paragraph: None,
            source_coordinates: None,
            tags,
        });

        if let Ok(card) = created {
            let _ = db.connection().execute(
                "UPDATE cards SET dedupe_key = ?1 WHERE id = ?2",
                params![&dedupe_key, &card.id],
            );
        }

        imported_count += 1;
    }

    Ok(ImportApkgResultDto {
        imported_count,
        skipped_duplicates,
        deck_name,
    })
}

#[tauri::command]
pub async fn pick_and_export_apkg(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<Option<serde_json::Value>> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("Anki Package", &["apkg"])
        .set_title("导出卡片为 APKG")
        .set_file_name("xuejian-export.apkg")
        .blocking_save_file()
    else {
        return Ok(None);
    };

    let output_path = file_path
        .into_path()
        .map_err(|e| CommandError::InvalidInput(e.to_string()))?
        .to_string_lossy()
        .to_string();

    let health = state.orchestration.health().await
        .map_err(|e| CommandError::Internal(format!("Orchestration service unavailable: {e}")))?;

    let endpoint = health.endpoint.ok_or(CommandError::Internal(
        "No orchestration endpoint available".to_string()
    ))?;

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| CommandError::Internal(format!("HTTP client error: {e}")))?;

    let response = client
        .post(format!("{endpoint}/exports/apkg"))
        .json(&serde_json::json!({
            "outputPath": output_path,
            "deckName": "XueJian Export",
        }))
        .send()
        .await
        .map_err(|e| CommandError::Internal(format!("Export request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Internal(format!(
            "Export failed ({status}): {body}"
        )));
    }

    let result: serde_json::Value = response.json().await
        .map_err(|e| CommandError::Internal(format!("Invalid export response: {e}")))?;

    Ok(Some(result))
}
