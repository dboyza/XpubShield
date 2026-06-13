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
    targetSelector: ".preflight-grid",
    title: "Preflight before spending",
    body: "Spend Preflight explains what an observer could infer from selected coins, including common-input ownership, toxic change, and fee exposure.",
    operatorCue: "Use it before signing elsewhere. XpubShield does not build, sign, or broadcast transactions.",
    ctaLabel: "Run Preflight",
    requiresWallet: true
  },
  {
    id: "verify-recovery",
    page: "recovery",
    targetSelector: ".recovery-check",
    title: "Verify recovery posture",
    body: "Recovery checks help confirm descriptors, fingerprints, paths, gap assumptions, and export readiness before you need them under stress.",
    operatorCue: "Export recovery notes only to storage you control because wallet metadata is sensitive.",
    ctaLabel: "Open Recovery",
    requiresWallet: true
  },
  {
    id: "psbt-safety",
    page: "psbt",
    targetSelector: ".risk-list",
    title: "Review PSBT safety",
    body: "PSBT Preflight helps spot suspicious inputs, outputs, and change assumptions before a signer touches the transaction.",
    operatorCue: "A clean lint result is useful, but it is not proof that a PSBT is safe.",
    ctaLabel: "Open PSBT Preflight",
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
            and PSBT safety.
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
