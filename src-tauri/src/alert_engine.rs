use crate::models::{Alert, BackendKind, Severity, WalletReport};
use chrono::Utc;

pub fn generate_wallet_alerts(report: &WalletReport) -> Vec<Alert> {
    let mut alerts = Vec::new();
    let now = Utc::now().to_rfc3339();

    if report.totals.utxo_count > 0 {
        alerts.push(alert(
            format!("wallet_activity:{}", report.wallet.id),
            Severity::Info,
            "Wallet activity loaded",
            format!(
                "XpubShield loaded {} watch-only UTXOs from the selected backend.",
                report.totals.utxo_count
            ),
            &now,
        ));
    }

    if report.wallet.backend == BackendKind::PublicEsplora {
        alerts.push(alert(
            format!("public_api:{}", report.wallet.id),
            Severity::High,
            "Public API mode enabled",
            "Public API mode is weak privacy. XpubShield must still query derived addresses only and never upload raw xpubs or descriptors.",
            &now,
        ));
    }

    for finding in &report.findings {
        match finding.id.as_str() {
            "address_reuse" => alerts.push(alert(
                format!("address_reuse:{}", report.wallet.id),
                Severity::High,
                "New address reuse detected",
                "One or more receive addresses appear more than once. This may link deposits.",
                &now,
            )),
            "derivation_gap_risk" => alerts.push(alert(
                format!("gap_risk:{}", report.wallet.id),
                Severity::Medium,
                "Activity near gap limit",
                "Wallet activity appears near the configured gap limit. Recovery scans may need a wider range.",
                &now,
            )),
            _ => {}
        }
    }

    if report.utxos.iter().any(|utxo| utxo.confirmations == 0) {
        alerts.push(alert(
            format!("unconfirmed:{}", report.wallet.id),
            Severity::Medium,
            "Unconfirmed UTXO detected",
            "One or more wallet UTXOs have zero confirmations. Treat them as pending.",
            &now,
        ));
    }

    alerts
}

pub fn psbt_quarantine_alert(wallet_id: &str) -> Alert {
    alert(
        format!("psbt_quarantine:{wallet_id}"),
        Severity::High,
        "PSBT attempts to spend quarantined UTXO",
        "A locally analyzed PSBT includes one or more UTXOs marked as quarantined in XpubShield.",
        &Utc::now().to_rfc3339(),
    )
}

fn alert(id: String, severity: Severity, title: &str, message: impl Into<String>, created_at: &str) -> Alert {
    Alert {
        id,
        severity,
        title: title.to_string(),
        message: message.into(),
        acknowledged: false,
        created_at: created_at.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blockchain_backend::BlockchainBackend;
    use crate::mock_backend::{build_demo_import, MockBackend};

    #[test]
    fn generates_address_reuse_alert_from_findings() {
        let report = MockBackend.scan_wallet(&build_demo_import());
        let alerts = generate_wallet_alerts(&report);

        assert!(alerts.iter().any(|alert| alert.id.starts_with("address_reuse:")));
    }

    #[test]
    fn generates_public_api_alert() {
        let mut import = build_demo_import();
        import.backend = BackendKind::PublicEsplora;
        let report = MockBackend.scan_wallet(&import);
        let alerts = generate_wallet_alerts(&report);

        assert!(alerts.iter().any(|alert| alert.id.starts_with("public_api:")));
    }
}
