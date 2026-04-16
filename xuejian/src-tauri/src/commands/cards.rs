use tauri::State;
use crate::commands::{CommandResult, AppState};
use crate::db::{card_repo::CreateCardRequest};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct CardDto {
    pub id: String,
    pub front: String,
    pub back: String,
    pub document_id: Option<String>,
    pub anchor_id: Option<String>,
    pub source_page: Option<i32>,
    pub source_paragraph: Option<i32>,
    pub difficulty: f64,
    pub stability: f64,
    pub state: String,
    pub next_review: Option<String>,
}

impl From<crate::db::card_repo::Card> for CardDto {
    fn from(card: crate::db::card_repo::Card) -> Self {
        Self {
            id: card.id,
            front: card.front,
            back: card.back,
            document_id: card.document_id,
            anchor_id: card.anchor_id,
            source_page: card.source_page,
            source_paragraph: card.source_paragraph,
            difficulty: card.difficulty,
            stability: card.stability,
            state: card.state,
            next_review: card.next_review,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateCardDto {
    pub front: String,
    pub back: String,
    pub document_id: Option<String>,
    pub anchor_id: Option<String>,
    pub source_page: Option<i32>,
    pub source_paragraph: Option<i32>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateReviewDto {
    pub difficulty: f64,
    pub stability: f64,
    pub retrievability: f64,
    pub state: String,
    pub next_review: String,
}

#[tauri::command]
pub fn list_due_cards(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> CommandResult<Vec<CardDto>> {
    let repo = crate::db::card_repo::CardRepository::new(&state.db);
    let cards = repo.find_due_cards(limit)?;
    Ok(cards.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn create_card(
    state: State<'_, AppState>,
    data: CreateCardDto,
) -> CommandResult<CardDto> {
    let repo = crate::db::card_repo::CardRepository::new(&state.db);

    let req = CreateCardRequest {
        front: data.front,
        back: data.back,
        document_id: data.document_id,
        anchor_id: data.anchor_id,
        source_page: data.source_page,
        source_paragraph: data.source_paragraph,
        tags: data.tags,
    };

    let card = repo.create(req)?;
    Ok(card.into())
}

#[tauri::command]
pub fn update_card_review(
    state: State<'_, AppState>,
    id: String,
    data: UpdateReviewDto,
) -> CommandResult<()> {
    let repo = crate::db::card_repo::CardRepository::new(&state.db);
    repo.update_review(&id, data.difficulty, data.stability, data.retrievability, &data.state, &data.next_review)?;
    Ok(())
}
