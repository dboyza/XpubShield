import {
  ArrowRight,
  BellRing,
  CircleGauge,
  Coins,
  Eye,
  Fingerprint,
  ShieldCheck,
  X
} from "lucide-react";
import { MetricCard } from "../components/MetricCard";
import { RiskBadge } from "../components/RiskBadge";
import { StatusPill } from "../components/StatusPill";
import { backendLabel, compactSats, humanize, satsToBtc, severityRank } from "../lib/format";
import type { ActionItem, WalletReport } from "../types/domain";

interface CockpitProps {
  report: WalletReport;
  onNavigate: (page: string) => void;
  onDismissAction: (actionId: string) => void;
}

export function Cockpit({ report, onNavigate, onDismissAction }: CockpitProps) {
  const topActions = [...report.actions].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const urgentCount = topActions.filter((action) => ["high", "critical"].includes(action.severity)).length;
  const unknownCount = report.provenance_summary.unknown_count;
  const exchangeCount = report.provenance_summary.exchange_like_count;

  return (
    <main className="page-shell cockpit-shell">
      <section className="page-header cockpit-hero">
        <div>
          <p>{backendLabel(report.wallet.backend)} · {humanize(report.wallet.network)} · preflight only</p>
          <h1>Bitcoin security cockpit</h1>
        </div>
        <div className="cockpit-command">
          <StatusPill label={`${urgentCount} urgent`} tone={urgentCount ? "bad" : "good"} />
          <StatusPill label={`${report.actions.length} actions`} tone={report.actions.length ? "warn" : "good"} />
        </div>
      </section>

      <section className="cockpit-status-strip" aria-label="Operational status">
        <SignalTile label="Backend" value={backendLabel(report.wallet.backend)} />
        <SignalTile label="Network" value={humanize(report.wallet.network)} />
        <SignalTile label="Provenance" value={`${report.provenance_summary.assessed_count - unknownCount}/${report.provenance_summary.assessed_count} known`} />
        <SignalTile label="Source risk" value={`${exchangeCount} exchange-like`} />
      </section>

      <section className="metric-grid cockpit-metrics">
        <MetricCard icon={Coins} label="Balance under watch" value={satsToBtc(report.totals.balance_sats)} detail={`${report.totals.utxo_count} UTXOs`} />
        <MetricCard icon={ShieldCheck} label="Privacy posture" value={`${report.scores.privacy}/100`} score={report.scores.privacy} />
        <MetricCard icon={CircleGauge} label="Spend readiness" value={`${report.scores.spend_readiness}/100`} score={report.scores.spend_readiness} />
        <MetricCard icon={Eye} label="Backend privacy" value={`${report.backend_privacy.score}/100`} score={report.backend_privacy.score} />
        <MetricCard icon={Fingerprint} label="Known provenance" value={`${report.provenance_summary.assessed_count - unknownCount}/${report.provenance_summary.assessed_count}`} detail={`${report.provenance_summary.exchange_like_count} exchange-like`} />
        <MetricCard icon={BellRing} label="Operator attention" value={String(report.actions.length)} detail={`${compactSats(report.totals.smallest_utxo_sats)} sats smallest`} />
      </section>

      <section className="cockpit-grid">
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

        <div className="panel cockpit-briefing">
          <div className="panel-heading">
            <h2>Operator Briefing</h2>
            <StatusPill label="local only" tone="good" />
          </div>
          <div className="briefing-grid">
            <BriefingChip label="Manual provenance" value={`${report.provenance_summary.manual_count} coins`} />
            <BriefingChip label="Registry evidence" value={`${report.provenance_summary.registry_count} coins`} />
            <BriefingChip label="Unknown provenance" value={`${report.provenance_summary.unknown_count} coins`} />
            <BriefingChip label="Findings" value={`${report.findings.length} active`} />
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
        </div>
      </section>
    </main>
  );
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
          <RiskBadge severity={action.severity} />
          <StatusPill label={humanize(action.confidence_level)} />
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
        <span>{action.affected_utxos.length ? `${action.affected_utxos.length} affected coins` : "wallet-level action"}</span>
        <button type="button" className="secondary-button" onClick={() => onNavigate(action.cta_page)}>
          Open module <ArrowRight size={15} />
        </button>
      </div>
    </article>
  );
}

function SignalTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="signal-tile">
      <span>{label}</span>
      <strong>{value}</strong>
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
