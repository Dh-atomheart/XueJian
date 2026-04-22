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

            let host_gateway_port = host_gateway.start().map_err(|error| {
                log::error!("Failed to start host HTTP gateway: {}", error);
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Host HTTP gateway startup failed: {error}"),
                ))
            })?;

            log::info!("Host HTTP gateway started on port {host_gateway_port}");

            let orchestration = match tasks::OrchestrationService::new(app.handle(), Some(host_gateway_port)) {
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
            commands::settings::delete_api_key,
            commands::settings::store_api_key,
            commands::settings::test_api_connection,
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
            commands::knowledge::start_knowledge_qa_workflow,
            commands::points::record_points,
            commands::points::list_points_ledger,
            commands::points::get_points_summary,
            commands::animation::start_card_animation_workflow,
            commands::animation::get_card_animation,
            commands::animation::delete_card_animation,
            commands::podcast::start_podcast_workflow,
            commands::podcast::get_podcast_episode,
            commands::podcast::list_podcast_episodes,
            commands::podcast::cancel_podcast_episode,
            commands::podcast::delete_podcast_episode,
            commands::podcast::review_podcast_script,
            commands::podcast::retry_podcast_episode,
            commands::podcast::get_podcast_audio_segments,
            commands::knowledge_graph::start_graph_build_workflow,
            commands::knowledge_graph::list_graph_nodes,
            commands::knowledge_graph::list_all_graph_edges,
            commands::knowledge_graph::list_graph_edges,
            commands::knowledge_graph::get_node_sources,
            commands::knowledge_graph::update_knowledge_node,
            commands::knowledge_graph::merge_graph_nodes,
            commands::knowledge_graph::delete_graph_node,
            commands::knowledge_graph::create_knowledge_edge,
            commands::knowledge_graph::update_knowledge_edge,
            commands::knowledge_graph::delete_knowledge_edge,
            commands::knowledge_graph::list_communities,
            commands::knowledge_graph::get_community_summary,
            commands::knowledge_graph::toggle_community_collapse,
            commands::knowledge_graph::list_graph_build_runs,
            commands::knowledge_graph::cancel_graph_build,
            commands::knowledge_graph::get_graph_stats,
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
