use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        CreateWorkflowRunRequest, AppendWorkflowEventRequest, SettingsRepository,
        UpdateWorkflowRunRequest, UpsertWorkflowCheckpointRequest, WorkflowRepository, WorkflowRun,
    },
};

const AGENT_TASK_TIMEOUT_SECONDS: u64 = 300;
const AGENT_CARD_TIMEOUT_SECONDS: u64 = 300;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAgentTaskDto {
    pub user_request: String,
    #[serde(default)]
    pub document_ids: Vec<String>,
    #[serde(default)]
    pub card_group_ids: Vec<String>,
    #[serde(default)]
    pub allow_formal_card_write: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAgentCardGenerationDto {
    pub user_request: String,
    #[serde(default)]
    pub document_ids: Vec<String>,
    #[serde(default = "default_card_count_hint")]
    pub card_count_hint: usize,
    #[serde(default = "default_difficulty")]
    pub difficulty: String,
}

fn default_card_count_hint() -> usize {
    6
}

fn default_difficulty() -> String {
    "medium".to_string()
}

#[tauri::command]
pub fn start_agent_task_workflow(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    data: StartAgentTaskDto,
) -> CommandResult<WorkflowRun> {
    if data.user_request.trim().is_empty() {
        return Err(CommandError::InvalidInput(
            "Agent request must not be empty".to_string(),
        ));
    }

    let run = create_agent_run(
        &state,
        "agent_task",
        "Agent task queued",
        json!({
            "userRequest": data.user_request,
            "documentIds": data.document_ids,
            "cardGroupIds": data.card_group_ids,
            "allowFormalCardWrite": data.allow_formal_card_write,
        }),
    )?;
    spawn_agent_task_worker(app_handle, run.id.clone(), data);
    Ok(run)
}

#[tauri::command]
pub fn start_agent_card_generation_workflow(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    data: StartAgentCardGenerationDto,
) -> CommandResult<WorkflowRun> {
    if data.user_request.trim().is_empty() {
        return Err(CommandError::InvalidInput(
            "Agent card request must not be empty".to_string(),
        ));
    }
    if data.document_ids.is_empty() {
        return Err(CommandError::InvalidInput(
            "At least one document is required for agent card generation".to_string(),
        ));
    }

    let run = create_agent_run(
        &state,
        "agent_card_generation",
        "Agent card generation queued",
        json!({
            "userRequest": data.user_request,
            "documentIds": data.document_ids,
            "cardCountHint": data.card_count_hint,
            "difficulty": data.difficulty,
            "writeMode": "formal_card",
        }),
    )?;
    spawn_agent_card_worker(app_handle, run.id.clone(), data);
    Ok(run)
}

fn create_agent_run(
    state: &State<'_, AppState>,
    workflow_type: &str,
    queued_message: &str,
    payload: Value,
) -> CommandResult<WorkflowRun> {
    let db = state.lock_db()?;
    let repo = WorkflowRepository::new(&db);
    let run = repo.create_run(CreateWorkflowRunRequest {
        workflow_type: workflow_type.to_string(),
        preset_id: None,
        status: "queued".to_string(),
        thread_id: format!("{workflow_type}:{}", uuid::Uuid::new_v4()),
        started_at: None,
    })?;
    repo.append_event(AppendWorkflowEventRequest {
        run_id: run.id.clone(),
        event_type: "queued".to_string(),
        message: Some(queued_message.to_string()),
        progress: Some(0.0),
        payload: Some(payload),
    })?;
    Ok(run)
}

fn spawn_agent_task_worker(app_handle: AppHandle, run_id: String, data: StartAgentTaskDto) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_agent_task_worker(&app_handle, &run_id, data).await {
            mark_agent_run_failed(&app_handle, &run_id, &error.to_string());
        }
    });
}

fn spawn_agent_card_worker(app_handle: AppHandle, run_id: String, data: StartAgentCardGenerationDto) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_agent_card_worker(&app_handle, &run_id, data).await {
            mark_agent_run_failed(&app_handle, &run_id, &error.to_string());
        }
    });
}

async fn execute_agent_task_worker(
    app_handle: &AppHandle,
    run_id: &str,
    data: StartAgentTaskDto,
) -> CommandResult<()> {
    mark_agent_run_running(app_handle, run_id, "Agent task started")?;
    let result = post_orchestration_json(
        app_handle,
        "/workflows/agent-task",
        json!({
            "runId": run_id,
            "taskType": "compound_study_task",
            "userRequest": data.user_request,
            "documentIds": data.document_ids,
            "cardGroupIds": data.card_group_ids,
            "options": {
                "allowFormalCardWrite": data.allow_formal_card_write,
            },
        }),
        AGENT_TASK_TIMEOUT_SECONDS,
    )
    .await?;
    complete_agent_run(app_handle, run_id, result)
}

async fn execute_agent_card_worker(
    app_handle: &AppHandle,
    run_id: &str,
    data: StartAgentCardGenerationDto,
) -> CommandResult<()> {
    mark_agent_run_running(app_handle, run_id, "Agent card generation started")?;
    let provider_config_id = resolve_card_generation_provider_config_id(app_handle)?;
    let result = post_orchestration_json(
        app_handle,
        "/workflows/agent-card-generation",
        json!({
            "runId": run_id,
            "documentIds": data.document_ids,
            "evidenceArtifactRefs": [format!("agent-panel://runs/{run_id}/document_evidence")],
            "cardCountHint": data.card_count_hint,
            "difficulty": data.difficulty,
            "writeMode": "formal_card",
            "providerConfigId": provider_config_id,
        }),
        AGENT_CARD_TIMEOUT_SECONDS,
    )
    .await?;
    complete_agent_run(app_handle, run_id, result)
}

async fn post_orchestration_json(
    app_handle: &AppHandle,
    path: &str,
    payload: Value,
    timeout_seconds: u64,
) -> CommandResult<Value> {
    let state = app_handle.state::<AppState>();
    let health = state
        .orchestration
        .health()
        .await
        .map_err(|error| CommandError::Internal(error.to_string()))?;
    let endpoint = health.endpoint.ok_or(CommandError::Internal(
        "Orchestration service not available".to_string(),
    ))?;
    if health.status != "healthy" && health.status != "degraded" {
        return Err(CommandError::Internal(format!(
            "Orchestration service status: {}",
            health.status
        )));
    }

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(timeout_seconds))
        .build()
        .map_err(|error| CommandError::Internal(error.to_string()))?;
    let response = client
        .post(format!("{endpoint}{path}"))
        .json(&payload)
        .send()
        .await
        .map_err(|error| CommandError::Internal(format!("Orchestration request failed: {error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Internal(format!(
            "Orchestration returned {status}: {body}"
        )));
    }
    response
        .json::<Value>()
        .await
        .map_err(|error| CommandError::Internal(format!("Invalid orchestration response: {error}")))
}

fn resolve_card_generation_provider_config_id(app_handle: &AppHandle) -> CommandResult<String> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    let assignment = repo
        .get_workflow_assignment("agent_card_generation")?
        .or_else(|| repo.get_workflow_assignment("card_generation").ok().flatten())
        .ok_or_else(|| {
            CommandError::InvalidInput(
                "No card_generation workflow model assignment is configured".to_string(),
            )
        })?;
    let profile = repo
        .get_model_profile(&assignment.model_profile_id)?
        .ok_or_else(|| CommandError::InvalidInput("Assigned model profile was not found".to_string()))?;
    Ok(profile.api_config_id)
}

fn mark_agent_run_running(
    app_handle: &AppHandle,
    run_id: &str,
    message: &str,
) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = WorkflowRepository::new(&db);
    repo.update_run(
        run_id,
        UpdateWorkflowRunRequest {
            status: Some("running".to_string()),
            checkpoint_ref: None,
            approval_payload: None,
            cost_usd: None,
            error_message: None,
            started_at: Some(chrono::Utc::now().to_rfc3339()),
            finished_at: None,
        },
    )?;
    repo.append_event(AppendWorkflowEventRequest {
        run_id: run_id.to_string(),
        event_type: "started".to_string(),
        message: Some(message.to_string()),
        progress: Some(0.1),
        payload: None,
    })?;
    Ok(())
}

fn complete_agent_run(app_handle: &AppHandle, run_id: &str, result: Value) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let repo = WorkflowRepository::new(&db);
    let artifact_repo = crate::db::ArtifactRepository::new(&db);
    let checkpoint_ref = "final";
    let status = result
        .get("status")
        .and_then(Value::as_str)
        .filter(|value| matches!(*value, "completed" | "partial" | "failed" | "paused" | "cancelled"))
        .unwrap_or("completed");
    let run_status = match status {
        "failed" => "failed",
        "paused" => "paused",
        "cancelled" => "cancelled",
        _ => "completed",
    };

    repo.upsert_checkpoint(UpsertWorkflowCheckpointRequest {
        run_id: run_id.to_string(),
        checkpoint_ref: checkpoint_ref.to_string(),
        step_key: Some("agent-result".to_string()),
        payload: result.clone(),
    })?;
    let _ = artifact_repo.upsert_from_workflow_result(run_id, &result);
    repo.append_event(AppendWorkflowEventRequest {
        run_id: run_id.to_string(),
        event_type: "completed".to_string(),
        message: Some("Agent workflow completed".to_string()),
        progress: Some(1.0),
        payload: Some(result.clone()),
    })?;
    repo.update_run(
        run_id,
        UpdateWorkflowRunRequest {
            status: Some(run_status.to_string()),
            checkpoint_ref: Some(checkpoint_ref.to_string()),
            approval_payload: Some(result),
            cost_usd: None,
            error_message: None,
            started_at: None,
            finished_at: Some(chrono::Utc::now().to_rfc3339()),
        },
    )?;
    Ok(())
}

fn mark_agent_run_failed(app_handle: &AppHandle, run_id: &str, error: &str) {
    let state = app_handle.state::<AppState>();
    let Ok(db) = state.lock_db() else {
        return;
    };
    let repo = WorkflowRepository::new(&db);
    let error_category = classify_agent_error(error);
    let payload = json!({
        "status": "failed",
        "summary": stable_agent_error_summary(error_category),
        "errorCategory": error_category,
        "qualityEnvelope": {
            "groundingStatus": "not_applicable",
            "auditStatus": "failed",
            "confidence": 0.0,
            "riskLevel": "high",
            "reviewRequired": true,
            "blockingReasons": [error_category],
        },
        "artifactRefs": {
            "trace": [],
        },
    });
    let _ = repo.upsert_checkpoint(UpsertWorkflowCheckpointRequest {
        run_id: run_id.to_string(),
        checkpoint_ref: "failed".to_string(),
        step_key: Some("agent-result".to_string()),
        payload: payload.clone(),
    });
    let _ = repo.append_event(AppendWorkflowEventRequest {
        run_id: run_id.to_string(),
        event_type: "failed".to_string(),
        message: Some(format!("Agent workflow failed: {error}")),
        progress: None,
        payload: Some(payload.clone()),
    });
    let _ = repo.update_run(
        run_id,
        UpdateWorkflowRunRequest {
            status: Some("failed".to_string()),
            checkpoint_ref: Some("failed".to_string()),
            approval_payload: Some(payload),
            cost_usd: None,
            error_message: Some(error.to_string()),
            started_at: None,
            finished_at: Some(chrono::Utc::now().to_rfc3339()),
        },
    );
}

fn classify_agent_error(error: &str) -> &'static str {
    let lower = error.to_lowercase();
    if lower.contains("timed out") || lower.contains("timeout") {
        "provider_timeout"
    } else if lower.contains("field required")
        || lower.contains("extra inputs")
        || lower.contains("validation")
    {
        "provider_validation_failed"
    } else if lower.contains("json") {
        "provider_invalid_json"
    } else if lower.contains("host gateway") || lower.contains("orchestration service not available") {
        "host_gateway_error"
    } else {
        "workflow_exception"
    }
}

fn stable_agent_error_summary(error_category: &str) -> &'static str {
    match error_category {
        "provider_timeout" => "Model request timed out. Try a smaller document scope, fewer cards, or a more reliable provider.",
        "provider_validation_failed" => "The model response did not match the workflow contract. Retry or switch models.",
        "provider_invalid_json" => "The model returned invalid JSON. Retry or switch models.",
        "host_gateway_error" => "Host Gateway or orchestration service is unavailable. Check local services and retry.",
        _ => "Workflow failed with an internal exception.",
    }
}

// ── Phase 10: Long-running task controls ────────────────────

#[tauri::command]
pub fn pause_agent_task(
    state: State<'_, AppState>,
    run_id: String,
) -> CommandResult<WorkflowRun> {
    let db = state.lock_db()?;
    let repo = WorkflowRepository::new(&db);

    let Some(current) = repo.get_run(&run_id)? else {
        return Err(CommandError::InvalidInput("Run not found".to_string()));
    };

    if current.status != "running" {
        return Err(CommandError::InvalidInput(
            "Only running tasks can be paused".to_string(),
        ));
    }

    repo.append_event(AppendWorkflowEventRequest {
        run_id: run_id.clone(),
        event_type: "paused".to_string(),
        message: Some("Agent task paused by user".to_string()),
        progress: None,
        payload: None,
    })?;

    let updated = repo.update_run(
        &run_id,
        UpdateWorkflowRunRequest {
            status: Some("paused".to_string()),
            checkpoint_ref: None,
            approval_payload: None,
            cost_usd: None,
            error_message: None,
            started_at: None,
            finished_at: None,
        },
    )?;

    updated.ok_or_else(|| CommandError::Internal("Failed to pause run".to_string()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeAgentTaskDto {
    pub run_id: String,
    pub user_request: String,
    #[serde(default)]
    pub document_ids: Vec<String>,
    #[serde(default)]
    pub card_group_ids: Vec<String>,
    #[serde(default)]
    pub allow_formal_card_write: bool,
}

#[tauri::command]
pub fn resume_agent_task(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    data: ResumeAgentTaskDto,
) -> CommandResult<WorkflowRun> {
    let db = state.lock_db()?;
    let repo = WorkflowRepository::new(&db);

    let Some(current) = repo.get_run(&data.run_id)? else {
        return Err(CommandError::InvalidInput("Run not found".to_string()));
    };

    if !matches!(current.status.as_str(), "paused" | "waiting_for_user" | "partial") {
        return Err(CommandError::InvalidInput(
            "Only paused, waiting_for_user or partial tasks can be resumed".to_string(),
        ));
    }

    repo.append_event(AppendWorkflowEventRequest {
        run_id: data.run_id.clone(),
        event_type: "resumed".to_string(),
        message: Some("Agent task resumed".to_string()),
        progress: None,
        payload: None,
    })?;

    let updated = repo.update_run(
        &data.run_id,
        UpdateWorkflowRunRequest {
            status: Some("running".to_string()),
            checkpoint_ref: None,
            approval_payload: None,
            cost_usd: None,
            error_message: None,
            started_at: None,
            finished_at: None,
        },
    )?;

    let run = updated.ok_or_else(|| CommandError::Internal("Failed to resume run".to_string()))?;

    // Spawn a worker that calls the Python resume endpoint
    spawn_resume_agent_task_worker(app_handle, data.run_id.clone(), data);
    Ok(run)
}

fn spawn_resume_agent_task_worker(app_handle: AppHandle, run_id: String, data: ResumeAgentTaskDto) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_resume_agent_task_worker(&app_handle, &run_id, data).await {
            mark_agent_run_failed(&app_handle, &run_id, &error.to_string());
        }
    });
}

async fn execute_resume_agent_task_worker(
    app_handle: &AppHandle,
    run_id: &str,
    data: ResumeAgentTaskDto,
) -> CommandResult<()> {
    mark_agent_run_running(app_handle, run_id, "Agent task resumed")?;
    let result = post_orchestration_json(
        app_handle,
        "/workflows/agent-task/resume",
        json!({
            "runId": run_id,
            "taskType": "compound_study_task",
            "userRequest": data.user_request,
            "documentIds": data.document_ids,
            "cardGroupIds": data.card_group_ids,
            "options": {
                "allowFormalCardWrite": data.allow_formal_card_write,
            },
        }),
        AGENT_TASK_TIMEOUT_SECONDS,
    )
    .await?;
    complete_agent_run(app_handle, run_id, result)
}

#[tauri::command]
pub fn cancel_agent_task(
    state: State<'_, AppState>,
    run_id: String,
) -> CommandResult<WorkflowRun> {
    let db = state.lock_db()?;
    let repo = WorkflowRepository::new(&db);

    let Some(current) = repo.get_run(&run_id)? else {
        return Err(CommandError::InvalidInput("Run not found".to_string()));
    };

    if !matches!(current.status.as_str(), "queued" | "running" | "paused" | "waiting_for_user" | "partial") {
        return Err(CommandError::InvalidInput(
            "Task cannot be cancelled in its current state".to_string(),
        ));
    }

    repo.append_event(AppendWorkflowEventRequest {
        run_id: run_id.clone(),
        event_type: "cancelled".to_string(),
        message: Some("Agent task cancelled by user".to_string()),
        progress: None,
        payload: None,
    })?;

    let updated = repo.update_run(
        &run_id,
        UpdateWorkflowRunRequest {
            status: Some("cancelled".to_string()),
            checkpoint_ref: None,
            approval_payload: None,
            cost_usd: None,
            error_message: None,
            started_at: None,
            finished_at: Some(chrono::Utc::now().to_rfc3339()),
        },
    )?;

    updated.ok_or_else(|| CommandError::Internal("Failed to cancel run".to_string()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinueAgentTaskDto {
    pub user_request: String,
    pub parent_run_id: String,
    pub follow_up_message: String,
    #[serde(default)]
    pub document_ids: Vec<String>,
    #[serde(default)]
    pub card_group_ids: Vec<String>,
    #[serde(default)]
    pub allow_formal_card_write: bool,
}

#[tauri::command]
pub fn continue_agent_task(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    data: ContinueAgentTaskDto,
) -> CommandResult<WorkflowRun> {
    if data.user_request.trim().is_empty() {
        return Err(CommandError::InvalidInput(
            "Agent request must not be empty".to_string(),
        ));
    }

    let run = create_agent_run(
        &state,
        "agent_task",
        "Agent task continued from previous run",
        json!({
            "userRequest": data.user_request,
            "parentRunId": data.parent_run_id,
            "followUpMessage": data.follow_up_message,
            "documentIds": data.document_ids,
            "cardGroupIds": data.card_group_ids,
            "allowFormalCardWrite": data.allow_formal_card_write,
        }),
    )?;

    spawn_continue_agent_task_worker(app_handle, run.id.clone(), data);
    Ok(run)
}

fn spawn_continue_agent_task_worker(app_handle: AppHandle, run_id: String, data: ContinueAgentTaskDto) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_continue_agent_task_worker(&app_handle, &run_id, data).await {
            mark_agent_run_failed(&app_handle, &run_id, &error.to_string());
        }
    });
}

async fn execute_continue_agent_task_worker(
    app_handle: &AppHandle,
    run_id: &str,
    data: ContinueAgentTaskDto,
) -> CommandResult<()> {
    mark_agent_run_running(app_handle, run_id, "Agent task continued")?;
    let result = post_orchestration_json(
        app_handle,
        "/workflows/agent-task/continue",
        json!({
            "runId": run_id,
            "taskType": "compound_study_task",
            "userRequest": data.user_request,
            "parentRunId": data.parent_run_id,
            "followUpMessage": data.follow_up_message,
            "documentIds": data.document_ids,
            "cardGroupIds": data.card_group_ids,
            "options": {
                "allowFormalCardWrite": data.allow_formal_card_write,
            },
        }),
        AGENT_TASK_TIMEOUT_SECONDS,
    )
    .await?;
    complete_agent_run(app_handle, run_id, result)
}
