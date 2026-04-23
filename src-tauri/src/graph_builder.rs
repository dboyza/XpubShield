use crate::models::{GraphEdge, GraphNode, WalletReport};

pub fn build_phase_one_wallet_graph(report: &WalletReport) -> (Vec<GraphNode>, Vec<GraphEdge>) {
    let nodes = report
        .utxos
        .iter()
        .map(|utxo| GraphNode {
            id: utxo.outpoint.clone(),
            node_type: "utxo".to_string(),
            label: format!("{} sats", utxo.amount_sats),
            risk_state: utxo.audit_flags.first().cloned(),
        })
        .collect();

    let edges = report
        .utxos
        .iter()
        .map(|utxo| GraphEdge {
            id: format!("edge_{}", utxo.outpoint),
            source: utxo.txid.clone(),
            target: utxo.outpoint.clone(),
            edge_type: "creates".to_string(),
        })
        .collect();

    (nodes, edges)
}
