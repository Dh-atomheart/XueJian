use rusqlite::{params, params_from_iter, OptionalExtension};

use crate::db::{Database, Result};

const CHUNK_EMBEDDING_TABLE: &str = "document_chunk_embeddings";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EmbeddingProfile {
    pub id: String,
    pub provider: String,
    pub model: String,
    pub dimensions: i32,
    pub distance_metric: String,
    pub is_active: bool,
    pub revision: i32,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct CreateEmbeddingProfileRequest {
    pub provider: String,
    pub model: String,
    pub dimensions: i32,
    pub distance_metric: Option<String>,
    pub is_active: bool,
    pub revision: i32,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct ChunkEmbeddingRecord {
    pub chunk_id: String,
    pub vector: Vec<f32>,
    #[serde(default)]
    pub content_hash: Option<String>,
    #[serde(default)]
    pub chunking_profile_revision: Option<i32>,
    #[serde(default)]
    pub embedding_profile_revision: Option<i32>,
    #[serde(default)]
    pub embedding_dimensions: Option<i32>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkEmbeddingState {
    pub chunk_id: String,
    pub content_hash: Option<String>,
    pub chunking_profile_revision: Option<i32>,
    pub embedding_profile_revision: Option<i32>,
    pub embedding_dimensions: Option<i32>,
    pub embedded_at: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VectorSearchResult {
    pub chunk_id: String,
    pub document_id: String,
    pub section_id: Option<String>,
    pub anchor_id: Option<String>,
    pub chunk_index: i32,
    pub page_start: Option<i32>,
    pub page_end: Option<i32>,
    pub content: String,
    pub distance: f64,
}

pub struct VectorRepository<'a> {
    db: &'a Database,
}

impl<'a> VectorRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn create_embedding_profile(
        &self,
        req: CreateEmbeddingProfileRequest,
    ) -> Result<EmbeddingProfile> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        if req.is_active {
            self.db.connection().execute(
                "UPDATE embedding_profiles SET is_active = FALSE WHERE is_active = TRUE",
                [],
            )?;
        }

        self.db.connection().execute(
            "INSERT INTO embedding_profiles (
                id, provider, model, dimensions, distance_metric, is_active, revision, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                &id,
                &req.provider,
                &req.model,
                req.dimensions,
                req.distance_metric
                    .clone()
                    .unwrap_or_else(|| "cosine".to_string()),
                req.is_active,
                req.revision,
                &now,
            ],
        )?;

        Ok(EmbeddingProfile {
            id,
            provider: req.provider,
            model: req.model,
            dimensions: req.dimensions,
            distance_metric: req.distance_metric.unwrap_or_else(|| "cosine".to_string()),
            is_active: req.is_active,
            revision: req.revision,
            created_at: now,
        })
    }

    pub fn get_active_embedding_profile(&self) -> Result<Option<EmbeddingProfile>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, provider, model, dimensions, distance_metric, is_active, revision, created_at
             FROM embedding_profiles
             WHERE is_active = TRUE
             LIMIT 1",
        )?;

        stmt.query_row([], map_embedding_profile_row)
            .optional()
            .map_err(Into::into)
    }

    pub fn get_embedding_profile(&self, id: &str) -> Result<Option<EmbeddingProfile>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, provider, model, dimensions, distance_metric, is_active, revision, created_at
             FROM embedding_profiles
             WHERE id = ?1
             LIMIT 1",
        )?;

        stmt.query_row(params![id], map_embedding_profile_row)
            .optional()
            .map_err(Into::into)
    }

    pub fn list_embedding_profiles(&self) -> Result<Vec<EmbeddingProfile>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, provider, model, dimensions, distance_metric, is_active, revision, created_at
             FROM embedding_profiles
             ORDER BY revision DESC, created_at DESC",
        )?;
        let rows = stmt.query_map([], map_embedding_profile_row)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn set_active_embedding_profile(&self, id: &str) -> Result<Option<EmbeddingProfile>> {
        let exists: bool = self.db.connection().query_row(
            "SELECT EXISTS(SELECT 1 FROM embedding_profiles WHERE id = ?1)",
            params![id],
            |row| row.get(0),
        )?;

        if !exists {
            return Ok(None);
        }

        let transaction = self.db.connection().unchecked_transaction()?;
        transaction.execute(
            "UPDATE embedding_profiles SET is_active = FALSE WHERE is_active = TRUE",
            [],
        )?;
        transaction.execute(
            "UPDATE embedding_profiles SET is_active = TRUE WHERE id = ?1",
            params![id],
        )?;
        transaction.commit()?;

        self.get_active_embedding_profile()
    }

    pub fn upsert_embedding_profile_with_id(
        &self,
        id: &str,
        req: CreateEmbeddingProfileRequest,
    ) -> Result<(EmbeddingProfile, bool)> {
        let distance_metric = req.distance_metric.unwrap_or_else(|| "cosine".to_string());
        let current = self.get_embedding_profile(id)?;

        if req.is_active {
            self.db.connection().execute(
                "UPDATE embedding_profiles SET is_active = FALSE WHERE is_active = TRUE AND id != ?1",
                params![id],
            )?;
        }

        let changed = match current.as_ref() {
            Some(existing) => {
                existing.provider != req.provider
                    || existing.model != req.model
                    || existing.dimensions != req.dimensions
                    || existing.distance_metric != distance_metric
                    || existing.is_active != req.is_active
            }
            None => true,
        };

        match current {
            Some(existing) => {
                let revision = if changed {
                    existing.revision.saturating_add(1)
                } else {
                    existing.revision
                };
                self.db.connection().execute(
                    "UPDATE embedding_profiles
                     SET provider = ?1,
                         model = ?2,
                         dimensions = ?3,
                         distance_metric = ?4,
                         is_active = ?5,
                         revision = ?6
                     WHERE id = ?7",
                    params![
                        req.provider,
                        req.model,
                        req.dimensions,
                        distance_metric,
                        req.is_active,
                        revision,
                        id,
                    ],
                )?;
            }
            None => {
                let now = chrono::Utc::now().to_rfc3339();
                self.db.connection().execute(
                    "INSERT INTO embedding_profiles (
                        id, provider, model, dimensions, distance_metric, is_active, revision, created_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        id,
                        req.provider,
                        req.model,
                        req.dimensions,
                        distance_metric,
                        req.is_active,
                        req.revision.max(1),
                        now,
                    ],
                )?;
            }
        }

        let profile = self
            .get_embedding_profile(id)?
            .expect("embedding profile should exist after upsert");
        Ok((profile, changed))
    }

    pub fn mark_documents_embedding_stale(&self) -> Result<usize> {
        self.db
            .connection()
            .execute(
                "UPDATE documents
             SET status = 'embedding_stale', updated_at = ?1
             WHERE status = 'ready'",
                params![chrono::Utc::now().to_rfc3339()],
            )
            .map_err(Into::into)
    }

    pub fn replace_chunk_embeddings(
        &self,
        profile_id: &str,
        embeddings: &[ChunkEmbeddingRecord],
    ) -> Result<usize> {
        if embeddings.is_empty() {
            return Ok(0);
        }

        let dimensions = embeddings[0].vector.len() as i32;
        self.ensure_chunk_embedding_table(dimensions)?;
        let profile = self.get_embedding_profile(profile_id)?;
        let fallback_profile_revision = profile.as_ref().map(|item| item.revision).unwrap_or(0);
        let fallback_dimensions = profile
            .as_ref()
            .map(|item| {
                if item.dimensions > 0 {
                    item.dimensions
                } else {
                    dimensions
                }
            })
            .unwrap_or(dimensions);

        let transaction = self.db.connection().unchecked_transaction()?;
        let now = chrono::Utc::now().to_rfc3339();
        let mut stored_count = 0usize;

        for record in embeddings {
            if record.vector.len() as i32 != dimensions {
                continue;
            }

            let (chunk_rowid, fallback_content_hash, fallback_chunking_profile_revision): (
                i64,
                Option<String>,
                i32,
            ) = match transaction.query_row(
                "SELECT c.rowid, c.content_hash, d.chunking_profile_revision
                 FROM document_chunks c
                 JOIN documents d ON d.id = c.document_id
                 WHERE c.id = ?1",
                params![&record.chunk_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            ) {
                Ok(row) => row,
                Err(rusqlite::Error::QueryReturnedNoRows) => continue,
                Err(error) => return Err(error.into()),
            };
            let content_hash = record
                .content_hash
                .clone()
                .or(fallback_content_hash);
            let chunking_profile_revision = record
                .chunking_profile_revision
                .unwrap_or(fallback_chunking_profile_revision);
            let embedding_profile_revision = record
                .embedding_profile_revision
                .unwrap_or(fallback_profile_revision);
            let embedding_dimensions = record
                .embedding_dimensions
                .unwrap_or(fallback_dimensions);

            let vector_json = serde_json::to_string(&record.vector)?;
            transaction.execute(
                &format!("DELETE FROM {} WHERE rowid = ?1", CHUNK_EMBEDDING_TABLE),
                params![chunk_rowid],
            )?;
            transaction.execute(
                &format!(
                    "INSERT INTO {} (rowid, embedding) VALUES (?1, ?2)",
                    CHUNK_EMBEDDING_TABLE
                ),
                params![chunk_rowid, vector_json],
            )?;
            transaction.execute(
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
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
                 ON CONFLICT(chunk_id) DO UPDATE
                 SET profile_id = excluded.profile_id,
                     chunk_rowid = excluded.chunk_rowid,
                     content_hash = excluded.content_hash,
                     chunking_profile_revision = excluded.chunking_profile_revision,
                     embedding_profile_revision = excluded.embedding_profile_revision,
                     embedding_dimensions = excluded.embedding_dimensions,
                     created_at = excluded.created_at,
                     embedded_at = excluded.embedded_at",
                params![
                    &record.chunk_id,
                    profile_id,
                    chunk_rowid,
                    &content_hash,
                    chunking_profile_revision,
                    embedding_profile_revision,
                    embedding_dimensions,
                    &now,
                ],
            )?;
            stored_count += 1;
        }

        transaction.commit()?;
        Ok(stored_count)
    }

    pub fn count_document_embeddings(&self, document_id: &str, profile_id: &str) -> Result<i64> {
        self.db
            .connection()
            .query_row(
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
                params![document_id, profile_id],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    pub fn list_chunk_embedding_states(
        &self,
        document_id: &str,
        profile_id: &str,
    ) -> Result<Vec<ChunkEmbeddingState>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT state.chunk_id,
                    state.content_hash,
                    state.chunking_profile_revision,
                    state.embedding_profile_revision,
                    state.embedding_dimensions,
                    state.embedded_at
             FROM document_chunk_embedding_state state
             JOIN document_chunks chunks ON chunks.id = state.chunk_id
             WHERE chunks.document_id = ?1 AND state.profile_id = ?2
             ORDER BY chunks.chunk_index ASC",
        )?;
        let rows = stmt.query_map(params![document_id, profile_id], |row| {
            Ok(ChunkEmbeddingState {
                chunk_id: row.get(0)?,
                content_hash: row.get(1)?,
                chunking_profile_revision: row.get(2)?,
                embedding_profile_revision: row.get(3)?,
                embedding_dimensions: row.get(4)?,
                embedded_at: row.get(5)?,
            })
        })?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn lock_embedding_profile_dimensions(
        &self,
        profile_id: &str,
        dimensions: i32,
    ) -> Result<Option<EmbeddingProfile>> {
        if dimensions <= 0 {
            return self.get_embedding_profile(profile_id);
        }

        let Some(profile) = self.get_embedding_profile(profile_id)? else {
            return Ok(None);
        };

        if profile.dimensions > 0 {
            return Ok(Some(profile));
        }

        let next_revision = profile.revision.saturating_add(1);
        self.db.connection().execute(
            "UPDATE embedding_profiles
             SET dimensions = ?1,
                 revision = ?2
             WHERE id = ?3 AND dimensions = 0",
            params![dimensions, next_revision, profile_id],
        )?;

        self.get_embedding_profile(profile_id)
    }

    pub fn search_chunk_embeddings(
        &self,
        query_vector: &[f32],
        limit: i64,
        document_ids: Option<&[String]>,
    ) -> Result<Vec<VectorSearchResult>> {
        if query_vector.is_empty() || !self.has_chunk_embedding_table()? {
            return Ok(Vec::new());
        }

        let query_json = serde_json::to_string(query_vector)?;
        let mut sql = format!(
            "SELECT c.id, c.document_id, c.section_id, c.anchor_id, c.chunk_index,
                    c.page_start, c.page_end, c.content, {table}.distance
             FROM {table}
             JOIN document_chunks c ON c.rowid = {table}.rowid
             WHERE {table}.embedding MATCH ?1",
            table = CHUNK_EMBEDDING_TABLE,
        );

        let mut params_vec: Vec<rusqlite::types::Value> = vec![query_json.into()];
        if let Some(document_ids) = document_ids {
            if !document_ids.is_empty() {
                let placeholders = (0..document_ids.len())
                    .map(|index| format!("?{}", index + 2))
                    .collect::<Vec<_>>()
                    .join(", ");
                sql.push_str(&format!(" AND c.document_id IN ({})", placeholders));
                params_vec.extend(document_ids.iter().cloned().map(Into::into));
            }
        }

        let limit_index = params_vec.len() + 1;
        sql.push_str(&format!(" AND k = ?{} ORDER BY distance", limit_index));
        params_vec.push(limit.into());

        let mut stmt = self.db.connection().prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(params_vec), |row| {
            Ok(VectorSearchResult {
                chunk_id: row.get(0)?,
                document_id: row.get(1)?,
                section_id: row.get(2)?,
                anchor_id: row.get(3)?,
                chunk_index: row.get(4)?,
                page_start: row.get(5)?,
                page_end: row.get(6)?,
                content: row.get(7)?,
                distance: row.get(8)?,
            })
        })?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    fn ensure_chunk_embedding_table(&self, dimensions: i32) -> Result<()> {
        let expected_fragment = format!("float[{}]", dimensions);
        let existing_sql = self
            .db
            .connection()
            .query_row(
                "SELECT sql FROM sqlite_master WHERE name = ?1",
                params![CHUNK_EMBEDDING_TABLE],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        if let Some(sql) = existing_sql {
            if !sql.contains(&expected_fragment) {
                self.db.connection().execute(
                    &format!("DROP TABLE IF EXISTS {}", CHUNK_EMBEDDING_TABLE),
                    [],
                )?;
                self.db
                    .connection()
                    .execute("DELETE FROM document_chunk_embedding_state", [])?;
            }
        }

        self.db.connection().execute_batch(&format!(
            "CREATE VIRTUAL TABLE IF NOT EXISTS {table}
             USING vec0(embedding float[{dimensions}]);",
            table = CHUNK_EMBEDDING_TABLE,
            dimensions = dimensions,
        ))?;

        Ok(())
    }

    fn has_chunk_embedding_table(&self) -> Result<bool> {
        self.db
            .connection()
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = ?1)",
                params![CHUNK_EMBEDDING_TABLE],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }
}

fn map_embedding_profile_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<EmbeddingProfile> {
    Ok(EmbeddingProfile {
        id: row.get(0)?,
        provider: row.get(1)?,
        model: row.get(2)?,
        dimensions: row.get(3)?,
        distance_metric: row.get(4)?,
        is_active: row.get(5)?,
        revision: row.get(6)?,
        created_at: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::*;
    use crate::db::{
        CreateDocumentChunkRequest, CreateDocumentRequest, CreateDocumentSectionRequest,
        DocumentRepository, ReplaceDocumentAnalysisRequest,
    };

    fn test_db() -> Database {
        crate::db::register_sqlite_vec_auto_extension();
        let conn = Connection::open_in_memory().expect("in-memory sqlite");
        crate::db::configure_connection(&conn).expect("configure sqlite connection");
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
        conn.execute_batch(include_str!("../migrations/V4__points_ledger.sql"))
            .expect("apply v4 migration");
        conn.execute_batch(include_str!("../migrations/V5__card_animations.sql"))
            .expect("apply v5 migration");
        conn.execute_batch(include_str!("../migrations/V6__podcast_episodes.sql"))
            .expect("apply v6 migration");
        conn.execute_batch(include_str!(
            "../migrations/V8__points_daily_bonus_rule.sql"
        ))
        .expect("apply v8 migration");
        conn.execute_batch(include_str!("../migrations/V9__api_config_auth_mode.sql"))
            .expect("apply v9 migration");
        conn.execute_batch(include_str!("../migrations/V10__card_schema_extension.sql"))
            .expect("apply v10 migration");
        conn.execute_batch(include_str!("../migrations/V11__anchor_provenance.sql"))
            .expect("apply v11 migration");
        conn.execute_batch(include_str!("../migrations/V12__card_media.sql"))
            .expect("apply v12 migration");
        conn.execute_batch(include_str!(
            "../migrations/V13__agent_document_workflow_foundation.sql"
        ))
        .expect("apply v13 migration");
        conn.execute_batch(include_str!("../migrations/V14__chunk_embedding_state.sql"))
            .expect("apply v14 migration");
        conn.execute_batch(include_str!("../migrations/V15__highlight_metadata.sql"))
            .expect("apply v15 migration");
        conn.execute_batch(include_str!("../migrations/V30__rag_data_foundation.sql"))
            .expect("apply v30 migration");
        conn.execute_batch(include_str!("../migrations/V31__incremental_embedding_state.sql"))
            .expect("apply v31 migration");

        Database { conn }
    }

    #[test]
    fn stores_and_queries_chunk_embeddings() {
        let db = test_db();
        let document_repo = DocumentRepository::new(&db);
        let vector_repo = VectorRepository::new(&db);

        let document = document_repo
            .create(CreateDocumentRequest {
                title: "Embeddings.md".to_string(),
                file_path: "E:/docs/embeddings.md".to_string(),
                file_type: "md".to_string(),
                file_size: Some(128),
                page_count: None,
                content_hash: Some("embeddings-doc".to_string()),
            })
            .expect("create document");

        document_repo
            .replace_analysis(
                &document.id,
                ReplaceDocumentAnalysisRequest {
                    page_count: 1,
                    anchors: vec![],
                    sections: vec![CreateDocumentSectionRequest {
                        id: Some("section-1".to_string()),
                        section_index: 0,
                        heading: Some("Embeddings".to_string()),
                        hierarchy_path: Some(vec!["Embeddings".to_string()]),
                        page_start: Some(1),
                        page_end: Some(1),
                        anchor_start_id: None,
                        anchor_end_id: None,
                        content: "Vector stores support semantic retrieval.".to_string(),
                        token_count: Some(6),
                        metadata: None,
                    }],
                    chunks: vec![
                        CreateDocumentChunkRequest {
                            id: Some("chunk-a".to_string()),
                            section_id: Some("section-1".to_string()),
                            anchor_id: None,
                            page_start: Some(1),
                            page_end: Some(1),
                            chunk_index: 0,
                            chunk_kind: Some("child".to_string()),
                            content: "Vector stores support semantic retrieval.".to_string(),
                            token_count: Some(6),
                            metadata: None,
                        },
                        CreateDocumentChunkRequest {
                            id: Some("chunk-b".to_string()),
                            section_id: Some("section-1".to_string()),
                            anchor_id: None,
                            page_start: Some(1),
                            page_end: Some(1),
                            chunk_index: 1,
                            chunk_kind: Some("child".to_string()),
                            content: "Flashcards help spaced repetition.".to_string(),
                            token_count: Some(5),
                            metadata: None,
                        },
                    ],
                },
            )
            .expect("replace analysis");

        let profile = vector_repo
            .create_embedding_profile(CreateEmbeddingProfileRequest {
                provider: "openai".to_string(),
                model: "text-embedding-3-small".to_string(),
                dimensions: 3,
                distance_metric: Some("cosine".to_string()),
                is_active: true,
                revision: 1,
            })
            .expect("create profile");

        let stored = vector_repo
            .replace_chunk_embeddings(
                &profile.id,
                &[
                    ChunkEmbeddingRecord {
                        chunk_id: "chunk-a".to_string(),
                        vector: vec![1.0, 0.0, 0.0],
                        content_hash: None,
                        chunking_profile_revision: None,
                        embedding_profile_revision: None,
                        embedding_dimensions: None,
                    },
                    ChunkEmbeddingRecord {
                        chunk_id: "chunk-b".to_string(),
                        vector: vec![0.0, 1.0, 0.0],
                        content_hash: None,
                        chunking_profile_revision: None,
                        embedding_profile_revision: None,
                        embedding_dimensions: None,
                    },
                ],
            )
            .expect("store embeddings");
        assert_eq!(stored, 2);
        assert_eq!(
            vector_repo
                .count_document_embeddings(&document.id, &profile.id)
                .expect("fresh embedding count succeeds"),
            2
        );

        let states = vector_repo
            .list_chunk_embedding_states(&document.id, &profile.id)
            .expect("embedding states should load");
        assert_eq!(states.len(), 2);
        assert_eq!(states[0].embedding_profile_revision, Some(1));
        assert_eq!(states[0].embedding_dimensions, Some(3));

        let results = vector_repo
            .search_chunk_embeddings(&[0.98, 0.02, 0.0], 2, Some(&[document.id.clone()]))
            .expect("vector search succeeds");

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].chunk_id, "chunk-a");
        assert_eq!(results[0].document_id, document.id);

        db.connection()
            .execute(
                "UPDATE embedding_profiles SET revision = 2 WHERE id = ?1",
                params![&profile.id],
            )
            .expect("profile revision should update");
        assert_eq!(
            vector_repo
                .count_document_embeddings(&document.id, &profile.id)
                .expect("stale embedding count succeeds"),
            0
        );
    }

    #[test]
    fn locks_embedding_profile_dimensions_once() {
        let db = test_db();
        let vector_repo = VectorRepository::new(&db);

        let profile = vector_repo
            .create_embedding_profile(CreateEmbeddingProfileRequest {
                provider: "custom_openai".to_string(),
                model: "custom-embedding".to_string(),
                dimensions: 0,
                distance_metric: Some("cosine".to_string()),
                is_active: true,
                revision: 1,
            })
            .expect("create profile");

        let locked = vector_repo
            .lock_embedding_profile_dimensions(&profile.id, 1024)
            .expect("lock dimensions succeeds")
            .expect("profile should still exist");
        assert_eq!(locked.dimensions, 1024);
        assert_eq!(locked.revision, 2);

        let relocked = vector_repo
            .lock_embedding_profile_dimensions(&profile.id, 2048)
            .expect("relock dimensions succeeds")
            .expect("profile should still exist");
        assert_eq!(relocked.dimensions, 1024);
        assert_eq!(relocked.revision, 2);
    }
}
