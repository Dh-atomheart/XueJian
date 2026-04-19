use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        ApiConfig, AppSettings, CreateApiConfigRequest, SettingsRepository, UpdateApiConfigRequest,
    },
    secrets::SecretStore,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiConfigDto {
    pub id: String,
    pub provider: String,
    pub auth_mode: String,
    pub name: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub budget_limit: Option<f64>,
    pub is_enabled: bool,
    pub is_default: bool,
    pub has_stored_credential: bool,
    pub has_stored_key: bool,
    pub created_at: String,
}

fn api_config_to_dto(config: ApiConfig, secrets: &SecretStore) -> CommandResult<ApiConfigDto> {
    let has_stored_key = secrets.has_api_key(&config.id)?;
    let has_stored_credential = config.auth_mode == "adc" || has_stored_key;

    Ok(ApiConfigDto {
        has_stored_credential,
        has_stored_key,
        id: config.id,
        provider: config.provider,
        auth_mode: config.auth_mode,
        name: config.name,
        base_url: config.base_url,
        model: config.model,
        budget_limit: config.budget_limit,
        is_enabled: config.is_enabled,
        is_default: config.is_default,
        created_at: config.created_at,
    })
}

impl ApiConfigDto {
    fn from_config_without_key(config: ApiConfig) -> Self {
        let has_stored_credential = config.auth_mode == "adc";

        Self {
            id: config.id,
            provider: config.provider,
            auth_mode: config.auth_mode,
            name: config.name,
            base_url: config.base_url,
            model: config.model,
            budget_limit: config.budget_limit,
            is_enabled: config.is_enabled,
            is_default: config.is_default,
            has_stored_credential,
            has_stored_key: false,
            created_at: config.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateApiConfigDto {
    pub provider: String,
    pub auth_mode: String,
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
    pub auth_mode: Option<String>,
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
    pub auth_mode: String,
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
    data: UpdateSettingsDto,
) -> CommandResult<AppSettingsDto> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    let settings = repo.update_settings(crate::db::UpdateAppSettingsRequest {
        daily_new_card_limit: data.daily_new_card_limit,
        review_time_limit: data.review_time_limit,
        theme: data.theme,
        language: data.language,
    })?;
    Ok(settings.into())
}

#[tauri::command]
pub fn list_api_configs(state: State<'_, AppState>) -> CommandResult<Vec<ApiConfigDto>> {
    let configs = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        repo.list_api_configs()?
    };
    let secrets = state.lock_secrets()?;

    configs
        .into_iter()
        .map(|config| api_config_to_dto(config, &secrets))
        .collect()
}

#[tauri::command]
pub fn get_api_config(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<Option<ApiConfigDto>> {
    let config = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        repo.get_api_config(&id)?
    };

    let Some(config) = config else {
        return Ok(None);
    };

    let secrets = state.lock_secrets()?;
    Ok(Some(api_config_to_dto(config, &secrets)?))
}

#[tauri::command]
pub fn create_api_config(
    state: State<'_, AppState>,
    data: CreateApiConfigDto,
) -> CommandResult<ApiConfigDto> {
    let config = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);

        let req = CreateApiConfigRequest {
            provider: data.provider,
            auth_mode: data.auth_mode,
            name: data.name,
            base_url: data.base_url,
            model: data.model,
            budget_limit: data.budget_limit,
            is_default: data.is_default,
        };

        repo.create_api_config(req)?
    };

    Ok(ApiConfigDto::from_config_without_key(config))
}

#[tauri::command]
pub fn update_api_config(
    state: State<'_, AppState>,
    id: String,
    data: UpdateApiConfigDto,
) -> CommandResult<ApiConfigDto> {
    let config = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);

        let req = UpdateApiConfigRequest {
            provider: data.provider,
            auth_mode: data.auth_mode,
            name: data.name,
            base_url: data.base_url,
            model: data.model,
            budget_limit: data.budget_limit,
            is_enabled: data.is_enabled,
            is_default: data.is_default,
        };

        repo.update_api_config(&id, req)?
            .ok_or(CommandError::NotFound)?
    };
    let secrets = state.lock_secrets()?;
    api_config_to_dto(config, &secrets)
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
    let auth_mode = data.auth_mode.as_str();
    let trimmed_api_key = data.api_key.trim();
    let normalized_base_url = data
        .base_url
        .as_ref()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty());

    let (success, message) = if auth_mode == "adc" {
        match data.provider.as_str() {
            "google" => (
                false,
                "Google ADC 模式的配置契约已接通，但本地宿主的实际 ADC 探测尚未在本轮实现。".to_string(),
            ),
            _ => (
                false,
                format!("provider \"{}\" 暂不支持 authMode=adc", data.provider),
            ),
        }
    } else if trimmed_api_key.is_empty() {
        (false, "缺少 API Key。".to_string())
    } else {
        match data.provider.as_str() {
            "openai" => {
                let message = if trimmed_api_key.starts_with("sk-") {
                    "OpenAI 配置字段完整，已通过本地预校验。".to_string()
                } else {
                    "OpenAI 已收到 API Key，但未命中常见 sk- 前缀；如为正式 Key，请继续以实际调用结果为准。".to_string()
                };
                (true, message)
            }
            "anthropic" => {
                let message = if trimmed_api_key.starts_with("sk-ant-") {
                    "Anthropic 配置字段完整，已通过本地预校验。".to_string()
                } else {
                    "Anthropic 已收到 API Key，但未命中常见 sk-ant- 前缀；如为正式 Key，请继续以实际调用结果为准。".to_string()
                };
                (true, message)
            }
            "google" => (
                true,
                "Google API Key 模式的字段已完整；Google ADC 认证将在后续宿主适配中补齐。".to_string(),
            ),
            "openai_compatible" => {
                let Some(base_url) = normalized_base_url else {
                    return Ok(ApiConnectionTestResultDto {
                        success: false,
                        message: "OpenAI-Compatible 需要提供 Base URL。".to_string(),
                    });
                };

                (true, format!("OpenAI-Compatible 配置字段完整，Base URL: {base_url}"))
            }
            _ => (
                false,
                format!("暂不支持 provider \"{}\" 的自动连接校验", data.provider),
            ),
        }
    };

    Ok(ApiConnectionTestResultDto { success, message })
}
