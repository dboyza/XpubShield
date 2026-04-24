use crate::address_derivation::derive_addresses_for_descriptors;
use crate::audit_engine::audit_wallet;
use crate::mock_backend::privacy_score_for_backend;
use crate::models::{
    BackendKind, QuarantineStatus, SourceCategory, Transaction, Utxo, UtxoStatus, Wallet,
    WalletReport,
};
use crate::wallet_import::ValidatedImport;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EsploraBackendConfig {
    pub base_url: String,
    pub use_tor: bool,
    pub public_api_acknowledged: bool,
}

#[derive(Debug, Error)]
pub enum EsploraError {
    #[error("Public Esplora mode requires explicit privacy acknowledgement.")]
    PublicApiWithoutAcknowledgement,
    #[error("Wallet addresses could not be derived locally: {0}")]
    Derivation(String),
    #[error("Esplora request failed: {0}")]
    Request(String),
    #[error("Esplora response could not be parsed: {0}")]
    Parse(String),
}

#[derive(Debug, Clone)]
pub struct EsploraBackend {
    config: EsploraBackendConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EsploraUtxo {
    pub txid: String,
    pub vout: u32,
    pub value: u64,
    pub status: EsploraStatus,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EsploraStatus {
    pub confirmed: bool,
    pub block_height: Option<u32>,
    pub block_time: Option<u64>,
}

impl EsploraBackend {
    pub fn new(config: EsploraBackendConfig) -> Result<Self, EsploraError> {
        if backend_kind_for_config(&config) == BackendKind::PublicEsplora
            && !config.public_api_acknowledged
        {
            return Err(EsploraError::PublicApiWithoutAcknowledgement);
        }
        Ok(Self { config })
    }

    pub fn scan_wallet(&self, import: &ValidatedImport) -> Result<WalletReport, EsploraError> {
        let wallet_id = "wallet_esplora".to_string();
        let now = Utc::now().to_rfc3339();
        let backend = backend_kind_for_config(&self.config);
        let wallet = Wallet {
            id: wallet_id.clone(),
            name: import.wallet_name.clone(),
            network: import.network,
            backend,
            gap_limit: import.gap_limit,
            descriptor_based: import.descriptor_based,
            created_at: now,
        };
        let mut descriptors = import.descriptors.clone();
        for descriptor in descriptors.iter_mut() {
            descriptor.wallet_id = wallet_id.clone();
        }
        let mut addresses =
            derive_addresses_for_descriptors(&wallet_id, &wallet.network, &descriptors, import.gap_limit)
                .map_err(|error| EsploraError::Derivation(error.to_string()))?;
        let script_type = descriptors
            .first()
            .map(|descriptor| descriptor.script_type)
            .unwrap_or_default();
        let mut utxos = Vec::new();

        for address in &addresses {
            let url = address_utxo_url(&self.config.base_url, &address.address);
            let response: Vec<EsploraUtxo> = ureq::get(&url)
                .call()
                .map_err(|error| EsploraError::Request(error.to_string()))?
                .into_json()
                .map_err(|error| EsploraError::Parse(error.to_string()))?;
            utxos.extend(response.into_iter().map(|utxo| {
                utxo_from_esplora(&wallet_id, &address.address, &address.derivation_path, script_type, utxo)
            }));
        }

        mark_used_addresses(&mut addresses, &utxos);
        let transactions = transactions_from_utxos(&utxos);
        let (findings, scores, totals) = audit_wallet(&wallet, &addresses, &mut utxos);

        Ok(WalletReport {
            backend_privacy: privacy_score_for_backend(backend),
            wallet,
            descriptors,
            derived_addresses: addresses,
            transactions,
            utxos,
            findings,
            scores,
            totals,
        })
    }
}

pub fn backend_kind_for_config(config: &EsploraBackendConfig) -> BackendKind {
    if is_public_esplora_url(&config.base_url) && !config.use_tor {
        BackendKind::PublicEsplora
    } else {
        BackendKind::Esplora
    }
}

pub fn address_utxo_url(base_url: &str, address: &str) -> String {
    format!("{}/address/{address}/utxo", base_url.trim_end_matches('/'))
}

pub fn is_public_esplora_url(base_url: &str) -> bool {
    base_url.contains("mempool.space") || base_url.contains("blockstream.info")
}

pub fn utxo_from_esplora(
    _wallet_id: &str,
    address: &str,
    derivation_path: &str,
    script_type: crate::models::ScriptType,
    utxo: EsploraUtxo,
) -> Utxo {
    Utxo {
        txid: utxo.txid.clone(),
        vout: utxo.vout,
        outpoint: format!("{}:{}", utxo.txid, utxo.vout),
        amount_sats: utxo.value,
        address: address.to_string(),
        script_pubkey: String::new(),
        script_type,
        derivation_path: derivation_path.to_string(),
        confirmations: if utxo.status.confirmed { 1 } else { 0 },
        block_height: utxo.status.block_height,
        block_time: utxo.status.block_time.map(|time| time.to_string()),
        label: None,
        source_label: None,
        source_category: SourceCategory::Unknown,
        is_change: false,
        source_txid: Some(utxo.txid),
        spend_vbytes_estimate: spend_vbytes(script_type),
        spend_cost_by_fee_rate: Vec::new(),
        audit_flags: Vec::new(),
        quarantine_status: QuarantineStatus::None,
        spendability_status: UtxoStatus::Unknown,
    }
}

fn mark_used_addresses(addresses: &mut [crate::models::DerivedAddress], utxos: &[Utxo]) {
    for address in addresses {
        let receive_count = utxos
            .iter()
            .filter(|utxo| utxo.address == address.address)
            .count() as u32;
        address.used = receive_count > 0;
        address.receive_count = receive_count;
    }
}

fn transactions_from_utxos(utxos: &[Utxo]) -> Vec<Transaction> {
    utxos
        .iter()
        .map(|utxo| Transaction {
            txid: utxo.txid.clone(),
            block_height: utxo.block_height,
            block_time: utxo.block_time.clone(),
            confirmations: utxo.confirmations,
            fee_sats: None,
            vsize: None,
            explanation: format!(
                "Esplora reported this unspent output for {} sats. This does not identify the sender.",
                utxo.amount_sats
            ),
        })
        .collect()
}

fn spend_vbytes(script_type: crate::models::ScriptType) -> u32 {
    match script_type {
        crate::models::ScriptType::Legacy => 148,
        crate::models::ScriptType::NestedSegwit => 91,
        crate::models::ScriptType::Taproot => 58,
        _ => 68,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_esplora_requires_acknowledgement() {
        let config = EsploraBackendConfig {
            base_url: "https://mempool.space/api".to_string(),
            use_tor: false,
            public_api_acknowledged: false,
        };

        assert!(EsploraBackend::new(config).is_err());
    }

    #[test]
    fn address_url_queries_address_only() {
        let url = address_utxo_url("https://mempool.space/api", "bc1qexample");

        assert_eq!(url, "https://mempool.space/api/address/bc1qexample/utxo");
        assert!(!url.contains("xpub"));
        assert!(!url.contains("wpkh("));
    }

    #[test]
    fn maps_esplora_utxo_to_wallet_utxo() {
        let utxo = utxo_from_esplora(
            "wallet",
            "bc1qexample",
            "m/84h/0h/0h/0/0",
            crate::models::ScriptType::NativeSegwit,
            EsploraUtxo {
                txid: "11".repeat(32),
                vout: 0,
                value: 42_000,
                status: EsploraStatus {
                    confirmed: true,
                    block_height: Some(840_000),
                    block_time: Some(1_700_000_000),
                },
            },
        );

        assert_eq!(utxo.amount_sats, 42_000);
        assert_eq!(utxo.confirmations, 1);
        assert_eq!(utxo.address, "bc1qexample");
    }
}
