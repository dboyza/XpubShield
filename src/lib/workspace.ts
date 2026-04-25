export type WorkspacePage =
  | "import"
  | "cockpit"
  | "utxos"
  | "spend_preflight"
  | "psbt"
  | "recovery"
  | "graph"
  | "docs"
  | "settings";

export interface WorkbenchWorkspaceState {
  query?: string;
  category?: string;
  riskFlag?: string;
  provenanceFilter?: string;
  sortKey?: string;
  selected?: string[];
  detailOutpoint?: string | null;
}

export interface SpendPreflightWorkspaceState {
  selected?: string[];
  destinationAmount?: string;
  feeRate?: number;
  changePolicy?: "auto" | "avoid_change";
  singleContextOnly?: boolean;
}

export interface GraphWorkspaceState {
  mode?: string;
  selectedId?: string | null;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
  filters?: {
    label: string;
    category: string;
    scriptType: string;
    riskFlag: string;
    minAmount: number;
    confirmations: string;
  };
}

export interface DocumentationWorkspaceState {
  query?: string;
}

export interface WorkspaceSnapshot {
  walletId: string;
  lastPage?: WorkspacePage;
  workbench?: WorkbenchWorkspaceState;
  spendPreflight?: SpendPreflightWorkspaceState;
  graph?: GraphWorkspaceState;
  documentation?: DocumentationWorkspaceState;
  updatedAt: string;
}

const WORKSPACE_STORAGE_PREFIX = "xpubshield.workspace.v1";

export function readWorkspaceSnapshot(walletId: string): WorkspaceSnapshot {
  try {
    const raw = window.localStorage.getItem(workspaceStorageKey(walletId));
    if (!raw) return emptyWorkspaceSnapshot(walletId);
    return normalizeWorkspaceSnapshot(walletId, JSON.parse(raw));
  } catch {
    return emptyWorkspaceSnapshot(walletId);
  }
}

export function writeWorkspaceSnapshot(walletId: string, patch: Partial<WorkspaceSnapshot>): WorkspaceSnapshot {
  const current = readWorkspaceSnapshot(walletId);
  const next = normalizeWorkspaceSnapshot(walletId, {
    ...current,
    ...patch,
    walletId,
    updatedAt: new Date().toISOString()
  });

  try {
    window.localStorage.setItem(workspaceStorageKey(walletId), JSON.stringify(next));
  } catch {
    // Workspace resume is convenience state; the app remains functional without it.
  }

  return next;
}

export function clearWorkspaceSnapshot(walletId: string) {
  try {
    window.localStorage.removeItem(workspaceStorageKey(walletId));
  } catch {
    // Ignore restricted storage environments.
  }
}

export function isWorkspacePage(value: unknown): value is WorkspacePage {
  return (
    value === "import" ||
    value === "cockpit" ||
    value === "utxos" ||
    value === "spend_preflight" ||
    value === "psbt" ||
    value === "recovery" ||
    value === "graph" ||
    value === "docs" ||
    value === "settings"
  );
}

function emptyWorkspaceSnapshot(walletId: string): WorkspaceSnapshot {
  return {
    walletId,
    lastPage: "cockpit",
    updatedAt: new Date().toISOString()
  };
}

function normalizeWorkspaceSnapshot(walletId: string, value: Partial<WorkspaceSnapshot>): WorkspaceSnapshot {
  return {
    walletId,
    lastPage: isWorkspacePage(value.lastPage) ? value.lastPage : "cockpit",
    workbench: value.workbench,
    spendPreflight: value.spendPreflight,
    graph: value.graph,
    documentation: value.documentation,
    updatedAt: value.updatedAt ?? new Date().toISOString()
  };
}

function workspaceStorageKey(walletId: string) {
  return `${WORKSPACE_STORAGE_PREFIX}:${walletId}`;
}
