import {
  AlertTriangle,
  ArrowRight,
  CircleGauge,
  Coins,
  Database,
  Eye,
  Fingerprint,
  HeartPulse,
  LockKeyhole,
  MapPin,
  Search,
  ShieldAlert,
  ShieldCheck,
  WalletCards,
  X
} from "lucide-react";
import { useState } from "react";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import { StatusPill } from "../components/StatusPill";
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
  const urgentCount = topActions.filter((action) => ["high", "critical"].includes(action.severity)).length;
  const unknownCount = report.provenance_summary.unknown_count;
  const exchangeCount = report.provenance_summary.exchange_like_count;
  const posture = buildRiskPosture(report, topAction, urgentCount);
  const knownProvenanceCount = report.provenance_summary.assessed_count - unknownCount;

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
      <section className="cockpit-title">
        <h1>Bitcoin security cockpit</h1>
        <p>Status + Next Step</p>
      </section>

      <section className="cockpit-overview-grid" aria-label="Cockpit status and next action">
        <section className="cockpit-panel wallet-status-panel" aria-label="Wallet status">
          <span className="eyebrow">Wallet status</span>
          <div className="wallet-status-hero">
            <ShieldCheck size={76} strokeWidth={1.7} aria-hidden="true" />
            <div className="wallet-score">
              <span>Posture</span>
              <strong>{posture.score}</strong>
              <small>{posture.score >= 85 ? "Good" : "Review"}</small>
            </div>
            <div className="wallet-major-stat">
              <span>Urgent</span>
              <strong>{urgentCount}</strong>
              <small>Items</small>
            </div>
            <div className="wallet-major-stat">
              <span>Queue</span>
              <strong>{topActions.length}</strong>
              <small>Actions</small>
            </div>
          </div>

          <div className="wallet-mini-grid" aria-label="Posture components">
            <MiniStatus icon={LockKeyhole} label="Privacy" value={`${report.scores.privacy} / 100`} detail={report.scores.privacy >= 85 ? "Good" : "Review"} />
            <MiniStatus icon={Fingerprint} label="Readiness" value={`${report.scores.spend_readiness} / 100`} detail={report.scores.spend_readiness >= 90 ? "Ready" : "Review"} />
            <MiniStatus icon={HeartPulse} label="Recovery" value={`${report.scores.recovery_readiness} / 100`} detail={report.scores.recovery_readiness >= 85 ? "Good" : "Review"} />
          </div>

          <div className="wallet-context-list" aria-label="Wallet context">
            <span className="eyebrow">Wallet context</span>
            <ContextLine icon={WalletCards} label="Wallet mode" value="Pre-sign only" />
            <ContextLine icon={Database} label="Storage" value="Local metadata" />
            <ContextLine icon={ShieldCheck} label="Known provenance" value={`${knownProvenanceCount} ${knownProvenanceCount === 1 ? "coin" : "coins"}`} />
            <ContextLine icon={CircleGauge} label="Unknown provenance" value={`${unknownCount} ${unknownCount === 1 ? "coin" : "coins"}`} />
            <ContextLine icon={Search} label="Descriptors" value={`${report.descriptors.length} tracked`} />
            <ContextLine icon={MapPin} label="Derived addresses" value={`${report.derived_addresses.length} scanned`} />
          </div>

          <p className="wallet-operational-note">All systems operational <span aria-hidden="true" /></p>
        </section>

        <section className={`cockpit-panel next-action-panel next-action-${posture.severity}`} aria-label="Next required action">
          <span className="eyebrow">Next required action</span>
          <AlertTriangle size={44} strokeWidth={1.7} aria-hidden="true" />
          <h2>{posture.label}</h2>
          <div className="next-action-driver">
            <span className="eyebrow">Primary driver</span>
            <strong>{posture.driver}</strong>
          </div>
          <p>{posture.nextAction}</p>
          <button
            type="button"
            className="primary-button next-action-button"
            onClick={revealSafestNextStep}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                revealSafestNextStep();
              }
            }}
          >
            Open highlighted action <ArrowRight size={22} />
          </button>
        </section>
      </section>

      <section className="instrument-band" aria-label="Wallet posture instruments">
        <InstrumentTile
          icon={Coins}
          label="Balance"
          value={satsToBtc(report.totals.balance_sats)}
          detail={`${report.totals.utxo_count} UTXOs`}
          onOpenEvidence={() => setActiveEvidence(buildInstrumentEvidence(report, "balance"))}
        />
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
        <InstrumentTile
          icon={Eye}
          label="Backend"
          value={`${report.backend_privacy.score}/100`}
          detail={backendLabel(report.wallet.backend)}
          onOpenEvidence={() => setActiveEvidence(buildInstrumentEvidence(report, "backend"))}
        />
      </section>

      <section className="cockpit-panel triage-panel" aria-label="Action center">
        <div className="triage-heading">
          <div>
            <span className="eyebrow">Triage inbox</span>
            <p>Review the highest-impact actions first.</p>
          </div>
          <StatusPill label={topActions.length ? "ranked by risk" : "clear"} tone={topActions.length ? "warn" : "good"} />
        </div>
        {topActions.length ? (
          <>
            <div className="triage-table" role="table" aria-label="Ranked action center">
              <div className="triage-table-head" role="row">
                <span role="columnheader">Priority</span>
                <span role="columnheader">Review item</span>
                <span role="columnheader">Next step</span>
                <span role="columnheader" className="triage-action-header">Action</span>
              </div>
              <div className="triage-table-body">
                {topActions.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    highlighted={highlightedActionId === action.id}
                    onNavigate={onNavigate}
                    onDismissAction={onDismissAction}
                  />
                ))}
              </div>
            </div>
            <p className="triage-count">Showing {topActions.length} of {topActions.length} items</p>
          </>
        ) : (
          <p className="empty-state">No active operational actions. Keep labels and recovery metadata current.</p>
        )}
      </section>
      <EvidenceDrawer item={activeEvidence} onClose={() => setActiveEvidence(null)} />
    </main>
  );
}

function MiniStatus({
  icon: Icon,
  label,
  value,
  detail
}: {
  icon: typeof ShieldAlert;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="mini-status">
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{detail}</em>
    </div>
  );
}

function ContextLine({
  icon: Icon,
  label,
  value
}: {
  icon: typeof ShieldAlert;
  label: string;
  value: string;
}) {
  return (
    <div className="context-line">
      <Icon size={19} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

function buildRiskPosture(report: WalletReport, topAction: CockpitActionItem | null, urgentCount: number): RiskPosture {
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
    label: urgentCount ? "Elevated review required" : "Preflight ready",
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
  highlighted,
  onNavigate,
  onDismissAction
}: {
  action: CockpitActionItem;
  highlighted: boolean;
  onNavigate: (page: string) => void;
  onDismissAction: (actionId: string) => void;
}) {
  const dismissActionId = action.dismissActionId;

  return (
    <article id={actionDomId(action.id)} className={`triage-row triage-row-${action.severity} ${highlighted ? "action-card-highlight" : ""}`} role="row">
      <div className="triage-priority" role="cell">
        <span>{humanize(action.severity)}</span>
      </div>
      <div className="triage-review-item" role="cell">
        <h3>{action.title}</h3>
        <p>{action.summary}</p>
        <div className="triage-meta">
          <span>{humanize(action.confidence)} confidence</span>
          <span>{affectedCoinText(action.affectedCount)}</span>
          {action.source === "guided" ? <span>Guided op</span> : null}
        </div>
      </div>
      <div className="triage-next-step" role="cell">
        <p>{action.recommendedAction}</p>
      </div>
      <div className="triage-row-actions" role="cell">
        <button type="button" className="secondary-button triage-open-button" onClick={() => onNavigate(action.ctaPage)}>
          Open review <ArrowRight size={16} />
        </button>
        {dismissActionId ? (
          <button type="button" className="icon-button action-dismiss" onClick={() => onDismissAction(dismissActionId)} aria-label={`Dismiss ${action.title}`}>
            <X size={14} />
          </button>
        ) : null}
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

