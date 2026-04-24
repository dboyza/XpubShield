import { Combine, Route } from "lucide-react";
import { useMemo, useState } from "react";
import { MetricCard } from "../components/MetricCard";
import { StatusPill } from "../components/StatusPill";
import { categoryLabel, compactSats, humanize, satsToBtc, txidPrefix } from "../lib/format";
import { buildConsolidationPlan } from "../lib/phase2";
import type { WalletReport } from "../types/domain";

interface ConsolidationPlannerProps {
  report: WalletReport;
}

export function ConsolidationPlanner({ report }: ConsolidationPlannerProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [feeRate, setFeeRate] = useState(25);
  const selectedUtxos = useMemo(
    () => report.utxos.filter((utxo) => selected.includes(utxo.outpoint)),
    [report.utxos, selected]
  );
  const plan = useMemo(() => buildConsolidationPlan(selectedUtxos, feeRate), [feeRate, selectedUtxos]);

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
          <h1>Consolidation planner</h1>
        </div>
        <StatusPill label="Simulation only" tone="good" />
      </section>

      <section className="metric-grid">
        <MetricCard icon={Combine} label="Current UTXOs" value={String(plan.currentUtxoCount)} />
        <MetricCard icon={Route} label="After consolidation" value={String(plan.proposedUtxoCount)} />
        <MetricCard
          icon={Combine}
          label="Estimated fee"
          value={`${compactSats(plan.estimatedFeeSats)} sats`}
          detail={`${plan.estimatedVbytes} vB at ${feeRate} sats/vB`}
          score={plan.privacyDamage === "high" ? 55 : 86}
        />
        <MetricCard
          icon={Route}
          label="Future fee savings"
          value={`${compactSats(plan.futureSavingsAt100Sats)} sats`}
          detail="Rough future spend-cost estimate at 100 sats/vB"
        />
      </section>

      <section className="simulator-grid">
        <div className="panel">
          <div className="panel-heading">
            <h2>Select UTXOs</h2>
            <label className="compact-field">
              Fee rate
              <input
                type="number"
                min={1}
                max={500}
                value={feeRate}
                onChange={(event) => setFeeRate(Number(event.target.value))}
              />
            </label>
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
            <h2>Privacy impact</h2>
            <StatusPill
              label={humanize(plan.privacyDamage)}
              tone={plan.privacyDamage === "high" ? "bad" : plan.privacyDamage === "medium" ? "warn" : "good"}
            />
          </div>
          <div className="shape-list">
            <SummaryRow label="Labels merged" value={plan.labelsMerged.join(", ") || "None"} />
            <SummaryRow
              label="Categories merged"
              value={plan.categoriesMerged.map((category) => categoryLabel(category)).join(", ") || "None"}
            />
            <SummaryRow label="Quarantined included" value={plan.includesQuarantined ? "Yes" : "No"} />
          </div>
          <p className="plain-text">
            Consolidation may reduce future fees, but it can also link histories together. XpubShield
            does not recommend consolidating everything by default.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Safer groups</h2>
          <StatusPill label={`${plan.saferGroups.length} groups`} />
        </div>
        {plan.saferGroups.length ? (
          <div className="stress-list">
            {plan.saferGroups.map((group) => (
              <article className="stress-item" key={group.key}>
                <div>
                  <strong>{humanize(group.key.replace(":", " · "))}</strong>
                  <span>{group.outpoints.length} UTXOs</span>
                </div>
                <strong>{satsToBtc(group.amountSats)}</strong>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No label/category group has more than one selected UTXO yet.</p>
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
