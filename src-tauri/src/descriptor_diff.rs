use crate::address_derivation::derive_descriptor_addresses;
use crate::descriptor_parser::{extract_public_xpub, parse_descriptor_metadata};
use crate::models::{Keychain, Network, ScriptType};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DescriptorDiffSummary {
    pub same_script_type: bool,
    pub same_fingerprint: bool,
    pub same_account_path: bool,
    pub same_first20: bool,
    pub first_difference: Option<String>,
    pub left: DescriptorIdentity,
    pub right: DescriptorIdentity,
    pub rows: Vec<DescriptorDiffRow>,
    pub summary: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DescriptorIdentity {
    pub network: String,
    pub script_type: ScriptType,
    pub master_fingerprint: Option<String>,
    pub account_path: Option<String>,
    pub xpub: Option<String>,
    pub branch: String,
    pub wildcard: bool,
    pub checksum: Option<String>,
    pub address_preview: Vec<String>,
    pub derivation_error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DescriptorDiffRow {
    pub label: String,
    pub left: String,
    pub right: String,
    pub r#match: bool,
}

pub fn compare_descriptor_metadata(left: &str, right: &str) -> DescriptorDiffSummary {
    compare_descriptor_inputs(left, right, Network::Mainnet)
}

pub fn compare_descriptor_inputs(
    left: &str,
    right: &str,
    network: Network,
) -> DescriptorDiffSummary {
    let left = descriptor_identity(left, network);
    let right = descriptor_identity(right, network);
    let same_script_type =
        left.script_type == right.script_type && left.script_type != ScriptType::Unknown;
    let same_fingerprint = left.master_fingerprint == right.master_fingerprint;
    let same_account_path = left.account_path == right.account_path;
    let same_first20 =
        !left.address_preview.is_empty() && left.address_preview == right.address_preview;
    let rows = vec![
        row("Network", &left.network, &right.network),
        row(
            "Script type",
            &format!("{:?}", left.script_type),
            &format!("{:?}", right.script_type),
        ),
        row(
            "Master fingerprint",
            optional_value(&left.master_fingerprint),
            optional_value(&right.master_fingerprint),
        ),
        row(
            "Derivation path",
            optional_value(&left.account_path),
            optional_value(&right.account_path),
        ),
        row(
            "Xpub",
            optional_value(&left.xpub),
            optional_value(&right.xpub),
        ),
        row("Branch", &left.branch, &right.branch),
        row(
            "Wildcard",
            if left.wildcard { "Yes" } else { "No" },
            if right.wildcard { "Yes" } else { "No" },
        ),
        row(
            "Checksum",
            optional_value(&left.checksum),
            optional_value(&right.checksum),
        ),
    ];
    let first_difference = if !same_script_type {
        Some("script_type".to_string())
    } else if !same_fingerprint {
        Some("master_fingerprint".to_string())
    } else if !same_account_path {
        Some("account_path".to_string())
    } else if !same_first20 {
        Some("first_20_addresses".to_string())
    } else {
        None
    };
    let summary = if rows.iter().all(|row| row.r#match) && same_first20 {
        "The two inputs appear to describe the same watch-only identity in this local descriptor comparison."
            .to_string()
    } else {
        "The two inputs differ or could not both be derived. Review the mismatched fields before relying on them for recovery."
            .to_string()
    };

    DescriptorDiffSummary {
        same_script_type,
        same_fingerprint,
        same_account_path,
        same_first20,
        first_difference,
        left,
        right,
        rows,
        summary,
    }
}

fn descriptor_identity(input: &str, network: Network) -> DescriptorIdentity {
    let parsed = parse_descriptor_metadata(input);
    let keychain = parsed.keychain;
    let script_type = parsed.script_type;
    let branch = match keychain {
        Keychain::External => "external",
        Keychain::Change => "change",
    };
    let derived = derive_descriptor_addresses(
        "descriptor_diff",
        &network,
        input,
        keychain,
        script_type,
        20,
    );
    let (address_preview, derivation_error) = match derived {
        Ok(addresses) => (
            addresses
                .into_iter()
                .map(|address| address.address)
                .collect(),
            None,
        ),
        Err(error) => (Vec::new(), Some(error.to_string())),
    };

    DescriptorIdentity {
        network: network_label(network).to_string(),
        script_type,
        master_fingerprint: parsed.master_fingerprint,
        account_path: parsed.account_path,
        xpub: extract_public_xpub(input),
        branch: branch.to_string(),
        wildcard: parsed.has_wildcard,
        checksum: parsed.checksum,
        address_preview,
        derivation_error,
    }
}

fn row(label: &str, left: &str, right: &str) -> DescriptorDiffRow {
    DescriptorDiffRow {
        label: label.to_string(),
        left: left.to_string(),
        right: right.to_string(),
        r#match: left == right,
    }
}

fn optional_value(value: &Option<String>) -> &str {
    value.as_deref().unwrap_or("Missing")
}

fn network_label(network: Network) -> &'static str {
    match network {
        Network::Mainnet => "mainnet",
        Network::Testnet => "testnet",
        Network::Signet => "signet",
        Network::Regtest => "regtest",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_descriptor_metadata() {
        let left = "tr(xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ/0/*)";
        let right = left;
        let summary = compare_descriptor_metadata(left, right);

        assert!(summary.same_script_type);
        assert!(summary.same_fingerprint);
        assert!(summary.same_account_path);
        assert!(summary.same_first20);
        assert_eq!(summary.left.address_preview.len(), 20);
    }
}
