use std::{
    ffi::OsString,
    net::TcpListener,
    path::PathBuf,
    process::{Child, Command, Stdio},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;
use tokio::time::sleep;

use crate::gateway::ORCHESTRATION_PROTOCOL_VERSION;

const STARTUP_BACKOFF_MS: [u64; 8] = [100, 200, 350, 600, 900, 1300, 1800, 2500];

#[derive(Debug, thiserror::Error)]
pub enum ServiceError {
    #[error("Python orchestration script not found: {0}")]
    ScriptMissing(PathBuf),
    #[error("No usable Python runtime was found for the orchestration service")]
    PythonRuntimeNotFound,
    #[error("Orchestration service failed to start: {0}")]
    Startup(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
}

pub type Result<T> = std::result::Result<T, ServiceError>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceHealthStatus {
    pub status: String,
    pub endpoint: Option<String>,
    pub protocol_version: Option<String>,
    pub service_version: Option<String>,
    pub pid: Option<u32>,
    pub started_at: Option<String>,
    pub checked_at: String,
    pub protocol_compatible: bool,
    pub error_message: Option<String>,
}

impl ServiceHealthStatus {
    fn stopped(error_message: Option<String>) -> Self {
        Self {
            status: "stopped".to_string(),
            endpoint: None,
            protocol_version: None,
            service_version: None,
            pid: None,
            started_at: None,
            checked_at: chrono::Utc::now().to_rfc3339(),
            protocol_compatible: false,
            error_message,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HealthPayload {
    status: String,
    protocol_version: String,
    service_version: String,
    pid: u32,
    uptime_seconds: f64,
}

#[derive(Debug, Clone)]
struct PythonCommandSpec {
    executable: OsString,
    base_args: Vec<OsString>,
}

impl PythonCommandSpec {
    fn new(executable: impl Into<OsString>) -> Self {
        Self {
            executable: executable.into(),
            base_args: Vec::new(),
        }
    }

    fn with_args(
        executable: impl Into<OsString>,
        base_args: impl IntoIterator<Item = impl Into<OsString>>,
    ) -> Self {
        Self {
            executable: executable.into(),
            base_args: base_args.into_iter().map(Into::into).collect(),
        }
    }
}

pub struct OrchestrationService {
    inner: Mutex<OrchestrationServiceManager>,
}

impl OrchestrationService {
    pub fn new(app_handle: &AppHandle, host_gateway_port: Option<u16>) -> Result<Self> {
        let script_path = resolve_script_path(app_handle)?;
        Ok(Self {
            inner: Mutex::new(OrchestrationServiceManager::new(script_path, host_gateway_port)),
        })
    }

    pub async fn start(&self) -> Result<ServiceHealthStatus> {
        self.inner.lock().await.start().await
    }

    pub async fn health(&self) -> Result<ServiceHealthStatus> {
        self.inner.lock().await.health().await
    }

    pub async fn restart(&self) -> Result<ServiceHealthStatus> {
        self.inner.lock().await.restart().await
    }

    pub async fn stop(&self) -> Result<()> {
        self.inner.lock().await.stop()
    }
}

struct OrchestrationServiceManager {
    script_path: PathBuf,
    host_gateway_port: Option<u16>,
    process: Option<Child>,
    endpoint: Option<String>,
    started_at: Option<String>,
    last_health: ServiceHealthStatus,
}

impl OrchestrationServiceManager {
    fn new(script_path: PathBuf, host_gateway_port: Option<u16>) -> Self {
        Self {
            script_path,
            host_gateway_port,
            process: None,
            endpoint: None,
            started_at: None,
            last_health: ServiceHealthStatus::stopped(None),
        }
    }

    async fn start(&mut self) -> Result<ServiceHealthStatus> {
        self.refresh_process_state()?;

        if self.process.is_some() {
            return self.health().await;
        }

        let python = detect_python_command()?;
        let port = allocate_local_port()?;
        let endpoint = format!("http://127.0.0.1:{port}");
        let started_at = chrono::Utc::now().to_rfc3339();

        let mut command = Command::new(&python.executable);
        command
            .args(&python.base_args)
            .arg(&self.script_path)
            .arg("--port")
            .arg(port.to_string());

        if let Some(host_port) = self.host_gateway_port {
            command.arg("--host-port").arg(host_port.to_string());
        }

        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        let child = command.spawn()?;
        self.process = Some(child);
        self.endpoint = Some(endpoint.clone());
        self.started_at = Some(started_at);
        self.last_health = ServiceHealthStatus {
            status: "starting".to_string(),
            endpoint: Some(endpoint.clone()),
            protocol_version: None,
            service_version: None,
            pid: self.process.as_ref().map(Child::id),
            started_at: self.started_at.clone(),
            checked_at: chrono::Utc::now().to_rfc3339(),
            protocol_compatible: false,
            error_message: None,
        };

        let mut last_error = None;

        for backoff_ms in STARTUP_BACKOFF_MS {
            match fetch_health(&endpoint).await {
                Ok(payload) => {
                    let status = self.status_from_payload(payload);
                    self.last_health = status.clone();
                    return Ok(status);
                }
                Err(error) => {
                    last_error = Some(error.to_string());
                    self.refresh_process_state()?;

                    if self.process.is_none() {
                        break;
                    }

                    sleep(Duration::from_millis(backoff_ms)).await;
                }
            }
        }

        let error = last_error.unwrap_or_else(|| "health check timed out".to_string());
        self.stop()?;
        self.last_health = ServiceHealthStatus::stopped(Some(error.clone()));
        Err(ServiceError::Startup(error))
    }

    async fn health(&mut self) -> Result<ServiceHealthStatus> {
        self.refresh_process_state()?;

        let Some(endpoint) = self.endpoint.clone() else {
            return Ok(self.last_health.clone());
        };

        match fetch_health(&endpoint).await {
            Ok(payload) => {
                let status = self.status_from_payload(payload);
                self.last_health = status.clone();
                Ok(status)
            }
            Err(error) => {
                self.refresh_process_state()?;

                if self.process.is_none() {
                    return Ok(self.last_health.clone());
                }

                if self.last_health.status == "starting" {
                    let starting = ServiceHealthStatus {
                        checked_at: chrono::Utc::now().to_rfc3339(),
                        error_message: Some(error.to_string()),
                        ..self.last_health.clone()
                    };
                    self.last_health = starting.clone();
                    return Ok(starting);
                }

                let degraded = ServiceHealthStatus {
                    status: "degraded".to_string(),
                    endpoint: Some(endpoint),
                    protocol_version: None,
                    service_version: None,
                    pid: self.process.as_ref().map(Child::id),
                    started_at: self.started_at.clone(),
                    checked_at: chrono::Utc::now().to_rfc3339(),
                    protocol_compatible: false,
                    error_message: Some(error.to_string()),
                };
                self.last_health = degraded.clone();
                Ok(degraded)
            }
        }
    }

    async fn restart(&mut self) -> Result<ServiceHealthStatus> {
        self.stop()?;
        self.start().await
    }

    fn stop(&mut self) -> Result<()> {
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }

        self.endpoint = None;
        self.started_at = None;
        self.last_health = ServiceHealthStatus::stopped(None);
        Ok(())
    }

    fn refresh_process_state(&mut self) -> Result<()> {
        let Some(child) = self.process.as_mut() else {
            return Ok(());
        };

        if let Some(exit_status) = child.try_wait()? {
            self.process = None;
            self.endpoint = None;
            self.started_at = None;
            self.last_health = ServiceHealthStatus::stopped(Some(format!(
                "Python orchestration service exited unexpectedly: {exit_status}"
            )));
        }

        Ok(())
    }

    fn status_from_payload(&self, payload: HealthPayload) -> ServiceHealthStatus {
        let protocol_compatible = payload.protocol_version == ORCHESTRATION_PROTOCOL_VERSION;
        let error_message = if protocol_compatible {
            None
        } else {
            Some(format!(
                "Protocol mismatch: host expects {}, service reports {}",
                ORCHESTRATION_PROTOCOL_VERSION, payload.protocol_version
            ))
        };

        ServiceHealthStatus {
            status: if protocol_compatible {
                payload.status
            } else {
                "degraded".to_string()
            },
            endpoint: self.endpoint.clone(),
            protocol_version: Some(payload.protocol_version),
            service_version: Some(payload.service_version),
            pid: Some(payload.pid),
            started_at: self.started_at.clone(),
            checked_at: chrono::Utc::now().to_rfc3339(),
            protocol_compatible,
            error_message,
        }
    }
}

async fn fetch_health(endpoint: &str) -> Result<HealthPayload> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(2))
        .build()?;
    let response = client.get(format!("{endpoint}/health")).send().await?;
    response
        .error_for_status()?
        .json::<HealthPayload>()
        .await
        .map_err(Into::into)
}

fn allocate_local_port() -> Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn resolve_script_path(app_handle: &AppHandle) -> Result<PathBuf> {
    if let Ok(custom_path) = std::env::var("XUEJIAN_ORCHESTRATION_SCRIPT") {
        let path = PathBuf::from(custom_path);
        if path.exists() {
            return Ok(path);
        }
        return Err(ServiceError::ScriptMissing(path));
    }

    let dev_path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../orchestration_service/main.py");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let bundled_path = resource_dir.join("orchestration_service/main.py");
        if bundled_path.exists() {
            return Ok(bundled_path);
        }
    }

    Err(ServiceError::ScriptMissing(dev_path))
}

fn detect_python_command() -> Result<PythonCommandSpec> {
    let mut candidates = Vec::new();

    if let Ok(custom_python) = std::env::var("XUEJIAN_ORCHESTRATION_PYTHON") {
        candidates.push(PythonCommandSpec::new(custom_python));
    }

    candidates.push(PythonCommandSpec::new("python3"));
    candidates.push(PythonCommandSpec::new("python"));

    if cfg!(target_os = "windows") {
        candidates.push(PythonCommandSpec::with_args("py", ["-3"]));
    }

    for candidate in candidates {
        let mut command = Command::new(&candidate.executable);
        let status = command
            .args(&candidate.base_args)
            .arg("--version")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();

        if let Ok(status) = status {
            if status.success() {
                return Ok(candidate);
            }
        }
    }

    Err(ServiceError::PythonRuntimeNotFound)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn health_roundtrip_succeeds() {
        let script_path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../orchestration_service/main.py");
        let mut manager = OrchestrationServiceManager::new(script_path, None);

        let health = manager.start().await.expect("start service");
        assert_eq!(health.status, "healthy");
        assert!(health.protocol_compatible);
        assert_eq!(
            health.protocol_version.as_deref(),
            Some(ORCHESTRATION_PROTOCOL_VERSION)
        );

        manager.stop().expect("stop service");
    }
}
