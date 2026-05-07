use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::Result;

use super::now_utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mvp0CardGroup {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub is_enabled: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateMvp0CardGroupRequest {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub is_enabled: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMvp0CardGroupRequest {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mvp0Card {
    pub id: String,
    pub group_id: String,
    pub source_document_id: Option<String>,
    pub source_anchor_id: Option<String>,
    pub title: String,
    pub front: String,
    pub back: String,
    pub tags_json: String,
    pub origin: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateMvp0CardRequest {
    pub group_id: String,
    pub source_document_id: Option<String>,
    pub source_anchor_id: Option<String>,
    pub title: String,
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
    pub origin: Option<String>,
    pub initial_due_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMvp0CardRequest {
    pub group_id: String,
    pub source_document_id: Option<String>,
    pub source_anchor_id: Option<String>,
    pub title: String,
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ListMvp0CardsFilters<'a> {
    pub group_id: Option<&'a str>,
    pub source_document_id: Option<&'a str>,
    pub search_query: Option<&'a str>,
    pub tags: Option<&'a [String]>,
    pub include_deleted: bool,
}

pub struct Mvp0CardRepository<'a> {
    conn: &'a Connection,
}

impl<'a> Mvp0CardRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn create_group(&self, req: CreateMvp0CardGroupRequest) -> Result<Mvp0CardGroup> {
        let now = now_utc();
        let group = Mvp0CardGroup {
            id: Uuid::new_v4().to_string(),
            name: req.name,
            description: req.description,
            color: req.color,
            is_enabled: req.is_enabled.unwrap_or(true),
            created_at: now.clone(),
            updated_at: now,
            deleted_at: None,
        };

        self.conn.execute(
            "INSERT INTO card_groups (
                id, name, description, color, is_enabled, created_at, updated_at, deleted_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)",
            params![
                &group.id,
                &group.name,
                &group.description,
                &group.color,
                if group.is_enabled { 1 } else { 0 },
                &group.created_at,
                &group.updated_at,
            ],
        )?;

        Ok(group)
    }

    pub fn list_groups(&self, include_deleted: bool) -> Result<Vec<Mvp0CardGroup>> {
        let sql = if include_deleted {
            "SELECT id, name, description, color, is_enabled, created_at, updated_at, deleted_at
             FROM card_groups
             ORDER BY created_at DESC"
        } else {
            "SELECT id, name, description, color, is_enabled, created_at, updated_at, deleted_at
             FROM card_groups
             WHERE deleted_at IS NULL
             ORDER BY created_at DESC"
        };
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map([], map_card_group)?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn find_group_by_id(&self, group_id: &str) -> Result<Option<Mvp0CardGroup>> {
        self.conn
            .query_row(
                "SELECT id, name, description, color, is_enabled, created_at, updated_at, deleted_at
                 FROM card_groups
                 WHERE id = ?1",
                [group_id],
                map_card_group,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn update_group(
        &self,
        group_id: &str,
        req: UpdateMvp0CardGroupRequest,
    ) -> Result<Option<Mvp0CardGroup>> {
        let updated_at = now_utc();
        let changed = self.conn.execute(
            "UPDATE card_groups
             SET name = ?2,
                 description = ?3,
                 color = ?4,
                 updated_at = ?5
             WHERE id = ?1 AND deleted_at IS NULL",
            params![group_id, req.name, req.description, req.color, updated_at],
        )?;

        if changed == 0 {
            return Ok(None);
        }

        self.find_group_by_id(group_id)
    }

    pub fn set_group_enabled(&self, group_id: &str, enabled: bool) -> Result<()> {
        let now = now_utc();
        self.conn.execute(
            "UPDATE card_groups SET is_enabled = ?2, updated_at = ?3 WHERE id = ?1",
            params![group_id, if enabled { 1 } else { 0 }, now],
        )?;
        Ok(())
    }

    pub fn soft_delete_group(&self, group_id: &str) -> Result<()> {
        let deleted_at = now_utc();
        self.conn.execute(
            "UPDATE card_groups SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1",
            params![group_id, deleted_at],
        )?;
        Ok(())
    }

    pub fn count_active_cards_in_group(&self, group_id: &str) -> Result<i64> {
        self.conn
            .query_row(
                "SELECT COUNT(*)
                 FROM cards
                 WHERE group_id = ?1 AND deleted_at IS NULL",
                [group_id],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    pub fn has_duplicate_card_in_group(
        &self,
        group_id: &str,
        front: &str,
        back: &str,
        exclude_card_id: Option<&str>,
    ) -> Result<bool> {
        self.conn
            .query_row(
                "SELECT EXISTS(
                    SELECT 1
                    FROM cards
                    WHERE group_id = ?1
                      AND deleted_at IS NULL
                      AND lower(trim(front)) = lower(trim(?2))
                      AND lower(trim(back)) = lower(trim(?3))
                      AND (?4 IS NULL OR id != ?4)
                )",
                params![group_id, front, back, exclude_card_id],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    pub fn create_card(&self, req: CreateMvp0CardRequest) -> Result<Mvp0Card> {
        let now = now_utc();
        let card = Mvp0Card {
            id: Uuid::new_v4().to_string(),
            group_id: req.group_id,
            source_document_id: req.source_document_id,
            source_anchor_id: req.source_anchor_id,
            title: req.title,
            front: req.front,
            back: req.back,
            tags_json: serde_json::to_string(&req.tags)?,
            origin: req.origin.unwrap_or_else(|| "manual".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
            deleted_at: None,
        };
        let review_state_id = Uuid::new_v4().to_string();
        let due_at = req.initial_due_at.unwrap_or_else(|| now.clone());

        self.conn.execute_batch("BEGIN IMMEDIATE TRANSACTION")?;
        let result = (|| -> Result<Mvp0Card> {
            self.conn.execute(
                "INSERT INTO cards (
                    id, group_id, source_document_id, source_anchor_id, title, front, back,
                    tags_json, origin, created_at, updated_at, deleted_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL)",
                params![
                    &card.id,
                    &card.group_id,
                    &card.source_document_id,
                    &card.source_anchor_id,
                    &card.title,
                    &card.front,
                    &card.back,
                    &card.tags_json,
                    &card.origin,
                    &card.created_at,
                    &card.updated_at,
                ],
            )?;

            self.conn.execute(
                "INSERT INTO review_states (
                    id, card_id, state, due_at, last_reviewed_at, review_count, lapse_count,
                    stability, difficulty, created_at, updated_at
                 ) VALUES (?1, ?2, 'new', ?3, NULL, 0, 0, NULL, NULL, ?4, ?4)",
                params![review_state_id, &card.id, due_at, now],
            )?;

            Ok(card)
        })();

        match result {
            Ok(card) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(card)
            }
            Err(error) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                Err(error)
            }
        }
    }

    pub fn list_cards(&self, include_deleted: bool) -> Result<Vec<Mvp0Card>> {
        let sql = if include_deleted {
            "SELECT id, group_id, source_document_id, source_anchor_id, title, front, back,
                    tags_json, origin, created_at, updated_at, deleted_at
             FROM cards
             WHERE group_id IS NOT NULL
             ORDER BY created_at DESC"
        } else {
            "SELECT id, group_id, source_document_id, source_anchor_id, title, front, back,
                    tags_json, origin, created_at, updated_at, deleted_at
             FROM cards
             WHERE group_id IS NOT NULL
               AND deleted_at IS NULL
             ORDER BY created_at DESC"
        };
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map([], map_card)?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn list_cards_filtered(&self, filters: ListMvp0CardsFilters<'_>) -> Result<Vec<Mvp0Card>> {
        let search_like = filters.search_query.map(build_like_query);
        let mut stmt = self.conn.prepare(
            "SELECT id, group_id, source_document_id, source_anchor_id, title, front, back,
                    tags_json, origin, created_at, updated_at, deleted_at
             FROM cards
             WHERE group_id IS NOT NULL
               AND (?1 IS NULL OR group_id = ?1)
               AND (?2 IS NULL OR source_document_id = ?2)
               AND (?3 IS NULL OR title LIKE ?3 OR front LIKE ?3 OR back LIKE ?3)
               AND (?4 = 1 OR deleted_at IS NULL)
             ORDER BY updated_at DESC, created_at DESC",
        )?;
        let rows = stmt.query_map(
            params![
                filters.group_id,
                filters.source_document_id,
                search_like,
                if filters.include_deleted { 1 } else { 0 }
            ],
            map_card,
        )?;
        let mut cards = rows.collect::<std::result::Result<Vec<_>, _>>()?;

        if let Some(tags) = filters.tags.filter(|tags| !tags.is_empty()) {
            cards.retain(|card| card_has_matching_tags(&card.tags_json, tags));
        }

        Ok(cards)
    }

    pub fn find_card_by_id(&self, id: &str) -> Result<Option<Mvp0Card>> {
        self.conn
            .query_row(
                "SELECT id, group_id, source_document_id, source_anchor_id, title, front, back,
                        tags_json, origin, created_at, updated_at, deleted_at
                 FROM cards
                 WHERE id = ?1",
                [id],
                map_card,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn update_card(
        &self,
        card_id: &str,
        req: UpdateMvp0CardRequest,
    ) -> Result<Option<Mvp0Card>> {
        let updated_at = now_utc();
        let tags_json = serde_json::to_string(&req.tags)?;
        let changed = self.conn.execute(
            "UPDATE cards
             SET group_id = ?2,
                 source_document_id = ?3,
                 source_anchor_id = ?4,
                 title = ?5,
                 front = ?6,
                 back = ?7,
                 tags_json = ?8,
                 updated_at = ?9
             WHERE id = ?1 AND deleted_at IS NULL",
            params![
                card_id,
                req.group_id,
                req.source_document_id,
                req.source_anchor_id,
                req.title,
                req.front,
                req.back,
                tags_json,
                updated_at,
            ],
        )?;

        if changed == 0 {
            return Ok(None);
        }

        self.find_card_by_id(card_id)
    }

    pub fn soft_delete_card(&self, card_id: &str) -> Result<()> {
        let deleted_at = now_utc();
        self.conn.execute(
            "UPDATE cards SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1",
            params![card_id, deleted_at],
        )?;
        Ok(())
    }

    pub fn soft_delete_cards_by_source_document_id(&self, document_id: &str) -> Result<usize> {
        let deleted_at = now_utc();
        self.conn
            .execute(
                "UPDATE cards
                 SET deleted_at = ?2, updated_at = ?2
                 WHERE source_document_id = ?1 AND deleted_at IS NULL",
                params![document_id, deleted_at],
            )
            .map_err(Into::into)
    }
}

fn map_card_group(row: &Row<'_>) -> rusqlite::Result<Mvp0CardGroup> {
    Ok(Mvp0CardGroup {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        color: row.get(3)?,
        is_enabled: row.get::<_, i64>(4)? == 1,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        deleted_at: row.get(7)?,
    })
}

fn map_card(row: &Row<'_>) -> rusqlite::Result<Mvp0Card> {
    Ok(Mvp0Card {
        id: row.get(0)?,
        group_id: row.get(1)?,
        source_document_id: row.get(2)?,
        source_anchor_id: row.get(3)?,
        title: row.get(4)?,
        front: row.get(5)?,
        back: row.get(6)?,
        tags_json: row.get(7)?,
        origin: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        deleted_at: row.get(11)?,
    })
}

fn build_like_query(value: &str) -> String {
    format!("%{}%", value.trim())
}

fn decode_tags_json(tags_json: &str) -> Vec<String> {
    serde_json::from_str(tags_json).unwrap_or_default()
}

fn card_has_matching_tags(tags_json: &str, expected_tags: &[String]) -> bool {
    let tags = decode_tags_json(tags_json);
    expected_tags
        .iter()
        .any(|expected| tags.iter().any(|tag| tag == expected))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::TestDatabase;

    #[test]
    fn card_soft_delete_hides_record_from_default_list() {
        let test_db = TestDatabase::new();
        let repo = Mvp0CardRepository::new(test_db.connection());
        let group = repo
            .create_group(CreateMvp0CardGroupRequest {
                name: "Default".to_string(),
                description: None,
                color: None,
                is_enabled: Some(true),
            })
            .expect("group should be created");
        let card = repo
            .create_card(CreateMvp0CardRequest {
                group_id: group.id.clone(),
                source_document_id: None,
                source_anchor_id: None,
                title: "FSRS".to_string(),
                front: "What is FSRS?".to_string(),
                back: "A scheduler for spaced repetition".to_string(),
                tags: vec!["memory".to_string()],
                origin: Some("manual".to_string()),
                initial_due_at: None,
            })
            .expect("card should be created");

        repo.soft_delete_card(&card.id)
            .expect("soft delete should succeed");

        let visible_cards = repo.list_cards(false).expect("visible list should load");
        let all_cards = repo.list_cards(true).expect("full list should load");

        assert!(visible_cards.is_empty(), "deleted card should be hidden");
        assert_eq!(all_cards.len(), 1, "deleted card should remain queryable");
        assert!(
            all_cards[0].deleted_at.is_some(),
            "deleted_at should be populated"
        );
    }

    #[test]
    fn create_card_creates_review_state() {
        let test_db = TestDatabase::new();
        let repo = Mvp0CardRepository::new(test_db.connection());
        let group = repo
            .create_group(CreateMvp0CardGroupRequest {
                name: "Default".to_string(),
                description: None,
                color: None,
                is_enabled: Some(true),
            })
            .expect("group should be created");
        let card = repo
            .create_card(CreateMvp0CardRequest {
                group_id: group.id,
                source_document_id: None,
                source_anchor_id: None,
                title: "Card title".to_string(),
                front: "Front".to_string(),
                back: "Back".to_string(),
                tags: vec![],
                origin: Some("manual".to_string()),
                initial_due_at: None,
            })
            .expect("card should be created");

        let review_state_count = test_db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM review_states WHERE card_id = ?1",
                [card.id],
                |row| row.get::<_, i64>(0),
            )
            .expect("review state count should load");

        assert_eq!(
            review_state_count, 1,
            "new cards must create a review state"
        );
    }

    #[test]
    fn duplicate_detection_is_scoped_to_group() {
        let test_db = TestDatabase::new();
        let repo = Mvp0CardRepository::new(test_db.connection());
        let group_a = repo
            .create_group(CreateMvp0CardGroupRequest {
                name: "Group A".to_string(),
                description: None,
                color: None,
                is_enabled: Some(true),
            })
            .expect("group A should be created");
        let group_b = repo
            .create_group(CreateMvp0CardGroupRequest {
                name: "Group B".to_string(),
                description: None,
                color: None,
                is_enabled: Some(true),
            })
            .expect("group B should be created");

        repo.create_card(CreateMvp0CardRequest {
            group_id: group_a.id.clone(),
            source_document_id: None,
            source_anchor_id: None,
            title: "FSRS".to_string(),
            front: "What is FSRS?".to_string(),
            back: "A scheduler".to_string(),
            tags: vec![],
            origin: Some("manual".to_string()),
            initial_due_at: None,
        })
        .expect("seed card should be created");

        assert!(repo
            .has_duplicate_card_in_group(&group_a.id, "What is FSRS?", "A scheduler", None)
            .expect("duplicate check should succeed"));
        assert!(!repo
            .has_duplicate_card_in_group(&group_b.id, "What is FSRS?", "A scheduler", None)
            .expect("cross-group duplicate check should succeed"));
    }

    #[test]
    fn filtered_card_list_matches_source_search_and_tags() {
        let test_db = TestDatabase::new();
        let repo = Mvp0CardRepository::new(test_db.connection());
        let now = now_utc();
        let document_id = Uuid::new_v4().to_string();

        test_db
            .connection()
            .execute(
                "INSERT INTO documents (
                    id, title, original_filename, file_path, file_hash, file_size, page_count,
                    parse_status, created_at, updated_at, deleted_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL)",
                params![
                    &document_id,
                    "Memory Notes",
                    "memory-notes.pdf",
                    "E:/docs/memory-notes.pdf",
                    "hash-1",
                    128_i64,
                    1_i64,
                    "parsed",
                    &now,
                    &now,
                ],
            )
            .expect("document should be inserted");

        let group = repo
            .create_group(CreateMvp0CardGroupRequest {
                name: "Main".to_string(),
                description: None,
                color: None,
                is_enabled: Some(true),
            })
            .expect("group should be created");

        repo.create_card(CreateMvp0CardRequest {
            group_id: group.id.clone(),
            source_document_id: Some(document_id.clone()),
            source_anchor_id: None,
            title: "FSRS title".to_string(),
            front: "What is FSRS?".to_string(),
            back: "A scheduling algorithm".to_string(),
            tags: vec!["memory".to_string(), "algorithm".to_string()],
            origin: Some("manual".to_string()),
            initial_due_at: None,
        })
        .expect("first card should be created");

        repo.create_card(CreateMvp0CardRequest {
            group_id: group.id.clone(),
            source_document_id: None,
            source_anchor_id: None,
            title: "Other card".to_string(),
            front: "What is Leitner?".to_string(),
            back: "A box system".to_string(),
            tags: vec!["box".to_string()],
            origin: Some("manual".to_string()),
            initial_due_at: None,
        })
        .expect("second card should be created");

        let filtered = repo
            .list_cards_filtered(ListMvp0CardsFilters {
                group_id: Some(&group.id),
                source_document_id: Some(&document_id),
                search_query: Some("FSRS"),
                tags: Some(&["memory".to_string()]),
                include_deleted: false,
            })
            .expect("filtered cards should load");

        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].title, "FSRS title");
        assert_eq!(
            filtered[0].source_document_id.as_deref(),
            Some(document_id.as_str())
        );
    }

    #[test]
    fn soft_delete_cards_by_source_document_id_hides_only_matching_active_cards() {
        let test_db = TestDatabase::new();
        let repo = Mvp0CardRepository::new(test_db.connection());
        let document_id = Uuid::new_v4().to_string();
        let other_document_id = Uuid::new_v4().to_string();
        let now = now_utc();

        for id in [&document_id, &other_document_id] {
            test_db
                .connection()
                .execute(
                    "INSERT INTO documents (
                        id, title, original_filename, file_path, file_hash, file_size, page_count,
                        parse_status, created_at, updated_at, deleted_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL)",
                    params![
                        id,
                        format!("{id}.pdf"),
                        format!("{id}.pdf"),
                        format!("E:/docs/{id}.pdf"),
                        format!("hash-{id}"),
                        128_i64,
                        1_i64,
                        "parsed",
                        &now,
                        &now,
                    ],
                )
                .expect("document should be inserted");
        }

        let group = repo
            .create_group(CreateMvp0CardGroupRequest {
                name: "Main".to_string(),
                description: None,
                color: None,
                is_enabled: Some(true),
            })
            .expect("group should be created");

        let matching = repo
            .create_card(CreateMvp0CardRequest {
                group_id: group.id.clone(),
                source_document_id: Some(document_id.clone()),
                source_anchor_id: None,
                title: "Generated card".to_string(),
                front: "Question".to_string(),
                back: "Answer".to_string(),
                tags: vec![],
                origin: Some("ai".to_string()),
                initial_due_at: None,
            })
            .expect("matching card should be created");
        let other = repo
            .create_card(CreateMvp0CardRequest {
                group_id: group.id.clone(),
                source_document_id: Some(other_document_id),
                source_anchor_id: None,
                title: "Other document card".to_string(),
                front: "Other question".to_string(),
                back: "Other answer".to_string(),
                tags: vec![],
                origin: Some("ai".to_string()),
                initial_due_at: None,
            })
            .expect("other card should be created");
        let manual = repo
            .create_card(CreateMvp0CardRequest {
                group_id: group.id.clone(),
                source_document_id: None,
                source_anchor_id: None,
                title: "Manual card".to_string(),
                front: "Manual question".to_string(),
                back: "Manual answer".to_string(),
                tags: vec![],
                origin: Some("manual".to_string()),
                initial_due_at: None,
            })
            .expect("manual card should be created");

        let deleted = repo
            .soft_delete_cards_by_source_document_id(&document_id)
            .expect("cards should be soft-deleted");

        assert_eq!(deleted, 1);
        assert!(repo
            .find_card_by_id(&matching.id)
            .expect("matching card lookup should succeed")
            .and_then(|card| card.deleted_at)
            .is_some());
        assert!(repo
            .find_card_by_id(&other.id)
            .expect("other card lookup should succeed")
            .and_then(|card| card.deleted_at)
            .is_none());
        assert!(repo
            .find_card_by_id(&manual.id)
            .expect("manual card lookup should succeed")
            .and_then(|card| card.deleted_at)
            .is_none());
        assert!(repo
            .list_cards_filtered(ListMvp0CardsFilters {
                source_document_id: Some(&document_id),
                include_deleted: false,
                ..Default::default()
            })
            .expect("active matching cards should load")
            .is_empty());
    }
}
