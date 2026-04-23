use crate::blockchain_backend::BlockchainBackend;
use crate::mock_backend::{build_demo_import, MockBackend};
use crate::models::{Network, WalletReport};
use crate::wallet_import::{validate_import, ImportKind, ImportRequest};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    report: Mutex<Option<WalletReport>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            report: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn import_wallet(
    request: ImportRequest,
    state: State<'_, AppState>,
) -> Result<WalletReport, String> {
    let validated = validate_import(request).map_err(|error| error.to_string())?;
    let report = MockBackend.scan_wallet(&validated);
    *state.report.lock().map_err(|_| "State lock poisoned".to_string())? = Some(report.clone());
    Ok(report)
}

#[tauri::command]
pub fn load_demo_wallet(state: State<'_, AppState>) -> Result<WalletReport, String> {
    let report = MockBackend.scan_wallet(&build_demo_import());
    *state.report.lock().map_err(|_| "State lock poisoned".to_string())? = Some(report.clone());
    Ok(report)
}

#[tauri::command]
pub fn get_current_wallet(state: State<'_, AppState>) -> Result<Option<WalletReport>, String> {
    Ok(state
        .report
        .lock()
        .map_err(|_| "State lock poisoned".to_string())?
        .clone())
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
