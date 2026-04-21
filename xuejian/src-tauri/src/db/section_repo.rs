use rusqlite::{params, OptionalExtension};

use crate::db::{
    CreateDocumentSectionRequest, Database, DocumentSection, Result,
};

pub struct SectionRepository<'a> {
    db: &'a Database,
}

impl<'a> SectionRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn create_section(
        &self,
        document_id: &str,
        req: CreateDocumentSectionRequest,
    ) -> Result<DocumentSection> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let CreateDocumentSectionRequest {
            id: _,
            section_index,
            heading,
            hierarchy_path,
            page_start,
            page_end,
            anchor_start_id,
            anchor_end_id,
            content,
            token_count,
            metadata,
        } = req;
        let hierarchy_path_json = hierarchy_path
            .as_deref()
            .map(serde_json::to_string)
            .transpose()?;
        let metadata_json = metadata.as_ref().map(serde_json::to_string).transpose()?;

        self.db.connection().execute(
            "INSERT INTO document_sections (
                id, document_id, section_index, heading, hierarchy_path, page_start, page_end,
                anchor_start_id, anchor_end_id, content, token_count, metadata, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                &id,
                document_id,
                section_index,
                heading,
                hierarchy_path_json,
                page_start,
                page_end,
                anchor_start_id,
                anchor_end_id,
                content,
                token_count,
                metadata_json,
                &now,
            ],
        )?;

        Ok(DocumentSection {
            id,
            document_id: document_id.to_string(),
            section_index,
            heading,
            hierarchy_path: hierarchy_path.unwrap_or_default(),
            page_start,
            page_end,
            anchor_start_id,
            anchor_end_id,
            content,
            token_count,
            metadata,
            created_at: now,
        })
    }

    pub fn list_sections_by_document(&self, document_id: &str) -> Result<Vec<DocumentSection>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, document_id, section_index, heading, hierarchy_path, page_start, page_end,
                    anchor_start_id, anchor_end_id, content, token_count, metadata, created_at
             FROM document_sections
             WHERE document_id = ?1
             ORDER BY section_index ASC",
        )?;

        let rows = stmt.query_map(params![document_id], map_document_section_row)?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_section(&self, id: &str) -> Result<Option<DocumentSection>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, document_id, section_index, heading, hierarchy_path, page_start, page_end,
                    anchor_start_id, anchor_end_id, content, token_count, metadata, created_at
             FROM document_sections
             WHERE id = ?1",
        )?;

        stmt.query_row(params![id], map_document_section_row)
            .optional()
            .map_err(Into::into)
    }
}

fn map_document_section_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentSection> {
    let hierarchy_path = row
        .get::<_, Option<String>>(4)?
        .map(|value| serde_json::from_str::<Vec<String>>(&value))
        .transpose()
        .map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                4,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?
        .unwrap_or_default();
    let metadata = row
        .get::<_, Option<String>>(11)?
        .map(|value| serde_json::from_str::<serde_json::Value>(&value))
        .transpose()
        .map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                11,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?;

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
}