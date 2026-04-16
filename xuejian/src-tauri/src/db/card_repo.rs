use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::db::{Database, Result};

#[derive(Debug, Serialize, Deserialize)]
pub struct Card {
    pub id: String,
    pub front: String,
    pub back: String,
    pub document_id: Option<String>,
    pub anchor_id: Option<String>,
    pub source_page: Option<i32>,
    pub source_paragraph: Option<i32>,
    pub tags: Option<serde_json::Value>,
    pub difficulty: f64,
    pub stability: f64,
    pub retrievability: Option<f64>,
    pub state: String,
    pub next_review: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCardRequest {
    pub front: String,
    pub back: String,
    pub document_id: Option<String>,
    pub anchor_id: Option<String>,
    pub source_page: Option<i32>,
    pub source_paragraph: Option<i32>,
    pub tags: Option<Vec<String>>,
}

pub struct CardRepository<'a> {
    db: &'a Database,
}

impl<'a> CardRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn create(&self, req: CreateCardRequest) -> Result<Card> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let tags_json = req.tags.map(|t| serde_json::json!(t));

        self.db.connection().execute(
            "INSERT INTO cards (id, front, back, document_id, anchor_id, source_page, source_paragraph, tags, state, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'new', ?9, ?10)",
            params![
                &id, &req.front, &req.back, req.document_id, req.anchor_id,
                req.source_page, req.source_paragraph, tags_json,
                &now, &now
            ],
        )?;

        Ok(Card {
            id,
            front: req.front,
            back: req.back,
            document_id: req.document_id,
            anchor_id: req.anchor_id,
            source_page: req.source_page,
            source_paragraph: req.source_paragraph,
            tags: tags_json,
            difficulty: 0.3,
            stability: 1.0,
            retrievability: None,
            state: "new".to_string(),
            next_review: None,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn find_due_cards(&self, limit: Option<i64>) -> Result<Vec<Card>> {
        let limit = limit.unwrap_or(50);
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();

        let mut stmt = self.db.connection().prepare(
            "SELECT id, front, back, document_id, anchor_id, source_page, source_paragraph, tags,
                    difficulty, stability, retrievability, state, next_review, created_at, updated_at
             FROM cards
             WHERE state != 'suspended'
               AND (next_review IS NULL OR next_review <= ?1)
             ORDER BY next_review ASC
             LIMIT ?2"
        )?;

        let cards = stmt.query_map(params![&today, limit], |row| {
            Ok(Card {
                id: row.get(0)?,
                front: row.get(1)?,
                back: row.get(2)?,
                document_id: row.get(3)?,
                anchor_id: row.get(4)?,
                source_page: row.get(5)?,
                source_paragraph: row.get(6)?,
                tags: row.get(7)?,
                difficulty: row.get(8)?,
                stability: row.get(9)?,
                retrievability: row.get(10)?,
                state: row.get(11)?,
                next_review: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })?;

        cards.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn update_review(&self, id: &str, difficulty: f64, stability: f64, retrievability: f64, state: &str, next_review: &str) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();

        self.db.connection().execute(
            "UPDATE cards SET difficulty = ?1, stability = ?2, retrievability = ?3, state = ?4, next_review = ?5, updated_at = ?6 WHERE id = ?7",
            params![difficulty, stability, retrievability, state, next_review, &now, id],
        )?;

        Ok(())
    }
}
