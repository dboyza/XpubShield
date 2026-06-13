use crate::models::{Keychain, ScriptType};
use miniscript::descriptor::{Descriptor as MiniscriptDescriptor, DescriptorPublicKey};
use std::str::FromStr;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedDescriptor {
    pub script_type: ScriptType,
    pub checksum: Option<String>,
    pub master_fingerprint: Option<String>,
    pub account_path: Option<String>,
    pub keychain: Keychain,
    pub has_wildcard: bool,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum DescriptorParseError {
    #[error("private key material is not allowed in watch-only descriptors")]
    PrivateMaterial,
    #[error("descriptor could not be parsed as a public Bitcoin descriptor: {0}")]
    InvalidDescriptor(String),
}

pub fn parse_descriptor_metadata(descriptor: &str) -> ParsedDescriptor {
    let descriptor = descriptor.trim();
    ParsedDescriptor {
        script_type: detect_script_type(descriptor),
        checksum: extract_checksum(descriptor),
        master_fingerprint: extract_master_fingerprint(descriptor),
        account_path: extract_account_path(descriptor),
        keychain: detect_keychain(descriptor),
        has_wildcard: descriptor.contains('*'),
    }
}

pub fn parse_public_descriptor(descriptor: &str) -> Result<ParsedDescriptor, DescriptorParseError> {
    let descriptor = descriptor.trim();
    reject_private_descriptor_material(descriptor)?;
    MiniscriptDescriptor::<DescriptorPublicKey>::from_str(descriptor)
        .map_err(|error| DescriptorParseError::InvalidDescriptor(error.to_string()))?;
    Ok(parse_descriptor_metadata(descriptor))
}

pub fn detect_script_type(descriptor: &str) -> ScriptType {
    let descriptor = descriptor.trim();
    if descriptor.starts_with("pkh(") {
        ScriptType::Legacy
    } else if descriptor.starts_with("sh(wpkh(") {
        ScriptType::NestedSegwit
    } else if descriptor.starts_with("wpkh(") {
        ScriptType::NativeSegwit
    } else if descriptor.starts_with("tr(") {
        ScriptType::Taproot
    } else if descriptor.contains("sortedmulti(") || descriptor.contains("multi(") {
        ScriptType::Multisig
    } else {
        ScriptType::Unknown
    }
}

pub fn extract_public_xpub(descriptor: &str) -> Option<String> {
    descriptor
        .split(|character: char| {
            matches!(
                character,
                '(' | ')' | '[' | ']' | ',' | '/' | '#' | '<' | '>' | ':' | ' '
            )
        })
        .find(|part| {
            matches!(
                part.get(0..4),
                Some("xpub" | "tpub" | "ypub" | "zpub" | "upub" | "vpub")
            )
        })
        .map(ToString::to_string)
}

fn extract_checksum(descriptor: &str) -> Option<String> {
    descriptor
        .rsplit_once('#')
        .map(|(_, checksum)| checksum.trim().to_string())
        .filter(|checksum| !checksum.is_empty())
}

fn extract_master_fingerprint(descriptor: &str) -> Option<String> {
    let start = descriptor.find('[')?;
    let inner = &descriptor[start + 1..descriptor[start + 1..].find(']')? + start + 1];
    let fingerprint = inner.split('/').next()?.trim();
    if fingerprint.len() == 8 && fingerprint.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(fingerprint.to_ascii_lowercase())
    } else {
        None
    }
}

fn extract_account_path(descriptor: &str) -> Option<String> {
    let start = descriptor.find('[')?;
    let end = descriptor[start + 1..].find(']')? + start + 1;
    let inner = &descriptor[start + 1..end];
    let mut parts = inner.split('/');
    let _fingerprint = parts.next()?;
    let path = parts.collect::<Vec<_>>().join("/");
    if path.is_empty() {
        None
    } else {
        Some(format!("m/{path}"))
    }
}

fn detect_keychain(descriptor: &str) -> Keychain {
    if descriptor.contains("/1/*") || descriptor.contains("/<1>/*") {
        Keychain::Change
    } else {
        Keychain::External
    }
}

fn reject_private_descriptor_material(descriptor: &str) -> Result<(), DescriptorParseError> {
    let lowered = descriptor.to_ascii_lowercase();
    let private_markers = [
        "xprv",
        "tprv",
        "yprv",
        "zprv",
        "uprv",
        "vprv",
        "wif",
        "private key",
        "privkey",
        "mnemonic",
        "seed phrase",
    ];
    if private_markers
        .iter()
        .any(|marker| lowered.contains(marker))
    {
        return Err(DescriptorParseError::PrivateMaterial);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_wpkh_descriptor_metadata() {
        let parsed =
            parse_descriptor_metadata("wpkh([d34db33f/84h/0h/0h]xpub661MyMwAqRbc/0/*)#abcd1234");

        assert_eq!(parsed.script_type, ScriptType::NativeSegwit);
        assert_eq!(parsed.master_fingerprint.as_deref(), Some("d34db33f"));
        assert_eq!(parsed.account_path.as_deref(), Some("m/84h/0h/0h"));
        assert_eq!(parsed.checksum.as_deref(), Some("abcd1234"));
        assert!(parsed.has_wildcard);
    }

    #[test]
    fn rejects_private_descriptor_material() {
        let error = parse_public_descriptor("wpkh(xprv9s21ZrQH143K/0/*)").unwrap_err();
        assert_eq!(error, DescriptorParseError::PrivateMaterial);
    }

    #[test]
    fn extracts_public_xpub() {
        let xpub = "xpub661MyMwAqRbcF9KQ4zX3x2tVxRcG4pL1Example";
        let descriptor = format!("wpkh([d34db33f/84h/0h/0h]{xpub}/0/*)");

        assert_eq!(extract_public_xpub(&descriptor).as_deref(), Some(xpub));
    }
}
