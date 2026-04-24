import {
  BarChart3,
  Bell,
  BookOpenCheck,
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
import {
  SovereignOpsTutorial,
  TUTORIAL_STEPS,
  type TutorialPageId
} from "./components/SovereignOpsTutorial";
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

type NavItemId = Page | "tutorial";

type NavModule = {
  title: string;
  signal: string;
  pages: Array<{
    id: NavItemId;
    label: string;
    icon: typeof LayoutDashboard;
    requiresWallet?: boolean;
  }>;
};

type TutorialState = {
  dismissed: boolean;
  promptSnoozed: boolean;
  completedAt?: string;
  lastStepId?: string;
};

const TUTORIAL_STORAGE_KEY = "xpubshield.tutorial.v1";

const DEFAULT_TUTORIAL_STATE: TutorialState = {
  dismissed: false,
  promptSnoozed: false
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
      { id: "tutorial", label: "Tutorial", icon: BookOpenCheck },
      { id: "settings", label: "Settings", icon: SettingsIcon, requiresWallet: true }
    ]
  }
];

function readTutorialState(): TutorialState {
  try {
    const raw = window.localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (!raw) return DEFAULT_TUTORIAL_STATE;
    return { ...DEFAULT_TUTORIAL_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_TUTORIAL_STATE;
  }
}

function writeTutorialState(next: TutorialState): TutorialState {
  try {
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Tutorial state is a convenience only; the app should keep working if storage is unavailable.
  }
  return next;
}

function findTutorialStepIndex(stepId?: string) {
  const index = TUTORIAL_STEPS.findIndex((step) => step.id === stepId);
  return index >= 0 ? index : 0;
}

export default function App() {
  const [report, setReport] = useState<WalletReport | null>(null);
  const [page, setPage] = useState<Page>("import");
  const [booting, setBooting] = useState(true);
  const [tutorialState, setTutorialState] = useState<TutorialState>(() => readTutorialState());
  const [tutorialPromptOpen, setTutorialPromptOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [activeTutorialStep, setActiveTutorialStep] = useState(() =>
    findTutorialStepIndex(readTutorialState().lastStepId)
  );

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

  useEffect(() => {
    if (
      booting ||
      tutorialOpen ||
      tutorialPromptOpen ||
      tutorialState.dismissed ||
      tutorialState.promptSnoozed ||
      tutorialState.completedAt
    ) {
      return;
    }

    setTutorialPromptOpen(true);
  }, [booting, tutorialOpen, tutorialPromptOpen, tutorialState]);

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

  function saveTutorialState(patch: Partial<TutorialState>) {
    setTutorialState((current) => writeTutorialState({ ...current, ...patch }));
  }

  function openTutorial(stepIndex = activeTutorialStep) {
    setActiveTutorialStep(stepIndex);
    setTutorialPromptOpen(false);
    setTutorialOpen(true);
  }

  function startTutorial() {
    openTutorial(findTutorialStepIndex(tutorialState.lastStepId));
  }

  function closeTutorial() {
    const activeStepId = TUTORIAL_STEPS[activeTutorialStep]?.id;
    saveTutorialState({ lastStepId: activeStepId, promptSnoozed: true });
    setTutorialOpen(false);
    setTutorialPromptOpen(false);
  }

  function finishTutorial() {
    const activeStepId = TUTORIAL_STEPS[activeTutorialStep]?.id;
    saveTutorialState({
      dismissed: true,
      promptSnoozed: true,
      completedAt: new Date().toISOString(),
      lastStepId: activeStepId
    });
    setTutorialOpen(false);
    setTutorialPromptOpen(false);
  }

  function snoozeTutorialPrompt() {
    saveTutorialState({ promptSnoozed: true });
    setTutorialPromptOpen(false);
  }

  function dismissTutorialPrompt() {
    saveTutorialState({ dismissed: true, promptSnoozed: true });
    setTutorialPromptOpen(false);
  }

  function resetTutorial() {
    const next = writeTutorialState(DEFAULT_TUTORIAL_STATE);
    setTutorialState(next);
    setActiveTutorialStep(0);
    setTutorialOpen(false);
    setTutorialPromptOpen(true);
  }

  function changeTutorialStep(index: number) {
    setActiveTutorialStep(index);
    saveTutorialState({ lastStepId: TUTORIAL_STEPS[index]?.id });
  }

  function navigateFromTutorial(pageId: TutorialPageId) {
    navigateToAction(pageId);
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
                  const isTutorialItem = item.id === "tutorial";
                  return (
                    <button
                      key={item.id}
                      className={isTutorialItem ? tutorialOpen || tutorialPromptOpen ? "active" : "" : page === item.id ? "active" : ""}
                      onClick={() => (isTutorialItem ? openTutorial(0) : setPage(item.id as Page))}
                      disabled={!isTutorialItem && item.requiresWallet && !report}
                      data-tutorial-target={`nav-${item.id}`}
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
        {page === "settings" && report ? <Settings report={report} onTutorialReset={resetTutorial} onCacheCleared={() => {
          setReport(null);
          setPage("import");
        }} /> : null}
      </div>
      {tutorialPromptOpen || tutorialOpen ? (
        <SovereignOpsTutorial
          mode={tutorialOpen ? "mission" : "prompt"}
          activeStepIndex={activeTutorialStep}
          reportLoaded={Boolean(report)}
          onStart={startTutorial}
          onMaybeLater={snoozeTutorialPrompt}
          onDontShowAgain={dismissTutorialPrompt}
          onClose={closeTutorial}
          onFinish={finishTutorial}
          onNavigate={navigateFromTutorial}
          onStepChange={changeTutorialStep}
        />
      ) : null}
    </div>
  );
}
