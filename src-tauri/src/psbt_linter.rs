use crate::models::{AuditFinding, PsbtAnalysis};
use crate::wallet_import::{reject_private_material, ImportError};

pub fn lint_psbt_text(psbt: &str) -> Result<PsbtAnalysis, ImportError> {
    reject_private_material(psbt)?;
    Ok(PsbtAnalysis {
        summary: "PSBT linting is scaffolded for Phase 3. This Phase 1 parser only rejects private material.".to_string(),
        warnings: Vec::<AuditFinding>::new(),
    })
}
