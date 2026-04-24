use crate::blockchain_backend::BlockchainBackend;
use crate::database::{
    initialize_database, load_current_wallet_report, merge_persisted_utxo_metadata,
    save_wallet_report, wallet_totals_from_utxos,
};
use crate::mock_backend::{build_demo_import, MockBackend};
use crate::models::{Network, QuarantineStatus, SourceCategory, UtxoStatus, WalletReport};
use crate::wallet_import::{validate_import, ImportKind, ImportRequest};
use rusqlite::Connection;
use serde::Deserialize;
use std::path::Path;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    report: Mutex<Option<WalletReport>>,
    database: Mutex<Connection>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            report: Mutex::new(None),
            database: Mutex::new(
                crate::database::initialize_memory_database().expect("memory database initializes"),
            ),
        }
    }
}

impl AppState {
    pub fn new(path: impl AsRef<Path>) -> rusqlite::Result<Self> {
        Ok(Self {
            report: Mutex::new(None),
            database: Mutex::new(initialize_database(path)?),
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct UtxoMetadataPatch {
    pub label: Option<Option<String>>,
    pub source_label: Option<Option<String>>,
    pub source_category: Option<SourceCategory>,
    pub quarantine_status: Option<QuarantineStatus>,
    pub spendability_status: Option<UtxoStatus>,
}

#[tauri::command]
pub fn import_wallet(
    request: ImportRequest,
    state: State<'_, AppState>,
) -> Result<WalletReport, String> {
    let validated = validate_import(request).map_err(|error| error.to_string())?;
    let mut report = MockBackend.scan_wallet(&validated);
    {
        let database = state
            .database
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        merge_persisted_utxo_metadata(&database, &mut report).map_err(|error| error.to_string())?;
    }
    {
        let mut database = state
            .database
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        save_wallet_report(&mut database, &report).map_err(|error| error.to_string())?;
    }
    *state
        .report
        .lock()
        .map_err(|_| "State lock poisoned".to_string())? = Some(report.clone());
    Ok(report)
}

#[tauri::command]
pub fn load_demo_wallet(state: State<'_, AppState>) -> Result<WalletReport, String> {
    let mut report = MockBackend.scan_wallet(&build_demo_import());
    {
        let database = state
            .database
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        merge_persisted_utxo_metadata(&database, &mut report).map_err(|error| error.to_string())?;
    }
    {
        let mut database = state
            .database
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        save_wallet_report(&mut database, &report).map_err(|error| error.to_string())?;
    }
    *state
        .report
        .lock()
        .map_err(|_| "State lock poisoned".to_string())? = Some(report.clone());
    Ok(report)
}

#[tauri::command]
pub fn get_current_wallet(state: State<'_, AppState>) -> Result<Option<WalletReport>, String> {
    if let Some(report) = state
        .report
        .lock()
        .map_err(|_| "State lock poisoned".to_string())?
        .clone()
    {
        return Ok(Some(report));
    }

    let loaded = {
        let database = state
            .database
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        load_current_wallet_report(&database).map_err(|error| error.to_string())?
    };

    if let Some(report) = loaded.clone() {
        *state
            .report
            .lock()
            .map_err(|_| "State lock poisoned".to_string())? = Some(report);
    }

    Ok(loaded)
}

#[tauri::command]
pub fn update_utxos(
    outpoints: Vec<String>,
    patch: UtxoMetadataPatch,
    state: State<'_, AppState>,
) -> Result<WalletReport, String> {
    if outpoints.is_empty() {
        return state
            .report
            .lock()
            .map_err(|_| "State lock poisoned".to_string())?
            .clone()
            .ok_or_else(|| "No wallet loaded".to_string());
    }

    let updated = {
        let mut report_guard = state
            .report
            .lock()
            .map_err(|_| "State lock poisoned".to_string())?;
        let report = report_guard
            .as_mut()
            .ok_or_else(|| "No wallet loaded".to_string())?;

        for utxo in report
            .utxos
            .iter_mut()
            .filter(|utxo| outpoints.contains(&utxo.outpoint))
        {
            if let Some(label) = patch.label.clone() {
                utxo.label = label;
            }
            if let Some(source_label) = patch.source_label.clone() {
                utxo.source_label = source_label;
            }
            if let Some(source_category) = patch.source_category {
                utxo.source_category = source_category;
            }
            if let Some(quarantine_status) = patch.quarantine_status {
                utxo.quarantine_status = quarantine_status;
            }
            if let Some(spendability_status) = patch.spendability_status {
                utxo.spendability_status = spendability_status;
            }
        }

        report.totals = wallet_totals_from_utxos(&report.utxos);
        report.clone()
    };

    {
        let mut database = state
            .database
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        save_wallet_report(&mut database, &updated).map_err(|error| error.to_string())?;
    }

    Ok(updated)
}

#[allow(dead_code)]
pub fn demo_request() -> ImportRequest {
    ImportRequest {
        import_kind: ImportKind::Demo,
        wallet_name: Some("Demo watch-only wallet".to_string()),
        descriptor: None,
        xpub: None,
        network: Network::Mainnet,
        script_type: None,
        account_path_guess: None,
        gap_limit: Some(20),
        backend: Some(crate::models::BackendKind::Mock),
        public_api_acknowledged: false,
    }
}
