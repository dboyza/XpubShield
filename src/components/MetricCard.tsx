import type { LucideIcon } from "lucide-react";
import { scoreTone } from "../lib/format";

interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  score?: number;
  icon: LucideIcon;
}

export function MetricCard({ label, value, detail, score, icon: Icon }: MetricCardProps) {
  const tone = typeof score === "number" ? scoreTone(score) : "good";

  return (
    <section className={`metric metric-${tone}`}>
      <div className="metric-icon" aria-hidden="true">
        <Icon size={18} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
    </section>
  );
}
