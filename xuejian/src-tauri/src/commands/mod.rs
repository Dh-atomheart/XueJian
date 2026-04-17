use std::sync::{Mutex, MutexGuard};

use crate::db::{Database, DbError};
use crate::secrets::{SecretError, SecretStore};
use crate::tasks::{OrchestrationService, ServiceError};
use serde::Serialize;

pub mod cards;
pub mod documents;
pub mod orchestration;
pub mod settings;

#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("Database error: {0}")]
    Database(#[from] DbError),
    #[error("Secret error: {0}")]
    Secret(#[from] SecretError),
    #[error("Service error: {0}")]
    Service(#[from] ServiceError),
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
    pub db: Mutex<Database>,
    pub secrets: Mutex<SecretStore>,
    pub orchestration: OrchestrationService,
}

impl AppState {
    pub fn new(db: Database, secrets: SecretStore, orchestration: OrchestrationService) -> Self {
        Self {
            db: Mutex::new(db),
            secrets: Mutex::new(secrets),
            orchestration,
        }
    }

    pub fn lock_db(&self) -> CommandResult<MutexGuard<'_, Database>> {
        self.db
            .lock()
            .map_err(|_| CommandError::Internal("Database state is poisoned".to_string()))
    }

    pub fn lock_secrets(&self) -> CommandResult<MutexGuard<'_, SecretStore>> {
        self.secrets
            .lock()
            .map_err(|_| CommandError::Internal("Secret store state is poisoned".to_string()))
    }
}
