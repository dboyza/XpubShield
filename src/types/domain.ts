export type Network = "mainnet" | "testnet" | "signet" | "regtest";
export type BackendKind = "mock" | "bitcoin_core_rpc" | "electrum" | "esplora" | "public_esplora";
export type ScriptType =
  | "legacy"
  | "nested_segwit"
  | "native_segwit"
  | "taproot"
  | "multisig"
  | "unknown";
export type Keychain = "external" | "change";
export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type ConfidenceLevel = "low" | "medium" | "high";
export type SourceCategory =
  | "exchange"
  | "mining"
  | "p2p"
  | "business"
  | "donation"
  | "gift"
  | "unknown"
  | "cold_storage"
  | "consolidation"
  | "change"
  | "other";
export type UtxoStatus =
  | "spendable"
  | "do_not_spend"
  | "quarantined"
  | "consolidate_later"
  | "cold_storage_only"
  | "needs_accounting_review"
  | "unknown";
export type QuarantineStatus =
  | "none"
  | "dust_attack_suspicion"
  | "unknown_source"
  | "unlabeled_deposit"
  | "too_small_to_spend_economically"
  | "received_to_reused_address"
  | "avoid_kyc_mix"
  | "avoid_non_kyc_mix"
  | "suspicious_external_pattern"
  | "manual";
export type ProvenanceSourceKind = "manual" | "registry" | "heuristic" | "wallet_change" | "unknown";

export interface ImportRequest {
  import_kind: "descriptor" | "xpub" | "demo";
  wallet_name?: string;
  descriptor?: string;
  xpub?: string;
  network: Network;
  script_type?: ScriptType;
  account_path_guess?: string;
  gap_limit?: number;
  backend?: BackendKind;
  bitcoin_core_rpc?: BitcoinCoreRpcConfig;
  esplora?: EsploraBackendConfig;
  public_api_acknowledged: boolean;
}

export interface BitcoinCoreRpcConfig {
  url: string;
  username?: string | null;
  password?: string | null;
  wallet?: string | null;
}

export interface EsploraBackendConfig {
  base_url: string;
  use_tor: boolean;
  public_api_acknowledged: boolean;
}

export interface Wallet {
  id: string;
  name: string;
  network: Network;
  backend: BackendKind;
  gap_limit: number;
  descriptor_based: boolean;
  created_at: string;
}

export interface Descriptor {
  id: string;
  wallet_id: string;
  keychain: Keychain;
  descriptor: string;
  checksum?: string | null;
  script_type: ScriptType;
  master_fingerprint?: string | null;
  account_path?: string | null;
  is_descriptor_based: boolean;
}

export interface DerivedAddress {
  id: string;
  wallet_id: string;
  keychain: Keychain;
  index: number;
  address: string;
  derivation_path: string;
  script_type: ScriptType;
  used: boolean;
  receive_count: number;
}

export interface Transaction {
  txid: string;
  block_height?: number | null;
  block_time?: string | null;
  confirmations: number;
  fee_sats?: number | null;
  vsize?: number | null;
  explanation: string;
}

export interface FeeCost {
  fee_rate: number;
  cost_sats: number;
  percent_of_value: number;
}

export interface Utxo {
  txid: string;
  vout: number;
  outpoint: string;
  amount_sats: number;
  address: string;
  script_pubkey: string;
  script_type: ScriptType;
  derivation_path: string;
  confirmations: number;
  block_height?: number | null;
  block_time?: string | null;
  label?: string | null;
  source_label?: string | null;
  source_category: SourceCategory;
  is_change: boolean;
  source_txid?: string | null;
  spend_vbytes_estimate: number;
  spend_cost_by_fee_rate: FeeCost[];
  audit_flags: string[];
  quarantine_status: QuarantineStatus;
  spendability_status: UtxoStatus;
  provenance: ProvenanceAssessment;
}

export interface AuditFinding {
  id: string;
  severity: Severity;
  title: string;
  explanation: string;
  recommended_action: string;
  affected_utxos: string[];
  affected_transactions: string[];
  confidence_level: ConfidenceLevel;
  heuristic_notes: string;
}

export interface ProvenanceEvidence {
  id: string;
  label: string;
  detail: string;
  confidence_level: ConfidenceLevel;
  source: string;
}

export interface ProvenanceAssessment {
  source_kind: ProvenanceSourceKind;
  entity_label?: string | null;
  category: SourceCategory;
  confidence_level: ConfidenceLevel;
  evidence: ProvenanceEvidence[];
  updated_at: string;
}

export interface ProvenanceSummary {
  assessed_count: number;
  manual_count: number;
  registry_count: number;
  heuristic_count: number;
  unknown_count: number;
  exchange_like_count: number;
}

export interface ActionItem {
  id: string;
  severity: Severity;
  title: string;
  summary: string;
  why_it_matters: string;
  recommended_action: string;
  cta_page: string;
  affected_utxos: string[];
  confidence_level: ConfidenceLevel;
  dismissed: boolean;
}

export interface RiskScores {
  privacy: number;
  fee_efficiency: number;
  operational_clarity: number;
  spend_readiness: number;
  recovery_readiness: number;
  backend_privacy: number;
}

export interface BackendPrivacyScore {
  score: number;
  mode: BackendKind;
  summary: string;
  warnings: string[];
}

export interface Alert {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  acknowledged: boolean;
  created_at: string;
}

export interface Label {
  id: string;
  wallet_id: string;
  target_type: string;
  target_id: string;
  label: string;
  category: SourceCategory;
}

export interface FeeEstimate {
  fee_rate: number;
  estimated_vbytes: number;
  estimated_fee_sats: number;
}

export interface SpendSimulation {
  selected_outpoints: string[];
  destination_amount_sats: number;
  fee_estimate: FeeEstimate;
  change_amount_sats?: number | null;
  warnings: AuditFinding[];
}

export interface ConsolidationSimulation {
  selected_outpoints: string[];
  current_utxo_count: number;
  proposed_utxo_count: number;
  fee_estimate: FeeEstimate;
  privacy_notes: string[];
}

export interface WalletTotals {
  balance_sats: number;
  utxo_count: number;
  largest_utxo_sats: number;
  smallest_utxo_sats: number;
  by_category: Record<string, number>;
}

export interface WalletReport {
  wallet: Wallet;
  descriptors: Descriptor[];
  derived_addresses: DerivedAddress[];
  transactions: Transaction[];
  utxos: Utxo[];
  findings: AuditFinding[];
  scores: RiskScores;
  backend_privacy: BackendPrivacyScore;
  totals: WalletTotals;
  actions: ActionItem[];
  provenance_summary: ProvenanceSummary;
}

export interface CoinSet {
  id: string;
  wallet_id: string;
  name: string;
  intent: string;
  outpoints: string[];
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type UtxoUpdate = Partial<
  Pick<
    Utxo,
    | "label"
    | "source_label"
    | "source_category"
    | "quarantine_status"
    | "spendability_status"
  >
>;
