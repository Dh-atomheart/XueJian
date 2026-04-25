use std::{collections::BTreeMap, net::TcpListener, sync::Arc};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::app_state::AppState;
use crate::commands::settings::resolve_effective_embedding_profile;
use crate::db::{
    ApiConfig, ChunkEmbeddingRecord, Community, CommunityRepository, CreateCardCandidateRequest,
    EmbeddingProfile, InsertKnowledgeEdgeRequest, InsertKnowledgeNodeRequest, KnowledgeEdge,
    KnowledgeGraphRepository, KnowledgeNode, ModelProfile, ProviderBudgetUsage, SettingsRepository,
    UpdateKnowledgeEdgeRequest, UpdateKnowledgeNodeRequest, VectorRepository,
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
            state: Arc::new(HostGatewayState { app_handle }),
            port,
        })
    }

    pub fn port(&self) -> u16 {
        self.port
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
    use std::io::{BufRead, BufReader, Write};

    let started_at = std::time::Instant::now();
    let reader = BufReader::new(&stream);
    let mut lines = reader.lines();

    let request_line = match lines.next() {
        Some(Ok(line)) => line,
        _ => return,
    };

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    let method = parts.first().copied().unwrap_or("GET");
    let path = parts.get(1).copied().unwrap_or("/");

    // Read headers (we need Content-Length for POST bodies)
    let mut content_length: usize = 0;
    for line in lines.by_ref() {
        let line = match line {
            Ok(l) => l,
            Err(_) => return,
        };
        if line.is_empty() {
            break;
        }
        if let Some(value) = line.strip_prefix("Content-Length:") {
            content_length = value.trim().parse().unwrap_or(0);
        }
    }

    // Read body if present
    let body: Vec<u8> = if content_length > 0 {
        use std::io::Read;
        let mut body = vec![0u8; content_length];
        let _ = stream.read(&mut body);
        body
    } else {
        Vec::new()
    };

    let response = route_request(method, path, &body, state);
    let status_code = response.status_code();
    let duration_ms = started_at.elapsed().as_secs_f64() * 1000.0;
    if status_code >= 500 {
        log::error!(
            target: "host_gateway",
            "HTTP {method} {path} -> {status_code} ({duration_ms:.2}ms)"
        );
    } else {
        log::info!(
            target: "host_gateway",
            "HTTP {method} {path} -> {status_code} ({duration_ms:.2}ms)"
        );
    }
    let response_bytes = format!(
        "HTTP/1.1 {} OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status_code,
        response.body().len(),
        response.body(),
    );

    let _ = stream.write_all(response_bytes.as_bytes());
    let _ = stream.flush();
}

enum GatewayResponse {
    Ok(String),
    NotFound(String),
    BadRequest(String),
    InternalError(String),
}

impl GatewayResponse {
    fn status_code(&self) -> u16 {
        match self {
            Self::Ok(_) => 200,
            Self::NotFound(_) => 404,
            Self::BadRequest(_) => 400,
            Self::InternalError(_) => 500,
        }
    }

    fn body(&self) -> &str {
        match self {
            Self::Ok(s) | Self::NotFound(s) | Self::BadRequest(s) | Self::InternalError(s) => s,
        }
    }
}

fn route_request(
    method: &str,
    path: &str,
    body: &[u8],
    state: &HostGatewayState,
) -> GatewayResponse {
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

        // ── ToolGateway: knowledge search ─────────────────
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
        ("GET", "/tool-gateway/graph/nodes") => match list_knowledge_nodes_json(&app_state) {
            Ok(payload) => GatewayResponse::Ok(payload.to_string()),
            Err(error) => {
                GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
            }
        },

        ("POST", "/tool-gateway/graph/nodes") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match create_knowledge_node_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/graph/nodes/find") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match find_knowledge_node_by_label_json(&app_state, request) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path)
            if path.starts_with("/tool-gateway/graph/nodes/") && path.ends_with("/update") =>
        {
            let node_id = path
                .strip_prefix("/tool-gateway/graph/nodes/")
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
            match update_knowledge_node_json(&app_state, node_id, request) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", "/tool-gateway/graph/edges") => match list_knowledge_edges_json(&app_state) {
            Ok(payload) => GatewayResponse::Ok(payload.to_string()),
            Err(error) => {
                GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
            }
        },

        ("POST", "/tool-gateway/graph/edges") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match create_knowledge_edge_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path)
            if path.starts_with("/tool-gateway/graph/edges/") && path.ends_with("/update") =>
        {
            let edge_id = path
                .strip_prefix("/tool-gateway/graph/edges/")
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
            match update_knowledge_edge_json(&app_state, edge_id, request) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", path)
            if path.starts_with("/tool-gateway/graph/edges/") && path.ends_with("/delete") =>
        {
            let edge_id = path
                .strip_prefix("/tool-gateway/graph/edges/")
                .and_then(|p| p.strip_suffix("/delete"))
                .unwrap_or("");
            match delete_knowledge_edge_json(&app_state, edge_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/graph/communities") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match create_community_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/graph/communities/list") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match list_communities_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path)
            if path.starts_with("/tool-gateway/graph/communities/")
                && path.ends_with("/summary") =>
        {
            let community_id = path
                .strip_prefix("/tool-gateway/graph/communities/")
                .and_then(|p| p.strip_suffix("/summary"))
                .unwrap_or("");
            match get_community_summary_json(&app_state, community_id) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/graph/entity-embeddings") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match save_entity_embedding_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/graph/entity-embeddings/") => {
            let node_id = path
                .strip_prefix("/tool-gateway/graph/entity-embeddings/")
                .unwrap_or("");
            match get_entity_embedding_json(&app_state, node_id) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("POST", "/tool-gateway/graph/entity-search") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => {
                    return GatewayResponse::BadRequest(
                        json!({"error": error.to_string()}).to_string(),
                    )
                }
            };
            match vector_search_entity_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => {
                    GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
                }
            }
        }

        ("GET", "/tool-gateway/graph/stats") => match get_graph_stats_json(&app_state) {
            Ok(payload) => GatewayResponse::Ok(payload.to_string()),
            Err(error) => {
                GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string())
            }
        },

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
    let secrets = state.lock_secrets()?;
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
            Some(workflow_assignment_to_json(assignment, model_profile, config))
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
    let repo = crate::db::DocumentRepository::new(&db);
    Ok(repo.find_by_id(document_id)?.map(|document| {
        json!({
            "id": document.id,
            "title": document.title,
            "filePath": document.file_path,
            "fileType": document.file_type,
            "status": document.status,
            "pageCount": document.page_count,
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
    let repo = crate::db::DocumentRepository::new(&db);
    repo.update_status(document_id, status)?;
    Ok(json!({"ok": true, "status": status}))
}

fn save_document_analysis_json(
    state: &AppState,
    document_id: &str,
    request: Value,
) -> Result<Value> {
    let page_count = request["pageCount"].as_i64().unwrap_or(0) as i32;
    let anchors: Vec<crate::db::CreateDocumentAnchorRequest> = request["anchors"]
        .as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .map(|a| crate::db::CreateDocumentAnchorRequest {
            id: a["id"].as_str().map(String::from),
            page: a["page"].as_i64().unwrap_or(1) as i32,
            paragraph: a["paragraph"].as_i64().map(|v| v as i32),
            text_quote: a["textQuote"].as_str().unwrap_or("").to_string(),
            rects: a["rects"]
                .as_array()
                .unwrap_or(&Vec::new())
                .iter()
                .map(|r| crate::db::DocumentAnchorRect {
                    x: r["x"].as_f64().unwrap_or(0.0),
                    y: r["y"].as_f64().unwrap_or(0.0),
                    width: r["width"].as_f64().unwrap_or(0.0),
                    height: r["height"].as_f64().unwrap_or(0.0),
                })
                .collect(),
            hash: a["hash"].as_str().unwrap_or("").to_string(),
            hierarchy_path: a["hierarchyPath"].as_array().map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            }),
            quote_hash: a["quoteHash"]
                .as_str()
                .map(String::from)
                .or_else(|| Some(a["hash"].as_str().unwrap_or("").to_string())),
        })
        .collect();
    let sections: Vec<crate::db::CreateDocumentSectionRequest> = request["sections"]
        .as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .map(|s| crate::db::CreateDocumentSectionRequest {
            id: s["id"].as_str().map(String::from),
            section_index: s["sectionIndex"].as_i64().unwrap_or(0) as i32,
            heading: s["heading"].as_str().map(String::from),
            hierarchy_path: s["hierarchyPath"].as_array().map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            }),
            page_start: s["pageStart"].as_i64().map(|v| v as i32),
            page_end: s["pageEnd"].as_i64().map(|v| v as i32),
            anchor_start_id: s["anchorStartId"].as_str().map(String::from),
            anchor_end_id: s["anchorEndId"].as_str().map(String::from),
            content: s["content"].as_str().unwrap_or("").to_string(),
            token_count: s["tokenCount"].as_i64().map(|v| v as i32),
            metadata: if s["metadata"].is_null() {
                None
            } else {
                Some(s["metadata"].clone())
            },
        })
        .collect();
    let chunks: Vec<crate::db::CreateDocumentChunkRequest> = request["chunks"]
        .as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .map(|c| crate::db::CreateDocumentChunkRequest {
            id: c["id"].as_str().map(String::from),
            section_id: c["sectionId"].as_str().map(String::from),
            anchor_id: c["anchorId"].as_str().map(String::from),
            page_start: c["pageStart"].as_i64().map(|v| v as i32),
            page_end: c["pageEnd"].as_i64().map(|v| v as i32),
            chunk_index: c["chunkIndex"].as_i64().unwrap_or(0) as i32,
            chunk_kind: c["chunkKind"].as_str().map(String::from),
            content: c["content"].as_str().unwrap_or("").to_string(),
            token_count: c["tokenCount"].as_i64().map(|v| v as i32),
            metadata: if c["metadata"].is_null() {
                None
            } else {
                Some(c["metadata"].clone())
            },
        })
        .collect();

    let db = state.lock_db()?;
    let repo = crate::db::DocumentRepository::new(&db);
    repo.replace_analysis(
        document_id,
        crate::db::ReplaceDocumentAnalysisRequest {
            page_count,
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
            json!({
                "id": anchor.id,
                "documentId": anchor.document_id,
                "page": anchor.page,
                "paragraph": anchor.paragraph,
                "textQuote": anchor.text_quote,
                "hash": anchor.hash,
            })
        })
        .collect::<Vec<_>>()
        .into())
}

fn list_chunks_json(state: &AppState, document_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::DocumentRepository::new(&db);
    let chunks = repo.list_chunks(document_id)?;
    Ok(chunks
        .into_iter()
        .map(|chunk| {
            json!({
                "id": chunk.id,
                "documentId": chunk.document_id,
                "sectionId": chunk.section_id,
                "anchorId": chunk.anchor_id,
                "chunkIndex": chunk.chunk_index,
                "pageStart": chunk.page_start,
                "pageEnd": chunk.page_end,
                "chunkKind": chunk.chunk_kind,
                "content": chunk.content,
                "metadata": chunk.metadata,
            })
        })
        .collect::<Vec<_>>()
        .into())
}

fn list_sections_json(state: &AppState, document_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::DocumentRepository::new(&db);
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

fn persist_cards_json(state: &AppState, request: Value) -> Result<Value> {
    let document_id = request["documentId"].as_str().unwrap_or("");
    let cards = match request["cards"].as_array() {
        Some(arr) => arr,
        None => {
            return Ok(json!({
                "createdCount": 0,
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
    let repo = crate::db::DocumentRepository::new(&db);

    let results = if document_ids.is_empty() {
        repo.search_chunks(&query, Some(limit))?
    } else {
        repo.search_chunks_scoped(&query, &document_ids, Some(limit))?
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
                    Some(ChunkEmbeddingRecord { chunk_id, vector })
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
    let document_repo = crate::db::DocumentRepository::new(&db);
    let vector_repo = VectorRepository::new(&db);

    let lexical_results = if document_ids.is_empty() {
        document_repo.search_chunks(&query, Some(limit * 3))?
    } else {
        document_repo.search_chunks_scoped(&query, &document_ids, Some(limit * 3))?
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
            json!({
                "id": result.id,
                "documentId": result.document_id,
                "sectionId": result.section_id,
                "anchorId": result.anchor_id,
                "chunkIndex": result.chunk_index,
                "pageStart": result.page_start,
                "pageEnd": result.page_end,
                "content": result.content,
                "snippet": result.snippet,
                "rrfScore": 0.0,
                "ftsRank": Value::Null,
                "vectorRank": Value::Null,
                "distance": Value::Null,
            })
        });

        let current_score = entry["rrfScore"].as_f64().unwrap_or(0.0);
        entry["rrfScore"] = json!(current_score + rrf_score);
        entry["ftsRank"] = json!(rank as i64);
    }

    for (index, result) in vector_results.into_iter().enumerate() {
        let rank = index + 1;
        let rrf_score = 1.0 / (rrf_k + rank as f64);
        let entry = merged.entry(result.chunk_id.clone()).or_insert_with(|| {
            let snippet = result.content.chars().take(240).collect::<String>();
            json!({
                "id": result.chunk_id,
                "documentId": result.document_id,
                "sectionId": result.section_id,
                "anchorId": result.anchor_id,
                "chunkIndex": result.chunk_index,
                "pageStart": result.page_start,
                "pageEnd": result.page_end,
                "content": result.content,
                "snippet": snippet,
                "rrfScore": 0.0,
                "ftsRank": Value::Null,
                "vectorRank": Value::Null,
                "distance": Value::Null,
            })
        });

        let current_score = entry["rrfScore"].as_f64().unwrap_or(0.0);
        entry["rrfScore"] = json!(current_score + rrf_score);
        entry["vectorRank"] = json!(rank as i64);
        entry["distance"] = json!(result.distance);
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

fn knowledge_node_to_json(node: KnowledgeNode) -> Value {
    json!({
        "id": node.id,
        "nodeType": node.node_type,
        "label": node.label,
        "aliases": serde_json::from_str::<Vec<String>>(&node.aliases_json).unwrap_or_default(),
        "sourceIds": serde_json::from_str::<Vec<String>>(&node.source_ids_json).unwrap_or_default(),
        "description": node.description,
        "metadata": serde_json::from_str::<Value>(&node.metadata_json).unwrap_or_else(|_| json!({})),
        "communityId": node.community_id,
        "parentCommunityId": node.parent_community_id,
        "degree": node.degree,
        "hasEmbedding": node.has_embedding,
        "createdAt": node.created_at,
        "updatedAt": node.updated_at,
    })
}

fn knowledge_edge_to_json(edge: KnowledgeEdge) -> Value {
    json!({
        "id": edge.id,
        "fromNodeId": edge.from_node_id,
        "toNodeId": edge.to_node_id,
        "relation": edge.relation,
        "confidence": edge.confidence,
        "sourceIds": serde_json::from_str::<Vec<String>>(&edge.source_ids_json).unwrap_or_default(),
        "inferred": edge.inferred,
        "metadata": serde_json::from_str::<Value>(&edge.metadata_json).unwrap_or_else(|_| json!({})),
        "createdAt": edge.created_at,
        "updatedAt": edge.updated_at,
    })
}

fn community_to_json(community: Community) -> Value {
    json!({
        "id": community.id,
        "level": community.level,
        "title": community.title,
        "memberNodeIds": serde_json::from_str::<Vec<String>>(&community.member_node_ids_json).unwrap_or_default(),
        "parentCommunityId": community.parent_community_id,
        "summary": community.summary_json.as_deref().and_then(|value| serde_json::from_str::<Value>(value).ok()),
        "nodeCount": community.node_count,
        "edgeCount": community.edge_count,
        "collapsed": community.collapsed,
        "createdAt": community.created_at,
        "updatedAt": community.updated_at,
    })
}

fn list_knowledge_nodes_json(state: &AppState) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    Ok(repo
        .list_nodes()?
        .into_iter()
        .map(knowledge_node_to_json)
        .collect::<Vec<_>>()
        .into())
}

fn create_knowledge_node_json(state: &AppState, request: Value) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    let node = repo.insert_node(InsertKnowledgeNodeRequest {
        id: request.get("id").and_then(Value::as_str).map(String::from),
        node_type: request
            .get("nodeType")
            .or_else(|| request.get("type"))
            .and_then(Value::as_str)
            .unwrap_or("concept")
            .to_string(),
        label: request
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        aliases_json: serde_json::to_string(&string_array_field(&request, "aliases"))?,
        source_ids_json: serde_json::to_string(&string_array_field(&request, "sourceIds"))?,
        description: request
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        metadata_json: request
            .get("metadata")
            .cloned()
            .unwrap_or_else(|| json!({}))
            .to_string(),
        community_id: request
            .get("communityId")
            .and_then(Value::as_str)
            .map(String::from),
        parent_community_id: request
            .get("parentCommunityId")
            .and_then(Value::as_str)
            .map(String::from),
        degree: request.get("degree").and_then(Value::as_i64).unwrap_or(0),
        has_embedding: request
            .get("hasEmbedding")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })?;
    Ok(knowledge_node_to_json(node))
}

fn find_knowledge_node_by_label_json(state: &AppState, request: Value) -> Result<Option<Value>> {
    let label = request
        .get("label")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if label.is_empty() {
        return Ok(None);
    }
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    Ok(repo.find_node_by_label(label)?.map(knowledge_node_to_json))
}

fn update_knowledge_node_json(
    state: &AppState,
    node_id: &str,
    request: Value,
) -> Result<Option<Value>> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    let updates = UpdateKnowledgeNodeRequest {
        node_type: request
            .get("nodeType")
            .and_then(Value::as_str)
            .map(String::from),
        label: request
            .get("label")
            .and_then(Value::as_str)
            .map(String::from),
        aliases_json: request
            .get("aliases")
            .map(|_| serde_json::to_string(&string_array_field(&request, "aliases")))
            .transpose()?,
        source_ids_json: request
            .get("sourceIds")
            .map(|_| serde_json::to_string(&string_array_field(&request, "sourceIds")))
            .transpose()?,
        description: request
            .get("description")
            .and_then(Value::as_str)
            .map(String::from),
        metadata_json: request.get("metadata").map(Value::to_string),
        community_id: optional_string_patch(&request, "communityId"),
        parent_community_id: optional_string_patch(&request, "parentCommunityId"),
        degree: request.get("degree").and_then(Value::as_i64),
        has_embedding: request.get("hasEmbedding").and_then(Value::as_bool),
    };
    Ok(repo
        .update_node(node_id, updates)?
        .map(knowledge_node_to_json))
}

fn list_knowledge_edges_json(state: &AppState) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    Ok(repo
        .list_all_edges()?
        .into_iter()
        .map(knowledge_edge_to_json)
        .collect::<Vec<_>>()
        .into())
}

fn create_knowledge_edge_json(state: &AppState, request: Value) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    let edge = repo.insert_edge(InsertKnowledgeEdgeRequest {
        id: request.get("id").and_then(Value::as_str).map(String::from),
        from_node_id: request
            .get("fromNodeId")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        to_node_id: request
            .get("toNodeId")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        relation: request
            .get("relation")
            .and_then(Value::as_str)
            .unwrap_or("related_to")
            .to_string(),
        confidence: request
            .get("confidence")
            .and_then(Value::as_f64)
            .unwrap_or(0.5),
        source_ids_json: serde_json::to_string(&string_array_field(&request, "sourceIds"))?,
        inferred: request
            .get("inferred")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        metadata_json: request
            .get("metadata")
            .cloned()
            .unwrap_or_else(|| json!({}))
            .to_string(),
    })?;
    Ok(knowledge_edge_to_json(edge))
}

fn update_knowledge_edge_json(
    state: &AppState,
    edge_id: &str,
    request: Value,
) -> Result<Option<Value>> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    let updates = UpdateKnowledgeEdgeRequest {
        from_node_id: request
            .get("fromNodeId")
            .and_then(Value::as_str)
            .map(String::from),
        to_node_id: request
            .get("toNodeId")
            .and_then(Value::as_str)
            .map(String::from),
        relation: request
            .get("relation")
            .and_then(Value::as_str)
            .map(String::from),
        confidence: request.get("confidence").and_then(Value::as_f64),
        source_ids_json: request
            .get("sourceIds")
            .map(|_| serde_json::to_string(&string_array_field(&request, "sourceIds")))
            .transpose()?,
        inferred: request.get("inferred").and_then(Value::as_bool),
        metadata_json: request.get("metadata").map(Value::to_string),
    };
    Ok(repo
        .update_edge(edge_id, updates)?
        .map(knowledge_edge_to_json))
}

fn delete_knowledge_edge_json(state: &AppState, edge_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    repo.delete_edge(edge_id)?;
    Ok(json!({"ok": true}))
}

fn create_community_json(state: &AppState, request: Value) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = CommunityRepository::new(&db);
    let community = repo.create_community(crate::db::NewCommunity {
        id: request.get("id").and_then(Value::as_str).map(String::from),
        level: request.get("level").and_then(Value::as_i64).unwrap_or(1) as i32,
        title: request
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        member_node_ids_json: serde_json::to_string(&string_array_field(
            &request,
            "memberNodeIds",
        ))?,
        parent_community_id: request
            .get("parentCommunityId")
            .and_then(Value::as_str)
            .map(String::from),
        summary_json: request.get("summary").map(Value::to_string),
        node_count: request
            .get("nodeCount")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        edge_count: request
            .get("edgeCount")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        collapsed: request
            .get("collapsed")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })?;
    Ok(community_to_json(community))
}

fn list_communities_json(state: &AppState, request: Value) -> Result<Value> {
    let level = request
        .get("level")
        .and_then(Value::as_i64)
        .map(|value| value as i32);
    let db = state.lock_db()?;
    let repo = CommunityRepository::new(&db);
    Ok(repo
        .list_communities(level)?
        .into_iter()
        .map(community_to_json)
        .collect::<Vec<_>>()
        .into())
}

fn get_community_summary_json(state: &AppState, community_id: &str) -> Result<Option<Value>> {
    let db = state.lock_db()?;
    let repo = CommunityRepository::new(&db);
    Ok(repo
        .get_community_summary(community_id)?
        .and_then(|summary| serde_json::from_str::<Value>(&summary).ok()))
}

fn save_entity_embedding_json(state: &AppState, request: Value) -> Result<Value> {
    let node_id = request.get("nodeId").and_then(Value::as_str).unwrap_or("");
    let model = request
        .get("embeddingModel")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let vector = float_array_field(&request, "vector");
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    repo.save_entity_embedding(node_id, model, &vector)?;
    Ok(json!({"ok": true, "nodeId": node_id, "storedDimensions": vector.len()}))
}

fn get_entity_embedding_json(state: &AppState, node_id: &str) -> Result<Option<Value>> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    Ok(repo.get_entity_embedding(node_id)?.map(|record| {
        json!({
            "nodeId": record.node_id,
            "embeddingModel": record.embedding_model,
            "vector": serde_json::from_str::<Vec<f32>>(&record.vector_json).unwrap_or_default(),
            "updatedAt": record.updated_at,
        })
    }))
}

fn vector_search_entity_json(state: &AppState, request: Value) -> Result<Value> {
    let query_embedding = float_array_field(&request, "queryEmbedding");
    let top_k = request.get("topK").and_then(Value::as_u64).unwrap_or(10) as usize;
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    Ok(repo
        .vector_search_entity(&query_embedding, top_k)?
        .into_iter()
        .map(|item| {
            json!({
                "nodeId": item.node_id,
                "label": item.label,
                "nodeType": item.node_type,
                "description": item.description,
                "similarity": item.similarity,
            })
        })
        .collect::<Vec<_>>()
        .into())
}

fn get_graph_stats_json(state: &AppState) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    let stats = repo.get_graph_stats()?;
    Ok(json!({
        "totalNodes": stats.total_nodes,
        "totalEdges": stats.total_edges,
        "totalCommunities": stats.total_communities,
        "nodeTypeDistribution": stats.node_type_distribution,
        "lastBuildRun": stats.last_build_run.map(|run| json!({
            "id": run.id,
            "runId": run.run_id,
            "scopeDescription": run.scope_description,
            "documentIds": serde_json::from_str::<Vec<String>>(&run.document_ids_json).unwrap_or_default(),
            "nodesCreated": run.nodes_created,
            "edgesCreated": run.edges_created,
            "nodesMerged": run.nodes_merged,
            "communitiesDetected": run.communities_detected,
            "status": run.status,
            "errorMessage": run.error_message,
            "currentStage": run.current_stage,
            "createdAt": run.created_at,
            "updatedAt": run.updated_at,
        })),
    }))
}

fn string_array_field(request: &Value, key: &str) -> Vec<String> {
    request
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn float_array_field(request: &Value, key: &str) -> Vec<f32> {
    request
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_f64)
                .map(|item| item as f32)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn optional_string_patch(request: &Value, key: &str) -> Option<Option<String>> {
    request
        .get(key)
        .map(|value| value.as_str().map(String::from))
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
