use crate::action_engine::build_action_center;
use crate::audit_engine::audit_wallet;
use crate::mock_backend::privacy_score_for_backend;
use crate::models::{
    Alert, CoinSet, ConsolidationPlan, Descriptor, Label, ProvenanceAssessment, QuarantineStatus,
    Severity, SourceCategory, SpendSimulation, Transaction, Utxo, UtxoStatus, Wallet, WalletReport,
    WalletTotals,
};
use crate::provenance_engine::enrich_wallet_provenance;
use rusqlite::types::Type;
use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::Path;

pub const INITIAL_SCHEMA: &str = include_str!("../migrations/001_initial_schema.sql");

pub fn initialize_database(path: impl AsRef<Path>) -> Result<Connection> {
    let path = path.as_ref();
    let connection = Connection::open(path)?;
    harden_connection(&connection)?;
    restrict_database_file_permissions(path)?;
    connection.execute_batch(INITIAL_SCHEMA)?;
    Ok(connection)
}

pub fn initialize_memory_database() -> Result<Connection> {
    let connection = Connection::open_in_memory()?;
    harden_connection(&connection)?;
    connection.execute_batch(INITIAL_SCHEMA)?;
    Ok(connection)
}

fn harden_connection(connection: &Connection) -> Result<()> {
    connection.pragma_update(None, "secure_delete", "ON")?;
    Ok(())
}

#[cfg(unix)]
fn restrict_database_file_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let permissions = std::fs::Permissions::from_mode(0o600);
    std::fs::set_permissions(path, permissions)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
    Ok(())
}

#[cfg(not(unix))]
fn restrict_database_file_permissions(_path: &Path) -> Result<()> {
    Ok(())
}

pub fn save_wallet_report(connection: &mut Connection, report: &WalletReport) -> Result<()> {
    let tx = connection.transaction()?;
    tx.execute(
        "DELETE FROM transaction_outputs WHERE txid IN (SELECT txid FROM transactions WHERE wallet_id = ?1)",
        params![report.wallet.id],
    )?;
    tx.execute(
        "DELETE FROM transaction_inputs WHERE txid IN (SELECT txid FROM transactions WHERE wallet_id = ?1)",
        params![report.wallet.id],
    )?;
    for table in [
        "provenance_assessments",
        "audit_findings",
        "transactions",
        "utxos",
        "derived_addresses",
        "descriptors",
    ] {
        tx.execute(
            &format!("DELETE FROM {table} WHERE wallet_id = ?1"),
            params![report.wallet.id],
        )?;
    }
    tx.execute(
        "INSERT INTO wallets (id, name, network, backend, gap_limit, descriptor_based, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           network = excluded.network,
           backend = excluded.backend,
           gap_limit = excluded.gap_limit,
           descriptor_based = excluded.descriptor_based",
        params![
            report.wallet.id,
            report.wallet.name,
            encode_enum(&report.wallet.network)?,
            encode_enum(&report.wallet.backend)?,
            report.wallet.gap_limit,
            bool_to_i64(report.wallet.descriptor_based),
            report.wallet.created_at
        ],
    )?;

    for descriptor in &report.descriptors {
        tx.execute(
            "INSERT INTO descriptors
             (id, wallet_id, keychain, descriptor, checksum, script_type, master_fingerprint, account_path, is_descriptor_based)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                descriptor.id,
                descriptor.wallet_id,
                encode_enum(&descriptor.keychain)?,
                descriptor.descriptor,
                descriptor.checksum,
                encode_enum(&descriptor.script_type)?,
                descriptor.master_fingerprint,
                descriptor.account_path,
                bool_to_i64(descriptor.is_descriptor_based)
            ],
        )?;
    }

    for address in &report.derived_addresses {
        tx.execute(
            "INSERT INTO derived_addresses
             (id, wallet_id, keychain, address_index, address, derivation_path, script_type, used, receive_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                address.id,
                address.wallet_id,
                encode_enum(&address.keychain)?,
                address.index,
                address.address,
                address.derivation_path,
                encode_enum(&address.script_type)?,
                bool_to_i64(address.used),
                address.receive_count
            ],
        )?;
    }

    for transaction in &report.transactions {
        tx.execute(
            "INSERT INTO transactions
             (txid, wallet_id, block_height, block_time, confirmations, fee_sats, vsize, explanation)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                transaction.txid,
                report.wallet.id,
                transaction.block_height,
                transaction.block_time,
                transaction.confirmations,
                transaction.fee_sats,
                transaction.vsize,
                transaction.explanation
            ],
        )?;
    }

    for utxo in &report.utxos {
        tx.execute(
            "INSERT INTO utxos
             (outpoint, wallet_id, txid, vout, amount_sats, address, script_pubkey, script_type, derivation_path,
              confirmations, block_height, block_time, label, source_label, source_category, is_change, source_txid,
              spend_vbytes_estimate, audit_flags_json, quarantine_status, spendability_status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
            params![
                utxo.outpoint,
                report.wallet.id,
                utxo.txid,
                utxo.vout,
                utxo.amount_sats,
                utxo.address,
                utxo.script_pubkey,
                encode_enum(&utxo.script_type)?,
                utxo.derivation_path,
                utxo.confirmations,
                utxo.block_height,
                utxo.block_time,
                utxo.label,
                utxo.source_label,
                encode_enum(&utxo.source_category)?,
                bool_to_i64(utxo.is_change),
                utxo.source_txid,
                utxo.spend_vbytes_estimate,
                encode_json(&utxo.audit_flags)?,
                encode_enum(&utxo.quarantine_status)?,
                encode_enum(&utxo.spendability_status)?
            ],
        )?;
        save_provenance_assessment_tx(&tx, &report.wallet.id, utxo)?;
    }

    for finding in &report.findings {
        tx.execute(
            "INSERT INTO audit_findings
             (id, wallet_id, severity, title, explanation, recommended_action, affected_utxos_json,
              affected_transactions_json, confidence_level, heuristic_notes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                finding.id,
                report.wallet.id,
                encode_enum(&finding.severity)?,
                finding.title,
                finding.explanation,
                finding.recommended_action,
                encode_json(&finding.affected_utxos)?,
                encode_json(&finding.affected_transactions)?,
                encode_enum(&finding.confidence_level)?,
                finding.heuristic_notes
            ],
        )?;
    }

    tx.commit()
}

fn save_provenance_assessment_tx(
    tx: &rusqlite::Transaction<'_>,
    wallet_id: &str,
    utxo: &Utxo,
) -> Result<()> {
    tx.execute(
        "INSERT INTO provenance_assessments
         (outpoint, wallet_id, source_kind, entity_label, category, confidence_level, evidence_json, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            utxo.outpoint,
            wallet_id,
            encode_enum(&utxo.provenance.source_kind)?,
            utxo.provenance.entity_label,
            encode_enum(&utxo.provenance.category)?,
            encode_enum(&utxo.provenance.confidence_level)?,
            encode_json(&utxo.provenance.evidence)?,
            utxo.provenance.updated_at
        ],
    )?;
    Ok(())
}

pub fn load_current_wallet_report(connection: &Connection) -> Result<Option<WalletReport>> {
    let Some(wallet) = load_current_wallet(connection)? else {
        return Ok(None);
    };

    let descriptors = load_descriptors(connection, &wallet.id)?;
    let addresses = load_addresses(connection, &wallet.id)?;
    let transactions = load_transactions(connection, &wallet.id)?;
    let mut utxos = load_utxos(connection, &wallet.id)?;
    let persisted_metadata = utxo_metadata_by_outpoint(&utxos);
    let (findings, scores, totals) = audit_wallet(&wallet, &addresses, &mut utxos);
    apply_utxo_metadata(&mut utxos, &persisted_metadata);
    let dismissed_actions = load_dismissed_action_ids(connection, &wallet.id)?;

    let mut report = WalletReport {
        backend_privacy: privacy_score_for_backend(wallet.backend),
        wallet,
        descriptors,
        derived_addresses: addresses,
        transactions,
        utxos,
        findings,
        scores,
        totals,
        actions: Vec::new(),
        provenance_summary: Default::default(),
    };
    enrich_wallet_provenance(&mut report);
    report.actions = build_action_center(&report, &dismissed_actions);

    Ok(Some(report))
}

pub fn merge_persisted_utxo_metadata(
    connection: &Connection,
    report: &mut WalletReport,
) -> Result<()> {
    let saved = load_utxos(connection, &report.wallet.id)?;
    let metadata = utxo_metadata_by_outpoint(&saved);
    apply_utxo_metadata(&mut report.utxos, &metadata);
    report.totals = wallet_totals_from_utxos(&report.utxos);
    Ok(())
}

pub fn wallet_totals_from_utxos(utxos: &[Utxo]) -> WalletTotals {
    let mut by_category = BTreeMap::new();
    for utxo in utxos {
        let category = format!("{:?}", utxo.source_category);
        *by_category.entry(category).or_insert(0) += utxo.amount_sats;
    }

    WalletTotals {
        balance_sats: utxos.iter().map(|utxo| utxo.amount_sats).sum(),
        utxo_count: utxos.len(),
        largest_utxo_sats: utxos.iter().map(|utxo| utxo.amount_sats).max().unwrap_or(0),
        smallest_utxo_sats: utxos.iter().map(|utxo| utxo.amount_sats).min().unwrap_or(0),
        by_category,
    }
}

pub fn save_alerts(connection: &Connection, wallet_id: &str, alerts: &[Alert]) -> Result<()> {
    for alert in alerts {
        connection.execute(
            "INSERT OR IGNORE INTO alerts (id, wallet_id, severity, title, message, acknowledged, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                alert.id,
                wallet_id,
                encode_enum(&alert.severity)?,
                alert.title,
                alert.message,
                bool_to_i64(alert.acknowledged),
                alert.created_at
            ],
        )?;
    }
    Ok(())
}

pub fn load_alerts(connection: &Connection, wallet_id: &str) -> Result<Vec<Alert>> {
    let mut statement = connection.prepare(
        "SELECT id, severity, title, message, acknowledged, created_at
         FROM alerts WHERE wallet_id = ?1 ORDER BY acknowledged ASC, created_at DESC",
    )?;
    let rows = statement
        .query_map(params![wallet_id], |row| {
            Ok(Alert {
                id: row.get(0)?,
                severity: decode_enum::<Severity>(row.get(1)?)?,
                title: row.get(2)?,
                message: row.get(3)?,
                acknowledged: i64_to_bool(row.get(4)?),
                created_at: row.get(5)?,
            })
        })?
        .collect();
    rows
}

pub fn acknowledge_alert(connection: &Connection, alert_id: &str) -> Result<()> {
    connection.execute(
        "UPDATE alerts SET acknowledged = 1 WHERE id = ?1",
        params![alert_id],
    )?;
    Ok(())
}

pub fn save_label(connection: &Connection, label: &Label) -> Result<()> {
    connection.execute(
        "INSERT INTO labels (id, wallet_id, target_type, target_id, label, category, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)
         ON CONFLICT(wallet_id, target_type, target_id) DO UPDATE SET
           label = excluded.label,
           category = excluded.category,
           updated_at = CURRENT_TIMESTAMP",
        params![
            label.id,
            label.wallet_id,
            label.target_type,
            label.target_id,
            label.label,
            encode_enum(&label.category)?
        ],
    )?;
    Ok(())
}

pub fn load_labels(connection: &Connection, wallet_id: &str) -> Result<Vec<Label>> {
    let mut statement = connection.prepare(
        "SELECT id, wallet_id, target_type, target_id, label, category
         FROM labels WHERE wallet_id = ?1 ORDER BY target_type, target_id",
    )?;
    let rows = statement
        .query_map(params![wallet_id], |row| {
            Ok(Label {
                id: row.get(0)?,
                wallet_id: row.get(1)?,
                target_type: row.get(2)?,
                target_id: row.get(3)?,
                label: row.get(4)?,
                category: decode_enum(row.get::<_, String>(5)?)?,
            })
        })?
        .collect();
    rows
}

pub fn load_coin_sets(connection: &Connection, wallet_id: &str) -> Result<Vec<CoinSet>> {
    let mut statement = connection.prepare(
        "SELECT id, wallet_id, name, intent, notes, created_at, updated_at
         FROM coin_sets WHERE wallet_id = ?1 ORDER BY updated_at DESC, name ASC",
    )?;
    let mut sets = statement
        .query_map(params![wallet_id], |row| {
            Ok(CoinSet {
                id: row.get(0)?,
                wallet_id: row.get(1)?,
                name: row.get(2)?,
                intent: row.get(3)?,
                outpoints: Vec::new(),
                notes: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

    for set in &mut sets {
        set.outpoints = load_coin_set_members(connection, &set.id)?;
    }

    Ok(sets)
}

pub fn save_coin_set(connection: &Connection, coin_set: &CoinSet) -> Result<()> {
    connection.execute(
        "INSERT INTO coin_sets (id, wallet_id, name, intent, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           intent = excluded.intent,
           notes = excluded.notes,
           updated_at = excluded.updated_at
         WHERE coin_sets.wallet_id = excluded.wallet_id",
        params![
            coin_set.id,
            coin_set.wallet_id,
            coin_set.name,
            coin_set.intent,
            coin_set.notes,
            coin_set.created_at,
            coin_set.updated_at
        ],
    )?;
    connection.execute(
        "DELETE FROM coin_set_members WHERE coin_set_id = ?1",
        params![coin_set.id],
    )?;
    for outpoint in &coin_set.outpoints {
        connection.execute(
            "INSERT OR IGNORE INTO coin_set_members (coin_set_id, outpoint) VALUES (?1, ?2)",
            params![coin_set.id, outpoint],
        )?;
    }
    Ok(())
}

pub fn delete_coin_set(connection: &Connection, wallet_id: &str, coin_set_id: &str) -> Result<()> {
    connection.execute(
        "DELETE FROM coin_sets WHERE wallet_id = ?1 AND id = ?2",
        params![wallet_id, coin_set_id],
    )?;
    Ok(())
}

pub fn dismiss_action(connection: &Connection, wallet_id: &str, action_id: &str) -> Result<()> {
    let id = format!("dismissed:{wallet_id}:{action_id}");
    connection.execute(
        "INSERT OR IGNORE INTO dismissed_actions (id, wallet_id, action_id, dismissed_at)
         VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)",
        params![id, wallet_id, action_id],
    )?;
    Ok(())
}

pub fn load_dismissed_action_ids(
    connection: &Connection,
    wallet_id: &str,
) -> Result<BTreeSet<String>> {
    let mut statement =
        connection.prepare("SELECT action_id FROM dismissed_actions WHERE wallet_id = ?1")?;
    let rows = statement
        .query_map(params![wallet_id], |row| row.get::<_, String>(0))?
        .collect::<Result<BTreeSet<_>>>()?;
    Ok(rows)
}

fn load_coin_set_members(connection: &Connection, coin_set_id: &str) -> Result<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT outpoint FROM coin_set_members WHERE coin_set_id = ?1 ORDER BY outpoint",
    )?;
    let members = statement
        .query_map(params![coin_set_id], |row| row.get::<_, String>(0))?
        .collect();
    members
}

pub fn save_spend_simulation(
    connection: &Connection,
    wallet_id: &str,
    simulation: &SpendSimulation,
) -> Result<()> {
    let id = format!(
        "spend:{}:{}",
        wallet_id,
        chrono::Utc::now().timestamp_millis()
    );
    connection.execute(
        "INSERT INTO spend_simulations
         (id, wallet_id, selected_outpoints_json, destination_amount_sats, fee_rate,
          estimated_vbytes, estimated_fee_sats, change_amount_sats, warnings_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            id,
            wallet_id,
            encode_json(&simulation.selected_outpoints)?,
            simulation.destination_amount_sats,
            simulation.fee_estimate.fee_rate,
            simulation.fee_estimate.estimated_vbytes,
            simulation.fee_estimate.estimated_fee_sats,
            simulation.change_amount_sats,
            encode_json(&simulation.warnings)?
        ],
    )?;
    Ok(())
}

pub fn save_consolidation_plan(
    connection: &Connection,
    wallet_id: &str,
    plan: &ConsolidationPlan,
) -> Result<()> {
    let id = format!(
        "consolidation:{}:{}",
        wallet_id,
        chrono::Utc::now().timestamp_millis()
    );
    connection.execute(
        "INSERT INTO consolidation_plans
         (id, wallet_id, selected_outpoints_json, current_utxo_count, proposed_utxo_count,
          fee_rate, estimated_fee_sats, privacy_notes_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            wallet_id,
            encode_json(&plan.selected_outpoints)?,
            plan.current_utxo_count,
            plan.proposed_utxo_count,
            plan.fee_estimate.fee_rate,
            plan.fee_estimate.estimated_fee_sats,
            encode_json(&plan.privacy_notes)?
        ],
    )?;
    Ok(())
}

pub fn clear_local_cache(connection: &mut Connection) -> Result<()> {
    let tx = connection.transaction()?;
    for table in [
        "backend_configs",
        "settings",
        "dismissed_actions",
        "coin_set_members",
        "coin_sets",
        "provenance_assessments",
        "alerts",
        "psbt_analyses",
        "consolidation_plans",
        "spend_simulations",
        "audit_findings",
        "labels",
        "transaction_outputs",
        "transaction_inputs",
        "transactions",
        "utxos",
        "derived_addresses",
        "descriptors",
        "wallets",
    ] {
        tx.execute(&format!("DELETE FROM {table}"), [])?;
    }
    tx.commit()
}

fn load_current_wallet(connection: &Connection) -> Result<Option<Wallet>> {
    connection
        .query_row(
            "SELECT id, name, network, backend, gap_limit, descriptor_based, created_at
             FROM wallets ORDER BY created_at DESC LIMIT 1",
            [],
            |row| {
                Ok(Wallet {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    network: decode_enum(row.get::<_, String>(2)?)?,
                    backend: decode_enum(row.get::<_, String>(3)?)?,
                    gap_limit: row.get(4)?,
                    descriptor_based: i64_to_bool(row.get(5)?),
                    created_at: row.get(6)?,
                })
            },
        )
        .optional()
}

fn load_descriptors(connection: &Connection, wallet_id: &str) -> Result<Vec<Descriptor>> {
    let mut statement = connection.prepare(
        "SELECT id, wallet_id, keychain, descriptor, checksum, script_type, master_fingerprint,
                account_path, is_descriptor_based
         FROM descriptors WHERE wallet_id = ?1 ORDER BY id",
    )?;
    let rows = statement
        .query_map(params![wallet_id], |row| {
            Ok(Descriptor {
                id: row.get(0)?,
                wallet_id: row.get(1)?,
                keychain: decode_enum(row.get::<_, String>(2)?)?,
                descriptor: row.get(3)?,
                checksum: row.get(4)?,
                script_type: decode_enum(row.get::<_, String>(5)?)?,
                master_fingerprint: row.get(6)?,
                account_path: row.get(7)?,
                is_descriptor_based: i64_to_bool(row.get(8)?),
            })
        })?
        .collect();
    rows
}

fn load_addresses(
    connection: &Connection,
    wallet_id: &str,
) -> Result<Vec<crate::models::DerivedAddress>> {
    let mut statement = connection.prepare(
        "SELECT id, wallet_id, keychain, address_index, address, derivation_path, script_type, used, receive_count
         FROM derived_addresses WHERE wallet_id = ?1 ORDER BY keychain, address_index",
    )?;
    let rows = statement
        .query_map(params![wallet_id], |row| {
            Ok(crate::models::DerivedAddress {
                id: row.get(0)?,
                wallet_id: row.get(1)?,
                keychain: decode_enum(row.get::<_, String>(2)?)?,
                index: row.get(3)?,
                address: row.get(4)?,
                derivation_path: row.get(5)?,
                script_type: decode_enum(row.get::<_, String>(6)?)?,
                used: i64_to_bool(row.get(7)?),
                receive_count: row.get(8)?,
            })
        })?
        .collect();
    rows
}

fn load_transactions(connection: &Connection, wallet_id: &str) -> Result<Vec<Transaction>> {
    let mut statement = connection.prepare(
        "SELECT txid, block_height, block_time, confirmations, fee_sats, vsize, explanation
         FROM transactions WHERE wallet_id = ?1 ORDER BY block_height",
    )?;
    let rows = statement
        .query_map(params![wallet_id], |row| {
            Ok(Transaction {
                txid: row.get(0)?,
                block_height: row.get(1)?,
                block_time: row.get(2)?,
                confirmations: row.get(3)?,
                fee_sats: row.get(4)?,
                vsize: row.get(5)?,
                explanation: row.get(6)?,
            })
        })?
        .collect();
    rows
}

fn load_utxos(connection: &Connection, wallet_id: &str) -> Result<Vec<Utxo>> {
    let mut statement = connection.prepare(
        "SELECT txid, vout, outpoint, amount_sats, address, script_pubkey, script_type, derivation_path,
                confirmations, block_height, block_time, label, source_label, source_category, is_change,
                source_txid, spend_vbytes_estimate, audit_flags_json, quarantine_status, spendability_status
         FROM utxos WHERE wallet_id = ?1 ORDER BY amount_sats DESC",
    )?;
    let rows = statement
        .query_map(params![wallet_id], |row| {
            Ok(Utxo {
                txid: row.get(0)?,
                vout: row.get(1)?,
                outpoint: row.get(2)?,
                amount_sats: row.get(3)?,
                address: row.get(4)?,
                script_pubkey: row.get(5)?,
                script_type: decode_enum(row.get::<_, String>(6)?)?,
                derivation_path: row.get(7)?,
                confirmations: row.get(8)?,
                block_height: row.get(9)?,
                block_time: row.get(10)?,
                label: row.get(11)?,
                source_label: row.get(12)?,
                source_category: decode_enum(row.get::<_, String>(13)?)?,
                is_change: i64_to_bool(row.get(14)?),
                source_txid: row.get(15)?,
                spend_vbytes_estimate: row.get(16)?,
                spend_cost_by_fee_rate: Vec::new(),
                audit_flags: decode_json(row.get::<_, String>(17)?)?,
                quarantine_status: decode_enum(row.get::<_, String>(18)?)?,
                spendability_status: decode_enum(row.get::<_, String>(19)?)?,
                provenance: ProvenanceAssessment::default(),
            })
        })?
        .collect();
    rows
}

#[derive(Debug, Clone)]
struct PersistedUtxoMetadata {
    label: Option<String>,
    source_label: Option<String>,
    source_category: SourceCategory,
    quarantine_status: QuarantineStatus,
    spendability_status: UtxoStatus,
}

fn utxo_metadata_by_outpoint(utxos: &[Utxo]) -> HashMap<String, PersistedUtxoMetadata> {
    utxos
        .iter()
        .map(|utxo| {
            (
                utxo.outpoint.clone(),
                PersistedUtxoMetadata {
                    label: utxo.label.clone(),
                    source_label: utxo.source_label.clone(),
                    source_category: utxo.source_category,
                    quarantine_status: utxo.quarantine_status,
                    spendability_status: utxo.spendability_status,
                },
            )
        })
        .collect()
}

fn apply_utxo_metadata(utxos: &mut [Utxo], metadata: &HashMap<String, PersistedUtxoMetadata>) {
    for utxo in utxos {
        if let Some(saved) = metadata.get(&utxo.outpoint) {
            utxo.label = saved.label.clone();
            utxo.source_label = saved.source_label.clone();
            utxo.source_category = saved.source_category;
            utxo.quarantine_status = saved.quarantine_status;
            utxo.spendability_status = saved.spendability_status;
        }
    }
}

fn encode_enum<T: Serialize>(value: &T) -> Result<String> {
    let value = serde_json::to_value(value)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
    value
        .as_str()
        .map(ToString::to_string)
        .ok_or_else(|| rusqlite::Error::InvalidParameterName("expected string enum".to_string()))
}

fn decode_enum<T: DeserializeOwned>(value: String) -> Result<T> {
    serde_json::from_value(serde_json::Value::String(value))
        .map_err(|error| rusqlite::Error::FromSqlConversionFailure(0, Type::Text, Box::new(error)))
}

fn encode_json<T: Serialize>(value: &T) -> Result<String> {
    serde_json::to_string(value)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

fn decode_json<T: DeserializeOwned>(value: String) -> Result<T> {
    serde_json::from_str(&value)
        .map_err(|error| rusqlite::Error::FromSqlConversionFailure(0, Type::Text, Box::new(error)))
}

fn bool_to_i64(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

fn i64_to_bool(value: i64) -> bool {
    value != 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_creates_phase_one_tables() {
        let connection = initialize_memory_database().unwrap();
        let count: u32 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('wallets', 'utxos', 'audit_findings', 'settings')",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(count, 4);
    }

    #[test]
    fn wallet_report_round_trips_through_sqlite() {
        use crate::blockchain_backend::BlockchainBackend;
        use crate::mock_backend::{build_demo_import, MockBackend};

        let mut connection = initialize_memory_database().unwrap();
        let report = MockBackend.scan_wallet(&build_demo_import());

        save_wallet_report(&mut connection, &report).unwrap();
        let loaded = load_current_wallet_report(&connection).unwrap().unwrap();

        assert_eq!(loaded.wallet.name, report.wallet.name);
        assert_eq!(loaded.utxos.len(), report.utxos.len());
        assert_eq!(loaded.descriptors.len(), report.descriptors.len());
    }

    #[test]
    fn persisted_utxo_metadata_overrides_fresh_scan() {
        use crate::blockchain_backend::BlockchainBackend;
        use crate::mock_backend::{build_demo_import, MockBackend};

        let mut connection = initialize_memory_database().unwrap();
        let mut report = MockBackend.scan_wallet(&build_demo_import());
        let outpoint = report.utxos[0].outpoint.clone();
        report.utxos[0].label = Some("Persistence test".to_string());
        report.utxos[0].source_label = Some("Manual source".to_string());
        report.utxos[0].source_category = SourceCategory::Gift;
        report.utxos[0].quarantine_status = QuarantineStatus::Manual;
        report.utxos[0].spendability_status = UtxoStatus::DoNotSpend;
        save_wallet_report(&mut connection, &report).unwrap();

        let mut fresh = MockBackend.scan_wallet(&build_demo_import());
        merge_persisted_utxo_metadata(&connection, &mut fresh).unwrap();
        let updated = fresh
            .utxos
            .iter()
            .find(|utxo| utxo.outpoint == outpoint)
            .unwrap();

        assert_eq!(updated.label.as_deref(), Some("Persistence test"));
        assert_eq!(updated.source_label.as_deref(), Some("Manual source"));
        assert_eq!(updated.source_category, SourceCategory::Gift);
        assert_eq!(updated.quarantine_status, QuarantineStatus::Manual);
        assert_eq!(updated.spendability_status, UtxoStatus::DoNotSpend);
    }

    #[test]
    fn alerts_round_trip_and_acknowledge() {
        use crate::blockchain_backend::BlockchainBackend;
        use crate::mock_backend::{build_demo_import, MockBackend};

        let mut connection = initialize_memory_database().unwrap();
        let report = MockBackend.scan_wallet(&build_demo_import());
        save_wallet_report(&mut connection, &report).unwrap();
        let alert = Alert {
            id: "alert_test".to_string(),
            severity: Severity::High,
            title: "Test alert".to_string(),
            message: "Local-only alert".to_string(),
            acknowledged: false,
            created_at: "2026-04-24T00:00:00Z".to_string(),
        };

        save_alerts(&connection, &report.wallet.id, &[alert]).unwrap();
        let loaded = load_alerts(&connection, &report.wallet.id).unwrap();
        assert_eq!(loaded.len(), 1);
        assert!(!loaded[0].acknowledged);

        acknowledge_alert(&connection, "alert_test").unwrap();
        let loaded = load_alerts(&connection, &report.wallet.id).unwrap();
        assert!(loaded[0].acknowledged);
    }

    #[test]
    fn clear_local_cache_removes_wallet_state() {
        use crate::blockchain_backend::BlockchainBackend;
        use crate::mock_backend::{build_demo_import, MockBackend};

        let mut connection = initialize_memory_database().unwrap();
        let report = MockBackend.scan_wallet(&build_demo_import());
        save_wallet_report(&mut connection, &report).unwrap();
        assert!(load_current_wallet_report(&connection).unwrap().is_some());

        clear_local_cache(&mut connection).unwrap();
        assert!(load_current_wallet_report(&connection).unwrap().is_none());
    }

    #[test]
    fn labels_round_trip() {
        use crate::blockchain_backend::BlockchainBackend;
        use crate::mock_backend::{build_demo_import, MockBackend};

        let mut connection = initialize_memory_database().unwrap();
        let report = MockBackend.scan_wallet(&build_demo_import());
        save_wallet_report(&mut connection, &report).unwrap();
        let label = Label {
            id: "label_wallet_utxo".to_string(),
            wallet_id: report.wallet.id.clone(),
            target_type: "utxo".to_string(),
            target_id: report.utxos[0].outpoint.clone(),
            label: "Accounting reviewed".to_string(),
            category: SourceCategory::Business,
        };

        save_label(&connection, &label).unwrap();
        let labels = load_labels(&connection, &report.wallet.id).unwrap();

        assert_eq!(labels.len(), 1);
        assert_eq!(labels[0].label, "Accounting reviewed");
        assert_eq!(labels[0].category, SourceCategory::Business);
    }

    #[test]
    fn simulations_persist() {
        use crate::blockchain_backend::BlockchainBackend;
        use crate::mock_backend::{build_demo_import, MockBackend};

        let mut connection = initialize_memory_database().unwrap();
        let report = MockBackend.scan_wallet(&build_demo_import());
        save_wallet_report(&mut connection, &report).unwrap();
        let simulation = SpendSimulation {
            selected_outpoints: vec![report.utxos[0].outpoint.clone()],
            destination_amount_sats: 100_000,
            fee_estimate: crate::models::FeeEstimate {
                fee_rate: 25,
                estimated_vbytes: 109,
                estimated_fee_sats: 2_725,
            },
            change_amount_sats: Some(24_897_275),
            warnings: Vec::new(),
        };
        let plan = ConsolidationPlan {
            selected_outpoints: vec![report.utxos[0].outpoint.clone()],
            current_utxo_count: 1,
            proposed_utxo_count: 1,
            fee_estimate: crate::models::FeeEstimate {
                fee_rate: 25,
                estimated_vbytes: 111,
                estimated_fee_sats: 2_775,
            },
            privacy_notes: vec!["Simulation only.".to_string()],
        };

        save_spend_simulation(&connection, &report.wallet.id, &simulation).unwrap();
        save_consolidation_plan(&connection, &report.wallet.id, &plan).unwrap();

        let spend_count: u32 = connection
            .query_row("SELECT COUNT(*) FROM spend_simulations", [], |row| {
                row.get(0)
            })
            .unwrap();
        let consolidation_count: u32 = connection
            .query_row("SELECT COUNT(*) FROM consolidation_plans", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(spend_count, 1);
        assert_eq!(consolidation_count, 1);
    }
}
