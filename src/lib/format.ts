import type { BackendKind, ScriptType, Severity, SourceCategory } from "../types/domain";

export function satsToBtc(sats: number): string {
  return `${(sats / 100_000_000).toFixed(8)} BTC`;
}

export function compactSats(sats: number): string {
  return new Intl.NumberFormat("en-US").format(sats);
}

export function humanize(value: string): string {
  return value
    .split("_")
    .map((part) => (part === "p2p" ? "P2P" : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

export function txidPrefix(txid: string): string {
  return `${txid.slice(0, 8)}…${txid.slice(-6)}`;
}

export function severityRank(severity: Severity): number {
  return { critical: 5, high: 4, medium: 3, low: 2, info: 1 }[severity];
}

export function scoreTone(score: number): "good" | "warn" | "bad" {
  if (score >= 80) return "good";
  if (score >= 55) return "warn";
  return "bad";
}

export function backendLabel(backend: BackendKind): string {
  return humanize(backend);
}

export function scriptTypeLabel(scriptType: ScriptType): string {
  return humanize(scriptType);
}

export function categoryLabel(category: SourceCategory): string {
  return humanize(category);
}
