import {
  BarChart3,
  Bell,
  Combine,
  FileSearch,
  GitBranch,
  GitCompareArrows,
  HeartPulse,
  LayoutDashboard,
  MessageSquareText,
  Settings as SettingsIcon,
  Bitcoin,
  Send,
  Settings2,
  Table2,
  Telescope,
  Upload
} from "lucide-react";
import { useEffect, useState } from "react";
import { dismissAction, getCurrentWallet, updateUtxos as persistUtxos } from "./api/tauri";
import { ConsolidationPlanner } from "./pages/ConsolidationPlanner";
import { Alerts } from "./pages/Alerts";
import { Cockpit } from "./pages/Cockpit";
import { DescriptorDiff } from "./pages/DescriptorDiff";
import { FeeStressTest } from "./pages/FeeStressTest";
import { GraphView } from "./pages/GraphView";
import { OnboardingImport } from "./pages/OnboardingImport";
import { PrivacySimulator } from "./pages/PrivacySimulator";
import { PsbtLinter } from "./pages/PsbtLinter";
import { RecoveryHealth } from "./pages/RecoveryHealth";
import { Settings } from "./pages/Settings";
import { SpendPreview } from "./pages/SpendPreview";
import { TransactionExplanations } from "./pages/TransactionExplanations";
import { UtxoTable } from "./pages/UtxoTable";
import type { UtxoUpdate, WalletReport } from "./types/domain";

type Page =
  | "import"
  | "dashboard"
  | "utxos"
  | "fees"
  | "spend_preflight"
  | "privacy"
  | "consolidation"
  | "psbt"
  | "recovery"
  | "descriptor_diff"
  | "explanations"
  | "graph"
  | "alerts"
  | "settings";

type NavModule = {
  title: string;
  signal: string;
  pages: Array<{
    id: Page;
    label: string;
    icon: typeof LayoutDashboard;
    requiresWallet?: boolean;
  }>;
};

const NAV_MODULES: NavModule[] = [
  {
    title: "Command",
    signal: "overview / live state",
    pages: [
      { id: "dashboard", label: "Cockpit", icon: LayoutDashboard, requiresWallet: true },
      { id: "alerts", label: "Alerts", icon: Bell, requiresWallet: true },
      { id: "graph", label: "Lineage", icon: GitBranch, requiresWallet: true }
    ]
  },
  {
    title: "Coins",
    signal: "utxo control",
    pages: [
      { id: "utxos", label: "Coin Workbench", icon: Table2, requiresWallet: true },
      { id: "fees", label: "Fee Stress", icon: BarChart3, requiresWallet: true }
    ]
  },
  {
    title: "Simulate",
    signal: "future moves",
    pages: [
      { id: "spend_preflight", label: "Spend Preflight", icon: Send, requiresWallet: true },
      { id: "privacy", label: "Privacy", icon: Telescope, requiresWallet: true },
      { id: "consolidation", label: "Consolidation", icon: Combine, requiresWallet: true }
    ]
  },
  {
    title: "Verify",
    signal: "before signing",
    pages: [
      { id: "psbt", label: "PSBT Preflight", icon: FileSearch, requiresWallet: true },
      { id: "recovery", label: "Recovery", icon: HeartPulse, requiresWallet: true },
      { id: "descriptor_diff", label: "Descriptor Diff", icon: GitCompareArrows, requiresWallet: true },
      { id: "explanations", label: "Explanations", icon: MessageSquareText, requiresWallet: true }
    ]
  },
  {
    title: "System",
    signal: "local config",
    pages: [
      { id: "import", label: "Import", icon: Upload },
      { id: "settings", label: "Settings", icon: SettingsIcon, requiresWallet: true }
    ]
  }
];

export default function App() {
  const [report, setReport] = useState<WalletReport | null>(null);
  const [page, setPage] = useState<Page>("import");
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    getCurrentWallet().then((current) => {
      if (current) {
        setReport(current);
        setPage("dashboard");
      }
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 840);
    return () => window.clearTimeout(timer);
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

  async function dismissCockpitAction(actionId: string) {
    setReport((current) =>
      current ? { ...current, actions: current.actions.filter((action) => action.id !== actionId) } : current
    );
    try {
      const updated = await dismissAction(actionId);
      setReport(updated);
    } catch {
      // Browser demo mode has no Tauri IPC; keep the local dismissal for smoke testing.
    }
  }

  function navigateToAction(pageId: string) {
    const validPages: Page[] = [
      "import",
      "dashboard",
      "utxos",
      "fees",
      "spend_preflight",
      "privacy",
      "consolidation",
      "psbt",
      "recovery",
      "descriptor_diff",
      "explanations",
      "graph",
      "alerts",
      "settings"
    ];
    if (validPages.includes(pageId as Page)) {
      setPage(pageId as Page);
    }
  }

  return (
    <div className="app-frame">
      <div className={`boot-sweep ${booting ? "boot-sweep-active" : ""}`} aria-hidden="true">
        <span>XpubShield sovereign ops ready</span>
      </div>
      <aside className="sidebar">
        <div className="brand-lockup">
          <Bitcoin size={24} aria-hidden="true" />
          <div>
            <strong>XpubShield</strong>
            <span>SOVEREIGN OPS</span>
          </div>
        </div>
        <div className="terminal-status" aria-label="Local security status">
          <Settings2 size={16} aria-hidden="true" />
          <div>
            <strong>{report ? report.wallet.network.toUpperCase() : "NO WALLET"}</strong>
            <span>{report ? "local metadata armed" : "import required"}</span>
          </div>
        </div>
        <nav className="module-nav" aria-label="XpubShield modules">
          {NAV_MODULES.map((module) => (
            <section className="nav-module" key={module.title}>
              <div className="nav-module-heading">
                <span>{module.title}</span>
                <small>{module.signal}</small>
              </div>
              <div className="nav-module-buttons">
                {module.pages.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={page === item.id ? "active" : ""}
                      onClick={() => setPage(item.id)}
                      disabled={item.requiresWallet && !report}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </aside>
      <div className="content-shell">
        {page === "import" ? (
          <OnboardingImport onImported={(next) => {
            setReport(next);
            setPage("dashboard");
          }} />
        ) : null}
        {page === "dashboard" && report ? (
          <Cockpit report={report} onNavigate={navigateToAction} onDismissAction={dismissCockpitAction} />
        ) : null}
        {page === "utxos" && report ? <UtxoTable report={report} onUpdateUtxos={updateUtxos} /> : null}
        {page === "fees" && report ? <FeeStressTest report={report} /> : null}
        {page === "spend_preflight" && report ? <SpendPreview report={report} /> : null}
        {page === "privacy" && report ? <PrivacySimulator report={report} /> : null}
        {page === "consolidation" && report ? <ConsolidationPlanner report={report} /> : null}
        {page === "psbt" && report ? <PsbtLinter report={report} /> : null}
        {page === "recovery" && report ? <RecoveryHealth report={report} /> : null}
        {page === "descriptor_diff" && report ? <DescriptorDiff report={report} /> : null}
        {page === "explanations" && report ? <TransactionExplanations report={report} /> : null}
        {page === "graph" && report ? <GraphView report={report} /> : null}
        {page === "alerts" && report ? <Alerts report={report} /> : null}
        {page === "settings" && report ? <Settings report={report} onCacheCleared={() => {
          setReport(null);
          setPage("import");
        }} /> : null}
      </div>
    </div>
  );
}
