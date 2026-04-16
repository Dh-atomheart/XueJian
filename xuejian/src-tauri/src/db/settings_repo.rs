use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::db::{Database, Result};

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiConfig {
    pub id: String,
    pub provider: String,
    pub name: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub budget_limit: Option<f64>,
    pub is_enabled: bool,
    pub is_default: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateApiConfigRequest {
    pub provider: String,
    pub name: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub budget_limit: Option<f64>,
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppSettings {
    pub daily_new_card_limit: i32,
    pub review_time_limit: i32,
    pub theme: String,
    pub language: String,
}

pub struct SettingsRepository<'a> {
    db: &'a Database,
}

impl<'a> SettingsRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn create_api_config(&self, req: CreateApiConfigRequest) -> Result<ApiConfig> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        // If this is set as default, clear other defaults
        if req.is_default {
            self.db.connection().execute(
                "UPDATE api_configs SET is_default = FALSE WHERE is_default = TRUE",
                [],
            )?;
        }

        self.db.connection().execute(
            "INSERT INTO api_configs (id, provider, name, base_url, model, budget_limit, is_default, created_at, user_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'default')",
            params![
                &id, &req.provider, &req.name, req.base_url, req.model,
                req.budget_limit, req.is_default, &now
            ],
        )?;

        Ok(ApiConfig {
            id,
            provider: req.provider,
            name: req.name,
            base_url: req.base_url,
            model: req.model,
            budget_limit: req.budget_limit,
            is_enabled: true,
            is_default: req.is_default,
            created_at: now,
        })
    }

    pub fn list_api_configs(&self) -> Result<Vec<ApiConfig>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, provider, name, base_url, model, budget_limit, is_enabled, is_default, created_at
             FROM api_configs
             ORDER BY created_at DESC"
        )?;

        let configs = stmt.query_map([], |row| {
            Ok(ApiConfig {
                id: row.get(0)?,
                provider: row.get(1)?,
                name: row.get(2)?,
                base_url: row.get(3)?,
                model: row.get(4)?,
                budget_limit: row.get(5)?,
                is_enabled: row.get(6)?,
                is_default: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?;

        configs.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn delete_api_config(&self, id: &str) -> Result<()> {
        self.db.connection().execute(
            "DELETE FROM api_configs WHERE id = ?1",
            params![id],
        )?;

        Ok(())
    }

    pub fn get_settings(&self) -> Result<AppSettings> {
        // For now, return default settings
        // In the future, these could be stored in the database
        Ok(AppSettings {
            daily_new_card_limit: 20,
            review_time_limit: 30,
            theme: "default".to_string(),
            language: "zh-CN".to_string(),
        })
    }
}
