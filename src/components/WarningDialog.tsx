import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

interface WarningDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: "alert" | "shield";
  onClose: () => void;
  onConfirm?: () => void;
}

export function WarningDialog({
  title,
  children,
  confirmLabel = "Got it",
  cancelLabel = "Back",
  icon = "shield",
  onClose,
  onConfirm
}: WarningDialogProps) {
  const Icon = icon === "alert" ? AlertTriangle : ShieldAlert;

  return (
    <div className="warning-dialog-backdrop" role="presentation">
      <section
        className="warning-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="warning-dialog-title"
        aria-describedby="warning-dialog-copy"
      >
        <div className="warning-dialog-heading">
          <Icon size={22} aria-hidden="true" />
          <h2 id="warning-dialog-title">{title}</h2>
        </div>
        <div id="warning-dialog-copy" className="warning-dialog-copy">
          {children}
        </div>
        <div className="button-row warning-dialog-actions">
          {onConfirm ? (
            <button type="button" className="secondary-button" onClick={onClose}>
              {cancelLabel}
            </button>
          ) : null}
          <button type="button" className="primary-button" onClick={onConfirm ?? onClose}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
