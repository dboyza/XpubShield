use crate::address_derivation::derive_addresses_for_descriptors;
use crate::audit_engine::audit_wallet;
use crate::mock_backend::privacy_score_for_backend;
use crate::models::{
    BackendKind, Descriptor, Network, QuarantineStatus, SourceCategory, Transaction, Utxo,
    UtxoStatus, Wallet, WalletReport,
};
use crate::wallet_import::ValidatedImport;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitcoinCoreRpcConfig {
    pub url: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub wallet: Option<String>,
}

#[derive(Debug, Error)]
pub enum BitcoinCoreError {
    #[error("Bitcoin Core RPC URL must be local, for example http://127.0.0.1:8332")]
    NonLocalUrl,
    #[error("Bitcoin Core RPC URL must use http://")]
    UnsupportedUrl,
    #[error("Bitcoin Core RPC connection failed: {0}")]
    Connection(String),
    #[error("Bitcoin Core RPC request failed: {0}")]
    Rpc(String),
    #[error("Bitcoin Core RPC response could not be parsed: {0}")]
    Parse(String),
    #[error("Wallet addresses could not be derived locally: {0}")]
    Derivation(String),
}

#[derive(Debug, Deserialize)]
struct RpcEnvelope<T> {
    result: Option<T>,
    error: Option<RpcError>,
}

#[derive(Debug, Deserialize)]
struct RpcError {
    code: i64,
    message: String,
}

#[derive(Debug, Deserialize)]
pub struct ScantxoutsetResult {
    pub success: bool,
    pub height: Option<u64>,
    #[serde(default)]
    pub unspents: Vec<ScantxoutsetUnspent>,
}

#[derive(Debug, Deserialize)]
pub struct ScantxoutsetUnspent {
    pub txid: String,
    pub vout: u32,
    #[serde(rename = "scriptPubKey")]
    pub script_pubkey: String,
    pub desc: Option<String>,
    pub amount: f64,
    pub height: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct BitcoinCoreBackend {
    config: BitcoinCoreRpcConfig,
}

impl BitcoinCoreBackend {
    pub fn new(config: BitcoinCoreRpcConfig) -> Result<Self, BitcoinCoreError> {
        if !is_local_rpc_url(&config.url) {
            return Err(BitcoinCoreError::NonLocalUrl);
        }
        Ok(Self { config })
    }

    pub fn scan_wallet(&self, import: &ValidatedImport) -> Result<WalletReport, BitcoinCoreError> {
        let wallet_id = "wallet_bitcoin_core".to_string();
        let now = Utc::now().to_rfc3339();
        let wallet = Wallet {
            id: wallet_id.clone(),
            name: import.wallet_name.clone(),
            network: import.network,
            backend: BackendKind::BitcoinCoreRpc,
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
                .map_err(|error| BitcoinCoreError::Derivation(error.to_string()))?;
        let scan_objects = scan_objects_for_addresses(addresses.iter().map(|address| address.address.as_str()));
        let scan_result = self.scantxoutset(&scan_objects)?;
        let mut utxos = utxos_from_scan_result(&wallet.network, &descriptors, &scan_result);
        mark_used_addresses(&mut addresses, &utxos);
        let transactions = transactions_from_utxos(&utxos);
        let (findings, scores, totals) = audit_wallet(&wallet, &addresses, &mut utxos);

        Ok(WalletReport {
            backend_privacy: privacy_score_for_backend(BackendKind::BitcoinCoreRpc),
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

    fn scantxoutset(&self, scan_objects: &[String]) -> Result<ScantxoutsetResult, BitcoinCoreError> {
        let response = self.call("scantxoutset", json!(["start", scan_objects]))?;
        let envelope: RpcEnvelope<ScantxoutsetResult> =
            serde_json::from_value(response).map_err(|error| BitcoinCoreError::Parse(error.to_string()))?;
        if let Some(error) = envelope.error {
            return Err(BitcoinCoreError::Rpc(format!("{}: {}", error.code, error.message)));
        }
        let result = envelope
            .result
            .ok_or_else(|| BitcoinCoreError::Parse("missing result".to_string()))?;
        if !result.success {
            return Err(BitcoinCoreError::Rpc("scantxoutset did not complete successfully".to_string()));
        }
        Ok(result)
    }

    fn call(&self, method: &str, params: Value) -> Result<Value, BitcoinCoreError> {
        let endpoint = RpcEndpoint::parse(&self.config.url, self.config.wallet.as_deref())?;
        let body = json!({
            "jsonrpc": "1.0",
            "id": "xpubshield",
            "method": method,
            "params": params,
        })
        .to_string();
        let mut headers = vec![
            format!("POST {} HTTP/1.1", endpoint.path),
            format!("Host: {}", endpoint.host),
            "Content-Type: application/json".to_string(),
            format!("Content-Length: {}", body.len()),
            "Connection: close".to_string(),
        ];
        if let (Some(username), Some(password)) = (&self.config.username, &self.config.password) {
            let credentials = BASE64_STANDARD.encode(format!("{username}:{password}"));
            headers.push(format!("Authorization: Basic {credentials}"));
        }
        let request = format!("{}\r\n\r\n{}", headers.join("\r\n"), body);
        let mut stream = TcpStream::connect((endpoint.host.as_str(), endpoint.port))
            .map_err(|error| BitcoinCoreError::Connection(error.to_string()))?;
        let timeout = Some(Duration::from_secs(30));
        stream
            .set_read_timeout(timeout)
            .map_err(|error| BitcoinCoreError::Connection(error.to_string()))?;
        stream
            .set_write_timeout(timeout)
            .map_err(|error| BitcoinCoreError::Connection(error.to_string()))?;
        stream
            .write_all(request.as_bytes())
            .map_err(|error| BitcoinCoreError::Connection(error.to_string()))?;

        let mut response = String::new();
        stream
            .read_to_string(&mut response)
            .map_err(|error| BitcoinCoreError::Connection(error.to_string()))?;
        parse_http_json_response(&response)
    }
}

pub fn is_local_rpc_url(url: &str) -> bool {
    url.starts_with("http://127.0.0.1")
        || url.starts_with("http://localhost")
        || url.starts_with("http://[::1]")
}

pub fn scan_objects_for_addresses<'a>(addresses: impl Iterator<Item = &'a str>) -> Vec<String> {
    addresses
        .map(|address| format!("addr({address})"))
        .collect()
}

pub fn utxos_from_scan_result(
    network: &Network,
    descriptors: &[Descriptor],
    result: &ScantxoutsetResult,
) -> Vec<Utxo> {
    let script_type = descriptors
        .first()
        .map(|descriptor| descriptor.script_type)
        .unwrap_or_default();
    result
        .unspents
        .iter()
        .map(|unspent| {
            let confirmations = result
                .height
                .zip(unspent.height)
                .map(|(tip, height)| tip.saturating_sub(height).saturating_add(1))
                .unwrap_or(0);
            Utxo {
                txid: unspent.txid.clone(),
                vout: unspent.vout,
                outpoint: format!("{}:{}", unspent.txid, unspent.vout),
                amount_sats: btc_to_sats(unspent.amount),
                address: address_from_scan_desc(unspent.desc.as_deref()).unwrap_or_else(|| "unknown".to_string()),
                script_pubkey: unspent.script_pubkey.clone(),
                script_type,
                derivation_path: derivation_path_from_scan_desc(unspent.desc.as_deref())
                    .unwrap_or_else(|| format!("m/{network:?}/unknown")),
                confirmations: confirmations.min(u32::MAX as u64) as u32,
                block_height: unspent.height.map(|height| height.min(u32::MAX as u64) as u32),
                block_time: None,
                label: None,
                source_label: None,
                source_category: SourceCategory::Unknown,
                is_change: false,
                source_txid: Some(unspent.txid.clone()),
                spend_vbytes_estimate: spend_vbytes(script_type),
                spend_cost_by_fee_rate: Vec::new(),
                audit_flags: Vec::new(),
                quarantine_status: QuarantineStatus::None,
                spendability_status: UtxoStatus::Unknown,
            }
        })
        .collect()
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
            block_time: None,
            confirmations: utxo.confirmations,
            fee_sats: None,
            vsize: None,
            explanation: format!(
                "Bitcoin Core reported this unspent output locally for {} sats. This does not identify the sender.",
                utxo.amount_sats
            ),
        })
        .collect()
}

fn parse_http_json_response(response: &str) -> Result<Value, BitcoinCoreError> {
    let (headers, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| BitcoinCoreError::Parse("missing HTTP response body".to_string()))?;
    let status = headers.lines().next().unwrap_or_default();
    if !(status.contains(" 200 ") || status.ends_with(" 200 OK")) {
        return Err(BitcoinCoreError::Rpc(status.to_string()));
    }
    serde_json::from_str(body).map_err(|error| BitcoinCoreError::Parse(error.to_string()))
}

fn btc_to_sats(amount: f64) -> u64 {
    (amount * 100_000_000.0).round() as u64
}

fn address_from_scan_desc(desc: Option<&str>) -> Option<String> {
    let desc = desc?;
    let start = desc.find("addr(")? + 5;
    let end = desc[start..].find(')')? + start;
    Some(desc[start..end].to_string())
}

fn derivation_path_from_scan_desc(desc: Option<&str>) -> Option<String> {
    let desc = desc?;
    desc.split('#')
        .next()
        .and_then(|value| value.rsplit('/').next())
        .map(|leaf| format!("m/.../{leaf}"))
}

fn spend_vbytes(script_type: crate::models::ScriptType) -> u32 {
    match script_type {
        crate::models::ScriptType::Legacy => 148,
        crate::models::ScriptType::NestedSegwit => 91,
        crate::models::ScriptType::Taproot => 58,
        _ => 68,
    }
}

struct RpcEndpoint {
    host: String,
    port: u16,
    path: String,
}

impl RpcEndpoint {
    fn parse(url: &str, wallet: Option<&str>) -> Result<Self, BitcoinCoreError> {
        if !url.starts_with("http://") {
            return Err(BitcoinCoreError::UnsupportedUrl);
        }
        if !is_local_rpc_url(url) {
            return Err(BitcoinCoreError::NonLocalUrl);
        }
        let rest = &url["http://".len()..];
        let (authority, path) = rest.split_once('/').unwrap_or((rest, ""));
        let (host, port) = parse_authority(authority)?;
        let mut path = if path.is_empty() {
            "/".to_string()
        } else {
            format!("/{path}")
        };
        if let Some(wallet) = wallet.filter(|wallet| !wallet.trim().is_empty()) {
            path = format!("{}/wallet/{}", path.trim_end_matches('/'), wallet.trim());
        }
        Ok(Self { host, port, path })
    }
}

fn parse_authority(authority: &str) -> Result<(String, u16), BitcoinCoreError> {
    if authority.starts_with("[::1]") {
        let port = authority
            .strip_prefix("[::1]:")
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(8332);
        return Ok(("::1".to_string(), port));
    }
    let (host, port) = authority
        .rsplit_once(':')
        .map(|(host, port)| (host, port.parse::<u16>().unwrap_or(8332)))
        .unwrap_or((authority, 8332));
    Ok((host.to_string(), port))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_local_rpc_urls() {
        assert!(BitcoinCoreBackend::new(BitcoinCoreRpcConfig {
            url: "https://example.com".to_string(),
            username: None,
            password: None,
            wallet: None,
        })
        .is_err());
    }

    #[test]
    fn scan_objects_use_addresses_only() {
        let objects = scan_objects_for_addresses(["bc1qexample", "bc1qother"].into_iter());

        assert_eq!(objects, vec!["addr(bc1qexample)", "addr(bc1qother)"]);
        assert!(objects.iter().all(|object| !object.contains("xpub")));
        assert!(objects.iter().all(|object| !object.contains("wpkh(")));
    }

    #[test]
    fn maps_scantxoutset_unspents_to_utxos() {
        let result = ScantxoutsetResult {
            success: true,
            height: Some(100),
            unspents: vec![ScantxoutsetUnspent {
                txid: "00".repeat(32),
                vout: 1,
                script_pubkey: "0014abcd".to_string(),
                desc: Some("addr(bc1qexample)#checksum".to_string()),
                amount: 0.0125,
                height: Some(90),
            }],
        };

        let utxos = utxos_from_scan_result(&Network::Mainnet, &[], &result);

        assert_eq!(utxos.len(), 1);
        assert_eq!(utxos[0].amount_sats, 1_250_000);
        assert_eq!(utxos[0].confirmations, 11);
        assert_eq!(utxos[0].address, "bc1qexample");
    }
}
