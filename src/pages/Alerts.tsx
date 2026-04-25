import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { acknowledgeAlert, getAlerts } from "../api/tauri";
import { RiskBadge } from "../components/RiskBadge";
import { StatusPill } from "../components/StatusPill";
import type { Alert, WalletReport } from "../types/domain";

interface AlertsProps {
  report: WalletReport;
}

function useAlertSignals(report: WalletReport) {
  const fallbackAlerts = useMemo(() => buildFallbackAlerts(report), [report]);
  const [alerts, setAlerts] = useState<Alert[]>(fallbackAlerts);

  useEffect(() => {
    let cancelled = false;
    getAlerts()
      .then((items) => {
        if (!cancelled) setAlerts(items);
      })
      .catch(() => {
        if (!cancelled) setAlerts(fallbackAlerts);
      });
    return () => {
      cancelled = true;
    };
  }, [fallbackAlerts]);

  async function acknowledge(alertId: string) {
    setAlerts((current) =>
      current.map((alert) => alert.id === alertId ? { ...alert, acknowledged: true } : alert)
    );
    try {
      setAlerts(await acknowledgeAlert(alertId));
    } catch {
      // Browser demo mode has no Tauri IPC; keep the local acknowledgement.
    }
  }

  const openCount = alerts.filter((alert) => !alert.acknowledged).length;
  return { alerts, openCount, acknowledge };
}

export function AlertSignalPanel({ report }: AlertsProps) {
  const { alerts, openCount, acknowledge } = useAlertSignals(report);

  return (
    <section className="cockpit-alert-log">
      <div className="panel-heading">
        <h2>Signal Log</h2>
        <StatusPill label={`${openCount} open`} tone={openCount ? "warn" : "good"} />
      </div>
      <div className="risk-list compact-risk-list">
        {alerts.length ? alerts.slice(0, 3).map((alert) => (
          <article className={`risk-card alert-card ${alert.acknowledged ? "acknowledged" : ""}`} key={alert.id}>
            <div className="finding-title">
              <RiskBadge severity={alert.severity} />
              <strong>{alert.title}</strong>
              {alert.acknowledged ? <StatusPill label="Acknowledged" /> : null}
            </div>
            <p>{alert.message}</p>
            <div className="risk-meta">
              <span>{new Date(alert.created_at).toLocaleString()}</span>
              {!alert.acknowledged ? (
                <button type="button" className="secondary-button" onClick={() => acknowledge(alert.id)}>
                  <Check size={16} /> Acknowledge
                </button>
              ) : null}
            </div>
          </article>
        )) : (
          <p className="empty-state">No local signals are waiting outside the action queue.</p>
        )}
      </div>
    </section>
  );
}

function buildFallbackAlerts(report: WalletReport): Alert[] {
  const now = new Date().toISOString();
  const alerts: Alert[] = [];
  if (report.findings.some((finding) => finding.id === "address_reuse")) {
    alerts.push({
      id: `address_reuse:${report.wallet.id}`,
      severity: "high",
      title: "New address reuse detected",
      message: "One or more receive addresses appear more than once. This may link deposits.",
      acknowledged: false,
      created_at: now
    });
  }
  if (report.wallet.backend === "public_esplora") {
    alerts.push({
      id: `public_api:${report.wallet.id}`,
      severity: "high",
      title: "Public API mode enabled",
      message: "Public API mode is weak privacy. Never upload raw xpubs or descriptors.",
      acknowledged: false,
      created_at: now
    });
  }
  return alerts;
}
