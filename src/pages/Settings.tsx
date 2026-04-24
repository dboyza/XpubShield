import { Database, Download, HardDrive, Server, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MetricCard } from "../components/MetricCard";
import { StatusPill } from "../components/StatusPill";
import { clearLocalCache, getLocalDataPath } from "../api/tauri";
import { backendLabel, humanize } from "../lib/format";
import { buildRecoveryHealth } from "../lib/phase3";
import type { WalletReport } from "../types/domain";

interface SettingsProps {
  report: WalletReport;
  onCacheCleared: () => void;
}

export function Settings({ report, onCacheCleared }: SettingsProps) {
  const [dataPath, setDataPath] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const recovery = useMemo(() => buildRecoveryHealth(report), [report]);
  const publicMode = report.wallet.backend === "public_esplora";

  useEffect(() => {
    getLocalDataPath().then(setDataPath);
  }, []);

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
          <strong>{publicMode ? "Public API mode is weak privacy" : "Watch-only local data"}</strong>
          <p>XpubShield stores wallet metadata locally. It must not receive seed phrases, private keys, xprv values, WIF keys, signing material, or raw private data for cloud sync.</p>
          <p>Raw xpubs and descriptors are never uploaded by backend scans; live backends query derived addresses only.</p>
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
            <SettingRow label="Public API warnings" value={publicMode ? "Enabled and unavoidable" : "Not active"} />
            <SettingRow label="Descriptor identity" value={report.wallet.descriptor_based ? "Descriptor based" : "Bare xpub import"} />
            <SettingRow label="Data directory" value={dataPath ?? "Browser demo or unavailable"} />
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
