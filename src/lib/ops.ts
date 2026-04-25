import { categoryLabel, compactSats, humanize, txidPrefix } from "./format";
import type { SpendPreview as SpendPreviewModel } from "./phase2";
import type {
  ConfidenceLevel,
  Severity,
  Utxo,
  WalletReport
} from "../types/domain";

export type OpsTone = "neutral" | "good" | "warn" | "bad";

export type CoinDecisionState =
  | "ready"
  | "review"
  | "quarantine"
  | "do_not_merge"
  | "label_needed";

export interface EvidenceItem {
  id: string;
  title: string;
  severity: Severity;
  confidence: ConfidenceLevel;
  why: string;
  action: string;
  evidence: string[];
  affectedCount?: number;
}

export interface CoinDecision {
  state: CoinDecisionState;
  label: string;
  tone: OpsTone;
  severity: Severity;
  confidence: ConfidenceLevel;
  reason: string;
  action: string;
  evidence: string[];
}

export interface MissionQueueItem extends EvidenceItem {
  page: string;
  ctaLabel: string;
  affectedOutpoints: string[];
}

export interface SpendScenario {
  id: string;
  title: string;
  severity: Severity;
  tone: OpsTone;
  confidence: ConfidenceLevel;
  narrative: string;
  observerInference: string;
  action: string;
  affectedOutpoints: string[];
  evidence: string[];
}

export function getCoinDecision(utxo: Utxo): CoinDecision {
  const evidence = baseCoinEvidence(utxo);

  if (utxo.spendability_status === "do_not_spend") {
    return {
      state: "do_not_merge",
      label: "Do not merge",
      tone: "bad",
      severity: "high",
      confidence: "high",
      reason: "This coin is explicitly marked do-not-spend in local metadata.",
      action: "Keep it out of normal spends and consolidations until the operator changes the policy.",
      evidence: [...evidence, `Spend policy: ${humanize(utxo.spendability_status)}`]
    };
  }

  if (
    utxo.quarantine_status !== "none" ||
    utxo.spendability_status === "quarantined" ||
    isDustLike(utxo)
  ) {
    return {
      state: "quarantine",
      label: "Quarantine",
      tone: "warn",
      severity: "high",
      confidence: "high",
      reason: "This coin has a quarantine, dust, or isolation signal in local wallet metadata.",
      action: "Review the source and keep it isolated from normal spend groups unless the merge is intentional.",
      evidence: [
        ...evidence,
        `Quarantine status: ${humanize(utxo.quarantine_status)}`,
        `Spend policy: ${humanize(utxo.spendability_status)}`
      ]
    };
  }

  if (needsLabel(utxo)) {
    return {
      state: "label_needed",
      label: "Label needed",
      tone: "warn",
      severity: "medium",
      confidence: "medium",
      reason: "The coin is missing enough operator context to make a confident spend decision.",
      action: "Add a UTXO label, source label, and source category before merging it with other coins.",
      evidence: [
        ...evidence,
        `UTXO label: ${utxo.label || "missing"}`,
        `Source label: ${utxo.source_label || "missing"}`,
        `Provenance source: ${humanize(utxo.provenance.source_kind)}`
      ]
    };
  }

  if (
    isExchangeLike(utxo) ||
    utxo.audit_flags.length > 0 ||
    !["spendable", "cold_storage_only"].includes(utxo.spendability_status)
  ) {
    return {
      state: "review",
      label: "Review",
      tone: "warn",
      severity: "medium",
      confidence: isExchangeLike(utxo) ? "high" : "medium",
      reason: "This coin has exchange-like provenance, audit flags, or a non-default spend policy.",
      action: "Inspect the evidence and spend it only with coins from the same intended context.",
      evidence: [
        ...evidence,
        `Audit flags: ${utxo.audit_flags.length ? utxo.audit_flags.map(humanize).join(", ") : "none"}`,
        `Spend policy: ${humanize(utxo.spendability_status)}`
      ]
    };
  }

  return {
    state: "ready",
    label: "Ready",
    tone: "good",
    severity: "low",
    confidence: "medium",
    reason: "No quarantine, label, provenance, or spend-policy concern is visible in local metadata.",
    action: "Still run Spend Preflight before signing elsewhere, especially for multi-input spends.",
    evidence
  };
}

export function coinDecisionEvidence(utxo: Utxo): EvidenceItem {
  const decision = getCoinDecision(utxo);
  return {
    id: `coin-decision:${utxo.outpoint}`,
    title: `Coin decision: ${decision.label}`,
    severity: decision.severity,
    confidence: decision.confidence,
    why: decision.reason,
    action: decision.action,
    evidence: decision.evidence,
    affectedCount: 1
  };
}

export function buildMissionQueue(report: WalletReport): MissionQueueItem[] {
  const exchangeLike = report.utxos.filter(isExchangeLike);
  const quarantined = report.utxos.filter((utxo) => {
    const decision = getCoinDecision(utxo);
    return decision.state === "quarantine" || decision.state === "do_not_merge";
  });
  const labelNeeded = report.utxos.filter((utxo) => getCoinDecision(utxo).state === "label_needed");
  const recoveryIssues = recoveryIssueEvidence(report);
  const missions: MissionQueueItem[] = [];

  if (exchangeLike.length > 0) {
    missions.push({
      id: "review-exchange-like-coins",
      title: "Review exchange-like coins",
      severity: "high",
      confidence: "high",
      page: "utxos",
      ctaLabel: "Open Workbench",
      why: "Exchange-linked coins can bridge KYC identity into unrelated cold-storage or P2P contexts.",
      action: "Review provenance evidence, label the source, and avoid merging these coins with unrelated histories.",
      evidence: [
        `${exchangeLike.length} UTXO${exchangeLike.length === 1 ? "" : "s"} look exchange-like.`,
        ...exchangeLike.slice(0, 3).map((utxo) => `${txidPrefix(utxo.txid)}: ${provenanceName(utxo)}`)
      ],
      affectedCount: exchangeLike.length,
      affectedOutpoints: exchangeLike.map((utxo) => utxo.outpoint)
    });
  }

  if (quarantined.length > 0) {
    missions.push({
      id: "quarantine-dust-and-isolated-coins",
      title: "Quarantine dust and isolated coins",
      severity: "high",
      confidence: "high",
      page: "utxos",
      ctaLabel: "Open Workbench",
      why: "Dust, quarantined, or do-not-merge coins can contaminate otherwise clean spend groups.",
      action: "Keep these coins isolated, confirm the reason, and only clear quarantine after manual review.",
      evidence: [
        `${quarantined.length} UTXO${quarantined.length === 1 ? "" : "s"} need isolation.`,
        ...quarantined
          .slice(0, 3)
          .map((utxo) => `${txidPrefix(utxo.txid)}: ${humanize(utxo.quarantine_status)} / ${humanize(utxo.spendability_status)}`)
      ],
      affectedCount: quarantined.length,
      affectedOutpoints: quarantined.map((utxo) => utxo.outpoint)
    });
  }

  if (labelNeeded.length > 0) {
    missions.push({
      id: "label-unknown-coins",
      title: "Resolve label-needed coins",
      severity: "medium",
      confidence: "medium",
      page: "utxos",
      ctaLabel: "Open Workbench",
      why: "Coins without source context force the app to stay analytical instead of decisive.",
      action: "Add local labels and source categories so each coin can resolve to Ready, Review, or Quarantine.",
      evidence: [
        `${labelNeeded.length} UTXO${labelNeeded.length === 1 ? "" : "s"} need label context.`,
        ...labelNeeded.slice(0, 3).map((utxo) => `${txidPrefix(utxo.txid)}: ${categoryLabel(utxo.source_category)}`)
      ],
      affectedCount: labelNeeded.length,
      affectedOutpoints: labelNeeded.map((utxo) => utxo.outpoint)
    });
  }

  if (recoveryIssues.length > 0 || report.scores.recovery_readiness < 95) {
    missions.push({
      id: "verify-recovery-metadata",
      title: "Verify recovery metadata",
      severity: report.scores.recovery_readiness < 70 ? "high" : "medium",
      confidence: "high",
      page: "recovery",
      ctaLabel: "Open Recovery",
      why: "Watch-only confidence depends on descriptors, fingerprints, paths, and change coverage matching your recovery plan.",
      action: "Run the Recovery drill and export the local report before you rely on the wallet view operationally.",
      evidence: [
        `Recovery score: ${report.scores.recovery_readiness}/100`,
        ...recoveryIssues
      ],
      affectedCount: recoveryIssues.length,
      affectedOutpoints: []
    });
  }

  if (report.utxos.length > 0) {
    missions.push({
      id: "run-spend-preflight",
      title: "Run spend scenario preflight",
      severity: report.scores.spend_readiness < 90 ? "medium" : "low",
      confidence: "medium",
      page: "spend_preflight",
      ctaLabel: "Open Preflight",
      why: "A coin can look fine alone but become risky when spent with another input or when it creates change.",
      action: "Model the intended coin group before signing elsewhere.",
      evidence: [
        `${report.utxos.length} UTXO${report.utxos.length === 1 ? "" : "s"} available for scenario modeling.`,
        `Spend readiness score: ${report.scores.spend_readiness}/100`
      ],
      affectedCount: report.utxos.length,
      affectedOutpoints: report.utxos.map((utxo) => utxo.outpoint)
    });
  }

  return missions.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function buildSpendScenarios(selected: Utxo[], preview: SpendPreviewModel): SpendScenario[] {
  if (selected.length === 0) {
    return [
      {
        id: "select-coins",
        title: "Select coins to build a scenario",
        severity: "info",
        tone: "neutral",
        confidence: "high",
        narrative: "No observer story exists yet because no inputs are selected.",
        observerInference: "Once coins are selected, XpubShield will model ownership linkage, provenance mixing, change, quarantine, and fee drag.",
        action: "Choose the exact coins you are considering before signing elsewhere.",
        affectedOutpoints: [],
        evidence: ["No selected inputs."]
      }
    ];
  }

  const labels = distinct(selected.map((utxo) => utxo.label || "Unlabeled"));
  const categories = distinct(selected.map((utxo) => utxo.source_category));
  const kycInputs = selected.filter(isExchangeLike);
  const nonKycInputs = selected.filter((utxo) => !isExchangeLike(utxo));
  const quarantined = selected.filter((utxo) => utxo.quarantine_status !== "none" || isDustLike(utxo));

  return [
    {
      id: "common-input-ownership",
      title: "Common-input ownership",
      severity: selected.length > 2 ? "high" : selected.length > 1 ? "medium" : "low",
      tone: selected.length > 1 ? "warn" : "good",
      confidence: selected.length > 1 ? "high" : "medium",
      narrative:
        selected.length > 1
          ? "Spending these inputs together can make them look controlled by the same wallet."
          : "A single-input spend avoids adding a new common-input link from this selection.",
      observerInference:
        selected.length > 1
          ? `An observer may cluster ${selected.length} inputs under one owner.`
          : "The selected input does not merge ownership with another input.",
      action: "Prefer one source context per spend when practical.",
      affectedOutpoints: selected.map((utxo) => utxo.outpoint),
      evidence: [`Selected inputs: ${selected.length}`, `Labels: ${labels.join(", ")}`]
    },
    {
      id: "kyc-context-link",
      title: "KYC context link",
      severity: kycInputs.length > 0 && nonKycInputs.length > 0 ? "high" : kycInputs.length > 0 ? "medium" : "low",
      tone: kycInputs.length > 0 && nonKycInputs.length > 0 ? "bad" : kycInputs.length > 0 ? "warn" : "good",
      confidence: kycInputs.length > 0 ? "medium" : "low",
      narrative:
        kycInputs.length > 0 && nonKycInputs.length > 0
          ? "This spend can link exchange-like coins to separate wallet context."
          : kycInputs.length > 0
            ? "This selection appears exchange-like but does not mix with a separate local source context."
            : "No exchange-like source is visible in this selected set.",
      observerInference:
        kycInputs.length > 0 && nonKycInputs.length > 0
          ? "KYC-origin history may become linked to cold-storage, P2P, unknown, or otherwise separate context."
          : "No KYC/non-KYC bridge is obvious from local labels.",
      action: "Keep exchange-like coins in their own spend path unless the linkage is intentional.",
      affectedOutpoints: selected.map((utxo) => utxo.outpoint),
      evidence: [
        `Exchange-like inputs: ${kycInputs.length}`,
        `Other-context inputs: ${nonKycInputs.length}`,
        `Categories: ${categories.map(categoryLabel).join(", ")}`
      ]
    },
    {
      id: "toxic-change",
      title: "Toxic change",
      severity: preview.createsChange && preview.privacyRisk !== "low" ? "high" : preview.createsChange ? "medium" : "low",
      tone: preview.createsChange && preview.privacyRisk !== "low" ? "bad" : preview.createsChange ? "warn" : "good",
      confidence: preview.createsChange ? "medium" : "high",
      narrative: preview.createsChange
        ? "The model expects change. Change can inherit the combined history of every selected input."
        : "The model does not estimate economical change for this amount and fee rate.",
      observerInference: preview.createsChange
        ? `A change output near ${compactSats(preview.changeAmountSats)} sats may carry the merged input history forward.`
        : "No modeled change output means less future cluster contamination from this exact scenario.",
      action: "Adjust amount, fee, or selected coins to avoid change when the input set mixes contexts.",
      affectedOutpoints: selected.map((utxo) => utxo.outpoint),
      evidence: [
        `Change policy: ${humanize(preview.changePolicy)}`,
        `Estimated change: ${compactSats(preview.changeAmountSats)} sats`,
        `Privacy risk: ${humanize(preview.privacyRisk)}`
      ]
    },
    {
      id: "quarantine-dust-exposure",
      title: "Quarantine and dust exposure",
      severity: quarantined.length > 0 ? "high" : "low",
      tone: quarantined.length > 0 ? "bad" : "good",
      confidence: "high",
      narrative:
        quarantined.length > 0
          ? "This scenario includes coins that should stay isolated until reviewed."
          : "No quarantined or dust-like coin is selected.",
      observerInference:
        quarantined.length > 0
          ? "Dust or quarantined history can become attached to the entire spend cluster."
          : "This selected set does not carry a visible quarantine flag.",
      action: "Remove quarantined coins unless the policy exception is deliberate.",
      affectedOutpoints: quarantined.map((utxo) => utxo.outpoint),
      evidence:
        quarantined.length > 0
          ? quarantined.map((utxo) => `${txidPrefix(utxo.txid)}: ${humanize(utxo.quarantine_status)}`)
          : ["No selected input has quarantine or dust-like signals."]
    }
  ];
}

export function spendScenarioEvidence(scenario: SpendScenario): EvidenceItem {
  return {
    id: `spend-scenario:${scenario.id}`,
    title: scenario.title,
    severity: scenario.severity,
    confidence: scenario.confidence,
    why: scenario.observerInference,
    action: scenario.action,
    evidence: scenario.evidence,
    affectedCount: scenario.affectedOutpoints.length
  };
}

export function privacyRiskEvidence(risk: {
  id: string;
  title: string;
  level: "low" | "medium" | "high";
  confidence: ConfidenceLevel;
  explanation: string;
  affectedOutpoints: string[];
  suggestedAlternative: string;
}): EvidenceItem {
  return {
    id: `privacy:${risk.id}`,
    title: risk.title,
    severity: risk.level === "high" ? "high" : risk.level === "medium" ? "medium" : "low",
    confidence: risk.confidence,
    why: risk.explanation,
    action: risk.suggestedAlternative,
    evidence: [
      `Affected inputs: ${risk.affectedOutpoints.length}`,
      ...risk.affectedOutpoints.slice(0, 4)
    ],
    affectedCount: risk.affectedOutpoints.length
  };
}

export function severityToTone(severity: Severity): OpsTone {
  if (severity === "critical" || severity === "high") return "bad";
  if (severity === "medium") return "warn";
  if (severity === "low") return "good";
  return "neutral";
}

export function statusToSeverity(status: "good" | "warn" | "bad"): Severity {
  if (status === "bad") return "high";
  if (status === "warn") return "medium";
  return "low";
}

function baseCoinEvidence(utxo: Utxo): string[] {
  return [
    `Outpoint: ${utxo.outpoint}`,
    `Amount: ${compactSats(utxo.amount_sats)} sats`,
    `Category: ${categoryLabel(utxo.source_category)}`,
    `Provenance: ${provenanceName(utxo)} with ${humanize(utxo.provenance.confidence_level)} confidence`
  ];
}

function needsLabel(utxo: Utxo): boolean {
  return (
    !utxo.label ||
    !utxo.source_label ||
    utxo.source_category === "unknown" ||
    utxo.provenance.source_kind === "unknown" ||
    utxo.provenance.category === "unknown"
  );
}

function isDustLike(utxo: Utxo): boolean {
  return (
    utxo.amount_sats <= 5_460 ||
    utxo.quarantine_status === "dust_attack_suspicion" ||
    utxo.quarantine_status === "too_small_to_spend_economically" ||
    utxo.audit_flags.some((flag) => flag.toLowerCase().includes("dust"))
  );
}

function isExchangeLike(utxo: Utxo): boolean {
  return (
    utxo.source_category === "exchange" ||
    utxo.provenance.category === "exchange" ||
    /exchange|kyc|coinbase|kraken|binance|cash app|river/i.test(
      `${utxo.source_label ?? ""} ${utxo.provenance.entity_label ?? ""}`
    )
  );
}

function provenanceName(utxo: Utxo): string {
  return utxo.provenance.entity_label ?? utxo.source_label ?? categoryLabel(utxo.provenance.category);
}

function recoveryIssueEvidence(report: WalletReport): string[] {
  const issues: string[] = [];
  if (!report.descriptors.some((descriptor) => descriptor.keychain === "change")) {
    issues.push("Missing change descriptor.");
  }
  if (report.descriptors.some((descriptor) => !descriptor.master_fingerprint)) {
    issues.push("One or more descriptors are missing master fingerprints.");
  }
  if (report.descriptors.some((descriptor) => !descriptor.account_path)) {
    issues.push("One or more descriptors are missing account paths.");
  }
  if (report.descriptors.some((descriptor) => !descriptor.checksum)) {
    issues.push("One or more descriptors are missing checksums.");
  }
  if (report.wallet.gap_limit < 20) {
    issues.push(`Gap limit is ${report.wallet.gap_limit}, below the common default of 20.`);
  }
  return issues;
}

function distinct<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values)).sort();
}

function severityRank(severity: Severity): number {
  return { critical: 5, high: 4, medium: 3, low: 2, info: 1 }[severity];
}
