use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        AppendWorkflowEventRequest, CreatePodcastEpisodeRequest, CreateWorkflowRunRequest,
        DocumentRepository, PodcastEpisode, PodcastRepository, UpdateWorkflowRunRequest,
        WorkflowRepository,
    },
};

const PODCAST_PRESET_ID: &str = "v3-2-ai-podcast";

// ───── DTOs ─────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PodcastEpisodeDto {
    pub id: String,
    pub document_id: Option<String>,
    pub run_id: Option<String>,
    pub title: String,
    pub scope_description: String,
    pub script_json: String,
    pub audio_path: Option<String>,
    pub duration_ms: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<PodcastEpisode> for PodcastEpisodeDto {
    fn from(e: PodcastEpisode) -> Self {
        Self {
            id: e.id,
            document_id: e.document_id,
            run_id: e.run_id,
            title: e.title,
            scope_description: e.scope_description,
            script_json: e.script_json,
            audio_path: e.audio_path,
            duration_ms: e.duration_ms,
            status: e.status,
            error_message: e.error_message,
            created_at: e.created_at,
            updated_at: e.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartPodcastDto {
    pub document_id: Option<String>,
    pub title: Option<String>,
    pub scope_description: Option<String>,
}

// ───── Commands ─────

#[tauri::command]
pub fn start_podcast_workflow(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    data: StartPodcastDto,
) -> CommandResult<PodcastEpisodeDto> {
    let episode = {
        let db = state.lock_db()?;
        let workflow_repo = WorkflowRepository::new(&db);
        let podcast_repo = PodcastRepository::new(&db);

        let title = data.title.clone().unwrap_or_else(|| "AI 播客".to_string());
        let scope = data.scope_description.clone().unwrap_or_default();

        // Create a WorkflowRun to track progress
        let run = workflow_repo.create_run(CreateWorkflowRunRequest {
            workflow_type: "podcast".to_string(),
            preset_id: Some(PODCAST_PRESET_ID.to_string()),
            status: "queued".to_string(),
            thread_id: format!("podcast:{}", data.document_id.as_deref().unwrap_or("adhoc")),
            started_at: None,
        })?;

        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run.id.clone(),
            event_type: "queued".to_string(),
            message: Some(format!("Queued podcast generation: {title}")),
            progress: Some(0.0),
            payload: None,
        })?;

        let episode_id = uuid::Uuid::new_v4().to_string();

        // Create podcast episode
        let episode = podcast_repo.insert(CreatePodcastEpisodeRequest {
            id: episode_id,
            document_id: data.document_id.clone(),
            run_id: Some(run.id.clone()),
            title,
            scope_description: scope,
        })?;

        episode
    };

    spawn_podcast_worker(app_handle, episode.id.clone());
    Ok(PodcastEpisodeDto::from(episode))
}

#[tauri::command]
pub fn get_podcast_episode(
    state: State<'_, AppState>,
    episode_id: String,
) -> CommandResult<Option<PodcastEpisodeDto>> {
    let db = state.lock_db()?;
    let repo = PodcastRepository::new(&db);
    let episode = repo.get_by_id(&episode_id)?;
    Ok(episode.map(PodcastEpisodeDto::from))
}

#[tauri::command]
pub fn list_podcast_episodes(
    state: State<'_, AppState>,
) -> CommandResult<Vec<PodcastEpisodeDto>> {
    let db = state.lock_db()?;
    let repo = PodcastRepository::new(&db);
    let episodes = repo.list_all()?;
    Ok(episodes.into_iter().map(PodcastEpisodeDto::from).collect())
}

#[tauri::command]
pub fn cancel_podcast_episode(
    state: State<'_, AppState>,
    episode_id: String,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let podcast_repo = PodcastRepository::new(&db);
    let workflow_repo = WorkflowRepository::new(&db);

    if let Some(episode) = podcast_repo.get_by_id(&episode_id)? {
        podcast_repo.cancel(&episode_id)?;
        if let Some(run_id) = &episode.run_id {
            let _ = workflow_repo.update_run(
                run_id,
                UpdateWorkflowRunRequest {
                    status: Some("cancelled".to_string()),
                    checkpoint_ref: None,
                    approval_payload: None,
                    cost_usd: None,
                    error_message: Some("User cancelled".to_string()),
                    started_at: None,
                    finished_at: Some(chrono::Utc::now().to_rfc3339()),
                },
            );
        }
    }
    Ok(())
}

#[tauri::command]
pub fn delete_podcast_episode(
    state: State<'_, AppState>,
    episode_id: String,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let repo = PodcastRepository::new(&db);
    repo.delete_by_id(&episode_id)?;
    Ok(())
}

// ───── Worker ─────

fn spawn_podcast_worker(app_handle: AppHandle, episode_id: String) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = execute_podcast_worker(&app_handle, &episode_id).await {
            log::error!("Podcast worker failed for episode {episode_id}: {e}");
            let _ = mark_podcast_failed(&app_handle, &episode_id, &e.to_string());
        }
    });
}

async fn execute_podcast_worker(
    app_handle: &AppHandle,
    episode_id: &str,
) -> CommandResult<()> {
    // Load episode
    let (title, scope, document_id, run_id) = {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let podcast_repo = PodcastRepository::new(&db);
        let episode = podcast_repo
            .get_by_id(episode_id)?
            .ok_or(CommandError::NotFound)?;
        (
            episode.title,
            episode.scope_description,
            episode.document_id,
            episode.run_id,
        )
    };

    let run_id_str = run_id.as_deref().unwrap_or("");

    // Mark generating
    {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let podcast_repo = PodcastRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);

        podcast_repo.set_generating(episode_id)?;

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
                message: Some(format!("Generating podcast: {title}")),
                progress: Some(0.1),
                payload: None,
            })?;
        }
    }

    // Build context from document if available
    let context_text = if let Some(doc_id) = &document_id {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let doc_repo = DocumentRepository::new(&db);
        let doc_title = doc_repo
            .find_by_id(doc_id)?
            .map(|d| d.title)
            .unwrap_or_default();
        format!("文档: {doc_title}\n范围: {scope}")
    } else {
        format!("主题: {title}\n范围: {scope}")
    };

    // Try orchestration service
    let orchestration_result =
        try_orchestration_podcast(app_handle, run_id_str, episode_id, &title, &context_text)
            .await;

    let script_json = match orchestration_result {
        Ok(script) => script,
        Err(error) => {
            log::warn!("Python orchestration unavailable for podcast, using fallback: {error}");
            build_fallback_podcast_script(&title, &context_text)
        }
    };

    // Estimate duration from script
    let duration_ms = estimate_duration_from_script(&script_json);

    // Persist result
    {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let podcast_repo = PodcastRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);

        podcast_repo.set_ready(episode_id, &script_json, duration_ms)?;

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
                message: Some("Podcast ready".to_string()),
                progress: Some(1.0),
                payload: None,
            })?;
        }
    }

    Ok(())
}

// ───── Orchestration ─────

async fn try_orchestration_podcast(
    app_handle: &AppHandle,
    run_id: &str,
    episode_id: &str,
    title: &str,
    context: &str,
) -> Result<String, String> {
    let state = app_handle.state::<AppState>();
    let health = state
        .orchestration
        .health()
        .await
        .map_err(|e| e.to_string())?;
    let endpoint = health.endpoint.ok_or("No orchestration endpoint")?;
    if health.status != "healthy" && health.status != "degraded" {
        return Err(format!(
            "Orchestration service status: {}",
            health.status
        ));
    }

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .post(format!("{endpoint}/workflows/podcast"))
        .json(&serde_json::json!({
            "runId": run_id,
            "episodeId": episode_id,
            "title": title,
            "context": context,
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

// ───── Fallback ─────

fn build_fallback_podcast_script(title: &str, context: &str) -> String {
    let short_context = if context.len() > 200 {
        &context[..200]
    } else {
        context
    };

    let script = serde_json::json!({
        "title": title,
        "description": format!("AI 生成的播客 — {}", title),
        "speakers": ["主持人", "专家"],
        "segments": [
            {
                "id": "seg1",
                "speaker": "主持人",
                "text": format!("大家好，欢迎收听今天的学习播客！今天我们要聊一聊关于「{}」的话题。", title),
                "durationMs": 8000
            },
            {
                "id": "seg2",
                "speaker": "专家",
                "text": format!("谢谢主持人。这个话题非常有趣。根据学习材料：{}", short_context),
                "durationMs": 12000
            },
            {
                "id": "seg3",
                "speaker": "主持人",
                "text": "能不能给我们的听众举个具体的例子呢？",
                "durationMs": 5000
            },
            {
                "id": "seg4",
                "speaker": "专家",
                "text": "当然可以。让我结合刚才提到的内容，做一个简单的总结和延伸。学习这个概念的关键是理解其核心原理。",
                "durationMs": 10000
            },
            {
                "id": "seg5",
                "speaker": "主持人",
                "text": "非常感谢今天的分享！希望大家通过这期播客对这个知识点有了更深入的理解。我们下期再见！",
                "durationMs": 8000
            }
        ]
    });

    serde_json::to_string(&script).unwrap_or_else(|_| "{}".to_string())
}

fn estimate_duration_from_script(script_json: &str) -> i64 {
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(script_json) {
        if let Some(segments) = val.get("segments").and_then(|s| s.as_array()) {
            let total: i64 = segments
                .iter()
                .filter_map(|seg| seg.get("durationMs").and_then(|d| d.as_i64()))
                .sum();
            if total > 0 {
                return total;
            }
        }
    }
    43_000
}

fn mark_podcast_failed(
    app_handle: &AppHandle,
    episode_id: &str,
    error: &str,
) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let podcast_repo = PodcastRepository::new(&db);
    podcast_repo.set_failed(episode_id, error)?;

    if let Ok(Some(episode)) = podcast_repo.get_by_id(episode_id) {
        if let Some(run_id) = episode.run_id {
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
