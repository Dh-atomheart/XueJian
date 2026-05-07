use std::{
    collections::BTreeMap,
    env, fs,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::secrets::SecretError;
use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        ApiConfig, AppSettings, CreateApiConfigRequest, CreateEmbeddingProfileRequest,
        CreateModelProfileRequest, EmbeddingProfile, ModelProfile, ProviderBudgetUsage,
        SettingsRepository, UpdateApiConfigRequest, UpdateModelProfileRequest, VectorRepository,
        WorkflowModelAssignment,
    },
};

const WORKFLOW_TYPES: [&str; 3] = ["card_generation", "document_embedding", "knowledge_qa"];

const ANTHROPIC_VERSION_HEADER: &str = "2023-06-01";
const TEST_API_CONNECTION_TOTAL_TIMEOUT: Duration = Duration::from_secs(20);
const TEST_API_CONNECTION_SECRET_TIMEOUT: Duration = Duration::from_secs(20);
const TEST_API_CONNECTION_HTTP_TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Debug, Clone, Serialize)]
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfileDto {
    pub id: String,
    pub api_config_id: String,
    pub model_id: String,
    pub display_name: Option<String>,
    pub capabilities_json: Option<String>,
    pub is_enabled: bool,
    pub is_default_for_connection: bool,
    pub created_at: String,
    pub updated_at: String,
    pub api_config: Option<ApiConfigDto>,
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

fn model_profile_to_dto(profile: ModelProfile, config: Option<ApiConfigDto>) -> ModelProfileDto {
    ModelProfileDto {
        id: profile.id,
        api_config_id: profile.api_config_id,
        model_id: profile.model_id,
        display_name: profile.display_name,
        capabilities_json: profile.capabilities_json,
        is_enabled: profile.is_enabled,
        is_default_for_connection: profile.is_default_for_connection,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        api_config: config,
    }
}

fn model_profile_to_dto_with_db_key_status(
    profile: ModelProfile,
    config: Option<ApiConfig>,
) -> ModelProfileDto {
    model_profile_to_dto(profile, config.map(api_config_to_dto))
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
    pub learning_goal: String,
    pub daily_study_minutes: i32,
    pub study_time_preference: String,
    pub study_time_preferences: Vec<String>,
    pub study_content_preferences: Vec<String>,
    pub content_difficulty_preference: String,
    pub podcast_tts_provider: String,
    pub podcast_openai_model: String,
    pub podcast_google_tts_model: String,
    pub podcast_fish_audio_endpoint: Option<String>,
    pub podcast_voice_overrides: std::collections::BTreeMap<String, String>,
    pub default_voice: String,
    pub speech_rate: f64,
    pub speech_pitch: f64,
    pub speech_volume: f64,
    pub reading_mode: String,
    pub default_podcast_style: String,
    pub podcast_episode_duration_minutes: i32,
    pub podcast_content_structure: String,
    pub podcast_background_music: String,
    pub podcast_intro_outro_enabled: bool,
    pub voice_input_language: String,
    pub voice_interrupt_enabled: bool,
    pub podcast_auto_play_next_episode: bool,
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
            learning_goal: settings.learning_goal,
            daily_study_minutes: settings.daily_study_minutes,
            study_time_preference: settings.study_time_preference,
            study_time_preferences: settings.study_time_preferences,
            study_content_preferences: settings.study_content_preferences,
            content_difficulty_preference: settings.content_difficulty_preference,
            podcast_tts_provider: settings.podcast_tts_provider,
            podcast_openai_model: settings.podcast_openai_model,
            podcast_google_tts_model: settings.podcast_google_tts_model,
            podcast_fish_audio_endpoint: settings.podcast_fish_audio_endpoint,
            podcast_voice_overrides: settings.podcast_voice_overrides,
            default_voice: settings.default_voice,
            speech_rate: settings.speech_rate,
            speech_pitch: settings.speech_pitch,
            speech_volume: settings.speech_volume,
            reading_mode: settings.reading_mode,
            default_podcast_style: settings.default_podcast_style,
            podcast_episode_duration_minutes: settings.podcast_episode_duration_minutes,
            podcast_content_structure: settings.podcast_content_structure,
            podcast_background_music: settings.podcast_background_music,
            podcast_intro_outro_enabled: settings.podcast_intro_outro_enabled,
            voice_input_language: settings.voice_input_language,
            voice_interrupt_enabled: settings.voice_interrupt_enabled,
            podcast_auto_play_next_episode: settings.podcast_auto_play_next_episode,
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
    pub learning_goal: Option<String>,
    pub daily_study_minutes: Option<i32>,
    pub study_time_preference: Option<String>,
    pub study_time_preferences: Option<Vec<String>>,
    pub study_content_preferences: Option<Vec<String>>,
    pub content_difficulty_preference: Option<String>,
    pub podcast_tts_provider: Option<String>,
    pub podcast_openai_model: Option<String>,
    pub podcast_google_tts_model: Option<String>,
    pub podcast_fish_audio_endpoint: Option<Option<String>>,
    pub podcast_voice_overrides: Option<std::collections::BTreeMap<String, String>>,
    pub default_voice: Option<String>,
    pub speech_rate: Option<f64>,
    pub speech_pitch: Option<f64>,
    pub speech_volume: Option<f64>,
    pub reading_mode: Option<String>,
    pub default_podcast_style: Option<String>,
    pub podcast_episode_duration_minutes: Option<i32>,
    pub podcast_content_structure: Option<String>,
    pub podcast_background_music: Option<String>,
    pub podcast_intro_outro_enabled: Option<bool>,
    pub voice_input_language: Option<String>,
    pub voice_interrupt_enabled: Option<bool>,
    pub podcast_auto_play_next_episode: Option<bool>,
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
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    #[allow(dead_code)]
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretVaultStatusDto {
    pub status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockSecretVaultDto {
    pub password: String,
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
    pub model_profile_id: String,
    pub assigned_at: String,
    pub updated_at: String,
    pub model_profile: Option<ModelProfileDto>,
    pub api_config: Option<ApiConfigDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetWorkflowAssignmentDto {
    pub workflow_type: String,
    pub model_profile_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateModelProfileDto {
    pub api_config_id: String,
    pub model_id: String,
    pub display_name: Option<String>,
    pub capabilities_json: Option<String>,
    pub is_enabled: Option<bool>,
    pub is_default_for_connection: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateModelProfileDto {
    pub model_id: Option<String>,
    pub display_name: Option<String>,
    pub capabilities_json: Option<Option<String>>,
    pub is_enabled: Option<bool>,
    pub is_default_for_connection: Option<bool>,
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

fn default_base_url_for_provider(provider: &str) -> Option<&'static str> {
    match provider {
        "openai" => Some("https://api.openai.com/v1"),
        "deepseek" => Some("https://api.deepseek.com/v1"),
        "anthropic" => Some("https://api.anthropic.com/v1"),
        "google" | "custom_google" => Some("https://generativelanguage.googleapis.com/v1beta"),
        _ => None,
    }
}

fn provider_test_strategy(provider: &str) -> &'static str {
    match provider {
        "anthropic" | "custom_anthropic" => "lightweight",
        "openai" | "deepseek" | "custom_openai" | "google" | "custom_google" => "lightweight",
        _ => "unsupported",
    }
}

fn success_message_for_provider(provider: &str, elapsed_ms: u128) -> String {
    if matches!(provider, "google" | "custom_google") {
        return format!("Gemini API key verified in {elapsed_ms}ms.");
    }

    match provider_test_strategy(provider) {
        "lightweight" => format!("Credential validation succeeded in {elapsed_ms}ms."),
        "full" => format!("Connection test succeeded in {elapsed_ms}ms."),
        _ => format!("Connection test succeeded in {elapsed_ms}ms."),
    }
}

fn truncate_response_detail(detail: String) -> String {
    if detail.len() > 200 {
        detail[..200].to_string()
    } else {
        detail
    }
}

fn redact_secret_from_message(message: &str, secret: &str) -> String {
    if secret.is_empty() {
        return message.to_string();
    }
    message.replace(secret, "[REDACTED]")
}

fn google_adc_default_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(appdata) = env::var_os("APPDATA") {
        paths.push(
            PathBuf::from(appdata)
                .join("gcloud")
                .join("application_default_credentials.json"),
        );
    }

    if let Some(home) = env::var_os("HOME") {
        let home = PathBuf::from(home);
        paths.push(
            home.join(".config")
                .join("gcloud")
                .join("application_default_credentials.json"),
        );
        paths.push(
            home.join("Library")
                .join("Application Support")
                .join("gcloud")
                .join("application_default_credentials.json"),
        );
    }

    paths
}

fn validate_google_adc_payload(path: &Path) -> Result<String, String> {
    let raw = fs::read_to_string(path).map_err(|error| {
        format!(
            "Unable to read ADC credentials file {}: {error}",
            path.display()
        )
    })?;
    let payload = serde_json::from_str::<serde_json::Value>(&raw)
        .map_err(|error| format!("ADC credentials file is not valid JSON: {error}"))?;

    let cred_type = payload
        .get("type")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .unwrap_or("");

    match cred_type {
        "service_account" => {
            let has_private_key = payload
                .get("private_key")
                .and_then(|value| value.as_str())
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false);
            let has_client_email = payload
                .get("client_email")
                .and_then(|value| value.as_str())
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false);

            if has_private_key && has_client_email {
                Ok("Detected service_account ADC credentials".to_string())
            } else {
                Err("ADC service_account file is missing private_key or client_email".to_string())
            }
        }
        "authorized_user" => {
            let has_client_id = payload
                .get("client_id")
                .and_then(|value| value.as_str())
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false);
            let has_client_secret = payload
                .get("client_secret")
                .and_then(|value| value.as_str())
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false);
            let has_refresh_token = payload
                .get("refresh_token")
                .and_then(|value| value.as_str())
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false);

            if has_client_id && has_client_secret && has_refresh_token {
                Ok("Detected authorized_user ADC credentials".to_string())
            } else {
                Err("ADC authorized_user file is missing client_id, client_secret, or refresh_token".to_string())
            }
        }
        "" => Err("ADC credentials file is missing the type field".to_string()),
        other => Err(format!("Unsupported ADC credential type: {other}")),
    }
}

fn probe_google_adc_credentials() -> ApiConnectionTestResultDto {
    if let Some(explicit_path) = env::var_os("GOOGLE_APPLICATION_CREDENTIALS") {
        let path = PathBuf::from(explicit_path);
        return match validate_google_adc_payload(&path) {
            Ok(summary) => ApiConnectionTestResultDto {
                success: false,
                message: format!(
                    "{summary} (source: GOOGLE_APPLICATION_CREDENTIALS), but this release only supports local ADC discovery. Remote validation and runtime GA support are not implemented yet."
                ),
            },
            Err(error) => ApiConnectionTestResultDto {
                success: false,
                message: format!("GOOGLE_APPLICATION_CREDENTIALS is set, but the credential is unusable: {error}"),
            },
        };
    }

    for path in google_adc_default_paths() {
        if !path.exists() {
            continue;
        }

        return match validate_google_adc_payload(&path) {
            Ok(summary) => ApiConnectionTestResultDto {
                success: false,
                message: format!(
                    "{summary} (source: {}), but this release only supports local ADC discovery. Remote validation and runtime GA support are not implemented yet.",
                    path.display()
                ),
            },
            Err(error) => ApiConnectionTestResultDto {
                success: false,
                message: format!("Detected a default ADC file, but it is unusable: {error}"),
            },
        };
    }

    ApiConnectionTestResultDto {
        success: false,
        message: "No usable Google ADC credentials were detected. Set GOOGLE_APPLICATION_CREDENTIALS or run gcloud application-default login first.".to_string(),
    }
}

fn infer_model_capabilities(model_id: &str) -> ModelCapabilitiesDto {
    let lower = model_id.to_lowercase();
    let is_embedding = lower.contains("embedding") || lower.contains("embed");
    let is_tts = lower.contains("-tts");
    let max_context = if is_embedding {
        8_192
    } else if lower.contains("gemini") {
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

    let json_mode =
        !is_embedding && !is_tts && !lower.contains("haiku") && !lower.contains("reasoner");
    let vision = !is_embedding
        && !is_tts
        && (lower.contains("vision")
            || lower.contains("gpt-4")
            || lower.contains("gemini")
            || lower.contains("claude")
            || lower.contains("deepseek-chat"));

    ModelCapabilitiesDto {
        vision,
        function_calling: !is_embedding && !is_tts && !lower.contains("reasoner"),
        max_context,
        streaming: !is_embedding,
        json_mode,
    }
}

fn parse_capability_tokens(capabilities_json: Option<&str>) -> Vec<String> {
    let Some(raw) = capabilities_json
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Vec::new();
    };

    let parsed = match serde_json::from_str::<serde_json::Value>(raw) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    match parsed {
        serde_json::Value::Array(items) => items
            .into_iter()
            .filter_map(|item| item.as_str().map(|value| value.trim().to_ascii_lowercase()))
            .filter(|value| !value.is_empty())
            .collect(),
        serde_json::Value::Object(map) => map
            .into_iter()
            .filter_map(|(key, value)| match value {
                serde_json::Value::Bool(true) => Some(key.trim().to_ascii_lowercase()),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn is_embedding_model(profile: &ModelProfile) -> bool {
    let model_id = profile.model_id.trim().to_ascii_lowercase();
    let capability_tokens = parse_capability_tokens(profile.capabilities_json.as_deref());

    capability_tokens.iter().any(|token| {
        token.contains("embedding")
            || token.contains("embed")
            || token == "retrieval"
            || token == "vector"
    }) || model_id.contains("embedding")
        || model_id.contains("embed")
        || model_id.contains("text-embedding")
        || model_id.contains("multilingual-e5")
}

fn is_generation_model(profile: &ModelProfile) -> bool {
    let model_id = profile.model_id.trim().to_ascii_lowercase();
    let capability_tokens = parse_capability_tokens(profile.capabilities_json.as_deref());

    if model_id.contains("-tts") {
        return false;
    }

    if capability_tokens.iter().any(|token| {
        token.contains("chat")
            || token.contains("completion")
            || token.contains("generate")
            || token.contains("reason")
            || token.contains("vision")
    }) {
        return true;
    }

    !is_embedding_model(profile)
}

fn infer_embedding_dimensions(model_id: &str) -> i32 {
    match model_id.trim().to_ascii_lowercase().as_str() {
        "gemini-embedding-001" => 3072,
        "text-embedding-3-large" => 3072,
        "text-embedding-3-small" | "text-embedding-ada-002" => 1536,
        "qwen/qwen3-embedding-8b" => 4096,
        _ => 0,
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
                id: "gemini-2.5-flash".to_string(),
                display_name: "Gemini 2.5 Flash".to_string(),
                source: "preset".to_string(),
                capabilities: infer_model_capabilities("gemini-2.5-flash"),
                is_recommended: false,
            },
            ModelInfoDto {
                id: "gemini-embedding-001".to_string(),
                display_name: "Gemini Embedding 001".to_string(),
                source: "preset".to_string(),
                capabilities: infer_model_capabilities("gemini-embedding-001"),
                is_recommended: false,
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

fn merge_provider_models(
    preset: Vec<ModelInfoDto>,
    fetched: Vec<ModelInfoDto>,
) -> Vec<ModelInfoDto> {
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

fn parse_anthropic_models(payload: serde_json::Value) -> Vec<ModelInfoDto> {
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

            let display_name = item
                .get("display_name")
                .or_else(|| item.get("displayName"))
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or(id)
                .to_string();

            Some(ModelInfoDto {
                id: id.to_string(),
                display_name,
                source: "fetched".to_string(),
                capabilities: infer_model_capabilities(id),
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

fn workflow_assignment_to_dto_with_db_key_status(
    assignment: WorkflowModelAssignment,
    model_profile: Option<ModelProfile>,
    config: Option<ApiConfig>,
) -> WorkflowAssignmentDto {
    let config = config.map(api_config_to_dto);
    let model_profile = model_profile.map(|profile| ModelProfileDto {
        id: profile.id,
        api_config_id: profile.api_config_id,
        model_id: profile.model_id,
        display_name: profile.display_name,
        capabilities_json: profile.capabilities_json,
        is_enabled: profile.is_enabled,
        is_default_for_connection: profile.is_default_for_connection,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        api_config: config.clone(),
    });
    WorkflowAssignmentDto {
        workflow_type: assignment.workflow_type,
        model_profile_id: assignment.model_profile_id,
        assigned_at: assignment.assigned_at,
        updated_at: assignment.updated_at,
        model_profile,
        api_config: config,
    }
}

fn validate_assignment_target(
    state: &AppState,
    workflow_type: &str,
    model_profile_id: &str,
) -> CommandResult<()> {
    let (profile, config) = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        let profile = repo
            .get_model_profile(model_profile_id)?
            .ok_or(CommandError::NotFound)?;
        let config = repo
            .get_api_config(&profile.api_config_id)?
            .ok_or(CommandError::NotFound)?;
        (profile, config)
    };

    if !profile.is_enabled {
        return Err(CommandError::InvalidInput("该模型档案已禁用".to_string()));
    }

    if !config.is_enabled {
        return Err(CommandError::InvalidInput("该连接已禁用".to_string()));
    }

    if config.auth_mode != "adc" && config.key_status == "none" {
        return Err(CommandError::InvalidInput(
            "该连接尚未存储 API Key".to_string(),
        ));
    }

    if workflow_type == "document_embedding" {
        if !is_embedding_model(&profile) {
            return Err(CommandError::InvalidInput(
                "文档向量化只能分配嵌入模型。请为该工作流选择 embedding 模型档案。".to_string(),
            ));
        }
    } else if !is_generation_model(&profile) {
        return Err(CommandError::InvalidInput(
            "该工作流需要可生成内容的模型，不能分配为嵌入专用模型。".to_string(),
        ));
    }

    Ok(())
}

fn resolve_effective_embedding_profile_internal(
    state: &AppState,
) -> CommandResult<Option<EmbeddingProfile>> {
    let db = state.lock_db()?;
    let settings_repo = SettingsRepository::new(&db);
    let Some(assignment) = settings_repo.get_workflow_assignment("document_embedding")? else {
        log::warn!("[EmbeddingProfile] No workflow assignment found for document_embedding");
        return Ok(None);
    };
    let Some(model_profile) = settings_repo.get_model_profile(&assignment.model_profile_id)? else {
        log::warn!(
            "[EmbeddingProfile] Model profile not found: assignment_id={}",
            assignment.model_profile_id
        );
        return Ok(None);
    };
    let Some(api_config) = settings_repo.get_api_config(&model_profile.api_config_id)? else {
        log::warn!(
            "[EmbeddingProfile] API config not found: profile_id={}, api_config_id={}",
            model_profile.id,
            model_profile.api_config_id
        );
        return Ok(None);
    };
    drop(settings_repo);

    if !model_profile.is_enabled || !api_config.is_enabled {
        log::warn!(
            "[EmbeddingProfile] Profile or config disabled: profile_id={}, profile_enabled={}, config_id={}, config_enabled={}",
            model_profile.id,
            model_profile.is_enabled,
            api_config.id,
            api_config.is_enabled
        );
        return Ok(None);
    }

    if api_config.auth_mode != "adc" && api_config.key_status == "none" {
        log::warn!(
            "[EmbeddingProfile] No API key stored: config_id={}, provider={}, model={}",
            api_config.id,
            api_config.provider,
            model_profile.model_id
        );
        return Ok(None);
    }

    if !is_embedding_model(&model_profile) {
        log::warn!(
            "[EmbeddingProfile] Model is not an embedding model: profile_id={}, model_id={}",
            model_profile.id,
            model_profile.model_id
        );
        return Ok(None);
    }

    let vector_repo = VectorRepository::new(&db);
    let previous_active = vector_repo.get_active_embedding_profile()?;
    let (profile, changed) = vector_repo.upsert_embedding_profile_with_id(
        &model_profile.id,
        CreateEmbeddingProfileRequest {
            provider: api_config.provider.clone(),
            model: model_profile.model_id.clone(),
            dimensions: infer_embedding_dimensions(&model_profile.model_id),
            distance_metric: Some("cosine".to_string()),
            is_active: true,
            revision: 1,
        },
    )?;

    let switched_profile = previous_active
        .as_ref()
        .map(|previous| previous.id != profile.id)
        .unwrap_or(false);
    if changed || switched_profile {
        vector_repo.mark_documents_embedding_stale()?;
    }

    log::info!(
        "[EmbeddingProfile] Resolved successfully: profile_id={}, model={}, dimensions={}",
        profile.id,
        profile.model,
        profile.dimensions
    );
    Ok(Some(profile))
}

pub(crate) fn resolve_effective_embedding_profile(
    state: &AppState,
) -> CommandResult<Option<EmbeddingProfile>> {
    resolve_effective_embedding_profile_internal(state)
}

#[tauri::command]
pub fn get_secret_vault_status(state: State<'_, AppState>) -> CommandResult<SecretVaultStatusDto> {
    let secrets = state.lock_secrets()?;
    Ok(SecretVaultStatusDto {
        status: secrets.status().to_string(),
    })
}

#[tauri::command]
pub fn lock_secret_vault(state: State<'_, AppState>) -> CommandResult<SecretVaultStatusDto> {
    let mut secrets = state.lock_secrets()?;
    secrets.lock();
    Ok(SecretVaultStatusDto {
        status: secrets.status().to_string(),
    })
}

#[tauri::command]
pub fn unlock_secret_vault(
    state: State<'_, AppState>,
    data: UnlockSecretVaultDto,
) -> CommandResult<SecretVaultStatusDto> {
    if data.password.trim().is_empty() {
        return Err(CommandError::InvalidInput(
            "Vault password must not be empty".to_string(),
        ));
    }
    let mut secrets = state.lock_secrets()?;
    secrets.unlock(data.password.trim())?;
    Ok(SecretVaultStatusDto {
        status: secrets.status().to_string(),
    })
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
        learning_goal: data.learning_goal,
        daily_study_minutes: data.daily_study_minutes,
        study_time_preference: data.study_time_preference,
        study_time_preferences: data.study_time_preferences,
        study_content_preferences: data.study_content_preferences,
        content_difficulty_preference: data.content_difficulty_preference,
        podcast_tts_provider: data.podcast_tts_provider,
        podcast_openai_model: data.podcast_openai_model,
        podcast_google_tts_model: data.podcast_google_tts_model,
        podcast_fish_audio_endpoint: data.podcast_fish_audio_endpoint,
        podcast_voice_overrides: data.podcast_voice_overrides,
        default_voice: data.default_voice,
        speech_rate: data.speech_rate,
        speech_pitch: data.speech_pitch,
        speech_volume: data.speech_volume,
        reading_mode: data.reading_mode,
        default_podcast_style: data.default_podcast_style,
        podcast_episode_duration_minutes: data.podcast_episode_duration_minutes,
        podcast_content_structure: data.podcast_content_structure,
        podcast_background_music: data.podcast_background_music,
        podcast_intro_outro_enabled: data.podcast_intro_outro_enabled,
        voice_input_language: data.voice_input_language,
        voice_interrupt_enabled: data.voice_interrupt_enabled,
        podcast_auto_play_next_episode: data.podcast_auto_play_next_episode,
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
pub fn list_model_profiles(state: State<'_, AppState>) -> CommandResult<Vec<ModelProfileDto>> {
    let start = std::time::Instant::now();
    let (profiles, configs) = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        let profiles = repo.list_model_profiles()?;
        let configs = repo
            .list_api_configs()?
            .into_iter()
            .map(|config| (config.id.clone(), config))
            .collect::<BTreeMap<_, _>>();
        (profiles, configs)
    };

    let count = profiles.len();
    let result = profiles
        .into_iter()
        .map(|profile| {
            let config = configs.get(&profile.api_config_id).cloned();
            Ok(model_profile_to_dto_with_db_key_status(profile, config))
        })
        .collect::<CommandResult<Vec<_>>>()?;

    log::info!(
        "[Perf][BYOK] list_model_profiles finished: count={}, duration_ms={:.2}, used_stronghold=false",
        count,
        start.elapsed().as_secs_f64() * 1000.0
    );

    Ok(result)
}

#[tauri::command]
pub fn list_model_profiles_by_api_config(
    state: State<'_, AppState>,
    api_config_id: String,
) -> CommandResult<Vec<ModelProfileDto>> {
    let start = std::time::Instant::now();
    let (profiles, config) = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        let profiles = repo.list_model_profiles_by_api_config(&api_config_id)?;
        let config = repo.get_api_config(&api_config_id)?;
        (profiles, config)
    };

    let count = profiles.len();
    let result = profiles
        .into_iter()
        .map(|profile| {
            Ok(model_profile_to_dto_with_db_key_status(
                profile,
                config.clone(),
            ))
        })
        .collect::<CommandResult<Vec<_>>>()?;

    log::info!(
        "[Perf][BYOK] list_model_profiles_by_api_config finished: api_config_id={}, count={}, duration_ms={:.2}, used_stronghold=false",
        api_config_id,
        count,
        start.elapsed().as_secs_f64() * 1000.0
    );

    Ok(result)
}

#[tauri::command]
pub fn create_model_profile(
    state: State<'_, AppState>,
    data: CreateModelProfileDto,
) -> CommandResult<ModelProfileDto> {
    let (profile, config) = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        let profile = repo.create_model_profile(CreateModelProfileRequest {
            api_config_id: data.api_config_id.clone(),
            model_id: data.model_id,
            display_name: data.display_name,
            capabilities_json: data.capabilities_json,
            is_enabled: data.is_enabled,
            is_default_for_connection: data.is_default_for_connection,
        })?;
        let config = repo.get_api_config(&data.api_config_id)?;
        (profile, config)
    };

    Ok(model_profile_to_dto_with_db_key_status(profile, config))
}

#[tauri::command]
pub fn update_model_profile(
    state: State<'_, AppState>,
    id: String,
    data: UpdateModelProfileDto,
) -> CommandResult<ModelProfileDto> {
    let (profile, config) = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        let profile = repo
            .update_model_profile(
                &id,
                UpdateModelProfileRequest {
                    model_id: data.model_id,
                    display_name: data.display_name,
                    capabilities_json: data.capabilities_json,
                    is_enabled: data.is_enabled,
                    is_default_for_connection: data.is_default_for_connection,
                },
            )?
            .ok_or(CommandError::NotFound)?;
        let config = repo.get_api_config(&profile.api_config_id)?;
        (profile, config)
    };

    Ok(model_profile_to_dto_with_db_key_status(profile, config))
}

#[tauri::command]
pub fn delete_model_profile(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    repo.delete_model_profile(&id)?;
    Ok(())
}

#[tauri::command]
pub fn delete_api_key(state: State<'_, AppState>, config_id: String) -> CommandResult<()> {
    let start = std::time::Instant::now();
    {
        let mut secrets = state.lock_secrets()?;
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
        let mut secrets = match state.lock_secrets() {
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
pub fn get_api_key(state: State<'_, AppState>, config_id: String) -> CommandResult<String> {
    let start = std::time::Instant::now();
    let mut secrets = state.lock_secrets()?;
    let api_key = match secrets.get_api_key(&config_id) {
        Ok(api_key) => api_key,
        Err(SecretError::NotFound) => {
            drop(secrets);
            log::warn!(
                "[BYOK] get_api_key found no Stronghold entry: config_id={}",
                config_id
            );
            let db = state.lock_db()?;
            let repo = SettingsRepository::new(&db);
            repo.update_api_key_status(&config_id, "none", None)?;
            return Err(CommandError::Secret(SecretError::NotFound));
        }
        Err(error) => return Err(CommandError::Secret(error)),
    };
    log::info!(
        "[Perf][BYOK] get_api_key finished: config_id={}, duration_ms={:.2}",
        config_id,
        start.elapsed().as_secs_f64() * 1000.0
    );
    Ok(api_key)
}

#[tauri::command]
pub async fn store_api_key(app: AppHandle, data: StoreApiKeyDto) -> CommandResult<()> {
    let trimmed_api_key = data.api_key.trim().to_string();
    if trimmed_api_key.is_empty() {
        return Err(CommandError::InvalidInput("Missing API key.".to_string()));
    }

    let config_id = data.config_id;
    let state = app.state::<AppState>();
    tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        let config_id = config_id.clone();
        let trimmed_api_key = trimmed_api_key.clone();
        move || -> CommandResult<()> {
            let state = app.state::<AppState>();
            let mut secrets = state.lock_secrets()?;
            secrets.store_api_key(&config_id, &trimmed_api_key)?;
            Ok(())
        }
    })
    .await
    .map_err(|error| CommandError::Internal(format!("Secret write task failed: {error}")))??;

    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    repo.update_api_key_status(&config_id, "stored", None)?;
    Ok(())
}

#[tauri::command]
pub async fn test_api_connection(
    app: AppHandle,
    data: TestApiConnectionDto,
) -> CommandResult<ApiConnectionTestResultDto> {
    let started = Instant::now();
    let result = tokio::time::timeout(
        TEST_API_CONNECTION_TOTAL_TIMEOUT,
        test_api_connection_inner(app, data),
    )
    .await;

    match result {
        Ok(result) => {
            log::info!(
                "[Perf][BYOK] test_api_connection finished: duration_ms={:.2}, timed_out=false",
                started.elapsed().as_secs_f64() * 1000.0
            );
            result
        }
        Err(_) => {
            log::warn!(
                "[Perf][BYOK] test_api_connection timed out: duration_ms={:.2}, timeout_ms={}",
                started.elapsed().as_secs_f64() * 1000.0,
                TEST_API_CONNECTION_TOTAL_TIMEOUT.as_millis()
            );
            Ok(ApiConnectionTestResultDto {
                success: false,
                message:
                    "Model health test timed out after 20 seconds. Check the network, base URL, or try the key vault again later."
                        .to_string(),
            })
        }
    }
}

async fn test_api_connection_inner(
    app: AppHandle,
    data: TestApiConnectionDto,
) -> CommandResult<ApiConnectionTestResultDto> {
    let provider = normalize_provider(&data.provider);
    let auth_mode = data.auth_mode.as_str();
    let provided_api_key = data
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let trimmed_api_key = match provided_api_key {
        Some(value) => value,
        None => match data.config_id.as_deref() {
            Some(config_id) => {
                let config_id = config_id.to_string();
                let secret_read_started = Instant::now();
                let secret_read = tokio::time::timeout(
                    TEST_API_CONNECTION_SECRET_TIMEOUT,
                    tauri::async_runtime::spawn_blocking({
                        let app = app.clone();
                        let config_id = config_id.clone();
                        move || -> CommandResult<String> {
                            let state = app.state::<AppState>();
                            let mut secrets = state.lock_secrets()?;
                            let api_key = secrets.get_api_key(&config_id)?;
                            Ok(api_key)
                        }
                    }),
                )
                .await;

                let value = match secret_read {
                    Ok(join_result) => join_result.map_err(|error| {
                        CommandError::Internal(format!("Secret read task failed: {error}"))
                    })?,
                    Err(_) => {
                        log::warn!(
                            "[Perf][BYOK] test_api_connection secret read timed out: config_id={}, duration_ms={:.2}, timeout_ms={}",
                            config_id,
                            secret_read_started.elapsed().as_secs_f64() * 1000.0,
                            TEST_API_CONNECTION_SECRET_TIMEOUT.as_millis()
                        );
                        return Ok(ApiConnectionTestResultDto {
                            success: false,
                            message:
                                "Model health test timed out while opening the key vault. Try again later or re-save the API key."
                                    .to_string(),
                        });
                    }
                };

                match value {
                    Ok(value) => {
                        log::info!(
                            "[Perf][BYOK] test_api_connection secret read finished: config_id={}, duration_ms={:.2}",
                            config_id,
                            secret_read_started.elapsed().as_secs_f64() * 1000.0
                        );
                        value.trim().to_string()
                    }
                    Err(CommandError::Secret(SecretError::NotFound)) => {
                        log::warn!(
                            "[BYOK] test_api_connection found no Stronghold entry: config_id={}",
                            config_id
                        );
                        let state = app.state::<AppState>();
                        let db = state.lock_db()?;
                        let repo = SettingsRepository::new(&db);
                        repo.update_api_key_status(&config_id, "none", None)?;
                        return Ok(ApiConnectionTestResultDto {
                            success: false,
                            message: "No API key is stored for this provider.".to_string(),
                        });
                    }
                    Err(error) => return Err(error),
                }
            }
            None => String::new(),
        },
    };
    let normalized_base_url = data
        .base_url
        .as_ref()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty());

    if auth_mode == "adc" {
        return Ok(ApiConnectionTestResultDto {
            success: false,
            message: match provider.as_str() {
                "google" | "custom_google" => probe_google_adc_credentials().message,
                _ => format!("provider \"{}\" ???? authMode=adc", provider),
            },
        });
    }

    if trimmed_api_key.is_empty() {
        return Ok(ApiConnectionTestResultDto {
            success: false,
            message: "Missing API key.".to_string(),
        });
    }

    let start = Instant::now();
    let client = match reqwest::Client::builder()
        .timeout(TEST_API_CONNECTION_HTTP_TIMEOUT)
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return Ok(ApiConnectionTestResultDto {
                success: false,
                message: format!("Unable to create HTTP client: {e}"),
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
                    message: "This provider requires a base URL.".to_string(),
                });
            };

            client
                .get(format!("{base_url}/models"))
                .header("Authorization", format!("Bearer {trimmed_api_key}"))
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
                    message: "This provider requires a base URL.".to_string(),
                });
            };

            client
                .get(format!("{base_url}/models"))
                .header("x-api-key", &trimmed_api_key)
                .header("anthropic-version", ANTHROPIC_VERSION_HEADER)
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
                    message: "This provider requires a base URL.".to_string(),
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
                message: format!("Provider \"{other}\" is not supported for automatic validation."),
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
                    message: success_message_for_provider(&provider, elapsed_ms),
                };
                (
                    Some((
                        "verified".to_string(),
                        Some(chrono::Utc::now().to_rfc3339()),
                    )),
                    result,
                )
            } else if status.as_u16() == 401 || status.as_u16() == 403 {
                let result = ApiConnectionTestResultDto {
                    success: false,
                    message: format!("Authentication failed (HTTP {status}). Check whether the API key is valid."),
                };
                (Some(("invalid".to_string(), None)), result)
            } else {
                let body_text = response.text().await.unwrap_or_default();
                let detail = truncate_response_detail(body_text);
                let result = ApiConnectionTestResultDto {
                    success: false,
                    message: format!("Server returned HTTP {status}: {detail}"),
                };
                (None, result)
            }
        }
        Err(e) => {
            if e.is_timeout() {
                (
                    None,
                    ApiConnectionTestResultDto {
                        success: false,
                        message: format!(
                            "Connection timed out after {} seconds. Check the network or base URL.",
                            TEST_API_CONNECTION_HTTP_TIMEOUT.as_secs()
                        ),
                    },
                )
            } else if e.is_connect() {
                (
                    None,
                    ApiConnectionTestResultDto {
                        success: false,
                        message: format!(
                            "Unable to connect to the server: {}",
                            redact_secret_from_message(&e.to_string(), &trimmed_api_key)
                        ),
                    },
                )
            } else {
                (
                    None,
                    ApiConnectionTestResultDto {
                        success: false,
                        message: format!(
                            "Request failed: {}",
                            redact_secret_from_message(&e.to_string(), &trimmed_api_key)
                        ),
                    },
                )
            }
        }
    };

    if let (Some(config_id), Some((key_status, key_verified_at))) =
        (data.config_id.as_deref(), outcome.0.as_ref())
    {
        let state = app.state::<AppState>();
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
        return Err(CommandError::InvalidInput("Missing API key.".to_string()));
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| {
            CommandError::Internal(format!("Unable to create HTTP client: {error}"))
        })?;

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
                return Err(CommandError::InvalidInput(
                    "This provider requires a base URL.".to_string(),
                ));
            };
            let response = client
                .get(format!("{base_url}/models"))
                .header("Authorization", format!("Bearer {api_key}"))
                .send()
                .await
                .map_err(|error| {
                    CommandError::InvalidInput(format!("Unable to fetch model list: {error}"))
                })?;

            if !response.status().is_success() {
                return Err(CommandError::InvalidInput(format!(
                    "Model endpoint returned HTTP {}",
                    response.status()
                )));
            }

            let payload = response
                .json::<serde_json::Value>()
                .await
                .map_err(|error| {
                    CommandError::InvalidInput(format!("Unable to parse model list: {error}"))
                })?;
            parse_openai_models(payload)
        }
        "google" | "custom_google" => {
            let Some(base_url) = normalized_base_url
                .clone()
                .or_else(|| default_base_url_for_provider(&provider).map(str::to_string))
            else {
                return Err(CommandError::InvalidInput(
                    "This provider requires a base URL.".to_string(),
                ));
            };
            let response = client
                .get(format!("{base_url}/models?key={api_key}"))
                .send()
                .await
                .map_err(|error| {
                    CommandError::InvalidInput(format!("Unable to fetch model list: {error}"))
                })?;

            if !response.status().is_success() {
                return Err(CommandError::InvalidInput(format!(
                    "Model endpoint returned HTTP {}",
                    response.status()
                )));
            }

            let payload = response
                .json::<serde_json::Value>()
                .await
                .map_err(|error| {
                    CommandError::InvalidInput(format!("Unable to parse model list: {error}"))
                })?;
            parse_google_models(payload)
        }
        "anthropic" | "custom_anthropic" => {
            let Some(base_url) = normalized_base_url
                .clone()
                .or_else(|| default_base_url_for_provider(&provider).map(str::to_string))
            else {
                return Err(CommandError::InvalidInput(
                    "This provider requires a base URL.".to_string(),
                ));
            };
            let response = client
                .get(format!("{base_url}/models"))
                .header("x-api-key", api_key)
                .header("anthropic-version", ANTHROPIC_VERSION_HEADER)
                .send()
                .await
                .map_err(|error| {
                    CommandError::InvalidInput(format!("Unable to fetch model list: {error}"))
                })?;

            if !response.status().is_success() {
                return Err(CommandError::InvalidInput(format!(
                    "Model endpoint returned HTTP {}",
                    response.status()
                )));
            }

            let payload = response
                .json::<serde_json::Value>()
                .await
                .map_err(|error| {
                    CommandError::InvalidInput(format!("Unable to parse model list: {error}"))
                })?;
            parse_anthropic_models(payload)
        }
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
    let start = std::time::Instant::now();
    let (assignments, profiles, configs) = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        let assignments = repo.list_workflow_assignments()?;
        let profiles = repo
            .list_model_profiles()?
            .into_iter()
            .map(|profile| (profile.id.clone(), profile))
            .collect::<BTreeMap<_, _>>();
        let configs = repo
            .list_api_configs()?
            .into_iter()
            .map(|config| (config.id.clone(), config))
            .collect::<BTreeMap<_, _>>();
        (assignments, profiles, configs)
    };
    let count = assignments.len();
    let result = assignments
        .into_iter()
        .map(|assignment| {
            let model_profile = profiles.get(&assignment.model_profile_id).cloned();
            Ok(workflow_assignment_to_dto_with_db_key_status(
                assignment.clone(),
                model_profile.clone(),
                model_profile.and_then(|profile| configs.get(&profile.api_config_id).cloned()),
            ))
        })
        .collect::<CommandResult<Vec<_>>>()?;

    log::info!(
        "[Perf][BYOK] list_workflow_assignments finished: count={}, duration_ms={:.2}, used_stronghold=false",
        count,
        start.elapsed().as_secs_f64() * 1000.0
    );

    Ok(result)
}

#[tauri::command]
pub fn get_workflow_assignment(
    state: State<'_, AppState>,
    workflow_type: String,
) -> CommandResult<Option<WorkflowAssignmentDto>> {
    validate_workflow_type(&workflow_type)?;

    let (assignment, model_profile, config) = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        let assignment = repo.get_workflow_assignment(&workflow_type)?;
        let model_profile = match assignment.as_ref() {
            Some(value) => repo.get_model_profile(&value.model_profile_id)?,
            None => None,
        };
        let config = match model_profile.as_ref() {
            Some(value) => repo.get_api_config(&value.api_config_id)?,
            None => None,
        };
        (assignment, model_profile, config)
    };

    let Some(assignment) = assignment else {
        return Ok(None);
    };

    Ok(Some(workflow_assignment_to_dto_with_db_key_status(
        assignment,
        model_profile,
        config,
    )))
}

#[tauri::command]
pub fn set_workflow_assignment(
    state: State<'_, AppState>,
    data: SetWorkflowAssignmentDto,
) -> CommandResult<WorkflowAssignmentDto> {
    validate_workflow_type(&data.workflow_type)?;
    validate_assignment_target(&state, &data.workflow_type, &data.model_profile_id)?;

    let assignment = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        repo.upsert_workflow_assignment(&data.workflow_type, &data.model_profile_id)?
    };

    if data.workflow_type == "document_embedding" {
        let _ = resolve_effective_embedding_profile_internal(&state)?;
    }

    let (model_profile, config) = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        let model_profile = repo.get_model_profile(&data.model_profile_id)?;
        let config = match model_profile.as_ref() {
            Some(value) => repo.get_api_config(&value.api_config_id)?,
            None => None,
        };
        (model_profile, config)
    };
    Ok(workflow_assignment_to_dto_with_db_key_status(
        assignment,
        model_profile,
        config,
    ))
}

#[tauri::command]
pub fn set_all_workflow_assignments(
    state: State<'_, AppState>,
    model_profile_id: String,
) -> CommandResult<Vec<WorkflowAssignmentDto>> {
    for workflow_type in WORKFLOW_TYPES {
        validate_assignment_target(&state, workflow_type, &model_profile_id)?;
    }

    let assignments = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        WORKFLOW_TYPES
            .iter()
            .map(|workflow_type| repo.upsert_workflow_assignment(workflow_type, &model_profile_id))
            .collect::<Result<Vec<_>, _>>()?
    };
    let (model_profile, config) = {
        let db = state.lock_db()?;
        let repo = SettingsRepository::new(&db);
        let model_profile = repo.get_model_profile(&model_profile_id)?;
        let config = match model_profile.as_ref() {
            Some(value) => repo.get_api_config(&value.api_config_id)?,
            None => None,
        };
        (model_profile, config)
    };
    assignments
        .into_iter()
        .map(|assignment| {
            Ok(workflow_assignment_to_dto_with_db_key_status(
                assignment,
                model_profile.clone(),
                config.clone(),
            ))
        })
        .collect()
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
    let profile = resolve_effective_embedding_profile_internal(&state)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_anthropic_models_reads_id_and_display_name() {
        let payload = serde_json::json!({
            "data": [
                {
                    "id": "claude-sonnet-4-20250514",
                    "display_name": "Claude Sonnet 4"
                },
                {
                    "id": "claude-3-5-haiku-20241022"
                }
            ]
        });

        let models = parse_anthropic_models(payload);

        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "claude-sonnet-4-20250514");
        assert_eq!(models[0].display_name, "Claude Sonnet 4");
        assert_eq!(models[1].display_name, "claude-3-5-haiku-20241022");
    }

    #[test]
    fn validate_google_adc_payload_accepts_service_account_shape() {
        let path = std::env::temp_dir().join(format!("xuejian-adc-{}.json", uuid::Uuid::new_v4()));
        fs::write(
            &path,
            serde_json::json!({
                "type": "service_account",
                "client_email": "bot@example.com",
                "private_key": "-----BEGIN PRIVATE KEY-----demo"
            })
            .to_string(),
        )
        .expect("write adc payload");

        let result = validate_google_adc_payload(&path);
        let _ = fs::remove_file(&path);

        assert!(result.is_ok());
    }

    #[test]
    fn workflow_types_exclude_paused_workflows() {
        assert!(WORKFLOW_TYPES.contains(&"card_generation"));
        assert!(WORKFLOW_TYPES.contains(&"document_embedding"));
        assert!(WORKFLOW_TYPES.contains(&"knowledge_qa"));
        assert!(!WORKFLOW_TYPES.contains(&"podcast_generation"));
        assert!(!WORKFLOW_TYPES.contains(&"card_animation"));
    }

    #[test]
    fn model_profile_fast_dto_uses_db_key_status_without_secret_state() {
        let config = test_api_config("stored");
        let profile = test_model_profile(&config.id);

        let dto = model_profile_to_dto_with_db_key_status(profile, Some(config));

        let nested_config = dto.api_config.expect("nested config");
        assert!(nested_config.has_stored_credential);
        assert!(nested_config.has_stored_key);
        assert_eq!(nested_config.key_status, "stored");
    }

    #[test]
    fn workflow_assignment_fast_dto_uses_db_key_status_without_secret_state() {
        let config = test_api_config("verified");
        let profile = test_model_profile(&config.id);
        let assignment = WorkflowModelAssignment {
            workflow_type: "card_generation".to_string(),
            model_profile_id: profile.id.clone(),
            assigned_at: "2026-05-06T00:00:00Z".to_string(),
            updated_at: "2026-05-06T00:00:00Z".to_string(),
        };

        let dto =
            workflow_assignment_to_dto_with_db_key_status(assignment, Some(profile), Some(config));

        let nested_config = dto.api_config.expect("nested config");
        assert!(nested_config.has_stored_credential);
        assert!(nested_config.has_stored_key);
        assert_eq!(nested_config.key_status, "verified");
    }

    fn test_api_config(key_status: &str) -> ApiConfig {
        ApiConfig {
            id: "cfg-fast-settings".to_string(),
            provider: "openai".to_string(),
            protocol: Some("native".to_string()),
            auth_mode: "api_key".to_string(),
            name: "OpenAI".to_string(),
            base_url: None,
            model: Some("gpt-4o".to_string()),
            budget_limit: None,
            is_enabled: true,
            is_default: true,
            key_verified_at: None,
            key_status: key_status.to_string(),
            display_name: Some("OpenAI".to_string()),
            created_at: "2026-05-06T00:00:00Z".to_string(),
        }
    }

    fn test_model_profile(api_config_id: &str) -> ModelProfile {
        ModelProfile {
            id: "profile-fast-settings".to_string(),
            api_config_id: api_config_id.to_string(),
            model_id: "gpt-4o".to_string(),
            display_name: Some("GPT-4o".to_string()),
            capabilities_json: Some("[]".to_string()),
            is_enabled: true,
            is_default_for_connection: true,
            created_at: "2026-05-06T00:00:00Z".to_string(),
            updated_at: "2026-05-06T00:00:00Z".to_string(),
        }
    }
}
