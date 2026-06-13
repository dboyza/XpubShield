import { ArrowLeft, ArrowRight, BookOpenCheck, Check, X } from "lucide-react";
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

export type TutorialPageId =
  | "cockpit"
  | "utxos"
  | "spend_preflight"
  | "recovery"
  | "psbt";

export interface TutorialStep {
  id: string;
  page: TutorialPageId;
  targetSelector: string;
  title: string;
  body: string;
  operatorCue: string;
  ctaLabel: string;
  guide?: {
    what: string;
    when: string;
    next: string;
  };
  requiresWallet?: boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "read-cockpit",
    page: "cockpit",
    targetSelector: ".action-center-panel",
    title: "Read the Cockpit first",
    body: "The Cockpit turns wallet findings into an action queue so you know what deserves attention before opening individual modules.",
    operatorCue: "Start with high-severity actions, then use the CTA on each action to jump into the relevant module.",
    ctaLabel: "Open Cockpit",
    requiresWallet: true
  },
  {
    id: "inspect-provenance",
    page: "utxos",
    targetSelector: ".workbench-table",
    title: "Inspect coin provenance",
    body: "The Coin Workbench is where you review source labels, provenance confidence, risk flags, and spend policy for individual UTXOs.",
    operatorCue: "Treat provenance as local evidence and heuristics, not a definitive chain surveillance verdict.",
    ctaLabel: "Open Workbench",
    requiresWallet: true
  },
  {
    id: "label-quarantine",
    page: "utxos",
    targetSelector: ".selected-coin-tray",
    title: "Label and quarantine deliberately",
    body: "Select coins to apply source labels, spend status, or quarantine state. Keep KYC, unknown, dust, and do-not-merge coins separated.",
    operatorCue: "Manual labels override heuristics and make the rest of the cockpit smarter.",
    ctaLabel: "Review Coins",
    requiresWallet: true
  },
  {
    id: "spend-preflight",
    page: "spend_preflight",
    targetSelector: ".workflow-guide",
    title: "Plan a possible spend",
    body: "Spend Preflight is for a transaction you have not built yet. It lets you choose candidate coins, estimate fee and change, and see what those inputs could reveal together.",
    operatorCue: "Use Spend Preflight before building or signing elsewhere, especially when coins have different labels, sources, or quarantine states.",
    ctaLabel: "Run Preflight",
    guide: {
      what: "Choose coins, estimate fee/change, and review privacy or merge risk.",
      when: "Before creating or signing a transaction.",
      next: "Select candidate UTXOs, set amount and fee assumptions, then review the outcome."
    },
    requiresWallet: true
  },
  {
    id: "verify-recovery",
    page: "recovery",
    targetSelector: ".workflow-guide",
    title: "Check recovery readiness",
    body: "Recovery is not a spending tool. It checks whether your watch-only wallet can be restored or independently verified from descriptors, fingerprints, paths, gap assumptions, and exports.",
    operatorCue: "Use Recovery after import, before relying on a watch-only setup, and whenever backup or signing-device metadata changes.",
    ctaLabel: "Open Recovery",
    guide: {
      what: "Verify the metadata needed to restore or audit this wallet view.",
      when: "Before you need recovery under pressure.",
      next: "Review backup readiness, export the report, and resolve missing metadata warnings."
    },
    requiresWallet: true
  },
  {
    id: "psbt-safety",
    page: "psbt",
    targetSelector: ".workflow-guide",
    title: "Review a ready-to-sign PSBT",
    body: "PSBT Preflight is for a transaction that already exists. Paste a PSBT to inspect inputs, outputs, fee, change, and signer warnings before approval.",
    operatorCue: "Use PSBT Preflight after a wallet or coordinator creates a PSBT, but before a hardware signer or signing wallet approves it.",
    ctaLabel: "Open PSBT Preflight",
    guide: {
      what: "Review a ready-to-sign transaction without signing or broadcasting.",
      when: "After PSBT creation and before signer approval.",
      next: "Paste the PSBT or load the example, then resolve warnings before signing elsewhere."
    },
    requiresWallet: true
  }
];

interface SovereignOpsTutorialProps {
  mode: "prompt" | "mission";
  activeStepIndex: number;
  reportLoaded: boolean;
  onStart: () => void;
  onMaybeLater: () => void;
  onDontShowAgain: () => void;
  onClose: () => void;
  onFinish: () => void;
  onNavigate: (page: TutorialPageId) => void;
  onStepChange: (index: number) => void;
}

export function SovereignOpsTutorial({
  mode,
  activeStepIndex,
  reportLoaded,
  onStart,
  onMaybeLater,
  onDontShowAgain,
  onClose,
  onFinish,
  onNavigate,
  onStepChange
}: SovereignOpsTutorialProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [highlightTick, setHighlightTick] = useState(0);
  const activeStep = TUTORIAL_STEPS[activeStepIndex] ?? TUTORIAL_STEPS[0];
  const isLastStep = activeStepIndex === TUTORIAL_STEPS.length - 1;
  const ctaDisabled = activeStep.requiresWallet && !reportLoaded;

  const progressLabel = useMemo(
    () => `Step ${activeStepIndex + 1} of ${TUTORIAL_STEPS.length}`,
    [activeStepIndex]
  );

  useEffect(() => {
    const firstButton = dialogRef.current?.querySelector<HTMLButtonElement>("button");
    firstButton?.focus();
  }, [mode, activeStepIndex]);

  useEffect(() => {
    if (mode !== "mission") return undefined;

    const target = document.querySelector(activeStep.targetSelector);
    target?.classList.add("tutorial-highlight");

    return () => {
      target?.classList.remove("tutorial-highlight");
    };
  }, [activeStep.targetSelector, highlightTick, mode]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      onClose();
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleNavigate() {
    if (ctaDisabled) return;
    onNavigate(activeStep.page);
    window.setTimeout(() => setHighlightTick((current) => current + 1), 80);
  }

  function move(delta: number) {
    const nextIndex = Math.min(Math.max(activeStepIndex + delta, 0), TUTORIAL_STEPS.length - 1);
    onStepChange(nextIndex);
  }

  if (mode === "prompt") {
    return (
      <div className="tutorial-layer tutorial-layer-prompt" role="presentation">
        <section
          className="tutorial-prompt"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tutorial-prompt-title"
          ref={dialogRef}
          onKeyDown={handleKeyDown}
        >
          <div className="tutorial-kicker">
            <BookOpenCheck size={16} />
            <span>Optional mission</span>
          </div>
          <h2 id="tutorial-prompt-title">Run the Sovereign Ops tutorial?</h2>
          <p>
            Take a short guided pass through the workflow: Cockpit, coin provenance, spend preflight, recovery,
            and PSBT safety. The preflight steps explain when to use each tool.
          </p>
          <div className="tutorial-actions">
            <button type="button" className="primary-button" onClick={onStart}>
              Start tutorial
            </button>
            <button type="button" className="secondary-button" onClick={onMaybeLater}>
              Maybe later
            </button>
            <button type="button" className="ghost-button" onClick={onDontShowAgain}>
              Don't show again
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="tutorial-layer tutorial-layer-mission" role="presentation">
      <section
        className="tutorial-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <div className="tutorial-card-top">
          <div className="tutorial-kicker">
            <BookOpenCheck size={16} />
            <span>{progressLabel}</span>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close tutorial">
            <X size={16} />
          </button>
        </div>

        <div className="tutorial-progress">
          {TUTORIAL_STEPS.map((step, index) => (
            <button
              type="button"
              key={step.id}
              className={index === activeStepIndex ? "active" : ""}
              onClick={() => onStepChange(index)}
              aria-label={`Open tutorial step ${index + 1}`}
            />
          ))}
        </div>

        <h2 id="tutorial-title">{activeStep.title}</h2>
        <p>{activeStep.body}</p>
        {activeStep.guide ? (
          <div className="tutorial-guide">
            <div>
              <span>What</span>
              <strong>{activeStep.guide.what}</strong>
            </div>
            <div>
              <span>When</span>
              <strong>{activeStep.guide.when}</strong>
            </div>
            <div>
              <span>Next</span>
              <strong>{activeStep.guide.next}</strong>
            </div>
          </div>
        ) : null}
        <div className="tutorial-cue">
          <span>Operator cue</span>
          <strong>{activeStep.operatorCue}</strong>
        </div>

        <div className="tutorial-actions tutorial-actions-split">
          <button type="button" className="secondary-button" onClick={handleNavigate} disabled={ctaDisabled}>
            {ctaDisabled ? "Import or demo first" : activeStep.ctaLabel}
          </button>
          <div className="tutorial-step-controls">
            <button type="button" className="secondary-button" onClick={() => move(-1)} disabled={activeStepIndex === 0}>
              <ArrowLeft size={16} /> Back
            </button>
            {isLastStep ? (
              <button type="button" className="primary-button" onClick={onFinish}>
                <Check size={16} /> Finish
              </button>
            ) : (
              <button type="button" className="primary-button" onClick={() => move(1)}>
                Next <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>

        <button type="button" className="ghost-button tutorial-skip" onClick={onClose}>
          Skip for now
        </button>
      </section>
    </div>
  );
}
