use crate::action_engine::build_action_center;
use crate::alert_engine::{generate_wallet_alerts, psbt_quarantine_alert};
use crate::bitcoin_core_backend::BitcoinCoreBackend;
use crate::blockchain_backend::BlockchainBackend;
use crate::database::{
    acknowledge_alert as acknowledge_alert_in_database, clear_local_cache as clear_database_cache,
    delete_coin_set as delete_database_coin_set, dismiss_action as dismiss_database_action,
    initialize_database, load_alerts, load_coin_sets as load_database_coin_sets,
    load_current_wallet_report, load_dismissed_action_ids, load_labels as load_database_labels,
    merge_persisted_utxo_metadata, save_alerts, save_coin_set as save_database_coin_set,
    save_consolidation_plan, save_label, save_spend_simulation, save_wallet_report,
    wallet_totals_from_utxos,
};
use crate::descriptor_diff::{compare_descriptor_inputs, DescriptorDiffSummary};
use crate::electrum_backend::ElectrumBackend;
use crate::esplora_backend::EsploraBackend;
use crate::mock_backend::{build_demo_import, MockBackend};
use crate::models::{
    Alert, AuditFinding, CoinSet, ConfidenceLevel, ConsolidationPlan, FeeEstimate, Label, Network,
    QuarantineStatus, Severity, SourceCategory, SpendSimulation, Utxo, UtxoStatus, WalletReport,
};
use crate::provenance_engine::enrich_wallet_provenance;
use crate::psbt_linter::{analyze_psbt_text, PsbtAnalysisResult};
use crate::wallet_import::{validate_import, ImportKind, ImportRequest};
use rusqlite::Connection;
use serde::Deserialize;
use std::path::Path;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    report: Mutex<Option<WalletReport>>,
    database: Mutex<Connection>,
    data_path: Option<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            report: Mutex::new(None),
            database: Mutex::new(
                crate::database::initialize_memory_database().expect("memory database initializes"),
            ),
            data_path: None,
        }
    }
}

impl AppState {
    pub fn new(path: impl AsRef<Path>) -> rusqlite::Result<Self> {
        let data_path = path.as_ref().display().to_string();
        Ok(Self {
            report: Mutex::new(None),
            database: Mutex::new(initialize_database(path)?),
            data_path: Some(data_path),
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

#[derive(Debug, Clone, Deserialize)]
pub struct LabelPatch {
    pub target_type: String,
    pub target_id: String,
    pub label: String,
    pub category: SourceCategory,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CoinSetPatch {
    pub id: Option<String>,
    pub name: String,
    pub intent: String,
    pub outpoints: Vec<String>,
    pub notes: Option<String>,
}

#[tauri::command]
pub fn import_wallet(
    request: ImportRequest,
    state: State<'_, AppState>,
) -> Result<WalletReport, String> {
    let bitcoin_core_config = request.bitcoin_core_rpc.clone();
    let electrum_config = request.electrum.clone();
    let esplora_config = request.esplora.clone();
    let validated = validate_import(request).map_err(|error| error.to_string())?;
    let mut report = if matches!(
        validated.backend,
        crate::models::BackendKind::BitcoinCoreRpc
    ) {
        let config = bitcoin_core_config
            .ok_or_else(|| "Bitcoin Core RPC mode requires local RPC configuration.".to_string())?;
        BitcoinCoreBackend::new(config)
            .map_err(|error| error.to_string())?
            .scan_wallet(&validated)
            .map_err(|error| error.to_string())?
    } else if matches!(
        validated.backend,
        crate::models::BackendKind::Electrum | crate::models::BackendKind::PublicElectrum
    ) {
        let config = electrum_config
            .ok_or_else(|| "Electrum mode requires backend configuration.".to_string())?;
        ElectrumBackend::new(config, validated.backend)
            .map_err(|error| error.to_string())?
            .scan_wallet(&validated)
            .map_err(|error| error.to_string())?
    } else if matches!(
        validated.backend,
        crate::models::BackendKind::Esplora | crate::models::BackendKind::PublicEsplora
    ) {
        let config = esplora_config
            .ok_or_else(|| "Esplora mode requires backend configuration.".to_string())?;
        EsploraBackend::new(config)
            .map_err(|error| error.to_string())?
            .scan_wallet(&validated)
            .map_err(|error| error.to_string())?
    } else {
        MockBackend.scan_wallet(&validated)
    };
    {
        let database = state
            .database
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        merge_persisted_utxo_metadata(&database, &mut report).map_err(|error| error.to_string())?;
        refresh_report_derivatives(&mut report, &database)?;
    }
    {
        let mut database = state
            .database
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        save_wallet_report(&mut database, &report).map_err(|error| error.to_string())?;
        save_alerts(
            &database,
            &report.wallet.id,
            &generate_wallet_alerts(&report),
        )
        .map_err(|error| error.to_string())?;
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
        refresh_report_derivatives(&mut report, &database)?;
    }
    {
        let mut database = state
            .database
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        save_wallet_report(&mut database, &report).map_err(|error| error.to_string())?;
        save_alerts(
            &database,
            &report.wallet.id,
            &generate_wallet_alerts(&report),
        )
        .map_err(|error| error.to_string())?;
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

    let mut updated = {
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
        refresh_report_derivatives(&mut updated, &database)?;
        save_wallet_report(&mut database, &updated).map_err(|error| error.to_string())?;
    }

    *state
        .report
        .lock()
        .map_err(|_| "State lock poisoned".to_string())? = Some(updated.clone());

    Ok(updated)
}

#[tauri::command]
pub fn compare_descriptors(left: String, right: String, network: Network) -> DescriptorDiffSummary {
    compare_descriptor_inputs(&left, &right, network)
}

#[tauri::command]
pub fn analyze_psbt(
    psbt: String,
    state: State<'_, AppState>,
) -> Result<PsbtAnalysisResult, String> {
    let report = state
        .report
        .lock()
        .map_err(|_| "State lock poisoned".to_string())?
        .clone()
        .ok_or_else(|| "No wallet loaded".to_string())?;
    let analysis = analyze_psbt_text(&psbt, &report)?;
    if analysis
        .warnings
        .iter()
        .any(|warning| warning.id == "quarantined_input")
    {
        let database = state
            .database
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        save_alerts(
            &database,
            &report.wallet.id,
            &[psbt_quarantine_alert(&report.wallet.id)],
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(analysis)
}

#[tauri::command]
pub fn get_alerts(state: State<'_, AppState>) -> Result<Vec<Alert>, String> {
    let report = state
        .report
        .lock()
        .map_err(|_| "State lock poisoned".to_string())?
        .clone()
        .ok_or_else(|| "No wallet loaded".to_string())?;
    let database = state
        .database
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    load_alerts(&database, &report.wallet.id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn acknowledge_alert(
    alert_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Alert>, String> {
    let report = state
        .report
        .lock()
        .map_err(|_| "State lock poisoned".to_string())?
        .clone()
        .ok_or_else(|| "No wallet loaded".to_string())?;
    let database = state
        .database
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    acknowledge_alert_in_database(&database, &alert_id).map_err(|error| error.to_string())?;
    load_alerts(&database, &report.wallet.id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_labels(state: State<'_, AppState>) -> Result<Vec<Label>, String> {
    let report = current_report(&state)?;
    let database = state
        .database
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    load_database_labels(&database, &report.wallet.id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn upsert_label(patch: LabelPatch, state: State<'_, AppState>) -> Result<Vec<Label>, String> {
    validate_label_patch(&patch)?;
    let report = current_report(&state)?;
    let label = Label {
        id: format!(
            "label:{}:{}:{}",
            report.wallet.id,
            patch.target_type.trim(),
            patch.target_id.trim()
        ),
        wallet_id: report.wallet.id.clone(),
        target_type: patch.target_type.trim().to_string(),
        target_id: patch.target_id.trim().to_string(),
        label: patch.label.trim().to_string(),
        category: patch.category,
    };
    let database = state
        .database
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    save_label(&database, &label).map_err(|error| error.to_string())?;
    load_database_labels(&database, &report.wallet.id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_coin_sets(state: State<'_, AppState>) -> Result<Vec<CoinSet>, String> {
    let report = current_report(&state)?;
    let database = state
        .database
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    load_database_coin_sets(&database, &report.wallet.id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_coin_set(
    patch: CoinSetPatch,
    state: State<'_, AppState>,
) -> Result<Vec<CoinSet>, String> {
    let report = current_report(&state)?;
    validate_coin_set_patch(&patch, &report)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = patch.id.unwrap_or_else(|| {
        format!(
            "coinset:{}:{}",
            report.wallet.id,
            chrono::Utc::now().timestamp_millis()
        )
    });
    let coin_set = CoinSet {
        id,
        wallet_id: report.wallet.id.clone(),
        name: patch.name.trim().to_string(),
        intent: patch.intent.trim().to_string(),
        outpoints: unique_outpoints(patch.outpoints),
        notes: patch.notes.and_then(|notes| {
            let trimmed = notes.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }),
        created_at: now.clone(),
        updated_at: now,
    };
    let database = state
        .database
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    save_database_coin_set(&database, &coin_set).map_err(|error| error.to_string())?;
    load_database_coin_sets(&database, &report.wallet.id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_coin_set(
    coin_set_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<CoinSet>, String> {
    let report = current_report(&state)?;
    let database = state
        .database
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    delete_database_coin_set(&database, &report.wallet.id, &coin_set_id)
        .map_err(|error| error.to_string())?;
    load_database_coin_sets(&database, &report.wallet.id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn dismiss_action(
    action_id: String,
    state: State<'_, AppState>,
) -> Result<WalletReport, String> {
    let mut report = current_report(&state)?;
    {
        let database = state
            .database
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        dismiss_database_action(&database, &report.wallet.id, action_id.trim())
            .map_err(|error| error.to_string())?;
        refresh_report_derivatives(&mut report, &database)?;
    }
    *state
        .report
        .lock()
        .map_err(|_| "State lock poisoned".to_string())? = Some(report.clone());
    Ok(report)
}

#[tauri::command]
pub fn simulate_spend(
    outpoints: Vec<String>,
    destination_amount_sats: u64,
    fee_rate: u32,
    state: State<'_, AppState>,
) -> Result<SpendSimulation, String> {
    let report = current_report(&state)?;
    let selected = selected_utxos(&report, &outpoints);
    let simulation = build_spend_simulation(&selected, destination_amount_sats, fee_rate.max(1));
    let database = state
        .database
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    save_spend_simulation(&database, &report.wallet.id, &simulation)
        .map_err(|error| error.to_string())?;
    Ok(simulation)
}

#[tauri::command]
pub fn simulate_consolidation(
    outpoints: Vec<String>,
    fee_rate: u32,
    state: State<'_, AppState>,
) -> Result<ConsolidationPlan, String> {
    let report = current_report(&state)?;
    let selected = selected_utxos(&report, &outpoints);
    let plan = crate::consolidation_planner::draft_consolidation_plan(&selected, fee_rate.max(1));
    let database = state
        .database
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    save_consolidation_plan(&database, &report.wallet.id, &plan)
        .map_err(|error| error.to_string())?;
    Ok(plan)
}

#[tauri::command]
pub fn get_local_data_path(state: State<'_, AppState>) -> Option<String> {
    state.data_path.clone()
}

#[tauri::command]
pub fn clear_local_cache(state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut database = state
            .database
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        clear_database_cache(&mut database).map_err(|error| error.to_string())?;
    }

    *state
        .report
        .lock()
        .map_err(|_| "State lock poisoned".to_string())? = None;

    Ok(())
}

fn current_report(state: &State<'_, AppState>) -> Result<WalletReport, String> {
    state
        .report
        .lock()
        .map_err(|_| "State lock poisoned".to_string())?
        .clone()
        .ok_or_else(|| "No wallet loaded".to_string())
}

fn refresh_report_derivatives(
    report: &mut WalletReport,
    database: &Connection,
) -> Result<(), String> {
    enrich_wallet_provenance(report);
    let dismissed = load_dismissed_action_ids(database, &report.wallet.id)
        .map_err(|error| error.to_string())?;
    report.actions = build_action_center(report, &dismissed);
    Ok(())
}

fn validate_label_patch(patch: &LabelPatch) -> Result<(), String> {
    let target_type = patch.target_type.trim();
    if !matches!(
        target_type,
        "utxo" | "address" | "transaction" | "source" | "category"
    ) {
        return Err(
            "Label target type must be utxo, address, transaction, source, or category."
                .to_string(),
        );
    }
    if patch.target_id.trim().is_empty() {
        return Err("Label target id is required.".to_string());
    }
    if patch.label.trim().is_empty() {
        return Err("Label text is required.".to_string());
    }
    Ok(())
}

fn validate_coin_set_patch(patch: &CoinSetPatch, report: &WalletReport) -> Result<(), String> {
    if patch.name.trim().is_empty() {
        return Err("Coin set name is required.".to_string());
    }
    if patch.intent.trim().is_empty() {
        return Err("Coin set intent is required.".to_string());
    }
    if patch.outpoints.is_empty() {
        return Err("Coin set requires at least one UTXO.".to_string());
    }
    let wallet_outpoints = report
        .utxos
        .iter()
        .map(|utxo| utxo.outpoint.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    if patch
        .outpoints
        .iter()
        .any(|outpoint| !wallet_outpoints.contains(outpoint.as_str()))
    {
        return Err("Coin set includes an outpoint that is not in the loaded wallet.".to_string());
    }
    Ok(())
}

fn unique_outpoints(outpoints: Vec<String>) -> Vec<String> {
    outpoints
        .into_iter()
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn selected_utxos(report: &WalletReport, outpoints: &[String]) -> Vec<Utxo> {
    report
        .utxos
        .iter()
        .filter(|utxo| outpoints.contains(&utxo.outpoint))
        .cloned()
        .collect()
}

fn build_spend_simulation(
    selected: &[Utxo],
    destination_amount_sats: u64,
    fee_rate: u32,
) -> SpendSimulation {
    let input_amount: u64 = selected.iter().map(|utxo| utxo.amount_sats).sum();
    let input_vbytes: u32 = selected
        .iter()
        .map(|utxo| utxo.spend_vbytes_estimate.max(58))
        .sum();
    let base_vbytes = if selected.is_empty() {
        0
    } else {
        input_vbytes + 10 + 31
    };
    let change_probe_fee = u64::from(base_vbytes + 43) * u64::from(fee_rate);
    let creates_change = input_amount
        .saturating_sub(destination_amount_sats)
        .saturating_sub(change_probe_fee)
        >= 546;
    let estimated_vbytes = if creates_change {
        base_vbytes + 43
    } else {
        base_vbytes
    };
    let estimated_fee_sats = u64::from(estimated_vbytes) * u64::from(fee_rate);
    let change_amount_sats = input_amount
        .checked_sub(destination_amount_sats.saturating_add(estimated_fee_sats))
        .filter(|change| creates_change && *change > 0);
    let mut warnings = Vec::new();

    if input_amount < destination_amount_sats.saturating_add(estimated_fee_sats) {
        warnings.push(simulation_finding(
            "insufficient_inputs",
            Severity::High,
            "Selected UTXOs may not cover spend",
            "The selected UTXOs may not cover the destination amount plus estimated fees.",
            selected,
        ));
    }
    if selected
        .iter()
        .any(|utxo| utxo.quarantine_status != QuarantineStatus::None)
    {
        warnings.push(simulation_finding(
            "quarantined_coin_risk",
            Severity::High,
            "Quarantined coin included",
            "This simulated spend includes one or more quarantined UTXOs.",
            selected,
        ));
    }
    if mixed_labels_or_categories(selected) {
        warnings.push(simulation_finding(
            "label_mixing_risk",
            Severity::Medium,
            "Label mixing risk",
            "This simulated spend combines different labels or source categories and could link histories.",
            selected,
        ));
    }
    if creates_change && mixed_labels_or_categories(selected) {
        warnings.push(simulation_finding(
            "toxic_change_risk",
            Severity::Medium,
            "Toxic change risk",
            "If this simulated spend created change, that change could inherit the combined input history.",
            selected,
        ));
    }

    SpendSimulation {
        selected_outpoints: selected.iter().map(|utxo| utxo.outpoint.clone()).collect(),
        destination_amount_sats,
        fee_estimate: FeeEstimate {
            fee_rate,
            estimated_vbytes,
            estimated_fee_sats,
        },
        change_amount_sats,
        warnings,
    }
}

fn mixed_labels_or_categories(selected: &[Utxo]) -> bool {
    let labels = selected
        .iter()
        .map(|utxo| utxo.label.as_deref().unwrap_or("Unlabeled"))
        .collect::<std::collections::BTreeSet<_>>();
    let categories = selected
        .iter()
        .map(|utxo| format!("{:?}", utxo.source_category))
        .collect::<std::collections::BTreeSet<_>>();
    labels.len() > 1 || categories.len() > 1
}

fn simulation_finding(
    id: &str,
    severity: Severity,
    title: &str,
    explanation: &str,
    selected: &[Utxo],
) -> AuditFinding {
    AuditFinding {
        id: id.to_string(),
        severity,
        title: title.to_string(),
        explanation: explanation.to_string(),
        recommended_action: "Review this simulation before signing elsewhere. XpubShield does not sign or broadcast.".to_string(),
        affected_utxos: selected.iter().map(|utxo| utxo.outpoint.clone()).collect(),
        affected_transactions: Vec::new(),
        confidence_level: ConfidenceLevel::Medium,
        heuristic_notes: "Simulation only; this heuristic is not definitive.".to_string(),
    }
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
        bitcoin_core_rpc: None,
        electrum: None,
        esplora: None,
        public_api_acknowledged: false,
        network_policy: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blockchain_backend::BlockchainBackend;
    use crate::mock_backend::{build_demo_import, MockBackend};

    #[test]
    fn spend_simulation_flags_quarantined_and_mixed_inputs() {
        let mut report = MockBackend.scan_wallet(&build_demo_import());
        report.utxos[0].label = Some("Exchange".to_string());
        report.utxos[1].label = Some("P2P".to_string());
        report.utxos[1].quarantine_status = QuarantineStatus::Manual;
        let selected = vec![report.utxos[0].clone(), report.utxos[1].clone()];

        let simulation = build_spend_simulation(&selected, 100_000, 25);

        assert!(simulation.change_amount_sats.is_some());
        assert!(simulation
            .warnings
            .iter()
            .any(|finding| finding.id == "quarantined_coin_risk"));
        assert!(simulation
            .warnings
            .iter()
            .any(|finding| finding.id == "label_mixing_risk"));
    }

    #[test]
    fn label_patch_rejects_unknown_targets() {
        let patch = LabelPatch {
            target_type: "counterparty".to_string(),
            target_id: "abc".to_string(),
            label: "Nope".to_string(),
            category: SourceCategory::Other,
        };

        assert!(validate_label_patch(&patch).is_err());
    }
}
