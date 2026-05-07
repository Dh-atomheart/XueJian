use chrono::{Duration, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        CreateMvp0CardGroupRequest, CreateMvp0CardRequest, CreateMvp0StudyEventRequest,
        Mvp0CardRepository, Mvp0DueCard, Mvp0StudyRepository, UpdateMvp0ReviewStateRequest,
    },
};

const DEFAULT_DAILY_NEW_LIMIT: i64 = 20;
const DEFAULT_DAILY_REVIEW_LIMIT: i64 = 100;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyQueueItemDto {
    pub id: String,
    pub group_id: String,
    pub title: String,
    pub front: String,
    pub back: String,
    pub state: String,
    pub due_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitStudyReviewInput {
    pub card_id: String,
    pub rating: String,
    pub started_at: Option<String>,
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitStudyReviewResponse {
    pub next_due_at: String,
    pub new_state: String,
}

#[tauri::command]
pub fn get_daily_queue(
    state: State<'_, AppState>,
    new_limit: Option<i64>,
    review_limit: Option<i64>,
) -> CommandResult<Vec<StudyQueueItemDto>> {
    let db = state.lock_db()?;
    get_daily_queue_inner(
        db.connection(),
        new_limit.unwrap_or(DEFAULT_DAILY_NEW_LIMIT),
        review_limit.unwrap_or(DEFAULT_DAILY_REVIEW_LIMIT),
    )
}

#[tauri::command]
pub fn submit_study_review(
    state: State<'_, AppState>,
    data: SubmitStudyReviewInput,
) -> CommandResult<SubmitStudyReviewResponse> {
    let db = state.lock_db()?;
    submit_study_review_inner(db.connection(), data)
}

fn get_daily_queue_inner(
    conn: &Connection,
    new_limit: i64,
    review_limit: i64,
) -> CommandResult<Vec<StudyQueueItemDto>> {
    let study_repo = Mvp0StudyRepository::new(conn);
    let queue = study_repo.get_daily_queue(
        &Utc::now().to_rfc3339(),
        sanitize_limit(new_limit, DEFAULT_DAILY_NEW_LIMIT),
        sanitize_limit(review_limit, DEFAULT_DAILY_REVIEW_LIMIT),
    )?;

    Ok(queue.into_iter().map(StudyQueueItemDto::from).collect())
}

fn submit_study_review_inner(
    conn: &Connection,
    data: SubmitStudyReviewInput,
) -> CommandResult<SubmitStudyReviewResponse> {
    let rating = normalize_rating(&data.rating)?;
    let study_repo = Mvp0StudyRepository::new(conn);
    let card_repo = Mvp0CardRepository::new(conn);

    let review_state = study_repo
        .get_review_state(&data.card_id)?
        .ok_or(CommandError::NotFound)?;
    let card = card_repo
        .find_card_by_id(&data.card_id)?
        .ok_or(CommandError::NotFound)?;

    let answered_at = Utc::now();
    let schedule = compute_schedule(&review_state.state, &rating, answered_at);

    study_repo.update_review_state(UpdateMvp0ReviewStateRequest {
        card_id: data.card_id.clone(),
        state: schedule.new_state.clone(),
        due_at: schedule.next_due_at.clone(),
        last_reviewed_at: Some(answered_at.to_rfc3339()),
        review_count: review_state.review_count + 1,
        lapse_count: review_state.lapse_count + schedule.lapse_increment,
        stability: None,
        difficulty: None,
    })?;

    study_repo.append_study_event(CreateMvp0StudyEventRequest {
        card_id: data.card_id,
        group_id: card.group_id,
        rating,
        started_at: data.started_at,
        answered_at: Some(answered_at.to_rfc3339()),
        duration_ms: data.duration_ms,
        previous_due_at: Some(review_state.due_at),
        next_due_at: schedule.next_due_at.clone(),
    })?;

    Ok(SubmitStudyReviewResponse {
        next_due_at: schedule.next_due_at,
        new_state: schedule.new_state,
    })
}

fn sanitize_limit(limit: i64, fallback: i64) -> i64 {
    if limit > 0 {
        limit
    } else {
        fallback
    }
}

fn normalize_rating(rating: &str) -> CommandResult<String> {
    let normalized = rating.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "again" | "hard" | "good" | "easy" => Ok(normalized),
        _ => Err(CommandError::InvalidInput("无效复习反馈档位".to_string())),
    }
}

struct ScheduledReview {
    new_state: String,
    next_due_at: String,
    lapse_increment: i32,
}

fn compute_schedule(
    current_state: &str,
    rating: &str,
    answered_at: chrono::DateTime<Utc>,
) -> ScheduledReview {
    match rating {
        "again" => ScheduledReview {
            new_state: if matches!(current_state, "review" | "relearning") {
                "relearning".to_string()
            } else {
                "learning".to_string()
            },
            next_due_at: (answered_at + Duration::minutes(10)).to_rfc3339(),
            lapse_increment: 1,
        },
        "hard" => ScheduledReview {
            new_state: "learning".to_string(),
            next_due_at: (answered_at + Duration::days(1)).to_rfc3339(),
            lapse_increment: 0,
        },
        "good" => ScheduledReview {
            new_state: "review".to_string(),
            next_due_at: (answered_at + Duration::days(3)).to_rfc3339(),
            lapse_increment: 0,
        },
        _ => ScheduledReview {
            new_state: "review".to_string(),
            next_due_at: (answered_at + Duration::days(7)).to_rfc3339(),
            lapse_increment: 0,
        },
    }
}

impl From<Mvp0DueCard> for StudyQueueItemDto {
    fn from(card: Mvp0DueCard) -> Self {
        Self {
            id: card.card_id,
            group_id: card.group_id,
            title: card.title,
            front: card.front,
            back: card.back,
            state: card.state,
            due_at: card.due_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::TestDatabase;

    fn create_test_card(conn: &Connection) -> (String, String) {
        let card_repo = Mvp0CardRepository::new(conn);
        let group = card_repo
            .create_group(CreateMvp0CardGroupRequest {
                name: "Main".to_string(),
                description: None,
                color: None,
                is_enabled: Some(true),
            })
            .expect("group should be created");
        let card = card_repo
            .create_card(CreateMvp0CardRequest {
                group_id: group.id.clone(),
                source_document_id: None,
                source_anchor_id: None,
                title: "Card".to_string(),
                front: "Front".to_string(),
                back: "Back".to_string(),
                tags: vec![],
                origin: Some("manual".to_string()),
                initial_due_at: Some("2026-01-01T00:00:00Z".to_string()),
            })
            .expect("card should be created");

        (group.id, card.id)
    }

    #[test]
    fn four_grade_mapping_updates_due_windows() {
        let answered_at = Utc::now();
        let cases = [
            ("again", 10_i64, 1_i32, "learning"),
            ("hard", 24 * 60_i64, 0_i32, "learning"),
            ("good", 3 * 24 * 60_i64, 0_i32, "review"),
            ("easy", 7 * 24 * 60_i64, 0_i32, "review"),
        ];

        for (rating, expected_minutes, expected_lapse_increment, expected_state) in cases {
            let scheduled = compute_schedule("new", rating, answered_at);
            let next_due_at = chrono::DateTime::parse_from_rfc3339(&scheduled.next_due_at)
                .expect("next due at should parse")
                .with_timezone(&Utc);
            let delta_minutes = (next_due_at - answered_at).num_minutes();

            assert_eq!(delta_minutes, expected_minutes);
            assert_eq!(scheduled.lapse_increment, expected_lapse_increment);
            assert_eq!(scheduled.new_state, expected_state);
        }
    }

    #[test]
    fn submit_review_updates_review_state() {
        let test_db = TestDatabase::new();
        let (_, card_id) = create_test_card(test_db.connection());

        let response = submit_study_review_inner(
            test_db.connection(),
            SubmitStudyReviewInput {
                card_id: card_id.clone(),
                rating: "good".to_string(),
                started_at: Some("2026-01-02T00:00:00Z".to_string()),
                duration_ms: Some(2_000),
            },
        )
        .expect("review submission should succeed");

        let review_state = Mvp0StudyRepository::new(test_db.connection())
            .get_review_state(&card_id)
            .expect("review state should load")
            .expect("review state should exist");

        assert_eq!(response.new_state, "review");
        assert_eq!(review_state.state, "review");
        assert_eq!(review_state.review_count, 1);
        assert_eq!(review_state.lapse_count, 0);
        assert_eq!(review_state.due_at, response.next_due_at);
        assert!(review_state.last_reviewed_at.is_some());
    }

    #[test]
    fn submit_review_appends_study_event() {
        let test_db = TestDatabase::new();
        let (group_id, card_id) = create_test_card(test_db.connection());

        let response = submit_study_review_inner(
            test_db.connection(),
            SubmitStudyReviewInput {
                card_id: card_id.clone(),
                rating: "again".to_string(),
                started_at: Some("2026-01-02T00:00:00Z".to_string()),
                duration_ms: Some(1_000),
            },
        )
        .expect("review submission should succeed");

        let event: (String, String, String, String) = test_db
            .connection()
            .query_row(
                "SELECT group_id, rating, previous_due_at, next_due_at FROM study_events WHERE card_id = ?1",
                [card_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("study event should be inserted");

        assert_eq!(event.0, group_id);
        assert_eq!(event.1, "again");
        assert_eq!(event.2, "2026-01-01T00:00:00Z");
        assert_eq!(event.3, response.next_due_at);
    }

    #[test]
    fn submit_review_rejects_unknown_rating() {
        let test_db = TestDatabase::new();
        let (_, card_id) = create_test_card(test_db.connection());

        let result = submit_study_review_inner(
            test_db.connection(),
            SubmitStudyReviewInput {
                card_id,
                rating: "maybe".to_string(),
                started_at: None,
                duration_ms: None,
            },
        );

        assert!(matches!(result, Err(CommandError::InvalidInput(_))));
    }
}
