use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        AppendWorkflowEventRequest, CreateWorkflowRunRequest, DocumentChunkSearchResult,
        DocumentRepository, UpdateWorkflowRunRequest, WorkflowRepository, WorkflowRun,
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchKnowledgeDto {
    pub query: String,
    pub document_ids: Option<Vec<String>>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkSearchResultDto {
    pub id: String,
    pub document_id: String,
    pub chunk_index: i32,
    pub page_start: Option<i32>,
    pub page_end: Option<i32>,
    pub content: String,
    pub snippet: String,
}

impl From<DocumentChunkSearchResult> for ChunkSearchResultDto {
    fn from(result: DocumentChunkSearchResult) -> Self {
        Self {
            id: result.id,
            document_id: result.document_id,
            chunk_index: result.chunk_index,
            page_start: result.page_start,
            page_end: result.page_end,
            content: result.content,
            snippet: result.snippet,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartKnowledgeQaDto {
    pub question: String,
    pub document_ids: Option<Vec<String>>,
}

#[tauri::command]
pub fn search_knowledge(
    state: State<'_, AppState>,
    data: SearchKnowledgeDto,
) -> CommandResult<Vec<ChunkSearchResultDto>> {
    if data.query.trim().is_empty() {
        return Err(CommandError::InvalidInput("Query must not be empty".to_string()));
    }

    let db = state.lock_db()?;
    let repo = DocumentRepository::new(&db);

    let results = if let Some(ref doc_ids) = data.document_ids {
        if doc_ids.is_empty() {
            repo.search_chunks(&data.query, data.limit)?
        } else {
            repo.search_chunks_scoped(&data.query, doc_ids, data.limit)?
        }
    } else {
        repo.search_chunks(&data.query, data.limit)?
    };

    Ok(results.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub async fn start_knowledge_qa_workflow(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    data: StartKnowledgeQaDto,
) -> CommandResult<WorkflowRun> {
    if data.question.trim().is_empty() {
        return Err(CommandError::InvalidInput("Question must not be empty".to_string()));
    }

    let run = {
        let db = state.lock_db()?;
        let workflow_repo = WorkflowRepository::new(&db);

        let thread_id = format!(
            "knowledge-qa:{}",
            data.document_ids
                .as_ref()
                .map(|ids| ids.join(","))
                .unwrap_or_else(|| "all".to_string())
        );

        let run = workflow_repo.create_run(CreateWorkflowRunRequest {
            workflow_type: "knowledge_qa".to_string(),
            preset_id: None,
            status: "queued".to_string(),
            thread_id,
            started_at: None,
        })?;

        let scope_payload = serde_json::json!({
            "question": data.question,
            "documentIds": data.document_ids,
        });

        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run.id.clone(),
            event_type: "queued".to_string(),
            message: Some("Knowledge Q&A queued".to_string()),
            progress: Some(0.0),
            payload: Some(scope_payload),
        })?;

        workflow_repo
            .update_run(
                &run.id,
                UpdateWorkflowRunRequest {
                    status: Some("queued".to_string()),
                    checkpoint_ref: None,
                    approval_payload: None,
                    cost_usd: None,
                    error_message: None,
                    started_at: None,
                    finished_at: None,
                },
            )?
            .ok_or(CommandError::NotFound)?
    };

    // Dispatch to Python orchestration service
    spawn_knowledge_qa_worker(app_handle, run.id.clone(), data.question, data.document_ids);
    Ok(run)
}

fn spawn_knowledge_qa_worker(
    app_handle: AppHandle,
    run_id: String,
    question: String,
    document_ids: Option<Vec<String>>,
) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_knowledge_qa_worker(&app_handle, &run_id, &question, &document_ids).await {
            log::error!("Knowledge QA workflow {run_id} failed: {error}");
            mark_run_failed(&app_handle, &run_id, &error.to_string());
        }
    });
}

async fn execute_knowledge_qa_worker(
    app_handle: &AppHandle,
    run_id: &str,
    question: &str,
    document_ids: &Option<Vec<String>>,
) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();

    // Update run to running
    {
        let db = state.lock_db()?;
        let repo = WorkflowRepository::new(&db);
        let now = chrono::Utc::now().to_rfc3339();
        repo.update_run(
            run_id,
            UpdateWorkflowRunRequest {
                status: Some("running".to_string()),
                checkpoint_ref: None,
                approval_payload: None,
                cost_usd: None,
                error_message: None,
                started_at: Some(now),
                finished_at: None,
            },
        )?;
        repo.append_event(AppendWorkflowEventRequest {
            run_id: run_id.to_string(),
            event_type: "started".to_string(),
            message: Some("Knowledge Q&A started".to_string()),
            progress: Some(0.1),
            payload: None,
        })?;
    }

    // Get orchestration endpoint
    let health = state.orchestration.health().await.map_err(|e| {
        CommandError::Internal(format!("Orchestration health check failed: {e}"))
    })?;

    let endpoint = health.endpoint.ok_or(CommandError::Internal(
        "Orchestration service not available".to_string(),
    ))?;

    if health.status != "healthy" && health.status != "degraded" {
        return Err(CommandError::Internal(format!(
            "Orchestration service status: {}",
            health.status
        )));
    }

    // Call Python orchestration service
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| CommandError::Internal(e.to_string()))?;

    let response = client
        .post(format!("{endpoint}/workflows/knowledge-qa"))
        .json(&serde_json::json!({
            "runId": run_id,
            "question": question,
            "documentIds": document_ids,
        }))
        .send()
        .await
        .map_err(|e| CommandError::Internal(format!("HTTP request failed: {e}")))?;

    if response.status().is_success() {
        let result: serde_json::Value = response
            .json()
            .await
            .unwrap_or(serde_json::json!({}));
        complete_knowledge_qa_run(app_handle, run_id, result);
        Ok(())
    } else {
        let error = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        Err(CommandError::Internal(error))
    }
}

fn complete_knowledge_qa_run(app_handle: &AppHandle, run_id: &str, result: serde_json::Value) {
    let state = app_handle.state::<AppState>();
    let db = match state.lock_db() {
        Ok(db) => db,
        Err(_) => return,
    };
    let repo = WorkflowRepository::new(&db);
    let now = chrono::Utc::now().to_rfc3339();

    let _ = repo.append_event(AppendWorkflowEventRequest {
        run_id: run_id.to_string(),
        event_type: "completed".to_string(),
        message: Some("Knowledge Q&A completed".to_string()),
        progress: Some(1.0),
        payload: Some(result),
    });

    let _ = repo.update_run(
        run_id,
        UpdateWorkflowRunRequest {
            status: Some("completed".to_string()),
            checkpoint_ref: None,
            approval_payload: None,
            cost_usd: None,
            error_message: None,
            started_at: None,
            finished_at: Some(now),
        },
    );
}

fn mark_run_failed(app_handle: &AppHandle, run_id: &str, error: &str) {
    let state = app_handle.state::<AppState>();
    let db = match state.lock_db() {
        Ok(db) => db,
        Err(_) => return,
    };
    let repo = WorkflowRepository::new(&db);
    let now = chrono::Utc::now().to_rfc3339();

    let _ = repo.append_event(AppendWorkflowEventRequest {
        run_id: run_id.to_string(),
        event_type: "failed".to_string(),
        message: Some(format!("Knowledge Q&A failed: {error}")),
        progress: None,
        payload: None,
    });

    let _ = repo.update_run(
        run_id,
        UpdateWorkflowRunRequest {
            status: Some("failed".to_string()),
            checkpoint_ref: None,
            approval_payload: None,
            cost_usd: None,
            error_message: Some(error.to_string()),
            started_at: None,
            finished_at: Some(now),
        },
    );
}
