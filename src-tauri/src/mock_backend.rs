use crate::address_derivation::mock_derive_addresses;
use crate::audit_engine::audit_wallet;
use crate::blockchain_backend::BlockchainBackend;
use crate::models::{
    BackendKind, BackendPrivacyScore, Descriptor, Keychain, Network, ScriptType, SourceCategory,
    Transaction, Utxo, UtxoStatus, Wallet, WalletReport,
};
use crate::wallet_import::ValidatedImport;
use chrono::Utc;

pub struct MockBackend;

impl BlockchainBackend for MockBackend {
    fn kind(&self) -> BackendKind {
        BackendKind::Mock
    }

    fn privacy_score(&self) -> BackendPrivacyScore {
        BackendPrivacyScore {
            score: 100,
            mode: BackendKind::Mock,
            summary: "Mock backend uses bundled local fixture data only.".to_string(),
            warnings: Vec::new(),
        }
    }

    fn scan_wallet(&self, import: &ValidatedImport) -> WalletReport {
        build_mock_wallet_report(import)
    }
}

pub fn build_demo_import() -> ValidatedImport {
    ValidatedImport {
        wallet_name: "Demo watch-only wallet".to_string(),
        network: Network::Mainnet,
        backend: BackendKind::Mock,
        gap_limit: 20,
        descriptors: vec![Descriptor {
            id: "desc_external".to_string(),
            wallet_id: "wallet_pending".to_string(),
            keychain: Keychain::External,
            descriptor: "wpkh([d34db33f/84h/0h/0h]xpubDemoWatchOnlyExternal/0/*)".to_string(),
            checksum: None,
            script_type: ScriptType::NativeSegwit,
            master_fingerprint: Some("d34db33f".to_string()),
            account_path: Some("m/84h/0h/0h".to_string()),
            is_descriptor_based: true,
        }],
        descriptor_based: true,
    }
}

pub fn build_mock_wallet_report(import: &ValidatedImport) -> WalletReport {
    let wallet_id = "wallet_phase1_mock".to_string();
    let now = Utc::now().to_rfc3339();
    let wallet = Wallet {
        id: wallet_id.clone(),
        name: import.wallet_name.clone(),
        network: import.network,
        backend: import.backend,
        gap_limit: import.gap_limit,
        descriptor_based: import.descriptor_based,
        created_at: now,
    };

    let mut descriptors = if import.descriptors.is_empty() {
        build_demo_import().descriptors
    } else {
        import.descriptors.clone()
    };
    for descriptor in descriptors.iter_mut() {
        descriptor.wallet_id = wallet_id.clone();
    }

    let primary_script = descriptors
        .first()
        .map(|descriptor| descriptor.script_type)
        .unwrap_or(ScriptType::NativeSegwit);
    let mut addresses = mock_derive_addresses(&wallet_id, &wallet.network, &primary_script, 12);
    mark_mock_receive_counts(&mut addresses);

    let transactions = mock_transactions();
    let mut utxos = mock_utxos(&wallet.network);
    let (findings, scores, totals) = audit_wallet(&wallet, &addresses, &mut utxos);
    let backend_privacy = privacy_score_for_backend(wallet.backend);

    WalletReport {
        wallet,
        descriptors,
        derived_addresses: addresses,
        transactions,
        utxos,
        findings,
        scores,
        backend_privacy,
        totals,
    }
}

pub fn privacy_score_for_backend(kind: BackendKind) -> BackendPrivacyScore {
    match kind {
        BackendKind::Mock => BackendPrivacyScore {
            score: 100,
            mode: BackendKind::Mock,
            summary: "Mock backend uses bundled local fixture data only.".to_string(),
            warnings: Vec::new(),
        },
        BackendKind::BitcoinCoreRpc => BackendPrivacyScore {
            score: 98,
            mode: BackendKind::BitcoinCoreRpc,
            summary: "Bitcoin Core RPC keeps address queries on your own node.".to_string(),
            warnings: Vec::new(),
        },
        BackendKind::Electrum => BackendPrivacyScore {
            score: 82,
            mode: BackendKind::Electrum,
            summary: "Personal Electrum mode can preserve strong privacy when it points at your own server.".to_string(),
            warnings: vec!["Do not connect this mode to an untrusted public Electrum server.".to_string()],
        },
        BackendKind::Esplora => BackendPrivacyScore {
            score: 82,
            mode: BackendKind::Esplora,
            summary: "Self-hosted Esplora mode avoids uploading raw xpubs and should query derived addresses only.".to_string(),
            warnings: Vec::new(),
        },
        BackendKind::PublicEsplora => BackendPrivacyScore {
            score: 35,
            mode: BackendKind::PublicEsplora,
            summary: "Public Esplora mode is weak privacy because address queries and timing metadata can leak.".to_string(),
            warnings: vec![
                "XpubShield must never send raw xpubs or descriptors to public APIs.".to_string(),
                "Prefer Bitcoin Core RPC, personal Electrum, or self-hosted Esplora.".to_string(),
            ],
        },
    }
}

fn mark_mock_receive_counts(addresses: &mut [crate::models::DerivedAddress]) {
    for address in addresses.iter_mut() {
        address.used = address.index <= 6;
        address.receive_count = if address.keychain == Keychain::External && address.index == 2 {
            2
        } else if address.used {
            1
        } else {
            0
        };
    }
}

fn mock_transactions() -> Vec<Transaction> {
    vec![
        tx(
            "65b6726e7c9e0b8c2f98bdbd83a7ad21829ab95e4db9b9a4f6dfaa03f37a1111",
            Some(842_100),
            Some("2026-02-14T16:20:00Z"),
            2448,
            Some(1410),
            Some(188),
            "This transaction received 0.25000000 BTC to address index /0/0. It appears to be an external receive. The output is confirmed and labeled Exchange."
        ),
        tx(
            "b2f31aa884ea31e2f9450d5d2aa22eaf880e9451bbf5f6a6a1552ef4cd7b2222",
            Some(843_010),
            Some("2026-03-03T11:08:00Z"),
            1538,
            Some(980),
            Some(141),
            "This transaction received funds to a reused address. This may link separate deposits."
        ),
        tx(
            "89aa4bb6e41b9d2b7c913c4d633e4eed9d3089629f7f26064f0c96cc1f853333",
            Some(844_002),
            Some("2026-03-25T19:44:00Z"),
            546,
            Some(620),
            Some(110),
            "This transaction created a small unlabeled UTXO from an unknown source. This may warrant quarantine."
        ),
        tx(
            "57acaa7cfdc86f9edcc3e46c9ed1a42a777c9eab02a1e1ce4f247be455444444",
            None,
            None,
            0,
            None,
            None,
            "This transaction is unconfirmed. Treat the output as pending until it confirms."
        ),
    ]
}

fn tx(
    txid: &str,
    block_height: Option<u32>,
    block_time: Option<&str>,
    confirmations: u32,
    fee_sats: Option<u64>,
    vsize: Option<u32>,
    explanation: &str,
) -> Transaction {
    Transaction {
        txid: txid.to_string(),
        block_height,
        block_time: block_time.map(str::to_string),
        confirmations,
        fee_sats,
        vsize,
        explanation: explanation.to_string(),
    }
}

fn mock_utxos(network: &Network) -> Vec<Utxo> {
    let prefix = match network {
        Network::Mainnet => "bc1qsentinel",
        Network::Testnet | Network::Signet | Network::Regtest => "tb1qsentinel",
    };

    vec![
        utxo(
            "65b6726e7c9e0b8c2f98bdbd83a7ad21829ab95e4db9b9a4f6dfaa03f37a1111",
            0,
            25_000_000,
            &format!("{prefix}00000phase1demo"),
            ScriptType::NativeSegwit,
            "m/84h/0h/0h/0/0",
            2448,
            Some(842_100),
            Some("2026-02-14T16:20:00Z"),
            Some("Coldcard account A"),
            Some("River withdrawal"),
            SourceCategory::Exchange,
            false,
        ),
        utxo(
            "b2f31aa884ea31e2f9450d5d2aa22eaf880e9451bbf5f6a6a1552ef4cd7b2222",
            0,
            3_100_000,
            &format!("{prefix}00002phase1demo"),
            ScriptType::NativeSegwit,
            "m/84h/0h/0h/0/2",
            1538,
            Some(843_010),
            Some("2026-03-03T11:08:00Z"),
            Some("P2P sale"),
            Some("Local trade"),
            SourceCategory::P2p,
            false,
        ),
        utxo(
            "b2f31aa884ea31e2f9450d5d2aa22eaf880e9451bbf5f6a6a1552ef4cd7b2222",
            1,
            2_950_000,
            &format!("{prefix}00002phase1demo"),
            ScriptType::NativeSegwit,
            "m/84h/0h/0h/0/2",
            1538,
            Some(843_010),
            Some("2026-03-03T11:08:00Z"),
            Some("P2P sale"),
            Some("Local trade"),
            SourceCategory::P2p,
            false,
        ),
        utxo(
            "17d9a1111c62b57c9c92f361fb70e331fa75bc28f021a155e9f30db8564c5555",
            0,
            8_000_000,
            "1SentinelLegacyDemoAddress",
            ScriptType::Legacy,
            "m/44h/0h/0h/0/4",
            922,
            Some(843_626),
            Some("2026-03-12T07:31:00Z"),
            Some("Old wallet sweep"),
            Some("Cold storage"),
            SourceCategory::ColdStorage,
            false,
        ),
        utxo(
            "57acaa7cfdc86f9edcc3e46c9ed1a42a777c9eab02a1e1ce4f247be455444444",
            0,
            50_000,
            &format!("{prefix}00005phase1demo"),
            ScriptType::NativeSegwit,
            "m/84h/0h/0h/0/5",
            0,
            None,
            None,
            None,
            None,
            SourceCategory::Unknown,
            false,
        ),
        utxo(
            "89aa4bb6e41b9d2b7c913c4d633e4eed9d3089629f7f26064f0c96cc1f853333",
            1,
            1_200,
            &format!("{prefix}00006phase1demo"),
            ScriptType::NativeSegwit,
            "m/84h/0h/0h/0/6",
            546,
            Some(844_002),
            Some("2026-03-25T19:44:00Z"),
            None,
            None,
            SourceCategory::Unknown,
            false,
        ),
        utxo(
            "ec331fe6572c3d5b8fbf561f553fd6baa33c8bb1efee09d90d269ac116666666",
            0,
            1_200_000,
            &format!("{prefix}10003phase1demo"),
            ScriptType::NativeSegwit,
            "m/84h/0h/0h/1/3",
            1210,
            Some(843_338),
            Some("2026-03-07T14:05:00Z"),
            Some("Change from hardware wallet test"),
            Some("Change"),
            SourceCategory::Change,
            true,
        ),
        utxo(
            "d4fafe70ca93040b496815a95b59da2e7bb82aac9b8eeded77daaaaa77777777",
            0,
            8_000,
            &format!("{prefix}00007phase1demo"),
            ScriptType::NativeSegwit,
            "m/84h/0h/0h/0/7",
            388,
            Some(844_160),
            Some("2026-04-01T09:12:00Z"),
            Some("Donation"),
            Some("Community event"),
            SourceCategory::Donation,
            false,
        ),
    ]
}

#[allow(clippy::too_many_arguments)]
fn utxo(
    txid: &str,
    vout: u32,
    amount_sats: u64,
    address: &str,
    script_type: ScriptType,
    derivation_path: &str,
    confirmations: u32,
    block_height: Option<u32>,
    block_time: Option<&str>,
    label: Option<&str>,
    source_label: Option<&str>,
    source_category: SourceCategory,
    is_change: bool,
) -> Utxo {
    Utxo {
        txid: txid.to_string(),
        vout,
        outpoint: format!("{txid}:{vout}"),
        amount_sats,
        address: address.to_string(),
        script_pubkey: script_pubkey_for(&script_type),
        script_type,
        derivation_path: derivation_path.to_string(),
        confirmations,
        block_height,
        block_time: block_time.map(str::to_string),
        label: label.map(str::to_string),
        source_label: source_label.map(str::to_string),
        source_category,
        is_change,
        source_txid: Some(txid.to_string()),
        spend_vbytes_estimate: 0,
        spend_cost_by_fee_rate: Vec::new(),
        audit_flags: Vec::new(),
        quarantine_status: crate::models::QuarantineStatus::None,
        spendability_status: UtxoStatus::Spendable,
    }
}

fn script_pubkey_for(script_type: &ScriptType) -> String {
    match script_type {
        ScriptType::Legacy => "76a914000000000000000000000000000000000000000088ac".to_string(),
        ScriptType::NestedSegwit => "a914000000000000000000000000000000000000000087".to_string(),
        ScriptType::NativeSegwit => "00140000000000000000000000000000000000000000".to_string(),
        ScriptType::Taproot => {
            "51200000000000000000000000000000000000000000000000000000000000000000".to_string()
        }
        ScriptType::Multisig | ScriptType::Unknown => {
            "00200000000000000000000000000000000000000000".to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_backend_returns_audited_wallet() {
        let report = MockBackend.scan_wallet(&build_demo_import());

        assert!(!report.utxos.is_empty());
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.id == "address_reuse"));
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.id == "dust_attack_suspicion"));
    }

    #[test]
    fn public_backend_selection_reports_weak_privacy() {
        let mut import = build_demo_import();
        import.backend = BackendKind::PublicEsplora;

        let report = MockBackend.scan_wallet(&import);

        assert_eq!(report.backend_privacy.score, 35);
        assert_eq!(report.backend_privacy.mode, BackendKind::PublicEsplora);
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.id == "public_api_privacy_leak"));
    }
}
