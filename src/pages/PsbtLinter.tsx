import { FileSearch, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { analyzePsbt } from "../api/tauri";
import { RiskBadge } from "../components/RiskBadge";
import { StatusPill } from "../components/StatusPill";
import { compactSats, humanize, txidPrefix } from "../lib/format";
import { analyzePsbtText, examplePsbtFixture, type PsbtAnalysisResult } from "../lib/phase3";
import type { WalletReport } from "../types/domain";

interface PsbtLinterProps {
  report: WalletReport;
}

export function PsbtLinter({ report }: PsbtLinterProps) {
  const [input, setInput] = useState("");
  const fallbackAnalysis = useMemo(() => analyzePsbtText(input, report), [input, report]);
  const [backendAnalysis, setBackendAnalysis] = useState<PsbtAnalysisResult | null>(null);
  const analysis = backendAnalysis ?? fallbackAnalysis;

  useEffect(() => {
    const trimmed = input.trim();
    if (!isRawPsbtEnvelope(trimmed)) {
      setBackendAnalysis(null);
      return;
    }

    let cancelled = false;
    analyzePsbt(trimmed)
      .then((result) => {
        if (!cancelled) setBackendAnalysis(result);
      })
      .catch(() => {
        if (!cancelled) setBackendAnalysis(null);
      });
    return () => {
      cancelled = true;
    };
  }, [input]);

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p>{report.wallet.name}</p>
          <h1>PSBT preflight</h1>
        </div>
        <StatusPill label="No signing" tone="good" />
      </section>

      <section className="privacy-warning">
        <ShieldAlert size={20} aria-hidden="true" />
        <div>
          <strong>Local review only</strong>
          <p>
            This module never signs or broadcasts. Raw PSBT envelopes are parsed locally where
            possible, then checked against wallet labels, provenance, change, and fee assumptions.
          </p>
        </div>
      </section>

      <section className="simulator-grid">
        <div className="panel">
          <div className="panel-heading">
            <h2>Import PSBT for review</h2>
            <button type="button" className="secondary-button" onClick={() => setInput(examplePsbtFixture(report))}>
              <FileSearch size={16} /> Example
            </button>
          </div>
          <label>
            PSBT text or mock fixture
            <textarea
              rows={18}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Paste a base64 PSBT beginning with cHNidP8, hex PSBT beginning with 70736274ff, or the local JSON fixture format."
            />
          </label>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Analysis</h2>
            <StatusPill label={humanize(analysis.format)} tone={analysis.format === "json_fixture" ? "good" : "warn"} />
          </div>
          <div className="shape-list">
            <SummaryRow label="Inputs" value={String(analysis.inputs.length)} />
            <SummaryRow label="Outputs" value={String(analysis.outputs.length)} />
            <SummaryRow label="Fee" value={analysis.feeSats === undefined ? "Unknown" : `${compactSats(analysis.feeSats)} sats`} />
            <SummaryRow label="Fee rate" value={analysis.feeRate === undefined ? "Unknown" : `${analysis.feeRate.toFixed(1)} sats/vB`} />
            <SummaryRow label="Change detected" value={analysis.changeDetected ? "Yes" : "No"} />
          </div>
          <p className="plain-text">{analysis.summary}</p>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <h2>Inputs</h2>
            <StatusPill label={`${analysis.inputs.length} inputs`} />
          </div>
          <div className="stress-list">
            {analysis.inputs.map((input) => (
              <article className="stress-item" key={input.outpoint}>
                <div>
                  <strong>{input.outpoint.includes(":") ? txidPrefix(input.outpoint.split(":")[0]) : input.outpoint}</strong>
                  <span>{input.walletUtxo?.label ?? "Unknown wallet input"} · {input.script_type ?? input.walletUtxo?.script_type ?? "unknown"}</span>
                </div>
                <span>{input.amount_sats === undefined ? "amount unknown" : `${compactSats(input.amount_sats)} sats`}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Outputs</h2>
            <StatusPill label={`${analysis.outputs.length} outputs`} />
          </div>
          <div className="stress-list">
            {analysis.outputs.map((output) => (
              <article className="stress-item" key={`${output.address}:${output.amount_sats}`}>
                <div>
                  <strong>{humanize(output.kind)}</strong>
                  <span>{output.address}</span>
                </div>
                <span>{compactSats(output.amount_sats)} sats</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
            <h2>Preflight warnings</h2>
          <StatusPill label={`${analysis.warnings.length} items`} tone={analysis.warnings.length ? "warn" : "good"} />
        </div>
        {analysis.warnings.length ? (
          <div className="risk-list">
            {analysis.warnings.map((warning) => (
              <article className="risk-card" key={warning.id}>
                <div className="finding-title">
                  <RiskBadge severity={warning.severity} />
                  <strong>{warning.title}</strong>
                </div>
                <p>{warning.explanation}</p>
                <span>{warning.recommendedAction}</span>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No lint warnings for the current input. This does not prove the PSBT is safe.</p>
        )}
      </section>
    </main>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="shape-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function isRawPsbtEnvelope(input: string): boolean {
  return input.startsWith("cHNidP8") || /^70736274ff/i.test(input.replace(/\s/g, ""));
}
