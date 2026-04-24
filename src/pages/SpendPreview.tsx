import { Calculator, CircleDollarSign, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { MetricCard } from "../components/MetricCard";
import { StatusPill } from "../components/StatusPill";
import { compactSats, humanize, satsToBtc, txidPrefix } from "../lib/format";
import { buildSpendPreview, STRESS_FEE_RATES } from "../lib/phase2";
import type { Utxo, WalletReport } from "../types/domain";

interface SpendPreviewProps {
  report: WalletReport;
}

export function SpendPreview({ report }: SpendPreviewProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [destinationAmount, setDestinationAmount] = useState("100000");
  const [feeRate, setFeeRate] = useState(25);
  const [changePolicy, setChangePolicy] = useState<"auto" | "avoid_change">("auto");
  const [singleContextOnly, setSingleContextOnly] = useState(false);

  const eligibleUtxos = useMemo(() => {
    if (!singleContextOnly || selected.length === 0) return report.utxos;
    const anchor = report.utxos.find((utxo) => utxo.outpoint === selected[0]);
    if (!anchor) return report.utxos;
    return report.utxos.filter(
      (utxo) => utxo.source_category === anchor.source_category && (utxo.label ?? "") === (anchor.label ?? "")
    );
  }, [report.utxos, selected, singleContextOnly]);

  const selectedUtxos = useMemo(
    () => report.utxos.filter((utxo) => selected.includes(utxo.outpoint)),
    [report.utxos, selected]
  );

  const preview = useMemo(
    () =>
      buildSpendPreview(
        selectedUtxos,
        report.utxos,
        Number(destinationAmount),
        feeRate,
        changePolicy
      ),
    [changePolicy, destinationAmount, feeRate, report.utxos, selectedUtxos]
  );

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
          <h1>Spend preview</h1>
        </div>
        <StatusPill label="Simulation only" tone="good" />
      </section>

      <section className="privacy-warning">
        <ShieldAlert size={20} />
        <div>
          <strong>No transaction is created</strong>
          <p>This preview estimates fee, change, and privacy effects from selected UTXOs only. It does not sign, finalize, extract, or broadcast a transaction.</p>
        </div>
      </section>

      <section className="simulator-grid">
        <div className="panel">
          <div className="panel-heading">
            <h2>Inputs</h2>
            <StatusPill label={`${selected.length} selected`} tone={selected.length ? "warn" : "neutral"} />
          </div>
          <div className="action-grid spend-controls">
            <label>
              Destination amount sats
              <input
                type="number"
                min="0"
                value={destinationAmount}
                onChange={(event) => setDestinationAmount(event.target.value)}
              />
            </label>
            <label>
              Fee rate
              <select value={feeRate} onChange={(event) => setFeeRate(Number(event.target.value))}>
                {STRESS_FEE_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate} sats/vB
                  </option>
                ))}
              </select>
            </label>
            <label>
              Change policy
              <select value={changePolicy} onChange={(event) => setChangePolicy(event.target.value as "auto" | "avoid_change")}>
                <option value="auto">Create change if economical</option>
                <option value="avoid_change">Prefer no change</option>
              </select>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={singleContextOnly}
                onChange={(event) => setSingleContextOnly(event.target.checked)}
              />
              <span>Only show UTXOs matching the first selected label/category</span>
            </label>
          </div>

          <div className="utxo-pick-list">
            {eligibleUtxos.map((utxo) => (
              <SpendPickRow key={utxo.outpoint} utxo={utxo} checked={selected.includes(utxo.outpoint)} onToggle={toggle} />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Preview</h2>
            <StatusPill label={humanize(preview.privacyRisk)} tone={preview.privacyRisk === "high" ? "bad" : preview.privacyRisk === "medium" ? "warn" : "good"} />
          </div>
          <section className="metric-grid compact-metrics">
            <MetricCard icon={CircleDollarSign} label="Input amount" value={`${compactSats(preview.inputAmountSats)} sats`} />
            <MetricCard icon={Calculator} label="Estimated fee" value={`${compactSats(preview.estimatedFeeSats)} sats`} />
            <MetricCard icon={Calculator} label="Estimated vsize" value={`${preview.estimatedVbytes} vB`} />
            <MetricCard icon={CircleDollarSign} label="Change amount" value={`${compactSats(preview.changeAmountSats)} sats`} />
          </section>

          <div className="finding-list">
            <article className="finding-row">
              <strong>{preview.createsChange ? "Change likely created" : "No economical change estimated"}</strong>
              <p>{preview.summary}</p>
            </article>
            <article className="finding-row">
              <strong>Label mixing risk: {humanize(preview.labelMixingRisk)}</strong>
              <p>This heuristic checks selected labels, source categories, and quarantine flags. It is not definitive.</p>
            </article>
            {preview.quarantineWarnings.map((warning) => (
              <article className="finding-row" key={warning}>
                <strong>Quarantine warning</strong>
                <p>{warning}</p>
              </article>
            ))}
          </div>

          <div className="panel embedded-form">
            <div className="panel-heading">
              <h2>Fee rates</h2>
              <StatusPill label="Local estimate" />
            </div>
            <div className="shape-list">
              {preview.feeCosts.map((row) => (
                <div className="shape-row" key={row.feeRate}>
                  <span>{row.feeRate} sats/vB</span>
                  <strong>{compactSats(row.estimatedFeeSats)} sats fee</strong>
                  <span>{compactSats(row.changeAmountSats)} sats change</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel embedded-form">
            <div className="panel-heading">
              <h2>Suggested alternatives</h2>
              <StatusPill label={`${preview.betterUtxoSuggestions.length} items`} />
            </div>
            <div className="finding-list">
              {preview.betterUtxoSuggestions.map((suggestion) => (
                <article className="finding-row" key={suggestion}>
                  <p>{suggestion}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function SpendPickRow({ utxo, checked, onToggle }: { utxo: Utxo; checked: boolean; onToggle: (outpoint: string) => void }) {
  return (
    <label className="utxo-pick-row">
      <input type="checkbox" checked={checked} onChange={() => onToggle(utxo.outpoint)} />
      <span>
        <strong>{satsToBtc(utxo.amount_sats)}</strong>
        <span>{txidPrefix(utxo.txid)} - {utxo.label || "Unlabeled"} - {humanize(utxo.source_category)}</span>
      </span>
    </label>
  );
}
