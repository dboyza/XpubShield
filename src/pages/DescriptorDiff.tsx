import { GitCompareArrows } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { compareDescriptors } from "../api/tauri";
import { StatusPill } from "../components/StatusPill";
import { compareDescriptorInputs, type DescriptorDiffResult } from "../lib/phase3";
import type { WalletReport } from "../types/domain";

interface DescriptorDiffProps {
  report: WalletReport;
}

export function DescriptorDiff({ report }: DescriptorDiffProps) {
  const defaultDescriptor = report.descriptors[0]?.descriptor ?? "";
  const [left, setLeft] = useState(defaultDescriptor);
  const [right, setRight] = useState(defaultDescriptor);
  const fallbackDiff = useMemo(() => compareDescriptorInputs(left, right), [left, right]);
  const [backendDiff, setBackendDiff] = useState<DescriptorDiffResult | null>(null);
  const diff = backendDiff ?? fallbackDiff;

  useEffect(() => {
    let cancelled = false;
    compareDescriptors(left, right, report.wallet.network)
      .then((result) => {
        if (!cancelled) setBackendDiff(result);
      })
      .catch(() => {
        if (!cancelled) setBackendDiff(null);
      });
    return () => {
      cancelled = true;
    };
  }, [left, right, report.wallet.network]);

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p>{report.wallet.name} · Recovery diagnostic</p>
          <h1>Descriptor diff</h1>
        </div>
        <StatusPill label={diff.sameFirst20 ? "Preview match" : "Preview differs"} tone={diff.sameFirst20 ? "good" : "warn"} />
      </section>

      <section className="privacy-warning">
        <GitCompareArrows size={20} aria-hidden="true" />
        <div>
          <strong>Watch-only identity comparison</strong>
          <p>
            XpubShield derives descriptor previews locally in the Rust backend when possible. Raw
            xpubs and descriptors are not sent to external services.
          </p>
        </div>
      </section>

      <section className="simulator-grid">
        <label>
          Left descriptor or xpub
          <textarea rows={7} value={left} onChange={(event) => setLeft(event.target.value)} />
        </label>
        <label>
          Right descriptor or xpub
          <textarea rows={7} value={right} onChange={(event) => setRight(event.target.value)} />
        </label>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Comparison</h2>
          <StatusPill label={diff.summary.includes("same") ? "Likely same" : "Review"} tone={diff.summary.includes("same") ? "good" : "warn"} />
        </div>
        <p className="plain-text">{diff.summary}</p>
        {(diff.left.derivationError || diff.right.derivationError) && (
          <div className="privacy-warning inline-warning">
            <GitCompareArrows size={18} aria-hidden="true" />
            <div>
              <strong>Manual review needed</strong>
              <p>
                {diff.left.derivationError || diff.right.derivationError}
              </p>
            </div>
          </div>
        )}
        <div className="table-panel embedded-table">
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Left</th>
                <th>Right</th>
                <th>Match</th>
              </tr>
            </thead>
            <tbody>
              {diff.rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.left}</td>
                  <td>{row.right}</td>
                  <td>
                    <StatusPill label={row.match ? "Match" : "Diff"} tone={row.match ? "good" : "warn"} />
                  </td>
                </tr>
              ))}
              <tr>
                <td>First 20 address previews</td>
                <td>{diff.left.addressPreview[0]}</td>
                <td>{diff.right.addressPreview[0]}</td>
                <td>
                  <StatusPill label={diff.sameFirst20 ? "Match" : "Diff"} tone={diff.sameFirst20 ? "good" : "warn"} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-grid">
        <Preview title="Left preview" addresses={diff.left.addressPreview} />
        <Preview title="Right preview" addresses={diff.right.addressPreview} />
      </section>
    </main>
  );
}

function Preview({ title, addresses }: { title: string; addresses: string[] }) {
  return (
    <div className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <StatusPill label={`${addresses.length} rows`} />
      </div>
      <div className="preview-list">
        {addresses.map((address, index) => (
          <div className="shape-row" key={address}>
            <span>/{index}</span>
            <strong>{address}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
