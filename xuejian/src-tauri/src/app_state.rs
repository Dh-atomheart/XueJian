use std::sync::{Arc, Mutex, MutexGuard};

use crate::db::{Database, DbError};
use crate::secrets::{SecretError, SecretStore};
use crate::tasks::{OrchestrationService, ServiceError};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
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

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Database(DbError::Sqlite(err))
    }
}

pub type AppResult<T> = std::result::Result<T, AppError>;

pub struct AppState {
    pub db: Mutex<Database>,
    pub secrets: Mutex<SecretStore>,
    pub orchestration: Arc<OrchestrationService>,
}

impl AppState {
    pub fn new(db: Database, secrets: SecretStore, orchestration: OrchestrationService) -> Self {
        Self {
            db: Mutex::new(db),
            secrets: Mutex::new(secrets),
            orchestration: Arc::new(orchestration),
        }
    }

    #[track_caller]
    pub fn lock_db(&self) -> AppResult<MutexGuard<'_, Database>> {
        let start = std::time::Instant::now();
        let guard = self
            .db
            .lock()
            .map_err(|_| AppError::Internal("Database state is poisoned".to_string()))?;

        let wait_ms = start.elapsed().as_secs_f64() * 1000.0;
        if wait_ms >= 50.0 {
            let caller = std::panic::Location::caller();
            log::warn!(
                "[Perf][Lock] lock_db waited: {:.2}ms at {}:{}",
                wait_ms,
                caller.file(),
                caller.line()
            );
        }

        Ok(guard)
    }

    #[track_caller]
    pub fn lock_secrets(&self) -> AppResult<MutexGuard<'_, SecretStore>> {
        let start = std::time::Instant::now();
        let guard = self
            .secrets
            .lock()
            .map_err(|_| AppError::Internal("Secret store state is poisoned".to_string()))?;

        let wait_ms = start.elapsed().as_secs_f64() * 1000.0;
        if wait_ms >= 50.0 {
            let caller = std::panic::Location::caller();
            log::warn!(
                "[Perf][Lock] lock_secrets waited: {:.2}ms at {}:{}",
                wait_ms,
                caller.file(),
                caller.line()
            );
        }

        Ok(guard)
    }
}
