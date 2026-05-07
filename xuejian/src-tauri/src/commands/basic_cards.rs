use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        CreateMvp0CardGroupRequest, CreateMvp0CardRequest, ListMvp0CardsFilters, Mvp0Card,
        Mvp0CardGroup, Mvp0CardRepository, Mvp0DocumentRepository, UpdateMvp0CardGroupRequest,
        UpdateMvp0CardRequest,
    },
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BasicCardSourceDto {
    pub document_id: Option<String>,
    pub document_title: Option<String>,
    pub anchor_id: Option<String>,
    pub page: Option<i32>,
    pub quote: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BasicCardDto {
    pub id: String,
    pub group_id: String,
    pub group_name: String,
    pub title: String,
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
    pub origin: String,
    pub source: BasicCardSourceDto,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BasicCardGroupDto {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub is_enabled: bool,
    pub card_count: i64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBasicCardDto {
    pub group_id: String,
    pub source_document_id: Option<String>,
    pub source_anchor_id: Option<String>,
    pub title: String,
    pub front: String,
    pub back: String,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBasicCardDto {
    pub group_id: String,
    pub source_document_id: Option<String>,
    pub source_anchor_id: Option<String>,
    pub title: String,
    pub front: String,
    pub back: String,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListBasicCardsFiltersDto {
    pub group_id: Option<String>,
    pub source_document_id: Option<String>,
    pub search_query: Option<String>,
    pub tags: Option<Vec<String>>,
    pub include_deleted: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBasicCardGroupDto {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBasicCardGroupDto {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[tauri::command]
pub fn list_basic_cards(
    state: State<'_, AppState>,
    filters: Option<ListBasicCardsFiltersDto>,
) -> CommandResult<Vec<BasicCardDto>> {
    let db = state.lock_db()?;
    list_basic_cards_inner(db.connection(), filters.unwrap_or_default())
}

#[tauri::command]
pub fn create_basic_card(
    state: State<'_, AppState>,
    data: CreateBasicCardDto,
) -> CommandResult<BasicCardDto> {
    let db = state.lock_db()?;
    create_basic_card_inner(db.connection(), data)
}

#[tauri::command]
pub fn update_basic_card(
    state: State<'_, AppState>,
    id: String,
    data: UpdateBasicCardDto,
) -> CommandResult<BasicCardDto> {
    let db = state.lock_db()?;
    update_basic_card_inner(db.connection(), &id, data)
}

#[tauri::command]
pub fn delete_basic_card(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let db = state.lock_db()?;
    delete_basic_card_inner(db.connection(), &id)
}

#[tauri::command]
pub fn delete_basic_cards(state: State<'_, AppState>, ids: Vec<String>) -> CommandResult<()> {
    let db = state.lock_db()?;
    delete_basic_cards_inner(db.connection(), ids)
}

#[tauri::command]
pub fn list_basic_card_groups(
    state: State<'_, AppState>,
    include_deleted: Option<bool>,
) -> CommandResult<Vec<BasicCardGroupDto>> {
    let db = state.lock_db()?;
    list_basic_card_groups_inner(db.connection(), include_deleted.unwrap_or(false))
}

#[tauri::command]
pub fn create_basic_card_group(
    state: State<'_, AppState>,
    data: CreateBasicCardGroupDto,
) -> CommandResult<BasicCardGroupDto> {
    let db = state.lock_db()?;
    create_basic_card_group_inner(db.connection(), data)
}

#[tauri::command]
pub fn update_basic_card_group(
    state: State<'_, AppState>,
    id: String,
    data: UpdateBasicCardGroupDto,
) -> CommandResult<BasicCardGroupDto> {
    let db = state.lock_db()?;
    update_basic_card_group_inner(db.connection(), &id, data)
}

#[tauri::command]
pub fn set_basic_card_group_enabled(
    state: State<'_, AppState>,
    id: String,
    is_enabled: bool,
) -> CommandResult<BasicCardGroupDto> {
    let db = state.lock_db()?;
    set_basic_card_group_enabled_inner(db.connection(), &id, is_enabled)
}

#[tauri::command]
pub fn delete_basic_card_group(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let db = state.lock_db()?;
    delete_basic_card_group_inner(db.connection(), &id)
}

fn list_basic_cards_inner(
    conn: &Connection,
    filters: ListBasicCardsFiltersDto,
) -> CommandResult<Vec<BasicCardDto>> {
    let card_repo = Mvp0CardRepository::new(conn);
    let tag_filters = filters
        .tags
        .as_ref()
        .map(|tags| normalize_tags(tags.clone()))
        .filter(|tags| !tags.is_empty());

    let cards = card_repo.list_cards_filtered(ListMvp0CardsFilters {
        group_id: filters.group_id.as_deref(),
        source_document_id: filters.source_document_id.as_deref(),
        search_query: filters.search_query.as_deref(),
        tags: tag_filters.as_deref(),
        include_deleted: filters.include_deleted.unwrap_or(false),
    })?;

    cards
        .into_iter()
        .map(|card| build_basic_card_dto(conn, card))
        .collect()
}

fn create_basic_card_inner(
    conn: &Connection,
    data: CreateBasicCardDto,
) -> CommandResult<BasicCardDto> {
    let card_repo = Mvp0CardRepository::new(conn);
    let group = require_active_group(conn, &data.group_id)?;
    let (source_document_id, source_anchor_id) =
        resolve_source_binding(conn, data.source_document_id, data.source_anchor_id)?;
    let title = require_non_empty("标题", &data.title)?;
    let front = require_non_empty("问题面", &data.front)?;
    let back = require_non_empty("答案面", &data.back)?;
    let tags = normalize_tags(data.tags.unwrap_or_default());

    if card_repo.has_duplicate_card_in_group(&group.id, &front, &back, None)? {
        return Err(CommandError::InvalidInput(
            "同一分组内已存在相同的 front/back 卡片".to_string(),
        ));
    }

    let card = card_repo.create_card(CreateMvp0CardRequest {
        group_id: group.id,
        source_document_id,
        source_anchor_id,
        title,
        front,
        back,
        tags,
        origin: Some("manual".to_string()),
        initial_due_at: None,
    })?;

    build_basic_card_dto(conn, card)
}

fn update_basic_card_inner(
    conn: &Connection,
    id: &str,
    data: UpdateBasicCardDto,
) -> CommandResult<BasicCardDto> {
    let card_repo = Mvp0CardRepository::new(conn);
    let existing = card_repo
        .find_card_by_id(id)?
        .ok_or(CommandError::NotFound)?;

    if existing.deleted_at.is_some() {
        return Err(CommandError::NotFound);
    }

    let group = require_active_group(conn, &data.group_id)?;
    let (source_document_id, source_anchor_id) =
        resolve_source_binding(conn, data.source_document_id, data.source_anchor_id)?;
    let title = require_non_empty("标题", &data.title)?;
    let front = require_non_empty("问题面", &data.front)?;
    let back = require_non_empty("答案面", &data.back)?;
    let tags = normalize_tags(data.tags.unwrap_or_default());

    if card_repo.has_duplicate_card_in_group(&group.id, &front, &back, Some(id))? {
        return Err(CommandError::InvalidInput(
            "同一分组内已存在相同的 front/back 卡片".to_string(),
        ));
    }

    let card = card_repo
        .update_card(
            id,
            UpdateMvp0CardRequest {
                group_id: group.id,
                source_document_id,
                source_anchor_id,
                title,
                front,
                back,
                tags,
            },
        )?
        .ok_or(CommandError::NotFound)?;

    build_basic_card_dto(conn, card)
}

fn delete_basic_card_inner(conn: &Connection, id: &str) -> CommandResult<()> {
    let card_repo = Mvp0CardRepository::new(conn);
    let existing = card_repo
        .find_card_by_id(id)?
        .ok_or(CommandError::NotFound)?;
    if existing.deleted_at.is_some() {
        return Ok(());
    }
    card_repo.soft_delete_card(id)?;
    Ok(())
}

fn delete_basic_cards_inner(conn: &Connection, ids: Vec<String>) -> CommandResult<()> {
    let normalized_ids: Vec<String> = ids
        .into_iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect();

    if normalized_ids.is_empty() {
        return Err(CommandError::InvalidInput("请选择要删除的卡片".to_string()));
    }

    let card_repo = Mvp0CardRepository::new(conn);
    for id in &normalized_ids {
        let existing = card_repo
            .find_card_by_id(id)?
            .ok_or(CommandError::NotFound)?;
        if existing.deleted_at.is_some() {
            continue;
        }
        card_repo.soft_delete_card(id)?;
    }

    Ok(())
}

fn list_basic_card_groups_inner(
    conn: &Connection,
    include_deleted: bool,
) -> CommandResult<Vec<BasicCardGroupDto>> {
    let card_repo = Mvp0CardRepository::new(conn);
    let groups = card_repo.list_groups(include_deleted)?;
    groups
        .into_iter()
        .map(|group| build_basic_card_group_dto(conn, group))
        .collect()
}

fn create_basic_card_group_inner(
    conn: &Connection,
    data: CreateBasicCardGroupDto,
) -> CommandResult<BasicCardGroupDto> {
    let card_repo = Mvp0CardRepository::new(conn);
    let group = card_repo.create_group(CreateMvp0CardGroupRequest {
        name: require_non_empty("分组名称", &data.name)?,
        description: normalize_optional_text(data.description),
        color: normalize_optional_text(data.color),
        is_enabled: Some(true),
    })?;

    build_basic_card_group_dto(conn, group)
}

fn update_basic_card_group_inner(
    conn: &Connection,
    id: &str,
    data: UpdateBasicCardGroupDto,
) -> CommandResult<BasicCardGroupDto> {
    let card_repo = Mvp0CardRepository::new(conn);
    let existing = card_repo
        .find_group_by_id(id)?
        .ok_or(CommandError::NotFound)?;
    if existing.deleted_at.is_some() {
        return Err(CommandError::NotFound);
    }

    let group = card_repo
        .update_group(
            id,
            UpdateMvp0CardGroupRequest {
                name: require_non_empty("分组名称", &data.name)?,
                description: normalize_optional_text(data.description),
                color: normalize_optional_text(data.color),
            },
        )?
        .ok_or(CommandError::NotFound)?;

    build_basic_card_group_dto(conn, group)
}

fn set_basic_card_group_enabled_inner(
    conn: &Connection,
    id: &str,
    is_enabled: bool,
) -> CommandResult<BasicCardGroupDto> {
    let card_repo = Mvp0CardRepository::new(conn);
    let existing = card_repo
        .find_group_by_id(id)?
        .ok_or(CommandError::NotFound)?;
    if existing.deleted_at.is_some() {
        return Err(CommandError::NotFound);
    }

    card_repo.set_group_enabled(id, is_enabled)?;
    let group = card_repo
        .find_group_by_id(id)?
        .ok_or(CommandError::NotFound)?;
    build_basic_card_group_dto(conn, group)
}

fn delete_basic_card_group_inner(conn: &Connection, id: &str) -> CommandResult<()> {
    let card_repo = Mvp0CardRepository::new(conn);
    let existing = card_repo
        .find_group_by_id(id)?
        .ok_or(CommandError::NotFound)?;
    if existing.deleted_at.is_some() {
        return Ok(());
    }

    if card_repo.count_active_cards_in_group(id)? > 0 {
        return Err(CommandError::InvalidInput(
            "分组下仍有未删除卡片，请先移动或删除这些卡片".to_string(),
        ));
    }

    card_repo.soft_delete_group(id)?;
    Ok(())
}

fn build_basic_card_dto(conn: &Connection, card: Mvp0Card) -> CommandResult<BasicCardDto> {
    let card_repo = Mvp0CardRepository::new(conn);
    let document_repo = Mvp0DocumentRepository::new(conn);
    let group = card_repo
        .find_group_by_id(&card.group_id)?
        .ok_or(CommandError::NotFound)?;
    let source_anchor = match card.source_anchor_id.as_deref() {
        Some(anchor_id) => document_repo.find_source_anchor_by_id(anchor_id)?,
        None => None,
    };
    let source_document_id = source_anchor
        .as_ref()
        .map(|anchor| anchor.document_id.clone())
        .or_else(|| card.source_document_id.clone());
    let source_document_title = match source_document_id.as_deref() {
        Some(document_id) => document_repo
            .find_document_by_id(document_id)?
            .map(|document| document.title),
        None => None,
    };

    Ok(BasicCardDto {
        id: card.id,
        group_id: card.group_id,
        group_name: group.name,
        title: card.title,
        front: card.front,
        back: card.back,
        tags: decode_tags(&card.tags_json),
        origin: card.origin,
        source: BasicCardSourceDto {
            document_id: source_document_id,
            document_title: source_document_title,
            anchor_id: source_anchor.as_ref().map(|anchor| anchor.id.clone()),
            page: source_anchor.as_ref().map(|anchor| anchor.page),
            quote: source_anchor.map(|anchor| anchor.quote),
        },
        created_at: card.created_at,
        updated_at: card.updated_at,
        deleted_at: card.deleted_at,
    })
}

fn build_basic_card_group_dto(
    conn: &Connection,
    group: Mvp0CardGroup,
) -> CommandResult<BasicCardGroupDto> {
    let card_repo = Mvp0CardRepository::new(conn);
    Ok(BasicCardGroupDto {
        id: group.id.clone(),
        name: group.name,
        description: group.description,
        color: group.color,
        is_enabled: group.is_enabled,
        card_count: card_repo.count_active_cards_in_group(&group.id)?,
        created_at: group.created_at,
        updated_at: group.updated_at,
        deleted_at: group.deleted_at,
    })
}

fn require_active_group(conn: &Connection, group_id: &str) -> CommandResult<Mvp0CardGroup> {
    let card_repo = Mvp0CardRepository::new(conn);
    let group = card_repo
        .find_group_by_id(group_id)?
        .ok_or(CommandError::InvalidInput("指定分组不存在".to_string()))?;

    if group.deleted_at.is_some() {
        return Err(CommandError::InvalidInput("指定分组已删除".to_string()));
    }

    Ok(group)
}

fn resolve_source_binding(
    conn: &Connection,
    source_document_id: Option<String>,
    source_anchor_id: Option<String>,
) -> CommandResult<(Option<String>, Option<String>)> {
    let document_repo = Mvp0DocumentRepository::new(conn);

    let normalized_document_id = normalize_optional_text(source_document_id);
    let normalized_anchor_id = normalize_optional_text(source_anchor_id);

    if let Some(document_id) = normalized_document_id.as_deref() {
        let document = document_repo
            .find_document_by_id(document_id)?
            .ok_or(CommandError::InvalidInput("指定来源文档不存在".to_string()))?;
        if document.deleted_at.is_some() {
            return Err(CommandError::InvalidInput("指定来源文档已删除".to_string()));
        }
    }

    if let Some(anchor_id) = normalized_anchor_id.as_deref() {
        let anchor = document_repo
            .find_source_anchor_by_id(anchor_id)?
            .ok_or(CommandError::InvalidInput("指定来源锚点不存在".to_string()))?;
        if let Some(document_id) = normalized_document_id.as_deref() {
            if anchor.document_id != document_id {
                return Err(CommandError::InvalidInput(
                    "来源文档与来源锚点不匹配".to_string(),
                ));
            }
        }

        return Ok((Some(anchor.document_id), Some(anchor.id)));
    }

    Ok((normalized_document_id, None))
}

fn require_non_empty(label: &str, value: &str) -> CommandResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(CommandError::InvalidInput(format!("{label}不能为空")));
    }

    Ok(trimmed.to_string())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for tag in tags {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            continue;
        }
        if normalized.iter().any(|existing| existing == trimmed) {
            continue;
        }
        normalized.push(trimmed.to_string());
    }
    normalized
}

fn decode_tags(tags_json: &str) -> Vec<String> {
    serde_json::from_str(tags_json).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{
        test_support::TestDatabase, CreateMvp0DocumentRequest, CreateMvp0SourceAnchorRequest,
        Mvp0DocumentRepository,
    };

    fn seed_document(conn: &Connection) -> (String, String) {
        let repo = Mvp0DocumentRepository::new(conn);
        let document = repo
            .create_document(CreateMvp0DocumentRequest {
                title: "Memory Systems".to_string(),
                original_filename: "memory-systems.pdf".to_string(),
                file_path: "E:/docs/memory-systems.pdf".to_string(),
                file_hash: "memory-systems-hash".to_string(),
                file_size: 2048,
                page_count: Some(4),
                parse_status: Some("parsed".to_string()),
            })
            .expect("document should be created");
        let anchor = repo
            .create_source_anchor(CreateMvp0SourceAnchorRequest {
                document_id: document.id.clone(),
                chunk_id: None,
                page: 2,
                quote: "Stable anchors make review links trustworthy.".to_string(),
                bbox_json: None,
            })
            .expect("anchor should be created");

        (document.id, anchor.id)
    }

    #[test]
    fn basic_card_crud_and_filters_work() {
        let test_db = TestDatabase::new();
        let conn = test_db.connection();
        let group = create_basic_card_group_inner(
            conn,
            CreateBasicCardGroupDto {
                name: "认知科学".to_string(),
                description: Some("记忆与学习".to_string()),
                color: None,
            },
        )
        .expect("group should be created");
        let (document_id, anchor_id) = seed_document(conn);

        let created = create_basic_card_inner(
            conn,
            CreateBasicCardDto {
                group_id: group.id.clone(),
                source_document_id: Some(document_id.clone()),
                source_anchor_id: Some(anchor_id.clone()),
                title: "稳定锚点".to_string(),
                front: "为什么需要稳定锚点？".to_string(),
                back: "因为它能保证卡片与原文的回跳不漂移。".to_string(),
                tags: Some(vec!["reader".to_string(), "memory".to_string()]),
            },
        )
        .expect("card should be created");

        let filtered = list_basic_cards_inner(
            conn,
            ListBasicCardsFiltersDto {
                group_id: Some(group.id.clone()),
                source_document_id: Some(document_id),
                search_query: Some("稳定锚点".to_string()),
                tags: Some(vec!["memory".to_string()]),
                include_deleted: Some(false),
            },
        )
        .expect("cards should be filtered");

        assert_eq!(filtered.len(), 1);
        assert_eq!(
            filtered[0].source.anchor_id.as_deref(),
            Some(anchor_id.as_str())
        );
        assert_eq!(filtered[0].group_name, "认知科学");

        let updated = update_basic_card_inner(
            conn,
            &created.id,
            UpdateBasicCardDto {
                group_id: group.id.clone(),
                source_document_id: None,
                source_anchor_id: None,
                title: "更新后的锚点".to_string(),
                front: "为什么锚点不能漂移？".to_string(),
                back: "否则来源回看会失效。".to_string(),
                tags: Some(vec!["reader".to_string()]),
            },
        )
        .expect("card should update");
        assert_eq!(updated.title, "更新后的锚点");
        assert!(updated.source.anchor_id.is_none());

        delete_basic_card_inner(conn, &created.id).expect("card should soft delete");
        let visible_cards = list_basic_cards_inner(conn, ListBasicCardsFiltersDto::default())
            .expect("visible cards should load");
        assert!(visible_cards.is_empty());
    }

    #[test]
    fn duplicate_cards_in_same_group_are_rejected() {
        let test_db = TestDatabase::new();
        let conn = test_db.connection();
        let group = create_basic_card_group_inner(
            conn,
            CreateBasicCardGroupDto {
                name: "重复检测".to_string(),
                description: None,
                color: None,
            },
        )
        .expect("group should be created");

        create_basic_card_inner(
            conn,
            CreateBasicCardDto {
                group_id: group.id.clone(),
                source_document_id: None,
                source_anchor_id: None,
                title: "FSRS".to_string(),
                front: "什么是 FSRS？".to_string(),
                back: "一种间隔重复调度算法。".to_string(),
                tags: None,
            },
        )
        .expect("first card should be created");

        let duplicate = create_basic_card_inner(
            conn,
            CreateBasicCardDto {
                group_id: group.id,
                source_document_id: None,
                source_anchor_id: None,
                title: "FSRS 2".to_string(),
                front: "什么是 FSRS？".to_string(),
                back: "一种间隔重复调度算法。".to_string(),
                tags: None,
            },
        );

        assert!(matches!(duplicate, Err(CommandError::InvalidInput(_))));
    }

    #[test]
    fn delete_basic_cards_soft_deletes_multiple_cards_and_ignores_already_deleted() {
        let test_db = TestDatabase::new();
        let conn = test_db.connection();
        let group = create_basic_card_group_inner(
            conn,
            CreateBasicCardGroupDto {
                name: "批量删除".to_string(),
                description: None,
                color: None,
            },
        )
        .expect("group should be created");

        let first = create_basic_card_inner(
            conn,
            CreateBasicCardDto {
                group_id: group.id.clone(),
                source_document_id: None,
                source_anchor_id: None,
                title: "第一张".to_string(),
                front: "问题一".to_string(),
                back: "答案一".to_string(),
                tags: None,
            },
        )
        .expect("first card should be created");
        let second = create_basic_card_inner(
            conn,
            CreateBasicCardDto {
                group_id: group.id,
                source_document_id: None,
                source_anchor_id: None,
                title: "第二张".to_string(),
                front: "问题二".to_string(),
                back: "答案二".to_string(),
                tags: None,
            },
        )
        .expect("second card should be created");

        delete_basic_card_inner(conn, &second.id).expect("second card should pre-delete");
        delete_basic_cards_inner(conn, vec![first.id.clone(), second.id.clone()])
            .expect("bulk delete should be idempotent for deleted cards");

        let visible_cards = list_basic_cards_inner(conn, ListBasicCardsFiltersDto::default())
            .expect("visible cards should load");
        assert!(visible_cards.is_empty());
    }

    #[test]
    fn delete_basic_cards_returns_not_found_for_missing_card() {
        let test_db = TestDatabase::new();
        let result = delete_basic_cards_inner(
            test_db.connection(),
            vec!["00000000-0000-4000-8000-000000000000".to_string()],
        );

        assert!(matches!(result, Err(CommandError::NotFound)));
    }

    #[test]
    fn group_delete_requires_no_active_cards() {
        let test_db = TestDatabase::new();
        let conn = test_db.connection();
        let group = create_basic_card_group_inner(
            conn,
            CreateBasicCardGroupDto {
                name: "待删除分组".to_string(),
                description: None,
                color: None,
            },
        )
        .expect("group should be created");

        let created = create_basic_card_inner(
            conn,
            CreateBasicCardDto {
                group_id: group.id.clone(),
                source_document_id: None,
                source_anchor_id: None,
                title: "卡片".to_string(),
                front: "问题".to_string(),
                back: "答案".to_string(),
                tags: None,
            },
        )
        .expect("card should be created");

        let blocked = delete_basic_card_group_inner(conn, &group.id);
        assert!(matches!(blocked, Err(CommandError::InvalidInput(_))));

        delete_basic_card_inner(conn, &created.id).expect("card should soft delete");
        delete_basic_card_group_inner(conn, &group.id).expect("group should delete once empty");

        let groups = list_basic_card_groups_inner(conn, true).expect("groups should load");
        assert_eq!(groups.len(), 1);
        assert!(groups[0].deleted_at.is_some());
    }
}
