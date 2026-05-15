use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    time::Duration,
};

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::{
    commands::{
        background_jobs::BackgroundJobDto, settings::resolve_effective_embedding_profile, AppState,
        CommandError, CommandResult,
    },
    db::{
        rag_embeddable_chunks, rag_required_chunk_count, CreateDocumentAnchorRequest,
        CreateDocumentChunkRequest, CreateDocumentSectionRequest,
        CreateMvp0BackgroundJobRequest, CreateMvp0DocumentRequest,
        Database, DocumentAnchorRect, DocumentChunk, DocumentSection, EmbeddingProfile,
        Mvp0BackgroundJob, Mvp0BackgroundJobRepository, Mvp0CardRepository, Mvp0Document,
        Mvp0DocumentChunk, Mvp0DocumentRepository, Mvp0SourceAnchor,
        ReplaceMvp0DocumentAnalysisRequest, UpdateMvp0BackgroundJobStatusRequest, VectorRepository,
    },
};

const SUPPORTED_EXTENSIONS: &[&str] = &["pdf", "md", "txt", "docx"];
const PARSE_WORKFLOW_PATH: &str = "/workflows/document-parse";
const EMBEDDING_WORKFLOW_PATH: &str = "/workflows/document-embedding";
const DOCUMENT_PARSE_JOB_TYPE: &str = "document_parse";
const DOCUMENT_EMBEDDING_JOB_TYPE: &str = "document_embedding";
const EMBEDDING_JOB_STALE_AFTER_SECONDS: i64 = 10 * 60;
const DOCUMENT_JOB_STALE_AFTER_SECONDS: i64 = 15 * 60;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentDto {
    pub id: String,
    pub title: String,
    pub file_path: String,
    pub file_type: String,
    pub file_size: Option<i64>,
    pub page_count: Option<i32>,
    pub content_hash: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentLibraryItemDto {
    pub id: String,
    pub title: String,
    pub file_type: String,
    pub page_count: Option<i32>,
    pub status: String,
    pub updated_at: String,
    pub last_used_at: Option<String>,
    pub basic_card_count: i64,
    pub last_failure_reason: Option<String>,
}

impl From<Mvp0Document> for DocumentDto {
    fn from(doc: Mvp0Document) -> Self {
        Self {
            id: doc.id,
            title: doc.title,
            file_path: doc.file_path,
            file_type: infer_file_type(&doc.original_filename),
            file_size: Some(doc.file_size),
            page_count: doc.page_count,
            content_hash: Some(doc.file_hash),
            status: present_document_status(&doc.parse_status).to_string(),
            created_at: doc.created_at,
            updated_at: doc.updated_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocumentAnchorRectDto {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentAnchorDto {
    pub id: String,
    pub document_id: String,
    pub page: i32,
    pub paragraph: Option<i32>,
    pub text_quote: String,
    pub rects: Vec<DocumentAnchorRectDto>,
    pub hash: String,
    pub created_at: String,
}

impl From<Mvp0SourceAnchor> for DocumentAnchorDto {
    fn from(anchor: Mvp0SourceAnchor) -> Self {
        Self {
            id: anchor.id,
            document_id: anchor.document_id,
            page: anchor.page,
            paragraph: None,
            text_quote: anchor.quote.clone(),
            rects: deserialize_anchor_rects(anchor.bbox_json.as_deref()),
            hash: compute_text_hash(&anchor.quote),
            created_at: anchor.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSectionDto {
    pub id: String,
    pub document_id: String,
    pub section_index: i32,
    pub heading: Option<String>,
    pub hierarchy_path: Vec<String>,
    pub page_start: Option<i32>,
    pub page_end: Option<i32>,
    pub anchor_start_id: Option<String>,
    pub anchor_end_id: Option<String>,
    pub content: String,
    pub token_count: Option<i32>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentChunkDto {
    pub id: String,
    pub document_id: String,
    pub section_id: Option<String>,
    pub anchor_id: Option<String>,
    pub page_start: Option<i32>,
    pub page_end: Option<i32>,
    pub chunk_index: i32,
    pub chunk_kind: String,
    pub content: String,
    pub token_count: Option<i32>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: String,
}

impl From<Mvp0DocumentChunk> for DocumentChunkDto {
    fn from(chunk: Mvp0DocumentChunk) -> Self {
        Self {
            id: chunk.id,
            document_id: chunk.document_id,
            section_id: None,
            anchor_id: None,
            page_start: Some(chunk.page_start),
            page_end: Some(chunk.page_end),
            chunk_index: chunk.chunk_index,
            chunk_kind: decode_chunk_kind(&chunk.parser).to_string(),
            content: chunk.text,
            token_count: Some(chunk.char_count),
            metadata: None,
            created_at: chunk.created_at,
        }
    }
}

impl From<DocumentSection> for DocumentSectionDto {
    fn from(section: DocumentSection) -> Self {
        Self {
            id: section.id,
            document_id: section.document_id,
            section_index: section.section_index,
            heading: section.heading,
            hierarchy_path: section.hierarchy_path,
            page_start: section.page_start,
            page_end: section.page_end,
            anchor_start_id: section.anchor_start_id,
            anchor_end_id: section.anchor_end_id,
            content: section.content,
            token_count: section.token_count,
            metadata: section.metadata,
            created_at: section.created_at,
        }
    }
}

impl From<DocumentChunk> for DocumentChunkDto {
    fn from(chunk: DocumentChunk) -> Self {
        Self {
            id: chunk.id,
            document_id: chunk.document_id,
            section_id: chunk.section_id,
            anchor_id: chunk.anchor_id,
            page_start: chunk.page_start,
            page_end: chunk.page_end,
            chunk_index: chunk.chunk_index,
            chunk_kind: chunk.chunk_kind,
            content: chunk.content,
            token_count: chunk.token_count,
            metadata: chunk.metadata,
            created_at: chunk.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentDto {
    pub title: String,
    pub file_path: String,
    pub file_type: String,
    pub file_size: Option<i64>,
    pub page_count: Option<i32>,
    pub content_hash: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDocumentAnchorDto {
    pub id: Option<String>,
    pub page: i32,
    pub paragraph: Option<i32>,
    pub text_quote: String,
    pub rects: Vec<DocumentAnchorRectDto>,
    pub hash: String,
    pub hierarchy_path: Option<Vec<String>>,
    pub quote_hash: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDocumentSectionDto {
    pub id: Option<String>,
    pub section_index: i32,
    pub heading: Option<String>,
    pub hierarchy_path: Option<Vec<String>>,
    pub page_start: Option<i32>,
    pub page_end: Option<i32>,
    pub anchor_start_id: Option<String>,
    pub anchor_end_id: Option<String>,
    pub content: String,
    pub token_count: Option<i32>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDocumentChunkDto {
    pub id: Option<String>,
    pub section_id: Option<String>,
    pub anchor_id: Option<String>,
    pub page_start: Option<i32>,
    pub page_end: Option<i32>,
    pub chunk_index: i32,
    pub chunk_kind: Option<String>,
    pub content: String,
    pub token_count: Option<i32>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDocumentAnalysisDto {
    pub page_count: i32,
    #[serde(default)]
    pub chunking_profile: Option<serde_json::Value>,
    #[serde(default)]
    pub anchors: Vec<SaveDocumentAnchorDto>,
    #[serde(default)]
    pub sections: Vec<SaveDocumentSectionDto>,
    #[serde(default)]
    pub chunks: Vec<SaveDocumentChunkDto>,
}

#[tauri::command]
pub fn list_documents(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> CommandResult<Vec<DocumentDto>> {
    let repaired = repair_stuck_document_jobs(&state)?;
    if repaired > 0 {
        log::info!("background_jobs.repair.completed scope=documents count={repaired}");
    }
    let db = state.lock_db()?;
    let repo = Mvp0DocumentRepository::new(db.connection());
    let mut documents = repo.list_documents(false)?;
    if let Some(limit) = limit {
        documents.truncate(limit.max(0) as usize);
    }
    Ok(documents.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn list_library_documents(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> CommandResult<Vec<DocumentLibraryItemDto>> {
    let repaired = repair_stuck_document_jobs(&state)?;
    if repaired > 0 {
        log::info!("background_jobs.repair.completed scope=library_documents count={repaired}");
    }
    let db = state.lock_db()?;
    let repo = Mvp0DocumentRepository::new(db.connection());
    let mut documents = repo.list_documents(false)?;
    if let Some(limit) = limit {
        documents.truncate(limit.max(0) as usize);
    }

    documents
        .into_iter()
        .map(|document| build_library_item(db.connection(), document))
        .collect()
}

#[tauri::command]
pub fn get_document(state: State<'_, AppState>, id: String) -> CommandResult<Option<DocumentDto>> {
    let repaired = repair_stuck_document_jobs(&state)?;
    if repaired > 0 {
        log::info!("background_jobs.repair.completed scope=documents count={repaired}");
    }
    let db = state.lock_db()?;
    let repo = Mvp0DocumentRepository::new(db.connection());
    let document = repo.find_document_by_id(&id)?;
    Ok(document.map(Into::into))
}

fn build_library_item(
    conn: &Connection,
    document: Mvp0Document,
) -> CommandResult<DocumentLibraryItemDto> {
    let basic_card_count: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM cards
         WHERE source_document_id = ?1 AND deleted_at IS NULL",
        [&document.id],
        |row| row.get(0),
    )?;

    let last_card_update: Option<String> = conn
        .query_row(
            "SELECT MAX(updated_at)
             FROM cards
             WHERE source_document_id = ?1 AND deleted_at IS NULL",
            [&document.id],
            |row| row.get(0),
        )
        .optional()?
        .flatten();

    let last_failure_reason: Option<String> = conn
        .query_row(
            "SELECT COALESCE(error_message, progress_message)
             FROM background_jobs
             WHERE target_type = 'document'
               AND target_id = ?1
               AND status = 'failed'
             ORDER BY created_at DESC
             LIMIT 1",
            [&document.id],
            |row| row.get(0),
        )
        .optional()?
        .flatten();

    Ok(DocumentLibraryItemDto {
        id: document.id,
        title: document.title,
        file_type: infer_file_type(&document.original_filename),
        page_count: document.page_count,
        status: present_document_status(&document.parse_status).to_string(),
        updated_at: document.updated_at.clone(),
        last_used_at: last_card_update.or(Some(document.updated_at)),
        basic_card_count,
        last_failure_reason,
    })
}

#[tauri::command]
pub fn create_document(
    state: State<'_, AppState>,
    data: CreateDocumentDto,
) -> CommandResult<DocumentDto> {
    let file_hash = match data.content_hash {
        Some(file_hash) => file_hash,
        None => compute_file_hash(Path::new(&data.file_path))?,
    };
    let file_size = match data.file_size {
        Some(file_size) => file_size,
        None => std::fs::metadata(&data.file_path)
            .map_err(|error| {
                CommandError::Internal(format!("Failed to read file metadata: {error}"))
            })?
            .len() as i64,
    };
    let original_filename = Path::new(&data.file_path)
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .ok_or_else(|| CommandError::InvalidInput("Invalid file name".to_string()))?;

    let db = state.lock_db()?;
    let repo = Mvp0DocumentRepository::new(db.connection());
    let document = repo.create_document(CreateMvp0DocumentRequest {
        title: data.title,
        original_filename,
        file_path: data.file_path,
        file_hash,
        file_size,
        page_count: data.page_count,
        parse_status: Some("pending".to_string()),
    })?;
    Ok(document.into())
}

#[tauri::command]
pub async fn pick_and_import_pdf_document(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<Option<DocumentDto>> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .set_title("Select a PDF document")
        .blocking_pick_file()
    else {
        return Ok(None);
    };

    let source_path = file_path
        .into_path()
        .map_err(|error| CommandError::InvalidInput(error.to_string()))?;

    let document = import_document_from_source(&app, &state, &source_path)?;
    Ok(Some(document))
}

#[tauri::command]
pub async fn pick_and_import_document(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<Option<DocumentDto>> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("Supported documents", &["pdf", "md", "txt", "docx"])
        .set_title("Select a document")
        .blocking_pick_file()
    else {
        return Ok(None);
    };

    let source_path = file_path
        .into_path()
        .map_err(|error| CommandError::InvalidInput(error.to_string()))?;

    let document = import_document_from_source(&app, &state, &source_path)?;
    Ok(Some(document))
}

#[tauri::command]
pub fn import_document_from_path(
    app: AppHandle,
    state: State<'_, AppState>,
    file_path: String,
) -> CommandResult<DocumentDto> {
    import_document_from_source(&app, &state, Path::new(&file_path))
}

#[tauri::command]
pub async fn run_document_parse_workflow(
    app: AppHandle,
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<DocumentDto> {
    run_document_orchestration_workflow(&app, &state, &document_id, PARSE_WORKFLOW_PATH).await
}

#[tauri::command]
pub async fn run_document_embedding_workflow(
    app: AppHandle,
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<DocumentDto> {
    run_document_orchestration_workflow(&app, &state, &document_id, EMBEDDING_WORKFLOW_PATH).await
}

#[tauri::command]
pub fn start_document_embedding_job(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<BackgroundJobDto> {
    let job = prepare_document_embedding_job(&state, &document_id)?;
    if matches!(job.status.as_str(), "queued" | "running") {
        spawn_document_embedding_worker(app_handle, job.id.clone());
    }
    Ok(job.into())
}

#[tauri::command]
pub fn update_document_status(
    state: State<'_, AppState>,
    id: String,
    status: String,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let repo = Mvp0DocumentRepository::new(db.connection());
    repo.update_parse_status(&id, normalize_persisted_parse_status(&status))?;
    Ok(())
}

#[tauri::command]
pub fn save_document_analysis(
    state: State<'_, AppState>,
    id: String,
    data: SaveDocumentAnalysisDto,
) -> CommandResult<DocumentDto> {
    let db = state.lock_db()?;
    let repo = Mvp0DocumentRepository::new(db.connection());

    let chunks = data
        .chunks
        .into_iter()
        .map(|chunk| CreateDocumentChunkRequest {
            id: chunk.id,
            section_id: chunk.section_id,
            anchor_id: chunk.anchor_id,
            page_start: chunk.page_start,
            page_end: chunk.page_end,
            chunk_index: chunk.chunk_index,
            chunk_kind: chunk.chunk_kind,
            content: chunk.content,
            token_count: chunk.token_count,
            metadata: chunk.metadata,
        })
        .collect::<Vec<_>>();
    let anchors = data
        .anchors
        .into_iter()
        .map(|anchor| {
            Ok(CreateDocumentAnchorRequest {
                id: anchor.id,
                page: anchor.page,
                paragraph: anchor.paragraph,
                text_quote: anchor.text_quote,
                rects: anchor
                    .rects
                    .into_iter()
                    .map(|rect| DocumentAnchorRect {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                    })
                    .collect(),
                hash: anchor.hash,
                hierarchy_path: anchor.hierarchy_path,
                quote_hash: anchor.quote_hash,
            })
        })
        .collect::<CommandResult<Vec<_>>>()?;
    let sections = data
        .sections
        .into_iter()
        .map(|section| CreateDocumentSectionRequest {
            id: section.id,
            section_index: section.section_index,
            heading: section.heading,
            hierarchy_path: section.hierarchy_path,
            page_start: section.page_start,
            page_end: section.page_end,
            anchor_start_id: section.anchor_start_id,
            anchor_end_id: section.anchor_end_id,
            content: section.content,
            token_count: section.token_count,
            metadata: section.metadata,
        })
        .collect::<Vec<_>>();

    repo.replace_analysis(
        &id,
        ReplaceMvp0DocumentAnalysisRequest {
            page_count: data.page_count,
            chunking_profile: data.chunking_profile,
            anchors,
            sections,
            chunks,
        },
    )?;

    let document = repo
        .find_document_by_id(&id)?
        .ok_or(CommandError::NotFound)?;
    Ok(document.into())
}

#[tauri::command]
pub fn list_document_anchors(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<Vec<DocumentAnchorDto>> {
    let db = state.lock_db()?;
    let repo = Mvp0DocumentRepository::new(db.connection());
    let anchors = repo.list_source_anchors(&document_id)?;
    Ok(anchors.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn list_document_sections(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<Vec<DocumentSectionDto>> {
    let db = state.lock_db()?;
    let repo = Mvp0DocumentRepository::new(db.connection());
    let sections = repo.list_sections(&document_id)?;
    Ok(sections.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn list_document_chunks(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<Vec<DocumentChunkDto>> {
    let db = state.lock_db()?;
    let repo = Mvp0DocumentRepository::new(db.connection());
    let chunks = repo.list_structured_chunks(&document_id)?;
    Ok(chunks.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn read_document_binary(state: State<'_, AppState>, id: String) -> CommandResult<Vec<u8>> {
    let file_path = {
        let db = state.lock_db()?;
        let repo = Mvp0DocumentRepository::new(db.connection());
        repo.find_document_by_id(&id)?
            .ok_or(CommandError::NotFound)?
            .file_path
    };

    std::fs::read(&file_path)
        .map_err(|error| CommandError::Internal(format!("Failed to read document binary: {error}")))
}

#[tauri::command]
pub fn delete_document(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let db = state.lock_db()?;
    delete_document_inner(db.connection(), &id)
}

fn delete_document_inner(conn: &Connection, id: &str) -> CommandResult<()> {
    let repo = Mvp0DocumentRepository::new(conn);
    if !repo.soft_delete_document(id)? {
        return Err(CommandError::NotFound);
    }
    Mvp0CardRepository::new(conn).soft_delete_cards_by_source_document_id(id)?;
    Ok(())
}

fn import_document_from_source(
    app: &AppHandle,
    state: &State<'_, AppState>,
    source_path: &Path,
) -> CommandResult<DocumentDto> {
    validate_document_source(source_path)?;

    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let metadata = std::fs::metadata(source_path).map_err(|error| {
        CommandError::Internal(format!("Failed to read file metadata: {error}"))
    })?;
    let file_size = metadata.len() as i64;
    let file_hash = compute_file_hash(source_path)?;
    let target_path = prepare_document_target_path(app, source_path, &file_hash, &extension)?;

    let db = state.lock_db()?;
    let repo = Mvp0DocumentRepository::new(db.connection());
    if let Some(existing) = repo.find_document_by_hash(&file_hash)? {
        return Ok(existing.into());
    }

    if target_path != source_path && !target_path.exists() {
        std::fs::copy(source_path, &target_path).map_err(|error| {
            CommandError::Internal(format!(
                "Failed to copy document into application storage: {error}"
            ))
        })?;
    }

    let original_filename = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .ok_or_else(|| CommandError::InvalidInput("Invalid file name".to_string()))?;
    let title = original_filename.clone();

    let document = match repo.create_document(CreateMvp0DocumentRequest {
        title,
        original_filename,
        file_path: target_path.to_string_lossy().to_string(),
        file_hash: file_hash.clone(),
        file_size,
        page_count: None,
        parse_status: Some("pending".to_string()),
    }) {
        Ok(document) => document,
        Err(error) => {
            if target_path.exists() && target_path != source_path {
                let _ = std::fs::remove_file(&target_path);
            }
            return Err(error.into());
        }
    };

    let job_repo = Mvp0BackgroundJobRepository::new(db.connection());
    if let Err(error) = create_document_parse_job(&job_repo, &document, None) {
        let _ = db
            .connection()
            .execute("DELETE FROM documents WHERE id = ?1", params![&document.id]);
        if target_path.exists() && target_path != source_path {
            let _ = std::fs::remove_file(&target_path);
        }
        return Err(error);
    }

    Ok(document.into())
}

fn validate_document_source(source_path: &Path) -> CommandResult<()> {
    if !source_path.exists() {
        return Err(CommandError::InvalidInput(format!(
            "File does not exist: {}",
            source_path.display()
        )));
    }

    if !source_path.is_file() {
        return Err(CommandError::InvalidInput(format!(
            "Selected path is not a file: {}",
            source_path.display()
        )));
    }

    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if !SUPPORTED_EXTENSIONS.contains(&extension.as_str()) {
        return Err(CommandError::InvalidInput(format!(
            "Unsupported file format: .{extension}. Supported: {}",
            SUPPORTED_EXTENSIONS.join(", ")
        )));
    }

    Ok(())
}

async fn run_document_orchestration_workflow(
    app: &AppHandle,
    state: &State<'_, AppState>,
    document_id: &str,
    workflow_path: &str,
) -> CommandResult<DocumentDto> {
    let parse_job_id = {
        let db = state.lock_db()?;
        let repo = Mvp0DocumentRepository::new(db.connection());
        let document = repo
            .find_document_by_id(document_id)?
            .ok_or(CommandError::NotFound)?;

        if workflow_path == PARSE_WORKFLOW_PATH && should_skip_document_parse(&document, &repo)? {
            return Ok(document.into());
        }

        if workflow_path == PARSE_WORKFLOW_PATH {
            let job_repo = Mvp0BackgroundJobRepository::new(db.connection());
            Some(prepare_document_parse_job(&job_repo, &document)?)
        } else {
            None
        }
    };

    if let Some(job_id) = &parse_job_id {
        update_parse_job_progress(state, job_id, 1, "Parsing document")?;
    }

    let request_result =
        execute_orchestration_request(state, workflow_path, document_id, parse_job_id.as_deref())
            .await;

    match request_result {
        Ok(payload) => {
            if let Some(job_id) = &parse_job_id {
                update_parse_job_progress(state, job_id, 2, "Saving parsed document")?;
                mark_parse_job_succeeded(state, job_id, &payload)?;
            }

            let db = state.lock_db()?;
            let repo = Mvp0DocumentRepository::new(db.connection());
            let document = repo
                .find_document_by_id(document_id)?
                .ok_or(CommandError::NotFound)?;
            let _ = app;
            Ok(document.into())
        }
        Err(error) => {
            if let Some(job_id) = &parse_job_id {
                mark_parse_job_failed(state, document_id, job_id, &error.to_string())?;
            }
            Err(error)
        }
    }
}

async fn execute_orchestration_request(
    state: &State<'_, AppState>,
    workflow_path: &str,
    document_id: &str,
    run_id: Option<&str>,
) -> CommandResult<serde_json::Value> {
    let health = state.orchestration.health().await.map_err(|error| {
        CommandError::Internal(format!("Orchestration health check failed: {error}"))
    })?;

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

    let mut request_body = json!({
        "documentId": document_id,
    });
    if let Some(run_id) = run_id {
        request_body["runId"] = json!(run_id);
    }

    let response = client
        .post(format!("{endpoint}{workflow_path}"))
        .json(&request_body)
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

    let payload: serde_json::Value = response
        .json()
        .await
        .map_err(|error| CommandError::Internal(error.to_string()))?;
    if payload["status"].as_str() == Some("failed") {
        return Err(CommandError::Internal(
            payload["error"]
                .as_str()
                .unwrap_or("Unknown orchestration failure")
                .to_string(),
        ));
    }

    Ok(payload)
}

fn prepare_document_target_path(
    app: &AppHandle,
    source_path: &Path,
    content_hash: &str,
    extension: &str,
) -> CommandResult<PathBuf> {
    let documents_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| CommandError::Internal("Failed to resolve app data directory".to_string()))?
        .join("documents");

    std::fs::create_dir_all(&documents_dir).map_err(|error| {
        CommandError::Internal(format!(
            "Failed to create application documents directory: {error}"
        ))
    })?;

    let stem = source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("document");
    let sanitized_stem = sanitize_file_stem(stem);
    let hash_prefix: String = content_hash.chars().take(12).collect();
    let file_name = format!("{hash_prefix}-{sanitized_stem}.{extension}");

    Ok(documents_dir.join(file_name))
}

fn sanitize_file_stem(file_stem: &str) -> String {
    let mut sanitized = String::with_capacity(file_stem.len());

    for character in file_stem.chars() {
        if character.is_alphanumeric() {
            sanitized.push(character);
        } else if !sanitized.ends_with('-') {
            sanitized.push('-');
        }
    }

    let trimmed = sanitized.trim_matches('-');
    let truncated: String = trimmed.chars().take(48).collect();

    if truncated.is_empty() {
        "document".to_string()
    } else {
        truncated
    }
}

fn compute_file_hash(source_path: &Path) -> CommandResult<String> {
    let mut file = File::open(source_path).map_err(|error| {
        CommandError::Internal(format!("Failed to open file for hashing: {error}"))
    })?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 16 * 1024];

    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|error| CommandError::Internal(format!("Failed to hash file: {error}")))?;

        if bytes_read == 0 {
            break;
        }

        hasher.update(&buffer[..bytes_read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn compute_text_hash(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.trim().as_bytes());
    format!("{:x}", hasher.finalize())
}

fn infer_file_type(file_name: &str) -> String {
    Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .filter(|value| SUPPORTED_EXTENSIONS.contains(&value.as_str()))
        .unwrap_or_else(|| "pdf".to_string())
}

fn present_document_status(parse_status: &str) -> &str {
    match parse_status {
        "pending" | "parsing" => "uploading",
        "parsed" | "embedding" | "ready" | "embedding_failed" | "embedding_stale" => parse_status,
        "deleted" => "deleted",
        "failed" | "unsupported" => "error",
        _ => "uploading",
    }
}

fn normalize_persisted_parse_status(status: &str) -> &str {
    match status {
        "parsed" | "ready" | "embedding" | "embedding_failed" | "embedding_stale" => status,
        "failed" | "error" => "failed",
        "unsupported" => "unsupported",
        _ => "pending",
    }
}

fn deserialize_anchor_rects(bbox_json: Option<&str>) -> Vec<DocumentAnchorRectDto> {
    bbox_json
        .and_then(|value| serde_json::from_str::<Vec<DocumentAnchorRectDto>>(value).ok())
        .unwrap_or_default()
}

fn decode_chunk_kind(parser: &str) -> &str {
    parser
        .split("::")
        .nth(1)
        .filter(|value| !value.is_empty())
        .unwrap_or("semantic")
}

fn should_skip_document_parse(
    document: &Mvp0Document,
    repo: &Mvp0DocumentRepository<'_>,
) -> CommandResult<bool> {
    let has_parsed_content = !repo.list_chunks(&document.id)?.is_empty();
    let finished_status = matches!(
        document.parse_status.as_str(),
        "parsed" | "embedding" | "ready" | "embedding_failed" | "embedding_stale"
    );

    Ok(has_parsed_content && finished_status)
}

fn prepare_document_embedding_job(
    state: &State<'_, AppState>,
    document_id: &str,
) -> CommandResult<Mvp0BackgroundJob> {
    let profile = resolve_effective_embedding_profile(state)?.ok_or_else(|| {
        CommandError::InvalidInput(
            "No enabled document embedding workflow assignment with a stored API key was found"
                .to_string(),
        )
    })?;

    let db = state.lock_db()?;
    let document_repo = Mvp0DocumentRepository::new(db.connection());
    let job_repo = Mvp0BackgroundJobRepository::new(db.connection());
    let vector_repo = VectorRepository::new(&db);
    let document = document_repo
        .find_document_by_id(document_id)?
        .ok_or(CommandError::NotFound)?;

    if document.deleted_at.is_some() {
        return Err(CommandError::NotFound);
    }
    if !matches!(
        document.parse_status.as_str(),
        "parsed" | "ready" | "embedding_failed" | "embedding_stale"
    ) {
        return Err(CommandError::InvalidInput(
            "Document must be parsed before embedding generation".to_string(),
        ));
    }

    let chunks = rag_embeddable_chunks(document_repo.list_chunks(&document.id)?);
    if chunks.is_empty() {
        return Err(CommandError::InvalidInput(
            "No parsed document chunks are available for embedding".to_string(),
        ));
    }

    let progress_total = chunks.len() as i32;
    let embedded_count = vector_repo.count_document_embeddings(&document.id, &profile.id)?;
    let latest_job = job_repo.find_latest_by_target(
        "document",
        &document.id,
        Some(DOCUMENT_EMBEDDING_JOB_TYPE),
    )?;

    if embedded_count >= i64::from(progress_total) {
        document_repo.update_parse_status(&document.id, "ready")?;
        return complete_existing_embedding_job(
            &job_repo,
            latest_job,
            &document,
            &profile,
            embedded_count,
            progress_total,
        );
    }

    if let Some(latest_job) = latest_job {
        if latest_job.status == "running" {
            return Ok(latest_job);
        }
        if latest_job.status == "queued" {
            return Ok(latest_job);
        }
    }

    job_repo
        .create_job(CreateMvp0BackgroundJobRequest {
            job_type: DOCUMENT_EMBEDDING_JOB_TYPE.to_string(),
            target_type: "document".to_string(),
            target_id: document.id.clone(),
            payload_json: json!({
                "documentId": document.id,
                "profileId": profile.id,
                "profileModel": profile.model,
                "chunkCount": progress_total,
            })
            .to_string(),
            progress_total: Some(progress_total),
        })
        .map_err(Into::into)
}

fn create_document_embedding_job(
    job_repo: &Mvp0BackgroundJobRepository<'_>,
    document: &Mvp0Document,
    profile: &EmbeddingProfile,
    progress_total: i32,
) -> CommandResult<Mvp0BackgroundJob> {
    job_repo
        .create_job(CreateMvp0BackgroundJobRequest {
            job_type: DOCUMENT_EMBEDDING_JOB_TYPE.to_string(),
            target_type: "document".to_string(),
            target_id: document.id.clone(),
            payload_json: json!({
                "documentId": document.id,
                "profileId": profile.id,
                "profileModel": profile.model,
                "chunkCount": progress_total,
            })
            .to_string(),
            progress_total: Some(progress_total),
        })
        .map_err(Into::into)
}

fn complete_existing_embedding_job(
    job_repo: &Mvp0BackgroundJobRepository<'_>,
    latest_job: Option<Mvp0BackgroundJob>,
    document: &Mvp0Document,
    profile: &EmbeddingProfile,
    embedded_count: i64,
    progress_total: i32,
) -> CommandResult<Mvp0BackgroundJob> {
    let mut job = match latest_job {
        Some(job) if matches!(job.status.as_str(), "queued" | "running" | "succeeded") => job,
        _ => create_document_embedding_job(job_repo, document, profile, progress_total)?,
    };

    if job.status == "succeeded" {
        return Ok(job);
    }

    if job.status == "queued" {
        job = job_repo.update_status(
            &job.id,
            UpdateMvp0BackgroundJobStatusRequest {
                status: "running".to_string(),
                result_json: None,
                error_message: None,
                error_details: None,
                progress_current: Some(0),
                progress_total: Some(progress_total),
                progress_message: Some("Document embeddings already exist".to_string()),
            },
        )?;
    }

    Ok(job_repo.update_status(
        &job.id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "succeeded".to_string(),
            result_json: Some(
                json!({
                    "status": "completed",
                    "profileId": profile.id,
                    "profileModel": profile.model,
                    "embeddedChunkCount": embedded_count,
                    "sourceChunkCount": progress_total,
                    "repaired": true,
                })
                .to_string(),
            ),
            error_message: None,
            error_details: None,
            progress_current: Some(progress_total),
            progress_total: Some(progress_total),
            progress_message: Some(
                "Document embeddings already exist; status repaired".to_string(),
            ),
        },
    )?)
}

pub(crate) fn repair_stuck_document_jobs_for_db(db: &Database) -> CommandResult<usize> {
    let document_repo = Mvp0DocumentRepository::new(db.connection());
    let job_repo = Mvp0BackgroundJobRepository::new(db.connection());
    let vector_repo = VectorRepository::new(db);

    let mut repaired = repair_stuck_document_parse_jobs(&document_repo, &job_repo)?;
    repaired += repair_stuck_document_embedding_jobs_with_counter(
        &document_repo,
        &job_repo,
        |document_id, profile_id| {
            vector_repo
                .count_document_embeddings(document_id, profile_id)
                .map_err(Into::into)
        },
    )?;
    repaired += repair_stale_document_embedding_statuses(&document_repo, &vector_repo)?;
    Ok(repaired)
}

fn repair_stuck_document_jobs(state: &State<'_, AppState>) -> CommandResult<usize> {
    let db = state.lock_db()?;
    repair_stuck_document_jobs_for_db(&db)
}

fn repair_stuck_document_parse_jobs(
    document_repo: &Mvp0DocumentRepository<'_>,
    job_repo: &Mvp0BackgroundJobRepository<'_>,
) -> CommandResult<usize> {
    let mut repaired = 0usize;
    for document in document_repo
        .list_documents(false)?
        .into_iter()
        .filter(|document| matches!(document.parse_status.as_str(), "pending" | "parsing"))
    {
        let latest_job = job_repo.find_latest_by_target(
            "document",
            &document.id,
            Some(DOCUMENT_PARSE_JOB_TYPE),
        )?;

        match latest_job {
            Some(job) if matches!(job.status.as_str(), "succeeded") => {
                if !document_repo.list_chunks(&document.id)?.is_empty() {
                    document_repo.update_parse_status(&document.id, "parsed")?;
                    repaired += 1;
                }
            }
            Some(job) if matches!(job.status.as_str(), "failed" | "cancelled") => {
                document_repo.update_parse_status(&document.id, "failed")?;
                repaired += 1;
            }
            Some(job)
                if matches!(job.status.as_str(), "queued" | "running")
                    && document_job_is_stale(&job) =>
            {
                let job = if job.status == "queued" {
                    job_repo.update_status(
                        &job.id,
                        UpdateMvp0BackgroundJobStatusRequest {
                            status: "running".to_string(),
                            result_json: None,
                            error_message: None,
                            error_details: None,
                            progress_current: job.progress_current.or(Some(0)),
                            progress_total: job.progress_total,
                            progress_message: Some(
                                "Recovering stale queued document parse job".to_string(),
                            ),
                        },
                    )?
                } else {
                    job
                };

                let next_status = if job.cancel_requested_at.is_some() {
                    "cancelled"
                } else {
                    "failed"
                };
                document_repo.update_parse_status(&document.id, "failed")?;
                job_repo.update_status(
                    &job.id,
                    UpdateMvp0BackgroundJobStatusRequest {
                        status: next_status.to_string(),
                        result_json: job.result_json.clone(),
                        error_message: Some(
                            "Document parse job timed out before completion".to_string(),
                        ),
                        error_details: Some(
                            "Recovered stale document parse job during repair".to_string(),
                        ),
                        progress_current: job.progress_current,
                        progress_total: job.progress_total,
                        progress_message: Some(
                            "Document parse timed out; retry is available".to_string(),
                        ),
                    },
                )?;
                repaired += 1;
            }
            None if document_is_stale(&document) => {
                document_repo.update_parse_status(&document.id, "failed")?;
                repaired += 1;
            }
            _ => {}
        }
    }

    Ok(repaired)
}

fn repair_stale_document_embedding_statuses(
    document_repo: &Mvp0DocumentRepository<'_>,
    vector_repo: &VectorRepository<'_>,
) -> CommandResult<usize> {
    let profile_id = vector_repo
        .get_active_embedding_profile()?
        .map(|profile| profile.id);

    repair_stale_document_embedding_statuses_with_counter(
        document_repo,
        profile_id.as_deref(),
        |document_id, profile_id| {
            vector_repo
                .count_document_embeddings(document_id, profile_id)
                .map_err(Into::into)
        },
    )
}

fn repair_stale_document_embedding_statuses_with_counter(
    document_repo: &Mvp0DocumentRepository<'_>,
    active_profile_id: Option<&str>,
    mut count_document_embeddings: impl FnMut(&str, &str) -> CommandResult<i64>,
) -> CommandResult<usize> {
    let Some(profile_id) = active_profile_id else {
        return Ok(0);
    };
    let mut repaired = 0usize;
    for document in document_repo
        .list_documents(false)?
        .into_iter()
        .filter(|document| document.parse_status == "embedding_stale")
    {
        let required_count = rag_required_chunk_count(document_repo.list_chunks(&document.id)?);
        if required_count == 0 {
            continue;
        }

        let embedded_count = count_document_embeddings(&document.id, profile_id)?;
        if embedded_count >= required_count as i64 {
            document_repo.update_parse_status(&document.id, "ready")?;
            repaired += 1;
        }
    }

    Ok(repaired)
}

fn repair_stuck_document_embedding_jobs_with_counter(
    document_repo: &Mvp0DocumentRepository<'_>,
    job_repo: &Mvp0BackgroundJobRepository<'_>,
    mut count_document_embeddings: impl FnMut(&str, &str) -> CommandResult<i64>,
) -> CommandResult<usize> {
    let documents = document_repo.list_documents(false)?;
    let mut repaired = 0usize;

    for document in documents.into_iter().filter(|document| {
        matches!(
            document.parse_status.as_str(),
            "parsed" | "embedding" | "ready" | "embedding_failed" | "embedding_stale"
        )
    }) {
        let Some(job) = job_repo.find_latest_by_target(
            "document",
            &document.id,
            Some(DOCUMENT_EMBEDDING_JOB_TYPE),
        )?
        else {
            continue;
        };

        if !matches!(job.status.as_str(), "queued" | "running") {
            continue;
        }

        let progress_total = job
            .progress_total
            .or_else(|| embedding_job_chunk_count(&job.payload_json));
        let profile_id = embedding_job_profile_id(&job.payload_json);

        if let (Some(profile_id), Some(progress_total)) = (profile_id.as_deref(), progress_total) {
            let embedded_count = count_document_embeddings(&document.id, profile_id)?;
            if progress_total > 0 && embedded_count >= i64::from(progress_total) {
                complete_repaired_embedding_job(
                    &job_repo,
                    &document_repo,
                    job,
                    embedded_count,
                    progress_total,
                )?;
                repaired += 1;
                continue;
            }
        }

        if embedding_job_is_stale(&job) {
            let job = if job.status == "queued" {
                job_repo.update_status(
                    &job.id,
                    UpdateMvp0BackgroundJobStatusRequest {
                        status: "running".to_string(),
                        result_json: None,
                        error_message: None,
                        error_details: None,
                        progress_current: job.progress_current.or(Some(0)),
                        progress_total: job.progress_total,
                        progress_message: Some(
                            "Recovering stale queued document embedding job".to_string(),
                        ),
                    },
                )?
            } else {
                job
            };

            let next_status = if job.cancel_requested_at.is_some() {
                "cancelled"
            } else {
                "failed"
            };
            document_repo.update_parse_status(&document.id, "embedding_failed")?;
            job_repo.update_status(
                &job.id,
                UpdateMvp0BackgroundJobStatusRequest {
                    status: next_status.to_string(),
                    result_json: None,
                    error_message: Some(
                        "Document embedding job timed out before completion".to_string(),
                    ),
                    error_details: Some(
                        "Recovered stale running job during document list refresh".to_string(),
                    ),
                    progress_current: job.progress_current,
                    progress_total: job.progress_total,
                    progress_message: Some(
                        "Document embedding timed out; retry is available".to_string(),
                    ),
                },
            )?;
            repaired += 1;
        }
    }

    Ok(repaired)
}

fn complete_repaired_embedding_job(
    job_repo: &Mvp0BackgroundJobRepository<'_>,
    document_repo: &Mvp0DocumentRepository<'_>,
    mut job: Mvp0BackgroundJob,
    embedded_count: i64,
    progress_total: i32,
) -> CommandResult<()> {
    if job.status == "queued" {
        job = job_repo.update_status(
            &job.id,
            UpdateMvp0BackgroundJobStatusRequest {
                status: "running".to_string(),
                result_json: None,
                error_message: None,
                error_details: None,
                progress_current: job.progress_current.or(Some(0)),
                progress_total: Some(progress_total),
                progress_message: Some("Recovering completed document embeddings".to_string()),
            },
        )?;
    }

    job_repo.update_status(
        &job.id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "succeeded".to_string(),
            result_json: Some(
                json!({
                    "status": "completed",
                    "embeddedChunkCount": embedded_count,
                    "sourceChunkCount": progress_total,
                    "repaired": true,
                })
                .to_string(),
            ),
            error_message: None,
            error_details: None,
            progress_current: Some(progress_total),
            progress_total: Some(progress_total),
            progress_message: Some("Document embeddings generated; status repaired".to_string()),
        },
    )?;
    document_repo.update_parse_status(&job.target_id, "ready")?;
    Ok(())
}

fn embedding_job_profile_id(payload_json: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(payload_json)
        .ok()?
        .get("profileId")?
        .as_str()
        .map(str::to_string)
}

fn embedding_job_chunk_count(payload_json: &str) -> Option<i32> {
    serde_json::from_str::<serde_json::Value>(payload_json)
        .ok()?
        .get("chunkCount")?
        .as_i64()
        .and_then(|value| i32::try_from(value).ok())
}

fn embedding_job_is_stale(job: &Mvp0BackgroundJob) -> bool {
    if job.cancel_requested_at.is_some() {
        return true;
    }
    let started_at = job.started_at.as_deref().unwrap_or(job.created_at.as_str());
    let Ok(started_at) = DateTime::parse_from_rfc3339(started_at) else {
        return false;
    };
    Utc::now()
        .signed_duration_since(started_at.with_timezone(&Utc))
        .num_seconds()
        >= EMBEDDING_JOB_STALE_AFTER_SECONDS
}

fn document_job_is_stale(job: &Mvp0BackgroundJob) -> bool {
    if job.cancel_requested_at.is_some() {
        return true;
    }
    let started_at = job.started_at.as_deref().unwrap_or(job.created_at.as_str());
    let Ok(started_at) = DateTime::parse_from_rfc3339(started_at) else {
        return false;
    };
    Utc::now()
        .signed_duration_since(started_at.with_timezone(&Utc))
        .num_seconds()
        >= DOCUMENT_JOB_STALE_AFTER_SECONDS
}

fn document_is_stale(document: &Mvp0Document) -> bool {
    let Ok(updated_at) = DateTime::parse_from_rfc3339(&document.updated_at) else {
        return false;
    };
    Utc::now()
        .signed_duration_since(updated_at.with_timezone(&Utc))
        .num_seconds()
        >= DOCUMENT_JOB_STALE_AFTER_SECONDS
}

fn spawn_document_embedding_worker(app_handle: AppHandle, job_id: String) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_document_embedding_job(&app_handle, &job_id).await {
            log::error!("Document embedding job {job_id} failed: {error}");
            let _ = mark_embedding_job_failed(&app_handle, &job_id, &error.to_string());
        }
    });
}

async fn execute_document_embedding_job(app_handle: &AppHandle, job_id: &str) -> CommandResult<()> {
    let (document_id, progress_total) = mark_embedding_job_running(app_handle, job_id)?;
    let state = app_handle.state::<AppState>();

    let response =
        execute_orchestration_request(&state, EMBEDDING_WORKFLOW_PATH, &document_id, Some(job_id))
            .await;

    match response {
        Ok(payload) => {
            if payload["status"].as_str() == Some("cancelled") {
                mark_embedding_job_cancelled(app_handle, job_id)?;
                return Ok(());
            }
            if embedding_job_is_cancelled_or_terminal(app_handle, job_id)? {
                return Ok(());
            }
            mark_embedding_job_succeeded(app_handle, job_id, &payload, progress_total)?;
            Ok(())
        }
        Err(error) => {
            mark_embedding_job_failed(app_handle, job_id, &error.to_string())?;
            Err(error)
        }
    }
}

fn embedding_job_is_cancelled_or_terminal(
    app_handle: &AppHandle,
    job_id: &str,
) -> CommandResult<bool> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let job = repo.find_by_id(job_id)?.ok_or(CommandError::NotFound)?;
    Ok(job.cancel_requested_at.is_some()
        || matches!(job.status.as_str(), "cancelled" | "failed" | "succeeded"))
}

fn mark_embedding_job_running(
    app_handle: &AppHandle,
    job_id: &str,
) -> CommandResult<(String, Option<i32>)> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let job_repo = Mvp0BackgroundJobRepository::new(db.connection());
    let doc_repo = Mvp0DocumentRepository::new(db.connection());
    let job = job_repo.find_by_id(job_id)?.ok_or(CommandError::NotFound)?;
    if job.job_type != DOCUMENT_EMBEDDING_JOB_TYPE {
        return Err(CommandError::InvalidInput(
            "Background job is not a document embedding job".to_string(),
        ));
    }
    if job.status == "cancelled" || job.cancel_requested_at.is_some() {
        return Err(CommandError::InvalidInput("Job was cancelled".to_string()));
    }

    doc_repo.update_parse_status(&job.target_id, "embedding")?;
    let running = job_repo.update_status(
        job_id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "running".to_string(),
            result_json: None,
            error_message: None,
            error_details: None,
            progress_current: Some(0),
            progress_total: job.progress_total,
            progress_message: Some("Generating document embeddings".to_string()),
        },
    )?;
    Ok((running.target_id, running.progress_total))
}

fn mark_embedding_job_succeeded(
    app_handle: &AppHandle,
    job_id: &str,
    payload: &serde_json::Value,
    progress_total: Option<i32>,
) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let doc_repo = Mvp0DocumentRepository::new(db.connection());
    let job = repo.find_by_id(job_id)?.ok_or(CommandError::NotFound)?;
    let embedded_count = payload["embeddedChunkCount"]
        .as_i64()
        .and_then(|value| i32::try_from(value).ok())
        .or(progress_total);

    repo.update_status(
        job_id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "succeeded".to_string(),
            result_json: Some(payload.to_string()),
            error_message: None,
            error_details: None,
            progress_current: embedded_count,
            progress_total,
            progress_message: Some("Document embeddings generated".to_string()),
        },
    )?;
    doc_repo.update_parse_status(&job.target_id, "ready")?;
    Ok(())
}

fn mark_embedding_job_cancelled(app_handle: &AppHandle, job_id: &str) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let doc_repo = Mvp0DocumentRepository::new(db.connection());
    let job = repo.find_by_id(job_id)?.ok_or(CommandError::NotFound)?;
    repo.update_status(
        job_id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "cancelled".to_string(),
            result_json: None,
            error_message: None,
            error_details: None,
            progress_current: job.progress_current,
            progress_total: job.progress_total,
            progress_message: Some("Document embedding cancelled".to_string()),
        },
    )?;
    doc_repo.update_parse_status(&job.target_id, "embedding_failed")?;
    Ok(())
}

fn mark_embedding_job_failed(
    app_handle: &AppHandle,
    job_id: &str,
    message: &str,
) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let job_repo = Mvp0BackgroundJobRepository::new(db.connection());
    let doc_repo = Mvp0DocumentRepository::new(db.connection());
    let Some(job) = job_repo.find_by_id(job_id)? else {
        return Ok(());
    };
    if matches!(job.status.as_str(), "failed" | "succeeded" | "cancelled") {
        return Ok(());
    }
    doc_repo.update_parse_status(&job.target_id, "embedding_failed")?;
    job_repo.update_status(
        job_id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "failed".to_string(),
            result_json: None,
            error_message: Some(message.to_string()),
            error_details: Some(message.to_string()),
            progress_current: job.progress_current,
            progress_total: job.progress_total,
            progress_message: Some("Document embedding failed".to_string()),
        },
    )?;
    Ok(())
}

fn create_document_parse_job(
    job_repo: &Mvp0BackgroundJobRepository<'_>,
    document: &Mvp0Document,
    retry_of_job_id: Option<&str>,
) -> CommandResult<Mvp0BackgroundJob> {
    let mut payload = json!({
        "documentId": document.id,
        "filePath": document.file_path,
        "parser": "pymupdf",
    });
    if let Some(retry_of_job_id) = retry_of_job_id {
        payload["retryOfJobId"] = json!(retry_of_job_id);
    }

    job_repo
        .create_job(CreateMvp0BackgroundJobRequest {
            job_type: DOCUMENT_PARSE_JOB_TYPE.to_string(),
            target_type: "document".to_string(),
            target_id: document.id.clone(),
            payload_json: payload.to_string(),
            progress_total: Some(3),
        })
        .map_err(Into::into)
}

fn prepare_document_parse_job(
    job_repo: &Mvp0BackgroundJobRepository<'_>,
    document: &Mvp0Document,
) -> CommandResult<String> {
    let latest_job =
        job_repo.find_latest_by_target("document", &document.id, Some(DOCUMENT_PARSE_JOB_TYPE))?;

    let job = match latest_job {
        Some(job) if job.status == "queued" => job,
        Some(job) if job.status == "running" => {
            return Err(CommandError::InvalidInput(
                "Document parse is already running".to_string(),
            ))
        }
        Some(job) => create_document_parse_job(job_repo, document, Some(&job.id))?,
        None => create_document_parse_job(job_repo, document, None)?,
    };

    let running = job_repo.update_status(
        &job.id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "running".to_string(),
            result_json: None,
            error_message: None,
            error_details: None,
            progress_current: Some(0),
            progress_total: Some(3),
            progress_message: Some("正在解析 PDF".to_string()),
        },
    )?;

    Ok(running.id)
}

fn update_parse_job_progress(
    state: &State<'_, AppState>,
    job_id: &str,
    progress_current: i32,
    progress_message: &str,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let job_repo = Mvp0BackgroundJobRepository::new(db.connection());
    let job = job_repo.find_by_id(job_id)?.ok_or(CommandError::NotFound)?;
    job_repo.update_status(
        job_id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: job.status,
            result_json: job.result_json,
            error_message: None,
            error_details: None,
            progress_current: Some(progress_current),
            progress_total: Some(3),
            progress_message: Some(progress_message.to_string()),
        },
    )?;
    Ok(())
}

fn mark_parse_job_succeeded(
    state: &State<'_, AppState>,
    job_id: &str,
    payload: &serde_json::Value,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let job_repo = Mvp0BackgroundJobRepository::new(db.connection());
    job_repo.update_status(
        job_id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "succeeded".to_string(),
            result_json: Some(payload.to_string()),
            error_message: None,
            error_details: None,
            progress_current: Some(3),
            progress_total: Some(3),
            progress_message: Some("解析完成".to_string()),
        },
    )?;
    Ok(())
}

fn mark_parse_job_failed(
    state: &State<'_, AppState>,
    document_id: &str,
    job_id: &str,
    message: &str,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let doc_repo = Mvp0DocumentRepository::new(db.connection());
    let job_repo = Mvp0BackgroundJobRepository::new(db.connection());

    let persisted_status = if message.to_ascii_lowercase().contains("unsupported") {
        "unsupported"
    } else {
        "failed"
    };

    doc_repo.update_parse_status(document_id, persisted_status)?;
    job_repo.update_status(
        job_id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "failed".to_string(),
            result_json: None,
            error_message: Some(message.to_string()),
            error_details: Some(message.to_string()),
            progress_current: Some(3),
            progress_total: Some(3),
            progress_message: Some("解析失败".to_string()),
        },
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{
        test_support::TestDatabase, CreateMvp0CardGroupRequest, CreateMvp0CardRequest,
        CreateMvp0DocumentChunkRequest,
    };
    use rusqlite::Connection;

    fn create_test_document(repo: &Mvp0DocumentRepository<'_>, parse_status: &str) -> Mvp0Document {
        repo.create_document(CreateMvp0DocumentRequest {
            title: "Systems Thinking.pdf".to_string(),
            original_filename: "systems-thinking.pdf".to_string(),
            file_path: "E:/docs/systems-thinking.pdf".to_string(),
            file_hash: format!("hash-{parse_status}"),
            file_size: 2048,
            page_count: None,
            parse_status: Some(parse_status.to_string()),
        })
        .expect("document should be created")
    }

    fn test_embedding_profile() -> EmbeddingProfile {
        EmbeddingProfile {
            id: "profile-embedding".to_string(),
            provider: "custom_openai".to_string(),
            model: "Qwen/Qwen3-Embedding-8B".to_string(),
            dimensions: 4096,
            distance_metric: "cosine".to_string(),
            is_active: true,
            revision: 1,
            created_at: "2026-05-05T00:00:00Z".to_string(),
        }
    }

    fn create_test_chunk(
        repo: &Mvp0DocumentRepository<'_>,
        document_id: &str,
        chunk_index: i32,
    ) -> Mvp0DocumentChunk {
        repo.create_chunk(CreateMvp0DocumentChunkRequest {
            document_id: document_id.to_string(),
            page_start: 1,
            page_end: 1,
            chunk_index,
            text: format!("Parsed chunk {chunk_index}"),
            parser: "pymupdf::child".to_string(),
        })
        .expect("chunk should be created")
    }

    fn insert_test_embedding_profile(conn: &Connection, profile: &EmbeddingProfile) {
        conn.execute(
            "INSERT INTO embedding_profiles (
                id, provider, model, dimensions, distance_metric, is_active, revision, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                &profile.id,
                &profile.provider,
                &profile.model,
                profile.dimensions,
                &profile.distance_metric,
                profile.is_active,
                profile.revision,
                &profile.created_at,
            ],
        )
        .expect("embedding profile should be inserted");
    }

    fn insert_test_embedding_state(conn: &Connection, chunk: &Mvp0DocumentChunk, profile_id: &str) {
        let (chunk_rowid, content_hash, chunking_profile_revision): (i64, Option<String>, i32) = conn
            .query_row(
                "SELECT c.rowid, c.content_hash, d.chunking_profile_revision
                 FROM document_chunks c
                 JOIN documents d ON d.id = c.document_id
                 WHERE c.id = ?1",
                [&chunk.id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("chunk embedding metadata should load");
        let (profile_revision, profile_dimensions): (i32, i32) = conn
            .query_row(
                "SELECT revision, dimensions FROM embedding_profiles WHERE id = ?1",
                [profile_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("embedding profile metadata should load");

        conn.execute(
            "INSERT INTO document_chunk_embedding_state (
                chunk_id,
                profile_id,
                chunk_rowid,
                content_hash,
                chunking_profile_revision,
                embedding_profile_revision,
                embedding_dimensions,
                created_at,
                embedded_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
            rusqlite::params![
                &chunk.id,
                profile_id,
                chunk_rowid,
                &content_hash,
                chunking_profile_revision,
                profile_revision,
                profile_dimensions,
                Utc::now().to_rfc3339(),
            ],
        )
        .expect("embedding state should be inserted");
    }

    fn count_test_document_embeddings(
        conn: &Connection,
        document_id: &str,
        profile_id: &str,
    ) -> CommandResult<i64> {
        conn.query_row(
            "SELECT COUNT(*)
             FROM document_chunk_embedding_state state
             JOIN document_chunks chunks ON chunks.id = state.chunk_id
                         JOIN documents documents ON documents.id = chunks.document_id
                         JOIN embedding_profiles profiles ON profiles.id = state.profile_id
                         WHERE chunks.document_id = ?1
                             AND state.profile_id = ?2
                             AND state.embedding_profile_revision = profiles.revision
                             AND state.chunking_profile_revision = documents.chunking_profile_revision
                             AND (profiles.dimensions <= 0 OR state.embedding_dimensions = profiles.dimensions)",
            rusqlite::params![document_id, profile_id],
            |row| row.get(0),
        )
        .map_err(Into::into)
    }

    #[test]
    fn delete_document_soft_deletes_cards_from_same_document() {
        let test_db = TestDatabase::new();
        let doc_repo = Mvp0DocumentRepository::new(test_db.connection());
        let card_repo = Mvp0CardRepository::new(test_db.connection());
        let document = create_test_document(&doc_repo, "parsed");
        let other_document = doc_repo
            .create_document(CreateMvp0DocumentRequest {
                title: "Other.pdf".to_string(),
                original_filename: "other.pdf".to_string(),
                file_path: "E:/docs/other.pdf".to_string(),
                file_hash: "hash-other-delete-cascade".to_string(),
                file_size: 1024,
                page_count: None,
                parse_status: Some("parsed".to_string()),
            })
            .expect("other document should be created");
        let group = card_repo
            .create_group(CreateMvp0CardGroupRequest {
                name: "Generated".to_string(),
                description: None,
                color: None,
                is_enabled: Some(true),
            })
            .expect("group should be created");

        let generated = card_repo
            .create_card(CreateMvp0CardRequest {
                group_id: group.id.clone(),
                source_document_id: Some(document.id.clone()),
                source_anchor_id: None,
                title: "Generated card".to_string(),
                front: "Question".to_string(),
                back: "Answer".to_string(),
                tags: vec![],
                origin: Some("ai".to_string()),
                initial_due_at: None,
            })
            .expect("generated card should be created");
        let other_generated = card_repo
            .create_card(CreateMvp0CardRequest {
                group_id: group.id.clone(),
                source_document_id: Some(other_document.id),
                source_anchor_id: None,
                title: "Other generated card".to_string(),
                front: "Other question".to_string(),
                back: "Other answer".to_string(),
                tags: vec![],
                origin: Some("ai".to_string()),
                initial_due_at: None,
            })
            .expect("other generated card should be created");
        let manual = card_repo
            .create_card(CreateMvp0CardRequest {
                group_id: group.id,
                source_document_id: None,
                source_anchor_id: None,
                title: "Manual card".to_string(),
                front: "Manual question".to_string(),
                back: "Manual answer".to_string(),
                tags: vec![],
                origin: Some("manual".to_string()),
                initial_due_at: None,
            })
            .expect("manual card should be created");

        delete_document_inner(test_db.connection(), &document.id)
            .expect("document delete should succeed");

        assert!(doc_repo
            .find_document_by_id(&document.id)
            .expect("document lookup should succeed")
            .is_none());
        assert!(card_repo
            .find_card_by_id(&generated.id)
            .expect("generated card lookup should succeed")
            .and_then(|card| card.deleted_at)
            .is_some());
        assert!(card_repo
            .find_card_by_id(&other_generated.id)
            .expect("other generated card lookup should succeed")
            .and_then(|card| card.deleted_at)
            .is_none());
        assert!(card_repo
            .find_card_by_id(&manual.id)
            .expect("manual card lookup should succeed")
            .and_then(|card| card.deleted_at)
            .is_none());
        assert!(card_repo
            .list_cards_filtered(crate::db::ListMvp0CardsFilters {
                source_document_id: Some(&document.id),
                include_deleted: false,
                ..Default::default()
            })
            .expect("active cards for deleted document should load")
            .is_empty());
    }

    #[test]
    fn parsed_document_with_chunks_skips_reparse() {
        let test_db = TestDatabase::new();
        let repo = Mvp0DocumentRepository::new(test_db.connection());
        let document = create_test_document(&repo, "parsed");

        repo.create_chunk(CreateMvp0DocumentChunkRequest {
            document_id: document.id.clone(),
            page_start: 1,
            page_end: 1,
            chunk_index: 0,
            text: "A parsed chunk".to_string(),
            parser: "pymupdf::child".to_string(),
        })
        .expect("chunk should be created");

        assert!(
            should_skip_document_parse(&document, &repo).expect("skip check should succeed"),
            "parsed documents with chunks should not be re-parsed"
        );
    }

    #[test]
    fn retry_parse_after_failure_creates_new_running_job() {
        let test_db = TestDatabase::new();
        let document_repo = Mvp0DocumentRepository::new(test_db.connection());
        let job_repo = Mvp0BackgroundJobRepository::new(test_db.connection());
        let document = create_test_document(&document_repo, "failed");

        let failed_job = create_document_parse_job(&job_repo, &document, None)
            .expect("initial parse job should be created");
        job_repo
            .update_status(
                &failed_job.id,
                UpdateMvp0BackgroundJobStatusRequest {
                    status: "running".to_string(),
                    result_json: None,
                    error_message: None,
                    error_details: None,
                    progress_current: Some(0),
                    progress_total: Some(1),
                    progress_message: Some("parsing".to_string()),
                },
            )
            .expect("queued -> running should succeed");
        job_repo
            .update_status(
                &failed_job.id,
                UpdateMvp0BackgroundJobStatusRequest {
                    status: "failed".to_string(),
                    result_json: None,
                    error_message: Some("parse failed".to_string()),
                    error_details: Some("trace".to_string()),
                    progress_current: Some(1),
                    progress_total: Some(1),
                    progress_message: Some("failed".to_string()),
                },
            )
            .expect("running -> failed should succeed");

        let retry_job_id = prepare_document_parse_job(&job_repo, &document)
            .expect("retry should create a new running job");
        let retry_job = job_repo
            .find_by_id(&retry_job_id)
            .expect("retry job lookup should succeed")
            .expect("retry job should exist");

        assert_ne!(retry_job.id, failed_job.id);
        assert_eq!(retry_job.status, "running");
        assert!(retry_job.payload_json.contains(&failed_job.id));
    }

    #[test]
    fn complete_existing_embedding_job_repairs_queued_job() {
        let test_db = TestDatabase::new();
        let document_repo = Mvp0DocumentRepository::new(test_db.connection());
        let job_repo = Mvp0BackgroundJobRepository::new(test_db.connection());
        let document = create_test_document(&document_repo, "ready");
        let profile = test_embedding_profile();
        let queued_job = create_document_embedding_job(&job_repo, &document, &profile, 3)
            .expect("queued embedding job should be created");

        let completed =
            complete_existing_embedding_job(&job_repo, Some(queued_job), &document, &profile, 3, 3)
                .expect("queued repair job should complete via valid transitions");

        assert_eq!(completed.status, "succeeded");
        assert_eq!(completed.progress_current, Some(3));
        assert_eq!(completed.progress_total, Some(3));
        assert!(
            completed.started_at.is_some(),
            "queued repair should pass through running"
        );
        assert!(
            completed.finished_at.is_some(),
            "queued repair should finish"
        );
        assert!(
            completed
                .result_json
                .as_deref()
                .unwrap_or_default()
                .contains("\"repaired\":true"),
            "repair result should be recorded"
        );
    }

    #[test]
    fn document_list_repair_completes_ready_document_with_stale_queued_embedding_job() {
        let test_db = TestDatabase::new();
        let document_repo = Mvp0DocumentRepository::new(test_db.connection());
        let job_repo = Mvp0BackgroundJobRepository::new(test_db.connection());
        let document = create_test_document(&document_repo, "ready");
        let profile = test_embedding_profile();
        insert_test_embedding_profile(test_db.connection(), &profile);
        let chunk_a = create_test_chunk(&document_repo, &document.id, 0);
        let chunk_b = create_test_chunk(&document_repo, &document.id, 1);
        insert_test_embedding_state(test_db.connection(), &chunk_a, &profile.id);
        insert_test_embedding_state(test_db.connection(), &chunk_b, &profile.id);
        let queued_job = create_document_embedding_job(&job_repo, &document, &profile, 2)
            .expect("queued embedding job should be created");

        repair_stuck_document_embedding_jobs_with_counter(
            &document_repo,
            &job_repo,
            |document_id, profile_id| {
                count_test_document_embeddings(test_db.connection(), document_id, profile_id)
            },
        )
        .expect("repair should succeed");

        let repaired_job = job_repo
            .find_by_id(&queued_job.id)
            .expect("job lookup should succeed")
            .expect("job should exist");
        let repaired_document = document_repo
            .find_document_by_id(&document.id)
            .expect("document lookup should succeed")
            .expect("document should exist");

        assert_eq!(repaired_job.status, "succeeded");
        assert_eq!(repaired_job.progress_current, Some(2));
        assert_eq!(repaired_job.progress_total, Some(2));
        assert_eq!(repaired_document.parse_status, "ready");
    }

    #[test]
    fn document_list_repair_marks_stale_document_ready_when_active_profile_embeddings_are_complete()
    {
        let test_db = TestDatabase::new();
        let document_repo = Mvp0DocumentRepository::new(test_db.connection());
        let document = create_test_document(&document_repo, "embedding_stale");
        let profile = test_embedding_profile();
        insert_test_embedding_profile(test_db.connection(), &profile);
        document_repo
            .create_chunk(CreateMvp0DocumentChunkRequest {
                document_id: document.id.clone(),
                page_start: 1,
                page_end: 1,
                chunk_index: 0,
                text: "Parent chunk".to_string(),
                parser: "pymupdf::parent".to_string(),
            })
            .expect("parent chunk should be created");
        let child_a = create_test_chunk(&document_repo, &document.id, 1);
        let child_b = create_test_chunk(&document_repo, &document.id, 2);
        insert_test_embedding_state(test_db.connection(), &child_a, &profile.id);
        insert_test_embedding_state(test_db.connection(), &child_b, &profile.id);

        let repaired = repair_stale_document_embedding_statuses_with_counter(
            &document_repo,
            Some(&profile.id),
            |document_id, profile_id| {
                count_test_document_embeddings(test_db.connection(), document_id, profile_id)
            },
        )
        .expect("status repair should succeed");

        let repaired_document = document_repo
            .find_document_by_id(&document.id)
            .expect("document lookup should succeed")
            .expect("document should exist");
        assert_eq!(repaired, 1);
        assert_eq!(repaired_document.parse_status, "ready");
    }

    #[test]
    fn document_list_repair_does_not_mark_stale_document_ready_when_embeddings_are_incomplete() {
        let test_db = TestDatabase::new();
        let document_repo = Mvp0DocumentRepository::new(test_db.connection());
        let document = create_test_document(&document_repo, "embedding_stale");
        let profile = test_embedding_profile();
        insert_test_embedding_profile(test_db.connection(), &profile);
        let child_a = create_test_chunk(&document_repo, &document.id, 0);
        let _child_b = create_test_chunk(&document_repo, &document.id, 1);
        insert_test_embedding_state(test_db.connection(), &child_a, &profile.id);

        let repaired = repair_stale_document_embedding_statuses_with_counter(
            &document_repo,
            Some(&profile.id),
            |document_id, profile_id| {
                count_test_document_embeddings(test_db.connection(), document_id, profile_id)
            },
        )
        .expect("status repair should succeed");

        let unrepaired_document = document_repo
            .find_document_by_id(&document.id)
            .expect("document lookup should succeed")
            .expect("document should exist");
        assert_eq!(repaired, 0);
        assert_eq!(unrepaired_document.parse_status, "embedding_stale");
    }

    #[test]
    fn document_list_repair_fails_stale_queued_embedding_job() {
        let test_db = TestDatabase::new();
        let document_repo = Mvp0DocumentRepository::new(test_db.connection());
        let job_repo = Mvp0BackgroundJobRepository::new(test_db.connection());
        let document = create_test_document(&document_repo, "parsed");
        let profile = test_embedding_profile();
        let queued_job = create_document_embedding_job(&job_repo, &document, &profile, 1)
            .expect("queued embedding job should be created");
        let stale_created_at = (Utc::now() - chrono::Duration::minutes(11)).to_rfc3339();
        test_db
            .connection()
            .execute(
                "UPDATE background_jobs SET created_at = ?2 WHERE id = ?1",
                rusqlite::params![&queued_job.id, stale_created_at],
            )
            .expect("job should be made stale");

        repair_stuck_document_embedding_jobs_with_counter(
            &document_repo,
            &job_repo,
            |_document_id, _profile_id| Ok(0),
        )
        .expect("repair should succeed");

        let repaired_job = job_repo
            .find_by_id(&queued_job.id)
            .expect("job lookup should succeed")
            .expect("job should exist");
        let repaired_document = document_repo
            .find_document_by_id(&document.id)
            .expect("document lookup should succeed")
            .expect("document should exist");

        assert_eq!(repaired_job.status, "failed");
        assert!(repaired_job.started_at.is_some());
        assert!(repaired_job.finished_at.is_some());
        assert_eq!(repaired_document.parse_status, "embedding_failed");
    }
}
