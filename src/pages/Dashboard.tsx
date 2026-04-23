import {
  Activity,
  AlertTriangle,
  Banknote,
  CircleGauge,
  Eye,
  HardDrive,
  ListChecks,
  ShieldCheck,
  Wallet
} from "lucide-react";
import { MetricCard } from "../components/MetricCard";
import { RiskBadge } from "../components/RiskBadge";
import { StatusPill } from "../components/StatusPill";
import { backendLabel, compactSats, humanize, satsToBtc, severityRank } from "../lib/format";
import type { AuditFinding, WalletReport } from "../types/domain";

interface DashboardProps {
  report: WalletReport;
}

export function Dashboard({ report }: DashboardProps) {
  const findings = [...report.findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const topFindings = findings.slice(0, 5);

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p>{backendLabel(report.wallet.backend)} · {humanize(report.wallet.network)}</p>
          <h1>{report.wallet.name}</h1>
        </div>
        <StatusPill
          label={report.wallet.descriptor_based ? "Descriptor identity" : "Bare xpub identity"}
          tone={report.wallet.descriptor_based ? "good" : "warn"}
        />
      </section>

      <section className="metric-grid">
        <MetricCard
          icon={Wallet}
          label="Total balance"
          value={satsToBtc(report.totals.balance_sats)}
          detail={`${compactSats(report.totals.balance_sats)} sats`}
        />
        <MetricCard
          icon={Activity}
          label="UTXOs"
          value={String(report.totals.utxo_count)}
          detail={`Largest ${satsToBtc(report.totals.largest_utxo_sats)}`}
        />
        <MetricCard
          icon={ShieldCheck}
          label="Privacy score"
          value={`${report.scores.privacy}/100`}
          score={report.scores.privacy}
        />
        <MetricCard
          icon={Banknote}
          label="Fee efficiency"
          value={`${report.scores.fee_efficiency}/100`}
          score={report.scores.fee_efficiency}
        />
        <MetricCard
          icon={ListChecks}
          label="Operational clarity"
          value={`${report.scores.operational_clarity}/100`}
          score={report.scores.operational_clarity}
        />
        <MetricCard
          icon={CircleGauge}
          label="Spend readiness"
          value={`${report.scores.spend_readiness}/100`}
          score={report.scores.spend_readiness}
        />
        <MetricCard
          icon={HardDrive}
          label="Recovery readiness"
          value={`${report.scores.recovery_readiness}/100`}
          score={report.scores.recovery_readiness}
        />
        <MetricCard
          icon={Eye}
          label="Backend privacy"
          value={`${report.backend_privacy.score}/100`}
          detail={report.backend_privacy.summary}
          score={report.backend_privacy.score}
        />
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <h2>Findings</h2>
            <StatusPill label={`${report.findings.length} active`} tone={report.findings.length ? "warn" : "good"} />
          </div>
          <div className="finding-list">
            {topFindings.map((finding) => (
              <FindingRow key={finding.id} finding={finding} />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Wallet shape</h2>
            <StatusPill label={`Gap ${report.wallet.gap_limit}`} />
          </div>
          <div className="shape-list">
            <ShapeRow label="Smallest UTXO" value={satsToBtc(report.totals.smallest_utxo_sats)} />
            <ShapeRow label="Largest UTXO" value={satsToBtc(report.totals.largest_utxo_sats)} />
            <ShapeRow label="Descriptors" value={String(report.descriptors.length)} />
            <ShapeRow label="Derived addresses" value={String(report.derived_addresses.length)} />
            <ShapeRow label="Transactions" value={String(report.transactions.length)} />
          </div>
        </div>
      </section>
    </main>
  );
}

function FindingRow({ finding }: { finding: AuditFinding }) {
  return (
    <article className="finding-row">
      <div className="finding-title">
        <RiskBadge severity={finding.severity} />
        <strong>{finding.title}</strong>
      </div>
      <p>{finding.explanation}</p>
      <span>{finding.recommended_action}</span>
    </article>
  );
}

function ShapeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="shape-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
