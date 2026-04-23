use crate::db::{Database, Result};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PointsEntry {
    pub id: String,
    pub review_log_id: String,
    pub card_id: String,
    pub points: i64,
    pub transaction_type: String,
    pub rating: String,
    pub reason: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePointsEntryRequest {
    pub review_log_id: String,
    pub card_id: String,
    pub points: i64,
    pub transaction_type: String,
    pub rating: String,
    pub reason: Option<String>,
    pub grant_scope: Option<String>,
}

pub struct PointsRepository<'a> {
    db: &'a Database,
}

impl<'a> PointsRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    /// Insert a points entry. Returns Ok(None) if review_log_id already exists (dedup).
    pub fn create_entry(&self, req: CreatePointsEntryRequest) -> Result<Option<PointsEntry>> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        let result = self.db.connection().execute(
            "INSERT OR IGNORE INTO points_ledger (
                id, review_log_id, card_id, points, transaction_type, rating, reason, grant_scope, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &id,
                &req.review_log_id,
                &req.card_id,
                req.points,
                &req.transaction_type,
                &req.rating,
                &req.reason,
                &req.grant_scope,
                &now,
            ],
        )?;

        if result == 0 {
            // UNIQUE constraint on review_log_id — duplicate, skip
            return Ok(None);
        }

        Ok(Some(PointsEntry {
            id,
            review_log_id: req.review_log_id,
            card_id: req.card_id,
            points: req.points,
            transaction_type: req.transaction_type,
            rating: req.rating,
            reason: req.reason,
            created_at: now,
        }))
    }

    /// List ledger entries, optionally filtered by card_id, ordered newest-first.
    pub fn list_entries(
        &self,
        card_id: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Vec<PointsEntry>> {
        let limit = limit.unwrap_or(100);
        let mut stmt = self.db.connection().prepare(
            "SELECT id, review_log_id, card_id, points, transaction_type, rating, reason, created_at
             FROM points_ledger
             WHERE (?1 IS NULL OR card_id = ?1)
             ORDER BY created_at DESC
             LIMIT ?2",
        )?;

        let entries = stmt.query_map(params![card_id, limit], |row| {
            Ok(PointsEntry {
                id: row.get(0)?,
                review_log_id: row.get(1)?,
                card_id: row.get(2)?,
                points: row.get(3)?,
                transaction_type: row.get(4)?,
                rating: row.get(5)?,
                reason: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;

        entries
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// Get today's total points.
    pub fn get_daily_points_total(&self, date: &str) -> Result<i64> {
        let total: i64 = self.db.connection().query_row(
            "SELECT COALESCE(SUM(points), 0)
                 FROM points_ledger
                 WHERE date(created_at) = ?1",
            params![date],
            |row| row.get(0),
        )?;
        Ok(total)
    }

    /// Check whether a review_log_id already has a points entry.
    pub fn has_entry_for_review_log(&self, review_log_id: &str) -> Result<bool> {
        let count: i64 = self.db.connection().query_row(
            "SELECT COUNT(*) FROM points_ledger WHERE review_log_id = ?1",
            params![review_log_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }
}
