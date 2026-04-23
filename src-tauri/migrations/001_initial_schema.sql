PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  network TEXT NOT NULL,
  backend TEXT NOT NULL,
  gap_limit INTEGER NOT NULL DEFAULT 20,
  descriptor_based INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS descriptors (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  keychain TEXT NOT NULL,
  descriptor TEXT NOT NULL,
  checksum TEXT,
  script_type TEXT NOT NULL,
  master_fingerprint TEXT,
  account_path TEXT,
  is_descriptor_based INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS derived_addresses (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  keychain TEXT NOT NULL,
  address_index INTEGER NOT NULL,
  address TEXT NOT NULL,
  derivation_path TEXT NOT NULL,
  script_type TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  receive_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(wallet_id, keychain, address_index)
);

CREATE TABLE IF NOT EXISTS transactions (
  txid TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  block_height INTEGER,
  block_time TEXT,
  confirmations INTEGER NOT NULL DEFAULT 0,
  fee_sats INTEGER,
  vsize INTEGER,
  explanation TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS transaction_inputs (
  id TEXT PRIMARY KEY,
  txid TEXT NOT NULL REFERENCES transactions(txid) ON DELETE CASCADE,
  prev_txid TEXT NOT NULL,
  prev_vout INTEGER NOT NULL,
  amount_sats INTEGER,
  wallet_owned INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transaction_outputs (
  id TEXT PRIMARY KEY,
  txid TEXT NOT NULL REFERENCES transactions(txid) ON DELETE CASCADE,
  vout INTEGER NOT NULL,
  amount_sats INTEGER NOT NULL,
  address TEXT,
  script_pubkey TEXT NOT NULL,
  wallet_owned INTEGER NOT NULL DEFAULT 0,
  is_change INTEGER NOT NULL DEFAULT 0,
  UNIQUE(txid, vout)
);

CREATE TABLE IF NOT EXISTS utxos (
  outpoint TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  txid TEXT NOT NULL,
  vout INTEGER NOT NULL,
  amount_sats INTEGER NOT NULL,
  address TEXT NOT NULL,
  script_pubkey TEXT NOT NULL,
  script_type TEXT NOT NULL,
  derivation_path TEXT NOT NULL,
  confirmations INTEGER NOT NULL DEFAULT 0,
  block_height INTEGER,
  block_time TEXT,
  label TEXT,
  source_label TEXT,
  source_category TEXT NOT NULL DEFAULT 'unknown',
  is_change INTEGER NOT NULL DEFAULT 0,
  source_txid TEXT,
  spend_vbytes_estimate INTEGER NOT NULL DEFAULT 0,
  audit_flags_json TEXT NOT NULL DEFAULT '[]',
  quarantine_status TEXT NOT NULL DEFAULT 'none',
  spendability_status TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS labels (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS audit_findings (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  affected_utxos_json TEXT NOT NULL DEFAULT '[]',
  affected_transactions_json TEXT NOT NULL DEFAULT '[]',
  confidence_level TEXT NOT NULL,
  heuristic_notes TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS spend_simulations (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  selected_outpoints_json TEXT NOT NULL,
  destination_amount_sats INTEGER NOT NULL,
  fee_rate INTEGER NOT NULL,
  estimated_vbytes INTEGER NOT NULL,
  estimated_fee_sats INTEGER NOT NULL,
  change_amount_sats INTEGER,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS consolidation_plans (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  selected_outpoints_json TEXT NOT NULL,
  current_utxo_count INTEGER NOT NULL,
  proposed_utxo_count INTEGER NOT NULL,
  fee_rate INTEGER NOT NULL,
  estimated_fee_sats INTEGER NOT NULL,
  privacy_notes_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS psbt_analyses (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE SET NULL,
  psbt_fingerprint TEXT NOT NULL,
  summary TEXT NOT NULL,
  fee_sats INTEGER,
  fee_rate REAL,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backend_configs (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  backend_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  privacy_score INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_utxos_wallet ON utxos(wallet_id);
CREATE INDEX IF NOT EXISTS idx_utxos_label ON utxos(label);
CREATE INDEX IF NOT EXISTS idx_utxos_source_category ON utxos(source_category);
CREATE INDEX IF NOT EXISTS idx_utxos_quarantine ON utxos(quarantine_status);
CREATE INDEX IF NOT EXISTS idx_addresses_wallet_used ON derived_addresses(wallet_id, used);
CREATE INDEX IF NOT EXISTS idx_findings_wallet_severity ON audit_findings(wallet_id, severity);

PRAGMA user_version = 1;
