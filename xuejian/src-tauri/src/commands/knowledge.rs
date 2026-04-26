use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        AppendWorkflowEventRequest, CreateWorkflowRunRequest, DocumentChunkSearchResult,
        DocumentRepository, KnowledgeQaConversation, KnowledgeQaMessage, KnowledgeQaRepository,
        UpdateWorkflowRunRequest, WorkflowRepository, WorkflowRun,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateKnowledgeQaConversationDto {
    pub title: Option<String>,
    pub document_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendKnowledgeQaMessageDto {
    pub conversation_id: Option<String>,
    pub question: String,
    pub document_ids: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeQaConversationDetailDto {
    pub conversation: KnowledgeQaConversation,
    pub messages: Vec<KnowledgeQaMessage>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendKnowledgeQaMessageResultDto {
    pub conversation: KnowledgeQaConversation,
    pub user_message: KnowledgeQaMessage,
    pub assistant_message: KnowledgeQaMessage,
    pub run: WorkflowRun,
}

#[tauri::command]
pub fn search_knowledge(
    state: State<'_, AppState>,
    data: SearchKnowledgeDto,
) -> CommandResult<Vec<ChunkSearchResultDto>> {
    if data.query.trim().is_empty() {
        return Err(CommandError::InvalidInput(
            "Query must not be empty".to_string(),
        ));
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
pub fn list_knowledge_qa_conversations(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> CommandResult<Vec<KnowledgeQaConversation>> {
    let db = state.lock_db()?;
    let repo = KnowledgeQaRepository::new(&db);
    repo.list_conversations(limit).map_err(Into::into)
}

#[tauri::command]
pub fn get_knowledge_qa_conversation(
    state: State<'_, AppState>,
    conversation_id: String,
) -> CommandResult<Option<KnowledgeQaConversationDetailDto>> {
    let db = state.lock_db()?;
    let repo = KnowledgeQaRepository::new(&db);
    let Some(conversation) = repo.get_conversation(&conversation_id)? else {
        return Ok(None);
    };
    let messages = repo.list_messages(&conversation_id)?;
    Ok(Some(KnowledgeQaConversationDetailDto {
        conversation,
        messages,
    }))
}

#[tauri::command]
pub fn create_knowledge_qa_conversation(
    state: State<'_, AppState>,
    data: CreateKnowledgeQaConversationDto,
) -> CommandResult<KnowledgeQaConversation> {
    let document_ids = data.document_ids.unwrap_or_default();
    let title = data.title.unwrap_or_else(|| "Knowledge Q&A".to_string());
    let db = state.lock_db()?;
    let repo = KnowledgeQaRepository::new(&db);
    repo.create_conversation(&title, &document_ids)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn send_knowledge_qa_message(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    data: SendKnowledgeQaMessageDto,
) -> CommandResult<SendKnowledgeQaMessageResultDto> {
    let question = data.question.trim().to_string();
    if question.is_empty() {
        return Err(CommandError::InvalidInput(
            "Question must not be empty".to_string(),
        ));
    }

    let document_ids = data.document_ids.unwrap_or_default();
    let (conversation, user_message, assistant_message, run) = {
        let db = state.lock_db()?;
        let qa_repo = KnowledgeQaRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);

        let conversation = match data.conversation_id.as_deref() {
            Some(id) => qa_repo
                .get_conversation(id)?
                .ok_or(CommandError::NotFound)?,
            None => qa_repo.create_conversation(&question, &document_ids)?,
        };

        let thread_id = format!("knowledge-qa:{}", conversation.id);
        let run = workflow_repo.create_run(CreateWorkflowRunRequest {
            workflow_type: "knowledge_qa".to_string(),
            preset_id: None,
            status: "queued".to_string(),
            thread_id,
            started_at: None,
        })?;

        let user_message = qa_repo.create_message(
            &conversation.id,
            "user",
            &question,
            "answered",
            None,
            &document_ids,
        )?;
        let assistant_message = qa_repo.create_message(
            &conversation.id,
            "assistant",
            "",
            "pending",
            Some(&run.id),
            &document_ids,
        )?;
        qa_repo.touch_conversation(&conversation.id)?;

        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run.id.clone(),
            event_type: "queued".to_string(),
            message: Some("Knowledge Q&A queued".to_string()),
            progress: Some(0.0),
            payload: Some(serde_json::json!({
                "question": question,
                "documentIds": document_ids,
                "conversationId": conversation.id,
                "assistantMessageId": assistant_message.id,
            })),
        })?;

        (conversation, user_message, assistant_message, run)
    };

    spawn_knowledge_qa_worker(
        app_handle,
        run.id.clone(),
        question,
        Some(document_ids),
        Some(assistant_message.id.clone()),
    );

    Ok(SendKnowledgeQaMessageResultDto {
        conversation,
        user_message,
        assistant_message,
        run,
    })
}

#[tauri::command]
pub fn cancel_knowledge_qa_message(
    state: State<'_, AppState>,
    message_id: String,
) -> CommandResult<Option<KnowledgeQaMessage>> {
    let db = state.lock_db()?;
    let qa_repo = KnowledgeQaRepository::new(&db);
    let workflow_repo = WorkflowRepository::new(&db);
    let Some(message) = qa_repo.get_message(&message_id)? else {
        return Ok(None);
    };

    if let Some(run_id) = message.workflow_run_id.as_deref() {
        let now = chrono::Utc::now().to_rfc3339();
        workflow_repo.update_run(
            run_id,
            UpdateWorkflowRunRequest {
                status: Some("cancelled".to_string()),
                checkpoint_ref: None,
                approval_payload: None,
                cost_usd: None,
                error_message: Some("Cancelled by user".to_string()),
                started_at: None,
                finished_at: Some(now),
            },
        )?;
        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run_id.to_string(),
            event_type: "cancelled".to_string(),
            message: Some("Knowledge Q&A cancelled by user".to_string()),
            progress: Some(1.0),
            payload: Some(serde_json::json!({ "messageId": message_id })),
        })?;
    }

    qa_repo
        .update_message_result(
            &message_id,
            "cancelled",
            Some("Answer stopped."),
            None,
            Some("Cancelled by user"),
        )
        .map_err(Into::into)
}

#[tauri::command]
pub async fn start_knowledge_qa_workflow(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    data: StartKnowledgeQaDto,
) -> CommandResult<WorkflowRun> {
    if data.question.trim().is_empty() {
        return Err(CommandError::InvalidInput(
            "Question must not be empty".to_string(),
        ));
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
    spawn_knowledge_qa_worker(
        app_handle,
        run.id.clone(),
        data.question,
        data.document_ids,
        None,
    );
    Ok(run)
}

fn spawn_knowledge_qa_worker(
    app_handle: AppHandle,
    run_id: String,
    question: String,
    document_ids: Option<Vec<String>>,
    assistant_message_id: Option<String>,
) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_knowledge_qa_worker(
            &app_handle,
            &run_id,
            &question,
            &document_ids,
            assistant_message_id.as_deref(),
        )
        .await
        {
            log::error!("Knowledge QA workflow {run_id} failed: {error}");
            mark_run_failed(
                &app_handle,
                &run_id,
                &error.to_string(),
                assistant_message_id.as_deref(),
            );
        }
    });
}

async fn execute_knowledge_qa_worker(
    app_handle: &AppHandle,
    run_id: &str,
    question: &str,
    document_ids: &Option<Vec<String>>,
    assistant_message_id: Option<&str>,
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
    let health =
        state.orchestration.health().await.map_err(|e| {
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

    if is_run_cancelled(app_handle, run_id) {
        mark_message_cancelled(app_handle, assistant_message_id);
        return Ok(());
    }

    if response.status().is_success() {
        let result: serde_json::Value = response.json().await.unwrap_or(serde_json::json!({}));
        complete_knowledge_qa_run(app_handle, run_id, result, assistant_message_id);
        Ok(())
    } else {
        let error = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        Err(CommandError::Internal(error))
    }
}

fn complete_knowledge_qa_run(
    app_handle: &AppHandle,
    run_id: &str,
    result: serde_json::Value,
    assistant_message_id: Option<&str>,
) {
    let state = app_handle.state::<AppState>();
    let db = match state.lock_db() {
        Ok(db) => db,
        Err(_) => return,
    };
    let repo = WorkflowRepository::new(&db);
    if repo
        .get_run(run_id)
        .ok()
        .flatten()
        .is_some_and(|run| run.status == "cancelled")
    {
        drop(repo);
        mark_message_cancelled(app_handle, assistant_message_id);
        return;
    }
    let now = chrono::Utc::now().to_rfc3339();

    let _ = repo.append_event(AppendWorkflowEventRequest {
        run_id: run_id.to_string(),
        event_type: "completed".to_string(),
        message: Some("Knowledge Q&A completed".to_string()),
        progress: Some(1.0),
        payload: Some(result.clone()),
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

    if let Some(message_id) = assistant_message_id {
        let qa_repo = KnowledgeQaRepository::new(&db);
        let answer = result
            .get("answer")
            .and_then(|value| value.get("answer"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Answer generated, but no displayable body was returned.");
        let _ = qa_repo.update_message_result(
            message_id,
            "answered",
            Some(answer),
            Some(&result),
            None,
        );
        if let Ok(Some(message)) = qa_repo.get_message(message_id) {
            let _ = qa_repo.touch_conversation(&message.conversation_id);
        }
    }
}

fn mark_run_failed(
    app_handle: &AppHandle,
    run_id: &str,
    error: &str,
    assistant_message_id: Option<&str>,
) {
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

    if let Some(message_id) = assistant_message_id {
        let qa_repo = KnowledgeQaRepository::new(&db);
        let _ = qa_repo.update_message_result(message_id, "error", None, None, Some(error));
        if let Ok(Some(message)) = qa_repo.get_message(message_id) {
            let _ = qa_repo.touch_conversation(&message.conversation_id);
        }
    }
}

fn is_run_cancelled(app_handle: &AppHandle, run_id: &str) -> bool {
    let state = app_handle.state::<AppState>();
    let Ok(db) = state.lock_db() else {
        return false;
    };
    let repo = WorkflowRepository::new(&db);
    repo.get_run(run_id)
        .ok()
        .flatten()
        .is_some_and(|run| run.status == "cancelled")
}

fn mark_message_cancelled(app_handle: &AppHandle, assistant_message_id: Option<&str>) {
    let Some(message_id) = assistant_message_id else {
        return;
    };
    let state = app_handle.state::<AppState>();
    let Ok(db) = state.lock_db() else {
        return;
    };
    let qa_repo = KnowledgeQaRepository::new(&db);
    let _ = qa_repo.update_message_result(
        message_id,
        "cancelled",
        Some("Answer stopped."),
        None,
        Some("Cancelled by user"),
    );
    if let Ok(Some(message)) = qa_repo.get_message(message_id) {
        let _ = qa_repo.touch_conversation(&message.conversation_id);
    }
}
