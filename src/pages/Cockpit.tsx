import {
  ArrowRight,
  CircleGauge,
  Coins,
  Eye,
  Fingerprint,
  HeartPulse,
  ShieldAlert,
  ShieldCheck,
  X
} from "lucide-react";
import { StatusPill } from "../components/StatusPill";
import { backendLabel, humanize, satsToBtc, severityRank } from "../lib/format";
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
          <StatusPill label={`${urgentCount} urgent`} tone={urgentCount ? "bad" : "good"} />
          <StatusPill label={`${report.actions.length} actions`} tone={report.actions.length ? "warn" : "good"} />
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
        <InstrumentTile icon={Coins} label="Balance" value={satsToBtc(report.totals.balance_sats)} detail={`${report.totals.utxo_count} UTXOs`} />
        <InstrumentTile icon={ShieldCheck} label="Privacy" value={`${report.scores.privacy}/100`} detail="wallet posture" />
        <InstrumentTile icon={CircleGauge} label="Spend" value={`${report.scores.spend_readiness}/100`} detail="readiness" />
        <InstrumentTile icon={HeartPulse} label="Recovery" value={`${report.scores.recovery_readiness}/100`} detail="drill posture" />
        <InstrumentTile icon={Fingerprint} label="Provenance" value={`${report.provenance_summary.assessed_count - unknownCount}/${report.provenance_summary.assessed_count}`} detail={`${exchangeCount} exchange-like`} />
        <InstrumentTile icon={Eye} label="Backend" value={`${report.backend_privacy.score}/100`} detail={backendLabel(report.wallet.backend)} />
      </section>

      <section className="cockpit-grid risk-led-grid">
        <div className="panel action-center-panel">
          <div className="panel-heading">
            <h2>Action Center</h2>
            <StatusPill label="ranked by risk" tone={topActions.length ? "warn" : "good"} />
          </div>
          {topActions.length ? (
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
          ) : (
            <p className="empty-state">No active operational actions. Keep labels and recovery metadata current.</p>
          )}
        </div>

        <div className="cockpit-support-stack">
          <section className="panel cockpit-briefing">
            <div className="panel-heading">
              <h2>Readiness Summary</h2>
              <StatusPill label="closed beta" tone="warn" />
            </div>
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
          </section>

          <AlertSignalPanel report={report} />
        </div>
      </section>
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

function InstrumentTile({
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
    <div className="instrument-tile">
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
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
