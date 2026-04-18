use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{CreatePointsEntryRequest, PointsEntry, PointsRepository},
};

// ───── Points calculation rules ─────

const POINTS_AGAIN: i64 = 1;
const POINTS_HARD: i64 = 5;
const POINTS_GOOD: i64 = 10;
const POINTS_EASY: i64 = 15;
const BONUS_NEW_CARD: i64 = 5;

fn calculate_points(rating: &str, card_state: &str) -> (i64, String) {
    let base = match rating {
        "again" => POINTS_AGAIN,
        "hard" => POINTS_HARD,
        "good" => POINTS_GOOD,
        "easy" => POINTS_EASY,
        _ => 0,
    };

    let bonus = if card_state == "new" { BONUS_NEW_CARD } else { 0 };

    let tx_type = if card_state == "new" {
        "review_new"
    } else {
        match rating {
            "easy" => "review_easy",
            "good" => "review_correct",
            _ => "review_learning",
        }
    };

    (base + bonus, tx_type.to_string())
}

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

    let (points, transaction_type) = calculate_points(&data.rating, &data.card_state);

    let db = state.lock_db()?;
    let repo = PointsRepository::new(&db);
    let entry = repo.create_entry(CreatePointsEntryRequest {
        review_log_id: data.review_log_id,
        card_id: data.card_id,
        points,
        transaction_type,
        rating: data.rating,
        reason: None,
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
