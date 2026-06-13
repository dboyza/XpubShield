use crate::models::{ConsolidationPlan, FeeEstimate, Utxo};

pub fn draft_consolidation_plan(selected: &[Utxo], fee_rate: u32) -> ConsolidationPlan {
    let input_vbytes: u32 = selected
        .iter()
        .map(|utxo| utxo.spend_vbytes_estimate.max(68))
        .sum();
    let estimated_vbytes = input_vbytes + 43;
    ConsolidationPlan {
        selected_outpoints: selected.iter().map(|utxo| utxo.outpoint.clone()).collect(),
        current_utxo_count: selected.len(),
        proposed_utxo_count: usize::from(!selected.is_empty()),
        fee_estimate: FeeEstimate {
            fee_rate,
            estimated_vbytes,
            estimated_fee_sats: u64::from(estimated_vbytes) * u64::from(fee_rate),
        },
        privacy_notes: vec![
            "Consolidation may link the selected UTXO histories. This plan is a simulation only."
                .to_string(),
        ],
    }
}
