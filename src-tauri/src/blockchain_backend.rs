use crate::models::{BackendKind, BackendPrivacyScore, WalletReport};
use crate::wallet_import::ValidatedImport;

pub trait BlockchainBackend {
    fn kind(&self) -> BackendKind;
    fn privacy_score(&self) -> BackendPrivacyScore;
    fn scan_wallet(&self, import: &ValidatedImport) -> WalletReport;
}
