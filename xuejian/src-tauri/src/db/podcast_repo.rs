use rusqlite::{params, types::Type};
use serde::{Deserialize, Serialize};

use super::Result;
use crate::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodcastEpisode {
    pub id: String,
    pub document_ids: Vec<String>,
    pub run_id: Option<String>,
    pub title: String,
    pub scope_description: String,
    pub style: String,
    pub language: String,
    pub duration_tier: String,
    pub tts_provider: String,
    pub audio_format: String,
    pub script_json: String,
    pub outline_json: Option<String>,
    pub evaluation_json: Option<String>,
    pub audio_path: Option<String>,
    pub duration_ms: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub current_stage: i64,
    pub completed_segments: i64,
    pub total_segments: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePodcastEpisodeRequest {
    pub id: String,
    pub document_ids: Vec<String>,
    pub run_id: Option<String>,
    pub title: String,
    pub scope_description: String,
    pub style: String,
    pub language: String,
    pub duration_tier: String,
    pub tts_provider: String,
    pub audio_format: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodcastEpisodeUpdates {
    pub document_ids: Option<Vec<String>>,
    pub run_id: Option<Option<String>>,
    pub title: Option<String>,
    pub scope_description: Option<String>,
    pub style: Option<String>,
    pub language: Option<String>,
    pub duration_tier: Option<String>,
    pub tts_provider: Option<String>,
    pub audio_format: Option<String>,
    pub script_json: Option<String>,
    pub outline_json: Option<Option<String>>,
    pub evaluation_json: Option<Option<String>>,
    pub audio_path: Option<Option<String>>,
    pub duration_ms: Option<i64>,
    pub status: Option<String>,
    pub error_message: Option<Option<String>>,
    pub current_stage: Option<i64>,
    pub completed_segments: Option<i64>,
    pub total_segments: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSegment {
    pub id: String,
    pub episode_id: String,
    pub dialogue_segment_id: String,
    pub speaker: String,
    pub file_path: String,
    pub duration_ms: i64,
    pub tts_provider: String,
    pub voice_id: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAudioSegment {
    pub id: String,
    pub episode_id: String,
    pub dialogue_segment_id: String,
    pub speaker: String,
    pub file_path: String,
    pub duration_ms: i64,
    pub tts_provider: String,
    pub voice_id: String,
}

pub struct PodcastRepository<'a> {
    db: &'a Database,
}

impl<'a> PodcastRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn create_episode(&self, req: CreatePodcastEpisodeRequest) -> Result<PodcastEpisode> {
        let conn = self.db.connection();
        let document_ids = serde_json::to_string(&req.document_ids)?;
        conn.execute(
            "INSERT INTO podcast_episodes (
                id, document_ids, run_id, title, scope_description, style, language,
                duration_tier, tts_provider, audio_format, status, script_json,
                current_stage, completed_segments, total_segments
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'queued', '{}', 0, 0, 0)",
            params![
                req.id,
                document_ids,
                req.run_id,
                req.title,
                req.scope_description,
                req.style,
                req.language,
                req.duration_tier,
                req.tts_provider,
                req.audio_format,
            ],
        )?;
        self.get_episode(&req.id)?
            .ok_or_else(|| super::DbError::Sqlite(rusqlite::Error::QueryReturnedNoRows))
    }

    pub fn get_episode(&self, id: &str) -> Result<Option<PodcastEpisode>> {
        let conn = self.db.connection();
        let mut stmt = conn.prepare(
            "SELECT id, document_ids, run_id, title, scope_description, style, language,
                    duration_tier, tts_provider, audio_format, script_json, outline_json,
                    evaluation_json, audio_path, duration_ms, status, error_message,
                    current_stage, completed_segments, total_segments, created_at, updated_at
             FROM podcast_episodes WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            map_podcast_episode(row)
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn list_episodes(&self) -> Result<Vec<PodcastEpisode>> {
        let conn = self.db.connection();
        let mut stmt = conn.prepare(
            "SELECT id, document_ids, run_id, title, scope_description, style, language,
                    duration_tier, tts_provider, audio_format, script_json, outline_json,
                    evaluation_json, audio_path, duration_ms, status, error_message,
                    current_stage, completed_segments, total_segments, created_at, updated_at
             FROM podcast_episodes ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], map_podcast_episode)?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn update_episode(&self, id: &str, updates: &PodcastEpisodeUpdates) -> Result<PodcastEpisode> {
        let Some(current) = self.get_episode(id)? else {
            return Err(super::DbError::Sqlite(rusqlite::Error::QueryReturnedNoRows));
        };

        let next_document_ids = updates
            .document_ids
            .clone()
            .unwrap_or(current.document_ids.clone());
        let next_run_id = updates.run_id.clone().unwrap_or(current.run_id.clone());
        let next_title = updates.title.clone().unwrap_or(current.title.clone());
        let next_scope_description = updates
            .scope_description
            .clone()
            .unwrap_or(current.scope_description.clone());
        let next_style = updates.style.clone().unwrap_or(current.style.clone());
        let next_language = updates.language.clone().unwrap_or(current.language.clone());
        let next_duration_tier = updates
            .duration_tier
            .clone()
            .unwrap_or(current.duration_tier.clone());
        let next_tts_provider = updates
            .tts_provider
            .clone()
            .unwrap_or(current.tts_provider.clone());
        let next_audio_format = updates
            .audio_format
            .clone()
            .unwrap_or(current.audio_format.clone());
        let next_script_json = updates
            .script_json
            .clone()
            .unwrap_or(current.script_json.clone());
        let next_outline_json = updates
            .outline_json
            .clone()
            .unwrap_or(current.outline_json.clone());
        let next_evaluation_json = updates
            .evaluation_json
            .clone()
            .unwrap_or(current.evaluation_json.clone());
        let next_audio_path = updates.audio_path.clone().unwrap_or(current.audio_path.clone());
        let next_duration_ms = updates.duration_ms.unwrap_or(current.duration_ms);
        let next_status = updates.status.clone().unwrap_or(current.status.clone());
        let next_error_message = updates
            .error_message
            .clone()
            .unwrap_or(current.error_message.clone());
        let next_current_stage = updates.current_stage.unwrap_or(current.current_stage);
        let next_completed_segments = updates
            .completed_segments
            .unwrap_or(current.completed_segments);
        let next_total_segments = updates.total_segments.unwrap_or(current.total_segments);
        let document_ids_json = serde_json::to_string(&next_document_ids)?;

        self.db.connection().execute(
            "UPDATE podcast_episodes
             SET document_ids = ?1,
                 run_id = ?2,
                 title = ?3,
                 scope_description = ?4,
                 style = ?5,
                 language = ?6,
                 duration_tier = ?7,
                 tts_provider = ?8,
                 audio_format = ?9,
                 script_json = ?10,
                 outline_json = ?11,
                 evaluation_json = ?12,
                 audio_path = ?13,
                 duration_ms = ?14,
                 status = ?15,
                 error_message = ?16,
                 current_stage = ?17,
                 completed_segments = ?18,
                 total_segments = ?19,
                 updated_at = ?20
             WHERE id = ?21",
            params![
                document_ids_json,
                next_run_id,
                next_title,
                next_scope_description,
                next_style,
                next_language,
                next_duration_tier,
                next_tts_provider,
                next_audio_format,
                next_script_json,
                next_outline_json,
                next_evaluation_json,
                next_audio_path,
                next_duration_ms,
                next_status,
                next_error_message,
                next_current_stage,
                next_completed_segments,
                next_total_segments,
                chrono::Utc::now().to_rfc3339(),
                id,
            ],
        )?;

        self.get_episode(id)?
            .ok_or_else(|| super::DbError::Sqlite(rusqlite::Error::QueryReturnedNoRows))
    }

    pub fn delete_episode(&self, id: &str) -> Result<()> {
        self.db.connection().execute(
            "DELETE FROM podcast_episodes WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn save_audio_segment(&self, segment: NewAudioSegment) -> Result<AudioSegment> {
        let now = chrono::Utc::now().to_rfc3339();
        self.db.connection().execute(
            "INSERT INTO podcast_audio_segments (
                id, episode_id, dialogue_segment_id, speaker, file_path,
                duration_ms, tts_provider, voice_id, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                episode_id = excluded.episode_id,
                dialogue_segment_id = excluded.dialogue_segment_id,
                speaker = excluded.speaker,
                file_path = excluded.file_path,
                duration_ms = excluded.duration_ms,
                tts_provider = excluded.tts_provider,
                voice_id = excluded.voice_id",
            params![
                segment.id,
                segment.episode_id,
                segment.dialogue_segment_id,
                segment.speaker,
                segment.file_path,
                segment.duration_ms,
                segment.tts_provider,
                segment.voice_id,
                now,
            ],
        )?;

        let mut stmt = self.db.connection().prepare(
            "SELECT id, episode_id, dialogue_segment_id, speaker, file_path,
                    duration_ms, tts_provider, voice_id, created_at
             FROM podcast_audio_segments WHERE id = ?1",
        )?;
        let segment = stmt.query_row(params![segment.id], map_audio_segment)?;
        Ok(segment)
    }

    pub fn list_audio_segments(&self, episode_id: &str) -> Result<Vec<AudioSegment>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, episode_id, dialogue_segment_id, speaker, file_path,
                    duration_ms, tts_provider, voice_id, created_at
             FROM podcast_audio_segments
             WHERE episode_id = ?1
             ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map(params![episode_id], map_audio_segment)?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn delete_audio_segments_by_episode(&self, episode_id: &str) -> Result<()> {
        self.db.connection().execute(
            "DELETE FROM podcast_audio_segments WHERE episode_id = ?1",
            params![episode_id],
        )?;
        Ok(())
    }

    pub fn insert(&self, req: CreatePodcastEpisodeRequest) -> Result<PodcastEpisode> {
        self.create_episode(req)
    }

    pub fn get_by_id(&self, id: &str) -> Result<Option<PodcastEpisode>> {
        self.get_episode(id)
    }

    pub fn list_all(&self) -> Result<Vec<PodcastEpisode>> {
        self.list_episodes()
    }

    pub fn delete_by_id(&self, id: &str) -> Result<()> {
        self.delete_episode(id)
    }
}

fn map_podcast_episode(row: &rusqlite::Row<'_>) -> rusqlite::Result<PodcastEpisode> {
    let document_ids_raw: String = row.get(1)?;
    let document_ids = serde_json::from_str::<Vec<String>>(&document_ids_raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(1, Type::Text, Box::new(error))
    })?;

    Ok(PodcastEpisode {
        id: row.get(0)?,
        document_ids,
        run_id: row.get(2)?,
        title: row.get(3)?,
        scope_description: row.get(4)?,
        style: row.get(5)?,
        language: row.get(6)?,
        duration_tier: row.get(7)?,
        tts_provider: row.get(8)?,
        audio_format: row.get(9)?,
        script_json: row.get(10)?,
        outline_json: row.get(11)?,
        evaluation_json: row.get(12)?,
        audio_path: row.get(13)?,
        duration_ms: row.get(14)?,
        status: row.get(15)?,
        error_message: row.get(16)?,
        current_stage: row.get(17)?,
        completed_segments: row.get(18)?,
        total_segments: row.get(19)?,
        created_at: row.get(20)?,
        updated_at: row.get(21)?,
    })
}

fn map_audio_segment(row: &rusqlite::Row<'_>) -> rusqlite::Result<AudioSegment> {
    Ok(AudioSegment {
        id: row.get(0)?,
        episode_id: row.get(1)?,
        dialogue_segment_id: row.get(2)?,
        speaker: row.get(3)?,
        file_path: row.get(4)?,
        duration_ms: row.get(5)?,
        tts_provider: row.get(6)?,
        voice_id: row.get(7)?,
        created_at: row.get(8)?,
    })
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::*;
    use crate::db::Database;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().expect("in-memory sqlite");
        conn.execute_batch(include_str!("../migrations/V1__initial_schema.sql"))
            .expect("apply v1 migration");
        conn.execute_batch(include_str!("../migrations/V2__workflow_and_fts_foundation.sql"))
            .expect("apply v2 migration");
        conn.execute_batch(include_str!("../migrations/V6__podcast_episodes.sql"))
            .expect("apply v6 migration");
        conn.execute_batch(include_str!("../migrations/V16__podcast_workflow_v3.sql"))
            .expect("apply v16 migration");

        Database { conn }
    }

    #[test]
    fn podcast_episode_and_audio_segment_roundtrip() {
        let db = test_db();
        let repo = PodcastRepository::new(&db);

        let episode = repo
            .create_episode(CreatePodcastEpisodeRequest {
                id: "podcast-1".to_string(),
                document_ids: vec!["doc-1".to_string(), "doc-2".to_string()],
                run_id: Some("run-1".to_string()),
                title: "播客测试".to_string(),
                scope_description: "测试范围".to_string(),
                style: "interview".to_string(),
                language: "zh-CN".to_string(),
                duration_tier: "medium".to_string(),
                tts_provider: "auto".to_string(),
                audio_format: "mp3".to_string(),
            })
            .expect("create episode");

        assert_eq!(episode.document_ids.len(), 2);
        assert_eq!(episode.style, "interview");
        assert_eq!(episode.status, "queued");

        let updated = repo
            .update_episode(
                &episode.id,
                &PodcastEpisodeUpdates {
                    status: Some("generating_script".to_string()),
                    outline_json: Some(Some("{\"title\":\"outline\"}".to_string())),
                    evaluation_json: Some(Some("{\"overallScore\":8}".to_string())),
                    current_stage: Some(3),
                    completed_segments: Some(1),
                    total_segments: Some(2),
                    ..PodcastEpisodeUpdates::default()
                },
            )
            .expect("update episode");

        assert_eq!(updated.status, "generating_script");
        assert_eq!(updated.current_stage, 3);
        assert_eq!(updated.completed_segments, 1);
        assert_eq!(updated.total_segments, 2);
        assert!(updated.outline_json.is_some());

        let segment = repo
            .save_audio_segment(NewAudioSegment {
                id: "audio-1".to_string(),
                episode_id: episode.id.clone(),
                dialogue_segment_id: "seg-1".to_string(),
                speaker: "主持人".to_string(),
                file_path: "C:/tmp/audio-1.mp3".to_string(),
                duration_ms: 5000,
                tts_provider: "edge_tts".to_string(),
                voice_id: "zh-CN-XiaoxiaoNeural".to_string(),
            })
            .expect("save audio segment");

        assert_eq!(segment.episode_id, episode.id);
        assert_eq!(repo.list_audio_segments(&episode.id).expect("list audio").len(), 1);

        repo.delete_episode(&episode.id).expect("delete episode");
        assert!(repo.get_episode(&episode.id).expect("get episode").is_none());
        assert!(repo.list_audio_segments(&episode.id).expect("list deleted audio").is_empty());
    }
}
