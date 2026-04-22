use std::{fs, path::PathBuf, time::Duration};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tokio::time::sleep;

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        AppendWorkflowEventRequest, AudioSegment, CreatePodcastEpisodeRequest,
        CreateWorkflowRunRequest, DocumentRepository, NewAudioSegment, PodcastEpisode,
        PodcastEpisodeUpdates, PodcastRepository, SettingsRepository, UpdateWorkflowRunRequest,
        WorkflowRepository,
    },
};

const PODCAST_PRESET_ID: &str = "v3-podcast-generation";
const PODCAST_WORKFLOW_TYPE: &str = "podcast_generation";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PodcastEpisodeDto {
    pub id: String,
    pub document_ids: Vec<String>,
    pub run_id: Option<String>,
    pub title: String,
    pub scope_description: String,
    pub style: String,
    pub language: String,
    pub duration_tier: String,
    pub tts_provider: String,
    pub audio_format: String,
    pub script_json: String,
    pub outline_json: Option<String>,
    pub evaluation_json: Option<String>,
    pub audio_path: Option<String>,
    pub duration_ms: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub current_stage: i64,
    pub completed_segments: i64,
    pub total_segments: i64,
    pub created_at: String,
    pub updated_at: String,
}

impl From<PodcastEpisode> for PodcastEpisodeDto {
    fn from(episode: PodcastEpisode) -> Self {
        Self {
            id: episode.id,
            document_ids: episode.document_ids,
            run_id: episode.run_id,
            title: episode.title,
            scope_description: episode.scope_description,
            style: episode.style,
            language: episode.language,
            duration_tier: episode.duration_tier,
            tts_provider: episode.tts_provider,
            audio_format: episode.audio_format,
            script_json: episode.script_json,
            outline_json: episode.outline_json,
            evaluation_json: episode.evaluation_json,
            audio_path: episode.audio_path,
            duration_ms: episode.duration_ms,
            status: episode.status,
            error_message: episode.error_message,
            current_stage: episode.current_stage,
            completed_segments: episode.completed_segments,
            total_segments: episode.total_segments,
            created_at: episode.created_at,
            updated_at: episode.updated_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSegmentDto {
    pub id: String,
    pub episode_id: String,
    pub dialogue_segment_id: String,
    pub speaker: String,
    pub file_path: String,
    pub duration_ms: i64,
    pub tts_provider: String,
    pub voice_id: String,
}

impl From<AudioSegment> for AudioSegmentDto {
    fn from(segment: AudioSegment) -> Self {
        Self {
            id: segment.id,
            episode_id: segment.episode_id,
            dialogue_segment_id: segment.dialogue_segment_id,
            speaker: segment.speaker,
            file_path: segment.file_path,
            duration_ms: segment.duration_ms,
            tts_provider: segment.tts_provider,
            voice_id: segment.voice_id,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartPodcastDto {
    pub document_ids: Vec<String>,
    pub prompt: Option<String>,
    pub style: Option<String>,
    pub language: Option<String>,
    pub duration_tier: Option<String>,
    pub tts_provider: Option<String>,
    pub audio_format: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PodcastWorkflowResponse {
    status: Option<String>,
    script_json: Option<String>,
    outline_json: Option<String>,
    evaluation_json: Option<String>,
    audio_path: Option<String>,
    duration_ms: Option<i64>,
    current_stage: Option<i64>,
    completed_segments: Option<i64>,
    total_segments: Option<i64>,
}

#[tauri::command]
pub fn start_podcast_workflow(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    data: StartPodcastDto,
) -> CommandResult<PodcastEpisodeDto> {
    if data.document_ids.is_empty() {
        return Err(CommandError::InvalidInput(
            "documentIds must contain at least one document".to_string(),
        ));
    }

    let prompt = data.prompt.unwrap_or_default().trim().to_string();
    let title = derive_podcast_title(&prompt);
    let scope_description = prompt;
    let style = data.style.unwrap_or_else(|| "interview".to_string());
    let language = data.language.unwrap_or_else(|| "zh-CN".to_string());
    let duration_tier = data.duration_tier.unwrap_or_else(|| "medium".to_string());
    let tts_provider = data.tts_provider.unwrap_or_else(|| "auto".to_string());
    let audio_format = data.audio_format.unwrap_or_else(|| "mp3".to_string());

    let episode = {
        let db = state.lock_db()?;
        let workflow_repo = WorkflowRepository::new(&db);
        let podcast_repo = PodcastRepository::new(&db);

        let run = workflow_repo.create_run(CreateWorkflowRunRequest {
            workflow_type: PODCAST_WORKFLOW_TYPE.to_string(),
            preset_id: Some(PODCAST_PRESET_ID.to_string()),
            status: "queued".to_string(),
            thread_id: build_thread_id(&data.document_ids),
            started_at: None,
        })?;

        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run.id.clone(),
            event_type: "queued".to_string(),
            message: Some(format!("Queued podcast generation: {}", title)),
            progress: Some(0.0),
            payload: None,
        })?;

        podcast_repo.create_episode(CreatePodcastEpisodeRequest {
            id: uuid::Uuid::new_v4().to_string(),
            document_ids: data.document_ids,
            run_id: Some(run.id),
            title,
            scope_description,
            style,
            language,
            duration_tier,
            tts_provider,
            audio_format,
        })?
    };

    spawn_podcast_worker(app_handle, episode.id.clone());
    Ok(PodcastEpisodeDto::from(episode))
}

#[tauri::command]
pub fn get_podcast_episode(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    episode_id: String,
) -> CommandResult<Option<PodcastEpisodeDto>> {
    Ok(auto_accept_review_if_due(&app_handle, state.inner(), &episode_id)?
        .map(PodcastEpisodeDto::from))
}

#[tauri::command]
pub fn list_podcast_episodes(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<Vec<PodcastEpisodeDto>> {
    let db = state.lock_db()?;
    let repo = PodcastRepository::new(&db);
    let episode_ids = repo
        .list_episodes()?
        .into_iter()
        .map(|episode| episode.id)
        .collect::<Vec<_>>();
    drop(repo);
    drop(db);

    let mut episodes = Vec::with_capacity(episode_ids.len());
    for episode_id in episode_ids {
        if let Some(episode) = auto_accept_review_if_due(&app_handle, state.inner(), &episode_id)? {
            episodes.push(PodcastEpisodeDto::from(episode));
        }
    }

    Ok(episodes)
}

#[tauri::command]
pub fn cancel_podcast_episode(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    episode_id: String,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let podcast_repo = PodcastRepository::new(&db);
    let workflow_repo = WorkflowRepository::new(&db);

    if let Some(episode) = podcast_repo.get_episode(&episode_id)? {
        let episode_dir = app_handle
            .path()
            .app_data_dir()
            .ok()
            .map(|app_data_dir| app_data_dir.join("podcasts").join(&episode_id));
        let _ = podcast_repo.delete_audio_segments_by_episode(&episode_id);
        if let Some(path) = episode_dir.as_ref().and_then(|path| path.to_str()) {
            let _ = delete_podcast_artifacts(path);
        }

        let _ = podcast_repo.update_episode(
            &episode_id,
            &PodcastEpisodeUpdates {
                status: Some("cancelled".to_string()),
                error_message: Some(Some("User cancelled".to_string())),
                audio_path: Some(None),
                completed_segments: Some(0),
                ..PodcastEpisodeUpdates::default()
            },
        )?;

        if let Some(run_id) = &episode.run_id {
            let _ = workflow_repo.update_run(
                run_id,
                UpdateWorkflowRunRequest {
                    status: Some("cancelled".to_string()),
                    checkpoint_ref: Some("cancelled".to_string()),
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
    let audio_path = {
        let db = state.lock_db()?;
        let repo = PodcastRepository::new(&db);
        repo.get_episode(&episode_id)?.and_then(|episode| episode.audio_path)
    };

    if let Some(path) = audio_path.as_deref() {
        let _ = delete_podcast_artifacts(path);
    }

    let db = state.lock_db()?;
    let repo = PodcastRepository::new(&db);
    repo.delete_episode(&episode_id)?;
    Ok(())
}

#[tauri::command]
pub fn review_podcast_script(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    episode_id: String,
    action: String,
    edited_script_json: Option<String>,
) -> CommandResult<PodcastEpisodeDto> {
    let updated = apply_review_action(
        &app_handle,
        state.inner(),
        &episode_id,
        &action,
        edited_script_json,
        None,
    )?;
    Ok(PodcastEpisodeDto::from(updated))
}

#[tauri::command]
pub fn retry_podcast_episode(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    episode_id: String,
) -> CommandResult<PodcastEpisodeDto> {
    let original = {
        let db = state.lock_db()?;
        let repo = PodcastRepository::new(&db);
        repo.get_episode(&episode_id)?
            .ok_or(CommandError::NotFound)?
    };

    let retried = {
        let db = state.lock_db()?;
        let workflow_repo = WorkflowRepository::new(&db);
        let podcast_repo = PodcastRepository::new(&db);
        let run = workflow_repo.create_run(CreateWorkflowRunRequest {
            workflow_type: PODCAST_WORKFLOW_TYPE.to_string(),
            preset_id: Some(PODCAST_PRESET_ID.to_string()),
            status: "queued".to_string(),
            thread_id: build_thread_id(&original.document_ids),
            started_at: None,
        })?;

        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run.id.clone(),
            event_type: "queued".to_string(),
            message: Some(format!("Queued podcast retry: {}", original.title)),
            progress: Some(0.0),
            payload: None,
        })?;

        podcast_repo.create_episode(CreatePodcastEpisodeRequest {
            id: uuid::Uuid::new_v4().to_string(),
            document_ids: original.document_ids.clone(),
            run_id: Some(run.id),
            title: original.title,
            scope_description: original.scope_description,
            style: original.style,
            language: original.language,
            duration_tier: original.duration_tier,
            tts_provider: original.tts_provider,
            audio_format: original.audio_format,
        })?
    };

    spawn_podcast_worker(app_handle, retried.id.clone());
    Ok(PodcastEpisodeDto::from(retried))
}

#[tauri::command]
pub fn get_podcast_audio_segments(
    state: State<'_, AppState>,
    episode_id: String,
) -> CommandResult<Vec<AudioSegmentDto>> {
    let db = state.lock_db()?;
    let repo = PodcastRepository::new(&db);
    Ok(repo
        .list_audio_segments(&episode_id)?
        .into_iter()
        .map(AudioSegmentDto::from)
        .collect())
}

fn spawn_podcast_worker(app_handle: AppHandle, episode_id: String) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_podcast_worker(&app_handle, &episode_id).await {
            log::error!("Podcast worker failed for episode {}: {}", episode_id, error);
            let _ = mark_podcast_failed(&app_handle, &episode_id, &error.to_string());
        }
    });
}

async fn execute_podcast_worker(app_handle: &AppHandle, episode_id: &str) -> CommandResult<()> {
    let episode = {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let podcast_repo = PodcastRepository::new(&db);
        podcast_repo
            .get_episode(episode_id)?
            .ok_or(CommandError::NotFound)?
    };

    let run_id = episode.run_id.clone().unwrap_or_default();
    let resume_audio_only = episode.current_stage >= 5
        && episode.audio_path.is_none()
        && !episode.script_json.trim().is_empty();
    let initial_status = if resume_audio_only {
        "generating_audio"
    } else {
        "retrieving"
    };
    let initial_stage = if resume_audio_only { 5 } else { 1 };
    let checkpoint_ref = if resume_audio_only {
        "generating_audio"
    } else {
        "retrieving"
    };
    let start_progress = if resume_audio_only { 0.72 } else { 0.1 };
    let start_message = if resume_audio_only {
        format!("Resuming podcast audio generation: {}", episode.title)
    } else {
        format!("Generating podcast: {}", episode.title)
    };

    {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let podcast_repo = PodcastRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);

        let _ = podcast_repo.update_episode(
            episode_id,
            &PodcastEpisodeUpdates {
                status: Some(initial_status.to_string()),
                current_stage: Some(initial_stage),
                error_message: Some(None),
                ..PodcastEpisodeUpdates::default()
            },
        )?;

        if !run_id.is_empty() {
            workflow_repo.update_run(
                &run_id,
                UpdateWorkflowRunRequest {
                    status: Some("running".to_string()),
                    checkpoint_ref: Some(checkpoint_ref.to_string()),
                    approval_payload: None,
                    cost_usd: None,
                    error_message: None,
                    started_at: Some(chrono::Utc::now().to_rfc3339()),
                    finished_at: None,
                },
            )?;
            workflow_repo.append_event(AppendWorkflowEventRequest {
                run_id: run_id.clone(),
                event_type: if resume_audio_only {
                    "resumed".to_string()
                } else {
                    "started".to_string()
                },
                message: Some(start_message),
                progress: Some(start_progress),
                payload: None,
            })?;
        }
    }

    let document_titles = {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let doc_repo = DocumentRepository::new(&db);
        episode
            .document_ids
            .iter()
            .filter_map(|document_id| {
                doc_repo
                    .find_by_id(document_id)
                    .ok()
                    .flatten()
                    .map(|document| document.title)
            })
            .collect::<Vec<_>>()
    };

    let context_text = build_context_text(&episode.title, &episode.scope_description, &document_titles);

    let result = match try_orchestration_podcast(
        app_handle,
        &run_id,
        episode_id,
        &episode.title,
        &episode.document_ids,
        &episode.scope_description,
        &episode.style,
        &episode.language,
        &episode.duration_tier,
        &episode.tts_provider,
        &episode.audio_format,
    )
    .await
    {
        Ok(result) => normalize_workflow_result(result, &episode.title, &context_text),
        Err(error) => {
            log::warn!("Podcast orchestration unavailable, using fallback: {}", error);
            build_fallback_podcast_result(&episode.title, &context_text)
        }
    };

    let script_json = result
        .script_json
        .clone()
        .unwrap_or_else(|| build_fallback_podcast_result(&episode.title, &context_text).script_json.unwrap());
    let duration_ms = result
        .duration_ms
        .unwrap_or_else(|| estimate_duration_from_script(&script_json));
    let episode_status = result.status.clone().unwrap_or_else(|| "ready".to_string());
    let current_stage = result.current_stage.unwrap_or(if result.audio_path.is_some() { 6 } else { 4 });

    {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let podcast_repo = PodcastRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);

        let updated_episode = podcast_repo.update_episode(
            episode_id,
            &PodcastEpisodeUpdates {
                script_json: Some(script_json),
                outline_json: Some(Some(result.outline_json.clone().unwrap_or_default())).filter(|value| value.as_ref().is_some_and(|content| !content.is_empty())),
                evaluation_json: Some(Some(result.evaluation_json.clone().unwrap_or_default())).filter(|value| value.as_ref().is_some_and(|content| !content.is_empty())),
                audio_path: Some(result.audio_path.clone()),
                duration_ms: Some(duration_ms),
                status: Some(episode_status.clone()),
                error_message: Some(None),
                current_stage: Some(current_stage),
                completed_segments: Some(result.completed_segments.unwrap_or(0)),
                total_segments: Some(result.total_segments.unwrap_or(0)),
                ..PodcastEpisodeUpdates::default()
            },
        )?;

        if let Some(path) = updated_episode.audio_path.as_deref() {
            persist_audio_segments_from_script(&podcast_repo, &updated_episode.id, &updated_episode.script_json, path)?;
        }

        if !run_id.is_empty() {
            let (run_status, event_type, progress) = match episode_status.as_str() {
                "awaiting_review" => ("waiting_confirmation", "waiting_confirmation", Some(0.7)),
                "ready" => ("completed", "completed", Some(1.0)),
                "failed" => ("failed", "failed", None),
                _ => ("running", "progress", Some(0.8)),
            };

            let checkpoint_ref = match episode_status.as_str() {
                "awaiting_review" => Some("awaiting_review".to_string()),
                "ready" => Some("ready".to_string()),
                _ => Some("processing".to_string()),
            };

            workflow_repo.update_run(
                &run_id,
                UpdateWorkflowRunRequest {
                    status: Some(run_status.to_string()),
                    checkpoint_ref,
                    approval_payload: None,
                    cost_usd: None,
                    error_message: None,
                    started_at: None,
                    finished_at: if run_status == "completed" || run_status == "failed" {
                        Some(chrono::Utc::now().to_rfc3339())
                    } else {
                        None
                    },
                },
            )?;

            workflow_repo.append_event(AppendWorkflowEventRequest {
                run_id: run_id.clone(),
                event_type: event_type.to_string(),
                message: Some(format!("Podcast {}", episode_status)),
                progress,
                payload: None,
            })?;
        }
    }

    if episode_status == "awaiting_review" {
        schedule_review_timeout(app_handle.clone(), episode_id.to_string());
    }

    Ok(())
}

async fn try_orchestration_podcast(
    app_handle: &AppHandle,
    run_id: &str,
    episode_id: &str,
    title: &str,
    document_ids: &[String],
    prompt: &str,
    style: &str,
    language: &str,
    duration_tier: &str,
    tts_provider: &str,
    audio_format: &str,
) -> Result<PodcastWorkflowResponse, String> {
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
        .timeout(Duration::from_secs(30 * 60))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .post(format!("{}/workflows/podcast", endpoint))
        .json(&serde_json::json!({
            "runId": run_id,
            "episodeId": episode_id,
            "title": title,
            "documentIds": document_ids,
            "prompt": prompt,
            "style": style,
            "language": language,
            "durationTier": duration_tier,
            "ttsProvider": tts_provider,
            "audioFormat": audio_format,
        }))
        .send()
        .await
        .map_err(|error| format!("Orchestration request failed: {}", error))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Orchestration returned {}: {}", status, body));
    }

    let result = response
        .json::<PodcastWorkflowResponse>()
        .await
        .map_err(|error| error.to_string())?;

    if result.script_json.is_none() {
        return Err("Missing scriptJson in response".to_string());
    }

    Ok(result)
}

fn normalize_workflow_result(
    mut result: PodcastWorkflowResponse,
    title: &str,
    context_text: &str,
) -> PodcastWorkflowResponse {
    if result.script_json.is_none() {
        return build_fallback_podcast_result(title, context_text);
    }

    if result.duration_ms.is_none() {
        result.duration_ms = result
            .script_json
            .as_ref()
            .map(|script_json| estimate_duration_from_script(script_json));
    }

    if result.current_stage.is_none() {
        result.current_stage = Some(if result.audio_path.is_some() { 6 } else { 4 });
    }

    result
}

fn build_fallback_podcast_result(title: &str, context: &str) -> PodcastWorkflowResponse {
    let short_context = if context.len() > 240 {
        &context[..240]
    } else {
        context
    };

    let script = serde_json::json!({
        "title": title,
        "description": format!("AI 生成的学习播客 — {}", title),
        "speakers": ["主持人", "专家"],
        "outline": ["话题介绍", "核心概念", "实际应用"],
        "segments": [
            {
                "id": "seg1",
                "speaker": "主持人",
                "text": format!("欢迎收听今天的学习播客，我们会围绕「{}」展开。", title),
                "durationMs": 5000
            },
            {
                "id": "seg2",
                "speaker": "专家",
                "text": format!("结合文档内容来看，核心背景是：{}", short_context),
                "durationMs": 6000
            }
        ]
    });
    let outline = serde_json::json!({
        "title": title,
        "description": format!("{} 提纲", title),
        "totalTargetDurationMs": 11000,
        "segments": [
            {
                "segmentIndex": 0,
                "topic": "话题介绍",
                "keyPoints": ["介绍主题", "交代背景"],
                "targetDurationMs": 5000,
                "speakerAssignments": [
                    { "speakerId": "host", "role": "主持人" },
                    { "speakerId": "expert", "role": "专家" }
                ]
            },
            {
                "segmentIndex": 1,
                "topic": "核心概念",
                "keyPoints": ["拆解要点", "连接文档"],
                "targetDurationMs": 6000,
                "speakerAssignments": [
                    { "speakerId": "expert", "role": "专家" },
                    { "speakerId": "host", "role": "主持人" }
                ]
            }
        ]
    });
    let evaluation = serde_json::json!({
        "coherence": 8,
        "accuracy": 8,
        "styleConsistency": 8,
        "naturalness": 8,
        "overallScore": 8,
        "issues": [],
        "suggestions": ["可在后续加入更多案例"],
        "revised": false
    });
    let script_json = serde_json::to_string(&script).unwrap_or_else(|_| "{}".to_string());

    PodcastWorkflowResponse {
        status: Some("ready".to_string()),
        script_json: Some(script_json.clone()),
        outline_json: Some(serde_json::to_string(&outline).unwrap_or_else(|_| "{}".to_string())),
        evaluation_json: Some(
            serde_json::to_string(&evaluation).unwrap_or_else(|_| "{}".to_string()),
        ),
        audio_path: None,
        duration_ms: Some(estimate_duration_from_script(&script_json)),
        current_stage: Some(4),
        completed_segments: Some(2),
        total_segments: Some(2),
    }
}

fn estimate_duration_from_script(script_json: &str) -> i64 {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(script_json) {
        if let Some(segments) = value.get("segments").and_then(|segments| segments.as_array()) {
            let total: i64 = segments
                .iter()
                .filter_map(|segment| segment.get("durationMs").and_then(|duration| duration.as_i64()))
                .sum();
            if total > 0 {
                return total;
            }
        }
    }

    43_000
}

fn derive_podcast_title(prompt: &str) -> String {
    if prompt.is_empty() {
        "AI 学习播客".to_string()
    } else {
        prompt.chars().take(40).collect()
    }
}

fn build_thread_id(document_ids: &[String]) -> String {
    document_ids
        .first()
        .map(|document_id| format!("podcast:{}", document_id))
        .unwrap_or_else(|| "podcast:adhoc".to_string())
}

fn build_context_text(title: &str, scope_description: &str, document_titles: &[String]) -> String {
    let titles = if document_titles.is_empty() {
        "未命名文档集合".to_string()
    } else {
        document_titles.join(" / ")
    };

    if scope_description.is_empty() {
        format!("文档集合: {}\n主题: {}", titles, title)
    } else {
        format!("文档集合: {}\n主题: {}\n关注点: {}", titles, title, scope_description)
    }
}

fn persist_audio_segments_from_script(
    podcast_repo: &PodcastRepository<'_>,
    episode_id: &str,
    script_json: &str,
    audio_path: &str,
) -> CommandResult<()> {
    if !podcast_repo.list_audio_segments(episode_id)?.is_empty() {
        return Ok(());
    }

    let script = serde_json::from_str::<serde_json::Value>(script_json)
        .map_err(|error| CommandError::Internal(error.to_string()))?;
    let Some(segments) = script.get("segments").and_then(|segments| segments.as_array()) else {
        return Ok(());
    };

    for segment in segments {
        let segment_id = segment
            .get("id")
            .and_then(|value| value.as_str())
            .unwrap_or("segment");
        let speaker = segment
            .get("speaker")
            .and_then(|value| value.as_str())
            .unwrap_or("speaker")
            .to_string();
        let duration_ms = segment
            .get("durationMs")
            .and_then(|value| value.as_i64())
            .unwrap_or(0);

        podcast_repo.save_audio_segment(NewAudioSegment {
            id: format!("{}-{}", episode_id, segment_id),
            episode_id: episode_id.to_string(),
            dialogue_segment_id: segment_id.to_string(),
            speaker,
            file_path: audio_path.to_string(),
            duration_ms,
            tts_provider: "auto".to_string(),
            voice_id: "default".to_string(),
        })?;
    }

    Ok(())
}

fn parse_episode_timestamp(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|timestamp| timestamp.with_timezone(&Utc))
}

fn load_review_timeout_minutes(state: &AppState) -> CommandResult<i64> {
    let db = state.lock_db()?;
    let settings_repo = SettingsRepository::new(&db);
    Ok(i64::from(settings_repo.get_settings()?.review_time_limit.max(0)))
}

fn has_review_timed_out(episode: &PodcastEpisode, review_timeout_minutes: i64) -> bool {
    if episode.status != "awaiting_review" {
        return false;
    }

    let Some(updated_at) = parse_episode_timestamp(&episode.updated_at) else {
        return false;
    };

    let timeout_minutes = review_timeout_minutes.max(0);
    let deadline = updated_at + chrono::Duration::minutes(timeout_minutes);
    Utc::now() >= deadline
}

fn apply_review_action(
    app_handle: &AppHandle,
    state: &AppState,
    episode_id: &str,
    action: &str,
    edited_script_json: Option<String>,
    message_override: Option<&str>,
) -> CommandResult<PodcastEpisode> {
    let db = state.lock_db()?;
    let repo = PodcastRepository::new(&db);
    let workflow_repo = WorkflowRepository::new(&db);
    let episode = repo
        .get_episode(episode_id)?
        .ok_or(CommandError::NotFound)?;

    let should_resume_audio =
        episode.audio_path.is_none() && matches!(action, "accept" | "edit");
    let next_stage = if episode.audio_path.is_some() {
        6
    } else if should_resume_audio {
        5
    } else {
        4
    };

    let (updates, run_status, checkpoint_ref, event_type, event_message, progress, finished_at) =
        match action {
            "accept" => (
                PodcastEpisodeUpdates {
                    status: Some(if should_resume_audio {
                        "generating_audio".to_string()
                    } else {
                        "ready".to_string()
                    }),
                    error_message: Some(None),
                    current_stage: Some(next_stage),
                    ..PodcastEpisodeUpdates::default()
                },
                if should_resume_audio { "running" } else { "completed" },
                if should_resume_audio {
                    "generating_audio"
                } else {
                    "ready"
                },
                if should_resume_audio { "resumed" } else { "completed" },
                message_override.unwrap_or(if should_resume_audio {
                    "Review accepted, resuming podcast audio generation"
                } else {
                    "Review accepted, podcast episode marked ready"
                }),
                if should_resume_audio { Some(0.72) } else { Some(1.0) },
                if should_resume_audio {
                    None
                } else {
                    Some(Utc::now().to_rfc3339())
                },
            ),
            "edit" => {
                let edited_script_json = edited_script_json.ok_or_else(|| {
                    CommandError::InvalidInput(
                        "editedScriptJson is required when action is edit".to_string(),
                    )
                })?;
                (
                    PodcastEpisodeUpdates {
                        script_json: Some(edited_script_json),
                        status: Some(if should_resume_audio {
                            "generating_audio".to_string()
                        } else {
                            "ready".to_string()
                        }),
                        error_message: Some(None),
                        current_stage: Some(next_stage),
                        ..PodcastEpisodeUpdates::default()
                    },
                    if should_resume_audio { "running" } else { "completed" },
                    if should_resume_audio {
                        "generating_audio"
                    } else {
                        "ready"
                    },
                    if should_resume_audio { "resumed" } else { "completed" },
                    message_override.unwrap_or(if should_resume_audio {
                        "Review edits saved, resuming podcast audio generation"
                    } else {
                        "Review edits saved, podcast episode marked ready"
                    }),
                    if should_resume_audio { Some(0.72) } else { Some(1.0) },
                    if should_resume_audio {
                        None
                    } else {
                        Some(Utc::now().to_rfc3339())
                    },
                )
            }
            "reject" => (
                PodcastEpisodeUpdates {
                    status: Some("cancelled".to_string()),
                    error_message: Some(Some("Review rejected".to_string())),
                    ..PodcastEpisodeUpdates::default()
                },
                "cancelled",
                "cancelled",
                "cancelled",
                message_override.unwrap_or("Review rejected, podcast episode cancelled"),
                Some(1.0),
                Some(Utc::now().to_rfc3339()),
            ),
            _ => {
                return Err(CommandError::InvalidInput(format!(
                    "Unsupported review action: {}",
                    action
                )))
            }
        };

    let updated = repo.update_episode(episode_id, &updates)?;

    if let Some(run_id) = &episode.run_id {
        workflow_repo.update_run(
            run_id,
            UpdateWorkflowRunRequest {
                status: Some(run_status.to_string()),
                checkpoint_ref: Some(checkpoint_ref.to_string()),
                approval_payload: None,
                cost_usd: None,
                error_message: None,
                started_at: None,
                finished_at,
            },
        )?;
        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run_id.clone(),
            event_type: event_type.to_string(),
            message: Some(event_message.to_string()),
            progress,
            payload: None,
        })?;
    }

    drop(workflow_repo);
    drop(repo);
    drop(db);

    if should_resume_audio {
        spawn_podcast_worker(app_handle.clone(), episode_id.to_string());
    }

    Ok(updated)
}

fn auto_accept_review_if_due(
    app_handle: &AppHandle,
    state: &AppState,
    episode_id: &str,
) -> CommandResult<Option<PodcastEpisode>> {
    let review_timeout_minutes = load_review_timeout_minutes(state)?;

    let episode = {
        let db = state.lock_db()?;
        let repo = PodcastRepository::new(&db);
        repo.get_episode(episode_id)?
    };

    let Some(episode) = episode else {
        return Ok(None);
    };

    if !has_review_timed_out(&episode, review_timeout_minutes) {
        return Ok(Some(episode));
    }

    let message = if review_timeout_minutes > 0 {
        format!(
            "Review timed out after {} minutes, auto-accepting script",
            review_timeout_minutes
        )
    } else {
        "Review timed out, auto-accepting script".to_string()
    };

    Ok(Some(apply_review_action(
        app_handle,
        state,
        episode_id,
        "accept",
        None,
        Some(&message),
    )?))
}

fn schedule_review_timeout(app_handle: AppHandle, episode_id: String) {
    tauri::async_runtime::spawn(async move {
        let review_timeout_minutes = {
            let state = app_handle.state::<AppState>();
            match load_review_timeout_minutes(state.inner()) {
                Ok(value) => value,
                Err(error) => {
                    log::warn!(
                        "Failed to load review timeout for podcast {}: {}",
                        episode_id,
                        error
                    );
                    return;
                }
            }
        };

        let timeout_seconds = review_timeout_minutes.max(0) as u64 * 60;
        if timeout_seconds > 0 {
            sleep(Duration::from_secs(timeout_seconds)).await;
        }

        let state = app_handle.state::<AppState>();
        if let Err(error) = auto_accept_review_if_due(&app_handle, state.inner(), &episode_id) {
            log::warn!(
                "Failed to auto-accept timed out review for podcast {}: {}",
                episode_id,
                error
            );
        }
    });
}

fn delete_podcast_artifacts(audio_path: &str) -> std::io::Result<()> {
    let path = PathBuf::from(audio_path);
    if path.is_file() {
        if let Some(parent) = path.parent() {
            if parent.exists() {
                return fs::remove_dir_all(parent);
            }
        }
        if path.exists() {
            return fs::remove_file(path);
        }
        return Ok(());
    }

    if path.exists() {
        return fs::remove_dir_all(path);
    }

    Ok(())
}

fn mark_podcast_failed(app_handle: &AppHandle, episode_id: &str, error: &str) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let podcast_repo = PodcastRepository::new(&db);

    let episode = podcast_repo.update_episode(
        episode_id,
        &PodcastEpisodeUpdates {
            status: Some("failed".to_string()),
            error_message: Some(Some(error.to_string())),
            ..PodcastEpisodeUpdates::default()
        },
    )?;

    if let Some(run_id) = episode.run_id {
        let workflow_repo = WorkflowRepository::new(&db);
        let _ = workflow_repo.update_run(
            &run_id,
            UpdateWorkflowRunRequest {
                status: Some("failed".to_string()),
                checkpoint_ref: Some("failed".to_string()),
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

    Ok(())
}
