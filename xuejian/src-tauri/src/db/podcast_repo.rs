use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::Result;
use crate::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodcastEpisode {
    pub id: String,
    pub document_id: Option<String>,
    pub run_id: Option<String>,
    pub title: String,
    pub scope_description: String,
    pub script_json: String,
    pub audio_path: Option<String>,
    pub duration_ms: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePodcastEpisodeRequest {
    pub id: String,
    pub document_id: Option<String>,
    pub run_id: Option<String>,
    pub title: String,
    pub scope_description: String,
}

pub struct PodcastRepository<'a> {
    db: &'a Database,
}

impl<'a> PodcastRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn insert(&self, req: CreatePodcastEpisodeRequest) -> Result<PodcastEpisode> {
        let conn = self.db.connection();
        conn.execute(
            "INSERT INTO podcast_episodes (id, document_id, run_id, title, scope_description, status)
             VALUES (?1, ?2, ?3, ?4, ?5, 'queued')",
            params![req.id, req.document_id, req.run_id, req.title, req.scope_description],
        )?;
        self.get_by_id(&req.id)?
            .ok_or_else(|| super::DbError::Sqlite(rusqlite::Error::QueryReturnedNoRows))
    }

    pub fn get_by_id(&self, id: &str) -> Result<Option<PodcastEpisode>> {
        let conn = self.db.connection();
        let mut stmt = conn.prepare(
            "SELECT id, document_id, run_id, title, scope_description, script_json,
                    audio_path, duration_ms, status, error_message, created_at, updated_at
             FROM podcast_episodes WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(PodcastEpisode {
                id: row.get(0)?,
                document_id: row.get(1)?,
                run_id: row.get(2)?,
                title: row.get(3)?,
                scope_description: row.get(4)?,
                script_json: row.get(5)?,
                audio_path: row.get(6)?,
                duration_ms: row.get(7)?,
                status: row.get(8)?,
                error_message: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn list_all(&self) -> Result<Vec<PodcastEpisode>> {
        let conn = self.db.connection();
        let mut stmt = conn.prepare(
            "SELECT id, document_id, run_id, title, scope_description, script_json,
                    audio_path, duration_ms, status, error_message, created_at, updated_at
             FROM podcast_episodes ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(PodcastEpisode {
                id: row.get(0)?,
                document_id: row.get(1)?,
                run_id: row.get(2)?,
                title: row.get(3)?,
                scope_description: row.get(4)?,
                script_json: row.get(5)?,
                audio_path: row.get(6)?,
                duration_ms: row.get(7)?,
                status: row.get(8)?,
                error_message: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn set_generating(&self, id: &str) -> Result<()> {
        let conn = self.db.connection();
        conn.execute(
            "UPDATE podcast_episodes SET status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn set_ready(&self, id: &str, script_json: &str, duration_ms: i64) -> Result<()> {
        let conn = self.db.connection();
        conn.execute(
            "UPDATE podcast_episodes SET status = 'ready', script_json = ?2, duration_ms = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![id, script_json, duration_ms],
        )?;
        Ok(())
    }

    pub fn set_failed(&self, id: &str, error: &str) -> Result<()> {
        let conn = self.db.connection();
        conn.execute(
            "UPDATE podcast_episodes SET status = 'failed', error_message = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![id, error],
        )?;
        Ok(())
    }

    pub fn cancel(&self, id: &str) -> Result<()> {
        let conn = self.db.connection();
        conn.execute(
            "UPDATE podcast_episodes SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn delete_by_id(&self, id: &str) -> Result<()> {
        let conn = self.db.connection();
        conn.execute("DELETE FROM podcast_episodes WHERE id = ?1", params![id])?;
        Ok(())
    }
}
