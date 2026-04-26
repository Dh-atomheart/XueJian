use crate::db::{Database, Result};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardAnimation {
    pub id: String,
    pub card_id: String,
    pub run_id: Option<String>,
    pub anim_type: String,
    pub mode: String,
    pub script_json: String,
    pub video_path: Option<String>,
    pub poster_path: Option<String>,
    pub render_log_path: Option<String>,
    pub status: String,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub retryable: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCardAnimationRequest {
    pub card_id: String,
    pub run_id: Option<String>,
    pub anim_type: String,
    pub mode: String,
}

#[derive(Debug, Default)]
pub struct CompleteCardAnimationRequest {
    pub script_json: Option<String>,
    pub video_path: Option<String>,
    pub poster_path: Option<String>,
    pub render_log_path: Option<String>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub retryable: Option<bool>,
}

#[derive(Debug, Default)]
pub struct FailedCardAnimationRequest {
    pub error_code: Option<String>,
    pub error_message: String,
    pub render_log_path: Option<String>,
    pub retryable: bool,
}

pub struct AnimationRepository<'a> {
    db: &'a Database,
}

impl<'a> AnimationRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn upsert(&self, req: CreateCardAnimationRequest) -> Result<CardAnimation> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        self.db.connection().execute(
            "DELETE FROM card_animations WHERE card_id = ?1",
            params![&req.card_id],
        )?;

        self.db.connection().execute(
            "INSERT INTO card_animations (
                id, card_id, run_id, anim_type, mode, script_json, video_path, poster_path,
                render_log_path, status, error_code, error_message, retryable, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, '{}', NULL, NULL, NULL, 'queued', NULL, NULL, 1, ?6, ?6)",
            params![&id, &req.card_id, &req.run_id, &req.anim_type, &req.mode, &now],
        )?;

        Ok(CardAnimation {
            id,
            card_id: req.card_id,
            run_id: req.run_id,
            anim_type: req.anim_type,
            mode: req.mode,
            script_json: "{}".to_string(),
            video_path: None,
            poster_path: None,
            render_log_path: None,
            status: "queued".to_string(),
            error_code: None,
            error_message: None,
            retryable: true,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn get_by_card_id(&self, card_id: &str) -> Result<Option<CardAnimation>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, card_id, run_id, anim_type, mode, script_json, video_path, poster_path,
                    render_log_path, status, error_code, error_message, retryable, created_at, updated_at
             FROM card_animations WHERE card_id = ?1",
        )?;

        let mut rows = stmt.query(params![card_id])?;
        if let Some(row) = rows.next()? {
            return Ok(Some(CardAnimation {
                id: row.get(0)?,
                card_id: row.get(1)?,
                run_id: row.get(2)?,
                anim_type: row.get(3)?,
                mode: row.get(4)?,
                script_json: row.get(5)?,
                video_path: row.get(6)?,
                poster_path: row.get(7)?,
                render_log_path: row.get(8)?,
                status: row.get(9)?,
                error_code: row.get(10)?,
                error_message: row.get(11)?,
                retryable: row.get::<_, i64>(12)? != 0,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            }));
        }
        Ok(None)
    }

    pub fn set_ready(&self, card_id: &str, request: CompleteCardAnimationRequest) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        self.db.connection().execute(
            "UPDATE card_animations
             SET script_json = COALESCE(?1, script_json),
                 video_path = ?2,
                 poster_path = ?3,
                 render_log_path = ?4,
                 status = 'ready',
                 error_code = ?5,
                 error_message = ?6,
                 retryable = ?7,
                 updated_at = ?8
             WHERE card_id = ?9",
            params![
                request.script_json,
                request.video_path,
                request.poster_path,
                request.render_log_path,
                request.error_code,
                request.error_message,
                i64::from(request.retryable.unwrap_or(true)),
                &now,
                card_id
            ],
        )?;
        Ok(())
    }

    pub fn set_generating(&self, card_id: &str) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        self.db.connection().execute(
            "UPDATE card_animations
             SET status = 'generating',
                 error_code = NULL,
                 error_message = NULL,
                 updated_at = ?1
             WHERE card_id = ?2",
            params![&now, card_id],
        )?;
        Ok(())
    }

    pub fn set_failed(&self, card_id: &str, request: FailedCardAnimationRequest) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        self.db.connection().execute(
            "UPDATE card_animations
             SET status = 'failed',
                 error_code = ?1,
                 error_message = ?2,
                 render_log_path = COALESCE(?3, render_log_path),
                 retryable = ?4,
                 updated_at = ?5
             WHERE card_id = ?6",
            params![
                request.error_code,
                request.error_message,
                request.render_log_path,
                if request.retryable { 1 } else { 0 },
                &now,
                card_id
            ],
        )?;
        Ok(())
    }

    pub fn delete_by_card_id(&self, card_id: &str) -> Result<()> {
        self.db.connection().execute(
            "DELETE FROM card_animations WHERE card_id = ?1",
            params![card_id],
        )?;
        Ok(())
    }
}
