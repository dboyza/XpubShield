import { AlertTriangle, Banknote, BarChart3 } from "lucide-react";
import { useMemo, useState } from "react";
import { MetricCard } from "../components/MetricCard";
import { StatusPill } from "../components/StatusPill";
import { compactSats, humanize, satsToBtc, txidPrefix } from "../lib/format";
import { feePercentOfValue, stressTestUtxos, suggestedStressAction } from "../lib/phase2";
import type { WalletReport } from "../types/domain";

interface FeeStressTestProps {
  report: WalletReport;
}

export function FeeStressTest({ report }: FeeStressTestProps) {
  const rows = useMemo(
    () => stressTestUtxos(report.utxos, report.totals.balance_sats),
    [report.totals.balance_sats, report.utxos]
  );
  const [selectedRate, setSelectedRate] = useState(100);
  const selectedRow = rows.find((row) => row.feeRate === selectedRate) ?? rows[0];
  const problematic = report.utxos.filter((utxo) => selectedRow.problematicOutpoints.includes(utxo.outpoint));

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p>{report.wallet.name} · Coin Workbench lens</p>
          <h1>Fee exposure</h1>
        </div>
        <StatusPill label="Simulation only" tone="good" />
      </section>

      <section className="metric-grid">
        <MetricCard
          icon={Banknote}
          label="Wallet balance"
          value={satsToBtc(report.totals.balance_sats)}
          detail={`${compactSats(report.totals.balance_sats)} sats`}
        />
        <MetricCard
          icon={BarChart3}
          label={`Spend all at ${selectedRate} sats/vB`}
          value={`${compactSats(selectedRow.totalSpendCostSats)} sats`}
          detail={`${selectedRow.walletFeePercent.toFixed(3)}% of wallet value`}
          score={selectedRow.walletFeePercent > 2 ? 60 : 95}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Problematic UTXOs"
          value={String(selectedRow.uneconomicalCount)}
          detail={`>= 25% spend cost at ${selectedRate} sats/vB`}
          score={selectedRow.uneconomicalCount > 0 ? 62 : 96}
        />
      </section>

      <section className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Fee rate</th>
              <th>Total spend cost</th>
              <th>Wallet cost</th>
              <th>Uneconomical UTXOs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.feeRate}
                className={row.feeRate === selectedRate ? "selected-row" : ""}
                onClick={() => setSelectedRate(row.feeRate)}
              >
                <td>
                  <strong>{row.feeRate} sats/vB</strong>
                  <span>Click to inspect</span>
                </td>
                <td>{compactSats(row.totalSpendCostSats)} sats</td>
                <td>{row.walletFeePercent.toFixed(4)}%</td>
                <td>{row.uneconomicalCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Problematic at {selectedRate} sats/vB</h2>
          <StatusPill label={`${problematic.length} UTXOs`} tone={problematic.length ? "warn" : "good"} />
        </div>
        {problematic.length ? (
          <div className="stress-list">
            {problematic.map((utxo) => (
              <article className="stress-item" key={utxo.outpoint}>
                <div>
                  <strong>{satsToBtc(utxo.amount_sats)}</strong>
                  <span>{txidPrefix(utxo.txid)} · {utxo.label ?? "Unlabeled"}</span>
                </div>
                <div>
                  <strong>{feePercentOfValue(utxo, selectedRate).toFixed(1)}%</strong>
                  <span>fee burden</span>
                </div>
                <StatusPill label={humanize(suggestedStressAction(utxo, selectedRate))} tone="warn" />
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No UTXOs cross the 25% uneconomical threshold at this fee rate.</p>
        )}
      </section>
    </main>
  );
}
