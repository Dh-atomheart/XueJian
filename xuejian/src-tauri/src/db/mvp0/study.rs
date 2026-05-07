use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::Result;

use super::now_utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mvp0ReviewState {
    pub id: String,
    pub card_id: String,
    pub state: String,
    pub due_at: String,
    pub last_reviewed_at: Option<String>,
    pub review_count: i32,
    pub lapse_count: i32,
    pub stability: Option<f64>,
    pub difficulty: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mvp0StudyEvent {
    pub id: String,
    pub card_id: String,
    pub group_id: String,
    pub rating: String,
    pub started_at: Option<String>,
    pub answered_at: String,
    pub duration_ms: Option<i64>,
    pub previous_due_at: Option<String>,
    pub next_due_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mvp0DueCard {
    pub card_id: String,
    pub group_id: String,
    pub title: String,
    pub front: String,
    pub back: String,
    pub due_at: String,
    pub state: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMvp0ReviewStateRequest {
    pub card_id: String,
    pub state: String,
    pub due_at: String,
    pub last_reviewed_at: Option<String>,
    pub review_count: i32,
    pub lapse_count: i32,
    pub stability: Option<f64>,
    pub difficulty: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateMvp0StudyEventRequest {
    pub card_id: String,
    pub group_id: String,
    pub rating: String,
    pub started_at: Option<String>,
    pub answered_at: Option<String>,
    pub duration_ms: Option<i64>,
    pub previous_due_at: Option<String>,
    pub next_due_at: String,
}

pub struct Mvp0StudyRepository<'a> {
    conn: &'a Connection,
}

impl<'a> Mvp0StudyRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn get_review_state(&self, card_id: &str) -> Result<Option<Mvp0ReviewState>> {
        self.conn
            .query_row(
                "SELECT id, card_id, state, due_at, last_reviewed_at, review_count, lapse_count,
                        stability, difficulty, created_at, updated_at
                 FROM review_states
                 WHERE card_id = ?1",
                [card_id],
                map_review_state,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn update_review_state(&self, req: UpdateMvp0ReviewStateRequest) -> Result<()> {
        let updated_at = now_utc();
        self.conn.execute(
            "UPDATE review_states
             SET state = ?2,
                 due_at = ?3,
                 last_reviewed_at = ?4,
                 review_count = ?5,
                 lapse_count = ?6,
                 stability = ?7,
                 difficulty = ?8,
                 updated_at = ?9
             WHERE card_id = ?1",
            params![
                req.card_id,
                req.state,
                req.due_at,
                req.last_reviewed_at,
                req.review_count,
                req.lapse_count,
                req.stability,
                req.difficulty,
                updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn append_study_event(&self, req: CreateMvp0StudyEventRequest) -> Result<Mvp0StudyEvent> {
        let event = Mvp0StudyEvent {
            id: Uuid::new_v4().to_string(),
            card_id: req.card_id,
            group_id: req.group_id,
            rating: req.rating,
            started_at: req.started_at,
            answered_at: req.answered_at.unwrap_or_else(now_utc),
            duration_ms: req.duration_ms,
            previous_due_at: req.previous_due_at,
            next_due_at: req.next_due_at,
        };

        self.conn.execute(
            "INSERT INTO study_events (
                id, card_id, group_id, rating, started_at, answered_at, duration_ms,
                previous_due_at, next_due_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &event.id,
                &event.card_id,
                &event.group_id,
                &event.rating,
                &event.started_at,
                &event.answered_at,
                event.duration_ms,
                &event.previous_due_at,
                &event.next_due_at,
            ],
        )?;

        Ok(event)
    }

    pub fn get_due_cards(&self, as_of: &str) -> Result<Vec<Mvp0DueCard>> {
        let mut stmt = self.conn.prepare(
            "SELECT c.id, c.group_id, c.title, c.front, c.back, rs.due_at, rs.state
             FROM cards c
             INNER JOIN review_states rs ON rs.card_id = c.id
             INNER JOIN card_groups g ON g.id = c.group_id
             WHERE c.deleted_at IS NULL
               AND g.deleted_at IS NULL
               AND g.is_enabled = 1
               AND rs.due_at <= ?1
             ORDER BY rs.due_at ASC, c.created_at ASC",
        )?;
        let rows = stmt.query_map([as_of], map_due_card)?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn get_daily_queue(
        &self,
        as_of: &str,
        new_limit: i64,
        review_limit: i64,
    ) -> Result<Vec<Mvp0DueCard>> {
        let mut stmt = self.conn.prepare(
                        "SELECT card_id, group_id, title, front, back, due_at, state, created_at
                         FROM (
                                SELECT c.id AS card_id, c.group_id, c.title, c.front, c.back, rs.due_at, rs.state,
                                             c.created_at AS created_at
                                FROM cards c
                                INNER JOIN review_states rs ON rs.card_id = c.id
                                INNER JOIN card_groups g ON g.id = c.group_id
                                WHERE c.deleted_at IS NULL
                                    AND g.deleted_at IS NULL
                                    AND g.is_enabled = 1
                                    AND rs.due_at <= ?1
                                    AND rs.state = 'new'
                                ORDER BY rs.due_at ASC, c.created_at ASC
                                LIMIT ?2
                         )
                         UNION ALL
                         SELECT card_id, group_id, title, front, back, due_at, state, created_at
                         FROM (
                                SELECT c.id AS card_id, c.group_id, c.title, c.front, c.back, rs.due_at, rs.state,
                                             c.created_at AS created_at
                                FROM cards c
                                INNER JOIN review_states rs ON rs.card_id = c.id
                                INNER JOIN card_groups g ON g.id = c.group_id
                                WHERE c.deleted_at IS NULL
                                    AND g.deleted_at IS NULL
                                    AND g.is_enabled = 1
                                    AND rs.due_at <= ?1
                                    AND rs.state <> 'new'
                                ORDER BY rs.due_at ASC, c.created_at ASC
                                LIMIT ?3
                         )
                         ORDER BY due_at ASC, created_at ASC",
                )?;
        let rows = stmt.query_map(params![as_of, new_limit, review_limit], map_due_card)?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn count_answered_on_day(&self, day: &str) -> Result<i64> {
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM study_events WHERE substr(answered_at, 1, 10) = ?1",
                [day],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }
}

fn map_review_state(row: &Row<'_>) -> rusqlite::Result<Mvp0ReviewState> {
    Ok(Mvp0ReviewState {
        id: row.get(0)?,
        card_id: row.get(1)?,
        state: row.get(2)?,
        due_at: row.get(3)?,
        last_reviewed_at: row.get(4)?,
        review_count: row.get(5)?,
        lapse_count: row.get(6)?,
        stability: row.get(7)?,
        difficulty: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn map_due_card(row: &Row<'_>) -> rusqlite::Result<Mvp0DueCard> {
    Ok(Mvp0DueCard {
        card_id: row.get(0)?,
        group_id: row.get(1)?,
        title: row.get(2)?,
        front: row.get(3)?,
        back: row.get(4)?,
        due_at: row.get(5)?,
        state: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::TestDatabase;
    use crate::db::{CreateMvp0CardGroupRequest, CreateMvp0CardRequest, Mvp0CardRepository};

    #[test]
    fn due_queue_respects_group_enabled_state() {
        let test_db = TestDatabase::new();
        let card_repo = Mvp0CardRepository::new(test_db.connection());
        let study_repo = Mvp0StudyRepository::new(test_db.connection());
        let group = card_repo
            .create_group(CreateMvp0CardGroupRequest {
                name: "Main".to_string(),
                description: None,
                color: None,
                is_enabled: Some(true),
            })
            .expect("group should be created");

        card_repo
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

        let due_cards = study_repo
            .get_due_cards("2026-01-02T00:00:00Z")
            .expect("due cards should load");
        assert_eq!(
            due_cards.len(),
            1,
            "enabled group should contribute due cards"
        );

        card_repo
            .set_group_enabled(&group.id, false)
            .expect("group should be disabled");

        let due_cards = study_repo
            .get_due_cards("2026-01-02T00:00:00Z")
            .expect("due cards should load after disabling group");
        assert!(
            due_cards.is_empty(),
            "disabled groups must be excluded from due queue"
        );
    }

    #[test]
    fn study_events_append_only_and_countable_by_day() {
        let test_db = TestDatabase::new();
        let card_repo = Mvp0CardRepository::new(test_db.connection());
        let study_repo = Mvp0StudyRepository::new(test_db.connection());
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

        study_repo
            .append_study_event(CreateMvp0StudyEventRequest {
                card_id: card.id.clone(),
                group_id: group.id.clone(),
                rating: "good".to_string(),
                started_at: Some("2026-01-02T10:00:00Z".to_string()),
                answered_at: Some("2026-01-02T10:00:20Z".to_string()),
                duration_ms: Some(20_000),
                previous_due_at: Some("2026-01-01T00:00:00Z".to_string()),
                next_due_at: "2026-01-05T00:00:00Z".to_string(),
            })
            .expect("first event should be inserted");
        study_repo
            .append_study_event(CreateMvp0StudyEventRequest {
                card_id: card.id,
                group_id: group.id,
                rating: "easy".to_string(),
                started_at: Some("2026-01-02T11:00:00Z".to_string()),
                answered_at: Some("2026-01-02T11:00:15Z".to_string()),
                duration_ms: Some(15_000),
                previous_due_at: Some("2026-01-05T00:00:00Z".to_string()),
                next_due_at: "2026-01-12T00:00:00Z".to_string(),
            })
            .expect("second event should be inserted");

        let answered_count = study_repo
            .count_answered_on_day("2026-01-02")
            .expect("day count should load");

        assert_eq!(
            answered_count, 2,
            "study events should be append-only facts"
        );
    }

    #[test]
    fn daily_queue_applies_separate_new_and_review_limits() {
        let test_db = TestDatabase::new();
        let card_repo = Mvp0CardRepository::new(test_db.connection());
        let study_repo = Mvp0StudyRepository::new(test_db.connection());
        let group = card_repo
            .create_group(CreateMvp0CardGroupRequest {
                name: "Main".to_string(),
                description: None,
                color: None,
                is_enabled: Some(true),
            })
            .expect("group should be created");

        let new_card = card_repo
            .create_card(CreateMvp0CardRequest {
                group_id: group.id.clone(),
                source_document_id: None,
                source_anchor_id: None,
                title: "New Card".to_string(),
                front: "Front A".to_string(),
                back: "Back A".to_string(),
                tags: vec![],
                origin: Some("manual".to_string()),
                initial_due_at: Some("2026-01-01T00:00:00Z".to_string()),
            })
            .expect("new card should be created");
        let review_card = card_repo
            .create_card(CreateMvp0CardRequest {
                group_id: group.id.clone(),
                source_document_id: None,
                source_anchor_id: None,
                title: "Review Card".to_string(),
                front: "Front B".to_string(),
                back: "Back B".to_string(),
                tags: vec![],
                origin: Some("manual".to_string()),
                initial_due_at: Some("2026-01-01T01:00:00Z".to_string()),
            })
            .expect("review card should be created");

        study_repo
            .update_review_state(UpdateMvp0ReviewStateRequest {
                card_id: review_card.id.clone(),
                state: "review".to_string(),
                due_at: "2026-01-01T01:00:00Z".to_string(),
                last_reviewed_at: Some("2025-12-31T01:00:00Z".to_string()),
                review_count: 1,
                lapse_count: 0,
                stability: None,
                difficulty: None,
            })
            .expect("review state should update");

        let queue = study_repo
            .get_daily_queue("2026-01-02T00:00:00Z", 1, 1)
            .expect("daily queue should load");

        assert_eq!(
            queue.len(),
            2,
            "queue should include one new and one review card"
        );
        assert_eq!(queue[0].card_id, new_card.id);
        assert_eq!(queue[1].card_id, review_card.id);
    }
}
