use tauri::State;
use crate::commands::{CommandResult, AppState};
use crate::db::{settings_repo::CreateApiConfigRequest};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct ApiConfigDto {
    pub id: String,
    pub provider: String,
    pub name: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub budget_limit: Option<f64>,
    pub is_enabled: bool,
    pub is_default: bool,
}

impl From<crate::db::settings_repo::ApiConfig> for ApiConfigDto {
    fn from(config: crate::db::settings_repo::ApiConfig) -> Self {
        Self {
            id: config.id,
            provider: config.provider,
            name: config.name,
            base_url: config.base_url,
            model: config.model,
            budget_limit: config.budget_limit,
            is_enabled: config.is_enabled,
            is_default: config.is_default,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateApiConfigDto {
    pub provider: String,
    pub name: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub budget_limit: Option<f64>,
    pub is_default: bool,
}

#[derive(Debug, Deserialize)]
pub struct StoreApiKeyDto {
    pub config_id: String,
    pub api_key: String,
}

#[derive(Debug, Serialize)]
pub struct AppSettingsDto {
    pub daily_new_card_limit: i32,
    pub review_time_limit: i32,
    pub theme: String,
    pub language: String,
}

impl From<crate::db::settings_repo::AppSettings> for AppSettingsDto {
    fn from(settings: crate::db::settings_repo::AppSettings) -> Self {
        Self {
            daily_new_card_limit: settings.daily_new_card_limit,
            review_time_limit: settings.review_time_limit,
            theme: settings.theme,
            language: settings.language,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsDto {
    pub daily_new_card_limit: Option<i32>,
    pub review_time_limit: Option<i32>,
    pub theme: Option<String>,
    pub language: Option<String>,
}

#[tauri::command]
pub fn get_settings(
    state: State<'_, AppState>,
) -> CommandResult<AppSettingsDto> {
    let repo = crate::db::settings_repo::SettingsRepository::new(&state.db);
    let settings = repo.get_settings()?;
    Ok(settings.into())
}

#[tauri::command]
pub fn update_settings(
    state: State<'_, AppState>,
    data: UpdateSettingsDto,
) -> CommandResult<AppSettingsDto> {
    // For now, just return current settings
    // In the future, these would be saved to the database
    let repo = crate::db::settings_repo::SettingsRepository::new(&state.db);
    let settings = repo.get_settings()?;
    Ok(settings.into())
}

#[tauri::command]
pub fn list_api_configs(
    state: State<'_, AppState>,
) -> CommandResult<Vec<ApiConfigDto>> {
    let repo = crate::db::settings_repo::SettingsRepository::new(&state.db);
    let configs = repo.list_api_configs()?;
    Ok(configs.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn create_api_config(
    state: State<'_, AppState>,
    data: CreateApiConfigDto,
) -> CommandResult<ApiConfigDto> {
    let repo = crate::db::settings_repo::SettingsRepository::new(&state.db);

    let req = CreateApiConfigRequest {
        provider: data.provider,
        name: data.name,
        base_url: data.base_url,
        model: data.model,
        budget_limit: data.budget_limit,
        is_default: data.is_default,
    };

    let config = repo.create_api_config(req)?;
    Ok(config.into())
}

#[tauri::command]
pub fn delete_api_config(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<()> {
    let repo = crate::db::settings_repo::SettingsRepository::new(&state.db);
    repo.delete_api_config(&id)?;

    // Also delete from Stronghold
    state.secrets.delete_api_key(&id)?;

    Ok(())
}

#[tauri::command]
pub fn store_api_key(
    state: State<'_, AppState>,
    data: StoreApiKeyDto,
) -> CommandResult<()> {
    state.secrets.store_api_key(&data.config_id, &data.api_key)?;
    Ok(())
}

#[tauri::command]
pub async fn test_api_connection(
    provider: String,
    api_key: String,
    base_url: Option<String>,
) -> CommandResult<bool> {
    // Simple connection test based on provider
    match provider.as_str() {
        "openai" => {
            // In a real implementation, this would make an actual API call
            // For now, just return true if key is not empty
            Ok(!api_key.is_empty() && api_key.starts_with("sk-"))
        }
        "anthropic" => {
            Ok(!api_key.is_empty() && api_key.starts_with("sk-ant-"))
        }
        _ => Ok(false),
    }
}
