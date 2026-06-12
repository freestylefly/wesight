import {
  ChartBarIcon,
  ChevronRightIcon,
  CodeBracketIcon,
  DocumentIcon,
  FolderOpenIcon,
  ListBulletIcon,
  PhotoIcon,
  PuzzlePieceIcon,
  QueueListIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { RuntimeCallSource, RuntimeCallStatus } from '@shared/cowork/constants';
import {
  type CoworkFileActivity,
  CoworkFileActivitySource,
  CoworkFileActivityStatus,
} from '@shared/cowork/fileActivity';
import { calculateModelTps, calculateRuntimeTps } from '@shared/cowork/runtimeMetrics';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { i18nService } from '../../services/i18n';
import type { CoworkSessionStatus, RuntimeCallRecord } from '../../types/cowork';
import {
  ActivityArtifactType,
  ActivityFileChangeKind,
  ActivityItemStatus,
  ActivityTodoStatus,
  type CoworkActivityFileChange,
  type CoworkActivitySnapshot,
  type CoworkActivityToolItem,
} from '../../utils/coworkActivity';
import { getCompactFolderName } from '../../utils/path';
import { CoworkActivitySidebarMode } from './activitySidebarConstants';
import DiffView from './DiffView';
import { getLiveCodeInitialLineLimit, shouldAutoFollowLiveCodeScroll } from './liveCodePreviewUtils';

interface CoworkActivitySidebarProps {
  snapshot: CoworkActivitySnapshot;
  sessionStatus: CoworkSessionStatus;
  engineLabel: string;
  cwd: string;
  mode: CoworkActivitySidebarMode;
  selectedFileChangeId: string | null;
  liveFileActivities: CoworkFileActivity[];
  selectedLiveFilePath: string | null;
  runtimeCall?: RuntimeCallRecord | null;
  width?: number;
  overlay?: boolean;
  onModeChange: (mode: CoworkActivitySidebarMode) => void;
  onSelectFileChange: (fileChangeId: string) => void;
  onSelectLiveFile: (filePath: string) => void;
  onResizeStart?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onClose: () => void;
}

const statusLabelKey: Record<ActivityItemStatus, string> = {
  [ActivityItemStatus.Running]: 'coworkActivityRunning',
  [ActivityItemStatus.Completed]: 'coworkActivityCompleted',
  [ActivityItemStatus.Error]: 'coworkActivityError',
};

const todoStatusLabelKey: Record<ActivityTodoStatus, string> = {
  [ActivityTodoStatus.Completed]: 'coworkTodoCompleted',
  [ActivityTodoStatus.InProgress]: 'coworkTodoInProgress',
  [ActivityTodoStatus.Pending]: 'coworkTodoPending',
  [ActivityTodoStatus.Unknown]: 'coworkTodoUnknownStatus',
};

const fileChangeKindLabelKey: Record<ActivityFileChangeKind, string> = {
  [ActivityFileChangeKind.Added]: 'coworkActivityFileAdded',
  [ActivityFileChangeKind.Modified]: 'coworkActivityFileModified',
  [ActivityFileChangeKind.Unknown]: 'coworkActivityFileUnknown',
};

const liveFileStatusLabelKey: Record<CoworkFileActivityStatus, string> = {
  [CoworkFileActivityStatus.Writing]: 'coworkActivityLiveWriting',
  [CoworkFileActivityStatus.Modified]: 'coworkActivityFileModified',
  [CoworkFileActivityStatus.Added]: 'coworkActivityFileAdded',
  [CoworkFileActivityStatus.Deleted]: 'coworkActivityLiveDeleted',
};

const liveFileSourceLabelKey: Record<CoworkFileActivitySource, string> = {
  [CoworkFileActivitySource.Watcher]: 'coworkActivityLiveSourceWatcher',
  [CoworkFileActivitySource.ToolPreview]: 'coworkActivityLiveSourceToolPreview',
};

const getStatusDotClass = (status: ActivityItemStatus): string => {
  if (status === ActivityItemStatus.Running) return 'bg-blue-500 animate-pulse';
  if (status === ActivityItemStatus.Error) return 'bg-red-500';
  return 'bg-green-500';
};

const getTodoDotClass = (status: ActivityTodoStatus): string => {
  if (status === ActivityTodoStatus.Completed) return 'bg-green-500';
  if (status === ActivityTodoStatus.InProgress) return 'bg-blue-500 animate-pulse';
  if (status === ActivityTodoStatus.Pending) return 'bg-amber-400';
  return 'bg-muted';
};

const getLiveStatusDotClass = (status: CoworkFileActivityStatus): string => {
  if (status === CoworkFileActivityStatus.Writing) return 'bg-blue-500 animate-pulse';
  if (status === CoworkFileActivityStatus.Deleted) return 'bg-red-500';
  if (status === CoworkFileActivityStatus.Added) return 'bg-green-500';
  return 'bg-amber-500';
};

const getSessionStatusLabel = (status: CoworkSessionStatus): string => {
  switch (status) {
    case 'running':
      return i18nService.t('coworkStatusRunning');
    case 'completed':
      return i18nService.t('coworkStatusCompleted');
    case 'error':
      return i18nService.t('coworkStatusError');
    case 'idle':
    default:
      return i18nService.t('coworkStatusIdle');
  }
};

const formatRuntimeNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat().format(Math.round(value));
};

const formatRuntimeDuration = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
  return `${(value / 60_000).toFixed(1)}m`;
};

const formatRuntimeTps = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toFixed(1);
};

const getRuntimeStatusLabel = (status: RuntimeCallRecord['status']): string => {
  if (status === RuntimeCallStatus.Completed) return i18nService.t('runtimeDashboardStatusCompleted');
  if (status === RuntimeCallStatus.Error) return i18nService.t('runtimeDashboardStatusError');
  if (status === RuntimeCallStatus.Stopped) return i18nService.t('runtimeDashboardStatusStopped');
  return i18nService.t('runtimeDashboardStatusRunning');
};

const getRuntimeSourceLabel = (source: RuntimeCallRecord['source']): string => {
  if (source === RuntimeCallSource.Im) return i18nService.t('runtimeDashboardSourceIm');
  if (source === RuntimeCallSource.Scheduled) return i18nService.t('runtimeDashboardSourceScheduled');
  if (source === RuntimeCallSource.Unknown) return i18nService.t('runtimeDashboardSourceUnknown');
  return i18nService.t('runtimeDashboardSourceChat');
};

const getRuntimeElapsedMs = (call: RuntimeCallRecord): number | null => {
  if (call.durationMs !== null && call.durationMs !== undefined) return call.durationMs;
  if (call.startedAt && call.status === RuntimeCallStatus.Running) {
    return Math.max(0, Date.now() - call.startedAt);
  }
  return null;
};

const basename = (filePath: string): string => {
  const clean = filePath.replace(/[?#].*$/, '').replace(/\/+$/, '');
  return decodeURIComponent(clean.split('/').pop() || clean || filePath);
};

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}> = ({ title, icon, count, children }) => (
  <section className="border-b border-border px-4 py-4 last:border-b-0">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-secondary">{icon}</span>
        <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {typeof count === 'number' && (
        <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[11px] text-secondary">
          {count}
        </span>
      )}
    </div>
    {children}
  </section>
);

const EmptyText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
    {children}
  </div>
);

const ToolRow: React.FC<{ item: CoworkActivityToolItem }> = ({ item }) => (
  <div className="flex items-start gap-2 py-1.5">
    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${getStatusDotClass(item.status)}`} />
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-xs font-medium text-foreground">{item.toolName}</span>
        {item.skillName && (
          <span className="shrink-0 rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-600 dark:text-violet-300">
            {item.skillName}
          </span>
        )}
        <span className="shrink-0 text-[10px] text-muted">
          {i18nService.t(statusLabelKey[item.status])}
        </span>
      </div>
      {item.summary && (
        <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
          {item.summary}
        </div>
      )}
    </div>
  </div>
);

const FileChangeStats: React.FC<{ change: CoworkActivityFileChange }> = ({ change }) => (
  <div className="flex items-center gap-2 text-[10px] text-secondary">
    <span>{i18nService.t(fileChangeKindLabelKey[change.kind])}</span>
    {typeof change.addedLines === 'number' && (
      <span className="font-medium text-green-600 dark:text-green-400">+{change.addedLines}</span>
    )}
    {typeof change.removedLines === 'number' && change.removedLines > 0 && (
      <span className="font-medium text-red-500">-{change.removedLines}</span>
    )}
    <span>{i18nService.t(statusLabelKey[change.status])}</span>
  </div>
);

const FileChangeRow: React.FC<{
  change: CoworkActivityFileChange;
  selected: boolean;
  onSelect: () => void;
}> = ({ change, selected, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
      selected ? 'bg-primary-muted' : 'hover:bg-surface-raised'
    }`}
  >
    <div className="flex items-start gap-2">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${getStatusDotClass(change.status)}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium text-foreground">
            {basename(change.filePath)}
          </span>
          <ChevronRightIcon className="h-3 w-3 shrink-0 text-muted" />
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
          {change.filePath}
        </div>
        <div className="mt-1">
          <FileChangeStats change={change} />
        </div>
      </div>
    </div>
  </button>
);

const ModeButton: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ active, icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
      active
        ? 'bg-primary-muted text-primary'
        : 'text-secondary hover:bg-surface-raised hover:text-foreground'
    }`}
  >
    {icon}
    <span className="truncate">{label}</span>
  </button>
);

const RuntimeMetricTile: React.FC<{
  label: string;
  value: string;
  hint?: string;
}> = ({ label, value, hint }) => (
  <div className="rounded-lg bg-background px-3 py-2">
    <div className="truncate text-[11px] font-medium text-muted">{label}</div>
    <div className="mt-1 truncate text-sm font-semibold tabular-nums text-foreground">{value}</div>
    {hint && <div className="mt-0.5 truncate text-[10px] text-tertiary">{hint}</div>}
  </div>
);

const RuntimeMonitorCard: React.FC<{
  call: RuntimeCallRecord | null | undefined;
  engineLabel: string;
}> = ({ call, engineLabel }) => {
  if (!call) {
    return <EmptyText>{i18nService.t('coworkActivityRuntimeNoData')}</EmptyText>;
  }

  const runtimeTps = calculateRuntimeTps(call);
  const modelTps = calculateModelTps(call);
  const inputTokens = formatRuntimeNumber(call.inputTokens);
  const outputTokens = formatRuntimeNumber(call.outputTokens ?? call.visibleOutputTokens);
  const modelLabel = call.modelName || call.modelId || i18nService.t('runtimeDashboardAllModels');
  const providerLabel = call.providerName || call.providerKey || '-';

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-muted">
              {i18nService.t('runtimeDashboardModel')}
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-foreground">
              {modelLabel}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-[11px] text-secondary">
            {getRuntimeStatusLabel(call.status)}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <RuntimeMetricTile
          label={i18nService.t('runtimeDashboardEngine')}
          value={engineLabel}
          hint={providerLabel}
        />
        <RuntimeMetricTile
          label={i18nService.t('runtimeDashboardSource')}
          value={getRuntimeSourceLabel(call.source)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <RuntimeMetricTile
          label={call.status === RuntimeCallStatus.Running
            ? i18nService.t('coworkActivityRuntimeElapsed')
            : i18nService.t('runtimeDashboardCompletionTime')}
          value={formatRuntimeDuration(getRuntimeElapsedMs(call))}
        />
        <RuntimeMetricTile
          label={i18nService.t('runtimeDashboardTtft')}
          value={formatRuntimeDuration(call.ttftMs)}
        />
        <RuntimeMetricTile
          label={i18nService.t('runtimeDashboardRuntimeTps')}
          value={formatRuntimeTps(runtimeTps)}
        />
        <RuntimeMetricTile
          label={i18nService.t('runtimeDashboardModelTps')}
          value={formatRuntimeTps(modelTps)}
        />
        <RuntimeMetricTile
          label={i18nService.t('runtimeDashboardTotalTokens')}
          value={`${inputTokens} / ${outputTokens}`}
          hint={i18nService.t('coworkActivityRuntimeInputOutput')}
        />
        <RuntimeMetricTile
          label={i18nService.t('runtimeDashboardToolLatency')}
          value={formatRuntimeDuration(call.toolLatencyMs)}
          hint={`${i18nService.t('runtimeDashboardAgentSteps')} ${formatRuntimeNumber(call.agentSteps)}`}
        />
      </div>
      {call.error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-600 dark:text-red-300">
          <div className="font-medium">{i18nService.t('runtimeDashboardError')}</div>
          <div className="mt-1 line-clamp-3 break-words">{call.error}</div>
        </div>
      )}
    </div>
  );
};

const FileChangeActions: React.FC<{ change: CoworkActivityFileChange }> = ({ change }) => {
  const openPath = async () => {
    await window.electron.shell.openPath(change.filePath);
  };

  const revealPath = async () => {
    await window.electron.shell.showItemInFolder(change.filePath);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void openPath()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-surface-raised px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-primary-muted"
      >
        <DocumentIcon className="h-3.5 w-3.5" />
        {i18nService.t('coworkActivityOpenFile')}
      </button>
      <button
        type="button"
        onClick={() => void revealPath()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-surface-raised px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-primary-muted"
      >
        <FolderOpenIcon className="h-3.5 w-3.5" />
        {i18nService.t('coworkActivityRevealFile')}
      </button>
    </div>
  );
};

const FileChangeDiffPreview: React.FC<{
  change: CoworkActivityFileChange;
  large?: boolean;
}> = ({ change, large = false }) => (
  <div className="space-y-2">
    {change.diffs.length > 0 ? (
      change.diffs.map((diff, index) => (
        <DiffView
          key={`${change.id}-${index}`}
          oldStr={diff.oldStr}
          newStr={diff.newStr}
          filePath={diff.filePath ?? change.filePath}
          maxHeightClassName={large ? 'max-h-[calc(100vh-260px)]' : undefined}
        />
      ))
    ) : (
      <div className="rounded-lg bg-background px-3 py-2 text-xs text-muted">
        {i18nService.t('coworkActivityNoDiffPreview')}
      </div>
    )}
  </div>
);

const LiveFileActions: React.FC<{ activity: CoworkFileActivity; compact?: boolean }> = ({ activity, compact = false }) => {
  const openPath = async () => {
    await window.electron.shell.openPath(activity.filePath);
  };

  const revealPath = async () => {
    await window.electron.shell.showItemInFolder(activity.filePath);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void openPath()}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-surface-raised text-xs text-foreground transition-colors hover:bg-primary-muted ${
          compact ? 'h-7 w-7 justify-center p-0' : 'px-2.5 py-1.5'
        }`}
        aria-label={i18nService.t('coworkActivityOpenFile')}
        title={i18nService.t('coworkActivityOpenFile')}
      >
        <DocumentIcon className="h-3.5 w-3.5" />
        {!compact && i18nService.t('coworkActivityOpenFile')}
      </button>
      <button
        type="button"
        onClick={() => void revealPath()}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-surface-raised text-xs text-foreground transition-colors hover:bg-primary-muted ${
          compact ? 'h-7 w-7 justify-center p-0' : 'px-2.5 py-1.5'
        }`}
        aria-label={i18nService.t('coworkActivityRevealFile')}
        title={i18nService.t('coworkActivityRevealFile')}
      >
        <FolderOpenIcon className="h-3.5 w-3.5" />
        {!compact && i18nService.t('coworkActivityRevealFile')}
      </button>
    </div>
  );
};

const LiveFileRow: React.FC<{
  activity: CoworkFileActivity;
  selected: boolean;
  onSelect: () => void;
}> = ({ activity, selected, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
      selected ? 'bg-primary-muted' : 'hover:bg-surface-raised'
    }`}
  >
    <div className="flex items-start gap-2">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${getLiveStatusDotClass(activity.status)}`} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-medium text-foreground">
            {basename(activity.relativePath || activity.filePath)}
          </span>
          {activity.source === CoworkFileActivitySource.ToolPreview && (
            <span className="shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-300">
              {i18nService.t('coworkActivityLiveSourceToolPreview')}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
          {activity.relativePath || activity.filePath}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-secondary">
          <span>{i18nService.t(liveFileStatusLabelKey[activity.status])}</span>
          <span>{i18nService.t(liveFileSourceLabelKey[activity.source])}</span>
        </div>
      </div>
    </div>
  </button>
);

const LiveCodePreview: React.FC<{ activity: CoworkFileActivity }> = ({ activity }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoFollowRef = useRef(true);
  const previousFilePathRef = useRef<string | null>(null);
  const visibleLineLimitRef = useRef(0);
  const [visibleLineLimit, setVisibleLineLimit] = useState(0);
  const lines = useMemo(() => {
    if (activity.content === null) return [];
    return activity.content.split('\n');
  }, [activity.content]);

  useEffect(() => {
    if (lines.length === 0) {
      visibleLineLimitRef.current = 0;
      setVisibleLineLimit(0);
      return;
    }

    const currentLimit = visibleLineLimitRef.current;
    const sameFile = previousFilePathRef.current === activity.filePath;
    previousFilePathRef.current = activity.filePath;
    if (!sameFile) {
      autoFollowRef.current = true;
    }
    const target = lines.length;
    if (activity.source === CoworkFileActivitySource.Watcher) {
      visibleLineLimitRef.current = target;
      setVisibleLineLimit(target);
      return;
    }

    const initialLimit = getLiveCodeInitialLineLimit(activity.source, target, currentLimit, sameFile);

    if (target <= initialLimit) {
      visibleLineLimitRef.current = target;
      setVisibleLineLimit(target);
      return;
    }

    visibleLineLimitRef.current = initialLimit;
    setVisibleLineLimit(initialLimit);

    const step = target > 800 ? 96 : target > 240 ? 48 : 16;
    const timer = window.setInterval(() => {
      visibleLineLimitRef.current = Math.min(target, visibleLineLimitRef.current + step);
      setVisibleLineLimit(visibleLineLimitRef.current);
      if (visibleLineLimitRef.current >= target) {
        window.clearInterval(timer);
      }
    }, 32);

    return () => window.clearInterval(timer);
  }, [activity.filePath, activity.source, activity.timestamp, lines.length]);

  const progressiveLines = lines.slice(0, Math.min(lines.length, visibleLineLimit || lines.length));
  const visibleLines = progressiveLines;
  const isStillWriting = progressiveLines.length < lines.length || activity.status === CoworkFileActivityStatus.Writing;

  const handleLiveCodeScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    autoFollowRef.current = shouldAutoFollowLiveCodeScroll(distanceFromBottom);
  };

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (activity.source === CoworkFileActivitySource.Watcher && !autoFollowRef.current) return;
    if (!autoFollowRef.current && activity.source === CoworkFileActivitySource.ToolPreview) return;
    window.requestAnimationFrame(() => {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    });
  }, [activity.filePath, activity.source, activity.timestamp, visibleLines.length, visibleLineLimit]);

  if (activity.status === CoworkFileActivityStatus.Deleted) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
        {i18nService.t('coworkActivityLiveDeleted')}
      </div>
    );
  }

  if (activity.content === null) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
        {i18nService.t('coworkActivityLiveNoPreview')}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[#e5e7eb] bg-white shadow-sm dark:border-[#31353f] dark:bg-[#f8fafc]">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-[#e5e7eb] bg-[#f7f7f8] px-3 text-[11px] text-[#6b7280]">
        <span className="truncate font-mono">{activity.language ?? i18nService.t('coworkActivityLiveCode')}</span>
        <div className="flex shrink-0 items-center gap-2">
          {activity.truncated && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">
              {i18nService.t('coworkActivityLiveTruncated')}
            </span>
          )}
          <span>
            {progressiveLines.length} / {lines.length} {i18nService.t('coworkActivityLiveLines')}
          </span>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleLiveCodeScroll}
        className="min-h-0 flex-1 overflow-auto bg-white"
      >
        <pre className="m-0 min-w-max py-4 text-[12px] leading-[20px] text-[#24292f]">
          {visibleLines.map((line, index) => {
            const lineNumber = index + 1;
            const isRecentLine = index >= Math.max(0, visibleLines.length - 6);
            return (
              <div
                key={`${activity.filePath}-${lineNumber}-${index}`}
                className={`grid grid-cols-[4.25rem_1fr] px-2 ${
                  isStillWriting && isRecentLine
                    ? 'bg-emerald-50'
                    : ''
                }`}
              >
                <span className="select-none pr-4 text-right font-mono text-[#9ca3af]">{lineNumber}</span>
                <code className="whitespace-pre pr-6 font-mono">{line || ' '}</code>
              </div>
            );
          })}
          {isStillWriting && (
            <div className="grid grid-cols-[4.25rem_1fr] px-2">
              <span className="select-none pr-4 text-right font-mono text-[#9ca3af]">{visibleLines.length + 1}</span>
              <code className="whitespace-pre pr-6 font-mono text-[#2563eb]">
                <span className="inline-block h-4 w-2 animate-pulse bg-[#2563eb] align-middle" />
              </code>
            </div>
          )}
        </pre>
      </div>
    </div>
  );
};

const CoworkActivitySidebar: React.FC<CoworkActivitySidebarProps> = ({
  snapshot,
  sessionStatus,
  engineLabel,
  cwd,
  mode,
  selectedFileChangeId,
  liveFileActivities,
  selectedLiveFilePath,
  runtimeCall,
  width,
  overlay = false,
  onModeChange,
  onSelectFileChange,
  onSelectLiveFile,
  onResizeStart,
  onClose,
}) => {
  const selectedFileChange = useMemo(() => {
    if (selectedFileChangeId) {
      const selected = snapshot.fileChanges.find((change) => change.id === selectedFileChangeId);
      if (selected) return selected;
    }
    return snapshot.fileChanges[0] ?? null;
  }, [selectedFileChangeId, snapshot.fileChanges]);

  const visibleLiveFileActivities = useMemo(
    () => liveFileActivities.filter((activity) => activity.status !== CoworkFileActivityStatus.Deleted),
    [liveFileActivities],
  );

  const selectedLiveFile = useMemo(() => {
    if (selectedLiveFilePath) {
      const selected = visibleLiveFileActivities.find((activity) => activity.filePath === selectedLiveFilePath);
      if (selected) return selected;
    }
    return visibleLiveFileActivities[0] ?? null;
  }, [selectedLiveFilePath, visibleLiveFileActivities]);

  const selectCodeChange = (fileChangeId: string) => {
    onSelectFileChange(fileChangeId);
    onModeChange(CoworkActivitySidebarMode.CodeDiff);
  };

  const isCodeDiffMode = mode === CoworkActivitySidebarMode.CodeDiff;
  const isLiveCodeMode = mode === CoworkActivitySidebarMode.LiveCode;
  const isRuntimeMonitorMode = mode === CoworkActivitySidebarMode.RuntimeMonitor;
  const isWideMode = isCodeDiffMode || isLiveCodeMode;
  const widthClass = overlay
    ? isWideMode
      ? 'w-[min(760px,calc(100vw-24px))]'
      : 'w-[min(360px,calc(100vw-32px))]'
    : '';
  const sidebarStyle = !overlay && typeof width === 'number'
    ? { width: `${width}px` }
    : undefined;

  const renderOverview = () => (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <div className="rounded-lg bg-background px-3 py-2">
          <div className="text-[11px] font-medium text-muted">
            {i18nService.t('runtimeDashboardEngine')}
          </div>
          <div className="mt-0.5 truncate text-sm text-foreground">{engineLabel}</div>
        </div>
        <div className="mt-2 rounded-lg bg-background px-3 py-2">
          <div className="text-[11px] font-medium text-muted">
            {i18nService.t('coworkActivityWorkingDirectory')}
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-foreground">
            {getCompactFolderName(cwd, 34) || i18nService.t('noFolderSelected')}
          </div>
        </div>
        <div className="mt-2 rounded-lg bg-background px-3 py-2">
          <div className="text-[11px] font-medium text-muted">
            {i18nService.t('coworkActivityActiveTool')}
          </div>
          {snapshot.activeTool ? (
            <ToolRow item={snapshot.activeTool} />
          ) : (
            <div className="mt-1 text-xs text-muted">{i18nService.t('coworkActivityNoActiveTool')}</div>
          )}
        </div>
      </div>

      <Section
        title={i18nService.t('coworkActivityTodos')}
        icon={<ListBulletIcon className="h-4 w-4" />}
        count={snapshot.todos.length}
      >
        {snapshot.todos.length === 0 ? (
          <EmptyText>{i18nService.t('coworkActivityNoTodos')}</EmptyText>
        ) : (
          <div className="space-y-1">
            {snapshot.todos.map((todo) => (
              <div key={todo.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${getTodoDotClass(todo.status)}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-foreground">{todo.text}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                    <span>{i18nService.t(todoStatusLabelKey[todo.status])}</span>
                    {todo.secondaryText && <span className="truncate">{todo.secondaryText}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title={i18nService.t('coworkActivitySkills')}
        icon={<PuzzlePieceIcon className="h-4 w-4" />}
        count={snapshot.skills.length}
      >
        {snapshot.skills.length === 0 ? (
          <EmptyText>{i18nService.t('coworkActivityNoSkills')}</EmptyText>
        ) : (
          <div className="flex flex-wrap gap-2">
            {snapshot.skills.map((skill) => (
              <span
                key={skill.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary-muted px-2.5 py-1 text-xs font-medium text-primary"
                title={skill.description}
              >
                <PuzzlePieceIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{skill.name}</span>
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section
        title={i18nService.t('coworkActivityFileChanges')}
        icon={<DocumentIcon className="h-4 w-4" />}
        count={snapshot.fileChanges.length}
      >
        {snapshot.fileChanges.length === 0 ? (
          <EmptyText>{i18nService.t('coworkActivityNoFileChanges')}</EmptyText>
        ) : (
          <div className="space-y-1">
            {snapshot.fileChanges.map((change) => (
              <FileChangeRow
                key={change.id}
                change={change}
                selected={change.id === selectedFileChange?.id}
                onSelect={() => selectCodeChange(change.id)}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        title={i18nService.t('coworkActivityArtifacts')}
        icon={<PhotoIcon className="h-4 w-4" />}
        count={snapshot.artifacts.length}
      >
        {snapshot.artifacts.length === 0 ? (
          <EmptyText>{i18nService.t('coworkActivityNoArtifacts')}</EmptyText>
        ) : (
          <div className="space-y-1">
            {snapshot.artifacts.map((artifact) => (
              <div key={artifact.id} className="rounded-lg px-2 py-2 hover:bg-surface-raised">
                <div className="flex items-start gap-2">
                  {artifact.type === ActivityArtifactType.Image ? (
                    <PhotoIcon className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                  ) : (
                    <DocumentIcon className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground">{artifact.name}</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-muted">{artifact.path}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 pl-6">
                  <button
                    type="button"
                    onClick={() => void window.electron.shell.openPath(artifact.path)}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    {i18nService.t('coworkActivityOpenFile')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void window.electron.shell.showItemInFolder(artifact.path)}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    {i18nService.t('coworkActivityRevealFile')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title={i18nService.t('coworkActivityToolTimeline')}
        icon={<WrenchScrewdriverIcon className="h-4 w-4" />}
        count={snapshot.toolTimeline.length}
      >
        {snapshot.toolTimeline.length === 0 ? (
          <EmptyText>{i18nService.t('coworkActivityNoTools')}</EmptyText>
        ) : (
          <div className="space-y-0.5">
            {snapshot.toolTimeline.map((item) => (
              <ToolRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );

  const renderRuntimeMonitor = () => (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <RuntimeMonitorCard call={runtimeCall} engineLabel={engineLabel} />
    </div>
  );

  const renderLiveCode = () => (
    <div className={`flex min-h-0 flex-1 ${overlay ? 'flex-col' : 'flex-row'}`}>
      <div className={`${overlay ? 'max-h-52 border-b' : 'w-52 shrink-0 border-r'} min-h-0 overflow-y-auto border-border bg-[#fafafa] px-3 py-3`}>
        <div className="mb-2 text-xs font-semibold text-foreground">
          {i18nService.t('coworkActivityLiveFiles')}
        </div>
        {visibleLiveFileActivities.length === 0 ? (
          <EmptyText>{i18nService.t('coworkActivityNoLiveFiles')}</EmptyText>
        ) : (
          <div className="space-y-1">
            {visibleLiveFileActivities.map((activity) => (
              <LiveFileRow
                key={activity.filePath}
                activity={activity}
                selected={activity.filePath === selectedLiveFile?.filePath}
                onSelect={() => onSelectLiveFile(activity.filePath)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        {selectedLiveFile ? (
          <>
            <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[#e5e7eb] bg-white px-4">
              <div className="flex min-w-0 items-center gap-2">
                <DocumentIcon className="h-4 w-4 shrink-0 text-[#6b7280]" />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-xs font-semibold text-[#111827]">
                      {i18nService.t('coworkActivityLiveFileLabel')}
                    </span>
                    <span className="truncate text-xs font-medium text-[#4b5563]">
                      {basename(selectedLiveFile.relativePath || selectedLiveFile.filePath)}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-[#9ca3af]">
                    {selectedLiveFile.relativePath || selectedLiveFile.filePath}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${getLiveStatusDotClass(selectedLiveFile.status)}`} />
                <span className="hidden text-[11px] text-[#6b7280] sm:inline">
                  {i18nService.t(liveFileStatusLabelKey[selectedLiveFile.status])}
                </span>
                <LiveFileActions activity={selectedLiveFile} compact />
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <LiveCodePreview activity={selectedLiveFile} />
            </div>
          </>
        ) : (
          <div className="p-4">
            <EmptyText>{i18nService.t('coworkActivityNoLiveFiles')}</EmptyText>
          </div>
        )}
      </div>
    </div>
  );

  const renderCodeDiff = () => (
    <div className={`flex min-h-0 flex-1 ${overlay ? 'flex-col' : 'flex-row'}`}>
      <div className={`${overlay ? 'max-h-52 border-b' : 'w-56 shrink-0 border-r'} min-h-0 overflow-y-auto border-border px-3 py-3`}>
        <div className="mb-2 text-xs font-semibold text-foreground">
          {i18nService.t('coworkActivityFileChanges')}
        </div>
        {snapshot.fileChanges.length === 0 ? (
          <EmptyText>{i18nService.t('coworkActivityNoFileChanges')}</EmptyText>
        ) : (
          <div className="space-y-1">
            {snapshot.fileChanges.map((change) => (
              <FileChangeRow
                key={change.id}
                change={change}
                selected={change.id === selectedFileChange?.id}
                onSelect={() => onSelectFileChange(change.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-4">
        {selectedFileChange ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-background px-3 py-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${getStatusDotClass(selectedFileChange.status)}`} />
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {basename(selectedFileChange.filePath)}
                    </h3>
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-muted">
                    {selectedFileChange.filePath}
                  </div>
                  <div className="mt-2">
                    <FileChangeStats change={selectedFileChange} />
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <FileChangeActions change={selectedFileChange} />
              </div>
            </div>
            <FileChangeDiffPreview change={selectedFileChange} large />
          </div>
        ) : (
          <EmptyText>{i18nService.t('coworkActivityNoFileChanges')}</EmptyText>
        )}
      </div>
    </div>
  );

  return (
    <aside
      className={`relative flex h-full min-h-0 shrink-0 flex-col border-l border-border bg-surface ${widthClass} ${overlay ? 'shadow-2xl' : ''}`}
      style={sidebarStyle}
    >
      {!overlay && onResizeStart && (
        <button
          type="button"
          onPointerDown={onResizeStart}
          className="group absolute inset-y-0 left-0 z-30 w-2 -translate-x-1 cursor-col-resize touch-none"
          aria-label={i18nService.t('coworkActivityResize')}
          title={i18nService.t('coworkActivityResize')}
        >
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary/50" />
        </button>
      )}
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isLiveCodeMode ? (
              <CodeBracketIcon className="h-4 w-4 text-primary" />
            ) : isCodeDiffMode ? (
              <DocumentIcon className="h-4 w-4 text-primary" />
            ) : isRuntimeMonitorMode ? (
              <ChartBarIcon className="h-4 w-4 text-primary" />
            ) : (
              <QueueListIcon className="h-4 w-4 text-primary" />
            )}
            <h2 className="truncate text-sm font-semibold text-foreground">
              {i18nService.t(
                isLiveCodeMode
                  ? 'coworkActivityLiveCode'
                  : isCodeDiffMode
                    ? 'coworkActivityCodeChanges'
                    : isRuntimeMonitorMode
                      ? 'coworkActivityRuntimeMonitor'
                    : 'coworkActivityPanelTitle',
              )}
            </h2>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted">
            {getSessionStatusLabel(sessionStatus)} · {engineLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface-raised"
          aria-label={i18nService.t('coworkActivityClose')}
          title={i18nService.t('coworkActivityClose')}
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="grid grid-cols-4 rounded-xl bg-background p-1">
          <ModeButton
            active={mode === CoworkActivitySidebarMode.Overview}
            icon={<QueueListIcon className="h-3.5 w-3.5" />}
            label={i18nService.t('coworkActivityOverview')}
            onClick={() => onModeChange(CoworkActivitySidebarMode.Overview)}
          />
          <ModeButton
            active={mode === CoworkActivitySidebarMode.RuntimeMonitor}
            icon={<ChartBarIcon className="h-3.5 w-3.5" />}
            label={i18nService.t('coworkActivityRuntimeMonitor')}
            onClick={() => onModeChange(CoworkActivitySidebarMode.RuntimeMonitor)}
          />
          <ModeButton
            active={mode === CoworkActivitySidebarMode.LiveCode}
            icon={<CodeBracketIcon className="h-3.5 w-3.5" />}
            label={i18nService.t('coworkActivityLiveCode')}
            onClick={() => onModeChange(CoworkActivitySidebarMode.LiveCode)}
          />
          <ModeButton
            active={mode === CoworkActivitySidebarMode.CodeDiff}
            icon={<DocumentIcon className="h-3.5 w-3.5" />}
            label={i18nService.t('coworkActivityCodeChanges')}
            onClick={() => onModeChange(CoworkActivitySidebarMode.CodeDiff)}
          />
        </div>
      </div>

      {isLiveCodeMode
        ? renderLiveCode()
        : isCodeDiffMode
          ? renderCodeDiff()
          : isRuntimeMonitorMode
            ? renderRuntimeMonitor()
            : renderOverview()}
    </aside>
  );
};

export default CoworkActivitySidebar;
