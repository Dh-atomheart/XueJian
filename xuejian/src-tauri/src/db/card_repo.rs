use crate::db::{Database, DocumentAnchorRect, Result};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Card {
    pub id: String,
    pub group_id: Option<String>,
    pub front: String,
    pub back: String,
    pub document_id: Option<String>,
    pub anchor_id: Option<String>,
    pub source_page: Option<i32>,
    pub source_paragraph: Option<i32>,
    pub source_coordinates: Option<serde_json::Value>,
    pub tags: Option<serde_json::Value>,
    pub difficulty: f64,
    pub stability: f64,
    pub retrievability: Option<f64>,
    pub state: String,
    pub next_review: Option<String>,
    pub dedupe_key: Option<String>,
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
    pub source_coordinates: Option<DocumentAnchorRect>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default)]
pub struct CardFilters<'a> {
    pub document_id: Option<&'a str>,
    pub anchor_id: Option<&'a str>,
    pub page_number: Option<i32>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardCandidate {
    pub id: String,
    pub workflow_run_id: Option<String>,
    pub document_id: String,
    pub anchor_id: Option<String>,
    pub source_page: Option<i32>,
    pub source_paragraph: Option<i32>,
    pub source_quote: Option<String>,
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
    pub confidence: f64,
    pub dedupe_key: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateCardCandidateRequest {
    pub workflow_run_id: Option<String>,
    pub document_id: String,
    pub anchor_id: Option<String>,
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
    pub confidence: f64,
    pub dedupe_key: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCardCandidateRequest {
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
    pub confidence: f64,
    pub dedupe_key: String,
    pub status: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardCandidateCounts {
    pub total: i64,
    pub pending: i64,
    pub accepted: i64,
    pub rejected: i64,
}

#[derive(Debug, Clone, Default)]
pub struct PersistCardCandidatesResult {
    pub inserted_count: usize,
    pub duplicate_count: usize,
}

#[derive(Debug, Clone, Default)]
pub struct FinalizeCardGenerationResult {
    pub created_count: usize,
    pub skipped_duplicates: usize,
    pub rejected_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Highlight {
    pub id: String,
    pub card_id: Option<String>,
    pub document_id: String,
    pub anchor_id: Option<String>,
    pub page_number: i32,
    pub rectangles: Vec<DocumentAnchorRect>,
    pub text_content: String,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateHighlightRequest {
    pub card_id: Option<String>,
    pub document_id: String,
    pub anchor_id: Option<String>,
    pub page_number: i32,
    pub rectangles: Vec<DocumentAnchorRect>,
    pub text_content: String,
    pub color: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateHighlightRequest {
    pub card_id: Option<String>,
    pub anchor_id: Option<String>,
    pub rectangles: Vec<DocumentAnchorRect>,
    pub text_content: String,
    pub color: String,
}

#[derive(Debug, Clone, Default)]
pub struct HighlightFilters<'a> {
    pub document_id: Option<&'a str>,
    pub card_id: Option<&'a str>,
    pub page_number: Option<i32>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewLog {
    pub id: String,
    pub card_id: String,
    pub rating: String,
    pub reviewed_at: String,
    pub state: String,
    pub difficulty: f64,
    pub stability: f64,
    pub retrievability: Option<f64>,
    pub next_review: Option<String>,
    pub interval_days: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateReviewLogRequest {
    pub card_id: String,
    pub rating: String,
    pub state: String,
    pub difficulty: f64,
    pub stability: f64,
    pub retrievability: Option<f64>,
    pub next_review: Option<String>,
    pub interval_days: Option<i32>,
}

pub struct CardRepository<'a> {
    db: &'a Database,
}

impl<'a> CardRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn create_review_log(&self, req: CreateReviewLogRequest) -> Result<ReviewLog> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        self.db.connection().execute(
            "INSERT INTO review_logs (
                id, card_id, rating, reviewed_at, state, difficulty, stability,
                retrievability, next_review, interval_days
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                &id, &req.card_id, &req.rating, &now, &req.state,
                req.difficulty, req.stability, req.retrievability,
                req.next_review, req.interval_days,
            ],
        )?;

        Ok(ReviewLog {
            id,
            card_id: req.card_id,
            rating: req.rating,
            reviewed_at: now,
            state: req.state,
            difficulty: req.difficulty,
            stability: req.stability,
            retrievability: req.retrievability,
            next_review: req.next_review,
            interval_days: req.interval_days,
        })
    }

    pub fn list_review_logs(&self, card_id: Option<&str>, limit: Option<i64>) -> Result<Vec<ReviewLog>> {
        let limit = limit.unwrap_or(100);
        let mut stmt = self.db.connection().prepare(
            "SELECT id, card_id, rating, reviewed_at, state, difficulty, stability,
                    retrievability, next_review, interval_days
             FROM review_logs
             WHERE (?1 IS NULL OR card_id = ?1)
             ORDER BY reviewed_at DESC
             LIMIT ?2",
        )?;

        let logs = stmt.query_map(params![card_id, limit], |row| {
            Ok(ReviewLog {
                id: row.get(0)?,
                card_id: row.get(1)?,
                rating: row.get(2)?,
                reviewed_at: row.get(3)?,
                state: row.get(4)?,
                difficulty: row.get(5)?,
                stability: row.get(6)?,
                retrievability: row.get(7)?,
                next_review: row.get(8)?,
                interval_days: row.get(9)?,
            })
        })?;

        logs.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn get_daily_stats(&self, date: &str) -> Result<(i64, i64)> {
        let new_count: i64 = self.db.connection().query_row(
            "SELECT COUNT(*) FROM cards WHERE state = 'new' AND (next_review IS NULL OR next_review <= ?1)",
            params![date],
            |row| row.get(0),
        )?;

        let review_count: i64 = self.db.connection().query_row(
            "SELECT COUNT(*) FROM cards WHERE state IN ('learning', 'review', 'relearning') AND next_review <= ?1",
            params![date],
            |row| row.get(0),
        )?;

        Ok((new_count, review_count))
    }

    pub fn create(&self, req: CreateCardRequest) -> Result<Card> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let tags_json = req.tags.map(|t| serde_json::json!(t));
        let source_coordinates = req
            .source_coordinates
            .map(|coordinates| serde_json::to_value(coordinates))
            .transpose()
            .map_err(json_encode_error)?;

        self.db.connection().execute(
            "INSERT INTO cards (
                id, front, back, document_id, anchor_id, source_page, source_paragraph,
                source_coordinates, tags, state, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'new', ?10, ?11)",
            params![
                &id, &req.front, &req.back, req.document_id, req.anchor_id,
                req.source_page, req.source_paragraph, source_coordinates, tags_json,
                &now, &now
            ],
        )?;

        Ok(Card {
            id,
            group_id: None,
            front: req.front,
            back: req.back,
            document_id: req.document_id,
            anchor_id: req.anchor_id,
            source_page: req.source_page,
            source_paragraph: req.source_paragraph,
            source_coordinates,
            tags: tags_json,
            difficulty: 0.3,
            stability: 1.0,
            retrievability: None,
            state: "new".to_string(),
            next_review: None,
            dedupe_key: None,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn find_due_cards(&self, limit: Option<i64>) -> Result<Vec<Card>> {
        let limit = limit.unwrap_or(50);
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();

        let mut stmt = self.db.connection().prepare(
            "SELECT id, group_id, front, back, document_id, anchor_id, source_page, source_paragraph,
                    source_coordinates, tags, difficulty, stability, retrievability, state,
                    next_review, dedupe_key, created_at, updated_at
             FROM cards
             WHERE state != 'suspended'
               AND (next_review IS NULL OR next_review <= ?1)
             ORDER BY next_review ASC
             LIMIT ?2"
        )?;

        let cards = stmt.query_map(params![&today, limit], map_card_row)?;

        cards
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn list_cards(&self, filters: CardFilters<'_>) -> Result<Vec<Card>> {
        let limit = filters.limit.unwrap_or(300);
        let mut stmt = self.db.connection().prepare(
            "SELECT id, group_id, front, back, document_id, anchor_id, source_page, source_paragraph,
                    source_coordinates, tags, difficulty, stability, retrievability, state,
                    next_review, dedupe_key, created_at, updated_at
             FROM cards
             WHERE (?1 IS NULL OR document_id = ?1)
               AND (?2 IS NULL OR anchor_id = ?2)
               AND (?3 IS NULL OR source_page = ?3)
             ORDER BY COALESCE(source_page, 2147483647) ASC,
                      COALESCE(source_paragraph, 2147483647) ASC,
                      created_at ASC
             LIMIT ?4",
        )?;

        let cards = stmt.query_map(
            params![
                filters.document_id,
                filters.anchor_id,
                filters.page_number,
                limit
            ],
            map_card_row,
        )?;

        cards
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn update_review(
        &self,
        id: &str,
        difficulty: f64,
        stability: f64,
        retrievability: f64,
        state: &str,
        next_review: &str,
    ) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();

        self.db.connection().execute(
            "UPDATE cards SET difficulty = ?1, stability = ?2, retrievability = ?3, state = ?4, next_review = ?5, updated_at = ?6 WHERE id = ?7",
            params![difficulty, stability, retrievability, state, next_review, &now, id],
        )?;

        Ok(())
    }

    pub fn list_candidates(
        &self,
        workflow_run_id: Option<&str>,
        document_id: Option<&str>,
        status: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Vec<CardCandidate>> {
        let limit = limit.unwrap_or(200);
        let mut stmt = self.db.connection().prepare(
            "SELECT c.id, c.workflow_run_id, c.document_id, c.anchor_id, c.front, c.back,
                    c.tags, c.confidence, c.dedupe_key, c.status, c.created_at,
                    a.page, a.paragraph, a.text_quote
             FROM card_candidates c
             LEFT JOIN document_anchors a ON a.id = c.anchor_id
             WHERE (?1 IS NULL OR c.workflow_run_id = ?1)
               AND (?2 IS NULL OR c.document_id = ?2)
               AND (?3 IS NULL OR c.status = ?3)
             ORDER BY c.created_at DESC
             LIMIT ?4",
        )?;

        let candidates = stmt.query_map(
            params![workflow_run_id, document_id, status, limit],
            map_card_candidate_row,
        )?;

        candidates
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn get_candidate(&self, id: &str) -> Result<Option<CardCandidate>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT c.id, c.workflow_run_id, c.document_id, c.anchor_id, c.front, c.back,
                    c.tags, c.confidence, c.dedupe_key, c.status, c.created_at,
                    a.page, a.paragraph, a.text_quote
             FROM card_candidates c
             LEFT JOIN document_anchors a ON a.id = c.anchor_id
             WHERE c.id = ?1",
        )?;

        stmt.query_row(params![id], map_card_candidate_row)
            .optional()
            .map_err(Into::into)
    }

    pub fn insert_generated_candidates(
        &self,
        requests: Vec<CreateCardCandidateRequest>,
    ) -> Result<PersistCardCandidatesResult> {
        let transaction = self.db.connection().unchecked_transaction()?;
        let now = chrono::Utc::now().to_rfc3339();
        let mut result = PersistCardCandidatesResult::default();

        for request in requests {
            let candidate_exists: bool = transaction.query_row(
                "SELECT EXISTS(
                    SELECT 1
                    FROM card_candidates
                    WHERE document_id = ?1 AND dedupe_key = ?2
                 )",
                params![&request.document_id, &request.dedupe_key],
                |row| row.get(0),
            )?;

            let card_exists: bool = transaction.query_row(
                "SELECT EXISTS(
                    SELECT 1
                    FROM cards
                    WHERE document_id = ?1 AND dedupe_key = ?2
                 )",
                params![&request.document_id, &request.dedupe_key],
                |row| row.get(0),
            )?;

            if candidate_exists || card_exists {
                result.duplicate_count += 1;
                continue;
            }

            let tags_json = serde_json::to_string(&request.tags).map_err(json_encode_error)?;
            transaction.execute(
                "INSERT INTO card_candidates (
                    id, workflow_run_id, document_id, anchor_id, front, back,
                    tags, confidence, dedupe_key, status, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10)",
                params![
                    Uuid::new_v4().to_string(),
                    request.workflow_run_id,
                    request.document_id,
                    request.anchor_id,
                    request.front,
                    request.back,
                    tags_json,
                    request.confidence,
                    request.dedupe_key,
                    &now,
                ],
            )?;

            result.inserted_count += 1;
        }

        transaction.commit()?;
        Ok(result)
    }

    pub fn update_candidate(
        &self,
        id: &str,
        request: UpdateCardCandidateRequest,
    ) -> Result<Option<CardCandidate>> {
        let tags_json = serde_json::to_string(&request.tags).map_err(json_encode_error)?;

        self.db.connection().execute(
            "UPDATE card_candidates
             SET front = ?1,
                 back = ?2,
                 tags = ?3,
                 confidence = ?4,
                 dedupe_key = ?5,
                 status = ?6
             WHERE id = ?7",
            params![
                request.front,
                request.back,
                tags_json,
                request.confidence,
                request.dedupe_key,
                request.status,
                id,
            ],
        )?;

        self.get_candidate(id)
    }

    pub fn update_candidate_statuses(
        &self,
        workflow_run_id: &str,
        ids: &[String],
        status: &str,
    ) -> Result<usize> {
        let transaction = self.db.connection().unchecked_transaction()?;
        let mut affected_rows = 0usize;

        for id in ids {
            affected_rows += transaction.execute(
                "UPDATE card_candidates
                 SET status = ?1
                 WHERE id = ?2 AND workflow_run_id = ?3",
                params![status, id, workflow_run_id],
            )?;
        }

        transaction.commit()?;
        Ok(affected_rows)
    }

    pub fn count_candidates_for_run(&self, workflow_run_id: &str) -> Result<CardCandidateCounts> {
        self.db
            .connection()
            .query_row(
                "SELECT
                    COUNT(*),
                    COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0)
                 FROM card_candidates
                 WHERE workflow_run_id = ?1",
                params![workflow_run_id],
                |row| {
                    Ok(CardCandidateCounts {
                        total: row.get(0)?,
                        pending: row.get(1)?,
                        accepted: row.get(2)?,
                        rejected: row.get(3)?,
                    })
                },
            )
            .map_err(Into::into)
    }

    pub fn finalize_candidates_for_run(
        &self,
        workflow_run_id: &str,
    ) -> Result<FinalizeCardGenerationResult> {
        let transaction = self.db.connection().unchecked_transaction()?;
        let now = chrono::Utc::now().to_rfc3339();
        let mut result = FinalizeCardGenerationResult::default();

        let accepted_candidates = {
            let mut stmt = transaction.prepare(
                "SELECT c.id, c.document_id, c.anchor_id, c.front, c.back, c.tags,
                        c.dedupe_key, a.page, a.paragraph, a.rects
                 FROM card_candidates c
                 LEFT JOIN document_anchors a ON a.id = c.anchor_id
                 WHERE c.workflow_run_id = ?1 AND c.status = 'accepted'
                 ORDER BY c.created_at ASC",
            )?;

            let rows = stmt.query_map(params![workflow_run_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    decode_tags(row.get(5)?)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<i32>>(7)?,
                    row.get::<_, Option<i32>>(8)?,
                    decode_rectangles(row.get(9)?)?,
                ))
            })?;

            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };

        for (
            _candidate_id,
            document_id,
            anchor_id,
            front,
            back,
            tags,
            dedupe_key,
            source_page,
            source_paragraph,
            source_rectangles,
        ) in accepted_candidates
        {
            let card_exists: bool = transaction.query_row(
                "SELECT EXISTS(
                    SELECT 1
                    FROM cards
                    WHERE document_id = ?1 AND dedupe_key = ?2
                 )",
                params![&document_id, &dedupe_key],
                |row| row.get(0),
            )?;

            if card_exists {
                result.skipped_duplicates += 1;
                continue;
            }

            let tags_json = serde_json::to_string(&tags).map_err(json_encode_error)?;
            let source_coordinates = merge_rectangles_into_bounding_box(&source_rectangles)
                .map(|rect| serde_json::to_string(&rect))
                .transpose()
                .map_err(json_encode_error)?;
            transaction.execute(
                "INSERT INTO cards (
                    id, group_id, document_id, anchor_id, front, back, source_page,
                    source_paragraph, source_coordinates, tags, difficulty, stability,
                    retrievability, state, next_review, dedupe_key, created_at, updated_at
                 ) VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0.3, 1.0,
                           NULL, 'new', NULL, ?10, ?11, ?12)",
                params![
                    Uuid::new_v4().to_string(),
                    document_id,
                    anchor_id,
                    front,
                    back,
                    source_page,
                    source_paragraph,
                    source_coordinates,
                    tags_json,
                    dedupe_key,
                    &now,
                    &now,
                ],
            )?;

            result.created_count += 1;
        }

        result.rejected_count = transaction.execute(
            "UPDATE card_candidates
             SET status = 'rejected'
             WHERE workflow_run_id = ?1 AND status = 'pending'",
            params![workflow_run_id],
        )?;

        transaction.commit()?;
        Ok(result)
    }

    pub fn list_highlights(&self, filters: HighlightFilters<'_>) -> Result<Vec<Highlight>> {
        let limit = filters.limit.unwrap_or(300);
        let mut stmt = self.db.connection().prepare(
            "SELECT id, card_id, document_id, anchor_id, page_number, rectangles,
                    text_content, color, created_at
             FROM highlights
             WHERE (?1 IS NULL OR document_id = ?1)
               AND (?2 IS NULL OR card_id = ?2)
               AND (?3 IS NULL OR page_number = ?3)
             ORDER BY page_number ASC, created_at ASC
             LIMIT ?4",
        )?;

        let highlights = stmt.query_map(
            params![
                filters.document_id,
                filters.card_id,
                filters.page_number,
                limit
            ],
            map_highlight_row,
        )?;

        highlights
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn get_highlight(&self, id: &str) -> Result<Option<Highlight>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, card_id, document_id, anchor_id, page_number, rectangles,
                    text_content, color, created_at
             FROM highlights
             WHERE id = ?1",
        )?;

        stmt.query_row(params![id], map_highlight_row)
            .optional()
            .map_err(Into::into)
    }

    pub fn create_highlight(&self, request: CreateHighlightRequest) -> Result<Highlight> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let rectangles = serde_json::to_string(&request.rectangles).map_err(json_encode_error)?;

        self.db.connection().execute(
            "INSERT INTO highlights (
                id, card_id, document_id, anchor_id, page_number, rectangles,
                text_content, color, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &id,
                request.card_id,
                request.document_id,
                request.anchor_id,
                request.page_number,
                rectangles,
                request.text_content,
                request.color,
                &now,
            ],
        )?;

        Ok(Highlight {
            id,
            card_id: request.card_id,
            document_id: request.document_id,
            anchor_id: request.anchor_id,
            page_number: request.page_number,
            rectangles: request.rectangles,
            text_content: request.text_content,
            color: request.color,
            created_at: now,
        })
    }

    pub fn update_highlight(
        &self,
        id: &str,
        request: UpdateHighlightRequest,
    ) -> Result<Option<Highlight>> {
        let rectangles = serde_json::to_string(&request.rectangles).map_err(json_encode_error)?;

        self.db.connection().execute(
            "UPDATE highlights
             SET card_id = ?1,
                 anchor_id = ?2,
                 rectangles = ?3,
                 text_content = ?4,
                 color = ?5
             WHERE id = ?6",
            params![
                request.card_id,
                request.anchor_id,
                rectangles,
                request.text_content,
                request.color,
                id,
            ],
        )?;

        self.get_highlight(id)
    }

    pub fn delete_highlight(&self, id: &str) -> Result<()> {
        self.db
            .connection()
            .execute("DELETE FROM highlights WHERE id = ?1", params![id])?;
        Ok(())
    }
}

fn map_card_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Card> {
    Ok(Card {
        id: row.get(0)?,
        group_id: row.get(1)?,
        front: row.get(2)?,
        back: row.get(3)?,
        document_id: row.get(4)?,
        anchor_id: row.get(5)?,
        source_page: row.get(6)?,
        source_paragraph: row.get(7)?,
        source_coordinates: row.get(8)?,
        tags: row.get(9)?,
        difficulty: row.get(10)?,
        stability: row.get(11)?,
        retrievability: row.get(12)?,
        state: row.get(13)?,
        next_review: row.get(14)?,
        dedupe_key: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

fn map_card_candidate_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CardCandidate> {
    Ok(CardCandidate {
        id: row.get(0)?,
        workflow_run_id: row.get(1)?,
        document_id: row.get(2)?,
        anchor_id: row.get(3)?,
        front: row.get(4)?,
        back: row.get(5)?,
        tags: decode_tags(row.get(6)?)?,
        confidence: row.get::<_, Option<f64>>(7)?.unwrap_or(0.0),
        dedupe_key: row.get(8)?,
        status: row.get(9)?,
        created_at: row.get(10)?,
        source_page: row.get(11)?,
        source_paragraph: row.get(12)?,
        source_quote: row.get(13)?,
    })
}

fn map_highlight_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Highlight> {
    Ok(Highlight {
        id: row.get(0)?,
        card_id: row.get(1)?,
        document_id: row.get(2)?,
        anchor_id: row.get(3)?,
        page_number: row.get(4)?,
        rectangles: decode_rectangles(row.get(5)?)?,
        text_content: row.get(6)?,
        color: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn decode_tags(value: Option<String>) -> rusqlite::Result<Vec<String>> {
    value
        .map(|raw| serde_json::from_str::<Vec<String>>(&raw))
        .transpose()
        .map_err(json_decode_error)
        .map(|tags| tags.unwrap_or_default())
}

fn decode_rectangles(value: Option<String>) -> rusqlite::Result<Vec<DocumentAnchorRect>> {
    value
        .map(|raw| serde_json::from_str::<Vec<DocumentAnchorRect>>(&raw))
        .transpose()
        .map_err(json_decode_error)
        .map(|rectangles| rectangles.unwrap_or_default())
}

fn merge_rectangles_into_bounding_box(
    rectangles: &[DocumentAnchorRect],
) -> Option<DocumentAnchorRect> {
    let first = rectangles.first()?;
    let mut left = first.x;
    let mut top = first.y;
    let mut right = first.x + first.width;
    let mut bottom = first.y + first.height;

    for rect in rectangles.iter().skip(1) {
        left = left.min(rect.x);
        top = top.min(rect.y);
        right = right.max(rect.x + rect.width);
        bottom = bottom.max(rect.y + rect.height);
    }

    Some(DocumentAnchorRect {
        x: left,
        y: top,
        width: (right - left).max(0.0),
        height: (bottom - top).max(0.0),
    })
}

fn json_encode_error(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(error))
}

fn json_decode_error(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use super::*;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().expect("in-memory sqlite");
        conn.execute_batch(include_str!("../migrations/V1__initial_schema.sql"))
            .expect("apply v1 migration");
        conn.execute_batch(include_str!(
            "../migrations/V2__workflow_and_fts_foundation.sql"
        ))
        .expect("apply v2 migration");
        conn.execute_batch(include_str!(
            "../migrations/V3__card_generation_workflow.sql"
        ))
        .expect("apply v3 migration");

        Database { conn }
    }

    fn seed_document_and_anchor(db: &Database) -> (String, String) {
        let document_id = Uuid::new_v4().to_string();
        let anchor_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        db.connection()
            .execute(
                "INSERT INTO documents (
                    id, title, file_path, file_type, status, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, 'pdf', 'ready', ?4, ?5)",
                params![
                    &document_id,
                    "Card workflow",
                    "E:/docs/card-workflow.pdf",
                    &now,
                    &now,
                ],
            )
            .expect("insert document");

        db.connection()
            .execute(
                "INSERT INTO document_anchors (
                    id, document_id, page, paragraph, text_quote, rects, hash, created_at
                 ) VALUES (?1, ?2, 3, 2, ?3, '[]', ?4, ?5)",
                params![
                    &anchor_id,
                    &document_id,
                    "FSRS is a scheduling algorithm for spaced repetition.",
                    "anchor-hash-1",
                    &now,
                ],
            )
            .expect("insert anchor");

        (document_id, anchor_id)
    }

    #[test]
    fn generated_candidates_dedupe_and_finalize_idempotently() {
        let db = test_db();
        let repo = CardRepository::new(&db);
        let (document_id, anchor_id) = seed_document_and_anchor(&db);

        let inserted = repo
            .insert_generated_candidates(vec![
                CreateCardCandidateRequest {
                    workflow_run_id: Some("run-1".to_string()),
                    document_id: document_id.clone(),
                    anchor_id: Some(anchor_id.clone()),
                    front: "什么是 FSRS？".to_string(),
                    back: "一种用于间隔重复学习调度的算法。".to_string(),
                    tags: vec!["page-3".to_string()],
                    confidence: 0.82,
                    dedupe_key: "dedupe-1".to_string(),
                },
                CreateCardCandidateRequest {
                    workflow_run_id: Some("run-1".to_string()),
                    document_id: document_id.clone(),
                    anchor_id: Some(anchor_id.clone()),
                    front: "什么是 FSRS？".to_string(),
                    back: "一种用于间隔重复学习调度的算法。".to_string(),
                    tags: vec!["page-3".to_string()],
                    confidence: 0.82,
                    dedupe_key: "dedupe-1".to_string(),
                },
            ])
            .expect("insert candidates");

        assert_eq!(inserted.inserted_count, 1);
        assert_eq!(inserted.duplicate_count, 1);

        let candidate = repo
            .list_candidates(Some("run-1"), Some(&document_id), None, Some(10))
            .expect("list candidates")
            .pop()
            .expect("candidate exists");

        repo.update_candidate(
            &candidate.id,
            UpdateCardCandidateRequest {
                front: candidate.front.clone(),
                back: candidate.back.clone(),
                tags: candidate.tags.clone(),
                confidence: candidate.confidence,
                dedupe_key: candidate.dedupe_key.clone(),
                status: "accepted".to_string(),
            },
        )
        .expect("accept candidate");

        let finalized_once = repo
            .finalize_candidates_for_run("run-1")
            .expect("finalize run first time");
        assert_eq!(finalized_once.created_count, 1);
        assert_eq!(finalized_once.skipped_duplicates, 0);
        assert_eq!(finalized_once.rejected_count, 0);

        let finalized_twice = repo
            .finalize_candidates_for_run("run-1")
            .expect("finalize run second time");
        assert_eq!(finalized_twice.created_count, 0);
        assert_eq!(finalized_twice.skipped_duplicates, 1);

        let card_count: i64 = db
            .connection()
            .query_row("SELECT COUNT(*) FROM cards", [], |row| row.get(0))
            .expect("count cards");
        assert_eq!(card_count, 1);

        let counts = repo
            .count_candidates_for_run("run-1")
            .expect("count candidates");
        assert_eq!(counts.accepted, 1);
        assert_eq!(counts.total, 1);
    }

    #[test]
    fn bulk_update_candidate_statuses() {
        let db = test_db();
        let repo = CardRepository::new(&db);
        let (document_id, anchor_id) = seed_document_and_anchor(&db);

        let inserted = repo
            .insert_generated_candidates(vec![
                CreateCardCandidateRequest {
                    workflow_run_id: Some("run-bulk".to_string()),
                    document_id: document_id.clone(),
                    anchor_id: Some(anchor_id.clone()),
                    front: "Q1".to_string(),
                    back: "A1".to_string(),
                    tags: vec![],
                    confidence: 0.7,
                    dedupe_key: "bulk-1".to_string(),
                },
                CreateCardCandidateRequest {
                    workflow_run_id: Some("run-bulk".to_string()),
                    document_id: document_id.clone(),
                    anchor_id: Some(anchor_id.clone()),
                    front: "Q2".to_string(),
                    back: "A2".to_string(),
                    tags: vec![],
                    confidence: 0.8,
                    dedupe_key: "bulk-2".to_string(),
                },
                CreateCardCandidateRequest {
                    workflow_run_id: Some("run-bulk".to_string()),
                    document_id: document_id.clone(),
                    anchor_id: Some(anchor_id.clone()),
                    front: "Q3".to_string(),
                    back: "A3".to_string(),
                    tags: vec![],
                    confidence: 0.9,
                    dedupe_key: "bulk-3".to_string(),
                },
            ])
            .expect("insert candidates");
        assert_eq!(inserted.inserted_count, 3);

        let candidates = repo
            .list_candidates(Some("run-bulk"), Some(&document_id), None, Some(10))
            .expect("list candidates");
        assert_eq!(candidates.len(), 3);

        let ids: Vec<String> = candidates.iter().map(|c| c.id.clone()).collect();

        let affected = repo
            .update_candidate_statuses("run-bulk", &ids[..2], "accepted")
            .expect("bulk accept");
        assert_eq!(affected, 2);

        let affected = repo
            .update_candidate_statuses("run-bulk", &ids[2..3], "rejected")
            .expect("bulk reject");
        assert_eq!(affected, 1);

        let counts = repo
            .count_candidates_for_run("run-bulk")
            .expect("count candidates");
        assert_eq!(counts.accepted, 2);
        assert_eq!(counts.rejected, 1);
        assert_eq!(counts.pending, 0);
    }

    #[test]
    fn highlight_crud_roundtrip() {
        let db = test_db();
        let repo = CardRepository::new(&db);
        let (document_id, anchor_id) = seed_document_and_anchor(&db);

        let highlight = repo
            .create_highlight(CreateHighlightRequest {
                card_id: None,
                document_id: document_id.clone(),
                anchor_id: Some(anchor_id.clone()),
                page_number: 3,
                rectangles: vec![DocumentAnchorRect {
                    x: 10.0,
                    y: 20.0,
                    width: 200.0,
                    height: 30.0,
                }],
                text_content: "FSRS is a scheduling algorithm".to_string(),
                color: "#F8E16C".to_string(),
            })
            .expect("create highlight");

        assert_eq!(highlight.document_id, document_id);
        assert_eq!(highlight.page_number, 3);
        assert_eq!(highlight.rectangles.len(), 1);

        let listed = repo
            .list_highlights(HighlightFilters {
                document_id: Some(&document_id),
                card_id: None,
                page_number: None,
                limit: None,
            })
            .expect("list highlights");
        assert_eq!(listed.len(), 1);

        let updated = repo
            .update_highlight(
                &highlight.id,
                UpdateHighlightRequest {
                    card_id: None,
                    anchor_id: None,
                    rectangles: vec![DocumentAnchorRect {
                        x: 15.0,
                        y: 25.0,
                        width: 180.0,
                        height: 35.0,
                    }],
                    text_content: "Updated text".to_string(),
                    color: "#FF0000".to_string(),
                },
            )
            .expect("update highlight")
            .unwrap();
        assert_eq!(updated.text_content, "Updated text");
        assert_eq!(updated.color, "#FF0000");

        repo.delete_highlight(&highlight.id).expect("delete highlight");

        let after_delete = repo
            .list_highlights(HighlightFilters {
                document_id: Some(&document_id),
                card_id: None,
                page_number: None,
                limit: None,
            })
            .expect("list after delete");
        assert!(after_delete.is_empty());
    }
}
