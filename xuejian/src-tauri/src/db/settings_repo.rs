use std::collections::BTreeMap;

use crate::db::{Database, Result};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const DEFAULT_USER_ID: &str = "default";
const DEFAULT_LANGUAGE: &str = "zh-CN";
const DEFAULT_THEME: &str = "default";
const DEFAULT_PODCAST_TTS_PROVIDER: &str = "auto";
const DEFAULT_PODCAST_OPENAI_MODEL: &str = "tts-1";
const DEFAULT_PODCAST_OUTPUT_FORMAT: &str = "mp3";
const DEFAULT_PODCAST_MAX_LLM_TOKENS: i32 = 100_000;
const DEFAULT_PODCAST_MAX_TTS_CHARACTERS: i32 = 50_000;
const DEFAULT_PODCAST_MAX_ESTIMATED_COST_USD: f64 = 1.0;
const DEFAULT_LEARNING_GOAL: &str = "exam_prep";
const DEFAULT_DAILY_STUDY_MINUTES: i32 = 30;
const DEFAULT_STUDY_TIME_PREFERENCE: &str = "evening";
const DEFAULT_CONTENT_DIFFICULTY_PREFERENCE: &str = "adaptive";
const DEFAULT_DEFAULT_VOICE: &str = "alloy";
const DEFAULT_SPEECH_RATE: f64 = 1.0;
const DEFAULT_SPEECH_PITCH: f64 = 0.0;
const DEFAULT_SPEECH_VOLUME: f64 = 1.0;
const DEFAULT_READING_MODE: &str = "natural";
const DEFAULT_PODCAST_STYLE: &str = "conversational";
const DEFAULT_PODCAST_EPISODE_DURATION_MINUTES: i32 = 10;
const DEFAULT_PODCAST_CONTENT_STRUCTURE: &str = "summary_then_details";
const DEFAULT_PODCAST_BACKGROUND_MUSIC: &str = "soft_piano";
const DEFAULT_PODCAST_INTRO_OUTRO_ENABLED: bool = true;
const DEFAULT_VOICE_INPUT_LANGUAGE: &str = "zh-CN";
const DEFAULT_VOICE_INTERRUPT_ENABLED: bool = true;
const DEFAULT_PODCAST_AUTO_PLAY_NEXT_EPISODE: bool = true;

fn default_learning_goal() -> String {
    DEFAULT_LEARNING_GOAL.to_string()
}

fn default_daily_study_minutes() -> i32 {
    DEFAULT_DAILY_STUDY_MINUTES
}

fn default_study_time_preference() -> String {
    DEFAULT_STUDY_TIME_PREFERENCE.to_string()
}

fn default_study_content_preferences() -> Vec<String> {
    vec!["concepts".to_string(), "examples".to_string()]
}

fn default_content_difficulty_preference() -> String {
    DEFAULT_CONTENT_DIFFICULTY_PREFERENCE.to_string()
}

fn default_default_voice() -> String {
    DEFAULT_DEFAULT_VOICE.to_string()
}

fn default_speech_rate() -> f64 {
    DEFAULT_SPEECH_RATE
}

fn default_speech_pitch() -> f64 {
    DEFAULT_SPEECH_PITCH
}

fn default_speech_volume() -> f64 {
    DEFAULT_SPEECH_VOLUME
}

fn default_reading_mode() -> String {
    DEFAULT_READING_MODE.to_string()
}

fn default_podcast_style() -> String {
    DEFAULT_PODCAST_STYLE.to_string()
}

fn default_podcast_episode_duration_minutes() -> i32 {
    DEFAULT_PODCAST_EPISODE_DURATION_MINUTES
}

fn default_podcast_content_structure() -> String {
    DEFAULT_PODCAST_CONTENT_STRUCTURE.to_string()
}

fn default_podcast_background_music() -> String {
    DEFAULT_PODCAST_BACKGROUND_MUSIC.to_string()
}

fn default_podcast_intro_outro_enabled() -> bool {
    DEFAULT_PODCAST_INTRO_OUTRO_ENABLED
}

fn default_voice_input_language() -> String {
    DEFAULT_VOICE_INPUT_LANGUAGE.to_string()
}

fn default_voice_interrupt_enabled() -> bool {
    DEFAULT_VOICE_INTERRUPT_ENABLED
}

fn default_podcast_auto_play_next_episode() -> bool {
    DEFAULT_PODCAST_AUTO_PLAY_NEXT_EPISODE
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiConfig {
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
    pub key_verified_at: Option<String>,
    pub key_status: String,
    pub display_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowModelAssignment {
    pub workflow_type: String,
    pub api_config_id: String,
    pub assigned_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderBudgetUsage {
    pub id: String,
    pub api_config_id: String,
    pub period: String,
    pub estimated_cost_usd: f64,
    pub workflow_runs_count: i32,
    pub updated_at: String,
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
    pub display_name: Option<String>,
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
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppSettings {
    pub daily_new_card_limit: i32,
    pub review_time_limit: i32,
    pub theme: String,
    pub language: String,
    #[serde(default = "default_learning_goal")]
    pub learning_goal: String,
    #[serde(default = "default_daily_study_minutes")]
    pub daily_study_minutes: i32,
    #[serde(default = "default_study_time_preference")]
    pub study_time_preference: String,
    #[serde(default = "default_study_content_preferences")]
    pub study_content_preferences: Vec<String>,
    #[serde(default = "default_content_difficulty_preference")]
    pub content_difficulty_preference: String,
    pub podcast_tts_provider: String,
    pub podcast_openai_model: String,
    pub podcast_fish_audio_endpoint: Option<String>,
    pub podcast_voice_overrides: BTreeMap<String, String>,
    #[serde(default = "default_default_voice")]
    pub default_voice: String,
    #[serde(default = "default_speech_rate")]
    pub speech_rate: f64,
    #[serde(default = "default_speech_pitch")]
    pub speech_pitch: f64,
    #[serde(default = "default_speech_volume")]
    pub speech_volume: f64,
    #[serde(default = "default_reading_mode")]
    pub reading_mode: String,
    #[serde(default = "default_podcast_style")]
    pub default_podcast_style: String,
    #[serde(default = "default_podcast_episode_duration_minutes")]
    pub podcast_episode_duration_minutes: i32,
    #[serde(default = "default_podcast_content_structure")]
    pub podcast_content_structure: String,
    #[serde(default = "default_podcast_background_music")]
    pub podcast_background_music: String,
    #[serde(default = "default_podcast_intro_outro_enabled")]
    pub podcast_intro_outro_enabled: bool,
    #[serde(default = "default_voice_input_language")]
    pub voice_input_language: String,
    #[serde(default = "default_voice_interrupt_enabled")]
    pub voice_interrupt_enabled: bool,
    #[serde(default = "default_podcast_auto_play_next_episode")]
    pub podcast_auto_play_next_episode: bool,
    pub podcast_output_format: String,
    pub podcast_skip_review: bool,
    pub podcast_max_llm_tokens: i32,
    pub podcast_max_tts_characters: i32,
    pub podcast_max_estimated_cost_usd: f64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAppSettingsRequest {
    pub daily_new_card_limit: Option<i32>,
    pub review_time_limit: Option<i32>,
    pub theme: Option<String>,
    pub language: Option<String>,
    pub learning_goal: Option<String>,
    pub daily_study_minutes: Option<i32>,
    pub study_time_preference: Option<String>,
    pub study_content_preferences: Option<Vec<String>>,
    pub content_difficulty_preference: Option<String>,
    pub podcast_tts_provider: Option<String>,
    pub podcast_openai_model: Option<String>,
    pub podcast_fish_audio_endpoint: Option<Option<String>>,
    pub podcast_voice_overrides: Option<BTreeMap<String, String>>,
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
        let protocol = infer_protocol(&provider);
        let auth_mode = normalize_auth_mode(req.auth_mode);

        // If this is set as default, clear other defaults
        if req.is_default {
            self.db.connection().execute(
                "UPDATE api_configs SET is_default = FALSE WHERE is_default = TRUE",
                [],
            )?;
        }

        self.db.connection().execute(
            "INSERT INTO api_configs (id, provider, protocol, auth_mode, name, base_url, model, budget_limit, is_default, key_verified_at, key_status, display_name, created_at, user_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, 'none', ?10, ?11, 'default')",
            params![
                &id, &provider, &protocol, &auth_mode, &req.name, req.base_url, req.model,
                req.budget_limit, req.is_default, req.display_name, &now
            ],
        )?;

        Ok(ApiConfig {
            id,
            provider,
            protocol,
            auth_mode,
            name: req.name,
            base_url: req.base_url,
            model: req.model,
            budget_limit: req.budget_limit,
            is_enabled: true,
            is_default: req.is_default,
            key_verified_at: None,
            key_status: "none".to_string(),
            display_name: req.display_name,
            created_at: now,
        })
    }

    pub fn list_api_configs(&self) -> Result<Vec<ApiConfig>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, provider, protocol, auth_mode, name, base_url, model, budget_limit, is_enabled, is_default, key_verified_at, key_status, display_name, created_at
             FROM api_configs
             ORDER BY created_at DESC"
        )?;

        let configs = stmt.query_map([], |row| {
            Ok(ApiConfig {
                id: row.get(0)?,
                provider: normalize_provider(row.get::<_, String>(1)?),
                protocol: normalize_protocol(row.get(2)?),
                auth_mode: normalize_auth_mode(row.get::<_, String>(3)?),
                name: row.get(4)?,
                base_url: row.get(5)?,
                model: row.get(6)?,
                budget_limit: row.get(7)?,
                is_enabled: row.get(8)?,
                is_default: row.get(9)?,
                key_verified_at: row.get(10)?,
                key_status: normalize_key_status(row.get::<_, String>(11)?),
                display_name: row.get(12)?,
                created_at: row.get(13)?,
            })
        })?;

        configs
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn get_api_config(&self, id: &str) -> Result<Option<ApiConfig>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, provider, protocol, auth_mode, name, base_url, model, budget_limit, is_enabled, is_default, key_verified_at, key_status, display_name, created_at
             FROM api_configs
             WHERE id = ?1"
        )?;

        stmt.query_row(params![id], |row| {
            Ok(ApiConfig {
                id: row.get(0)?,
                provider: normalize_provider(row.get::<_, String>(1)?),
                protocol: normalize_protocol(row.get(2)?),
                auth_mode: normalize_auth_mode(row.get::<_, String>(3)?),
                name: row.get(4)?,
                base_url: row.get(5)?,
                model: row.get(6)?,
                budget_limit: row.get(7)?,
                is_enabled: row.get(8)?,
                is_default: row.get(9)?,
                key_verified_at: row.get(10)?,
                key_status: normalize_key_status(row.get::<_, String>(11)?),
                display_name: row.get(12)?,
                created_at: row.get(13)?,
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

        let provider = normalize_provider(req.provider.unwrap_or_else(|| current.provider.clone()));
        let protocol = infer_protocol(&provider);
        let auth_mode = normalize_auth_mode(req.auth_mode.unwrap_or_else(|| current.auth_mode.clone()));
        let name = req.name.unwrap_or(current.name);
        let base_url = req.base_url.or(current.base_url);
        let model = req.model.or(current.model);
        let budget_limit = req.budget_limit.or(current.budget_limit);
        let is_enabled = req.is_enabled.unwrap_or(current.is_enabled);
        let is_default = req.is_default.unwrap_or(current.is_default);
        let display_name = req.display_name.or(current.display_name);

        if is_default {
            self.db.connection().execute(
                "UPDATE api_configs SET is_default = FALSE WHERE id != ?1",
                params![id],
            )?;
        }

        self.db.connection().execute(
            "UPDATE api_configs
             SET provider = ?1, protocol = ?2, auth_mode = ?3, name = ?4, base_url = ?5, model = ?6, budget_limit = ?7, is_enabled = ?8, is_default = ?9, display_name = ?10
             WHERE id = ?11",
            params![
                provider,
                protocol,
                auth_mode,
                name,
                base_url,
                model,
                budget_limit,
                is_enabled,
                is_default,
                display_name,
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

    pub fn update_api_key_status(
        &self,
        id: &str,
        key_status: &str,
        key_verified_at: Option<&str>,
    ) -> Result<()> {
        self.db.connection().execute(
            "UPDATE api_configs
             SET key_status = ?1, key_verified_at = ?2
             WHERE id = ?3",
            params![normalize_key_status(key_status.to_string()), key_verified_at, id],
        )?;
        Ok(())
    }

    pub fn list_workflow_assignments(&self) -> Result<Vec<WorkflowModelAssignment>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT workflow_type, api_config_id, assigned_at, updated_at
             FROM workflow_model_assignments
             ORDER BY workflow_type",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(WorkflowModelAssignment {
                workflow_type: row.get(0)?,
                api_config_id: row.get(1)?,
                assigned_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn get_workflow_assignment(&self, workflow_type: &str) -> Result<Option<WorkflowModelAssignment>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT workflow_type, api_config_id, assigned_at, updated_at
             FROM workflow_model_assignments
             WHERE workflow_type = ?1",
        )?;

        stmt.query_row(params![workflow_type], |row| {
            Ok(WorkflowModelAssignment {
                workflow_type: row.get(0)?,
                api_config_id: row.get(1)?,
                assigned_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .optional()
        .map_err(Into::into)
    }

    pub fn upsert_workflow_assignment(
        &self,
        workflow_type: &str,
        api_config_id: &str,
    ) -> Result<WorkflowModelAssignment> {
        let now = chrono::Utc::now().to_rfc3339();
        self.db.connection().execute(
            "INSERT INTO workflow_model_assignments (workflow_type, api_config_id, assigned_at, updated_at)
             VALUES (?1, ?2, ?3, ?3)
             ON CONFLICT(workflow_type) DO UPDATE SET
                api_config_id = excluded.api_config_id,
                updated_at = excluded.updated_at",
            params![workflow_type, api_config_id, &now],
        )?;

        self.get_workflow_assignment(workflow_type)
            .map(|assignment| assignment.expect("workflow assignment should exist after upsert"))
    }

    pub fn delete_workflow_assignment(&self, workflow_type: &str) -> Result<()> {
        self.db.connection().execute(
            "DELETE FROM workflow_model_assignments WHERE workflow_type = ?1",
            params![workflow_type],
        )?;
        Ok(())
    }

    pub fn get_assignments_by_config_id(
        &self,
        api_config_id: &str,
    ) -> Result<Vec<WorkflowModelAssignment>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT workflow_type, api_config_id, assigned_at, updated_at
             FROM workflow_model_assignments
             WHERE api_config_id = ?1
             ORDER BY workflow_type",
        )?;

        let rows = stmt.query_map(params![api_config_id], |row| {
            Ok(WorkflowModelAssignment {
                workflow_type: row.get(0)?,
                api_config_id: row.get(1)?,
                assigned_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn get_budget_usage(&self, api_config_id: &str, period: &str) -> Result<Option<ProviderBudgetUsage>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, api_config_id, period, estimated_cost_usd, workflow_runs_count, updated_at
             FROM provider_budget_usage
             WHERE api_config_id = ?1 AND period = ?2",
        )?;

        stmt.query_row(params![api_config_id, period], |row| {
            Ok(ProviderBudgetUsage {
                id: row.get(0)?,
                api_config_id: row.get(1)?,
                period: row.get(2)?,
                estimated_cost_usd: row.get(3)?,
                workflow_runs_count: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .optional()
        .map_err(Into::into)
    }

    pub fn increment_budget_usage(&self, api_config_id: &str, cost: f64) -> Result<()> {
        let period = chrono::Utc::now().format("%Y-%m").to_string();
        let now = chrono::Utc::now().to_rfc3339();

        self.db.connection().execute(
            "INSERT INTO provider_budget_usage (id, api_config_id, period, estimated_cost_usd, workflow_runs_count, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5)
             ON CONFLICT(api_config_id, period) DO UPDATE SET
                estimated_cost_usd = estimated_cost_usd + excluded.estimated_cost_usd,
                workflow_runs_count = workflow_runs_count + 1,
                updated_at = excluded.updated_at",
            params![
                Uuid::new_v4().to_string(),
                api_config_id,
                &period,
                cost.max(0.0),
                &now,
            ],
        )?;

        Ok(())
    }

    pub fn reset_budget_usage(&self, api_config_id: &str) -> Result<()> {
        let period = chrono::Utc::now().format("%Y-%m").to_string();
        self.db.connection().execute(
            "DELETE FROM provider_budget_usage WHERE api_config_id = ?1 AND period = ?2",
            params![api_config_id, period],
        )?;
        Ok(())
    }

    pub fn check_budget_exceeded(&self, api_config_id: &str) -> Result<bool> {
        let Some(config) = self.get_api_config(api_config_id)? else {
            return Ok(false);
        };
        let Some(budget_limit) = config.budget_limit else {
            return Ok(false);
        };
        if budget_limit <= 0.0 {
            return Ok(true);
        }

        let period = chrono::Utc::now().format("%Y-%m").to_string();
        let used = self
            .get_budget_usage(api_config_id, &period)?
            .map(|entry| entry.estimated_cost_usd)
            .unwrap_or(0.0);
        Ok(used >= budget_limit)
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
            Some(raw) => Ok(deserialize_settings(&raw)?),
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
            learning_goal: req.learning_goal.unwrap_or(current.learning_goal),
            daily_study_minutes: req.daily_study_minutes.unwrap_or(current.daily_study_minutes),
            study_time_preference: req
                .study_time_preference
                .unwrap_or(current.study_time_preference),
            study_content_preferences: req
                .study_content_preferences
                .unwrap_or(current.study_content_preferences),
            content_difficulty_preference: req
                .content_difficulty_preference
                .unwrap_or(current.content_difficulty_preference),
            podcast_tts_provider: req
                .podcast_tts_provider
                .unwrap_or(current.podcast_tts_provider),
            podcast_openai_model: req
                .podcast_openai_model
                .unwrap_or(current.podcast_openai_model),
            podcast_fish_audio_endpoint: req
                .podcast_fish_audio_endpoint
                .unwrap_or(current.podcast_fish_audio_endpoint),
            podcast_voice_overrides: req
                .podcast_voice_overrides
                .unwrap_or(current.podcast_voice_overrides),
            default_voice: req.default_voice.unwrap_or(current.default_voice),
            speech_rate: req.speech_rate.unwrap_or(current.speech_rate),
            speech_pitch: req.speech_pitch.unwrap_or(current.speech_pitch),
            speech_volume: req.speech_volume.unwrap_or(current.speech_volume),
            reading_mode: req.reading_mode.unwrap_or(current.reading_mode),
            default_podcast_style: req
                .default_podcast_style
                .unwrap_or(current.default_podcast_style),
            podcast_episode_duration_minutes: req
                .podcast_episode_duration_minutes
                .unwrap_or(current.podcast_episode_duration_minutes),
            podcast_content_structure: req
                .podcast_content_structure
                .unwrap_or(current.podcast_content_structure),
            podcast_background_music: req
                .podcast_background_music
                .unwrap_or(current.podcast_background_music),
            podcast_intro_outro_enabled: req
                .podcast_intro_outro_enabled
                .unwrap_or(current.podcast_intro_outro_enabled),
            voice_input_language: req
                .voice_input_language
                .unwrap_or(current.voice_input_language),
            voice_interrupt_enabled: req
                .voice_interrupt_enabled
                .unwrap_or(current.voice_interrupt_enabled),
            podcast_auto_play_next_episode: req
                .podcast_auto_play_next_episode
                .unwrap_or(current.podcast_auto_play_next_episode),
            podcast_output_format: req
                .podcast_output_format
                .unwrap_or(current.podcast_output_format),
            podcast_skip_review: req
                .podcast_skip_review
                .unwrap_or(current.podcast_skip_review),
            podcast_max_llm_tokens: req
                .podcast_max_llm_tokens
                .unwrap_or(current.podcast_max_llm_tokens),
            podcast_max_tts_characters: req
                .podcast_max_tts_characters
                .unwrap_or(current.podcast_max_tts_characters),
            podcast_max_estimated_cost_usd: req
                .podcast_max_estimated_cost_usd
                .unwrap_or(current.podcast_max_estimated_cost_usd),
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
        learning_goal: default_learning_goal(),
        daily_study_minutes: default_daily_study_minutes(),
        study_time_preference: default_study_time_preference(),
        study_content_preferences: default_study_content_preferences(),
        content_difficulty_preference: default_content_difficulty_preference(),
        podcast_tts_provider: DEFAULT_PODCAST_TTS_PROVIDER.to_string(),
        podcast_openai_model: DEFAULT_PODCAST_OPENAI_MODEL.to_string(),
        podcast_fish_audio_endpoint: None,
        podcast_voice_overrides: BTreeMap::new(),
        default_voice: default_default_voice(),
        speech_rate: default_speech_rate(),
        speech_pitch: default_speech_pitch(),
        speech_volume: default_speech_volume(),
        reading_mode: default_reading_mode(),
        default_podcast_style: default_podcast_style(),
        podcast_episode_duration_minutes: default_podcast_episode_duration_minutes(),
        podcast_content_structure: default_podcast_content_structure(),
        podcast_background_music: default_podcast_background_music(),
        podcast_intro_outro_enabled: default_podcast_intro_outro_enabled(),
        voice_input_language: default_voice_input_language(),
        voice_interrupt_enabled: default_voice_interrupt_enabled(),
        podcast_auto_play_next_episode: default_podcast_auto_play_next_episode(),
        podcast_output_format: DEFAULT_PODCAST_OUTPUT_FORMAT.to_string(),
        podcast_skip_review: true,
        podcast_max_llm_tokens: DEFAULT_PODCAST_MAX_LLM_TOKENS,
        podcast_max_tts_characters: DEFAULT_PODCAST_MAX_TTS_CHARACTERS,
        podcast_max_estimated_cost_usd: DEFAULT_PODCAST_MAX_ESTIMATED_COST_USD,
    }
}

fn deserialize_settings(raw: &str) -> Result<AppSettings> {
    let stored = serde_json::from_str::<serde_json::Value>(raw)?;
    let mut merged = serde_json::to_value(default_app_settings())?;
    merge_settings_value(&mut merged, stored);
    Ok(sanitize_settings(serde_json::from_value(merged)?))
}

fn merge_settings_value(target: &mut serde_json::Value, source: serde_json::Value) {
    let Some(target_map) = target.as_object_mut() else {
        return;
    };
    let serde_json::Value::Object(source_map) = source else {
        return;
    };

    for (key, value) in source_map {
        target_map.insert(key, value);
    }
}

fn sanitize_settings(settings: AppSettings) -> AppSettings {
    AppSettings {
        daily_new_card_limit: settings.daily_new_card_limit.max(0),
        review_time_limit: settings.review_time_limit.max(0),
        theme: sanitize_theme(settings.theme),
        language: sanitize_language(settings.language),
        learning_goal: sanitize_learning_goal(settings.learning_goal),
        daily_study_minutes: settings.daily_study_minutes.max(0),
        study_time_preference: sanitize_study_time_preference(settings.study_time_preference),
        study_content_preferences: sanitize_study_content_preferences(
            settings.study_content_preferences,
        ),
        content_difficulty_preference: sanitize_content_difficulty_preference(
            settings.content_difficulty_preference,
        ),
        podcast_tts_provider: sanitize_podcast_tts_provider(settings.podcast_tts_provider),
        podcast_openai_model: sanitize_podcast_openai_model(settings.podcast_openai_model),
        podcast_fish_audio_endpoint: sanitize_optional_text(settings.podcast_fish_audio_endpoint),
        podcast_voice_overrides: sanitize_voice_overrides(settings.podcast_voice_overrides),
        default_voice: sanitize_default_voice(settings.default_voice),
        speech_rate: sanitize_speech_rate(settings.speech_rate),
        speech_pitch: sanitize_speech_pitch(settings.speech_pitch),
        speech_volume: sanitize_speech_volume(settings.speech_volume),
        reading_mode: sanitize_reading_mode(settings.reading_mode),
        default_podcast_style: sanitize_default_podcast_style(settings.default_podcast_style),
        podcast_episode_duration_minutes: settings.podcast_episode_duration_minutes.max(1),
        podcast_content_structure: sanitize_podcast_content_structure(
            settings.podcast_content_structure,
        ),
        podcast_background_music: sanitize_podcast_background_music(settings.podcast_background_music),
        podcast_intro_outro_enabled: settings.podcast_intro_outro_enabled,
        voice_input_language: sanitize_voice_input_language(settings.voice_input_language),
        voice_interrupt_enabled: settings.voice_interrupt_enabled,
        podcast_auto_play_next_episode: settings.podcast_auto_play_next_episode,
        podcast_output_format: sanitize_podcast_output_format(settings.podcast_output_format),
        podcast_skip_review: settings.podcast_skip_review,
        podcast_max_llm_tokens: settings.podcast_max_llm_tokens.max(0),
        podcast_max_tts_characters: settings.podcast_max_tts_characters.max(0),
        podcast_max_estimated_cost_usd: settings.podcast_max_estimated_cost_usd.max(0.0),
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

fn sanitize_learning_goal(goal: String) -> String {
    match goal.trim() {
        "exam_prep" | "concept_mastery" | "long_term_retention" | "skill_building" => {
            goal.trim().to_string()
        }
        _ => DEFAULT_LEARNING_GOAL.to_string(),
    }
}

fn sanitize_study_time_preference(value: String) -> String {
    match value.trim() {
        "morning" | "afternoon" | "evening" | "late_night" | "flexible" => {
            value.trim().to_string()
        }
        _ => DEFAULT_STUDY_TIME_PREFERENCE.to_string(),
    }
}

fn sanitize_study_content_preferences(values: Vec<String>) -> Vec<String> {
    let sanitized = values
        .into_iter()
        .filter_map(|value| {
            let trimmed = value.trim();
            match trimmed {
                "concepts" | "examples" | "exercises" | "summaries" | "flashcards" => {
                    Some(trimmed.to_string())
                }
                _ => None,
            }
        })
        .collect::<Vec<_>>();

    if sanitized.is_empty() {
        default_study_content_preferences()
    } else {
        sanitized
    }
}

fn sanitize_content_difficulty_preference(value: String) -> String {
    match value.trim() {
        "foundation" | "adaptive" | "challenging" => value.trim().to_string(),
        _ => DEFAULT_CONTENT_DIFFICULTY_PREFERENCE.to_string(),
    }
}

fn sanitize_podcast_tts_provider(provider: String) -> String {
    match provider.as_str() {
        "auto" | "openai" | "edge_tts" | "elevenlabs" | "fish_audio" => provider,
        _ => DEFAULT_PODCAST_TTS_PROVIDER.to_string(),
    }
}

fn sanitize_podcast_openai_model(model: String) -> String {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        DEFAULT_PODCAST_OPENAI_MODEL.to_string()
    } else {
        trimmed.to_string()
    }
}

fn sanitize_podcast_output_format(format: String) -> String {
    match format.as_str() {
        "mp3" | "wav" => format,
        _ => DEFAULT_PODCAST_OUTPUT_FORMAT.to_string(),
    }
}

fn sanitize_default_voice(value: String) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        DEFAULT_DEFAULT_VOICE.to_string()
    } else {
        trimmed.to_string()
    }
}

fn sanitize_speech_rate(value: f64) -> f64 {
    value.clamp(0.0, 2.0)
}

fn sanitize_speech_pitch(value: f64) -> f64 {
    value.clamp(-1.0, 1.0)
}

fn sanitize_speech_volume(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

fn sanitize_reading_mode(value: String) -> String {
    match value.trim() {
        "natural" | "focused" | "narration" => value.trim().to_string(),
        _ => DEFAULT_READING_MODE.to_string(),
    }
}

fn sanitize_default_podcast_style(value: String) -> String {
    match value.trim() {
        "conversational" | "news_brief" | "deep_dive" | "storytelling" => {
            value.trim().to_string()
        }
        _ => DEFAULT_PODCAST_STYLE.to_string(),
    }
}

fn sanitize_podcast_content_structure(value: String) -> String {
    match value.trim() {
        "summary_then_details" | "highlights_only" | "timeline_story" | "qa_dialogue" => {
            value.trim().to_string()
        }
        _ => DEFAULT_PODCAST_CONTENT_STRUCTURE.to_string(),
    }
}

fn sanitize_podcast_background_music(value: String) -> String {
    match value.trim() {
        "off" | "soft_piano" | "light_ambient" | "study_lofi" => value.trim().to_string(),
        _ => DEFAULT_PODCAST_BACKGROUND_MUSIC.to_string(),
    }
}

fn sanitize_voice_input_language(value: String) -> String {
    match value.trim() {
        "zh-CN" | "en-US" => value.trim().to_string(),
        _ => DEFAULT_VOICE_INPUT_LANGUAGE.to_string(),
    }
}

fn sanitize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn sanitize_voice_overrides(overrides: BTreeMap<String, String>) -> BTreeMap<String, String> {
    overrides
        .into_iter()
        .filter_map(|(key, value)| {
            let trimmed_key = key.trim().to_string();
            let trimmed_value = value.trim().to_string();
            if trimmed_key.is_empty() || trimmed_value.is_empty() {
                None
            } else {
                Some((trimmed_key, trimmed_value))
            }
        })
        .collect()
}

fn normalize_provider(provider: String) -> String {
    let normalized = provider.trim().to_ascii_lowercase();

    match normalized.as_str() {
        "deepseek" | "openai" | "anthropic" | "google" | "custom_openai" | "custom_anthropic" | "custom_google" => normalized,
        "custom" | "openai_compatible" | "qianfan" => "custom_openai".to_string(),
        _ => "custom_openai".to_string(),
    }
}

fn infer_protocol(provider: &str) -> Option<String> {
    match provider {
        "openai" | "anthropic" | "google" | "custom_anthropic" | "custom_google" => Some("native".to_string()),
        "deepseek" | "custom_openai" => Some("openai-compatible".to_string()),
        _ => None,
    }
}

fn normalize_protocol(protocol: Option<String>) -> Option<String> {
    match protocol.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        Some("native") => Some("native".to_string()),
        Some("openai-compatible") => Some("openai-compatible".to_string()),
        Some(_) => None,
        None => None,
    }
}

fn normalize_auth_mode(auth_mode: String) -> String {
    let normalized = auth_mode.trim().to_ascii_lowercase();

    match normalized.as_str() {
        "api_key" | "adc" => normalized,
        _ => "api_key".to_string(),
    }
}

fn normalize_key_status(key_status: String) -> String {
    let normalized = key_status.trim().to_ascii_lowercase();

    match normalized.as_str() {
        "none" | "stored" | "verified" | "invalid" | "expired" => normalized,
        _ => "none".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use super::*;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().expect("in-memory sqlite");
        conn.execute_batch(include_str!("../migrations/V1__initial_schema.sql"))
            .expect("apply v1 migration");
        conn.execute_batch(include_str!("../migrations/V9__api_config_auth_mode.sql"))
            .expect("apply v9 migration");
        conn.execute_batch(include_str!("../migrations/V10__card_schema_extension.sql"))
            .expect("apply v10 migration");
        conn.execute_batch(include_str!("../migrations/V18__byok_workflow_assignments.sql"))
            .expect("apply v18 migration");
        conn.execute(
            "INSERT OR IGNORE INTO users (id, name) VALUES ('default', '默认用户')",
            [],
        )
        .expect("insert default user");

        Database { conn }
    }

    #[test]
    fn create_api_config_preserves_custom_provider_and_protocol() {
        let db = test_db();
        let repo = SettingsRepository::new(&db);

        let created = repo
            .create_api_config(CreateApiConfigRequest {
                provider: "custom".to_string(),
                auth_mode: "api_key".to_string(),
                name: "Local OpenAI Compatible".to_string(),
                base_url: Some("http://localhost:11434/v1".to_string()),
                model: Some("qwen2.5-14b-instruct".to_string()),
                budget_limit: None,
                is_default: true,
                display_name: Some("本地兼容服务".to_string()),
            })
            .expect("create config");

        assert_eq!(created.provider, "custom_openai");
        assert_eq!(created.protocol.as_deref(), Some("openai-compatible"));
        assert_eq!(created.display_name.as_deref(), Some("本地兼容服务"));

        let stored = repo
            .get_api_config(&created.id)
            .expect("load config")
            .expect("config exists");

        assert_eq!(stored.provider, "custom_openai");
        assert_eq!(stored.protocol.as_deref(), Some("openai-compatible"));
        assert_eq!(stored.key_status, "none");
    }

    #[test]
    fn workflow_assignments_round_trip() {
        let db = test_db();
        let repo = SettingsRepository::new(&db);

        let config = repo
            .create_api_config(CreateApiConfigRequest {
                provider: "openai".to_string(),
                auth_mode: "api_key".to_string(),
                name: "OpenAI".to_string(),
                base_url: None,
                model: Some("gpt-4o".to_string()),
                budget_limit: Some(10.0),
                is_default: true,
                display_name: None,
            })
            .expect("create config");

        let assignment = repo
            .upsert_workflow_assignment("knowledge_qa", &config.id)
            .expect("upsert assignment");

        assert_eq!(assignment.workflow_type, "knowledge_qa");
        assert_eq!(assignment.api_config_id, config.id);

        let loaded = repo
            .get_workflow_assignment("knowledge_qa")
            .expect("load assignment")
            .expect("assignment exists");
        assert_eq!(loaded.api_config_id, config.id);

        let related = repo
            .get_assignments_by_config_id(&config.id)
            .expect("list by config id");
        assert_eq!(related.len(), 1);

        repo.delete_workflow_assignment("knowledge_qa")
            .expect("delete assignment");
        assert!(repo
            .get_workflow_assignment("knowledge_qa")
            .expect("reload assignment")
            .is_none());
    }

    #[test]
    fn budget_usage_accumulates_and_respects_limit() {
        let db = test_db();
        let repo = SettingsRepository::new(&db);

        let config = repo
            .create_api_config(CreateApiConfigRequest {
                provider: "anthropic".to_string(),
                auth_mode: "api_key".to_string(),
                name: "Anthropic".to_string(),
                base_url: None,
                model: Some("claude-3-5-haiku-20241022".to_string()),
                budget_limit: Some(0.5),
                is_default: false,
                display_name: None,
            })
            .expect("create config");

        repo.increment_budget_usage(&config.id, 0.2)
            .expect("increment budget usage");
        repo.increment_budget_usage(&config.id, 0.35)
            .expect("increment budget usage again");

        let period = chrono::Utc::now().format("%Y-%m").to_string();
        let usage = repo
            .get_budget_usage(&config.id, &period)
            .expect("load budget usage")
            .expect("budget usage exists");

        assert!((usage.estimated_cost_usd - 0.55).abs() < f64::EPSILON);
        assert_eq!(usage.workflow_runs_count, 2);
        assert!(repo
            .check_budget_exceeded(&config.id)
            .expect("check budget exceeded"));
    }

    #[test]
    fn delete_api_config_cascades_workflow_assignments_and_budget_usage() {
        let db = test_db();
        let repo = SettingsRepository::new(&db);

        let config = repo
            .create_api_config(CreateApiConfigRequest {
                provider: "openai".to_string(),
                auth_mode: "api_key".to_string(),
                name: "Delete Me".to_string(),
                base_url: None,
                model: Some("gpt-4o-mini".to_string()),
                budget_limit: Some(5.0),
                is_default: false,
                display_name: None,
            })
            .expect("create config");

        repo.upsert_workflow_assignment("knowledge_qa", &config.id)
            .expect("create assignment");
        repo.increment_budget_usage(&config.id, 0.42)
            .expect("create budget usage");

        let period = chrono::Utc::now().format("%Y-%m").to_string();

        repo.delete_api_config(&config.id).expect("delete config");

        assert!(repo
            .get_api_config(&config.id)
            .expect("reload config")
            .is_none());
        assert!(repo
            .get_workflow_assignment("knowledge_qa")
            .expect("reload assignment")
            .is_none());
        assert!(repo
            .get_budget_usage(&config.id, &period)
            .expect("reload budget usage")
            .is_none());
    }

    #[test]
    fn create_qianfan_config_assigns_openai_compatible_protocol() {
        let db = test_db();
        let repo = SettingsRepository::new(&db);

        let created = repo
            .create_api_config(CreateApiConfigRequest {
                provider: "qianfan".to_string(),
                auth_mode: "api_key".to_string(),
                name: "百度千帆".to_string(),
                base_url: Some("https://qianfan.baidubce.com/v2".to_string()),
                model: Some("ernie-speed".to_string()),
                budget_limit: None,
                is_default: true,
                display_name: None,
            })
            .expect("create qianfan config");

        assert_eq!(created.provider, "custom_openai");
        assert_eq!(created.protocol.as_deref(), Some("openai-compatible"));
    }

    #[test]
    fn list_api_configs_normalizes_legacy_openai_compatible_rows() {
        let db = test_db();
        db.connection()
            .execute(
                "INSERT INTO api_configs (id, user_id, provider, protocol, auth_mode, name, base_url, model, budget_limit, is_enabled, is_default, created_at)
                 VALUES (?1, 'default', 'openai_compatible', 'openai-compatible', 'api_key', 'Legacy Compatible', 'http://localhost:11434/v1', 'qwen2.5', NULL, TRUE, TRUE, '2026-04-20T00:00:00Z')",
                params!["cfg-legacy-compatible"],
            )
            .expect("insert legacy row");

        let repo = SettingsRepository::new(&db);
        let configs = repo.list_api_configs().expect("list configs");

        assert_eq!(configs.len(), 1);
        assert_eq!(configs[0].provider, "custom_openai");
        assert_eq!(configs[0].protocol.as_deref(), Some("openai-compatible"));
    }
}
