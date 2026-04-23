use crate::models::{Keychain, ScriptType};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedDescriptor {
    pub script_type: ScriptType,
    pub checksum: Option<String>,
    pub master_fingerprint: Option<String>,
    pub account_path: Option<String>,
    pub keychain: Keychain,
    pub has_wildcard: bool,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_wpkh_descriptor_metadata() {
        let parsed = parse_descriptor_metadata(
            "wpkh([d34db33f/84h/0h/0h]xpub661MyMwAqRbc/0/*)#abcd1234",
        );

        assert_eq!(parsed.script_type, ScriptType::NativeSegwit);
        assert_eq!(parsed.master_fingerprint.as_deref(), Some("d34db33f"));
        assert_eq!(parsed.account_path.as_deref(), Some("m/84h/0h/0h"));
        assert_eq!(parsed.checksum.as_deref(), Some("abcd1234"));
        assert!(parsed.has_wildcard);
    }
}
