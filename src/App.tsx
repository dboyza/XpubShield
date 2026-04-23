import { LayoutDashboard, ShieldAlert, Table2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentWallet } from "./api/tauri";
import { Dashboard } from "./pages/Dashboard";
import { OnboardingImport } from "./pages/OnboardingImport";
import { UtxoTable } from "./pages/UtxoTable";
import type { WalletReport } from "./types/domain";

type Page = "import" | "dashboard" | "utxos";

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
            <strong>UTXO Sentinel</strong>
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
        {page === "utxos" && report ? <UtxoTable report={report} /> : null}
      </div>
    </div>
  );
}
