import { ArrowDownUp, Filter, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { RiskBadge } from "../components/RiskBadge";
import { StatusPill } from "../components/StatusPill";
import { categoryLabel, compactSats, humanize, satsToBtc, scriptTypeLabel, txidPrefix } from "../lib/format";
import type { SourceCategory, Utxo, WalletReport } from "../types/domain";

interface UtxoTableProps {
  report: WalletReport;
}

type SortKey = "amount_sats" | "confirmations" | "script_type" | "source_category";

export function UtxoTable({ report }: UtxoTableProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SourceCategory | "all">("all");
  const [riskFlag, setRiskFlag] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("amount_sats");
  const [selected, setSelected] = useState<string[]>([]);

  const riskFlags = useMemo(
    () => Array.from(new Set(report.utxos.flatMap((utxo) => utxo.audit_flags))).sort(),
    [report.utxos]
  );

  const categories = useMemo(
    () => Array.from(new Set(report.utxos.map((utxo) => utxo.source_category))).sort(),
    [report.utxos]
  );

  const filtered = useMemo(() => {
    return report.utxos
      .filter((utxo) => {
        const haystack = [
          utxo.outpoint,
          utxo.address,
          utxo.label ?? "",
          utxo.source_label ?? "",
          utxo.derivation_path,
          utxo.audit_flags.join(" ")
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query.toLowerCase());
      })
      .filter((utxo) => (category === "all" ? true : utxo.source_category === category))
      .filter((utxo) => (riskFlag === "all" ? true : utxo.audit_flags.includes(riskFlag)))
      .sort((a, b) => compareUtxos(a, b, sortKey));
  }, [category, query, report.utxos, riskFlag, sortKey]);

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
          <h1>UTXO table</h1>
        </div>
        <StatusPill label={`${selected.length} selected`} tone={selected.length ? "warn" : "neutral"} />
      </section>

      <section className="toolbar">
        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search labels, paths, txids" />
        </label>
        <label>
          <Filter size={16} aria-hidden="true" />
          <select value={category} onChange={(event) => setCategory(event.target.value as SourceCategory | "all")}>
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {categoryLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Filter size={16} aria-hidden="true" />
          <select value={riskFlag} onChange={(event) => setRiskFlag(event.target.value)}>
            <option value="all">All risks</option>
            {riskFlags.map((item) => (
              <option key={item} value={item}>
                {humanize(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <ArrowDownUp size={16} aria-hidden="true" />
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="amount_sats">Amount</option>
            <option value="confirmations">Confirmations</option>
            <option value="script_type">Script type</option>
            <option value="source_category">Category</option>
          </select>
        </label>
      </section>

      <section className="table-panel">
        <table>
          <thead>
            <tr>
              <th aria-label="Select UTXO" />
              <th>Amount</th>
              <th>Label</th>
              <th>Source</th>
              <th>Path</th>
              <th>Confirmations</th>
              <th>Spend cost</th>
              <th>Risk</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((utxo) => (
              <tr key={utxo.outpoint} className={selected.includes(utxo.outpoint) ? "selected-row" : ""}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(utxo.outpoint)}
                    onChange={() => toggle(utxo.outpoint)}
                    aria-label={`Select ${utxo.outpoint}`}
                  />
                </td>
                <td>
                  <strong>{satsToBtc(utxo.amount_sats)}</strong>
                  <span>{compactSats(utxo.amount_sats)} sats</span>
                </td>
                <td>
                  <strong>{utxo.label ?? "Unlabeled"}</strong>
                  <span>{utxo.is_change ? "Change" : txidPrefix(utxo.txid)}</span>
                </td>
                <td>
                  <strong>{categoryLabel(utxo.source_category)}</strong>
                  <span>{utxo.source_label ?? "No source label"}</span>
                </td>
                <td>
                  <strong>{scriptTypeLabel(utxo.script_type)}</strong>
                  <span>{utxo.derivation_path}</span>
                </td>
                <td>{utxo.confirmations}</td>
                <td>
                  <FeeStack utxo={utxo} />
                </td>
                <td>
                  <div className="flag-stack">
                    {utxo.audit_flags.length ? (
                      utxo.audit_flags.slice(0, 2).map((flag) => <span key={flag}>{humanize(flag)}</span>)
                    ) : (
                      <span>No flags</span>
                    )}
                  </div>
                </td>
                <td>
                  <StatusPill
                    label={humanize(utxo.spendability_status)}
                    tone={utxo.spendability_status === "quarantined" ? "bad" : "neutral"}
                  />
                  {utxo.quarantine_status !== "none" ? <RiskBadge severity="medium" /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function compareUtxos(a: Utxo, b: Utxo, sortKey: SortKey) {
  if (sortKey === "amount_sats" || sortKey === "confirmations") {
    return b[sortKey] - a[sortKey];
  }
  return String(a[sortKey]).localeCompare(String(b[sortKey]));
}

function FeeStack({ utxo }: { utxo: Utxo }) {
  const at25 = utxo.spend_cost_by_fee_rate.find((fee) => fee.fee_rate === 25);
  const at100 = utxo.spend_cost_by_fee_rate.find((fee) => fee.fee_rate === 100);

  return (
    <div className="fee-stack">
      <span>25: {at25 ? `${compactSats(at25.cost_sats)} sats` : "n/a"}</span>
      <span>100: {at100 ? `${compactSats(at100.cost_sats)} sats` : "n/a"}</span>
    </div>
  );
}
