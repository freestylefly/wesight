import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import { IpcChannel as ScheduledTaskIpc } from '../scheduledTask/constants';
import { CoworkIpcChannel } from '../shared/cowork/constants';
import type { CoworkFileActivity } from '../shared/cowork/fileActivity';
import type { CoworkModelOverride } from '../shared/cowork/runtimeSnapshot';
import { DialogIpcChannel } from '../shared/dialog/constants';
import { type FeishuEngineKeyType, type FeishuManagementModeType, type FeishuRuntimeOwnershipType, ImIpcChannel } from '../shared/im/constants';
import { DesktopPetIpcChannel, type DesktopPetTaskSnapshot, type PetConfig, type PetPosition } from '../shared/pet/constants';
import type { Platform } from '../shared/platform';
import { SkillsIpcChannel } from '../shared/skills/constants';

// 暴露安全的 API 到渲染进程
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  arch: process.arch,
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
    remove: (key: string) => ipcRenderer.invoke('store:remove', key),
  },
  skills: {
    list: () => ipcRenderer.invoke(SkillsIpcChannel.List),
    setEnabled: (options: { id: string; enabled: boolean }) => ipcRenderer.invoke(SkillsIpcChannel.SetEnabled, options),
    delete: (id: string) => ipcRenderer.invoke(SkillsIpcChannel.Delete, id),
    download: (source: string) => ipcRenderer.invoke(SkillsIpcChannel.Download, source),
    upgrade: (skillId: string, downloadUrl: string) => ipcRenderer.invoke(SkillsIpcChannel.Upgrade, skillId, downloadUrl),
    confirmInstall: (pendingId: string, action: string) =>
      ipcRenderer.invoke(SkillsIpcChannel.ConfirmInstall, pendingId, action),
    getRoot: () => ipcRenderer.invoke(SkillsIpcChannel.GetRoot),
    autoRoutingPrompt: () => ipcRenderer.invoke(SkillsIpcChannel.AutoRoutingPrompt),
    getConfig: (skillId: string) => ipcRenderer.invoke(SkillsIpcChannel.GetConfig, skillId),
    setConfig: (skillId: string, config: Record<string, string>) => ipcRenderer.invoke(SkillsIpcChannel.SetConfig, skillId, config),
    testEmailConnectivity: (skillId: string, config: Record<string, string>) =>
      ipcRenderer.invoke(SkillsIpcChannel.TestEmailConnectivity, skillId, config),
    fetchMarketplace: (options?: any) => ipcRenderer.invoke(SkillsIpcChannel.FetchMarketplace, options),
    searchMarketplace: (options?: any) => ipcRenderer.invoke(SkillsIpcChannel.SearchMarketplace, options),
    installMarketplaceSkill: (skill: any) => ipcRenderer.invoke(SkillsIpcChannel.InstallMarketplaceSkill, skill),
    onChanged: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on(SkillsIpcChannel.Changed, handler);
      return () => ipcRenderer.removeListener(SkillsIpcChannel.Changed, handler);
    },
  },
  mcp: {
    list: () => ipcRenderer.invoke('mcp:list'),
    create: (data: any) => ipcRenderer.invoke('mcp:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('mcp:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('mcp:delete', id),
    setEnabled: (options: { id: string; enabled: boolean }) => ipcRenderer.invoke('mcp:setEnabled', options),
    fetchMarketplace: () => ipcRenderer.invoke('mcp:fetchMarketplace'),
    refreshBridge: () => ipcRenderer.invoke('mcp:refreshBridge'),
    onBridgeSyncStart: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('mcp:bridge:syncStart', handler);
      return () => ipcRenderer.removeListener('mcp:bridge:syncStart', handler);
    },
    onBridgeSyncDone: (callback: (data: { tools: number; error?: string }) => void) => {
      const handler = (_event: any, data: { tools: number; error?: string }) => callback(data);
      ipcRenderer.on('mcp:bridge:syncDone', handler);
      return () => ipcRenderer.removeListener('mcp:bridge:syncDone', handler);
    },
  },
  permissions: {
    checkCalendar: () => ipcRenderer.invoke('permissions:checkCalendar'),
    requestCalendar: () => ipcRenderer.invoke('permissions:requestCalendar'),
  },
  enterprise: {
    getConfig: () => ipcRenderer.invoke('enterprise:getConfig'),
  },
  desktopPet: {
    getConfig: () => ipcRenderer.invoke(DesktopPetIpcChannel.GetConfig),
    applyPreview: (config: Partial<PetConfig>) => ipcRenderer.invoke(DesktopPetIpcChannel.ApplyPreview, config),
    getBounds: () => ipcRenderer.invoke(DesktopPetIpcChannel.GetBounds),
    setPosition: (position: PetPosition & { persist?: boolean }) =>
      ipcRenderer.invoke(DesktopPetIpcChannel.SetPosition, position),
    setMouseInteractive: (interactive: boolean) =>
      ipcRenderer.invoke(DesktopPetIpcChannel.SetMouseInteractive, { interactive }),
    openMainWindow: () => ipcRenderer.invoke(DesktopPetIpcChannel.OpenMainWindow),
    getTaskSnapshot: () => ipcRenderer.invoke(DesktopPetIpcChannel.GetTaskSnapshot),
    openTask: (sessionId: string) => ipcRenderer.invoke(DesktopPetIpcChannel.OpenTask, { sessionId }),
    onConfigChanged: (callback: (config: PetConfig) => void) => {
      const handler = (_event: IpcRendererEvent, config: PetConfig) => callback(config);
      ipcRenderer.on(DesktopPetIpcChannel.ConfigChanged, handler);
      return () => ipcRenderer.removeListener(DesktopPetIpcChannel.ConfigChanged, handler);
    },
    onTaskChanged: (callback: (snapshot: DesktopPetTaskSnapshot | null) => void) => {
      const handler = (_event: IpcRendererEvent, snapshot: DesktopPetTaskSnapshot | null) => callback(snapshot);
      ipcRenderer.on(DesktopPetIpcChannel.TaskChanged, handler);
      return () => ipcRenderer.removeListener(DesktopPetIpcChannel.TaskChanged, handler);
    },
    onOpenTaskRequested: (callback: (data: { sessionId: string }) => void) => {
      const handler = (_event: IpcRendererEvent, data: { sessionId: string }) => callback(data);
      ipcRenderer.on(DesktopPetIpcChannel.OpenTaskRequested, handler);
      return () => ipcRenderer.removeListener(DesktopPetIpcChannel.OpenTaskRequested, handler);
    },
  },
  api: {
    // 普通 API 请求（非流式）
    fetch: (options: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
      expectedStatuses?: number[];
    }) => ipcRenderer.invoke('api:fetch', options),

    // 流式 API 请求
    stream: (options: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
      requestId: string;
    }) => ipcRenderer.invoke('api:stream', options),

    // 取消流式请求
    cancelStream: (requestId: string) => ipcRenderer.invoke('api:stream:cancel', requestId),

    // 监听流式数据
    onStreamData: (requestId: string, callback: (chunk: string) => void) => {
      const handler = (_event: any, chunk: string) => callback(chunk);
      ipcRenderer.on(`api:stream:${requestId}:data`, handler);
      return () => ipcRenderer.removeListener(`api:stream:${requestId}:data`, handler);
    },

    // 监听流式完成
    onStreamDone: (requestId: string, callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on(`api:stream:${requestId}:done`, handler);
      return () => ipcRenderer.removeListener(`api:stream:${requestId}:done`, handler);
    },

    // 监听流式错误
    onStreamError: (requestId: string, callback: (error: string) => void) => {
      const handler = (_event: any, error: string) => callback(error);
      ipcRenderer.on(`api:stream:${requestId}:error`, handler);
      return () => ipcRenderer.removeListener(`api:stream:${requestId}:error`, handler);
    },

    // 监听流式取消
    onStreamAbort: (requestId: string, callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on(`api:stream:${requestId}:abort`, handler);
      return () => ipcRenderer.removeListener(`api:stream:${requestId}:abort`, handler);
    },
  },
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => {
      ipcRenderer.send(channel, ...args);
    },
    on: (channel: string, func: (...args: any[]) => void) => {
      const handler = (_event: any, ...args: any[]) => func(...args);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
  },
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    toggleMaximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    showSystemMenu: (position: { x: number; y: number }) => ipcRenderer.send('window:showSystemMenu', position),
    onStateChanged: (callback: (state: { isMaximized: boolean; isFullscreen: boolean; isFocused: boolean }) => void) => {
      const handler = (_event: any, state: { isMaximized: boolean; isFullscreen: boolean; isFocused: boolean }) => callback(state);
      ipcRenderer.on('window:state-changed', handler);
      return () => ipcRenderer.removeListener('window:state-changed', handler);
    },
  },
  getApiConfig: () => ipcRenderer.invoke('get-api-config'),
  checkApiConfig: (options?: { probeModel?: boolean }) => ipcRenderer.invoke('check-api-config', options),
  saveApiConfig: (config: { apiKey: string; baseURL: string; model: string; apiType?: 'anthropic' | 'openai' }) =>
    ipcRenderer.invoke('save-api-config', config),
  generateSessionTitle: (userInput: string | null) =>
    ipcRenderer.invoke('generate-session-title', userInput),
  getRecentCwds: (limit?: number) =>
    ipcRenderer.invoke('get-recent-cwds', limit),
  openclaw: {
    engine: {
      getStatus: () => ipcRenderer.invoke('openclaw:engine:getStatus'),
      install: () => ipcRenderer.invoke('openclaw:engine:install'),
      retryInstall: () => ipcRenderer.invoke('openclaw:engine:retryInstall'),
      restartGateway: () => ipcRenderer.invoke('openclaw:engine:restartGateway'),
      onProgress: (callback: (status: any) => void) => {
        const handler = (_event: any, status: any) => callback(status);
        ipcRenderer.on('openclaw:engine:onProgress', handler);
        return () => ipcRenderer.removeListener('openclaw:engine:onProgress', handler);
      },
    },
  },
  hermes: {
    engine: {
      getStatus: () => ipcRenderer.invoke('hermes:engine:getStatus'),
      install: () => ipcRenderer.invoke('hermes:engine:install'),
      retryInstall: () => ipcRenderer.invoke('hermes:engine:retryInstall'),
      restartGateway: () => ipcRenderer.invoke('hermes:engine:restartGateway'),
      onProgress: (callback: (status: any) => void) => {
        const handler = (_event: any, status: any) => callback(status);
        ipcRenderer.on('hermes:engine:onProgress', handler);
        return () => ipcRenderer.removeListener('hermes:engine:onProgress', handler);
      },
    },
  },
  codexApp: {
    engine: {
      getStatus: () => ipcRenderer.invoke('codexApp:engine:getStatus'),
      start: () => ipcRenderer.invoke('codexApp:engine:start'),
    },
    tasks: {
      sync: (input?: { cwd?: string; includeAll?: boolean; limit?: number }) =>
        ipcRenderer.invoke(CoworkIpcChannel.CodexAppTasksSync, input || {}),
      open: (input: { threadId: string }) =>
        ipcRenderer.invoke(CoworkIpcChannel.CodexAppTaskOpen, input),
    },
  },
  agents: {
    list: async () => {
      const result = await ipcRenderer.invoke('agents:list');
      return result?.success ? result.agents : [];
    },
    get: async (id: string) => {
      const result = await ipcRenderer.invoke('agents:get', id);
      return result?.success ? result.agent : null;
    },
    create: async (request: { id?: string; name: string; description?: string; systemPrompt?: string; identity?: string; model?: string; agentEngine?: string; icon?: string; skillIds?: string[]; source?: string; presetId?: string }) => {
      const result = await ipcRenderer.invoke('agents:create', request);
      return result?.success ? result.agent : null;
    },
    update: async (id: string, updates: { name?: string; description?: string; systemPrompt?: string; identity?: string; model?: string; agentEngine?: string; icon?: string; skillIds?: string[]; enabled?: boolean }) => {
      const result = await ipcRenderer.invoke('agents:update', id, updates);
      return result?.success ? result.agent : null;
    },
    delete: async (id: string) => {
      const result = await ipcRenderer.invoke('agents:delete', id);
      return result?.success ? result.deleted : false;
    },
    presets: async () => {
      const result = await ipcRenderer.invoke('agents:presets');
      return result?.success ? result.presets : [];
    },
    addPreset: async (presetId: string) => {
      const result = await ipcRenderer.invoke('agents:addPreset', presetId);
      return result?.success ? result.agent : null;
    },
    listTeams: async () => {
      const result = await ipcRenderer.invoke('agents:teams:list');
      return result?.success ? result.teams : [];
    },
    getTeam: async (id: string) => {
      const result = await ipcRenderer.invoke('agents:teams:get', id);
      return result?.success ? result.team : null;
    },
    createTeam: async (request: any) => {
      const result = await ipcRenderer.invoke('agents:teams:create', request);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create agent team');
      }
      return result?.success ? result.team : null;
    },
    updateTeam: async (id: string, updates: any) => {
      const result = await ipcRenderer.invoke('agents:teams:update', id, updates);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to update agent team');
      }
      return result?.success ? result.team : null;
    },
    deleteTeam: async (id: string) => {
      const result = await ipcRenderer.invoke('agents:teams:delete', id);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to delete agent team');
      }
      return result?.success ? result.deleted : false;
    },
    installDevelopmentTeam: async () => {
      const result = await ipcRenderer.invoke('agents:teams:installDevelopmentTemplate');
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to install development team');
      }
      return result?.success ? result.team : null;
    },
  },
  cowork: {
    // Session management
    startSession: (options: { prompt: string; cwd?: string; systemPrompt?: string; activeSkillIds?: string[]; agentId?: string; teamId?: string; modelOverride?: CoworkModelOverride | null; imageAttachments?: Array<{ name: string; mimeType: string; base64Data: string }> }) =>
      ipcRenderer.invoke(CoworkIpcChannel.SessionStart, options),
    continueSession: (options: { sessionId: string; prompt: string; systemPrompt?: string; activeSkillIds?: string[]; modelOverride?: CoworkModelOverride | null; imageAttachments?: Array<{ name: string; mimeType: string; base64Data: string }> }) =>
      ipcRenderer.invoke(CoworkIpcChannel.SessionContinue, options),
    stopSession: (sessionId: string) =>
      ipcRenderer.invoke(CoworkIpcChannel.SessionStop, sessionId),
    subscribeSession: (sessionId: string) =>
      ipcRenderer.invoke(CoworkIpcChannel.SessionSubscribe, { sessionId }),
    unsubscribeSession: (sessionId: string) =>
      ipcRenderer.invoke(CoworkIpcChannel.SessionUnsubscribe, { sessionId }),
    deleteSession: (sessionId: string) =>
      ipcRenderer.invoke('cowork:session:delete', sessionId),
    deleteSessions: (sessionIds: string[]) =>
      ipcRenderer.invoke('cowork:session:deleteBatch', sessionIds),
    setSessionPinned: (options: { sessionId: string; pinned: boolean }) =>
      ipcRenderer.invoke('cowork:session:pin', options),
    renameSession: (options: { sessionId: string; title: string }) =>
      ipcRenderer.invoke('cowork:session:rename', options),
    getSession: (sessionId: string) =>
      ipcRenderer.invoke(CoworkIpcChannel.SessionGet, sessionId),
    getSessionMeta: (sessionId: string) =>
      ipcRenderer.invoke(CoworkIpcChannel.SessionGetMeta, sessionId),
    getRecentMessages: (input: { sessionId: string; limit?: number }) =>
      ipcRenderer.invoke(CoworkIpcChannel.SessionGetRecentMessages, input),
    getMessagesAfter: (input: { sessionId: string; sequence: number }) =>
      ipcRenderer.invoke(CoworkIpcChannel.SessionGetMessagesAfter, input),
    getMessagesBefore: (input: { sessionId: string; sequence: number; limit?: number }) =>
      ipcRenderer.invoke(CoworkIpcChannel.SessionGetMessagesBefore, input),
    getSessionRuntimeSnapshot: (sessionId: string) =>
      ipcRenderer.invoke(CoworkIpcChannel.SessionGetRuntimeSnapshot, sessionId),
    remoteManaged: (sessionId: string) =>
      ipcRenderer.invoke('cowork:session:remoteManaged', sessionId),
    listSessions: (agentId?: string) =>
      ipcRenderer.invoke(CoworkIpcChannel.SessionList, agentId),
    exportResultImage: (options: { rect: { x: number; y: number; width: number; height: number }; defaultFileName?: string }) =>
      ipcRenderer.invoke('cowork:session:exportResultImage', options),
    captureImageChunk: (options: { rect: { x: number; y: number; width: number; height: number } }) =>
      ipcRenderer.invoke('cowork:session:captureImageChunk', options),
    saveResultImage: (options: { pngBase64: string; defaultFileName?: string }) =>
      ipcRenderer.invoke('cowork:session:saveResultImage', options),
    exportSessionText: (options: { content: string; defaultFileName?: string; fileExtension?: string }) =>
      ipcRenderer.invoke('cowork:session:exportText', options),
    copyToClipboard: (options: { text?: string; imageBase64?: string }) =>
      ipcRenderer.invoke('cowork:clipboard:copy', options),

    // Permission handling
    respondToPermission: (options: { requestId: string; result: any }) =>
      ipcRenderer.invoke('cowork:permission:respond', options),

    // Configuration
    getConfig: () =>
      ipcRenderer.invoke('cowork:config:get'),
    setConfig: (config: {
      workingDirectory?: string;
      executionMode?: 'auto' | 'local' | 'sandbox';
      agentEngine?: 'openclaw' | 'hermes' | 'yd_cowork' | 'claude_code' | 'codex' | 'codex_app' | 'opencode' | 'grok_build' | 'qwen_code' | 'deepseek_tui';
      openclawConfigSource?: 'wesight_model' | 'local_cli';
      claudeCodeConfigSource?: 'wesight_model' | 'local_cli';
      codexConfigSource?: 'wesight_model' | 'local_cli';
      hermesConfigSource?: 'wesight_model' | 'local_cli';
      opencodeConfigSource?: 'wesight_model' | 'local_cli';
      opencodePermissionMode?: 'auto' | 'conservative';
      qwenCodeConfigSource?: 'wesight_model' | 'local_cli';
      qwenCodePermissionMode?: 'auto' | 'conservative';
      deepseekTuiConfigSource?: 'wesight_model' | 'local_cli';
      deepseekTuiPermissionMode?: 'auto' | 'conservative';
      memoryEnabled?: boolean;
      memoryImplicitUpdateEnabled?: boolean;
      memoryLlmJudgeEnabled?: boolean;
      memoryGuardLevel?: 'strict' | 'standard' | 'relaxed';
      memoryUserMemoriesMaxItems?: number;
    }) =>
      ipcRenderer.invoke('cowork:config:set', config),
    listAgentEngines: (input?: {
      forceRefresh?: boolean;
      appTypes?: Array<'claude' | 'codex' | 'hermes' | 'openclaw' | 'opencode' | 'grok' | 'qwen' | 'deepseek_tui'>;
    }) =>
      ipcRenderer.invoke('cowork:agentEngines:list', input),
    getRuntimeMetricsSummary: (filters: any) =>
      ipcRenderer.invoke(CoworkIpcChannel.RuntimeMetricsSummary, filters),
    listRuntimeCalls: (filters: any) =>
      ipcRenderer.invoke(CoworkIpcChannel.RuntimeMetricsCalls, filters),
    getRuntimeCallDetail: (callId: string) =>
      ipcRenderer.invoke(CoworkIpcChannel.RuntimeMetricsDetail, { callId }),
    reportRendererReady: (input: {
      firstPaintMs?: number;
      firstInteractiveMs?: number;
      configLoadedMs?: number;
      recentSessionsLoadedMs?: number;
    }) =>
      ipcRenderer.invoke(CoworkIpcChannel.PerformanceRendererReady, input),
    reportSettingsMetric: (input: {
      type: 'open' | 'interactive' | 'tabLoad' | 'ipc';
      durationMs?: number;
      tab?: string;
      channel?: string;
      success?: boolean;
      error?: string;
      triggeredRuntimeStart?: boolean;
    }) =>
      ipcRenderer.invoke(CoworkIpcChannel.PerformanceSettingsMetric, input),
    getStartupServicesStatus: () =>
      ipcRenderer.invoke(CoworkIpcChannel.StartupServicesStatus),
    onStartupServicesChanged: (callback: (services: Array<{
      name: string;
      status: 'pending' | 'running' | 'ready' | 'error' | 'degraded';
      startedAt?: number;
      finishedAt?: number;
      durationMs?: number;
      error?: string;
    }>) => void) => {
      const handler = (_event: IpcRendererEvent, services: Array<{
        name: string;
        status: 'pending' | 'running' | 'ready' | 'error' | 'degraded';
        startedAt?: number;
        finishedAt?: number;
        durationMs?: number;
        error?: string;
      }>) => callback(services);
      ipcRenderer.on(CoworkIpcChannel.StartupServicesChanged, handler);
      return () => ipcRenderer.removeListener(CoworkIpcChannel.StartupServicesChanged, handler);
    },
    ensureStudioAssets: () =>
      ipcRenderer.invoke(CoworkIpcChannel.StudioAssetsEnsure),
    installAgentCli: (appType: 'claude' | 'codex' | 'hermes' | 'openclaw' | 'opencode' | 'grok' | 'qwen' | 'deepseek_tui') =>
      ipcRenderer.invoke(CoworkIpcChannel.AgentCliInstall, { appType }),
    listAgentProviders: (appType: 'claude' | 'codex' | 'hermes' | 'openclaw' | 'opencode' | 'grok' | 'qwen' | 'deepseek_tui') =>
      ipcRenderer.invoke(CoworkIpcChannel.AgentProvidersList, { appType }),
    saveAgentProvider: (input: {
      appType: 'claude' | 'codex' | 'hermes' | 'openclaw' | 'opencode' | 'grok' | 'qwen' | 'deepseek_tui';
      id?: string;
      name: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      settingsConfig?: Record<string, unknown>;
      category?: string | null;
      setCurrent?: boolean;
    }) =>
      ipcRenderer.invoke(CoworkIpcChannel.AgentProvidersSave, input),
    deleteAgentProvider: (input: { appType: 'claude' | 'codex' | 'hermes' | 'openclaw' | 'opencode' | 'grok' | 'qwen' | 'deepseek_tui'; id: string }) =>
      ipcRenderer.invoke(CoworkIpcChannel.AgentProvidersDelete, input),
    setCurrentAgentProvider: (input: { appType: 'claude' | 'codex' | 'hermes' | 'openclaw' | 'opencode' | 'grok' | 'qwen' | 'deepseek_tui'; id: string }) =>
      ipcRenderer.invoke(CoworkIpcChannel.AgentProvidersSetCurrent, input),
    importLiveAgentProvider: (appType: 'claude' | 'codex' | 'hermes' | 'openclaw' | 'opencode' | 'grok' | 'qwen' | 'deepseek_tui') =>
      ipcRenderer.invoke(CoworkIpcChannel.AgentProvidersImportLive, { appType }),
    importLocalAgentConfigToModelSettings: (appType: 'claude' | 'codex' | 'hermes' | 'openclaw' | 'opencode' | 'grok' | 'qwen' | 'deepseek_tui') =>
      ipcRenderer.invoke(CoworkIpcChannel.AgentConfigImportLocalToModelSettings, { appType }),
    syncOpenClawGlobalConfig: () =>
      ipcRenderer.invoke(CoworkIpcChannel.AgentConfigSyncOpenClawGlobal),
    syncOpenCodeGlobalConfig: () =>
      ipcRenderer.invoke(CoworkIpcChannel.AgentConfigSyncOpenCodeGlobal),
    syncQwenCodeGlobalConfig: () =>
      ipcRenderer.invoke(CoworkIpcChannel.AgentConfigSyncQwenCodeGlobal),
    syncDeepSeekTuiGlobalConfig: () =>
      ipcRenderer.invoke(CoworkIpcChannel.AgentConfigSyncDeepSeekTuiGlobal),
    onAgentCliInstallProgress: (callback: (progress: any) => void) => {
      const handler = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on(CoworkIpcChannel.AgentCliInstallProgress, handler);
      return () => ipcRenderer.removeListener(CoworkIpcChannel.AgentCliInstallProgress, handler);
    },
    onAgentEnginesChanged: (callback: (result: any) => void) => {
      const handler = (_event: any, result: any) => callback(result);
      ipcRenderer.on(CoworkIpcChannel.AgentEnginesChanged, handler);
      return () => ipcRenderer.removeListener(CoworkIpcChannel.AgentEnginesChanged, handler);
    },
    listMemoryEntries: (input: {
      query?: string;
      status?: 'created' | 'stale' | 'deleted' | 'all';
      includeDeleted?: boolean;
      limit?: number;
      offset?: number;
    }) =>
      ipcRenderer.invoke('cowork:memory:listEntries', input),
    createMemoryEntry: (input: {
      text: string;
      confidence?: number;
      isExplicit?: boolean;
    }) =>
      ipcRenderer.invoke('cowork:memory:createEntry', input),
    updateMemoryEntry: (input: {
      id: string;
      text?: string;
      confidence?: number;
      status?: 'created' | 'stale' | 'deleted';
      isExplicit?: boolean;
    }) =>
      ipcRenderer.invoke('cowork:memory:updateEntry', input),
    deleteMemoryEntry: (input: { id: string }) =>
      ipcRenderer.invoke('cowork:memory:deleteEntry', input),
    getMemoryStats: () =>
      ipcRenderer.invoke('cowork:memory:getStats'),
    readBootstrapFile: (filename: string) =>
      ipcRenderer.invoke('cowork:bootstrap:read', filename),
    writeBootstrapFile: (filename: string, content: string) =>
      ipcRenderer.invoke('cowork:bootstrap:write', filename, content),
    // Stream event listeners
    onStreamMessage: (callback: (data: { sessionId: string; message: any }) => void) => {
      const handler = (_event: any, data: { sessionId: string; message: any }) => callback(data);
      ipcRenderer.on(CoworkIpcChannel.StreamMessage, handler);
      return () => ipcRenderer.removeListener(CoworkIpcChannel.StreamMessage, handler);
    },
    onStreamMessageUpdate: (callback: (data: {
      sessionId: string;
      messageId: string;
      content: string;
      mode?: 'snapshot' | 'delta' | 'final';
      offset?: number;
      sequence?: number;
      finalLength?: number;
    }) => void) => {
      const handler = (_event: any, data: {
        sessionId: string;
        messageId: string;
        content: string;
        mode?: 'snapshot' | 'delta' | 'final';
        offset?: number;
        sequence?: number;
        finalLength?: number;
      }) => callback(data);
      ipcRenderer.on(CoworkIpcChannel.StreamMessageUpdate, handler);
      return () => ipcRenderer.removeListener(CoworkIpcChannel.StreamMessageUpdate, handler);
    },
    onStreamFileActivity: (callback: (data: { sessionId: string; activity: CoworkFileActivity }) => void) => {
      const handler = (_event: IpcRendererEvent, data: { sessionId: string; activity: CoworkFileActivity }) => callback(data);
      ipcRenderer.on(CoworkIpcChannel.StreamFileActivity, handler);
      return () => ipcRenderer.removeListener(CoworkIpcChannel.StreamFileActivity, handler);
    },
    onStreamPermission: (callback: (data: { sessionId: string; request: any }) => void) => {
      const handler = (_event: any, data: { sessionId: string; request: any }) => callback(data);
      ipcRenderer.on(CoworkIpcChannel.StreamPermission, handler);
      return () => ipcRenderer.removeListener(CoworkIpcChannel.StreamPermission, handler);
    },
    onStreamPermissionDismiss: (callback: (data: { requestId: string }) => void) => {
      const handler = (_event: any, data: { requestId: string }) => callback(data);
      ipcRenderer.on(CoworkIpcChannel.StreamPermissionDismiss, handler);
      return () => ipcRenderer.removeListener(CoworkIpcChannel.StreamPermissionDismiss, handler);
    },
    onStreamComplete: (callback: (data: { sessionId: string; claudeSessionId: string | null }) => void) => {
      const handler = (_event: any, data: { sessionId: string; claudeSessionId: string | null }) => callback(data);
      ipcRenderer.on(CoworkIpcChannel.StreamComplete, handler);
      return () => ipcRenderer.removeListener(CoworkIpcChannel.StreamComplete, handler);
    },
    onStreamError: (callback: (data: { sessionId: string; error: string }) => void) => {
      const handler = (_event: any, data: { sessionId: string; error: string }) => callback(data);
      ipcRenderer.on(CoworkIpcChannel.StreamError, handler);
      return () => ipcRenderer.removeListener(CoworkIpcChannel.StreamError, handler);
    },
    onSessionsChanged: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('cowork:sessions:changed', handler);
      return () => ipcRenderer.removeListener('cowork:sessions:changed', handler);
    },
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
    selectFile: (options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('dialog:selectFile', options),
    selectFiles: (options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('dialog:selectFiles', options),
    saveInlineFile: (options: { dataBase64: string; fileName?: string; mimeType?: string; cwd?: string }) =>
      ipcRenderer.invoke('dialog:saveInlineFile', options),
    readFileAsDataUrl: (filePath: string) =>
      ipcRenderer.invoke('dialog:readFileAsDataUrl', filePath),
    saveLocalImageToDirectory: (options: { sourcePath: string; fileName?: string }) =>
      ipcRenderer.invoke(DialogIpcChannel.SaveLocalImageToDirectory, options),
  },
  shell: {
    openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
    showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
  autoLaunch: {
    get: () => ipcRenderer.invoke('app:getAutoLaunch'),
    set: (enabled: boolean) => ipcRenderer.invoke('app:setAutoLaunch', enabled),
  },
  preventSleep: {
    get: () => ipcRenderer.invoke('app:getPreventSleep'),
    set: (enabled: boolean) => ipcRenderer.invoke('app:setPreventSleep', enabled),
  },
  appInfo: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getSystemLocale: () => ipcRenderer.invoke('app:getSystemLocale'),
  },
  appUpdate: {
    download: (url: string) => ipcRenderer.invoke('appUpdate:download', url),
    cancelDownload: () => ipcRenderer.invoke('appUpdate:cancelDownload'),
    install: (filePath: string) => ipcRenderer.invoke('appUpdate:install', filePath),
    onDownloadProgress: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('appUpdate:downloadProgress', handler);
      return () => ipcRenderer.removeListener('appUpdate:downloadProgress', handler);
    },
  },
  log: {
    getPath: () => ipcRenderer.invoke('log:getPath'),
    openFolder: () => ipcRenderer.invoke('log:openFolder'),
    exportZip: () => ipcRenderer.invoke('log:exportZip'),
  },
  im: {
    // Configuration
    getConfig: () => ipcRenderer.invoke('im:config:get'),
    setConfig: (config: any, options?: { syncGateway?: boolean }) => ipcRenderer.invoke('im:config:set', config, options),
    syncConfig: () => ipcRenderer.invoke('im:config:sync'),

    // Gateway control
    startGateway: (platform: Platform) => ipcRenderer.invoke('im:gateway:start', platform),
    stopGateway: (platform: Platform) => ipcRenderer.invoke('im:gateway:stop', platform),
    testGateway: (
      platform: Platform,
      configOverride?: any
    ) => ipcRenderer.invoke('im:gateway:test', platform, configOverride),

    // Status
    getStatus: () => ipcRenderer.invoke('im:status:get'),
    getLocalIp: () => ipcRenderer.invoke('im:getLocalIp') as Promise<string>,
    // OpenClaw config schema
    getOpenClawConfigSchema: (options?: { allowRuntimeStart?: boolean }) =>
      ipcRenderer.invoke('im:openclaw:config-schema', options),


    // Weixin QR login
    weixinQrLoginStart: () => ipcRenderer.invoke('im:weixin:qr-login-start'),
    weixinQrLoginWait: (accountId?: string) => ipcRenderer.invoke('im:weixin:qr-login-wait', accountId),

    // Pairing
    listPairingRequests: (platform: string) => ipcRenderer.invoke('im:pairing:list', platform),
    approvePairingCode: (platform: string, code: string) => ipcRenderer.invoke('im:pairing:approve', platform, code),
    rejectPairingRequest: (platform: string, code: string) => ipcRenderer.invoke('im:pairing:reject', platform, code),

    // DingTalk Multi-Instance
    addDingTalkInstance: (name: string) => ipcRenderer.invoke('im:dingtalk:instance:add', name),
    deleteDingTalkInstance: (instanceId: string) => ipcRenderer.invoke('im:dingtalk:instance:delete', instanceId),
    setDingTalkInstanceConfig: (instanceId: string, config: any, options?: { syncGateway?: boolean }) =>
      ipcRenderer.invoke('im:dingtalk:instance:config:set', instanceId, config, options),

    // QQ Multi-Instance
    addQQInstance: (name: string) => ipcRenderer.invoke('im:qq:instance:add', name),
    deleteQQInstance: (instanceId: string) => ipcRenderer.invoke('im:qq:instance:delete', instanceId),
    setQQInstanceConfig: (instanceId: string, config: any, options?: { syncGateway?: boolean }) =>
      ipcRenderer.invoke('im:qq:instance:config:set', instanceId, config, options),

    // Feishu Multi-Instance
    addFeishuInstance: (name: string, engineKey?: FeishuEngineKeyType) => ipcRenderer.invoke('im:feishu:instance:add', name, engineKey),
    deleteFeishuInstance: (instanceId: string, engineKey?: FeishuEngineKeyType) => ipcRenderer.invoke('im:feishu:instance:delete', instanceId, engineKey),
    setFeishuInstanceConfig: (instanceId: string, config: any, options?: { syncGateway?: boolean; engineKey?: FeishuEngineKeyType }) =>
      ipcRenderer.invoke('im:feishu:instance:config:set', instanceId, config, options),
    detectOpenClawLocalFeishu: () => ipcRenderer.invoke(ImIpcChannel.FeishuDetectOpenClawLocal),
    importOpenClawLocalFeishu: () => ipcRenderer.invoke(ImIpcChannel.FeishuImportOpenClawLocal),
    setFeishuManagementMode: (mode: FeishuManagementModeType) =>
      ipcRenderer.invoke(ImIpcChannel.FeishuSetManagementMode, mode),
    setFeishuRuntimeOwnership: (input: { engineKey: FeishuEngineKeyType; ownership: FeishuRuntimeOwnershipType }) =>
      ipcRenderer.invoke(ImIpcChannel.FeishuSetRuntimeOwnership, input),
    refreshFeishuRuntimeOwnership: (engineKey?: FeishuEngineKeyType) =>
      ipcRenderer.invoke(ImIpcChannel.FeishuRefreshRuntimeOwnership, engineKey),

    // Event listeners
    onStatusChange: (callback: (status: any) => void) => {
      const handler = (_event: any, status: any) => callback(status);
      ipcRenderer.on('im:status:change', handler);
      return () => ipcRenderer.removeListener('im:status:change', handler);
    },
    onMessageReceived: (callback: (message: any) => void) => {
      const handler = (_event: any, message: any) => callback(message);
      ipcRenderer.on('im:message:received', handler);
      return () => ipcRenderer.removeListener('im:message:received', handler);
    },
  },
  scheduledTasks: {
    // Task CRUD
    list: () => ipcRenderer.invoke(ScheduledTaskIpc.List),
    get: (id: string) => ipcRenderer.invoke(ScheduledTaskIpc.Get, id),
    create: (input: any) => ipcRenderer.invoke(ScheduledTaskIpc.Create, input),
    update: (id: string, input: any) => ipcRenderer.invoke(ScheduledTaskIpc.Update, id, input),
    delete: (id: string) => ipcRenderer.invoke(ScheduledTaskIpc.Delete, id),
    toggle: (id: string, enabled: boolean) => ipcRenderer.invoke(ScheduledTaskIpc.Toggle, id, enabled),

    // Execution
    runManually: (id: string) => ipcRenderer.invoke(ScheduledTaskIpc.RunManually, id),
    stop: (id: string) => ipcRenderer.invoke(ScheduledTaskIpc.Stop, id),

    // Run history
    listRuns: (taskId: string, limit?: number, offset?: number) =>
      ipcRenderer.invoke(ScheduledTaskIpc.ListRuns, taskId, limit, offset),
    countRuns: (taskId: string) => ipcRenderer.invoke(ScheduledTaskIpc.CountRuns, taskId),
    listAllRuns: (limit?: number, offset?: number) =>
      ipcRenderer.invoke(ScheduledTaskIpc.ListAllRuns, limit, offset),
    resolveSession: (sessionKey: string) =>
      ipcRenderer.invoke(ScheduledTaskIpc.ResolveSession, sessionKey),

    // Delivery channels
    listChannels: () => ipcRenderer.invoke(ScheduledTaskIpc.ListChannels),
    listChannelConversations: (channel: string, accountId?: string) => ipcRenderer.invoke(ScheduledTaskIpc.ListChannelConversations, channel, accountId),

    // Stream event listeners
    onStatusUpdate: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on(ScheduledTaskIpc.StatusUpdate, handler);
      return () => ipcRenderer.removeListener(ScheduledTaskIpc.StatusUpdate, handler);
    },
    onRunUpdate: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on(ScheduledTaskIpc.RunUpdate, handler);
      return () => ipcRenderer.removeListener(ScheduledTaskIpc.RunUpdate, handler);
    },
    onRefresh: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on(ScheduledTaskIpc.Refresh, handler);
      return () => ipcRenderer.removeListener(ScheduledTaskIpc.Refresh, handler);
    },
  },
  networkStatus: {
    send: (status: 'online' | 'offline') => ipcRenderer.send('network:status-change', status),
  },
  qwen: {
    // OAuth登录
    oauthLogin: () => ipcRenderer.invoke('qwen:oauth:login'),
    // OAuth刷新token
    oauthRefresh: (refreshToken: string) => ipcRenderer.invoke('qwen:oauth:refresh', refreshToken),
    // OAuth进度监听
    onOAuthProgress: (callback: (message: string) => void) => {
      const handler = (_event: any, message: string) => callback(message);
      ipcRenderer.on('qwen:oauth:progress', handler);
      return () => ipcRenderer.removeListener('qwen:oauth:progress', handler);
    },
  },
  auth: {
    login: (loginUrl?: string) => ipcRenderer.invoke('auth:login', { loginUrl }),
    exchange: (code: string) => ipcRenderer.invoke('auth:exchange', { code }),
    getPendingCallback: () => ipcRenderer.invoke('auth:getPendingCallback'),
    getUser: () => ipcRenderer.invoke('auth:getUser'),
    getQuota: () => ipcRenderer.invoke('auth:getQuota'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    refreshToken: () => ipcRenderer.invoke('auth:refreshToken'),
    getAccessToken: () => ipcRenderer.invoke('auth:getAccessToken'),
    getModels: () => ipcRenderer.invoke('auth:getModels'),
    getProfileSummary: () => ipcRenderer.invoke('auth:getProfileSummary'),
    onCallback: (callback: (data: { code: string }) => void) => {
      const handler = (_event: any, data: { code: string }) => callback(data);
      ipcRenderer.on('auth:callback', handler);
      return () => ipcRenderer.removeListener('auth:callback', handler);
    },
    onQuotaChanged: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('auth:quotaChanged', handler);
      return () => ipcRenderer.removeListener('auth:quotaChanged', handler);
    },
  },
  feishu: {
    install: {
      qrcode: (isLark: boolean) =>
        ipcRenderer.invoke('feishu:install:qrcode', { isLark }) as Promise<{
          url: string;
          deviceCode: string;
          interval: number;
          expireIn: number;
        }>,
      poll: (deviceCode: string) =>
        ipcRenderer.invoke('feishu:install:poll', { deviceCode }) as Promise<{
          done: boolean;
          appId?: string;
          appSecret?: string;
          domain?: string;
          error?: string;
        }>,
      verify: (appId: string, appSecret: string) =>
        ipcRenderer.invoke('feishu:install:verify', { appId, appSecret }) as Promise<{
          success: boolean;
          error?: string;
        }>,
    },
  },
  githubCopilot: {
    requestDeviceCode: () =>
      ipcRenderer.invoke('github-copilot:request-device-code') as Promise<{
        userCode: string;
        verificationUri: string;
        deviceCode: string;
        interval: number;
        expiresIn: number;
      }>,
    pollForToken: (deviceCode: string, interval: number, expiresIn: number) =>
      ipcRenderer.invoke('github-copilot:poll-for-token', { deviceCode, interval, expiresIn }) as Promise<{
        success: boolean;
        token?: string;
        githubUser?: string;
        baseUrl?: string;
        error?: string;
      }>,
    cancelPolling: () => ipcRenderer.invoke('github-copilot:cancel-polling') as Promise<void>,
    signOut: () => ipcRenderer.invoke('github-copilot:sign-out') as Promise<void>,
    refreshToken: () =>
      ipcRenderer.invoke('github-copilot:refresh-token') as Promise<{
        success: boolean;
        token?: string;
        baseUrl?: string;
        error?: string;
      }>,
    onTokenUpdated: (callback: (data: { token: string; baseUrl: string }) => void) => {
      const handler = (_event: unknown, data: { token: string; baseUrl: string }) => callback(data);
      ipcRenderer.on('github-copilot:token-updated', handler);
      return () => ipcRenderer.removeListener('github-copilot:token-updated', handler);
    },
  },
});
