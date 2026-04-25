import { X } from "lucide-react";
import { useEffect } from "react";
import { humanize } from "../lib/format";
import type { EvidenceItem } from "../lib/ops";
import { severityToTone } from "../lib/ops";
import { RiskBadge } from "./RiskBadge";
import { StatusPill } from "./StatusPill";

interface EvidenceDrawerProps {
  item: EvidenceItem | null;
  onClose: () => void;
}

export function EvidenceDrawer({ item, onClose }: EvidenceDrawerProps) {
  useEffect(() => {
    if (!item) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <aside
      className="detail-drawer evidence-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-drawer-title"
    >
      <div className="detail-drawer-header">
        <div>
          <p>Evidence drawer</p>
          <h2 id="evidence-drawer-title">{item.title}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close evidence drawer">
          <X size={16} />
        </button>
      </div>

      <section className="panel embedded-form evidence-summary">
        <div className="finding-title">
          <RiskBadge severity={item.severity} />
          <StatusPill label={`${humanize(item.confidence)} confidence`} tone={severityToTone(item.severity)} />
        </div>
        {item.affectedCount !== undefined ? (
          <span className="evidence-count">{item.affectedCount} affected {item.affectedCount === 1 ? "item" : "items"}</span>
        ) : null}
      </section>

      <EvidenceBlock title="Why do we think this?" body={item.why} />
      <EvidenceBlock title="What can the user do?" body={item.action} />

      <section className="panel embedded-form">
        <div className="panel-heading">
          <h2>Observed evidence</h2>
          <StatusPill label={`${item.evidence.length} signals`} />
        </div>
        <ul className="evidence-list">
          {item.evidence.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function EvidenceBlock({ title, body }: { title: string; body: string }) {
  return (
    <section className="panel embedded-form evidence-block">
      <span>{title}</span>
      <p>{body}</p>
    </section>
  );
}
