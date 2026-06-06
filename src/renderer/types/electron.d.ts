import type {
  ClaudeCodePermissionMode,
  CoworkAgentEngine,
  CoworkSessionKind,
  DeepSeekTuiPermissionMode,
  ExternalAgentConfigSource,
  OpenCodePermissionMode,
  QwenCodePermissionMode,
} from '@shared/cowork/constants';
import type { CoworkFileActivity } from '@shared/cowork/fileActivity';
import type {
  RuntimeCallRecord,
  RuntimeMetricsFilters,
  RuntimeMetricsSummary,
} from '@shared/cowork/runtimeMetrics';
import type { CoworkModelOverride, CoworkSessionRuntimeSnapshot } from '@shared/cowork/runtimeSnapshot';
import type { CoworkStudioAssetsResult } from '@shared/cowork/studioAssets';
import type { FeishuEngineKeyType, FeishuManagementModeType, FeishuRuntimeOwnershipType, WeixinOwnershipType } from '@shared/im/constants';
import type { DesktopPetTaskSnapshot, PetConfig, PetPosition } from '@shared/pet/constants';
import type { SkillMarketplaceSort, SkillMarketplaceSourceType } from '@shared/skills/constants';

interface ApiResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  error?: string;
}

interface ApiStreamResponse {
  ok: boolean;
  status: number;
  statusText: string;
  error?: string;
}

interface CoworkSessionMeta {
  id: string;
  title: string;
  claudeSessionId: string | null;
  codexAppThreadId?: string | null;
  status: 'idle' | 'running' | 'completed' | 'error';
  pinned: boolean;
  cwd: string;
  systemPrompt: string;
  executionMode: 'auto' | 'local' | 'sandbox';
  activeSkillIds: string[];
  agentId: string;
  sessionKind?: CoworkSessionKind;
  parentSessionId?: string | null;
  teamId?: string | null;
  runtimeSnapshot?: CoworkSessionRuntimeSnapshot | null;
  createdAt: number;
  updatedAt: number;
}

// Cowork types for IPC
interface CoworkSession extends CoworkSessionMeta {
  messages: CoworkMessage[];
}

interface CoworkMessage {
  id: string;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';
  content: string;
  timestamp: number;
  sequence?: number | null;
  metadata?: Record<string, unknown>;
}

interface CoworkSessionSummary {
  id: string;
  title: string;
  codexAppThreadId?: string | null;
  status: 'idle' | 'running' | 'completed' | 'error';
  pinned: boolean;
  agentId?: string;
  sessionKind?: CoworkSessionKind;
  parentSessionId?: string | null;
  teamId?: string | null;
  runtimeSnapshot?: CoworkSessionRuntimeSnapshot | null;
  createdAt: number;
  updatedAt: number;
}

type StartupServiceStatus = 'pending' | 'running' | 'ready' | 'error' | 'degraded';

interface StartupServiceState {
  name: string;
  status: StartupServiceStatus;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  error?: string;
}

interface CoworkConfig {
  workingDirectory: string;
  systemPrompt: string;
  executionMode: 'auto' | 'local' | 'sandbox';
  agentEngine: CoworkAgentEngine;
  openclawConfigSource: ExternalAgentConfigSource;
  claudeCodeConfigSource: ExternalAgentConfigSource;
  claudeCodePermissionMode: ClaudeCodePermissionMode;
  codexConfigSource: ExternalAgentConfigSource;
  hermesConfigSource: ExternalAgentConfigSource;
  opencodeConfigSource: ExternalAgentConfigSource;
  opencodePermissionMode: OpenCodePermissionMode;
  qwenCodeConfigSource: ExternalAgentConfigSource;
  qwenCodePermissionMode: QwenCodePermissionMode;
  deepseekTuiConfigSource: ExternalAgentConfigSource;
  deepseekTuiPermissionMode: DeepSeekTuiPermissionMode;
  memoryEnabled: boolean;
  memoryImplicitUpdateEnabled: boolean;
  memoryLlmJudgeEnabled: boolean;
  memoryGuardLevel: 'strict' | 'standard' | 'relaxed';
  memoryUserMemoriesMaxItems: number;
}

type CoworkConfigUpdate = Partial<Pick<
  CoworkConfig,
  | 'workingDirectory'
  | 'executionMode'
  | 'agentEngine'
  | 'openclawConfigSource'
  | 'claudeCodeConfigSource'
  | 'claudeCodePermissionMode'
  | 'codexConfigSource'
  | 'hermesConfigSource'
  | 'opencodeConfigSource'
  | 'opencodePermissionMode'
  | 'qwenCodeConfigSource'
  | 'qwenCodePermissionMode'
  | 'deepseekTuiConfigSource'
  | 'deepseekTuiPermissionMode'
  | 'memoryEnabled'
  | 'memoryImplicitUpdateEnabled'
  | 'memoryLlmJudgeEnabled'
  | 'memoryGuardLevel'
  | 'memoryUserMemoriesMaxItems'
>>;

type CliAppType = 'claude' | 'codex' | 'hermes' | 'openclaw' | 'opencode' | 'grok' | 'qwen' | 'deepseek_tui';
type CliAuthStatus = 'unknown' | 'logged_out' | 'logged_in' | 'expired' | 'unconfigured';

interface CliAppConfigSnapshot {
  appType: CliAppType;
  configDir: string;
  primaryConfigPath: string;
  secondaryConfigPaths: string[];
  configExists: boolean;
  currentProviderId: string | null;
  currentProviderName: string | null;
  providerCount: number;
}

interface CliCommandStatus {
  engine: Extract<CoworkAgentEngine, 'openclaw' | 'claude_code' | 'codex' | 'hermes' | 'opencode' | 'grok_build' | 'qwen_code' | 'deepseek_tui'>;
  appType: CliAppType;
  command: string;
  found: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
  authStatus: CliAuthStatus;
  authSource: string | null;
  authMessage: string | null;
  checking?: boolean;
  config: CliAppConfigSnapshot;
}

interface CcSwitchSnapshot {
  installed: boolean;
  appDir: string;
  dbPath: string;
  settingsPath: string;
  settingsExists: boolean;
  databaseExists: boolean;
  claudeConfigDirOverride: string | null;
  codexConfigDirOverride: string | null;
}

interface ExternalAgentEnvironmentSnapshot {
  ccSwitch: CcSwitchSnapshot;
  engines: CliCommandStatus[];
  codexApp?: CodexAppStatus;
}

type ExternalAgentProviderAppType = CliAppType;

type CodexAppStatusPhase = 'missing' | 'ready' | 'starting' | 'error';

interface CodexAppStatus {
  phase: CodexAppStatusPhase;
  cliFound: boolean;
  cliPath: string | null;
  cliVersion: string | null;
  appInstalled: boolean;
  appPath: string | null;
  appRunning: boolean;
  socketPath: string | null;
  appServerSupported: boolean;
  message: string;
  error?: string;
}

interface CodexAppTaskSyncResult {
  synced: number;
  imported: number;
  updated: number;
  lastSyncAt: number;
}

type ExternalAgentCliInstallPhase =
  | 'starting'
  | 'installing'
  | 'verifying'
  | 'success'
  | 'error'
  | 'unsupported';

interface ExternalAgentCliInstallProgress {
  appType: ExternalAgentProviderAppType;
  phase: ExternalAgentCliInstallPhase;
  message: string;
  detail?: string;
}

interface ExternalAgentCliInstallResult {
  success: boolean;
  appType?: ExternalAgentProviderAppType;
  installMethod?: string;
  command?: string;
  binaryPath?: string | null;
  version?: string | null;
  snapshot?: ExternalAgentEnvironmentSnapshot;
  error?: string;
  unsupported?: boolean;
}

interface ExternalAgentProviderSummary {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface ExternalAgentProvider {
  id: string;
  appType: ExternalAgentProviderAppType;
  name: string;
  settingsConfig: Record<string, unknown>;
  category: string | null;
  isCurrent: boolean;
  createdAt: number;
  updatedAt: number;
  summary: ExternalAgentProviderSummary;
}

interface ExternalAgentProviderInput {
  appType: ExternalAgentProviderAppType;
  id?: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  settingsConfig?: Record<string, unknown>;
  category?: string | null;
  setCurrent?: boolean;
}

interface ExternalAgentProviderListResult {
  success: boolean;
  appType?: ExternalAgentProviderAppType;
  providers?: ExternalAgentProvider[];
  currentProviderId?: string | null;
  liveConfigPaths?: {
    primaryConfigPath: string;
    secondaryConfigPaths: string[];
  };
  provider?: ExternalAgentProvider | null;
  imported?: number;
  error?: string;
}

interface ExternalAgentModelImportResult {
  success: boolean;
  appType?: ExternalAgentProviderAppType;
  imported?: boolean;
  duplicate?: boolean;
  providerKey?: string;
  providerName?: string;
  modelId?: string;
  providerConfig?: {
    enabled: boolean;
    apiKey: string;
    baseUrl: string;
    apiFormat: 'anthropic' | 'openai';
    displayName?: string;
    models: Array<{ id: string; name: string; supportsImage?: boolean }>;
  };
  error?: string;
}

interface CoworkAgentEngineListResult {
  success: boolean;
  snapshot?: ExternalAgentEnvironmentSnapshot;
  refreshing?: boolean;
  cachedAt?: number;
  error?: string;
}

interface CoworkUserMemoryEntry {
  id: string;
  text: string;
}

interface CoworkMemoryStats {
  total: number;
  created: number;
  stale: number;
  deleted: number;
  explicit: number;
  implicit: number;
}

interface CoworkPermissionRequest {
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  requestId: string;
  toolUseId?: string | null;
}

interface CoworkApiConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  apiType?: 'anthropic' | 'openai';
}

type OpenClawEnginePhase =
  | 'not_installed'
  | 'installing'
  | 'ready'
  | 'starting'
  | 'running'
  | 'error';

interface OpenClawEngineStatus {
  phase: OpenClawEnginePhase;
  version: string | null;
  progressPercent?: number;
  message?: string;
  canRetry: boolean;
  gatewayMode?: 'attached' | 'managed' | null;
  binaryPath?: string | null;
  configPath?: string | null;
  gatewayUrl?: string | null;
  gatewayPort?: number | null;
  currentModel?: string | null;
  feishuConfigured?: boolean;
  feishuRunning?: boolean;
}

type HermesEngineStatus = OpenClawEngineStatus;

interface AppUpdateDownloadProgress {
  received: number;
  total: number | undefined;
  percent: number | undefined;
  speed: number | undefined;
}

interface QwenOAuthToken {
  access: string;
  refresh: string;
  expires: number;
  resourceUrl?: string;
}

interface WindowState {
  isMaximized: boolean;
  isFullscreen: boolean;
  isFocused: boolean;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  isOfficial: boolean;
  isBuiltIn: boolean;
  updatedAt: number;
  prompt: string;
  skillPath: string;
  version?: string;
}

interface MarketTag {
  id: string;
  en: string;
  zh: string;
}

interface MarketplaceSkill {
  id: string;
  name: string;
  description: string | { en: string; zh: string };
  tags?: string[];
  url: string;
  version?: string;
  slug?: string;
  category?: string;
  sourceType?: SkillMarketplaceSourceType;
  rating?: number;
  stars?: number;
  hotScore?: number;
  source: {
    from: string;
    url: string;
    author?: string;
  };
}

interface SkillMarketplaceOptions {
  query?: string;
  category?: string;
  sort?: SkillMarketplaceSort;
  limit?: number;
}

interface SkillMarketplaceResponse {
  success: boolean;
  skills?: MarketplaceSkill[];
  tags?: MarketTag[];
  cached?: boolean;
  updatedAt?: number;
  error?: string;
}

type EmailConnectivityCheckCode = 'imap_connection' | 'smtp_connection';
type EmailConnectivityCheckLevel = 'pass' | 'fail';
type EmailConnectivityVerdict = 'pass' | 'fail';

interface EmailConnectivityCheck {
  code: EmailConnectivityCheckCode;
  level: EmailConnectivityCheckLevel;
  message: string;
  durationMs: number;
}

interface EmailConnectivityTestResult {
  testedAt: number;
  verdict: EmailConnectivityVerdict;
  checks: EmailConnectivityCheck[];
}

type CoworkPermissionResult =
  | {
      behavior: 'allow';
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: Record<string, unknown>[];
      toolUseID?: string;
    }
  | {
      behavior: 'deny';
      message: string;
      interrupt?: boolean;
      toolUseID?: string;
    };

interface McpServerConfigIPC {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  transportType: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  isBuiltIn: boolean;
  githubUrl?: string;
  registryId?: string;
  createdAt: number;
  updatedAt: number;
}

interface McpMarketplaceServer {
  id: string;
  name: string;
  description_zh: string;
  description_en: string;
  category: string;
  transportType: 'stdio' | 'sse' | 'http';
  command: string;
  defaultArgs: string[];
  requiredEnvKeys?: string[];
  optionalEnvKeys?: string[];
}

interface McpMarketplaceCategory {
  id: string;
  name_zh: string;
  name_en: string;
}

interface McpMarketplaceData {
  categories: McpMarketplaceCategory[];
  servers: McpMarketplaceServer[];
}

import type { Platform } from '@shared/platform';

import type {
  Agent,
  AgentTeam,
  CreateAgentTeamRequest,
  PresetAgent,
  UpdateAgentTeamRequest,
} from './agent';

interface CreditItem {
  type: 'subscription' | 'boost' | 'free';
  label: string;
  labelEn: string;
  creditsRemaining: number;
  expiresAt: string | null;
}

interface ProfileSummaryData {
  id: number;
  nickname: string;
  avatarUrl: string | null;
  totalCreditsRemaining: number;
  creditItems: CreditItem[];
}

interface IElectronAPI {
  platform: string;
  arch: string;
  store: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
  skills: {
    list: () => Promise<{ success: boolean; skills?: Skill[]; error?: string }>;
    setEnabled: (options: { id: string; enabled: boolean }) => Promise<{ success: boolean; skills?: Skill[]; error?: string }>;
    delete: (id: string) => Promise<{ success: boolean; skills?: Skill[]; error?: string }>;
    download: (source: string) => Promise<{ success: boolean; skills?: Skill[]; error?: string; auditReport?: any; pendingInstallId?: string }>;
    upgrade: (skillId: string, downloadUrl: string) => Promise<{ success: boolean; skills?: Skill[]; error?: string; auditReport?: any; pendingInstallId?: string }>;
    confirmInstall: (pendingId: string, action: string) => Promise<{ success: boolean; skills?: Skill[]; error?: string }>;
    getRoot: () => Promise<{ success: boolean; path?: string; error?: string }>;
    autoRoutingPrompt: () => Promise<{ success: boolean; prompt?: string | null; error?: string }>;
    getConfig: (skillId: string) => Promise<{ success: boolean; config?: Record<string, string>; error?: string }>;
    setConfig: (skillId: string, config: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
    testEmailConnectivity: (
      skillId: string,
      config: Record<string, string>
    ) => Promise<{ success: boolean; result?: EmailConnectivityTestResult; error?: string }>;
    fetchMarketplace: (options?: SkillMarketplaceOptions) => Promise<SkillMarketplaceResponse>;
    searchMarketplace: (options?: SkillMarketplaceOptions) => Promise<SkillMarketplaceResponse>;
    installMarketplaceSkill: (skill: MarketplaceSkill) => Promise<{ success: boolean; skills?: Skill[]; error?: string; auditReport?: any; pendingInstallId?: string }>;
    onChanged: (callback: () => void) => () => void;
  };
  mcp: {
    list: () => Promise<{ success: boolean; servers?: McpServerConfigIPC[]; error?: string }>;
    create: (data: any) => Promise<{ success: boolean; servers?: McpServerConfigIPC[]; error?: string }>;
    update: (id: string, data: any) => Promise<{ success: boolean; servers?: McpServerConfigIPC[]; error?: string }>;
    delete: (id: string) => Promise<{ success: boolean; servers?: McpServerConfigIPC[]; error?: string }>;
    setEnabled: (options: { id: string; enabled: boolean }) => Promise<{ success: boolean; servers?: McpServerConfigIPC[]; error?: string }>;
    fetchMarketplace: () => Promise<{ success: boolean; data?: McpMarketplaceData; error?: string }>;
    refreshBridge: () => Promise<{ success: boolean; tools: number; error?: string }>;
    onBridgeSyncStart: (callback: () => void) => () => void;
    onBridgeSyncDone: (callback: (data: { tools: number; error?: string }) => void) => () => void;
  };
  agents: {
    list: () => Promise<Agent[]>;
    get: (id: string) => Promise<Agent | null>;
    create: (request: { id?: string; name: string; description?: string; systemPrompt?: string; identity?: string; model?: string; agentEngine?: CoworkAgentEngine; icon?: string; skillIds?: string[]; source?: string; presetId?: string }) => Promise<Agent>;
    update: (id: string, updates: { name?: string; description?: string; systemPrompt?: string; identity?: string; model?: string; agentEngine?: CoworkAgentEngine; icon?: string; skillIds?: string[]; enabled?: boolean }) => Promise<Agent>;
    delete: (id: string) => Promise<void>;
    presets: () => Promise<PresetAgent[]>;
    addPreset: (presetId: string) => Promise<Agent>;
    listTeams: () => Promise<AgentTeam[]>;
    getTeam: (id: string) => Promise<AgentTeam | null>;
    createTeam: (request: CreateAgentTeamRequest) => Promise<AgentTeam | null>;
    updateTeam: (id: string, updates: UpdateAgentTeamRequest) => Promise<AgentTeam | null>;
    deleteTeam: (id: string) => Promise<boolean>;
    installDevelopmentTeam: () => Promise<AgentTeam | null>;
  };
  api: {
    fetch: (options: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
      expectedStatuses?: number[];
    }) => Promise<ApiResponse>;
    stream: (options: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
      requestId: string;
    }) => Promise<ApiStreamResponse>;
    cancelStream: (requestId: string) => Promise<boolean>;
    onStreamData: (requestId: string, callback: (chunk: string) => void) => () => void;
    onStreamDone: (requestId: string, callback: () => void) => () => void;
    onStreamError: (requestId: string, callback: (error: string) => void) => () => void;
    onStreamAbort: (requestId: string, callback: () => void) => () => void;
  };
  getApiConfig: () => Promise<CoworkApiConfig | null>;
  checkApiConfig: (options?: { probeModel?: boolean }) => Promise<{ hasConfig: boolean; config: CoworkApiConfig | null; error?: string }>;
  saveApiConfig: (config: CoworkApiConfig) => Promise<{ success: boolean; error?: string }>;
  generateSessionTitle: (userInput: string | null) => Promise<string>;
  getRecentCwds: (limit?: number) => Promise<string[]>;
  openclaw: {
    engine: {
      getStatus: () => Promise<{ success: boolean; status?: OpenClawEngineStatus; error?: string }>;
      install: () => Promise<{ success: boolean; status?: OpenClawEngineStatus; error?: string }>;
      retryInstall: () => Promise<{ success: boolean; status?: OpenClawEngineStatus; error?: string }>;
      restartGateway: () => Promise<{ success: boolean; status?: OpenClawEngineStatus; error?: string }>;
      onProgress: (callback: (status: OpenClawEngineStatus) => void) => () => void;
    };
  };
  hermes: {
    engine: {
      getStatus: () => Promise<{ success: boolean; status?: HermesEngineStatus; error?: string }>;
      install: () => Promise<{ success: boolean; status?: HermesEngineStatus; error?: string }>;
      retryInstall: () => Promise<{ success: boolean; status?: HermesEngineStatus; error?: string }>;
      restartGateway: () => Promise<{ success: boolean; status?: HermesEngineStatus; error?: string }>;
      onProgress: (callback: (status: HermesEngineStatus) => void) => () => void;
    };
  };
  codexApp: {
    engine: {
      getStatus: () => Promise<{ success: boolean; status?: CodexAppStatus; error?: string }>;
      start: () => Promise<{ success: boolean; status?: CodexAppStatus; error?: string }>;
    };
    tasks: {
      sync: (input?: { cwd?: string; includeAll?: boolean; limit?: number }) => Promise<{ success: boolean; result?: CodexAppTaskSyncResult; error?: string }>;
      open: (input: { threadId: string }) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
    };
  };
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => void;
    on: (channel: string, func: (...args: any[]) => void) => () => void;
  };
  window: {
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    showSystemMenu: (position: { x: number; y: number }) => void;
    onStateChanged: (callback: (state: WindowState) => void) => () => void;
  };
  cowork: {
    startSession: (options: { prompt: string; cwd?: string; systemPrompt?: string; title?: string; activeSkillIds?: string[]; agentId?: string; teamId?: string; modelOverride?: CoworkModelOverride | null; imageAttachments?: Array<{ name: string; mimeType: string; base64Data: string }> }) => Promise<{ success: boolean; session?: CoworkSession; error?: string; code?: string; engineStatus?: OpenClawEngineStatus }>;
    continueSession: (options: { sessionId: string; prompt: string; systemPrompt?: string; activeSkillIds?: string[]; modelOverride?: CoworkModelOverride | null; imageAttachments?: Array<{ name: string; mimeType: string; base64Data: string }> }) => Promise<{ success: boolean; session?: CoworkSession; error?: string; code?: string; engineStatus?: OpenClawEngineStatus }>;
    stopSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    deleteSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    deleteSessions: (sessionIds: string[]) => Promise<{ success: boolean; error?: string }>;
    setSessionPinned: (options: { sessionId: string; pinned: boolean }) => Promise<{ success: boolean; error?: string }>;
    renameSession: (options: { sessionId: string; title: string }) => Promise<{ success: boolean; error?: string }>;
    getSession: (sessionId: string) => Promise<{ success: boolean; session?: CoworkSession; error?: string }>;
    getSessionMeta: (sessionId: string) => Promise<{ success: boolean; session?: CoworkSessionMeta; error?: string }>;
    getRecentMessages: (input: { sessionId: string; limit?: number }) => Promise<{ success: boolean; messages?: CoworkMessage[]; error?: string }>;
    getMessagesAfter: (input: { sessionId: string; sequence: number }) => Promise<{ success: boolean; messages?: CoworkMessage[]; error?: string }>;
    getMessagesBefore: (input: { sessionId: string; sequence: number; limit?: number }) => Promise<{ success: boolean; messages?: CoworkMessage[]; error?: string }>;
    getSessionRuntimeSnapshot: (sessionId: string) => Promise<{ success: boolean; runtimeSnapshot?: CoworkSessionRuntimeSnapshot | null; error?: string }>;
    remoteManaged: (sessionId: string) => Promise<{ success: boolean; remoteManaged: boolean; error?: string }>;
    listSessions: (agentId?: string) => Promise<{ success: boolean; sessions?: CoworkSessionSummary[]; error?: string }>;
    exportResultImage: (options: {
      rect: { x: number; y: number; width: number; height: number };
      defaultFileName?: string;
    }) => Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }>;
    captureImageChunk: (options: {
      rect: { x: number; y: number; width: number; height: number };
    }) => Promise<{ success: boolean; width?: number; height?: number; pngBase64?: string; error?: string }>;
    saveResultImage: (options: {
      pngBase64: string;
      defaultFileName?: string;
    }) => Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }>;
    exportSessionText: (options: {
      content: string;
      defaultFileName?: string;
      fileExtension?: string;
    }) => Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }>;
    copyToClipboard: (options: { text?: string; imageBase64?: string }) => Promise<{ success: boolean; error?: string }>;
    respondToPermission: (options: { requestId: string; result: CoworkPermissionResult }) => Promise<{ success: boolean; error?: string }>;
    getConfig: () => Promise<{ success: boolean; config?: CoworkConfig; error?: string }>;
    setConfig: (config: CoworkConfigUpdate) => Promise<{ success: boolean; error?: string }>;
    listAgentEngines: (input?: { forceRefresh?: boolean; appTypes?: ExternalAgentProviderAppType[] }) => Promise<CoworkAgentEngineListResult>;
    getRuntimeMetricsSummary: (filters: RuntimeMetricsFilters) => Promise<{ success: boolean; summary?: RuntimeMetricsSummary; error?: string }>;
    listRuntimeCalls: (filters: RuntimeMetricsFilters) => Promise<{ success: boolean; total?: number; calls?: RuntimeCallRecord[]; error?: string }>;
    getRuntimeCallDetail: (callId: string) => Promise<{ success: boolean; call?: RuntimeCallRecord | null; error?: string }>;
    reportRendererReady: (input: {
      firstPaintMs?: number;
      firstInteractiveMs?: number;
      configLoadedMs?: number;
      recentSessionsLoadedMs?: number;
    }) => Promise<{ success: boolean }>;
    reportSettingsMetric: (input: {
      type: 'open' | 'interactive' | 'tabLoad' | 'ipc';
      durationMs?: number;
      tab?: string;
      channel?: string;
      success?: boolean;
      error?: string;
      triggeredRuntimeStart?: boolean;
    }) => Promise<{ success: boolean }>;
    getStartupServicesStatus: () => Promise<{ success: boolean; services?: StartupServiceState[]; error?: string }>;
    onStartupServicesChanged: (callback: (services: StartupServiceState[]) => void) => () => void;
    ensureStudioAssets: () => Promise<CoworkStudioAssetsResult>;
    installAgentCli: (appType: ExternalAgentProviderAppType) => Promise<ExternalAgentCliInstallResult>;
    listAgentProviders: (appType: ExternalAgentProviderAppType) => Promise<ExternalAgentProviderListResult>;
    saveAgentProvider: (input: ExternalAgentProviderInput) => Promise<ExternalAgentProviderListResult>;
    deleteAgentProvider: (input: { appType: ExternalAgentProviderAppType; id: string }) => Promise<ExternalAgentProviderListResult>;
    setCurrentAgentProvider: (input: { appType: ExternalAgentProviderAppType; id: string }) => Promise<ExternalAgentProviderListResult>;
    importLiveAgentProvider: (appType: ExternalAgentProviderAppType) => Promise<ExternalAgentProviderListResult>;
    importLocalAgentConfigToModelSettings: (appType: ExternalAgentProviderAppType) => Promise<ExternalAgentModelImportResult>;
    syncOpenClawGlobalConfig: () => Promise<{ success: boolean; changed?: boolean; status?: OpenClawEngineStatus; error?: string }>;
    syncOpenCodeGlobalConfig: () => Promise<ExternalAgentProviderListResult>;
    syncQwenCodeGlobalConfig: () => Promise<ExternalAgentProviderListResult>;
    syncDeepSeekTuiGlobalConfig: () => Promise<ExternalAgentProviderListResult>;
    onAgentCliInstallProgress: (callback: (progress: ExternalAgentCliInstallProgress) => void) => () => void;
    onAgentEnginesChanged: (callback: (result: CoworkAgentEngineListResult) => void) => () => void;
    listMemoryEntries: (input: {
      query?: string;
      limit?: number;
      offset?: number;
    }) => Promise<{ success: boolean; entries?: CoworkUserMemoryEntry[]; error?: string }>;
    createMemoryEntry: (input: {
      text: string;
    }) => Promise<{ success: boolean; entry?: CoworkUserMemoryEntry; error?: string }>;
    updateMemoryEntry: (input: {
      id: string;
      text: string;
    }) => Promise<{ success: boolean; entry?: CoworkUserMemoryEntry; error?: string }>;
    deleteMemoryEntry: (input: { id: string }) => Promise<{ success: boolean; error?: string }>;
    getMemoryStats: () => Promise<{ success: boolean; stats?: CoworkMemoryStats; error?: string }>;
    readBootstrapFile: (filename: string) => Promise<{ success: boolean; content: string; error?: string }>;
    writeBootstrapFile: (filename: string, content: string) => Promise<{ success: boolean; error?: string }>;
    onStreamMessage: (callback: (data: { sessionId: string; message: CoworkMessage }) => void) => () => void;
    subscribeSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    unsubscribeSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    onStreamMessageUpdate: (callback: (data: {
      sessionId: string;
      messageId: string;
      content: string;
      mode?: 'snapshot' | 'delta' | 'final';
      offset?: number;
      sequence?: number;
      finalLength?: number;
    }) => void) => () => void;
    onStreamFileActivity: (callback: (data: { sessionId: string; activity: CoworkFileActivity }) => void) => () => void;
    onStreamPermission: (callback: (data: { sessionId: string; request: CoworkPermissionRequest }) => void) => () => void;
    onStreamPermissionDismiss: (callback: (data: { requestId: string }) => void) => () => void;
    onStreamComplete: (callback: (data: { sessionId: string; claudeSessionId: string | null }) => void) => () => void;
    onStreamError: (callback: (data: { sessionId: string; error: string }) => void) => () => void;
    onSessionsChanged: (callback: () => void) => () => void;
  };
  dialog: {
    selectDirectory: () => Promise<{ success: boolean; path: string | null }>;
    selectFile: (options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ success: boolean; path: string | null }>;
    selectFiles: (options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ success: boolean; paths: string[] }>;
    saveInlineFile: (options: { dataBase64: string; fileName?: string; mimeType?: string; cwd?: string }) => Promise<{ success: boolean; path: string | null; error?: string }>;
    readFileAsDataUrl: (filePath: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
    saveLocalImageToDirectory: (options: { sourcePath: string; fileName?: string }) => Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }>;
  };
  shell: {
    openPath: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    showItemInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  };
  autoLaunch: {
    get: () => Promise<{ enabled: boolean }>;
    set: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  };
  preventSleep: {
    get: () => Promise<{ enabled: boolean }>;
    set: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  };
  appInfo: {
    getVersion: () => Promise<string>;
    getSystemLocale: () => Promise<string>;
  };
  appUpdate: {
    download: (url: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    cancelDownload: () => Promise<{ success: boolean }>;
    install: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    onDownloadProgress: (callback: (data: AppUpdateDownloadProgress) => void) => () => void;
  };
  log: {
    getPath: () => Promise<string>;
    openFolder: () => Promise<void>;
    exportZip: () => Promise<{
      success: boolean;
      canceled?: boolean;
      path?: string;
      missingEntries?: string[];
      error?: string;
    }>;
  };
  im: {
    getConfig: () => Promise<{ success: boolean; config?: IMGatewayConfig; error?: string }>;
    setConfig: (config: Partial<IMGatewayConfig>, options?: { syncGateway?: boolean }) => Promise<{ success: boolean; error?: string }>;
    syncConfig: () => Promise<{ success: boolean; error?: string }>;
    startGateway: (platform: Platform) => Promise<{ success: boolean; error?: string }>;
    stopGateway: (platform: Platform) => Promise<{ success: boolean; error?: string }>;
    testGateway: (
      platform: Platform,
      configOverride?: Partial<IMGatewayConfig>
    ) => Promise<{ success: boolean; result?: IMConnectivityTestResult; error?: string }>;
    getStatus: () => Promise<{ success: boolean; status?: IMGatewayStatus; error?: string }>;
    getLocalIp: () => Promise<string>;
    getOpenClawConfigSchema: (options?: { allowRuntimeStart?: boolean }) => Promise<{ success: boolean; result?: { schema: Record<string, unknown>; uiHints: Record<string, Record<string, unknown>> }; error?: string }>;
    weixinQrLoginStart: () => Promise<{ success: boolean; qrDataUrl?: string; message: string; sessionKey?: string }>;
    weixinQrLoginWait: (accountId?: string) => Promise<{ success: boolean; connected: boolean; message: string; accountId?: string }>;
    listPairingRequests: (platform: string) => Promise<{
      success: boolean;
      requests: Array<{ id: string; code: string; createdAt: string; lastSeenAt: string; meta?: Record<string, string> }>;
      allowFrom: string[];
      error?: string;
    }>;
    approvePairingCode: (platform: string, code: string) => Promise<{ success: boolean; error?: string }>;
    rejectPairingRequest: (platform: string, code: string) => Promise<{ success: boolean; error?: string }>;
    addQQInstance: (name: string) => Promise<{ success: boolean; instance?: QQInstanceConfig; error?: string }>;
    deleteQQInstance: (instanceId: string) => Promise<{ success: boolean; error?: string }>;
    setQQInstanceConfig: (instanceId: string, config: any, options?: { syncGateway?: boolean }) => Promise<{ success: boolean; error?: string }>;
    addFeishuInstance: (name: string, engineKey?: FeishuEngineKeyType) => Promise<{ success: boolean; instance?: FeishuInstanceConfig; error?: string }>;
    deleteFeishuInstance: (instanceId: string, engineKey?: FeishuEngineKeyType) => Promise<{ success: boolean; error?: string }>;
    setFeishuInstanceConfig: (instanceId: string, config: any, options?: { syncGateway?: boolean; engineKey?: FeishuEngineKeyType }) => Promise<{ success: boolean; error?: string }>;
    detectOpenClawLocalFeishu: () => Promise<{
      success: boolean;
      result?: FeishuOpenClawLocalStatus;
      error?: string;
    }>;
    importOpenClawLocalFeishu: () => Promise<{
      success: boolean;
      instance?: FeishuInstanceConfig;
      result?: FeishuOpenClawLocalStatus;
      error?: string;
    }>;
    setFeishuManagementMode: (mode: FeishuManagementModeType) => Promise<{
      success: boolean;
      mode?: FeishuManagementModeType;
      status?: FeishuOpenClawLocalStatus;
      error?: string;
    }>;
    setFeishuRuntimeOwnership: (input: {
      engineKey: FeishuEngineKeyType;
      ownership: FeishuRuntimeOwnershipType;
    }) => Promise<{
      success: boolean;
      ownership?: FeishuRuntimeOwnershipType;
      status?: FeishuRuntimeOwnershipStatus;
      error?: string;
    }>;
    refreshFeishuRuntimeOwnership: (engineKey?: FeishuEngineKeyType) => Promise<{
      success: boolean;
      ownership?: FeishuRuntimeOwnershipType;
      status?: FeishuRuntimeOwnershipStatus;
      error?: string;
    }>;
    addDingTalkInstance: (name: string) => Promise<{ success: boolean; instance?: DingTalkInstanceConfig; error?: string }>;
    deleteDingTalkInstance: (instanceId: string) => Promise<{ success: boolean; error?: string }>;
    setDingTalkInstanceConfig: (instanceId: string, config: any, options?: { syncGateway?: boolean }) => Promise<{ success: boolean; error?: string }>;
    onStatusChange: (callback: (status: IMGatewayStatus) => void) => () => void;
    onMessageReceived: (callback: (message: IMMessage) => void) => () => void;
  };
  scheduledTasks: {
    list: () => Promise<{ success: boolean; tasks?: import('../../scheduledTask/types').ScheduledTask[]; error?: string }>;
    get: (id: string) => Promise<{ success: boolean; task?: import('../../scheduledTask/types').ScheduledTask; error?: string }>;
    create: (input: import('../../scheduledTask/types').ScheduledTaskInput) => Promise<{ success: boolean; task?: import('../../scheduledTask/types').ScheduledTask; error?: string }>;
    update: (id: string, input: Partial<import('../../scheduledTask/types').ScheduledTaskInput>) => Promise<{ success: boolean; task?: import('../../scheduledTask/types').ScheduledTask; error?: string }>;
    delete: (id: string) => Promise<{ success: boolean; error?: string }>;
    toggle: (id: string, enabled: boolean) => Promise<{ success: boolean; task?: import('../../scheduledTask/types').ScheduledTask; warning?: string; error?: string }>;
    runManually: (id: string) => Promise<{ success: boolean; error?: string }>;
    stop: (id: string) => Promise<{ success: boolean; error?: string }>;
    listRuns: (taskId: string, limit?: number, offset?: number) => Promise<{ success: boolean; runs?: import('../../scheduledTask/types').ScheduledTaskRun[]; error?: string }>;
    countRuns: (taskId: string) => Promise<{ success: boolean; count?: number; error?: string }>;
    listAllRuns: (limit?: number, offset?: number) => Promise<{ success: boolean; runs?: import('../../scheduledTask/types').ScheduledTaskRunWithName[]; error?: string }>;
    resolveSession: (sessionKey: string) => Promise<{
      success: boolean;
      session?: import('./cowork').CoworkSession | null;
      error?: string;
    }>;
    listChannels: () => Promise<{
      success: boolean;
      channels?: import('../../scheduledTask/types').ScheduledTaskChannelOption[];
      error?: string;
    }>;
    listChannelConversations?: (channel: string, accountId?: string) => Promise<{
      success: boolean;
      conversations?: import('../../scheduledTask/types').ScheduledTaskConversationOption[];
      error?: string;
    }>;
    onStatusUpdate: (callback: (data: import('../../scheduledTask/types').ScheduledTaskStatusEvent) => void) => () => void;
    onRunUpdate: (callback: (data: import('../../scheduledTask/types').ScheduledTaskRunEvent) => void) => () => void;
    onRefresh: (callback: () => void) => () => void;
  };
  permissions: {
    checkCalendar: () => Promise<{ success: boolean; status?: string; error?: string; autoRequested?: boolean }>;
    requestCalendar: () => Promise<{ success: boolean; granted?: boolean; status?: string; error?: string }>;
  };
  auth: {
    login: (loginUrl?: string) => Promise<{ success: boolean; error?: string }>;
    exchange: (code: string) => Promise<{ success: boolean; user?: any; quota?: any; error?: string }>;
    getPendingCallback: () => Promise<string | null>;
    getUser: () => Promise<{ success: boolean; user?: any; quota?: any }>;
    getQuota: () => Promise<{ success: boolean; quota?: any }>;
    logout: () => Promise<{ success: boolean }>;
    refreshToken: () => Promise<{ success: boolean; accessToken?: string }>;
    getAccessToken: () => Promise<string | null>;
    getModels: () => Promise<{ success: boolean; models?: Array<{ modelId: string; modelName: string; provider: string; apiFormat: string }> }>;
    getProfileSummary: () => Promise<{ success: boolean; data?: ProfileSummaryData }>;
    onCallback: (callback: (data: { code: string }) => void) => () => void;
    onQuotaChanged: (callback: () => void) => () => void;
  }
  enterprise: {
    getConfig: () => Promise<{ ui?: Record<string, 'hide' | 'disable' | 'readonly'>; disableUpdate?: boolean; version: string; name: string } | null>;
  };
  desktopPet: {
    getConfig: () => Promise<PetConfig>;
    applyPreview: (config: Partial<PetConfig>) => Promise<PetConfig>;
    getBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
    setPosition: (position: PetPosition & { persist?: boolean }) => Promise<{ x: number; y: number; width: number; height: number } | null>;
    setMouseInteractive: (interactive: boolean) => Promise<boolean>;
    openMainWindow: () => Promise<boolean>;
    getTaskSnapshot: () => Promise<DesktopPetTaskSnapshot | null>;
    openTask: (sessionId: string) => Promise<boolean>;
    onConfigChanged: (callback: (config: PetConfig) => void) => () => void;
    onTaskChanged: (callback: (snapshot: DesktopPetTaskSnapshot | null) => void) => () => void;
    onOpenTaskRequested: (callback: (data: { sessionId: string }) => void) => () => void;
  };
  networkStatus: {
    send: (status: 'online' | 'offline') => void;
  };
  auth: {
    login: (loginUrl?: string) => Promise<{ success: boolean; error?: string }>;
    exchange: (code: string) => Promise<{ success: boolean; user?: { userId: string; phone: string; nickname: string; avatarUrl: string }; quota?: { planName: string; subscriptionStatus: string; creditsLimit: number; creditsUsed: number; creditsRemaining: number }; error?: string }>;
    getPendingCallback: () => Promise<string | null>;
    getUser: () => Promise<{ success: boolean; user?: { userId: string; phone: string; nickname: string; avatarUrl: string }; quota?: { planName: string; subscriptionStatus: string; creditsLimit: number; creditsUsed: number; creditsRemaining: number } }>;
    getQuota: () => Promise<{ success: boolean; quota?: { planName: string; subscriptionStatus: string; creditsLimit: number; creditsUsed: number; creditsRemaining: number } }>;
    logout: () => Promise<{ success: boolean }>;
    refreshToken: () => Promise<{ success: boolean; accessToken?: string }>;
    getAccessToken: () => Promise<string | null>;
    onCallback: (callback: (data: { code: string }) => void) => () => void;
  };
  qwen: {
    oauthLogin: () => Promise<{ success: boolean; data?: QwenOAuthToken; error?: string }>;
    oauthRefresh: (refreshToken: string) => Promise<{ success: boolean; data?: QwenOAuthToken; error?: string }>;
    onOAuthProgress: (callback: (message: string) => void) => () => void;
  },
  feishu: {
    install: {
      qrcode: (isLark: boolean) => Promise<{
        url: string;
        deviceCode: string;
        interval: number;
        expireIn: number;
      }>;
      poll: (deviceCode: string) => Promise<{
        done: boolean;
        appId?: string;
        appSecret?: string;
        domain?: string;
        error?: string;
      }>;
      verify: (appId: string, appSecret: string) => Promise<{
        success: boolean;
        error?: string;
      }>;
    };
  };
  githubCopilot: {
    requestDeviceCode: () => Promise<{
      userCode: string;
      verificationUri: string;
      deviceCode: string;
      interval: number;
      expiresIn: number;
    }>;
    pollForToken: (deviceCode: string, interval: number, expiresIn: number) => Promise<{
      success: boolean;
      token?: string;
      githubUser?: string;
      baseUrl?: string;
      error?: string;
    }>;
    cancelPolling: () => Promise<void>;
    signOut: () => Promise<void>;
    refreshToken: () => Promise<{
      success: boolean;
      token?: string;
      baseUrl?: string;
      error?: string;
    }>;
    onTokenUpdated: (callback: (data: { token: string; baseUrl: string }) => void) => () => void;
  };
}

// IM Gateway types
interface IMGatewayConfig {
  dingtalk: DingTalkMultiInstanceConfig;
  feishu: FeishuMultiInstanceConfig;
  telegram: TelegramOpenClawConfig;
  qq: QQMultiInstanceConfig;
  discord: DiscordOpenClawConfig;
  nim: NimConfig;
  'netease-bee': NeteaseBeeChanConfig;
  wecom: WecomConfig;
  popo: PopoOpenClawConfig;
  weixin: WeixinOpenClawConfig;
  settings: IMSettings;
}

interface DingTalkOpenClawConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  dmPolicy: 'open' | 'pairing' | 'allowlist';
  allowFrom: string[];
  groupPolicy: 'open' | 'allowlist';
  sessionTimeout: number;
  separateSessionByConversation: boolean;
  groupSessionScope: 'group' | 'group_sender';
  sharedMemoryAcrossConversations: boolean;
  gatewayBaseUrl: string;
  debug: boolean;
}

interface DingTalkInstanceConfig extends DingTalkOpenClawConfig {
  instanceId: string;
  instanceName: string;
}

interface DingTalkInstanceStatus extends DingTalkGatewayStatus {
  instanceId: string;
  instanceName: string;
}

interface DingTalkMultiInstanceConfig {
  instances: DingTalkInstanceConfig[];
}

interface DingTalkMultiInstanceStatus {
  instances: DingTalkInstanceStatus[];
}

interface FeishuOpenClawGroupConfig {
  requireMention?: boolean;
  allowFrom?: string[];
  systemPrompt?: string;
}

interface FeishuOpenClawConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  domain: 'feishu' | 'lark' | string;
  dmPolicy: 'pairing' | 'allowlist' | 'open' | 'disabled';
  allowFrom: string[];
  groupPolicy: 'allowlist' | 'open' | 'disabled';
  groupAllowFrom: string[];
  groups: Record<string, FeishuOpenClawGroupConfig>;
  historyLimit: number;
  replyMode: 'auto' | 'static' | 'streaming';
  mediaMaxMb: number;
  debug: boolean;
}

interface FeishuInstanceConfig extends FeishuOpenClawConfig {
  instanceId: string;
  instanceName: string;
  engineKey?: FeishuEngineKeyType;
  importSource?: 'openclaw_local';
  secretStatus?: 'resolved' | 'needs_input';
  sourceChannelKey?: string;
}

interface FeishuInstanceStatus extends FeishuGatewayStatus {
  instanceId: string;
  instanceName: string;
}

interface FeishuMultiInstanceConfig {
  activeEngineKey?: FeishuEngineKeyType;
  instances: FeishuInstanceConfig[];
  profiles?: Partial<Record<FeishuEngineKeyType, FeishuProfileConfig>>;
  conflicts?: FeishuAppConflict[];
}

interface FeishuProfileConfig {
  engineKey: FeishuEngineKeyType;
  instances: FeishuInstanceConfig[];
}

interface FeishuAppConflict {
  appId: string;
  engineKeys: FeishuEngineKeyType[];
  instanceIds: string[];
}

interface FeishuMultiInstanceStatus {
  activeEngineKey?: FeishuEngineKeyType;
  instances: FeishuInstanceStatus[];
  openClawLocal?: FeishuOpenClawLocalStatus;
  profiles?: Partial<Record<FeishuEngineKeyType, FeishuProfileStatus>>;
  conflicts?: FeishuAppConflict[];
  runtimeOwnership?: Partial<Record<FeishuEngineKeyType, FeishuRuntimeOwnershipStatus>>;
}

interface FeishuProfileStatus {
  engineKey: FeishuEngineKeyType;
  configured: boolean;
  enabled: boolean;
  running: boolean;
  instanceCount: number;
}

interface FeishuOpenClawLocalStatus {
  managementMode: FeishuManagementModeType;
  configured: boolean;
  running: boolean;
  imported: boolean;
  managed: boolean;
  canImport: boolean;
  configPath: string | null;
  channelKey: string | null;
  domain: string | null;
  appIdPreview: string | null;
  secretNeedsInput: boolean;
  message: string | null;
}

interface FeishuRuntimeOwnershipStatus {
  engineKey: FeishuEngineKeyType;
  ownership: FeishuRuntimeOwnershipType;
  launchAgentInstalled: boolean;
  launchAgentLoaded: boolean;
  launchAgentLabel: string | null;
  plistPath: string | null;
  scriptPath: string | null;
  configPath: string | null;
  message: string | null;
}

interface TelegramOpenClawGroupConfig {
  requireMention?: boolean;
  allowFrom?: string[];
  systemPrompt?: string;
}

interface TelegramOpenClawConfig {
  enabled: boolean;
  botToken: string;
  dmPolicy: 'pairing' | 'allowlist' | 'open' | 'disabled';
  allowFrom: string[];
  groupPolicy: 'allowlist' | 'open' | 'disabled';
  groupAllowFrom: string[];
  groups: Record<string, TelegramOpenClawGroupConfig>;
  historyLimit: number;
  replyToMode: 'off' | 'first' | 'all';
  linkPreview: boolean;
  streaming: 'off' | 'partial' | 'block' | 'progress';
  mediaMaxMb: number;
  proxy: string;
  webhookUrl: string;
  webhookSecret: string;
  debug: boolean;
}

interface DiscordOpenClawGuildConfig {
  requireMention?: boolean;
  allowFrom?: string[];
  systemPrompt?: string;
}

interface DiscordOpenClawConfig {
  enabled: boolean;
  botToken: string;
  dmPolicy: 'pairing' | 'allowlist' | 'open' | 'disabled';
  allowFrom: string[];
  groupPolicy: 'allowlist' | 'open' | 'disabled';
  groupAllowFrom: string[];
  guilds: Record<string, DiscordOpenClawGuildConfig>;
  historyLimit: number;
  streaming: 'off' | 'partial' | 'block' | 'progress';
  mediaMaxMb: number;
  proxy: string;
  debug: boolean;
}

interface NimP2pConfig {
  policy: 'open' | 'allowlist' | 'disabled';
  allowFrom?: (string | number)[];
}

interface NimTeamConfig {
  policy: 'open' | 'allowlist' | 'disabled';
  allowFrom?: (string | number)[];
}

interface NimQChatConfig {
  policy: 'open' | 'allowlist' | 'disabled';
  allowFrom?: (string | number)[];
}

interface NimAdvancedConfig {
  mediaMaxMb?: number;
  textChunkLimit?: number;
  debug?: boolean;
}

interface NimConfig {
  enabled: boolean;
  appKey: string;
  account: string;
  token: string;
  p2p?: NimP2pConfig;
  team?: NimTeamConfig;
  qchat?: NimQChatConfig;
  advanced?: NimAdvancedConfig;
}

interface NeteaseBeeChanConfig {
  enabled: boolean;
  clientId: string;
  secret: string;
  debug?: boolean;
}

interface QQConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  dmPolicy: 'open' | 'pairing' | 'allowlist';
  allowFrom: string[];
  groupPolicy: 'open' | 'allowlist' | 'disabled';
  groupAllowFrom: string[];
  historyLimit: number;
  markdownSupport: boolean;
  imageServerBaseUrl: string;
  debug: boolean;
}

interface QQInstanceConfig extends QQConfig {
  instanceId: string;
  instanceName: string;
}

interface QQMultiInstanceConfig {
  instances: QQInstanceConfig[];
}

interface QQInstanceStatus extends QQGatewayStatus {
  instanceId: string;
  instanceName: string;
}

interface QQMultiInstanceStatus {
  instances: QQInstanceStatus[];
}

interface WecomConfig {
  enabled: boolean;
  botId: string;
  secret: string;
  dmPolicy: 'open' | 'pairing' | 'allowlist' | 'disabled';
  allowFrom: string[];
  groupPolicy: 'open' | 'allowlist' | 'disabled';
  groupAllowFrom: string[];
  sendThinkingMessage: boolean;
  debug: boolean;
}

interface PopoOpenClawConfig {
  enabled: boolean;
  connectionMode: 'websocket' | 'webhook';
  appKey: string;
  appSecret: string;
  token: string;
  aesKey: string;
  webhookBaseUrl: string;
  webhookPath: string;
  webhookPort: number;
  dmPolicy: 'open' | 'pairing' | 'allowlist' | 'disabled';
  allowFrom: string[];
  groupPolicy: 'open' | 'allowlist' | 'disabled';
  groupAllowFrom: string[];
  textChunkLimit: number;
  richTextChunkLimit: number;
  debug: boolean;
}

interface WeixinOpenClawConfig {
  enabled: boolean;
  accountId: string;
  dmPolicy: 'open' | 'pairing' | 'allowlist' | 'disabled';
  allowFrom: string[];
  groupPolicy: 'open' | 'allowlist' | 'disabled';
  groupAllowFrom: string[];
  debug: boolean;
}

interface IMSettings {
  systemPrompt?: string;
  skillsEnabled: boolean;
  feishuManagementMode?: FeishuManagementModeType;
  feishuOwnershipByEngine?: Partial<Record<FeishuEngineKeyType, FeishuRuntimeOwnershipType>>;
  weixinOwnership?: WeixinOwnershipType;
  platformAgentBindings?: Record<string, string>;
}

interface IMGatewayStatus {
  dingtalk: DingTalkMultiInstanceStatus;
  feishu: FeishuMultiInstanceStatus;
  qq: QQMultiInstanceStatus;
  telegram: TelegramGatewayStatus;
  discord: DiscordGatewayStatus;
  nim: NimGatewayStatus;
  'netease-bee': NeteaseBeeChanGatewayStatus;
  wecom: WecomGatewayStatus;
  popo: PopoGatewayStatus;
  weixin: WeixinGatewayStatus;
}

type IMConnectivityVerdict = 'pass' | 'warn' | 'fail';

type IMConnectivityCheckLevel = 'pass' | 'info' | 'warn' | 'fail';

type IMConnectivityCheckCode =
  | 'missing_credentials'
  | 'auth_check'
  | 'gateway_running'
  | 'inbound_activity'
  | 'outbound_activity'
  | 'platform_last_error'
  | 'feishu_group_requires_mention'
  | 'feishu_event_subscription_required'
  | 'discord_group_requires_mention'
  | 'telegram_privacy_mode_hint'
  | 'dingtalk_bot_membership_hint'
  | 'nim_p2p_only_hint'
  | 'qq_guild_mention_hint';

interface IMConnectivityCheck {
  code: IMConnectivityCheckCode;
  level: IMConnectivityCheckLevel;
  message: string;
  suggestion?: string;
}

interface IMConnectivityTestResult {
  platform: Platform;
  testedAt: number;
  verdict: IMConnectivityVerdict;
  checks: IMConnectivityCheck[];
}

interface DingTalkGatewayStatus {
  connected: boolean;
  startedAt: number | null;
  lastError: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

interface FeishuGatewayStatus {
  connected: boolean;
  startedAt: string | null;
  botOpenId: string | null;
  error: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

interface TelegramGatewayStatus {
  connected: boolean;
  startedAt: number | null;
  lastError: string | null;
  botUsername: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

interface DiscordGatewayStatus {
  connected: boolean;
  starting: boolean;
  startedAt: number | null;
  lastError: string | null;
  botUsername: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

interface NimGatewayStatus {
  connected: boolean;
  startedAt: number | null;
  lastError: string | null;
  botAccount: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

interface NeteaseBeeChanGatewayStatus {
  connected: boolean;
  startedAt: number | null;
  lastError: string | null;
  botAccount: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

interface QQGatewayStatus {
  connected: boolean;
  startedAt: number | null;
  lastError: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

interface WecomGatewayStatus {
  connected: boolean;
  startedAt: number | null;
  lastError: string | null;
  botId: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

interface PopoGatewayStatus {
  connected: boolean;
  startedAt: number | null;
  lastError: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

interface WeixinGatewayStatus {
  connected: boolean;
  startedAt: number | null;
  lastError: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
  ownership?: WeixinOwnershipType;
  accountId?: string | null;
}

interface IMMessage {
  platform: Platform;
  messageId: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  content: string;
  chatType: 'direct' | 'group';
  timestamp: number;
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}

export {}; 
