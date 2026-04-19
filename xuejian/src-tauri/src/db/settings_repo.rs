use crate::db::{Database, Result};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const DEFAULT_USER_ID: &str = "default";
const DEFAULT_LANGUAGE: &str = "zh-CN";
const DEFAULT_THEME: &str = "default";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiConfig {
    pub id: String,
    pub provider: String,
    pub auth_mode: String,
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
    pub auth_mode: String,
    pub name: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub budget_limit: Option<f64>,
    pub is_default: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateApiConfigRequest {
    pub provider: Option<String>,
    pub auth_mode: Option<String>,
    pub name: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub budget_limit: Option<f64>,
    pub is_enabled: Option<bool>,
    pub is_default: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppSettings {
    pub daily_new_card_limit: i32,
    pub review_time_limit: i32,
    pub theme: String,
    pub language: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAppSettingsRequest {
    pub daily_new_card_limit: Option<i32>,
    pub review_time_limit: Option<i32>,
    pub theme: Option<String>,
    pub language: Option<String>,
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
        let provider = normalize_provider(req.provider);
        let auth_mode = normalize_auth_mode(req.auth_mode);

        // If this is set as default, clear other defaults
        if req.is_default {
            self.db.connection().execute(
                "UPDATE api_configs SET is_default = FALSE WHERE is_default = TRUE",
                [],
            )?;
        }

        self.db.connection().execute(
            "INSERT INTO api_configs (id, provider, auth_mode, name, base_url, model, budget_limit, is_default, created_at, user_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'default')",
            params![
                &id, &provider, &auth_mode, &req.name, req.base_url, req.model,
                req.budget_limit, req.is_default, &now
            ],
        )?;

        Ok(ApiConfig {
            id,
            provider,
            auth_mode,
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
            "SELECT id, provider, auth_mode, name, base_url, model, budget_limit, is_enabled, is_default, created_at
             FROM api_configs
             ORDER BY created_at DESC"
        )?;

        let configs = stmt.query_map([], |row| {
            Ok(ApiConfig {
                id: row.get(0)?,
                provider: normalize_provider(row.get::<_, String>(1)?),
                auth_mode: normalize_auth_mode(row.get::<_, String>(2)?),
                name: row.get(3)?,
                base_url: row.get(4)?,
                model: row.get(5)?,
                budget_limit: row.get(6)?,
                is_enabled: row.get(7)?,
                is_default: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?;

        configs
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn get_api_config(&self, id: &str) -> Result<Option<ApiConfig>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, provider, auth_mode, name, base_url, model, budget_limit, is_enabled, is_default, created_at
             FROM api_configs
             WHERE id = ?1"
        )?;

        stmt.query_row(params![id], |row| {
            Ok(ApiConfig {
                id: row.get(0)?,
                provider: normalize_provider(row.get::<_, String>(1)?),
                auth_mode: normalize_auth_mode(row.get::<_, String>(2)?),
                name: row.get(3)?,
                base_url: row.get(4)?,
                model: row.get(5)?,
                budget_limit: row.get(6)?,
                is_enabled: row.get(7)?,
                is_default: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .optional()
        .map_err(Into::into)
    }

    pub fn update_api_config(
        &self,
        id: &str,
        req: UpdateApiConfigRequest,
    ) -> Result<Option<ApiConfig>> {
        let Some(current) = self.get_api_config(id)? else {
            return Ok(None);
        };

        let provider = normalize_provider(req.provider.unwrap_or(current.provider));
        let auth_mode = normalize_auth_mode(req.auth_mode.unwrap_or(current.auth_mode));
        let name = req.name.unwrap_or(current.name);
        let base_url = req.base_url.or(current.base_url);
        let model = req.model.or(current.model);
        let budget_limit = req.budget_limit.or(current.budget_limit);
        let is_enabled = req.is_enabled.unwrap_or(current.is_enabled);
        let is_default = req.is_default.unwrap_or(current.is_default);

        if is_default {
            self.db.connection().execute(
                "UPDATE api_configs SET is_default = FALSE WHERE id != ?1",
                params![id],
            )?;
        }

        self.db.connection().execute(
            "UPDATE api_configs
             SET provider = ?1, auth_mode = ?2, name = ?3, base_url = ?4, model = ?5, budget_limit = ?6, is_enabled = ?7, is_default = ?8
             WHERE id = ?9",
            params![
                provider,
                auth_mode,
                name,
                base_url,
                model,
                budget_limit,
                is_enabled,
                is_default,
                id,
            ],
        )?;

        self.get_api_config(id)
    }

    pub fn set_default_api_config(&self, id: &str) -> Result<bool> {
        if self.get_api_config(id)?.is_none() {
            return Ok(false);
        }

        self.db.connection().execute(
            "UPDATE api_configs SET is_default = FALSE WHERE is_default = TRUE",
            [],
        )?;

        let affected_rows = self.db.connection().execute(
            "UPDATE api_configs SET is_default = TRUE WHERE id = ?1",
            params![id],
        )?;

        Ok(affected_rows > 0)
    }

    pub fn delete_api_config(&self, id: &str) -> Result<()> {
        self.db
            .connection()
            .execute("DELETE FROM api_configs WHERE id = ?1", params![id])?;

        Ok(())
    }

    pub fn get_settings(&self) -> Result<AppSettings> {
        let raw_settings = self
            .db
            .connection()
            .query_row(
                "SELECT settings FROM users WHERE id = ?1",
                params![DEFAULT_USER_ID],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?
            .flatten();

        match raw_settings {
            Some(raw) => Ok(sanitize_settings(serde_json::from_str::<AppSettings>(&raw)?)),
            None => Ok(default_app_settings()),
        }
    }

    pub fn update_settings(&self, req: UpdateAppSettingsRequest) -> Result<AppSettings> {
        let current = self.get_settings()?;
        let next_settings = sanitize_settings(AppSettings {
            daily_new_card_limit: req
                .daily_new_card_limit
                .unwrap_or(current.daily_new_card_limit),
            review_time_limit: req.review_time_limit.unwrap_or(current.review_time_limit),
            theme: req.theme.unwrap_or(current.theme),
            language: req.language.unwrap_or(current.language),
        });

        let serialized = serde_json::to_string(&next_settings)?;

        self.db.connection().execute(
            "INSERT INTO users (id, name, settings)
             VALUES (?1, '默认用户', ?2)
             ON CONFLICT(id) DO UPDATE SET settings = excluded.settings",
            params![DEFAULT_USER_ID, serialized],
        )?;

        Ok(next_settings)
    }
}

fn default_app_settings() -> AppSettings {
    AppSettings {
        daily_new_card_limit: 20,
        review_time_limit: 30,
        theme: DEFAULT_THEME.to_string(),
        language: DEFAULT_LANGUAGE.to_string(),
    }
}

fn sanitize_settings(settings: AppSettings) -> AppSettings {
    AppSettings {
        daily_new_card_limit: settings.daily_new_card_limit.max(0),
        review_time_limit: settings.review_time_limit.max(0),
        theme: sanitize_theme(settings.theme),
        language: sanitize_language(settings.language),
    }
}

fn sanitize_theme(theme: String) -> String {
    match theme.as_str() {
        "default" | "comic-sketch" | "contrast-paper" => theme,
        _ => DEFAULT_THEME.to_string(),
    }
}

fn sanitize_language(language: String) -> String {
    match language.as_str() {
        "zh-CN" | "en-US" => language,
        _ => DEFAULT_LANGUAGE.to_string(),
    }
}

fn normalize_provider(provider: String) -> String {
    match provider.as_str() {
        "custom" => "openai_compatible".to_string(),
        "openai" | "anthropic" | "google" | "openai_compatible" => provider,
        _ => "openai".to_string(),
    }
}

fn normalize_auth_mode(auth_mode: String) -> String {
    match auth_mode.as_str() {
        "api_key" | "adc" => auth_mode,
        _ => "api_key".to_string(),
    }
}
