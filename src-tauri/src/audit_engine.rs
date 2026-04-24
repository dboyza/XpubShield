use crate::fee_estimator::{enrich_utxo_costs, is_uneconomical};
use crate::models::{
    AuditFinding, BackendKind, ConfidenceLevel, DerivedAddress, QuarantineStatus, RiskScores,
    ScriptType, Severity, SourceCategory, Utxo, UtxoStatus, Wallet, WalletTotals,
};
use std::collections::{BTreeMap, HashMap};

const UNECONOMICAL_THRESHOLD_PERCENT: f64 = 25.0;

pub fn audit_wallet(
    wallet: &Wallet,
    addresses: &[DerivedAddress],
    utxos: &mut [Utxo],
) -> (Vec<AuditFinding>, RiskScores, WalletTotals) {
    for utxo in utxos.iter_mut() {
        enrich_utxo_costs(utxo);
        utxo.audit_flags.clear();
    }

    let mut findings = Vec::new();
    findings.extend(address_reuse_findings(addresses, utxos));
    findings.extend(utxo_fee_findings(utxos));
    findings.extend(wallet_sprawl_findings(utxos));
    findings.extend(script_type_findings(utxos));
    findings.extend(unconfirmed_findings(utxos));
    findings.extend(gap_risk_findings(wallet, addresses));
    findings.extend(label_hygiene_findings(utxos));
    findings.extend(public_backend_findings(wallet));
    findings.extend(dust_suspicion_findings(utxos));

    let totals = wallet_totals(utxos);
    let scores = score_wallet(&findings, wallet);
    (findings, scores, totals)
}

fn address_reuse_findings(addresses: &[DerivedAddress], utxos: &mut [Utxo]) -> Vec<AuditFinding> {
    let reused: Vec<&DerivedAddress> = addresses
        .iter()
        .filter(|address| address.receive_count > 1)
        .collect();

    if reused.is_empty() {
        return Vec::new();
    }

    let reused_addresses: Vec<String> = reused.iter().map(|address| address.address.clone()).collect();
    let affected: Vec<String> = utxos
        .iter_mut()
        .filter(|utxo| reused_addresses.contains(&utxo.address))
        .map(|utxo| {
            utxo.audit_flags.push("address_reuse".to_string());
            if matches!(utxo.quarantine_status, QuarantineStatus::None) {
                utxo.quarantine_status = QuarantineStatus::ReceivedToReusedAddress;
            }
            utxo.outpoint.clone()
        })
        .collect();

    vec![AuditFinding {
        id: "address_reuse".to_string(),
        severity: Severity::High,
        title: "Address reuse detected".to_string(),
        explanation:
            "One or more receive addresses appear more than once. This may link deposits that the user intended to keep separate."
                .to_string(),
        recommended_action:
            "Review the affected deposits, add labels, and avoid combining them casually in future spends."
                .to_string(),
        affected_utxos: affected,
        affected_transactions: Vec::new(),
        confidence_level: ConfidenceLevel::High,
        heuristic_notes:
            "This check counts wallet receive activity locally. It does not identify counterparties."
                .to_string(),
    }]
}

fn utxo_fee_findings(utxos: &mut [Utxo]) -> Vec<AuditFinding> {
    let mut tiny = Vec::new();
    let mut uneconomical = Vec::new();

    for utxo in utxos.iter_mut() {
        if utxo.amount_sats <= 10_000 {
            utxo.audit_flags.push("tiny_utxo".to_string());
            tiny.push(utxo.outpoint.clone());
        }

        if is_uneconomical(utxo, UNECONOMICAL_THRESHOLD_PERCENT) {
            utxo.audit_flags.push("uneconomical_to_spend".to_string());
            if matches!(utxo.quarantine_status, QuarantineStatus::None) {
                utxo.quarantine_status = QuarantineStatus::TooSmallToSpendEconomically;
            }
            if matches!(utxo.spendability_status, UtxoStatus::Spendable) {
                utxo.spendability_status = UtxoStatus::ConsolidateLater;
            }
            uneconomical.push(utxo.outpoint.clone());
        }
    }

    let mut findings = Vec::new();
    if !tiny.is_empty() {
        findings.push(AuditFinding {
            id: "tiny_utxo".to_string(),
            severity: Severity::Medium,
            title: "Tiny UTXOs present".to_string(),
            explanation:
                "Some UTXOs are small enough that future fee pressure could make them expensive to spend."
                    .to_string(),
            recommended_action:
                "Label the source and consider leaving them alone or consolidating later only when privacy impact is acceptable."
                    .to_string(),
            affected_utxos: tiny,
            affected_transactions: Vec::new(),
            confidence_level: ConfidenceLevel::High,
            heuristic_notes:
                "The threshold is deterministic for this app version and should be tuned per wallet policy."
                    .to_string(),
        });
    }

    if !uneconomical.is_empty() {
        findings.push(AuditFinding {
            id: "uneconomical_to_spend".to_string(),
            severity: Severity::High,
            title: "Uneconomical spend risk".to_string(),
            explanation:
                "At one or more configured fee rates, spending these UTXOs could consume at least 25% of their value."
                    .to_string(),
            recommended_action:
                "Avoid urgent spends from these coins and review fee conditions before using them."
                    .to_string(),
            affected_utxos: uneconomical,
            affected_transactions: Vec::new(),
            confidence_level: ConfidenceLevel::High,
            heuristic_notes:
                "Fee estimates use script-type input weights and do not build or sign transactions."
                    .to_string(),
        });
    }

    findings
}

fn wallet_sprawl_findings(utxos: &[Utxo]) -> Vec<AuditFinding> {
    let small_count = utxos.iter().filter(|utxo| utxo.amount_sats < 50_000).count();
    if small_count < 4 {
        return Vec::new();
    }

    vec![AuditFinding {
        id: "utxo_sprawl".to_string(),
        severity: Severity::Medium,
        title: "UTXO sprawl may be developing".to_string(),
        explanation:
            "The wallet has several small UTXOs. This could increase future transaction fees and planning overhead."
                .to_string(),
        recommended_action:
            "Group coins by label and source before considering any consolidation."
                .to_string(),
        affected_utxos: utxos
            .iter()
            .filter(|utxo| utxo.amount_sats < 50_000)
            .map(|utxo| utxo.outpoint.clone())
            .collect(),
        affected_transactions: Vec::new(),
        confidence_level: ConfidenceLevel::Medium,
        heuristic_notes:
            "This is a wallet-shape heuristic, not a recommendation to consolidate everything."
                .to_string(),
    }]
}

fn script_type_findings(utxos: &mut [Utxo]) -> Vec<AuditFinding> {
    let affected: Vec<String> = utxos
        .iter_mut()
        .filter(|utxo| matches!(utxo.script_type, ScriptType::Legacy))
        .map(|utxo| {
            utxo.audit_flags.push("legacy_script_type".to_string());
            utxo.outpoint.clone()
        })
        .collect();

    if affected.is_empty() {
        return Vec::new();
    }

    vec![AuditFinding {
        id: "legacy_script_type".to_string(),
        severity: Severity::Low,
        title: "Legacy script type costs more to spend".to_string(),
        explanation:
            "Some UTXOs use legacy P2PKH-style spending assumptions, which may cost more in future fees."
                .to_string(),
        recommended_action:
            "Keep this in mind when comparing fee burden. Do not move funds solely for script type without reviewing privacy impact."
                .to_string(),
        affected_utxos: affected,
        affected_transactions: Vec::new(),
        confidence_level: ConfidenceLevel::High,
        heuristic_notes: "Script type is inferred from wallet metadata and mock scan data.".to_string(),
    }]
}

fn unconfirmed_findings(utxos: &mut [Utxo]) -> Vec<AuditFinding> {
    let affected: Vec<String> = utxos
        .iter_mut()
        .filter(|utxo| utxo.confirmations == 0)
        .map(|utxo| {
            utxo.audit_flags.push("unconfirmed".to_string());
            if matches!(utxo.spendability_status, UtxoStatus::Spendable) {
                utxo.spendability_status = UtxoStatus::Unknown;
            }
            utxo.outpoint.clone()
        })
        .collect();

    if affected.is_empty() {
        return Vec::new();
    }

    vec![AuditFinding {
        id: "unconfirmed_utxo".to_string(),
        severity: Severity::Medium,
        title: "Unconfirmed UTXO".to_string(),
        explanation:
            "One or more UTXOs have zero confirmations. Their final status could still change."
                .to_string(),
        recommended_action: "Wait for confirmations before relying on these coins.".to_string(),
        affected_utxos: affected,
        affected_transactions: Vec::new(),
        confidence_level: ConfidenceLevel::High,
        heuristic_notes: "Confirmation count comes from the selected backend.".to_string(),
    }]
}

fn gap_risk_findings(wallet: &Wallet, addresses: &[DerivedAddress]) -> Vec<AuditFinding> {
    let max_used_external = addresses
        .iter()
        .filter(|address| address.used && matches!(address.keychain, crate::models::Keychain::External))
        .map(|address| address.index)
        .max()
        .unwrap_or(0);

    if max_used_external + 3 < wallet.gap_limit {
        return Vec::new();
    }

    vec![AuditFinding {
        id: "derivation_gap_risk".to_string(),
        severity: Severity::Medium,
        title: "Activity near gap limit".to_string(),
        explanation:
            "Recent wallet activity appears close to the configured gap limit. A recovery scan with a lower gap limit could miss activity."
                .to_string(),
        recommended_action: "Increase the gap limit and document the scan depth in the recovery report.".to_string(),
        affected_utxos: Vec::new(),
        affected_transactions: Vec::new(),
        confidence_level: ConfidenceLevel::Medium,
        heuristic_notes:
            "This compares the highest used external index with the local gap-limit setting."
                .to_string(),
    }]
}

fn label_hygiene_findings(utxos: &mut [Utxo]) -> Vec<AuditFinding> {
    let affected: Vec<String> = utxos
        .iter_mut()
        .filter(|utxo| utxo.label.as_ref().map(|label| label.trim().is_empty()).unwrap_or(true))
        .map(|utxo| {
            utxo.audit_flags.push("unlabeled".to_string());
            if matches!(utxo.quarantine_status, QuarantineStatus::None) {
                utxo.quarantine_status = QuarantineStatus::UnlabeledDeposit;
            }
            utxo.outpoint.clone()
        })
        .collect();

    if affected.is_empty() {
        return Vec::new();
    }

    vec![AuditFinding {
        id: "label_hygiene".to_string(),
        severity: Severity::Medium,
        title: "Unlabeled UTXOs".to_string(),
        explanation:
            "Some UTXOs are missing labels. This could make future privacy and accounting decisions harder."
                .to_string(),
        recommended_action: "Add local labels before simulating spends or consolidation.".to_string(),
        affected_utxos: affected,
        affected_transactions: Vec::new(),
        confidence_level: ConfidenceLevel::High,
        heuristic_notes: "Labels are local metadata and are never sent to a remote backend by this app.".to_string(),
    }]
}

fn public_backend_findings(wallet: &Wallet) -> Vec<AuditFinding> {
    if !matches!(wallet.backend, BackendKind::PublicEsplora) {
        return Vec::new();
    }

    vec![AuditFinding {
        id: "public_api_privacy_leak".to_string(),
        severity: Severity::High,
        title: "Public API mode is enabled".to_string(),
        explanation:
            "Public API mode could reveal wallet addresses and timing metadata to a third party. XpubShield never uploads raw xpubs or descriptors."
                .to_string(),
        recommended_action:
            "Use Bitcoin Core RPC, a personal Electrum server, or self-hosted Esplora for better privacy."
                .to_string(),
        affected_utxos: Vec::new(),
        affected_transactions: Vec::new(),
        confidence_level: ConfidenceLevel::High,
        heuristic_notes: "This finding reflects backend choice, not coin ownership attribution.".to_string(),
    }]
}

fn dust_suspicion_findings(utxos: &mut [Utxo]) -> Vec<AuditFinding> {
    let affected: Vec<String> = utxos
        .iter_mut()
        .filter(|utxo| {
            utxo.amount_sats <= 2_000
                && matches!(utxo.source_category, SourceCategory::Unknown)
                && utxo.source_label.is_none()
        })
        .map(|utxo| {
            utxo.audit_flags.push("dust_attack_suspicion".to_string());
            utxo.quarantine_status = QuarantineStatus::DustAttackSuspicion;
            utxo.spendability_status = UtxoStatus::Quarantined;
            utxo.outpoint.clone()
        })
        .collect();

    if affected.is_empty() {
        return Vec::new();
    }

    vec![AuditFinding {
        id: "dust_attack_suspicion".to_string(),
        severity: Severity::High,
        title: "Dust attack suspicion".to_string(),
        explanation:
            "A tiny unlabeled UTXO from an unknown source may indicate a dusting attempt. This heuristic is not definitive."
                .to_string(),
        recommended_action:
            "Quarantine the coin and avoid merging it with unrelated UTXOs unless you have reviewed the source."
                .to_string(),
        affected_utxos: affected,
        affected_transactions: Vec::new(),
        confidence_level: ConfidenceLevel::Medium,
        heuristic_notes:
            "Dust detection uses amount, source category, and missing label metadata only."
                .to_string(),
    }]
}

fn wallet_totals(utxos: &[Utxo]) -> WalletTotals {
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

fn score_wallet(findings: &[AuditFinding], wallet: &Wallet) -> RiskScores {
    let mut penalties: HashMap<&str, u8> = HashMap::new();
    for finding in findings {
        let penalty = match finding.severity {
            Severity::Info => 1,
            Severity::Low => 4,
            Severity::Medium => 8,
            Severity::High => 14,
            Severity::Critical => 25,
        };
        match finding.id.as_str() {
            "address_reuse" | "dust_attack_suspicion" | "public_api_privacy_leak" => {
                *penalties.entry("privacy").or_insert(0) += penalty;
            }
            "tiny_utxo" | "uneconomical_to_spend" | "utxo_sprawl" | "legacy_script_type" => {
                *penalties.entry("fee").or_insert(0) += penalty;
            }
            "label_hygiene" => {
                *penalties.entry("clarity").or_insert(0) += penalty;
            }
            "unconfirmed_utxo" => {
                *penalties.entry("spend").or_insert(0) += penalty;
            }
            "derivation_gap_risk" => {
                *penalties.entry("recovery").or_insert(0) += penalty;
            }
            _ => {}
        }
    }

    let backend_privacy = match wallet.backend {
        BackendKind::Mock => 100,
        BackendKind::BitcoinCoreRpc => 98,
        BackendKind::Electrum | BackendKind::Esplora => 82,
        BackendKind::PublicEsplora => 35,
    };

    RiskScores {
        privacy: subtract_penalty(100, *penalties.get("privacy").unwrap_or(&0)),
        fee_efficiency: subtract_penalty(100, *penalties.get("fee").unwrap_or(&0)),
        operational_clarity: subtract_penalty(100, *penalties.get("clarity").unwrap_or(&0)),
        spend_readiness: subtract_penalty(100, *penalties.get("spend").unwrap_or(&0)),
        recovery_readiness: subtract_penalty(100, *penalties.get("recovery").unwrap_or(&0)),
        backend_privacy,
    }
}

fn subtract_penalty(score: u8, penalty: u8) -> u8 {
    score.saturating_sub(penalty)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{BackendKind, Network};

    fn test_wallet() -> Wallet {
        Wallet {
            id: "wallet".to_string(),
            name: "Test".to_string(),
            network: Network::Mainnet,
            backend: BackendKind::Mock,
            gap_limit: 20,
            descriptor_based: true,
            created_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn detects_address_reuse() {
        let addresses = vec![DerivedAddress {
            id: "addr".to_string(),
            wallet_id: "wallet".to_string(),
            keychain: crate::models::Keychain::External,
            index: 0,
            address: "bc1qreuse".to_string(),
            derivation_path: "m/84h/0h/0h/0/0".to_string(),
            script_type: ScriptType::NativeSegwit,
            used: true,
            receive_count: 2,
        }];
        let mut utxos = vec![sample_utxo("bc1qreuse", 50_000)];

        let (findings, _, _) = audit_wallet(&test_wallet(), &addresses, &mut utxos);

        assert!(findings.iter().any(|finding| finding.id == "address_reuse"));
        assert!(utxos[0].audit_flags.contains(&"address_reuse".to_string()));
    }

    #[test]
    fn detects_tiny_uneconomical_utxo() {
        let addresses = Vec::new();
        let mut utxos = vec![sample_utxo("bc1qtiny", 1_200)];

        let (findings, _, _) = audit_wallet(&test_wallet(), &addresses, &mut utxos);

        assert!(findings.iter().any(|finding| finding.id == "tiny_utxo"));
        assert!(findings.iter().any(|finding| finding.id == "uneconomical_to_spend"));
    }

    fn sample_utxo(address: &str, amount_sats: u64) -> Utxo {
        Utxo {
            txid: "00".repeat(32),
            vout: 0,
            outpoint: format!("{}:0", "00".repeat(32)),
            amount_sats,
            address: address.to_string(),
            script_pubkey: "0014demo".to_string(),
            script_type: ScriptType::NativeSegwit,
            derivation_path: "m/84h/0h/0h/0/0".to_string(),
            confirmations: 6,
            block_height: Some(840_000),
            block_time: Some("2026-01-01T00:00:00Z".to_string()),
            label: None,
            source_label: None,
            source_category: SourceCategory::Unknown,
            is_change: false,
            source_txid: None,
            spend_vbytes_estimate: 0,
            spend_cost_by_fee_rate: Vec::new(),
            audit_flags: Vec::new(),
            quarantine_status: QuarantineStatus::None,
            spendability_status: UtxoStatus::Spendable,
            provenance: Default::default(),
        }
    }
}
