mod app_state;
mod commands;
mod db;
mod gateway;
mod secrets;
mod tasks;

use app_state::AppState;
use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

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

            let host_gateway = match gateway::host_http::HostHttpGateway::new(app.handle().clone()) {
                Ok(gateway) => gateway,
                Err(error) => {
                    log::error!("Failed to create host HTTP gateway: {}", error);
                    return Err(Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Host HTTP gateway creation failed: {error}"),
                    )));
                }
            };

            let host_gateway_port = tauri::async_runtime::block_on(host_gateway.start()).map_err(|error| {
                log::error!("Failed to start host HTTP gateway: {}", error);
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Host HTTP gateway startup failed: {error}"),
                ))
            })?;

            log::info!("Host HTTP gateway started on port {host_gateway_port}");

            let orchestration =
                match tasks::OrchestrationService::new(app.handle(), Some(host_gateway_port)) {
                    Ok(orchestration) => {
                        let health =
                            tauri::async_runtime::block_on(orchestration.start()).map_err(|error| {
                                log::error!("Failed to start orchestration service: {}", error);
                                Box::new(std::io::Error::new(
                                    std::io::ErrorKind::Other,
                                    format!("Orchestration service startup failed: {error}"),
                                ))
                            })?;

                        log::info!(
                            "Orchestration service started successfully on {:?}",
                            health.endpoint
                        );
                        orchestration
                    }
                    Err(error) => {
                        log::error!("Failed to initialize orchestration service: {}", error);
                        return Err(Box::new(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            format!("Orchestration service initialization failed: {error}"),
                        )));
                    }
                };

            app.manage(AppState::new(db, secrets, orchestration));

            log::info!("学笺应用启动成功");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::documents::list_documents,
            commands::documents::get_document,
            commands::documents::create_document,
            commands::documents::pick_and_import_pdf_document,
            commands::documents::import_document_from_path,
            commands::documents::update_document_status,
            commands::documents::save_document_analysis,
            commands::documents::list_document_anchors,
            commands::documents::list_document_chunks,
            commands::documents::read_document_binary,
            commands::documents::delete_document,
            commands::cards::list_cards,
            commands::cards::list_due_cards,
            commands::cards::create_card,
            commands::cards::update_card_review,
            commands::cards::create_review_log,
            commands::cards::list_review_logs,
            commands::cards::get_daily_stats,
            commands::cards::list_highlights,
            commands::cards::create_highlight,
            commands::cards::update_highlight,
            commands::cards::delete_highlight,
            commands::cards::list_card_candidates,
            commands::cards::update_card_candidate,
            commands::cards::bulk_update_card_candidate_statuses,
            commands::cards::start_card_generation_workflow,
            commands::cards::resume_card_generation_workflow,
            commands::cards::finalize_card_generation_workflow,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::list_api_configs,
            commands::settings::get_api_config,
            commands::settings::create_api_config,
            commands::settings::update_api_config,
            commands::settings::set_default_api_config,
            commands::settings::delete_api_config,
            commands::settings::store_api_key,
            commands::settings::test_api_connection,
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
            commands::knowledge::search_knowledge,
            commands::knowledge::start_knowledge_qa_workflow,
            commands::points::record_points,
            commands::points::list_points_ledger,
            commands::points::get_points_summary,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
            if let Some(state) = app_handle.try_state::<AppState>() {
                let _ = tauri::async_runtime::block_on(state.orchestration.stop());
            }
        }
    });
}
