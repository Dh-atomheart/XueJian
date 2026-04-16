use tauri::State;
use crate::commands::{CommandResult, CommandError, AppState};
use crate::db::{document_repo::CreateDocumentRequest};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct DocumentDto {
    pub id: String,
    pub title: String,
    pub file_path: String,
    pub file_type: String,
    pub file_size: Option<i64>,
    pub page_count: Option<i32>,
    pub status: String,
    pub created_at: String,
}

impl From<crate::db::document_repo::Document> for DocumentDto {
    fn from(doc: crate::db::document_repo::Document) -> Self {
        Self {
            id: doc.id,
            title: doc.title,
            file_path: doc.file_path,
            file_type: doc.file_type,
            file_size: doc.file_size,
            page_count: doc.page_count,
            status: doc.status,
            created_at: doc.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateDocumentDto {
    pub title: String,
    pub file_path: String,
    pub file_type: String,
    pub file_size: Option<i64>,
    pub page_count: Option<i32>,
    pub content_hash: Option<String>,
}

#[tauri::command]
pub fn list_documents(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> CommandResult<Vec<DocumentDto>> {
    let repo = crate::db::document_repo::DocumentRepository::new(&state.db);
    let documents = repo.list_all(limit)?;
    Ok(documents.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn get_document(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<Option<DocumentDto>> {
    let repo = crate::db::document_repo::DocumentRepository::new(&state.db);
    let document = repo.find_by_id(&id)?;
    Ok(document.map(Into::into))
}

#[tauri::command]
pub fn create_document(
    state: State<'_, AppState>,
    data: CreateDocumentDto,
) -> CommandResult<DocumentDto> {
    let repo = crate::db::document_repo::DocumentRepository::new(&state.db);

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
pub fn update_document_status(
    state: State<'_, AppState>,
    id: String,
    status: String,
) -> CommandResult<()> {
    let repo = crate::db::document_repo::DocumentRepository::new(&state.db);
    repo.update_status(&id, &status)?;
    Ok(())
}

#[tauri::command]
pub fn delete_document(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<()> {
    let repo = crate::db::document_repo::DocumentRepository::new(&state.db);
    repo.delete(&id)?;
    Ok(())
}
