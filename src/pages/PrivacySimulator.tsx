import { Eye, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { RiskBadge } from "../components/RiskBadge";
import { StatusPill } from "../components/StatusPill";
import { categoryLabel, compactSats, humanize, satsToBtc, txidPrefix } from "../lib/format";
import { analyzePrivacySelection } from "../lib/phase2";
import type { WalletReport } from "../types/domain";

interface PrivacySimulatorProps {
  report: WalletReport;
}

export function PrivacySimulator({ report }: PrivacySimulatorProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const selectedUtxos = useMemo(
    () => report.utxos.filter((utxo) => selected.includes(utxo.outpoint)),
    [report.utxos, selected]
  );
  const risks = useMemo(() => analyzePrivacySelection(selectedUtxos), [selectedUtxos]);
  const selectedAmount = selectedUtxos.reduce((sum, utxo) => sum + utxo.amount_sats, 0);

  function toggle(outpoint: string) {
    setSelected((current) =>
      current.includes(outpoint) ? current.filter((item) => item !== outpoint) : [...current, outpoint]
    );
  }

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p>{report.wallet.name}</p>
          <h1>What does the chain know?</h1>
        </div>
        <StatusPill label={`${selected.length} selected`} tone={selected.length ? "warn" : "neutral"} />
      </section>

      <section className="simulator-grid">
        <div className="panel">
          <div className="panel-heading">
            <h2>Select UTXOs</h2>
            <StatusPill label={satsToBtc(selectedAmount)} />
          </div>
          <div className="utxo-pick-list">
            {report.utxos.map((utxo) => (
              <label className="utxo-pick-row" key={utxo.outpoint}>
                <input
                  type="checkbox"
                  checked={selected.includes(utxo.outpoint)}
                  onChange={() => toggle(utxo.outpoint)}
                />
                <span>
                  <strong>{satsToBtc(utxo.amount_sats)}</strong>
                  {utxo.label ?? "Unlabeled"} · {categoryLabel(utxo.source_category)} · {txidPrefix(utxo.txid)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Observer inference</h2>
            <ShieldAlert size={18} aria-hidden="true" />
          </div>
          {risks.length ? (
            <div className="risk-list">
              {risks.map((risk) => (
                <article className="risk-card" key={risk.id}>
                  <div className="finding-title">
                    <RiskBadge severity={risk.level === "high" ? "high" : risk.level === "medium" ? "medium" : "low"} />
                    <strong>{risk.title}</strong>
                  </div>
                  <p>{risk.explanation}</p>
                  <div className="risk-meta">
                    <span>Confidence: {humanize(risk.confidence)}</span>
                    <span>Affected: {risk.affectedOutpoints.length}</span>
                  </div>
                  <span>{risk.suggestedAlternative}</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Eye size={22} aria-hidden="true" />
              Select one or more UTXOs to simulate what a chain observer could infer.
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Selection summary</h2>
          <StatusPill label={`${compactSats(selectedAmount)} sats`} />
        </div>
        <p className="plain-text">
          This simulator does not create, sign, or broadcast a transaction. It only evaluates selected
          wallet metadata and deterministic heuristics.
        </p>
      </section>
    </main>
  );
}
