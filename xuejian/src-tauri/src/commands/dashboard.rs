use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::State;

use super::{AppState, CommandResult};

const DEFAULT_HEATMAP_DAYS: i64 = 63;
const DEFAULT_PROGRESS_LIMIT: i64 = 6;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummaryDto {
    pub today_completed_count: i64,
    pub today_new_due_count: i64,
    pub today_review_due_count: i64,
    pub today_study_minutes: i64,
    pub total_study_minutes: i64,
    pub streak_days: i64,
    pub heatmap: Vec<DashboardHeatmapEntryDto>,
    pub document_progress: Vec<DashboardDocumentProgressDto>,
    pub group_progress: Vec<DashboardGroupProgressDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardHeatmapEntryDto {
    pub date: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardDocumentProgressDto {
    pub id: String,
    pub title: String,
    pub learned_cards: i64,
    pub total_cards: i64,
    pub progress_percent: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardGroupProgressDto {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub learned_cards: i64,
    pub total_cards: i64,
    pub progress_percent: i64,
}

#[tauri::command]
pub fn get_dashboard_summary(
    state: State<'_, AppState>,
    days: Option<i64>,
    limit: Option<i64>,
) -> CommandResult<DashboardSummaryDto> {
    let db = state.lock_db()?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let as_of = chrono::Local::now().to_rfc3339();
    get_dashboard_summary_inner(
        db.connection(),
        &today,
        &as_of,
        sanitize_positive(days, DEFAULT_HEATMAP_DAYS),
        sanitize_positive(limit, DEFAULT_PROGRESS_LIMIT),
    )
}

fn get_dashboard_summary_inner(
    conn: &Connection,
    today: &str,
    as_of: &str,
    days: i64,
    limit: i64,
) -> CommandResult<DashboardSummaryDto> {
    let today_completed_count = count_today_completed(conn, today)?;
    let (today_new_due_count, today_review_due_count) = count_due_cards(conn, as_of)?;
    let today_study_minutes = sum_study_minutes(conn, Some(today))?;
    let total_study_minutes = sum_study_minutes(conn, None)?;
    let streak_days = count_streak_days(conn, today)?;

    Ok(DashboardSummaryDto {
        today_completed_count,
        today_new_due_count,
        today_review_due_count,
        today_study_minutes,
        total_study_minutes,
        streak_days,
        heatmap: load_heatmap(conn, today, days)?,
        document_progress: load_document_progress(conn, limit)?,
        group_progress: load_group_progress(conn, limit)?,
    })
}

fn sanitize_positive(value: Option<i64>, fallback: i64) -> i64 {
    value.unwrap_or(fallback).clamp(1, 366)
}

fn count_today_completed(conn: &Connection, today: &str) -> CommandResult<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM study_events WHERE date(answered_at, 'localtime') = ?1",
        [today],
        |row| row.get(0),
    )?)
}

fn count_due_cards(conn: &Connection, as_of: &str) -> CommandResult<(i64, i64)> {
    Ok(conn.query_row(
        "SELECT
            COALESCE(SUM(CASE WHEN rs.state = 'new' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN rs.state <> 'new' THEN 1 ELSE 0 END), 0)
         FROM cards c
         INNER JOIN review_states rs ON rs.card_id = c.id
         INNER JOIN card_groups g ON g.id = c.group_id
         WHERE c.deleted_at IS NULL
           AND g.deleted_at IS NULL
           AND g.is_enabled = 1
           AND rs.due_at <= ?1",
        [as_of],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?)
}

fn sum_study_minutes(conn: &Connection, day: Option<&str>) -> CommandResult<i64> {
    let sql = match day {
        Some(_) => {
            "SELECT COALESCE(SUM(COALESCE(duration_ms, 0)), 0) / 60000
             FROM study_events
             WHERE date(answered_at, 'localtime') = ?1"
        }
        None => "SELECT COALESCE(SUM(COALESCE(duration_ms, 0)), 0) / 60000 FROM study_events",
    };

    let minutes: i64 = match day {
        Some(day) => conn.query_row(sql, [day], |row| row.get(0))?,
        None => conn.query_row(sql, [], |row| row.get(0))?,
    };

    Ok(minutes)
}

fn count_streak_days(conn: &Connection, today: &str) -> CommandResult<i64> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT date(answered_at, 'localtime')
         FROM study_events
         WHERE answered_at IS NOT NULL
           AND date(answered_at, 'localtime') >= date(?1, '-366 days')
         ORDER BY date(answered_at, 'localtime') DESC",
    )?;
    let rows = stmt.query_map([today], |row| row.get::<_, String>(0))?;
    let dates = rows.collect::<std::result::Result<Vec<_>, _>>()?;

    let mut cursor = chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d").map_err(|error| {
        crate::app_state::AppError::InvalidInput(format!("Invalid date for dashboard: {error}"))
    })?;
    let mut streak_days = 0_i64;

    for date in dates {
        let parsed = chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d").map_err(|error| {
            crate::app_state::AppError::InvalidInput(format!("Invalid study event date: {error}"))
        })?;

        if parsed == cursor {
            streak_days += 1;
            cursor = match cursor.pred_opt() {
                Some(previous) => previous,
                None => break,
            };
        } else if parsed < cursor {
            break;
        }
    }

    Ok(streak_days)
}

fn load_heatmap(
    conn: &Connection,
    today: &str,
    days: i64,
) -> CommandResult<Vec<DashboardHeatmapEntryDto>> {
    let lookback_days = days.max(1) - 1;
    let mut stmt = conn.prepare(
        "SELECT date(answered_at, 'localtime') AS study_date, COUNT(*)
         FROM study_events
         WHERE date(answered_at, 'localtime') BETWEEN date(?1, printf('-%d days', ?2)) AND ?1
         GROUP BY study_date
         ORDER BY study_date ASC",
    )?;
    let rows = stmt.query_map(params![today, lookback_days], |row| {
        Ok(DashboardHeatmapEntryDto {
            date: row.get(0)?,
            count: row.get(1)?,
        })
    })?;

    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

fn load_document_progress(
    conn: &Connection,
    limit: i64,
) -> CommandResult<Vec<DashboardDocumentProgressDto>> {
    let mut stmt = conn.prepare(
        "SELECT
            d.id,
            d.title,
            COUNT(DISTINCT c.id) AS total_cards,
            COUNT(DISTINCT se.card_id) AS learned_cards,
            COALESCE(MAX(c.updated_at), d.updated_at, d.created_at) AS sort_time
         FROM documents d
         INNER JOIN cards c ON c.source_document_id = d.id
         LEFT JOIN study_events se ON se.card_id = c.id
         WHERE c.deleted_at IS NULL
         GROUP BY d.id, d.title
         HAVING total_cards > 0
         ORDER BY (learned_cards * 1.0 / total_cards) ASC, sort_time DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], |row| {
        let total_cards: i64 = row.get(2)?;
        let learned_cards: i64 = row.get(3)?;
        Ok(DashboardDocumentProgressDto {
            id: row.get(0)?,
            title: row.get(1)?,
            learned_cards,
            total_cards,
            progress_percent: progress_percent(learned_cards, total_cards),
        })
    })?;

    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

fn load_group_progress(
    conn: &Connection,
    limit: i64,
) -> CommandResult<Vec<DashboardGroupProgressDto>> {
    let mut stmt = conn.prepare(
        "SELECT
            g.id,
            g.name,
            g.color,
            COUNT(DISTINCT c.id) AS total_cards,
            COUNT(DISTINCT se.card_id) AS learned_cards,
            COALESCE(MAX(c.updated_at), g.updated_at, g.created_at) AS sort_time
         FROM card_groups g
         INNER JOIN cards c ON c.group_id = g.id
         LEFT JOIN study_events se ON se.card_id = c.id
         WHERE g.deleted_at IS NULL
           AND g.is_enabled = 1
           AND c.deleted_at IS NULL
         GROUP BY g.id, g.name, g.color
         HAVING total_cards > 0
         ORDER BY (learned_cards * 1.0 / total_cards) ASC, sort_time DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], |row| {
        let total_cards: i64 = row.get(3)?;
        let learned_cards: i64 = row.get(4)?;
        Ok(DashboardGroupProgressDto {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            learned_cards,
            total_cards,
            progress_percent: progress_percent(learned_cards, total_cards),
        })
    })?;

    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

fn progress_percent(learned_cards: i64, total_cards: i64) -> i64 {
    if total_cards <= 0 {
        return 0;
    }

    ((learned_cards as f64 / total_cards as f64) * 100.0).round() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::TestDatabase;
    use crate::db::{
        CreateMvp0CardGroupRequest, CreateMvp0CardRequest, CreateMvp0StudyEventRequest,
        Mvp0CardRepository, Mvp0StudyRepository,
    };

    #[test]
    fn dashboard_summary_uses_study_events_as_fact_source() {
        let test_db = TestDatabase::new();
        let conn = test_db.connection();
        let card_repo = Mvp0CardRepository::new(conn);
        let study_repo = Mvp0StudyRepository::new(conn);

        let group = card_repo
            .create_group(CreateMvp0CardGroupRequest {
                name: "Main".to_string(),
                description: None,
                color: Some("#14B8A6".to_string()),
                is_enabled: Some(true),
            })
            .expect("group should be created");

        let first = card_repo
            .create_card(CreateMvp0CardRequest {
                group_id: group.id.clone(),
                source_document_id: None,
                source_anchor_id: None,
                title: "First".to_string(),
                front: "Front".to_string(),
                back: "Back".to_string(),
                tags: vec![],
                origin: Some("manual".to_string()),
                initial_due_at: Some("2026-05-01T00:00:00Z".to_string()),
            })
            .expect("first card should be created");
        let second = card_repo
            .create_card(CreateMvp0CardRequest {
                group_id: group.id.clone(),
                source_document_id: None,
                source_anchor_id: None,
                title: "Second".to_string(),
                front: "Front".to_string(),
                back: "Back".to_string(),
                tags: vec![],
                origin: Some("manual".to_string()),
                initial_due_at: Some("2026-05-01T00:00:00Z".to_string()),
            })
            .expect("second card should be created");

        study_repo
            .append_study_event(CreateMvp0StudyEventRequest {
                card_id: first.id.clone(),
                group_id: group.id.clone(),
                rating: "good".to_string(),
                started_at: Some("2026-05-02T09:00:00Z".to_string()),
                answered_at: Some("2026-05-02T09:03:30Z".to_string()),
                duration_ms: Some(210_000),
                previous_due_at: None,
                next_due_at: "2026-05-05T00:00:00Z".to_string(),
            })
            .expect("today event should insert");
        study_repo
            .append_study_event(CreateMvp0StudyEventRequest {
                card_id: first.id,
                group_id: group.id.clone(),
                rating: "easy".to_string(),
                started_at: Some("2026-05-01T09:00:00Z".to_string()),
                answered_at: Some("2026-05-01T09:02:00Z".to_string()),
                duration_ms: Some(120_000),
                previous_due_at: None,
                next_due_at: "2026-05-08T00:00:00Z".to_string(),
            })
            .expect("yesterday event should insert");
        study_repo
            .append_study_event(CreateMvp0StudyEventRequest {
                card_id: second.id,
                group_id: group.id,
                rating: "hard".to_string(),
                started_at: Some("2026-04-29T09:00:00Z".to_string()),
                answered_at: Some("2026-04-29T09:01:00Z".to_string()),
                duration_ms: Some(60_000),
                previous_due_at: None,
                next_due_at: "2026-05-01T00:00:00Z".to_string(),
            })
            .expect("older event should insert");

        let summary = get_dashboard_summary_inner(conn, "2026-05-02", "2026-05-02T12:00:00Z", 7, 5)
            .expect("dashboard summary should load");

        assert_eq!(summary.today_completed_count, 1);
        assert_eq!(summary.today_study_minutes, 3);
        assert_eq!(summary.total_study_minutes, 6);
        assert_eq!(summary.streak_days, 2);
        assert!(summary
            .heatmap
            .iter()
            .any(|entry| entry.date == "2026-05-02" && entry.count == 1));
        assert_eq!(summary.group_progress[0].learned_cards, 2);
        assert_eq!(summary.group_progress[0].total_cards, 2);
        assert_eq!(summary.group_progress[0].progress_percent, 100);
    }
}
