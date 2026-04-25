use crate::action_engine::build_action_center;
use crate::address_derivation::derive_addresses_for_descriptors;
use crate::audit_engine::audit_wallet;
use crate::mock_backend::privacy_score_for_backend;
use crate::models::{
    BackendKind, QuarantineStatus, SourceCategory, Transaction, Utxo, UtxoStatus, Wallet,
    WalletReport,
};
use crate::provenance_engine::enrich_wallet_provenance;
use crate::wallet_import::ValidatedImport;
use chrono::Utc;
use miniscript::bitcoin::hashes::{sha256, Hash};
use miniscript::bitcoin::{Address, Network as BitcoinNetwork};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::str::FromStr;
use std::time::Duration;
use thiserror::Error;

const DEFAULT_TCP_PORT: u16 = 50001;
const MAX_ELECTRUM_RESPONSE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElectrumBackendConfig {
    pub server_url: String,
    pub display_name: Option<String>,
    pub public_server_acknowledged: bool,
}

#[derive(Debug, Error)]
pub enum ElectrumError {
    #[error("Public Electrum mode requires acknowledging that the server can infer wallet history from script-hash queries.")]
    PublicServerWithoutAcknowledgement,
    #[error("Electrum server URL is invalid. Use host:port or tcp://host:port.")]
    InvalidServerUrl,
    #[error("Electrum TLS/Tor proxy routing is not implemented in this pass. Use a tcp:// endpoint or a local/private server.")]
    UnsupportedScheme,
    #[error("Wallet addresses could not be derived locally: {0}")]
    Derivation(String),
    #[error("Derived address could not be converted to a script hash: {0}")]
    ScriptHash(String),
    #[error("Electrum connection failed: {0}")]
    Connection(String),
    #[error("Electrum request failed: {0}")]
    Request(String),
    #[error("Electrum response could not be parsed: {0}")]
    Parse(String),
    #[error("Electrum server returned an error: {0}")]
    Rpc(String),
}

#[derive(Debug, Clone)]
pub struct ElectrumBackend {
    config: ElectrumBackendConfig,
    backend: BackendKind,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ElectrumUnspent {
    pub tx_hash: String,
    pub tx_pos: u32,
    pub height: u32,
    pub value: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct ElectrumHeader {
    height: u32,
}

#[derive(Debug, Deserialize)]
struct ElectrumEnvelope<T> {
    id: Option<u64>,
    result: Option<T>,
    error: Option<ElectrumRpcError>,
}

#[derive(Debug, Deserialize)]
struct ElectrumRpcError {
    message: String,
}

trait ElectrumRpc {
    fn tip_height(&mut self) -> Result<u32, ElectrumError>;
    fn list_unspent(&mut self, script_hash: &str) -> Result<Vec<ElectrumUnspent>, ElectrumError>;
}

impl ElectrumBackend {
    pub fn new(config: ElectrumBackendConfig, backend: BackendKind) -> Result<Self, ElectrumError> {
        if matches!(backend, BackendKind::PublicElectrum) && !config.public_server_acknowledged {
            return Err(ElectrumError::PublicServerWithoutAcknowledgement);
        }
        parse_electrum_endpoint(&config.server_url)?;
        Ok(Self { config, backend })
    }

    pub fn scan_wallet(&self, import: &ValidatedImport) -> Result<WalletReport, ElectrumError> {
        let mut client = TcpElectrumClient::connect(&self.config)?;
        self.scan_wallet_with_client(import, &mut client)
    }

    fn scan_wallet_with_client(
        &self,
        import: &ValidatedImport,
        client: &mut impl ElectrumRpc,
    ) -> Result<WalletReport, ElectrumError> {
        let wallet_id = "wallet_electrum".to_string();
        let now = Utc::now().to_rfc3339();
        let backend = self.backend;
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
        let mut addresses = derive_addresses_for_descriptors(
            &wallet_id,
            &wallet.network,
            &descriptors,
            import.gap_limit,
        )
        .map_err(|error| ElectrumError::Derivation(error.to_string()))?;

        let tip_height = client.tip_height().unwrap_or(0);
        let mut utxos = Vec::new();
        for address in &addresses {
            let script_pubkey = script_pubkey_hex(&wallet.network, &address.address)?;
            let script_hash = electrum_script_hash(&wallet.network, &address.address)?;
            let unspents = client.list_unspent(&script_hash)?;
            utxos.extend(unspents.into_iter().map(|unspent| {
                utxo_from_electrum(
                    &wallet_id,
                    &address.address,
                    &address.derivation_path,
                    script_pubkey.clone(),
                    address.script_type,
                    tip_height,
                    unspent,
                )
            }));
        }

        mark_used_addresses(&mut addresses, &utxos);
        let transactions = transactions_from_utxos(&utxos);
        let (findings, scores, totals) = audit_wallet(&wallet, &addresses, &mut utxos);

        let mut report = WalletReport {
            backend_privacy: privacy_score_for_backend(backend),
            wallet,
            descriptors,
            derived_addresses: addresses,
            transactions,
            utxos,
            findings,
            scores,
            totals,
            actions: Vec::new(),
            provenance_summary: Default::default(),
        };
        enrich_wallet_provenance(&mut report);
        report.actions = build_action_center(&report, &BTreeSet::new());
        Ok(report)
    }
}

struct TcpElectrumClient {
    stream: TcpStream,
    next_id: u64,
}

impl TcpElectrumClient {
    fn connect(config: &ElectrumBackendConfig) -> Result<Self, ElectrumError> {
        let endpoint = parse_electrum_endpoint(&config.server_url)?;
        let stream = TcpStream::connect((endpoint.host.as_str(), endpoint.port))
            .map_err(|error| ElectrumError::Connection(error.to_string()))?;
        let timeout = Some(Duration::from_secs(30));
        stream
            .set_read_timeout(timeout)
            .map_err(|error| ElectrumError::Connection(error.to_string()))?;
        stream
            .set_write_timeout(timeout)
            .map_err(|error| ElectrumError::Connection(error.to_string()))?;
        Ok(Self { stream, next_id: 1 })
    }

    fn request<T: DeserializeOwned>(
        &mut self,
        method: &str,
        params: Value,
    ) -> Result<T, ElectrumError> {
        let id = self.next_id;
        self.next_id += 1;
        let request = build_request(id, method, params);
        self.stream
            .write_all(request.as_bytes())
            .map_err(|error| ElectrumError::Request(error.to_string()))?;
        loop {
            let response = read_response_line(&mut self.stream)?;
            let envelope: ElectrumEnvelope<T> = serde_json::from_str(&response)
                .map_err(|error| ElectrumError::Parse(error.to_string()))?;
            if envelope.id != Some(id) {
                continue;
            }
            if let Some(error) = envelope.error {
                return Err(ElectrumError::Rpc(error.message));
            }
            return envelope
                .result
                .ok_or_else(|| ElectrumError::Parse("missing result".to_string()));
        }
    }
}

impl ElectrumRpc for TcpElectrumClient {
    fn tip_height(&mut self) -> Result<u32, ElectrumError> {
        let header: ElectrumHeader = self.request("blockchain.headers.subscribe", json!([]))?;
        Ok(header.height)
    }

    fn list_unspent(&mut self, script_hash: &str) -> Result<Vec<ElectrumUnspent>, ElectrumError> {
        self.request("blockchain.scripthash.listunspent", json!([script_hash]))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ElectrumEndpoint {
    host: String,
    port: u16,
}

fn parse_electrum_endpoint(input: &str) -> Result<ElectrumEndpoint, ElectrumError> {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(ElectrumError::InvalidServerUrl);
    }
    let endpoint = if let Some(rest) = trimmed.strip_prefix("tcp://") {
        rest
    } else if trimmed.contains("://") {
        return Err(ElectrumError::UnsupportedScheme);
    } else {
        trimmed
    };

    if let Some(rest) = endpoint.strip_prefix('[') {
        let Some((host, tail)) = rest.split_once(']') else {
            return Err(ElectrumError::InvalidServerUrl);
        };
        let port = if let Some(port) = tail.strip_prefix(':') {
            parse_port(port)?
        } else {
            DEFAULT_TCP_PORT
        };
        return Ok(ElectrumEndpoint {
            host: host.to_string(),
            port,
        });
    }

    let (host, port) = if let Some((host, port)) = endpoint.rsplit_once(':') {
        (host, parse_port(port)?)
    } else {
        (endpoint, DEFAULT_TCP_PORT)
    };
    if host.trim().is_empty() {
        return Err(ElectrumError::InvalidServerUrl);
    }
    Ok(ElectrumEndpoint {
        host: host.to_string(),
        port,
    })
}

fn parse_port(value: &str) -> Result<u16, ElectrumError> {
    value
        .parse::<u16>()
        .map_err(|_| ElectrumError::InvalidServerUrl)
}

pub fn electrum_script_hash(
    network: &crate::models::Network,
    address: &str,
) -> Result<String, ElectrumError> {
    let script_pubkey = script_pubkey_bytes(network, address)?;
    let hash = sha256::Hash::hash(script_pubkey.as_slice());
    let mut bytes = hash.to_byte_array();
    bytes.reverse();
    Ok(hex_encode(&bytes))
}

fn script_pubkey_hex(
    network: &crate::models::Network,
    address: &str,
) -> Result<String, ElectrumError> {
    Ok(hex_encode(&script_pubkey_bytes(network, address)?))
}

fn script_pubkey_bytes(
    network: &crate::models::Network,
    address: &str,
) -> Result<Vec<u8>, ElectrumError> {
    let address =
        Address::from_str(address).map_err(|error| ElectrumError::ScriptHash(error.to_string()))?;
    let checked = address
        .require_network(bitcoin_network(network))
        .map_err(|error| ElectrumError::ScriptHash(error.to_string()))?;
    Ok(checked.script_pubkey().as_bytes().to_vec())
}

fn bitcoin_network(network: &crate::models::Network) -> BitcoinNetwork {
    match network {
        crate::models::Network::Mainnet => BitcoinNetwork::Bitcoin,
        crate::models::Network::Testnet => BitcoinNetwork::Testnet,
        crate::models::Network::Signet => BitcoinNetwork::Signet,
        crate::models::Network::Regtest => BitcoinNetwork::Regtest,
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn build_request(id: u64, method: &str, params: Value) -> String {
    format!(
        "{}\n",
        json!({
            "id": id,
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        })
    )
}

fn read_response_line(stream: &mut TcpStream) -> Result<String, ElectrumError> {
    let mut bytes = Vec::new();
    let mut byte = [0_u8; 1];
    loop {
        let count = stream
            .read(&mut byte)
            .map_err(|error| ElectrumError::Request(error.to_string()))?;
        if count == 0 {
            return Err(ElectrumError::Parse("connection closed".to_string()));
        }
        if byte[0] == b'\n' {
            break;
        }
        bytes.push(byte[0]);
        if bytes.len() > MAX_ELECTRUM_RESPONSE_BYTES {
            return Err(ElectrumError::Parse("response too large".to_string()));
        }
    }
    String::from_utf8(bytes).map_err(|error| ElectrumError::Parse(error.to_string()))
}

fn utxo_from_electrum(
    _wallet_id: &str,
    address: &str,
    derivation_path: &str,
    script_pubkey: String,
    script_type: crate::models::ScriptType,
    tip_height: u32,
    unspent: ElectrumUnspent,
) -> Utxo {
    let confirmations = if unspent.height == 0 || tip_height < unspent.height {
        0
    } else {
        tip_height - unspent.height + 1
    };
    Utxo {
        txid: unspent.tx_hash.clone(),
        vout: unspent.tx_pos,
        outpoint: format!("{}:{}", unspent.tx_hash, unspent.tx_pos),
        amount_sats: unspent.value,
        address: address.to_string(),
        script_pubkey,
        script_type,
        derivation_path: derivation_path.to_string(),
        confirmations,
        block_height: (unspent.height > 0).then_some(unspent.height),
        block_time: None,
        label: None,
        source_label: None,
        source_category: SourceCategory::Unknown,
        is_change: false,
        source_txid: Some(unspent.tx_hash),
        spend_vbytes_estimate: spend_vbytes(script_type),
        spend_cost_by_fee_rate: Vec::new(),
        audit_flags: Vec::new(),
        quarantine_status: QuarantineStatus::None,
        spendability_status: UtxoStatus::Unknown,
        provenance: Default::default(),
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
            block_time: None,
            confirmations: utxo.confirmations,
            fee_sats: None,
            vsize: None,
            explanation: format!(
                "Electrum reported this unspent output for {} sats. The server saw a script-hash query, not a raw xpub.",
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
    use crate::models::{BackendKind, Network, ScriptType};
    use crate::wallet_import::{validate_import, ImportKind, ImportRequest};
    use std::collections::HashMap;

    #[derive(Default)]
    struct MockElectrumClient {
        tip: u32,
        unspents: HashMap<String, Vec<ElectrumUnspent>>,
    }

    impl ElectrumRpc for MockElectrumClient {
        fn tip_height(&mut self) -> Result<u32, ElectrumError> {
            Ok(self.tip)
        }

        fn list_unspent(
            &mut self,
            script_hash: &str,
        ) -> Result<Vec<ElectrumUnspent>, ElectrumError> {
            Ok(self.unspents.get(script_hash).cloned().unwrap_or_default())
        }
    }

    #[test]
    fn parses_tcp_endpoint_and_defaults_port() {
        assert_eq!(
            parse_electrum_endpoint("tcp://127.0.0.1:50001").unwrap(),
            ElectrumEndpoint {
                host: "127.0.0.1".to_string(),
                port: 50001,
            }
        );
        assert_eq!(parse_electrum_endpoint("localhost").unwrap().port, 50001);
        assert!(matches!(
            parse_electrum_endpoint("ssl://electrum.example.com:50002").unwrap_err(),
            ElectrumError::UnsupportedScheme
        ));
    }

    #[test]
    fn derives_known_electrum_script_hash() {
        let hash = electrum_script_hash(
            &Network::Mainnet,
            "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        )
        .unwrap();

        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|character| character.is_ascii_hexdigit()));
    }

    #[test]
    fn request_payload_does_not_contain_xpub_or_descriptor() {
        let request = build_request(7, "blockchain.scripthash.listunspent", json!(["abc123"]));

        assert!(request.contains("blockchain.scripthash.listunspent"));
        assert!(!request.contains("xpub"));
        assert!(!request.contains("wpkh("));
        assert!(!request.contains("broadcast"));
    }

    #[test]
    fn maps_mocked_unspents_into_wallet_report() {
        let descriptor = "tr(xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ/0/*)";
        let request = ImportRequest {
            import_kind: ImportKind::Descriptor,
            wallet_name: Some("Electrum test".to_string()),
            descriptor: Some(descriptor.to_string()),
            xpub: None,
            network: Network::Mainnet,
            script_type: Some(ScriptType::NativeSegwit),
            account_path_guess: None,
            gap_limit: Some(1),
            backend: Some(BackendKind::Electrum),
            bitcoin_core_rpc: None,
            electrum: Some(ElectrumBackendConfig {
                server_url: "tcp://127.0.0.1:50001".to_string(),
                display_name: Some("Local".to_string()),
                public_server_acknowledged: false,
            }),
            esplora: None,
            public_api_acknowledged: false,
            network_policy: None,
        };
        let import = validate_import(request).unwrap();
        let address = crate::address_derivation::derive_addresses_for_descriptors(
            "wallet_electrum",
            &Network::Mainnet,
            &import.descriptors,
            1,
        )
        .unwrap()
        .remove(0);
        let script_hash = electrum_script_hash(&Network::Mainnet, &address.address).unwrap();
        let mut client = MockElectrumClient {
            tip: 850_000,
            unspents: HashMap::from([(
                script_hash,
                vec![ElectrumUnspent {
                    tx_hash: "11".repeat(32),
                    tx_pos: 0,
                    height: 849_990,
                    value: 50_000,
                }],
            )]),
        };
        let backend = ElectrumBackend::new(
            ElectrumBackendConfig {
                server_url: "tcp://127.0.0.1:50001".to_string(),
                display_name: Some("Local".to_string()),
                public_server_acknowledged: false,
            },
            BackendKind::Electrum,
        )
        .unwrap();
        let report = backend
            .scan_wallet_with_client(&import, &mut client)
            .unwrap();

        assert_eq!(report.utxos.len(), 1);
        assert_eq!(report.utxos[0].amount_sats, 50_000);
        assert_eq!(report.utxos[0].confirmations, 11);
        assert_eq!(report.wallet.backend, BackendKind::Electrum);
    }
}
