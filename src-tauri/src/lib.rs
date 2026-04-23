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

use tauri_commands::{get_current_wallet, import_wallet, load_demo_wallet, AppState};

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            import_wallet,
            load_demo_wallet,
            get_current_wallet
        ])
        .run(tauri::generate_context!())
        .expect("failed to run UTXO Sentinel");
}
