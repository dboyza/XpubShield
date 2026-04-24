use crate::models::{
    ConfidenceLevel, ProvenanceAssessment, ProvenanceEvidence, ProvenanceSourceKind,
    QuarantineStatus, SourceCategory, Utxo, WalletReport,
};
use chrono::Utc;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Registry {
    entries: Vec<RegistryEntry>,
}

#[derive(Debug, Deserialize)]
struct RegistryEntry {
    id: String,
    entity_label: String,
    category: SourceCategory,
    confidence_level: ConfidenceLevel,
    keywords: Vec<String>,
    txid_prefixes: Vec<String>,
    evidence_label: String,
    evidence_detail: String,
}

const REGISTRY_JSON: &str = include_str!("../fixtures/provenance_registry.json");

pub fn enrich_wallet_provenance(report: &mut WalletReport) {
    let registry = load_registry();
    for utxo in &mut report.utxos {
        utxo.provenance = assess_utxo(utxo, &registry);
    }
    report.provenance_summary = summarize_provenance(&report.utxos);
}

fn assess_utxo(utxo: &Utxo, registry: &[RegistryEntry]) -> ProvenanceAssessment {
    let now = Utc::now().to_rfc3339();
    let registry_matches = registry_matches(utxo, registry);
    let manual_source = utxo
        .source_label
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(label) = manual_source {
        let mut evidence = vec![ProvenanceEvidence {
            id: "manual_source_label".to_string(),
            label: "User-confirmed source label".to_string(),
            detail: format!(
                "The coin has a local source label of \"{label}\". Manual labels take precedence over heuristics."
            ),
            confidence_level: ConfidenceLevel::High,
            source: "local_labels".to_string(),
        }];
        evidence.extend(registry_matches.into_iter().map(registry_evidence));
        return ProvenanceAssessment {
            source_kind: ProvenanceSourceKind::Manual,
            entity_label: Some(label.to_string()),
            category: utxo.source_category,
            confidence_level: ConfidenceLevel::High,
            evidence,
            updated_at: now,
        };
    }

    if let Some(entry) = registry_matches.first() {
        return ProvenanceAssessment {
            source_kind: ProvenanceSourceKind::Registry,
            entity_label: Some(entry.entity_label.clone()),
            category: entry.category,
            confidence_level: entry.confidence_level,
            evidence: registry_matches
                .into_iter()
                .map(registry_evidence)
                .collect(),
            updated_at: now,
        };
    }

    if utxo.is_change || matches!(utxo.source_category, SourceCategory::Change) {
        return ProvenanceAssessment {
            source_kind: ProvenanceSourceKind::WalletChange,
            entity_label: Some("Self-custody change".to_string()),
            category: SourceCategory::Change,
            confidence_level: ConfidenceLevel::Medium,
            evidence: vec![ProvenanceEvidence {
                id: "wallet_change".to_string(),
                label: "Wallet change heuristic".to_string(),
                detail: "The coin is marked as wallet change by local wallet metadata.".to_string(),
                confidence_level: ConfidenceLevel::Medium,
                source: "wallet_metadata".to_string(),
            }],
            updated_at: now,
        };
    }

    if !matches!(utxo.source_category, SourceCategory::Unknown) {
        return ProvenanceAssessment {
            source_kind: ProvenanceSourceKind::Heuristic,
            entity_label: utxo.label.clone(),
            category: utxo.source_category,
            confidence_level: ConfidenceLevel::Medium,
            evidence: vec![ProvenanceEvidence {
                id: "category_context".to_string(),
                label: "Source category metadata".to_string(),
                detail: format!(
                    "The coin is categorized as {:?}. This is local metadata, not external attribution.",
                    utxo.source_category
                ),
                confidence_level: ConfidenceLevel::Medium,
                source: "wallet_metadata".to_string(),
            }],
            updated_at: now,
        };
    }

    let mut unknown = ProvenanceAssessment::default();
    unknown.updated_at = now;
    if matches!(
        utxo.quarantine_status,
        QuarantineStatus::UnknownSource | QuarantineStatus::DustAttackSuspicion
    ) {
        unknown.evidence.push(ProvenanceEvidence {
            id: "unknown_or_dust_flag".to_string(),
            label: "Unknown-source risk flag".to_string(),
            detail: "The coin is unlabeled and already carries an unknown-source or dust-style quarantine flag.".to_string(),
            confidence_level: ConfidenceLevel::Medium,
            source: "audit_engine".to_string(),
        });
    }
    unknown
}

fn registry_matches<'a>(utxo: &Utxo, registry: &'a [RegistryEntry]) -> Vec<&'a RegistryEntry> {
    let haystack = [
        utxo.txid.as_str(),
        utxo.outpoint.as_str(),
        utxo.address.as_str(),
        utxo.label.as_deref().unwrap_or_default(),
        utxo.source_label.as_deref().unwrap_or_default(),
    ]
    .join(" ")
    .to_ascii_lowercase();

    registry
        .iter()
        .filter(|entry| {
            entry
                .keywords
                .iter()
                .any(|keyword| haystack.contains(&keyword.to_ascii_lowercase()))
                || entry
                    .txid_prefixes
                    .iter()
                    .any(|prefix| utxo.txid.starts_with(prefix))
        })
        .collect()
}

fn registry_evidence(entry: &RegistryEntry) -> ProvenanceEvidence {
    ProvenanceEvidence {
        id: entry.id.clone(),
        label: entry.evidence_label.clone(),
        detail: entry.evidence_detail.clone(),
        confidence_level: entry.confidence_level,
        source: "bundled_registry".to_string(),
    }
}

fn summarize_provenance(utxos: &[Utxo]) -> crate::models::ProvenanceSummary {
    let mut summary = crate::models::ProvenanceSummary {
        assessed_count: utxos.len(),
        ..Default::default()
    };

    for utxo in utxos {
        match utxo.provenance.source_kind {
            ProvenanceSourceKind::Manual => summary.manual_count += 1,
            ProvenanceSourceKind::Registry => summary.registry_count += 1,
            ProvenanceSourceKind::Heuristic | ProvenanceSourceKind::WalletChange => {
                summary.heuristic_count += 1
            }
            ProvenanceSourceKind::Unknown => summary.unknown_count += 1,
        }
        if matches!(utxo.provenance.category, SourceCategory::Exchange)
            || matches!(utxo.source_category, SourceCategory::Exchange)
        {
            summary.exchange_like_count += 1;
        }
    }
    summary
}

fn load_registry() -> Vec<RegistryEntry> {
    serde_json::from_str::<Registry>(REGISTRY_JSON)
        .map(|registry| registry.entries)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blockchain_backend::BlockchainBackend;
    use crate::mock_backend::{build_demo_import, MockBackend};

    #[test]
    fn manual_source_label_takes_precedence_but_keeps_registry_evidence() {
        let mut report = MockBackend.scan_wallet(&build_demo_import());
        enrich_wallet_provenance(&mut report);
        let river = report
            .utxos
            .iter()
            .find(|utxo| utxo.source_label.as_deref() == Some("River withdrawal"))
            .unwrap();

        assert_eq!(river.provenance.source_kind, ProvenanceSourceKind::Manual);
        assert_eq!(
            river.provenance.entity_label.as_deref(),
            Some("River withdrawal")
        );
        assert!(river
            .provenance
            .evidence
            .iter()
            .any(|evidence| evidence.source == "bundled_registry"));
    }
}
