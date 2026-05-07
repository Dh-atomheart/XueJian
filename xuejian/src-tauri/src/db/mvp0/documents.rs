use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

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
}

pub struct Mvp0DocumentRepository<'a> {
    conn: &'a Connection,
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
                    parse_status, created_at, updated_at, deleted_at
             FROM documents
             ORDER BY created_at DESC"
        } else {
            "SELECT id, title, original_filename, file_path, file_hash, file_size, page_count,
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
        page_count: i32,
        chunks: &[CreateMvp0DocumentChunkRequest],
        anchors: &[CreateMvp0SourceAnchorRequest],
    ) -> Result<()> {
        let updated_at = now_utc();
        let tx = self.conn.unchecked_transaction()?;

        tx.execute(
            "UPDATE documents
             SET page_count = ?2,
                 parse_status = 'parsed',
                 updated_at = ?3
             WHERE id = ?1 AND deleted_at IS NULL",
            params![document_id, page_count, updated_at],
        )?;

        tx.execute(
            "DELETE FROM source_anchors WHERE document_id = ?1",
            params![document_id],
        )?;
        tx.execute(
            "DELETE FROM document_chunks WHERE document_id = ?1",
            params![document_id],
        )?;

        for request in chunks {
            let chunk = Mvp0DocumentChunk {
                id: Uuid::new_v4().to_string(),
                document_id: request.document_id.clone(),
                page_start: request.page_start,
                page_end: request.page_end,
                chunk_index: request.chunk_index,
                char_count: request.text.chars().count() as i32,
                text: request.text.clone(),
                parser: request.parser.clone(),
                created_at: now_utc(),
            };

            tx.execute(
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
        }

        for request in anchors {
            let anchor = Mvp0SourceAnchor {
                id: Uuid::new_v4().to_string(),
                document_id: request.document_id.clone(),
                chunk_id: request.chunk_id.clone(),
                page: request.page,
                quote: request.quote.clone(),
                bbox_json: request.bbox_json.clone(),
                created_at: now_utc(),
            };

            tx.execute(
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
        }

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
                chunks.extend(self.list_chunks(document_id)?);
            }
        } else {
            for document in self.list_documents(false)? {
                chunks.extend(self.list_chunks(&document.id)?);
            }
        }

        let query_lower = query.trim().to_lowercase();
        let mut scored = chunks
            .into_iter()
            .filter_map(|chunk| {
                let content_lower = chunk.text.to_lowercase();
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
            .map(|(_, chunk)| Mvp0DocumentChunkSearchResult {
                id: chunk.id,
                document_id: chunk.document_id,
                section_id: None,
                anchor_id: None,
                chunk_index: chunk.chunk_index,
                page_start: Some(chunk.page_start),
                page_end: Some(chunk.page_end),
                snippet: build_search_snippet(&chunk.text, &keywords),
                content: chunk.text,
            })
            .collect())
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
        parse_status: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        deleted_at: row.get(10)?,
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
            4,
            &[CreateMvp0DocumentChunkRequest {
                document_id: document.id.clone(),
                page_start: 1,
                page_end: 2,
                chunk_index: 0,
                text: "chunk one".to_string(),
                parser: "pymupdf".to_string(),
            }],
            &[CreateMvp0SourceAnchorRequest {
                document_id: document.id.clone(),
                chunk_id: None,
                page: 1,
                quote: "quote one".to_string(),
                bbox_json: Some("[]".to_string()),
            }],
        )
        .expect("first analysis write should succeed");

        repo.replace_analysis(
            &document.id,
            6,
            &[CreateMvp0DocumentChunkRequest {
                document_id: document.id.clone(),
                page_start: 3,
                page_end: 4,
                chunk_index: 0,
                text: "chunk two".to_string(),
                parser: "pymupdf".to_string(),
            }],
            &[CreateMvp0SourceAnchorRequest {
                document_id: document.id.clone(),
                chunk_id: None,
                page: 3,
                quote: "quote two".to_string(),
                bbox_json: None,
            }],
        )
        .expect("second analysis write should replace prior data");

        let chunks = repo
            .list_chunks(&document.id)
            .expect("chunks should load after replace");
        let anchors = repo
            .list_source_anchors(&document.id)
            .expect("anchors should load after replace");
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
        assert_eq!(legacy_chunk_columns.2, legacy_chunk_columns.3);
        assert_eq!(anchors.len(), 1);
        assert_eq!(anchors[0].quote, "quote two");
        assert_eq!(stored_document.page_count, Some(6));
        assert_eq!(stored_document.parse_status, "parsed");
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
