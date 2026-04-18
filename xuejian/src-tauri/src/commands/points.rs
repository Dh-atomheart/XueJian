use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{CreatePointsEntryRequest, PointsEntry, PointsRepository},
};

const DAILY_FIRST_REVIEW_POINTS: i64 = 10;
const DAILY_FIRST_REVIEW_TX_TYPE: &str = "daily_first_review";
const DAILY_FIRST_REVIEW_SCOPE_PREFIX: &str = "daily-first-review";

// ───── DTOs ─────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordPointsDto {
    pub review_log_id: String,
    pub card_id: String,
    pub rating: String,
    pub card_state: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointsEntryDto {
    pub id: String,
    pub review_log_id: String,
    pub card_id: String,
    pub points: i64,
    pub transaction_type: String,
    pub rating: String,
    pub reason: Option<String>,
    pub created_at: String,
}

impl From<PointsEntry> for PointsEntryDto {
    fn from(e: PointsEntry) -> Self {
        Self {
            id: e.id,
            review_log_id: e.review_log_id,
            card_id: e.card_id,
            points: e.points,
            transaction_type: e.transaction_type,
            rating: e.rating,
            reason: e.reason,
            created_at: e.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointsSummaryDto {
    pub today_points: i64,
}

// ───── Tauri commands ─────

#[tauri::command]
pub fn record_points(
    state: State<'_, AppState>,
    data: RecordPointsDto,
) -> CommandResult<Option<PointsEntryDto>> {
    let valid_ratings = ["again", "hard", "good", "easy"];
    if !valid_ratings.contains(&data.rating.as_str()) {
        return Err(CommandError::InvalidInput(format!(
            "Invalid rating: {}. Expected one of: again, hard, good, easy",
            data.rating
        )));
    }

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let grant_scope = format!("{DAILY_FIRST_REVIEW_SCOPE_PREFIX}:{today}");

    let db = state.lock_db()?;
    let repo = PointsRepository::new(&db);
    let entry = repo.create_entry(CreatePointsEntryRequest {
        review_log_id: data.review_log_id,
        card_id: data.card_id,
        points: DAILY_FIRST_REVIEW_POINTS,
        transaction_type: DAILY_FIRST_REVIEW_TX_TYPE.to_string(),
        rating: data.rating,
        reason: Some(format!(
            "Daily first review bonus for {today} after a {} card review",
            data.card_state
        )),
        grant_scope: Some(grant_scope),
    })?;

    Ok(entry.map(Into::into))
}

#[tauri::command]
pub fn list_points_ledger(
    state: State<'_, AppState>,
    card_id: Option<String>,
    limit: Option<i64>,
) -> CommandResult<Vec<PointsEntryDto>> {
    let db = state.lock_db()?;
    let repo = PointsRepository::new(&db);
    let entries = repo.list_entries(card_id.as_deref(), limit)?;
    Ok(entries.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn get_points_summary(state: State<'_, AppState>) -> CommandResult<PointsSummaryDto> {
    let db = state.lock_db()?;
    let repo = PointsRepository::new(&db);
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let today_points = repo.get_daily_points_total(&today)?;
    Ok(PointsSummaryDto { today_points })
}
