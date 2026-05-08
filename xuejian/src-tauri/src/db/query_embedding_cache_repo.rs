use rusqlite::{params, OptionalExtension};

use crate::db::{Database, Result};

#[derive(Debug, Clone)]
pub struct QueryEmbeddingCacheEntry {
    pub cache_key: String,
    pub vector: Vec<f32>,
    pub created_at: String,
    pub last_used_at: String,
    pub hit_count: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{CreateEmbeddingProfileRequest, Database, VectorRepository};
    use rusqlite::Connection;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().expect("in-memory sqlite");
        conn.execute_batch(
            "CREATE TABLE embedding_profiles (
                id TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                dimensions INTEGER NOT NULL,
                distance_metric TEXT NOT NULL DEFAULT 'cosine',
                is_active BOOLEAN NOT NULL DEFAULT FALSE,
                revision INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );",
        )
        .expect("create embedding profile table");
        conn.execute_batch(include_str!("../migrations/V29__query_embedding_cache.sql"))
            .expect("apply cache migration");
        Database { conn }
    }

    fn create_profile(db: &crate::db::Database) -> String {
        let repo = VectorRepository::new(db);
        repo.create_embedding_profile(CreateEmbeddingProfileRequest {
            provider: "custom_openai".to_string(),
            model: "text-embedding-test".to_string(),
            dimensions: 3,
            distance_metric: Some("cosine".to_string()),
            is_active: true,
            revision: 1,
        })
        .expect("create profile")
        .id
    }

    #[test]
    fn stores_reads_and_prunes_query_embeddings() {
        let db = test_db();
        let profile_id = create_profile(&db);
        let repo = QueryEmbeddingCacheRepository::new(&db);

        let stored = repo
            .upsert(UpsertQueryEmbeddingCacheRequest {
                cache_key: "cache-a".to_string(),
                profile_id: profile_id.clone(),
                provider: "custom_openai".to_string(),
                model: "text-embedding-test".to_string(),
                dimensions: 3,
                task_type: "RETRIEVAL_QUERY".to_string(),
                question_hash: "question-hash".to_string(),
                vector: vec![0.1, 0.2, 0.3],
            })
            .expect("upsert cache");
        assert!(stored);

        let hit = repo
            .get("cache-a", 3, 7 * 24 * 60 * 60)
            .expect("read cache")
            .expect("cache hit");
        assert_eq!(hit.vector, vec![0.1, 0.2, 0.3]);

        let wrong_dimensions = repo
            .get("cache-a", 2, 7 * 24 * 60 * 60)
            .expect("read cache with wrong dimensions");
        assert!(wrong_dimensions.is_none());

        repo.upsert(UpsertQueryEmbeddingCacheRequest {
            cache_key: "cache-b".to_string(),
            profile_id,
            provider: "custom_openai".to_string(),
            model: "text-embedding-test".to_string(),
            dimensions: 3,
            task_type: "RETRIEVAL_QUERY".to_string(),
            question_hash: "question-hash-b".to_string(),
            vector: vec![0.4, 0.5, 0.6],
        })
        .expect("upsert second cache");

        let (_expired, overflow) = repo.prune(7 * 24 * 60 * 60, 1).expect("prune cache");
        assert_eq!(overflow, 1);
        let remaining = [
            repo.get("cache-a", 3, 7 * 24 * 60 * 60)
                .unwrap()
                .is_some(),
            repo.get("cache-b", 3, 7 * 24 * 60 * 60)
                .unwrap()
                .is_some(),
        ];
        assert_eq!(remaining.into_iter().filter(|item| *item).count(), 1);
    }
}

#[derive(Debug, Clone)]
pub struct UpsertQueryEmbeddingCacheRequest {
    pub cache_key: String,
    pub profile_id: String,
    pub provider: String,
    pub model: String,
    pub dimensions: i32,
    pub task_type: String,
    pub question_hash: String,
    pub vector: Vec<f32>,
}

pub struct QueryEmbeddingCacheRepository<'a> {
    db: &'a Database,
}

impl<'a> QueryEmbeddingCacheRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn get(
        &self,
        cache_key: &str,
        expected_dimensions: i32,
        max_age_seconds: i64,
    ) -> Result<Option<QueryEmbeddingCacheEntry>> {
        if cache_key.trim().is_empty() || expected_dimensions <= 0 {
            return Ok(None);
        }

        let cutoff = chrono::Utc::now()
            - chrono::Duration::seconds(max_age_seconds.max(0));
        let cutoff = cutoff.to_rfc3339();

        let row = self
            .db
            .connection()
            .query_row(
                "SELECT cache_key, vector_json, created_at, last_used_at, hit_count
                 FROM query_embedding_cache
                 WHERE cache_key = ?1
                   AND dimensions = ?2
                   AND created_at >= ?3",
                params![cache_key, expected_dimensions, cutoff],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, i64>(4)?,
                    ))
                },
            )
            .optional()?;

        let Some((cache_key, vector_json, created_at, last_used_at, hit_count)) = row else {
            return Ok(None);
        };
        let vector: Vec<f32> = serde_json::from_str(&vector_json)?;
        if vector.len() as i32 != expected_dimensions {
            return Ok(None);
        }

        let now = chrono::Utc::now().to_rfc3339();
        self.db.connection().execute(
            "UPDATE query_embedding_cache
             SET last_used_at = ?1, hit_count = hit_count + 1
             WHERE cache_key = ?2",
            params![now, &cache_key],
        )?;

        Ok(Some(QueryEmbeddingCacheEntry {
            cache_key,
            vector,
            created_at,
            last_used_at,
            hit_count,
        }))
    }

    pub fn upsert(&self, request: UpsertQueryEmbeddingCacheRequest) -> Result<bool> {
        if request.cache_key.trim().is_empty()
            || request.profile_id.trim().is_empty()
            || request.dimensions <= 0
            || request.vector.len() as i32 != request.dimensions
        {
            return Ok(false);
        }

        let now = chrono::Utc::now().to_rfc3339();
        let vector_json = serde_json::to_string(&request.vector)?;
        self.db.connection().execute(
            "INSERT INTO query_embedding_cache (
                cache_key, profile_id, provider, model, dimensions, task_type,
                question_hash, vector_json, created_at, last_used_at, hit_count
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, 0)
             ON CONFLICT(cache_key) DO UPDATE SET
                profile_id = excluded.profile_id,
                provider = excluded.provider,
                model = excluded.model,
                dimensions = excluded.dimensions,
                task_type = excluded.task_type,
                question_hash = excluded.question_hash,
                vector_json = excluded.vector_json,
                last_used_at = excluded.last_used_at",
            params![
                request.cache_key,
                request.profile_id,
                request.provider,
                request.model,
                request.dimensions,
                request.task_type,
                request.question_hash,
                vector_json,
                now,
            ],
        )?;
        Ok(true)
    }

    pub fn prune(&self, max_age_seconds: i64, max_entries: i64) -> Result<(usize, usize)> {
        let cutoff = chrono::Utc::now()
            - chrono::Duration::seconds(max_age_seconds.max(0));
        let cutoff = cutoff.to_rfc3339();
        let expired = self.db.connection().execute(
            "DELETE FROM query_embedding_cache WHERE created_at < ?1",
            params![cutoff],
        )?;

        let overflow = if max_entries > 0 {
            self.db.connection().execute(
                "DELETE FROM query_embedding_cache
                 WHERE cache_key IN (
                    SELECT cache_key
                    FROM query_embedding_cache
                    ORDER BY last_used_at DESC
                    LIMIT -1 OFFSET ?1
                 )",
                params![max_entries],
            )?
        } else {
            0
        };

        Ok((expired, overflow))
    }
}
