use crate::models::{FeeCost, ScriptType, Utxo};

pub const STANDARD_FEE_RATES: [u32; 6] = [5, 10, 25, 50, 100, 200];
pub const STRESS_FEE_RATES: [u32; 7] = [5, 10, 25, 50, 100, 200, 300];

pub fn spend_vbytes_estimate(script_type: &ScriptType) -> u32 {
    match script_type {
        ScriptType::Legacy => 148,
        ScriptType::NestedSegwit => 91,
        ScriptType::NativeSegwit => 68,
        ScriptType::Taproot => 58,
        ScriptType::Multisig => 140,
        ScriptType::Unknown => 110,
    }
}

pub fn cost_at_fee_rate(vbytes: u32, fee_rate: u32) -> u64 {
    u64::from(vbytes) * u64::from(fee_rate)
}

pub fn costs_for_utxo(amount_sats: u64, script_type: &ScriptType) -> Vec<FeeCost> {
    let vbytes = spend_vbytes_estimate(script_type);
    STANDARD_FEE_RATES
        .iter()
        .map(|fee_rate| {
            let cost_sats = cost_at_fee_rate(vbytes, *fee_rate);
            let percent_of_value = if amount_sats == 0 {
                100.0
            } else {
                (cost_sats as f64 / amount_sats as f64) * 100.0
            };
            FeeCost {
                fee_rate: *fee_rate,
                cost_sats,
                percent_of_value,
            }
        })
        .collect()
}

pub fn enrich_utxo_costs(utxo: &mut Utxo) {
    utxo.spend_vbytes_estimate = spend_vbytes_estimate(&utxo.script_type);
    utxo.spend_cost_by_fee_rate = costs_for_utxo(utxo.amount_sats, &utxo.script_type);
}

pub fn is_uneconomical(utxo: &Utxo, threshold_percent: f64) -> bool {
    utxo.spend_cost_by_fee_rate
        .iter()
        .any(|cost| cost.percent_of_value >= threshold_percent)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimates_native_segwit_spend_cost() {
        assert_eq!(spend_vbytes_estimate(&ScriptType::NativeSegwit), 68);
        assert_eq!(cost_at_fee_rate(68, 25), 1700);
    }
}
