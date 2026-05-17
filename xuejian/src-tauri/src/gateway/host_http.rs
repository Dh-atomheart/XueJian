use std::{collections::BTreeMap, net::TcpListener, sync::Arc};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::app_state::AppState;
use crate::commands::settings::resolve_effective_embedding_profile;
use crate::db::{
    rag_embedding_readiness_status, rag_required_chunk_count, ApiConfig, ChunkEmbeddingRecord,
    CreateCardCandidateRequest, EmbeddingProfile, ModelProfile, Mvp0BackgroundJobRepository,
    KnowledgeQaRepository,
    ProviderBudgetUsage, QueryEmbeddingCacheRepository, SettingsRepository,
    UpdateMvp0BackgroundJobStatusRequest, UpsertQueryEmbeddingCacheRequest, VectorRepository,
    WorkflowModelAssignment,
};
use crate::gateway::ORCHESTRATION_PROTOCOL_VERSION;

#[derive(Debug, thiserror::Error)]
pub enum HostGatewayError {
    #[error("HTTP error: {0}")]
    Http(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Database error: {0}")]
    Db(#[from] crate::db::DbError),
    #[error("Secrets error: {0}")]
    Secrets(#[from] crate::secrets::SecretError),
    #[error("App error: {0}")]
    App(String),
}

impl From<crate::app_state::AppError> for HostGatewayError {
    fn from(error: crate::app_state::AppError) -> Self {
        HostGatewayError::App(error.to_string())
    }
}

type Result<T> = std::result::Result<T, HostGatewayError>;

/// Shared state accessible from the HTTP handler.
pub struct HostGatewayState {
    pub app_handle: AppHandle,
    pub token: String,
}

/// A minimal HTTP gateway that the Python orchestration service can call
/// to access Host-controlled resources: API keys, document data, and
/// candidate persistence.
pub struct HostHttpGateway {
    state: Arc<HostGatewayState>,
    port: u16,
}

impl HostHttpGateway {
    pub fn new(app_handle: AppHandle) -> Result<Self> {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        let port = listener.local_addr()?.port();
        drop(listener);

        Ok(Self {
            state: Arc::new(HostGatewayState {
                app_handle,
                token: uuid::Uuid::new_v4().to_string(),
            }),
            port,
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn token(&self) -> String {
        self.state.token.clone()
    }

    pub fn state(&self) -> Arc<HostGatewayState> {
        self.state.clone()
    }

    /// Start the gateway server in a background task.
    /// Returns the port the server is listening on.
    pub fn start(&self) -> Result<u16> {
        let state = self.state.clone();
        let listener = TcpListener::bind(format!("127.0.0.1:{}", self.port))?;
        let actual_port = listener.local_addr()?.port();

        log::info!("Host HTTP gateway listening on 127.0.0.1:{actual_port}");

        tauri::async_runtime::spawn(async move {
            loop {
                let (stream, _addr) = match listener.accept() {
                    Ok(conn) => conn,
                    Err(error) => {
                        log::error!("Host gateway accept error: {error}");
                        continue;
                    }
                };

                let state = state.clone();
                tokio::task::spawn_blocking(move || {
                    handle_connection(stream, &state);
                });
            }
        });

        Ok(actual_port)
    }
}

fn handle_connection(mut stream: std::net::TcpStream, state: &HostGatewayState) {
    use std::io::{BufRead, BufReader, Read, Write};

    let started_at = std::time::Instant::now();
    let mut reader = BufReader::new(&stream);
    let mut request_line = String::new();
    let _ = reader.read_line(&mut request_line);
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    let method = parts.first().copied().unwrap_or("GET");
    let path = parts.get(1).copied().unwrap_or("/");

    // Read headers (we need Content-Length for POST bodies)
    let mut headers = BTreeMap::new();
    let mut content_length: usize = 0;
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        if line.trim().is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            let name = name.trim().to_ascii_lowercase();
            let value = value.trim().to_string();
            if name == "content-length" {
                content_length = value.parse().unwrap_or(0);
            }
            headers.insert(name, value);
        }
    }

    // Read body from the same reader (not stream directly) to use BufReader's buffered data
    let body: Vec<u8> = if content_length > 0 {
        let mut body = vec![0u8; content_length];
        let _ = reader.read_exact(&mut body);
        body
    } else {
        Vec::new()
    };

    let response = route_request(method, path, &headers, &body, state);
    let status_code = response.status_code();
    let duration_ms = started_at.elapsed().as_secs_f64() * 1000.0;
    let trace_id = headers
        .get("x-xuejian-trace-id")
        .map(String::as_str)
        .unwrap_or("-");
    if duration_ms >= 500.0 {
        log::warn!(
            target: "host_gateway",
            "host_gateway.slow_request method={method} path={path} status={status_code} trace={trace_id} duration_ms={duration_ms:.2}"
        );
    }
    if status_code >= 500 {
        log::error!(
            target: "host_gateway",
            "HTTP {method} {path} -> {status_code} trace={trace_id} ({duration_ms:.2}ms)"
        );
    } else {
        log::info!(
            target: "host_gateway",
            "HTTP {method} {path} -> {status_code} trace={trace_id} ({duration_ms:.2}ms)"
        );
    }
    let reason_phrase = http_reason_phrase(status_code);
    let response_bytes = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status_code,
        reason_phrase,
        response.body().len(),
        response.body(),
    );

    let _ = stream.write_all(response_bytes.as_bytes());
    let _ = stream.flush();
}

fn http_reason_phrase(status_code: u16) -> &'static str {
    match status_code {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        500 => "Internal Server Error",
        _ => "Unknown",
    }
}

enum GatewayResponse {
    Ok(String),
    NotFound(String),
    BadRequest(String),
    Unauthorized(String),
    InternalError(String),
}

impl GatewayResponse {
    fn status_code(&self) -> u16 {
        match self {
            Self::Ok(_) => 200,
            Self::NotFound(_) => 404,
            Self::BadRequest(_) => 400,
            Self::Unauthorized(_) => 401,
            Self::InternalError(_) => 500,
        }
    }

    fn body(&self) -> &str {
        match self {
            Self::Ok(s)
            | Self::NotFound(s)
            | Self::BadRequest(s)
            | Self::Unauthorized(s)
            | Self::InternalError(s) => s,
        }
    }
}

fn route_request(
    method: &str,
    path: &str,
    headers: &BTreeMap<String, String>,
    body: &[u8],
    state: &HostGatewayState,
) -> GatewayResponse {
    if !is_gateway_authorized(headers, &state.token) {
        return GatewayResponse::Unauthorized(json!({"error": "unauthorized"}).to_string());
    }

    let app_state = state.app_handle.state::<AppState>();

    match (method, path) {
        // ── Protocol ──────────────────────────────────────
        ("GET", "/handshake") => {
            let payload = json!({
                "protocolVersion": ORCHESTRATION_PROTOCOL_VERSION,
                "service": "host-gateway",
                "capabilities": ["model-gateway", "tool-gateway"],
            });
            GatewayResponse::Ok(payload.to_string())
        }

        // ── ModelGateway ──────────────────────────────────
        ("GET", "/model-gateway/configs") => match list_api_configs_json(&app_state) {
            Ok(payload) => GatewayResponse::Ok(payload.to_string()),
            Err(error) => {
                GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
            }
        },

        ("GET", "/model-gateway/workflow-assignments") => {
            match list_workflow_assignments_json(&app_state) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/model-gateway/workflow-assignments/") => {
            let workflow_type = path
                .strip_prefix("/model-gateway/workflow-assignments/")
                .unwrap_or("");
            match get_workflow_assignment_json(&app_state, workflow_type) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/model-gateway/configs/") => {
            let id = path.strip_prefix("/model-gateway/configs/").unwrap_or("");
            match get_api_config_json(&app_state, id) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/model-gateway/api-key/") => {
            let config_id = path.strip_prefix("/model-gateway/api-key/").unwrap_or("");
            match get_api_key_json(&app_state, config_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/model-gateway/budget-usage/") => {
            let config_id = path
                .strip_prefix("/model-gateway/budget-usage/")
                .unwrap_or("");
            match get_provider_budget_usage_json(&app_state, config_id) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/model-gateway/workflow-cost") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };

            match record_workflow_cost_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", "/model-gateway/embedding-profiles") => {
            match list_embedding_profiles_json(&app_state) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", "/model-gateway/embedding-profiles/active") => {
            match get_active_embedding_profile_json(&app_state) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        // ── ToolGateway ───────────────────────────────────
        ("GET", "/tool-gateway/settings") => match get_app_settings_json(&app_state) {
            Ok(payload) => GatewayResponse::Ok(payload.to_string()),
            Err(error) => {
                GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
            }
        },

        ("GET", "/tool-gateway/runtime-paths") => match get_runtime_paths_json(state) {
            Ok(payload) => GatewayResponse::Ok(payload.to_string()),
            Err(error) => {
                GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
            }
        },

        ("GET", path) if path.starts_with("/tool-gateway/jobs/") && path.ends_with("/status") => {
            let job_id = path
                .strip_prefix("/tool-gateway/jobs/")
                .and_then(|p| p.strip_suffix("/status"))
                .unwrap_or("");
            match get_background_job_status_json(&app_state, job_id) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path)
            if path.starts_with("/tool-gateway/jobs/") && path.ends_with("/checkpoint") =>
        {
            let job_id = path
                .strip_prefix("/tool-gateway/jobs/")
                .and_then(|p| p.strip_suffix("/checkpoint"))
                .unwrap_or("");
            match get_background_job_checkpoint_json(&app_state, job_id) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => {
                    GatewayResponse::NotFound(json!({"error": "no_checkpoint"}).to_string())
                }
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path)
            if path.starts_with("/tool-gateway/jobs/") && path.ends_with("/progress") =>
        {
            let job_id = path
                .strip_prefix("/tool-gateway/jobs/")
                .and_then(|p| p.strip_suffix("/progress"))
                .unwrap_or("");
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match update_background_job_progress_json(&app_state, job_id, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path)
            if path.starts_with("/tool-gateway/jobs/") && path.ends_with("/checkpoint") =>
        {
            let job_id = path
                .strip_prefix("/tool-gateway/jobs/")
                .and_then(|p| p.strip_suffix("/checkpoint"))
                .unwrap_or("");
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match update_background_job_checkpoint_json(&app_state, job_id, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/documents/") => {
            let document_id = path.strip_prefix("/tool-gateway/documents/").unwrap_or("");
            // Check if this is a sub-route (status update or analysis)
            if document_id.contains("/status") || document_id.contains("/analysis") {
                GatewayResponse::NotFound(
                    json!({"error": "use POST for status/analysis"}).to_string(),
                )
            } else {
                match get_document_json(&app_state, document_id) {
                    Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                    Ok(None) => {
                        GatewayResponse::NotFound(json!({"error": "not_found"}).to_string())
                    }
                    Err(error) => GatewayResponse::InternalError(
                        json!({"error": error.to_string()}).to_string(),
                    ),
                }
            }
        }

        ("POST", path)
            if path.starts_with("/tool-gateway/documents/") && path.ends_with("/status") =>
        {
            let document_id = path
                .strip_prefix("/tool-gateway/documents/")
                .and_then(|p| p.strip_suffix("/status"))
                .unwrap_or("");
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match update_document_status_json(&app_state, document_id, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path)
            if path.starts_with("/tool-gateway/documents/") && path.ends_with("/analysis") =>
        {
            let document_id = path
                .strip_prefix("/tool-gateway/documents/")
                .and_then(|p| p.strip_suffix("/analysis"))
                .unwrap_or("");
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match save_document_analysis_json(&app_state, document_id, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/anchors?documentId=") => {
            let document_id = path
                .strip_prefix("/tool-gateway/anchors?documentId=")
                .unwrap_or("");
            match list_anchors_json(&app_state, document_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/chunks?documentId=") => {
            let document_id = path
                .strip_prefix("/tool-gateway/chunks?documentId=")
                .unwrap_or("");
            match list_chunks_json(&app_state, document_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/sections?documentId=") => {
            let document_id = path
                .strip_prefix("/tool-gateway/sections?documentId=")
                .unwrap_or("");
            match list_sections_json(&app_state, document_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/knowledge-qa/recent-messages") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match list_recent_knowledge_qa_messages_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/candidates") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match persist_candidates_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/candidates/count?runId=") => {
            let run_id = path
                .strip_prefix("/tool-gateway/candidates/count?runId=")
                .unwrap_or("");
            match count_candidates_json(&app_state, run_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/study/review-summary") => {
            match study_review_summary_json(&app_state, path) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/study/review-candidates") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match submit_study_review_candidates_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        // ── ToolGateway: knowledge search ─────────────────
        ("POST", "/tool-gateway/artifacts") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match upsert_artifacts_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/artifacts?") => {
            match list_artifacts_json(&app_state, path) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/artifacts/") => {
            let artifact_id = path.strip_prefix("/tool-gateway/artifacts/").unwrap_or("");
            match get_artifact_json(&app_state, artifact_id) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "artifact_not_found"}).to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path) if path.starts_with("/tool-gateway/artifacts/") && path.ends_with("/lifecycle") => {
            let artifact_id = path
                .strip_prefix("/tool-gateway/artifacts/")
                .and_then(|value| value.strip_suffix("/lifecycle"))
                .unwrap_or("");
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match update_artifact_lifecycle_json(&app_state, artifact_id, request) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "artifact_not_found"}).to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/search-chunks") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match search_chunks_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/embeddings/chunks") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match persist_chunk_embeddings_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/embeddings/chunks/states") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match list_chunk_embedding_states_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/embeddings/profiles/lock-dimensions") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match lock_embedding_dimensions_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/embeddings/readiness") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match document_embedding_readiness_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/query-embedding-cache/get") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match get_query_embedding_cache_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/query-embedding-cache/put") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match put_query_embedding_cache_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/query-embedding-cache/prune") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match prune_query_embedding_cache_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/search-hybrid") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match search_hybrid_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        // ── ToolGateway: knowledge graph ───────────────
        // ── ToolGateway: cards (for export) ───────────────
        ("POST", "/tool-gateway/cards") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match persist_cards_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/cards") => {
            match list_cards_json(&app_state, path) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        // ── ToolGateway: podcasts ─────────────────────────
        ("GET", "/tool-gateway/podcasts") => match list_podcast_episodes_json(&app_state) {
            Ok(payload) => GatewayResponse::Ok(payload.to_string()),
            Err(error) => {
                GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
            }
        },

        ("POST", "/tool-gateway/podcasts") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match create_podcast_episode_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path)
            if path.starts_with("/tool-gateway/podcasts/") && path.ends_with("/audio-segments") =>
        {
            let episode_id = path
                .strip_prefix("/tool-gateway/podcasts/")
                .and_then(|p| p.strip_suffix("/audio-segments"))
                .unwrap_or("");
            match list_podcast_audio_segments_json(&app_state, episode_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path)
            if path.starts_with("/tool-gateway/podcasts/")
                && path.ends_with("/audio-segments/delete") =>
        {
            let episode_id = path
                .strip_prefix("/tool-gateway/podcasts/")
                .and_then(|p| p.strip_suffix("/audio-segments/delete"))
                .unwrap_or("");
            match delete_podcast_audio_segments_json(&app_state, episode_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path)
            if path.starts_with("/tool-gateway/podcasts/") && path.ends_with("/update") =>
        {
            let episode_id = path
                .strip_prefix("/tool-gateway/podcasts/")
                .and_then(|p| p.strip_suffix("/update"))
                .unwrap_or("");
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match update_podcast_episode_json(&app_state, episode_id, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path)
            if path.starts_with("/tool-gateway/podcasts/") && path.ends_with("/review") =>
        {
            let episode_id = path
                .strip_prefix("/tool-gateway/podcasts/")
                .and_then(|p| p.strip_suffix("/review"))
                .unwrap_or("");
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match review_podcast_script_json(&app_state, episode_id, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path)
            if path.starts_with("/tool-gateway/podcasts/") && path.ends_with("/delete") =>
        {
            let episode_id = path
                .strip_prefix("/tool-gateway/podcasts/")
                .and_then(|p| p.strip_suffix("/delete"))
                .unwrap_or("");
            match delete_podcast_episode_json(&app_state, episode_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/podcasts/") => {
            let episode_id = path.strip_prefix("/tool-gateway/podcasts/").unwrap_or("");
            match get_podcast_episode_json(&app_state, episode_id) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/podcast-audio-segments") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match save_podcast_audio_segment_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        // ── ToolGateway: run status & checkpoint ──────────
        ("GET", path)
            if path.starts_with("/tool-gateway/runs/") && path.ends_with("/checkpoint") =>
        {
            let run_id = path
                .strip_prefix("/tool-gateway/runs/")
                .and_then(|p| p.strip_suffix("/checkpoint"))
                .unwrap_or("");
            match get_latest_checkpoint_json(&app_state, run_id) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => {
                    GatewayResponse::NotFound(json!({"error": "no_checkpoint"}).to_string())
                }
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path)
            if path.starts_with("/tool-gateway/runs/") && path.ends_with("/checkpoint") =>
        {
            let run_id = path
                .strip_prefix("/tool-gateway/runs/")
                .and_then(|p| p.strip_suffix("/checkpoint"))
                .unwrap_or("");
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match save_checkpoint_json(&app_state, run_id, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path) if path.starts_with("/tool-gateway/runs/") && path.ends_with("/cancel") => {
            let run_id = path
                .strip_prefix("/tool-gateway/runs/")
                .and_then(|p| p.strip_suffix("/cancel"))
                .unwrap_or("");
            match cancel_run_json(&app_state, run_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path) if path.starts_with("/tool-gateway/runs/") && path.ends_with("/pause") => {
            let run_id = path
                .strip_prefix("/tool-gateway/runs/")
                .and_then(|p| p.strip_suffix("/pause"))
                .unwrap_or("");
            match pause_run_json(&app_state, run_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path) if path.starts_with("/tool-gateway/runs/") && path.ends_with("/resume") => {
            let run_id = path
                .strip_prefix("/tool-gateway/runs/")
                .and_then(|p| p.strip_suffix("/resume"))
                .unwrap_or("");
            match resume_run_json(&app_state, run_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path) if path.starts_with("/tool-gateway/runs/") && path.ends_with("/events") => {
            let run_id = path
                .strip_prefix("/tool-gateway/runs/")
                .and_then(|p| p.strip_suffix("/events"))
                .unwrap_or("");
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match append_workflow_event_json(&app_state, run_id, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/runs/") => {
            let run_id = path.strip_prefix("/tool-gateway/runs/").unwrap_or("");
            match get_run_json(&app_state, run_id) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        _ => GatewayResponse::NotFound(json!({"error": "not_found", "path": path}).to_string()),
    }
}

fn is_gateway_authorized(headers: &BTreeMap<String, String>, expected_token: &str) -> bool {
    headers
        .get("x-xuejian-gateway-token")
        .map(String::as_str)
        .is_some_and(|provided_token| provided_token == expected_token)
}

// ── ModelGateway helpers ──────────────────────────────────

fn list_api_configs_json(state: &AppState) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    let configs = repo.list_api_configs()?;
    Ok(configs
        .into_iter()
        .map(api_config_to_json)
        .collect::<Vec<_>>()
        .into())
}

fn get_api_config_json(state: &AppState, id: &str) -> Result<Option<Value>> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    Ok(repo.get_api_config(id)?.map(api_config_to_json))
}

fn get_api_key_json(state: &AppState, config_id: &str) -> Result<Value> {
    let mut secrets = state.lock_secrets()?;
    let api_key = secrets.get_api_key(config_id)?;
    Ok(json!({"apiKey": api_key}))
}

fn get_provider_budget_usage_json(state: &AppState, api_config_id: &str) -> Result<Option<Value>> {
    let period = chrono::Utc::now().format("%Y-%m").to_string();
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    Ok(repo
        .get_budget_usage(api_config_id, &period)?
        .map(provider_budget_usage_to_json))
}

fn get_background_job_status_json(state: &AppState, job_id: &str) -> Result<Option<Value>> {
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    Ok(repo.find_by_id(job_id)?.map(|job| {
        json!({
            "status": job.status,
            "cancelRequestedAt": job.cancel_requested_at,
        })
    }))
}

fn get_background_job_checkpoint_json(state: &AppState, job_id: &str) -> Result<Option<Value>> {
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let Some(job) = repo.find_by_id(job_id)? else {
        return Ok(None);
    };
    let Some(raw) = job.checkpoint_json else {
        return Ok(None);
    };
    let checkpoint: Value = serde_json::from_str(&raw)?;
    Ok(Some(checkpoint))
}

fn update_background_job_checkpoint_json(
    state: &AppState,
    job_id: &str,
    request: Value,
) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let job = repo
        .find_by_id(job_id)?
        .ok_or_else(|| HostGatewayError::App("background job not found".to_string()))?;
    if job.status != "running" {
        return Ok(json!({
            "ok": true,
            "status": job.status,
            "checkpoint": job.checkpoint_json
                .and_then(|raw| serde_json::from_str::<Value>(&raw).ok()),
        }));
    }

    let checkpoint_json = serde_json::to_string(&request)?;
    let updated = repo.update_checkpoint(job_id, Some(&checkpoint_json))?;
    Ok(json!({
        "ok": true,
        "status": updated.status,
        "checkpoint": request,
    }))
}

fn update_background_job_progress_json(
    state: &AppState,
    job_id: &str,
    request: Value,
) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = Mvp0BackgroundJobRepository::new(db.connection());
    let job = repo
        .find_by_id(job_id)?
        .ok_or_else(|| HostGatewayError::App("background job not found".to_string()))?;
    if job.status != "running" {
        return Ok(json!({
            "ok": true,
            "status": job.status,
            "cancelRequestedAt": job.cancel_requested_at,
        }));
    }

    let progress_current = request
        .get("progressCurrent")
        .and_then(Value::as_i64)
        .and_then(|value| i32::try_from(value).ok())
        .or(job.progress_current);
    let progress_total = request
        .get("progressTotal")
        .and_then(Value::as_i64)
        .and_then(|value| i32::try_from(value).ok())
        .or(job.progress_total);
    let progress_message = request
        .get("progressMessage")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or(job.progress_message);

    let updated = repo.update_status(
        job_id,
        UpdateMvp0BackgroundJobStatusRequest {
            status: "running".to_string(),
            result_json: job.result_json,
            error_message: job.error_message,
            error_details: job.error_details,
            progress_current,
            progress_total,
            progress_message,
        },
    )?;

    Ok(json!({
        "ok": true,
        "status": updated.status,
        "cancelRequestedAt": updated.cancel_requested_at,
    }))
}

fn list_workflow_assignments_json(state: &AppState) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    let assignments = repo.list_workflow_assignments()?;
    let profiles = repo
        .list_model_profiles()?
        .into_iter()
        .map(|profile| (profile.id.clone(), profile))
        .collect::<BTreeMap<_, _>>();
    let configs = repo
        .list_api_configs()?
        .into_iter()
        .map(|config| (config.id.clone(), config))
        .collect::<BTreeMap<_, _>>();

    Ok(assignments
        .into_iter()
        .map(|assignment| {
            let model_profile = profiles.get(&assignment.model_profile_id).cloned();
            workflow_assignment_to_json(
                assignment.clone(),
                model_profile.clone(),
                model_profile.and_then(|profile| configs.get(&profile.api_config_id).cloned()),
            )
        })
        .collect::<Vec<_>>()
        .into())
}

fn get_workflow_assignment_json(state: &AppState, workflow_type: &str) -> Result<Option<Value>> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    let assignment = repo.get_workflow_assignment(workflow_type)?;
    Ok(match assignment {
        Some(assignment) => {
            let model_profile = repo.get_model_profile(&assignment.model_profile_id)?;
            let config = match model_profile.as_ref() {
                Some(profile) => repo.get_api_config(&profile.api_config_id)?,
                None => None,
            };
            Some(workflow_assignment_to_json(
                assignment,
                model_profile,
                config,
            ))
        }
        None => None,
    })
}

fn record_workflow_cost_json(state: &AppState, request: Value) -> Result<Value> {
    let api_config_id = request
        .get("apiConfigId")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| HostGatewayError::App("missing apiConfigId".to_string()))?;
    let estimated_cost_usd = request
        .get("estimatedCostUsd")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);

    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    repo.increment_budget_usage(api_config_id, estimated_cost_usd)?;
    Ok(json!({"ok": true}))
}

fn workflow_assignment_to_json(
    assignment: WorkflowModelAssignment,
    model_profile: Option<ModelProfile>,
    config: Option<ApiConfig>,
) -> Value {
    json!({
        "workflowType": assignment.workflow_type,
        "modelProfileId": assignment.model_profile_id,
        "assignedAt": assignment.assigned_at,
        "updatedAt": assignment.updated_at,
        "modelProfile": model_profile.map(model_profile_to_json),
        "apiConfig": config.map(api_config_to_json),
    })
}

fn model_profile_to_json(profile: ModelProfile) -> Value {
    json!({
        "id": profile.id,
        "apiConfigId": profile.api_config_id,
        "modelId": profile.model_id,
        "displayName": profile.display_name,
        "capabilitiesJson": profile.capabilities_json,
        "isEnabled": profile.is_enabled,
        "isDefaultForConnection": profile.is_default_for_connection,
        "createdAt": profile.created_at,
        "updatedAt": profile.updated_at,
    })
}

fn api_config_to_json(config: ApiConfig) -> Value {
    json!({
        "id": config.id,
        "provider": config.provider,
        "protocol": config.protocol,
        "authMode": config.auth_mode,
        "name": config.name,
        "baseUrl": config.base_url,
        "model": config.model,
        "budgetLimit": config.budget_limit,
        "isEnabled": config.is_enabled,
        "isDefault": config.is_default,
        "keyVerifiedAt": config.key_verified_at,
        "keyStatus": config.key_status,
        "displayName": config.display_name,
        "createdAt": config.created_at,
    })
}

fn provider_budget_usage_to_json(usage: ProviderBudgetUsage) -> Value {
    json!({
        "id": usage.id,
        "apiConfigId": usage.api_config_id,
        "period": usage.period,
        "estimatedCostUsd": usage.estimated_cost_usd,
        "workflowRunsCount": usage.workflow_runs_count,
        "updatedAt": usage.updated_at,
    })
}

fn list_embedding_profiles_json(state: &AppState) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = VectorRepository::new(&db);
    let profiles = repo.list_embedding_profiles()?;
    Ok(profiles
        .into_iter()
        .map(embedding_profile_to_json)
        .collect::<Vec<_>>()
        .into())
}

fn get_active_embedding_profile_json(state: &AppState) -> Result<Option<Value>> {
    Ok(resolve_effective_embedding_profile(state)?.map(embedding_profile_to_json))
}

fn embedding_profile_to_json(profile: EmbeddingProfile) -> Value {
    json!({
        "id": profile.id,
        "provider": profile.provider,
        "model": profile.model,
        "dimensions": profile.dimensions,
        "distanceMetric": profile.distance_metric,
        "isActive": profile.is_active,
        "revision": profile.revision,
        "createdAt": profile.created_at,
    })
}

// ── ToolGateway helpers ───────────────────────────────────

fn get_document_json(state: &AppState, document_id: &str) -> Result<Option<Value>> {
    let db = state.lock_db()?;
    let repo = crate::db::Mvp0DocumentRepository::new(db.connection());
    Ok(repo.find_document_by_id(document_id)?.map(|document| {
        json!({
            "id": document.id,
            "title": document.title,
            "filePath": document.file_path,
            "fileType": host_document_file_type(&document.original_filename),
            "status": host_document_status(&document.parse_status),
            "pageCount": document.page_count,
            "chunkingProfile": document.chunking_profile,
            "chunkingProfileRevision": document.chunking_profile_revision,
        })
    }))
}

fn update_document_status_json(
    state: &AppState,
    document_id: &str,
    request: Value,
) -> Result<Value> {
    let status = request["status"].as_str().unwrap_or("unknown");
    let db = state.lock_db()?;
    let repo = crate::db::Mvp0DocumentRepository::new(db.connection());
    repo.update_parse_status(document_id, host_persisted_parse_status(status))?;
    Ok(json!({"ok": true, "status": status}))
}

fn save_document_analysis_json(
    state: &AppState,
    document_id: &str,
    request: Value,
) -> Result<Value> {
    let anchors = request["anchors"]
        .as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .map(|anchor| {
            Ok(crate::db::CreateDocumentAnchorRequest {
                id: anchor["id"].as_str().map(ToOwned::to_owned),
                page: anchor["page"].as_i64().unwrap_or(1) as i32,
                paragraph: anchor["paragraph"].as_i64().map(|value| value as i32),
                text_quote: anchor["textQuote"].as_str().unwrap_or("").to_string(),
                rects: if anchor["rects"].is_array() {
                    serde_json::from_value(anchor["rects"].clone())?
                } else {
                    Vec::new()
                },
                hash: anchor["hash"].as_str().unwrap_or("").to_string(),
                hierarchy_path: if anchor["hierarchyPath"].is_array() {
                    Some(serde_json::from_value(anchor["hierarchyPath"].clone())?)
                } else {
                    None
                },
                quote_hash: anchor["quoteHash"].as_str().map(ToOwned::to_owned),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let sections = request["sections"]
        .as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .map(|section| {
            Ok(crate::db::CreateDocumentSectionRequest {
                id: section["id"].as_str().map(ToOwned::to_owned),
                section_index: section["sectionIndex"].as_i64().unwrap_or(0) as i32,
                heading: section["heading"].as_str().map(ToOwned::to_owned),
                hierarchy_path: if section["hierarchyPath"].is_array() {
                    Some(serde_json::from_value(section["hierarchyPath"].clone())?)
                } else {
                    None
                },
                page_start: section["pageStart"].as_i64().map(|value| value as i32),
                page_end: section["pageEnd"].as_i64().map(|value| value as i32),
                anchor_start_id: section["anchorStartId"].as_str().map(ToOwned::to_owned),
                anchor_end_id: section["anchorEndId"].as_str().map(ToOwned::to_owned),
                content: section["content"].as_str().unwrap_or("").to_string(),
                token_count: section["tokenCount"].as_i64().map(|value| value as i32),
                metadata: if section["metadata"].is_null() {
                    None
                } else {
                    Some(section["metadata"].clone())
                },
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let chunks = request["chunks"]
        .as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .map(|chunk| {
            Ok(crate::db::CreateDocumentChunkRequest {
                id: chunk["id"].as_str().map(ToOwned::to_owned),
                section_id: chunk["sectionId"].as_str().map(ToOwned::to_owned),
                anchor_id: chunk["anchorId"].as_str().map(ToOwned::to_owned),
                page_start: chunk["pageStart"].as_i64().map(|value| value as i32),
                page_end: chunk["pageEnd"].as_i64().map(|value| value as i32),
                chunk_index: chunk["chunkIndex"].as_i64().unwrap_or(0) as i32,
                chunk_kind: chunk["chunkKind"].as_str().map(ToOwned::to_owned),
                content: chunk["content"].as_str().unwrap_or("").to_string(),
                token_count: chunk["tokenCount"].as_i64().map(|value| value as i32),
                metadata: if chunk["metadata"].is_null() {
                    None
                } else {
                    Some(chunk["metadata"].clone())
                },
            })
        })
        .collect::<Result<Vec<_>>>()?;

    let db = state.lock_db()?;
    let repo = crate::db::Mvp0DocumentRepository::new(db.connection());
    repo.replace_analysis(
        document_id,
        crate::db::ReplaceMvp0DocumentAnalysisRequest {
            page_count: request["pageCount"].as_i64().unwrap_or(0) as i32,
            chunking_profile: if request["chunkingProfile"].is_null() {
                None
            } else {
                Some(request["chunkingProfile"].clone())
            },
            anchors,
            sections,
            chunks,
        },
    )?;
    Ok(json!({"ok": true}))
}

fn list_anchors_json(state: &AppState, document_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::DocumentRepository::new(&db);
    let anchors = repo.list_anchors(document_id)?;
    Ok(anchors
        .into_iter()
        .map(|anchor| {
            let quote_hash = anchor
                .quote_hash
                .clone()
                .unwrap_or_else(|| host_quote_hash(&anchor.text_quote));
            json!({
                "id": anchor.id,
                "documentId": anchor.document_id,
                "page": anchor.page,
                "paragraph": anchor.paragraph,
                "textQuote": anchor.text_quote,
                "rects": anchor.rects,
                "hash": anchor.hash,
                "hierarchyPath": anchor.hierarchy_path,
                "quoteHash": quote_hash,
            })
        })
        .collect::<Vec<_>>()
        .into())
}

fn list_chunks_json(state: &AppState, document_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::Mvp0DocumentRepository::new(db.connection());
    let chunks = repo.list_structured_chunks(document_id)?;
    Ok(chunks
        .into_iter()
        .map(|chunk| {
            json!({
                "id": chunk.id,
                "documentId": chunk.document_id,
                "sectionId": chunk.section_id,
                "anchorId": chunk.anchor_id,
                "pageStart": chunk.page_start,
                "pageEnd": chunk.page_end,
                "chunkIndex": chunk.chunk_index,
                "chunkKind": chunk.chunk_kind,
                "content": chunk.content,
                "tokenCount": chunk.token_count,
                "metadata": chunk.metadata,
            })
        })
        .collect::<Vec<_>>()
        .into())
}

fn list_sections_json(state: &AppState, document_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::Mvp0DocumentRepository::new(db.connection());
    let sections = repo.list_sections(document_id)?;
    Ok(sections
        .into_iter()
        .map(|section| {
            json!({
                "id": section.id,
                "documentId": section.document_id,
                "sectionIndex": section.section_index,
                "heading": section.heading,
                "hierarchyPath": section.hierarchy_path,
                "pageStart": section.page_start,
                "pageEnd": section.page_end,
                "anchorStartId": section.anchor_start_id,
                "anchorEndId": section.anchor_end_id,
                "content": section.content,
                "tokenCount": section.token_count,
                "metadata": section.metadata,
            })
        })
        .collect::<Vec<_>>()
        .into())
}

fn list_recent_knowledge_qa_messages_json(state: &AppState, request: Value) -> Result<Value> {
    let conversation_id = request
        .get("conversationId")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| HostGatewayError::App("conversationId is required".to_string()))?;
    let limit = request
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(4)
        .clamp(1, 8) as usize;

    let db = state.lock_db()?;
    let repo = KnowledgeQaRepository::new(&db);
    let messages = repo.list_messages(conversation_id)?;
    let recent_messages = messages
        .into_iter()
        .rev()
        .filter(|message| {
            (message.role == "user" || message.role == "assistant")
                && !message.content.trim().is_empty()
        })
        .take(limit)
        .collect::<Vec<_>>();

    Ok(recent_messages
        .into_iter()
        .rev()
        .map(|message| {
            let content = message.content.chars().take(400).collect::<String>();
            json!({
                "role": message.role,
                "content": content,
            })
        })
        .collect::<Vec<_>>()
        .into())
}

fn host_document_file_type(file_name: &str) -> String {
    std::path::Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_else(|| "pdf".to_string())
}

fn host_document_status(parse_status: &str) -> &str {
    match parse_status {
        "pending" | "parsing" => "uploading",
        "parsed" | "embedding" | "ready" | "embedding_failed" | "embedding_stale" => parse_status,
        "deleted" => "deleted",
        "failed" | "unsupported" => "error",
        _ => "uploading",
    }
}

fn host_persisted_parse_status(status: &str) -> &str {
    match status {
        "parsed" | "ready" | "embedding" | "embedding_failed" | "embedding_stale" => status,
        "failed" | "error" => "failed",
        "unsupported" => "unsupported",
        _ => "pending",
    }
}

fn host_quote_hash(quote: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(quote.trim().as_bytes());
    format!("{:x}", hasher.finalize())
}

fn persist_candidates_json(state: &AppState, request: Value) -> Result<Value> {
    let run_id = request["runId"].as_str().unwrap_or("");
    let document_id = request["documentId"].as_str().unwrap_or("");
    let candidates = match request["candidates"].as_array() {
        Some(arr) => arr,
        None => return Ok(json!({"insertedCount": 0, "duplicateCount": 0})),
    };

    let mut requests = Vec::new();
    for candidate in candidates {
        let anchor_id = candidate["anchorId"].as_str().map(String::from);
        let front = candidate["front"].as_str().unwrap_or("").to_string();
        let back = candidate["back"].as_str().unwrap_or("").to_string();
        let source_page = candidate["sourcePage"].as_i64().map(|value| value as i32);
        let source_quote = candidate["sourceQuote"]
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(String::from);
        let tags = candidate["tags"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        let confidence = candidate["confidence"].as_f64().unwrap_or(0.0);
        let dedupe_key = candidate["dedupeKey"].as_str().unwrap_or("").to_string();
        let source_chunk_ids = candidate["sourceChunkIds"].as_array().map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<_>>()
        });

        if front.trim().is_empty()
            || back.trim().is_empty()
            || dedupe_key.trim().is_empty()
            || (anchor_id.is_none()
                && (source_page.is_none()
                    || source_chunk_ids
                        .as_ref()
                        .map(|ids| ids.is_empty())
                        .unwrap_or(true)))
        {
            continue;
        }

        requests.push(CreateCardCandidateRequest {
            workflow_run_id: Some(run_id.to_string()),
            document_id: document_id.to_string(),
            section_id: candidate["sectionId"].as_str().map(String::from),
            anchor_id,
            title: candidate["title"].as_str().map(String::from),
            card_type: candidate["cardType"].as_str().map(String::from),
            source_page,
            source_quote,
            front,
            back,
            tags,
            confidence,
            dedupe_key,
            score_overall: candidate["scoreOverall"].as_f64(),
            score_details: if candidate["scoreDetails"].is_null() {
                None
            } else {
                Some(candidate["scoreDetails"].clone())
            },
            visibility_bucket: candidate["visibilityBucket"].as_str().map(String::from),
            generation_mode: candidate["generationMode"].as_str().map(String::from),
            fallback_reason: candidate["fallbackReason"].as_str().map(String::from),
            evaluation_summary: candidate["evaluationSummary"].as_str().map(String::from),
            source_chunk_ids,
        });
    }

    let db = state.lock_db()?;
    let repo = crate::db::CardRepository::new(&db);
    let result = repo.insert_generated_candidates(requests)?;
    Ok(json!({
        "insertedCount": result.inserted_count,
        "duplicateCount": result.duplicate_count,
    }))
}

fn submit_study_review_candidates_json(state: &AppState, request: Value) -> Result<Value> {
    let run_id = request["runId"].as_str().map(str::trim).unwrap_or("");
    let candidates = match request["candidates"].as_array() {
        Some(arr) => arr,
        None => return Ok(json!({"acceptedCount": 0, "rejectedCount": 0, "stored": false})),
    };
    let dry_run = request["dryRun"].as_bool().unwrap_or(true);
    let idempotency_key = request["idempotencyKey"].as_str().map(str::trim).unwrap_or("");
    let dry_run_ref = request["dryRunRef"].as_str().map(str::trim).unwrap_or("");
    let rollback_ref = request["rollbackRef"].as_str().map(str::trim).unwrap_or("");
    let rollback_requested = request["rollback"].as_bool().unwrap_or(false)
        || request["action"].as_str().map(str::trim) == Some("rollback");

    if run_id.is_empty() {
        return Ok(json!({
            "acceptedCount": 0,
            "rejectedCount": candidates.len(),
            "stored": false,
            "error": "missing_run_id",
        }));
    }

    let db = state.lock_db()?;
    let workflow_repo = crate::db::WorkflowRepository::new(&db);
    if workflow_repo.get_run(run_id)?.is_none() {
        return Ok(json!({
            "acceptedCount": 0,
            "rejectedCount": candidates.len(),
            "stored": false,
            "error": "run_not_found",
        }));
    }

    if rollback_requested {
        if idempotency_key.is_empty() || rollback_ref.is_empty() {
            return Ok(json!({
                "acceptedCount": 0,
                "rejectedCount": candidates.len(),
                "stored": false,
                "error": "study_schedule_write_failed",
                "blockingReasons": ["idempotency_key_missing", "rollback_ref_missing"],
            }));
        }
        let checkpoint_ref = format!("study_review_candidates:{idempotency_key}");
        let Some(existing) = workflow_repo.get_checkpoint(run_id, &checkpoint_ref)? else {
            return Ok(json!({
                "acceptedCount": 0,
                "rejectedCount": candidates.len(),
                "stored": false,
                "error": "rollback_not_supported",
            }));
        };
        let mut payload = existing.payload;
        payload["writeState"] = json!("rolled_back");
        payload["rolledBackAt"] = json!(chrono::Utc::now().to_rfc3339());
        workflow_repo.upsert_checkpoint(crate::db::UpsertWorkflowCheckpointRequest {
            run_id: run_id.to_string(),
            checkpoint_ref,
            step_key: Some("review_candidates_rolled_back".to_string()),
            payload: payload.clone(),
        })?;
        let event = workflow_repo.append_event(crate::db::AppendWorkflowEventRequest {
            run_id: run_id.to_string(),
            event_type: "rolled_back".to_string(),
            message: Some("Study schedule write rolled back".to_string()),
            progress: None,
            payload: Some(json!({"rollbackRef": rollback_ref, "idempotencyKey": idempotency_key})),
        })?;
        return Ok(json!({
            "acceptedCount": 0,
            "rejectedCount": 0,
            "stored": false,
            "writeState": "rolled_back",
            "rollbackRef": rollback_ref,
            "auditEventId": event.id,
        }));
    }

    if !dry_run {
        let mut blocking_reasons = Vec::new();
        if idempotency_key.is_empty() {
            blocking_reasons.push("idempotency_key_missing");
        }
        if dry_run_ref.is_empty() {
            blocking_reasons.push("dry_run_ref_missing");
        }
        if rollback_ref.is_empty() {
            blocking_reasons.push("rollback_ref_missing");
        }
        if !blocking_reasons.is_empty() {
            return Ok(json!({
                "acceptedCount": 0,
                "rejectedCount": candidates.len(),
                "stored": false,
                "error": "study_schedule_write_failed",
                "blockingReasons": blocking_reasons,
            }));
        }

        let checkpoint_ref = format!("study_review_candidates:{idempotency_key}");
        if let Some(existing) = workflow_repo.get_checkpoint(run_id, &checkpoint_ref)? {
            let payload = existing.payload;
            return Ok(json!({
                "acceptedCount": payload["acceptedCount"].as_u64().unwrap_or(0),
                "rejectedCount": payload["rejectedCount"].as_u64().unwrap_or(0),
                "stored": true,
                "skippedDuplicates": payload["createdReviewCandidateIds"].as_array().map(|arr| arr.len()).unwrap_or(0),
                "createdReviewCandidateIds": payload["createdReviewCandidateIds"].clone(),
                "dryRunRef": dry_run_ref,
                "rollbackRef": rollback_ref,
                "idempotencyKey": idempotency_key,
            }));
        }
    }

    let card_repo = crate::db::CardRepository::new(&db);
    let mut accepted_candidates = Vec::new();
    let mut created_review_candidate_ids = Vec::new();
    let mut rejected_count = 0usize;
    let mut discarded_reasons = Vec::new();

    for (index, candidate) in candidates.iter().enumerate() {
        let card_id = candidate["cardId"].as_str().map(str::trim).unwrap_or("");
        let Some(suggested_interval_days) = candidate["suggestedIntervalDays"].as_i64() else {
            rejected_count += 1;
            discarded_reasons.push(json!({"index": index, "reason": "missing_suggested_interval_days"}));
            continue;
        };

        if card_id.is_empty() || card_repo.get_card_by_id(card_id)?.is_none() {
            rejected_count += 1;
            discarded_reasons.push(json!({"index": index, "cardId": card_id, "reason": "card_not_found"}));
            continue;
        }

        let candidate_id = if idempotency_key.is_empty() {
            format!("review-candidate:{run_id}:{index}:{card_id}")
        } else {
            format!("review-candidate:{idempotency_key}:{index}:{card_id}")
        };
        created_review_candidate_ids.push(candidate_id.clone());
        accepted_candidates.push(json!({
            "id": candidate_id,
            "cardId": card_id,
            "suggestedIntervalDays": suggested_interval_days,
            "reason": candidate["reason"].as_str(),
        }));
    }

    let accepted_count = accepted_candidates.len();
    let effective_dry_run_ref = if dry_run_ref.is_empty() {
        format!("study-dry-run:{run_id}:{}", uuid::Uuid::new_v4())
    } else {
        dry_run_ref.to_string()
    };
    let effective_rollback_ref = if rollback_ref.is_empty() {
        format!("rollback:{run_id}:{}", uuid::Uuid::new_v4())
    } else {
        rollback_ref.to_string()
    };
    let checkpoint_ref = if dry_run {
        format!("study_review_candidates_dry_run:{effective_dry_run_ref}")
    } else {
        format!("study_review_candidates:{idempotency_key}")
    };
    let payload = json!({
        "runId": run_id,
        "dryRun": dry_run,
        "dryRunRef": effective_dry_run_ref,
        "idempotencyKey": idempotency_key,
        "rollbackRef": effective_rollback_ref,
        "acceptedCount": accepted_count,
        "rejectedCount": rejected_count,
        "discardedReasons": discarded_reasons,
        "candidates": accepted_candidates,
        "createdReviewCandidateIds": if dry_run { json!([]) } else { json!(created_review_candidate_ids.clone()) },
        "writeState": if dry_run { "dry_run_ready" } else { "written" },
    });
    let mut checkpoint_id = None;
    if dry_run || accepted_count > 0 {
        let checkpoint = workflow_repo.upsert_checkpoint(crate::db::UpsertWorkflowCheckpointRequest {
            run_id: run_id.to_string(),
            checkpoint_ref,
            step_key: Some(if dry_run {
                "review_candidates_dry_run".to_string()
            } else {
                "review_candidates_submitted".to_string()
            }),
            payload,
        })?;
        checkpoint_id = Some(checkpoint.id);
    }
    let event = workflow_repo.append_event(crate::db::AppendWorkflowEventRequest {
        run_id: run_id.to_string(),
        event_type: if dry_run { "dry_run_ready" } else { "written" }.to_string(),
        message: Some(if dry_run {
            "Study review candidates dry-run completed".to_string()
        } else {
            "Study review candidates submitted".to_string()
        }),
        progress: None,
        payload: Some(json!({
            "dryRun": dry_run,
            "dryRunRef": effective_dry_run_ref,
            "rollbackRef": effective_rollback_ref,
            "acceptedCount": accepted_count,
            "rejectedCount": rejected_count,
        })),
    })?;

    Ok(json!({
        "acceptedCount": accepted_count,
        "rejectedCount": rejected_count,
        "stored": !dry_run && accepted_count > 0,
        "dryRunRef": effective_dry_run_ref,
        "rollbackRef": effective_rollback_ref,
        "idempotencyKey": idempotency_key,
        "createdReviewCandidateIds": if dry_run { json!([]) } else { json!(created_review_candidate_ids) },
        "discardedReasons": discarded_reasons,
        "skippedDuplicates": 0,
        "auditEventId": event.id,
        "checkpointId": checkpoint_id,
    }))
}

fn study_review_summary_json(state: &AppState, path_with_qs: &str) -> Result<Value> {
    let qs = path_with_qs.splitn(2, '?').nth(1).unwrap_or("");
    let document_id = qs_param(qs, "documentId");
    let limit: i64 = qs_param(qs, "limit")
        .and_then(|value| value.parse().ok())
        .unwrap_or(200)
        .clamp(1, 1000);

    let db = state.lock_db()?;
    let repo = crate::db::CardRepository::new(&db);
    let cards = repo.list_cards(crate::db::CardFilters {
        document_id,
        anchor_id: None,
        page_number: None,
        limit: Some(limit),
    })?;
    let card_ids = cards
        .iter()
        .map(|card| card.id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    let logs = repo
        .list_review_logs(None, Some(limit))?
        .into_iter()
        .filter(|log| card_ids.contains(log.card_id.as_str()))
        .collect::<Vec<_>>();

    let mut state_counts = BTreeMap::<String, i64>::new();
    let mut rating_counts = BTreeMap::<String, i64>::new();
    let mut recent_failures_by_card = BTreeMap::<String, i64>::new();
    let mut topics = BTreeMap::<String, Value>::new();
    let mut document_ids = Vec::<String>::new();
    let mut low_retrievability_cards = Vec::<Value>::new();
    let mut high_difficulty_cards = Vec::<Value>::new();

    for log in &logs {
        *rating_counts.entry(log.rating.clone()).or_insert(0) += 1;
        if matches!(log.rating.as_str(), "again" | "hard") {
            *recent_failures_by_card.entry(log.card_id.clone()).or_insert(0) += 1;
        }
    }

    for card in &cards {
        *state_counts.entry(card.state.clone()).or_insert(0) += 1;
        if let Some(document_id) = card.document_id.as_deref() {
            if !document_ids.iter().any(|item| item == document_id) {
                document_ids.push(document_id.to_string());
            }
        }
        if card.retrievability.unwrap_or(1.0) <= 0.45 {
            low_retrievability_cards.push(study_card_summary_json(card));
        }
        if card.difficulty >= 0.75 {
            high_difficulty_cards.push(study_card_summary_json(card));
        }

        let mut topic_names = study_card_topics(card);
        if topic_names.is_empty() {
            topic_names.push(
                card.document_id
                    .clone()
                    .unwrap_or_else(|| "untagged".to_string()),
            );
        }
        for topic_name in topic_names {
            let entry = topics.entry(topic_name.clone()).or_insert_with(|| {
                json!({
                    "topic": topic_name,
                    "cardCount": 0,
                    "lowRetrievabilityCount": 0,
                    "highDifficultyCount": 0,
                    "recentFailureCount": 0,
                    "documentIds": [],
                    "exampleCardIds": [],
                })
            });
            entry["cardCount"] = json!(entry["cardCount"].as_i64().unwrap_or(0) + 1);
            if card.retrievability.unwrap_or(1.0) <= 0.45 {
                entry["lowRetrievabilityCount"] =
                    json!(entry["lowRetrievabilityCount"].as_i64().unwrap_or(0) + 1);
            }
            if card.difficulty >= 0.75 {
                entry["highDifficultyCount"] =
                    json!(entry["highDifficultyCount"].as_i64().unwrap_or(0) + 1);
            }
            let failures = recent_failures_by_card.get(&card.id).copied().unwrap_or(0);
            if failures > 0 {
                entry["recentFailureCount"] =
                    json!(entry["recentFailureCount"].as_i64().unwrap_or(0) + failures);
            }
            study_push_json_string(&mut entry["documentIds"], card.document_id.as_deref());
            study_push_json_string(&mut entry["exampleCardIds"], Some(card.id.as_str()));
        }
    }

    Ok(json!({
        "documentIds": document_ids,
        "totalCards": cards.len(),
        "stateCounts": state_counts,
        "lowRetrievabilityCards": low_retrievability_cards,
        "highDifficultyCards": high_difficulty_cards,
        "recentReviews": {
            "total": logs.len(),
            "ratings": rating_counts,
        },
        "topicSummary": topics.into_values().collect::<Vec<_>>(),
    }))
}

fn study_card_summary_json(card: &crate::db::Card) -> Value {
    json!({
        "id": card.id,
        "title": card.title,
        "documentId": card.document_id,
        "tags": card.tags,
        "difficulty": card.difficulty,
        "stability": card.stability,
        "retrievability": card.retrievability,
        "state": card.state,
        "nextReview": card.next_review,
    })
}

fn study_card_topics(card: &crate::db::Card) -> Vec<String> {
    let mut topics = Vec::<String>::new();
    if let Some(Value::Array(values)) = card.tags.as_ref() {
        for value in values {
            if let Some(tag) = value.as_str().map(str::trim).filter(|tag| !tag.is_empty()) {
                if !topics.iter().any(|item| item == tag) {
                    topics.push(tag.to_string());
                }
            }
        }
    }
    if topics.is_empty() {
        if let Some(title) = card.title.as_deref().map(str::trim).filter(|title| !title.is_empty())
        {
            topics.push(title.chars().take(40).collect::<String>());
        }
    }
    topics
}

fn study_push_json_string(array_value: &mut Value, candidate: Option<&str>) {
    let Some(value) = candidate.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };
    if !array_value.is_array() {
        *array_value = Value::Array(Vec::new());
    }
    let array = array_value.as_array_mut().expect("array checked above");
    if !array.iter().any(|item| item.as_str() == Some(value)) {
        array.push(json!(value));
    }
}

fn upsert_artifacts_json(state: &AppState, request: Value) -> Result<Value> {
    let run_id = request["runId"].as_str().map(str::trim).unwrap_or("");
    let artifacts = if let Some(items) = request["artifacts"].as_array() {
        items.clone()
    } else if let Some(object) = request["artifacts"].as_object() {
        object.values().cloned().collect::<Vec<_>>()
    } else if request["artifactId"].is_string() {
        vec![request.clone()]
    } else {
        return Ok(json!({
            "storedCount": 0,
            "error": "artifact_schema_invalid",
            "blockingReasons": ["artifacts_missing"],
        }));
    };
    let db = state.lock_db()?;
    let repo = crate::db::ArtifactRepository::new(&db);
    let mut stored = Vec::<Value>::new();
    let mut rejected = Vec::<Value>::new();
    for artifact in artifacts {
        match artifact_to_upsert_request(run_id, artifact) {
            Ok(req) => {
                let saved = repo.upsert(req)?;
                stored.push(workflow_artifact_to_json(saved));
            }
            Err(reason) => rejected.push(json!(reason)),
        }
    }
    Ok(json!({
        "storedCount": stored.len(),
        "rejectedCount": rejected.len(),
        "artifacts": stored,
        "rejectedReasons": rejected,
        "error": if rejected.is_empty() { Value::Null } else { json!("artifact_schema_invalid") },
    }))
}

fn get_artifact_json(state: &AppState, artifact_id: &str) -> Result<Option<Value>> {
    let db = state.lock_db()?;
    let repo = crate::db::ArtifactRepository::new(&db);
    let decoded = percent_decode_path_component(artifact_id);
    Ok(repo.get(&decoded)?.map(workflow_artifact_to_json))
}

fn list_artifacts_json(state: &AppState, path_with_qs: &str) -> Result<Value> {
    let qs = path_with_qs.splitn(2, '?').nth(1).unwrap_or("");
    let db = state.lock_db()?;
    let repo = crate::db::ArtifactRepository::new(&db);
    let artifacts = repo.list(crate::db::WorkflowArtifactFilters {
        run_id: qs_param(qs, "runId").map(percent_decode_path_component),
        artifact_type: qs_param(qs, "artifactType").map(percent_decode_path_component),
        lifecycle_status: qs_param(qs, "lifecycleStatus").map(percent_decode_path_component),
        limit: qs_param(qs, "limit").and_then(|value| value.parse::<i64>().ok()),
    })?;
    Ok(json!({
        "items": artifacts.into_iter().map(workflow_artifact_to_json).collect::<Vec<_>>()
    }))
}

fn update_artifact_lifecycle_json(
    state: &AppState,
    artifact_id: &str,
    request: Value,
) -> Result<Option<Value>> {
    let lifecycle_status = request["lifecycleStatus"].as_str().map(str::trim).unwrap_or("");
    if !matches!(
        lifecycle_status,
        "consumed" | "superseded" | "rolled_back" | "expired"
    ) {
        return Ok(Some(json!({
            "error": "artifact_lifecycle_invalid",
            "lifecycleStatus": lifecycle_status,
        })));
    }
    let db = state.lock_db()?;
    let repo = crate::db::ArtifactRepository::new(&db);
    let decoded = percent_decode_path_component(artifact_id);
    Ok(repo
        .mark_lifecycle(&decoded, lifecycle_status)?
        .map(workflow_artifact_to_json))
}

fn artifact_to_upsert_request(
    fallback_run_id: &str,
    mut artifact: Value,
) -> std::result::Result<crate::db::UpsertWorkflowArtifactRequest, &'static str> {
    redact_sensitive_json(&mut artifact);
    let artifact_id = artifact["artifactId"].as_str().map(str::trim).unwrap_or("");
    let artifact_type = artifact["artifactType"].as_str().map(str::trim).unwrap_or("");
    let schema_version = artifact["schemaVersion"].as_i64().unwrap_or(0);
    let summary = artifact["summary"].as_str().map(str::trim).unwrap_or("");
    let created_by = artifact["createdBy"].as_str().map(str::trim).unwrap_or("");
    if artifact_id.is_empty() {
        return Err("artifact_id_missing");
    }
    if !matches!(
        artifact_type,
        "evidence"
            | "answer"
            | "card_candidate"
            | "formal_card_write"
            | "learning_advice"
            | "study_schedule_write"
            | "trace"
    ) {
        return Err("artifact_type_invalid");
    }
    if schema_version <= 0 {
        return Err("schema_version_missing");
    }
    if summary.is_empty() {
        return Err("summary_missing");
    }
    if !artifact["qualityEnvelope"].is_object() {
        return Err("quality_envelope_missing");
    }
    if !matches!(
        created_by,
        "langgraph_rag" | "langgraph_card" | "langgraph_study" | "langgraph_multi_agent"
    ) {
        return Err("created_by_invalid");
    }
    let run_id = artifact["runId"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback_run_id);
    if run_id.is_empty() {
        return Err("run_id_missing");
    }
    let lifecycle_status = artifact["lifecycleStatus"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("created");
    if !matches!(
        lifecycle_status,
        "created" | "consumed" | "superseded" | "rolled_back" | "expired"
    ) {
        return Err("lifecycle_status_invalid");
    }
    let source_refs = if artifact["sourceRefs"].is_array() {
        artifact["sourceRefs"].clone()
    } else {
        json!([])
    };
    let error_category = artifact["errorCategory"].as_str().map(str::to_string);
    Ok(crate::db::UpsertWorkflowArtifactRequest {
        id: artifact_id.to_string(),
        run_id: run_id.to_string(),
        artifact_type: artifact_type.to_string(),
        schema_version,
        summary: summary.to_string(),
        source_refs,
        quality_envelope: artifact["qualityEnvelope"].clone(),
        error_category,
        created_by: created_by.to_string(),
        lifecycle_status: lifecycle_status.to_string(),
        payload: artifact,
    })
}

fn workflow_artifact_to_json(artifact: crate::db::WorkflowArtifact) -> Value {
    json!({
        "artifactId": artifact.id,
        "runId": artifact.run_id,
        "artifactType": artifact.artifact_type,
        "schemaVersion": artifact.schema_version,
        "summary": artifact.summary,
        "sourceRefs": artifact.source_refs,
        "qualityEnvelope": artifact.quality_envelope,
        "errorCategory": artifact.error_category,
        "createdBy": artifact.created_by,
        "lifecycleStatus": artifact.lifecycle_status,
        "payload": artifact.payload,
        "createdAt": artifact.created_at,
        "updatedAt": artifact.updated_at,
    })
}

fn redact_sensitive_json(value: &mut Value) {
    match value {
        Value::Array(items) => {
            for item in items {
                redact_sensitive_json(item);
            }
        }
        Value::Object(map) => {
            let keys = map.keys().cloned().collect::<Vec<_>>();
            for key in keys {
                let lower = key.to_ascii_lowercase();
                if matches!(
                    lower.as_str(),
                    "prompt"
                        | "messages"
                        | "chain_of_thought"
                        | "chainofthought"
                        | "api_key"
                        | "apikey"
                        | "authorization"
                ) {
                    map.remove(&key);
                    continue;
                }
                if let Some(item) = map.get_mut(&key) {
                    redact_sensitive_json(item);
                }
            }
        }
        _ => {}
    }
}

fn percent_decode_path_component(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[index + 1..index + 3]) {
                if let Ok(decoded) = u8::from_str_radix(hex, 16) {
                    output.push(decoded);
                    index += 3;
                    continue;
                }
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&output).into_owned()
}

fn persist_cards_json(state: &AppState, request: Value) -> Result<Value> {
    let document_id = request["documentId"].as_str().unwrap_or("");
    let cards = match request["cards"].as_array() {
        Some(arr) => arr,
        None => {
            return Ok(json!({
                "createdCount": 0,
                "createdCardIds": [],
                "skippedDuplicates": 0,
                "discardedLowQuality": 0,
            }))
        }
    };

    let mut requests = Vec::new();
    for card in cards {
        let anchor_id = card["anchorId"].as_str().map(String::from);
        let front = card["front"].as_str().unwrap_or("").to_string();
        let back = card["back"].as_str().unwrap_or("").to_string();
        let source_page = card["sourcePage"].as_i64().map(|value| value as i32);
        let tags = card["tags"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        let confidence = card["confidence"].as_f64().unwrap_or(0.0);
        let dedupe_key = card["dedupeKey"].as_str().unwrap_or("").to_string();
        let source_chunk_ids = card["sourceChunkIds"].as_array().map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<_>>()
        });

        if front.trim().is_empty()
            || back.trim().is_empty()
            || dedupe_key.trim().is_empty()
            || (anchor_id.is_none()
                && (source_page.is_none()
                    || source_chunk_ids
                        .as_ref()
                        .map(|ids| ids.is_empty())
                        .unwrap_or(true)))
        {
            continue;
        }

        requests.push(CreateCardCandidateRequest {
            workflow_run_id: request["runId"].as_str().map(String::from),
            document_id: document_id.to_string(),
            section_id: card["sectionId"].as_str().map(String::from),
            anchor_id,
            title: card["title"].as_str().map(String::from),
            card_type: card["cardType"].as_str().map(String::from),
            source_page,
            source_quote: card["sourceQuote"].as_str().map(String::from),
            front,
            back,
            tags,
            confidence,
            dedupe_key,
            score_overall: card["scoreOverall"].as_f64(),
            score_details: if card["scoreDetails"].is_null() {
                None
            } else {
                Some(card["scoreDetails"].clone())
            },
            visibility_bucket: card["visibilityBucket"].as_str().map(String::from),
            generation_mode: card["generationMode"].as_str().map(String::from),
            fallback_reason: card["fallbackReason"].as_str().map(String::from),
            evaluation_summary: card["evaluationSummary"].as_str().map(String::from),
            source_chunk_ids,
        });
    }

    let db = state.lock_db()?;
    let repo = crate::db::CardRepository::new(&db);
    let result = repo.insert_generated_cards(requests)?;
    Ok(json!({
        "createdCount": result.created_count,
        "createdCardIds": result.created_card_ids,
        "skippedDuplicates": result.skipped_duplicates,
        "discardedLowQuality": result.discarded_low_quality,
    }))
}

fn count_candidates_json(state: &AppState, run_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::CardRepository::new(&db);
    let counts = repo.count_candidates_for_run(run_id)?;
    Ok(json!({
        "total": counts.total,
        "pending": counts.pending,
        "accepted": counts.accepted,
        "rejected": counts.rejected,
    }))
}

fn search_chunks_json(state: &AppState, request: Value) -> Result<Value> {
    let query = request["query"].as_str().unwrap_or("").to_string();
    if query.is_empty() {
        return Ok(json!([]));
    }
    let limit = request["limit"].as_i64().unwrap_or(10);
    let document_ids: Vec<String> = request["documentIds"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let db = state.lock_db()?;
    let repo = crate::db::Mvp0DocumentRepository::new(db.connection());
    let scoped_document_ids = if document_ids.is_empty() {
        None
    } else {
        Some(document_ids.as_slice())
    };
    let results = match repo.search_chunks_fts5(&query, scoped_document_ids, limit) {
        Ok(results) if !results.is_empty() => results,
        Ok(_) => repo.search_chunks(&query, scoped_document_ids, limit)?,
        Err(error) => {
            log::warn!("FTS chunk search failed, falling back to contains search: {}", error);
            repo.search_chunks(&query, scoped_document_ids, limit)?
        }
    };

    Ok(results
        .into_iter()
        .map(|r| {
            json!({
                "id": r.id,
                "documentId": r.document_id,
                "sectionId": r.section_id,
                "anchorId": r.anchor_id,
                "chunkIndex": r.chunk_index,
                "pageStart": r.page_start,
                "pageEnd": r.page_end,
                "content": r.content,
                "snippet": r.snippet,
                "lexicalScore": r.lexical_score,
            })
        })
        .collect::<Vec<_>>()
        .into())
}

fn persist_chunk_embeddings_json(state: &AppState, request: Value) -> Result<Value> {
    let profile_id = request["profileId"].as_str().unwrap_or("").to_string();
    let embeddings = request["embeddings"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let chunk_id = item["chunkId"].as_str()?.to_string();
                    let vector = item["vector"]
                        .as_array()?
                        .iter()
                        .map(|value| value.as_f64().map(|number| number as f32))
                        .collect::<Option<Vec<_>>>()?;
                    Some(ChunkEmbeddingRecord {
                        chunk_id,
                        vector,
                        content_hash: item["contentHash"].as_str().map(str::to_string),
                        chunking_profile_revision: item["chunkingProfileRevision"]
                            .as_i64()
                            .map(|value| value as i32),
                        embedding_profile_revision: item["embeddingProfileRevision"]
                            .as_i64()
                            .map(|value| value as i32),
                        embedding_dimensions: item["embeddingDimensions"]
                            .as_i64()
                            .map(|value| value as i32),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if profile_id.is_empty() || embeddings.is_empty() {
        return Ok(json!({
            "storedCount": 0,
        }));
    }

    let db = state.lock_db()?;
    let repo = VectorRepository::new(&db);
    let stored_count = repo.replace_chunk_embeddings(&profile_id, &embeddings)?;

    Ok(json!({
        "storedCount": stored_count,
    }))
}

fn list_chunk_embedding_states_json(state: &AppState, request: Value) -> Result<Value> {
    let document_id = request["documentId"].as_str().unwrap_or("").trim();
    let profile_id = request["profileId"].as_str().unwrap_or("").trim();
    if document_id.is_empty() || profile_id.is_empty() {
        return Ok(json!([]));
    }

    let db = state.lock_db()?;
    let repo = VectorRepository::new(&db);
    let states = repo.list_chunk_embedding_states(document_id, profile_id)?;
    Ok(states
        .into_iter()
        .map(|item| {
            json!({
                "chunkId": item.chunk_id,
                "contentHash": item.content_hash,
                "chunkingProfileRevision": item.chunking_profile_revision,
                "embeddingProfileRevision": item.embedding_profile_revision,
                "embeddingDimensions": item.embedding_dimensions,
                "embeddedAt": item.embedded_at,
            })
        })
        .collect::<Vec<_>>()
        .into())
}

fn lock_embedding_dimensions_json(state: &AppState, request: Value) -> Result<Value> {
    let profile_id = request["profileId"].as_str().unwrap_or("").trim();
    let dimensions = request["dimensions"].as_i64().unwrap_or(0) as i32;
    if profile_id.is_empty() || dimensions <= 0 {
        return Ok(Value::Null);
    }

    let db = state.lock_db()?;
    let repo = VectorRepository::new(&db);
    let profile = repo.lock_embedding_profile_dimensions(profile_id, dimensions)?;
    match profile {
        Some(profile) if profile.dimensions == dimensions => Ok(embedding_profile_to_json(profile)),
        Some(profile) => Err(HostGatewayError::App(format!(
            "Embedding dimensions already locked to {}, requested {}",
            profile.dimensions, dimensions
        ))),
        None => Ok(Value::Null),
    }
}

fn document_embedding_readiness_json(state: &AppState, request: Value) -> Result<Value> {
    let profile_id = request["profileId"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    if profile_id.is_empty() {
        return Ok(json!({
            "status": "embedding_missing",
            "documents": [],
        }));
    }

    let requested_document_ids: Vec<String> = request["documentIds"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|value| value.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let db = state.lock_db()?;
    let document_repo = crate::db::Mvp0DocumentRepository::new(db.connection());
    let vector_repo = VectorRepository::new(&db);
    let documents = if requested_document_ids.is_empty() {
        document_repo.list_documents(false)?
    } else {
        let mut documents = Vec::new();
        for document_id in requested_document_ids {
            if let Some(document) = document_repo.find_document_by_id(&document_id)? {
                documents.push(document);
            }
        }
        documents
    };

    if documents.is_empty() {
        return Ok(json!({
            "status": "embedding_missing",
            "documents": [],
        }));
    }

    let mut overall_status = "ready";
    let mut items = Vec::new();
    for document in documents {
        let chunks = document_repo.list_chunks(&document.id)?;
        let total_chunks = chunks.len() as i64;
        let required_chunks = rag_required_chunk_count(chunks);
        let embedded_chunks = vector_repo.count_document_embeddings(&document.id, &profile_id)?;
        let document_status = host_document_status(&document.parse_status);
        let status =
            rag_embedding_readiness_status(document_status, required_chunks, embedded_chunks);
        let response_document_status = if status == "ready" && document_status == "embedding_stale"
        {
            document_repo.update_parse_status(&document.id, "ready")?;
            "ready"
        } else {
            document_status
        };

        if status == "embedding_missing" {
            overall_status = "embedding_missing";
        } else if status == "embedding_stale" && overall_status == "ready" {
            overall_status = "embedding_stale";
        }

        items.push(json!({
            "documentId": document.id,
            "title": document.title,
            "documentStatus": response_document_status,
            "status": status,
            "totalChunks": total_chunks,
            "requiredChunks": required_chunks,
            "embeddedChunks": embedded_chunks,
        }));
    }

    Ok(json!({
        "status": overall_status,
        "documents": items,
    }))
}

fn get_query_embedding_cache_json(state: &AppState, request: Value) -> Result<Value> {
    let cache_key = request["cacheKey"].as_str().unwrap_or("").trim();
    let expected_dimensions = request["expectedDimensions"].as_i64().unwrap_or(0) as i32;
    let max_age_seconds = request["maxAgeSeconds"]
        .as_i64()
        .unwrap_or(7 * 24 * 60 * 60);
    if cache_key.is_empty() || expected_dimensions <= 0 {
        return Ok(json!({"hit": false}));
    }

    let db = state.lock_db()?;
    let repo = QueryEmbeddingCacheRepository::new(&db);
    match repo.get(cache_key, expected_dimensions, max_age_seconds)? {
        Some(entry) => Ok(json!({
            "hit": true,
            "cacheKey": entry.cache_key,
            "vector": entry.vector,
            "createdAt": entry.created_at,
            "lastUsedAt": entry.last_used_at,
            "hitCount": entry.hit_count,
        })),
        None => Ok(json!({"hit": false})),
    }
}

fn put_query_embedding_cache_json(state: &AppState, request: Value) -> Result<Value> {
    let vector = request["vector"]
        .as_array()
        .map(|values| {
            values
                .iter()
                .map(|value| value.as_f64().map(|number| number as f32))
                .collect::<Option<Vec<_>>>()
        })
        .flatten()
        .unwrap_or_default();

    let cache_request = UpsertQueryEmbeddingCacheRequest {
        cache_key: request["cacheKey"].as_str().unwrap_or("").trim().to_string(),
        profile_id: request["profileId"].as_str().unwrap_or("").trim().to_string(),
        provider: request["provider"].as_str().unwrap_or("").trim().to_string(),
        model: request["model"].as_str().unwrap_or("").trim().to_string(),
        dimensions: request["dimensions"].as_i64().unwrap_or(0) as i32,
        task_type: request["taskType"].as_str().unwrap_or("").trim().to_string(),
        question_hash: request["questionHash"]
            .as_str()
            .unwrap_or("")
            .trim()
            .to_string(),
        vector,
    };

    let db = state.lock_db()?;
    let repo = QueryEmbeddingCacheRepository::new(&db);
    let stored = repo.upsert(cache_request)?;
    let max_age_seconds = request["maxAgeSeconds"]
        .as_i64()
        .unwrap_or(7 * 24 * 60 * 60);
    let max_entries = request["maxEntries"].as_i64().unwrap_or(2000);
    let (deleted_expired, deleted_overflow) = repo.prune(max_age_seconds, max_entries)?;

    Ok(json!({
        "stored": stored,
        "deletedExpired": deleted_expired,
        "deletedOverflow": deleted_overflow,
    }))
}

fn prune_query_embedding_cache_json(state: &AppState, request: Value) -> Result<Value> {
    let max_age_seconds = request["maxAgeSeconds"]
        .as_i64()
        .unwrap_or(7 * 24 * 60 * 60);
    let max_entries = request["maxEntries"].as_i64().unwrap_or(2000);

    let db = state.lock_db()?;
    let repo = QueryEmbeddingCacheRepository::new(&db);
    let (deleted_expired, deleted_overflow) = repo.prune(max_age_seconds, max_entries)?;

    Ok(json!({
        "deletedExpired": deleted_expired,
        "deletedOverflow": deleted_overflow,
    }))
}

fn search_hybrid_json(state: &AppState, request: Value) -> Result<Value> {
    let query = request["query"].as_str().unwrap_or("").trim().to_string();
    if query.is_empty() {
        return Ok(json!([]));
    }

    let limit = request["limit"].as_i64().unwrap_or(10).max(1);
    let rrf_k = request["rrfK"].as_f64().unwrap_or(60.0);
    let document_ids: Vec<String> = request["documentIds"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let query_embedding = request["queryEmbedding"]
        .as_array()
        .map(|values| {
            values
                .iter()
                .map(|value| value.as_f64().map(|number| number as f32))
                .collect::<Option<Vec<_>>>()
        })
        .flatten();

    let db = state.lock_db()?;
    let document_repo = crate::db::Mvp0DocumentRepository::new(db.connection());
    let vector_repo = VectorRepository::new(&db);
    let scoped_document_ids = if document_ids.is_empty() {
        None
    } else {
        Some(document_ids.as_slice())
    };
    let (lexical_results, lexical_status) = match document_repo
        .search_chunks_fts5(&query, scoped_document_ids, limit * 3)
    {
        Ok(results) if !results.is_empty() => (results, "fts5_bm25"),
        Ok(_) => (
            document_repo.search_chunks(&query, scoped_document_ids, limit * 3)?,
            "fallback",
        ),
        Err(error) => {
            log::warn!(
                "Hybrid lexical search failed, falling back to contains search: {}",
                error
            );
            (
                document_repo.search_chunks(&query, scoped_document_ids, limit * 3)?,
                "fallback",
            )
        }
    };

    let vector_results = if let Some(query_embedding) = query_embedding.as_deref() {
        vector_repo.search_chunk_embeddings(
            query_embedding,
            limit * 3,
            if document_ids.is_empty() {
                None
            } else {
                Some(document_ids.as_slice())
            },
        )?
    } else {
        Vec::new()
    };

    let mut merged = std::collections::BTreeMap::<String, Value>::new();

    for (index, result) in lexical_results.into_iter().enumerate() {
        let rank = index + 1;
        let rrf_score = 1.0 / (rrf_k + rank as f64);
        let entry = merged.entry(result.id.clone()).or_insert_with(|| {
            let chunk_id = result.id.clone();
            json!({
                "id": chunk_id,
                "chunkId": result.id,
                "documentId": result.document_id,
                "sectionId": result.section_id,
                "anchorId": result.anchor_id,
                "chunkIndex": result.chunk_index,
                "page": result.page_start,
                "pageStart": result.page_start,
                "pageEnd": result.page_end,
                "content": result.content,
                "snippet": result.snippet,
                "score": 0.0,
                "rrfScore": 0.0,
                "lexicalScore": result.lexical_score,
                "lexicalSource": lexical_status,
                "vectorScore": 0.0,
                "ftsRank": Value::Null,
                "vectorRank": Value::Null,
                "distance": Value::Null,
                "vectorBacked": false,
                "retrievalMode": "lexical",
            })
        });

        let current_score = entry["rrfScore"].as_f64().unwrap_or(0.0);
        entry["rrfScore"] = json!(current_score + rrf_score);
        entry["score"] = entry["rrfScore"].clone();
        entry["ftsRank"] = json!(rank as i64);
        entry["lexicalScore"] = json!(result.lexical_score);
        entry["lexicalSource"] = json!(lexical_status);
    }

    for (index, result) in vector_results.into_iter().enumerate() {
        let rank = index + 1;
        let rrf_score = 1.0 / (rrf_k + rank as f64);
        let entry = merged.entry(result.chunk_id.clone()).or_insert_with(|| {
            let chunk_id = result.chunk_id.clone();
            let snippet = result.content.chars().take(240).collect::<String>();
            json!({
                "id": chunk_id,
                "chunkId": result.chunk_id,
                "documentId": result.document_id,
                "sectionId": result.section_id,
                "anchorId": result.anchor_id,
                "chunkIndex": result.chunk_index,
                "page": result.page_start,
                "pageStart": result.page_start,
                "pageEnd": result.page_end,
                "content": result.content,
                "snippet": snippet,
                "score": 0.0,
                "rrfScore": 0.0,
                "lexicalScore": Value::Null,
                "lexicalSource": Value::Null,
                "vectorScore": 0.0,
                "ftsRank": Value::Null,
                "vectorRank": Value::Null,
                "distance": Value::Null,
                "vectorBacked": false,
                "retrievalMode": "vector",
            })
        });

        let current_score = entry["rrfScore"].as_f64().unwrap_or(0.0);
        entry["rrfScore"] = json!(current_score + rrf_score);
        entry["score"] = entry["rrfScore"].clone();
        entry["vectorRank"] = json!(rank as i64);
        entry["vectorScore"] = json!(rrf_score);
        entry["distance"] = json!(result.distance);
        entry["vectorBacked"] = json!(true);
        let has_lexical = !entry["ftsRank"].is_null();
        entry["retrievalMode"] = json!(if has_lexical { "hybrid" } else { "vector" });
    }

    let mut merged_results = merged.into_values().collect::<Vec<_>>();
    merged_results.sort_by(|left, right| {
        let left_score = left["rrfScore"].as_f64().unwrap_or(0.0);
        let right_score = right["rrfScore"].as_f64().unwrap_or(0.0);
        right_score
            .partial_cmp(&left_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    merged_results.truncate(limit as usize);

    Ok(merged_results.into())
}

/// Parse simple key=value query string (no URL decoding needed for our use).
fn qs_param<'a>(qs: &'a str, key: &str) -> Option<&'a str> {
    qs.split('&').find_map(|pair| {
        let mut parts = pair.splitn(2, '=');
        let k = parts.next()?;
        if k == key {
            parts.next()
        } else {
            None
        }
    })
}

fn list_cards_json(state: &AppState, path_with_qs: &str) -> Result<Value> {
    let qs = path_with_qs.splitn(2, '?').nth(1).unwrap_or("");
    let document_id = qs_param(qs, "documentId");
    let limit: i64 = qs_param(qs, "limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(1000);

    let db = state.lock_db()?;
    let repo = crate::db::CardRepository::new(&db);
    let filters = crate::db::CardFilters {
        document_id,
        anchor_id: None,
        page_number: None,
        limit: Some(limit),
    };
    let cards = repo.list_cards(filters)?;
    Ok(cards
        .into_iter()
        .map(|c| {
            json!({
                "id": c.id,
                "groupId": c.group_id,
                "title": c.title,
                "cardType": c.card_type,
                "clusterId": c.cluster_id,
                "exportGuid": c.export_guid,
                "front": c.front,
                "back": c.back,
                "documentId": c.document_id,
                "anchorId": c.anchor_id,
                "sourcePage": c.source_page,
                "tags": c.tags,
            })
        })
        .collect::<Vec<_>>()
        .into())
}

fn get_app_settings_json(state: &AppState) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::SettingsRepository::new(&db);
    let settings = repo.get_settings()?;

    Ok(json!({
        "dailyNewCardLimit": settings.daily_new_card_limit,
        "reviewTimeLimit": settings.review_time_limit,
        "theme": settings.theme,
        "language": settings.language,
        "podcastTtsProvider": settings.podcast_tts_provider,
        "podcastOpenaiModel": settings.podcast_openai_model,
        "podcastGoogleTtsModel": settings.podcast_google_tts_model,
        "podcastFishAudioEndpoint": settings.podcast_fish_audio_endpoint,
        "podcastVoiceOverrides": settings.podcast_voice_overrides,
        "podcastOutputFormat": settings.podcast_output_format,
        "podcastSkipReview": settings.podcast_skip_review,
        "podcastMaxLlmTokens": settings.podcast_max_llm_tokens,
        "podcastMaxTtsCharacters": settings.podcast_max_tts_characters,
        "podcastMaxEstimatedCostUsd": settings.podcast_max_estimated_cost_usd,
    }))
}

fn get_runtime_paths_json(state: &HostGatewayState) -> Result<Value> {
    let app_data_dir =
        state.app_handle.path().app_data_dir().map_err(|_| {
            HostGatewayError::App("Failed to resolve app data directory".to_string())
        })?;
    let podcasts_dir = app_data_dir.join("podcasts");
    let animations_dir = app_data_dir.join("animations");

    Ok(json!({
        "appDataDir": app_data_dir,
        "podcastsDir": podcasts_dir,
        "animationsDir": animations_dir,
    }))
}

fn podcast_episode_to_json(episode: crate::db::PodcastEpisode) -> Value {
    json!({
        "id": episode.id,
        "documentIds": episode.document_ids,
        "runId": episode.run_id,
        "title": episode.title,
        "scopeDescription": episode.scope_description,
        "style": episode.style,
        "language": episode.language,
        "durationTier": episode.duration_tier,
        "ttsProvider": episode.tts_provider,
        "audioFormat": episode.audio_format,
        "scriptJson": episode.script_json,
        "outlineJson": episode.outline_json,
        "evaluationJson": episode.evaluation_json,
        "audioPath": episode.audio_path,
        "durationMs": episode.duration_ms,
        "status": episode.status,
        "stageKey": derive_podcast_stage_key(&episode.status, episode.current_stage),
        "errorMessage": episode.error_message,
        "errorCode": derive_podcast_error_code(&episode.status, episode.error_message.as_deref()),
        "errorStage": derive_podcast_error_stage(&episode.status, episode.current_stage, episode.error_message.as_deref()),
        "retryable": !matches!(episode.status.as_str(), "ready"),
        "currentStage": episode.current_stage,
        "completedSegments": episode.completed_segments,
        "totalSegments": episode.total_segments,
        "createdAt": episode.created_at,
        "updatedAt": episode.updated_at,
    })
}

fn derive_podcast_stage_key(status: &str, current_stage: i64) -> &'static str {
    match status {
        "ready" => "ready",
        "failed" => "failed",
        "cancelled" => "cancelled",
        "awaiting_review" => "awaiting_review",
        "queued" | "retrieving" => "retrieval",
        "generating_outline" => "outline",
        "generating_script" => "script",
        "evaluating" => "evaluation",
        "generating_audio" | "stitching" => "audio",
        _ => match current_stage {
            0 | 1 => "retrieval",
            2 => "outline",
            3 => "script",
            4 => "evaluation",
            5 | 6 => "audio",
            _ => "retrieval",
        },
    }
}

fn derive_podcast_error_code(status: &str, error_message: Option<&str>) -> Option<&'static str> {
    if status != "failed" && status != "cancelled" {
        return None;
    }

    if let Some(message) = error_message {
        let lowered = message.to_lowercase();
        if lowered.contains("budget") {
            return Some("budget_exceeded");
        }
        if lowered.contains("tts") {
            return Some("tts_failed");
        }
        if lowered.contains("review") {
            return Some("review_rejected");
        }
    }

    Some(if status == "cancelled" {
        "cancelled"
    } else {
        "workflow_failed"
    })
}

fn derive_podcast_error_stage(
    status: &str,
    current_stage: i64,
    error_message: Option<&str>,
) -> Option<&'static str> {
    if status != "failed" && status != "cancelled" {
        return None;
    }

    if let Some(message) = error_message {
        let lowered = message.to_lowercase();
        if lowered.contains("review") {
            return Some("awaiting_review");
        }
    }

    Some(match current_stage {
        0 | 1 => "retrieval",
        2 => "outline",
        3 => "script",
        4 => "evaluation",
        5 | 6 => "audio",
        _ => "retrieval",
    })
}

fn podcast_audio_segment_to_json(segment: crate::db::AudioSegment) -> Value {
    json!({
        "id": segment.id,
        "episodeId": segment.episode_id,
        "dialogueSegmentId": segment.dialogue_segment_id,
        "speaker": segment.speaker,
        "filePath": segment.file_path,
        "durationMs": segment.duration_ms,
        "ttsProvider": segment.tts_provider,
        "voiceId": segment.voice_id,
    })
}

fn create_podcast_episode_json(state: &AppState, request: Value) -> Result<Value> {
    let document_ids = request
        .get("documentIds")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|value| value.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let db = state.lock_db()?;
    let repo = crate::db::PodcastRepository::new(&db);
    let episode = repo.create_episode(crate::db::CreatePodcastEpisodeRequest {
        id: request
            .get("id")
            .and_then(Value::as_str)
            .map(String::from)
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        document_ids,
        run_id: request
            .get("runId")
            .and_then(Value::as_str)
            .map(String::from),
        title: request
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("AI 学习播客")
            .to_string(),
        scope_description: request
            .get("scopeDescription")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        style: request
            .get("style")
            .and_then(Value::as_str)
            .unwrap_or("interview")
            .to_string(),
        language: request
            .get("language")
            .and_then(Value::as_str)
            .unwrap_or("zh-CN")
            .to_string(),
        duration_tier: request
            .get("durationTier")
            .and_then(Value::as_str)
            .unwrap_or("medium")
            .to_string(),
        tts_provider: request
            .get("ttsProvider")
            .and_then(Value::as_str)
            .unwrap_or("auto")
            .to_string(),
        audio_format: request
            .get("audioFormat")
            .and_then(Value::as_str)
            .unwrap_or("mp3")
            .to_string(),
    })?;
    Ok(podcast_episode_to_json(episode))
}

fn get_podcast_episode_json(state: &AppState, episode_id: &str) -> Result<Option<Value>> {
    let db = state.lock_db()?;
    let repo = crate::db::PodcastRepository::new(&db);
    Ok(repo.get_episode(episode_id)?.map(podcast_episode_to_json))
}

fn list_podcast_episodes_json(state: &AppState) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::PodcastRepository::new(&db);
    Ok(repo
        .list_episodes()?
        .into_iter()
        .map(podcast_episode_to_json)
        .collect::<Vec<_>>()
        .into())
}

fn update_podcast_episode_json(
    state: &AppState,
    episode_id: &str,
    request: Value,
) -> Result<Value> {
    let mut updates = crate::db::PodcastEpisodeUpdates::default();

    if let Some(value) = request.get("documentIds") {
        updates.document_ids = Some(
            value
                .as_array()
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default(),
        );
    }
    if let Some(value) = request.get("runId") {
        updates.run_id = Some(value.as_str().map(String::from));
    }
    if let Some(value) = request.get("title").and_then(Value::as_str) {
        updates.title = Some(value.to_string());
    }
    if let Some(value) = request.get("scopeDescription").and_then(Value::as_str) {
        updates.scope_description = Some(value.to_string());
    }
    if let Some(value) = request.get("style").and_then(Value::as_str) {
        updates.style = Some(value.to_string());
    }
    if let Some(value) = request.get("language").and_then(Value::as_str) {
        updates.language = Some(value.to_string());
    }
    if let Some(value) = request.get("durationTier").and_then(Value::as_str) {
        updates.duration_tier = Some(value.to_string());
    }
    if let Some(value) = request.get("ttsProvider").and_then(Value::as_str) {
        updates.tts_provider = Some(value.to_string());
    }
    if let Some(value) = request.get("audioFormat").and_then(Value::as_str) {
        updates.audio_format = Some(value.to_string());
    }
    if let Some(value) = request.get("scriptJson").and_then(Value::as_str) {
        updates.script_json = Some(value.to_string());
    }
    if let Some(value) = request.get("outlineJson") {
        updates.outline_json = Some(value.as_str().map(String::from));
    }
    if let Some(value) = request.get("evaluationJson") {
        updates.evaluation_json = Some(value.as_str().map(String::from));
    }
    if let Some(value) = request.get("audioPath") {
        updates.audio_path = Some(value.as_str().map(String::from));
    }
    if let Some(value) = request.get("durationMs").and_then(Value::as_i64) {
        updates.duration_ms = Some(value);
    }
    if let Some(value) = request.get("status").and_then(Value::as_str) {
        updates.status = Some(value.to_string());
    }
    if let Some(value) = request.get("errorMessage") {
        updates.error_message = Some(value.as_str().map(String::from));
    }
    if let Some(value) = request.get("currentStage").and_then(Value::as_i64) {
        updates.current_stage = Some(value);
    }
    if let Some(value) = request.get("completedSegments").and_then(Value::as_i64) {
        updates.completed_segments = Some(value);
    }
    if let Some(value) = request.get("totalSegments").and_then(Value::as_i64) {
        updates.total_segments = Some(value);
    }

    let db = state.lock_db()?;
    let repo = crate::db::PodcastRepository::new(&db);
    let episode = repo.update_episode(episode_id, &updates)?;
    Ok(podcast_episode_to_json(episode))
}

fn delete_podcast_episode_json(state: &AppState, episode_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::PodcastRepository::new(&db);
    repo.delete_episode(episode_id)?;
    Ok(json!({"ok": true}))
}

fn save_podcast_audio_segment_json(state: &AppState, request: Value) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::PodcastRepository::new(&db);
    let segment = repo.save_audio_segment(crate::db::NewAudioSegment {
        id: request
            .get("id")
            .and_then(Value::as_str)
            .map(String::from)
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        episode_id: request
            .get("episodeId")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        dialogue_segment_id: request
            .get("dialogueSegmentId")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        speaker: request
            .get("speaker")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        file_path: request
            .get("filePath")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        duration_ms: request
            .get("durationMs")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        tts_provider: request
            .get("ttsProvider")
            .and_then(Value::as_str)
            .unwrap_or("auto")
            .to_string(),
        voice_id: request
            .get("voiceId")
            .and_then(Value::as_str)
            .unwrap_or("default")
            .to_string(),
    })?;
    Ok(podcast_audio_segment_to_json(segment))
}

fn list_podcast_audio_segments_json(state: &AppState, episode_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::PodcastRepository::new(&db);
    Ok(repo
        .list_audio_segments(episode_id)?
        .into_iter()
        .map(podcast_audio_segment_to_json)
        .collect::<Vec<_>>()
        .into())
}

fn delete_podcast_audio_segments_json(state: &AppState, episode_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::PodcastRepository::new(&db);
    repo.delete_audio_segments_by_episode(episode_id)?;
    Ok(json!({"ok": true}))
}

fn review_podcast_script_json(state: &AppState, episode_id: &str, request: Value) -> Result<Value> {
    let action = request
        .get("action")
        .and_then(Value::as_str)
        .unwrap_or("accept");
    let db = state.lock_db()?;
    let repo = crate::db::PodcastRepository::new(&db);
    let updates = match action {
        "accept" => crate::db::PodcastEpisodeUpdates {
            status: Some("ready".to_string()),
            error_message: Some(None),
            ..crate::db::PodcastEpisodeUpdates::default()
        },
        "edit" => crate::db::PodcastEpisodeUpdates {
            script_json: request
                .get("editedScriptJson")
                .and_then(Value::as_str)
                .map(String::from),
            status: Some("ready".to_string()),
            error_message: Some(None),
            ..crate::db::PodcastEpisodeUpdates::default()
        },
        "reject" => crate::db::PodcastEpisodeUpdates {
            status: Some("cancelled".to_string()),
            error_message: Some(Some("Review rejected".to_string())),
            ..crate::db::PodcastEpisodeUpdates::default()
        },
        _ => crate::db::PodcastEpisodeUpdates::default(),
    };
    let episode = repo.update_episode(episode_id, &updates)?;
    Ok(podcast_episode_to_json(episode))
}

// ── Run / Checkpoint / Cancel helpers ─────────────────────

fn get_run_json(state: &AppState, run_id: &str) -> Result<Option<Value>> {
    let db = state.lock_db()?;
    let repo = crate::db::WorkflowRepository::new(&db);
    let run = repo.get_run(run_id)?;
    Ok(run.map(|r| {
        json!({
            "id": r.id,
            "workflowType": r.workflow_type,
            "presetId": r.preset_id,
            "status": r.status,
            "threadId": r.thread_id,
            "checkpointRef": r.checkpoint_ref,
            "costUsd": r.cost_usd,
            "errorMessage": r.error_message,
            "startedAt": r.started_at,
            "finishedAt": r.finished_at,
            "createdAt": r.created_at,
            "updatedAt": r.updated_at,
        })
    }))
}

fn get_latest_checkpoint_json(state: &AppState, run_id: &str) -> Result<Option<Value>> {
    let db = state.lock_db()?;
    let repo = crate::db::WorkflowRepository::new(&db);
    let cp = repo.get_latest_checkpoint(run_id)?;
    Ok(cp.map(|c| {
        json!({
            "id": c.id,
            "runId": c.run_id,
            "checkpointRef": c.checkpoint_ref,
            "stepKey": c.step_key,
            "payload": c.payload,
            "createdAt": c.created_at,
            "updatedAt": c.updated_at,
        })
    }))
}

fn save_checkpoint_json(state: &AppState, run_id: &str, request: Value) -> Result<Value> {
    let checkpoint_ref = request["checkpointRef"]
        .as_str()
        .unwrap_or("latest")
        .to_string();
    let step_key = request["stepKey"].as_str().map(String::from);
    let payload = if request["payload"].is_null() {
        request.clone()
    } else {
        request["payload"].clone()
    };

    let db = state.lock_db()?;
    let repo = crate::db::WorkflowRepository::new(&db);
    let cp = repo.upsert_checkpoint(crate::db::UpsertWorkflowCheckpointRequest {
        run_id: run_id.to_string(),
        checkpoint_ref,
        step_key,
        payload,
    })?;
    Ok(json!({
        "id": cp.id,
        "runId": cp.run_id,
        "checkpointRef": cp.checkpoint_ref,
        "stepKey": cp.step_key,
        "payload": cp.payload,
        "createdAt": cp.created_at,
        "updatedAt": cp.updated_at,
    }))
}

fn cancel_run_json(state: &AppState, run_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::WorkflowRepository::new(&db);
    let now = chrono::Utc::now().to_rfc3339();
    let run = repo.update_run(
        run_id,
        crate::db::UpdateWorkflowRunRequest {
            status: Some("cancelled".to_string()),
            checkpoint_ref: None,
            approval_payload: None,
            cost_usd: None,
            error_message: Some("Cancelled by user".to_string()),
            started_at: None,
            finished_at: Some(now),
        },
    )?;
    match run {
        Some(r) => Ok(json!({"id": r.id, "status": r.status})),
        None => Ok(json!({"error": "not_found"})),
    }
}

fn pause_run_json(state: &AppState, run_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::WorkflowRepository::new(&db);
    let run = repo.update_run(
        run_id,
        crate::db::UpdateWorkflowRunRequest {
            status: Some("paused".to_string()),
            checkpoint_ref: None,
            approval_payload: None,
            cost_usd: None,
            error_message: None,
            started_at: None,
            finished_at: None,
        },
    )?;
    match run {
        Some(r) => Ok(json!({"id": r.id, "status": r.status})),
        None => Ok(json!({"error": "not_found"})),
    }
}

fn resume_run_json(state: &AppState, run_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::WorkflowRepository::new(&db);
    let run = repo.update_run(
        run_id,
        crate::db::UpdateWorkflowRunRequest {
            status: Some("running".to_string()),
            checkpoint_ref: None,
            approval_payload: None,
            cost_usd: None,
            error_message: None,
            started_at: None,
            finished_at: None,
        },
    )?;
    match run {
        Some(r) => {
            let token = format!("{}-{}", r.id, chrono::Utc::now().timestamp_millis());
            Ok(json!({"id": r.id, "status": r.status, "resumeToken": token}))
        }
        None => Ok(json!({"error": "not_found"})),
    }
}

fn append_workflow_event_json(state: &AppState, run_id: &str, request: Value) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::WorkflowRepository::new(&db);
    let event = repo.append_event(crate::db::AppendWorkflowEventRequest {
        run_id: run_id.to_string(),
        event_type: request
            .get("eventType")
            .and_then(Value::as_str)
            .unwrap_or("progress")
            .to_string(),
        message: request
            .get("message")
            .and_then(Value::as_str)
            .map(String::from),
        progress: request.get("progress").and_then(Value::as_f64),
        payload: request.get("payload").cloned(),
    })?;
    Ok(json!({
        "id": event.id,
        "runId": event.run_id,
        "eventType": event.event_type,
        "message": event.message,
        "progress": event.progress,
        "payload": event.payload,
        "createdAt": event.created_at,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gateway_auth_requires_exact_token() {
        let expected = "host-token";
        let empty_headers = BTreeMap::new();
        assert!(!is_gateway_authorized(&empty_headers, expected));

        let mut wrong_headers = BTreeMap::new();
        wrong_headers.insert(
            "x-xuejian-gateway-token".to_string(),
            "wrong-token".to_string(),
        );
        assert!(!is_gateway_authorized(&wrong_headers, expected));

        let mut correct_headers = BTreeMap::new();
        correct_headers.insert("x-xuejian-gateway-token".to_string(), expected.to_string());
        assert!(is_gateway_authorized(&correct_headers, expected));
    }
}
