use std::{fs::File, io::Read, path::{Path, PathBuf}, time::Duration};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        CreateDocumentAnchorRequest, CreateDocumentChunkRequest, CreateDocumentRequest,
        CreateDocumentSectionRequest, Document, DocumentAnchor, DocumentChunk, DocumentRepository,
        DocumentSection, ReplaceDocumentAnalysisRequest,
    },
};

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

impl From<Document> for DocumentDto {
    fn from(doc: Document) -> Self {
        Self {
            id: doc.id,
            title: doc.title,
            file_path: doc.file_path,
            file_type: doc.file_type,
            file_size: doc.file_size,
            page_count: doc.page_count,
            content_hash: doc.content_hash,
            status: doc.status,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentAnchorRectDto {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl From<DocumentAnchorRectDto> for crate::db::DocumentAnchorRect {
    fn from(rect: DocumentAnchorRectDto) -> Self {
        Self {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
        }
    }
}

impl From<crate::db::DocumentAnchorRect> for DocumentAnchorRectDto {
    fn from(rect: crate::db::DocumentAnchorRect) -> Self {
        Self {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
        }
    }
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

impl From<DocumentAnchor> for DocumentAnchorDto {
    fn from(anchor: DocumentAnchor) -> Self {
        Self {
            id: anchor.id,
            document_id: anchor.document_id,
            page: anchor.page,
            paragraph: anchor.paragraph,
            text_quote: anchor.text_quote,
            rects: anchor.rects.into_iter().map(Into::into).collect(),
            hash: anchor.hash,
            created_at: anchor.created_at,
        }
    }
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
    let db = state.lock_db()?;
    let repo = DocumentRepository::new(&db);
    let documents = repo.list_all(limit)?;
    Ok(documents.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn get_document(state: State<'_, AppState>, id: String) -> CommandResult<Option<DocumentDto>> {
    let db = state.lock_db()?;
    let repo = DocumentRepository::new(&db);
    let document = repo.find_by_id(&id)?;
    Ok(document.map(Into::into))
}

#[tauri::command]
pub fn create_document(
    state: State<'_, AppState>,
    data: CreateDocumentDto,
) -> CommandResult<DocumentDto> {
    let db = state.lock_db()?;
    let repo = DocumentRepository::new(&db);

    let req = CreateDocumentRequest {
        title: data.title,
        file_path: data.file_path,
        file_type: data.file_type,
        file_size: data.file_size,
        page_count: data.page_count,
        content_hash: data.content_hash,
    };

    let document = repo.create(req)?;
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
    run_document_orchestration_workflow(&app, &state, &document_id, "/workflows/document-parse")
        .await
}

#[tauri::command]
pub async fn run_document_embedding_workflow(
    app: AppHandle,
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<DocumentDto> {
    run_document_orchestration_workflow(&app, &state, &document_id, "/workflows/document-embedding")
        .await
}

#[tauri::command]
pub fn update_document_status(
    state: State<'_, AppState>,
    id: String,
    status: String,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let repo = DocumentRepository::new(&db);
    repo.update_status(&id, &status)?;
    Ok(())
}

#[tauri::command]
pub fn save_document_analysis(
    state: State<'_, AppState>,
    id: String,
    data: SaveDocumentAnalysisDto,
) -> CommandResult<DocumentDto> {
    let db = state.lock_db()?;
    let repo = DocumentRepository::new(&db);

    let request = ReplaceDocumentAnalysisRequest {
        page_count: data.page_count,
        anchors: data
            .anchors
            .into_iter()
            .map(|anchor| CreateDocumentAnchorRequest {
                id: anchor.id,
                page: anchor.page,
                paragraph: anchor.paragraph,
                text_quote: anchor.text_quote,
                rects: anchor.rects.into_iter().map(Into::into).collect(),
                hash: anchor.hash,
                hierarchy_path: anchor.hierarchy_path,
                quote_hash: anchor.quote_hash,
            })
            .collect(),
        sections: data
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
            .collect(),
        chunks: data
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
            .collect(),
    };

    repo.replace_analysis(&id, request)?;

    let document = repo.find_by_id(&id)?.ok_or(CommandError::NotFound)?;
    Ok(document.into())
}

#[tauri::command]
pub fn list_document_anchors(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<Vec<DocumentAnchorDto>> {
    let db = state.lock_db()?;
    let repo = DocumentRepository::new(&db);
    let anchors = repo.list_anchors(&document_id)?;
    Ok(anchors.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn list_document_sections(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<Vec<DocumentSectionDto>> {
    let db = state.lock_db()?;
    let repo = DocumentRepository::new(&db);
    let sections = repo.list_sections(&document_id)?;
    Ok(sections.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn list_document_chunks(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<Vec<DocumentChunkDto>> {
    let db = state.lock_db()?;
    let repo = DocumentRepository::new(&db);
    let chunks = repo.list_chunks(&document_id)?;
    Ok(chunks.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn read_document_binary(state: State<'_, AppState>, id: String) -> CommandResult<Vec<u8>> {
    let db = state.lock_db()?;
    let repo = DocumentRepository::new(&db);
    let document = repo.find_by_id(&id)?.ok_or(CommandError::NotFound)?;

    std::fs::read(&document.file_path)
        .map_err(|error| CommandError::Internal(format!("Failed to read document binary: {error}")))
}

#[tauri::command]
pub fn delete_document(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let db = state.lock_db()?;
    let repo = DocumentRepository::new(&db);
    repo.delete(&id)?;

    Ok(())
}

const SUPPORTED_EXTENSIONS: &[&str] = &["pdf", "md", "txt", "docx"];

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
    let content_hash = compute_file_hash(source_path)?;
    let target_path = prepare_document_target_path(app, source_path, &content_hash, &extension)?;

    if target_path != source_path && !target_path.exists() {
        std::fs::copy(source_path, &target_path).map_err(|error| {
            CommandError::Internal(format!(
                "Failed to copy document into application storage: {error}"
            ))
        })?;
    }

    let title = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .ok_or_else(|| CommandError::InvalidInput("Invalid file name".to_string()))?;

    let db = state.lock_db()?;
    let repo = DocumentRepository::new(&db);

    let document = match repo.create(CreateDocumentRequest {
        title,
        file_path: target_path.to_string_lossy().to_string(),
        file_type: extension.clone(),
        file_size: Some(file_size),
        page_count: None,
        content_hash: Some(content_hash),
    }) {
        Ok(document) => document,
        Err(error) => {
            if target_path.exists() && target_path != source_path {
                let _ = std::fs::remove_file(&target_path);
            }
            return Err(error.into());
        }
    };

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
    {
        let db = state.lock_db()?;
        let repo = DocumentRepository::new(&db);
        repo.find_by_id(document_id)?
            .ok_or(CommandError::NotFound)?;
    }

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

    let response = client
        .post(format!("{endpoint}{workflow_path}"))
        .json(&serde_json::json!({
            "documentId": document_id,
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

    let payload: serde_json::Value = response
        .json()
        .await
        .map_err(|error| CommandError::Internal(error.to_string()))?;
    if payload["status"].as_str() == Some("failed") {
        let message = payload["error"]
            .as_str()
            .unwrap_or("Unknown orchestration failure")
            .to_string();
        return Err(CommandError::Internal(message));
    }

    let db = state.lock_db()?;
    let repo = DocumentRepository::new(&db);
    let document = repo
        .find_by_id(document_id)?
        .ok_or(CommandError::NotFound)?;
    let _ = app;
    Ok(document.into())
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
