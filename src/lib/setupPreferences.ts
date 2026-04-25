import type { BackendKind, Network, ScriptType } from "../types/domain";

const BACKEND_PREFERENCES_STORAGE_KEY = "xpubshield.backend_preferences.v1";
const ONBOARDING_STORAGE_KEY = "xpubshield.onboarding.v1";

export type ElectrumPresetId = "blockstream" | "local" | "manual";

export interface BackendPreferences {
  network: Network;
  backend: BackendKind;
  gapLimit: number;
  scriptType: ScriptType;
  accountPath: string;
  bitcoinCoreUrl: string;
  bitcoinCoreUsername: string;
  bitcoinCorePassword: string;
  bitcoinCoreWallet: string;
  electrumPreset: ElectrumPresetId;
  electrumServerUrl: string;
  electrumDisplayName: string;
  esploraBaseUrl: string;
  esploraUseTor: boolean;
}

export const ELECTRUM_PRESETS: Array<{ id: ElectrumPresetId; label: string; url: string }> = [
  {
    id: "blockstream",
    label: "Blockstream public",
    url: "tcp://electrum.blockstream.info:50001"
  },
  {
    id: "local",
    label: "Local Electrum",
    url: "tcp://127.0.0.1:50001"
  },
  {
    id: "manual",
    label: "Manual server",
    url: ""
  }
];

export const DEFAULT_BACKEND_PREFERENCES: BackendPreferences = {
  network: "mainnet",
  backend: "mock",
  gapLimit: 20,
  scriptType: "native_segwit",
  accountPath: "84h/0h/0h",
  bitcoinCoreUrl: "http://127.0.0.1:8332",
  bitcoinCoreUsername: "",
  bitcoinCorePassword: "",
  bitcoinCoreWallet: "",
  electrumPreset: "local",
  electrumServerUrl: "tcp://127.0.0.1:50001",
  electrumDisplayName: "Local Electrum",
  esploraBaseUrl: "http://127.0.0.1:3000",
  esploraUseTor: false
};

export function readBackendPreferences(): BackendPreferences {
  try {
    const raw = window.localStorage.getItem(BACKEND_PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_BACKEND_PREFERENCES;
    return normalizeBackendPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_BACKEND_PREFERENCES;
  }
}

export function writeBackendPreferences(next: BackendPreferences): BackendPreferences {
  const normalized = normalizeBackendPreferences(next);
  try {
    window.localStorage.setItem(BACKEND_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Setup preferences are convenience defaults; import validation remains authoritative.
  }
  return normalized;
}

export function readOnboardingComplete(): boolean {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return false;
    return Boolean(JSON.parse(raw).completedAt);
  } catch {
    return false;
  }
}

export function writeOnboardingComplete(): boolean {
  try {
    window.localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({ completedAt: new Date().toISOString() })
    );
  } catch {
    // First-run state is local convenience; an unavailable store should not block app use.
  }
  return true;
}

function normalizeBackendPreferences(value: Partial<BackendPreferences>): BackendPreferences {
  return {
    ...DEFAULT_BACKEND_PREFERENCES,
    ...value,
    gapLimit: Number.isFinite(Number(value.gapLimit))
      ? Number(value.gapLimit)
      : DEFAULT_BACKEND_PREFERENCES.gapLimit,
    esploraUseTor: Boolean(value.esploraUseTor)
  };
}
