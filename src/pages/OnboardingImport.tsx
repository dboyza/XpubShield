import { AlertTriangle, ArrowLeft, ArrowRight, Database, FileKey2, Lock, Server, Upload, WalletCards } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { importWallet, isTauriRuntime, loadDemoWallet, looksLikePrivateMaterial } from "../api/tauri";
import { PrivacyWarning } from "../components/PrivacyWarning";
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const publicApiMode = backend === "public_esplora";
  const publicElectrumMode = backend === "public_electrum";
  const publicBackendMode = publicApiMode || publicElectrumMode;
  const networkLocked = networkPolicy === "local_only";
  const desktopPersistenceAvailable = isTauriRuntime();

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
    const backendError = validateBackendConfiguration();
    if (backendError) {
      setError(backendError);
      return;
    }
    setSetupStep("wallet");
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
      setError(
        "Private key material was rejected. This app is watch-only and does not process seeds, xprv values, WIF keys, or signing material."
      );
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

  function validateBackendConfiguration(): string | null {
    if (networkLocked && backend !== "mock" && backend !== "bitcoin_core_rpc") {
      return "Network Lock is enabled. Choose Mock backend or local Bitcoin Core RPC before importing.";
    }
    if (networkLocked && backend === "bitcoin_core_rpc" && !isLocalEndpoint(bitcoinCoreUrl)) {
      return "Network Lock requires Bitcoin Core RPC to use localhost, 127.0.0.1, or [::1].";
    }
    if (publicBackendMode && !acknowledgedPublicApi) {
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
        <div className="section-heading">
          {firstRun && setupStep === "server" ? <Server size={22} aria-hidden="true" /> : <WalletCards size={22} aria-hidden="true" />}
          <div>
            <p>{firstRun ? (setupStep === "server" ? "First run / node" : "First run / wallet") : "Phase 1"}</p>
            <h1>{firstRun ? (setupStep === "server" ? "Choose your node server" : "Import watch-only wallet") : "Import watch-only wallet"}</h1>
          </div>
        </div>

        {firstRun ? (
          <div className="onboarding-progress" aria-label="Onboarding progress">
            <span className={setupStep === "server" ? "active" : ""}>1. Server</span>
            <span className={setupStep === "wallet" ? "active" : ""}>2. Wallet</span>
          </div>
        ) : null}

        <PrivacyWarning publicApiMode={publicBackendMode} publicBackendKind={backend} />

        {!desktopPersistenceAvailable ? (
          <div className="runtime-notice" role="status">
            <Database size={18} aria-hidden="true" />
            <div>
              <strong>Browser demo mode</strong>
              <p>This localhost session does not have Tauri IPC, so desktop SQLite persistence and live commands may be unavailable. The packaged app stores wallet metadata locally.</p>
            </div>
          </div>
        ) : null}

        {firstRun && setupStep === "server" ? (
          <div className="import-form server-step">
            <div className="setup-intro">
              <strong>Pick the source XpubShield should query for watch-only blockchain data.</strong>
              <p>
                Raw xpubs and descriptors stay local. Public servers are convenient, but they can infer
                wallet activity from address or script-hash queries.
              </p>
            </div>

            <div className="form-grid essential-grid">
              <label>
                Network
                <select value={network} onChange={(event) => setNetwork(event.target.value as Network)}>
                  <option value="mainnet">Mainnet</option>
                  <option value="testnet">Testnet</option>
                  <option value="signet">Signet</option>
                  <option value="regtest">Regtest</option>
                </select>
              </label>
              <label>
                Node server
                <select value={backend} onChange={(event) => setBackend(event.target.value as BackendKind)}>
                  <option value="mock">Demo / mock backend</option>
                  <option value="bitcoin_core_rpc">Bitcoin Core RPC</option>
                  <option value="electrum" disabled={networkLocked}>Private Electrum</option>
                  <option value="public_electrum" disabled={networkLocked}>Public Electrum</option>
                  <option value="esplora" disabled={networkLocked}>Self-hosted Esplora</option>
                  <option value="public_esplora" disabled={networkLocked}>Public Esplora</option>
                </select>
              </label>
            </div>

            <div className="server-choice-note">
              <strong>{backendLabel(backend)}</strong>
              <span>{backendChoiceSummary(backend)}</span>
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

            {publicBackendMode ? (
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
                onChange={(event) => setDescriptor(event.target.value)}
                placeholder="wpkh([d34db33f/84h/0h/0h]xpub.../0/*)"
                rows={5}
              />
            </label>
          ) : (
            <label>
              Public extended key
              <textarea
                value={xpub}
                onChange={(event) => setXpub(event.target.value)}
                placeholder="xpub..."
                rows={4}
              />
            </label>
          )}

          {!firstRun ? (
            <>
              <div className="form-grid essential-grid">
                <label>
                  Network
                  <select value={network} onChange={(event) => setNetwork(event.target.value as Network)}>
                    <option value="mainnet">Mainnet</option>
                    <option value="testnet">Testnet</option>
                    <option value="signet">Signet</option>
                    <option value="regtest">Regtest</option>
                  </select>
                </label>
                <label>
                  Backend
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
    </main>
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
  return (
    value.startsWith("http://127.0.0.1") ||
    value.startsWith("http://localhost") ||
    value.startsWith("http://[::1]")
  );
}
