use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::db::{Database, Result, DbError};

#[derive(Debug, Serialize, Deserialize)]
pub struct Document {
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

#[derive(Debug, Deserialize)]
pub struct CreateDocumentRequest {
    pub title: String,
    pub file_path: String,
    pub file_type: String,
    pub file_size: Option<i64>,
    pub page_count: Option<i32>,
    pub content_hash: Option<String>,
}

pub struct DocumentRepository<'a> {
    db: &'a Database,
}

impl<'a> DocumentRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn create(&self, req: CreateDocumentRequest) -> Result<Document> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        self.db.connection().execute(
            "INSERT INTO documents (id, title, file_path, file_type, file_size, page_count, content_hash, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'uploading', ?8, ?9)",
            params![
                &id, &req.title, &req.file_path, &req.file_type,
                req.file_size, req.page_count, req.content_hash,
                &now, &now
            ],
        )?;

        Ok(Document {
            id,
            title: req.title,
            file_path: req.file_path,
            file_type: req.file_type,
            file_size: req.file_size,
            page_count: req.page_count,
            content_hash: req.content_hash,
            status: "uploading".to_string(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn find_by_id(&self, id: &str) -> Result<Option<Document>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, title, file_path, file_type, file_size, page_count, content_hash, status, created_at, updated_at
             FROM documents WHERE id = ?1"
        )?;

        let document = stmt.query_row(params![id], |row| {
            Ok(Document {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                file_type: row.get(3)?,
                file_size: row.get(4)?,
                page_count: row.get(5)?,
                content_hash: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        }).optional()?;

        Ok(document)
    }

    pub fn list_all(&self, limit: Option<i64>) -> Result<Vec<Document>> {
        let limit = limit.unwrap_or(100);

        let mut stmt = self.db.connection().prepare(
            "SELECT id, title, file_path, file_type, file_size, page_count, content_hash, status, created_at, updated_at
             FROM documents
             ORDER BY created_at DESC
             LIMIT ?1"
        )?;

        let documents = stmt.query_map(params![limit], |row| {
            Ok(Document {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                file_type: row.get(3)?,
                file_size: row.get(4)?,
                page_count: row.get(5)?,
                content_hash: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;

        documents.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn update_status(&self, id: &str, status: &str) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();

        self.db.connection().execute(
            "UPDATE documents SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, &now, id],
        )?;

        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        self.db.connection().execute(
            "DELETE FROM documents WHERE id = ?1",
            params![id],
        )?;

        Ok(())
    }
}
