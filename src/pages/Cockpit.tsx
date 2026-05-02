import {
  ArrowRight,
  CircleGauge,
  Fingerprint,
  HeartPulse,
  ShieldAlert,
  ShieldCheck,
  X
} from "lucide-react";
import { useState } from "react";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import { backendLabel, humanize, satsToBtc, severityRank } from "../lib/format";
import { buildGuidedActions, type EvidenceItem, type GuidedActionItem } from "../lib/ops";
import type { ActionItem, ConfidenceLevel, Severity, WalletReport } from "../types/domain";

interface CockpitProps {
  report: WalletReport;
  onNavigate: (page: string) => void;
  onDismissAction: (actionId: string) => void;
}

interface RiskPosture {
  label: string;
  summary: string;
  score: number;
  severity: Severity;
  driver: string;
  nextAction: string;
  confidence: string;
  affectedCount: number;
  ctaPage: string;
}

interface CockpitActionItem {
  id: string;
  source: "risk" | "guided";
  severity: Severity;
  confidence: ConfidenceLevel;
  title: string;
  summary: string;
  recommendedAction: string;
  affectedCount: number;
  ctaPage: string;
  ctaLabel: string;
  dismissActionId?: string;
}

export function Cockpit({ report, onNavigate, onDismissAction }: CockpitProps) {
  const [activeEvidence, setActiveEvidence] = useState<EvidenceItem | null>(null);
  const [highlightedActionId, setHighlightedActionId] = useState<string | null>(null);
  const topActions = compactCockpitActions([
    ...report.actions.map(mapReportAction),
    ...buildGuidedActions(report).map(mapGuidedAction)
  ]);
  const topAction = topActions[0] ?? null;
  const unknownCount = report.provenance_summary.unknown_count;
  const exchangeCount = report.provenance_summary.exchange_like_count;
  const posture = buildRiskPosture(report, topAction);

  function revealSafestNextStep() {
    if (!topAction) {
      onNavigate(posture.ctaPage);
      return;
    }

    setHighlightedActionId(topAction.id);
    window.setTimeout(() => {
      const target = document.getElementById(actionDomId(topAction.id));
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target?.scrollIntoView({ block: "center", behavior: prefersReducedMotion ? "auto" : "smooth" });
    }, 40);
    window.setTimeout(() => {
      setHighlightedActionId((current) => current === topAction.id ? null : current);
    }, 3200);
  }

  return (
    <main className="page-shell cockpit-shell">
      <section className={`cockpit-overview cockpit-overview-${posture.severity}`} aria-label="Wallet risk posture">
        <div className="cockpit-overview-copy">
          <span className="eyebrow">Bitcoin security cockpit</span>
          <p className="cockpit-context">{backendLabel(report.wallet.backend)} · {humanize(report.wallet.network)} · pre-sign / local</p>
          <h1>{posture.label}</h1>
          <p>{posture.summary}</p>
        </div>
        <div className="cockpit-score" aria-label={`Posture score ${posture.score} out of 100`}>
          <span>score</span>
          <strong>{posture.score}</strong>
        </div>
        <div className="cockpit-next-step">
          <span>Next · {humanize(posture.confidence)} confidence · {affectedCoinText(posture.affectedCount)}</span>
          <strong>{posture.driver}</strong>
          <p>{posture.nextAction}</p>
          <button
            type="button"
            className="primary-button"
            onClick={revealSafestNextStep}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                revealSafestNextStep();
              }
            }}
          >
            Show highlighted action <ArrowRight size={16} />
          </button>
        </div>
      </section>

      <section className="instrument-band" aria-label="Wallet posture instruments">
        <InstrumentTile
          icon={ShieldCheck}
          label="Privacy"
          value={`${report.scores.privacy}/100`}
          detail="wallet posture"
          onOpenEvidence={() => setActiveEvidence(buildInstrumentEvidence(report, "privacy"))}
        />
        <InstrumentTile
          icon={CircleGauge}
          label="Spend"
          value={`${report.scores.spend_readiness}/100`}
          detail="readiness"
          onOpenEvidence={() => setActiveEvidence(buildInstrumentEvidence(report, "spend"))}
        />
        <InstrumentTile
          icon={HeartPulse}
          label="Recovery"
          value={`${report.scores.recovery_readiness}/100`}
          detail="drill posture"
          onOpenEvidence={() => setActiveEvidence(buildInstrumentEvidence(report, "recovery"))}
        />
        <InstrumentTile
          icon={Fingerprint}
          label="Provenance"
          value={`${report.provenance_summary.assessed_count - unknownCount}/${report.provenance_summary.assessed_count}`}
          detail={`${exchangeCount} exchange-like`}
          onOpenEvidence={() => setActiveEvidence(buildInstrumentEvidence(report, "provenance"))}
        />
      </section>

      <section className="action-center-panel">
        <div className="cockpit-section-heading">
          <span className="eyebrow">Priority queue</span>
          <h2>{topActions.length ? `${topActions.length} actions` : "No active actions"}</h2>
        </div>
        {topActions.length ? (
          <div className="action-center-list">
            {topActions.slice(0, 3).map((action, index) => (
              <ActionCard
                key={action.id}
                action={action}
                index={index + 1}
                highlighted={highlightedActionId === action.id}
                onNavigate={onNavigate}
                onDismissAction={onDismissAction}
              />
            ))}
            {topActions.length > 3 ? (
              <p className="cockpit-more-actions">{topActions.length - 3} lower-priority action{topActions.length - 3 === 1 ? "" : "s"} hidden from the cockpit summary.</p>
            ) : null}
          </div>
        ) : (
          <p className="empty-state">No active operational actions. Keep labels and recovery metadata current.</p>
        )}
      </section>
      <EvidenceDrawer item={activeEvidence} onClose={() => setActiveEvidence(null)} />
    </main>
  );
}

function compactCockpitActions(actions: CockpitActionItem[]): CockpitActionItem[] {
  const grouped = new Map<string, CockpitActionItem>();

  actions
    .sort(compareCockpitActions)
    .forEach((action) => {
      const key = actionGroupKey(action);
      const current = grouped.get(key);
      if (!current || compareCockpitActions(action, current) < 0) {
        grouped.set(key, action);
      }
    });

  return Array.from(grouped.values()).sort(compareCockpitActions);
}

function compareCockpitActions(a: CockpitActionItem, b: CockpitActionItem) {
  const severityDelta = severityRank(b.severity) - severityRank(a.severity);
  if (severityDelta !== 0) return severityDelta;
  const affectedDelta = b.affectedCount - a.affectedCount;
  if (affectedDelta !== 0) return affectedDelta;
  if (a.source !== b.source) return a.source === "risk" ? -1 : 1;
  return a.title.localeCompare(b.title);
}

function actionGroupKey(action: CockpitActionItem) {
  const text = `${action.title} ${action.summary} ${action.recommendedAction}`.toLowerCase();
  if (/quarantine|dust|isolat|do not merge/.test(text)) return "quarantine";
  if (/exchange|kyc/.test(text)) return "exchange";
  if (/label|unknown source|provenance/.test(text)) return "provenance";
  if (/recovery|descriptor|fingerprint|backup/.test(text)) return "recovery";
  if (/spend|preflight|scenario|sign/.test(text)) return "spend";
  return action.id;
}

function buildRiskPosture(report: WalletReport, topAction: CockpitActionItem | null): RiskPosture {
  const score = Math.min(
    report.scores.privacy,
    report.scores.spend_readiness,
    report.scores.recovery_readiness,
    report.backend_privacy.score
  );

  if (topAction) {
    const elevated = topAction.severity === "critical" || topAction.severity === "high";
    return {
      label: elevated ? "Elevated review required" : "Review recommended",
      summary: elevated
        ? "Handle the top risk before treating this wallet as ready for normal spend planning."
        : "The wallet is usable for analysis, but one or more operator decisions still need attention.",
      score,
      severity: topAction.severity,
      driver: topAction.title,
      nextAction: topAction.recommendedAction,
      confidence: topAction.confidence,
      affectedCount: topAction.affectedCount,
      ctaPage: topAction.ctaPage
    };
  }

  return {
    label: "Preflight ready",
    summary: "No active Cockpit action is blocking review. Continue using Workbench, Recovery, and PSBT Preflight before external signing.",
    score,
    severity: score >= 85 ? "low" : "medium",
    driver: "No active risk driver",
    nextAction: "Keep labels current and run Spend Preflight before signing elsewhere.",
    confidence: "high",
    affectedCount: 0,
    ctaPage: "spend_preflight"
  };
}

function mapReportAction(action: ActionItem): CockpitActionItem {
  return {
    id: `risk:${action.id}`,
    source: "risk",
    severity: action.severity,
    confidence: action.confidence_level,
    title: action.title,
    summary: action.summary,
    recommendedAction: action.recommended_action,
    affectedCount: action.affected_utxos.length,
    ctaPage: action.cta_page,
    ctaLabel: "Open module",
    dismissActionId: action.id
  };
}

function mapGuidedAction(mission: GuidedActionItem): CockpitActionItem {
  return {
    id: `guided:${mission.id}`,
    source: "guided",
    severity: mission.severity,
    confidence: mission.confidence,
    title: mission.title,
    summary: mission.why,
    recommendedAction: mission.action,
    affectedCount: mission.affectedCount ?? mission.affectedOutpoints.length,
    ctaPage: mission.page,
    ctaLabel: mission.ctaLabel
  };
}

function ActionCard({
  action,
  index,
  highlighted,
  onNavigate,
  onDismissAction
}: {
  action: CockpitActionItem;
  index: number;
  highlighted: boolean;
  onNavigate: (page: string) => void;
  onDismissAction: (actionId: string) => void;
}) {
  const dismissActionId = action.dismissActionId;

  return (
    <article id={actionDomId(action.id)} className={`action-card action-card-${action.severity} ${highlighted ? "action-card-highlight" : ""}`}>
      <span className="action-card-index">{index}</span>
      <div className="action-card-topline">
        <div className="finding-title action-card-meta">
          <span className={`action-severity-text action-severity-${action.severity}`}>{humanize(action.severity)}</span>
          <span>{humanize(action.confidence)} confidence</span>
          {action.source === "guided" ? <span className="action-source-text">Guided op</span> : null}
        </div>
        {dismissActionId ? (
          <button type="button" className="icon-button action-dismiss" onClick={() => onDismissAction(dismissActionId)} aria-label={`Dismiss ${action.title}`}>
            <X size={14} />
          </button>
        ) : null}
      </div>
      <div className="action-card-copy">
        <div className="action-card-heading">
          <h3>{action.title}</h3>
          <p>{action.summary}</p>
        </div>
        <div className="action-card-detail action-card-next">
          <strong>Next</strong>
          <span>{action.recommendedAction}</span>
        </div>
      </div>
      <div className="action-card-footer">
        <span>{affectedCoinText(action.affectedCount)}</span>
        <button type="button" className="secondary-button" onClick={() => onNavigate(action.ctaPage)}>
          {action.ctaLabel} <ArrowRight size={15} />
        </button>
      </div>
    </article>
  );
}

function actionDomId(id: string) {
  return `action-center-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function affectedCoinText(count: number) {
  if (count === 0) return "wallet-level action";
  return `${count} affected ${count === 1 ? "coin" : "coins"}`;
}

type InstrumentKey = "balance" | "privacy" | "spend" | "recovery" | "provenance" | "backend";

function buildInstrumentEvidence(report: WalletReport, key: InstrumentKey): EvidenceItem {
  const highFindings = report.findings.filter((finding) => finding.severity === "high" || finding.severity === "critical");
  const quarantined = report.utxos.filter((utxo) => utxo.quarantine_status !== "none" || utxo.spendability_status === "quarantined");
  const unlabeled = report.utxos.filter((utxo) => !utxo.label || !utxo.source_label || utxo.source_category === "unknown");
  const exchangeLike = report.utxos.filter((utxo) => utxo.provenance.category === "exchange" || utxo.source_category === "exchange");

  if (key === "privacy") {
    return {
      id: "instrument:privacy",
      title: "Privacy score calculation",
      severity: scoreSeverity(report.scores.privacy),
      confidence: "medium",
      why: "The privacy posture comes from local report heuristics: source clarity, provenance risk, quarantine state, and privacy-related findings.",
      action: "Open Coin Workbench, label unknown coins, and avoid merging exchange-like or quarantined coins with unrelated contexts.",
      evidence: [
        `Privacy score: ${report.scores.privacy}/100`,
        `High or critical findings: ${highFindings.length}`,
        `Exchange-like coins: ${exchangeLike.length}`,
        `Unknown provenance coins: ${report.provenance_summary.unknown_count}`,
        `Coins needing labels: ${unlabeled.length}`
      ],
      affectedCount: report.utxos.length
    };
  }

  if (key === "spend") {
    return {
      id: "instrument:spend",
      title: "Spend readiness calculation",
      severity: scoreSeverity(report.scores.spend_readiness),
      confidence: "medium",
      why: "Spend readiness reflects whether the wallet has isolated risky coins and enough context to run a pre-sign scenario safely.",
      action: "Run Spend Preflight before signing elsewhere, especially if selected coins cross source or label boundaries.",
      evidence: [
        `Spend readiness score: ${report.scores.spend_readiness}/100`,
        `Active cockpit actions: ${report.actions.length}`,
        `Quarantined or isolated coins: ${quarantined.length}`,
        `Available UTXOs: ${report.totals.utxo_count}`,
        `Smallest coin: ${report.totals.smallest_utxo_sats.toLocaleString()} sats`
      ],
      affectedCount: report.utxos.length
    };
  }

  if (key === "recovery") {
    const missingFingerprint = report.descriptors.filter((descriptor) => !descriptor.master_fingerprint).length;
    const missingPath = report.descriptors.filter((descriptor) => !descriptor.account_path).length;
    const hasChangeDescriptor = report.descriptors.some((descriptor) => descriptor.keychain === "change");
    return {
      id: "instrument:recovery",
      title: "Recovery score calculation",
      severity: scoreSeverity(report.scores.recovery_readiness),
      confidence: "high",
      why: "Recovery readiness is based on descriptor completeness, change coverage, fingerprint/path metadata, and export readiness.",
      action: "Open Recovery and verify that descriptors, fingerprints, account paths, and local recovery export data match your real backup plan.",
      evidence: [
        `Recovery score: ${report.scores.recovery_readiness}/100`,
        `Descriptors tracked: ${report.descriptors.length}`,
        `Change descriptor present: ${hasChangeDescriptor ? "yes" : "no"}`,
        `Descriptors missing fingerprint: ${missingFingerprint}`,
        `Descriptors missing account path: ${missingPath}`
      ],
      affectedCount: report.descriptors.length
    };
  }

  if (key === "provenance") {
    return {
      id: "instrument:provenance",
      title: "Provenance coverage calculation",
      severity: report.provenance_summary.unknown_count > 0 || report.provenance_summary.exchange_like_count > 0 ? "medium" : "low",
      confidence: "medium",
      why: "Provenance coverage compares coins with local manual, registry, heuristic, or wallet-change evidence against coins still unknown.",
      action: "Open Coin Workbench to review evidence, add manual source labels, and quarantine coins that should not merge.",
      evidence: [
        `Assessed coins: ${report.provenance_summary.assessed_count}`,
        `Manual labels: ${report.provenance_summary.manual_count}`,
        `Registry evidence: ${report.provenance_summary.registry_count}`,
        `Heuristic evidence: ${report.provenance_summary.heuristic_count}`,
        `Unknown provenance: ${report.provenance_summary.unknown_count}`,
        `Exchange-like coins: ${report.provenance_summary.exchange_like_count}`
      ],
      affectedCount: report.provenance_summary.assessed_count
    };
  }

  if (key === "backend") {
    return {
      id: "instrument:backend",
      title: "Backend privacy score calculation",
      severity: scoreSeverity(report.backend_privacy.score),
      confidence: "high",
      why: report.backend_privacy.summary,
      action: report.backend_privacy.warnings.length
        ? "Prefer a local node or private Electrum server when possible. Public backends can infer wallet activity from derived address or script-hash queries."
        : "Keep using local-first backend settings and Network Lock when you want stricter offline behavior.",
      evidence: [
        `Backend: ${backendLabel(report.wallet.backend)}`,
        `Backend score: ${report.backend_privacy.score}/100`,
        `Network: ${humanize(report.wallet.network)}`,
        ...report.backend_privacy.warnings
      ],
      affectedCount: report.utxos.length
    };
  }

  return {
    id: "instrument:balance",
    title: "Balance calculation",
    severity: "info",
    confidence: "high",
    why: "The balance under watch is the sum of UTXOs in the current local wallet report.",
    action: "Use Coin Workbench to inspect individual UTXOs before using any balance number operationally.",
    evidence: [
      `Balance: ${satsToBtc(report.totals.balance_sats)} BTC`,
      `UTXO count: ${report.totals.utxo_count}`,
      `Largest coin: ${report.totals.largest_utxo_sats.toLocaleString()} sats`,
      `Smallest coin: ${report.totals.smallest_utxo_sats.toLocaleString()} sats`
    ],
    affectedCount: report.utxos.length
  };
}

function scoreSeverity(score: number): Severity {
  if (score >= 90) return "low";
  if (score >= 70) return "medium";
  return "high";
}

function InstrumentTile({
  icon: Icon,
  label,
  value,
  detail,
  onOpenEvidence
}: {
  icon: typeof ShieldAlert;
  label: string;
  value: string;
  detail: string;
  onOpenEvidence: () => void;
}) {
  return (
    <button type="button" className="instrument-tile" onClick={onOpenEvidence} aria-label={`Show how ${label} was calculated`}>
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </button>
  );
}
