import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { AgentRunTargetType, CoworkAgentEngine, DefaultAgent, ExternalAgentConfigSource } from '@shared/cowork/constants';
import React, { useEffect, useRef,useState } from 'react';
import { useDispatch,useSelector } from 'react-redux';

import { coworkService } from '../../services/cowork';
import { i18nService } from '../../services/i18n';
import { quickActionService } from '../../services/quickAction';
import { skillService } from '../../services/skill';
import { RootState, store } from '../../store';
import { setCurrentAgentId, setCurrentTeamId } from '../../store/slices/agentSlice';
import { addMessage, setCurrentSession, setStreaming, updateSessionStatus } from '../../store/slices/coworkSlice';
import { clearSelection,selectAction, setActions } from '../../store/slices/quickActionSlice';
import { clearActiveSkills, setActiveSkillIds } from '../../store/slices/skillSlice';
import type { CoworkImageAttachment, CoworkSession, ExternalAgentProviderAppType, OpenClawEngineStatus } from '../../types/cowork';
import { getAgentDisplayName, getAgentSelectIcon } from '../../utils/defaultAgentDisplay';
import Modal from '../common/Modal';
import ComposeIcon from '../icons/ComposeIcon';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import { PromptPanel,QuickActionBar } from '../quick-actions';
import type { SettingsOpenOptions } from '../Settings';
import WindowTitleBar from '../window/WindowTitleBar';
import CoworkPromptInput, { type CoworkPromptInputRef, type CoworkSlashCommandHandler } from './CoworkPromptInput';
import CoworkSessionDetail from './CoworkSessionDetail';

export interface CoworkViewProps {
  onRequestAppSettings?: (options?: SettingsOpenOptions) => void;
  onShowSkills?: () => void;
  onShowMcp?: () => void;
  onShowAgents?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

type SlashPanelKind = 'context' | 'status' | 'help';

const COWORK_SLASH_PANEL_COMMANDS = [
  { command: '/model', descriptionKey: 'coworkSlashCommandModel' },
  { command: '/context', descriptionKey: 'coworkSlashCommandContext' },
  { command: '/status', descriptionKey: 'coworkSlashCommandStatus' },
  { command: '/help', descriptionKey: 'coworkSlashCommandHelp' },
  { command: '/clear', descriptionKey: 'coworkSlashCommandClear' },
  { command: '/new', descriptionKey: 'coworkSlashCommandNew' },
  { command: '/config', descriptionKey: 'coworkSlashCommandConfig' },
  { command: '/permissions', descriptionKey: 'coworkSlashCommandPermissions' },
  { command: '/mcp', descriptionKey: 'coworkSlashCommandMcp' },
  { command: '/agents', descriptionKey: 'coworkSlashCommandAgents' },
  { command: '/skills', descriptionKey: 'coworkSlashCommandSkills' },
  { command: '/memory', descriptionKey: 'coworkSlashCommandMemory' },
] as const;

const usesLocalCliModelConfigForEngine = (
  config: RootState['cowork']['config'],
  engine: CoworkAgentEngine,
): boolean => (
  (
    engine === CoworkAgentEngine.OpenClaw
    && config.openclawConfigSource === ExternalAgentConfigSource.LocalCli
  )
  || (
    engine === CoworkAgentEngine.ClaudeCode
    && config.claudeCodeConfigSource === ExternalAgentConfigSource.LocalCli
  )
  || (
    engine === CoworkAgentEngine.Codex
    && config.codexConfigSource === ExternalAgentConfigSource.LocalCli
  )
  || engine === CoworkAgentEngine.CodexApp
  || (
    engine === CoworkAgentEngine.Hermes
    && config.hermesConfigSource === ExternalAgentConfigSource.LocalCli
  )
  || (
    engine === CoworkAgentEngine.OpenCode
    && config.opencodeConfigSource === ExternalAgentConfigSource.LocalCli
  )
  || engine === CoworkAgentEngine.GrokBuild
  || (
    engine === CoworkAgentEngine.QwenCode
    && config.qwenCodeConfigSource === ExternalAgentConfigSource.LocalCli
  )
  || (
    engine === CoworkAgentEngine.DeepSeekTui
    && config.deepseekTuiConfigSource === ExternalAgentConfigSource.LocalCli
  )
);

const shouldRequireWesightModelConfig = (engine?: CoworkAgentEngine): boolean => (
  !usesLocalCliModelConfigForEngine(
    store.getState().cowork.config,
    engine || store.getState().cowork.config.agentEngine,
  )
);

const getCliAppTypeForEngine = (engine: CoworkAgentEngine): ExternalAgentProviderAppType | null => {
  if (engine === CoworkAgentEngine.ClaudeCode) return 'claude';
  if (engine === CoworkAgentEngine.Codex) return 'codex';
  if (engine === CoworkAgentEngine.OpenClaw) return 'openclaw';
  if (engine === CoworkAgentEngine.Hermes) return 'hermes';
  if (engine === CoworkAgentEngine.OpenCode) return 'opencode';
  if (engine === CoworkAgentEngine.GrokBuild) return 'grok';
  if (engine === CoworkAgentEngine.QwenCode) return 'qwen';
  if (engine === CoworkAgentEngine.DeepSeekTui) return 'deepseek_tui';
  return null;
};

const getEngineLabelKey = (engine: CoworkAgentEngine): string => {
  if (engine === CoworkAgentEngine.OpenClaw) return 'coworkAgentEngineOpenClaw';
  if (engine === CoworkAgentEngine.Hermes) return 'coworkAgentEngineHermes';
  if (engine === CoworkAgentEngine.ClaudeCode) return 'coworkAgentEngineClaudeCode';
  if (engine === CoworkAgentEngine.Codex) return 'coworkAgentEngineCodex';
  if (engine === CoworkAgentEngine.OpenCode) return 'coworkAgentEngineOpenCode';
  if (engine === CoworkAgentEngine.GrokBuild) return 'coworkAgentEngineGrokBuild';
  if (engine === CoworkAgentEngine.QwenCode) return 'coworkAgentEngineQwenCode';
  if (engine === CoworkAgentEngine.DeepSeekTui) return 'coworkAgentEngineDeepSeekTui';
  if (engine === CoworkAgentEngine.CodexApp) return 'coworkAgentEngineCodexApp';
  return 'coworkAgentEngineClaudeLegacy';
};

const CoworkView: React.FC<CoworkViewProps> = ({ onRequestAppSettings, onShowSkills, onShowMcp, onShowAgents, isSidebarCollapsed, onToggleSidebar, onNewChat, updateBadge }) => {
  const dispatch = useDispatch();
  const isMac = window.electron.platform === 'darwin';
  const [isInitialized, setIsInitialized] = useState(false);
  const [, forceLanguageRefresh] = useState(0);
  const [openClawStatus, setOpenClawStatus] = useState<OpenClawEngineStatus | null>(null);
  const [isRestartingGateway, setIsRestartingGateway] = useState(false);
  const [slashPanelKind, setSlashPanelKind] = useState<SlashPanelKind | null>(null);
  const [slashPanelNoticeCommand, setSlashPanelNoticeCommand] = useState<string | null>(null);
  // Track if we're starting/continuing a session to prevent duplicate submissions
  const isStartingRef = useRef(false);
  const isContinuingRef = useRef(false);
  // Track pending start request so stop can cancel delayed startup.
  const pendingStartRef = useRef<{
    requestId: number;
    cancelled: boolean;
    cancellationAction: 'stop' | 'delete' | null;
  } | null>(null);
  const startRequestIdRef = useRef(0);
  // Ref for CoworkPromptInput
  const promptInputRef = useRef<CoworkPromptInputRef>(null);

  const {
    currentSession,
    isStreaming,
    config,
  } = useSelector((state: RootState) => state.cowork);

  const activeSkillIds = useSelector((state: RootState) => state.skill.activeSkillIds);
  const skills = useSelector((state: RootState) => state.skill.skills);
  const quickActions = useSelector((state: RootState) => state.quickAction.actions);
  const selectedActionId = useSelector((state: RootState) => state.quickAction.selectedActionId);
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const currentTeamId = useSelector((state: RootState) => state.agent.currentTeamId);
  const currentTargetType = useSelector((state: RootState) => state.agent.currentTargetType);
  const agents = useSelector((state: RootState) => state.agent.agents);
  const teams = useSelector((state: RootState) => state.agent.teams);
  const selectedModel = useSelector((state: RootState) => state.model.selectedModel);
  const currentTeam = currentTeamId ? teams.find((team) => team.id === currentTeamId) : null;
  const getRuntimeEngineForAgent = (agentId: string): CoworkAgentEngine => {
    if (agentId === DefaultAgent.Id) {
      return config.agentEngine;
    }
    return agents.find((agent) => agent.id === agentId)?.agentEngine || config.agentEngine;
  };
  const selectedRuntimeEngine = currentTargetType === AgentRunTargetType.Team
    ? config.agentEngine
    : getRuntimeEngineForAgent(currentAgentId);
  const canSelectRuntimeEngine = currentTargetType === AgentRunTargetType.Agent
    && currentAgentId === DefaultAgent.Id;
  const isOpenClawEngine = selectedRuntimeEngine === CoworkAgentEngine.OpenClaw;
  const isBuiltinCoworkEngine = selectedRuntimeEngine === CoworkAgentEngine.YdCowork;

  useEffect(() => {
    const unsubscribe = i18nService.subscribe(() => {
      forceLanguageRefresh((prev) => prev + 1);
    });
    return unsubscribe;
  }, []);

  const buildApiConfigNotice = (error?: string): { noticeI18nKey: string; noticeExtra?: string } => {
    const key = 'coworkModelSettingsRequired';
    if (!error) {
      return { noticeI18nKey: key };
    }
    const normalizedError = error.trim();
    if (
      normalizedError.startsWith('No enabled provider found for model:')
      || normalizedError === 'No available model configured in enabled providers.'
    ) {
      return { noticeI18nKey: key };
    }
    return { noticeI18nKey: key, noticeExtra: error };
  };

  const resolveEngineStatusText = (status: OpenClawEngineStatus): string => {
    switch (status.phase) {
      case 'not_installed':
        return i18nService.t('coworkOpenClawNotInstalledNotice');
      case 'installing':
        return i18nService.t('coworkOpenClawInstalling');
      case 'ready':
        return i18nService.t('coworkOpenClawReadyNotice');
      case 'starting':
        return i18nService.t('coworkOpenClawStarting');
      case 'error':
        return i18nService.t('coworkOpenClawError');
      case 'running':
      default:
        return i18nService.t('coworkOpenClawRunning');
    }
  };

  const isOpenClawReadyForSession = (status: OpenClawEngineStatus | null): boolean => {
    if (!status) return false;
    return status.phase === 'running' || status.phase === 'ready';
  };

  const ensureOpenClawReadyBeforeSend = async (): Promise<boolean> => {
    if (!isOpenClawEngine) {
      return true;
    }
    if (isOpenClawReadyForSession(openClawStatus)) {
      return true;
    }

    setIsRestartingGateway(true);
    try {
      const nextStatus = await coworkService.installOpenClawEngine();
      if (isOpenClawReadyForSession(nextStatus)) {
        return true;
      }
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: i18nService.t('coworkErrorEngineNotReady') }));
      return false;
    } catch (error) {
      console.error('[CoworkView] Failed to prepare OpenClaw runtime:', error);
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: i18nService.t('coworkErrorEngineNotReady') }));
      return false;
    } finally {
      setIsRestartingGateway(false);
    }
  };

  const ensureCliInstalledBeforeSend = async (): Promise<boolean> => {
    const appType = getCliAppTypeForEngine(selectedRuntimeEngine);
    if (!appType) return true;
    try {
      const snapshot = await coworkService.getAgentEngineSnapshot({ appTypes: [appType] });
      const status = snapshot?.engines.find((item) => item.appType === appType);
      if (status?.found) {
        return true;
      }
      const message = i18nService.t('coworkAgentEngineCliRequiredBeforeSend');
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: message }));
      onRequestAppSettings?.({
        initialTab: 'coworkAgentEngine',
        noticeI18nKey: 'coworkAgentEngineCliRequiredBeforeSend',
        noticeExtra: i18nService.t(getEngineLabelKey(selectedRuntimeEngine)),
      });
      return false;
    } catch (error) {
      console.error('[CoworkView] Failed to check selected agent CLI before send:', error);
      return true;
    }
  };

  const handleRestartGateway = async () => {
    if (isRestartingGateway) return;
    setIsRestartingGateway(true);
    try {
      if (openClawStatus?.phase === 'not_installed') {
        await coworkService.installOpenClawEngine();
      } else {
        await coworkService.restartOpenClawGateway();
      }
    } catch (error) {
      console.error('[CoworkView] Failed to restart gateway:', error);
    } finally {
      setIsRestartingGateway(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await coworkService.init();
      const initialEngineStatus = await coworkService.getOpenClawEngineStatus();
      if (initialEngineStatus) {
        setOpenClawStatus(initialEngineStatus);
      }
      // Load quick actions with localization
      try {
        quickActionService.initialize();
        const actions = await quickActionService.getLocalizedActions();
        dispatch(setActions(actions));
      } catch (error) {
        console.error('Failed to load quick actions:', error);
      }
      if (shouldRequireWesightModelConfig(selectedRuntimeEngine)) {
        try {
          const apiConfig = await coworkService.checkApiConfig();
          if (apiConfig && !apiConfig.hasConfig) {
            onRequestAppSettings?.({
              initialTab: 'model',
              ...buildApiConfigNotice(apiConfig.error),
            });
          }
        } catch (error) {
          console.error('Failed to check cowork API config:', error);
        }
      }
      setIsInitialized(true);
    };
    init();

    const unsubscribeOpenClawStatus = coworkService.onOpenClawEngineStatus((status) => {
      setOpenClawStatus(status);
    });

    // Subscribe to language changes to reload quick actions
    const unsubscribe = quickActionService.subscribe(async () => {
      try {
        const actions = await quickActionService.getLocalizedActions();
        dispatch(setActions(actions));
      } catch (error) {
        console.error('Failed to reload quick actions:', error);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeOpenClawStatus();
    };
  }, [dispatch]);

  const handleStartSession = async (
    prompt: string,
    skillPrompt?: string,
    imageAttachments?: CoworkImageAttachment[],
    messageMetadata?: Record<string, unknown>
  ): Promise<boolean | void> => {
    // Prevent duplicate submissions
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    const requestId = ++startRequestIdRef.current;
    pendingStartRef.current = { requestId, cancelled: false, cancellationAction: null };
    const isPendingStartCancelled = () => {
      const pending = pendingStartRef.current;
      return !pending || pending.requestId !== requestId || pending.cancelled;
    };
    const getPendingCancellationAction = () => {
      const pending = pendingStartRef.current;
      if (!pending || pending.requestId !== requestId || !pending.cancelled) {
        return null;
      }
      return pending.cancellationAction;
    };

    try {
      if (!await ensureCliInstalledBeforeSend()) {
        return false;
      }

      if (!await ensureOpenClawReadyBeforeSend()) {
        return false;
      }

      if (shouldRequireWesightModelConfig(selectedRuntimeEngine)) {
        try {
          const apiConfig = await coworkService.checkApiConfig();
          if (apiConfig && !apiConfig.hasConfig) {
            onRequestAppSettings?.({
              initialTab: 'model',
              ...buildApiConfigNotice(apiConfig.error),
            });
            isStartingRef.current = false;
            return;
          }
        } catch (error) {
          console.error('Failed to check cowork API config:', error);
        }
      }

      // Create a temporary session with user message to show immediately
      const tempSessionId = `temp-${Date.now()}`;
      const fallbackTitle = prompt.split('\n')[0].slice(0, 50) || i18nService.t('coworkNewSession');
      const now = Date.now();

      // Capture active skill IDs before clearing them
      const sessionSkillIds = [...activeSkillIds];

      const tempSession: CoworkSession = {
        id: tempSessionId,
        title: fallbackTitle,
        claudeSessionId: null,
        status: 'running',
        pinned: false,
        createdAt: now,
        updatedAt: now,
        cwd: config.workingDirectory || '',
        systemPrompt: '',
        executionMode: config.executionMode || 'local',
        activeSkillIds: sessionSkillIds,
        agentId: currentTargetType === AgentRunTargetType.Team && currentTeamId
          ? `team:${currentTeamId}`
          : currentAgentId,
        teamId: currentTargetType === AgentRunTargetType.Team ? currentTeamId : null,
        messages: [
          {
            id: `msg-${now}`,
            type: 'user',
            content: prompt,
            timestamp: now,
            metadata: (messageMetadata || sessionSkillIds.length > 0 || (imageAttachments && imageAttachments.length > 0))
              ? {
                ...(messageMetadata ?? {}),
                ...(sessionSkillIds.length > 0 ? { skillIds: sessionSkillIds } : {}),
                ...(imageAttachments && imageAttachments.length > 0 ? { imageAttachments } : {}),
              }
              : undefined,
          },
        ],
      };

      // Immediately show the session detail page with user message
      dispatch(setCurrentSession(tempSession));
      dispatch(setStreaming(true));

      // Clear active skills and quick action selection after starting session
      // so they don't persist to next session
      dispatch(clearActiveSkills());
      dispatch(clearSelection());

      // Combine skill prompt with system prompt.
      // OpenClaw loads skills natively via skills.load.extraDirs, so skip the
      // auto-routing prompt to avoid injecting Claude SDK tool-calling instructions
      // that confuse non-Claude models (e.g. kimi-k2.5 falls back to text-based
      // tool calls, producing empty tool names and err=true failures).
      let effectiveSkillPrompt = skillPrompt;
      if (!skillPrompt && isBuiltinCoworkEngine) {
        effectiveSkillPrompt = await skillService.getAutoRoutingPrompt() || undefined;
      }
      const combinedSystemPrompt = [effectiveSkillPrompt, config.systemPrompt]
        .filter(p => p?.trim())
        .join('\n\n') || undefined;

      // Start the actual session immediately with fallback title
      const { session: startedSession, error: startError } = await coworkService.startSession({
        prompt,
        title: fallbackTitle,
        cwd: config.workingDirectory || undefined,
        systemPrompt: combinedSystemPrompt,
        activeSkillIds: sessionSkillIds,
        agentId: currentAgentId,
        teamId: currentTargetType === AgentRunTargetType.Team && currentTeamId ? currentTeamId : undefined,
        imageAttachments,
        messageMetadata,
      });

      if (!startedSession && startError) {
        // Show the error as a system message in the temp session
        dispatch(addMessage({
          sessionId: tempSessionId,
          message: {
            id: `error-${Date.now()}`,
            type: 'system',
            content: i18nService.t('coworkErrorSessionStartFailed').replace('{error}', startError),
            timestamp: Date.now(),
          },
        }));
        dispatch(updateSessionStatus({ sessionId: tempSessionId, status: 'error' }));
        return;
      }

      // Generate title in the background and update when ready
      if (startedSession) {
        coworkService.generateSessionTitle(prompt).then(generatedTitle => {
          const betterTitle = generatedTitle?.trim();
          if (betterTitle && betterTitle !== fallbackTitle) {
            coworkService.renameSession(startedSession.id, betterTitle);
          }
        }).catch(error => {
          console.error('Failed to generate cowork session title:', error);
        });
      }

      // Stop immediately if user cancelled while startup request was in flight.
      if (isPendingStartCancelled() && startedSession) {
        await coworkService.stopSession(startedSession.id);
        if (getPendingCancellationAction() === 'delete') {
          await coworkService.deleteSession(startedSession.id);
        }
      }
    } finally {
      if (pendingStartRef.current?.requestId === requestId) {
        pendingStartRef.current = null;
      }
      isStartingRef.current = false;
    }
  };

  const handleContinueSession = async (
    prompt: string,
    skillPrompt?: string,
    imageAttachments?: CoworkImageAttachment[],
    messageMetadata?: Record<string, unknown>
  ) => {
    if (!currentSession) return;
    // Prevent duplicate submissions
    if (isContinuingRef.current) return;

    isContinuingRef.current = true;
    try {
      if (!await ensureCliInstalledBeforeSend()) {
        return false;
      }

      if (!await ensureOpenClawReadyBeforeSend()) {
        return false;
      }

      console.log('[CoworkView] handleContinueSession called', {
        hasImageAttachments: !!imageAttachments,
        imageAttachmentsCount: imageAttachments?.length ?? 0,
        imageAttachmentsNames: imageAttachments?.map(a => a.name),
        imageAttachmentsBase64Lengths: imageAttachments?.map(a => a.base64Data.length),
      });

      // Capture active skill IDs before clearing
      const sessionSkillIds = [...activeSkillIds];

      // Clear active skills after capturing so they don't persist to next message
      if (sessionSkillIds.length > 0) {
        dispatch(clearActiveSkills());
      }

      // Combine skill prompt with system prompt for continuation.
      // Skip auto-routing prompt for OpenClaw — skills are loaded natively.
      let effectiveSkillPrompt = skillPrompt;
      if (!skillPrompt && isBuiltinCoworkEngine) {
        effectiveSkillPrompt = await skillService.getAutoRoutingPrompt() || undefined;
      }
      const combinedSystemPrompt = [effectiveSkillPrompt, config.systemPrompt]
        .filter(p => p?.trim())
        .join('\n\n') || undefined;

      await coworkService.continueSession({
        sessionId: currentSession.id,
        prompt,
        systemPrompt: combinedSystemPrompt,
        activeSkillIds: sessionSkillIds.length > 0 ? sessionSkillIds : undefined,
        imageAttachments,
        messageMetadata,
      });
    } finally {
      isContinuingRef.current = false;
    }
  };

  const handleStopSession = async () => {
    if (!currentSession) return;
    if (currentSession.id.startsWith('temp-') && pendingStartRef.current) {
      pendingStartRef.current.cancelled = true;
      pendingStartRef.current.cancellationAction = 'stop';
    }
    await coworkService.stopSession(currentSession.id);
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (sessionId.startsWith('temp-') && pendingStartRef.current) {
      pendingStartRef.current.cancelled = true;
      pendingStartRef.current.cancellationAction = 'delete';
    }
    await coworkService.deleteSession(sessionId);
  };

  const showSlashToast = (message: string) => {
    window.dispatchEvent(new CustomEvent('app:showToast', { detail: message }));
  };

  const openModelSelector = () => {
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('cowork:open-model-selector'));
    }, 0);
  };

  const startFreshChatFromSlash = () => {
    coworkService.clearSession();
    dispatch(clearSelection());
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('cowork:focus-input', {
        detail: { clear: true },
      }));
    }, 0);
  };

  const getEngineLabel = (engine: CoworkAgentEngine = selectedRuntimeEngine) => {
    switch (engine) {
      case CoworkAgentEngine.ClaudeCode:
        return i18nService.t('coworkAgentEngineClaudeCode');
      case CoworkAgentEngine.Codex:
        return i18nService.t('coworkAgentEngineCodex');
      case CoworkAgentEngine.CodexApp:
        return i18nService.t('coworkAgentEngineCodexApp');
      case CoworkAgentEngine.OpenCode:
        return i18nService.t('coworkAgentEngineOpenCode');
      case CoworkAgentEngine.GrokBuild:
        return i18nService.t('coworkAgentEngineGrokBuild');
      case CoworkAgentEngine.QwenCode:
        return i18nService.t('coworkAgentEngineQwenCode');
      case CoworkAgentEngine.DeepSeekTui:
        return i18nService.t('coworkAgentEngineDeepSeekTui');
      case CoworkAgentEngine.OpenClaw:
        return i18nService.t('coworkAgentEngineOpenClaw');
      case CoworkAgentEngine.Hermes:
        return i18nService.t('coworkAgentEngineHermes');
      case CoworkAgentEngine.YdCowork:
      default:
        return i18nService.t('coworkAgentEngineClaudeLegacy');
    }
  };

  const handleRunTargetChange = (value: string) => {
    if (value.startsWith('team:')) {
      const teamId = value.slice('team:'.length);
      dispatch(setCurrentTeamId(teamId));
      return;
    }
    dispatch(setCurrentAgentId(value));
  };

  const runTargetValue = currentTargetType === AgentRunTargetType.Team && currentTeamId
    ? `team:${currentTeamId}`
    : currentAgentId;

  const renderRunTargetSelector = () => (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/70 px-3 py-2">
      <span className="text-xs font-medium text-secondary">
        {i18nService.t('agentRunTargetLabel')}
      </span>
      <select
        value={runTargetValue}
        onChange={(event) => handleRunTargetChange(event.target.value)}
        className="min-w-[180px] rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
      >
        <optgroup label={i18nService.t('agentRunTargetAgents')}>
          {agents.filter((agent) => agent.enabled).map((agent) => (
            <option key={agent.id} value={agent.id}>
              {getAgentSelectIcon(agent) ? `${getAgentSelectIcon(agent)} ` : ''}{getAgentDisplayName(agent)} · {getEngineLabel(getRuntimeEngineForAgent(agent.id))}
            </option>
          ))}
        </optgroup>
        {teams.filter((team) => team.enabled).length > 0 && (
          <optgroup label={i18nService.t('agentRunTargetTeams')}>
            {teams.filter((team) => team.enabled).map((team) => (
              <option key={team.id} value={`team:${team.id}`}>
                {team.icon ? `${team.icon} ` : ''}{team.name} · {team.members.length}{i18nService.t('agentTeamMemberUnit')}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <span className="text-xs text-secondary">
        {currentTargetType === AgentRunTargetType.Team && currentTeam
          ? i18nService.t('agentRunTargetTeamHint')
            .replace('{count}', String(currentTeam.members.length))
          : i18nService.t('agentRunTargetAgentHint')
            .replace('{engine}', getEngineLabel(selectedRuntimeEngine))}
      </span>
    </div>
  );

  const getSessionStatusLabel = (status?: string) => {
    switch (status) {
      case 'running':
        return i18nService.t('coworkStatusRunning');
      case 'completed':
        return i18nService.t('coworkStatusCompleted');
      case 'error':
        return i18nService.t('coworkStatusError');
      case 'idle':
        return i18nService.t('coworkStatusIdle');
      default:
        return i18nService.t('coworkSlashPanelIdle');
    }
  };

  const openSlashPanel = (kind: SlashPanelKind, noticeCommand: string | null = null) => {
    setSlashPanelKind(kind);
    setSlashPanelNoticeCommand(noticeCommand);
  };

  const handleSlashCommand: CoworkSlashCommandHandler = async (command) => {
    const normalizedCommand = command.toLowerCase();
    switch (normalizedCommand) {
      case '/model':
        if (currentSession) {
          const runtime = currentSession.runtimeSnapshot;
          showSlashToast(
            runtime
              ? i18nService.t('coworkRuntimeLockedToast')
                .replace('{engine}', runtime.engineLabel)
                .replace('{model}', runtime.modelLabel || runtime.modelName || runtime.modelId || '-')
              : i18nService.t('coworkRuntimeLocked'),
          );
          return true;
        }
        openModelSelector();
        return true;
      case '/context':
        openSlashPanel('context');
        return true;
      case '/status':
        openSlashPanel('status');
        return true;
      case '/help':
        openSlashPanel('help');
        return true;
      case '/clear':
      case '/new':
        startFreshChatFromSlash();
        showSlashToast(i18nService.t('coworkSlashCommandNewChat'));
        return true;
      case '/mcp':
        onShowMcp?.();
        return true;
      case '/agent':
      case '/agents':
        onShowAgents?.();
        return true;
      case '/skills':
        onShowSkills?.();
        return true;
      case '/memory':
        onRequestAppSettings?.({ initialTab: 'coworkMemory' });
        return true;
      case '/config':
      case '/permissions':
        onRequestAppSettings?.({ initialTab: 'coworkAgentEngine' });
        return true;
      default:
        openSlashPanel('help', normalizedCommand);
        return true;
    }
  };

  const getModelContextLabel = () => {
    if (
      selectedRuntimeEngine === CoworkAgentEngine.OpenClaw
      && config.openclawConfigSource === ExternalAgentConfigSource.LocalCli
    ) {
      return i18nService.t('coworkAgentConfigSourceLocalCli');
    }
    if (
      selectedRuntimeEngine === CoworkAgentEngine.ClaudeCode
      && config.claudeCodeConfigSource === ExternalAgentConfigSource.LocalCli
    ) {
      return i18nService.t('coworkAgentConfigSourceLocalCli');
    }
    if (
      selectedRuntimeEngine === CoworkAgentEngine.Codex
      && config.codexConfigSource === ExternalAgentConfigSource.LocalCli
    ) {
      return i18nService.t('coworkAgentConfigSourceLocalCli');
    }
    if (selectedRuntimeEngine === CoworkAgentEngine.CodexApp) {
      return i18nService.t('coworkAgentCodexAppModelSourceValue');
    }
    if (
      selectedRuntimeEngine === CoworkAgentEngine.Hermes
      && config.hermesConfigSource === ExternalAgentConfigSource.LocalCli
    ) {
      return i18nService.t('coworkAgentConfigSourceLocalCli');
    }
    if (
      selectedRuntimeEngine === CoworkAgentEngine.OpenCode
      && config.opencodeConfigSource === ExternalAgentConfigSource.LocalCli
    ) {
      return i18nService.t('coworkAgentConfigSourceLocalCli');
    }
    if (selectedRuntimeEngine === CoworkAgentEngine.GrokBuild) {
      return i18nService.t('coworkAgentConfigSourceLocalCli');
    }
    if (
      selectedRuntimeEngine === CoworkAgentEngine.QwenCode
      && config.qwenCodeConfigSource === ExternalAgentConfigSource.LocalCli
    ) {
      return i18nService.t('coworkAgentConfigSourceLocalCli');
    }
    if (
      selectedRuntimeEngine === CoworkAgentEngine.DeepSeekTui
      && config.deepseekTuiConfigSource === ExternalAgentConfigSource.LocalCli
    ) {
      return i18nService.t('coworkAgentConfigSourceLocalCli');
    }
    if (selectedModel?.name) {
      return selectedModel.provider
        ? `${selectedModel.name} · ${selectedModel.provider}`
        : selectedModel.name;
    }
    return i18nService.t('modelSelectorNoModels');
  };

  const renderSlashMetric = (labelKey: string, value: React.ReactNode) => (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-secondary">
        {i18nService.t(labelKey)}
      </div>
      <div className="mt-1 min-w-0 break-words text-sm font-medium text-foreground">
        {value}
      </div>
    </div>
  );

  const renderSlashResultPanel = () => {
    if (!slashPanelKind) return null;
    const messages = currentSession?.messages ?? [];
    const messageCounts = messages.reduce<Record<string, number>>((acc, message) => {
      acc[message.type] = (acc[message.type] ?? 0) + 1;
      return acc;
    }, {});
    const contextChars = messages.reduce((sum, message) => sum + message.content.length, 0)
      + (config.systemPrompt?.length ?? 0);
    const approxTokens = Math.ceil(contextChars / 4);
    const contextSkillIds = currentSession?.activeSkillIds?.length
      ? currentSession.activeSkillIds
      : activeSkillIds;
    const activeSkillNames = contextSkillIds
      .map((skillId) => skills.find((skill) => skill.id === skillId)?.name)
      .filter((name): name is string => Boolean(name));
    const cwd = currentSession?.cwd || config.workingDirectory || i18nService.t('noFolderSelected');
    const sessionLabel = currentSession?.title || i18nService.t('coworkSlashPanelNoActiveSession');
    const statusLabel = getSessionStatusLabel(currentSession?.status);
    const titleKey = slashPanelKind === 'context'
      ? 'coworkSlashPanelContextTitle'
      : slashPanelKind === 'status'
        ? 'coworkSlashPanelStatusTitle'
        : 'coworkSlashPanelHelpTitle';

    return (
      <Modal
        isOpen={Boolean(slashPanelKind)}
        onClose={() => {
          setSlashPanelKind(null);
          setSlashPanelNoticeCommand(null);
        }}
        className="w-[min(680px,calc(100vw-32px))] max-h-[min(720px,calc(100vh-48px))] overflow-hidden rounded-2xl border border-border bg-surface shadow-popover"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-base font-semibold text-foreground">
              {i18nService.t(titleKey)}
            </div>
            <div className="mt-1 text-xs text-secondary">
              {i18nService.t('coworkSlashPanelSubtitle')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSlashPanelKind(null);
              setSlashPanelNoticeCommand(null);
            }}
            className="rounded-lg px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            {i18nService.t('close')}
          </button>
        </div>
        <div className="max-h-[calc(100vh-160px)] overflow-y-auto p-5">
          {slashPanelNoticeCommand && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              {i18nService.t('coworkSlashPanelUnsupportedNotice').replace('{command}', slashPanelNoticeCommand)}
            </div>
          )}

          {slashPanelKind === 'help' ? (
            <div className="space-y-2">
              {COWORK_SLASH_PANEL_COMMANDS.map((entry) => (
                <div key={entry.command} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
                  <span className="w-28 shrink-0 font-mono text-sm text-primary">
                    {entry.command}
                  </span>
                  <span className="min-w-0 text-sm text-secondary">
                    {i18nService.t(entry.descriptionKey)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {renderSlashMetric('coworkSlashPanelEngine', getEngineLabel())}
                {renderSlashMetric('coworkSlashPanelModel', getModelContextLabel())}
                {renderSlashMetric('coworkSlashPanelSession', sessionLabel)}
                {renderSlashMetric('coworkSlashPanelSessionStatus', statusLabel)}
                {renderSlashMetric('coworkSlashPanelWorkingDirectory', cwd)}
                {renderSlashMetric('coworkSlashPanelMessages', messages.length.toLocaleString())}
                {renderSlashMetric('coworkSlashPanelApproxChars', contextChars.toLocaleString())}
                {renderSlashMetric('coworkSlashPanelApproxTokens', approxTokens.toLocaleString())}
              </div>

              <div>
                <div className="text-sm font-medium text-foreground">
                  {i18nService.t('coworkSlashPanelMessageBreakdown')}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {renderSlashMetric('coworkSlashPanelUserMessages', (messageCounts.user ?? 0).toLocaleString())}
                  {renderSlashMetric('coworkSlashPanelAssistantMessages', (messageCounts.assistant ?? 0).toLocaleString())}
                  {renderSlashMetric('coworkSlashPanelToolMessages', ((messageCounts.tool_use ?? 0) + (messageCounts.tool_result ?? 0)).toLocaleString())}
                  {renderSlashMetric('coworkSlashPanelSystemMessages', (messageCounts.system ?? 0).toLocaleString())}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {renderSlashMetric(
                  'coworkSlashPanelActiveSkills',
                  activeSkillNames.length > 0 ? activeSkillNames.join(', ') : i18nService.t('coworkSlashPanelNoActiveSkills')
                )}
                {renderSlashMetric(
                  'coworkSlashPanelSystemPrompt',
                  config.systemPrompt?.trim() ? i18nService.t('coworkSlashPanelEnabled') : i18nService.t('coworkSlashPanelDisabled')
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>
    );
  };

  // Get selected quick action
  const selectedAction = React.useMemo(() => {
    return quickActions.find(action => action.id === selectedActionId);
  }, [quickActions, selectedActionId]);

  // Handle quick action button click: select action + activate skill in one batch
  const handleActionSelect = (actionId: string) => {
    dispatch(selectAction(actionId));
    const action = quickActions.find(a => a.id === actionId);
    if (action) {
      const targetSkill = skills.find(s => s.id === action.skillMapping);
      if (targetSkill) {
        dispatch(setActiveSkillIds([targetSkill.id]));
      }
    }
  };

  // When the mapped skill is deactivated from input area, restore the QuickActionBar
  useEffect(() => {
    if (!selectedActionId) return;
    const action = quickActions.find(a => a.id === selectedActionId);
    if (action) {
      const skillStillActive = activeSkillIds.includes(action.skillMapping);
      if (!skillStillActive) {
        dispatch(clearSelection());
      }
    }
  }, [activeSkillIds]);

  // Handle prompt selection from QuickAction
  const handleQuickActionPromptSelect = (prompt: string) => {
    // Fill the prompt into input
    promptInputRef.current?.setValue(prompt);
    promptInputRef.current?.focus();
  };

  useEffect(() => {
    const handleNewSession = () => {
      coworkService.clearSession();
      dispatch(clearSelection());
      window.dispatchEvent(new CustomEvent('cowork:focus-input', {
        detail: { clear: true },
      }));
    };
    window.addEventListener('cowork:shortcut:new-session', handleNewSession);
    return () => {
      window.removeEventListener('cowork:shortcut:new-session', handleNewSession);
    };
  }, [dispatch]);

  useEffect(() => {
    if (!isOpenClawEngine) return;
    if (!currentSession || currentSession.status !== 'running') return;

    const runningSessionId = currentSession.id;
    const handleWindowFocus = () => {
      void coworkService.loadSession(runningSessionId);
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [currentSession?.id, currentSession?.status, isOpenClawEngine]);

  if (!isInitialized) {
    return (
      <div className="flex-1 h-full flex flex-col bg-background">
        <div className="draggable flex h-12 items-center justify-end px-4 border-b border-border shrink-0">
          <WindowTitleBar inline />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-secondary">
            {i18nService.t('loading')}
          </div>
        </div>
      </div>
    );
  }

  const shouldShowEngineStatus = Boolean(isOpenClawEngine && openClawStatus && openClawStatus.phase !== 'running');
  const isEngineError = openClawStatus?.phase === 'error';
  const isEngineReady = isOpenClawEngine
    ? isOpenClawReadyForSession(openClawStatus)
    : true;

  const homeHeader = (
    <div className="draggable flex h-12 items-center justify-between px-4 border-b border-border shrink-0">
      <div className="non-draggable h-8 flex items-center">
        {isSidebarCollapsed && (
          <div className={`flex items-center gap-1 mr-2 ${isMac ? 'pl-[68px]' : ''}`}>
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
      <div className="non-draggable flex items-center gap-2">
        <div className="flex items-center gap-1.5 mr-2 px-2.5 py-1">
          <ShieldCheckIcon className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          <span className="text-xs text-green-600 dark:text-green-400 whitespace-nowrap">
            {i18nService.t('lobsterGuardEnabled')}
          </span>
        </div>
        <WindowTitleBar inline />
      </div>
    </div>
  );

  // Engine status banner for error/non-running states (starting overlay is now global in App.tsx)
  const engineStatusBanner = shouldShowEngineStatus && openClawStatus && openClawStatus.phase !== 'starting' ? (
    <div className={`shrink-0 flex items-center justify-between px-4 py-2 text-xs ${isEngineError
      ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
    }`}>
      <div className="flex items-center gap-2">
        <span>{resolveEngineStatusText(openClawStatus)}</span>
        {typeof openClawStatus.progressPercent === 'number' && (
          <span className="opacity-70">({Math.round(openClawStatus.progressPercent)}%)</span>
        )}
      </div>
      <button
        type="button"
        onClick={handleRestartGateway}
        disabled={isRestartingGateway || openClawStatus.phase === 'installing'}
        className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isEngineError
          ? 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600'
          : 'bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600'
        }`}
      >
        {i18nService.t(openClawStatus.phase === 'not_installed' ? 'coworkOpenClawStart' : 'coworkOpenClawRestartGateway')}
      </button>
    </div>
  ) : null;

  // When there's a current session, show the session detail view
  if (currentSession) {
    return (
      <div className="flex-1 flex flex-col h-full">
        {engineStatusBanner}
        <CoworkSessionDetail
          onManageSkills={() => onShowSkills?.()}
          onContinue={handleContinueSession}
          onSlashCommand={handleSlashCommand}
          onStop={handleStopSession}
          onDeleteSession={handleDeleteSession}
          onNavigateHome={() => coworkService.clearSession()}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={onToggleSidebar}
          onNewChat={onNewChat}
          updateBadge={updateBadge}
        />
        {renderSlashResultPanel()}
      </div>
    );
  }

  // Home view - no current session
  return (
    <div className="flex-1 flex flex-col bg-background h-full">
      {/* Engine status banner for error states */}
      {engineStatusBanner}

      {/* Header */}
      {homeHeader}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-4 py-16 space-y-12">
          {/* Welcome Section */}
          <div className="text-center space-y-5">
            <img src="logo.png" alt="logo" className="w-16 h-16 mx-auto" />
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              {i18nService.t('coworkWelcome')}
            </h2>
            <p className="text-sm text-secondary max-w-md mx-auto">
              {i18nService.t('coworkDescription')}
            </p>
          </div>

          {/* Prompt Input Area - Large version with folder selector */}
          <div className="space-y-3">
            {renderRunTargetSelector()}
            <div className="shadow-glow-accent rounded-2xl">
              <CoworkPromptInput
                ref={promptInputRef}
                onSubmit={handleStartSession}
                onSlashCommand={handleSlashCommand}
                onStop={handleStopSession}
                isStreaming={isStreaming}
                disabled={!isEngineReady}
                placeholder={i18nService.t('coworkPlaceholder')}
                size="large"
                workingDirectory={config.workingDirectory}
                onWorkingDirectoryChange={async (dir: string) => {
                  await coworkService.updateConfig({ workingDirectory: dir });
                }}
                showFolderSelector={true}
                showEngineSelector={true}
                effectiveEngine={selectedRuntimeEngine}
                engineSelectorReadOnly={!canSelectRuntimeEngine}
                showModelSelector={true}
                modelSelectorReadOnly={!canSelectRuntimeEngine}
                onManageSkills={() => onShowSkills?.()}
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-4">
            {selectedAction ? (
              <PromptPanel
                action={selectedAction}
                onPromptSelect={handleQuickActionPromptSelect}
              />
            ) : (
              <QuickActionBar actions={quickActions} onActionSelect={handleActionSelect} />
            )}
          </div>
        </div>
      </div>
      {renderSlashResultPanel()}
    </div>
  );
};

export default CoworkView;
