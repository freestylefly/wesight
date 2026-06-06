import './DesktopPetWindow.css';

import {
  DEFAULT_PET_CONFIG,
  type DesktopPetTaskSnapshot,
  DesktopPetTaskSource,
  DesktopPetTaskStatus,
  normalizePetConfig,
  type PetConfig,
  PetMotion,
  type PetPosition,
} from '@shared/pet/constants';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { i18nService } from '../../services/i18n';
import PetSprite, { PetMood } from './PetSprite';

const DragPhase = {
  Idle: 'idle',
  Pressing: 'pressing',
  Dragging: 'dragging',
} as const;

type DragPhase = typeof DragPhase[keyof typeof DragPhase];

interface DesktopPetBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragState = {
  phase: DragPhase;
  startScreenX: number;
  startScreenY: number;
  startBounds: DesktopPetBounds | null;
  lastPosition: PetPosition | null;
};

const IDLE_BUBBLE_KEYS = [
  'desktopPetBubbleIdle',
  'desktopPetBubbleFocus',
  'desktopPetBubbleHappy',
] as const;

const MOVE_THRESHOLD_PX = 4;
const BUBBLE_HIDE_DELAY_MS = 2100;
const WANDER_INTERVAL_MS = 7800;
const TASK_AUTO_COLLAPSE_DELAY_MS = 8000;

const DesktopPetWindow: React.FC = () => {
  const [config, setConfig] = useState<PetConfig>(() => DEFAULT_PET_CONFIG);
  const [taskSnapshot, setTaskSnapshot] = useState<DesktopPetTaskSnapshot | null>(null);
  const [isTaskCollapsed, setIsTaskCollapsed] = useState(false);
  const [mood, setMood] = useState<PetMood>(PetMood.Idle);
  const [bubbleKey, setBubbleKey] = useState<string>('desktopPetBubbleIdle');
  const [isBubbleVisible, setIsBubbleVisible] = useState(false);
  const [dragPhase, setDragPhase] = useState<DragPhase>(DragPhase.Idle);
  const bubbleTimerRef = useRef<number | null>(null);
  const taskCollapseTimerRef = useRef<number | null>(null);
  const lastTaskSessionRef = useRef<string | null>(null);
  const dragRef = useRef<DragState>({
    phase: DragPhase.Idle,
    startScreenX: 0,
    startScreenY: 0,
    startBounds: null,
    lastPosition: null,
  });
  const isAnimatingMoveRef = useRef(false);

  const showBubble = useCallback((key: string, durationMs = BUBBLE_HIDE_DELAY_MS) => {
    setBubbleKey(key);
    setIsBubbleVisible(true);
    if (bubbleTimerRef.current != null) {
      window.clearTimeout(bubbleTimerRef.current);
    }
    bubbleTimerRef.current = window.setTimeout(() => {
      setIsBubbleVisible(false);
      bubbleTimerRef.current = null;
    }, durationMs);
  }, []);

  const setMouseInteractive = useCallback((interactive: boolean) => {
    void window.electron.desktopPet.setMouseInteractive(interactive).catch((error) => {
      console.debug('[DesktopPet] failed to update mouse interactivity:', error);
    });
  }, []);

  const handleInteractiveEnter = useCallback(() => {
    setMouseInteractive(true);
  }, [setMouseInteractive]);

  const handleInteractiveLeave = useCallback(() => {
    if (dragRef.current.phase !== DragPhase.Idle) {
      return;
    }
    setMouseInteractive(false);
  }, [setMouseInteractive]);

  useEffect(() => {
    document.documentElement.classList.add('desktop-pet-page');
    void i18nService.initialize();

    let active = true;
    void window.electron.desktopPet.getConfig().then((nextConfig) => {
      if (!active) return;
      setConfig(normalizePetConfig(nextConfig));
    });

    const unsubscribe = window.electron.desktopPet.onConfigChanged((nextConfig) => {
      setConfig(normalizePetConfig(nextConfig));
      showBubble('desktopPetBubbleChanged');
    });

    void window.electron.desktopPet.getTaskSnapshot().then((snapshot) => {
      if (!active) return;
      setTaskSnapshot(snapshot);
      setIsTaskCollapsed(snapshot?.status === DesktopPetTaskStatus.Completed);
      lastTaskSessionRef.current = snapshot?.sessionId ?? null;
    });

    const unsubscribeTask = window.electron.desktopPet.onTaskChanged((snapshot) => {
      if (!active) return;
      const previousSessionId = lastTaskSessionRef.current;
      lastTaskSessionRef.current = snapshot?.sessionId ?? null;
      setTaskSnapshot(snapshot);

      if (taskCollapseTimerRef.current != null) {
        window.clearTimeout(taskCollapseTimerRef.current);
        taskCollapseTimerRef.current = null;
      }

      if (!snapshot) {
        setIsTaskCollapsed(false);
        return;
      }

      const isNewTask = previousSessionId !== snapshot.sessionId;
      const isActiveTask = snapshot.status === DesktopPetTaskStatus.Waiting
        || snapshot.status === DesktopPetTaskStatus.Thinking
        || snapshot.status === DesktopPetTaskStatus.Replying
        || snapshot.status === DesktopPetTaskStatus.Coding
        || snapshot.status === DesktopPetTaskStatus.Permission;

      if (isNewTask || isActiveTask) {
        setIsTaskCollapsed(false);
      }

      if (snapshot.status === DesktopPetTaskStatus.Completed) {
        taskCollapseTimerRef.current = window.setTimeout(() => {
          setIsTaskCollapsed(true);
          taskCollapseTimerRef.current = null;
        }, TASK_AUTO_COLLAPSE_DELAY_MS);
      }
    });

    return () => {
      active = false;
      setMouseInteractive(false);
      unsubscribe();
      unsubscribeTask();
      document.documentElement.classList.remove('desktop-pet-page');
      if (bubbleTimerRef.current != null) {
        window.clearTimeout(bubbleTimerRef.current);
      }
      if (taskCollapseTimerRef.current != null) {
        window.clearTimeout(taskCollapseTimerRef.current);
      }
    };
  }, [setMouseInteractive, showBubble]);

  const updateMoodForClick = useCallback(() => {
    setMood((current) => {
      if (current === PetMood.Happy) return PetMood.Focus;
      if (current === PetMood.Focus) return PetMood.Idle;
      return PetMood.Happy;
    });
    const key = IDLE_BUBBLE_KEYS[Math.floor(Math.random() * IDLE_BUBBLE_KEYS.length)];
    showBubble(key);
  }, [showBubble]);

  const animateToPosition = useCallback(async (target: PetPosition) => {
    if (isAnimatingMoveRef.current || dragRef.current.phase !== DragPhase.Idle) {
      return;
    }

    const bounds = await window.electron.desktopPet.getBounds();
    if (!bounds) {
      return;
    }

    isAnimatingMoveRef.current = true;
    setMood(PetMood.Walking);
    const start = { x: bounds.x, y: bounds.y };
    const startTime = performance.now();
    const durationMs = 920;

    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      void window.electron.desktopPet.setPosition({
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        persist: progress === 1,
      });

      if (progress < 1 && dragRef.current.phase === DragPhase.Idle) {
        window.requestAnimationFrame(step);
        return;
      }

      isAnimatingMoveRef.current = false;
      setMood(PetMood.Idle);
    };

    window.requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    if (!config.enabled || config.motion !== PetMotion.Playful) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      if (dragRef.current.phase !== DragPhase.Idle || isAnimatingMoveRef.current) {
        return;
      }

      void window.electron.desktopPet.getBounds().then((bounds) => {
        if (!bounds || dragRef.current.phase !== DragPhase.Idle) {
          return;
        }
        const direction = Math.random() > 0.5 ? 1 : -1;
        const distance = 18 + Math.round(Math.random() * 24);
        void animateToPosition({
          x: bounds.x + direction * distance,
          y: bounds.y + Math.round((Math.random() - 0.5) * 18),
        });
      });
    }, WANDER_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [animateToPosition, config.enabled, config.motion]);

  const handlePointerDown = async (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = await window.electron.desktopPet.getBounds();
    dragRef.current = {
      phase: DragPhase.Pressing,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      startBounds: bounds,
      lastPosition: bounds ? { x: bounds.x, y: bounds.y } : null,
    };
    setDragPhase(DragPhase.Pressing);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragRef.current;
    if (dragState.phase === DragPhase.Idle || !dragState.startBounds) {
      return;
    }

    const deltaX = event.screenX - dragState.startScreenX;
    const deltaY = event.screenY - dragState.startScreenY;
    const isPastThreshold = Math.abs(deltaX) > MOVE_THRESHOLD_PX || Math.abs(deltaY) > MOVE_THRESHOLD_PX;

    if (!isPastThreshold && dragState.phase !== DragPhase.Dragging) {
      return;
    }

    const nextPosition = {
      x: dragState.startBounds.x + deltaX,
      y: dragState.startBounds.y + deltaY,
    };

    dragRef.current = {
      ...dragState,
      phase: DragPhase.Dragging,
      lastPosition: nextPosition,
    };
    setDragPhase(DragPhase.Dragging);
    setMood(PetMood.Dragging);
    void window.electron.desktopPet.setPosition({
      ...nextPosition,
      persist: false,
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragRef.current;
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (dragState.phase === DragPhase.Dragging && dragState.lastPosition) {
      void window.electron.desktopPet.setPosition({
        ...dragState.lastPosition,
        persist: true,
      });
      showBubble('desktopPetBubbleDragged');
    } else {
      updateMoodForClick();
    }

    dragRef.current = {
      phase: DragPhase.Idle,
      startScreenX: 0,
      startScreenY: 0,
      startBounds: null,
      lastPosition: null,
    };
    setDragPhase(DragPhase.Idle);
    window.setTimeout(() => {
      setMood(PetMood.Idle);
    }, 1200);
  };

  const handleDoubleClick = () => {
    void window.electron.desktopPet.openMainWindow();
    showBubble('desktopPetBubbleOpenMain');
  };

  const handleOpenTask = (event?: React.MouseEvent<HTMLElement>) => {
    event?.stopPropagation();
    if (!taskSnapshot) {
      void window.electron.desktopPet.openMainWindow();
      return;
    }
    void window.electron.desktopPet.openTask(taskSnapshot.sessionId);
  };

  const handleCollapseTask = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsTaskCollapsed(true);
  };

  const handleExpandTask = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsTaskCollapsed(false);
  };

  const getTaskStatusLabel = (status: DesktopPetTaskSnapshot['status']): string => {
    switch (status) {
      case DesktopPetTaskStatus.Waiting:
        return i18nService.t('desktopPetTaskStatusWaiting');
      case DesktopPetTaskStatus.Thinking:
        return i18nService.t('desktopPetTaskStatusThinking');
      case DesktopPetTaskStatus.Replying:
        return i18nService.t('desktopPetTaskStatusReplying');
      case DesktopPetTaskStatus.Coding:
        return i18nService.t('desktopPetTaskStatusCoding');
      case DesktopPetTaskStatus.Permission:
        return i18nService.t('desktopPetTaskStatusPermission');
      case DesktopPetTaskStatus.Completed:
        return i18nService.t('desktopPetTaskStatusCompleted');
      case DesktopPetTaskStatus.Error:
        return i18nService.t('desktopPetTaskStatusError');
      case DesktopPetTaskStatus.Stopped:
        return i18nService.t('desktopPetTaskStatusStopped');
      default:
        return i18nService.t('desktopPetTaskStatusWaiting');
    }
  };

  const getTaskSourceLabel = (source: DesktopPetTaskSnapshot['source']): string => {
    if (source === DesktopPetTaskSource.Im) return i18nService.t('desktopPetTaskSourceIm');
    if (source === DesktopPetTaskSource.Scheduled) return i18nService.t('desktopPetTaskSourceScheduled');
    return i18nService.t('desktopPetTaskSourceChat');
  };

  const getMoodForTask = (snapshot: DesktopPetTaskSnapshot | null): PetMood | null => {
    if (!snapshot || isTaskCollapsed) return null;
    switch (snapshot.status) {
      case DesktopPetTaskStatus.Coding:
        return PetMood.Coding;
      case DesktopPetTaskStatus.Waiting:
      case DesktopPetTaskStatus.Thinking:
      case DesktopPetTaskStatus.Permission:
        return PetMood.Thinking;
      case DesktopPetTaskStatus.Replying:
        return PetMood.Working;
      case DesktopPetTaskStatus.Completed:
        return PetMood.Done;
      case DesktopPetTaskStatus.Error:
        return PetMood.Error;
      default:
        return null;
    }
  };

  const stageClassName = [
    'desktop-pet-stage',
    dragPhase === DragPhase.Dragging ? 'desktop-pet-stage--dragging' : '',
    isBubbleVisible ? 'desktop-pet-stage--bubble' : '',
    taskSnapshot && !isTaskCollapsed ? 'desktop-pet-stage--task-open' : '',
  ].filter(Boolean).join(' ');

  const taskMood = getMoodForTask(taskSnapshot);
  const resolvedMood = dragPhase === DragPhase.Dragging
    ? PetMood.Dragging
    : taskMood ?? mood;

  if (!config.enabled) {
    return null;
  }

  return (
    <main className={stageClassName}>
      {taskSnapshot && !isTaskCollapsed && (
        <section
          className="desktop-pet-task-card"
          onClick={handleOpenTask}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseEnter={handleInteractiveEnter}
          onMouseLeave={handleInteractiveLeave}
        >
          <button
            type="button"
            className="desktop-pet-task-close"
            onClick={handleCollapseTask}
            aria-label={i18nService.t('desktopPetTaskCollapse')}
          >
            ×
          </button>
          <div className="desktop-pet-task-heading">
            <span className="desktop-pet-task-app">WeSight</span>
            <span className="desktop-pet-task-source">{getTaskSourceLabel(taskSnapshot.source)}</span>
          </div>
          <div className="desktop-pet-task-title">{taskSnapshot.title}</div>
          <div className="desktop-pet-task-meta">
            <span>{taskSnapshot.projectName}</span>
            <span>{taskSnapshot.engineLabel} · {taskSnapshot.modelLabel}</span>
          </div>
          <div className="desktop-pet-task-footer">
            <span className={`desktop-pet-task-status desktop-pet-task-status--${taskSnapshot.status}`}>
              {getTaskStatusLabel(taskSnapshot.status)}
            </span>
            <button
              type="button"
              className="desktop-pet-task-reply"
              onClick={handleOpenTask}
            >
              {i18nService.t('desktopPetTaskOpen')}
            </button>
          </div>
        </section>
      )}
      <div
        className="desktop-pet-hit-area"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleInteractiveEnter}
        onMouseLeave={handleInteractiveLeave}
        role="button"
        tabIndex={0}
        aria-label={i18nService.t('desktopPetAria')}
      >
        <div className="desktop-pet-bubble">
          {i18nService.t(bubbleKey)}
        </div>
        <div className="desktop-pet-sprite-wrap">
          <PetSprite
            variant={config.variant}
            motion={config.motion}
            mood={resolvedMood}
            size={108}
          />
        </div>
        <span className="desktop-pet-action-dot" aria-hidden="true" />
        {taskSnapshot && isTaskCollapsed && (
          <button
            type="button"
            className={`desktop-pet-task-pill desktop-pet-task-pill--${taskSnapshot.status}`}
            onClick={handleExpandTask}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {getTaskStatusLabel(taskSnapshot.status)}
          </button>
        )}
      </div>
    </main>
  );
};

export default DesktopPetWindow;
