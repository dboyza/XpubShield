use crate::descriptor_parser::parse_descriptor_metadata;
use crate::models::{DerivedAddress, Descriptor, Keychain, Network, ScriptType};
use miniscript::bitcoin::secp256k1::Secp256k1;
use miniscript::bitcoin::Network as BitcoinNetwork;
use miniscript::descriptor::{Descriptor as MiniscriptDescriptor, DescriptorPublicKey};
use std::str::FromStr;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AddressDerivationError {
    #[error("descriptor contains private key material and was rejected")]
    PrivateMaterial,
    #[error("descriptor parse failed: {0}")]
    DescriptorParse(String),
    #[error("descriptor derivation failed: {0}")]
    Derivation(String),
    #[error("descriptor does not produce a standard address: {0}")]
    Address(String),
}

pub fn mock_derive_addresses(
    wallet_id: &str,
    network: &Network,
    script_type: &ScriptType,
    count: u32,
) -> Vec<DerivedAddress> {
    let prefix = match network {
        Network::Mainnet => "bc1qsentinel",
        Network::Testnet | Network::Signet | Network::Regtest => "tb1qsentinel",
    };

    (0..count)
        .flat_map(|index| {
            [Keychain::External, Keychain::Change]
                .into_iter()
                .map(move |keychain| {
                    let branch = match keychain {
                        Keychain::External => 0,
                        Keychain::Change => 1,
                    };
                    DerivedAddress {
                        id: format!("addr_{branch}_{index}"),
                        wallet_id: wallet_id.to_string(),
                        keychain,
                        index,
                        address: format!("{prefix}{branch}{index:04}phase1demo"),
                        derivation_path: format!("m/84h/0h/0h/{branch}/{index}"),
                        script_type: script_type.clone(),
                        used: matches!(index, 0..=6),
                        receive_count: if branch == 0 && index == 2 { 2 } else { 1 },
                    }
                })
        })
        .collect()
}

pub fn derive_addresses_for_descriptors(
    wallet_id: &str,
    network: &Network,
    descriptors: &[Descriptor],
    count: u32,
) -> Result<Vec<DerivedAddress>, AddressDerivationError> {
    let mut addresses = Vec::new();
    for descriptor in descriptors {
        addresses.extend(derive_descriptor_addresses(
            wallet_id,
            network,
            &descriptor.descriptor,
            descriptor.keychain,
            descriptor.script_type,
            count,
        )?);
    }
    Ok(addresses)
}

pub fn derive_descriptor_addresses(
    wallet_id: &str,
    network: &Network,
    descriptor: &str,
    keychain: Keychain,
    script_type: ScriptType,
    count: u32,
) -> Result<Vec<DerivedAddress>, AddressDerivationError> {
    reject_private_descriptor_material(descriptor)?;

    let descriptor = descriptor.trim();
    let parsed = parse_descriptor_metadata(descriptor);
    let account_path = parsed.account_path.unwrap_or_else(|| "m".to_string());
    let miniscript_descriptor = MiniscriptDescriptor::<DescriptorPublicKey>::from_str(descriptor)
        .map_err(|error| AddressDerivationError::DescriptorParse(error.to_string()))?;
    let secp = Secp256k1::verification_only();
    let network = bitcoin_network(network);
    let branch = match keychain {
        Keychain::External => 0,
        Keychain::Change => 1,
    };

    (0..count)
        .map(|index| {
            let derived = miniscript_descriptor
                .derived_descriptor(&secp, index)
                .map_err(|error| AddressDerivationError::Derivation(error.to_string()))?;
            let address = derived
                .address(network)
                .map_err(|error| AddressDerivationError::Address(error.to_string()))?;
            Ok(DerivedAddress {
                id: format!("addr_{branch}_{index}"),
                wallet_id: wallet_id.to_string(),
                keychain,
                index,
                address: address.to_string(),
                derivation_path: format!("{account_path}/{branch}/{index}"),
                script_type,
                used: false,
                receive_count: 0,
            })
        })
        .collect()
}

fn bitcoin_network(network: &Network) -> BitcoinNetwork {
    match network {
        Network::Mainnet => BitcoinNetwork::Bitcoin,
        Network::Testnet => BitcoinNetwork::Testnet,
        Network::Signet => BitcoinNetwork::Signet,
        Network::Regtest => BitcoinNetwork::Regtest,
    }
}

fn reject_private_descriptor_material(descriptor: &str) -> Result<(), AddressDerivationError> {
    let lowered = descriptor.to_ascii_lowercase();
    let private_markers = [
        "xprv", "tprv", "yprv", "zprv", "uprv", "vprv", "wif", "private key", "privkey",
        "mnemonic", "seed phrase",
    ];
    if private_markers
        .iter()
        .any(|marker| lowered.contains(marker))
    {
        return Err(AddressDerivationError::PrivateMaterial);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_external_and_change_mock_addresses() {
        let addresses =
            mock_derive_addresses("wallet", &Network::Mainnet, &ScriptType::NativeSegwit, 3);

        assert_eq!(addresses.len(), 6);
        assert!(addresses.iter().any(|addr| addr.derivation_path.ends_with("/0/2")));
        assert!(addresses.iter().any(|addr| addr.derivation_path.ends_with("/1/2")));
    }

    #[test]
    fn derives_real_taproot_descriptor_addresses() {
        let descriptor = "tr(xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ/0/*)";
        let addresses = derive_descriptor_addresses(
            "wallet",
            &Network::Mainnet,
            descriptor,
            Keychain::External,
            ScriptType::Taproot,
            2,
        )
        .unwrap();

        assert_eq!(addresses.len(), 2);
        assert!(addresses[0].address.starts_with("bc1p"));
        assert_ne!(addresses[0].address, addresses[1].address);
        assert_eq!(addresses[0].derivation_path, "m/0/0");
    }

    #[test]
    fn rejects_private_material_before_derivation() {
        let error = derive_descriptor_addresses(
            "wallet",
            &Network::Mainnet,
            "wpkh(xprv9s21ZrQH143K/0/*)",
            Keychain::External,
            ScriptType::NativeSegwit,
            1,
        )
        .unwrap_err();

        assert!(matches!(error, AddressDerivationError::PrivateMaterial));
    }
}
