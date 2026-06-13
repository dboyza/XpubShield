import { FileSearch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { analyzePsbt } from "../api/tauri";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import { RiskBadge } from "../components/RiskBadge";
import { StatusPill } from "../components/StatusPill";
import { WorkflowGuide } from "../components/WorkflowGuide";
import { compactSats, humanize, txidPrefix } from "../lib/format";
import type { EvidenceItem } from "../lib/ops";
import { analyzePsbtText, examplePsbtFixture, type PsbtAnalysisResult } from "../lib/phase3";
import type { WalletReport } from "../types/domain";

interface PsbtLinterProps {
  report: WalletReport;
}

export function PsbtLinter({ report }: PsbtLinterProps) {
  const [input, setInput] = useState("");
  const fallbackAnalysis = useMemo(() => analyzePsbtText(input, report), [input, report]);
  const [backendAnalysis, setBackendAnalysis] = useState<PsbtAnalysisResult | null>(null);
  const [activeEvidence, setActiveEvidence] = useState<EvidenceItem | null>(null);
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
          <p className="page-header-copy">Review a ready-to-sign transaction before a signer touches it.</p>
        </div>
        <StatusPill label="No signing" tone="good" />
      </section>

      <WorkflowGuide
        title="Review a ready-to-sign transaction"
        purpose="Paste a PSBT, inspect inputs, outputs, fee, and change, then review warnings before external signing."
        when="Use this after a wallet or coordinator has produced a PSBT but before a hardware signer or signing wallet approves it."
        nextAction="Paste the PSBT or load the example, then resolve any warning before signing elsewhere."
      />

      <section className="simulator-grid">
        <div className="panel">
          <div className="panel-heading">
            <h2>Paste PSBT</h2>
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
            <h2>Transaction summary</h2>
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
        <details className="advanced-section panel" open={analysis.inputs.length > 0}>
          <summary>
            <span>Input details</span>
            <small>{analysis.inputs.length} inputs</small>
          </summary>
          <div className="stress-list workflow-detail-body">
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
        </details>

        <details className="advanced-section panel" open={analysis.outputs.length > 0}>
          <summary>
            <span>Output details</span>
            <small>{analysis.outputs.length} outputs</small>
          </summary>
          <div className="stress-list workflow-detail-body">
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
        </details>
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
                <div className="risk-meta">
                  <span>{warning.recommendedAction}</span>
                  <button
                    type="button"
                    className="ghost-button evidence-link"
                    onClick={() =>
                      setActiveEvidence({
                        id: `psbt:${warning.id}`,
                        title: warning.title,
                        severity: warning.severity,
                        confidence: warning.confidence,
                        why: warning.explanation,
                        action: warning.recommendedAction,
                        evidence: [
                          `Format: ${humanize(analysis.format)}`,
                          `Inputs: ${analysis.inputs.length}`,
                          `Outputs: ${analysis.outputs.length}`,
                          `Change detected: ${analysis.changeDetected ? "yes" : "no"}`,
                          `Fee rate: ${analysis.feeRate === undefined ? "unknown" : `${analysis.feeRate.toFixed(1)} sats/vB`}`
                        ],
                        affectedCount: analysis.inputs.length + analysis.outputs.length
                      })
                    }
                  >
                    Evidence
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No lint warnings for the current input. This does not prove the PSBT is safe.</p>
        )}
      </section>
      <EvidenceDrawer item={activeEvidence} onClose={() => setActiveEvidence(null)} />
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
