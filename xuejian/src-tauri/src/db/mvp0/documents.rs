use std::collections::HashSet;

use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row, Transaction};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::db::document_repo::{
    CreateDocumentAnchorRequest, CreateDocumentChunkRequest, CreateDocumentSectionRequest,
    DocumentChunk, DocumentSection,
};
use crate::db::Result;

use super::now_utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mvp0Document {
    pub id: String,
    pub title: String,
    pub original_filename: String,
    pub file_path: String,
    pub file_hash: String,
    pub file_size: i64,
    pub page_count: Option<i32>,
    pub chunking_profile: Option<serde_json::Value>,
    pub chunking_profile_revision: i32,
    pub parse_status: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateMvp0DocumentRequest {
    pub title: String,
    pub original_filename: String,
    pub file_path: String,
    pub file_hash: String,
    pub file_size: i64,
    pub page_count: Option<i32>,
    pub parse_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mvp0DocumentChunk {
    pub id: String,
    pub document_id: String,
    pub page_start: i32,
    pub page_end: i32,
    pub chunk_index: i32,
    pub text: String,
    pub char_count: i32,
    pub parser: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateMvp0DocumentChunkRequest {
    pub document_id: String,
    pub page_start: i32,
    pub page_end: i32,
    pub chunk_index: i32,
    pub text: String,
    pub parser: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mvp0SourceAnchor {
    pub id: String,
    pub document_id: String,
    pub chunk_id: Option<String>,
    pub page: i32,
    pub quote: String,
    pub bbox_json: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateMvp0SourceAnchorRequest {
    pub document_id: String,
    pub chunk_id: Option<String>,
    pub page: i32,
    pub quote: String,
    pub bbox_json: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReplaceMvp0DocumentAnalysisRequest {
    pub page_count: i32,
    #[serde(default)]
    pub chunking_profile: Option<serde_json::Value>,
    #[serde(default)]
    pub anchors: Vec<CreateDocumentAnchorRequest>,
    #[serde(default)]
    pub sections: Vec<CreateDocumentSectionRequest>,
    #[serde(default)]
    pub chunks: Vec<CreateDocumentChunkRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mvp0DocumentChunkSearchResult {
    pub id: String,
    pub document_id: String,
    pub section_id: Option<String>,
    pub anchor_id: Option<String>,
    pub chunk_index: i32,
    pub page_start: Option<i32>,
    pub page_end: Option<i32>,
    pub content: String,
    pub snippet: String,
    pub lexical_score: Option<f64>,
}

pub struct Mvp0DocumentRepository<'a> {
    conn: &'a Connection,
}

#[derive(Debug, Clone)]
struct AnalysisAnchorRecord {
    id: String,
    document_id: String,
    page: i32,
    paragraph: Option<i32>,
    quote: String,
    rects_json: String,
    bbox_json: Option<String>,
    hash: String,
    hierarchy_path_json: Option<String>,
    quote_hash: Option<String>,
    created_at: String,
}

#[derive(Debug, Clone)]
struct AnalysisSectionRecord {
    id: String,
    document_id: String,
    section_index: i32,
    heading: Option<String>,
    hierarchy_path_json: Option<String>,
    page_start: Option<i32>,
    page_end: Option<i32>,
    anchor_start_id: Option<String>,
    anchor_end_id: Option<String>,
    content: String,
    token_count: Option<i32>,
    metadata_json: Option<String>,
    created_at: String,
}

#[derive(Debug, Clone)]
struct AnalysisChunkRecord {
    id: String,
    document_id: String,
    section_id: Option<String>,
    anchor_id: Option<String>,
    page_start: i32,
    page_end: i32,
    chunk_index: i32,
    chunk_kind: String,
    text: String,
    token_count: i32,
    metadata_json: Option<String>,
    char_count: i32,
    parser: String,
    content_hash: String,
    created_at: String,
}

impl<'a> Mvp0DocumentRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn create_document(&self, req: CreateMvp0DocumentRequest) -> Result<Mvp0Document> {
        let document = Mvp0Document {
            id: Uuid::new_v4().to_string(),
            title: req.title,
            original_filename: req.original_filename,
            file_path: req.file_path,
            file_hash: req.file_hash,
            file_size: req.file_size,
            page_count: req.page_count,
            chunking_profile: None,
            chunking_profile_revision: 0,
            parse_status: req.parse_status.unwrap_or_else(|| "pending".to_string()),
            created_at: now_utc(),
            updated_at: now_utc(),
            deleted_at: None,
        };

        self.conn.execute(
            "INSERT INTO documents (
                id, title, original_filename, file_path, file_hash, file_size,
                page_count, parse_status, created_at, updated_at, deleted_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL)",
            params![
                &document.id,
                &document.title,
                &document.original_filename,
                &document.file_path,
                &document.file_hash,
                document.file_size,
                document.page_count,
                &document.parse_status,
                &document.created_at,
                &document.updated_at,
            ],
        )?;

        Ok(document)
    }

    pub fn find_document_by_id(&self, id: &str) -> Result<Option<Mvp0Document>> {
        self.conn
            .query_row(
                "SELECT id, title, original_filename, file_path, file_hash, file_size, page_count,
                        chunking_profile, chunking_profile_revision,
                        parse_status, created_at, updated_at, deleted_at
                 FROM documents
                 WHERE id = ?1 AND deleted_at IS NULL",
                [id],
                map_document,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn find_document_by_hash(&self, file_hash: &str) -> Result<Option<Mvp0Document>> {
        self.conn
            .query_row(
                "SELECT id, title, original_filename, file_path, file_hash, file_size, page_count,
                        chunking_profile, chunking_profile_revision,
                        parse_status, created_at, updated_at, deleted_at
                 FROM documents
                 WHERE file_hash = ?1 AND deleted_at IS NULL",
                [file_hash],
                map_document,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_documents(&self, include_deleted: bool) -> Result<Vec<Mvp0Document>> {
        let sql = if include_deleted {
            "SELECT id, title, original_filename, file_path, file_hash, file_size, page_count,
                chunking_profile, chunking_profile_revision,
                parse_status, created_at, updated_at, deleted_at
             FROM documents
             ORDER BY created_at DESC"
        } else {
            "SELECT id, title, original_filename, file_path, file_hash, file_size, page_count,
                chunking_profile, chunking_profile_revision,
                parse_status, created_at, updated_at, deleted_at
             FROM documents
             WHERE deleted_at IS NULL
             ORDER BY created_at DESC"
        };
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map([], map_document)?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn update_parse_status(&self, id: &str, parse_status: &str) -> Result<()> {
        let updated_at = now_utc();
        self.conn.execute(
            "UPDATE documents
             SET parse_status = ?2,
                 updated_at = ?3
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, parse_status, updated_at],
        )?;
        Ok(())
    }

    pub fn replace_analysis(
        &self,
        document_id: &str,
        req: ReplaceMvp0DocumentAnalysisRequest,
    ) -> Result<()> {
        let updated_at = now_utc();
        let tx = self.conn.unchecked_transaction()?;

        let existing_chunk_ids = load_ids(
            &tx,
            "SELECT id FROM document_chunks WHERE document_id = ?1",
            document_id,
        )?;
        let existing_section_ids = load_ids(
            &tx,
            "SELECT id FROM document_sections WHERE document_id = ?1",
            document_id,
        )?;
        let existing_anchor_ids = load_ids(
            &tx,
            "SELECT id FROM document_anchors WHERE document_id = ?1",
            document_id,
        )?;
        let existing_source_anchor_ids = load_ids(
            &tx,
            "SELECT id FROM source_anchors WHERE document_id = ?1",
            document_id,
        )?;

        let (current_chunking_profile, current_chunking_profile_revision) = tx
            .query_row(
                "SELECT chunking_profile, chunking_profile_revision
                 FROM documents
                 WHERE id = ?1 AND deleted_at IS NULL",
                [document_id],
                |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, i32>(1)?)),
            )
            .optional()?
            .unwrap_or((None, 0));

        let chunking_profile = req
            .chunking_profile
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let chunking_profile_revision = if current_chunking_profile == chunking_profile {
            current_chunking_profile_revision
        } else {
            current_chunking_profile_revision + 1
        };

        let anchors = req
            .anchors
            .into_iter()
            .map(|anchor| normalize_analysis_anchor(document_id, anchor))
            .collect::<Result<Vec<_>>>()?;
        let sections = req
            .sections
            .into_iter()
            .map(|section| normalize_analysis_section(document_id, section))
            .collect::<Result<Vec<_>>>()?;
        let chunks = req
            .chunks
            .into_iter()
            .map(|chunk| normalize_analysis_chunk(document_id, chunk))
            .collect::<Result<Vec<_>>>()?;

        let next_chunk_ids = chunks.iter().map(|chunk| chunk.id.clone()).collect::<HashSet<_>>();
        let next_section_ids = sections
            .iter()
            .map(|section| section.id.clone())
            .collect::<HashSet<_>>();
        let next_anchor_ids = anchors
            .iter()
            .map(|anchor| anchor.id.clone())
            .collect::<HashSet<_>>();

        for stale_chunk_id in existing_chunk_ids.difference(&next_chunk_ids) {
            tx.execute(
                "UPDATE source_anchors SET chunk_id = NULL WHERE chunk_id = ?1",
                [stale_chunk_id.as_str()],
            )?;
            tx.execute("DELETE FROM document_chunks WHERE id = ?1", [stale_chunk_id.as_str()])?;
        }

        for stale_section_id in existing_section_ids.difference(&next_section_ids) {
            tx.execute(
                "DELETE FROM document_sections WHERE id = ?1",
                [stale_section_id.as_str()],
            )?;
        }

        for anchor in &anchors {
            tx.execute(
                "INSERT INTO document_anchors (
                    id, document_id, page, paragraph, text_quote, rects, hash,
                    hierarchy_path, quote_hash, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(id) DO UPDATE SET
                    document_id = excluded.document_id,
                    page = excluded.page,
                    paragraph = excluded.paragraph,
                    text_quote = excluded.text_quote,
                    rects = excluded.rects,
                    hash = excluded.hash,
                    hierarchy_path = excluded.hierarchy_path,
                    quote_hash = excluded.quote_hash",
                params![
                    &anchor.id,
                    &anchor.document_id,
                    anchor.page,
                    anchor.paragraph,
                    &anchor.quote,
                    &anchor.rects_json,
                    &anchor.hash,
                    &anchor.hierarchy_path_json,
                    &anchor.quote_hash,
                    &anchor.created_at,
                ],
            )?;

            tx.execute(
                "INSERT INTO source_anchors (
                    id, document_id, chunk_id, page, quote, bbox_json, created_at
                 ) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET
                    document_id = excluded.document_id,
                    page = excluded.page,
                    quote = excluded.quote,
                    bbox_json = excluded.bbox_json,
                    created_at = excluded.created_at,
                    chunk_id = NULL",
                params![
                    &anchor.id,
                    &anchor.document_id,
                    anchor.page,
                    &anchor.quote,
                    &anchor.bbox_json,
                    &anchor.created_at,
                ],
            )?;
        }

        for section in &sections {
            tx.execute(
                "INSERT INTO document_sections (
                    id, document_id, section_index, heading, hierarchy_path, page_start, page_end,
                    anchor_start_id, anchor_end_id, content, token_count, metadata, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                 ON CONFLICT(id) DO UPDATE SET
                    document_id = excluded.document_id,
                    section_index = excluded.section_index,
                    heading = excluded.heading,
                    hierarchy_path = excluded.hierarchy_path,
                    page_start = excluded.page_start,
                    page_end = excluded.page_end,
                    anchor_start_id = excluded.anchor_start_id,
                    anchor_end_id = excluded.anchor_end_id,
                    content = excluded.content,
                    token_count = excluded.token_count,
                    metadata = excluded.metadata",
                params![
                    &section.id,
                    &section.document_id,
                    section.section_index,
                    &section.heading,
                    &section.hierarchy_path_json,
                    section.page_start,
                    section.page_end,
                    &section.anchor_start_id,
                    &section.anchor_end_id,
                    &section.content,
                    section.token_count,
                    &section.metadata_json,
                    &section.created_at,
                ],
            )?;
        }

        for chunk in &chunks {
            tx.execute(
                "INSERT INTO document_chunks (
                    id, document_id, section_id, anchor_id, page_start, page_end, chunk_index,
                    chunk_kind, content, token_count, metadata, text, char_count, parser,
                    content_hash, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
                 ON CONFLICT(id) DO UPDATE SET
                    document_id = excluded.document_id,
                    section_id = excluded.section_id,
                    anchor_id = excluded.anchor_id,
                    page_start = excluded.page_start,
                    page_end = excluded.page_end,
                    chunk_index = excluded.chunk_index,
                    chunk_kind = excluded.chunk_kind,
                    content = excluded.content,
                    token_count = excluded.token_count,
                    metadata = excluded.metadata,
                    text = excluded.text,
                    char_count = excluded.char_count,
                    parser = excluded.parser,
                    content_hash = excluded.content_hash",
                params![
                    &chunk.id,
                    &chunk.document_id,
                    &chunk.section_id,
                    &chunk.anchor_id,
                    chunk.page_start,
                    chunk.page_end,
                    chunk.chunk_index,
                    &chunk.chunk_kind,
                    &chunk.text,
                    chunk.token_count,
                    &chunk.metadata_json,
                    &chunk.text,
                    chunk.char_count,
                    &chunk.parser,
                    &chunk.content_hash,
                    &chunk.created_at,
                ],
            )?;
        }

        tx.execute(
            "UPDATE source_anchors
             SET chunk_id = NULL
             WHERE document_id = ?1",
            [document_id],
        )?;
        tx.execute(
            "UPDATE source_anchors
             SET chunk_id = (
                 SELECT dc.id
                 FROM document_chunks dc
                 WHERE dc.document_id = source_anchors.document_id
                   AND dc.anchor_id = source_anchors.id
                 ORDER BY dc.chunk_index ASC
                 LIMIT 1
             )
             WHERE document_id = ?1",
            [document_id],
        )?;

        for stale_anchor_id in existing_source_anchor_ids.difference(&next_anchor_ids) {
            tx.execute(
                "DELETE FROM source_anchors WHERE id = ?1",
                [stale_anchor_id.as_str()],
            )?;
        }
        for stale_anchor_id in existing_anchor_ids.difference(&next_anchor_ids) {
            tx.execute(
                "DELETE FROM document_anchors WHERE id = ?1",
                [stale_anchor_id.as_str()],
            )?;
        }

        tx.execute(
            "UPDATE documents
             SET page_count = ?2,
                 parse_status = 'parsed',
                 chunking_profile = ?3,
                 chunking_profile_revision = ?4,
                 updated_at = ?5
             WHERE id = ?1 AND deleted_at IS NULL",
            params![
                document_id,
                req.page_count,
                &chunking_profile,
                chunking_profile_revision,
                &updated_at,
            ],
        )?;

        tx.commit()?;
        Ok(())
    }

    pub fn soft_delete_document(&self, id: &str) -> Result<bool> {
        let deleted_at = now_utc();
        let affected = self.conn.execute(
            "UPDATE documents
                SET deleted_at = ?2, updated_at = ?2
              WHERE id = ?1 AND deleted_at IS NULL",
            params![id, deleted_at],
        )?;
        Ok(affected > 0)
    }

    pub fn create_chunk(&self, req: CreateMvp0DocumentChunkRequest) -> Result<Mvp0DocumentChunk> {
        let chunk = Mvp0DocumentChunk {
            id: Uuid::new_v4().to_string(),
            document_id: req.document_id,
            page_start: req.page_start,
            page_end: req.page_end,
            chunk_index: req.chunk_index,
            char_count: req.text.chars().count() as i32,
            text: req.text,
            parser: req.parser,
            created_at: now_utc(),
        };

        self.conn.execute(
            "INSERT INTO document_chunks (
                id, document_id, page_start, page_end, chunk_index,
                content, token_count, metadata, text, char_count, parser, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, ?9, ?10, ?11)",
            params![
                &chunk.id,
                &chunk.document_id,
                chunk.page_start,
                chunk.page_end,
                chunk.chunk_index,
                &chunk.text,
                chunk.char_count,
                &chunk.text,
                chunk.char_count,
                &chunk.parser,
                &chunk.created_at,
            ],
        )?;

        Ok(chunk)
    }

    pub fn list_chunks(&self, document_id: &str) -> Result<Vec<Mvp0DocumentChunk>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, document_id, page_start, page_end, chunk_index, text, char_count, parser, created_at
             FROM document_chunks
             WHERE document_id = ?1
             ORDER BY chunk_index ASC",
        )?;
        let rows = stmt.query_map([document_id], map_chunk)?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn list_structured_chunks(&self, document_id: &str) -> Result<Vec<DocumentChunk>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, document_id, section_id, anchor_id, page_start, page_end, chunk_index,
                    chunk_kind, content, token_count, metadata, created_at
             FROM document_chunks
             WHERE document_id = ?1
             ORDER BY chunk_index ASC",
        )?;
        let rows = stmt.query_map([document_id], map_structured_chunk)?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn list_sections(&self, document_id: &str) -> Result<Vec<DocumentSection>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, document_id, section_index, heading, hierarchy_path, page_start, page_end,
                    anchor_start_id, anchor_end_id, content, token_count, metadata, created_at
             FROM document_sections
             WHERE document_id = ?1
             ORDER BY section_index ASC",
        )?;
        let rows = stmt.query_map([document_id], map_section)?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn search_chunks(
        &self,
        query: &str,
        document_ids: Option<&[String]>,
        limit: i64,
    ) -> Result<Vec<Mvp0DocumentChunkSearchResult>> {
        let keywords = extract_search_terms(query);
        if keywords.is_empty() {
            return Ok(Vec::new());
        }

        let mut chunks = Vec::new();
        if let Some(document_ids) = document_ids.filter(|ids| !ids.is_empty()) {
            for document_id in document_ids {
                chunks.extend(self.list_structured_chunks(document_id)?);
            }
        } else {
            for document in self.list_documents(false)? {
                chunks.extend(self.list_structured_chunks(&document.id)?);
            }
        }

        let query_lower = query.trim().to_lowercase();
        let mut scored = chunks
            .into_iter()
            .filter_map(|chunk| {
                let content_lower = chunk.content.to_lowercase();
                let matched_terms = keywords
                    .iter()
                    .filter(|term| content_lower.contains(term.as_str()))
                    .count();
                if matched_terms == 0 && !content_lower.contains(&query_lower) {
                    return None;
                }
                let exact_bonus = if !query_lower.is_empty() && content_lower.contains(&query_lower)
                {
                    keywords.len().max(1)
                } else {
                    0
                };
                Some((matched_terms + exact_bonus, chunk))
            })
            .collect::<Vec<_>>();

        scored.sort_by(|(left_score, left_chunk), (right_score, right_chunk)| {
            right_score
                .cmp(left_score)
                .then_with(|| left_chunk.chunk_index.cmp(&right_chunk.chunk_index))
        });

        Ok(scored
            .into_iter()
            .take(limit.max(0) as usize)
            .map(|(score, chunk)| Mvp0DocumentChunkSearchResult {
                id: chunk.id,
                document_id: chunk.document_id,
                section_id: chunk.section_id,
                anchor_id: chunk.anchor_id,
                chunk_index: chunk.chunk_index,
                page_start: chunk.page_start,
                page_end: chunk.page_end,
                snippet: build_search_snippet(&chunk.content, &keywords),
                content: chunk.content,
                lexical_score: Some(score as f64),
            })
            .collect())
    }

    pub fn search_chunks_fts5(
        &self,
        query: &str,
        document_ids: Option<&[String]>,
        limit: i64,
    ) -> Result<Vec<Mvp0DocumentChunkSearchResult>> {
        let mut last_error = None;

        for fts_query in build_fts_queries(query) {
            match self.search_chunks_fts_query(&fts_query, document_ids, limit.max(1)) {
                Ok(results) if !results.is_empty() => return Ok(results),
                Ok(_) => {}
                Err(error) => last_error = Some(error),
            }
        }

        if let Some(error) = last_error {
            return Err(error);
        }

        Ok(Vec::new())
    }

    fn search_chunks_fts_query(
        &self,
        query: &str,
        document_ids: Option<&[String]>,
        limit: i64,
    ) -> Result<Vec<Mvp0DocumentChunkSearchResult>> {
        let (scope_clause, mut scope_params) = document_scope_clause(document_ids, 2);
        let limit_index = scope_params.len() + 2;
        let sql = format!(
            "SELECT c.id, c.document_id, c.section_id, c.anchor_id, c.chunk_index,
                    c.page_start, c.page_end, c.content,
                    snippet(document_chunks_fts, 0, '[', ']', '...', 12) AS snippet,
                    bm25(document_chunks_fts) AS bm25_score
             FROM document_chunks_fts
             JOIN document_chunks c ON c.rowid = document_chunks_fts.rowid
             WHERE document_chunks_fts MATCH ?1
               {scope_clause}
             ORDER BY bm25(document_chunks_fts)
             LIMIT ?{limit_index}"
        );

        let mut params = Vec::with_capacity(scope_params.len() + 2);
        params.push(rusqlite::types::Value::from(query.to_string()));
        params.append(&mut scope_params);
        params.push(rusqlite::types::Value::from(limit.max(1)));

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(params), |row| {
            let bm25_score: f64 = row.get(9)?;
            Ok(Mvp0DocumentChunkSearchResult {
                id: row.get(0)?,
                document_id: row.get(1)?,
                section_id: row.get(2)?,
                anchor_id: row.get(3)?,
                chunk_index: row.get(4)?,
                page_start: row.get(5)?,
                page_end: row.get(6)?,
                content: row.get(7)?,
                snippet: row.get(8)?,
                lexical_score: Some(-bm25_score),
            })
        })?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn create_source_anchor(
        &self,
        req: CreateMvp0SourceAnchorRequest,
    ) -> Result<Mvp0SourceAnchor> {
        let anchor = Mvp0SourceAnchor {
            id: Uuid::new_v4().to_string(),
            document_id: req.document_id,
            chunk_id: req.chunk_id,
            page: req.page,
            quote: req.quote,
            bbox_json: req.bbox_json,
            created_at: now_utc(),
        };

        self.conn.execute(
            "INSERT INTO source_anchors (
                id, document_id, chunk_id, page, quote, bbox_json, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                &anchor.id,
                &anchor.document_id,
                &anchor.chunk_id,
                anchor.page,
                &anchor.quote,
                &anchor.bbox_json,
                &anchor.created_at,
            ],
        )?;

        Ok(anchor)
    }

    pub fn list_source_anchors(&self, document_id: &str) -> Result<Vec<Mvp0SourceAnchor>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, document_id, chunk_id, page, quote, bbox_json, created_at
             FROM source_anchors
             WHERE document_id = ?1
             ORDER BY page ASC, created_at ASC",
        )?;
        let rows = stmt.query_map([document_id], map_source_anchor)?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn find_source_anchor_by_id(&self, anchor_id: &str) -> Result<Option<Mvp0SourceAnchor>> {
        self.conn
            .query_row(
                "SELECT id, document_id, chunk_id, page, quote, bbox_json, created_at
                 FROM source_anchors
                 WHERE id = ?1",
                [anchor_id],
                map_source_anchor,
            )
            .optional()
            .map_err(Into::into)
    }
}

fn extract_search_terms(query: &str) -> Vec<String> {
    let sanitized = query
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || is_cjk(character) {
                character
            } else {
                ' '
            }
        })
        .collect::<String>();

    let mut terms = Vec::new();
    for token in sanitized.split_whitespace() {
        if token.len() >= 2 {
            push_unique_term(&mut terms, token.to_string());
        }

        if token.chars().all(is_cjk) && token.chars().count() > 4 {
            let chars = token.chars().collect::<Vec<_>>();
            for width in 2..=4 {
                if chars.len() < width {
                    continue;
                }
                for start in 0..=chars.len() - width {
                    let term = chars[start..start + width].iter().collect::<String>();
                    push_unique_term(&mut terms, term);
                    if terms.len() >= 12 {
                        break;
                    }
                }
                if terms.len() >= 12 {
                    break;
                }
            }
        }

        if terms.len() >= 12 {
            break;
        }
    }

    terms
}

fn document_scope_clause(
    document_ids: Option<&[String]>,
    start_index: usize,
) -> (String, Vec<rusqlite::types::Value>) {
    let Some(document_ids) = document_ids else {
        return (String::new(), Vec::new());
    };

    if document_ids.is_empty() {
        return (String::new(), Vec::new());
    }

    let placeholders = document_ids
        .iter()
        .enumerate()
        .map(|(index, _)| format!("?{}", start_index + index))
        .collect::<Vec<_>>();
    let params = document_ids
        .iter()
        .cloned()
        .map(rusqlite::types::Value::from)
        .collect();

    (
        format!("AND c.document_id IN ({})", placeholders.join(", ")),
        params,
    )
}

fn build_fts_queries(query: &str) -> Vec<String> {
    let keywords = extract_search_terms(query);
    let mut queries = Vec::new();

    if !keywords.is_empty() {
        queries.push(
            keywords
                .iter()
                .map(|keyword| quote_fts_term(keyword))
                .collect::<Vec<_>>()
                .join(" OR "),
        );
        if keywords.len() > 1 {
            queries.push(
                keywords
                    .iter()
                    .map(|keyword| quote_fts_term(keyword))
                    .collect::<Vec<_>>()
                    .join(" "),
            );
        }
    }

    queries.retain(|item| !item.trim().is_empty());
    queries.dedup();
    queries
}

fn quote_fts_term(term: &str) -> String {
    format!("\"{}\"", term.replace('"', "\"\""))
}

fn push_unique_term(terms: &mut Vec<String>, term: String) {
    if term.len() >= 2 && !terms.iter().any(|existing| existing == &term) {
        terms.push(term);
    }
}

fn is_cjk(character: char) -> bool {
    matches!(character as u32, 0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0xF900..=0xFAFF)
}

fn build_search_snippet(content: &str, keywords: &[String]) -> String {
    let content_lower = content.to_lowercase();
    let best_index = keywords
        .iter()
        .filter_map(|keyword| content_lower.find(keyword).map(|index| index))
        .min();

    let Some(byte_index) = best_index else {
        return content.chars().take(120).collect();
    };

    let char_index = content[..byte_index].chars().count();
    let start = char_index.saturating_sub(18);
    let snippet = content.chars().skip(start).take(120).collect::<String>();
    if start == 0 {
        snippet
    } else {
        format!("...{snippet}")
    }
}

fn map_document(row: &Row<'_>) -> rusqlite::Result<Mvp0Document> {
    Ok(Mvp0Document {
        id: row.get(0)?,
        title: row.get(1)?,
        original_filename: row.get(2)?,
        file_path: row.get(3)?,
        file_hash: row.get(4)?,
        file_size: row.get(5)?,
        page_count: row.get(6)?,
        chunking_profile: parse_json_column(row, 7)?,
        chunking_profile_revision: row.get(8)?,
        parse_status: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        deleted_at: row.get(12)?,
    })
}

fn map_chunk(row: &Row<'_>) -> rusqlite::Result<Mvp0DocumentChunk> {
    Ok(Mvp0DocumentChunk {
        id: row.get(0)?,
        document_id: row.get(1)?,
        page_start: row.get(2)?,
        page_end: row.get(3)?,
        chunk_index: row.get(4)?,
        text: row.get(5)?,
        char_count: row.get(6)?,
        parser: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn map_structured_chunk(row: &Row<'_>) -> rusqlite::Result<DocumentChunk> {
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
        metadata: parse_json_column(row, 10)?,
        created_at: row.get(11)?,
    })
}

fn map_section(row: &Row<'_>) -> rusqlite::Result<DocumentSection> {
    Ok(DocumentSection {
        id: row.get(0)?,
        document_id: row.get(1)?,
        section_index: row.get(2)?,
        heading: row.get(3)?,
        hierarchy_path: parse_vec_string_column(row, 4)?,
        page_start: row.get(5)?,
        page_end: row.get(6)?,
        anchor_start_id: row.get(7)?,
        anchor_end_id: row.get(8)?,
        content: row.get(9)?,
        token_count: row.get(10)?,
        metadata: parse_json_column(row, 11)?,
        created_at: row.get(12)?,
    })
}

fn map_source_anchor(row: &Row<'_>) -> rusqlite::Result<Mvp0SourceAnchor> {
    Ok(Mvp0SourceAnchor {
        id: row.get(0)?,
        document_id: row.get(1)?,
        chunk_id: row.get(2)?,
        page: row.get(3)?,
        quote: row.get(4)?,
        bbox_json: row.get(5)?,
        created_at: row.get(6)?,
    })
}

fn parse_json_column(
    row: &Row<'_>,
    index: usize,
) -> rusqlite::Result<Option<serde_json::Value>> {
    row.get::<_, Option<String>>(index)?
        .map(|value| serde_json::from_str::<serde_json::Value>(&value))
        .transpose()
        .map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                index,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })
}

fn parse_vec_string_column(row: &Row<'_>, index: usize) -> rusqlite::Result<Vec<String>> {
    row.get::<_, Option<String>>(index)?
        .map(|value| serde_json::from_str::<Vec<String>>(&value))
        .transpose()
        .map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                index,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })
        .map(|value| value.unwrap_or_default())
}

fn load_ids(tx: &Transaction<'_>, sql: &str, document_id: &str) -> Result<HashSet<String>> {
    let mut stmt = tx.prepare(sql)?;
    let rows = stmt.query_map([document_id], |row| row.get::<_, String>(0))?;

    rows.collect::<std::result::Result<HashSet<_>, _>>()
        .map_err(Into::into)
}

fn normalize_analysis_anchor(
    document_id: &str,
    anchor: CreateDocumentAnchorRequest,
) -> Result<AnalysisAnchorRecord> {
    let id = anchor.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let rects_json = serde_json::to_string(&anchor.rects)?;
    let hierarchy_path_json = anchor
        .hierarchy_path
        .as_deref()
        .map(serde_json::to_string)
        .transpose()?;
    let hash = if anchor.hash.trim().is_empty() {
        compute_content_hash(&anchor.text_quote)
    } else {
        anchor.hash
    };
    let bbox_json = if anchor.rects.is_empty() {
        None
    } else {
        Some(rects_json.clone())
    };

    Ok(AnalysisAnchorRecord {
        id,
        document_id: document_id.to_string(),
        page: anchor.page,
        paragraph: anchor.paragraph,
        quote: anchor.text_quote,
        rects_json,
        bbox_json,
        hash,
        hierarchy_path_json,
        quote_hash: anchor.quote_hash,
        created_at: now_utc(),
    })
}

fn normalize_analysis_section(
    document_id: &str,
    section: CreateDocumentSectionRequest,
) -> Result<AnalysisSectionRecord> {
    Ok(AnalysisSectionRecord {
        id: section.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
        document_id: document_id.to_string(),
        section_index: section.section_index,
        heading: section.heading,
        hierarchy_path_json: section
            .hierarchy_path
            .as_deref()
            .map(serde_json::to_string)
            .transpose()?,
        page_start: section.page_start,
        page_end: section.page_end,
        anchor_start_id: section.anchor_start_id,
        anchor_end_id: section.anchor_end_id,
        content: section.content,
        token_count: section.token_count,
        metadata_json: section.metadata.as_ref().map(serde_json::to_string).transpose()?,
        created_at: now_utc(),
    })
}

fn normalize_analysis_chunk(
    document_id: &str,
    chunk: CreateDocumentChunkRequest,
) -> Result<AnalysisChunkRecord> {
    let text = chunk.content;
    let char_count = text.chars().count() as i32;
    let chunk_kind = chunk.chunk_kind.unwrap_or_else(|| "semantic".to_string());
    let parser = if chunk_kind.contains("::") {
        chunk_kind.clone()
    } else {
        format!("pymupdf::{chunk_kind}")
    };
    let page_start = chunk.page_start.or(chunk.page_end).unwrap_or(1);
    let page_end = chunk.page_end.or(chunk.page_start).unwrap_or(page_start);

    Ok(AnalysisChunkRecord {
        id: chunk.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
        document_id: document_id.to_string(),
        section_id: chunk.section_id,
        anchor_id: chunk.anchor_id,
        page_start,
        page_end,
        chunk_index: chunk.chunk_index,
        chunk_kind,
        token_count: chunk.token_count.unwrap_or(char_count),
        metadata_json: chunk.metadata.as_ref().map(serde_json::to_string).transpose()?,
        char_count,
        parser,
        content_hash: compute_content_hash(&text),
        text,
        created_at: now_utc(),
    })
}

fn compute_content_hash(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::TestDatabase;

    #[test]
    fn file_hash_unique_constraint() {
        let test_db = TestDatabase::new();
        let repo = Mvp0DocumentRepository::new(test_db.connection());

        repo.create_document(CreateMvp0DocumentRequest {
            title: "Learning Systems".to_string(),
            original_filename: "learning-systems.pdf".to_string(),
            file_path: "E:/docs/learning-systems.pdf".to_string(),
            file_hash: "hash-1".to_string(),
            file_size: 4096,
            page_count: Some(8),
            parse_status: Some("pending".to_string()),
        })
        .expect("first insert should succeed");

        let duplicate = repo.create_document(CreateMvp0DocumentRequest {
            title: "Learning Systems Copy".to_string(),
            original_filename: "learning-systems-copy.pdf".to_string(),
            file_path: "E:/docs/learning-systems-copy.pdf".to_string(),
            file_hash: "hash-1".to_string(),
            file_size: 4096,
            page_count: Some(8),
            parse_status: Some("pending".to_string()),
        });

        assert!(duplicate.is_err(), "duplicate file_hash must be rejected");
    }

    #[test]
    fn replace_analysis_overwrites_previous_chunks_and_anchors() {
        let test_db = TestDatabase::new();
        let repo = Mvp0DocumentRepository::new(test_db.connection());

        let document = repo
            .create_document(CreateMvp0DocumentRequest {
                title: "Learning Systems".to_string(),
                original_filename: "learning-systems.pdf".to_string(),
                file_path: "E:/docs/learning-systems.pdf".to_string(),
                file_hash: "hash-analysis".to_string(),
                file_size: 4096,
                page_count: None,
                parse_status: Some("pending".to_string()),
            })
            .expect("document should be created");

        repo.replace_analysis(
            &document.id,
            ReplaceMvp0DocumentAnalysisRequest {
                page_count: 4,
                chunking_profile: Some(serde_json::json!({
                    "strategy": "docling_parent_child_v1",
                    "maxParentChars": 6000,
                    "maxChildChars": 900,
                    "overlapUnits": 1,
                })),
                anchors: vec![CreateDocumentAnchorRequest {
                    id: Some("anchor-one".to_string()),
                    page: 1,
                    paragraph: None,
                    text_quote: "quote one".to_string(),
                    rects: Vec::new(),
                    hash: "hash-one".to_string(),
                    hierarchy_path: Some(vec!["Section A".to_string()]),
                    quote_hash: Some("quote-hash-one".to_string()),
                }],
                sections: vec![CreateDocumentSectionRequest {
                    id: Some("section-one".to_string()),
                    section_index: 0,
                    heading: Some("Section A".to_string()),
                    hierarchy_path: Some(vec!["Section A".to_string()]),
                    page_start: Some(1),
                    page_end: Some(2),
                    anchor_start_id: Some("anchor-one".to_string()),
                    anchor_end_id: Some("anchor-one".to_string()),
                    content: "section one".to_string(),
                    token_count: Some(2),
                    metadata: Some(serde_json::json!({"sectionKind": "heading_section"})),
                }],
                chunks: vec![CreateDocumentChunkRequest {
                    id: Some("chunk-one".to_string()),
                    section_id: Some("section-one".to_string()),
                    anchor_id: Some("anchor-one".to_string()),
                    page_start: Some(1),
                    page_end: Some(2),
                    chunk_index: 0,
                    chunk_kind: Some("child".to_string()),
                    content: "chunk one".to_string(),
                    token_count: Some(2),
                    metadata: Some(serde_json::json!({"childIndex": 0})),
                }],
            },
        )
        .expect("first analysis write should succeed");

        repo.replace_analysis(
            &document.id,
            ReplaceMvp0DocumentAnalysisRequest {
                page_count: 6,
                chunking_profile: Some(serde_json::json!({
                    "strategy": "docling_parent_child_v1",
                    "maxParentChars": 6000,
                    "maxChildChars": 900,
                    "overlapUnits": 1,
                })),
                anchors: vec![CreateDocumentAnchorRequest {
                    id: Some("anchor-two".to_string()),
                    page: 3,
                    paragraph: None,
                    text_quote: "quote two".to_string(),
                    rects: Vec::new(),
                    hash: "hash-two".to_string(),
                    hierarchy_path: Some(vec!["Section B".to_string()]),
                    quote_hash: Some("quote-hash-two".to_string()),
                }],
                sections: vec![CreateDocumentSectionRequest {
                    id: Some("section-two".to_string()),
                    section_index: 0,
                    heading: Some("Section B".to_string()),
                    hierarchy_path: Some(vec!["Section B".to_string()]),
                    page_start: Some(3),
                    page_end: Some(4),
                    anchor_start_id: Some("anchor-two".to_string()),
                    anchor_end_id: Some("anchor-two".to_string()),
                    content: "section two".to_string(),
                    token_count: Some(2),
                    metadata: Some(serde_json::json!({"sectionKind": "heading_section"})),
                }],
                chunks: vec![CreateDocumentChunkRequest {
                    id: Some("chunk-two".to_string()),
                    section_id: Some("section-two".to_string()),
                    anchor_id: Some("anchor-two".to_string()),
                    page_start: Some(3),
                    page_end: Some(4),
                    chunk_index: 0,
                    chunk_kind: Some("child".to_string()),
                    content: "chunk two".to_string(),
                    token_count: Some(2),
                    metadata: Some(serde_json::json!({"childIndex": 0})),
                }],
            },
        )
        .expect("second analysis write should replace prior data");

        let chunks = repo
            .list_chunks(&document.id)
            .expect("chunks should load after replace");
        let structured_chunks = repo
            .list_structured_chunks(&document.id)
            .expect("structured chunks should load after replace");
        let anchors = repo
            .list_source_anchors(&document.id)
            .expect("anchors should load after replace");
        let sections = repo
            .list_sections(&document.id)
            .expect("sections should load after replace");
        let stored_document = repo
            .find_document_by_id(&document.id)
            .expect("document should load")
            .expect("document should still exist");

        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].text, "chunk two");
        let legacy_chunk_columns: (String, String, i32, i32) = test_db
            .connection()
            .query_row(
                "SELECT content, text, token_count, char_count
                 FROM document_chunks
                 WHERE document_id = ?1",
                [&document.id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("legacy and runtime chunk columns should load");
        assert_eq!(legacy_chunk_columns.0, "chunk two");
        assert_eq!(legacy_chunk_columns.1, "chunk two");
        assert_eq!(legacy_chunk_columns.2, 2);
        assert_eq!(legacy_chunk_columns.3, "chunk two".chars().count() as i32);
        assert_eq!(structured_chunks.len(), 1);
        assert_eq!(structured_chunks[0].section_id.as_deref(), Some("section-two"));
        assert_eq!(structured_chunks[0].anchor_id.as_deref(), Some("anchor-two"));
        assert_eq!(structured_chunks[0].chunk_kind, "child");
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].id, "section-two");
        assert_eq!(sections[0].anchor_start_id.as_deref(), Some("anchor-two"));
        assert_eq!(anchors.len(), 1);
        assert_eq!(anchors[0].quote, "quote two");
        assert_eq!(anchors[0].id, "anchor-two");
        assert_eq!(stored_document.page_count, Some(6));
        assert_eq!(stored_document.parse_status, "parsed");
    }

    #[test]
    fn search_chunks_fts5_returns_structured_matches() {
        let test_db = TestDatabase::new();
        let repo = Mvp0DocumentRepository::new(test_db.connection());

        let document = repo
            .create_document(CreateMvp0DocumentRequest {
                title: "机器学习导论".to_string(),
                original_filename: "ml.pdf".to_string(),
                file_path: "E:/docs/ml.pdf".to_string(),
                file_hash: "hash-search-fts".to_string(),
                file_size: 2048,
                page_count: None,
                parse_status: Some("pending".to_string()),
            })
            .expect("document should be created");

        repo.replace_analysis(
            &document.id,
            ReplaceMvp0DocumentAnalysisRequest {
                page_count: 1,
                chunking_profile: None,
                anchors: vec![CreateDocumentAnchorRequest {
                    id: Some("anchor-search".to_string()),
                    page: 1,
                    paragraph: None,
                    text_quote: "机器学习用于分类与回归。".to_string(),
                    rects: Vec::new(),
                    hash: "anchor-search-hash".to_string(),
                    hierarchy_path: None,
                    quote_hash: None,
                }],
                sections: vec![CreateDocumentSectionRequest {
                    id: Some("section-search".to_string()),
                    section_index: 0,
                    heading: Some("概览".to_string()),
                    hierarchy_path: None,
                    page_start: Some(1),
                    page_end: Some(1),
                    anchor_start_id: Some("anchor-search".to_string()),
                    anchor_end_id: Some("anchor-search".to_string()),
                    content: "机器学习概览".to_string(),
                    token_count: Some(4),
                    metadata: None,
                }],
                chunks: vec![CreateDocumentChunkRequest {
                    id: Some("chunk-search".to_string()),
                    section_id: Some("section-search".to_string()),
                    anchor_id: Some("anchor-search".to_string()),
                    page_start: Some(1),
                    page_end: Some(1),
                    chunk_index: 0,
                    chunk_kind: Some("child".to_string()),
                    content: "机器学习用于分类与回归。".to_string(),
                    token_count: Some(10),
                    metadata: Some(serde_json::json!({"topic": "ml"})),
                }],
            },
        )
        .expect("analysis should be replaced");

        let results = repo
            .search_chunks_fts5("机器学习", Some(&[document.id.clone()]), 5)
            .expect("fts search should succeed");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "chunk-search");
        assert_eq!(results[0].section_id.as_deref(), Some("section-search"));
        assert_eq!(results[0].anchor_id.as_deref(), Some("anchor-search"));
        assert!(results[0].lexical_score.unwrap_or_default() > 0.0);
    }

    #[test]
    fn soft_delete_hides_document_and_reports_missing_redelete() {
        let test_db = TestDatabase::new();
        let repo = Mvp0DocumentRepository::new(test_db.connection());

        let document = repo
            .create_document(CreateMvp0DocumentRequest {
                title: "Delete Me".to_string(),
                original_filename: "delete-me.md".to_string(),
                file_path: "E:/docs/delete-me.md".to_string(),
                file_hash: "hash-delete".to_string(),
                file_size: 1024,
                page_count: Some(1),
                parse_status: Some("parsed".to_string()),
            })
            .expect("document should be created");

        assert!(repo
            .soft_delete_document(&document.id)
            .expect("first delete should succeed"));
        assert!(repo
            .find_document_by_id(&document.id)
            .expect("deleted document lookup should succeed")
            .is_none());
        assert!(repo
            .list_documents(false)
            .expect("visible document list should load")
            .is_empty());
        assert_eq!(
            repo.list_documents(true)
                .expect("deleted-inclusive document list should load")
                .len(),
            1
        );
        assert!(!repo
            .soft_delete_document(&document.id)
            .expect("second delete should be a no-op"));
    }
}
