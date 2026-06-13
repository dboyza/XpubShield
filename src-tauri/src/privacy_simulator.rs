use crate::models::{AuditFinding, ConfidenceLevel, Severity, Utxo};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PrivacySimulation {
    pub risk_level: Severity,
    pub confidence_level: ConfidenceLevel,
    pub explanation: String,
    pub affected_utxos: Vec<String>,
    pub suggested_alternatives: Vec<String>,
}

pub fn simulate_common_input_risk(selected: &[Utxo]) -> PrivacySimulation {
    let affected_utxos = selected.iter().map(|utxo| utxo.outpoint.clone()).collect();
    let distinct_labels = selected
        .iter()
        .filter_map(|utxo| utxo.label.as_deref())
        .collect::<std::collections::BTreeSet<_>>();

    PrivacySimulation {
        risk_level: if distinct_labels.len() > 1 {
            Severity::High
        } else {
            Severity::Low
        },
        confidence_level: ConfidenceLevel::Medium,
        explanation: "Spending multiple selected UTXOs together could reveal common input ownership. This heuristic is not definitive.".to_string(),
        affected_utxos,
        suggested_alternatives: vec!["Prefer label-consistent coin selections when possible.".to_string()],
    }
}

pub fn finding_from_simulation(simulation: &PrivacySimulation) -> AuditFinding {
    AuditFinding {
        id: "common_input_ownership_risk".to_string(),
        severity: simulation.risk_level,
        title: "Common input ownership risk".to_string(),
        explanation: simulation.explanation.clone(),
        recommended_action: simulation.suggested_alternatives.join(" "),
        affected_utxos: simulation.affected_utxos.clone(),
        affected_transactions: Vec::new(),
        confidence_level: simulation.confidence_level,
        heuristic_notes: "Simulation only; no transaction is created, signed, or broadcast."
            .to_string(),
    }
}
