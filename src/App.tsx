import {
  BarChart3,
  Combine,
  FileSearch,
  GitCompareArrows,
  HeartPulse,
  LayoutDashboard,
  MessageSquareText,
  ShieldAlert,
  Table2,
  Telescope,
  Upload
} from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentWallet, updateUtxos as persistUtxos } from "./api/tauri";
import { ConsolidationPlanner } from "./pages/ConsolidationPlanner";
import { Dashboard } from "./pages/Dashboard";
import { DescriptorDiff } from "./pages/DescriptorDiff";
import { FeeStressTest } from "./pages/FeeStressTest";
import { OnboardingImport } from "./pages/OnboardingImport";
import { PrivacySimulator } from "./pages/PrivacySimulator";
import { PsbtLinter } from "./pages/PsbtLinter";
import { RecoveryHealth } from "./pages/RecoveryHealth";
import { TransactionExplanations } from "./pages/TransactionExplanations";
import { UtxoTable } from "./pages/UtxoTable";
import type { UtxoUpdate, WalletReport } from "./types/domain";

type Page =
  | "import"
  | "dashboard"
  | "utxos"
  | "fees"
  | "privacy"
  | "consolidation"
  | "psbt"
  | "recovery"
  | "descriptor_diff"
  | "explanations";

export default function App() {
  const [report, setReport] = useState<WalletReport | null>(null);
  const [page, setPage] = useState<Page>("import");

  useEffect(() => {
    getCurrentWallet().then((current) => {
      if (current) {
        setReport(current);
        setPage("dashboard");
      }
    });
  }, []);

  function applyUtxoPatch(current: WalletReport | null, outpoints: string[], patch: UtxoUpdate) {
    if (!current) return current;
    return {
      ...current,
      utxos: current.utxos.map((utxo) =>
        outpoints.includes(utxo.outpoint) ? { ...utxo, ...patch } : utxo
      )
    };
  }

  async function updateUtxos(outpoints: string[], patch: UtxoUpdate) {
    setReport((current) => {
      return applyUtxoPatch(current, outpoints, patch);
    });

    try {
      const updated = await persistUtxos(outpoints, patch);
      setReport(updated);
    } catch {
      // Browser demo mode has no Tauri IPC; keep the optimistic local update for smoke testing.
    }
  }

  if (!report && page === "import") {
    return <OnboardingImport onImported={(next) => {
      setReport(next);
      setPage("dashboard");
    }} />;
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-lockup">
          <ShieldAlert size={24} aria-hidden="true" />
          <div>
            <strong>XpubShield</strong>
            <span>Watch-only</span>
          </div>
        </div>
        <nav>
          <button className={page === "import" ? "active" : ""} onClick={() => setPage("import")}>
            <Upload size={18} /> Import
          </button>
          <button
            className={page === "dashboard" ? "active" : ""}
            onClick={() => setPage("dashboard")}
            disabled={!report}
          >
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button className={page === "utxos" ? "active" : ""} onClick={() => setPage("utxos")} disabled={!report}>
            <Table2 size={18} /> UTXOs
          </button>
          <button className={page === "fees" ? "active" : ""} onClick={() => setPage("fees")} disabled={!report}>
            <BarChart3 size={18} /> Fee Stress
          </button>
          <button className={page === "privacy" ? "active" : ""} onClick={() => setPage("privacy")} disabled={!report}>
            <Telescope size={18} /> Privacy
          </button>
          <button
            className={page === "consolidation" ? "active" : ""}
            onClick={() => setPage("consolidation")}
            disabled={!report}
          >
            <Combine size={18} /> Consolidation
          </button>
          <button className={page === "psbt" ? "active" : ""} onClick={() => setPage("psbt")} disabled={!report}>
            <FileSearch size={18} /> PSBT Linter
          </button>
          <button className={page === "recovery" ? "active" : ""} onClick={() => setPage("recovery")} disabled={!report}>
            <HeartPulse size={18} /> Recovery
          </button>
          <button
            className={page === "descriptor_diff" ? "active" : ""}
            onClick={() => setPage("descriptor_diff")}
            disabled={!report}
          >
            <GitCompareArrows size={18} /> Descriptor Diff
          </button>
          <button
            className={page === "explanations" ? "active" : ""}
            onClick={() => setPage("explanations")}
            disabled={!report}
          >
            <MessageSquareText size={18} /> Explanations
          </button>
        </nav>
      </aside>
      <div className="content-shell">
        {page === "import" ? (
          <OnboardingImport onImported={(next) => {
            setReport(next);
            setPage("dashboard");
          }} />
        ) : null}
        {page === "dashboard" && report ? <Dashboard report={report} /> : null}
        {page === "utxos" && report ? <UtxoTable report={report} onUpdateUtxos={updateUtxos} /> : null}
        {page === "fees" && report ? <FeeStressTest report={report} /> : null}
        {page === "privacy" && report ? <PrivacySimulator report={report} /> : null}
        {page === "consolidation" && report ? <ConsolidationPlanner report={report} /> : null}
        {page === "psbt" && report ? <PsbtLinter report={report} /> : null}
        {page === "recovery" && report ? <RecoveryHealth report={report} /> : null}
        {page === "descriptor_diff" && report ? <DescriptorDiff report={report} /> : null}
        {page === "explanations" && report ? <TransactionExplanations report={report} /> : null}
      </div>
    </div>
  );
}
