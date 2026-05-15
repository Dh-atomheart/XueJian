use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        rag_embedding_readiness_status, rag_required_chunk_count, AppendWorkflowEventRequest,
        CreateWorkflowRunRequest, KnowledgeQaConversation, KnowledgeQaMessage,
        KnowledgeQaRepository, Mvp0Document, Mvp0DocumentChunkSearchResult, Mvp0DocumentRepository,
        UpdateWorkflowRunRequest, VectorRepository, WorkflowRepository, WorkflowRun,
    },
};

const KNOWLEDGE_QA_HTTP_TIMEOUT_SECONDS: u64 = 180;

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

impl From<Mvp0DocumentChunkSearchResult> for ChunkSearchResultDto {
    fn from(result: Mvp0DocumentChunkSearchResult) -> Self {
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

#[derive(Debug, Clone)]
struct KnowledgeQaTurnPair {
    user_message: KnowledgeQaMessage,
    assistant_message: KnowledgeQaMessage,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct KnowledgeQaEmbeddingGateFailure {
    status: &'static str,
    message: String,
}

impl KnowledgeQaEmbeddingGateFailure {
    fn new(status: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

fn gate_to_command_error(error: KnowledgeQaEmbeddingGateFailure) -> CommandError {
    CommandError::InvalidInput(format!("{}: {}", error.status, error.message))
}

fn has_pending_knowledge_qa_message(
    messages: &[KnowledgeQaMessage],
    except_message_id: Option<&str>,
) -> bool {
    messages.iter().any(|message| {
        message.role == "assistant"
            && message.status == "pending"
            && match except_message_id {
                Some(id) => id != message.id,
                None => true,
            }
    })
}

fn find_knowledge_qa_turn_pair(
    messages: &[KnowledgeQaMessage],
    message_id: &str,
) -> Option<KnowledgeQaTurnPair> {
    let index = messages
        .iter()
        .position(|candidate| candidate.id == message_id)?;
    let message = &messages[index];

    match message.role.as_str() {
        "user" => {
            let assistant_message = messages
                .iter()
                .skip(index + 1)
                .find(|candidate| candidate.role == "assistant")?
                .clone();
            Some(KnowledgeQaTurnPair {
                user_message: message.clone(),
                assistant_message,
            })
        }
        "assistant" => {
            let user_message = messages
                .iter()
                .take(index)
                .rev()
                .find(|candidate| candidate.role == "user")?
                .clone();
            Some(KnowledgeQaTurnPair {
                user_message,
                assistant_message: message.clone(),
            })
        }
        _ => None,
    }
}

fn validate_knowledge_qa_embedding_scope(
    state: &State<'_, AppState>,
    requested_document_ids: &[String],
) -> CommandResult<Vec<String>> {
    let db = state.lock_db()?;
    let document_repo = Mvp0DocumentRepository::new(db.connection());
    let vector_repo = VectorRepository::new(&db);
    let profile = vector_repo
        .get_active_embedding_profile()?
        .ok_or_else(|| gate_to_command_error(KnowledgeQaEmbeddingGateFailure::new(
            "embedding_missing",
            "No active embedding profile is configured. Generate document vectors before asking RAG questions.",
        )))?;

    let documents = if requested_document_ids.is_empty() {
        document_repo.list_documents(false)?
    } else {
        requested_document_ids
            .iter()
            .map(|document_id| {
                document_repo
                    .find_document_by_id(document_id)?
                    .ok_or(CommandError::NotFound)
            })
            .collect::<CommandResult<Vec<_>>>()?
    };

    let mut ready_document_ids = Vec::new();
    let mut first_failure: Option<KnowledgeQaEmbeddingGateFailure> = None;
    for document in documents {
        match evaluate_document_embedding_gate(
            &document_repo,
            &vector_repo,
            &document,
            &profile.id,
        )? {
            Ok(()) => ready_document_ids.push(document.id.clone()),
            Err(failure) => {
                if !requested_document_ids.is_empty() {
                    return Err(gate_to_command_error(failure));
                }
                first_failure.get_or_insert(failure);
            }
        }
    }

    if ready_document_ids.is_empty() {
        return Err(gate_to_command_error(first_failure.unwrap_or_else(|| {
            KnowledgeQaEmbeddingGateFailure::new(
                "embedding_missing",
                "No embedded documents are available for Knowledge Q&A.",
            )
        })));
    }

    Ok(ready_document_ids)
}

fn evaluate_document_embedding_gate(
    document_repo: &Mvp0DocumentRepository<'_>,
    vector_repo: &VectorRepository<'_>,
    document: &Mvp0Document,
    profile_id: &str,
) -> CommandResult<Result<(), KnowledgeQaEmbeddingGateFailure>> {
    let document_status = document.parse_status.as_str();
    match document_status {
        "embedding_failed" => {
            return Ok(Err(KnowledgeQaEmbeddingGateFailure::new(
                "embedding_failed",
                format!(
                    "Document \"{}\" embedding generation failed. Retry embedding first.",
                    document.title
                ),
            )));
        }
        "ready" | "embedding_stale" => {}
        "parsed" | "embedding" => {
            return Ok(Err(KnowledgeQaEmbeddingGateFailure::new(
                "embedding_missing",
                format!(
                    "Document \"{}\" has not completed embedding generation.",
                    document.title
                ),
            )));
        }
        _ => {
            return Ok(Err(KnowledgeQaEmbeddingGateFailure::new(
                "embedding_missing",
                format!(
                    "Document \"{}\" must be parsed and embedded before Knowledge Q&A.",
                    document.title
                ),
            )));
        }
    }

    let required_count = rag_required_chunk_count(document_repo.list_chunks(&document.id)?);
    if required_count == 0 {
        return Ok(Err(KnowledgeQaEmbeddingGateFailure::new(
            "embedding_missing",
            format!(
                "Document \"{}\" has no embeddable chunks for Knowledge Q&A.",
                document.title
            ),
        )));
    }

    let embedded_count = vector_repo.count_document_embeddings(&document.id, profile_id)?;
    let readiness_status =
        rag_embedding_readiness_status(document_status, required_count, embedded_count);
    if readiness_status == "ready" {
        if document_status == "embedding_stale" {
            document_repo.update_parse_status(&document.id, "ready")?;
        }
        return Ok(Ok(()));
    }

    let message = if readiness_status == "embedding_stale" {
        format!(
            "Document \"{}\" has stale vectors ({embedded_count}/{required_count}). Regenerate embeddings before asking.",
            document.title
        )
    } else {
        format!(
            "Document \"{}\" has incomplete vectors ({embedded_count}/{required_count}). Regenerate embeddings before asking.",
            document.title
        )
    };
    Ok(Err(KnowledgeQaEmbeddingGateFailure::new(
        readiness_status,
        message,
    )))
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
    let repo = Mvp0DocumentRepository::new(db.connection());
    let document_ids = data
        .document_ids
        .as_ref()
        .filter(|document_ids| !document_ids.is_empty())
        .map(Vec::as_slice);
    let results = repo.search_chunks(&data.query, document_ids, data.limit.unwrap_or(10))?;

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
pub fn delete_knowledge_qa_conversation(
    state: State<'_, AppState>,
    conversation_id: String,
) -> CommandResult<bool> {
    let db = state.lock_db()?;
    let qa_repo = KnowledgeQaRepository::new(&db);
    let workflow_repo = WorkflowRepository::new(&db);
    let messages = qa_repo.list_messages(&conversation_id)?;

    cancel_pending_knowledge_qa_runs(&workflow_repo, &messages, "Deleted by user")?;
    qa_repo
        .delete_conversation(&conversation_id)
        .map_err(Into::into)
}

#[tauri::command]
pub fn delete_knowledge_qa_turn(
    state: State<'_, AppState>,
    message_id: String,
) -> CommandResult<bool> {
    let db = state.lock_db()?;
    let qa_repo = KnowledgeQaRepository::new(&db);
    let workflow_repo = WorkflowRepository::new(&db);
    let message = qa_repo
        .get_message(&message_id)?
        .ok_or(CommandError::NotFound)?;
    let messages = qa_repo.list_messages(&message.conversation_id)?;
    let index = messages
        .iter()
        .position(|candidate| candidate.id == message.id)
        .ok_or(CommandError::NotFound)?;

    let mut delete_ids = vec![message.id.clone()];
    match message.role.as_str() {
        "user" => {
            if let Some(next) = messages.get(index + 1) {
                if next.role == "assistant" {
                    delete_ids.push(next.id.clone());
                }
            }
        }
        "assistant" => {
            if index > 0 {
                if let Some(previous) = messages.get(index - 1) {
                    if previous.role == "user" {
                        delete_ids.push(previous.id.clone());
                    }
                }
            }
        }
        _ => {}
    }

    let deleted_messages = messages
        .into_iter()
        .filter(|candidate| delete_ids.iter().any(|id| id == &candidate.id))
        .collect::<Vec<_>>();
    cancel_pending_knowledge_qa_runs(&workflow_repo, &deleted_messages, "Deleted by user")?;

    let affected = qa_repo.delete_messages(&delete_ids)?;
    qa_repo.touch_conversation(&message.conversation_id)?;
    Ok(affected > 0)
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
    if let Some(conversation_id) = data.conversation_id.as_deref() {
        let db = state.lock_db()?;
        let qa_repo = KnowledgeQaRepository::new(&db);
        let conversation = qa_repo
            .get_conversation(conversation_id)?
            .ok_or(CommandError::NotFound)?;
        let existing_messages = qa_repo.list_messages(&conversation.id)?;
        if has_pending_knowledge_qa_message(&existing_messages, None) {
            return Err(CommandError::InvalidInput(
                "Knowledge Q&A is already generating an answer for this conversation.".to_string(),
            ));
        }
    }
    let effective_document_ids = validate_knowledge_qa_embedding_scope(&state, &document_ids)?;
    let (conversation, user_message, assistant_message, run) = {
        let db = state.lock_db()?;
        let qa_repo = KnowledgeQaRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);

        let conversation = match data.conversation_id.as_deref() {
            Some(id) => qa_repo
                .get_conversation(id)?
                .ok_or(CommandError::NotFound)?,
            None => qa_repo.create_conversation(&question, &effective_document_ids)?,
        };
        let existing_messages = qa_repo.list_messages(&conversation.id)?;
        if has_pending_knowledge_qa_message(&existing_messages, None) {
            return Err(CommandError::InvalidInput(
                "Knowledge Q&A is already generating an answer for this conversation.".to_string(),
            ));
        }

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
            &effective_document_ids,
        )?;
        let assistant_message = qa_repo.create_message(
            &conversation.id,
            "assistant",
            "",
            "pending",
            Some(&run.id),
            &effective_document_ids,
        )?;
        qa_repo.touch_conversation(&conversation.id)?;

        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run.id.clone(),
            event_type: "queued".to_string(),
            message: Some("Knowledge Q&A queued".to_string()),
            progress: Some(0.0),
            payload: Some(serde_json::json!({
                "question": question,
                "documentIds": effective_document_ids.clone(),
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
        Some(effective_document_ids),
        Some(conversation.id.clone()),
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
pub async fn regenerate_knowledge_qa_turn(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    message_id: String,
) -> CommandResult<SendKnowledgeQaMessageResultDto> {
    let (conversation, user_message, assistant_message, question, document_ids) = {
        let db = state.lock_db()?;
        let qa_repo = KnowledgeQaRepository::new(&db);
        let message = qa_repo
            .get_message(&message_id)?
            .ok_or(CommandError::NotFound)?;
        let conversation = qa_repo
            .get_conversation(&message.conversation_id)?
            .ok_or(CommandError::NotFound)?;
        let messages = qa_repo.list_messages(&conversation.id)?;
        let pair =
            find_knowledge_qa_turn_pair(&messages, &message_id).ok_or(CommandError::NotFound)?;

        if pair.assistant_message.status == "pending" {
            return Err(CommandError::InvalidInput(
                "Knowledge Q&A is already generating this answer.".to_string(),
            ));
        }
        if has_pending_knowledge_qa_message(&messages, Some(&pair.assistant_message.id)) {
            return Err(CommandError::InvalidInput(
                "Knowledge Q&A is already generating an answer for this conversation.".to_string(),
            ));
        }

        let question = pair.user_message.content.trim().to_string();
        if question.is_empty() {
            return Err(CommandError::InvalidInput(
                "Original question must not be empty".to_string(),
            ));
        }
        let document_ids = if pair.assistant_message.document_ids.is_empty() {
            pair.user_message.document_ids.clone()
        } else {
            pair.assistant_message.document_ids.clone()
        };

        (
            conversation,
            pair.user_message,
            pair.assistant_message,
            question,
            document_ids,
        )
    };

    let effective_document_ids = validate_knowledge_qa_embedding_scope(&state, &document_ids)?;
    let (conversation, user_message, assistant_message, run) = {
        let db = state.lock_db()?;
        let qa_repo = KnowledgeQaRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);

        let thread_id = format!("knowledge-qa:{}", conversation.id);
        let run = workflow_repo.create_run(CreateWorkflowRunRequest {
            workflow_type: "knowledge_qa".to_string(),
            preset_id: None,
            status: "queued".to_string(),
            thread_id,
            started_at: None,
        })?;

        let assistant_message = qa_repo
            .reset_assistant_message_for_retry(&assistant_message.id, &run.id)?
            .ok_or(CommandError::NotFound)?;
        qa_repo.touch_conversation(&conversation.id)?;

        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run.id.clone(),
            event_type: "queued".to_string(),
            message: Some("Knowledge Q&A regenerate queued".to_string()),
            progress: Some(0.0),
            payload: Some(serde_json::json!({
                "question": question,
                "documentIds": effective_document_ids.clone(),
                "conversationId": conversation.id,
                "assistantMessageId": assistant_message.id,
                "regenerate": true,
            })),
        })?;

        (conversation, user_message, assistant_message, run)
    };

    spawn_knowledge_qa_worker(
        app_handle,
        run.id.clone(),
        question,
        Some(effective_document_ids),
        Some(conversation.id.clone()),
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

fn cancel_pending_knowledge_qa_runs(
    workflow_repo: &WorkflowRepository<'_>,
    messages: &[KnowledgeQaMessage],
    reason: &str,
) -> CommandResult<()> {
    let mut cancelled_run_ids = Vec::<String>::new();
    for message in messages {
        if message.status != "pending" {
            continue;
        }
        let Some(run_id) = message.workflow_run_id.as_ref() else {
            continue;
        };
        if cancelled_run_ids.iter().any(|existing| existing == run_id) {
            continue;
        }

        let now = chrono::Utc::now().to_rfc3339();
        workflow_repo.update_run(
            run_id,
            UpdateWorkflowRunRequest {
                status: Some("cancelled".to_string()),
                checkpoint_ref: None,
                approval_payload: None,
                cost_usd: None,
                error_message: Some(reason.to_string()),
                started_at: None,
                finished_at: Some(now),
            },
        )?;
        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run_id.to_string(),
            event_type: "cancelled".to_string(),
            message: Some(format!("Knowledge Q&A {}", reason)),
            progress: Some(1.0),
            payload: Some(serde_json::json!({ "messageId": message.id })),
        })?;
        cancelled_run_ids.push(run_id.clone());
    }
    Ok(())
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

    let requested_document_ids = data.document_ids.clone().unwrap_or_default();
    let effective_document_ids =
        validate_knowledge_qa_embedding_scope(&state, &requested_document_ids)?;

    let run = {
        let db = state.lock_db()?;
        let workflow_repo = WorkflowRepository::new(&db);

        let thread_id = format!("knowledge-qa:{}", effective_document_ids.join(","));

        let run = workflow_repo.create_run(CreateWorkflowRunRequest {
            workflow_type: "knowledge_qa".to_string(),
            preset_id: None,
            status: "queued".to_string(),
            thread_id,
            started_at: None,
        })?;

        let scope_payload = serde_json::json!({
            "question": data.question.clone(),
            "documentIds": effective_document_ids.clone(),
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
        Some(effective_document_ids),
        None,
        None,
    );
    Ok(run)
}

fn spawn_knowledge_qa_worker(
    app_handle: AppHandle,
    run_id: String,
    question: String,
    document_ids: Option<Vec<String>>,
    conversation_id: Option<String>,
    assistant_message_id: Option<String>,
) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_knowledge_qa_worker(
            &app_handle,
            &run_id,
            &question,
            &document_ids,
            conversation_id.as_deref(),
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
    conversation_id: Option<&str>,
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
        .timeout(Duration::from_secs(KNOWLEDGE_QA_HTTP_TIMEOUT_SECONDS))
        .build()
        .map_err(|e| CommandError::Internal(e.to_string()))?;

    let response = client
        .post(format!("{endpoint}/workflows/knowledge-qa"))
        .json(&serde_json::json!({
            "runId": run_id,
            "question": question,
            "documentIds": document_ids,
            "conversationId": conversation_id,
        }))
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                CommandError::Internal(format!(
                    "provider_timeout: Knowledge Q&A request exceeded {KNOWLEDGE_QA_HTTP_TIMEOUT_SECONDS} seconds"
                ))
            } else {
                CommandError::Internal(format!("HTTP request failed: {e}"))
            }
        })?;

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
    let artifact_repo = crate::db::ArtifactRepository::new(&db);
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
    let result_status = result
        .get("status")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("completed");
    let is_failed = result_status == "failed";
    let error_message = result
        .get("errorCategory")
        .and_then(serde_json::Value::as_str)
        .or_else(|| result.get("summary").and_then(serde_json::Value::as_str))
        .map(str::to_string);

    let _ = repo.append_event(AppendWorkflowEventRequest {
        run_id: run_id.to_string(),
        event_type: if is_failed { "failed" } else { "completed" }.to_string(),
        message: Some(
            error_message
                .clone()
                .unwrap_or_else(|| "Knowledge Q&A completed".to_string()),
        ),
        progress: if is_failed { None } else { Some(1.0) },
        payload: Some(result.clone()),
    });
    let _ = artifact_repo.upsert_from_workflow_result(run_id, &result);

    let _ = repo.update_run(
        run_id,
        UpdateWorkflowRunRequest {
            status: Some(if is_failed { "failed" } else { "completed" }.to_string()),
            checkpoint_ref: None,
            approval_payload: None,
            cost_usd: None,
            error_message: if is_failed { error_message.clone() } else { None },
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
        if is_failed {
            let _ = qa_repo.update_message_result(
                message_id,
                "error",
                None,
                Some(&result),
                error_message.as_deref(),
            );
        } else {
            let _ = qa_repo.update_message_result(
                message_id,
                "answered",
                Some(answer),
                Some(&result),
                None,
            );
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{
        ChunkEmbeddingRecord, CreateEmbeddingProfileRequest, CreateMvp0DocumentChunkRequest,
        CreateMvp0DocumentRequest, Database, Mvp0DocumentChunk,
    };
    use std::path::PathBuf;
    use uuid::Uuid;

    struct TestAppDatabase {
        db: Database,
        path: PathBuf,
    }

    impl TestAppDatabase {
        fn new() -> Self {
            let path = std::env::temp_dir()
                .join(format!("xuejian-knowledge-test-{}.sqlite", Uuid::new_v4()));
            let mut db = Database::new_at(path.clone()).expect("temp db should open");
            db.run_migrations().expect("migrations should apply");
            Self { db, path }
        }

        fn db(&self) -> &Database {
            &self.db
        }
    }

    impl Drop for TestAppDatabase {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.path);
            let _ = std::fs::remove_file(self.path.with_extension("sqlite-wal"));
            let _ = std::fs::remove_file(self.path.with_extension("sqlite-shm"));
        }
    }

    fn create_test_document(repo: &Mvp0DocumentRepository<'_>, parse_status: &str) -> Mvp0Document {
        repo.create_document(CreateMvp0DocumentRequest {
            title: "RAG Fixture.pdf".to_string(),
            original_filename: "rag-fixture.pdf".to_string(),
            file_path: "E:/docs/rag-fixture.pdf".to_string(),
            file_hash: format!("rag-fixture-{parse_status}"),
            file_size: 2048,
            page_count: Some(1),
            parse_status: Some(parse_status.to_string()),
        })
        .expect("document should be created")
    }

    fn create_test_chunk(
        repo: &Mvp0DocumentRepository<'_>,
        document_id: &str,
        chunk_index: i32,
        parser: &str,
    ) -> Mvp0DocumentChunk {
        repo.create_chunk(CreateMvp0DocumentChunkRequest {
            document_id: document_id.to_string(),
            page_start: 1,
            page_end: 1,
            chunk_index,
            text: format!("Parsed chunk {chunk_index}"),
            parser: parser.to_string(),
        })
        .expect("chunk should be created")
    }

    fn create_active_profile(vector_repo: &VectorRepository<'_>) -> String {
        vector_repo
            .create_embedding_profile(CreateEmbeddingProfileRequest {
                provider: "custom_openai".to_string(),
                model: "Qwen/Qwen3-Embedding-8B".to_string(),
                dimensions: 3,
                distance_metric: Some("cosine".to_string()),
                is_active: true,
                revision: 1,
            })
            .expect("profile should be created")
            .id
    }

    fn store_embeddings(
        vector_repo: &VectorRepository<'_>,
        profile_id: &str,
        chunks: &[&Mvp0DocumentChunk],
    ) {
        let embeddings = chunks
            .iter()
            .map(|chunk| ChunkEmbeddingRecord {
                chunk_id: chunk.id.clone(),
                vector: vec![0.1, 0.2, 0.3],
                content_hash: None,
                chunking_profile_revision: None,
                embedding_profile_revision: None,
                embedding_dimensions: None,
            })
            .collect::<Vec<_>>();
        vector_repo
            .replace_chunk_embeddings(profile_id, &embeddings)
            .expect("embeddings should be stored");
    }

    #[test]
    fn stale_document_with_complete_child_embeddings_is_allowed_and_repaired() {
        let test_db = TestAppDatabase::new();
        let document_repo = Mvp0DocumentRepository::new(test_db.db().connection());
        let vector_repo = VectorRepository::new(test_db.db());
        let profile_id = create_active_profile(&vector_repo);
        let document = create_test_document(&document_repo, "embedding_stale");
        let _parent = create_test_chunk(&document_repo, &document.id, 0, "pymupdf::parent");
        let child_a = create_test_chunk(&document_repo, &document.id, 1, "pymupdf::child");
        let child_b = create_test_chunk(&document_repo, &document.id, 2, "pymupdf::child");
        store_embeddings(&vector_repo, &profile_id, &[&child_a, &child_b]);

        let result =
            evaluate_document_embedding_gate(&document_repo, &vector_repo, &document, &profile_id)
                .expect("gate should evaluate");

        assert_eq!(result, Ok(()));
        let repaired_document = document_repo
            .find_document_by_id(&document.id)
            .expect("document lookup should succeed")
            .expect("document should exist");
        assert_eq!(repaired_document.parse_status, "ready");
    }

    #[test]
    fn stale_document_with_incomplete_active_profile_embeddings_stays_stale() {
        let test_db = TestAppDatabase::new();
        let document_repo = Mvp0DocumentRepository::new(test_db.db().connection());
        let vector_repo = VectorRepository::new(test_db.db());
        let profile_id = create_active_profile(&vector_repo);
        let document = create_test_document(&document_repo, "embedding_stale");
        let child_a = create_test_chunk(&document_repo, &document.id, 0, "pymupdf::child");
        let _child_b = create_test_chunk(&document_repo, &document.id, 1, "pymupdf::child");
        store_embeddings(&vector_repo, &profile_id, &[&child_a]);

        let result =
            evaluate_document_embedding_gate(&document_repo, &vector_repo, &document, &profile_id)
                .expect("gate should evaluate");

        assert!(matches!(
            result,
            Err(KnowledgeQaEmbeddingGateFailure {
                status: "embedding_stale",
                ..
            })
        ));
    }

    #[test]
    fn retry_reset_clears_previous_assistant_result_in_place() {
        let test_db = TestAppDatabase::new();
        let qa_repo = KnowledgeQaRepository::new(test_db.db());
        let workflow_repo = WorkflowRepository::new(test_db.db());
        let document_ids = vec![Uuid::new_v4().to_string()];
        let conversation = qa_repo
            .create_conversation("Original question", &document_ids)
            .expect("conversation should be created");
        let user_message = qa_repo
            .create_message(
                &conversation.id,
                "user",
                "Original question",
                "answered",
                None,
                &document_ids,
            )
            .expect("user message should be created");
        let assistant_message = qa_repo
            .create_message(
                &conversation.id,
                "assistant",
                "Old answer",
                "pending",
                Some(
                    &workflow_repo
                        .create_run(CreateWorkflowRunRequest {
                            workflow_type: "knowledge_qa".to_string(),
                            preset_id: None,
                            status: "queued".to_string(),
                            thread_id: format!("knowledge-qa:{}", conversation.id),
                            started_at: None,
                        })
                        .expect("workflow run should be created")
                        .id,
                ),
                &document_ids,
            )
            .expect("assistant message should be created");
        let payload = serde_json::json!({ "answer": { "answer": "Old answer" } });
        qa_repo
            .update_message_result(
                &assistant_message.id,
                "answered",
                Some("Old answer"),
                Some(&payload),
                Some("old error"),
            )
            .expect("message result should be updated");

        let new_run_id = workflow_repo
            .create_run(CreateWorkflowRunRequest {
                workflow_type: "knowledge_qa".to_string(),
                preset_id: None,
                status: "queued".to_string(),
                thread_id: format!("knowledge-qa:{}", conversation.id),
                started_at: None,
            })
            .expect("retry workflow run should be created")
            .id;
        let reset = qa_repo
            .reset_assistant_message_for_retry(&assistant_message.id, &new_run_id)
            .expect("message should reset")
            .expect("message should exist");
        let messages = qa_repo
            .list_messages(&conversation.id)
            .expect("messages should load");
        let pair = find_knowledge_qa_turn_pair(&messages, &reset.id).expect("turn pair should resolve");

        assert_eq!(reset.id, assistant_message.id);
        assert_eq!(reset.status, "pending");
        assert_eq!(reset.content, "");
        assert_eq!(reset.workflow_run_id.as_deref(), Some(new_run_id.as_str()));
        assert!(reset.answer_payload.is_none());
        assert!(reset.error_message.is_none());
        assert_eq!(pair.user_message.id, user_message.id);
        assert_eq!(pair.assistant_message.id, assistant_message.id);
    }

    #[test]
    fn pending_message_check_ignores_target_assistant() {
        let test_db = TestAppDatabase::new();
        let qa_repo = KnowledgeQaRepository::new(test_db.db());
        let workflow_repo = WorkflowRepository::new(test_db.db());
        let conversation = qa_repo
            .create_conversation("Pending", &[])
            .expect("conversation should be created");
        let target = qa_repo
            .create_message(
                &conversation.id,
                "assistant",
                "",
                "pending",
                Some(
                    &workflow_repo
                        .create_run(CreateWorkflowRunRequest {
                            workflow_type: "knowledge_qa".to_string(),
                            preset_id: None,
                            status: "queued".to_string(),
                            thread_id: format!("knowledge-qa:{}", conversation.id),
                            started_at: None,
                        })
                        .expect("target workflow run should be created")
                        .id,
                ),
                &[],
            )
            .expect("target message should be created");
        let messages = qa_repo
            .list_messages(&conversation.id)
            .expect("messages should load");

        assert!(has_pending_knowledge_qa_message(&messages, None));
        assert!(!has_pending_knowledge_qa_message(&messages, Some(&target.id)));

        let other = qa_repo
            .create_message(
                &conversation.id,
                "assistant",
                "",
                "pending",
                Some(
                    &workflow_repo
                        .create_run(CreateWorkflowRunRequest {
                            workflow_type: "knowledge_qa".to_string(),
                            preset_id: None,
                            status: "queued".to_string(),
                            thread_id: format!("knowledge-qa:{}", conversation.id),
                            started_at: None,
                        })
                        .expect("other workflow run should be created")
                        .id,
                ),
                &[],
            )
            .expect("other message should be created");
        let messages = qa_repo
            .list_messages(&conversation.id)
            .expect("messages should reload");
        assert!(has_pending_knowledge_qa_message(&messages, Some(&target.id)));
        assert!(has_pending_knowledge_qa_message(&messages, Some(&other.id)));
    }
}
