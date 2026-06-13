use crate::models::{ConfidenceLevel, ScriptType, Severity, Utxo, WalletReport};
use crate::wallet_import::{reject_private_material, ImportError};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use miniscript::bitcoin::hex::FromHex;
use miniscript::bitcoin::psbt::Psbt;
use miniscript::bitcoin::{Address, Network as BitcoinNetwork, Script, Transaction};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PsbtAnalysis {
    pub summary: String,
    pub warnings: Vec<crate::models::AuditFinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PsbtAnalysisResult {
    pub summary: String,
    pub format: String,
    pub inputs: Vec<PsbtInputAnalysis>,
    pub outputs: Vec<PsbtOutputAnalysis>,
    pub fee_sats: Option<u64>,
    pub fee_rate: Option<f64>,
    pub change_detected: bool,
    pub warnings: Vec<PsbtWarning>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PsbtInputAnalysis {
    pub outpoint: String,
    pub amount_sats: Option<u64>,
    pub script_type: Option<ScriptType>,
    pub wallet_utxo: Option<Utxo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PsbtOutputAnalysis {
    pub address: String,
    pub amount_sats: u64,
    pub kind: String,
    pub reused_wallet_address: bool,
    pub dust: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PsbtWarning {
    pub id: String,
    pub severity: Severity,
    pub title: String,
    pub explanation: String,
    pub recommended_action: String,
    pub confidence: ConfidenceLevel,
}

pub fn lint_psbt_text(psbt: &str) -> Result<PsbtAnalysis, ImportError> {
    reject_private_material(psbt)?;
    Ok(PsbtAnalysis {
        summary: "PSBT linting parses raw PSBTs locally in Phase 4 commands; this compatibility helper only rejects private material.".to_string(),
        warnings: Vec::new(),
    })
}

pub fn analyze_psbt_text(
    psbt_text: &str,
    report: &WalletReport,
) -> Result<PsbtAnalysisResult, String> {
    reject_private_material(psbt_text).map_err(|error| error.to_string())?;
    let trimmed = psbt_text.trim();
    if trimmed.is_empty() {
        return Ok(empty_analysis(
            "Paste a base64 or hex PSBT to analyze it locally.",
            "unknown",
        ));
    }

    let (psbt, format) = parse_psbt(trimmed)?;
    Ok(analyze_psbt(psbt, format, report))
}

fn parse_psbt(input: &str) -> Result<(Psbt, &'static str), String> {
    if input.starts_with("cHNidP8") {
        let bytes = BASE64_STANDARD
            .decode(input)
            .map_err(|error| format!("Base64 PSBT decode failed: {error}"))?;
        return Psbt::deserialize(&bytes)
            .map(|psbt| (psbt, "base64_psbt"))
            .map_err(|error| format!("PSBT parse failed: {error}"));
    }

    let compact_hex = input.split_whitespace().collect::<String>();
    if compact_hex.to_ascii_lowercase().starts_with("70736274ff") {
        let bytes = Vec::<u8>::from_hex(&compact_hex)
            .map_err(|error| format!("Hex PSBT decode failed: {error}"))?;
        return Psbt::deserialize(&bytes)
            .map(|psbt| (psbt, "hex_psbt"))
            .map_err(|error| format!("Hex PSBT parse failed: {error}"));
    }

    Err("The pasted content is not a base64 or hex PSBT envelope.".to_string())
}

fn analyze_psbt(psbt: Psbt, format: &'static str, report: &WalletReport) -> PsbtAnalysisResult {
    let input_amounts = psbt_input_amounts(&psbt);
    let input_total = sum_if_complete(&input_amounts);
    let output_total: u64 = psbt
        .unsigned_tx
        .output
        .iter()
        .map(|output| output.value.to_sat())
        .sum();
    let fee_sats = input_total.and_then(|total| total.checked_sub(output_total));
    let vsize = estimated_vsize(&psbt.unsigned_tx);
    let fee_rate = fee_sats.map(|fee| fee as f64 / vsize.max(1) as f64);
    let wallet_addresses: BTreeSet<String> = report
        .derived_addresses
        .iter()
        .map(|address| address.address.clone())
        .collect();
    let reused_addresses: BTreeSet<String> = report
        .derived_addresses
        .iter()
        .filter(|address| address.receive_count > 1)
        .map(|address| address.address.clone())
        .collect();

    let inputs: Vec<PsbtInputAnalysis> = psbt
        .unsigned_tx
        .input
        .iter()
        .enumerate()
        .map(|(index, txin)| {
            let outpoint = txin.previous_output.to_string();
            let wallet_utxo = report
                .utxos
                .iter()
                .find(|utxo| utxo.outpoint == outpoint)
                .cloned();
            let script_type = wallet_utxo
                .as_ref()
                .map(|utxo| utxo.script_type)
                .or_else(|| input_script_type(psbt.inputs.get(index)));
            PsbtInputAnalysis {
                outpoint,
                amount_sats: input_amounts.get(index).copied().flatten(),
                script_type,
                wallet_utxo,
            }
        })
        .collect();

    let outputs: Vec<PsbtOutputAnalysis> = psbt
        .unsigned_tx
        .output
        .iter()
        .enumerate()
        .map(|(index, output)| {
            let address = Address::from_script(
                &output.script_pubkey,
                bitcoin_network(&report.wallet.network),
            )
            .map(|address| address.to_string())
            .unwrap_or_else(|_| format!("script_pubkey:{index}"));
            let wallet_owned = wallet_addresses.contains(&address);
            PsbtOutputAnalysis {
                reused_wallet_address: reused_addresses.contains(&address),
                dust: output.value.to_sat() < 1_000,
                amount_sats: output.value.to_sat(),
                kind: if wallet_owned { "change" } else { "recipient" }.to_string(),
                address,
            }
        })
        .collect();

    let warnings = lint_analysis(&psbt, &inputs, &outputs, fee_sats, fee_rate);
    let change_detected = outputs.iter().any(|output| output.kind == "change");

    PsbtAnalysisResult {
        summary: format!(
            "Parsed {} inputs and {} outputs locally from a PSBT. No signing or broadcasting was performed.",
            inputs.len(),
            outputs.len()
        ),
        format: format.to_string(),
        inputs,
        outputs,
        fee_sats,
        fee_rate,
        change_detected,
        warnings,
    }
}

fn psbt_input_amounts(psbt: &Psbt) -> Vec<Option<u64>> {
    psbt.inputs
        .iter()
        .zip(psbt.unsigned_tx.input.iter())
        .map(|(input, txin)| {
            input
                .witness_utxo
                .as_ref()
                .map(|txout| txout.value.to_sat())
                .or_else(|| {
                    input.non_witness_utxo.as_ref().and_then(|tx| {
                        tx.output
                            .get(txin.previous_output.vout as usize)
                            .map(|txout| txout.value.to_sat())
                    })
                })
        })
        .collect()
}

fn sum_if_complete(values: &[Option<u64>]) -> Option<u64> {
    values
        .iter()
        .try_fold(0u64, |total, value| value.map(|amount| total + amount))
}

fn input_script_type(input: Option<&miniscript::bitcoin::psbt::Input>) -> Option<ScriptType> {
    let script = input.and_then(|input| {
        input
            .witness_utxo
            .as_ref()
            .map(|txout| txout.script_pubkey.as_script())
    })?;
    script_type_from_script(script)
}

fn script_type_from_script(script: &Script) -> Option<ScriptType> {
    if script.is_p2pkh() {
        Some(ScriptType::Legacy)
    } else if script.is_p2sh() {
        Some(ScriptType::NestedSegwit)
    } else if script.is_p2wpkh() {
        Some(ScriptType::NativeSegwit)
    } else if script.is_p2tr() {
        Some(ScriptType::Taproot)
    } else {
        None
    }
}

fn estimated_vsize(transaction: &Transaction) -> usize {
    transaction.vsize()
}

fn lint_analysis(
    psbt: &Psbt,
    inputs: &[PsbtInputAnalysis],
    outputs: &[PsbtOutputAnalysis],
    fee_sats: Option<u64>,
    fee_rate: Option<f64>,
) -> Vec<PsbtWarning> {
    let mut warnings = Vec::new();
    let wallet_inputs: Vec<&Utxo> = inputs
        .iter()
        .filter_map(|input| input.wallet_utxo.as_ref())
        .collect();
    let labels = distinct(wallet_inputs.iter().map(|utxo| {
        utxo.label
            .clone()
            .unwrap_or_else(|| "Unlabeled".to_string())
    }));
    let categories = distinct(
        wallet_inputs
            .iter()
            .map(|utxo| format!("{:?}", utxo.source_category)),
    );

    match (fee_sats, fee_rate) {
        (Some(fee), Some(rate)) if rate > 100.0 || fee > 100_000 => warnings.push(warning(
            "fee_sanity",
            Severity::High,
            "High fee estimate",
            format!("The PSBT appears to pay about {fee} sats, or {rate:.1} sats/vB. This may be unusually high."),
            "Review the fee in the signing wallet before signing.",
            ConfidenceLevel::Medium,
        )),
        (None, _) => warnings.push(missing_metadata_warning()),
        _ => {}
    }

    if outputs.iter().any(|output| output.kind != "change") {
        warnings.push(warning(
            "unknown_outputs",
            Severity::Info,
            "Recipient outputs present",
            "Outputs that are not recognized as wallet change are shown as recipient outputs.",
            "Verify each recipient address out of band before signing elsewhere.",
            ConfidenceLevel::Medium,
        ));
    }

    if !outputs.iter().any(|output| output.kind == "change") {
        warnings.push(warning(
            "change_verification",
            Severity::Medium,
            "No verified change output",
            "No output matched the derived wallet address set. This may be normal for a no-change spend.",
            "Confirm the signing wallet's change detection before signing.",
            ConfidenceLevel::Medium,
        ));
    }

    if wallet_inputs.iter().any(|utxo| {
        !matches!(
            utxo.quarantine_status,
            crate::models::QuarantineStatus::None
        )
    }) {
        warnings.push(warning(
            "quarantined_input",
            Severity::High,
            "Quarantined UTXO spend",
            "The PSBT spends one or more UTXOs marked as quarantined in XpubShield.",
            "Remove quarantined coins unless you intentionally reviewed the policy exception.",
            ConfidenceLevel::High,
        ));
    }

    if labels.len() > 1 || categories.len() > 1 {
        warnings.push(warning(
            "label_mixing",
            Severity::High,
            "Label mixing",
            "The PSBT combines wallet inputs from different labels or source categories. This may link histories.",
            "Consider coin selection from one label/category.",
            ConfidenceLevel::High,
        ));
    }

    if outputs.iter().any(|output| output.reused_wallet_address) {
        warnings.push(warning(
            "address_reuse",
            Severity::High,
            "Output to reused wallet address",
            "One output matches a wallet address with reuse history.",
            "Avoid sending to reused wallet addresses.",
            ConfidenceLevel::High,
        ));
    }

    if outputs.iter().any(|output| output.dust) {
        warnings.push(warning(
            "dust_output",
            Severity::Medium,
            "Dust-like output",
            "One or more outputs are very small. This may create uneconomical wallet state.",
            "Review small outputs before signing.",
            ConfidenceLevel::Medium,
        ));
    }

    if wallet_inputs
        .iter()
        .any(|utxo| matches!(utxo.script_type, ScriptType::Legacy))
    {
        warnings.push(warning(
            "legacy_input_cost",
            Severity::Low,
            "Legacy input cost",
            "One or more wallet inputs use legacy script assumptions, which may increase fees.",
            "Review fee burden before signing.",
            ConfidenceLevel::High,
        ));
    }

    if psbt
        .inputs
        .iter()
        .any(|input| input.bip32_derivation.is_empty() && input.tap_key_origins.is_empty())
    {
        warnings.push(missing_metadata_warning());
    }

    warnings
}

fn warning(
    id: &str,
    severity: Severity,
    title: &str,
    explanation: impl Into<String>,
    recommended_action: &str,
    confidence: ConfidenceLevel,
) -> PsbtWarning {
    PsbtWarning {
        id: id.to_string(),
        severity,
        title: title.to_string(),
        explanation: explanation.into(),
        recommended_action: recommended_action.to_string(),
        confidence,
    }
}

fn missing_metadata_warning() -> PsbtWarning {
    warning(
        "missing_metadata",
        Severity::Medium,
        "Missing PSBT metadata",
        "The PSBT lacks enough previous-output or derivation metadata for complete fee/change review.",
        "Review the PSBT in the signing wallet and verify fee/change metadata before signing.",
        ConfidenceLevel::High,
    )
}

fn empty_analysis(summary: &str, format: &str) -> PsbtAnalysisResult {
    PsbtAnalysisResult {
        summary: summary.to_string(),
        format: format.to_string(),
        inputs: Vec::new(),
        outputs: Vec::new(),
        fee_sats: None,
        fee_rate: None,
        change_detected: false,
        warnings: Vec::new(),
    }
}

fn distinct(values: impl Iterator<Item = String>) -> BTreeSet<String> {
    values.collect()
}

fn bitcoin_network(network: &crate::models::Network) -> BitcoinNetwork {
    match network {
        crate::models::Network::Mainnet => BitcoinNetwork::Bitcoin,
        crate::models::Network::Testnet => BitcoinNetwork::Testnet,
        crate::models::Network::Signet => BitcoinNetwork::Signet,
        crate::models::Network::Regtest => BitcoinNetwork::Regtest,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blockchain_backend::BlockchainBackend;
    use crate::mock_backend::{build_demo_import, MockBackend};
    use miniscript::bitcoin::absolute;
    use miniscript::bitcoin::psbt::Input;
    use miniscript::bitcoin::transaction;
    use miniscript::bitcoin::{Amount, OutPoint, ScriptBuf, Sequence, TxIn, TxOut, Txid, Witness};
    use std::str::FromStr;

    #[test]
    fn parses_psbt_and_estimates_fee() {
        let mut report = MockBackend.scan_wallet(&build_demo_import());
        let change_script = ScriptBuf::new();
        report.derived_addresses[0].address = "script_pubkey:0".to_string();
        let psbt = fixture_psbt(&report.utxos[0], 10_000, change_script);
        let encoded = BASE64_STANDARD.encode(psbt.serialize());

        let analysis = analyze_psbt_text(&encoded, &report).unwrap();

        assert_eq!(analysis.format, "base64_psbt");
        assert_eq!(analysis.inputs.len(), 1);
        assert_eq!(analysis.outputs.len(), 1);
        assert_eq!(analysis.fee_sats, Some(10_000));
        assert!(analysis.change_detected);
    }

    #[test]
    fn detects_high_fee_and_quarantined_input() {
        let mut report = MockBackend.scan_wallet(&build_demo_import());
        report.utxos[0].quarantine_status = crate::models::QuarantineStatus::Manual;
        let psbt = fixture_psbt(&report.utxos[0], 150_000, ScriptBuf::new());

        let encoded = BASE64_STANDARD.encode(psbt.serialize());
        let analysis = analyze_psbt_text(&encoded, &report).unwrap();

        assert!(analysis
            .warnings
            .iter()
            .any(|warning| warning.id == "fee_sanity"));
        assert!(analysis
            .warnings
            .iter()
            .any(|warning| warning.id == "quarantined_input"));
    }

    fn fixture_psbt(utxo: &Utxo, fee_sats: u64, output_script: ScriptBuf) -> Psbt {
        let outpoint = OutPoint::from_str(&utxo.outpoint).unwrap_or_else(|_| OutPoint {
            txid: Txid::from_str(
                "0000000000000000000000000000000000000000000000000000000000000001",
            )
            .unwrap(),
            vout: 0,
        });
        let output_value = utxo.amount_sats.saturating_sub(fee_sats);
        let unsigned_tx = Transaction {
            version: transaction::Version::TWO,
            lock_time: absolute::LockTime::ZERO,
            input: vec![TxIn {
                previous_output: outpoint,
                script_sig: ScriptBuf::new(),
                sequence: Sequence::MAX,
                witness: Witness::default(),
            }],
            output: vec![TxOut {
                value: Amount::from_sat(output_value),
                script_pubkey: output_script,
            }],
        };
        let mut psbt = Psbt::from_unsigned_tx(unsigned_tx).unwrap();
        psbt.inputs = vec![Input {
            witness_utxo: Some(TxOut {
                value: Amount::from_sat(utxo.amount_sats),
                script_pubkey: ScriptBuf::new(),
            }),
            ..Default::default()
        }];
        psbt
    }
}
