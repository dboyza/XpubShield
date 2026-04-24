import type { SourceCategory, Utxo } from "../types/domain";

export const SOURCE_CATEGORIES: SourceCategory[] = [
  "exchange",
  "mining",
  "p2p",
  "business",
  "donation",
  "gift",
  "unknown",
  "cold_storage",
  "consolidation",
  "change",
  "other"
];

export const STRESS_FEE_RATES = [5, 10, 25, 50, 100, 200, 300];
export const UNECONOMICAL_THRESHOLD_PERCENT = 25;

export interface FeeStressRow {
  feeRate: number;
  totalSpendCostSats: number;
  uneconomicalCount: number;
  walletFeePercent: number;
  problematicOutpoints: string[];
}

export interface PrivacyRisk {
  id: string;
  title: string;
  level: "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  explanation: string;
  affectedOutpoints: string[];
  suggestedAlternative: string;
}

export interface ConsolidationPlan {
  selectedOutpoints: string[];
  currentUtxoCount: number;
  proposedUtxoCount: number;
  feeRate: number;
  estimatedVbytes: number;
  estimatedFeeSats: number;
  futureSavingsAt100Sats: number;
  labelsMerged: string[];
  categoriesMerged: SourceCategory[];
  includesQuarantined: boolean;
  privacyDamage: "low" | "medium" | "high";
  saferGroups: Array<{
    key: string;
    outpoints: string[];
    amountSats: number;
  }>;
}

export function stressTestUtxos(utxos: Utxo[], walletBalanceSats: number): FeeStressRow[] {
  return STRESS_FEE_RATES.map((feeRate) => {
    const totalSpendCostSats = utxos.reduce(
      (sum, utxo) => sum + spendCostAtRate(utxo, feeRate),
      0
    );
    const problematicOutpoints = utxos
      .filter((utxo) => feePercentOfValue(utxo, feeRate) >= UNECONOMICAL_THRESHOLD_PERCENT)
      .map((utxo) => utxo.outpoint);

    return {
      feeRate,
      totalSpendCostSats,
      uneconomicalCount: problematicOutpoints.length,
      walletFeePercent:
        walletBalanceSats > 0 ? (totalSpendCostSats / walletBalanceSats) * 100 : 0,
      problematicOutpoints
    };
  });
}

export function spendCostAtRate(utxo: Utxo, feeRate: number): number {
  return utxo.spend_vbytes_estimate * feeRate;
}

export function feePercentOfValue(utxo: Utxo, feeRate: number): number {
  if (utxo.amount_sats === 0) return 100;
  return (spendCostAtRate(utxo, feeRate) / utxo.amount_sats) * 100;
}

export function suggestedStressAction(utxo: Utxo, feeRate: number): string {
  if (utxo.quarantine_status !== "none") return "review manually";
  if (!utxo.label) return "label source";
  if (feePercentOfValue(utxo, feeRate) >= UNECONOMICAL_THRESHOLD_PERCENT) {
    return utxo.amount_sats < 10_000 ? "mark do-not-spend" : "consolidate later";
  }
  return "leave alone";
}

export function analyzePrivacySelection(selected: Utxo[]): PrivacyRisk[] {
  if (selected.length === 0) {
    return [];
  }

  const risks: PrivacyRisk[] = [];
  const labels = distinctValues(selected.map((utxo) => utxo.label || "Unlabeled"));
  const categories = distinctValues(selected.map((utxo) => utxo.source_category));
  const reused = selected.filter((utxo) => utxo.audit_flags.includes("address_reuse"));
  const quarantined = selected.filter((utxo) => utxo.quarantine_status !== "none");
  const unknowns = selected.filter((utxo) => utxo.source_category === "unknown" || !utxo.label);

  if (selected.length > 1) {
    risks.push({
      id: "common_input_ownership",
      title: "Common input ownership",
      level: selected.length >= 3 ? "high" : "medium",
      confidence: "medium",
      explanation:
        "Spending these UTXOs together could reveal that the inputs are controlled by the same wallet. This heuristic is not definitive, but it is widely assumed by chain observers.",
      affectedOutpoints: selected.map((utxo) => utxo.outpoint),
      suggestedAlternative: "Prefer a smaller selection from one label or source category when practical."
    });
  }

  if (labels.length > 1 || categories.length > 1) {
    risks.push({
      id: "label_category_mixing",
      title: "Label and category mixing",
      level: labels.length > 2 || categories.length > 2 ? "high" : "medium",
      confidence: "high",
      explanation:
        "This selection mixes labels or source categories. Signing a transaction with these inputs may link histories you intended to keep separate.",
      affectedOutpoints: selected.map((utxo) => utxo.outpoint),
      suggestedAlternative: "Split the spend by label/category, or choose UTXOs from the same source context."
    });
  }

  if (reused.length > 0) {
    risks.push({
      id: "address_reuse",
      title: "Address reuse carries forward",
      level: "high",
      confidence: "high",
      explanation:
        "At least one selected UTXO already has an address reuse flag. Spending it with other coins could extend that linkage.",
      affectedOutpoints: reused.map((utxo) => utxo.outpoint),
      suggestedAlternative: "Review reused-address deposits separately before merging them with unrelated coins."
    });
  }

  if (quarantined.length > 0) {
    risks.push({
      id: "quarantine",
      title: "Quarantined coin included",
      level: "high",
      confidence: "high",
      explanation:
        "One or more selected UTXOs are quarantined. This may indicate dust, unknown source, reuse, or a manual do-not-merge policy.",
      affectedOutpoints: quarantined.map((utxo) => utxo.outpoint),
      suggestedAlternative: "Remove quarantined coins from casual spend and consolidation simulations."
    });
  }

  if (selected.length > 1 && unknowns.length > 0) {
    risks.push({
      id: "unknown_source_linkage",
      title: "Unknown source linkage",
      level: "medium",
      confidence: "medium",
      explanation:
        "This selection includes unlabeled or unknown-source UTXOs. A future spend could link unknown deposits with labeled wallet history.",
      affectedOutpoints: unknowns.map((utxo) => utxo.outpoint),
      suggestedAlternative: "Label source context before deciding whether these coins should be spent together."
    });
  }

  if (selected.length > 1) {
    risks.push({
      id: "toxic_change",
      title: "Toxic change possibility",
      level: labels.length > 1 || categories.length > 1 ? "high" : "low",
      confidence: "low",
      explanation:
        "If a real transaction produced change, that change could inherit the combined history of the selected inputs. This depends on the final payment amount and change policy.",
      affectedOutpoints: selected.map((utxo) => utxo.outpoint),
      suggestedAlternative: "Simulate exact payment amounts and avoid creating change from mixed-source inputs."
    });
  }

  if (risks.length === 0) {
    risks.push({
      id: "single_context",
      title: "Single-context selection",
      level: "low",
      confidence: "medium",
      explanation:
        "The selected UTXO set does not show obvious label mixing or quarantine flags. This does not prove the spend is private.",
      affectedOutpoints: selected.map((utxo) => utxo.outpoint),
      suggestedAlternative: "Still review recipient, change, and fee policy before signing elsewhere."
    });
  }

  return risks;
}

export function buildConsolidationPlan(selected: Utxo[], feeRate: number): ConsolidationPlan {
  const selectedOutpoints = selected.map((utxo) => utxo.outpoint);
  const estimatedVbytes =
    selected.reduce((sum, utxo) => sum + utxo.spend_vbytes_estimate, 0) +
    (selected.length > 0 ? 43 : 0);
  const estimatedFeeSats = estimatedVbytes * feeRate;
  const currentFutureSpendCost = selected.reduce(
    (sum, utxo) => sum + spendCostAtRate(utxo, 100),
    0
  );
  const futureConsolidatedSpendCost = selected.length > 0 ? 68 * 100 : 0;
  const labelsMerged = distinctValues(selected.map((utxo) => utxo.label || "Unlabeled"));
  const categoriesMerged = distinctValues(selected.map((utxo) => utxo.source_category));
  const includesQuarantined = selected.some((utxo) => utxo.quarantine_status !== "none");

  return {
    selectedOutpoints,
    currentUtxoCount: selected.length,
    proposedUtxoCount: selected.length > 0 ? 1 : 0,
    feeRate,
    estimatedVbytes,
    estimatedFeeSats,
    futureSavingsAt100Sats: Math.max(0, currentFutureSpendCost - futureConsolidatedSpendCost),
    labelsMerged,
    categoriesMerged,
    includesQuarantined,
    privacyDamage: privacyDamage(labelsMerged.length, categoriesMerged.length, includesQuarantined),
    saferGroups: saferConsolidationGroups(selected)
  };
}

function saferConsolidationGroups(selected: Utxo[]): ConsolidationPlan["saferGroups"] {
  const groups = new Map<string, Utxo[]>();
  for (const utxo of selected) {
    const key = `${utxo.source_category}:${utxo.label || "Unlabeled"}`;
    groups.set(key, [...(groups.get(key) ?? []), utxo]);
  }

  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      outpoints: group.map((utxo) => utxo.outpoint),
      amountSats: group.reduce((sum, utxo) => sum + utxo.amount_sats, 0)
    }));
}

function privacyDamage(labelCount: number, categoryCount: number, includesQuarantined: boolean) {
  if (includesQuarantined || labelCount > 2 || categoryCount > 2) return "high";
  if (labelCount > 1 || categoryCount > 1) return "medium";
  return "low";
}

function distinctValues<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values)).sort();
}
