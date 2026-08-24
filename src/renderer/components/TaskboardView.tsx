import React, { useEffect, useRef, useState } from 'react';

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

  useEffect(() => {
    const pushTheme = () => {
      iframeRef.current?.contentWindow?.postMessage({ type: 'theme', theme: getWeSightTheme() }, '*');
    };
    const observer = new MutationObserver(pushTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

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
      <iframe
        ref={iframeRef}
        src={`${TASKBOARD_URL}/?theme=${initialTheme}`}
        title="taskboard"
        onLoad={() => {
          iframeRef.current?.contentWindow?.postMessage({ type: 'theme', theme: getWeSightTheme() }, '*');
        }}
        className="flex-1 min-h-0 w-full border-0 bg-background"
      />
    </div>
  );
};

export default TaskboardView;
