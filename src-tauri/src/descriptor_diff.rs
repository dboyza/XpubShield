use crate::descriptor_parser::parse_descriptor_metadata;
use crate::models::ScriptType;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DescriptorDiffSummary {
    pub same_script_type: bool,
    pub same_fingerprint: bool,
    pub same_account_path: bool,
    pub first_difference: Option<String>,
}

pub fn compare_descriptor_metadata(left: &str, right: &str) -> DescriptorDiffSummary {
    let left = parse_descriptor_metadata(left);
    let right = parse_descriptor_metadata(right);
    let same_script_type = left.script_type == right.script_type && left.script_type != ScriptType::Unknown;
    let same_fingerprint = left.master_fingerprint == right.master_fingerprint;
    let same_account_path = left.account_path == right.account_path;
    let first_difference = if !same_script_type {
        Some("script_type".to_string())
    } else if !same_fingerprint {
        Some("master_fingerprint".to_string())
    } else if !same_account_path {
        Some("account_path".to_string())
    } else {
        None
    };

    DescriptorDiffSummary {
        same_script_type,
        same_fingerprint,
        same_account_path,
        first_difference,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_descriptor_metadata() {
        let left = "wpkh([d34db33f/84h/0h/0h]xpubLeft/0/*)";
        let right = "wpkh([d34db33f/84h/0h/0h]xpubRight/0/*)";
        let summary = compare_descriptor_metadata(left, right);

        assert!(summary.same_script_type);
        assert!(summary.same_fingerprint);
        assert!(summary.same_account_path);
    }
}
