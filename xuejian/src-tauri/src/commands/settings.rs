use std::{collections::BTreeMap, time::Duration};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        ApiConfig, AppSettings, CreateApiConfigRequest, CreateEmbeddingProfileRequest,
        EmbeddingProfile, ProviderBudgetUsage, SettingsRepository, UpdateApiConfigRequest,
        VectorRepository, WorkflowModelAssignment,
    },
};

const WORKFLOW_TYPES: [&str; 5] = [
    "card_generation",
    "document_embedding",
    "knowledge_qa",
    "podcast_generation",
    "knowledge_graph",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiConfigDto {
    pub id: String,
    pub provider: String,
    pub protocol: Option<String>,
    pub auth_mode: String,
    pub name: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub budget_limit: Option<f64>,
    pub is_enabled: bool,
    pub is_default: bool,
    pub has_stored_credential: bool,
    pub has_stored_key: bool,
    pub key_verified_at: Option<String>,
    pub key_status: String,
    pub display_name: Option<String>,
    pub created_at: String,
}

fn api_config_to_dto(config: ApiConfig) -> ApiConfigDto {
    // Use DB key_status as source of truth — avoids N×Stronghold reads on list.
    // key_status is always kept in sync with Stronghold writes via update_api_key_status.
    let has_stored_key = config.key_status != "none";
    let has_stored_credential = config.auth_mode == "adc" || has_stored_key;

    ApiConfigDto {
        has_stored_credential,
        has_stored_key,
        id: config.id,
        provider: config.provider,
        protocol: config.protocol,
        auth_mode: config.auth_mode,
        name: config.name,
        base_url: config.base_url,
        model: config.model,
        budget_limit: config.budget_limit,
        is_enabled: config.is_enabled,
        is_default: config.is_default,
        key_verified_at: config.key_verified_at,
        key_status: config.key_status,
        display_name: config.display_name,
        created_at: config.created_at,
    }
}

impl ApiConfigDto {
    fn from_config_without_key(config: ApiConfig) -> Self {
        let has_stored_credential = config.auth_mode == "adc";

        Self {
            id: config.id,
            provider: config.provider,
            protocol: config.protocol,
            auth_mode: config.auth_mode,
            name: config.name,
            base_url: config.base_url,
            model: config.model,
            budget_limit: config.budget_limit,
            is_enabled: config.is_enabled,
            is_default: config.is_default,
            has_stored_credential,
            has_stored_key: false,
            key_verified_at: config.key_verified_at,
            key_status: config.key_status,
            display_name: config.display_name,
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
    pub display_name: Option<String>,
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
    pub display_name: Option<String>,
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
    pub podcast_tts_provider: String,
    pub podcast_openai_model: String,
    pub podcast_fish_audio_endpoint: Option<String>,
    pub podcast_voice_overrides: std::collections::BTreeMap<String, String>,
    pub podcast_output_format: String,
    pub podcast_skip_review: bool,
    pub podcast_max_llm_tokens: i32,
    pub podcast_max_tts_characters: i32,
    pub podcast_max_estimated_cost_usd: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingProfileDto {
    pub id: String,
    pub provider: String,
    pub model: String,
    pub dimensions: i32,
    pub distance_metric: String,
    pub is_active: bool,
    pub revision: i32,
    pub created_at: String,
}

impl From<EmbeddingProfile> for EmbeddingProfileDto {
    fn from(profile: EmbeddingProfile) -> Self {
        Self {
            id: profile.id,
            provider: profile.provider,
            model: profile.model,
            dimensions: profile.dimensions,
            distance_metric: profile.distance_metric,
            is_active: profile.is_active,
            revision: profile.revision,
            created_at: profile.created_at,
        }
    }
}

impl From<AppSettings> for AppSettingsDto {
    fn from(settings: AppSettings) -> Self {
        Self {
            daily_new_card_limit: settings.daily_new_card_limit,
            review_time_limit: settings.review_time_limit,
            theme: settings.theme,
            language: settings.language,
            podcast_tts_provider: settings.podcast_tts_provider,
            podcast_openai_model: settings.podcast_openai_model,
            podcast_fish_audio_endpoint: settings.podcast_fish_audio_endpoint,
            podcast_voice_overrides: settings.podcast_voice_overrides,
            podcast_output_format: settings.podcast_output_format,
            podcast_skip_review: settings.podcast_skip_review,
            podcast_max_llm_tokens: settings.podcast_max_llm_tokens,
            podcast_max_tts_characters: settings.podcast_max_tts_characters,
            podcast_max_estimated_cost_usd: settings.podcast_max_estimated_cost_usd,
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
    pub podcast_tts_provider: Option<String>,
    pub podcast_openai_model: Option<String>,
    pub podcast_fish_audio_endpoint: Option<Option<String>>,
    pub podcast_voice_overrides: Option<std::collections::BTreeMap<String, String>>,
    pub podcast_output_format: Option<String>,
    pub podcast_skip_review: Option<bool>,
    pub podcast_max_llm_tokens: Option<i32>,
    pub podcast_max_tts_characters: Option<i32>,
    pub podcast_max_estimated_cost_usd: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestApiConnectionDto {
    pub config_id: Option<String>,
    pub provider: String,
    pub auth_mode: String,
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchProviderModelsDto {
    pub provider: String,
    pub api_key: String,
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEmbeddingProfileDto {
    pub provider: String,
    pub model: String,
    pub dimensions: i32,
    pub distance_metric: Option<String>,
    pub is_active: bool,
    pub revision: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiConnectionTestResultDto {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCapabilitiesDto {
    pub vision: bool,
    pub function_calling: bool,
    pub max_context: i32,
    pub streaming: bool,
    pub json_mode: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfoDto {
    pub id: String,
    pub display_name: String,
    pub source: String,
    pub capabilities: ModelCapabilitiesDto,
    pub is_recommended: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowAssignmentDto {
    pub workflow_type: String,
    pub api_config_id: String,
    pub assigned_at: String,
    pub updated_at: String,
    pub api_config: Option<ApiConfigDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetWorkflowAssignmentDto {
    pub workflow_type: String,
    pub api_config_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderBudgetUsageDto {
    pub id: String,
    pub api_config_id: String,
    pub period: String,
    pub estimated_cost_usd: f64,
    pub workflow_runs_count: i32,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordWorkflowCostDto {
    pub api_config_id: String,
    pub estimated_cost_usd: f64,
}

impl From<ProviderBudgetUsage> for ProviderBudgetUsageDto {
    fn from(value: ProviderBudgetUsage) -> Self {
        Self {
            id: value.id,
            api_config_id: value.api_config_id,
            period: value.period,
            estimated_cost_usd: value.estimated_cost_usd,
            workflow_runs_count: value.workflow_runs_count,
            updated_at: value.updated_at,
        }
    }
}

fn normalize_provider(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "openai_compatible" | "custom" | "qianfan" => "custom_openai".to_string(),
        other => other.to_string(),
    }
}

fn default_test_model_for_provider(provider: &str) -> &'static str {
    match provider {
        "anthropic" | "custom_anthropic" => "claude-3-5-haiku-20241022",
        "google" | "custom_google" => "gemini-2.0-flash",
        "deepseek" => "deepseek-chat",
        _ => "gpt-4o-mini",
    }
}

fn default_base_url_for_provider(provider: &str) -> Option<&'static str> {
    match provider {
        "openai" => Some("https://api.openai.com/v1"),
        "deepseek" => Some("https://api.deepseek.com/v1"),
        "anthropic" => Some("https://api.anthropic.com/v1"),
        "google" | "custom_google" => Some("https://generativelanguage.googleapis.com/v1beta"),
        _ => None,
    }
}

fn infer_model_capabilities(model_id: &str) -> ModelCapabilitiesDto {
    let lower = model_id.to_lowercase();
    let max_context = if lower.contains("gemini") {
        1_048_576
    } else if lower.contains("claude") {
        200_000
    } else if lower.contains("o1") {
        200_000
    } else if lower.contains("gpt-4") || lower.contains("deepseek") {
        128_000
    } else {
        65_536
    };

    let json_mode = !lower.contains("haiku") && !lower.contains("reasoner");
    let vision = lower.contains("vision")
        || lower.contains("gpt-4")
        || lower.contains("gemini")
        || lower.contains("claude")
        || lower.contains("deepseek-chat");

    ModelCapabilitiesDto {
        vision,
        function_calling: !lower.contains("reasoner"),
        max_context,
        streaming: true,
        json_mode,
    }
}

fn preset_models_for_provider(provider: &str) -> Vec<ModelInfoDto> {
    match provider {
        "openai" | "custom_openai" => vec![
            ModelInfoDto {
                id: "gpt-4o".to_string(),
                display_name: "GPT-4o".to_string(),
                source: "preset".to_string(),
                capabilities: infer_model_capabilities("gpt-4o"),
                is_recommended: true,
            },
            ModelInfoDto {
                id: "gpt-4o-mini".to_string(),
                display_name: "GPT-4o Mini".to_string(),
                source: "preset".to_string(),
                capabilities: infer_model_capabilities("gpt-4o-mini"),
                is_recommended: true,
            },
            ModelInfoDto {
                id: "o1".to_string(),
                display_name: "OpenAI o1".to_string(),
                source: "preset".to_string(),
                capabilities: infer_model_capabilities("o1"),
                is_recommended: false,
            },
        ],
        "anthropic" | "custom_anthropic" => vec![
            ModelInfoDto {
                id: "claude-sonnet-4-20250514".to_string(),
                display_name: "Claude Sonnet 4".to_string(),
                source: "preset".to_string(),
                capabilities: infer_model_capabilities("claude-sonnet-4-20250514"),
                is_recommended: true,
            },
            ModelInfoDto {
                id: "claude-3-5-haiku-20241022".to_string(),
                display_name: "Claude 3.5 Haiku".to_string(),
                source: "preset".to_string(),
                capabilities: infer_model_capabilities("claude-3-5-haiku-20241022"),
                is_recommended: true,
            },
        ],
        "google" | "custom_google" => vec![
            ModelInfoDto {
                id: "gemini-2.5-pro".to_string(),
                display_name: "Gemini 2.5 Pro".to_string(),
                source: "preset".to_string(),
                capabilities: infer_model_capabilities("gemini-2.5-pro"),
                is_recommended: true,
            },
            ModelInfoDto {
                id: "gemini-2.0-flash".to_string(),
                display_name: "Gemini 2.0 Flash".to_string(),
                source: "preset".to_string(),
                capabilities: infer_model_capabilities("gemini-2.0-flash"),
                is_recommended: true,
            },
        ],
        "deepseek" => vec![
            ModelInfoDto {
                id: "deepseek-chat".to_string(),
                display_name: "DeepSeek Chat".to_string(),
                source: "preset".to_string(),
                capabilities: infer_model_capabilities("deepseek-chat"),
                is_recommended: true,
            },
            ModelInfoDto {
                id: "deepseek-reasoner".to_string(),
                display_name: "DeepSeek Reasoner".to_string(),
                source: "preset".to_string(),
                capabilities: infer_model_capabilities("deepseek-reasoner"),
                is_recommended: false,
            },
        ],
        _ => Vec::new(),
    }
}

fn merge_provider_models(preset: Vec<ModelInfoDto>, fetched: Vec<ModelInfoDto>) -> Vec<ModelInfoDto> {
    let mut models = BTreeMap::new();

    for model in preset {
        models.insert(model.id.clone(), model);
    }

    for model in fetched {
        match models.get_mut(&model.id) {
            Some(existing) => {
                if existing.display_name == existing.id && model.display_name != model.id {
                    existing.display_name = model.display_name;
                }
            }
            None => {
                models.insert(model.id.clone(), model);
            }
        }
    }

    let mut items = models.into_values().collect::<Vec<_>>();
    items.sort_by(|left, right| {
        right
            .is_recommended
            .cmp(&left.is_recommended)
            .then_with(|| left.display_name.cmp(&right.display_name))
    });
    items
}

fn parse_openai_models(payload: serde_json::Value) -> Vec<ModelInfoDto> {
    payload
        .get("data")
        .and_then(|value| value.as_array())
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let id = item.get("id")?.as_str()?.trim();
            if id.is_empty() {
                return None;
            }

            Some(ModelInfoDto {
                id: id.to_string(),
                display_name: id.to_string(),
                source: "fetched".to_string(),
                capabilities: infer_model_capabilities(id),
                is_recommended: false,
            })
        })
        .collect()
}

fn parse_google_models(payload: serde_json::Value) -> Vec<ModelInfoDto> {
    payload
        .get("models")
        .and_then(|value| value.as_array())
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let raw_name = item.get("name")?.as_str()?.trim();
            if raw_name.is_empty() {
                return None;
            }

            let id = raw_name.rsplit('/').next().unwrap_or(raw_name).trim();
            if id.is_empty() {
                return None;
            }

            let display_name = item
                .get("displayName")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or(id)
                .to_string();
            let max_context = item
                .get("inputTokenLimit")
                .and_then(|value| value.as_i64())
                .and_then(|value| i32::try_from(value).ok())
                .unwrap_or(1_048_576);
            let supports_streaming = item
                .get("supportedGenerationMethods")
                .and_then(|value| value.as_array())
                .map(|methods| {
                    methods.iter().any(|method| {
                        method
                            .as_str()
                            .map(|value| value.contains("stream"))
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(true);

            Some(ModelInfoDto {
                id: id.to_string(),
                display_name,
                source: "fetched".to_string(),
                capabilities: ModelCapabilitiesDto {
                    max_context,
                    streaming: supports_streaming,
                    ..infer_model_capabilities(id)
                },
                is_recommended: false,
            })
        })
        .collect()
}

fn validate_workflow_type(workflow_type: &str) -> CommandResult<()> {
    if WORKFLOW_TYPES.contains(&workflow_type) {
        Ok(())
    } else {
        Err(CommandError::InvalidInput(format!(
            "未知工作流类型: {workflow_type}"
        )))
    }
}

fn workflow_assignment_to_dto(
    assignment: WorkflowModelAssignment,
    config: Option<ApiConfig>,
) -> WorkflowAssignmentDto {
    WorkflowAssignmentDto {
        workflow_type: assignment.workflow_type,
        api_config_id: assignment.api_config_id,
        assigned_at: assignment.assigned_at,
        updated_at: assignment.updated_at,
        api_config: config.map(api_config_to_dto),
    }
}

fn validate_assignment_target(state: &AppState, api_config_id: &str) -> CommandResult<()> {
    let config = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        repo.get_api_config(api_config_id)?
            .ok_or(CommandError::NotFound)?
    };

    if !config.is_enabled {
        return Err(CommandError::InvalidInput("该供应商配置已禁用".to_string()));
    }

    let secrets = state.lock_secrets()?;
    if config.auth_mode != "adc" && !secrets.has_api_key(api_config_id)? {
        return Err(CommandError::InvalidInput(
            "该供应商配置未存储 API Key".to_string(),
        ));
    }

    Ok(())
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
        podcast_tts_provider: data.podcast_tts_provider,
        podcast_openai_model: data.podcast_openai_model,
        podcast_fish_audio_endpoint: data.podcast_fish_audio_endpoint,
        podcast_voice_overrides: data.podcast_voice_overrides,
        podcast_output_format: data.podcast_output_format,
        podcast_skip_review: data.podcast_skip_review,
        podcast_max_llm_tokens: data.podcast_max_llm_tokens,
        podcast_max_tts_characters: data.podcast_max_tts_characters,
        podcast_max_estimated_cost_usd: data.podcast_max_estimated_cost_usd,
    })?;
    Ok(settings.into())
}

#[tauri::command]
pub fn list_api_configs(state: State<'_, AppState>) -> CommandResult<Vec<ApiConfigDto>> {
    let start = std::time::Instant::now();
    let configs = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        repo.list_api_configs()?
    };
    let config_count = configs.len();
    let result: Vec<ApiConfigDto> = configs.into_iter().map(api_config_to_dto).collect();

    log::info!(
        "[Perf][BYOK] list_api_configs finished: count={}, duration_ms={:.2}",
        config_count,
        start.elapsed().as_secs_f64() * 1000.0
    );

    Ok(result)
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

    Ok(Some(api_config_to_dto(config)))
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
            display_name: data.display_name,
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
            display_name: data.display_name,
        };

        repo.update_api_config(&id, req)?
            .ok_or(CommandError::NotFound)?
    };
    Ok(api_config_to_dto(config))
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
pub fn delete_api_config(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<()> {
    let total_start = std::time::Instant::now();
    let db_start = std::time::Instant::now();

    {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        repo.delete_api_config(&id)?;
    }

    let db_ms = db_start.elapsed().as_secs_f64() * 1000.0;
    spawn_delete_api_config_secret_cleanup(app_handle, id.clone());

    log::info!(
        "[Perf][BYOK] delete_api_config response: config_id={}, delete_api_config.db_ms={:.2}, delete_api_config.total_response_ms={:.2}",
        id,
        db_ms,
        total_start.elapsed().as_secs_f64() * 1000.0
    );

    Ok(())
}

#[tauri::command]
pub fn delete_api_key(state: State<'_, AppState>, config_id: String) -> CommandResult<()> {
    let start = std::time::Instant::now();
    {
        let secrets = state.lock_secrets()?;
        secrets.delete_api_key(&config_id)?;
    }

    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    repo.update_api_key_status(&config_id, "none", None)?;

    log::info!(
        "[Perf][BYOK] delete_api_key finished: config_id={}, duration_ms={:.2}",
        config_id,
        start.elapsed().as_secs_f64() * 1000.0
    );
    Ok(())
}

fn spawn_delete_api_config_secret_cleanup(app_handle: AppHandle, config_id: String) {
    tauri::async_runtime::spawn(async move {
        let cleanup_start = std::time::Instant::now();
        let state = app_handle.state::<AppState>();

        let secrets_wait_start = std::time::Instant::now();
        let secrets = match state.lock_secrets() {
            Ok(secrets) => secrets,
            Err(error) => {
                log::warn!(
                    "[Perf][BYOK] delete_api_config secret cleanup failed to lock secrets: config_id={}, delete_api_config.secret_wait_ms={:.2}, error={}",
                    config_id,
                    secrets_wait_start.elapsed().as_secs_f64() * 1000.0,
                    error
                );
                return;
            }
        };
        let secret_wait_ms = secrets_wait_start.elapsed().as_secs_f64() * 1000.0;

        let secret_delete_start = std::time::Instant::now();
        match secrets.delete_api_key(&config_id) {
            Ok(()) => {
                let secret_delete_ms = secret_delete_start.elapsed().as_secs_f64() * 1000.0;
                log::info!(
                    "[Perf][BYOK] delete_api_config secret cleanup completed: config_id={}, delete_api_config.secret_wait_ms={:.2}, delete_api_config.secret_delete_ms={:.2}, background_total_ms={:.2}",
                    config_id,
                    secret_wait_ms,
                    secret_delete_ms,
                    cleanup_start.elapsed().as_secs_f64() * 1000.0
                );
            }
            Err(error) => {
                let secret_delete_ms = secret_delete_start.elapsed().as_secs_f64() * 1000.0;
                log::warn!(
                    "[Perf][BYOK] delete_api_config secret cleanup failed: config_id={}, delete_api_config.secret_wait_ms={:.2}, delete_api_config.secret_delete_ms={:.2}, error={}",
                    config_id,
                    secret_wait_ms,
                    secret_delete_ms,
                    error
                );
            }
        }
    });
}

#[tauri::command]
pub fn store_api_key(state: State<'_, AppState>, data: StoreApiKeyDto) -> CommandResult<()> {
    {
        let secrets = state.lock_secrets()?;
        secrets.store_api_key(&data.config_id, &data.api_key)?;
    }

    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    repo.update_api_key_status(&data.config_id, "stored", None)?;
    Ok(())
}

#[tauri::command]
pub async fn test_api_connection(
    state: State<'_, AppState>,
    data: TestApiConnectionDto,
) -> CommandResult<ApiConnectionTestResultDto> {
    let provider = normalize_provider(&data.provider);
    let auth_mode = data.auth_mode.as_str();
    let trimmed_api_key = data.api_key.trim().to_string();
    let normalized_base_url = data
        .base_url
        .as_ref()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty());
    let model = data
        .model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| default_test_model_for_provider(&provider));

    if auth_mode == "adc" {
        return Ok(ApiConnectionTestResultDto {
            success: false,
            message: match provider.as_str() {
                "google" | "custom_google" => "Google ADC 模式的配置契约已接通，但本地宿主的实际 ADC 探测尚未在本轮实现。".to_string(),
                _ => format!("provider \"{}\" 暂不支持 authMode=adc", provider),
            },
        });
    }

    if trimmed_api_key.is_empty() {
        return Ok(ApiConnectionTestResultDto {
            success: false,
            message: "缺少 API Key。".to_string(),
        });
    }

    let start = std::time::Instant::now();
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return Ok(ApiConnectionTestResultDto {
                success: false,
                message: format!("无法创建 HTTP 客户端: {e}"),
            });
        }
    };

    let response = match provider.as_str() {
        "openai" | "deepseek" | "custom_openai" => {
            let Some(base_url) = normalized_base_url
                .clone()
                .or_else(|| default_base_url_for_provider(&provider).map(str::to_string))
            else {
                return Ok(ApiConnectionTestResultDto {
                    success: false,
                    message: "该供应商需要提供 Base URL。".to_string(),
                });
            };

            client
                .post(format!("{base_url}/chat/completions"))
                .header("Authorization", format!("Bearer {trimmed_api_key}"))
                .json(&serde_json::json!({
                    "model": model,
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 1,
                }))
                .send()
                .await
        }
        "anthropic" | "custom_anthropic" => {
            let Some(base_url) = normalized_base_url
                .clone()
                .or_else(|| default_base_url_for_provider(&provider).map(str::to_string))
            else {
                return Ok(ApiConnectionTestResultDto {
                    success: false,
                    message: "该供应商需要提供 Base URL。".to_string(),
                });
            };

            client
                .post(format!("{base_url}/messages"))
                .header("x-api-key", &trimmed_api_key)
                .header("anthropic-version", "2023-06-01")
                .json(&serde_json::json!({
                    "model": model,
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 1,
                }))
                .send()
                .await
        }
        "google" | "custom_google" => {
            let Some(base_url) = normalized_base_url
                .clone()
                .or_else(|| default_base_url_for_provider(&provider).map(str::to_string))
            else {
                return Ok(ApiConnectionTestResultDto {
                    success: false,
                    message: "该供应商需要提供 Base URL。".to_string(),
                });
            };

            client
                .get(format!("{base_url}/models?key={trimmed_api_key}"))
                .send()
                .await
        }
        other => {
            return Ok(ApiConnectionTestResultDto {
                success: false,
                message: format!("暂不支持 provider \"{other}\" 的自动连接校验"),
            });
        }
    };

    let outcome = match response {
        Ok(response) => {
            let elapsed_ms = start.elapsed().as_millis();
            let status = response.status();
            if status.is_success() || status.as_u16() == 200 {
                let result = ApiConnectionTestResultDto {
                    success: true,
                    message: format!("连接成功！响应耗时 {elapsed_ms}ms。"),
                };
                (Some(("verified".to_string(), Some(chrono::Utc::now().to_rfc3339()))), result)
            } else if status.as_u16() == 401 || status.as_u16() == 403 {
                let result = ApiConnectionTestResultDto {
                    success: false,
                    message: format!("认证失败 (HTTP {status})。请检查 API Key 是否正确。"),
                };
                (Some(("invalid".to_string(), None)), result)
            } else {
                let body_text = response.text().await.unwrap_or_default();
                let detail = if body_text.len() > 200 {
                    body_text[..200].to_string()
                } else {
                    body_text
                };
                let result = ApiConnectionTestResultDto {
                    success: false,
                    message: format!("服务端返回 HTTP {status}: {detail}"),
                };
                (None, result)
            }
        }
        Err(e) => {
            if e.is_timeout() {
                (None, ApiConnectionTestResultDto {
                    success: false,
                    message: "连接超时（15秒）。请检查网络或 Base URL 是否正确。".to_string(),
                })
            } else if e.is_connect() {
                (None, ApiConnectionTestResultDto {
                    success: false,
                    message: format!("无法连接到服务器: {e}"),
                })
            } else {
                (None, ApiConnectionTestResultDto {
                    success: false,
                    message: format!("请求失败: {e}"),
                })
            }
        }
    };

    if let (Some(config_id), Some((key_status, key_verified_at))) = (
        data.config_id.as_deref(),
        outcome.0.as_ref(),
    ) {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        repo.update_api_key_status(config_id, key_status, key_verified_at.as_deref())?;
    }

    Ok(outcome.1)
}

#[tauri::command]
pub async fn fetch_provider_models(
    data: FetchProviderModelsDto,
) -> CommandResult<Vec<ModelInfoDto>> {
    let provider = normalize_provider(&data.provider);
    let api_key = data.api_key.trim();
    if api_key.is_empty() {
        return Err(CommandError::InvalidInput("缺少 API Key。".to_string()));
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| CommandError::Internal(format!("无法创建 HTTP 客户端: {error}")))?;

    let normalized_base_url = data
        .base_url
        .as_deref()
        .map(str::trim)
        .map(|value| value.trim_end_matches('/'))
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    let fetched = match provider.as_str() {
        "openai" | "deepseek" | "custom_openai" => {
            let Some(base_url) = normalized_base_url
                .clone()
                .or_else(|| default_base_url_for_provider(&provider).map(str::to_string))
            else {
                return Err(CommandError::InvalidInput("该供应商需要提供 Base URL。".to_string()));
            };
            let response = client
                .get(format!("{base_url}/models"))
                .header("Authorization", format!("Bearer {api_key}"))
                .send()
                .await
                .map_err(|error| CommandError::InvalidInput(format!("无法拉取模型列表: {error}")))?;

            if !response.status().is_success() {
                return Err(CommandError::InvalidInput(format!(
                    "模型接口返回 HTTP {}",
                    response.status()
                )));
            }

            let payload = response
                .json::<serde_json::Value>()
                .await
                .map_err(|error| CommandError::InvalidInput(format!("无法解析模型列表: {error}")))?;
            parse_openai_models(payload)
        }
        "google" | "custom_google" => {
            let Some(base_url) = normalized_base_url
                .clone()
                .or_else(|| default_base_url_for_provider(&provider).map(str::to_string))
            else {
                return Err(CommandError::InvalidInput("该供应商需要提供 Base URL。".to_string()));
            };
            let response = client
                .get(format!("{base_url}/models?key={api_key}"))
                .send()
                .await
                .map_err(|error| CommandError::InvalidInput(format!("无法拉取模型列表: {error}")))?;

            if !response.status().is_success() {
                return Err(CommandError::InvalidInput(format!(
                    "模型接口返回 HTTP {}",
                    response.status()
                )));
            }

            let payload = response
                .json::<serde_json::Value>()
                .await
                .map_err(|error| CommandError::InvalidInput(format!("无法解析模型列表: {error}")))?;
            parse_google_models(payload)
        }
        "anthropic" | "custom_anthropic" => Vec::new(),
        _ => Vec::new(),
    };

    Ok(merge_provider_models(
        preset_models_for_provider(&provider),
        fetched,
    ))
}

#[tauri::command]
pub fn list_workflow_assignments(
    state: State<'_, AppState>,
) -> CommandResult<Vec<WorkflowAssignmentDto>> {
    let (assignments, configs) = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        let assignments = repo.list_workflow_assignments()?;
        let configs = repo
            .list_api_configs()?
            .into_iter()
            .map(|config| (config.id.clone(), config))
            .collect::<BTreeMap<_, _>>();
        (assignments, configs)
    };
    Ok(assignments
        .into_iter()
        .map(|assignment| {
            workflow_assignment_to_dto(
                assignment.clone(),
                configs.get(&assignment.api_config_id).cloned(),
            )
        })
        .collect())
}

#[tauri::command]
pub fn get_workflow_assignment(
    state: State<'_, AppState>,
    workflow_type: String,
) -> CommandResult<Option<WorkflowAssignmentDto>> {
    validate_workflow_type(&workflow_type)?;

    let (assignment, config) = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        let assignment = repo.get_workflow_assignment(&workflow_type)?;
        let config = match assignment.as_ref() {
            Some(value) => repo.get_api_config(&value.api_config_id)?,
            None => None,
        };
        (assignment, config)
    };

    let Some(assignment) = assignment else {
        return Ok(None);
    };

    Ok(Some(workflow_assignment_to_dto(assignment, config)))
}

#[tauri::command]
pub fn set_workflow_assignment(
    state: State<'_, AppState>,
    data: SetWorkflowAssignmentDto,
) -> CommandResult<WorkflowAssignmentDto> {
    validate_workflow_type(&data.workflow_type)?;
    validate_assignment_target(&state, &data.api_config_id)?;

    let assignment = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        repo.upsert_workflow_assignment(&data.workflow_type, &data.api_config_id)?
    };

    let config = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        repo.get_api_config(&data.api_config_id)?
    };
    Ok(workflow_assignment_to_dto(assignment, config))
}

#[tauri::command]
pub fn set_all_workflow_assignments(
    state: State<'_, AppState>,
    api_config_id: String,
) -> CommandResult<Vec<WorkflowAssignmentDto>> {
    validate_assignment_target(&state, &api_config_id)?;

    let assignments = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        WORKFLOW_TYPES
            .iter()
            .map(|workflow_type| repo.upsert_workflow_assignment(workflow_type, &api_config_id))
            .collect::<Result<Vec<_>, _>>()?
    };
    let config = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        repo.get_api_config(&api_config_id)?
    };
    Ok(assignments
        .into_iter()
        .map(|assignment| workflow_assignment_to_dto(assignment, config.clone()))
        .collect())
}

#[tauri::command]
pub fn delete_workflow_assignment(
    state: State<'_, AppState>,
    workflow_type: String,
) -> CommandResult<()> {
    validate_workflow_type(&workflow_type)?;

    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    repo.delete_workflow_assignment(&workflow_type)?;
    Ok(())
}

#[tauri::command]
pub fn get_provider_budget_usage(
    state: State<'_, AppState>,
    api_config_id: String,
    period: Option<String>,
) -> CommandResult<Option<ProviderBudgetUsageDto>> {
    let resolved_period = period.unwrap_or_else(|| chrono::Utc::now().format("%Y-%m").to_string());
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    Ok(repo
        .get_budget_usage(&api_config_id, &resolved_period)?
        .map(Into::into))
}

#[tauri::command]
pub fn reset_provider_budget_usage(
    state: State<'_, AppState>,
    api_config_id: String,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    repo.reset_budget_usage(&api_config_id)?;
    Ok(())
}

#[tauri::command]
pub fn record_workflow_cost(
    state: State<'_, AppState>,
    data: RecordWorkflowCostDto,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    repo.increment_budget_usage(&data.api_config_id, data.estimated_cost_usd)?;
    Ok(())
}

#[tauri::command]
pub fn list_embedding_profiles(
    state: State<'_, AppState>,
) -> CommandResult<Vec<EmbeddingProfileDto>> {
    let db = state.lock_db()?;
    let repo = VectorRepository::new(&db);
    let profiles = repo.list_embedding_profiles()?;
    Ok(profiles.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn get_active_embedding_profile(
    state: State<'_, AppState>,
) -> CommandResult<Option<EmbeddingProfileDto>> {
    let db = state.lock_db()?;
    let repo = VectorRepository::new(&db);
    let profile = repo.get_active_embedding_profile()?;
    Ok(profile.map(Into::into))
}

#[tauri::command]
pub fn create_embedding_profile(
    state: State<'_, AppState>,
    data: CreateEmbeddingProfileDto,
) -> CommandResult<EmbeddingProfileDto> {
    let db = state.lock_db()?;
    let repo = VectorRepository::new(&db);
    let profile = repo.create_embedding_profile(CreateEmbeddingProfileRequest {
        provider: data.provider,
        model: data.model,
        dimensions: data.dimensions,
        distance_metric: data.distance_metric,
        is_active: data.is_active,
        revision: data.revision,
    })?;

    if profile.is_active {
        repo.mark_documents_embedding_stale()?;
    }

    Ok(profile.into())
}

#[tauri::command]
pub fn set_active_embedding_profile(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<EmbeddingProfileDto> {
    let db = state.lock_db()?;
    let repo = VectorRepository::new(&db);
    let profile = repo
        .set_active_embedding_profile(&id)?
        .ok_or(CommandError::NotFound)?;
    repo.mark_documents_embedding_stale()?;
    Ok(profile.into())
}
