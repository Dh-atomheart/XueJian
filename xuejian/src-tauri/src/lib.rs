mod app_state;
mod commands;
mod db;
mod gateway;
mod secrets;
mod tasks;

use std::path::PathBuf;

use app_state::AppState;
use tauri::{Manager, RunEvent};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

const ACTIVE_LOG_DIR_ENV: &str = "XUEJIAN_ACTIVE_LOG_DIR";

fn log_base_dir() -> PathBuf {
    std::env::var("XUEJIAN_LOG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../..")
                .join("logs")
        })
}

fn create_session_log_dir() -> PathBuf {
    let session_name = chrono::Local::now()
        .format("%Y-%m-%d[%H-%M-%S]")
        .to_string();
    log_base_dir().join(session_name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let session_log_dir = create_session_log_dir();
    if let Err(error) = std::fs::create_dir_all(&session_log_dir) {
        eprintln!(
            "Failed to create XueJian session log directory {:?}: {}",
            session_log_dir, error
        );
    }
    std::env::set_var(ACTIVE_LOG_DIR_ENV, &session_log_dir);

    std::panic::set_hook(Box::new(|panic_info| {
        let location = panic_info
            .location()
            .map(|location| format!("{}:{}", location.file(), location.line()))
            .unwrap_or_else(|| "unknown".to_string());
        log::error!(target: "panic", "Application panic at {location}: {panic_info}");
    }));

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .rotation_strategy(RotationStrategy::KeepSome(10))
                .timezone_strategy(TimezoneStrategy::UseLocal)
                .max_file_size(2_000_000)
                .targets([
                    Target::new(TargetKind::Folder {
                        path: session_log_dir.clone(),
                        file_name: Some("xuejian".to_string()),
                    }),
                    Target::new(TargetKind::Stdout),
                ])
                .build(),
        )
        .setup(move |app| {
            log::info!("Session log directory: {:?}", session_log_dir);

            let db = match db::init_db(app.handle()) {
                Ok(db) => {
                    log::info!("Database initialized successfully");
                    db
                }
                Err(error) => {
                    log::error!("Failed to initialize database: {}", error);
                    return Err(Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Database initialization failed: {error}"),
                    )));
                }
            };

            let secrets = match secrets::init_secrets(app.handle()) {
                Ok(secrets) => {
                    log::info!("Secret store initialized successfully");
                    secrets
                }
                Err(error) => {
                    log::error!("Failed to initialize secret store: {}", error);
                    return Err(Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Secret store initialization failed: {error}"),
                    )));
                }
            };

            if secrets.recovered_from_corrupt_vault() {
                log::warn!(
                    "Secret vault was recreated after a corrupt Stronghold file was detected; stored API keys must be re-entered"
                );
                let repo = db::SettingsRepository::new(&db);
                match repo.list_api_configs() {
                    Ok(configs) => {
                        for config in configs
                            .iter()
                            .filter(|config| config.key_status != "none")
                        {
                            if let Err(error) =
                                repo.update_api_key_status(&config.id, "none", None)
                            {
                                log::warn!(
                                    "Failed to reset API key status after vault recovery for config {}: {}",
                                    config.id,
                                    error
                                );
                            }
                        }
                    }
                    Err(error) => {
                        log::warn!(
                            "Failed to inspect API key statuses after vault recovery: {}",
                            error
                        );
                    }
                }
            }

            let host_gateway = match gateway::host_http::HostHttpGateway::new(app.handle().clone())
            {
                Ok(gateway) => gateway,
                Err(error) => {
                    log::error!("Failed to create host HTTP gateway: {}", error);
                    return Err(Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Host HTTP gateway creation failed: {error}"),
                    )));
                }
            };

            let host_gateway_port = host_gateway.start().map_err(|error| {
                log::error!("Failed to start host HTTP gateway: {}", error);
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Host HTTP gateway startup failed: {error}"),
                ))
            })?;

            log::info!("Host HTTP gateway started on port {host_gateway_port}");

            let orchestration =
                match tasks::OrchestrationService::new(
                    app.handle(),
                    Some(host_gateway_port),
                    Some(host_gateway.token()),
                ) {
                    Ok(orchestration) => orchestration,
                    Err(error) => {
                        log::error!("Failed to initialize orchestration service: {}", error);
                        return Err(Box::new(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            format!("Orchestration service initialization failed: {error}"),
                        )));
                    }
                };

            app.manage(AppState::new(db, secrets, orchestration));

            let orchestration = app.state::<AppState>().orchestration.clone();
            tauri::async_runtime::spawn(async move {
                match orchestration.start().await {
                    Ok(health) => {
                        log::info!(
                            "Orchestration service started successfully on {:?}",
                            health.endpoint
                        );
                    }
                    Err(error) => {
                        log::warn!("Background orchestration startup failed: {}", error);
                    }
                }
            });

            log::info!("学笺应用启动成功，后台服务将继续预热");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::documents::list_documents,
            commands::documents::get_document,
            commands::documents::create_document,
            commands::documents::pick_and_import_pdf_document,
            commands::documents::pick_and_import_document,
            commands::documents::import_document_from_path,
            commands::documents::run_document_parse_workflow,
            commands::documents::run_document_embedding_workflow,
            commands::documents::update_document_status,
            commands::documents::save_document_analysis,
            commands::documents::list_document_anchors,
            commands::documents::list_document_sections,
            commands::documents::list_document_chunks,
            commands::documents::read_document_binary,
            commands::documents::delete_document,
            commands::cards::list_cards,
            commands::cards::list_due_cards,
            commands::cards::create_card,
            commands::cards::delete_card,
            commands::cards::update_card,
            commands::cards::update_card_review,
            commands::cards::create_review_log,
            commands::cards::list_review_logs,
            commands::cards::get_daily_stats,
            commands::cards::get_study_stats,
            commands::cards::get_mastery_breakdown,
            commands::cards::get_review_heatmap,
            commands::cards::list_highlights,
            commands::cards::create_highlight,
            commands::cards::update_highlight,
            commands::cards::delete_highlight,
            commands::cards::batch_create_highlights_for_cards,
            commands::cards::list_card_candidates,
            commands::cards::update_card_candidate,
            commands::cards::bulk_update_card_candidate_statuses,
            commands::cards::start_card_generation_workflow,
            commands::cards::resume_card_generation_workflow,
            commands::cards::finalize_card_generation_workflow,
            commands::cards::export_cards_csv,
            commands::cards::pick_and_export_csv,
            commands::cards::export_annotated_pdf,
            commands::cards::upload_card_media,
            commands::cards::list_card_media,
            commands::cards::delete_card_media,
            commands::cards::import_cards_apkg,
            commands::cards::pick_and_export_apkg,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::list_api_configs,
            commands::settings::get_api_config,
            commands::settings::create_api_config,
            commands::settings::update_api_config,
            commands::settings::set_default_api_config,
            commands::settings::delete_api_config,
            commands::settings::list_model_profiles,
            commands::settings::list_model_profiles_by_api_config,
            commands::settings::create_model_profile,
            commands::settings::update_model_profile,
            commands::settings::delete_model_profile,
            commands::settings::delete_api_key,
            commands::settings::get_api_key,
            commands::settings::get_secret_vault_status,
            commands::settings::lock_secret_vault,
            commands::settings::store_api_key,
            commands::settings::test_api_connection,
            commands::settings::unlock_secret_vault,
            commands::settings::fetch_provider_models,
            commands::settings::list_workflow_assignments,
            commands::settings::get_workflow_assignment,
            commands::settings::set_workflow_assignment,
            commands::settings::set_all_workflow_assignments,
            commands::settings::delete_workflow_assignment,
            commands::settings::get_provider_budget_usage,
            commands::settings::reset_provider_budget_usage,
            commands::settings::record_workflow_cost,
            commands::settings::list_embedding_profiles,
            commands::settings::get_active_embedding_profile,
            commands::settings::create_embedding_profile,
            commands::settings::set_active_embedding_profile,
            commands::orchestration::get_host_gateway_manifest,
            commands::orchestration::get_orchestration_service_health,
            commands::orchestration::restart_orchestration_service,
            commands::orchestration::stop_orchestration_service,
            commands::orchestration::list_workflow_runs,
            commands::orchestration::get_workflow_run,
            commands::orchestration::create_workflow_run,
            commands::orchestration::update_workflow_run,
            commands::orchestration::list_workflow_events,
            commands::orchestration::get_workflow_checkpoint,
            commands::orchestration::export_cards_apkg,
            commands::knowledge::search_knowledge,
            commands::knowledge::list_knowledge_qa_conversations,
            commands::knowledge::get_knowledge_qa_conversation,
            commands::knowledge::create_knowledge_qa_conversation,
            commands::knowledge::send_knowledge_qa_message,
            commands::knowledge::cancel_knowledge_qa_message,
            commands::knowledge::start_knowledge_qa_workflow,
            commands::points::record_points,
            commands::points::list_points_ledger,
            commands::points::get_points_summary,
            commands::logging::log_frontend_event,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
            if let Some(state) = app_handle.try_state::<AppState>() {
                let orchestration = state.orchestration.clone();
                let _ = tauri::async_runtime::block_on(async move { orchestration.stop().await });
            }
        }
    });
}

pub mod native_smoke {
    use std::{
        fs,
        path::PathBuf,
        time::{Duration, Instant},
    };

    use serde_json::{json, Value};
    use tauri::Manager;

    use super::*;

    #[derive(Debug)]
    struct SmokeStep {
        name: &'static str,
        status: String,
        details: String,
    }

    #[derive(Debug)]
    struct SmokeReport {
        generated_at: String,
        fixture_path: PathBuf,
        document_id: Option<String>,
        steps: Vec<SmokeStep>,
    }

    impl SmokeReport {
        fn new(fixture_path: PathBuf) -> Self {
            Self {
                generated_at: chrono::Utc::now().to_rfc3339(),
                fixture_path,
                document_id: None,
                steps: Vec::new(),
            }
        }

        fn push(
            &mut self,
            name: &'static str,
            status: impl Into<String>,
            details: impl Into<String>,
        ) {
            self.steps.push(SmokeStep {
                name,
                status: status.into(),
                details: details.into(),
            });
        }

        fn has_failed_native_infra(&self) -> bool {
            self.steps.iter().any(|step| {
                step.status == "failed"
                    && matches!(
                        step.name,
                        "app_boot" | "orchestration_health" | "library_import" | "parse"
                    )
            })
        }

        fn markdown(&self) -> String {
            let mut text = String::new();
            text.push_str("# Tauri Native Smoke Report\n\n");
            text.push_str(&format!("- Generated at: `{}`\n", self.generated_at));
            text.push_str(&format!(
                "- Fixture: `{}`\n",
                self.fixture_path.to_string_lossy()
            ));
            text.push_str(&format!(
                "- Document ID: `{}`\n\n",
                self.document_id.as_deref().unwrap_or("<not-created>")
            ));
            text.push_str("| Step | Status | Details |\n");
            text.push_str("| --- | --- | --- |\n");
            for step in &self.steps {
                text.push_str(&format!(
                    "| {} | {} | {} |\n",
                    step.name,
                    step.status,
                    escape_markdown_table(&step.details)
                ));
            }
            text.push_str("\n## Classification Rules\n\n");
            text.push_str("- `passed_real`: native command completed through Rust/AppState/orchestration and produced non-fallback persisted output.\n");
            text.push_str("- `passed_native`: native command/database/orchestration dispatch path is executable, but the step does not require model output.\n");
            text.push_str("- `blocked`: native path is wired, but external provider credentials or model assignments are missing.\n");
            text.push_str("- `fallback_detected`: command completed only because a rule-based fallback path ran; this is not accepted as real workflow success.\n");
            text.push_str("- `failed`: native infrastructure or command execution failed.\n");
            text
        }

        fn json(&self) -> Value {
            json!({
                "generatedAt": self.generated_at,
                "fixturePath": self.fixture_path,
                "documentId": self.document_id,
                "steps": self.steps.iter().map(|step| {
                    json!({
                        "name": step.name,
                        "status": step.status,
                        "details": step.details,
                    })
                }).collect::<Vec<_>>(),
            })
        }
    }

    pub async fn run() -> PathBuf {
        let repo_root = repo_root();
        let report_dir = repo_root.join("docs").join("audit");
        fs::create_dir_all(&report_dir).expect("create audit directory");

        let app = build_smoke_app();
        install_smoke_state(&app);
        let fixture_path = write_smoke_fixture(&app);
        let mut report = SmokeReport::new(fixture_path.clone());
        report.push(
            "app_boot",
            "passed_native",
            "Tauri app initialized with AppState",
        );

        let health = {
            let state = app.state::<app_state::AppState>();
            state
                .orchestration
                .start()
                .await
                .expect("start orchestration service")
        };
        report.push(
            "orchestration_health",
            if health.host_gateway_configured && health.dependencies_ready {
                "passed_native"
            } else {
                "failed"
            },
            format!(
                "status={}, endpoint={:?}, hostGatewayConfigured={}, dependenciesReady={}, missingDependencies={:?}",
                health.status,
                health.endpoint,
                health.host_gateway_configured,
                health.dependencies_ready,
                health.missing_dependencies
            ),
        );

        let imported = commands::documents::import_document_from_path(
            app.handle().clone(),
            app.state::<app_state::AppState>(),
            fixture_path.to_string_lossy().to_string(),
        )
        .expect("import fixture document through native command");
        let document_id = imported.id.clone();
        report.document_id = Some(document_id.clone());
        report.push(
            "library_import",
            "passed_native",
            format!(
                "document id={}, title={}, status={}",
                document_id, imported.title, imported.status
            ),
        );

        match commands::documents::run_document_parse_workflow(
            app.handle().clone(),
            app.state::<app_state::AppState>(),
            document_id,
        )
        .await
        {
            Ok(parsed) => {
                let parsed_value =
                    serde_json::to_value(&parsed).expect("serialize parsed document");
                report.push(
                    "parse",
                    "passed_real",
                    format!(
                        "document status={}, pageCount={:?}",
                        parsed.status, parsed_value["pageCount"]
                    ),
                );
            }
            Err(error) => {
                report.push("parse", "failed", error.to_string());
            }
        }

        match commands::documents::run_document_embedding_workflow(
            app.handle().clone(),
            app.state::<app_state::AppState>(),
            report.document_id.as_deref().unwrap_or("").to_string(),
        )
        .await
        {
            Ok(embedded) => {
                let embedded_value =
                    serde_json::to_value(&embedded).expect("serialize embedded document");
                report.push(
                    "embedding",
                    "passed_real",
                    format!(
                        "document status={}, response={}",
                        embedded.status,
                        compact_json(&embedded_value)
                    ),
                );
            }
            Err(error) => {
                let message = error.to_string();
                report.push("embedding", classify_provider_error(&message), message);
            }
        }

        match commands::cards::start_card_generation_workflow(
            app.handle().clone(),
            app.state::<app_state::AppState>(),
            commands::cards::StartCardGenerationDto {
                document_id: report.document_id.as_deref().unwrap_or("").to_string(),
                max_candidates: Some(4),
            },
        ) {
            Ok(run) => {
                let run_id = run.id.clone();
                let completed = wait_for_run(&app, &run_id, Duration::from_secs(90));
                let candidates = commands::cards::list_card_candidates(
                    app.state::<app_state::AppState>(),
                    Some(run_id.clone()),
                    None,
                    None,
                    Some(20),
                )
                .map(|items| serde_json::to_value(items).expect("serialize candidates"))
                .unwrap_or_else(|error| json!({ "error": error.to_string() }));
                let fallback = candidates.as_array().is_some_and(|items| {
                    items.iter().any(|item| {
                        item["fallbackReason"].is_string()
                            || item["generationMode"]
                                .as_str()
                                .unwrap_or("")
                                .contains("fallback")
                    })
                });
                report.push(
                    "card_generation",
                    if fallback {
                        "fallback_detected"
                    } else if completed["status"].as_str() == Some("completed") {
                        "passed_real"
                    } else {
                        "failed"
                    },
                    format!(
                        "run={}, finalRun={}, candidates={}",
                        run_id,
                        compact_json(&completed),
                        compact_json(&candidates)
                    ),
                );
            }
            Err(error) => {
                let message = error.to_string();
                report.push(
                    "card_generation",
                    classify_provider_error(&message),
                    message,
                )
            }
        }

        match commands::knowledge::search_knowledge(
            app.state::<app_state::AppState>(),
            commands::knowledge::SearchKnowledgeDto {
                query: "retrieval augmented generation".to_string(),
                document_ids: Some(vec![report
                    .document_id
                    .as_deref()
                    .unwrap_or("")
                    .to_string()]),
                limit: Some(5),
            },
        ) {
            Ok(results) => report.push(
                "knowledge_search",
                "passed_native",
                format!(
                    "results={}",
                    compact_json(&serde_json::to_value(results).expect("serialize search results"))
                ),
            ),
            Err(error) => report.push("knowledge_search", "failed", error.to_string()),
        }

        match commands::knowledge::start_knowledge_qa_workflow(
            app.handle().clone(),
            app.state::<app_state::AppState>(),
            commands::knowledge::StartKnowledgeQaDto {
                question: "What does the smoke fixture say about native orchestration?".to_string(),
                document_ids: Some(vec![report
                    .document_id
                    .as_deref()
                    .unwrap_or("")
                    .to_string()]),
            },
        )
        .await
        {
            Ok(run) => {
                let run_id = run.id.clone();
                let completed = wait_for_run(&app, &run_id, Duration::from_secs(90));
                report.push(
                    "knowledge_qa",
                    classify_run_status(&completed),
                    format!("run={}, finalRun={}", run_id, compact_json(&completed)),
                );
            }
            Err(error) => {
                let message = error.to_string();
                report.push("knowledge_qa", classify_provider_error(&message), message)
            }
        }

        let markdown_path = report_dir.join("2026-04-26-tauri-native-smoke-report.md");
        let json_path = report_dir.join("2026-04-26-tauri-native-smoke-report.json");
        fs::write(&markdown_path, report.markdown()).expect("write native smoke markdown report");
        fs::write(
            &json_path,
            serde_json::to_string_pretty(&report.json()).expect("serialize native smoke json"),
        )
        .expect("write native smoke json report");

        {
            let state = app.state::<app_state::AppState>();
            state
                .orchestration
                .stop()
                .await
                .expect("stop orchestration");
        }

        if report.has_failed_native_infra() {
            panic!(
                "native smoke infrastructure failed; see {}",
                markdown_path.display()
            );
        }

        markdown_path
    }

    fn build_smoke_app() -> tauri::App {
        tauri::Builder::default()
            .build(tauri::generate_context!())
            .expect("build native smoke app")
    }

    fn install_smoke_state(app: &tauri::App) {
        let db = db::init_db(app.handle()).expect("initialize native smoke database");
        let secrets = secrets::init_secrets(app.handle()).expect("initialize native smoke secrets");
        let host_gateway = gateway::host_http::HostHttpGateway::new(app.handle().clone())
            .expect("create native smoke host gateway");
        let host_gateway_port = host_gateway.port();
        let orchestration = tasks::OrchestrationService::new(
            app.handle(),
            Some(host_gateway_port),
            Some(host_gateway.token()),
        )
        .expect("initialize native smoke orchestration service");
        app.manage(app_state::AppState::new(db, secrets, orchestration));
        host_gateway
            .start()
            .expect("start native smoke host gateway");
    }

    fn wait_for_run(app: &tauri::App, run_id: &str, timeout: Duration) -> Value {
        let deadline = Instant::now() + timeout;
        let mut latest = json!({ "id": run_id, "status": "unknown" });
        while Instant::now() < deadline {
            match commands::orchestration::get_workflow_run(
                app.state::<app_state::AppState>(),
                run_id.to_string(),
            ) {
                Ok(value) => {
                    latest = serde_json::to_value(value).expect("serialize run");
                    if matches!(
                        latest["status"].as_str(),
                        Some("completed" | "failed" | "cancelled")
                    ) {
                        return latest;
                    }
                }
                Err(error) => {
                    latest = json!({ "id": run_id, "status": "failed", "error": error.to_string() })
                }
            }
            std::thread::sleep(Duration::from_millis(750));
        }
        latest
    }

    fn classify_provider_error(error: &str) -> &'static str {
        let lowered = error.to_ascii_lowercase();
        if lowered.contains("api key")
            || lowered.contains("provider")
            || lowered.contains("model")
            || lowered.contains("assignment")
            || lowered.contains("credential")
            || lowered.contains("unauthorized")
        {
            "blocked"
        } else {
            "failed"
        }
    }

    fn classify_run_status(run: &Value) -> &'static str {
        match run["status"].as_str() {
            Some("completed") => "passed_real",
            Some("failed") => classify_provider_error(run["errorMessage"].as_str().unwrap_or("")),
            Some("cancelled") => "failed",
            _ => "failed",
        }
    }

    fn write_smoke_fixture(app: &tauri::App) -> PathBuf {
        let fixture_dir = app
            .path()
            .app_data_dir()
            .expect("resolve native smoke app data dir")
            .join("native-smoke-fixtures");
        fs::create_dir_all(&fixture_dir).expect("create smoke fixture dir");
        let fixture_path = fixture_dir.join("tauri-native-smoke-fixture.md");
        fs::write(
            &fixture_path,
            "# Native Smoke Fixture\n\nThis fixture verifies the native Library to Parse to Embedding chain.\n\nIt includes retrieval augmented generation, spaced repetition card generation, and question answering markers.\n\nNative entities: XueJian, Native IPC, Python orchestration, Host Gateway.\n",
        )
        .expect("write smoke fixture");
        fixture_path
    }

    fn repo_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .canonicalize()
            .expect("resolve repo root")
    }

    fn compact_json(value: &Value) -> String {
        let raw = serde_json::to_string(value).unwrap_or_else(|_| "<unserializable>".to_string());
        if raw.len() > 900 {
            format!("{}...", &raw[..900])
        } else {
            raw
        }
    }

    fn escape_markdown_table(value: &str) -> String {
        value
            .replace('|', "\\|")
            .replace('\r', " ")
            .replace('\n', " ")
    }
}
