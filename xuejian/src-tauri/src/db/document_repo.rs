use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::{Database, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSection {
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

#[derive(Debug, Deserialize)]
pub struct CreateDocumentRequest {
    pub title: String,
    pub file_path: String,
    pub file_type: String,
    pub file_size: Option<i64>,
    pub page_count: Option<i32>,
    pub content_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentAnchorRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentAnchor {
    pub id: String,
    pub document_id: String,
    pub page: i32,
    pub paragraph: Option<i32>,
    pub text_quote: String,
    pub rects: Vec<DocumentAnchorRect>,
    pub hash: String,
    pub hierarchy_path: Vec<String>,
    pub quote_hash: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateDocumentAnchorRequest {
    pub id: Option<String>,
    pub page: i32,
    pub paragraph: Option<i32>,
    pub text_quote: String,
    pub rects: Vec<DocumentAnchorRect>,
    pub hash: String,
    pub hierarchy_path: Option<Vec<String>>,
    pub quote_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentChunk {
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

#[derive(Debug, Clone, Deserialize)]
pub struct CreateDocumentSectionRequest {
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

#[derive(Debug, Clone, Deserialize)]
pub struct CreateDocumentChunkRequest {
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

#[derive(Debug, Clone, Deserialize)]
pub struct ReplaceDocumentAnalysisRequest {
    pub page_count: i32,
    pub anchors: Vec<CreateDocumentAnchorRequest>,
    pub sections: Vec<CreateDocumentSectionRequest>,
    pub chunks: Vec<CreateDocumentChunkRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentChunkSearchResult {
    pub id: String,
    pub document_id: String,
    pub section_id: Option<String>,
    pub anchor_id: Option<String>,
    pub chunk_index: i32,
    pub page_start: Option<i32>,
    pub page_end: Option<i32>,
    pub content: String,
    pub snippet: String,
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
                &id,
                &req.title,
                &req.file_path,
                &req.file_type,
                req.file_size,
                req.page_count,
                req.content_hash,
                &now,
                &now
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
             FROM documents WHERE id = ?1",
        )?;

        let document = stmt.query_row(params![id], map_document_row).optional()?;

        Ok(document)
    }

    pub fn list_all(&self, limit: Option<i64>) -> Result<Vec<Document>> {
        let limit = limit.unwrap_or(100);

        let mut stmt = self.db.connection().prepare(
            "SELECT id, title, file_path, file_type, file_size, page_count, content_hash, status, created_at, updated_at
             FROM documents
             ORDER BY created_at DESC
             LIMIT ?1",
        )?;

        let documents = stmt.query_map(params![limit], map_document_row)?;

        documents
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn list_anchors(&self, document_id: &str) -> Result<Vec<DocumentAnchor>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, document_id, page, paragraph, text_quote, rects, hash,
                    hierarchy_path, quote_hash, created_at
             FROM document_anchors
             WHERE document_id = ?1
             ORDER BY page ASC, paragraph ASC, created_at ASC",
        )?;

        let anchors = stmt.query_map(params![document_id], |row| {
            let rects = row
                .get::<_, Option<String>>(5)?
                .map(|value| serde_json::from_str::<Vec<DocumentAnchorRect>>(&value))
                .transpose()
                .map_err(json_decode_error)?
                .unwrap_or_default();

            let hierarchy_path = row
                .get::<_, Option<String>>(7)?
                .map(|value| serde_json::from_str::<Vec<String>>(&value))
                .transpose()
                .map_err(json_decode_error)?
                .unwrap_or_default();

            Ok(DocumentAnchor {
                id: row.get(0)?,
                document_id: row.get(1)?,
                page: row.get(2)?,
                paragraph: row.get(3)?,
                text_quote: row.get(4)?,
                rects,
                hash: row.get(6)?,
                hierarchy_path,
                quote_hash: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?;

        anchors
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn list_chunks(&self, document_id: &str) -> Result<Vec<DocumentChunk>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, document_id, section_id, anchor_id, page_start, page_end, chunk_index, chunk_kind, content, token_count, metadata, created_at
             FROM document_chunks
             WHERE document_id = ?1
             ORDER BY chunk_index ASC",
        )?;

        let chunks = stmt.query_map(params![document_id], |row| {
            let metadata = row
                .get::<_, Option<String>>(10)?
                .map(|value| {
                    serde_json::from_str::<serde_json::Value>(&value)
                        .or_else(|_| Ok(serde_json::Value::String(value)))
                })
                .transpose()
                .map_err(json_decode_error)?;

            Ok(DocumentChunk {
                id: row.get(0)?,
                document_id: row.get(1)?,
                section_id: row.get(2)?,
                anchor_id: row.get(3)?,
                page_start: row.get(4)?,
                page_end: row.get(5)?,
                chunk_index: row.get(6)?,
                chunk_kind: row.get(7)?,
                content: row.get(8)?,
                token_count: row.get(9)?,
                metadata,
                created_at: row.get(11)?,
            })
        })?;

        chunks
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn list_sections(&self, document_id: &str) -> Result<Vec<DocumentSection>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, document_id, section_index, heading, hierarchy_path, page_start, page_end,
                    anchor_start_id, anchor_end_id, content, token_count, metadata, created_at
             FROM document_sections
             WHERE document_id = ?1
             ORDER BY section_index ASC",
        )?;

        let sections = stmt.query_map(params![document_id], |row| {
            let hierarchy_path = row
                .get::<_, Option<String>>(4)?
                .map(|value| serde_json::from_str::<Vec<String>>(&value))
                .transpose()
                .map_err(json_decode_error)?
                .unwrap_or_default();
            let metadata = row
                .get::<_, Option<String>>(11)?
                .map(|value| {
                    serde_json::from_str::<serde_json::Value>(&value)
                        .or_else(|_| Ok(serde_json::Value::String(value)))
                })
                .transpose()
                .map_err(json_decode_error)?;

            Ok(DocumentSection {
                id: row.get(0)?,
                document_id: row.get(1)?,
                section_index: row.get(2)?,
                heading: row.get(3)?,
                hierarchy_path,
                page_start: row.get(5)?,
                page_end: row.get(6)?,
                anchor_start_id: row.get(7)?,
                anchor_end_id: row.get(8)?,
                content: row.get(9)?,
                token_count: row.get(10)?,
                metadata,
                created_at: row.get(12)?,
            })
        })?;

        sections
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn replace_analysis(
        &self,
        document_id: &str,
        req: ReplaceDocumentAnalysisRequest,
    ) -> Result<()> {
        let transaction = self.db.connection().unchecked_transaction()?;
        let now = chrono::Utc::now().to_rfc3339();

        transaction.execute(
            "DELETE FROM document_anchors WHERE document_id = ?1",
            params![document_id],
        )?;
        transaction.execute(
            "DELETE FROM document_sections WHERE document_id = ?1",
            params![document_id],
        )?;
        transaction.execute(
            "DELETE FROM document_chunks WHERE document_id = ?1",
            params![document_id],
        )?;

        for anchor in req.anchors {
            let rects = serde_json::to_string(&anchor.rects).map_err(json_encode_error)?;
            let hierarchy_path_json = anchor
                .hierarchy_path
                .as_deref()
                .map(|p| serde_json::to_string(p))
                .transpose()
                .map_err(json_encode_error)?;
            transaction.execute(
                "INSERT INTO document_anchors (
                    id, document_id, page, paragraph, text_quote, rects, hash,
                    hierarchy_path, quote_hash, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    anchor.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
                    document_id,
                    anchor.page,
                    anchor.paragraph,
                    anchor.text_quote,
                    rects,
                    anchor.hash,
                    hierarchy_path_json,
                    anchor.quote_hash,
                    &now,
                ],
            )?;
        }

        for section in req.sections {
            let hierarchy_path = section
                .hierarchy_path
                .as_deref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(json_encode_error)?;
            let metadata = section
                .metadata
                .map(|value| serde_json::to_string(&value))
                .transpose()
                .map_err(json_encode_error)?;

            transaction.execute(
                "INSERT INTO document_sections (
                    id, document_id, section_index, heading, hierarchy_path, page_start, page_end,
                    anchor_start_id, anchor_end_id, content, token_count, metadata, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                params![
                    section.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
                    document_id,
                    section.section_index,
                    section.heading,
                    hierarchy_path,
                    section.page_start,
                    section.page_end,
                    section.anchor_start_id,
                    section.anchor_end_id,
                    section.content,
                    section.token_count,
                    metadata,
                    &now,
                ],
            )?;
        }

        for chunk in req.chunks {
            let metadata = chunk
                .metadata
                .map(|value| serde_json::to_string(&value))
                .transpose()
                .map_err(json_encode_error)?;

            transaction.execute(
                "INSERT INTO document_chunks (
                    id, document_id, section_id, anchor_id, page_start, page_end, chunk_index, chunk_kind, content, token_count, metadata
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    chunk.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
                    document_id,
                    chunk.section_id,
                    chunk.anchor_id,
                    chunk.page_start,
                    chunk.page_end,
                    chunk.chunk_index,
                    chunk.chunk_kind.unwrap_or_else(|| "semantic".to_string()),
                    chunk.content,
                    chunk.token_count,
                    metadata,
                ],
            )?;
        }

        transaction.execute(
            "UPDATE documents
             SET page_count = ?1, status = 'parsed', updated_at = ?2
             WHERE id = ?3",
            params![req.page_count, &now, document_id],
        )?;

        transaction.commit()?;
        Ok(())
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
        let transaction = self.db.connection().unchecked_transaction()?;

        transaction.execute(
            "DELETE FROM document_anchors WHERE document_id = ?1",
            params![id],
        )?;
        transaction.execute(
            "DELETE FROM document_chunks WHERE document_id = ?1",
            params![id],
        )?;
        transaction.execute("DELETE FROM documents WHERE id = ?1", params![id])?;

        transaction.commit()?;
        Ok(())
    }

    pub fn search_chunks(
        &self,
        query: &str,
        limit: Option<i64>,
    ) -> Result<Vec<DocumentChunkSearchResult>> {
        let limit = limit.unwrap_or(10);
        let mut stmt = self.db.connection().prepare(
            "SELECT c.id, c.document_id, c.chunk_index, c.page_start, c.page_end, c.content,
                    c.section_id, c.anchor_id,
                    snippet(document_chunks_fts, 0, '[', ']', '...', 12) AS snippet
             FROM document_chunks_fts
             JOIN document_chunks c ON c.rowid = document_chunks_fts.rowid
             WHERE document_chunks_fts MATCH ?1
             ORDER BY bm25(document_chunks_fts)
             LIMIT ?2",
        )?;

        let chunks = stmt.query_map(params![query, limit], |row| {
            Ok(DocumentChunkSearchResult {
                id: row.get(0)?,
                document_id: row.get(1)?,
                chunk_index: row.get(2)?,
                page_start: row.get(3)?,
                page_end: row.get(4)?,
                content: row.get(5)?,
                section_id: row.get(6)?,
                anchor_id: row.get(7)?,
                snippet: row.get(8)?,
            })
        })?;

        chunks
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// Search chunks via FTS5, scoped to a set of document IDs.
    pub fn search_chunks_scoped(
        &self,
        query: &str,
        document_ids: &[String],
        limit: Option<i64>,
    ) -> Result<Vec<DocumentChunkSearchResult>> {
        if document_ids.is_empty() {
            return self.search_chunks(query, limit);
        }

        let limit = limit.unwrap_or(10);
        let placeholders: Vec<String> = document_ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 3)).collect();
        let in_clause = placeholders.join(", ");

        let sql = format!(
            "SELECT c.id, c.document_id, c.chunk_index, c.page_start, c.page_end, c.content,
                    c.section_id, c.anchor_id,
                    snippet(document_chunks_fts, 0, '[', ']', '...', 12) AS snippet
             FROM document_chunks_fts
             JOIN document_chunks c ON c.rowid = document_chunks_fts.rowid
             WHERE document_chunks_fts MATCH ?1
               AND c.document_id IN ({in_clause})
             ORDER BY bm25(document_chunks_fts)
             LIMIT ?2"
        );

        let mut stmt = self.db.connection().prepare(&sql)?;

        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        param_values.push(Box::new(query.to_string()));
        param_values.push(Box::new(limit));
        for doc_id in document_ids {
            param_values.push(Box::new(doc_id.clone()));
        }

        let params_ref: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

        let chunks = stmt.query_map(&*params_ref, |row| {
            Ok(DocumentChunkSearchResult {
                id: row.get(0)?,
                document_id: row.get(1)?,
                chunk_index: row.get(2)?,
                page_start: row.get(3)?,
                page_end: row.get(4)?,
                content: row.get(5)?,
                section_id: row.get(6)?,
                anchor_id: row.get(7)?,
                snippet: row.get(8)?,
            })
        })?;

        chunks
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }
}

fn map_document_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Document> {
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
}

fn json_encode_error(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(error))
}

fn json_decode_error(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};
    use uuid::Uuid;

    use super::*;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().expect("in-memory sqlite");
        conn.execute_batch(include_str!("../migrations/V1__initial_schema.sql"))
            .expect("apply v1 migration");
        conn.execute_batch(include_str!(
            "../migrations/V2__workflow_and_fts_foundation.sql"
        ))
        .expect("apply v2 migration");
        conn.execute_batch(include_str!(
            "../migrations/V3__card_generation_workflow.sql"
        ))
        .expect("apply v3 migration");
        conn.execute_batch(include_str!(
            "../migrations/V4__points_ledger.sql"
        ))
        .expect("apply v4 migration");
        conn.execute_batch(include_str!(
            "../migrations/V5__card_animations.sql"
        ))
        .expect("apply v5 migration");
        conn.execute_batch(include_str!(
            "../migrations/V6__podcast_episodes.sql"
        ))
        .expect("apply v6 migration");
        conn.execute_batch(include_str!(
            "../migrations/V7__knowledge_graph.sql"
        ))
        .expect("apply v7 migration");
        conn.execute_batch(include_str!(
            "../migrations/V8__points_daily_bonus_rule.sql"
        ))
        .expect("apply v8 migration");
        conn.execute_batch(include_str!(
            "../migrations/V9__api_config_auth_mode.sql"
        ))
        .expect("apply v9 migration");
        conn.execute_batch(include_str!(
            "../migrations/V10__card_schema_extension.sql"
        ))
        .expect("apply v10 migration");
        conn.execute_batch(include_str!(
            "../migrations/V11__anchor_provenance.sql"
        ))
        .expect("apply v11 migration");
        conn.execute_batch(include_str!(
            "../migrations/V12__card_media.sql"
        ))
        .expect("apply v12 migration");
        conn.execute_batch(include_str!(
            "../migrations/V13__agent_document_workflow_foundation.sql"
        ))
        .expect("apply v13 migration");
        conn.execute_batch(include_str!(
            "../migrations/V14__chunk_embedding_state.sql"
        ))
        .expect("apply v14 migration");

        Database { conn }
    }

    #[test]
    fn replace_analysis_rebuilds_chunks_and_anchors() {
        let db = test_db();
        let repo = DocumentRepository::new(&db);

        let document = repo
            .create(CreateDocumentRequest {
                title: "Learning Systems.pdf".to_string(),
                file_path: "E:/docs/learning-systems.pdf".to_string(),
                file_type: "pdf".to_string(),
                file_size: Some(4096),
                page_count: None,
                content_hash: Some("abc123".to_string()),
            })
            .expect("create document");

        repo.replace_analysis(
            &document.id,
            ReplaceDocumentAnalysisRequest {
                page_count: 2,
                anchors: vec![CreateDocumentAnchorRequest {
                    id: None,
                    page: 1,
                    paragraph: Some(1),
                    text_quote: "Stable anchors matter for study workflows.".to_string(),
                    rects: vec![DocumentAnchorRect {
                        x: 0.1,
                        y: 0.2,
                        width: 0.3,
                        height: 0.04,
                    }],
                    hash: "anchor-hash-1".to_string(),
                    hierarchy_path: None,
                    quote_hash: None,
                }],
                sections: vec![CreateDocumentSectionRequest {
                    id: None,
                    section_index: 0,
                    heading: Some("Introduction".to_string()),
                    hierarchy_path: Some(vec!["Introduction".to_string()]),
                    page_start: Some(1),
                    page_end: Some(2),
                    anchor_start_id: None,
                    anchor_end_id: None,
                    content: "Stable anchors matter for study workflows.".to_string(),
                    token_count: Some(10),
                    metadata: None,
                }],
                chunks: vec![CreateDocumentChunkRequest {
                    id: None,
                    section_id: None,
                    anchor_id: None,
                    page_start: Some(1),
                    page_end: Some(2),
                    chunk_index: 0,
                    chunk_kind: Some("child".to_string()),
                    content: "Stable anchors matter for study workflows.".to_string(),
                    token_count: Some(10),
                    metadata: Some(serde_json::json!({
                        "anchorHashes": ["anchor-hash-1"]
                    })),
                }],
            },
        )
        .expect("replace analysis");

        let stored_document = repo
            .find_by_id(&document.id)
            .expect("load document")
            .expect("document exists");
        assert_eq!(stored_document.page_count, Some(2));
        assert_eq!(stored_document.status, "parsed");

        let sections = repo.list_sections(&document.id).expect("list sections");
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].heading.as_deref(), Some("Introduction"));

        let anchors = repo.list_anchors(&document.id).expect("list anchors");
        assert_eq!(anchors.len(), 1);
        assert_eq!(anchors[0].hash, "anchor-hash-1");

        let chunks = repo.list_chunks(&document.id).expect("list chunks");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].chunk_index, 0);
        assert_eq!(chunks[0].page_end, Some(2));
        assert_eq!(chunks[0].chunk_kind, "child");
    }

    #[test]
    fn fts_index_tracks_chunk_lifecycle() {
        let db = test_db();
        let repo = DocumentRepository::new(&db);

        let document = repo
            .create(CreateDocumentRequest {
                title: "Learning Systems".to_string(),
                file_path: "E:/docs/learning-systems.pdf".to_string(),
                file_type: "pdf".to_string(),
                file_size: None,
                page_count: Some(12),
                content_hash: None,
            })
            .expect("create document");

        db.connection()
            .execute(
                "INSERT INTO document_chunks (
                    id, document_id, page_start, page_end, chunk_index, content, token_count, metadata
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    Uuid::new_v4().to_string(),
                    document.id,
                    1,
                    1,
                    0,
                    "Study platforms need reliable retrieval and stable local-first boundaries",
                    24,
                    serde_json::Value::Null,
                ],
            )
            .expect("insert chunk");

        let initial_results = repo
            .search_chunks("platforms", Some(10))
            .expect("initial search");
        assert_eq!(initial_results.len(), 1);

        let chunk_id = initial_results[0].id.clone();

        db.connection()
            .execute(
                "UPDATE document_chunks SET content = ?1 WHERE id = ?2",
                params!["checkpoint recovery enables resumable workflows", chunk_id],
            )
            .expect("update chunk content");

        let old_results = repo
            .search_chunks("platforms", Some(10))
            .expect("search old token");
        assert!(old_results.is_empty());

        let new_results = repo
            .search_chunks("checkpoint", Some(10))
            .expect("search updated token");
        assert_eq!(new_results.len(), 1);

        db.connection()
            .execute(
                "DELETE FROM document_chunks WHERE id = ?1",
                params![chunk_id],
            )
            .expect("delete chunk");

        let deleted_results = repo
            .search_chunks("checkpoint", Some(10))
            .expect("search after delete");
        assert!(deleted_results.is_empty());
    }
}
