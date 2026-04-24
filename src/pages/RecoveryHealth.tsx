import { Download, FileJson, HeartPulse } from "lucide-react";
import { useMemo } from "react";
import { MetricCard } from "../components/MetricCard";
import { StatusPill } from "../components/StatusPill";
import { humanize } from "../lib/format";
import { buildRecoveryHealth } from "../lib/phase3";
import type { WalletReport } from "../types/domain";

interface RecoveryHealthProps {
  report: WalletReport;
}

export function RecoveryHealth({ report }: RecoveryHealthProps) {
  const health = useMemo(() => buildRecoveryHealth(report), [report]);

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p>{report.wallet.name}</p>
          <h1>Recovery health</h1>
        </div>
        <StatusPill label="Local report" tone="good" />
      </section>

      <section className="metric-grid">
        <MetricCard icon={HeartPulse} label="Recovery score" value={`${health.score}/100`} score={health.score} />
        <MetricCard icon={FileJson} label="Descriptors" value={String(report.descriptors.length)} />
      </section>

      <section className="button-row">
        <button type="button" className="secondary-button" onClick={() => downloadText("xpubshield-recovery-report.md", health.markdown)}>
          <Download size={17} /> Markdown
        </button>
        <button type="button" className="secondary-button" onClick={() => downloadText("xpubshield-recovery-report.json", health.json)}>
          <Download size={17} /> JSON
        </button>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <h2>Metadata</h2>
            <StatusPill label={`${health.fields.length} fields`} />
          </div>
          <div className="shape-list">
            {health.fields.map((field) => (
              <div className="shape-row" key={field.label}>
                <span>{field.label}</span>
                <strong>{field.value}</strong>
                <StatusPill label={humanize(field.status)} tone={field.status === "bad" ? "bad" : field.status === "warn" ? "warn" : "good"} />
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Warnings</h2>
            <StatusPill label={`${health.warnings.length} items`} tone={health.warnings.length ? "warn" : "good"} />
          </div>
          {health.warnings.length ? (
            <div className="finding-list">
              {health.warnings.map((warning) => (
                <article className="finding-row" key={warning}>
                  <strong>{warning}</strong>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No major recovery metadata warnings.</p>
          )}
        </div>
      </section>
    </main>
  );
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
