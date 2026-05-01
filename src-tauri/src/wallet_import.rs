use crate::bitcoin_core_backend::is_local_rpc_url;
use crate::bitcoin_core_backend::BitcoinCoreRpcConfig;
use crate::descriptor_parser::parse_descriptor_metadata;
use crate::descriptor_parser::parse_public_descriptor;
use crate::electrum_backend::ElectrumBackendConfig;
use crate::esplora_backend::EsploraBackendConfig;
use crate::models::{BackendKind, Descriptor, Keychain, Network, ScriptType};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImportKind {
    Descriptor,
    Xpub,
    Demo,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NetworkPolicy {
    Normal,
    LocalOnly,
}

impl Default for NetworkPolicy {
    fn default() -> Self {
        Self::Normal
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportRequest {
    pub import_kind: ImportKind,
    pub wallet_name: Option<String>,
    pub descriptor: Option<String>,
    pub xpub: Option<String>,
    pub network: Network,
    pub script_type: Option<ScriptType>,
    pub account_path_guess: Option<String>,
    pub gap_limit: Option<u32>,
    pub backend: Option<BackendKind>,
    pub bitcoin_core_rpc: Option<BitcoinCoreRpcConfig>,
    pub electrum: Option<ElectrumBackendConfig>,
    pub esplora: Option<EsploraBackendConfig>,
    pub public_api_acknowledged: bool,
    pub network_policy: Option<NetworkPolicy>,
}

#[derive(Debug, Clone)]
pub struct ValidatedImport {
    pub wallet_name: String,
    pub network: Network,
    pub backend: BackendKind,
    pub gap_limit: u32,
    pub descriptors: Vec<Descriptor>,
    pub descriptor_based: bool,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ImportError {
    #[error("Private key material is not accepted. XpubShield is watch-only and does not process seeds, xprv values, WIF keys, or signing material.")]
    PrivateMaterial,
    #[error("A descriptor import requires a Bitcoin output descriptor.")]
    MissingDescriptor,
    #[error("The descriptor format is not supported in Phase 1.")]
    UnsupportedDescriptor,
    #[error("A bare xpub import requires an xpub/ypub/zpub/tpub/upub/vpub value.")]
    MissingXpub,
    #[error("The pasted key is not a supported public extended key.")]
    UnsupportedXpub,
    #[error("Public API mode requires acknowledging the privacy warning.")]
    PublicApiWithoutAcknowledgement,
    #[error(
        "Network Lock is enabled. Only mock/demo mode and local Bitcoin Core RPC are allowed."
    )]
    NetworkLockViolation,
}

pub fn validate_import(request: ImportRequest) -> Result<ValidatedImport, ImportError> {
    let backend = request.backend.clone().unwrap_or_default();
    let network_policy = request.network_policy.unwrap_or_default();
    validate_network_policy(&backend, network_policy, &request)?;

    match backend {
        BackendKind::PublicEsplora if !request.public_api_acknowledged => {
            return Err(ImportError::PublicApiWithoutAcknowledgement);
        }
        BackendKind::PublicElectrum => {
            let electrum_acknowledged = request
                .electrum
                .as_ref()
                .map(|config| config.public_server_acknowledged)
                .unwrap_or(false);
            if !request.public_api_acknowledged || !electrum_acknowledged {
                return Err(ImportError::PublicApiWithoutAcknowledgement);
            }
        }
        _ => {}
    }

    let wallet_name = request
        .wallet_name
        .clone()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "Watch-only wallet".to_string());
    let gap_limit = request.gap_limit.unwrap_or(20).max(5);

    match request.import_kind {
        ImportKind::Demo => Ok(ValidatedImport {
            wallet_name: "Demo watch-only wallet".to_string(),
            network: request.network,
            backend,
            gap_limit,
            descriptors: Vec::new(),
            descriptor_based: true,
        }),
        ImportKind::Descriptor => {
            let descriptor = request
                .descriptor
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or(ImportError::MissingDescriptor)?;

            reject_private_material(descriptor)?;
            validate_descriptor_shape(descriptor)?;
            let parsed = parse_descriptor_metadata(descriptor);
            let descriptor_row = Descriptor {
                id: "desc_external".to_string(),
                wallet_id: "wallet_pending".to_string(),
                keychain: parsed.keychain,
                descriptor: descriptor.to_string(),
                checksum: parsed.checksum,
                script_type: parsed.script_type,
                master_fingerprint: parsed.master_fingerprint,
                account_path: parsed.account_path,
                is_descriptor_based: true,
            };

            Ok(ValidatedImport {
                wallet_name,
                network: request.network,
                backend,
                gap_limit,
                descriptors: vec![descriptor_row],
                descriptor_based: true,
            })
        }
        ImportKind::Xpub => {
            let xpub = request
                .xpub
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or(ImportError::MissingXpub)?;

            reject_private_material(xpub)?;
            validate_public_extended_key(xpub)?;

            let script_type = request.script_type.unwrap_or_default();
            let account_path = request
                .account_path_guess
                .unwrap_or_else(|| default_account_path(&script_type, &request.network));
            let descriptors = descriptor_rows_from_xpub(xpub, &script_type, &account_path);

            Ok(ValidatedImport {
                wallet_name,
                network: request.network,
                backend,
                gap_limit,
                descriptors,
                descriptor_based: false,
            })
        }
    }
}

fn validate_network_policy(
    backend: &BackendKind,
    policy: NetworkPolicy,
    request: &ImportRequest,
) -> Result<(), ImportError> {
    if !matches!(policy, NetworkPolicy::LocalOnly) {
        return Ok(());
    }

    match backend {
        BackendKind::Mock => Ok(()),
        BackendKind::BitcoinCoreRpc => {
            let Some(config) = &request.bitcoin_core_rpc else {
                return Err(ImportError::NetworkLockViolation);
            };
            if is_local_rpc_url(&config.url) {
                Ok(())
            } else {
                Err(ImportError::NetworkLockViolation)
            }
        }
        BackendKind::Electrum
        | BackendKind::PublicElectrum
        | BackendKind::Esplora
        | BackendKind::PublicEsplora => Err(ImportError::NetworkLockViolation),
    }
}

pub fn reject_private_material(input: &str) -> Result<(), ImportError> {
    let lowered = input.to_ascii_lowercase();
    let forbidden_markers = [
        "xprv", "tprv", "yprv", "zprv", "uprv", "vprv", "wif", "mnemonic", "seed phrase",
        "private key", "privkey",
    ];

    if forbidden_markers.iter().any(|marker| lowered.contains(marker)) {
        return Err(ImportError::PrivateMaterial);
    }

    if looks_like_wif(input) || looks_like_mnemonic(input) {
        return Err(ImportError::PrivateMaterial);
    }

    Ok(())
}

fn validate_descriptor_shape(descriptor: &str) -> Result<(), ImportError> {
    let supported = [
        "wpkh(",
        "sh(wpkh(",
        "pkh(",
        "tr(",
        "wsh(sortedmulti(",
        "sh(wsh(sortedmulti(",
        "sortedmulti(",
    ];

    if !supported.iter().any(|prefix| descriptor.starts_with(prefix)) {
        Err(ImportError::UnsupportedDescriptor)
    } else {
        parse_public_descriptor(descriptor).map_err(|_| ImportError::UnsupportedDescriptor)?;
        Ok(())
    }
}

fn validate_public_extended_key(xpub: &str) -> Result<(), ImportError> {
    let allowed = ["xpub", "ypub", "zpub", "tpub", "upub", "vpub"];
    if allowed.iter().any(|prefix| xpub.starts_with(prefix)) && xpub.len() >= 32 {
        Ok(())
    } else {
        Err(ImportError::UnsupportedXpub)
    }
}

fn descriptor_rows_from_xpub(xpub: &str, script_type: &ScriptType, account_path: &str) -> Vec<Descriptor> {
    [Keychain::External, Keychain::Change]
        .into_iter()
        .map(|keychain| {
            let branch = match keychain {
                Keychain::External => 0,
                Keychain::Change => 1,
            };
            Descriptor {
                id: format!("desc_{branch}"),
                wallet_id: "wallet_pending".to_string(),
                keychain,
                descriptor: descriptor_template(xpub, script_type, account_path, branch),
                checksum: None,
                script_type: script_type.clone(),
                master_fingerprint: None,
                account_path: Some(account_path.to_string()),
                is_descriptor_based: false,
            }
        })
        .collect()
}

fn descriptor_template(xpub: &str, script_type: &ScriptType, account_path: &str, branch: u8) -> String {
    let key = format!("[unknown/{account_path}]{xpub}/{branch}/*");
    match script_type {
        ScriptType::Legacy => format!("pkh({key})"),
        ScriptType::NestedSegwit => format!("sh(wpkh({key}))"),
        ScriptType::NativeSegwit => format!("wpkh({key})"),
        ScriptType::Taproot => format!("tr({key})"),
        ScriptType::Multisig | ScriptType::Unknown => format!("wpkh({key})"),
    }
}

fn default_account_path(script_type: &ScriptType, network: &Network) -> String {
    let coin_type = match network {
        Network::Mainnet => "0h",
        Network::Testnet | Network::Signet | Network::Regtest => "1h",
    };
    let purpose = match script_type {
        ScriptType::Legacy => "44h",
        ScriptType::NestedSegwit => "49h",
        ScriptType::NativeSegwit => "84h",
        ScriptType::Taproot => "86h",
        ScriptType::Multisig | ScriptType::Unknown => "84h",
    };
    format!("{purpose}/{coin_type}/0h")
}

fn looks_like_wif(input: &str) -> bool {
    input
        .split_whitespace()
        .any(|word| {
            let len = word.len();
            (len == 51 || len == 52)
                && matches!(word.as_bytes().first(), Some(b'5' | b'K' | b'L' | b'c' | b'9'))
                && word.chars().all(|c| c.is_ascii_alphanumeric())
        })
}

fn looks_like_mnemonic(input: &str) -> bool {
    let words: Vec<&str> = input
        .split_whitespace()
        .filter(|word| word.chars().all(|c| c.is_ascii_alphabetic()))
        .collect();
    matches!(words.len(), 12 | 15 | 18 | 21 | 24)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_request(import_kind: ImportKind) -> ImportRequest {
        ImportRequest {
            import_kind,
            wallet_name: Some("Test".to_string()),
            descriptor: None,
            xpub: None,
            network: Network::Mainnet,
            script_type: Some(ScriptType::NativeSegwit),
            account_path_guess: Some("84h/0h/0h".to_string()),
            gap_limit: Some(20),
            backend: Some(BackendKind::Mock),
            bitcoin_core_rpc: None,
            electrum: None,
            esplora: None,
            public_api_acknowledged: false,
            network_policy: None,
        }
    }

    #[test]
    fn rejects_xprv_material() {
        assert_eq!(reject_private_material("xprv9s21ZrQH143K").unwrap_err(), ImportError::PrivateMaterial);
    }

    #[test]
    fn rejects_wif_material() {
        let wif = "L1aW4aubDFB7yfras2S1mMEYCIh9TnD9A16dSq2czHP2KxbXX9T4";
        assert_eq!(reject_private_material(wif).unwrap_err(), ImportError::PrivateMaterial);
    }

    #[test]
    fn accepts_public_xpub_shape() {
        let mut request = base_request(ImportKind::Xpub);
        request.xpub = Some("xpub661MyMwAqRbcF9DemoWatchOnlyPublicExtendedKeyValue".to_string());

        let validated = validate_import(request).unwrap();
        assert_eq!(validated.descriptors.len(), 2);
        assert!(!validated.descriptor_based);
    }

    #[test]
    fn accepts_descriptor_shape() {
        let mut request = base_request(ImportKind::Descriptor);
        request.descriptor =
            Some("tr(xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ/0/*)".to_string());

        let validated = validate_import(request).unwrap();
        assert_eq!(validated.descriptors.len(), 1);
        assert!(validated.descriptor_based);
    }

    #[test]
    fn public_electrum_requires_acknowledgement() {
        let mut request = base_request(ImportKind::Xpub);
        request.backend = Some(BackendKind::PublicElectrum);
        request.xpub = Some("xpub661MyMwAqRbcF9DemoWatchOnlyPublicExtendedKeyValue".to_string());
        request.electrum = Some(ElectrumBackendConfig {
            server_url: "tcp://electrum.example.com:50001".to_string(),
            display_name: Some("Example public".to_string()),
            public_server_acknowledged: false,
        });

        assert_eq!(
            validate_import(request).unwrap_err(),
            ImportError::PublicApiWithoutAcknowledgement
        );
    }

    #[test]
    fn public_electrum_requires_config_acknowledgement() {
        let mut request = base_request(ImportKind::Xpub);
        request.backend = Some(BackendKind::PublicElectrum);
        request.public_api_acknowledged = true;
        request.xpub = Some("xpub661MyMwAqRbcF9DemoWatchOnlyPublicExtendedKeyValue".to_string());
        request.electrum = Some(ElectrumBackendConfig {
            server_url: "tcp://electrum.example.com:50001".to_string(),
            display_name: Some("Example public".to_string()),
            public_server_acknowledged: false,
        });

        assert_eq!(
            validate_import(request).unwrap_err(),
            ImportError::PublicApiWithoutAcknowledgement
        );
    }

    #[test]
    fn network_lock_rejects_public_electrum() {
        let mut request = base_request(ImportKind::Xpub);
        request.backend = Some(BackendKind::PublicElectrum);
        request.network_policy = Some(NetworkPolicy::LocalOnly);
        request.public_api_acknowledged = true;
        request.xpub = Some("xpub661MyMwAqRbcF9DemoWatchOnlyPublicExtendedKeyValue".to_string());
        request.electrum = Some(ElectrumBackendConfig {
            server_url: "tcp://electrum.example.com:50001".to_string(),
            display_name: Some("Example public".to_string()),
            public_server_acknowledged: true,
        });

        assert_eq!(
            validate_import(request).unwrap_err(),
            ImportError::NetworkLockViolation
        );
    }

    #[test]
    fn network_lock_rejects_private_electrum() {
        let mut request = base_request(ImportKind::Xpub);
        request.backend = Some(BackendKind::Electrum);
        request.network_policy = Some(NetworkPolicy::LocalOnly);
        request.xpub = Some("xpub661MyMwAqRbcF9DemoWatchOnlyPublicExtendedKeyValue".to_string());
        request.electrum = Some(ElectrumBackendConfig {
            server_url: "tcp://127.0.0.1:50001".to_string(),
            display_name: Some("Local Electrum".to_string()),
            public_server_acknowledged: false,
        });

        assert_eq!(
            validate_import(request).unwrap_err(),
            ImportError::NetworkLockViolation
        );
    }

    #[test]
    fn network_lock_rejects_loopback_prefix_bitcoin_core_url() {
        let mut request = base_request(ImportKind::Demo);
        request.backend = Some(BackendKind::BitcoinCoreRpc);
        request.network_policy = Some(NetworkPolicy::LocalOnly);
        request.bitcoin_core_rpc = Some(BitcoinCoreRpcConfig {
            url: "http://localhost.evil.test:8332".to_string(),
            username: None,
            password: None,
            wallet: None,
        });

        assert_eq!(
            validate_import(request).unwrap_err(),
            ImportError::NetworkLockViolation
        );
    }
}
