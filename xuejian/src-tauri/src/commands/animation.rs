use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        AnimationRepository, AppendWorkflowEventRequest, CardAnimation, CardRepository,
        CreateCardAnimationRequest, CreateWorkflowRunRequest, SettingsRepository,
        UpdateWorkflowRunRequest, WorkflowRepository,
    },
};

const ANIMATION_PRESET_ID: &str = "v3-1-card-animation";

// ───── DTOs ─────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardAnimationDto {
    pub id: String,
    pub card_id: String,
    pub run_id: Option<String>,
    pub anim_type: String,
    pub script_json: String,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<CardAnimation> for CardAnimationDto {
    fn from(a: CardAnimation) -> Self {
        Self {
            id: a.id,
            card_id: a.card_id,
            run_id: a.run_id,
            anim_type: a.anim_type,
            script_json: a.script_json,
            status: a.status,
            error_message: a.error_message,
            created_at: a.created_at,
            updated_at: a.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartCardAnimationDto {
    pub card_id: String,
    /// Optional preferred type; server will determine best fit if absent.
    pub anim_type: Option<String>,
}

// ───── Commands ─────

/// Start (or restart) animation generation for a card.
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
        let config = settings_repo
            .get_api_config(&assignment.api_config_id)?
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
        let secrets = state.lock_secrets()?;
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

        // Create a WorkflowRun to track progress
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
            message: Some(format!("Queued animation generation for card {}", card.id)),
            progress: Some(0.0),
            payload: None,
        })?;

        // Upsert animation record (replaces any previous one)
        let animation = animation_repo.upsert(CreateCardAnimationRequest {
            card_id: card.id.clone(),
            run_id: Some(run.id.clone()),
            anim_type,
        })?;

        animation
    };

    spawn_animation_worker(app_handle, animation.card_id.clone());
    Ok(CardAnimationDto::from(animation))
}

/// Get the current animation for a card, if any.
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

/// Delete the animation for a card.
#[tauri::command]
pub fn delete_card_animation(state: State<'_, AppState>, card_id: String) -> CommandResult<()> {
    let db = state.lock_db()?;
    let animation_repo = AnimationRepository::new(&db);
    animation_repo.delete_by_card_id(&card_id)?;
    Ok(())
}

// ───── Worker ─────

fn spawn_animation_worker(app_handle: AppHandle, card_id: String) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_animation_worker(&app_handle, &card_id).await {
            log::error!("Card animation worker for card {card_id} failed: {error}");
            let _ = mark_animation_failed(&app_handle, &card_id, &error.to_string());
        }
    });
}

async fn execute_animation_worker(app_handle: &AppHandle, card_id: &str) -> CommandResult<()> {
    // Load the card and current animation record
    let (card, run_id, anim_type) = {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let card_repo = CardRepository::new(&db);
        let animation_repo = AnimationRepository::new(&db);

        let card = card_repo
            .get_card_by_id(card_id)?
            .ok_or(CommandError::NotFound)?;
        let anim = animation_repo
            .get_by_card_id(card_id)?
            .ok_or(CommandError::NotFound)?;

        (card, anim.run_id, anim.anim_type)
    };

    let run_id_str = run_id.as_deref().unwrap_or("");

    // Mark generating
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
                message: Some(format!("Generating {} animation", anim_type)),
                progress: Some(0.1),
                payload: None,
            })?;
        }
    }

    // Try Python orchestration service
    // Decode tags from JSON value to Vec<String>
    let tags: Vec<String> = card
        .tags
        .as_ref()
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let orchestration_result = try_orchestration_animation(
        app_handle,
        run_id_str,
        &card.id,
        &card.front,
        &card.back,
        &tags,
        &anim_type,
    )
    .await;

    let script_json = match orchestration_result {
        Ok(script) => script,
        Err(error) => {
            log::warn!("Python orchestration unavailable for animation, using fallback: {error}");
            // Fallback: deterministic rule-based AnimationScript
            build_fallback_script(&anim_type, &card.front, &card.back, &tags)
        }
    };

    // Persist result
    {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let animation_repo = AnimationRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);

        animation_repo.set_ready(card_id, &script_json)?;

        if !run_id_str.is_empty() {
            workflow_repo.update_run(
                run_id_str,
                UpdateWorkflowRunRequest {
                    status: Some("completed".to_string()),
                    checkpoint_ref: Some("ready".to_string()),
                    approval_payload: None,
                    cost_usd: None,
                    error_message: None,
                    started_at: None,
                    finished_at: Some(chrono::Utc::now().to_rfc3339()),
                },
            )?;
            workflow_repo.append_event(AppendWorkflowEventRequest {
                run_id: run_id_str.to_string(),
                event_type: "completed".to_string(),
                message: Some("Animation ready".to_string()),
                progress: Some(1.0),
                payload: None,
            })?;
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
) -> Result<String, String> {
    let state = app_handle.state::<AppState>();
    let health = state
        .orchestration
        .health()
        .await
        .map_err(|e| e.to_string())?;
    let endpoint = health.endpoint.ok_or("No orchestration endpoint")?;
    if health.status != "healthy" && health.status != "degraded" {
        return Err(format!("Orchestration service status: {}", health.status));
    }

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .post(format!("{endpoint}/workflows/card-animation"))
        .json(&serde_json::json!({
            "runId": run_id,
            "cardId": card_id,
            "front": front,
            "back": back,
            "tags": tags,
            "animType": anim_type,
        }))
        .send()
        .await
        .map_err(|e| format!("Orchestration request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Orchestration returned {status}: {body}"));
    }

    let result: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let script = result["scriptJson"]
        .as_str()
        .ok_or("Missing scriptJson in response")?
        .to_string();
    Ok(script)
}

/// Deterministic fallback: build a simple AnimationScript without LLM.
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
            // Extract emphasis words: first 3 words from front as highlights
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
        _ => {
            // flashcard_reveal
            serde_json::json!({
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
            })
        }
    };

    serde_json::to_string(&script).unwrap_or_else(|_| "{}".to_string())
}

fn mark_animation_failed(app_handle: &AppHandle, card_id: &str, error: &str) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let animation_repo = AnimationRepository::new(&db);
    animation_repo.set_failed(card_id, error)?;

    // Also try to mark the run as failed
    if let Ok(Some(anim)) = animation_repo.get_by_card_id(card_id) {
        if let Some(run_id) = anim.run_id {
            let workflow_repo = WorkflowRepository::new(&db);
            let _ = workflow_repo.update_run(
                &run_id,
                UpdateWorkflowRunRequest {
                    status: Some("failed".to_string()),
                    checkpoint_ref: None,
                    approval_payload: None,
                    cost_usd: None,
                    error_message: Some(error.to_string()),
                    started_at: None,
                    finished_at: Some(chrono::Utc::now().to_rfc3339()),
                },
            );
            let _ = workflow_repo.append_event(AppendWorkflowEventRequest {
                run_id,
                event_type: "failed".to_string(),
                message: Some(error.to_string()),
                progress: None,
                payload: None,
            });
        }
    }
    Ok(())
}
