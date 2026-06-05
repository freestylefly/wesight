import { ChartBarIcon, CheckIcon, ChevronDownIcon, ExclamationTriangleIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { AgentRunTargetType } from '@shared/cowork/constants';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { MainView } from '../constants/app';
import { agentService } from '../services/agent';
import { coworkService } from '../services/cowork';
import { i18nService } from '../services/i18n';
import { RootState } from '../store';
import { getAgentDisplayName, isDefaultAgent } from '../utils/defaultAgentDisplay';
import DefaultAgentIcon from './agent/DefaultAgentIcon';
import Modal from './common/Modal';
import CoworkSearchModal from './cowork/CoworkSearchModal';
import CoworkSessionList from './cowork/CoworkSessionList';
import ComposeIcon from './icons/ComposeIcon';
import PuzzleIcon from './icons/PuzzleIcon';
import SearchIcon from './icons/SearchIcon';
import SidebarToggleIcon from './icons/SidebarToggleIcon';
import TrashIcon from './icons/TrashIcon';
import UserGroupIcon from './icons/UserGroupIcon';
import LoginButton from './LoginButton';

interface SidebarProps {
  onShowSettings: () => void;
  onShowLogin?: () => void;
  activeView: MainView;
  onShowSkills: () => void;
  onShowCowork: () => void;
  onShowRuntimeDashboard: () => void;
  onShowAgents: () => void;
  onShowCreator: () => void;
  onShowAgentSettings: () => void;
  onNewChat: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  updateBadge?: React.ReactNode;
  hideLogin?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  onShowSettings,
  activeView,
  onShowSkills,
  onShowCowork,
  onShowRuntimeDashboard,
  onShowAgents,
  onShowCreator,
  onShowAgentSettings,
  onNewChat,
  isCollapsed,
  onToggleCollapse,
  updateBadge,
  hideLogin,
}) => {
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const currentTeamId = useSelector((state: RootState) => state.agent.currentTeamId);
  const currentTargetType = useSelector((state: RootState) => state.agent.currentTargetType);
  const sessions = useSelector((state: RootState) => state.cowork.sessions);
  const activeTargetId = currentTargetType === AgentRunTargetType.Team && currentTeamId
    ? `team:${currentTeamId}`
    : currentAgentId;
  const filteredSessions = sessions.filter((s) => !s.agentId || s.agentId === activeTargetId);
  const currentSessionId = useSelector((state: RootState) => state.cowork.currentSessionId);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [, forceLanguageRefresh] = useState(0);
  const isMac = window.electron.platform === 'darwin';

  useEffect(() => {
    const unsubscribe = i18nService.subscribe(() => {
      forceLanguageRefresh((prev) => prev + 1);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleSearch = () => {
      onShowCowork();
      setIsSearchOpen(true);
    };
    window.addEventListener('cowork:shortcut:search', handleSearch);
    return () => {
      window.removeEventListener('cowork:shortcut:search', handleSearch);
    };
  }, [onShowCowork]);

  useEffect(() => {
    if (!isCollapsed) return;
    setIsSearchOpen(false);
    setIsBatchMode(false);
    setSelectedIds(new Set());
    setShowBatchDeleteConfirm(false);
  }, [isCollapsed]);

  const handleSelectSession = async (sessionId: string) => {
    onShowCowork();
    await coworkService.loadSession(sessionId);
  };

  const handleDeleteSession = async (sessionId: string) => {
    await coworkService.deleteSession(sessionId);
  };

  const handleTogglePin = async (sessionId: string, pinned: boolean) => {
    await coworkService.setSessionPinned(sessionId, pinned);
  };

  const handleRenameSession = async (sessionId: string, title: string) => {
    await coworkService.renameSession(sessionId, title);
  };

  const handleEnterBatchMode = useCallback((sessionId: string) => {
    setIsBatchMode(true);
    setSelectedIds(new Set([sessionId]));
  }, []);

  const handleExitBatchMode = useCallback(() => {
    setIsBatchMode(false);
    setSelectedIds(new Set());
    setShowBatchDeleteConfirm(false);
  }, []);

  const handleToggleSelection = useCallback((sessionId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === filteredSessions.length) {
        return new Set();
      }
      return new Set(filteredSessions.map(s => s.id));
    });
  }, [filteredSessions]);

  const handleBatchDeleteClick = useCallback(() => {
    if (selectedIds.size === 0) return;
    setShowBatchDeleteConfirm(true);
  }, [selectedIds.size]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    await coworkService.deleteSessions(ids);
    handleExitBatchMode();
  }, [selectedIds, handleExitBatchMode]);

  return (
    <aside
      className={`shrink-0 bg-surface-raised flex flex-col sidebar-transition overflow-hidden ${
        isCollapsed ? 'w-0' : 'w-60'
      }`}
    >
      <div className="pt-3 pb-3">
        <div className="draggable sidebar-header-drag h-8 flex items-center justify-between px-3">
          <div className={`${isMac ? 'pl-[68px]' : ''}`}>
            {updateBadge}
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="non-draggable h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
            aria-label={isCollapsed ? i18nService.t('expand') : i18nService.t('collapse')}
          >
            <SidebarToggleIcon className="h-4 w-4" isCollapsed={isCollapsed} />
          </button>
        </div>
        <div className="mt-3 space-y-1 px-3">
          <button
            type="button"
            onClick={onNewChat}
            className={`w-full inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
              activeView === MainView.Cowork
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'text-secondary hover:text-foreground hover:bg-surface-raised'
            }`}
          >
            <ComposeIcon className="h-4 w-4" />
            {i18nService.t('newChat')}
          </button>
          <button
            type="button"
            onClick={() => {
              onShowCowork();
              setIsSearchOpen(true);
            }}
            className="w-full inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-secondary hover:text-foreground hover:bg-surface-raised transition-colors"
          >
            <SearchIcon className="h-4 w-4" />
            {i18nService.t('search')}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen(false);
              onShowRuntimeDashboard();
            }}
            className={`w-full inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
              activeView === MainView.Runtime
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'text-secondary hover:text-foreground hover:bg-surface-raised'
            }`}
          >
            <ChartBarIcon className="h-4 w-4" />
            {i18nService.t('runtimeDashboardNav')}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen(false);
              onShowSkills();
            }}
            className={`w-full inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
              activeView === MainView.Skills
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'text-secondary hover:text-foreground hover:bg-surface-raised'
            }`}
          >
            <PuzzleIcon className="h-4 w-4" />
            {i18nService.t('skills')}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen(false);
              onShowAgents();
            }}
            className={`w-full inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
              activeView === MainView.Agents
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'text-secondary hover:text-foreground hover:bg-surface-raised'
            }`}
          >
            <UserGroupIcon className="h-4 w-4" />
            {i18nService.t('agentTeams')}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen(false);
              onShowCreator();
            }}
            className={`w-full inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
              activeView === MainView.Creator
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'text-secondary hover:text-foreground hover:bg-surface-raised'
            }`}
          >
            <SparklesIcon className="h-4 w-4" />
            {i18nService.t('creatorStudioNav')}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 pb-4">
        <SidebarRunTargetSwitcher
          onShowCowork={onShowCowork}
          onManageAgents={onShowAgentSettings}
          onSessionsLoadingChange={setSessionsLoading}
        />
        <div className="px-3 pb-2 text-sm font-medium text-secondary">
          {i18nService.t('coworkHistory')}
        </div>
        <CoworkSessionList
          sessions={filteredSessions}
          isLoading={sessionsLoading}
          currentSessionId={currentSessionId}
          isBatchMode={isBatchMode}
          selectedIds={selectedIds}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onTogglePin={handleTogglePin}
          onRenameSession={handleRenameSession}
          onToggleSelection={handleToggleSelection}
          onEnterBatchMode={handleEnterBatchMode}
        />
      </div>
      <CoworkSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        sessions={filteredSessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onTogglePin={handleTogglePin}
        onRenameSession={handleRenameSession}
      />
      {isBatchMode ? (
        <div className="px-3 pb-3 pt-1 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-secondary">
            <input
              type="checkbox"
              checked={selectedIds.size === filteredSessions.length && filteredSessions.length > 0}
              onChange={handleSelectAll}
              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 accent-primary cursor-pointer"
            />
            {i18nService.t('batchSelectAll')}
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBatchDeleteClick}
              disabled={selectedIds.size === 0}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                selectedIds.size > 0
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
            >
              <TrashIcon className="h-3.5 w-3.5" />
              {selectedIds.size > 0 ? `${selectedIds.size}` : ''}
            </button>
            <button
              type="button"
              onClick={handleExitBatchMode}
              className="px-3 py-1.5 text-sm font-medium rounded-lg text-secondary hover:bg-surface-raised transition-colors"
            >
              {i18nService.t('batchCancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 pb-3 pt-1 flex items-center gap-1">
          {!hideLogin && (
            <>
              <LoginButton />
              <div className="flex-1" />
            </>
          )}
          <button
            type="button"
            onClick={() => onShowSettings()}
            className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-secondary hover:text-foreground hover:bg-surface-raised transition-colors"
            aria-label={i18nService.t('settings')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M14 17H5" /><path d="M19 7h-9" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>
            {i18nService.t('settings')}
          </button>
        </div>
      )}
      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteConfirm && (
        <Modal onClose={() => setShowBatchDeleteConfirm(false)} className="w-full max-w-sm mx-4 bg-surface rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-500" />
              </div>
              <h2 className="text-base font-semibold text-foreground">
                {i18nService.t('batchDeleteConfirmTitle')}
              </h2>
            </div>
            <div className="px-5 pb-4">
              <p className="text-sm text-secondary">
                {i18nService.t('batchDeleteConfirmMessage').replace('{count}', String(selectedIds.size))}
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
              <button
                onClick={() => setShowBatchDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg text-secondary hover:bg-surface-raised transition-colors"
              >
                {i18nService.t('cancel')}
              </button>
              <button
                onClick={handleBatchDelete}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                {i18nService.t('batchDelete')} ({selectedIds.size})
              </button>
            </div>
        </Modal>
      )}
    </aside>
  );
};

/* ── Current run target quick-switch ─── */

const SidebarRunTargetSwitcher: React.FC<{
  onShowCowork: () => void;
  onManageAgents: () => void;
  onSessionsLoadingChange: (loading: boolean) => void;
}> = ({ onShowCowork, onManageAgents, onSessionsLoadingChange }) => {
  const agents = useSelector((state: RootState) => state.agent.agents);
  const teams = useSelector((state: RootState) => state.agent.teams);
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const currentTeamId = useSelector((state: RootState) => state.agent.currentTeamId);
  const currentTargetType = useSelector((state: RootState) => state.agent.currentTargetType);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    agentService.loadAgents();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  const enabledAgents = agents.filter((a) => a.enabled);
  const enabledTeams = teams.filter((team) => team.enabled);
  const currentAgent = enabledAgents.find((agent) => agent.id === currentAgentId) ?? enabledAgents[0] ?? null;
  const currentTeam = currentTeamId
    ? enabledTeams.find((team) => team.id === currentTeamId) ?? null
    : null;
  const isTeamTarget = currentTargetType === AgentRunTargetType.Team && currentTeam;
  const currentTargetIcon = isTeamTarget
    ? currentTeam.icon || '👥'
    : currentAgent?.icon || '🤖';
  const currentTargetLabel = isTeamTarget
    ? currentTeam.name
    : currentAgent ? getAgentDisplayName(currentAgent) : i18nService.t('agentSwitcherEmpty');
  const currentTargetMeta = isTeamTarget
    ? `${currentTeam.members.length}${i18nService.t('agentTeamMemberUnit')}`
    : i18nService.t('agentRunTargetAgents');

  const handleSwitch = async (agentId: string) => {
    setIsOpen(false);
    if (currentTargetType === AgentRunTargetType.Agent && agentId === currentAgentId) return;
    agentService.switchAgent(agentId);
    onShowCowork();
    onSessionsLoadingChange(true);
    try {
      await coworkService.loadSessions(agentId);
    } finally {
      onSessionsLoadingChange(false);
    }
  };

  const handleSwitchTeam = async (teamId: string) => {
    setIsOpen(false);
    if (currentTargetType === AgentRunTargetType.Team && teamId === currentTeamId) return;
    agentService.switchTeam(teamId);
    onShowCowork();
    onSessionsLoadingChange(true);
    try {
      await coworkService.loadSessions(`team:${teamId}`);
    } finally {
      onSessionsLoadingChange(false);
    }
  };

  return (
    <div ref={dropdownRef} className="relative px-3 pb-3">
      <div className="mb-1.5 px-1 text-[11px] font-medium text-muted">
        {i18nService.t('currentRunTarget')}
      </div>
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg border border-transparent bg-background/70 px-2 py-1.5 text-left text-sm text-foreground shadow-sm transition-colors hover:border-border hover:bg-surface"
        aria-label={i18nService.t('agentSwitcherAria')}
        aria-expanded={isOpen}
      >
        {!isTeamTarget && currentAgent && isDefaultAgent(currentAgent.id) ? (
          <DefaultAgentIcon size={22} className="-ml-0.5 w-5" />
        ) : (
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-base leading-none">
            {currentTargetIcon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{currentTargetLabel}</span>
          <span className="block truncate text-[10px] text-muted">{currentTargetMeta}</span>
        </span>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 shrink-0 text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (enabledAgents.length > 0 || enabledTeams.length > 0) && (
        <div className="absolute left-3 right-3 top-[calc(100%-8px)] z-20 rounded-xl border border-border bg-background p-1 shadow-lg">
          {enabledAgents.length > 0 && (
            <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted">
              {i18nService.t('agentRunTargetAgents')}
            </div>
          )}
          {enabledAgents.map((agent) => (
            <button
              type="button"
              key={agent.id}
              className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                currentTargetType === AgentRunTargetType.Agent && currentAgentId === agent.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-secondary hover:bg-surface-raised'
              }`}
              onClick={() => handleSwitch(agent.id)}
            >
              {isDefaultAgent(agent.id) ? (
                <DefaultAgentIcon size={20} className="-ml-0.5 w-5" />
              ) : (
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-base leading-none">
                  {agent.icon || '🤖'}
                </span>
            )}
            <span className="truncate flex-1 text-xs font-medium">{getAgentDisplayName(agent)}</span>
            {currentTargetType === AgentRunTargetType.Agent && currentAgentId === agent.id && (
              <CheckIcon className="h-3.5 w-3.5 shrink-0" />
            )}
          </button>
          ))}
          {enabledTeams.length > 0 && (
            <>
              <div className="my-1 border-t border-border" />
              <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted">
                {i18nService.t('agentRunTargetTeams')}
              </div>
              {enabledTeams.map((team) => (
                <button
                  type="button"
                  key={team.id}
                  className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                    currentTargetType === AgentRunTargetType.Team && currentTeamId === team.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-secondary hover:bg-surface-raised'
                  }`}
                  onClick={() => handleSwitchTeam(team.id)}
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-base leading-none">
                    {team.icon || '👥'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{team.name}</span>
                    <span className="block truncate text-[10px] text-muted">
                      {team.members.length}{i18nService.t('agentTeamMemberUnit')}
                    </span>
                  </span>
                  {currentTargetType === AgentRunTargetType.Team && currentTeamId === team.id && (
                    <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
              ))}
            </>
          )}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
            onClick={() => {
              setIsOpen(false);
              onManageAgents();
            }}
          >
            <UserGroupIcon className="h-4 w-4 shrink-0" />
            <span className="truncate text-xs">{i18nService.t('manageAgentsAndTeams')}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
