use tauri::State;
use crate::db::{Database, DbError};
use crate::secrets::{SecretStore, SecretError};
use serde::Serialize;

pub mod documents;
pub mod cards;
pub mod settings;

#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("Database error: {0}")]
    Database(#[from] DbError),
    #[error("Secret error: {0}")]
    Secret(#[from] SecretError),
    #[error("Not found")]
    NotFound,
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    #[error("Internal error: {0}")]
    Internal(String),
}

impl Serialize for CommandError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<rusqlite::Error> for CommandError {
    fn from(err: rusqlite::Error) -> Self {
        CommandError::Database(DbError::Sqlite(err))
    }
}

pub type CommandResult<T> = std::result::Result<T, CommandError>;

// Application state that will be shared across commands
pub struct AppState {
    pub db: Database,
    pub secrets: SecretStore,
}

impl AppState {
    pub fn new(db: Database, secrets: SecretStore) -> Self {
        Self { db, secrets }
    }
}

pub fn all_commands() -> impl Fn(tauri::Builder) -> tauri::Builder {
    |builder| {
        builder.invoke_handler(tauri::generate_handler![
            // Document commands
            documents::list_documents,
            documents::get_document,
            documents::create_document,
            documents::update_document_status,
            documents::delete_document,

            // Card commands
            cards::list_due_cards,
            cards::create_card,
            cards::update_card_review,

            // Settings commands
            settings::get_settings,
            settings::update_settings,
            settings::list_api_configs,
            settings::create_api_config,
            settings::delete_api_config,
            settings::store_api_key,
            settings::test_api_connection,
        ])
    }
}
