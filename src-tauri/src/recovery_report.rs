use crate::models::{RecoveryHealthReport, WalletReport};

pub fn score_recovery_readiness(report: &WalletReport) -> RecoveryHealthReport {
    let mut score = 100u8;
    let mut warnings = Vec::new();

    if !report.descriptors.iter().any(|descriptor| descriptor.keychain == crate::models::Keychain::Change) {
        score = score.saturating_sub(15);
        warnings.push("No change descriptor is present.".to_string());
    }
    if report.descriptors.iter().any(|descriptor| descriptor.master_fingerprint.is_none()) {
        score = score.saturating_sub(10);
        warnings.push("One or more descriptors are missing a master fingerprint.".to_string());
    }
    if report.descriptors.iter().any(|descriptor| descriptor.checksum.is_none()) {
        score = score.saturating_sub(5);
        warnings.push("One or more descriptors are missing a checksum.".to_string());
    }

    RecoveryHealthReport {
        wallet_name: report.wallet.name.clone(),
        score,
        warnings,
    }
}
