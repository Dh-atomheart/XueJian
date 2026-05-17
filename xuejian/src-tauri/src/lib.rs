mod app_state;
mod commands;
mod db;
mod gateway;
mod secrets;
mod tasks;

use std::{path::PathBuf, time::Instant};

use app_state::AppState;
use tauri::{webview::PageLoadEvent, Manager, RunEvent};
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
        .on_page_load(|window, payload| {
            let scope = match payload.event() {
                PageLoadEvent::Started => "webview.page.started",
                PageLoadEvent::Finished => "webview.page.finished",
            };
            log::info!(
                "{scope}: label={}, url={}",
                window.label(),
                payload.url()
            );
        })
        .setup(move |app| {
            let setup_start = Instant::now();
            log::info!("Session log directory: {:?}", session_log_dir);

            let db_start = Instant::now();
            let db = match db::init_db(app.handle()) {
                Ok(db) => {
                    log::info!(
                        "Database initialized successfully: duration_ms={:.2}",
                        db_start.elapsed().as_secs_f64() * 1000.0
                    );
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

            let stale_jobs_start = Instant::now();
            let stale_jobs_repo = db::Mvp0BackgroundJobRepository::new(db.connection());
            let document_repairs = match commands::documents::repair_stuck_document_jobs_for_db(&db)
            {
                Ok(repaired) => repaired,
                Err(error) => {
                    log::warn!(
                        "Failed to repair stale document jobs during setup: {}",
                        error
                    );
                    0
                }
            };
            match commands::background_jobs::repair_stale_ai_card_generation_jobs(&stale_jobs_repo) {
                Ok(ai_repairs) => {
                    log::info!(
                        "background_jobs.repair.completed scope=setup documents={} ai_card_generation={} duration_ms={:.2}",
                        document_repairs,
                        ai_repairs,
                        stale_jobs_start.elapsed().as_secs_f64() * 1000.0
                    );
                }
                Err(error) => {
                    log::warn!(
                        "Failed to repair stale AI card generation jobs during setup: {}",
                        error
                    );
                }
            }

            let secrets_start = Instant::now();
            let secrets = match secrets::init_secrets(app.handle()) {
                Ok(secrets) => {
                    log::info!(
                        "Secret store initialized lazily: duration_ms={:.2}",
                        secrets_start.elapsed().as_secs_f64() * 1000.0
                    );
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

            let host_gateway_start = Instant::now();
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
            log::info!(
                "Host HTTP gateway startup duration_ms={:.2}",
                host_gateway_start.elapsed().as_secs_f64() * 1000.0
            );

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

            #[cfg(debug_assertions)]
            {
                tauri::async_runtime::spawn(async move {
                    let started_at = Instant::now();
                    match reqwest::Client::builder()
                        .timeout(std::time::Duration::from_secs(2))
                        .build()
                    {
                        Ok(client) => match client.get("http://localhost:1420").send().await {
                            Ok(response) => {
                                log::info!(
                                    "dev_server.reachable url=http://localhost:1420 status={} duration_ms={:.2}",
                                    response.status(),
                                    started_at.elapsed().as_secs_f64() * 1000.0
                                );
                            }
                            Err(error) => {
                                log::warn!(
                                    "dev_server.unreachable url=http://localhost:1420 error={} duration_ms={:.2}",
                                    error,
                                    started_at.elapsed().as_secs_f64() * 1000.0
                                );
                            }
                        },
                        Err(error) => {
                            log::warn!("dev_server.probe_client_failed error={error}");
                        }
                    }
                });
            }

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
            log::info!(
                "Tauri setup completed: duration_ms={:.2}",
                setup_start.elapsed().as_secs_f64() * 1000.0
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::background_jobs::list_background_jobs,
            commands::background_jobs::get_background_job,
            commands::background_jobs::cancel_background_job,
            commands::ai_cards::start_ai_card_generation,
            commands::ai_cards::resume_ai_card_generation,
            commands::basic_cards::list_basic_cards,
            commands::basic_cards::create_basic_card,
            commands::basic_cards::update_basic_card,
            commands::basic_cards::delete_basic_card,
            commands::basic_cards::delete_basic_cards,
            commands::basic_cards::list_basic_card_groups,
            commands::basic_cards::create_basic_card_group,
            commands::basic_cards::update_basic_card_group,
            commands::basic_cards::set_basic_card_group_enabled,
            commands::basic_cards::delete_basic_card_group,
            commands::study::get_daily_queue,
            commands::study::submit_study_review,
            commands::dashboard::get_dashboard_summary,
            commands::documents::list_documents,
            commands::documents::list_library_documents,
            commands::documents::get_document,
            commands::documents::create_document,
            commands::documents::pick_and_import_pdf_document,
            commands::documents::pick_and_import_document,
            commands::documents::import_document_from_path,
            commands::documents::run_document_parse_workflow,
            commands::documents::run_document_embedding_workflow,
            commands::documents::start_document_embedding_job,
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
            commands::orchestration::get_workflow_artifact,
            commands::orchestration::list_workflow_artifacts,
            commands::orchestration::update_workflow_artifact_lifecycle,
            commands::orchestration::export_cards_apkg,
            commands::knowledge::search_knowledge,
            commands::knowledge::list_knowledge_qa_conversations,
            commands::knowledge::get_knowledge_qa_conversation,
            commands::knowledge::create_knowledge_qa_conversation,
            commands::knowledge::delete_knowledge_qa_conversation,
            commands::knowledge::delete_knowledge_qa_turn,
            commands::knowledge::send_knowledge_qa_message,
            commands::knowledge::regenerate_knowledge_qa_turn,
            commands::knowledge::cancel_knowledge_qa_message,
            commands::knowledge::start_knowledge_qa_workflow,
            commands::agent::start_agent_task_workflow,
            commands::agent::start_agent_card_generation_workflow,
            commands::agent::pause_agent_task,
            commands::agent::resume_agent_task,
            commands::agent::cancel_agent_task,
            commands::agent::continue_agent_task,
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
        path::{Path, PathBuf},
        time::{Duration, Instant},
    };

    use serde_json::{json, Value};
    use tauri::Manager;
    use uuid::Uuid;

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
                        "app_boot"
                            | "orchestration_health"
                            | "library_import"
                            | "parse"
                            | "copyable_pdf_parse"
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
        let smoke_runtime_root = install_smoke_state(&app);
        let fixture_path = write_smoke_fixture(&smoke_runtime_root);
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

        let imported = register_smoke_document(&app, &fixture_path);
        let document_id = imported.id.clone();
        let mut workflow_document_id = document_id.clone();
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

        let pdf_unique_marker = Uuid::new_v4().to_string();
        let pdf_fixture_path = write_copyable_pdf_fixture(&smoke_runtime_root, &pdf_unique_marker);
        let pdf_document = register_smoke_document(&app, &pdf_fixture_path);

        if health
            .missing_dependencies
            .iter()
            .any(|dep| dep == "pymupdf")
        {
            report.push(
                "copyable_pdf_parse",
                "blocked",
                format!(
                    "PyMuPDF unavailable, skipping copyable PDF parse smoke: {:?}",
                    health.missing_dependencies
                ),
            );
        } else {
            match commands::documents::run_document_parse_workflow(
                app.handle().clone(),
                app.state::<app_state::AppState>(),
                pdf_document.id.clone(),
            )
            .await
            {
                Ok(parsed) => {
                    match inspect_parsed_document(&app, &pdf_document.id, &pdf_unique_marker) {
                        Ok(details) => {
                            workflow_document_id = pdf_document.id.clone();
                            report.push(
                                "copyable_pdf_parse",
                                "passed_real",
                                format!(
                                    "document status={}, pageCount={:?}, {}",
                                    parsed.status, parsed.page_count, details
                                ),
                            )
                        }
                        Err(error) => report.push("copyable_pdf_parse", "failed", error),
                    }
                }
                Err(error) => report.push("copyable_pdf_parse", "failed", error.to_string()),
            }
        }

        match commands::documents::start_document_embedding_job(
            app.handle().clone(),
            app.state::<app_state::AppState>(),
            workflow_document_id.clone(),
        ) {
            Ok(job) => {
                let completed = wait_for_background_job(&app, &job.id, Duration::from_secs(120));
                let details = inspect_embedding_result(&app, &workflow_document_id, &completed)
                    .unwrap_or_else(|error| json!({ "inspectionError": error }));
                let status = if completed["status"].as_str() == Some("succeeded")
                    && details["embeddedChunkCount"].as_i64().unwrap_or(0) > 0
                {
                    "passed_real"
                } else if completed["status"].as_str() == Some("failed") {
                    classify_provider_error(completed["errorMessage"].as_str().unwrap_or_default())
                } else {
                    "failed"
                };
                report.push(
                    "embedding",
                    status,
                    format!(
                        "job={}, finalJob={}, inspection={}",
                        job.id,
                        compact_json(&completed),
                        compact_json(&details)
                    ),
                );
            }
            Err(error) => {
                let message = error.to_string();
                report.push("embedding", classify_provider_error(&message), message);
            }
        }

        let smoke_group_id = ensure_smoke_card_group(&app);
        let provider_config_id = resolve_smoke_card_provider_config_id(&app).unwrap_or_default();
        match commands::ai_cards::start_ai_card_generation(
            app.handle().clone(),
            app.state::<app_state::AppState>(),
            commands::ai_cards::StartAiCardGenerationDto {
                document_id: workflow_document_id.clone(),
                group_id: smoke_group_id.clone(),
                page_start: None,
                page_end: None,
                density: "low".to_string(),
                provider_config_id,
            },
        ) {
            Ok(job) => {
                let completed = wait_for_background_job(&app, &job.id, Duration::from_secs(180));
                let card_count = count_smoke_cards(&app, &workflow_document_id, &smoke_group_id)
                    .unwrap_or_else(|error| {
                        report.push("card_generation_inspection", "failed", error);
                        0
                    });
                report.push(
                    "card_generation",
                    if completed["status"].as_str() == Some("succeeded") && card_count > 0 {
                        "passed_real"
                    } else if completed["status"].as_str() == Some("failed") {
                        classify_provider_error(
                            completed["errorMessage"].as_str().unwrap_or_default(),
                        )
                    } else {
                        "failed"
                    },
                    format!(
                        "job={}, finalJob={}, createdCardCount={}",
                        job.id,
                        compact_json(&completed),
                        card_count
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
                query: pdf_unique_marker.clone(),
                document_ids: Some(vec![workflow_document_id.clone()]),
                limit: Some(5),
            },
        ) {
            Ok(results) => {
                let result_count = results.len();
                report.push(
                    "knowledge_search",
                    if result_count > 0 {
                        "passed_native"
                    } else {
                        "failed"
                    },
                    format!(
                        "resultCount={}, results={}",
                        result_count,
                        compact_json(
                            &serde_json::to_value(results).expect("serialize search results")
                        )
                    ),
                )
            }
            Err(error) => report.push("knowledge_search", "failed", error.to_string()),
        }

        match commands::knowledge::start_knowledge_qa_workflow(
            app.handle().clone(),
            app.state::<app_state::AppState>(),
            commands::knowledge::StartKnowledgeQaDto {
                question:
                    "What does the smoke fixture say about document chunks and source anchors?"
                        .to_string(),
                document_ids: Some(vec![workflow_document_id.clone()]),
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

    fn install_smoke_state(app: &tauri::App) -> PathBuf {
        let runtime_root =
            std::env::temp_dir().join(format!("xuejian-native-smoke-{}", Uuid::new_v4()));
        fs::create_dir_all(&runtime_root).expect("create native smoke runtime root");

        let mut db = db::Database::new_at(runtime_root.join("xuejian-native-smoke.db"))
            .expect("initialize native smoke database file");
        db.run_migrations()
            .expect("apply native smoke database migrations");
        let secrets =
            secrets::SecretStore::new_at(runtime_root.join("xuejian-native-smoke.stronghold"))
                .expect("initialize native smoke secrets");
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

        runtime_root
    }

    fn register_smoke_document(
        app: &tauri::App,
        fixture_path: &Path,
    ) -> commands::documents::DocumentDto {
        let title = fixture_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("native-smoke-fixture")
            .to_string();
        let file_type = fixture_path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("md")
            .to_string();

        commands::documents::create_document(
            app.state::<app_state::AppState>(),
            commands::documents::CreateDocumentDto {
                title,
                file_path: fixture_path.to_string_lossy().to_string(),
                file_type,
                file_size: None,
                page_count: None,
                content_hash: None,
            },
        )
        .expect("create native smoke document")
    }

    fn inspect_parsed_document(
        app: &tauri::App,
        document_id: &str,
        unique_marker: &str,
    ) -> Result<String, String> {
        let state = app.state::<app_state::AppState>();
        let db = state
            .lock_db()
            .map_err(|error| format!("lock smoke database: {error}"))?;
        let document_repo = db::Mvp0DocumentRepository::new(db.connection());
        let job_repo = db::Mvp0BackgroundJobRepository::new(db.connection());

        let document = document_repo
            .find_document_by_id(document_id)
            .map_err(|error| format!("load parsed smoke document: {error}"))?
            .ok_or_else(|| format!("document {document_id} missing after parse"))?;
        if document.parse_status != "parsed" {
            return Err(format!(
                "expected persisted parse status parsed, got {}",
                document.parse_status
            ));
        }

        let chunks = document_repo
            .list_chunks(document_id)
            .map_err(|error| format!("list parsed chunks: {error}"))?;
        if chunks.is_empty() {
            return Err("expected persisted chunks after copyable PDF parse".to_string());
        }
        if !chunks
            .iter()
            .all(|chunk| chunk.parser.starts_with("pymupdf::"))
        {
            let parsers = chunks
                .iter()
                .map(|chunk| chunk.parser.clone())
                .collect::<Vec<_>>();
            return Err(format!(
                "expected PyMuPDF chunk parsers for copyable PDF, got {:?}",
                parsers
            ));
        }
        if !chunks
            .iter()
            .any(|chunk| chunk.text.contains(unique_marker))
        {
            return Err("expected copyable PDF chunks to contain the unique marker".to_string());
        }

        let anchors = document_repo
            .list_source_anchors(document_id)
            .map_err(|error| format!("list parsed anchors: {error}"))?;
        if anchors.is_empty() {
            return Err("expected persisted anchors after copyable PDF parse".to_string());
        }
        if !anchors
            .iter()
            .any(|anchor| anchor.quote.contains(unique_marker))
        {
            return Err("expected copyable PDF anchors to contain the unique marker".to_string());
        }

        let parse_job = job_repo
            .find_latest_by_target("document", document_id, Some("document_parse"))
            .map_err(|error| format!("load parse background job: {error}"))?
            .ok_or_else(|| "expected a persisted parse background job".to_string())?;
        if parse_job.status != "succeeded" {
            return Err(format!(
                "expected parse background job status succeeded, got {}",
                parse_job.status
            ));
        }

        Ok(format!(
            "persisted pageCount={:?}, chunkCount={}, anchorCount={}, parseJobStatus={}",
            document.page_count,
            chunks.len(),
            anchors.len(),
            parse_job.status
        ))
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

    fn wait_for_background_job(app: &tauri::App, job_id: &str, timeout: Duration) -> Value {
        let deadline = Instant::now() + timeout;
        let mut latest = json!({ "id": job_id, "status": "unknown" });
        while Instant::now() < deadline {
            match commands::background_jobs::get_background_job(
                app.state::<app_state::AppState>(),
                job_id.to_string(),
            ) {
                Ok(Some(value)) => {
                    latest = serde_json::to_value(value).expect("serialize background job");
                    if matches!(
                        latest["status"].as_str(),
                        Some("succeeded" | "failed" | "cancelled")
                    ) {
                        return latest;
                    }
                }
                Ok(None) => {
                    latest = json!({ "id": job_id, "status": "failed", "error": "job not found" });
                    return latest;
                }
                Err(error) => {
                    latest =
                        json!({ "id": job_id, "status": "failed", "error": error.to_string() });
                    return latest;
                }
            }
            std::thread::sleep(Duration::from_millis(750));
        }
        latest
    }

    fn inspect_embedding_result(
        app: &tauri::App,
        document_id: &str,
        completed_job: &Value,
    ) -> Result<Value, String> {
        let state = app.state::<app_state::AppState>();
        let db = state
            .lock_db()
            .map_err(|error| format!("lock smoke database: {error}"))?;
        let document_repo = db::Mvp0DocumentRepository::new(db.connection());
        let vector_repo = db::VectorRepository::new(&db);
        let document = document_repo
            .find_document_by_id(document_id)
            .map_err(|error| format!("load embedded document: {error}"))?
            .ok_or_else(|| format!("document {document_id} missing after embedding"))?;

        let result_payload = completed_job["resultJson"]
            .as_str()
            .and_then(|value| serde_json::from_str::<Value>(value).ok())
            .unwrap_or_else(|| json!({}));
        let payload_profile_id = completed_job["payloadJson"]
            .as_str()
            .and_then(|value| serde_json::from_str::<Value>(value).ok())
            .and_then(|payload| payload["profileId"].as_str().map(str::to_string));
        let profile_id = result_payload["profileId"]
            .as_str()
            .map(str::to_string)
            .or(payload_profile_id);
        let embedded_count = if let Some(profile_id) = profile_id.as_deref() {
            vector_repo
                .count_document_embeddings(document_id, profile_id)
                .map_err(|error| format!("count document embeddings: {error}"))?
        } else {
            result_payload["embeddedChunkCount"].as_i64().unwrap_or(0)
        };

        Ok(json!({
            "documentStatus": document.parse_status,
            "profileId": profile_id,
            "embeddedChunkCount": embedded_count,
            "result": result_payload,
        }))
    }

    fn ensure_smoke_card_group(app: &tauri::App) -> String {
        let state = app.state::<app_state::AppState>();
        let db = state.lock_db().expect("lock smoke database for card group");
        let repo = db::Mvp0CardRepository::new(db.connection());
        repo.create_group(db::CreateMvp0CardGroupRequest {
            name: "Native Smoke Deck".to_string(),
            description: Some("Cards generated by native smoke".to_string()),
            color: Some("#2563eb".to_string()),
            is_enabled: Some(true),
        })
        .expect("create smoke card group")
        .id
    }

    fn resolve_smoke_card_provider_config_id(app: &tauri::App) -> Option<String> {
        let state = app.state::<app_state::AppState>();
        let db = state.lock_db().ok()?;
        let repo = db::SettingsRepository::new(&db);

        if let Ok(Some(assignment)) = repo.get_workflow_assignment("card_generation") {
            if let Ok(Some(profile)) = repo.get_model_profile(&assignment.model_profile_id) {
                if let Ok(Some(config)) = repo.get_api_config(&profile.api_config_id) {
                    if config.is_enabled && profile.is_enabled {
                        return Some(config.id);
                    }
                }
            }
        }

        let mut configs = repo.list_api_configs().ok()?;
        configs.sort_by_key(|config| (!config.is_default, config.created_at.clone()));
        configs
            .into_iter()
            .find(|config| config.is_enabled)
            .map(|config| config.id)
    }

    fn count_smoke_cards(
        app: &tauri::App,
        document_id: &str,
        group_id: &str,
    ) -> Result<i64, String> {
        let state = app.state::<app_state::AppState>();
        let db = state
            .lock_db()
            .map_err(|error| format!("lock smoke database: {error}"))?;
        db.connection()
            .query_row(
                "SELECT COUNT(*)
                 FROM cards c
                 INNER JOIN review_states rs ON rs.card_id = c.id
                 WHERE c.source_document_id = ?1
                   AND c.group_id = ?2
                   AND c.origin = 'ai'
                   AND c.deleted_at IS NULL",
                rusqlite::params![document_id, group_id],
                |row| row.get(0),
            )
            .map_err(|error| format!("count generated AI cards: {error}"))
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

    fn write_smoke_fixture(runtime_root: &Path) -> PathBuf {
        let fixture_dir = runtime_root.join("fixtures");
        fs::create_dir_all(&fixture_dir).expect("create smoke fixture dir");
        let fixture_path = fixture_dir.join("tauri-native-smoke-fixture.md");
        fs::write(
            &fixture_path,
            "# Native Smoke Fixture\n\nThis fixture verifies the native Library to Parse to Embedding chain.\n\nIt includes retrieval augmented generation, spaced repetition card generation, and question answering markers.\n\nNative entities: XueJian, Native IPC, Python orchestration, Host Gateway.\n",
        )
        .expect("write smoke fixture");
        fixture_path
    }

    fn write_copyable_pdf_fixture(runtime_root: &Path, unique_marker: &str) -> PathBuf {
        let fixture_dir = runtime_root.join("fixtures");
        fs::create_dir_all(&fixture_dir).expect("create copyable pdf fixture dir");
        let fixture_path = fixture_dir.join("tauri-native-smoke-fixture.pdf");
        fs::write(&fixture_path, build_copyable_pdf_fixture(unique_marker))
            .expect("write copyable pdf fixture");
        fixture_path
    }

    fn build_copyable_pdf_fixture(unique_marker: &str) -> Vec<u8> {
        let content_stream = [
            pdf_text_object(18, 72, 720, "Native PDF Smoke Fixture"),
            pdf_text_object(
                12,
                72,
                690,
                "This copyable PDF verifies the Rust host, Python orchestration, and PyMuPDF parsing workflow.",
            ),
            pdf_text_object(
                12,
                72,
                666,
                &format!(
                    "Unique marker: {unique_marker}. Successful parsing should persist document chunks and source anchors."
                ),
            ),
        ]
        .join("\n");

        let objects = vec![
            "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>".to_string(),
            format!(
                "<< /Length {} >>\nstream\n{}\nendstream",
                content_stream.as_bytes().len(),
                content_stream
            ),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
        ];

        let mut pdf_bytes = b"%PDF-1.4\n%XJ\n".to_vec();
        let mut offsets = Vec::with_capacity(objects.len() + 1);
        offsets.push(0_usize);

        for (index, object) in objects.iter().enumerate() {
            offsets.push(pdf_bytes.len());
            pdf_bytes
                .extend_from_slice(format!("{} 0 obj\n{}\nendobj\n", index + 1, object).as_bytes());
        }

        let xref_offset = pdf_bytes.len();
        pdf_bytes.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
        pdf_bytes.extend_from_slice(b"0000000000 65535 f \n");
        for offset in offsets.iter().skip(1) {
            pdf_bytes.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
        }
        pdf_bytes.extend_from_slice(
            format!(
                "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n",
                objects.len() + 1,
                xref_offset
            )
            .as_bytes(),
        );

        pdf_bytes
    }

    fn pdf_text_object(font_size: i32, x: i32, y: i32, text: &str) -> String {
        format!(
            "BT\n/F1 {font_size} Tf\n{x} {y} Td\n({}) Tj\nET",
            escape_pdf_text(text)
        )
    }

    fn escape_pdf_text(text: &str) -> String {
        text.replace('\\', "\\\\")
            .replace('(', "\\(")
            .replace(')', "\\)")
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
