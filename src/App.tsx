import { BarChart3, Combine, LayoutDashboard, ShieldAlert, Table2, Telescope, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentWallet } from "./api/tauri";
import { ConsolidationPlanner } from "./pages/ConsolidationPlanner";
import { Dashboard } from "./pages/Dashboard";
import { FeeStressTest } from "./pages/FeeStressTest";
import { OnboardingImport } from "./pages/OnboardingImport";
import { PrivacySimulator } from "./pages/PrivacySimulator";
import { UtxoTable } from "./pages/UtxoTable";
import type { UtxoUpdate, WalletReport } from "./types/domain";

type Page = "import" | "dashboard" | "utxos" | "fees" | "privacy" | "consolidation";

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

  function updateUtxos(outpoints: string[], patch: UtxoUpdate) {
    setReport((current) => {
      if (!current) return current;
      return {
        ...current,
        utxos: current.utxos.map((utxo) =>
          outpoints.includes(utxo.outpoint) ? { ...utxo, ...patch } : utxo
        )
      };
    });
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
      </div>
    </div>
  );
}
