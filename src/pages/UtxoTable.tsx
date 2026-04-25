import { ArrowDownUp, BookmarkPlus, CheckSquare, Filter, Info, Search, Tags, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import { RiskBadge } from "../components/RiskBadge";
import { StatusPill } from "../components/StatusPill";
import { deleteCoinSet, listCoinSets, saveCoinSet } from "../api/tauri";
import { categoryLabel, compactSats, humanize, satsToBtc, scriptTypeLabel, txidPrefix } from "../lib/format";
import { coinDecisionEvidence, getCoinDecision, type EvidenceItem } from "../lib/ops";
import { SOURCE_CATEGORIES } from "../lib/phase2";
import type { WorkbenchWorkspaceState } from "../lib/workspace";
import type { CoinSet, ProvenanceSourceKind, QuarantineStatus, SourceCategory, Utxo, UtxoStatus, UtxoUpdate, WalletReport } from "../types/domain";

interface UtxoTableProps {
  report: WalletReport;
  onUpdateUtxos: (outpoints: string[], patch: UtxoUpdate) => void;
  workspaceState?: WorkbenchWorkspaceState;
  onWorkspaceChange?: (patch: Partial<WorkbenchWorkspaceState>) => void;
}

type SortKey = "amount_sats" | "confirmations" | "script_type" | "source_category";
type ProvenanceFilter = ProvenanceSourceKind | "all" | "exchange_like" | "unknown_or_quarantined";

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

export function UtxoTable({ report, onUpdateUtxos, workspaceState, onWorkspaceChange }: UtxoTableProps) {
  const [query, setQuery] = useState(workspaceState?.query ?? "");
  const [category, setCategory] = useState<SourceCategory | "all">((workspaceState?.category as SourceCategory | "all" | undefined) ?? "all");
  const [riskFlag, setRiskFlag] = useState(workspaceState?.riskFlag ?? "all");
  const [provenanceFilter, setProvenanceFilter] = useState<ProvenanceFilter>((workspaceState?.provenanceFilter as ProvenanceFilter | undefined) ?? "all");
  const [sortKey, setSortKey] = useState<SortKey>((workspaceState?.sortKey as SortKey | undefined) ?? "amount_sats");
  const [selected, setSelected] = useState<string[]>(() => validOutpoints(workspaceState?.selected ?? [], report));
  const [coinSets, setCoinSets] = useState<CoinSet[]>([]);
  const [coinSetName, setCoinSetName] = useState("");
  const [coinSetIntent, setCoinSetIntent] = useState("spend preflight");
  const [coinSetNotes, setCoinSetNotes] = useState("");
  const [batchLabel, setBatchLabel] = useState("");
  const [batchSourceLabel, setBatchSourceLabel] = useState("");
  const [batchCategory, setBatchCategory] = useState<SourceCategory>("unknown");
  const [batchStatus, setBatchStatus] = useState<UtxoStatus>("spendable");
  const [batchQuarantine, setBatchQuarantine] = useState<QuarantineStatus>("none");
  const [detailOutpoint, setDetailOutpoint] = useState<string | null>(() =>
    isKnownOutpoint(workspaceState?.detailOutpoint ?? null, report) ? workspaceState?.detailOutpoint ?? null : null
  );
  const [activeEvidence, setActiveEvidence] = useState<EvidenceItem | null>(null);

  const riskFlags = useMemo(
    () => Array.from(new Set(report.utxos.flatMap((utxo) => utxo.audit_flags))).sort(),
    [report.utxos]
  );

  const categories = useMemo(
    () => Array.from(new Set(report.utxos.map((utxo) => utxo.source_category))).sort(),
    [report.utxos]
  );

  useEffect(() => {
    listCoinSets()
      .then(setCoinSets)
      .catch(() => setCoinSets([]));
  }, []);

  useEffect(() => {
    setQuery(workspaceState?.query ?? "");
    setCategory((workspaceState?.category as SourceCategory | "all" | undefined) ?? "all");
    setRiskFlag(workspaceState?.riskFlag ?? "all");
    setProvenanceFilter((workspaceState?.provenanceFilter as ProvenanceFilter | undefined) ?? "all");
    setSortKey((workspaceState?.sortKey as SortKey | undefined) ?? "amount_sats");
    setSelected(validOutpoints(workspaceState?.selected ?? [], report));
    setDetailOutpoint(isKnownOutpoint(workspaceState?.detailOutpoint ?? null, report) ? workspaceState?.detailOutpoint ?? null : null);
  }, [report.wallet.id]);

  useEffect(() => {
    onWorkspaceChange?.({
      query,
      category,
      riskFlag,
      provenanceFilter,
      sortKey,
      selected,
      detailOutpoint
    });
  }, [category, detailOutpoint, provenanceFilter, query, riskFlag, selected, sortKey]);

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
      .filter((utxo) => matchesProvenanceFilter(utxo, provenanceFilter))
      .sort((a, b) => compareUtxos(a, b, sortKey));
  }, [category, provenanceFilter, query, report.utxos, riskFlag, sortKey]);

  const detailUtxo = useMemo(
    () => report.utxos.find((utxo) => utxo.outpoint === detailOutpoint) ?? null,
    [detailOutpoint, report.utxos]
  );
  const selectedUtxos = useMemo(
    () => report.utxos.filter((utxo) => selected.includes(utxo.outpoint)),
    [report.utxos, selected]
  );
  const selectedAmountSats = selectedUtxos.reduce((sum, utxo) => sum + utxo.amount_sats, 0);

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

  async function saveSelectedCoinSet() {
    if (selected.length === 0) return;
    const name = coinSetName.trim() || `${selected.length} coin preflight set`;
    const intent = coinSetIntent.trim() || "spend preflight";
    const localSet: CoinSet = {
      id: `browser:${Date.now()}`,
      wallet_id: report.wallet.id,
      name,
      intent,
      outpoints: selected,
      notes: coinSetNotes.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    try {
      setCoinSets(await saveCoinSet({ name, intent, outpoints: selected, notes: coinSetNotes || null }));
    } catch {
      setCoinSets((current) => [localSet, ...current]);
    }
    setCoinSetName("");
    setCoinSetNotes("");
  }

  async function removeCoinSet(id: string) {
    try {
      setCoinSets(await deleteCoinSet(id));
    } catch {
      setCoinSets((current) => current.filter((set) => set.id !== id));
    }
  }

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p>{report.wallet.name}</p>
          <h1>Coin workbench</h1>
        </div>
        <StatusPill label={`${selected.length} selected`} tone={selected.length ? "warn" : "neutral"} />
      </section>

      <section className="workflow-dock" aria-label="Coin workbench subviews">
        <article className="workflow-lens-card">
          <span>Fee exposure</span>
          <strong>Stress-test coin economics without leaving the workbench context.</strong>
          <p>Use the spend-cost column and fee heatmap in Lineage for coin-level fee pressure.</p>
        </article>
        <article className="workflow-lens-card">
          <span>Observer model</span>
          <strong>Inspect label, source, and quarantine linkage before choosing coins.</strong>
          <p>Use provenance, decision state, and saved sets to avoid accidental context merges.</p>
        </article>
      </section>

      {selected.length > 0 ? (
        <section className="selected-coin-tray">
          <div className="selected-tray-header">
            <div>
              <h2>Selected coin tray</h2>
              <p className="plain-text">{selected.length} coins · {compactSats(selectedAmountSats)} sats under local review</p>
            </div>
            <StatusPill label="local metadata" tone="warn" />
          </div>
          <div className="tray-grid">
            <div>
              <div className="panel-heading">
                <h2>Labels and spend policy</h2>
              </div>
              <div className="tray-subgrid">
                <label>
                  UTXO label
                  <input value={batchLabel} onChange={(event) => setBatchLabel(event.target.value)} placeholder="e.g. cold storage deposit" />
                </label>
                <label>
                  Source label
                  <input value={batchSourceLabel} onChange={(event) => setBatchSourceLabel(event.target.value)} placeholder="e.g. exchange withdrawal" />
                </label>
                <label>
                  Category
                  <select value={batchCategory} onChange={(event) => setBatchCategory(event.target.value as SourceCategory)}>
                    {SOURCE_CATEGORIES.map((item) => (
                      <option key={item} value={item}>{categoryLabel(item)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Spend status
                  <select value={batchStatus} onChange={(event) => setBatchStatus(event.target.value as UtxoStatus)}>
                    {SPENDABILITY_STATUSES.map((status) => (
                      <option key={status} value={status}>{humanize(status)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Quarantine
                  <select value={batchQuarantine} onChange={(event) => setBatchQuarantine(event.target.value as QuarantineStatus)}>
                    {QUARANTINE_STATUSES.map((status) => (
                      <option key={status} value={status}>{humanize(status)}</option>
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
                <button type="button" className="secondary-button" onClick={() => applyBatchPatch({ quarantine_status: "none", spendability_status: "spendable" })}>
                  Mark spendable
                </button>
              </div>
            </div>
            <div>
              <div className="panel-heading">
                <h2>Save review set</h2>
              </div>
              <div className="tray-subgrid">
                <label>
                  Set name
                  <input value={coinSetName} onChange={(event) => setCoinSetName(event.target.value)} placeholder="KYC stack / recovery drill / avoid merge" />
                </label>
                <label>
                  Intent
                  <input value={coinSetIntent} onChange={(event) => setCoinSetIntent(event.target.value)} placeholder="spend preflight" />
                </label>
                <label>
                  Notes
                  <input value={coinSetNotes} onChange={(event) => setCoinSetNotes(event.target.value)} placeholder="local operator notes" />
                </label>
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button" onClick={saveSelectedCoinSet}>
                  <BookmarkPlus size={16} /> Save selected
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel coinset-panel">
        <div className="panel-heading">
          <h2>Saved coin sets</h2>
          <StatusPill label={`${coinSets.length} sets`} tone={coinSets.length ? "good" : "neutral"} />
        </div>
        {coinSets.length ? (
          <div className="coinset-list">
            {coinSets.map((set) => (
              <article className="coinset-card" key={set.id}>
                <button type="button" className="coinset-main" onClick={() => setSelected(set.outpoints)}>
                  <strong>{set.name}</strong>
                  <span>{set.intent} · {set.outpoints.length} coins</span>
                </button>
                <button type="button" className="icon-button" onClick={() => removeCoinSet(set.id)} aria-label={`Delete ${set.name}`}>
                  <Trash2 size={15} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">Save selected coins to preserve review sets like KYC stack, unknown source, or do-not-merge.</p>
        )}
      </section>

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
          <Filter size={16} aria-hidden="true" />
          <select value={provenanceFilter} onChange={(event) => setProvenanceFilter(event.target.value as ProvenanceFilter)}>
            <option value="all">All provenance</option>
            <option value="manual">Manual evidence</option>
            <option value="registry">Registry evidence</option>
            <option value="heuristic">Heuristic evidence</option>
            <option value="wallet_change">Wallet change</option>
            <option value="exchange_like">Exchange-like</option>
            <option value="unknown_or_quarantined">Unknown / quarantined</option>
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

      <section className="table-panel workbench-table">
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
              <th>Provenance</th>
              <th>Path</th>
              <th>Confirmations</th>
              <th>Spend cost</th>
              <th>Decision</th>
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
                  <ProvenanceStack utxo={utxo} />
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
                  <DecisionStack utxo={utxo} onEvidence={setActiveEvidence} />
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
          onOpenEvidence={setActiveEvidence}
        />
      ) : null}
      <EvidenceDrawer item={activeEvidence} onClose={() => setActiveEvidence(null)} />
    </main>
  );
}

function compareUtxos(a: Utxo, b: Utxo, sortKey: SortKey) {
  if (sortKey === "amount_sats" || sortKey === "confirmations") {
    return b[sortKey] - a[sortKey];
  }
  return String(a[sortKey]).localeCompare(String(b[sortKey]));
}

function matchesProvenanceFilter(utxo: Utxo, filter: ProvenanceFilter) {
  if (filter === "all") return true;
  if (filter === "exchange_like") {
    return utxo.provenance.category === "exchange" || utxo.source_category === "exchange";
  }
  if (filter === "unknown_or_quarantined") {
    return utxo.provenance.source_kind === "unknown" || utxo.quarantine_status !== "none";
  }
  return utxo.provenance.source_kind === filter;
}

function validOutpoints(outpoints: string[], report: WalletReport) {
  const known = new Set(report.utxos.map((utxo) => utxo.outpoint));
  return outpoints.filter((outpoint) => known.has(outpoint));
}

function isKnownOutpoint(outpoint: string | null, report: WalletReport) {
  return Boolean(outpoint && report.utxos.some((utxo) => utxo.outpoint === outpoint));
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

function ProvenanceStack({ utxo }: { utxo: Utxo }) {
  return (
    <div className="provenance-stack">
      <strong>{utxo.provenance.entity_label ?? categoryLabel(utxo.provenance.category)}</strong>
      <span>{humanize(utxo.provenance.source_kind)} · {humanize(utxo.provenance.confidence_level)}</span>
      <span>{utxo.provenance.evidence[0]?.label ?? "No evidence"}</span>
    </div>
  );
}

function DecisionStack({ utxo, onEvidence }: { utxo: Utxo; onEvidence: (item: EvidenceItem) => void }) {
  const decision = getCoinDecision(utxo);

  return (
    <button
      type="button"
      className={`coin-decision coin-decision-${decision.state}`}
      onClick={() => onEvidence(coinDecisionEvidence(utxo))}
    >
      <strong>{decision.label}</strong>
      <span>{humanize(decision.confidence)} confidence</span>
    </button>
  );
}

function UtxoDetailDrawer({
  report,
  utxo,
  onClose,
  onUpdate,
  onOpenEvidence
}: {
  report: WalletReport;
  utxo: Utxo;
  onClose: () => void;
  onUpdate: (patch: UtxoUpdate) => void;
  onOpenEvidence: (item: EvidenceItem) => void;
}) {
  const transaction = report.transactions.find((item) => item.txid === utxo.txid);
  const address = report.derived_addresses.find((item) => item.address === utxo.address);
  const relatedFindings = report.findings.filter((finding) => finding.affected_utxos.includes(utxo.outpoint));
  const decision = getCoinDecision(utxo);

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

      <section className="panel embedded-form coin-decision-panel">
        <div className="panel-heading">
          <h2>Coin decision</h2>
          <StatusPill label={decision.label} tone={decision.tone} />
        </div>
        <p className="plain-text">{decision.reason}</p>
        <div className="shape-list">
          <DetailRow label="Confidence" value={humanize(decision.confidence)} />
          <DetailRow label="Action" value={decision.action} />
        </div>
        <button type="button" className="ghost-button" onClick={() => onOpenEvidence(coinDecisionEvidence(utxo))}>
          Open evidence
        </button>
      </section>

      <section className="panel embedded-form">
        <div className="panel-heading">
          <h2>Provenance evidence</h2>
          <StatusPill label={humanize(utxo.provenance.confidence_level)} tone={utxo.provenance.confidence_level === "high" ? "good" : utxo.provenance.confidence_level === "medium" ? "warn" : "neutral"} />
        </div>
        <div className="shape-list">
          <DetailRow label="Source kind" value={humanize(utxo.provenance.source_kind)} />
          <DetailRow label="Entity/category" value={utxo.provenance.entity_label ?? categoryLabel(utxo.provenance.category)} />
          <DetailRow label="Updated" value={utxo.provenance.updated_at} />
        </div>
        <div className="finding-list">
          {utxo.provenance.evidence.map((evidence) => (
            <article className="finding-row" key={evidence.id}>
              <strong>{evidence.label}</strong>
              <p>{evidence.detail}</p>
              <span>{humanize(evidence.confidence_level)} confidence · {evidence.source}</span>
            </article>
          ))}
        </div>
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
                <button
                  type="button"
                  className="ghost-button evidence-link"
                  onClick={() =>
                    onOpenEvidence({
                      id: `finding:${finding.id}`,
                      title: finding.title,
                      severity: finding.severity,
                      confidence: finding.confidence_level,
                      why: finding.explanation,
                      action: finding.recommended_action,
                      evidence: [
                        finding.heuristic_notes || "Local wallet report finding.",
                        ...finding.affected_utxos.slice(0, 4)
                      ],
                      affectedCount: finding.affected_utxos.length
                    })
                  }
                >
                  Open evidence
                </button>
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

  const provenance = utxo.provenance.entity_label ?? categoryLabel(utxo.provenance.category);
  return `This UTXO appears to be a ${receiveType} at ${utxo.derivation_path}. It is ${label}, categorized as ${categoryLabel(utxo.source_category)}, and its current provenance assessment is ${provenance} with ${humanize(utxo.provenance.confidence_level)} confidence. It has ${utxo.confirmations} confirmations. ${quarantine} ${findings} These heuristics are not definitive.`;
}
