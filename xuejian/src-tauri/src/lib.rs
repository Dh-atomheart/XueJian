mod commands;
mod db;
mod secrets;

use commands::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize database
            let db = match db::init_db(app.handle()) {
                Ok(db) => {
                    log::info!("Database initialized successfully");
                    db
                }
                Err(e) => {
                    log::error!("Failed to initialize database: {}", e);
                    return Err(Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Database initialization failed: {}", e),
                    )));
                }
            };

            // Initialize secret store
            let secrets = match secrets::init_secrets(app.handle()) {
                Ok(secrets) => {
                    log::info!("Secret store initialized successfully");
                    secrets
                }
                Err(e) => {
                    log::error!("Failed to initialize secret store: {}", e);
                    return Err(Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Secret store initialization failed: {}", e),
                    )));
                }
            };

            // Create and manage app state
            let state = AppState::new(db, secrets);
            app.manage(state);

            log::info!("学笺应用启动成功");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Document commands
            commands::documents::list_documents,
            commands::documents::get_document,
            commands::documents::create_document,
            commands::documents::update_document_status,
            commands::documents::delete_document,

            // Card commands
            commands::cards::list_due_cards,
            commands::cards::create_card,
            commands::cards::update_card_review,

            // Settings commands
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::list_api_configs,
            commands::settings::create_api_config,
            commands::settings::delete_api_config,
            commands::settings::store_api_key,
            commands::settings::test_api_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
