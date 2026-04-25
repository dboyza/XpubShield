use crate::models::{
    ActionItem, ConfidenceLevel, ProvenanceSourceKind, QuarantineStatus, Severity, SourceCategory,
    WalletReport,
};
use std::collections::BTreeSet;

pub fn build_action_center(
    report: &WalletReport,
    dismissed_ids: &BTreeSet<String>,
) -> Vec<ActionItem> {
    let mut actions = Vec::new();

    for finding in &report.findings {
        actions.push(ActionItem {
            id: format!("finding:{}", finding.id),
            severity: finding.severity,
            title: finding.title.clone(),
            summary: finding.explanation.clone(),
            why_it_matters: finding.heuristic_notes.clone(),
            recommended_action: finding.recommended_action.clone(),
            cta_page: action_page_for_finding(&finding.id).to_string(),
            affected_utxos: finding.affected_utxos.clone(),
            confidence_level: finding.confidence_level,
            dismissed: false,
        });
    }

    let quarantined: Vec<String> = report
        .utxos
        .iter()
        .filter(|utxo| !matches!(utxo.quarantine_status, QuarantineStatus::None))
        .map(|utxo| utxo.outpoint.clone())
        .collect();
    if !quarantined.is_empty() {
        actions.push(ActionItem {
            id: "cockpit:quarantined_coins".to_string(),
            severity: Severity::High,
            title: "Keep quarantined coins isolated".to_string(),
            summary: format!("{} UTXO(s) are marked for quarantine or manual review.", quarantined.len()),
            why_it_matters:
                "Quarantined coins can carry dust, unknown-source, address reuse, or manual do-not-merge risk."
                    .to_string(),
            recommended_action:
                "Open the coin workbench, review the evidence, and avoid merging these coins into normal spends."
                    .to_string(),
            cta_page: "utxos".to_string(),
            affected_utxos: quarantined,
            confidence_level: ConfidenceLevel::High,
            dismissed: false,
        });
    }

    let unknown: Vec<String> = report
        .utxos
        .iter()
        .filter(|utxo| matches!(utxo.provenance.source_kind, ProvenanceSourceKind::Unknown))
        .map(|utxo| utxo.outpoint.clone())
        .collect();
    if !unknown.is_empty() {
        actions.push(ActionItem {
            id: "cockpit:unknown_provenance".to_string(),
            severity: Severity::Medium,
            title: "Identify unknown-source coins".to_string(),
            summary: format!("{} UTXO(s) have no manual label or bundled provenance evidence.", unknown.len()),
            why_it_matters:
                "Unknown-source coins are harder to safely merge because their external history is ambiguous."
                    .to_string(),
            recommended_action:
                "Label the source, quarantine suspicious dust, or keep these coins out of casual spends."
                    .to_string(),
            cta_page: "utxos".to_string(),
            affected_utxos: unknown,
            confidence_level: ConfidenceLevel::Medium,
            dismissed: false,
        });
    }

    let exchange_like: Vec<String> = report
        .utxos
        .iter()
        .filter(|utxo| {
            matches!(utxo.source_category, SourceCategory::Exchange)
                || matches!(utxo.provenance.category, SourceCategory::Exchange)
        })
        .map(|utxo| utxo.outpoint.clone())
        .collect();
    if !exchange_like.is_empty() {
        actions.push(ActionItem {
            id: "cockpit:exchange_stack".to_string(),
            severity: Severity::Medium,
            title: "Protect KYC-linked exchange stack".to_string(),
            summary: format!("{} UTXO(s) look exchange-linked by local labels or registry evidence.", exchange_like.len()),
            why_it_matters:
                "Exchange-linked coins can reveal identity context when merged with P2P, donation, or unknown-source coins."
                    .to_string(),
            recommended_action:
                "Use Spend Preflight before merging exchange-like coins with unrelated contexts."
                    .to_string(),
            cta_page: "spend_preflight".to_string(),
            affected_utxos: exchange_like,
            confidence_level: ConfidenceLevel::Medium,
            dismissed: false,
        });
    }

    let category_count = report
        .utxos
        .iter()
        .map(|utxo| format!("{:?}", utxo.provenance.category))
        .collect::<BTreeSet<_>>()
        .len();
    if category_count > 2 {
        actions.push(ActionItem {
            id: "cockpit:mixed_context_wallet".to_string(),
            severity: Severity::Medium,
            title: "Plan spends by source context".to_string(),
            summary: format!("This wallet has {} provenance categories across spendable coins.", category_count),
            why_it_matters:
                "A future common-input spend can collapse those contexts into one observer-visible cluster."
                    .to_string(),
            recommended_action:
                "Use saved coin sets and spend preflight to keep unrelated histories separated."
                    .to_string(),
            cta_page: "spend_preflight".to_string(),
            affected_utxos: report.utxos.iter().map(|utxo| utxo.outpoint.clone()).collect(),
            confidence_level: ConfidenceLevel::High,
            dismissed: false,
        });
    }

    if report.backend_privacy.score < 70 {
        actions.push(ActionItem {
            id: "cockpit:backend_privacy".to_string(),
            severity: Severity::High,
            title: "Move away from public backend mode".to_string(),
            summary: report.backend_privacy.summary.clone(),
            why_it_matters:
                "Public address or script-hash queries can leak wallet timing and clusters to third parties."
                    .to_string(),
            recommended_action:
                "Prefer Bitcoin Core RPC, personal Electrum, or self-hosted Esplora before operational review."
                    .to_string(),
            cta_page: "settings".to_string(),
            affected_utxos: Vec::new(),
            confidence_level: ConfidenceLevel::High,
            dismissed: false,
        });
    }

    if report.scores.recovery_readiness < 90 {
        actions.push(ActionItem {
            id: "cockpit:recovery_drill".to_string(),
            severity: Severity::Medium,
            title: "Run a recovery metadata drill".to_string(),
            summary: format!("Recovery readiness is {}/100.", report.scores.recovery_readiness),
            why_it_matters:
                "Missing descriptor, fingerprint, path, or change metadata can make recovery incomplete."
                    .to_string(),
            recommended_action:
                "Open Recovery and verify export readiness before relying on this watch-only identity."
                    .to_string(),
            cta_page: "recovery".to_string(),
            affected_utxos: Vec::new(),
            confidence_level: ConfidenceLevel::Medium,
            dismissed: false,
        });
    }

    actions.retain(|action| !dismissed_ids.contains(&action.id));
    actions.sort_by(|left, right| {
        severity_rank(right.severity)
            .cmp(&severity_rank(left.severity))
            .then_with(|| right.affected_utxos.len().cmp(&left.affected_utxos.len()))
            .then_with(|| left.title.cmp(&right.title))
    });
    actions.truncate(12);
    actions
}

fn action_page_for_finding(id: &str) -> &'static str {
    if id.contains("recovery") || id.contains("gap") {
        "recovery"
    } else if id.contains("fee") || id.contains("economical") || id.contains("tiny") {
        "fees"
    } else if id.contains("public_api") {
        "settings"
    } else if id.contains("spend") || id.contains("mix") {
        "spend_preflight"
    } else {
        "utxos"
    }
}

fn severity_rank(severity: Severity) -> u8 {
    match severity {
        Severity::Info => 0,
        Severity::Low => 1,
        Severity::Medium => 2,
        Severity::High => 3,
        Severity::Critical => 4,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blockchain_backend::BlockchainBackend;
    use crate::mock_backend::{build_demo_import, MockBackend};
    use crate::provenance_engine::enrich_wallet_provenance;

    #[test]
    fn action_center_surfaces_quarantine_and_provenance() {
        let mut report = MockBackend.scan_wallet(&build_demo_import());
        enrich_wallet_provenance(&mut report);
        let actions = build_action_center(&report, &BTreeSet::new());

        assert!(actions
            .iter()
            .any(|action| action.id == "cockpit:quarantined_coins"));
        assert!(actions
            .iter()
            .any(|action| action.id == "cockpit:exchange_stack"));
    }
}
