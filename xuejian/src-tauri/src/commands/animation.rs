use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        AnimationRepository, AppendWorkflowEventRequest, CardAnimation, CardRepository,
        CompleteCardAnimationRequest, CreateCardAnimationRequest, CreateWorkflowRunRequest,
        FailedCardAnimationRequest, SettingsRepository, UpdateWorkflowRunRequest,
        WorkflowRepository,
    },
};

const ANIMATION_PRESET_ID: &str = "v3-1-card-animation";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardAnimationDto {
    pub id: String,
    pub card_id: String,
    pub run_id: Option<String>,
    pub anim_type: String,
    pub mode: String,
    pub script_json: String,
    pub video_path: Option<String>,
    pub poster_path: Option<String>,
    pub render_log_path: Option<String>,
    pub status: String,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub retryable: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl From<CardAnimation> for CardAnimationDto {
    fn from(animation: CardAnimation) -> Self {
        Self {
            id: animation.id,
            card_id: animation.card_id,
            run_id: animation.run_id,
            anim_type: animation.anim_type,
            mode: animation.mode,
            script_json: animation.script_json,
            video_path: animation.video_path,
            poster_path: animation.poster_path,
            render_log_path: animation.render_log_path,
            status: animation.status,
            error_code: animation.error_code,
            error_message: animation.error_message,
            retryable: animation.retryable,
            created_at: animation.created_at,
            updated_at: animation.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartCardAnimationDto {
    pub card_id: String,
    pub anim_type: Option<String>,
    pub mode: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnimationWorkflowResponse {
    status: Option<String>,
    script_json: Option<String>,
    video_path: Option<String>,
    poster_path: Option<String>,
    render_log_path: Option<String>,
    error_code: Option<String>,
    error_message: Option<String>,
    retryable: Option<bool>,
}

#[tauri::command]
pub fn start_card_animation_workflow(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    data: StartCardAnimationDto,
) -> CommandResult<CardAnimationDto> {
    let assigned_config_id = {
        let db = state.lock_db()?;
        let settings_repo = SettingsRepository::new(&db);
        let assignment = settings_repo
            .get_workflow_assignment("card_animation")?
            .ok_or_else(|| {
                CommandError::InvalidInput(
                    "card_animation 尚未分配 BYOK 配置，请先为该工作流指定可用模型配置。"
                        .to_string(),
                )
            })?;
        let profile = settings_repo
            .get_model_profile(&assignment.model_profile_id)?
            .ok_or(CommandError::NotFound)?;
        let config = settings_repo
            .get_api_config(&profile.api_config_id)?
            .ok_or(CommandError::NotFound)?;

        if !config.is_enabled {
            return Err(CommandError::InvalidInput(
                "card_animation 绑定的 BYOK 配置已禁用，请重新分配可用配置。".to_string(),
            ));
        }

        if config.auth_mode == "adc" {
            return Err(CommandError::InvalidInput(
                "card_animation 当前仅支持 api_key 模式的 BYOK 配置，Google ADC 仍为非 GA 能力。"
                    .to_string(),
            ));
        }

        config.id
    };

    {
        let mut secrets = state.lock_secrets()?;
        if !secrets.has_api_key(&assigned_config_id)? {
            return Err(CommandError::InvalidInput(
                "card_animation 绑定的 BYOK 配置尚未存储 API Key。".to_string(),
            ));
        }
    }

    let animation = {
        let db = state.lock_db()?;
        let card_repo = CardRepository::new(&db);
        let animation_repo = AnimationRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);

        let card = card_repo
            .get_card_by_id(&data.card_id)?
            .ok_or(CommandError::NotFound)?;

        let anim_type = data
            .anim_type
            .unwrap_or_else(|| "flashcard_reveal".to_string());
        if !matches!(anim_type.as_str(), "flashcard_reveal" | "keyword_emphasis") {
            return Err(CommandError::InvalidInput(format!(
                "Unsupported animation type: {anim_type}"
            )));
        }

        let mode = data.mode.unwrap_or_else(|| "quick_preview".to_string());
        if !matches!(mode.as_str(), "quick_preview" | "video_render") {
            return Err(CommandError::InvalidInput(format!(
                "Unsupported animation mode: {mode}"
            )));
        }

        let run = workflow_repo.create_run(CreateWorkflowRunRequest {
            workflow_type: "card_animation".to_string(),
            preset_id: Some(ANIMATION_PRESET_ID.to_string()),
            status: "queued".to_string(),
            thread_id: format!("card-animation:{}", card.id),
            started_at: None,
        })?;

        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run.id.clone(),
            event_type: "queued".to_string(),
            message: Some(format!(
                "Queued {mode} animation generation for card {}",
                card.id
            )),
            progress: Some(0.0),
            payload: None,
        })?;

        animation_repo.upsert(CreateCardAnimationRequest {
            card_id: card.id.clone(),
            run_id: Some(run.id.clone()),
            anim_type,
            mode,
        })?
    };

    spawn_animation_worker(app_handle, animation.card_id.clone());
    Ok(CardAnimationDto::from(animation))
}

#[tauri::command]
pub fn get_card_animation(
    state: State<'_, AppState>,
    card_id: String,
) -> CommandResult<Option<CardAnimationDto>> {
    let db = state.lock_db()?;
    let animation_repo = AnimationRepository::new(&db);
    Ok(animation_repo
        .get_by_card_id(&card_id)?
        .map(CardAnimationDto::from))
}

#[tauri::command]
pub fn delete_card_animation(state: State<'_, AppState>, card_id: String) -> CommandResult<()> {
    let db = state.lock_db()?;
    let animation_repo = AnimationRepository::new(&db);
    animation_repo.delete_by_card_id(&card_id)?;
    Ok(())
}

fn spawn_animation_worker(app_handle: AppHandle, card_id: String) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_animation_worker(&app_handle, &card_id).await {
            log::error!("Card animation worker for card {card_id} failed: {error}");
            let _ = mark_animation_failed(
                &app_handle,
                &card_id,
                FailedCardAnimationRequest {
                    error_code: Some("worker_failed".to_string()),
                    error_message: error.to_string(),
                    render_log_path: None,
                    retryable: true,
                },
            );
        }
    });
}

async fn execute_animation_worker(app_handle: &AppHandle, card_id: &str) -> CommandResult<()> {
    let (card, run_id, anim_type, mode) = {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let card_repo = CardRepository::new(&db);
        let animation_repo = AnimationRepository::new(&db);

        let card = card_repo
            .get_card_by_id(card_id)?
            .ok_or(CommandError::NotFound)?;
        let animation = animation_repo
            .get_by_card_id(card_id)?
            .ok_or(CommandError::NotFound)?;

        (card, animation.run_id, animation.anim_type, animation.mode)
    };

    let run_id_str = run_id.as_deref().unwrap_or("");

    {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let animation_repo = AnimationRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);

        animation_repo.set_generating(card_id)?;

        if !run_id_str.is_empty() {
            workflow_repo.update_run(
                run_id_str,
                UpdateWorkflowRunRequest {
                    status: Some("running".to_string()),
                    checkpoint_ref: Some("generating".to_string()),
                    approval_payload: None,
                    cost_usd: None,
                    error_message: None,
                    started_at: Some(chrono::Utc::now().to_rfc3339()),
                    finished_at: None,
                },
            )?;
            workflow_repo.append_event(AppendWorkflowEventRequest {
                run_id: run_id_str.to_string(),
                event_type: "started".to_string(),
                message: Some(format!("Generating {mode} animation")),
                progress: Some(0.1),
                payload: None,
            })?;
        }
    }

    let tags: Vec<String> = card
        .tags
        .as_ref()
        .and_then(|value| serde_json::from_value(value.clone()).ok())
        .unwrap_or_default();

    let response = match try_orchestration_animation(
        app_handle,
        run_id_str,
        &card.id,
        &card.front,
        &card.back,
        &tags,
        &anim_type,
        &mode,
    )
    .await
    {
        Ok(result) => result,
        Err(error) => {
            if mode == "quick_preview" {
                AnimationWorkflowResponse {
                    status: Some("ready".to_string()),
                    script_json: Some(build_fallback_script(
                        &anim_type,
                        &card.front,
                        &card.back,
                        &tags,
                    )),
                    video_path: None,
                    poster_path: None,
                    render_log_path: None,
                    error_code: Some("fallback_preview".to_string()),
                    error_message: Some(error),
                    retryable: Some(true),
                }
            } else {
                AnimationWorkflowResponse {
                    status: Some("failed".to_string()),
                    script_json: None,
                    video_path: None,
                    poster_path: None,
                    render_log_path: None,
                    error_code: Some("renderer_unavailable".to_string()),
                    error_message: Some(error),
                    retryable: Some(false),
                }
            }
        }
    };

    {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let animation_repo = AnimationRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);

        match response.status.as_deref().unwrap_or("ready") {
            "failed" => {
                let failed = FailedCardAnimationRequest {
                    error_code: response.error_code.clone(),
                    error_message: response
                        .error_message
                        .clone()
                        .unwrap_or_else(|| "Animation render failed".to_string()),
                    render_log_path: response.render_log_path.clone(),
                    retryable: response.retryable.unwrap_or(true),
                };
                animation_repo.set_failed(card_id, failed)?;

                if !run_id_str.is_empty() {
                    workflow_repo.update_run(
                        run_id_str,
                        UpdateWorkflowRunRequest {
                            status: Some("failed".to_string()),
                            checkpoint_ref: Some("failed".to_string()),
                            approval_payload: None,
                            cost_usd: None,
                            error_message: response.error_message.clone(),
                            started_at: None,
                            finished_at: Some(chrono::Utc::now().to_rfc3339()),
                        },
                    )?;
                    workflow_repo.append_event(AppendWorkflowEventRequest {
                        run_id: run_id_str.to_string(),
                        event_type: "failed".to_string(),
                        message: response.error_message.clone(),
                        progress: None,
                        payload: None,
                    })?;
                }
            }
            _ => {
                animation_repo.set_ready(
                    card_id,
                    CompleteCardAnimationRequest {
                        script_json: response.script_json.clone(),
                        video_path: response.video_path.clone(),
                        poster_path: response.poster_path.clone(),
                        render_log_path: response.render_log_path.clone(),
                        error_code: response.error_code.clone(),
                        error_message: response.error_message.clone(),
                        retryable: response.retryable,
                    },
                )?;

                if !run_id_str.is_empty() {
                    let fallback_payload = response.error_code.as_ref().map(|error_code| {
                        serde_json::json!({
                            "fallbackUsed": true,
                            "errorCode": error_code,
                            "errorMessage": response.error_message.clone(),
                        })
                    });
                    workflow_repo.update_run(
                        run_id_str,
                        UpdateWorkflowRunRequest {
                            status: Some("completed".to_string()),
                            checkpoint_ref: Some("ready".to_string()),
                            approval_payload: None,
                            cost_usd: None,
                            error_message: response.error_message.clone(),
                            started_at: None,
                            finished_at: Some(chrono::Utc::now().to_rfc3339()),
                        },
                    )?;
                    workflow_repo.append_event(AppendWorkflowEventRequest {
                        run_id: run_id_str.to_string(),
                        event_type: if response.error_code.is_some() {
                            "fallback".to_string()
                        } else {
                            "completed".to_string()
                        },
                        message: Some(if response.error_code.is_some() {
                            "Animation ready via fallback preview".to_string()
                        } else {
                            "Animation ready".to_string()
                        }),
                        progress: Some(1.0),
                        payload: fallback_payload,
                    })?;
                }
            }
        }
    }

    Ok(())
}

async fn try_orchestration_animation(
    app_handle: &AppHandle,
    run_id: &str,
    card_id: &str,
    front: &str,
    back: &str,
    tags: &[String],
    anim_type: &str,
    mode: &str,
) -> Result<AnimationWorkflowResponse, String> {
    let state = app_handle.state::<AppState>();
    let health = state
        .orchestration
        .health()
        .await
        .map_err(|error| error.to_string())?;
    let endpoint = health.endpoint.ok_or("No orchestration endpoint")?;
    if health.status != "healthy" && health.status != "degraded" {
        return Err(format!("Orchestration service status: {}", health.status));
    }

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .post(format!("{endpoint}/workflows/card-animation"))
        .json(&serde_json::json!({
            "runId": run_id,
            "cardId": card_id,
            "front": front,
            "back": back,
            "tags": tags,
            "animType": anim_type,
            "mode": mode,
        }))
        .send()
        .await
        .map_err(|error| format!("Orchestration request failed: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Orchestration returned {status}: {body}"));
    }

    response
        .json::<AnimationWorkflowResponse>()
        .await
        .map_err(|error| error.to_string())
}

fn build_fallback_script(anim_type: &str, front: &str, back: &str, tags: &[String]) -> String {
    let palette = if tags.contains(&"warm".to_string()) {
        "warm"
    } else if tags.contains(&"cool".to_string()) {
        "cool"
    } else {
        "default"
    };

    let script = match anim_type {
        "keyword_emphasis" => {
            let emphasis: Vec<&str> = front.split_whitespace().take(3).collect();
            serde_json::json!({
                "type": "keyword_emphasis",
                "title": front,
                "palette": palette,
                "steps": [
                    {
                        "id": "s1",
                        "type": "text",
                        "content": front,
                        "emphasis": emphasis,
                        "delay_ms": 0
                    },
                    {
                        "id": "s2",
                        "type": "text",
                        "content": back,
                        "emphasis": [],
                        "delay_ms": 400
                    }
                ]
            })
        }
        _ => serde_json::json!({
            "type": "flashcard_reveal",
            "title": front,
            "palette": palette,
            "steps": [
                {
                    "id": "s1",
                    "type": "text",
                    "content": front,
                    "emphasis": [],
                    "delay_ms": 0
                },
                {
                    "id": "s2",
                    "type": "reveal",
                    "content": back,
                    "emphasis": [],
                    "delay_ms": 600
                }
            ]
        }),
    };

    serde_json::to_string(&script).unwrap_or_else(|_| "{}".to_string())
}

fn mark_animation_failed(
    app_handle: &AppHandle,
    card_id: &str,
    request: FailedCardAnimationRequest,
) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let animation_repo = AnimationRepository::new(&db);
    animation_repo.set_failed(card_id, request)?;

    if let Ok(Some(animation)) = animation_repo.get_by_card_id(card_id) {
        if let Some(run_id) = animation.run_id {
            let workflow_repo = WorkflowRepository::new(&db);
            let _ = workflow_repo.update_run(
                &run_id,
                UpdateWorkflowRunRequest {
                    status: Some("failed".to_string()),
                    checkpoint_ref: Some("failed".to_string()),
                    approval_payload: None,
                    cost_usd: None,
                    error_message: animation.error_message.clone(),
                    started_at: None,
                    finished_at: Some(chrono::Utc::now().to_rfc3339()),
                },
            );
            let _ = workflow_repo.append_event(AppendWorkflowEventRequest {
                run_id,
                event_type: "failed".to_string(),
                message: animation.error_message.clone(),
                progress: None,
                payload: None,
            });
        }
    }
    Ok(())
}
