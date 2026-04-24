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

export interface SpendPreview {
  selectedOutpoints: string[];
  destinationAmountSats: number;
  feeRate: number;
  changePolicy: "auto" | "avoid_change";
  inputAmountSats: number;
  estimatedVbytes: number;
  estimatedFeeSats: number;
  changeAmountSats: number;
  createsChange: boolean;
  privacyRisk: "low" | "medium" | "high";
  labelMixingRisk: "low" | "medium" | "high";
  provenanceMixingRisk: "low" | "medium" | "high";
  observerNotes: string[];
  quarantineWarnings: string[];
  betterUtxoSuggestions: string[];
  feeCosts: Array<{ feeRate: number; estimatedFeeSats: number; changeAmountSats: number }>;
  summary: string;
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

export function buildSpendPreview(
  selected: Utxo[],
  allUtxos: Utxo[],
  destinationAmountSats: number,
  feeRate: number,
  changePolicy: SpendPreview["changePolicy"]
): SpendPreview {
  const normalizedAmount = Math.max(0, Math.floor(destinationAmountSats));
  const normalizedFeeRate = Math.max(1, Math.floor(feeRate));
  const inputAmountSats = selected.reduce((sum, utxo) => sum + utxo.amount_sats, 0);
  const inputVbytes = selected.reduce((sum, utxo) => sum + utxo.spend_vbytes_estimate, 0);
  const baseVbytes = selected.length > 0 ? inputVbytes + 10 + 31 : 0;
  const changeProbeFee = (baseVbytes + 43) * normalizedFeeRate;
  const possibleChange = inputAmountSats - normalizedAmount - changeProbeFee;
  const createsChange = changePolicy === "auto" && possibleChange >= 546;
  const estimatedVbytes = selected.length > 0 ? baseVbytes + (createsChange ? 43 : 0) : 0;
  const estimatedFeeSats = estimatedVbytes * normalizedFeeRate;
  const rawChange = inputAmountSats - normalizedAmount - estimatedFeeSats;
  const changeAmountSats = createsChange ? Math.max(0, rawChange) : 0;
  const labels = distinctValues(selected.map((utxo) => utxo.label || "Unlabeled"));
  const categories = distinctValues(selected.map((utxo) => utxo.source_category));
  const provenanceContexts = distinctValues(selected.map(provenanceContext));
  const quarantineWarnings = selected
    .filter((utxo) => utxo.quarantine_status !== "none")
    .map((utxo) => `${utxo.outpoint} is marked ${utxo.quarantine_status}.`);
  const labelMixingRisk = riskFromCounts(labels.length, categories.length, quarantineWarnings.length > 0);
  const provenanceMixingRisk = riskFromCounts(
    provenanceContexts.length,
    selected.some(isKycLike) && selected.some(isNonKycLike) ? 3 : 1,
    quarantineWarnings.length > 0
  );
  const privacyRisk = maxRisk(
    createsChange && labelMixingRisk !== "low" ? "high" : labelMixingRisk,
    provenanceMixingRisk
  );

  return {
    selectedOutpoints: selected.map((utxo) => utxo.outpoint),
    destinationAmountSats: normalizedAmount,
    feeRate: normalizedFeeRate,
    changePolicy,
    inputAmountSats,
    estimatedVbytes,
    estimatedFeeSats,
    changeAmountSats,
    createsChange,
    privacyRisk,
    labelMixingRisk,
    provenanceMixingRisk,
    observerNotes: buildObserverNotes(selected, createsChange, provenanceMixingRisk),
    quarantineWarnings,
    betterUtxoSuggestions: betterSpendSuggestions(selected, allUtxos, normalizedAmount, normalizedFeeRate),
    feeCosts: STRESS_FEE_RATES.map((rate) => {
      const fee = estimatedVbytes * rate;
      return {
        feeRate: rate,
        estimatedFeeSats: fee,
        changeAmountSats: createsChange ? Math.max(0, inputAmountSats - normalizedAmount - fee) : 0
      };
    }),
    summary: buildSpendSummary(selected.length, normalizedAmount, inputAmountSats, estimatedFeeSats, rawChange)
  };
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

function riskFromCounts(
  labelCount: number,
  categoryCount: number,
  includesQuarantined: boolean
): "low" | "medium" | "high" {
  if (includesQuarantined || labelCount > 2 || categoryCount > 2) return "high";
  if (labelCount > 1 || categoryCount > 1) return "medium";
  return "low";
}

function betterSpendSuggestions(
  selected: Utxo[],
  allUtxos: Utxo[],
  destinationAmountSats: number,
  feeRate: number
): string[] {
  if (selected.length === 0 || destinationAmountSats <= 0) {
    return ["Select one or more spendable UTXOs and enter a destination amount."];
  }

  const suggestions: string[] = [];
  const selectedCategories = distinctValues(selected.map((utxo) => utxo.source_category));
  const selectedLabels = distinctValues(selected.map((utxo) => utxo.label || "Unlabeled"));
  const selectedProvenance = distinctValues(selected.map(provenanceContext));
  const cleanCandidates = allUtxos
    .filter((utxo) => utxo.quarantine_status === "none" && utxo.spendability_status === "spendable")
    .sort((a, b) => a.amount_sats - b.amount_sats);

  const exactish = cleanCandidates.find((utxo) => utxo.amount_sats >= destinationAmountSats + spendCostAtRate(utxo, feeRate));
  if (exactish && !selected.some((utxo) => utxo.outpoint === exactish.outpoint)) {
    suggestions.push(`Consider ${exactish.outpoint}: one spendable UTXO may cover this amount without merging inputs.`);
  }

  if (selectedCategories.length > 1 || selectedLabels.length > 1) {
    suggestions.push("Try selecting UTXOs from one label and source category to reduce common-input linkage.");
  }

  if (selectedProvenance.length > 1) {
    suggestions.push("Prefer a set with one provenance context when the spend does not require merging histories.");
  }

  const sameProvenance = firstCoveringGroup(cleanCandidates, destinationAmountSats, feeRate);
  if (sameProvenance) {
    suggestions.push(
      `A ${sameProvenance.key} group can cover the amount with ${sameProvenance.count} coin${sameProvenance.count === 1 ? "" : "s"}.`
    );
  }

  if (selected.some((utxo) => utxo.quarantine_status !== "none")) {
    suggestions.push("Remove quarantined UTXOs from this simulation unless the manual review is intentional.");
  }

  if (suggestions.length === 0) {
    suggestions.push("Review recipient, fee rate, and change policy in your signing wallet before signing elsewhere.");
  }

  return suggestions;
}

function buildSpendSummary(
  selectedCount: number,
  destinationAmountSats: number,
  inputAmountSats: number,
  estimatedFeeSats: number,
  rawChange: number
): string {
  if (selectedCount === 0) return "No UTXOs are selected for this simulation.";
  if (destinationAmountSats <= 0) return "Enter a destination amount to estimate fee and change.";
  if (inputAmountSats < destinationAmountSats + estimatedFeeSats) {
    return "The selected UTXOs may not cover the destination amount plus the estimated fee.";
  }
  if (rawChange > 0) {
    return "This simulated spend likely creates change. Any change could inherit the selected inputs' combined history.";
  }
  return "This simulated spend appears to use the selected amount without economical change. Verify exact behavior in the signing wallet.";
}

function distinctValues<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values)).sort();
}

function buildObserverNotes(
  selected: Utxo[],
  createsChange: boolean,
  provenanceMixingRisk: SpendPreview["provenanceMixingRisk"]
): string[] {
  if (selected.length === 0) return ["Select coins to model common-input, change, provenance, and fee leakage."];

  const notes = [
    selected.length > 1
      ? "A common-input observer may treat the selected inputs as controlled by one wallet."
      : "A single-input spend avoids new common-input linkage from this selection."
  ];

  if (selected.some(isKycLike) && selected.some(isNonKycLike)) {
    notes.push("This selection mixes exchange-like and non-exchange-like contexts, which can bridge separate identity surfaces.");
  }

  if (createsChange) {
    notes.push("Any change output may inherit the combined history of the selected inputs.");
  }

  if (selected.some((utxo) => utxo.quarantine_status !== "none")) {
    notes.push("Quarantined or dust-like coins in this spend can contaminate otherwise clean clusters.");
  }

  if (provenanceMixingRisk === "low" && notes.length === 1) {
    notes.push("No obvious provenance mixing is visible, but recipient behavior and exact wallet change handling still matter.");
  }

  return notes;
}

function provenanceContext(utxo: Utxo): string {
  return `${utxo.provenance.category}:${utxo.provenance.entity_label ?? utxo.source_label ?? utxo.label ?? "unknown"}`;
}

function isKycLike(utxo: Utxo): boolean {
  return utxo.source_category === "exchange" || utxo.provenance.category === "exchange";
}

function isNonKycLike(utxo: Utxo): boolean {
  return ["p2p", "mining", "gift", "donation"].includes(utxo.source_category) ||
    ["p2p", "mining", "gift", "donation"].includes(utxo.provenance.category);
}

function maxRisk(...levels: SpendPreview["privacyRisk"][]): SpendPreview["privacyRisk"] {
  if (levels.includes("high")) return "high";
  if (levels.includes("medium")) return "medium";
  return "low";
}

function firstCoveringGroup(
  utxos: Utxo[],
  destinationAmountSats: number,
  feeRate: number
): { key: string; count: number } | null {
  const groups = new Map<string, Utxo[]>();
  for (const utxo of utxos) {
    const key = provenanceContext(utxo);
    groups.set(key, [...(groups.get(key) ?? []), utxo]);
  }

  for (const [key, group] of groups) {
    const amount = group.reduce((sum, utxo) => sum + utxo.amount_sats, 0);
    const fee = group.reduce((sum, utxo) => sum + spendCostAtRate(utxo, feeRate), 0);
    if (amount >= destinationAmountSats + fee) {
      return { key, count: group.length };
    }
  }

  return null;
}
