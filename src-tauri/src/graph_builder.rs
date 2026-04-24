use crate::models::{GraphEdge, GraphNode, WalletReport};
use std::collections::BTreeSet;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WalletGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub total_nodes: usize,
    pub limited: bool,
}

pub fn build_phase_one_wallet_graph(report: &WalletReport) -> (Vec<GraphNode>, Vec<GraphEdge>) {
    let graph = build_wallet_graph(report, 250);
    (graph.nodes, graph.edges)
}

pub fn build_wallet_graph(report: &WalletReport, node_limit: usize) -> WalletGraph {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut seen = BTreeSet::new();

    for transaction in &report.transactions {
        let id = format!("tx:{}", transaction.txid);
        if seen.insert(id.clone()) {
            nodes.push(GraphNode {
                id,
                node_type: "transaction".to_string(),
                label: format!("{} conf", transaction.confirmations),
                risk_state: None,
            });
        }
    }

    for utxo in &report.utxos {
        let tx_node = format!("tx:{}", utxo.txid);
        let address_node = format!("addr:{}", utxo.address);
        let utxo_node = format!("utxo:{}", utxo.outpoint);

        if seen.insert(tx_node.clone()) {
            nodes.push(GraphNode {
                id: tx_node.clone(),
                node_type: "transaction".to_string(),
                label: txid_prefix(&utxo.txid),
                risk_state: None,
            });
        }
        if seen.insert(address_node.clone()) {
            nodes.push(GraphNode {
                id: address_node.clone(),
                node_type: "address".to_string(),
                label: address_prefix(&utxo.address),
                risk_state: reused_state(report, &utxo.address),
            });
        }
        if seen.insert(utxo_node.clone()) {
            nodes.push(GraphNode {
                id: utxo_node.clone(),
                node_type: "utxo".to_string(),
                label: format!("{} sats", utxo.amount_sats),
                risk_state: utxo.audit_flags.first().cloned(),
            });
        }

        edges.push(GraphEdge {
            id: format!("creates:{}", utxo.outpoint),
            source: tx_node,
            target: utxo_node.clone(),
            edge_type: "creates".to_string(),
        });
        edges.push(GraphEdge {
            id: format!("receives:{}", utxo.outpoint),
            source: address_node,
            target: utxo_node,
            edge_type: "receives".to_string(),
        });
    }

    let total_nodes = nodes.len();
    let limited = total_nodes > node_limit;
    if limited {
        nodes.truncate(node_limit);
        let kept: BTreeSet<&String> = nodes.iter().map(|node| &node.id).collect();
        edges.retain(|edge| kept.contains(&edge.source) && kept.contains(&edge.target));
    }

    WalletGraph {
        nodes,
        edges,
        total_nodes,
        limited,
    }
}

fn reused_state(report: &WalletReport, address: &str) -> Option<String> {
    report
        .derived_addresses
        .iter()
        .find(|derived| derived.address == address && derived.receive_count > 1)
        .map(|_| "address_reuse".to_string())
}

fn txid_prefix(txid: &str) -> String {
    txid.chars().take(12).collect()
}

fn address_prefix(address: &str) -> String {
    if address.len() <= 18 {
        address.to_string()
    } else {
        format!("{}...", address.chars().take(18).collect::<String>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blockchain_backend::BlockchainBackend;
    use crate::mock_backend::{build_demo_import, MockBackend};

    #[test]
    fn wallet_graph_contains_transactions_addresses_and_utxos() {
        let report = MockBackend.scan_wallet(&build_demo_import());
        let graph = build_wallet_graph(&report, 250);

        assert!(graph.nodes.iter().any(|node| node.node_type == "transaction"));
        assert!(graph.nodes.iter().any(|node| node.node_type == "address"));
        assert!(graph.nodes.iter().any(|node| node.node_type == "utxo"));
        assert!(graph.edges.iter().any(|edge| edge.edge_type == "creates"));
    }

    #[test]
    fn wallet_graph_applies_node_limit() {
        let report = MockBackend.scan_wallet(&build_demo_import());
        let graph = build_wallet_graph(&report, 4);

        assert!(graph.limited);
        assert_eq!(graph.nodes.len(), 4);
        assert!(graph
            .edges
            .iter()
            .all(|edge| graph.nodes.iter().any(|node| node.id == edge.source)
                && graph.nodes.iter().any(|node| node.id == edge.target)));
    }
}
