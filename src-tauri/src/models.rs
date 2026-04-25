use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Network {
    Mainnet,
    Testnet,
    Signet,
    Regtest,
}

impl Default for Network {
    fn default() -> Self {
        Self::Mainnet
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackendKind {
    Mock,
    BitcoinCoreRpc,
    Electrum,
    PublicElectrum,
    Esplora,
    PublicEsplora,
}

impl Default for BackendKind {
    fn default() -> Self {
        Self::Mock
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ScriptType {
    Legacy,
    NestedSegwit,
    NativeSegwit,
    Taproot,
    Multisig,
    Unknown,
}

impl Default for ScriptType {
    fn default() -> Self {
        Self::NativeSegwit
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Keychain {
    External,
    Change,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Info,
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConfidenceLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SourceCategory {
    Exchange,
    Mining,
    P2p,
    Business,
    Donation,
    Gift,
    Unknown,
    ColdStorage,
    Consolidation,
    Change,
    Other,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UtxoStatus {
    Spendable,
    DoNotSpend,
    Quarantined,
    ConsolidateLater,
    ColdStorageOnly,
    NeedsAccountingReview,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QuarantineStatus {
    None,
    DustAttackSuspicion,
    UnknownSource,
    UnlabeledDeposit,
    TooSmallToSpendEconomically,
    ReceivedToReusedAddress,
    AvoidKycMix,
    AvoidNonKycMix,
    SuspiciousExternalPattern,
    Manual,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProvenanceSourceKind {
    Manual,
    Registry,
    Heuristic,
    WalletChange,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Wallet {
    pub id: String,
    pub name: String,
    pub network: Network,
    pub backend: BackendKind,
    pub gap_limit: u32,
    pub descriptor_based: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Descriptor {
    pub id: String,
    pub wallet_id: String,
    pub keychain: Keychain,
    pub descriptor: String,
    pub checksum: Option<String>,
    pub script_type: ScriptType,
    pub master_fingerprint: Option<String>,
    pub account_path: Option<String>,
    pub is_descriptor_based: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DerivedAddress {
    pub id: String,
    pub wallet_id: String,
    pub keychain: Keychain,
    pub index: u32,
    pub address: String,
    pub derivation_path: String,
    pub script_type: ScriptType,
    pub used: bool,
    pub receive_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub txid: String,
    pub block_height: Option<u32>,
    pub block_time: Option<String>,
    pub confirmations: u32,
    pub fee_sats: Option<u64>,
    pub vsize: Option<u32>,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeeCost {
    pub fee_rate: u32,
    pub cost_sats: u64,
    pub percent_of_value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Utxo {
    pub txid: String,
    pub vout: u32,
    pub outpoint: String,
    pub amount_sats: u64,
    pub address: String,
    pub script_pubkey: String,
    pub script_type: ScriptType,
    pub derivation_path: String,
    pub confirmations: u32,
    pub block_height: Option<u32>,
    pub block_time: Option<String>,
    pub label: Option<String>,
    pub source_label: Option<String>,
    pub source_category: SourceCategory,
    pub is_change: bool,
    pub source_txid: Option<String>,
    pub spend_vbytes_estimate: u32,
    pub spend_cost_by_fee_rate: Vec<FeeCost>,
    pub audit_flags: Vec<String>,
    pub quarantine_status: QuarantineStatus,
    pub spendability_status: UtxoStatus,
    pub provenance: ProvenanceAssessment,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Label {
    pub id: String,
    pub wallet_id: String,
    pub target_type: String,
    pub target_id: String,
    pub label: String,
    pub category: SourceCategory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditFinding {
    pub id: String,
    pub severity: Severity,
    pub title: String,
    pub explanation: String,
    pub recommended_action: String,
    pub affected_utxos: Vec<String>,
    pub affected_transactions: Vec<String>,
    pub confidence_level: ConfidenceLevel,
    pub heuristic_notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvenanceEvidence {
    pub id: String,
    pub label: String,
    pub detail: String,
    pub confidence_level: ConfidenceLevel,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvenanceAssessment {
    pub source_kind: ProvenanceSourceKind,
    pub entity_label: Option<String>,
    pub category: SourceCategory,
    pub confidence_level: ConfidenceLevel,
    pub evidence: Vec<ProvenanceEvidence>,
    pub updated_at: String,
}

impl Default for ProvenanceAssessment {
    fn default() -> Self {
        Self {
            source_kind: ProvenanceSourceKind::Unknown,
            entity_label: None,
            category: SourceCategory::Unknown,
            confidence_level: ConfidenceLevel::Low,
            evidence: vec![ProvenanceEvidence {
                id: "unknown_source".to_string(),
                label: "No local provenance evidence".to_string(),
                detail: "No manual label, registry pattern, or wallet-change heuristic matched this coin.".to_string(),
                confidence_level: ConfidenceLevel::Low,
                source: "local_provenance_engine".to_string(),
            }],
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProvenanceSummary {
    pub assessed_count: usize,
    pub manual_count: usize,
    pub registry_count: usize,
    pub heuristic_count: usize,
    pub unknown_count: usize,
    pub exchange_like_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionItem {
    pub id: String,
    pub severity: Severity,
    pub title: String,
    pub summary: String,
    pub why_it_matters: String,
    pub recommended_action: String,
    pub cta_page: String,
    pub affected_utxos: Vec<String>,
    pub confidence_level: ConfidenceLevel,
    pub dismissed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskScores {
    pub privacy: u8,
    pub fee_efficiency: u8,
    pub operational_clarity: u8,
    pub spend_readiness: u8,
    pub recovery_readiness: u8,
    pub backend_privacy: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendPrivacyScore {
    pub score: u8,
    pub mode: BackendKind,
    pub summary: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletReport {
    pub wallet: Wallet,
    pub descriptors: Vec<Descriptor>,
    pub derived_addresses: Vec<DerivedAddress>,
    pub transactions: Vec<Transaction>,
    pub utxos: Vec<Utxo>,
    pub findings: Vec<AuditFinding>,
    pub scores: RiskScores,
    pub backend_privacy: BackendPrivacyScore,
    pub totals: WalletTotals,
    pub actions: Vec<ActionItem>,
    pub provenance_summary: ProvenanceSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WalletTotals {
    pub balance_sats: u64,
    pub utxo_count: usize,
    pub largest_utxo_sats: u64,
    pub smallest_utxo_sats: u64,
    pub by_category: BTreeMap<String, u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeeEstimate {
    pub fee_rate: u32,
    pub estimated_vbytes: u32,
    pub estimated_fee_sats: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpendSimulation {
    pub selected_outpoints: Vec<String>,
    pub destination_amount_sats: u64,
    pub fee_estimate: FeeEstimate,
    pub change_amount_sats: Option<u64>,
    pub warnings: Vec<AuditFinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsolidationPlan {
    pub selected_outpoints: Vec<String>,
    pub current_utxo_count: usize,
    pub proposed_utxo_count: usize,
    pub fee_estimate: FeeEstimate,
    pub privacy_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PsbtAnalysis {
    pub summary: String,
    pub warnings: Vec<AuditFinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryHealthReport {
    pub wallet_name: String,
    pub score: u8,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub node_type: String,
    pub label: String,
    pub risk_state: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub edge_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    pub id: String,
    pub severity: Severity,
    pub title: String,
    pub message: String,
    pub acknowledged: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoinSet {
    pub id: String,
    pub wallet_id: String,
    pub name: String,
    pub intent: String,
    pub outpoints: Vec<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
