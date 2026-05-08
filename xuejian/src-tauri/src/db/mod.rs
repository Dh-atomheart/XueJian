use refinery::embed_migrations;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Once;
use tauri::{AppHandle, Manager};

pub mod animation_repo;
pub mod card_repo;
pub mod document_repo;
pub mod knowledge_qa_repo;
pub mod mvp0;
pub mod podcast_repo;
pub mod points_repo;
pub mod query_embedding_cache_repo;
pub mod rag_readiness;
pub mod section_repo;
pub mod settings_repo;
pub mod vector_repo;
pub mod workflow_repo;

pub use animation_repo::*;
pub use card_repo::*;
pub use document_repo::*;
pub use knowledge_qa_repo::*;
pub use mvp0::*;
pub use podcast_repo::*;
pub use points_repo::*;
pub use query_embedding_cache_repo::*;
pub use rag_readiness::*;
pub use section_repo::*;
pub use settings_repo::*;
pub use vector_repo::*;
pub use workflow_repo::*;

// Keep the embedded migration set in sync with the canonical runtime schema.
embed_migrations!("src/migrations");

static SQLITE_VEC_AUTO_EXTENSION: Once = Once::new();

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
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
        Self::new_at(db_path)
    }

    pub fn new_at(db_path: PathBuf) -> Result<Self> {
        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        register_sqlite_vec_auto_extension();
        let conn = Connection::open(&db_path)?;

        configure_connection(&conn)?;

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

fn configure_connection(conn: &Connection) -> Result<()> {
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    Ok(())
}

fn register_sqlite_vec_auto_extension() {
    SQLITE_VEC_AUTO_EXTENSION.call_once(|| unsafe {
        rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite_vec::sqlite3_vec_init as *const (),
        )));
    });
}

#[cfg(test)]
pub(crate) mod test_support {
    use super::{configure_connection, migrations};
    use rusqlite::Connection;
    use std::path::PathBuf;
    use uuid::Uuid;

    pub struct TestDatabase {
        conn: Connection,
        path: PathBuf,
    }

    impl TestDatabase {
        pub fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("xuejian-mvp0-db-{}.sqlite", Uuid::new_v4()));
            let mut conn = Connection::open(&path).expect("temp db should open");
            configure_connection(&conn).expect("connection should be configured");
            migrations::runner()
                .run(&mut conn)
                .expect("mvp0 migrations should apply");

            Self { conn, path }
        }

        pub fn connection(&self) -> &Connection {
            &self.conn
        }
    }

    impl Drop for TestDatabase {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.path);
            let _ = std::fs::remove_file(self.path.with_extension("sqlite-wal"));
            let _ = std::fs::remove_file(self.path.with_extension("sqlite-shm"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::configure_connection;
    use super::test_support::TestDatabase;
    use rusqlite::Connection;
    use uuid::Uuid;

    #[test]
    fn configure_connection_enables_foreign_keys_and_wal() {
        let db_path = std::env::temp_dir().join(format!("xuejian-db-{}.sqlite", Uuid::new_v4()));
        let conn = Connection::open(&db_path).expect("temp db should open");

        configure_connection(&conn).expect("connection configuration should succeed");

        let foreign_keys: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .expect("foreign_keys pragma should be readable");
        let journal_mode: String = conn
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .expect("journal_mode pragma should be readable");

        assert_eq!(foreign_keys, 1);
        assert_eq!(journal_mode.to_ascii_lowercase(), "wal");

        drop(conn);
        let _ = std::fs::remove_file(&db_path);
        let _ = std::fs::remove_file(db_path.with_extension("sqlite-wal"));
        let _ = std::fs::remove_file(db_path.with_extension("sqlite-shm"));
    }

    #[test]
    fn db_init_creates_all_mvp0_tables() {
        let test_db = TestDatabase::new();
        let table_names = [
            "documents",
            "document_chunks",
            "source_anchors",
            "card_groups",
            "cards",
            "review_states",
            "study_events",
            "background_jobs",
        ];

        for table_name in table_names {
            let exists = test_db
                .connection()
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
                    [table_name],
                    |row| row.get::<_, i64>(0),
                )
                .expect("table lookup should succeed");

            assert_eq!(exists, 1, "expected table {table_name} to exist");
        }
    }
}
