import type {
  ClaudeCodePermissionMode,
  CoworkAgentEngine,
  CoworkSessionKind,
  DeepSeekTuiPermissionMode,
  ExternalAgentConfigSource,
  OpenCodePermissionMode,
  QwenCodePermissionMode,
} from '@shared/cowork/constants';
export type { CoworkFileActivity } from '@shared/cowork/fileActivity';
import type { CoworkModelOverride, CoworkSessionRuntimeSnapshot } from '@shared/cowork/runtimeSnapshot';
export type {
  RuntimeCallRecord,
  RuntimeMetricsDetailResult,
  RuntimeMetricsFilters,
  RuntimeMetricsListResult,
  RuntimeMetricsSummary,
  RuntimeToolMetric,
} from '@shared/cowork/runtimeMetrics';

// Cowork image attachment for vision-capable models
export interface CoworkImageAttachment {
  name: string;
  mimeType: string;
  base64Data: string;
}

// Cowork session status
export type CoworkSessionStatus = 'idle' | 'running' | 'completed' | 'error';

// Cowork message types
export type CoworkMessageType = 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';

// Cowork execution mode
export type CoworkExecutionMode = 'auto' | 'local' | 'sandbox';
export type { CoworkAgentEngine, ExternalAgentConfigSource };
export type { CoworkSessionKind };
export type { ClaudeCodePermissionMode, DeepSeekTuiPermissionMode, OpenCodePermissionMode, QwenCodePermissionMode };

export type StartupServiceStatus = 'pending' | 'running' | 'ready' | 'error' | 'degraded';

export interface StartupServiceState {
  name: string;
  status: StartupServiceStatus;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  error?: string;
}

// Cowork message metadata
export interface CoworkMessageMetadata {
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  toolUseId?: string | null;
  error?: string;
  isError?: boolean;
  isStreaming?: boolean;
  isFinal?: boolean;
  isThinking?: boolean;
  skillIds?: string[];  // Skills used for this message
  generatedImages?: Array<{ path: string; name?: string; mimeType?: string; source?: string }>;
  [key: string]: unknown;
}

// Cowork message
export interface CoworkMessage {
  id: string;
  type: CoworkMessageType;
  content: string;
  timestamp: number;
  sequence?: number | null;
  metadata?: CoworkMessageMetadata;
}

export interface CoworkSessionMeta {
  id: string;
  title: string;
  claudeSessionId: string | null;
  codexAppThreadId?: string | null;
  status: CoworkSessionStatus;
  pinned: boolean;
  cwd: string;
  systemPrompt: string;
  executionMode: CoworkExecutionMode;
  activeSkillIds: string[];
  agentId: string;
  sessionKind?: CoworkSessionKind;
  parentSessionId?: string | null;
  teamId?: string | null;
  runtimeSnapshot?: CoworkSessionRuntimeSnapshot | null;
  createdAt: number;
  updatedAt: number;
}

// Cowork session
export interface CoworkSession extends CoworkSessionMeta {
  messages: CoworkMessage[];
}

// Cowork configuration
export interface CoworkConfig {
  workingDirectory: string;
  systemPrompt: string;
  executionMode: CoworkExecutionMode;
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

export type CoworkConfigUpdate = Partial<Pick<
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

export interface CoworkApiConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  apiType?: 'anthropic' | 'openai';
}

export type OpenClawEnginePhase =
  | 'not_installed'
  | 'installing'
  | 'ready'
  | 'starting'
  | 'running'
  | 'error';

export interface OpenClawEngineStatus {
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

export type HermesEngineStatus = OpenClawEngineStatus;

export interface CoworkUserMemoryEntry {
  id: string;
  text: string;
}

export interface CoworkMemoryStats {
  total: number;
  created: number;
  stale: number;
  deleted: number;
  explicit: number;
  implicit: number;
}

// Cowork pending permission request
export interface CoworkPermissionRequest {
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  requestId: string;
  toolUseId?: string | null;
}

export type CoworkPermissionResult =
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

// Cowork permission response
export interface CoworkPermissionResponse {
  requestId: string;
  result: CoworkPermissionResult;
}

// Session summary for list display (without full messages)
export interface CoworkSessionSummary {
  id: string;
  title: string;
  codexAppThreadId?: string | null;
  status: CoworkSessionStatus;
  pinned: boolean;
  agentId?: string;
  sessionKind?: CoworkSessionKind;
  parentSessionId?: string | null;
  teamId?: string | null;
  runtimeSnapshot?: CoworkSessionRuntimeSnapshot | null;
  createdAt: number;
  updatedAt: number;
}

// Start session options
export interface CoworkStartOptions {
  prompt: string;
  cwd?: string;
  systemPrompt?: string;
  title?: string;
  activeSkillIds?: string[];
  agentId?: string;
  teamId?: string;
  modelOverride?: CoworkModelOverride | null;
  imageAttachments?: CoworkImageAttachment[];
}

// Continue session options
export interface CoworkContinueOptions {
  sessionId: string;
  prompt: string;
  systemPrompt?: string;
  activeSkillIds?: string[];
  modelOverride?: CoworkModelOverride | null;
  imageAttachments?: CoworkImageAttachment[];
}

// IPC result types
export interface CoworkSessionResult {
  success: boolean;
  session?: CoworkSession;
  error?: string;
}

export interface CoworkSessionMetaResult {
  success: boolean;
  session?: CoworkSessionMeta;
  error?: string;
}

export interface CoworkMessagesResult {
  success: boolean;
  messages?: CoworkMessage[];
  error?: string;
}

export interface CoworkSessionListResult {
  success: boolean;
  sessions?: CoworkSessionSummary[];
  error?: string;
}

export interface CoworkConfigResult {
  success: boolean;
  config?: CoworkConfig;
  error?: string;
}

export type CliAppType = 'claude' | 'codex' | 'hermes' | 'openclaw' | 'opencode' | 'grok' | 'qwen' | 'deepseek_tui';
export type CliAuthStatus = 'unknown' | 'logged_out' | 'logged_in' | 'expired' | 'unconfigured';

export interface CliAppConfigSnapshot {
  appType: CliAppType;
  configDir: string;
  primaryConfigPath: string;
  secondaryConfigPaths: string[];
  configExists: boolean;
  currentProviderId: string | null;
  currentProviderName: string | null;
  providerCount: number;
}

export interface CliCommandStatus {
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

export interface CcSwitchSnapshot {
  installed: boolean;
  appDir: string;
  dbPath: string;
  settingsPath: string;
  settingsExists: boolean;
  databaseExists: boolean;
  claudeConfigDirOverride: string | null;
  codexConfigDirOverride: string | null;
}

export interface ExternalAgentEnvironmentSnapshot {
  ccSwitch: CcSwitchSnapshot;
  engines: CliCommandStatus[];
  codexApp?: CodexAppStatus;
}

export type ExternalAgentProviderAppType = CliAppType;

export type CodexAppStatusPhase = 'missing' | 'ready' | 'starting' | 'error';

export interface CodexAppStatus {
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

export interface CodexAppTaskSyncResult {
  synced: number;
  imported: number;
  updated: number;
  lastSyncAt: number;
}

export type ExternalAgentCliInstallPhase =
  | 'starting'
  | 'installing'
  | 'verifying'
  | 'success'
  | 'error'
  | 'unsupported';

export interface ExternalAgentCliInstallProgress {
  appType: ExternalAgentProviderAppType;
  phase: ExternalAgentCliInstallPhase;
  message: string;
  detail?: string;
}

export interface ExternalAgentCliInstallResult {
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

export interface ExternalAgentProviderSummary {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ExternalAgentProvider {
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

export interface ExternalAgentProviderInput {
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

export interface ExternalAgentProviderListResult {
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

export interface ExternalAgentModelImportResult {
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

export interface CoworkAgentEngineListResult {
  success: boolean;
  snapshot?: ExternalAgentEnvironmentSnapshot;
  refreshing?: boolean;
  cachedAt?: number;
  error?: string;
}

// Stream event types for IPC communication
export type CoworkStreamEventType =
  | 'message'
  | 'tool_use'
  | 'tool_result'
  | 'permission_request'
  | 'complete'
  | 'error';

export interface CoworkStreamEvent {
  type: CoworkStreamEventType;
  sessionId: string;
  data: {
    message?: CoworkMessage;
    permission?: CoworkPermissionRequest;
    error?: string;
    claudeSessionId?: string;
  };
}
