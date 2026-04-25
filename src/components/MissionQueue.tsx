import { ArrowRight, Check, ChevronDown, ChevronUp, RotateCcw, TimerReset } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { humanize } from "../lib/format";
import { buildMissionQueue, severityToTone, type MissionQueueItem } from "../lib/ops";
import type { WalletReport } from "../types/domain";
import { StatusPill } from "./StatusPill";

interface MissionQueueProps {
  report: WalletReport;
  onNavigate: (page: string) => void;
}

interface MissionQueueState {
  hiddenIds: string[];
  completedIds: string[];
  collapsed: boolean;
}

const EMPTY_QUEUE_STATE: MissionQueueState = {
  hiddenIds: [],
  completedIds: [],
  collapsed: false
};

export function MissionQueue({ report, onNavigate }: MissionQueueProps) {
  const missions = useMemo(() => buildMissionQueue(report), [report]);
  const [queueState, setQueueState] = useState<MissionQueueState>(() => readQueueState(report.wallet.id));
  const visibleMissions = missions.filter(
    (mission) => !queueState.hiddenIds.includes(mission.id) && !queueState.completedIds.includes(mission.id)
  );
  const hiddenCount = missions.length - visibleMissions.length;

  useEffect(() => {
    setQueueState(readQueueState(report.wallet.id));
  }, [report.wallet.id]);

  function saveQueueState(next: MissionQueueState) {
    setQueueState(writeQueueState(report.wallet.id, next));
  }

  function hideMission(id: string) {
    saveQueueState({
      ...queueState,
      hiddenIds: Array.from(new Set([...queueState.hiddenIds, id]))
    });
  }

  function completeMission(id: string) {
    saveQueueState({
      hiddenIds: queueState.hiddenIds.filter((item) => item !== id),
      completedIds: Array.from(new Set([...queueState.completedIds, id])),
      collapsed: queueState.collapsed
    });
  }

  function resetQueue() {
    saveQueueState(EMPTY_QUEUE_STATE);
  }

  function toggleCollapsed() {
    saveQueueState({ ...queueState, collapsed: !queueState.collapsed });
  }

  return (
    <section className={`mission-queue ${queueState.collapsed ? "mission-queue-collapsed" : ""}`} aria-label="Mission queue">
      <div className="mission-queue-header">
        <div>
          <span>Mission Queue</span>
          <strong>{visibleMissions.length ? queueState.collapsed ? "Queue hidden" : "Do this next" : "Queue clear"}</strong>
        </div>
        <div className="mission-queue-actions">
          <StatusPill label={`${visibleMissions.length} active`} tone={visibleMissions.length ? "warn" : "good"} />
          <button
            type="button"
            className="ghost-button mission-toggle"
            onClick={toggleCollapsed}
            aria-expanded={!queueState.collapsed}
            aria-controls="mission-queue-list"
          >
            {queueState.collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            {queueState.collapsed ? "Show" : "Hide"}
          </button>
          {hiddenCount > 0 ? (
            <button type="button" className="ghost-button" onClick={resetQueue}>
              <RotateCcw size={14} /> Reset
            </button>
          ) : null}
        </div>
      </div>

      {!queueState.collapsed && visibleMissions.length ? (
        <div className="mission-queue-list" id="mission-queue-list">
          {visibleMissions.slice(0, 4).map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              onNavigate={onNavigate}
              onHide={hideMission}
              onComplete={completeMission}
            />
          ))}
        </div>
      ) : null}
      {!queueState.collapsed && !visibleMissions.length ? (
        <p className="empty-state">No active guided ops. Reset the queue to replay completed or snoozed missions.</p>
      ) : null}
    </section>
  );
}

function MissionCard({
  mission,
  onNavigate,
  onHide,
  onComplete
}: {
  mission: MissionQueueItem;
  onNavigate: (page: string) => void;
  onHide: (id: string) => void;
  onComplete: (id: string) => void;
}) {
  return (
    <article className={`mission-card mission-card-${mission.severity}`}>
      <div className="mission-copy">
        <div className="mission-kicker">
          <StatusPill label={humanize(mission.severity)} tone={severityToTone(mission.severity)} />
          <span>{humanize(mission.confidence)} confidence</span>
        </div>
        <h3>{mission.title}</h3>
        <p>{mission.action}</p>
      </div>
      <div className="mission-meta">
        <span>{mission.affectedCount ?? 0} affected</span>
        <div className="mission-buttons">
          <button type="button" className="secondary-button" onClick={() => onNavigate(mission.page)}>
            {mission.ctaLabel} <ArrowRight size={14} />
          </button>
          <button type="button" className="icon-button" onClick={() => onComplete(mission.id)} aria-label={`Complete ${mission.title}`}>
            <Check size={14} />
          </button>
          <button type="button" className="icon-button" onClick={() => onHide(mission.id)} aria-label={`Snooze ${mission.title}`}>
            <TimerReset size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

function readQueueState(walletId: string): MissionQueueState {
  try {
    const raw = window.localStorage.getItem(storageKey(walletId));
    if (!raw) return EMPTY_QUEUE_STATE;
    return { ...EMPTY_QUEUE_STATE, ...JSON.parse(raw) };
  } catch {
    return EMPTY_QUEUE_STATE;
  }
}

function writeQueueState(walletId: string, next: MissionQueueState): MissionQueueState {
  try {
    window.localStorage.setItem(storageKey(walletId), JSON.stringify(next));
  } catch {
    // The queue is still useful without persistence in restricted WebViews.
  }
  return next;
}

function storageKey(walletId: string): string {
  return `xpubshield.mission_queue.v1:${walletId}`;
}
