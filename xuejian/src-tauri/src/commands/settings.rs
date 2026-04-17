use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        ApiConfig, AppSettings, CreateApiConfigRequest, SettingsRepository, UpdateApiConfigRequest,
    },
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiConfigDto {
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

impl From<ApiConfig> for ApiConfigDto {
    fn from(config: ApiConfig) -> Self {
        Self {
            id: config.id,
            provider: config.provider,
            name: config.name,
            base_url: config.base_url,
            model: config.model,
            budget_limit: config.budget_limit,
            is_enabled: config.is_enabled,
            is_default: config.is_default,
            created_at: config.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateApiConfigDto {
    pub provider: String,
    pub name: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub budget_limit: Option<f64>,
    pub is_default: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateApiConfigDto {
    pub provider: Option<String>,
    pub name: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub budget_limit: Option<f64>,
    pub is_enabled: Option<bool>,
    pub is_default: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreApiKeyDto {
    pub config_id: String,
    pub api_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsDto {
    pub daily_new_card_limit: i32,
    pub review_time_limit: i32,
    pub theme: String,
    pub language: String,
}

impl From<AppSettings> for AppSettingsDto {
    fn from(settings: AppSettings) -> Self {
        Self {
            daily_new_card_limit: settings.daily_new_card_limit,
            review_time_limit: settings.review_time_limit,
            theme: settings.theme,
            language: settings.language,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettingsDto {
    pub daily_new_card_limit: Option<i32>,
    pub review_time_limit: Option<i32>,
    pub theme: Option<String>,
    pub language: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestApiConnectionDto {
    pub provider: String,
    pub api_key: String,
    pub base_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiConnectionTestResultDto {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> CommandResult<AppSettingsDto> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    let settings = repo.get_settings()?;
    Ok(settings.into())
}

#[tauri::command]
pub fn update_settings(
    state: State<'_, AppState>,
    _data: UpdateSettingsDto,
) -> CommandResult<AppSettingsDto> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    let settings = repo.get_settings()?;
    Ok(settings.into())
}

#[tauri::command]
pub fn list_api_configs(state: State<'_, AppState>) -> CommandResult<Vec<ApiConfigDto>> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    let configs = repo.list_api_configs()?;
    Ok(configs.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn get_api_config(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<Option<ApiConfigDto>> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    let config = repo.get_api_config(&id)?;
    Ok(config.map(Into::into))
}

#[tauri::command]
pub fn create_api_config(
    state: State<'_, AppState>,
    data: CreateApiConfigDto,
) -> CommandResult<ApiConfigDto> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);

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
pub fn update_api_config(
    state: State<'_, AppState>,
    id: String,
    data: UpdateApiConfigDto,
) -> CommandResult<ApiConfigDto> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);

    let req = UpdateApiConfigRequest {
        provider: data.provider,
        name: data.name,
        base_url: data.base_url,
        model: data.model,
        budget_limit: data.budget_limit,
        is_enabled: data.is_enabled,
        is_default: data.is_default,
    };

    let config = repo
        .update_api_config(&id, req)?
        .ok_or(CommandError::NotFound)?;
    Ok(config.into())
}

#[tauri::command]
pub fn set_default_api_config(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    let found = repo.set_default_api_config(&id)?;

    if !found {
        return Err(CommandError::NotFound);
    }

    Ok(())
}

#[tauri::command]
pub fn delete_api_config(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        repo.delete_api_config(&id)?;
    }

    let secrets = state.lock_secrets()?;
    secrets.delete_api_key(&id)?;
    Ok(())
}

#[tauri::command]
pub fn store_api_key(state: State<'_, AppState>, data: StoreApiKeyDto) -> CommandResult<()> {
    let secrets = state.lock_secrets()?;
    secrets.store_api_key(&data.config_id, &data.api_key)?;
    Ok(())
}

#[tauri::command]
pub async fn test_api_connection(
    data: TestApiConnectionDto,
) -> CommandResult<ApiConnectionTestResultDto> {
    let (success, message) = match data.provider.as_str() {
        "openai" => {
            let is_valid = !data.api_key.is_empty() && data.api_key.starts_with("sk-");
            let message = if is_valid {
                "OpenAI 配置校验通过".to_string()
            } else {
                "OpenAI Key 格式不正确".to_string()
            };
            (is_valid, message)
        }
        "anthropic" => {
            let is_valid = !data.api_key.is_empty() && data.api_key.starts_with("sk-ant-");
            let message = if is_valid {
                "Anthropic 配置校验通过".to_string()
            } else {
                "Anthropic Key 格式不正确".to_string()
            };
            (is_valid, message)
        }
        _ => (
            false,
            format!(
                "暂不支持 provider \"{}\" 的自动连接校验{}",
                data.provider,
                data.base_url
                    .as_ref()
                    .map(|url| format!(" (baseUrl: {url})"))
                    .unwrap_or_default()
            ),
        ),
    };

    Ok(ApiConnectionTestResultDto { success, message })
}
