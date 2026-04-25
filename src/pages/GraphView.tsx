import { Filter, GitBranch, Info } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, useEffect, useMemo, useRef, useState } from "react";
import { StatusPill } from "../components/StatusPill";
import { compactSats, humanize, txidPrefix } from "../lib/format";
import type { GraphWorkspaceState } from "../lib/workspace";
import type { ScriptType, SourceCategory, Utxo, WalletReport } from "../types/domain";

type GraphMode = "lineage" | "wallet" | "lifecycle" | "labels" | "privacy" | "fees";

interface ViewNode {
  id: string;
  type: "transaction" | "address" | "utxo" | "label" | "risk" | "spend";
  label: string;
  meta: string;
  risk?: string;
  amountSats?: number;
  utxo?: Utxo;
  x: number;
  y: number;
}

interface ViewEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

interface GraphFilters {
  label: string;
  category: string;
  scriptType: string;
  riskFlag: string;
  minAmount: number;
  confirmations: string;
}

interface GraphViewProps {
  report: WalletReport;
  workspaceState?: GraphWorkspaceState;
  onWorkspaceChange?: (patch: Partial<GraphWorkspaceState>) => void;
}

const NODE_LIMIT = 90;
const FEE_RATES = [5, 10, 25, 50, 100, 200, 300];
const MIN_GRAPH_ZOOM = 0.55;
const MAX_GRAPH_ZOOM = 2.6;

interface GraphViewport {
  x: number;
  y: number;
  zoom: number;
}

interface GraphDrag {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

export function GraphView({ report, workspaceState, onWorkspaceChange }: GraphViewProps) {
  const [mode, setMode] = useState<GraphMode>((workspaceState?.mode as GraphMode | undefined) ?? "lineage");
  const [selectedId, setSelectedId] = useState<string | null>(workspaceState?.selectedId ?? null);
  const [viewport, setViewport] = useState<GraphViewport>(normalizeViewport(workspaceState?.viewport));
  const [isPanning, setIsPanning] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<GraphDrag | null>(null);
  const [filters, setFilters] = useState<GraphFilters>(workspaceState?.filters ?? {
    label: "all",
    category: "all",
    scriptType: "all",
    riskFlag: "all",
    minAmount: 0,
    confirmations: "all"
  });
  const filteredUtxos = useMemo(() => filterUtxos(report.utxos, filters), [report.utxos, filters]);
  const graph = useMemo(() => buildGraph(mode, filteredUtxos, report), [mode, filteredUtxos, report]);
  const visibleGraph = useMemo(() => limitGraph(graph, NODE_LIMIT), [graph]);
  const selected = visibleGraph.nodes.find((node) => node.id === selectedId) ?? visibleGraph.nodes[0] ?? null;

  useEffect(() => {
    setMode((workspaceState?.mode as GraphMode | undefined) ?? "lineage");
    setSelectedId(workspaceState?.selectedId ?? null);
    setViewport(normalizeViewport(workspaceState?.viewport));
    setFilters(workspaceState?.filters ?? {
      label: "all",
      category: "all",
      scriptType: "all",
      riskFlag: "all",
      minAmount: 0,
      confirmations: "all"
    });
  }, [report.wallet.id]);

  useEffect(() => {
    onWorkspaceChange?.({
      mode,
      selectedId,
      viewport,
      filters
    });
  }, [filters, mode, selectedId, viewport]);

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest(".graph-node")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y
    };
    setIsPanning(true);
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setViewport((current) => ({
      ...current,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    }));
  };

  const handleCanvasPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setIsPanning(false);
  };

  const handleCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;

    setViewport((current) => {
      const nextZoom = clamp(current.zoom * (event.deltaY < 0 ? 1.12 : 0.88), MIN_GRAPH_ZOOM, MAX_GRAPH_ZOOM);
      const zoomRatio = nextZoom / current.zoom;
      return {
        zoom: nextZoom,
        x: pointerX - (pointerX - current.x) * zoomRatio,
        y: pointerY - (pointerY - current.y) * zoomRatio
      };
    });
  };

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p>{report.wallet.name}</p>
          <h1>Transaction lineage</h1>
        </div>
        <StatusPill
          label={visibleGraph.limited ? `${visibleGraph.nodes.length}/${graph.nodes.length} nodes` : `${graph.nodes.length} nodes`}
          tone={visibleGraph.limited ? "warn" : "good"}
        />
      </section>

      <section className="toolbar">
        <label>
          View
          <select value={mode} onChange={(event) => setMode(event.target.value as GraphMode)}>
            <option value="lineage">Lineage map</option>
            <option value="wallet">Wallet graph</option>
            <option value="lifecycle">UTXO lifecycle</option>
            <option value="labels">Label clusters</option>
            <option value="privacy">Privacy risk</option>
            <option value="fees">Fee heatmap</option>
          </select>
        </label>
        <Filter size={18} aria-hidden="true" />
        <label>
          Label
          <select value={filters.label} onChange={(event) => setFilters({ ...filters, label: event.target.value })}>
            <option value="all">All</option>
            {unique(report.utxos.map((utxo) => utxo.label ?? "Unlabeled")).map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
            <option value="all">All</option>
            {unique(report.utxos.map((utxo) => utxo.source_category)).map((category) => (
              <option key={category} value={category}>{humanize(category)}</option>
            ))}
          </select>
        </label>
        <label>
          Script
          <select value={filters.scriptType} onChange={(event) => setFilters({ ...filters, scriptType: event.target.value })}>
            <option value="all">All</option>
            {unique(report.utxos.map((utxo) => utxo.script_type)).map((scriptType) => (
              <option key={scriptType} value={scriptType}>{humanize(scriptType)}</option>
            ))}
          </select>
        </label>
        <label>
          Risk
          <select value={filters.riskFlag} onChange={(event) => setFilters({ ...filters, riskFlag: event.target.value })}>
            <option value="all">All</option>
            {unique(report.utxos.flatMap((utxo) => utxo.audit_flags)).map((flag) => (
              <option key={flag} value={flag}>{humanize(flag)}</option>
            ))}
          </select>
        </label>
        <label>
          Min sats
          <input
            type="number"
            min={0}
            value={filters.minAmount}
            onChange={(event) => setFilters({ ...filters, minAmount: Number(event.target.value) })}
          />
        </label>
        <label>
          Confirmations
          <select value={filters.confirmations} onChange={(event) => setFilters({ ...filters, confirmations: event.target.value })}>
            <option value="all">All</option>
            <option value="confirmed">Confirmed</option>
            <option value="unconfirmed">Unconfirmed</option>
          </select>
        </label>
      </section>

      {mode === "fees" ? (
        <FeeHeatmap utxos={filteredUtxos} />
      ) : (
        <section className="graph-layout">
          <div
            ref={canvasRef}
            className={`graph-canvas ${isPanning ? "is-panning" : ""}`}
            role="img"
            aria-label={`${humanize(mode)} graph. Drag empty space to pan, use the wheel to zoom.`}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerEnd}
            onPointerCancel={handleCanvasPointerEnd}
            onWheel={handleCanvasWheel}
          >
            <div
              className="graph-pan-layer"
              style={{ transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})` }}
            >
              <svg className="graph-edges" aria-hidden="true">
                {visibleGraph.edges.map((edge) => {
                  const source = visibleGraph.nodes.find((node) => node.id === edge.source);
                  const target = visibleGraph.nodes.find((node) => node.id === edge.target);
                  if (!source || !target) return null;
                  return (
                    <line
                      key={edge.id}
                      x1={`${source.x}%`}
                      y1={`${source.y}%`}
                      x2={`${target.x}%`}
                      y2={`${target.y}%`}
                    />
                  );
                })}
              </svg>
              {visibleGraph.nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className={`graph-node graph-node-${node.type} ${selected?.id === node.id ? "selected" : ""}`}
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                  onClick={() => setSelectedId(node.id)}
                >
                  <GitBranch size={15} aria-hidden="true" />
                  <strong>{node.label}</strong>
                  <span>{node.meta}</span>
                </button>
              ))}
            </div>
          </div>
          <DetailPanel node={selected} />
        </section>
      )}
    </main>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeViewport(viewport?: GraphViewport): GraphViewport {
  if (!viewport) return { x: 0, y: 0, zoom: 1 };
  return {
    x: Number.isFinite(viewport.x) ? viewport.x : 0,
    y: Number.isFinite(viewport.y) ? viewport.y : 0,
    zoom: clamp(Number.isFinite(viewport.zoom) ? viewport.zoom : 1, MIN_GRAPH_ZOOM, MAX_GRAPH_ZOOM)
  };
}

function DetailPanel({ node }: { node: ViewNode | null }) {
  if (!node) {
    return (
      <aside className="panel graph-detail">
        <Info size={18} aria-hidden="true" />
        <p className="empty-state">No node selected.</p>
      </aside>
    );
  }
  return (
    <aside className="panel graph-detail">
      <div className="panel-heading">
        <h2>{node.label}</h2>
        <StatusPill label={humanize(node.type)} />
      </div>
      <div className="shape-list">
        <SummaryRow label="Node" value={node.id} />
        <SummaryRow label="Context" value={node.meta} />
        <SummaryRow label="Risk" value={node.risk ? humanize(node.risk) : "None flagged"} />
        {node.utxo ? (
          <>
            <SummaryRow label="Amount" value={`${compactSats(node.utxo.amount_sats)} sats`} />
            <SummaryRow label="Label" value={node.utxo.label ?? "Unlabeled"} />
            <SummaryRow label="Category" value={humanize(node.utxo.source_category)} />
            <SummaryRow label="Provenance" value={node.utxo.provenance.entity_label ?? humanize(node.utxo.provenance.category)} />
            <SummaryRow label="Confidence" value={humanize(node.utxo.provenance.confidence_level)} />
            <SummaryRow label="Status" value={humanize(node.utxo.spendability_status)} />
          </>
        ) : null}
      </div>
    </aside>
  );
}

function FeeHeatmap({ utxos }: { utxos: Utxo[] }) {
  const visible = utxos.slice(0, NODE_LIMIT);
  return (
    <section className="table-panel">
      <table>
        <thead>
          <tr>
            <th>UTXO</th>
            {FEE_RATES.map((rate) => (
              <th key={rate}>{rate} sats/vB</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((utxo) => (
            <tr key={utxo.outpoint}>
              <td>
                <strong>{txidPrefix(utxo.txid)}:{utxo.vout}</strong>
                <span>{compactSats(utxo.amount_sats)} sats</span>
              </td>
              {FEE_RATES.map((rate) => {
                const cost = Math.round(rate * Math.max(utxo.spend_vbytes_estimate, 68));
                const percent = (cost / Math.max(utxo.amount_sats, 1)) * 100;
                return (
                  <td key={rate} className={percent >= 25 ? "heat-bad" : percent >= 10 ? "heat-warn" : "heat-good"}>
                    <strong>{cost}</strong>
                    <span>{percent.toFixed(1)}%</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function buildGraph(mode: GraphMode, utxos: Utxo[], report: WalletReport): { nodes: ViewNode[]; edges: ViewEdge[] } {
  if (mode === "lineage") return lineageGraph(utxos);
  if (mode === "lifecycle") return lifecycleGraph(utxos);
  if (mode === "labels") return labelGraph(utxos);
  if (mode === "privacy") return privacyGraph(utxos);
  return walletGraph(utxos, report);
}

function lineageGraph(utxos: Utxo[]) {
  const nodes: ViewNode[] = [];
  const edges: ViewEdge[] = [];
  const add = uniqueNode(nodes);
  const sources = unique(utxos.map(provenanceKey));
  const txids = unique(utxos.map((utxo) => utxo.txid));

  sources.forEach((source, index) => {
    const sample = utxos.find((utxo) => provenanceKey(utxo) === source);
    add({
      id: `source:${source}`,
      type: "label",
      label: sample ? provenanceLabel(sample) : source,
      meta: "source cluster",
      risk: sample?.provenance.confidence_level,
      x: 12,
      y: y(index, sources.length)
    });
  });

  txids.forEach((txid, index) => {
    add({ id: `tx:${txid}`, type: "transaction", label: txidPrefix(txid), meta: "receive tx", x: 44, y: y(index, txids.length) });
  });

  utxos.forEach((utxo, index) => {
    add(utxoNode(utxo, 82, y(index, utxos.length)));
    edges.push({ id: `source-tx:${utxo.outpoint}`, source: `source:${provenanceKey(utxo)}`, target: `tx:${utxo.txid}`, label: "suggests" });
    edges.push({ id: `tx-utxo:${utxo.outpoint}`, source: `tx:${utxo.txid}`, target: `utxo:${utxo.outpoint}`, label: "creates" });
  });

  return { nodes, edges };
}

function walletGraph(utxos: Utxo[], report: WalletReport) {
  const nodes: ViewNode[] = [];
  const edges: ViewEdge[] = [];
  const add = uniqueNode(nodes);
  const txids = unique(utxos.map((utxo) => utxo.txid));
  const addresses = unique(utxos.map((utxo) => utxo.address));
  txids.forEach((txid, index) => add({ id: `tx:${txid}`, type: "transaction", label: txidPrefix(txid), meta: "transaction", x: 12, y: y(index, txids.length) }));
  addresses.forEach((address, index) => {
    const reused = report.derived_addresses.find((derived) => derived.address === address && derived.receive_count > 1);
    add({ id: `addr:${address}`, type: "address", label: shortAddress(address), meta: reused ? "reused address" : "address", risk: reused ? "address_reuse" : undefined, x: 50, y: y(index, addresses.length) });
  });
  utxos.forEach((utxo, index) => {
    add(utxoNode(utxo, 84, y(index, utxos.length)));
    edges.push({ id: `creates:${utxo.outpoint}`, source: `tx:${utxo.txid}`, target: `utxo:${utxo.outpoint}`, label: "creates" });
    edges.push({ id: `receives:${utxo.outpoint}`, source: `addr:${utxo.address}`, target: `utxo:${utxo.outpoint}`, label: "receives" });
  });
  return { nodes, edges };
}

function lifecycleGraph(utxos: Utxo[]) {
  const nodes: ViewNode[] = [];
  const edges: ViewEdge[] = [];
  const add = uniqueNode(nodes);
  utxos.forEach((utxo, index) => {
    const rowY = y(index, utxos.length);
    add({ id: `deposit:${utxo.txid}`, type: "transaction", label: txidPrefix(utxo.txid), meta: "deposit", x: 14, y: rowY });
    add(utxoNode(utxo, 50, rowY));
    add({ id: `future:${utxo.outpoint}`, type: "spend", label: "future spend", meta: utxo.spendability_status, risk: utxo.quarantine_status !== "none" ? utxo.quarantine_status : undefined, x: 84, y: rowY });
    edges.push({ id: `life-a:${utxo.outpoint}`, source: `deposit:${utxo.txid}`, target: `utxo:${utxo.outpoint}`, label: "creates" });
    edges.push({ id: `life-b:${utxo.outpoint}`, source: `utxo:${utxo.outpoint}`, target: `future:${utxo.outpoint}`, label: "simulates" });
  });
  return { nodes, edges };
}

function labelGraph(utxos: Utxo[]) {
  const labels = unique(utxos.map((utxo) => utxo.label ?? "Unlabeled"));
  const nodes: ViewNode[] = labels.map((label, index) => ({ id: `label:${label}`, type: "label", label, meta: "label cluster", x: 22, y: y(index, labels.length) }));
  const edges: ViewEdge[] = [];
  utxos.forEach((utxo, index) => {
    nodes.push(utxoNode(utxo, 72, y(index, utxos.length)));
    edges.push({ id: `label-edge:${utxo.outpoint}`, source: `label:${utxo.label ?? "Unlabeled"}`, target: `utxo:${utxo.outpoint}`, label: "groups" });
  });
  return { nodes, edges };
}

function privacyGraph(utxos: Utxo[]) {
  const risks = unique(utxos.flatMap((utxo) => utxo.audit_flags.length ? utxo.audit_flags : ["no_current_flag"]));
  const nodes: ViewNode[] = risks.map((risk, index) => ({ id: `risk:${risk}`, type: "risk", label: humanize(risk), meta: "privacy/fee heuristic", risk, x: 22, y: y(index, risks.length) }));
  const edges: ViewEdge[] = [];
  utxos.forEach((utxo, index) => {
    nodes.push(utxoNode(utxo, 72, y(index, utxos.length)));
    const flags = utxo.audit_flags.length ? utxo.audit_flags : ["no_current_flag"];
    flags.forEach((flag) => edges.push({ id: `risk-edge:${flag}:${utxo.outpoint}`, source: `risk:${flag}`, target: `utxo:${utxo.outpoint}`, label: "flags" }));
  });
  return { nodes, edges };
}

function utxoNode(utxo: Utxo, x: number, yPosition: number): ViewNode {
  return {
    id: `utxo:${utxo.outpoint}`,
    type: "utxo",
    label: `${compactSats(utxo.amount_sats)} sats`,
    meta: utxo.provenance.entity_label ?? utxo.label ?? humanize(utxo.source_category),
    risk: utxo.audit_flags[0],
    amountSats: utxo.amount_sats,
    utxo,
    x,
    y: yPosition
  };
}

function provenanceKey(utxo: Utxo): string {
  return `${utxo.provenance.category}:${utxo.provenance.entity_label ?? utxo.source_label ?? "unknown"}`;
}

function provenanceLabel(utxo: Utxo): string {
  return utxo.provenance.entity_label ?? humanize(utxo.provenance.category);
}

function limitGraph(graph: { nodes: ViewNode[]; edges: ViewEdge[] }, limit: number) {
  if (graph.nodes.length <= limit) return { ...graph, limited: false };
  const nodes = graph.nodes.slice(0, limit);
  const kept = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: graph.edges.filter((edge) => kept.has(edge.source) && kept.has(edge.target)),
    limited: true
  };
}

function filterUtxos(utxos: Utxo[], filters: GraphFilters) {
  return utxos.filter((utxo) => {
    if (filters.label !== "all" && (utxo.label ?? "Unlabeled") !== filters.label) return false;
    if (filters.category !== "all" && utxo.source_category !== filters.category as SourceCategory) return false;
    if (filters.scriptType !== "all" && utxo.script_type !== filters.scriptType as ScriptType) return false;
    if (filters.riskFlag !== "all" && !utxo.audit_flags.includes(filters.riskFlag)) return false;
    if (utxo.amount_sats < filters.minAmount) return false;
    if (filters.confirmations === "confirmed" && utxo.confirmations === 0) return false;
    if (filters.confirmations === "unconfirmed" && utxo.confirmations > 0) return false;
    return true;
  });
}

function uniqueNode(nodes: ViewNode[]) {
  return (node: ViewNode) => {
    if (!nodes.some((item) => item.id === node.id)) nodes.push(node);
  };
}

function y(index: number, total: number) {
  if (total <= 1) return 50;
  return 10 + (index / Math.max(total - 1, 1)) * 80;
}

function unique<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values)).sort();
}

function shortAddress(address: string) {
  return address.length > 18 ? `${address.slice(0, 18)}...` : address;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="shape-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
