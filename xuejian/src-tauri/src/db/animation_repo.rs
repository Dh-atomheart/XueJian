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
    pub script_json: String,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCardAnimationRequest {
    pub card_id: String,
    pub run_id: Option<String>,
    pub anim_type: String,
}

pub struct AnimationRepository<'a> {
    db: &'a Database,
}

impl<'a> AnimationRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    /// Insert or replace an animation for a card (unique constraint on card_id).
    pub fn upsert(&self, req: CreateCardAnimationRequest) -> Result<CardAnimation> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        // Remove any existing animation for this card first (upsert semantics)
        self.db.connection().execute(
            "DELETE FROM card_animations WHERE card_id = ?1",
            params![&req.card_id],
        )?;

        self.db.connection().execute(
            "INSERT INTO card_animations (id, card_id, run_id, anim_type, script_json, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, '{}', 'queued', ?5, ?5)",
            params![
                &id,
                &req.card_id,
                &req.run_id,
                &req.anim_type,
                &now,
            ],
        )?;

        Ok(CardAnimation {
            id,
            card_id: req.card_id,
            run_id: req.run_id,
            anim_type: req.anim_type,
            script_json: "{}".to_string(),
            status: "queued".to_string(),
            error_message: None,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Fetch the animation for a card, if any.
    pub fn get_by_card_id(&self, card_id: &str) -> Result<Option<CardAnimation>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, card_id, run_id, anim_type, script_json, status, error_message, created_at, updated_at
             FROM card_animations WHERE card_id = ?1",
        )?;

        let mut rows = stmt.query(params![card_id])?;
        if let Some(row) = rows.next()? {
            return Ok(Some(CardAnimation {
                id: row.get(0)?,
                card_id: row.get(1)?,
                run_id: row.get(2)?,
                anim_type: row.get(3)?,
                script_json: row.get(4)?,
                status: row.get(5)?,
                error_message: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            }));
        }
        Ok(None)
    }

    /// Update script and status once generation completes.
    pub fn set_ready(&self, card_id: &str, script_json: &str) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        self.db.connection().execute(
            "UPDATE card_animations SET script_json = ?1, status = 'ready', error_message = NULL, updated_at = ?2
             WHERE card_id = ?3",
            params![script_json, &now, card_id],
        )?;
        Ok(())
    }

    /// Mark animation as generating.
    pub fn set_generating(&self, card_id: &str) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        self.db.connection().execute(
            "UPDATE card_animations SET status = 'generating', updated_at = ?1 WHERE card_id = ?2",
            params![&now, card_id],
        )?;
        Ok(())
    }

    /// Mark animation as failed with an error message.
    pub fn set_failed(&self, card_id: &str, error: &str) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        self.db.connection().execute(
            "UPDATE card_animations SET status = 'failed', error_message = ?1, updated_at = ?2
             WHERE card_id = ?3",
            params![error, &now, card_id],
        )?;
        Ok(())
    }

    /// Delete the animation for a card.
    pub fn delete_by_card_id(&self, card_id: &str) -> Result<()> {
        self.db.connection().execute(
            "DELETE FROM card_animations WHERE card_id = ?1",
            params![card_id],
        )?;
        Ok(())
    }
}
