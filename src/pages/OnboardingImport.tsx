import { AlertTriangle, ArrowLeft, ArrowRight, ChevronDown, CircleHelp, Database, FileKey2, Lock, Server, Upload, WalletCards } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { importWallet, isTauriRuntime, loadDemoWallet, looksLikePrivateMaterial } from "../api/tauri";
import { BrandMark } from "../components/BrandMark";
import { WarningDialog } from "../components/WarningDialog";
import { backendLabel } from "../lib/format";
import { ELECTRUM_PRESETS, type BackendPreferences, type ElectrumPresetId } from "../lib/setupPreferences";
import type { BackendKind, ImportRequest, Network, NetworkPolicy, ScriptType, WalletReport } from "../types/domain";

interface OnboardingImportProps {
  firstRun?: boolean;
  backendPreferences: BackendPreferences;
  networkPolicy: NetworkPolicy;
  onBackendPreferencesChange: (patch: Partial<BackendPreferences>) => void;
  onNetworkPolicyChange: (policy: NetworkPolicy) => void;
  onImported: (report: WalletReport) => void;
}

type WarningDialogKind = "private-material" | "public-backend";
type ServerDropdownKind = "network" | "backend";
type HelpOption<T extends string> = {
  value: T;
  label: string;
  description: string;
  common?: boolean;
  disabled?: boolean;
};

const NETWORK_HELP =
  "Mainnet uses real BTC. Testnet and Signet use test coins. Regtest is a private local chain.";

const NODE_SERVER_HELP =
  "Demo uses fixture data. Bitcoin Core RPC is your node. Private Electrum and self-hosted Esplora are operator-run. Public Electrum and Public Esplora are third-party query services.";

const NETWORK_OPTIONS: HelpOption<Network>[] = [
  { value: "mainnet", label: "Mainnet", description: "Real Bitcoin network with real funds and real privacy consequences.", common: true },
  { value: "testnet", label: "Testnet", description: "Public Bitcoin test network that uses valueless test coins." },
  { value: "signet", label: "Signet", description: "Controlled public test network with more predictable block production." },
  { value: "regtest", label: "Regtest", description: "Private local chain for developer testing on your machine." }
];

const BACKEND_OPTIONS: HelpOption<BackendKind>[] = [
  { value: "mock", label: "Demo / mock backend", description: "Uses local fixture data without querying a live node or server." },
  { value: "bitcoin_core_rpc", label: "Bitcoin Core RPC", description: "Connects to your local Bitcoin Core node for the best privacy posture." },
  { value: "electrum", label: "Private Electrum", description: "Queries an Electrum server you operate, using locally derived script hashes." },
  { value: "public_electrum", label: "Public Electrum", description: "Queries a third-party Electrum server that can infer wallet activity from script-hash timing.", common: true },
  { value: "esplora", label: "Self-hosted Esplora", description: "Queries an Esplora-compatible HTTP endpoint you operate." },
  { value: "public_esplora", label: "Public Esplora", description: "Queries a third-party Esplora API with weaker privacy." }
];

export function OnboardingImport({
  firstRun = false,
  backendPreferences,
  networkPolicy,
  onBackendPreferencesChange,
  onNetworkPolicyChange,
  onImported
}: OnboardingImportProps) {
  const [setupStep, setSetupStep] = useState<"server" | "wallet">(firstRun ? "server" : "wallet");
  const [importKind, setImportKind] = useState<"descriptor" | "xpub">("descriptor");
  const [walletName, setWalletName] = useState("Cold storage watch-only");
  const [descriptor, setDescriptor] = useState("");
  const [xpub, setXpub] = useState("");
  const [network, setNetwork] = useState<Network>(backendPreferences.network);
  const [scriptType, setScriptType] = useState<ScriptType>(backendPreferences.scriptType);
  const [accountPath, setAccountPath] = useState(backendPreferences.accountPath);
  const [gapLimit, setGapLimit] = useState(backendPreferences.gapLimit);
  const [backend, setBackend] = useState<BackendKind>(backendPreferences.backend);
  const [bitcoinCoreUrl, setBitcoinCoreUrl] = useState(backendPreferences.bitcoinCoreUrl);
  const [bitcoinCoreUsername, setBitcoinCoreUsername] = useState(backendPreferences.bitcoinCoreUsername);
  const [bitcoinCorePassword, setBitcoinCorePassword] = useState(backendPreferences.bitcoinCorePassword);
  const [bitcoinCoreWallet, setBitcoinCoreWallet] = useState(backendPreferences.bitcoinCoreWallet);
  const [electrumPreset, setElectrumPreset] = useState<ElectrumPresetId>(backendPreferences.electrumPreset);
  const [electrumServerUrl, setElectrumServerUrl] = useState(backendPreferences.electrumServerUrl);
  const [electrumDisplayName, setElectrumDisplayName] = useState(backendPreferences.electrumDisplayName);
  const [esploraBaseUrl, setEsploraBaseUrl] = useState(backendPreferences.esploraBaseUrl);
  const [esploraUseTor, setEsploraUseTor] = useState(backendPreferences.esploraUseTor);
  const [acknowledgedPublicApi, setAcknowledgedPublicApi] = useState(false);
  const [runtimeNoticeOpen, setRuntimeNoticeOpen] = useState(false);
  const [warningDialog, setWarningDialog] = useState<WarningDialogKind | null>(null);
  const [openServerDropdown, setOpenServerDropdown] = useState<ServerDropdownKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const publicApiMode = backend === "public_esplora";
  const publicElectrumMode = backend === "public_electrum";
  const publicBackendMode = publicApiMode || publicElectrumMode;
  const networkLocked = networkPolicy === "local_only";
  const desktopPersistenceAvailable = isTauriRuntime();
  const backendOptions = BACKEND_OPTIONS.map((option) => ({
    ...option,
    disabled:
      networkLocked &&
      option.value !== "mock" &&
      option.value !== "bitcoin_core_rpc"
  }));

  useEffect(() => {
    setSetupStep(firstRun ? "server" : "wallet");
  }, [firstRun]);

  useEffect(() => {
    if (networkLocked && backend !== "mock" && backend !== "bitcoin_core_rpc") {
      setBackend("mock");
      return;
    }
    if (backend === "public_esplora") {
      setEsploraBaseUrl("https://mempool.space/api");
      setEsploraUseTor(false);
    } else if (backend === "public_electrum") {
      const preset = ELECTRUM_PRESETS[0];
      setElectrumPreset(preset.id);
      setElectrumServerUrl(preset.url);
      setElectrumDisplayName(preset.label);
    } else if (backend === "esplora") {
      setEsploraBaseUrl("http://127.0.0.1:3000");
      setEsploraUseTor(false);
    } else if (backend === "electrum") {
      const preset = ELECTRUM_PRESETS[1];
      setElectrumPreset(preset.id);
      setElectrumServerUrl(preset.url);
      setElectrumDisplayName(preset.label);
    }
  }, [backend, networkLocked]);

  useEffect(() => {
    onBackendPreferencesChange({
      network,
      backend,
      gapLimit,
      scriptType,
      accountPath,
      bitcoinCoreUrl,
      bitcoinCoreUsername,
      bitcoinCorePassword,
      bitcoinCoreWallet,
      electrumPreset,
      electrumServerUrl,
      electrumDisplayName,
      esploraBaseUrl,
      esploraUseTor
    });
  }, [
    network,
    backend,
    gapLimit,
    scriptType,
    accountPath,
    bitcoinCoreUrl,
    bitcoinCoreUsername,
    bitcoinCorePassword,
    bitcoinCoreWallet,
    electrumPreset,
    electrumServerUrl,
    electrumDisplayName,
    esploraBaseUrl,
    esploraUseTor
  ]);

  function handleServerContinue() {
    setError(null);
    const backendError = validateBackendConfiguration({ requirePublicAcknowledgement: false });
    if (backendError) {
      setError(backendError);
      return;
    }
    if (publicBackendMode && !acknowledgedPublicApi) {
      setWarningDialog("public-backend");
      return;
    }
    setSetupStep("wallet");
  }

  function confirmPublicBackendWarning() {
    setAcknowledgedPublicApi(true);
    setWarningDialog(null);
    setSetupStep("wallet");
  }

  function rejectPrivateMaterial(importTarget: "descriptor" | "xpub" = importKind) {
    if (importTarget === "descriptor") {
      setDescriptor("");
    } else {
      setXpub("");
    }
    setError(null);
    setWarningDialog("private-material");
  }

  function handleWalletMaterialChange(importTarget: "descriptor" | "xpub", value: string) {
    if (looksLikePrivateMaterial(value)) {
      rejectPrivateMaterial(importTarget);
      return;
    }
    if (importTarget === "descriptor") {
      setDescriptor(value);
    } else {
      setXpub(value);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const pasted = (importKind === "descriptor" ? descriptor : xpub).trim();
    const normalizedGapLimit = Number(gapLimit);

    if (!walletName.trim()) {
      setError("Name this watch-only wallet before scanning so local metadata has a clear operator context.");
      return;
    }
    if (!pasted) {
      setError(importKind === "descriptor" ? "Paste a descriptor before importing, or switch to xpub import." : "Paste a public extended key before importing, or switch to descriptor import.");
      return;
    }
    if (looksLikePrivateMaterial(pasted)) {
      rejectPrivateMaterial();
      return;
    }
    if (importKind === "descriptor" && looksLikeBareXpub(pasted)) {
      setError("That looks like a bare public extended key. Switch the import type to Xpub or paste a full descriptor such as wpkh(...).");
      return;
    }
    if (importKind === "xpub" && looksLikeDescriptor(pasted)) {
      setError("That looks like a descriptor. Switch the import type to Descriptor so script policy and key origin metadata are preserved.");
      return;
    }
    if (!Number.isFinite(normalizedGapLimit) || normalizedGapLimit < 5 || normalizedGapLimit > 1000) {
      setError("Gap limit must be a number between 5 and 1000.");
      return;
    }
    const backendError = validateBackendConfiguration();
    if (backendError) {
      setError(backendError);
      return;
    }

    const request: ImportRequest = {
      import_kind: importKind,
      wallet_name: walletName.trim(),
      descriptor: importKind === "descriptor" ? pasted : undefined,
      xpub: importKind === "xpub" ? pasted : undefined,
      network,
      script_type: importKind === "xpub" ? scriptType : undefined,
      account_path_guess: importKind === "xpub" ? accountPath : undefined,
      gap_limit: normalizedGapLimit,
      backend,
      bitcoin_core_rpc:
        backend === "bitcoin_core_rpc"
          ? {
              url: bitcoinCoreUrl.trim(),
              username: bitcoinCoreUsername || undefined,
              password: bitcoinCorePassword || undefined,
              wallet: bitcoinCoreWallet || undefined
            }
          : undefined,
      electrum:
        backend === "electrum" || backend === "public_electrum"
          ? {
              server_url: electrumServerUrl.trim(),
              display_name: electrumDisplayName.trim() || undefined,
              public_server_acknowledged: acknowledgedPublicApi
            }
          : undefined,
      esplora:
        backend === "esplora" || backend === "public_esplora"
          ? {
              base_url: esploraBaseUrl.trim(),
              use_tor: esploraUseTor,
              public_api_acknowledged: acknowledgedPublicApi
            }
          : undefined,
      public_api_acknowledged: acknowledgedPublicApi,
      network_policy: networkPolicy
    };

    setLoading(true);
    try {
      const report = await importWallet(request);
      onImported(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setError(null);
    setLoading(true);
    try {
      const report = await loadDemoWallet();
      onImported(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function validateBackendConfiguration({
    requirePublicAcknowledgement = true
  }: { requirePublicAcknowledgement?: boolean } = {}): string | null {
    if (networkLocked && backend !== "mock" && backend !== "bitcoin_core_rpc") {
      return "Network Lock is enabled. Choose Mock backend or local Bitcoin Core RPC before importing.";
    }
    if (networkLocked && backend === "bitcoin_core_rpc" && !isLocalEndpoint(bitcoinCoreUrl)) {
      return "Network Lock requires Bitcoin Core RPC to use localhost, 127.0.0.1, or [::1].";
    }
    if (requirePublicAcknowledgement && publicBackendMode && !acknowledgedPublicApi) {
      return publicElectrumMode
        ? "Public Electrum requires acknowledging the script-hash privacy warning."
        : "Public API mode requires acknowledging the privacy warning.";
    }
    if (backend === "bitcoin_core_rpc" && !bitcoinCoreUrl.trim()) {
      return "Bitcoin Core RPC mode needs a local RPC URL.";
    }
    if ((backend === "electrum" || backend === "public_electrum") && !electrumServerUrl.trim()) {
      return "Electrum mode needs a server URL such as tcp://127.0.0.1:50001.";
    }
    if ((backend === "esplora" || backend === "public_esplora") && !esploraBaseUrl.trim()) {
      return "Esplora mode needs a base URL.";
    }
    return null;
  }

  return (
    <main className={`import-layout ${firstRun ? "first-run-layout" : ""}`}>
      <section className="import-panel">
        {firstRun ? (
          <div className="onboarding-brand">
            <BrandMark className="brand-mark-large" />
            <div>
              <strong>XpubShield</strong>
              <span>Watch-only setup</span>
            </div>
          </div>
        ) : null}
        <div className="section-heading">
          {firstRun && setupStep === "server" ? <Server size={22} aria-hidden="true" /> : <WalletCards size={22} aria-hidden="true" />}
          <div>
            <p>{firstRun ? (setupStep === "server" ? "Setup / node" : "Setup / wallet") : "Setup / wallet"}</p>
            <h1>{firstRun ? (setupStep === "server" ? "Choose your node server" : "Import watch-only wallet") : "Import watch-only wallet"}</h1>
          </div>
        </div>

        {firstRun ? (
          <div className="onboarding-progress" aria-label="Onboarding progress">
            <span className={setupStep === "server" ? "active" : ""}>1. Server</span>
            <span className={setupStep === "wallet" ? "active" : ""}>2. Wallet</span>
          </div>
        ) : null}

        {!desktopPersistenceAvailable ? (
          <aside className={`runtime-notice ${runtimeNoticeOpen ? "runtime-notice-open" : ""}`} role="status">
            <button
              type="button"
              className="runtime-notice-toggle"
              aria-expanded={runtimeNoticeOpen}
              onClick={() => setRuntimeNoticeOpen((open) => !open)}
            >
              <Database size={16} aria-hidden="true" />
              <span>Browser demo</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {runtimeNoticeOpen ? (
              <p>
                This localhost session does not have Tauri IPC, so desktop SQLite persistence and
                live commands may be unavailable. The packaged app stores wallet metadata locally.
              </p>
            ) : null}
          </aside>
        ) : null}

        {firstRun && setupStep === "server" ? (
          <div className="import-form server-step">
            <div className="server-select-grid">
              <OptionHelpSelect
                label="Network"
                value={network}
                options={NETWORK_OPTIONS}
                open={openServerDropdown === "network"}
                onToggle={() => setOpenServerDropdown((open) => open === "network" ? null : "network")}
                onChange={(nextNetwork) => {
                  setNetwork(nextNetwork);
                  setOpenServerDropdown(null);
                }}
              />
              <OptionHelpSelect
                label="Node server"
                value={backend}
                options={backendOptions}
                showOptionHelp={false}
                open={openServerDropdown === "backend"}
                onToggle={() => setOpenServerDropdown((open) => open === "backend" ? null : "backend")}
                onChange={(nextBackend) => {
                  setBackend(nextBackend);
                  setOpenServerDropdown(null);
                }}
              />
            </div>

            <div className="server-choice-note">
              <strong>{backendLabel(backend)}</strong>
              <span>{backendChoiceSummary(backend)}</span>
            </div>

            {backend === "bitcoin_core_rpc" ? (
              <details className="advanced-section backend-config" open>
                <summary>
                  <span>Bitcoin Core RPC</span>
                  <small>Local node connection</small>
                </summary>
                <div className="form-grid">
                  <label>
                    RPC URL
                    <input value={bitcoinCoreUrl} onChange={(event) => setBitcoinCoreUrl(event.target.value)} />
                  </label>
                  <label>
                    RPC wallet
                    <input value={bitcoinCoreWallet} onChange={(event) => setBitcoinCoreWallet(event.target.value)} />
                  </label>
                  <label>
                    RPC username
                    <input value={bitcoinCoreUsername} onChange={(event) => setBitcoinCoreUsername(event.target.value)} />
                  </label>
                  <label>
                    RPC password
                    <input
                      type="password"
                      value={bitcoinCorePassword}
                      onChange={(event) => setBitcoinCorePassword(event.target.value)}
                    />
                  </label>
                </div>
              </details>
            ) : null}

            {backend === "electrum" || backend === "public_electrum" ? (
              <details className="advanced-section backend-config" open>
                <summary>
                  <span>{backend === "public_electrum" ? "Public Electrum server" : "Private Electrum server"}</span>
                  <small>Local script-hash derivation</small>
                </summary>
                <div className="form-grid">
                  <label>
                    Server preset
                    <select value={electrumPreset} onChange={(event) => {
                      const preset = ELECTRUM_PRESETS.find((item) => item.id === event.target.value) ?? ELECTRUM_PRESETS[2];
                      setElectrumPreset(preset.id);
                      if (preset.url) setElectrumServerUrl(preset.url);
                      setElectrumDisplayName(preset.label);
                    }}>
                      {ELECTRUM_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Server URL
                    <input value={electrumServerUrl} onChange={(event) => {
                      setElectrumPreset("manual");
                      setElectrumServerUrl(event.target.value);
                    }} placeholder="tcp://127.0.0.1:50001" />
                  </label>
                  <label>
                    Display name
                    <input value={electrumDisplayName} onChange={(event) => setElectrumDisplayName(event.target.value)} />
                  </label>
                </div>
              </details>
            ) : null}

            {backend === "esplora" || backend === "public_esplora" ? (
              <details className="advanced-section backend-config" open>
                <summary>
                  <span>{backend === "public_esplora" ? "Public Esplora endpoint" : "Self-hosted Esplora endpoint"}</span>
                  <small>Address/script queries only</small>
                </summary>
                <div className="form-grid">
                  <label>
                    Base URL
                    <input value={esploraBaseUrl} onChange={(event) => setEsploraBaseUrl(event.target.value)} />
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={esploraUseTor}
                      onChange={(event) => setEsploraUseTor(event.target.checked)}
                    />
                    <span>Tor-routed endpoint</span>
                  </label>
                </div>
              </details>
            ) : null}

            {error ? (
              <div className="error-message" role="alert">
                <AlertTriangle size={18} /> {error}
              </div>
            ) : null}

            <div className="button-row">
              <button type="button" className="primary-button" onClick={handleServerContinue}>
                Continue <ArrowRight size={17} />
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="import-form">
          {firstRun ? (
            <div className="server-summary">
              <div>
                <span>Selected server</span>
                <strong>{backendLabel(backend)}</strong>
                <p>{backendChoiceSummary(backend)}</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => setSetupStep("server")}>
                <ArrowLeft size={16} /> Change server
              </button>
            </div>
          ) : null}

          <div className="segmented-control" role="tablist" aria-label="Import type">
            <button
              type="button"
              className={importKind === "descriptor" ? "active" : ""}
              onClick={() => setImportKind("descriptor")}
            >
              <FileKey2 size={16} /> Descriptor
            </button>
            <button
              type="button"
              className={importKind === "xpub" ? "active" : ""}
              onClick={() => setImportKind("xpub")}
            >
              <Upload size={16} /> Xpub
            </button>
          </div>

          <label>
            Wallet name
            <input value={walletName} onChange={(event) => setWalletName(event.target.value)} />
          </label>

          {importKind === "descriptor" ? (
            <label>
              Descriptor
              <textarea
                value={descriptor}
                onChange={(event) => handleWalletMaterialChange("descriptor", event.target.value)}
                placeholder="wpkh([d34db33f/84h/0h/0h]xpub.../0/*)"
                rows={5}
              />
            </label>
          ) : (
            <label>
              Public extended key
              <textarea
                value={xpub}
                onChange={(event) => handleWalletMaterialChange("xpub", event.target.value)}
                placeholder="xpub..."
                rows={4}
              />
            </label>
          )}

          {!firstRun ? (
            <>
              <div className="form-grid essential-grid">
                <label>
                  <FieldLabel label="Network" tooltip={NETWORK_HELP} />
                  <select value={network} onChange={(event) => setNetwork(event.target.value as Network)}>
                    <option value="mainnet">Mainnet</option>
                    <option value="testnet">Testnet</option>
                    <option value="signet">Signet</option>
                    <option value="regtest">Regtest</option>
                  </select>
                </label>
                <label>
                  <FieldLabel label="Backend" tooltip={NODE_SERVER_HELP} />
                  <select value={backend} onChange={(event) => setBackend(event.target.value as BackendKind)}>
                    <option value="mock">Mock backend</option>
                    <option value="bitcoin_core_rpc">Bitcoin Core RPC</option>
                    <option value="electrum" disabled={networkLocked}>Private Electrum</option>
                    <option value="public_electrum" disabled={networkLocked}>Public Electrum</option>
                    <option value="esplora" disabled={networkLocked}>Self-hosted Esplora</option>
                    <option value="public_esplora" disabled={networkLocked}>Public Esplora</option>
                  </select>
                </label>
              </div>

              <label className="checkbox-row network-lock-row">
                <input
                  type="checkbox"
                  checked={networkLocked}
                  onChange={(event) => onNetworkPolicyChange(event.target.checked ? "local_only" : "normal")}
                />
                <span>
                  <strong>Network Lock</strong>
                  Restrict imports to mock/offline mode or localhost Bitcoin Core RPC.
                </span>
              </label>
            </>
          ) : null}

          <details className="advanced-section" open={importKind === "xpub"}>
            <summary>
              <span>Wallet metadata</span>
              <small>Script hints, account path, and scan depth</small>
            </summary>
            <div className="form-grid">
            {importKind === "xpub" ? (
              <>
                <label>
                  Script type
                  <select
                    value={scriptType}
                    onChange={(event) => setScriptType(event.target.value as ScriptType)}
                  >
                    <option value="legacy">Legacy</option>
                    <option value="nested_segwit">Nested SegWit</option>
                    <option value="native_segwit">Native SegWit</option>
                    <option value="taproot">Taproot</option>
                  </select>
                </label>
                <label>
                  Account path
                  <input value={accountPath} onChange={(event) => setAccountPath(event.target.value)} />
                </label>
              </>
            ) : null}
            <label>
              Gap limit
              <input
                type="number"
                min={5}
                max={1000}
                value={gapLimit}
                onChange={(event) => setGapLimit(Number(event.target.value))}
              />
            </label>
            </div>
          </details>

          {!firstRun && publicBackendMode ? (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={acknowledgedPublicApi}
                onChange={(event) => setAcknowledgedPublicApi(event.target.checked)}
              />
              <span>
                {publicElectrumMode
                  ? "I understand public Electrum sees script-hash queries and can infer wallet activity. XpubShield does not route Tor yet."
                  : "I understand public API mode is weak privacy and must not receive raw xpubs or descriptors."}
              </span>
            </label>
          ) : null}

          {!firstRun && backend === "bitcoin_core_rpc" ? (
            <details className="advanced-section backend-config" open>
              <summary>
                <span>Bitcoin Core RPC</span>
                <small>Local node connection, never raw xpub upload</small>
              </summary>
              <div className="section-heading compact-heading">
                <Database size={18} aria-hidden="true" />
                <div>
                  <p>Local node</p>
                  <h2>Bitcoin Core RPC</h2>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  RPC URL
                  <input value={bitcoinCoreUrl} onChange={(event) => setBitcoinCoreUrl(event.target.value)} />
                </label>
                <label>
                  RPC wallet
                  <input value={bitcoinCoreWallet} onChange={(event) => setBitcoinCoreWallet(event.target.value)} />
                </label>
                <label>
                  RPC username
                  <input value={bitcoinCoreUsername} onChange={(event) => setBitcoinCoreUsername(event.target.value)} />
                </label>
                <label>
                  RPC password
                  <input
                    type="password"
                    value={bitcoinCorePassword}
                    onChange={(event) => setBitcoinCorePassword(event.target.value)}
                  />
                </label>
              </div>
            </details>
          ) : null}

          {!firstRun && (backend === "electrum" || backend === "public_electrum") ? (
            <details className="advanced-section backend-config" open>
              <summary>
                <span>{backend === "public_electrum" ? "Public Electrum server" : "Private Electrum server"}</span>
                <small>Local script-hash derivation, no broadcast</small>
              </summary>
              <div className="section-heading compact-heading">
                <Lock size={18} aria-hidden="true" />
                <div>
                  <p>{backend === "public_electrum" ? "Weak privacy" : "Private server"}</p>
                  <h2>Electrum light client</h2>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Server preset
                  <select value={electrumPreset} onChange={(event) => {
                    const preset = ELECTRUM_PRESETS.find((item) => item.id === event.target.value) ?? ELECTRUM_PRESETS[2];
                    setElectrumPreset(preset.id);
                    if (preset.url) setElectrumServerUrl(preset.url);
                    setElectrumDisplayName(preset.label);
                  }}>
                    {ELECTRUM_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>{preset.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Server URL
                  <input value={electrumServerUrl} onChange={(event) => {
                    setElectrumPreset("manual");
                    setElectrumServerUrl(event.target.value);
                  }} placeholder="tcp://127.0.0.1:50001" />
                </label>
                <label>
                  Display name
                  <input value={electrumDisplayName} onChange={(event) => setElectrumDisplayName(event.target.value)} />
                </label>
              </div>
              <p className="plain-text">
                XpubShield derives script hashes locally and queries `blockchain.scripthash.listunspent`.
                It never uploads raw xpubs or descriptors and does not broadcast transactions. TLS, Tor,
                and proxy routing are deferred to a later networking pass.
              </p>
            </details>
          ) : null}

          {!firstRun && (backend === "esplora" || backend === "public_esplora") ? (
            <details className="advanced-section backend-config" open>
              <summary>
                <span>{backend === "public_esplora" ? "Public Esplora endpoint" : "Self-hosted Esplora endpoint"}</span>
                <small>Address/script queries only</small>
              </summary>
              <div className="section-heading compact-heading">
                <Database size={18} aria-hidden="true" />
                <div>
                  <p>{backend === "public_esplora" ? "Weak privacy" : "Self-hosted"}</p>
                  <h2>Esplora API</h2>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Base URL
                  <input value={esploraBaseUrl} onChange={(event) => setEsploraBaseUrl(event.target.value)} />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={esploraUseTor}
                    onChange={(event) => setEsploraUseTor(event.target.checked)}
                  />
                  <span>Tor-routed endpoint</span>
                </label>
              </div>
            </details>
          ) : null}

          {error ? (
            <div className="error-message" role="alert">
              <AlertTriangle size={18} /> {error}
            </div>
          ) : null}

          <div className="button-row">
            <button className="primary-button" disabled={loading}>
              <Upload size={17} /> {loading ? loadingLabel(backend) : "Import and scan"}
            </button>
            <button type="button" className="secondary-button" onClick={handleDemo} disabled={loading}>
              <Database size={17} /> Demo wallet
            </button>
          </div>
        </form>
        )}
      </section>
      {warningDialog === "private-material" ? (
        <WarningDialog
          title="Signing material rejected"
          icon="alert"
          confirmLabel="Got it"
          onClose={() => setWarningDialog(null)}
        >
          <p>
            XpubShield rejects seed phrases, private keys, xprv values, WIF keys, and signing
            material. The field was cleared so this watch-only session does not retain it.
          </p>
        </WarningDialog>
      ) : null}
      {warningDialog === "public-backend" ? (
        <WarningDialog
          title={publicElectrumMode ? "Public Electrum privacy warning" : "Public backend privacy warning"}
          confirmLabel="Continue"
          cancelLabel="Go back"
          onClose={() => setWarningDialog(null)}
          onConfirm={confirmPublicBackendWarning}
        >
          <p>
            {publicElectrumMode
              ? "Public Electrum can reveal script-hash queries and timing metadata. XpubShield derives script hashes locally and never sends a raw xpub or descriptor."
              : "Public API mode can reveal address queries and timing metadata. XpubShield must never send a raw xpub or descriptor to a third-party API."}
          </p>
        </WarningDialog>
      ) : null}
    </main>
  );
}

function FieldLabel({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <span className="field-label-row">
      <span>{label}</span>
      <span className="field-help tooltip-button" tabIndex={0} aria-label={tooltip} title={tooltip} data-tooltip={tooltip}>
        <CircleHelp size={14} aria-hidden="true" />
      </span>
    </span>
  );
}

function OptionHelpSelect<T extends string>({
  label,
  value,
  options,
  showOptionHelp = true,
  open,
  onToggle,
  onChange
}: {
  label: string;
  value: T;
  options: HelpOption<T>[];
  showOptionHelp?: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (value: T) => void;
}) {
  const selectedOption = options.find((option) => option.value === value);
  const listId = `option-help-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <div className="option-help-select">
      <span className="option-help-label">{label}</span>
      <button
        type="button"
        className="option-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggle}
      >
        <span className="option-help-value">
          <span className="option-help-text">{selectedOption?.label ?? value}</span>
          {selectedOption?.common ? <span className="option-common-badge">Common</span> : null}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="option-help-list" id={listId} role="listbox" aria-label={label}>
          {options.map((option) => (
            <div
              className={`option-help-row ${showOptionHelp ? "" : "option-help-row-no-info"} ${option.disabled ? "option-help-row-disabled" : ""}`}
              key={option.value}
            >
              <button
                type="button"
                className="option-help-choice"
                role="option"
                aria-selected={option.value === value}
                disabled={option.disabled}
                onClick={() => onChange(option.value)}
              >
                <span className="option-help-name">
                  <span className="option-help-text">{option.label}</span>
                  {option.common ? <span className="option-common-badge">Common</span> : null}
                </span>
                {option.value === value ? <span className="option-help-selected">Selected</span> : null}
              </button>
              {showOptionHelp ? (
                <button
                  type="button"
                  className="option-help-info tooltip-button"
                  aria-label={`${option.label}: ${option.description}`}
                  data-tooltip={option.description}
                >
                  <CircleHelp size={14} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function looksLikeBareXpub(input: string): boolean {
  return /^[xtyzuv]pub[a-zA-Z0-9]+$/i.test(input.trim());
}

function looksLikeDescriptor(input: string): boolean {
  return /\w+\(.+\)/.test(input.trim()) || input.includes("[") || input.includes("]");
}

function loadingLabel(backend: BackendKind): string {
  if (backend === "bitcoin_core_rpc") return "Scanning local node";
  if (backend === "electrum") return "Scanning Electrum";
  if (backend === "public_electrum") return "Scanning public Electrum";
  if (backend === "esplora") return "Scanning Esplora";
  if (backend === "public_esplora") return "Scanning public API";
  return "Loading demo scan";
}

function backendChoiceSummary(backend: BackendKind): string {
  if (backend === "bitcoin_core_rpc") return "Best privacy when connected to your own local node.";
  if (backend === "electrum") return "Queries a personal Electrum server with locally derived script hashes.";
  if (backend === "public_electrum") return "Convenient light-client mode with weak privacy and no Tor routing yet.";
  if (backend === "esplora") return "Uses a self-hosted Esplora-compatible HTTP endpoint.";
  if (backend === "public_esplora") return "Weak privacy fallback for demo or emergency address scans.";
  return "Local fixture data for learning XpubShield without wallet metadata.";
}

function isLocalEndpoint(value: string): boolean {
  const authority = parseHttpAuthority(value);
  return authority ? isLoopbackHost(authority.host) : false;
}

function parseHttpAuthority(value: string): { host: string } | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("http://")) return null;
  const authority = trimmed.slice("http://".length).split("/")[0];
  if (!authority || authority.includes("@")) return null;

  if (authority.startsWith("[")) {
    const end = authority.indexOf("]");
    if (end <= 1) return null;
    const suffix = authority.slice(end + 1);
    if (suffix && (!suffix.startsWith(":") || !isValidPort(suffix.slice(1)))) return null;
    return { host: authority.slice(1, end).toLowerCase() };
  }

  if (authority.includes("[") || authority.includes("]")) return null;
  const portSeparator = authority.lastIndexOf(":");
  const host = portSeparator >= 0 ? authority.slice(0, portSeparator) : authority;
  const port = portSeparator >= 0 ? authority.slice(portSeparator + 1) : "";
  if (!host || host.includes(":")) return null;
  if (portSeparator >= 0 && !isValidPort(port)) return null;
  return { host: host.toLowerCase() };
}

function isValidPort(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const port = Number(value);
  return Number.isInteger(port) && port <= 65535;
}

function isLoopbackHost(host: string): boolean {
  if (host === "localhost" || host === "::1") return true;
  const octets = host.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => {
      if (!/^\d+$/.test(octet)) return false;
      const value = Number(octet);
      return Number.isInteger(value) && value >= 0 && value <= 255;
    })
  );
}
