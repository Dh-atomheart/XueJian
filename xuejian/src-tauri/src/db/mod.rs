use refinery::embed_migrations;
use rusqlite::Connection;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub mod card_repo;
pub mod document_repo;
pub mod settings_repo;
pub mod workflow_repo;

pub use card_repo::*;
pub use document_repo::*;
pub use settings_repo::*;
pub use workflow_repo::*;

embed_migrations!("src/migrations");

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Migration error: {0}")]
    Migration(#[from] refinery::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Invalid path")]
    InvalidPath,
}

pub type Result<T> = std::result::Result<T, DbError>;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let db_path = get_db_path(app_handle)?;

        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(&db_path)?;

        // Enable foreign keys
        conn.execute("PRAGMA foreign_keys = ON", [])?;

        // Enable WAL mode for better concurrency
        conn.execute("PRAGMA journal_mode = WAL", [])?;

        Ok(Self { conn })
    }

    pub fn run_migrations(&mut self) -> Result<()> {
        migrations::runner().run(&mut self.conn)?;
        Ok(())
    }

    pub fn connection(&self) -> &Connection {
        &self.conn
    }
}

fn get_db_path(app_handle: &AppHandle) -> Result<PathBuf> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|_| DbError::InvalidPath)?;

    Ok(app_dir.join("xuejian.db"))
}

pub fn init_db(app_handle: &AppHandle) -> Result<Database> {
    let mut db = Database::new(app_handle)?;
    db.run_migrations()?;
    log::info!("Database initialized successfully");
    Ok(db)
}
