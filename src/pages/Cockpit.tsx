import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CircleGauge,
  Coins,
  Eye,
  Fingerprint,
  HeartPulse,
  ShieldAlert,
  ShieldCheck,
  X
} from "lucide-react";
import { useState } from "react";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import { StatusPill } from "../components/StatusPill";
import { backendLabel, humanize, satsToBtc, severityRank } from "../lib/format";
import type { EvidenceItem } from "../lib/ops";
import { AlertSignalPanel } from "./Alerts";
import type { ActionItem, Severity, WalletReport } from "../types/domain";

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

export function Cockpit({ report, onNavigate, onDismissAction }: CockpitProps) {
  const [actionCenterOpen, setActionCenterOpen] = useState(true);
  const [readinessOpen, setReadinessOpen] = useState(true);
  const [activeEvidence, setActiveEvidence] = useState<EvidenceItem | null>(null);
  const topActions = [...report.actions].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const topAction = topActions[0] ?? null;
  const urgentCount = topActions.filter((action) => ["high", "critical"].includes(action.severity)).length;
  const unknownCount = report.provenance_summary.unknown_count;
  const exchangeCount = report.provenance_summary.exchange_like_count;
  const posture = buildRiskPosture(report, topAction, urgentCount);

  return (
    <main className="page-shell cockpit-shell">
      <section className="page-header cockpit-hero">
        <div>
          <p>{backendLabel(report.wallet.backend)} · {humanize(report.wallet.network)} · pre-sign / local</p>
          <h1>Bitcoin security cockpit</h1>
        </div>
        <div className="cockpit-command">
          <div className={`cockpit-command-signal ${urgentCount ? "cockpit-command-danger" : "cockpit-command-clear"}`}>
            <span>Urgent reviews</span>
            <strong>{urgentCount}</strong>
          </div>
          <div className={`cockpit-command-signal ${report.actions.length ? "cockpit-command-warn" : "cockpit-command-clear"}`}>
            <span>Active actions</span>
            <strong>{report.actions.length}</strong>
          </div>
        </div>
      </section>

      <section className={`risk-posture-panel risk-posture-${posture.severity}`} aria-label="Wallet risk posture">
        <div className="risk-posture-main">
          <span className="eyebrow">Risk Posture</span>
          <h2>{posture.label}</h2>
          <p>{posture.summary}</p>
          <div className="risk-driver">
            <span>Top driver</span>
            <strong>{posture.driver}</strong>
          </div>
        </div>
        <div className="risk-score-card" aria-label={`Posture score ${posture.score} out of 100`}>
          <strong>{posture.score}</strong>
          <span>posture score</span>
        </div>
        <div className="risk-next-step">
          <span>{humanize(posture.confidence)} confidence · {affectedCoinText(posture.affectedCount)}</span>
          <p>{posture.nextAction}</p>
          <button type="button" className="primary-button" onClick={() => onNavigate(posture.ctaPage)}>
            Open safest next step <ArrowRight size={16} />
          </button>
        </div>
      </section>

      <section className="instrument-band" aria-label="Wallet posture instruments">
        <InstrumentTile icon={Coins} label="Balance" value={satsToBtc(report.totals.balance_sats)} detail={`${report.totals.utxo_count} UTXOs`} onOpenEvidence={() => setActiveEvidence(buildInstrumentEvidence(report, "balance"))} />
        <InstrumentTile icon={ShieldCheck} label="Privacy" value={`${report.scores.privacy}/100`} detail="wallet posture" onOpenEvidence={() => setActiveEvidence(buildInstrumentEvidence(report, "privacy"))} />
        <InstrumentTile icon={CircleGauge} label="Spend" value={`${report.scores.spend_readiness}/100`} detail="readiness" onOpenEvidence={() => setActiveEvidence(buildInstrumentEvidence(report, "spend"))} />
        <InstrumentTile icon={HeartPulse} label="Recovery" value={`${report.scores.recovery_readiness}/100`} detail="drill posture" onOpenEvidence={() => setActiveEvidence(buildInstrumentEvidence(report, "recovery"))} />
        <InstrumentTile icon={Fingerprint} label="Provenance" value={`${report.provenance_summary.assessed_count - unknownCount}/${report.provenance_summary.assessed_count}`} detail={`${exchangeCount} exchange-like`} onOpenEvidence={() => setActiveEvidence(buildInstrumentEvidence(report, "provenance"))} />
        <InstrumentTile icon={Eye} label="Backend" value={`${report.backend_privacy.score}/100`} detail={backendLabel(report.wallet.backend)} onOpenEvidence={() => setActiveEvidence(buildInstrumentEvidence(report, "backend"))} />
      </section>

      <section className="cockpit-grid risk-led-grid">
        <div className="panel action-center-panel">
          <div className="panel-heading">
            <h2>Action Center</h2>
            <div className="panel-heading-actions">
              <StatusPill label="ranked by risk" tone={topActions.length ? "warn" : "good"} />
              <button
                type="button"
                className="ghost-button collapse-button"
                onClick={() => setActionCenterOpen((current) => !current)}
                aria-expanded={actionCenterOpen}
              >
                {actionCenterOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {actionCenterOpen ? "Collapse" : "Show"}
              </button>
            </div>
          </div>
          {actionCenterOpen && topActions.length ? (
            <div className="action-center-list">
              {topActions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  onNavigate={onNavigate}
                  onDismissAction={onDismissAction}
                />
              ))}
            </div>
          ) : null}
          {actionCenterOpen && !topActions.length ? (
            <p className="empty-state">No active operational actions. Keep labels and recovery metadata current.</p>
          ) : null}
        </div>

        <div className="cockpit-support-stack">
          <section className="panel cockpit-briefing">
            <div className="panel-heading">
              <h2>Readiness Summary</h2>
              <div className="panel-heading-actions">
                <StatusPill label="closed beta" tone="warn" />
                <button
                  type="button"
                  className="ghost-button collapse-button"
                  onClick={() => setReadinessOpen((current) => !current)}
                  aria-expanded={readinessOpen}
                >
                  {readinessOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {readinessOpen ? "Collapse" : "Show"}
                </button>
              </div>
            </div>
            {readinessOpen ? (
              <>
                <div className="briefing-grid">
                  <BriefingChip label="Wallet mode" value="pre-sign only" />
                  <BriefingChip label="Storage" value="local metadata" />
                  <BriefingChip label="Known provenance" value={`${report.provenance_summary.assessed_count - unknownCount} coins`} />
                  <BriefingChip label="Unknown provenance" value={`${unknownCount} coins`} />
                  <BriefingChip label="Descriptors" value={`${report.descriptors.length} tracked`} />
                  <BriefingChip label="Derived addresses" value={`${report.derived_addresses.length} scanned`} />
                </div>
                <div className="button-row">
                  <button type="button" className="secondary-button" onClick={() => onNavigate("utxos")}>
                    Open Workbench <ArrowRight size={16} />
                  </button>
                  <button type="button" className="secondary-button" onClick={() => onNavigate("spend_preflight")}>
                    Run Preflight <ArrowRight size={16} />
                  </button>
                </div>
              </>
            ) : null}
          </section>

          <AlertSignalPanel report={report} />
        </div>
      </section>
      <EvidenceDrawer item={activeEvidence} onClose={() => setActiveEvidence(null)} />
    </main>
  );
}

function buildRiskPosture(report: WalletReport, topAction: ActionItem | null, urgentCount: number): RiskPosture {
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
      nextAction: topAction.recommended_action,
      confidence: topAction.confidence_level,
      affectedCount: topAction.affected_utxos.length,
      ctaPage: topAction.cta_page
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

function ActionCard({
  action,
  onNavigate,
  onDismissAction
}: {
  action: ActionItem;
  onNavigate: (page: string) => void;
  onDismissAction: (actionId: string) => void;
}) {
  return (
    <article className={`action-card action-card-${action.severity}`}>
      <div className="action-card-topline">
        <div className="finding-title">
          <span className={`action-severity-text action-severity-${action.severity}`}>{humanize(action.severity)}</span>
          <span>{humanize(action.confidence_level)} confidence</span>
        </div>
        <button type="button" className="icon-button action-dismiss" onClick={() => onDismissAction(action.id)} aria-label={`Dismiss ${action.title}`}>
          <X size={14} />
        </button>
      </div>
      <div className="action-card-copy">
        <div>
          <h3>{action.title}</h3>
          <p>{action.summary}</p>
        </div>
        <div className="action-card-detail">
          <strong>Next</strong>
          <span>{action.recommended_action}</span>
        </div>
      </div>
      <div className="action-card-footer">
        <span>{affectedCoinText(action.affected_utxos.length)}</span>
        <button type="button" className="secondary-button" onClick={() => onNavigate(action.cta_page)}>
          Open module <ArrowRight size={15} />
        </button>
      </div>
    </article>
  );
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

function BriefingChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="briefing-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
