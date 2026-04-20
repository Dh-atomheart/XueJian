use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        CreateWorkflowRunRequest, UpdateWorkflowRunRequest, WorkflowCheckpoint, WorkflowEvent,
        WorkflowRepository, WorkflowRun,
    },
    gateway::{self, GatewayManifest},
    tasks::ServiceHealthStatus,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkflowRunDto {
    pub workflow_type: String,
    pub preset_id: Option<String>,
    pub thread_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorkflowRunDto {
    pub status: Option<String>,
    pub checkpoint_ref: Option<String>,
    pub approval_payload: Option<serde_json::Value>,
    pub cost_usd: Option<f64>,
    pub error_message: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

#[tauri::command]
pub fn get_host_gateway_manifest() -> GatewayManifest {
    gateway::host_gateway_manifest()
}

#[tauri::command]
pub async fn get_orchestration_service_health(
    state: State<'_, AppState>,
) -> CommandResult<ServiceHealthStatus> {
    Ok(state.orchestration.health().await?)
}

#[tauri::command]
pub async fn restart_orchestration_service(
    state: State<'_, AppState>,
) -> CommandResult<ServiceHealthStatus> {
    Ok(state.orchestration.restart().await?)
}

#[tauri::command]
pub async fn stop_orchestration_service(state: State<'_, AppState>) -> CommandResult<()> {
    state.orchestration.stop().await?;
    Ok(())
}

#[tauri::command]
pub fn list_workflow_runs(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> CommandResult<Vec<WorkflowRun>> {
    let db = state.lock_db()?;
    let repo = WorkflowRepository::new(&db);
    repo.list_runs(limit).map_err(Into::into)
}

#[tauri::command]
pub fn get_workflow_run(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<Option<WorkflowRun>> {
    let db = state.lock_db()?;
    let repo = WorkflowRepository::new(&db);
    repo.get_run(&id).map_err(Into::into)
}

#[tauri::command]
pub fn create_workflow_run(
    state: State<'_, AppState>,
    data: CreateWorkflowRunDto,
) -> CommandResult<WorkflowRun> {
    let db = state.lock_db()?;
    let repo = WorkflowRepository::new(&db);

    repo.create_run(CreateWorkflowRunRequest {
        workflow_type: data.workflow_type,
        preset_id: data.preset_id,
        status: "queued".to_string(),
        thread_id: data.thread_id,
        started_at: None,
    })
    .map_err(Into::into)
}

#[tauri::command]
pub fn update_workflow_run(
    state: State<'_, AppState>,
    id: String,
    data: UpdateWorkflowRunDto,
) -> CommandResult<Option<WorkflowRun>> {
    let db = state.lock_db()?;
    let repo = WorkflowRepository::new(&db);

    repo.update_run(
        &id,
        UpdateWorkflowRunRequest {
            status: data.status,
            checkpoint_ref: data.checkpoint_ref,
            approval_payload: data.approval_payload,
            cost_usd: data.cost_usd,
            error_message: data.error_message,
            started_at: data.started_at,
            finished_at: data.finished_at,
        },
    )
    .map_err(Into::into)
}

#[tauri::command]
pub fn list_workflow_events(
    state: State<'_, AppState>,
    run_id: String,
    limit: Option<i64>,
) -> CommandResult<Vec<WorkflowEvent>> {
    let db = state.lock_db()?;
    let repo = WorkflowRepository::new(&db);
    repo.list_events(&run_id, limit).map_err(Into::into)
}

#[tauri::command]
pub fn get_workflow_checkpoint(
    state: State<'_, AppState>,
    run_id: String,
    checkpoint_ref: Option<String>,
) -> CommandResult<Option<WorkflowCheckpoint>> {
    let db = state.lock_db()?;
    let repo = WorkflowRepository::new(&db);

    if let Some(checkpoint_ref) = checkpoint_ref {
        return repo.get_checkpoint(&run_id, &checkpoint_ref).map_err(Into::into);
    }

    repo.get_latest_checkpoint(&run_id).map_err(Into::into)
}

// ── APKG Export (via orchestration service) ───────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportApkgDto {
    pub output_path: String,
    pub deck_name: Option<String>,
    pub document_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportApkgResultDto {
    pub deck_name: String,
    pub card_count: u64,
    pub output_path: String,
    pub exported_at: String,
}

#[tauri::command]
pub async fn export_cards_apkg(
    state: State<'_, AppState>,
    data: ExportApkgDto,
) -> CommandResult<ExportApkgResultDto> {
    let output_path = data.output_path.trim().to_string();
    if output_path.is_empty() {
        return Err(CommandError::InvalidInput("Missing output path".to_string()));
    }

    let health = state.orchestration.health().await?;
    if health.status != "healthy" && health.status != "degraded" {
        return Err(CommandError::Internal(format!(
            "Orchestration service status: {}",
            health.status
        )));
    }

    let endpoint = health.endpoint.ok_or_else(|| {
        CommandError::Internal("Orchestration service not available".to_string())
    })?;

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| CommandError::Internal(format!("HTTP client error: {e}")))?;

    let mut payload = serde_json::json!({ "outputPath": output_path });
    if let Some(deck_name) = &data.deck_name {
        payload["deckName"] = serde_json::json!(deck_name);
    }
    if let Some(document_id) = &data.document_id {
        payload["documentId"] = serde_json::json!(document_id);
    }

    let response = client
        .post(format!("{endpoint}/exports/apkg"))
        .json(&payload)
        .send()
        .await
        .map_err(|e| CommandError::Internal(format!("Export request failed: {e}")))?;

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(CommandError::Internal(format!("Export failed: {body}")));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| CommandError::Internal(format!("Invalid response: {e}")))?;

    Ok(ExportApkgResultDto {
        deck_name: result["deckName"].as_str().unwrap_or("XueJian Export").to_string(),
        card_count: result["cardCount"].as_u64().unwrap_or(0),
        output_path: result["outputPath"].as_str().unwrap_or(&output_path).to_string(),
        exported_at: result["exportedAt"].as_str().unwrap_or("").to_string(),
    })
}
