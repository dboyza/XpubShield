use crate::models::{DerivedAddress, Keychain, Network, ScriptType};

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
}
