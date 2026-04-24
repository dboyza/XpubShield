import { ArrowDownUp, CheckSquare, Filter, Search, Tags } from "lucide-react";
import { useMemo, useState } from "react";
import { RiskBadge } from "../components/RiskBadge";
import { StatusPill } from "../components/StatusPill";
import { categoryLabel, compactSats, humanize, satsToBtc, scriptTypeLabel, txidPrefix } from "../lib/format";
import { SOURCE_CATEGORIES } from "../lib/phase2";
import type { QuarantineStatus, SourceCategory, Utxo, UtxoStatus, UtxoUpdate, WalletReport } from "../types/domain";

interface UtxoTableProps {
  report: WalletReport;
  onUpdateUtxos: (outpoints: string[], patch: UtxoUpdate) => void;
}

type SortKey = "amount_sats" | "confirmations" | "script_type" | "source_category";

const SPENDABILITY_STATUSES: UtxoStatus[] = [
  "spendable",
  "do_not_spend",
  "quarantined",
  "consolidate_later",
  "cold_storage_only",
  "needs_accounting_review",
  "unknown"
];

const QUARANTINE_STATUSES: QuarantineStatus[] = [
  "none",
  "dust_attack_suspicion",
  "unknown_source",
  "unlabeled_deposit",
  "too_small_to_spend_economically",
  "received_to_reused_address",
  "avoid_kyc_mix",
  "avoid_non_kyc_mix",
  "suspicious_external_pattern",
  "manual"
];

export function UtxoTable({ report, onUpdateUtxos }: UtxoTableProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SourceCategory | "all">("all");
  const [riskFlag, setRiskFlag] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("amount_sats");
  const [selected, setSelected] = useState<string[]>([]);
  const [batchLabel, setBatchLabel] = useState("");
  const [batchSourceLabel, setBatchSourceLabel] = useState("");
  const [batchCategory, setBatchCategory] = useState<SourceCategory>("unknown");
  const [batchStatus, setBatchStatus] = useState<UtxoStatus>("spendable");
  const [batchQuarantine, setBatchQuarantine] = useState<QuarantineStatus>("none");

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

  function toggleVisible() {
    const visibleOutpoints = filtered.map((utxo) => utxo.outpoint);
    const allVisibleSelected = visibleOutpoints.every((outpoint) => selected.includes(outpoint));
    setSelected((current) =>
      allVisibleSelected
        ? current.filter((outpoint) => !visibleOutpoints.includes(outpoint))
        : Array.from(new Set([...current, ...visibleOutpoints]))
    );
  }

  function applyBatchPatch(patch: UtxoUpdate) {
    if (selected.length === 0) return;
    onUpdateUtxos(selected, patch);
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

      <section className="action-panel">
        <div className="panel-heading">
          <h2>Local labels and quarantine</h2>
          <StatusPill label="Local only" tone="good" />
        </div>
        <div className="action-grid">
          <label>
            UTXO label
            <input
              value={batchLabel}
              onChange={(event) => setBatchLabel(event.target.value)}
              placeholder="e.g. cold storage deposit"
            />
          </label>
          <label>
            Source label
            <input
              value={batchSourceLabel}
              onChange={(event) => setBatchSourceLabel(event.target.value)}
              placeholder="e.g. exchange withdrawal"
            />
          </label>
          <label>
            Category
            <select value={batchCategory} onChange={(event) => setBatchCategory(event.target.value as SourceCategory)}>
              {SOURCE_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {categoryLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Spend status
            <select value={batchStatus} onChange={(event) => setBatchStatus(event.target.value as UtxoStatus)}>
              {SPENDABILITY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {humanize(status)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quarantine
            <select
              value={batchQuarantine}
              onChange={(event) => setBatchQuarantine(event.target.value as QuarantineStatus)}
            >
              {QUARANTINE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {humanize(status)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              applyBatchPatch({
                label: batchLabel || null,
                source_label: batchSourceLabel || null,
                source_category: batchCategory
              })
            }
            disabled={selected.length === 0}
          >
            <Tags size={17} /> Apply labels
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              applyBatchPatch({
                spendability_status: batchStatus,
                quarantine_status: batchQuarantine
              })
            }
            disabled={selected.length === 0}
          >
            <CheckSquare size={17} /> Apply status
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => applyBatchPatch({ quarantine_status: "none", spendability_status: "spendable" })}
            disabled={selected.length === 0}
          >
            Mark spendable
          </button>
        </div>
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
              <th>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((utxo) => selected.includes(utxo.outpoint))}
                  onChange={toggleVisible}
                  aria-label="Select all visible UTXOs"
                />
              </th>
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
                  <input
                    className="table-input"
                    value={utxo.label ?? ""}
                    onChange={(event) => onUpdateUtxos([utxo.outpoint], { label: event.target.value || null })}
                    placeholder="Unlabeled"
                    aria-label={`Label ${utxo.outpoint}`}
                  />
                  <span>{utxo.is_change ? "Change" : txidPrefix(utxo.txid)}</span>
                </td>
                <td>
                  <select
                    className="table-select"
                    value={utxo.source_category}
                    onChange={(event) =>
                      onUpdateUtxos([utxo.outpoint], { source_category: event.target.value as SourceCategory })
                    }
                    aria-label={`Source category ${utxo.outpoint}`}
                  >
                    {SOURCE_CATEGORIES.map((item) => (
                      <option key={item} value={item}>
                        {categoryLabel(item)}
                      </option>
                    ))}
                  </select>
                  <input
                    className="table-input"
                    value={utxo.source_label ?? ""}
                    onChange={(event) => onUpdateUtxos([utxo.outpoint], { source_label: event.target.value || null })}
                    placeholder="No source label"
                    aria-label={`Source label ${utxo.outpoint}`}
                  />
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
                  <div className="status-editor">
                    <select
                      className="table-select"
                      value={utxo.spendability_status}
                      onChange={(event) =>
                        onUpdateUtxos([utxo.outpoint], { spendability_status: event.target.value as UtxoStatus })
                      }
                      aria-label={`Spend status ${utxo.outpoint}`}
                    >
                      {SPENDABILITY_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {humanize(status)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="table-select"
                      value={utxo.quarantine_status}
                      onChange={(event) =>
                        onUpdateUtxos([utxo.outpoint], { quarantine_status: event.target.value as QuarantineStatus })
                      }
                      aria-label={`Quarantine status ${utxo.outpoint}`}
                    >
                      {QUARANTINE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {humanize(status)}
                        </option>
                      ))}
                    </select>
                    {utxo.quarantine_status !== "none" ? <RiskBadge severity="medium" /> : null}
                  </div>
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
