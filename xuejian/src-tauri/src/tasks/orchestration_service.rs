use std::{
    ffi::OsString,
    io::Read,
    net::TcpListener,
    path::PathBuf,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;
use tokio::time::sleep;

use crate::gateway::ORCHESTRATION_PROTOCOL_VERSION;

const STARTUP_BACKOFF_MS: [u64; 8] = [100, 200, 350, 600, 900, 1300, 1800, 2500];
const DEPENDENCY_PROBE_CACHE_TTL: Duration = Duration::from_secs(60 * 60);
const DEPENDENCY_PROBE_TIMEOUT: Duration = Duration::from_secs(3);

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
    pub host_gateway_configured: bool,
    pub host_gateway_endpoint: Option<String>,
    pub dependencies_ready: bool,
    pub missing_dependencies: Vec<String>,
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
            host_gateway_configured: false,
            host_gateway_endpoint: None,
            dependencies_ready: true,
            missing_dependencies: Vec::new(),
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
    pub fn new(
        app_handle: &AppHandle,
        host_gateway_port: Option<u16>,
        host_gateway_token: Option<String>,
    ) -> Result<Self> {
        let script_path = resolve_script_path(app_handle)?;
        let log_dir = resolve_log_dir(app_handle);
        if let Some(log_dir) = &log_dir {
            if let Err(error) = std::fs::create_dir_all(log_dir) {
                log::warn!(
                    "Failed to create app log directory {:?}: {}",
                    log_dir,
                    error
                );
            }
        }
        Ok(Self {
            inner: Mutex::new(OrchestrationServiceManager::new(
                script_path,
                log_dir,
                host_gateway_port,
                host_gateway_token,
            )),
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
        self.inner.lock().await.stop().await
    }
}

struct OrchestrationServiceManager {
    script_path: PathBuf,
    log_dir: Option<PathBuf>,
    host_gateway_port: Option<u16>,
    host_gateway_token: Option<String>,
    python: Option<PythonCommandSpec>,
    process: Option<Child>,
    endpoint: Option<String>,
    started_at: Option<String>,
    last_health: ServiceHealthStatus,
    dependency_probe_cache: Option<(std::time::Instant, DependencyProbe)>,
}

impl OrchestrationServiceManager {
    fn new(
        script_path: PathBuf,
        log_dir: Option<PathBuf>,
        host_gateway_port: Option<u16>,
        host_gateway_token: Option<String>,
    ) -> Self {
        Self {
            script_path,
            log_dir,
            host_gateway_port,
            host_gateway_token,
            python: None,
            process: None,
            endpoint: None,
            started_at: None,
            last_health: ServiceHealthStatus::stopped(None),
            dependency_probe_cache: None,
        }
    }

    fn stopped_status(&mut self, error_message: Option<String>) -> ServiceHealthStatus {
        let dependency_probe = self.probe_python_dependencies();
        ServiceHealthStatus {
            host_gateway_configured: self.host_gateway_port.is_some(),
            host_gateway_endpoint: self
                .host_gateway_port
                .map(|port| format!("http://127.0.0.1:{port}")),
            dependencies_ready: dependency_probe.missing_dependencies.is_empty(),
            missing_dependencies: dependency_probe.missing_dependencies,
            ..ServiceHealthStatus::stopped(error_message)
        }
    }

    async fn start(&mut self) -> Result<ServiceHealthStatus> {
        self.refresh_process_state()?;

        if self.process.is_some() {
            return self.health().await;
        }

        let python = detect_python_command()?;
        self.python = Some(python.clone());
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

        if let Some(log_dir) = &self.log_dir {
            command.env("XUEJIAN_LOG_DIR", log_dir);
        }
        if let Some(token) = &self.host_gateway_token {
            command.env("XUEJIAN_HOST_GATEWAY_TOKEN", token);
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
            host_gateway_configured: self.host_gateway_port.is_some(),
            host_gateway_endpoint: self
                .host_gateway_port
                .map(|port| format!("http://127.0.0.1:{port}")),
            dependencies_ready: true,
            missing_dependencies: Vec::new(),
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
        self.stop().await?;
        self.last_health = self.stopped_status(Some(error.clone()));
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
                    host_gateway_configured: self.host_gateway_port.is_some(),
                    host_gateway_endpoint: self
                        .host_gateway_port
                        .map(|port| format!("http://127.0.0.1:{port}")),
                    dependencies_ready: true,
                    missing_dependencies: Vec::new(),
                };
                self.last_health = degraded.clone();
                Ok(degraded)
            }
        }
    }

    async fn restart(&mut self) -> Result<ServiceHealthStatus> {
        self.stop().await?;
        self.start().await
    }

    async fn stop(&mut self) -> Result<()> {
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
            // Offload the blocking wait() to avoid freezing the Tokio runtime.
            // Add a 5-second timeout as a safety measure.
            let _ = tokio::time::timeout(
                Duration::from_secs(5),
                tokio::task::spawn_blocking(move || child.wait()),
            )
            .await;
        }

        self.endpoint = None;
        self.started_at = None;
        self.last_health = self.stopped_status(None);
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
            self.last_health = self.stopped_status(Some(format!(
                "Python orchestration service exited unexpectedly: {exit_status}"
            )));
        }

        Ok(())
    }

    fn status_from_payload(&mut self, payload: HealthPayload) -> ServiceHealthStatus {
        let protocol_compatible = payload.protocol_version == ORCHESTRATION_PROTOCOL_VERSION;
        let dependency_probe = self.probe_python_dependencies();
        let host_gateway_configured = self.host_gateway_port.is_some();
        let host_gateway_endpoint = self
            .host_gateway_port
            .map(|port| format!("http://127.0.0.1:{port}"));
        let mut issues = Vec::new();

        if !protocol_compatible {
            issues.push(format!(
                "Protocol mismatch: host expects {}, service reports {}",
                ORCHESTRATION_PROTOCOL_VERSION, payload.protocol_version
            ));
        }

        if !host_gateway_configured {
            issues.push(
                "Host gateway port is not configured; orchestration workflow endpoints will return 503"
                    .to_string(),
            );
        }

        if !dependency_probe.missing_dependencies.is_empty() {
            issues.push(format!(
                "Python orchestration dependencies missing: {}",
                dependency_probe.missing_dependencies.join(", ")
            ));
        }

        ServiceHealthStatus {
            status: if issues.is_empty() {
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
            error_message: (!issues.is_empty()).then(|| issues.join(" | ")),
            host_gateway_configured,
            host_gateway_endpoint,
            dependencies_ready: dependency_probe.missing_dependencies.is_empty(),
            missing_dependencies: dependency_probe.missing_dependencies,
        }
    }

    fn probe_python_dependencies(&mut self) -> DependencyProbe {
        if let Some((cached_at, ref cached)) = self.dependency_probe_cache {
            if cached_at.elapsed() < DEPENDENCY_PROBE_CACHE_TTL {
                return cached.clone();
            }
        }

        let Some(python) = self.python.clone().or_else(|| detect_python_command().ok()) else {
            let result = DependencyProbe {
                missing_dependencies: vec!["python_runtime".to_string()],
            };
            self.dependency_probe_cache = Some((std::time::Instant::now(), result.clone()));
            return result;
        };

        let mut command = Command::new(&python.executable);
        command
            .args(&python.base_args)
            .arg("-c")
            .arg(build_dependency_probe_script())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        let Ok(output) = run_dependency_probe_with_timeout(command, DEPENDENCY_PROBE_TIMEOUT)
        else {
            let result = DependencyProbe {
                missing_dependencies: vec!["dependency_probe_failed".to_string()],
            };
            self.dependency_probe_cache = Some((std::time::Instant::now(), result.clone()));
            return result;
        };

        if !output.status_success {
            let result = DependencyProbe {
                missing_dependencies: vec!["dependency_probe_failed".to_string()],
            };
            self.dependency_probe_cache = Some((std::time::Instant::now(), result.clone()));
            return result;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let missing_dependencies = stdout
            .trim()
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToString::to_string)
            .collect();

        let result = DependencyProbe {
            missing_dependencies,
        };
        self.dependency_probe_cache = Some((std::time::Instant::now(), result.clone()));
        result
    }
}

struct DependencyProbeOutput {
    status_success: bool,
    stdout: Vec<u8>,
}

fn run_dependency_probe_with_timeout(
    mut command: Command,
    timeout: Duration,
) -> std::io::Result<DependencyProbeOutput> {
    let mut child = command.spawn()?;
    let started_at = Instant::now();

    loop {
        if let Some(status) = child.try_wait()? {
            let mut stdout = Vec::new();
            if let Some(mut output) = child.stdout.take() {
                let _ = output.read_to_end(&mut stdout);
            }
            return Ok(DependencyProbeOutput {
                status_success: status.success(),
                stdout,
            });
        }

        if started_at.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Ok(DependencyProbeOutput {
                status_success: false,
                stdout: Vec::new(),
            });
        }

        std::thread::sleep(Duration::from_millis(50));
    }
}

#[derive(Debug, Default, Clone)]
struct DependencyProbe {
    missing_dependencies: Vec<String>,
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

fn resolve_log_dir(_app_handle: &AppHandle) -> Option<PathBuf> {
    if let Ok(active_log_dir) = std::env::var("XUEJIAN_ACTIVE_LOG_DIR") {
        return Some(PathBuf::from(active_log_dir));
    }

    Some(
        std::env::var("XUEJIAN_LOG_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("../..")
                    .join("logs")
            }),
    )
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

fn build_dependency_probe_script() -> String {
    let modules = REQUIRED_PYTHON_MODULES
        .iter()
        .map(|(import_name, label)| format!("({import_name:?}, {label:?})"))
        .collect::<Vec<_>>()
        .join(", ");

    format!(
        "import importlib.util\nmodules=[{modules}]\nmissing=[]\nfor import_name,label in modules:\n    try:\n        found = importlib.util.find_spec(import_name) is not None\n    except Exception:\n        found = False\n    if not found:\n        missing.append(label)\nprint(','.join(missing))"
    )
}

const REQUIRED_PYTHON_MODULES: [(&str, &str); 6] = [
    ("langchain_anthropic", "langchain-anthropic"),
    ("litellm", "litellm"),
    ("pydantic_ai", "pydantic-ai"),
    ("docling", "docling"),
    ("fitz", "pymupdf"),
    ("genanki", "genanki"),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn health_roundtrip_succeeds() {
        let script_path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../orchestration_service/main.py");
        let mut manager = OrchestrationServiceManager::new(script_path, None, None, None);

        let health = manager.start().await.expect("start service");
        assert_eq!(health.status, "degraded");
        assert!(health.protocol_compatible);
        assert_eq!(
            health.protocol_version.as_deref(),
            Some(ORCHESTRATION_PROTOCOL_VERSION)
        );
        assert!(!health.host_gateway_configured);

        manager.stop().await.expect("stop service");
    }
}
