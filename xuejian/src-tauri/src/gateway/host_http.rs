use std::{
    net::TcpListener,
    sync::Arc,
};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::app_state::AppState;
use crate::db::{
    ApiConfig, ChunkEmbeddingRecord, CreateCardCandidateRequest, EmbeddingProfile,
    SettingsRepository, VectorRepository,
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

fn handle_connection(
    mut stream: std::net::TcpStream,
    state: &HostGatewayState,
) {
    use std::io::{BufRead, BufReader, Write};

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
    let response_bytes = format!(
        "HTTP/1.1 {} OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        response.status_code(),
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
        ("GET", "/model-gateway/configs") => {
            match list_api_configs_json(&app_state) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("GET", path) if path.starts_with("/model-gateway/configs/") => {
            let id = path.strip_prefix("/model-gateway/configs/").unwrap_or("");
            match get_api_config_json(&app_state, id) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("GET", path) if path.starts_with("/model-gateway/api-key/") => {
            let config_id = path.strip_prefix("/model-gateway/api-key/").unwrap_or("");
            match get_api_key_json(&app_state, config_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("GET", "/model-gateway/embedding-profiles") => {
            match list_embedding_profiles_json(&app_state) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("GET", "/model-gateway/embedding-profiles/active") => {
            match get_active_embedding_profile_json(&app_state) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        // ── ToolGateway ───────────────────────────────────
        ("GET", path) if path.starts_with("/tool-gateway/documents/") => {
            let document_id = path.strip_prefix("/tool-gateway/documents/").unwrap_or("");
            // Check if this is a sub-route (status update or analysis)
            if document_id.contains("/status") || document_id.contains("/analysis") {
                GatewayResponse::NotFound(json!({"error": "use POST for status/analysis"}).to_string())
            } else {
                match get_document_json(&app_state, document_id) {
                    Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                    Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                    Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
                }
            }
        }

        ("POST", path) if path.starts_with("/tool-gateway/documents/") && path.ends_with("/status") => {
            let document_id = path
                .strip_prefix("/tool-gateway/documents/")
                .and_then(|p| p.strip_suffix("/status"))
                .unwrap_or("");
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => return GatewayResponse::BadRequest(json!({"error": error.to_string()}).to_string()),
            };
            match update_document_status_json(&app_state, document_id, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("POST", path) if path.starts_with("/tool-gateway/documents/") && path.ends_with("/analysis") => {
            let document_id = path
                .strip_prefix("/tool-gateway/documents/")
                .and_then(|p| p.strip_suffix("/analysis"))
                .unwrap_or("");
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => return GatewayResponse::BadRequest(json!({"error": error.to_string()}).to_string()),
            };
            match save_document_analysis_json(&app_state, document_id, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/anchors?documentId=") => {
            let document_id = path.strip_prefix("/tool-gateway/anchors?documentId=").unwrap_or("");
            match list_anchors_json(&app_state, document_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/chunks?documentId=") => {
            let document_id = path.strip_prefix("/tool-gateway/chunks?documentId=").unwrap_or("");
            match list_chunks_json(&app_state, document_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/sections?documentId=") => {
            let document_id = path.strip_prefix("/tool-gateway/sections?documentId=").unwrap_or("");
            match list_sections_json(&app_state, document_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("POST", "/tool-gateway/candidates") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => return GatewayResponse::BadRequest(json!({"error": error.to_string()}).to_string()),
            };
            match persist_candidates_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/candidates/count?runId=") => {
            let run_id = path.strip_prefix("/tool-gateway/candidates/count?runId=").unwrap_or("");
            match count_candidates_json(&app_state, run_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        // ── ToolGateway: knowledge search ─────────────────
        ("POST", "/tool-gateway/search-chunks") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => return GatewayResponse::BadRequest(json!({"error": error.to_string()}).to_string()),
            };
            match search_chunks_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("POST", "/tool-gateway/embeddings/chunks") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => return GatewayResponse::BadRequest(json!({"error": error.to_string()}).to_string()),
            };
            match persist_chunk_embeddings_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("POST", "/tool-gateway/search-hybrid") => {
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => return GatewayResponse::BadRequest(json!({"error": error.to_string()}).to_string()),
            };
            match search_hybrid_json(&app_state, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        // ── ToolGateway: cards (for export) ───────────────
        ("GET", path) if path.starts_with("/tool-gateway/cards") => {
            match list_cards_json(&app_state, path) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        // ── ToolGateway: run status & checkpoint ──────────
        ("GET", path) if path.starts_with("/tool-gateway/runs/") && path.ends_with("/checkpoint") => {
            let run_id = path
                .strip_prefix("/tool-gateway/runs/")
                .and_then(|p| p.strip_suffix("/checkpoint"))
                .unwrap_or("");
            match get_latest_checkpoint_json(&app_state, run_id) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "no_checkpoint"}).to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("POST", path) if path.starts_with("/tool-gateway/runs/") && path.ends_with("/checkpoint") => {
            let run_id = path
                .strip_prefix("/tool-gateway/runs/")
                .and_then(|p| p.strip_suffix("/checkpoint"))
                .unwrap_or("");
            let request: Value = match serde_json::from_slice(body) {
                Ok(v) => v,
                Err(error) => return GatewayResponse::BadRequest(json!({"error": error.to_string()}).to_string()),
            };
            match save_checkpoint_json(&app_state, run_id, request) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("POST", path) if path.starts_with("/tool-gateway/runs/") && path.ends_with("/cancel") => {
            let run_id = path
                .strip_prefix("/tool-gateway/runs/")
                .and_then(|p| p.strip_suffix("/cancel"))
                .unwrap_or("");
            match cancel_run_json(&app_state, run_id) {
                Ok(payload) => GatewayResponse::Ok(payload.to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
            }
        }

        ("GET", path) if path.starts_with("/tool-gateway/runs/") => {
            let run_id = path.strip_prefix("/tool-gateway/runs/").unwrap_or("");
            match get_run_json(&app_state, run_id) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
                Err(error) => GatewayResponse::InternalError(json!({"error": error.to_string()}).to_string()),
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
    Ok(configs.into_iter().map(api_config_to_json).collect::<Vec<_>>().into())
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
    let db = state.lock_db()?;
    let repo = VectorRepository::new(&db);
    Ok(repo.get_active_embedding_profile()?.map(embedding_profile_to_json))
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

fn update_document_status_json(state: &AppState, document_id: &str, request: Value) -> Result<Value> {
    let status = request["status"].as_str().unwrap_or("unknown");
    let db = state.lock_db()?;
    let repo = crate::db::DocumentRepository::new(&db);
    repo.update_status(document_id, status)?;
    Ok(json!({"ok": true, "status": status}))
}

fn save_document_analysis_json(state: &AppState, document_id: &str, request: Value) -> Result<Value> {
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
            hierarchy_path: a["hierarchyPath"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()),
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
            hierarchy_path: s["hierarchyPath"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()),
            page_start: s["pageStart"].as_i64().map(|v| v as i32),
            page_end: s["pageEnd"].as_i64().map(|v| v as i32),
            anchor_start_id: s["anchorStartId"].as_str().map(String::from),
            anchor_end_id: s["anchorEndId"].as_str().map(String::from),
            content: s["content"].as_str().unwrap_or("").to_string(),
            token_count: s["tokenCount"].as_i64().map(|v| v as i32),
            metadata: if s["metadata"].is_null() { None } else { Some(s["metadata"].clone()) },
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
            metadata: if c["metadata"].is_null() { None } else { Some(c["metadata"].clone()) },
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
    Ok(anchors.into_iter().map(|anchor| {
        json!({
            "id": anchor.id,
            "documentId": anchor.document_id,
            "page": anchor.page,
            "paragraph": anchor.paragraph,
            "textQuote": anchor.text_quote,
            "hash": anchor.hash,
        })
    }).collect::<Vec<_>>().into())
}

fn list_chunks_json(state: &AppState, document_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::DocumentRepository::new(&db);
    let chunks = repo.list_chunks(document_id)?;
    Ok(chunks.into_iter().map(|chunk| {
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
    }).collect::<Vec<_>>().into())
}

fn list_sections_json(state: &AppState, document_id: &str) -> Result<Value> {
    let db = state.lock_db()?;
    let repo = crate::db::DocumentRepository::new(&db);
    let sections = repo.list_sections(document_id)?;
    Ok(sections.into_iter().map(|section| {
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
    }).collect::<Vec<_>>().into())
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
        let tags = candidate["tags"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();
        let confidence = candidate["confidence"].as_f64().unwrap_or(0.0);
        let dedupe_key = candidate["dedupeKey"].as_str().unwrap_or("").to_string();

        requests.push(CreateCardCandidateRequest {
            workflow_run_id: Some(run_id.to_string()),
            document_id: document_id.to_string(),
            section_id: candidate["sectionId"].as_str().map(String::from),
            anchor_id,
            title: candidate["title"].as_str().map(String::from),
            card_type: candidate["cardType"].as_str().map(String::from),
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
            source_chunk_ids: candidate["sourceChunkIds"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()),
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
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let db = state.lock_db()?;
    let repo = crate::db::DocumentRepository::new(&db);

    let results = if document_ids.is_empty() {
        repo.search_chunks(&query, Some(limit))?
    } else {
        repo.search_chunks_scoped(&query, &document_ids, Some(limit))?
    };

    Ok(results.into_iter().map(|r| {
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
    }).collect::<Vec<_>>().into())
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
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
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
            if document_ids.is_empty() { None } else { Some(document_ids.as_slice()) },
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

/// Parse simple key=value query string (no URL decoding needed for our use).
fn qs_param<'a>(qs: &'a str, key: &str) -> Option<&'a str> {
    qs.split('&').find_map(|pair| {
        let mut parts = pair.splitn(2, '=');
        let k = parts.next()?;
        if k == key { parts.next() } else { None }
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
    Ok(cards.into_iter().map(|c| {
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
    }).collect::<Vec<_>>().into())
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
