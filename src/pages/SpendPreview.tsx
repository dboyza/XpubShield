import { Calculator, CircleDollarSign, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import { MetricCard } from "../components/MetricCard";
import { StatusPill } from "../components/StatusPill";
import { simulateSpend } from "../api/tauri";
import { compactSats, humanize, satsToBtc, txidPrefix } from "../lib/format";
import {
  buildSpendScenarios,
  severityToTone,
  spendScenarioEvidence,
  type EvidenceItem,
  type SpendScenario
} from "../lib/ops";
import { buildSpendPreview, STRESS_FEE_RATES } from "../lib/phase2";
import type { SpendSimulation, Utxo, WalletReport } from "../types/domain";

interface SpendPreviewProps {
  report: WalletReport;
  onNavigate?: (page: string) => void;
}

export function SpendPreview({ report, onNavigate }: SpendPreviewProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [destinationAmount, setDestinationAmount] = useState("100000");
  const [feeRate, setFeeRate] = useState(25);
  const [changePolicy, setChangePolicy] = useState<"auto" | "avoid_change">("auto");
  const [singleContextOnly, setSingleContextOnly] = useState(false);
  const [savedSimulation, setSavedSimulation] = useState<SpendSimulation | null>(null);
  const [activeEvidence, setActiveEvidence] = useState<EvidenceItem | null>(null);

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
  const scenarios = useMemo(() => buildSpendScenarios(selectedUtxos, preview), [preview, selectedUtxos]);

  function toggle(outpoint: string) {
    setSelected((current) =>
      current.includes(outpoint) ? current.filter((item) => item !== outpoint) : [...current, outpoint]
    );
  }

  async function persistSimulation() {
    try {
      const saved = await simulateSpend(selected, Number(destinationAmount), feeRate);
      setSavedSimulation(saved);
    } catch {
      setSavedSimulation(null);
    }
  }

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p>{report.wallet.name}</p>
          <h1>Spend preflight</h1>
        </div>
        <StatusPill label="Simulation only" tone="good" />
      </section>

      <section className="privacy-warning">
        <ShieldAlert size={20} />
        <div>
          <strong>No transaction is created</strong>
          <p>This preflight models what an observer could learn from selected coins. It does not sign, finalize, extract, construct, or broadcast a transaction.</p>
        </div>
      </section>

      <section className="workflow-dock" aria-label="Spend preflight subviews">
        <article className="workflow-lens-card">
          <span>Observer inference</span>
          <strong>Run the privacy model when the question is what selected coins reveal together.</strong>
          <button type="button" className="secondary-button" onClick={() => onNavigate?.("privacy")}>
            Open observer lens
          </button>
        </article>
        <article className="workflow-lens-card">
          <span>Consolidation</span>
          <strong>Check fee savings against merge damage before batching coins.</strong>
          <button type="button" className="secondary-button" onClick={() => onNavigate?.("consolidation")}>
            Open consolidation lens
          </button>
        </article>
      </section>

      <section className="simulator-grid preflight-grid">
        <div className="panel preflight-input-panel">
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

        <div className="panel preflight-result-panel">
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

          <section className="scenario-builder">
            <div className="panel-heading">
              <h2>Spend scenario builder</h2>
              <StatusPill label="observer narrative" tone={preview.privacyRisk === "high" ? "bad" : preview.privacyRisk === "medium" ? "warn" : "good"} />
            </div>
            <div className="scenario-grid">
              {scenarios.map((scenario) => (
                <ScenarioCard key={scenario.id} scenario={scenario} onEvidence={setActiveEvidence} />
              ))}
            </div>
          </section>

          <div className="finding-list">
            <article className="finding-row observer-card">
              <div className="finding-title">
                <strong>What an observer could infer</strong>
                <button
                  type="button"
                  className="ghost-button evidence-link"
                  onClick={() =>
                    setActiveEvidence({
                      id: "spend-observer-notes",
                      title: "Observer inference",
                      severity: riskToSeverity(preview.privacyRisk),
                      confidence: "medium",
                      why: preview.observerNotes.join(" "),
                      action: "Use the scenario builder to remove risky inputs before signing elsewhere.",
                      evidence: selectedUtxos.length
                        ? selectedUtxos.map((utxo) => `${txidPrefix(utxo.txid)}: ${utxo.label || "Unlabeled"} / ${humanize(utxo.source_category)}`)
                        : ["No selected inputs."],
                      affectedCount: selectedUtxos.length
                    })
                  }
                >
                  Evidence
                </button>
              </div>
              <ul>
                {preview.observerNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </article>
            <article className="finding-row">
              <div className="finding-title">
                <strong>{preview.createsChange ? "Change likely created" : "No economical change estimated"}</strong>
                <button
                  type="button"
                  className="ghost-button evidence-link"
                  onClick={() =>
                    setActiveEvidence({
                      id: "spend-change",
                      title: "Change outcome",
                      severity: preview.createsChange ? "medium" : "low",
                      confidence: "medium",
                      why: preview.summary,
                      action: "Adjust amount, fee rate, or coin selection if change would inherit mixed history.",
                      evidence: [
                        `Input amount: ${compactSats(preview.inputAmountSats)} sats`,
                        `Destination amount: ${compactSats(preview.destinationAmountSats)} sats`,
                        `Estimated fee: ${compactSats(preview.estimatedFeeSats)} sats`,
                        `Estimated change: ${compactSats(preview.changeAmountSats)} sats`
                      ],
                      affectedCount: selectedUtxos.length
                    })
                  }
                >
                  Evidence
                </button>
              </div>
              <p>{preview.summary}</p>
            </article>
            <article className="finding-row">
              <div className="finding-title">
                <strong>Label mixing risk: {humanize(preview.labelMixingRisk)}</strong>
                <button
                  type="button"
                  className="ghost-button evidence-link"
                  onClick={() =>
                    setActiveEvidence({
                      id: "spend-label-mixing",
                      title: "Label mixing risk",
                      severity: riskToSeverity(preview.labelMixingRisk),
                      confidence: "high",
                      why: "The selected inputs are compared by local labels, source categories, and quarantine status.",
                      action: "Prefer inputs with the same label and source category for a single spend.",
                      evidence: selectedUtxos.map((utxo) => `${txidPrefix(utxo.txid)}: ${utxo.label || "Unlabeled"} / ${humanize(utxo.source_category)}`),
                      affectedCount: selectedUtxos.length
                    })
                  }
                >
                  Evidence
                </button>
              </div>
              <p>This heuristic checks selected labels, source categories, and quarantine flags. It is not definitive.</p>
            </article>
            <article className="finding-row">
              <div className="finding-title">
                <strong>Provenance mixing risk: {humanize(preview.provenanceMixingRisk)}</strong>
                <button
                  type="button"
                  className="ghost-button evidence-link"
                  onClick={() =>
                    setActiveEvidence({
                      id: "spend-provenance-mixing",
                      title: "Provenance mixing risk",
                      severity: riskToSeverity(preview.provenanceMixingRisk),
                      confidence: "medium",
                      why: "Manual labels, local registry guesses, and provenance categories are compared for the selected inputs.",
                      action: "Keep exchange-like, unknown, and non-KYC contexts separated unless the merge is deliberate.",
                      evidence: selectedUtxos.map((utxo) => `${txidPrefix(utxo.txid)}: ${utxo.provenance.entity_label ?? humanize(utxo.provenance.category)} (${humanize(utxo.provenance.confidence_level)})`),
                      affectedCount: selectedUtxos.length
                    })
                  }
                >
                  Evidence
                </button>
              </div>
              <p>Local registry and manual labels are used to spot exchange/non-exchange and entity-context mixing without remote attribution calls.</p>
            </article>
            {preview.quarantineWarnings.map((warning) => (
              <article className="finding-row" key={warning}>
                <div className="finding-title">
                  <strong>Quarantine warning</strong>
                  <button
                    type="button"
                    className="ghost-button evidence-link"
                    onClick={() =>
                      setActiveEvidence({
                        id: `spend-quarantine:${warning}`,
                        title: "Quarantine warning",
                        severity: "high",
                        confidence: "high",
                        why: warning,
                        action: "Remove quarantined coins unless the policy exception is intentional.",
                        evidence: selectedUtxos
                          .filter((utxo) => utxo.quarantine_status !== "none")
                          .map((utxo) => `${txidPrefix(utxo.txid)}: ${humanize(utxo.quarantine_status)}`),
                        affectedCount: selectedUtxos.filter((utxo) => utxo.quarantine_status !== "none").length
                      })
                    }
                  >
                    Evidence
                  </button>
                </div>
                <p>{warning}</p>
              </article>
            ))}
          </div>

          <div className="button-row settings-actions">
            <button type="button" className="secondary-button" onClick={persistSimulation} disabled={selected.length === 0}>
              Save local simulation
            </button>
            {savedSimulation ? (
              <StatusPill label={`${savedSimulation.warnings.length} persisted warnings`} tone={savedSimulation.warnings.length ? "warn" : "good"} />
            ) : null}
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
      <EvidenceDrawer item={activeEvidence} onClose={() => setActiveEvidence(null)} />
    </main>
  );
}

function ScenarioCard({ scenario, onEvidence }: { scenario: SpendScenario; onEvidence: (item: EvidenceItem) => void }) {
  return (
    <article className={`scenario-card scenario-card-${scenario.severity}`}>
      <div className="scenario-card-top">
        <StatusPill label={humanize(scenario.severity)} tone={severityToTone(scenario.severity)} />
        <span>{humanize(scenario.confidence)} confidence</span>
      </div>
      <h3>{scenario.title}</h3>
      <p>{scenario.narrative}</p>
      <span>{scenario.observerInference}</span>
      <button type="button" className="ghost-button evidence-link" onClick={() => onEvidence(spendScenarioEvidence(scenario))}>
        Evidence
      </button>
    </article>
  );
}

function SpendPickRow({ utxo, checked, onToggle }: { utxo: Utxo; checked: boolean; onToggle: (outpoint: string) => void }) {
  return (
    <label className="utxo-pick-row">
      <input type="checkbox" checked={checked} onChange={() => onToggle(utxo.outpoint)} />
      <span>
        <strong>{satsToBtc(utxo.amount_sats)}</strong>
        <span>
          {txidPrefix(utxo.txid)} - {utxo.label || "Unlabeled"} - {utxo.provenance.entity_label ?? humanize(utxo.provenance.category)}
        </span>
      </span>
    </label>
  );
}

function riskToSeverity(risk: "low" | "medium" | "high") {
  if (risk === "high") return "high";
  if (risk === "medium") return "medium";
  return "low";
}
