import { invoke } from "@tauri-apps/api/core";
import type { DescriptorDiffResult, PsbtAnalysisResult } from "../lib/phase3";
import type {
  Alert,
  CoinSet,
  ConsolidationSimulation,
  ImportRequest,
  Label,
  SourceCategory,
  SpendSimulation,
  UtxoUpdate,
  WalletReport
} from "../types/domain";

export async function importWallet(request: ImportRequest): Promise<WalletReport> {
  return invoke<WalletReport>("import_wallet", { request });
}

export async function loadDemoWallet(): Promise<WalletReport> {
  try {
    return await invoke<WalletReport>("load_demo_wallet");
  } catch {
    return browserDemoReport();
  }
}

export async function getCurrentWallet(): Promise<WalletReport | null> {
  try {
    return await invoke<WalletReport | null>("get_current_wallet");
  } catch {
    return null;
  }
}

export async function updateUtxos(outpoints: string[], patch: UtxoUpdate): Promise<WalletReport> {
  return invoke<WalletReport>("update_utxos", { outpoints, patch });
}

export async function dismissAction(actionId: string): Promise<WalletReport> {
  return invoke<WalletReport>("dismiss_action", { actionId });
}

export async function compareDescriptors(
  left: string,
  right: string,
  network: WalletReport["wallet"]["network"]
): Promise<DescriptorDiffResult> {
  return invoke<DescriptorDiffResult>("compare_descriptors", { left, right, network });
}

export async function analyzePsbt(psbt: string): Promise<PsbtAnalysisResult> {
  return invoke<PsbtAnalysisResult>("analyze_psbt", { psbt });
}

export async function getAlerts(): Promise<Alert[]> {
  return invoke<Alert[]>("get_alerts");
}

export async function acknowledgeAlert(alertId: string): Promise<Alert[]> {
  return invoke<Alert[]>("acknowledge_alert", { alertId });
}

export async function getLocalDataPath(): Promise<string | null> {
  try {
    return await invoke<string | null>("get_local_data_path");
  } catch {
    return null;
  }
}

export async function clearLocalCache(): Promise<void> {
  return invoke<void>("clear_local_cache");
}

export async function listLabels(): Promise<Label[]> {
  return invoke<Label[]>("list_labels");
}

export async function upsertLabel(patch: {
  target_type: string;
  target_id: string;
  label: string;
  category: SourceCategory;
}): Promise<Label[]> {
  return invoke<Label[]>("upsert_label", { patch });
}

export async function listCoinSets(): Promise<CoinSet[]> {
  return invoke<CoinSet[]>("list_coin_sets");
}

export async function saveCoinSet(patch: {
  id?: string | null;
  name: string;
  intent: string;
  outpoints: string[];
  notes?: string | null;
}): Promise<CoinSet[]> {
  return invoke<CoinSet[]>("save_coin_set", { patch });
}

export async function deleteCoinSet(coinSetId: string): Promise<CoinSet[]> {
  return invoke<CoinSet[]>("delete_coin_set", { coinSetId });
}

export async function simulateSpend(
  outpoints: string[],
  destinationAmountSats: number,
  feeRate: number
): Promise<SpendSimulation> {
  return invoke<SpendSimulation>("simulate_spend", {
    outpoints,
    destinationAmountSats,
    feeRate
  });
}

export async function simulateConsolidation(
  outpoints: string[],
  feeRate: number
): Promise<ConsolidationSimulation> {
  return invoke<ConsolidationSimulation>("simulate_consolidation", { outpoints, feeRate });
}

export function looksLikePrivateMaterial(input: string): boolean {
  const value = input.toLowerCase();
  if (/(xprv|tprv|yprv|zprv|uprv|vprv|private key|privkey|mnemonic|seed phrase|wif)/.test(value)) {
    return true;
  }
  if (/\b[5KLc9][1-9A-HJ-NP-Za-km-z]{50,51}\b/.test(input)) {
    return true;
  }
  const words = input.trim().split(/\s+/).filter((word) => /^[a-z]+$/i.test(word));
  return [12, 15, 18, 21, 24].includes(words.length);
}

function browserDemoReport(): WalletReport {
  const txid = "65b6726e7c9e0b8c2f98bdbd83a7ad21829ab95e4db9b9a4f6dfaa03f37a1111";
  return {
    wallet: {
      id: "browser_demo",
      name: "Demo watch-only wallet",
      network: "mainnet",
      backend: "mock",
      gap_limit: 20,
      descriptor_based: true,
      created_at: new Date().toISOString()
    },
    descriptors: [
      {
        id: "desc_external",
        wallet_id: "browser_demo",
        keychain: "external",
        descriptor: "wpkh([d34db33f/84h/0h/0h]xpubDemoWatchOnlyExternal/0/*)",
        checksum: null,
        script_type: "native_segwit",
        master_fingerprint: "d34db33f",
        account_path: "m/84h/0h/0h",
        is_descriptor_based: true
      }
    ],
    derived_addresses: [],
    transactions: [
      {
        txid,
        block_height: 842100,
        block_time: "2026-02-14T16:20:00Z",
        confirmations: 2448,
        fee_sats: 1410,
        vsize: 188,
        explanation:
          "This transaction received 0.25000000 BTC to address index /0/0. It appears to be an external receive."
      }
    ],
    utxos: [
      {
        txid,
        vout: 0,
        outpoint: `${txid}:0`,
        amount_sats: 25000000,
        address: "bc1qsentinel00000phase1demo",
        script_pubkey: "00140000000000000000000000000000000000000000",
        script_type: "native_segwit",
        derivation_path: "m/84h/0h/0h/0/0",
        confirmations: 2448,
        block_height: 842100,
        block_time: "2026-02-14T16:20:00Z",
        label: "Coldcard account A",
        source_label: "River withdrawal",
        source_category: "exchange",
        is_change: false,
        source_txid: txid,
        spend_vbytes_estimate: 68,
        spend_cost_by_fee_rate: [
          { fee_rate: 5, cost_sats: 340, percent_of_value: 0.00136 },
          { fee_rate: 25, cost_sats: 1700, percent_of_value: 0.0068 },
          { fee_rate: 100, cost_sats: 6800, percent_of_value: 0.0272 }
        ],
        audit_flags: [],
        quarantine_status: "none",
        spendability_status: "spendable",
        provenance: {
          source_kind: "manual",
          entity_label: "River withdrawal",
          category: "exchange",
          confidence_level: "high",
          updated_at: "2026-04-24T00:00:00Z",
          evidence: [
            {
              id: "manual_source_label",
              label: "User-confirmed source label",
              detail: "The coin has a local source label of River withdrawal. Manual labels take precedence over heuristics.",
              confidence_level: "high",
              source: "local_labels"
            },
            {
              id: "river-demo-withdrawal",
              label: "Bundled exchange withdrawal pattern",
              detail: "The local registry recognizes this as a River-like withdrawal pattern in the bundled demo data.",
              confidence_level: "high",
              source: "bundled_registry"
            }
          ]
        }
      },
      {
        txid: "89aa4bb6e41b9d2b7c913c4d633e4eed9d3089629f7f26064f0c96cc1f853333",
        vout: 1,
        outpoint: "89aa4bb6e41b9d2b7c913c4d633e4eed9d3089629f7f26064f0c96cc1f853333:1",
        amount_sats: 1200,
        address: "bc1qsentinel00006phase1demo",
        script_pubkey: "00140000000000000000000000000000000000000000",
        script_type: "native_segwit",
        derivation_path: "m/84h/0h/0h/0/6",
        confirmations: 546,
        block_height: 844002,
        block_time: "2026-03-25T19:44:00Z",
        label: null,
        source_label: null,
        source_category: "unknown",
        is_change: false,
        source_txid: "89aa4bb6e41b9d2b7c913c4d633e4eed9d3089629f7f26064f0c96cc1f853333",
        spend_vbytes_estimate: 68,
        spend_cost_by_fee_rate: [
          { fee_rate: 5, cost_sats: 340, percent_of_value: 28.3333 },
          { fee_rate: 25, cost_sats: 1700, percent_of_value: 141.6667 },
          { fee_rate: 100, cost_sats: 6800, percent_of_value: 566.6667 }
        ],
        audit_flags: ["tiny_utxo", "uneconomical_to_spend", "dust_attack_suspicion"],
        quarantine_status: "dust_attack_suspicion",
        spendability_status: "quarantined",
        provenance: {
          source_kind: "unknown",
          entity_label: null,
          category: "unknown",
          confidence_level: "low",
          updated_at: "2026-04-24T00:00:00Z",
          evidence: [
            {
              id: "unknown_source",
              label: "No local provenance evidence",
              detail: "No manual label, registry pattern, or wallet-change heuristic matched this coin.",
              confidence_level: "low",
              source: "local_provenance_engine"
            },
            {
              id: "unknown_or_dust_flag",
              label: "Unknown-source risk flag",
              detail: "The coin is unlabeled and already carries an unknown-source or dust-style quarantine flag.",
              confidence_level: "medium",
              source: "audit_engine"
            }
          ]
        }
      }
    ],
    findings: [
      {
        id: "dust_attack_suspicion",
        severity: "high",
        title: "Dust attack suspicion",
        explanation:
          "A tiny unlabeled UTXO from an unknown source may indicate a dusting attempt. This heuristic is not definitive.",
        recommended_action:
          "Quarantine the coin and avoid merging it with unrelated UTXOs unless you have reviewed the source.",
        affected_utxos: ["89aa4bb6e41b9d2b7c913c4d633e4eed9d3089629f7f26064f0c96cc1f853333:1"],
        affected_transactions: [],
        confidence_level: "medium",
        heuristic_notes: "Dust detection uses amount, source category, and missing label metadata only."
      }
    ],
    scores: {
      privacy: 86,
      fee_efficiency: 72,
      operational_clarity: 92,
      spend_readiness: 100,
      recovery_readiness: 85,
      backend_privacy: 100
    },
    backend_privacy: {
      score: 100,
      mode: "mock",
      summary: "Mock backend uses bundled local fixture data only.",
      warnings: []
    },
    totals: {
      balance_sats: 25001200,
      utxo_count: 2,
      largest_utxo_sats: 25000000,
      smallest_utxo_sats: 1200,
      by_category: { Exchange: 25000000, Unknown: 1200 }
    },
    provenance_summary: {
      assessed_count: 2,
      manual_count: 1,
      registry_count: 0,
      heuristic_count: 0,
      unknown_count: 1,
      exchange_like_count: 1
    },
    actions: [
      {
        id: "cockpit:quarantined_coins",
        severity: "high",
        title: "Keep quarantined coins isolated",
        summary: "1 UTXO is marked for quarantine or manual review.",
        why_it_matters: "Quarantined coins can carry dust, unknown-source, address reuse, or manual do-not-merge risk.",
        recommended_action: "Open the coin workbench, review the evidence, and avoid merging this coin into normal spends.",
        cta_page: "utxos",
        affected_utxos: ["89aa4bb6e41b9d2b7c913c4d633e4eed9d3089629f7f26064f0c96cc1f853333:1"],
        confidence_level: "high",
        dismissed: false
      },
      {
        id: "cockpit:exchange_stack",
        severity: "medium",
        title: "Protect KYC-linked exchange stack",
        summary: "1 UTXO looks exchange-linked by local labels or registry evidence.",
        why_it_matters: "Exchange-linked coins can reveal identity context when merged with P2P, donation, or unknown-source coins.",
        recommended_action: "Use Spend Preflight before merging exchange-like coins with unrelated contexts.",
        cta_page: "spend_preflight",
        affected_utxos: [`${txid}:0`],
        confidence_level: "medium",
        dismissed: false
      }
    ]
  };
}
