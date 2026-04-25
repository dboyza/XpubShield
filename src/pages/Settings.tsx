import { BookOpenCheck, Database, Download, HardDrive, Server, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MetricCard } from "../components/MetricCard";
import { StatusPill } from "../components/StatusPill";
import { clearLocalCache, getLocalDataPath, listLabels, upsertLabel } from "../api/tauri";
import { backendLabel, humanize } from "../lib/format";
import { SOURCE_CATEGORIES } from "../lib/phase2";
import { buildRecoveryHealth } from "../lib/phase3";
import { ELECTRUM_PRESETS, type BackendPreferences, type ElectrumPresetId } from "../lib/setupPreferences";
import type { BackendKind, Label, Network, NetworkPolicy, ScriptType, SourceCategory, WalletReport } from "../types/domain";

interface SettingsProps {
  report: WalletReport;
  backendPreferences: BackendPreferences;
  networkPolicy: NetworkPolicy;
  onBackendPreferencesChange: (patch: Partial<BackendPreferences>) => void;
  onNetworkPolicyChange: (policy: NetworkPolicy) => void;
  onTutorialReset: () => void;
  onOpenSetup: () => void;
  onCacheCleared: () => void;
}

export function Settings({
  report,
  backendPreferences,
  networkPolicy,
  onBackendPreferencesChange,
  onNetworkPolicyChange,
  onTutorialReset,
  onOpenSetup,
  onCacheCleared
}: SettingsProps) {
  const [dataPath, setDataPath] = useState<string | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [labelTargetType, setLabelTargetType] = useState("utxo");
  const [labelTargetId, setLabelTargetId] = useState(report.utxos[0]?.outpoint ?? "");
  const [labelText, setLabelText] = useState("");
  const [labelCategory, setLabelCategory] = useState<SourceCategory>("unknown");
  const [clearing, setClearing] = useState(false);
  const recovery = useMemo(() => buildRecoveryHealth(report), [report]);
  const publicMode = report.wallet.backend === "public_esplora" || report.wallet.backend === "public_electrum";
  const networkLocked = networkPolicy === "local_only";

  useEffect(() => {
    getLocalDataPath().then(setDataPath);
    listLabels().then(setLabels).catch(() => setLabels([]));
  }, []);

  async function saveLabel() {
    const updated = await upsertLabel({
      target_type: labelTargetType,
      target_id: labelTargetId,
      label: labelText,
      category: labelCategory
    });
    setLabels(updated);
    setLabelText("");
  }

  async function clearCache() {
    const confirmed = window.confirm("Clear local XpubShield wallet cache on this device? This does not affect your Bitcoin wallet or signing devices.");
    if (!confirmed) return;
    setClearing(true);
    try {
      await clearLocalCache();
      onCacheCleared();
    } finally {
      setClearing(false);
    }
  }

  function openSetup() {
    const confirmed = window.confirm("Are you sure you want to reopen setup onboarding? This will leave the current cockpit view so you can choose a node server and import source again. It does not clear local wallet cache.");
    if (confirmed) onOpenSetup();
  }

  function changeNetworkLock(checked: boolean) {
    const nextPolicy = checked ? "local_only" : "normal";
    onNetworkPolicyChange(nextPolicy);
    if (checked && backendPreferences.backend !== "mock" && backendPreferences.backend !== "bitcoin_core_rpc") {
      onBackendPreferencesChange({ backend: "mock" });
    }
  }

  function changeDefaultBackend(nextBackend: BackendKind) {
    if (nextBackend === "public_electrum") {
      const preset = ELECTRUM_PRESETS[0];
      onBackendPreferencesChange({
        backend: nextBackend,
        electrumPreset: preset.id,
        electrumServerUrl: preset.url,
        electrumDisplayName: preset.label
      });
      return;
    }
    if (nextBackend === "electrum") {
      const preset = ELECTRUM_PRESETS[1];
      onBackendPreferencesChange({
        backend: nextBackend,
        electrumPreset: preset.id,
        electrumServerUrl: preset.url,
        electrumDisplayName: preset.label
      });
      return;
    }
    if (nextBackend === "public_esplora") {
      onBackendPreferencesChange({
        backend: nextBackend,
        esploraBaseUrl: "https://mempool.space/api",
        esploraUseTor: false
      });
      return;
    }
    if (nextBackend === "esplora") {
      onBackendPreferencesChange({
        backend: nextBackend,
        esploraBaseUrl: "http://127.0.0.1:3000",
        esploraUseTor: false
      });
      return;
    }
    onBackendPreferencesChange({ backend: nextBackend });
  }

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p>{report.wallet.name}</p>
          <h1>Settings</h1>
        </div>
        <StatusPill label="Local only" tone="good" />
      </section>

      <section className={publicMode ? "privacy-warning privacy-warning-public" : "privacy-warning"}>
        <ShieldAlert size={20} />
        <div>
          <strong>{publicMode ? "Public backend mode is weak privacy" : "Watch-only local data"}</strong>
          <p>XpubShield stores wallet metadata locally. It must not receive seed phrases, private keys, xprv values, WIF keys, signing material, or raw private data for cloud sync.</p>
          <p>Raw xpubs and descriptors are never uploaded by backend scans; live backends query derived addresses or Electrum script hashes only.</p>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard icon={Server} label="Backend" value={backendLabel(report.wallet.backend)} score={report.backend_privacy.score} />
        <MetricCard icon={ShieldAlert} label="Backend privacy" value={`${report.backend_privacy.score}/100`} score={report.backend_privacy.score} />
        <MetricCard icon={Database} label="Network" value={humanize(report.wallet.network)} />
        <MetricCard icon={HardDrive} label="Gap limit" value={String(report.wallet.gap_limit)} />
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <h2>Backend and privacy</h2>
            <StatusPill label={publicMode ? "Weak privacy" : "Configured"} tone={publicMode ? "bad" : "good"} />
          </div>
          <div className="shape-list">
            <SettingRow label="Backend mode" value={backendLabel(report.wallet.backend)} />
            <SettingRow label="Network" value={humanize(report.wallet.network)} />
            <SettingRow label="Public backend warnings" value={publicMode ? "Enabled and unavoidable" : "Not active"} />
            <SettingRow label="Network Lock" value={networkLocked ? "Local-only imports" : "Normal backend selection"} />
            <SettingRow label="Descriptor identity" value={report.wallet.descriptor_based ? "Descriptor based" : "Bare xpub import"} />
            <SettingRow label="Data directory" value={dataPath ?? "Browser demo or unavailable"} />
          </div>
          <label className="checkbox-row network-lock-row">
            <input
              type="checkbox"
              checked={networkLocked}
              onChange={(event) => changeNetworkLock(event.target.checked)}
            />
            <span>
              <strong>Network Lock</strong>
              Restrict future imports to mock/offline mode or localhost Bitcoin Core RPC.
            </span>
          </label>
          <div className="settings-subsection">
            <div className="panel-heading compact-heading">
              <h2>Future import defaults</h2>
              <StatusPill label={backendLabel(backendPreferences.backend)} />
            </div>
            <div className="action-grid detail-grid">
              <label>
                Network
                <select
                  value={backendPreferences.network}
                  onChange={(event) => onBackendPreferencesChange({ network: event.target.value as Network })}
                >
                  <option value="mainnet">Mainnet</option>
                  <option value="testnet">Testnet</option>
                  <option value="signet">Signet</option>
                  <option value="regtest">Regtest</option>
                </select>
              </label>
              <label>
                Backend
                <select
                  value={backendPreferences.backend}
                  onChange={(event) => changeDefaultBackend(event.target.value as BackendKind)}
                >
                  <option value="mock">Demo / mock backend</option>
                  <option value="bitcoin_core_rpc">Bitcoin Core RPC</option>
                  <option value="electrum" disabled={networkLocked}>Private Electrum</option>
                  <option value="public_electrum" disabled={networkLocked}>Public Electrum</option>
                  <option value="esplora" disabled={networkLocked}>Self-hosted Esplora</option>
                  <option value="public_esplora" disabled={networkLocked}>Public Esplora</option>
                </select>
              </label>
              <label>
                Gap limit
                <input
                  type="number"
                  min={5}
                  max={1000}
                  value={backendPreferences.gapLimit}
                  onChange={(event) => onBackendPreferencesChange({ gapLimit: Number(event.target.value) })}
                />
              </label>
              <label>
                Xpub script type
                <select
                  value={backendPreferences.scriptType}
                  onChange={(event) => onBackendPreferencesChange({ scriptType: event.target.value as ScriptType })}
                >
                  <option value="legacy">Legacy</option>
                  <option value="nested_segwit">Nested SegWit</option>
                  <option value="native_segwit">Native SegWit</option>
                  <option value="taproot">Taproot</option>
                </select>
              </label>
              <label>
                Xpub account path
                <input
                  value={backendPreferences.accountPath}
                  onChange={(event) => onBackendPreferencesChange({ accountPath: event.target.value })}
                />
              </label>
            </div>

            {backendPreferences.backend === "bitcoin_core_rpc" ? (
              <div className="action-grid detail-grid settings-backend-fields">
                <label>
                  RPC URL
                  <input
                    value={backendPreferences.bitcoinCoreUrl}
                    onChange={(event) => onBackendPreferencesChange({ bitcoinCoreUrl: event.target.value })}
                  />
                </label>
                <label>
                  RPC wallet
                  <input
                    value={backendPreferences.bitcoinCoreWallet}
                    onChange={(event) => onBackendPreferencesChange({ bitcoinCoreWallet: event.target.value })}
                  />
                </label>
                <label>
                  RPC username
                  <input
                    value={backendPreferences.bitcoinCoreUsername}
                    onChange={(event) => onBackendPreferencesChange({ bitcoinCoreUsername: event.target.value })}
                  />
                </label>
                <label>
                  RPC password
                  <input
                    type="password"
                    value={backendPreferences.bitcoinCorePassword}
                    onChange={(event) => onBackendPreferencesChange({ bitcoinCorePassword: event.target.value })}
                  />
                </label>
              </div>
            ) : null}

            {backendPreferences.backend === "electrum" || backendPreferences.backend === "public_electrum" ? (
              <div className="action-grid detail-grid settings-backend-fields">
                <label>
                  Electrum preset
                  <select
                    value={backendPreferences.electrumPreset}
                    onChange={(event) => {
                      const preset = ELECTRUM_PRESETS.find((item) => item.id === event.target.value) ?? ELECTRUM_PRESETS[2];
                      onBackendPreferencesChange({
                        electrumPreset: preset.id as ElectrumPresetId,
                        electrumServerUrl: preset.url || backendPreferences.electrumServerUrl,
                        electrumDisplayName: preset.label
                      });
                    }}
                  >
                    {ELECTRUM_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>{preset.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Electrum URL
                  <input
                    value={backendPreferences.electrumServerUrl}
                    onChange={(event) => onBackendPreferencesChange({
                      electrumPreset: "manual",
                      electrumServerUrl: event.target.value
                    })}
                  />
                </label>
                <label>
                  Display name
                  <input
                    value={backendPreferences.electrumDisplayName}
                    onChange={(event) => onBackendPreferencesChange({ electrumDisplayName: event.target.value })}
                  />
                </label>
              </div>
            ) : null}

            {backendPreferences.backend === "esplora" || backendPreferences.backend === "public_esplora" ? (
              <div className="action-grid detail-grid settings-backend-fields">
                <label>
                  Esplora base URL
                  <input
                    value={backendPreferences.esploraBaseUrl}
                    onChange={(event) => onBackendPreferencesChange({ esploraBaseUrl: event.target.value })}
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={backendPreferences.esploraUseTor}
                    onChange={(event) => onBackendPreferencesChange({ esploraUseTor: event.target.checked })}
                  />
                  <span>Tor-routed endpoint</span>
                </label>
              </div>
            ) : null}
            <p className="plain-text">
              These defaults are used by first-run onboarding and future imports. They do not rewrite
              the currently loaded wallet report.
            </p>
            <div className="button-row settings-actions">
              <button type="button" className="secondary-button" onClick={openSetup}>
                <Server size={17} /> Reopen setup onboarding
              </button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Local exports</h2>
            <StatusPill label="No sync" tone="good" />
          </div>
          <div className="button-row settings-actions">
            <button type="button" className="secondary-button" onClick={() => downloadText("xpubshield-labels.json", labelsJson(report))}>
              <Download size={17} /> Export labels
            </button>
            <button type="button" className="secondary-button" onClick={() => downloadText("xpubshield-recovery-report.json", recovery.json)}>
              <Download size={17} /> Export recovery JSON
            </button>
            <button type="button" className="secondary-button danger-button" onClick={clearCache} disabled={clearing}>
              <Trash2 size={17} /> {clearing ? "Clearing" : "Clear local cache"}
            </button>
          </div>
          <p className="plain-text">
            Exports are created locally by your desktop app. Review files before storing them anywhere else because labels, descriptors, addresses, and wallet history are sensitive metadata.
          </p>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Tutorial</h2>
            <StatusPill label="Optional" />
          </div>
          <div className="button-row settings-actions">
            <button type="button" className="secondary-button" onClick={onTutorialReset}>
              <BookOpenCheck size={17} /> Restart tutorial
            </button>
          </div>
          <p className="plain-text">
            Reopens the local Sovereign Ops walkthrough. This only resets tutorial state and does not clear wallet metadata.
          </p>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <h2>Label registry</h2>
            <StatusPill label={`${labels.length} saved`} />
          </div>
          <div className="action-grid detail-grid">
            <label>
              Target type
              <select value={labelTargetType} onChange={(event) => setLabelTargetType(event.target.value)}>
                <option value="utxo">UTXO</option>
                <option value="address">Address</option>
                <option value="transaction">Transaction</option>
                <option value="source">Source</option>
                <option value="category">Category</option>
              </select>
            </label>
            <label>
              Target id
              <input value={labelTargetId} onChange={(event) => setLabelTargetId(event.target.value)} />
            </label>
            <label>
              Label
              <input value={labelText} onChange={(event) => setLabelText(event.target.value)} />
            </label>
            <label>
              Category
              <select value={labelCategory} onChange={(event) => setLabelCategory(event.target.value as SourceCategory)}>
                {SOURCE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{humanize(category)}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="button-row settings-actions">
            <button type="button" className="secondary-button" onClick={saveLabel} disabled={!labelTargetId || !labelText}>
              Save label
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Saved labels</h2>
            <StatusPill label="SQLite" tone="good" />
          </div>
          {labels.length ? (
            <div className="shape-list">
              {labels.map((label) => (
                <SettingRow
                  key={label.id}
                  label={`${humanize(label.target_type)}: ${label.target_id}`}
                  value={`${label.label} (${humanize(label.category)})`}
                />
              ))}
            </div>
          ) : (
            <p className="empty-state">No generic labels saved yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="shape-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function labelsJson(report: WalletReport): string {
  return JSON.stringify(
    {
      wallet_id: report.wallet.id,
      exported_at: new Date().toISOString(),
      utxo_labels: report.utxos.map((utxo) => ({
        outpoint: utxo.outpoint,
        label: utxo.label,
        source_label: utxo.source_label,
        source_category: utxo.source_category,
        quarantine_status: utxo.quarantine_status,
        spendability_status: utxo.spendability_status
      }))
    },
    null,
    2
  );
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
