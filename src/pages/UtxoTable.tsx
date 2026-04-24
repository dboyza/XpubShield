import { ArrowDownUp, CheckSquare, Filter, Info, Search, Tags, X } from "lucide-react";
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
  const [detailOutpoint, setDetailOutpoint] = useState<string | null>(null);

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

  const detailUtxo = useMemo(
    () => report.utxos.find((utxo) => utxo.outpoint === detailOutpoint) ?? null,
    [detailOutpoint, report.utxos]
  );

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

      {selected.length > 0 ? (
        <section className="action-panel">
          <div className="panel-heading">
            <h2>Local labels and quarantine</h2>
            <StatusPill label={`${selected.length} coins armed`} tone="warn" />
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
            >
              <CheckSquare size={17} /> Apply status
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => applyBatchPatch({ quarantine_status: "none", spendability_status: "spendable" })}
            >
              Mark spendable
            </button>
          </div>
        </section>
      ) : null}

      <section className="toolbar command-bar">
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
              <th>Detail</th>
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
                <td>
                  <button type="button" className="icon-button" onClick={() => setDetailOutpoint(utxo.outpoint)} aria-label={`Open details for ${utxo.outpoint}`}>
                    <Info size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {detailUtxo ? (
        <UtxoDetailDrawer
          report={report}
          utxo={detailUtxo}
          onClose={() => setDetailOutpoint(null)}
          onUpdate={(patch) => onUpdateUtxos([detailUtxo.outpoint], patch)}
        />
      ) : null}
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

function UtxoDetailDrawer({
  report,
  utxo,
  onClose,
  onUpdate
}: {
  report: WalletReport;
  utxo: Utxo;
  onClose: () => void;
  onUpdate: (patch: UtxoUpdate) => void;
}) {
  const transaction = report.transactions.find((item) => item.txid === utxo.txid);
  const address = report.derived_addresses.find((item) => item.address === utxo.address);
  const relatedFindings = report.findings.filter((finding) => finding.affected_utxos.includes(utxo.outpoint));

  return (
    <aside className="detail-drawer" aria-label="UTXO detail drawer">
      <div className="detail-drawer-header">
        <div>
          <p>{txidPrefix(utxo.txid)}</p>
          <h2>{satsToBtc(utxo.amount_sats)}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close UTXO detail">
          <X size={16} />
        </button>
      </div>

      <section className="panel embedded-form">
        <div className="panel-heading">
          <h2>Plain-English explanation</h2>
          <StatusPill label={utxo.quarantine_status === "none" ? "Review" : "Quarantined"} tone={utxo.quarantine_status === "none" ? "neutral" : "warn"} />
        </div>
        <p className="plain-text">{describeUtxo(utxo, relatedFindings.length)}</p>
      </section>

      <section className="panel embedded-form">
        <div className="panel-heading">
          <h2>Labels and status</h2>
          <StatusPill label="Local only" tone="good" />
        </div>
        <div className="action-grid detail-grid">
          <label>
            UTXO label
            <input value={utxo.label ?? ""} onChange={(event) => onUpdate({ label: event.target.value || null })} />
          </label>
          <label>
            Source label
            <input value={utxo.source_label ?? ""} onChange={(event) => onUpdate({ source_label: event.target.value || null })} />
          </label>
          <label>
            Category
            <select value={utxo.source_category} onChange={(event) => onUpdate({ source_category: event.target.value as SourceCategory })}>
              {SOURCE_CATEGORIES.map((item) => (
                <option key={item} value={item}>{categoryLabel(item)}</option>
              ))}
            </select>
          </label>
          <label>
            Spend status
            <select value={utxo.spendability_status} onChange={(event) => onUpdate({ spendability_status: event.target.value as UtxoStatus })}>
              {SPENDABILITY_STATUSES.map((status) => (
                <option key={status} value={status}>{humanize(status)}</option>
              ))}
            </select>
          </label>
          <label>
            Quarantine
            <select value={utxo.quarantine_status} onChange={(event) => onUpdate({ quarantine_status: event.target.value as QuarantineStatus })}>
              {QUARANTINE_STATUSES.map((status) => (
                <option key={status} value={status}>{humanize(status)}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel embedded-form">
        <div className="panel-heading">
          <h2>Wallet path</h2>
          <StatusPill label={scriptTypeLabel(utxo.script_type)} />
        </div>
        <div className="shape-list">
          <DetailRow label="Outpoint" value={utxo.outpoint} />
          <DetailRow label="Address" value={utxo.address} />
          <DetailRow label="Script pubkey" value={utxo.script_pubkey} />
          <DetailRow label="Derivation path" value={utxo.derivation_path} />
          <DetailRow label="Keychain" value={address ? humanize(address.keychain) : utxo.is_change ? "Change" : "External"} />
          <DetailRow label="Address receive count" value={address ? String(address.receive_count) : "Unknown"} />
        </div>
      </section>

      <section className="panel embedded-form">
        <div className="panel-heading">
          <h2>Spend costs</h2>
          <StatusPill label={`${utxo.spend_vbytes_estimate} vB`} />
        </div>
        <div className="shape-list">
          {utxo.spend_cost_by_fee_rate.map((fee) => (
            <DetailRow
              key={fee.fee_rate}
              label={`${fee.fee_rate} sats/vB`}
              value={`${compactSats(fee.cost_sats)} sats (${fee.percent_of_value.toFixed(2)}%)`}
            />
          ))}
        </div>
      </section>

      <section className="panel embedded-form">
        <div className="panel-heading">
          <h2>Transaction</h2>
          <StatusPill label={`${utxo.confirmations} confirmations`} tone={utxo.confirmations === 0 ? "warn" : "good"} />
        </div>
        <div className="shape-list">
          <DetailRow label="Txid" value={utxo.txid} />
          <DetailRow label="Vout" value={String(utxo.vout)} />
          <DetailRow label="Block height" value={String(utxo.block_height ?? "Unconfirmed")} />
          <DetailRow label="Block time" value={utxo.block_time ?? "Unknown"} />
          <DetailRow label="Source txid" value={utxo.source_txid ?? "Unknown"} />
        </div>
        {transaction?.explanation ? <p className="plain-text detail-note">{transaction.explanation}</p> : null}
      </section>

      <section className="panel embedded-form">
        <div className="panel-heading">
          <h2>Related risks</h2>
          <StatusPill label={`${relatedFindings.length} findings`} tone={relatedFindings.length ? "warn" : "good"} />
        </div>
        {relatedFindings.length ? (
          <div className="finding-list">
            {relatedFindings.map((finding) => (
              <article className="finding-row" key={finding.id}>
                <strong>{finding.title}</strong>
                <p>{finding.explanation}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No audit finding directly references this UTXO.</p>
        )}
      </section>
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="shape-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function describeUtxo(utxo: Utxo, findingCount: number): string {
  const receiveType = utxo.is_change ? "change output" : "external receive";
  const label = utxo.label ? `labeled ${utxo.label}` : "unlabeled";
  const quarantine =
    utxo.quarantine_status === "none"
      ? "It is not currently quarantined."
      : `It is marked ${humanize(utxo.quarantine_status)}, so it should not be casually merged.`;
  const findings =
    findingCount > 0
      ? `${findingCount} audit finding may apply to this coin.`
      : "No direct audit finding references this coin.";

  return `This UTXO appears to be a ${receiveType} at ${utxo.derivation_path}. It is ${label}, categorized as ${categoryLabel(utxo.source_category)}, and has ${utxo.confirmations} confirmations. ${quarantine} ${findings} These heuristics are not definitive.`;
}
