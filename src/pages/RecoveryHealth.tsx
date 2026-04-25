import { Download, FileJson, HeartPulse } from "lucide-react";
import { useMemo, useState } from "react";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import { MetricCard } from "../components/MetricCard";
import { StatusPill } from "../components/StatusPill";
import { humanize } from "../lib/format";
import { statusToSeverity, type EvidenceItem } from "../lib/ops";
import { buildRecoveryHealth } from "../lib/phase3";
import type { WalletReport } from "../types/domain";

interface RecoveryHealthProps {
  report: WalletReport;
  onNavigate?: (page: string) => void;
}

export function RecoveryHealth({ report, onNavigate }: RecoveryHealthProps) {
  const health = useMemo(() => buildRecoveryHealth(report), [report]);
  const checklist = useMemo(() => buildRecoveryChecklist(report), [report]);
  const [activeEvidence, setActiveEvidence] = useState<EvidenceItem | null>(null);

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p>{report.wallet.name}</p>
          <h1>Recovery drill</h1>
        </div>
        <StatusPill label="Local report" tone="good" />
      </section>

      <section className="metric-grid">
        <MetricCard icon={HeartPulse} label="Recovery score" value={`${health.score}/100`} score={health.score} />
        <MetricCard icon={FileJson} label="Descriptors" value={String(report.descriptors.length)} />
      </section>

      <section className="button-row">
        <button type="button" className="secondary-button" onClick={() => downloadText("xpubshield-recovery-report.md", health.markdown)}>
          <Download size={17} /> Markdown
        </button>
        <button type="button" className="secondary-button" onClick={() => downloadText("xpubshield-recovery-report.json", health.json)}>
          <Download size={17} /> JSON
        </button>
      </section>

      <section className="workflow-dock" aria-label="Recovery diagnostics">
        <article className="workflow-lens-card">
          <span>Descriptor diagnostic</span>
          <strong>Compare descriptor or xpub previews when recovery identity feels ambiguous.</strong>
          <button type="button" className="secondary-button" onClick={() => onNavigate?.("descriptor_diff")}>
            Open descriptor diff
          </button>
        </article>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <h2>Operator checklist</h2>
            <StatusPill label={`${checklist.filter((item) => item.status === "good").length}/${checklist.length} ready`} />
          </div>
          <div className="finding-list">
            {checklist.map((item) => (
              <article className="finding-row recovery-check" key={item.label}>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                </div>
                <div className="evidence-actions">
                  <StatusPill label={humanize(item.status)} tone={item.status === "good" ? "good" : item.status === "warn" ? "warn" : "bad"} />
                  <button
                    type="button"
                    className="ghost-button evidence-link"
                    onClick={() => setActiveEvidence(recoveryChecklistEvidence(item, report))}
                  >
                    Evidence
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Metadata</h2>
            <StatusPill label={`${health.fields.length} fields`} />
          </div>
          <div className="shape-list">
            {health.fields.map((field) => (
              <div className="shape-row" key={field.label}>
                <span>{field.label}</span>
                <strong>{field.value}</strong>
                <StatusPill label={humanize(field.status)} tone={field.status === "bad" ? "bad" : field.status === "warn" ? "warn" : "good"} />
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Warnings</h2>
            <StatusPill label={`${health.warnings.length} items`} tone={health.warnings.length ? "warn" : "good"} />
          </div>
          {health.warnings.length ? (
            <div className="finding-list">
              {health.warnings.map((warning) => (
                <article className="finding-row" key={warning}>
                  <div className="finding-title">
                    <strong>{warning}</strong>
                    <button
                      type="button"
                      className="ghost-button evidence-link"
                      onClick={() => setActiveEvidence(recoveryWarningEvidence(warning, report))}
                    >
                      Evidence
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No major recovery metadata warnings.</p>
          )}
        </div>
      </section>
      <EvidenceDrawer item={activeEvidence} onClose={() => setActiveEvidence(null)} />
    </main>
  );
}

function buildRecoveryChecklist(report: WalletReport) {
  const hasExternal = report.descriptors.some((descriptor) => descriptor.keychain === "external");
  const hasChange = report.descriptors.some((descriptor) => descriptor.keychain === "change");
  const hasFingerprint = report.descriptors.every((descriptor) => Boolean(descriptor.master_fingerprint));
  const hasPath = report.descriptors.every((descriptor) => Boolean(descriptor.account_path));
  const hasChecksum = report.descriptors.every((descriptor) => Boolean(descriptor.checksum));
  const multisig = report.descriptors.some((descriptor) => descriptor.script_type === "multisig");

  return [
    {
      label: "Descriptor completeness",
      status: hasExternal && hasChange && hasChecksum ? "good" : hasExternal ? "warn" : "bad",
      detail: "External, change, and checksummed descriptors should be available before an emergency restore."
    },
    {
      label: "Fingerprint and path coverage",
      status: hasFingerprint && hasPath ? "good" : "warn",
      detail: "Master fingerprint and account path metadata help verify hardware-wallet identity and derivation."
    },
    {
      label: "Gap risk",
      status: report.wallet.gap_limit >= 20 ? "good" : "warn",
      detail: "A gap limit below 20 can miss addresses during restore or independent wallet verification."
    },
    {
      label: "Multisig metadata",
      status: multisig ? "warn" : "good",
      detail: multisig ? "Confirm cosigner fingerprints, derivation paths, and policy quorum outside this app." : "No multisig policy was detected."
    },
    {
      label: "Export readiness",
      status: report.descriptors.length > 0 && report.derived_addresses.length > 0 ? "good" : "bad",
      detail: "The recovery export should include descriptors plus enough address history to verify the watch-only view."
    }
  ] as const;
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type RecoveryChecklistItem = ReturnType<typeof buildRecoveryChecklist>[number];

function recoveryChecklistEvidence(item: RecoveryChecklistItem, report: WalletReport): EvidenceItem {
  return {
    id: `recovery-check:${item.label}`,
    title: item.label,
    severity: statusToSeverity(item.status),
    confidence: "high",
    why: item.detail,
    action: recoveryAction(item),
    evidence: [
      `Status: ${humanize(item.status)}`,
      `Descriptors tracked: ${report.descriptors.length}`,
      `Derived addresses scanned: ${report.derived_addresses.length}`,
      `Gap limit: ${report.wallet.gap_limit}`
    ],
    affectedCount: report.descriptors.length
  };
}

function recoveryWarningEvidence(warning: string, report: WalletReport): EvidenceItem {
  return {
    id: `recovery-warning:${warning}`,
    title: "Recovery warning",
    severity: "medium",
    confidence: "high",
    why: warning,
    action: "Verify descriptor, fingerprint, path, change, and gap metadata against your recovery source before relying on this wallet view.",
    evidence: [
      `Wallet import type: ${report.wallet.descriptor_based ? "descriptor" : "xpub"}`,
      `Descriptor count: ${report.descriptors.length}`,
      `Gap limit: ${report.wallet.gap_limit}`,
      ...report.descriptors.slice(0, 3).map((descriptor) => `${descriptor.keychain}: ${descriptor.master_fingerprint ?? "missing fingerprint"} / ${descriptor.account_path ?? "missing path"}`)
    ],
    affectedCount: report.descriptors.length
  };
}

function recoveryAction(item: RecoveryChecklistItem): string {
  if (item.status === "good") {
    return "Keep this metadata exported with your watch-only recovery records.";
  }
  if (item.label === "Descriptor completeness") {
    return "Import or export both external and change descriptors with checksums.";
  }
  if (item.label === "Fingerprint and path coverage") {
    return "Confirm master fingerprint and account path metadata from the signing device.";
  }
  if (item.label === "Gap risk") {
    return "Use a gap limit of at least 20 when scanning or restoring elsewhere.";
  }
  if (item.label === "Multisig metadata") {
    return "Verify cosigner fingerprints, derivation paths, and quorum policy outside this app.";
  }
  return "Export the recovery report and resolve missing metadata before relying on this wallet operationally.";
}
