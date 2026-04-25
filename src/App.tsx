import {
  BookOpenCheck,
  FileSearch,
  FileText,
  GitBranch,
  HeartPulse,
  LayoutDashboard,
  Settings as SettingsIcon,
  Bitcoin,
  Send,
  Settings2,
  Table2,
  Upload
} from "lucide-react";
import { useEffect, useState } from "react";
import { dismissAction, getCurrentWallet, updateUtxos as persistUtxos } from "./api/tauri";
import { clearMissionQueueState, MissionQueue } from "./components/MissionQueue";
import {
  SovereignOpsTutorial,
  TUTORIAL_STEPS,
  type TutorialPageId
} from "./components/SovereignOpsTutorial";
import { Cockpit } from "./pages/Cockpit";
import { Documentation } from "./pages/Documentation";
import { GraphView } from "./pages/GraphView";
import { OnboardingImport } from "./pages/OnboardingImport";
import { PsbtLinter } from "./pages/PsbtLinter";
import { RecoveryHealth } from "./pages/RecoveryHealth";
import { Settings } from "./pages/Settings";
import { SpendPreview } from "./pages/SpendPreview";
import { UtxoTable } from "./pages/UtxoTable";
import type { UtxoUpdate, WalletReport } from "./types/domain";
import {
  clearWorkspaceSnapshot,
  isWorkspacePage,
  readWorkspaceSnapshot,
  writeWorkspaceSnapshot,
  type WorkspacePage,
  type WorkspaceSnapshot
} from "./lib/workspace";

type Page = WorkspacePage;

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

const PAGE_META: Record<Page, { code: string; label: string }> = {
  import: { code: "SYS-01", label: "Watch-only intake" },
  cockpit: { code: "CMD-00", label: "Action command" },
  graph: { code: "CMD-01", label: "Lineage map" },
  utxos: { code: "COIN-10", label: "Coin workbench" },
  spend_preflight: { code: "SIM-20", label: "Spend preflight" },
  psbt: { code: "VRF-30", label: "PSBT preflight" },
  recovery: { code: "VRF-31", label: "Recovery drill" },
  docs: { code: "SYS-02", label: "Operator handbook" },
  settings: { code: "SYS-03", label: "Local config" }
};

const TUTORIAL_STORAGE_KEY = "xpubshield.tutorial.v1";

const DEFAULT_TUTORIAL_STATE: TutorialState = {
  dismissed: false,
  promptSnoozed: false
};

const NAV_MODULES: NavModule[] = [
  {
    title: "Command",
    signal: "action / lineage",
    pages: [
      { id: "cockpit", label: "Cockpit", icon: LayoutDashboard, requiresWallet: true },
      { id: "graph", label: "Lineage", icon: GitBranch, requiresWallet: true }
    ]
  },
  {
    title: "Coins",
    signal: "control surface",
    pages: [
      { id: "utxos", label: "Coin Workbench", icon: Table2, requiresWallet: true }
    ]
  },
  {
    title: "Preflight",
    signal: "before signing",
    pages: [
      { id: "spend_preflight", label: "Spend Preflight", icon: Send, requiresWallet: true },
      { id: "psbt", label: "PSBT Preflight", icon: FileSearch, requiresWallet: true },
      { id: "recovery", label: "Recovery", icon: HeartPulse, requiresWallet: true }
    ]
  },
  {
    title: "System",
    signal: "local config",
    pages: [
      { id: "import", label: "Import", icon: Upload },
      { id: "tutorial", label: "Tutorial", icon: BookOpenCheck },
      { id: "docs", label: "Documentation", icon: FileText },
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

function resolveInitialPage(page: WorkspaceSnapshot["lastPage"], hasWallet: boolean): Page {
  if (!hasWallet) return page === "docs" ? "docs" : "import";
  if (!page || page === "import") return "cockpit";
  if (page === "settings" || page === "cockpit" || page === "utxos" || page === "spend_preflight" || page === "psbt" || page === "recovery" || page === "graph" || page === "docs") {
    return page;
  }
  return "cockpit";
}

export default function App() {
  const [report, setReport] = useState<WalletReport | null>(null);
  const [page, setPage] = useState<Page>("import");
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
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
        const savedWorkspace = readWorkspaceSnapshot(current.wallet.id);
        setReport(current);
        setWorkspace(savedWorkspace);
        setPage(resolveInitialPage(savedWorkspace.lastPage, true));
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

  function saveWorkspacePatch(patch: Partial<WorkspaceSnapshot>) {
    if (!report) return;
    setWorkspace(writeWorkspaceSnapshot(report.wallet.id, patch));
  }

  function selectPage(nextPage: Page) {
    setPage(nextPage);
    if (report) {
      setWorkspace(writeWorkspaceSnapshot(report.wallet.id, { lastPage: nextPage }));
    }
  }

  function navigateToAction(pageId: string) {
    const pageAliases: Record<string, Page> = {
      dashboard: "cockpit",
      alerts: "cockpit",
      explanations: "docs",
      fees: "utxos",
      privacy: "spend_preflight",
      consolidation: "spend_preflight",
      descriptor_diff: "recovery"
    };
    const targetPage = pageAliases[pageId] ?? pageId;
    if (isWorkspacePage(targetPage)) {
      selectPage(targetPage);
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

  const pageMeta = PAGE_META[page];
  const activeNavItem: NavItemId = page;

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
                      className={isTutorialItem ? tutorialOpen || tutorialPromptOpen ? "active" : "" : activeNavItem === item.id ? "active" : ""}
                      onClick={() => (isTutorialItem ? openTutorial(0) : selectPage(item.id as Page))}
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
        <div className="ops-ribbon" aria-label="XpubShield operations state">
          <div>
            <span>{pageMeta.code}</span>
            <strong>{pageMeta.label}</strong>
          </div>
          <div>
            <span>Mode</span>
            <strong>pre-sign / local</strong>
          </div>
          <div>
            <span>Wallet</span>
            <strong>{report ? report.wallet.network : "not loaded"}</strong>
          </div>
        </div>
        {report && page !== "import" ? (
          <MissionQueue
            report={report}
            onNavigate={navigateToAction}
            workspaceCollapsed={workspace?.missionQueueCollapsed}
            onWorkspaceCollapsedChange={(missionQueueCollapsed) => saveWorkspacePatch({ missionQueueCollapsed })}
          />
        ) : null}
        {page === "import" ? (
          <OnboardingImport onImported={(next) => {
            const nextWorkspace = writeWorkspaceSnapshot(next.wallet.id, { lastPage: "cockpit" });
            setReport(next);
            setWorkspace(nextWorkspace);
            setPage("cockpit");
          }} />
        ) : null}
        {page === "cockpit" && report ? (
          <Cockpit report={report} onNavigate={navigateToAction} onDismissAction={dismissCockpitAction} />
        ) : null}
        {page === "utxos" && report ? (
          <UtxoTable
            report={report}
            onUpdateUtxos={updateUtxos}
            workspaceState={workspace?.workbench}
            onWorkspaceChange={(workbench) => saveWorkspacePatch({ workbench: { ...workspace?.workbench, ...workbench } })}
          />
        ) : null}
        {page === "spend_preflight" && report ? (
          <SpendPreview
            report={report}
            workspaceState={workspace?.spendPreflight}
            onWorkspaceChange={(spendPreflight) => saveWorkspacePatch({ spendPreflight: { ...workspace?.spendPreflight, ...spendPreflight } })}
          />
        ) : null}
        {page === "psbt" && report ? <PsbtLinter report={report} /> : null}
        {page === "recovery" && report ? <RecoveryHealth report={report} onNavigate={navigateToAction} /> : null}
        {page === "graph" && report ? (
          <GraphView
            report={report}
            workspaceState={workspace?.graph}
            onWorkspaceChange={(graph) => saveWorkspacePatch({ graph: { ...workspace?.graph, ...graph } })}
          />
        ) : null}
        {page === "docs" ? (
          <Documentation
            reportLoaded={Boolean(report)}
            workspaceState={workspace?.documentation}
            onWorkspaceChange={(documentation) => report ? saveWorkspacePatch({ documentation: { ...workspace?.documentation, ...documentation } }) : undefined}
          />
        ) : null}
        {page === "settings" && report ? <Settings report={report} onTutorialReset={resetTutorial} onCacheCleared={() => {
          clearWorkspaceSnapshot(report.wallet.id);
          clearMissionQueueState(report.wallet.id);
          setWorkspace(null);
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
