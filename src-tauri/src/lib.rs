pub mod alert_engine;
pub mod address_derivation;
pub mod audit_engine;
pub mod bitcoin_core_backend;
pub mod blockchain_backend;
pub mod consolidation_planner;
pub mod database;
pub mod descriptor_diff;
pub mod descriptor_parser;
pub mod esplora_backend;
pub mod fee_estimator;
pub mod graph_builder;
pub mod mock_backend;
pub mod models;
pub mod privacy_simulator;
pub mod psbt_linter;
pub mod recovery_report;
pub mod tauri_commands;
pub mod wallet_import;

use tauri::Manager;
use tauri_commands::{
    acknowledge_alert, analyze_psbt, compare_descriptors, get_alerts, get_current_wallet,
    import_wallet, load_demo_wallet, update_utxos, AppState,
};

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            app.manage(AppState::new(app_data_dir.join("xpubshield.sqlite3"))?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            import_wallet,
            load_demo_wallet,
            get_current_wallet,
            update_utxos,
            compare_descriptors,
            analyze_psbt,
            get_alerts,
            acknowledge_alert
        ])
        .run(tauri::generate_context!())
        .expect("failed to run XpubShield");
}
