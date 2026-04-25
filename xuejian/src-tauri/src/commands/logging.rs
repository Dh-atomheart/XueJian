use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::CommandResult;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendLogEvent {
    pub level: String,
    pub scope: String,
    pub message: String,
    pub request_id: Option<String>,
    pub command: Option<String>,
    pub duration_ms: Option<f64>,
    pub error_code: Option<String>,
    pub details: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SanitizedFrontendLogEvent<'a> {
    source: &'static str,
    scope: &'a str,
    message: &'a str,
    request_id: Option<&'a str>,
    command: Option<&'a str>,
    duration_ms: Option<f64>,
    error_code: Option<&'a str>,
    details: Option<Value>,
}

#[tauri::command]
pub fn log_frontend_event(event: FrontendLogEvent) -> CommandResult<()> {
    let payload = SanitizedFrontendLogEvent {
        source: "frontend",
        scope: &event.scope,
        message: &event.message,
        request_id: event.request_id.as_deref(),
        command: event.command.as_deref(),
        duration_ms: event.duration_ms,
        error_code: event.error_code.as_deref(),
        details: event.details.as_ref().map(sanitize_value),
    };
    let serialized = serde_json::to_string(&payload)
        .unwrap_or_else(|_| format!(r#"{{"source":"frontend","message":"{}"}}"#, event.message));

    match event.level.as_str() {
        "debug" => log::debug!(target: "frontend", "{serialized}"),
        "info" => log::info!(target: "frontend", "{serialized}"),
        "warn" | "warning" => log::warn!(target: "frontend", "{serialized}"),
        "error" => log::error!(target: "frontend", "{serialized}"),
        _ => log::info!(target: "frontend", "{serialized}"),
    }
    Ok(())
}

fn sanitize_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(key, value)| {
                    if is_sensitive_key(key) {
                        (key.clone(), Value::String("[redacted]".to_string()))
                    } else {
                        (key.clone(), sanitize_value(value))
                    }
                })
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().take(20).map(sanitize_value).collect()),
        Value::String(value) => {
            if value.len() > 1000 {
                Value::String(format!("{}...[truncated]", &value[..1000]))
            } else {
                Value::String(value.clone())
            }
        }
        _ => value.clone(),
    }
}

fn is_sensitive_key(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase();
    normalized.contains("key")
        || normalized.contains("secret")
        || normalized.contains("token")
        || normalized.contains("authorization")
        || normalized.contains("password")
        || normalized.contains("credential")
}
