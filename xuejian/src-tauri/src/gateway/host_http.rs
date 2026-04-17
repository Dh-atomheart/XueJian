use std::{
    net::TcpListener,
    sync::Arc,
};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::app_state::AppState;
use crate::db::{ApiConfig, CreateCardCandidateRequest, SettingsRepository};
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
    pub async fn start(&self) -> Result<u16> {
        let state = self.state.clone();
        let listener = TcpListener::bind(format!("127.0.0.1:{}", self.port))?;
        let actual_port = listener.local_addr()?.port();

        log::info!("Host HTTP gateway listening on 127.0.0.1:{actual_port}");

        tokio::spawn(async move {
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

        // ── ToolGateway ───────────────────────────────────
        ("GET", path) if path.starts_with("/tool-gateway/documents/") => {
            let document_id = path.strip_prefix("/tool-gateway/documents/").unwrap_or("");
            match get_document_json(&app_state, document_id) {
                Ok(Some(payload)) => GatewayResponse::Ok(payload.to_string()),
                Ok(None) => GatewayResponse::NotFound(json!({"error": "not_found"}).to_string()),
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
        "name": config.name,
        "baseUrl": config.base_url,
        "model": config.model,
        "budgetLimit": config.budget_limit,
        "isEnabled": config.is_enabled,
        "isDefault": config.is_default,
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
            "chunkIndex": chunk.chunk_index,
            "pageStart": chunk.page_start,
            "pageEnd": chunk.page_end,
            "content": chunk.content,
            "metadata": chunk.metadata,
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
            anchor_id,
            front,
            back,
            tags,
            confidence,
            dedupe_key,
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
