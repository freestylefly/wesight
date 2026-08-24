import React, { useCallback, useEffect, useRef, useState } from 'react';

import { i18nService } from '../services/i18n';
import ComposeIcon from './icons/ComposeIcon';
import SidebarToggleIcon from './icons/SidebarToggleIcon';
import WindowTitleBar from './window/WindowTitleBar';

interface TaskboardViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

const TASKBOARD_URL = 'http://127.0.0.1:47824';
const HEALTH_URL = `${TASKBOARD_URL}/api/projects`;
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 15000;

type ServerStatus = 'starting' | 'ready' | 'unavailable';

const getWeSightTheme = (): 'dark' | 'light' =>
  document.documentElement.classList.contains('light') ? 'light' : 'dark';

const TaskboardView: React.FC<TaskboardViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  updateBadge,
}) => {
  const isMac = window.electron.platform === 'darwin';
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [initialTheme] = useState<'dark' | 'light'>(getWeSightTheme);
  const [serverStatus, setServerStatus] = useState<ServerStatus>('starting');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    const poll = async (): Promise<void> => {
      while (!cancelled && Date.now() < deadline) {
        try {
          const res = await fetch(HEALTH_URL, { cache: 'no-store' });
          if (res.ok) {
            if (!cancelled) setServerStatus('ready');
            return;
          }
        } catch {
          // service not up yet, keep polling until the deadline
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      if (!cancelled) setServerStatus('unavailable');
    };

    setServerStatus('starting');
    void poll();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    const pushTheme = () => {
      iframeRef.current?.contentWindow?.postMessage({ type: 'theme', theme: getWeSightTheme() }, '*');
    };
    const observer = new MutationObserver(pushTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return (
    <div className="relative flex-1 flex flex-col bg-background h-full">
      <div className="draggable flex h-8 items-center justify-between px-2 shrink-0">
        <div className="flex items-center h-8">
          {isSidebarCollapsed && (
            <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
              <button
                type="button"
                onClick={onToggleSidebar}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
              </button>
              <button
                type="button"
                onClick={onNewChat}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
              >
                <ComposeIcon className="h-4 w-4" />
              </button>
              {updateBadge}
            </div>
          )}
        </div>
        <WindowTitleBar inline />
      </div>
      {serverStatus === 'ready' ? (
        <iframe
          ref={iframeRef}
          src={`${TASKBOARD_URL}/?theme=${initialTheme}`}
          title="taskboard"
          onLoad={() => {
            iframeRef.current?.contentWindow?.postMessage({ type: 'theme', theme: getWeSightTheme() }, '*');
          }}
          className="flex-1 min-h-0 w-full border-0 bg-background"
        />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 text-secondary">
          <span className="text-sm">
            {i18nService.t(serverStatus === 'starting' ? 'taskboardStarting' : 'taskboardUnavailable')}
          </span>
          {serverStatus === 'unavailable' && (
            <button
              type="button"
              onClick={retry}
              className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background hover:bg-surface-raised hover:text-foreground transition-colors"
            >
              {i18nService.t('taskboardRetry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TaskboardView;
