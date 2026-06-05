import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { randomBytes } from 'crypto';
import type { WebContents } from 'electron';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, net, powerMonitor, powerSaveBlocker,protocol, screen, session, shell, systemPreferences } from 'electron';
import fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import path from 'path';

import { buildScheduledTaskEnginePrompt } from '../scheduledTask/enginePrompt';
import { migrateScheduledTaskRunsToOpenclaw,migrateScheduledTasksToOpenclaw } from '../scheduledTask/migrate';
import {
  ClaudeCodePermissionMode,
  CoworkAgentEngine as CoworkAgentEngineValue,
  CoworkIpcChannel,
  CoworkSessionKind,
  ExternalAgentConfigSource,
  isClaudeCodePermissionMode,
  isCoworkAgentEngine,
  isDeepSeekTuiPermissionMode,
  isExternalAgentConfigSource,
  isOpenClawCoworkAgentEngine,
  isOpenCodePermissionMode,
  isQwenCodePermissionMode,
  isRuntimeCallSource,
  isRuntimeCallStatus,
  RuntimeCallSource,
} from '../shared/cowork/constants';
import type { CoworkFileActivity } from '../shared/cowork/fileActivity';
import type { RuntimeMetricsFilters } from '../shared/cowork/runtimeMetrics';
import type { CoworkSessionRuntimeSnapshot } from '../shared/cowork/runtimeSnapshot';
import { DialogIpcChannel } from '../shared/dialog/constants';
import {
  FeishuEngineKey,
  type FeishuEngineKeyType,
  FeishuImportSource,
  FeishuManagementMode,
  type FeishuManagementModeType,
  FeishuRuntimeOwnership,
  type FeishuRuntimeOwnershipType,
  ImIpcChannel,
  isFeishuEngineKey,
  isFeishuManagementMode,
  isFeishuRuntimeOwnership,
} from '../shared/im/constants';
import {
  DesktopPetIpcChannel,
  type DesktopPetTaskSnapshot,
  DesktopPetTaskSource,
  DesktopPetTaskStatus,
  normalizePetConfig,
  type PetConfig,
  type PetPosition,
} from '../shared/pet/constants';
import { PlatformRegistry } from '../shared/platform';
import { SkillsIpcChannel } from '../shared/skills/constants';
import { AgentManager } from './agentManager';
import { AgentTeamRunner } from './agentTeamRunner';
import { APP_NAME } from './appConstants';
import { getAutoLaunchEnabled, isAutoLaunched, setAutoLaunchEnabled } from './autoLaunchManager';
import { CoworkFileActivityTracker } from './coworkFileActivityTracker';
import { type CoworkMessage, type CoworkSessionMeta,CoworkStore } from './coworkStore';
import { CreatorAssetStore } from './creatorAssetStore';
import { setLanguage, t } from './i18n';
import { IMGatewayConfig,IMGatewayManager } from './im';
import {
  approvePairingCode,
  listPairingRequests,
  readAllowFromStore,
  rejectPairingRequest,
} from './im/imPairingStore';
import type { Platform } from './im/types';
import { registerCreatorStudioIpcHandlers } from './ipcHandlers/creatorStudio';
import {
  getCronJobService,
  initCronJobServiceManager,
  initScheduledTaskHelpers,
  registerScheduledTaskHandlers,
} from './ipcHandlers/scheduledTask';
import {
  ClaudeRuntimeAdapter,
  CodexAppRuntimeAdapter,
  type CoworkAgentEngine,
  CoworkEngineRouter,
  DeepSeekTuiRuntimeAdapter,
  ExternalCliRuntimeAdapter,
  HermesRuntimeAdapter,
  OpenClawRuntimeAdapter,
} from './libs/agentEngine';
import { formatApiFetchLogPayload } from './libs/apiFetchLogSanitizer';
import { cancelActiveDownload,downloadUpdate, installUpdate } from './libs/appUpdateInstaller';
import { clearServerModelMetadata,getCurrentApiConfig, resolveCurrentApiConfig, setAuthTokensGetter, setServerBaseUrlGetter, setStoreGetter, updateServerModelMetadata } from './libs/claudeSettings';
import { CodexAppManager } from './libs/codexAppManager';
import { CodexAppServerClient } from './libs/codexAppServerClient';
import { CodexAppTaskSync } from './libs/codexAppTaskSync';
import {
  clearCopilotTokenState,
  initCopilotTokenManager,
  refreshCopilotTokenNow,
  setCopilotTokenState,
} from './libs/copilotTokenManager';
import { saveCoworkApiConfig } from './libs/coworkConfigStore';
import { getCoworkLogPath } from './libs/coworkLogger';
import { registerProxyTokenRefresher,startCoworkOpenAICompatProxy, stopCoworkOpenAICompatProxy } from './libs/coworkOpenAICompatProxy';
import { CoworkRunner } from './libs/coworkRunner';
import { ensureCoworkStudioAssets } from './libs/coworkStudioAssets';
import { generateSessionTitle, probeCoworkModelReadiness } from './libs/coworkUtil';
import { DeepSeekTuiRuntimeManager } from './libs/deepSeekTuiRuntimeManager';
import { getServerApiBaseUrl, refreshEndpointsTestMode } from './libs/endpoints';
import { mergeEnterpriseOpenclawConfig,resolveEnterpriseConfigPath, syncEnterpriseConfig } from './libs/enterpriseConfigSync';
import {
  ExternalAgentCliInstaller,
  type ExternalAgentCliInstallProgress,
} from './libs/externalAgentCliInstaller';
import {
  applyExternalAgentConfigForEngine,
  importLocalAgentConfigToModelSettings,
  syncDeepSeekTuiGlobalConfigFromWesightModel,
  syncOpenCodeGlobalConfigFromWesightModel,
  syncQwenCodeGlobalConfigFromWesightModel,
} from './libs/externalAgentConfigSync';
import {
  type ExternalAgentEnvironmentProbeReport,
  type ExternalAgentEnvironmentSnapshot,
  getExternalAgentEnvironmentSnapshot,
  getPlaceholderExternalAgentEnvironmentSnapshot,
} from './libs/externalAgentEnvironment';
import {
  type ExternalAgentProviderAppType,
  type ExternalAgentProviderInput,
  ExternalAgentProviderStore,
} from './libs/externalAgentProviderStore';
import {
  getFeishuRuntimeOwnershipStatus,
  transferFeishuToLocalRuntime,
  transferFeishuToWesightRuntime,
} from './libs/feishuLocalRuntimeManager';
import { HermesConfigSync } from './libs/hermesConfigSync';
import { HermesEngineManager, type HermesEngineStatus } from './libs/hermesEngineManager';
import { syncHermesIMSessions } from './libs/hermesImSessionSync';
import { exportLogsZip } from './libs/logExport';
import { McpBridgeServer } from './libs/mcpBridgeServer';
import { McpServerManager } from './libs/mcpServerManager';
import {
  buildManagedSessionKey,
  DEFAULT_MANAGED_AGENT_ID,
  OpenClawChannelSessionSync,
} from './libs/openclawChannelSessionSync';
import type { McpBridgeConfig } from './libs/openclawConfigSync';
import { OpenClawConfigSync } from './libs/openclawConfigSync';
import { OpenClawEngineManager, type OpenClawEngineStatus } from './libs/openclawEngineManager';
import {
  addMemoryEntry,
  deleteMemoryEntry,
  ensureDefaultIdentity,
  migrateSqliteToMemoryMd,
  readBootstrapFile,
  readMemoryEntries,
  resolveMemoryFilePath,
  searchMemoryEntries,
  syncMemoryFileOnWorkspaceChange,
  updateMemoryEntry,
  writeBootstrapFile,
} from './libs/openclawMemoryFile';
import {
  detectOpenClawLocalFeishuConfig,
  importOpenClawLocalFeishuConfig,
  type OpenClawLocalFeishuDetection,
} from './libs/openclawSystemRuntime';
import { startOpenClawTokenProxy, stopOpenClawTokenProxy } from './libs/openclawTokenProxy';
import {
  getPerformanceSnapshot,
  markTiming,
  markTimingValue,
  nowMs,
  recordIpcSend,
  recordSettingsMetric,
} from './libs/performanceMetrics';
import { ensurePythonRuntimeReady } from './libs/pythonRuntime';
import {
  type RuntimeModelSnapshot,
  RuntimeTelemetryTracker,
} from './libs/runtimeTelemetryTracker';
import { SessionSubscriptionRegistry } from './libs/sessionSubscriptions';
import { type MessageUpdatePayload, StreamUpdateCoalescer } from './libs/streamUpdateCoalescer';
import {
  applySystemProxyEnv,
  resolveSystemProxyUrl,
  restoreOriginalProxyEnv,
  setSystemProxyEnabled,
} from './libs/systemProxy';
import { getLogFilePath, getRecentMainLogEntries,initLogger } from './logger';
import { McpStore } from './mcpStore';
import { RuntimeTelemetryStore } from './runtimeTelemetryStore';
import { SkillManager } from './skillManager';
import { getSkillServiceManager } from './skillServices';
import { SqliteStore } from './sqliteStore';
import { createTray, destroyTray, updateTrayMenu } from './trayManager';

// 设置应用程序名称
app.name = APP_NAME;
app.setName(APP_NAME);

const INVALID_FILE_NAME_PATTERN = /[<>:"/\\|?*\u0000-\u001F]/g;
const MIN_MEMORY_USER_MEMORIES_MAX_ITEMS = 1;
const MAX_MEMORY_USER_MEMORIES_MAX_ITEMS = 60;
const IPC_MESSAGE_CONTENT_MAX_CHARS = 120_000;
const IPC_UPDATE_CONTENT_MAX_BYTES = 32 * 1024;
const IPC_UPDATE_CONTENT_MAX_CHARS = 120_000;
const IPC_STRING_MAX_CHARS = 4_000;
const IPC_MAX_DEPTH = 5;
const IPC_MAX_KEYS = 80;
const IPC_MAX_ITEMS = 40;
const MAX_INLINE_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const ENGINE_NOT_READY_CODE = 'ENGINE_NOT_READY';
const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'application/json': '.json',
  'text/csv': '.csv',
};
const IMAGE_FILE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);

const sanitizeExportFileName = (value: string): string => {
  const sanitized = value.replace(INVALID_FILE_NAME_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  return sanitized || 'cowork-session';
};

const sanitizeAttachmentFileName = (value?: string): string => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return 'attachment';
  const fileName = path.basename(raw);
  const sanitized = fileName.replace(INVALID_FILE_NAME_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  return sanitized || 'attachment';
};

const inferAttachmentExtension = (fileName: string, mimeType?: string): string => {
  const fromName = path.extname(fileName).toLowerCase();
  if (fromName) {
    return fromName;
  }
  if (typeof mimeType === 'string') {
    const normalized = mimeType.toLowerCase().split(';')[0].trim();
    return MIME_EXTENSION_MAP[normalized] ?? '';
  }
  return '';
};

const safeDecodePathComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  };
};

const normalizeLocalFilePath = (value: string): string => {
  const trimmed = value.trim().replace(/^localfile:\/\//i, 'file://');
  if (/^file:\/\//i.test(trimmed)) {
    try {
      return safeDecodePathComponent(new URL(trimmed).pathname);
    } catch {
      return safeDecodePathComponent(trimmed.replace(/^file:\/\//i, ''));
    }
  }
  return path.resolve(safeDecodePathComponent(trimmed));
};

const buildUniqueTargetPath = async (directory: string, fileName: string): Promise<string> => {
  const extension = path.extname(fileName);
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;

  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : ` (${index})`;
    const candidate = path.join(directory, `${baseName}${suffix}${extension}`);
    try {
      await fs.promises.access(candidate, fs.constants.F_OK);
    } catch {
      return candidate;
    }
  }

  return path.join(directory, `${baseName}-${Date.now()}${extension}`);
};

const resolveInlineAttachmentDir = (cwd?: string): string => {
  const trimmed = typeof cwd === 'string' ? cwd.trim() : '';
  if (trimmed) {
    const resolved = path.resolve(trimmed);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return path.join(resolved, '.cowork-temp', 'attachments', 'manual');
    }
  }
  return path.join(app.getPath('temp'), 'wesight', 'attachments');
};

const ensurePngFileName = (value: string): string => {
  return value.toLowerCase().endsWith('.png') ? value : `${value}.png`;
};

const ensureZipFileName = (value: string): string => {
  return value.toLowerCase().endsWith('.zip') ? value : `${value}.zip`;
};

const padTwoDigits = (value: number): string => value.toString().padStart(2, '0');

const buildLogExportFileName = (): string => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${padTwoDigits(now.getMonth() + 1)}${padTwoDigits(now.getDate())}`;
  const timePart = `${padTwoDigits(now.getHours())}${padTwoDigits(now.getMinutes())}${padTwoDigits(now.getSeconds())}`;
  return `wesight-logs-${datePart}-${timePart}.zip`;
};

const truncateIpcString = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated in main IPC forwarding]`;
};

const sanitizeIpcPayload = (value: unknown, depth = 0, seen?: WeakSet<object>): unknown => {
  const localSeen = seen ?? new WeakSet<object>();
  if (
    value === null
    || typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'undefined'
  ) {
    return value;
  }
  if (typeof value === 'string') {
    return truncateIpcString(value, IPC_STRING_MAX_CHARS);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'function') {
    return '[function]';
  }
  if (depth >= IPC_MAX_DEPTH) {
    return '[truncated-depth]';
  }
  if (Array.isArray(value)) {
    const result = value.slice(0, IPC_MAX_ITEMS).map((entry) => sanitizeIpcPayload(entry, depth + 1, localSeen));
    if (value.length > IPC_MAX_ITEMS) {
      result.push(`[truncated-items:${value.length - IPC_MAX_ITEMS}]`);
    }
    return result;
  }
  if (typeof value === 'object') {
    if (localSeen.has(value as object)) {
      return '[circular]';
    }
    localSeen.add(value as object);
    const entries = Object.entries(value as Record<string, unknown>);
    const result: Record<string, unknown> = {};
    for (const [key, entry] of entries.slice(0, IPC_MAX_KEYS)) {
      result[key] = sanitizeIpcPayload(entry, depth + 1, localSeen);
    }
    if (entries.length > IPC_MAX_KEYS) {
      result.__truncated_keys__ = entries.length - IPC_MAX_KEYS;
    }
    return result;
  }
  return String(value);
};

const sanitizeCoworkMessageForIpc = (message: any): any => {
  if (!message || typeof message !== 'object') {
    return message;
  }

  // Preserve imageAttachments in metadata as-is (base64 data can be very large
  // and must not be truncated by the generic sanitizer).
  let sanitizedMetadata: unknown;
  if (message.metadata && typeof message.metadata === 'object') {
    const { imageAttachments, ...rest } = message.metadata as Record<string, unknown>;
    const sanitizedRest = sanitizeIpcPayload(rest) as Record<string, unknown> | undefined;
    sanitizedMetadata = {
      ...(sanitizedRest && typeof sanitizedRest === 'object' ? sanitizedRest : {}),
      ...(Array.isArray(imageAttachments) && imageAttachments.length > 0
        ? { imageAttachments }
        : {}),
    };
  } else {
    sanitizedMetadata = undefined;
  }

  return {
    ...message,
    content: typeof message.content === 'string'
      ? truncateIpcString(message.content, IPC_MESSAGE_CONTENT_MAX_CHARS)
      : '',
    metadata: sanitizedMetadata,
  }
};

const sanitizeCoworkFileActivityForIpc = (activity: CoworkFileActivity): CoworkFileActivity => ({
  ...activity,
  content: activity.content === null
    ? null
    : truncateIpcString(activity.content, IPC_UPDATE_CONTENT_MAX_CHARS),
});

const sanitizePermissionRequestForIpc = (request: any): any => {
  if (!request || typeof request !== 'object') {
    return request;
  }
  return {
    ...request,
    toolInput: sanitizeIpcPayload(request.toolInput ?? {}),
  };
};

const normalizeRuntimeMetricsFilters = (input: unknown): RuntimeMetricsFilters => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const record = input as Record<string, unknown>;
  const filters: RuntimeMetricsFilters = {};
  const from = Number(record.from);
  const to = Number(record.to);
  if (Number.isFinite(from)) filters.from = from;
  if (Number.isFinite(to)) filters.to = to;
  if (isCoworkAgentEngine(record.engine)) filters.engine = record.engine;
  if (typeof record.modelId === 'string' && record.modelId.trim()) filters.modelId = record.modelId.trim();
  if (typeof record.providerKey === 'string' && record.providerKey.trim()) filters.providerKey = record.providerKey.trim();
  if (isRuntimeCallStatus(record.status)) filters.status = record.status;
  if (isRuntimeCallSource(record.source)) filters.source = record.source;
  if (typeof record.sessionId === 'string' && record.sessionId.trim()) filters.sessionId = record.sessionId.trim();
  const limit = Number(record.limit);
  const offset = Number(record.offset);
  if (Number.isFinite(limit)) filters.limit = limit;
  if (Number.isFinite(offset)) filters.offset = offset;
  return filters;
};

type CaptureRect = { x: number; y: number; width: number; height: number };

const normalizeCaptureRect = (rect?: Partial<CaptureRect> | null): CaptureRect | null => {
  if (!rect) return null;
  const normalized = {
    x: Math.max(0, Math.round(typeof rect.x === 'number' ? rect.x : 0)),
    y: Math.max(0, Math.round(typeof rect.y === 'number' ? rect.y : 0)),
    width: Math.max(0, Math.round(typeof rect.width === 'number' ? rect.width : 0)),
    height: Math.max(0, Math.round(typeof rect.height === 'number' ? rect.height : 0)),
  };
  return normalized.width > 0 && normalized.height > 0 ? normalized : null;
};

const resolveTaskWorkingDirectory = (workspaceRoot: string): string => {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  // Reject bare Windows drive roots (e.g. "D:\") — mkdir on drive roots causes EPERM,
  // and some agent engines (OpenClaw) also fail when given a drive root as workspace.
  if (process.platform === 'win32' && /^[a-zA-Z]:\\?$/.test(resolvedWorkspaceRoot)) {
    throw new Error(`Cannot use a drive root as the working directory (${resolvedWorkspaceRoot}). Please select a subfolder instead, for example: ${resolvedWorkspaceRoot}Projects`);
  }
  if (!fs.existsSync(resolvedWorkspaceRoot)) {
    fs.mkdirSync(resolvedWorkspaceRoot, { recursive: true });
  }
  if (!fs.statSync(resolvedWorkspaceRoot).isDirectory()) {
    throw new Error(`Selected workspace is not a directory: ${resolvedWorkspaceRoot}`);
  }
  return resolvedWorkspaceRoot;
};

const getDefaultExportImageName = (defaultFileName?: string): string => {
  const normalized = typeof defaultFileName === 'string' && defaultFileName.trim()
    ? defaultFileName.trim()
    : `cowork-session-${Date.now()}`;
  return ensurePngFileName(sanitizeExportFileName(normalized));
};

const savePngWithDialog = async (
  webContents: WebContents,
  pngData: Buffer,
  defaultFileName?: string,
): Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }> => {
  const defaultName = getDefaultExportImageName(defaultFileName);
  const ownerWindow = BrowserWindow.fromWebContents(webContents);
  const saveOptions = {
    title: 'Export Session Image',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  };
  const saveResult = ownerWindow
    ? await dialog.showSaveDialog(ownerWindow, saveOptions)
    : await dialog.showSaveDialog(saveOptions);

  if (saveResult.canceled || !saveResult.filePath) {
    return { success: true, canceled: true };
  }

  const outputPath = ensurePngFileName(saveResult.filePath);
  await fs.promises.writeFile(outputPath, pngData);
  return { success: true, canceled: false, path: outputPath };
};

const configureUserDataPath = (): void => {
  const appDataPath = app.getPath('appData');
  const preferredUserDataPath = path.join(appDataPath, APP_NAME);
  const currentUserDataPath = app.getPath('userData');

  if (currentUserDataPath !== preferredUserDataPath) {
    app.setPath('userData', preferredUserDataPath);
    console.log(`[Main] userData path updated: ${currentUserDataPath} -> ${preferredUserDataPath}`);
  }
};

configureUserDataPath();
initLogger();

const isDev = process.env.NODE_ENV === 'development';
const isLinux = process.platform === 'linux';
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const DEV_SERVER_URL = process.env.ELECTRON_START_URL || 'http://localhost:5175';
const enableVerboseLogging =
  process.env.ELECTRON_ENABLE_LOGGING === '1' ||
  process.env.ELECTRON_ENABLE_LOGGING === 'true';
const disableGpu =
  process.env.WESIGHT_DISABLE_GPU === '1' ||
  process.env.WESIGHT_DISABLE_GPU === 'true' ||
  process.env.ELECTRON_DISABLE_GPU === '1' ||
  process.env.ELECTRON_DISABLE_GPU === 'true';
const reloadOnChildProcessGone =
  process.env.ELECTRON_RELOAD_ON_CHILD_PROCESS_GONE === '1' ||
  process.env.ELECTRON_RELOAD_ON_CHILD_PROCESS_GONE === 'true';
const TITLEBAR_HEIGHT = 48;
const TITLEBAR_COLORS = {
  dark: { color: '#0F1117', symbolColor: '#E4E5E9' },
  // Align light title bar with app light surface-muted tone to reduce visual contrast.
  light: { color: '#F3F4F6', symbolColor: '#1A1D23' },
} as const;

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeWindowsShellPath = (inputPath: string): string => {
  if (!isWindows) return inputPath;

  const trimmed = inputPath.trim();
  if (!trimmed) return inputPath;

  let normalized = trimmed;
  if (/^file:\/\//i.test(normalized)) {
    normalized = safeDecodeURIComponent(normalized.replace(/^file:\/\//i, ''));
  }

  if (/^\/[A-Za-z]:/.test(normalized)) {
    normalized = normalized.slice(1);
  }

  const unixDriveMatch = normalized.match(/^[/\\]([A-Za-z])[/\\](.+)$/);
  if (unixDriveMatch) {
    const drive = unixDriveMatch[1].toUpperCase();
    const rest = unixDriveMatch[2].replace(/[/\\]+/g, '\\');
    return `${drive}:\\${rest}`;
  }

  if (/^[A-Za-z]:[/\\]/.test(normalized)) {
    const drive = normalized[0].toUpperCase();
    const rest = normalized.slice(1).replace(/\//g, '\\');
    return `${drive}${rest}`;
  }

  return normalized;
};

// ==================== macOS Permissions ====================

/**
 * Check calendar permission on macOS by attempting to access Calendar app
 * Returns: 'authorized' | 'denied' | 'restricted' | 'not-determined'
 * On Windows, checks if Outlook is available
 * On Linux, returns 'not-supported'
 */
const checkCalendarPermission = async (): Promise<string> => {
  if (process.platform === 'darwin') {
    try {
      // Try to access Calendar to check permission
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);

      // Quick test to see if we can access Calendar
      await execAsync('osascript -l JavaScript -e \'Application("Calendar").name()\'', { timeout: 5000 });
      console.log('[Permissions] macOS Calendar access: authorized');
      return 'authorized';
    } catch (error: any) {
      // Check if it's a permission error
      if (error.stderr?.includes('不能获取对象') ||
          error.stderr?.includes('not authorized') ||
          error.stderr?.includes('Permission denied')) {
        console.log('[Permissions] macOS Calendar access: not-determined (needs permission)');
        return 'not-determined';
      }
      console.warn('[Permissions] Failed to check macOS calendar permission:', error);
      return 'not-determined';
    }
  }

  if (process.platform === 'win32') {
    // Windows doesn't have a system-level calendar permission like macOS
    // Instead, we check if Outlook is available
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);

      // Check if Outlook COM object is accessible
      const checkScript = `
        try {
          $Outlook = New-Object -ComObject Outlook.Application
          $Outlook.Version
        } catch { exit 1 }
      `;
      await execAsync('powershell -Command "' + checkScript + '"', { timeout: 10000 });
      console.log('[Permissions] Windows Outlook is available');
      return 'authorized';
    } catch (error) {
      console.log('[Permissions] Windows Outlook not available or not accessible');
      return 'not-determined';
    }
  }

  return 'not-supported';
};

/**
 * Request calendar permission on macOS
 * On Windows, attempts to initialize Outlook COM object
 */
const requestCalendarPermission = async (): Promise<boolean> => {
  if (process.platform === 'darwin') {
    try {
      // On macOS, we trigger permission by trying to access Calendar
      // The system will show permission dialog if needed
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);

      await execAsync('osascript -l JavaScript -e \'Application("Calendar").calendars()[0].name()\'', { timeout: 10000 });
      return true;
    } catch (error) {
      console.warn('[Permissions] Failed to request macOS calendar permission:', error);
      return false;
    }
  }

  if (process.platform === 'win32') {
    // Windows doesn't have a permission dialog for COM objects
    // We just check if Outlook is available
    const status = await checkCalendarPermission();
    return status === 'authorized';
  }

  return false;
};



// 配置应用
// Linux/Windows 禁用 Chromium 沙箱：桌面应用渲染自有代码，风险可控；
// Windows 下以管理员运行时沙箱无法降权会导致 GPU 进程启动失败 (error_code=18)
if (isLinux || isWindows) {
  app.commandLine.appendSwitch('no-sandbox');
}
if (isLinux) {
  app.commandLine.appendSwitch('disable-dev-shm-usage');
}
if (disableGpu) {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  // 禁用硬件加速
  app.disableHardwareAcceleration();
}
if (enableVerboseLogging) {
  app.commandLine.appendSwitch('enable-logging');
  app.commandLine.appendSwitch('v', '1');
}

// 配置网络服务
app.on('ready', () => {
  // 配置网络服务重启策略
  app.configureHostResolver({
    enableBuiltInResolver: true,
    secureDnsMode: 'off'
  });
});

// 添加错误处理
app.on('render-process-gone', (_event, webContents, details) => {
  console.error('Render process gone:', details);
  const shouldReload =
    details.reason === 'crashed' ||
    details.reason === 'killed' ||
    details.reason === 'oom' ||
    details.reason === 'launch-failed' ||
    details.reason === 'integrity-failure';
  if (shouldReload) {
    scheduleReload(`render-process-gone (${details.reason})`, webContents);
  }
});

app.on('child-process-gone', (_event, details) => {
  console.error('Child process gone:', details);
  if (reloadOnChildProcessGone && (details.type === 'GPU' || details.type === 'Utility')) {
    scheduleReload(`child-process-gone (${details.type}/${details.reason})`);
  }
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

process.on('exit', (code) => {
  console.log(`[Main] Process exiting with code: ${code}`);
});

let store: SqliteStore | null = null;
let coworkStore: CoworkStore | null = null;
let creatorAssetStore: CreatorAssetStore | null = null;
let runtimeTelemetryStore: RuntimeTelemetryStore | null = null;
let runtimeTelemetryTracker: RuntimeTelemetryTracker | null = null;
let coworkRunner: CoworkRunner | null = null;
let agentTeamRunner: AgentTeamRunner | null = null;
let coworkFileActivityTracker: CoworkFileActivityTracker | null = null;
let externalAgentProviderStore: ExternalAgentProviderStore | null = null;
let externalAgentCliInstaller: ExternalAgentCliInstaller | null = null;
let codexAppManager: CodexAppManager | null = null;
let codexAppServerClient: CodexAppServerClient | null = null;
let codexAppTaskSync: CodexAppTaskSync | null = null;
let claudeRuntimeAdapter: ClaudeRuntimeAdapter | null = null;
let openClawRuntimeAdapter: OpenClawRuntimeAdapter | null = null;
let hermesRuntimeAdapter: HermesRuntimeAdapter | null = null;
let claudeCodeRuntimeAdapter: ExternalCliRuntimeAdapter | null = null;
let codexRuntimeAdapter: ExternalCliRuntimeAdapter | null = null;
let codexAppRuntimeAdapter: CodexAppRuntimeAdapter | null = null;
let openCodeRuntimeAdapter: ExternalCliRuntimeAdapter | null = null;
let grokBuildRuntimeAdapter: ExternalCliRuntimeAdapter | null = null;
let qwenCodeRuntimeAdapter: ExternalCliRuntimeAdapter | null = null;
let deepSeekTuiRuntimeManager: DeepSeekTuiRuntimeManager | null = null;
let deepSeekTuiRuntimeAdapter: DeepSeekTuiRuntimeAdapter | null = null;
let coworkEngineRouter: CoworkEngineRouter | null = null;
let skillManager: SkillManager | null = null;
let mcpStore: McpStore | null = null;
let mcpServerManager: McpServerManager | null = null;
let mcpBridgeServer: McpBridgeServer | null = null;
let mcpBridgeSecret: string | null = null;
let mcpBridgeStartPromise: Promise<McpBridgeConfig | null> | null = null;
let imGatewayManager: IMGatewayManager | null = null;
let storeInitPromise: Promise<SqliteStore> | null = null;
let openClawEngineManager: OpenClawEngineManager | null = null;
let openClawConfigSync: OpenClawConfigSync | null = null;
let openClawBootstrapPromise: Promise<OpenClawEngineStatus> | null = null;
let openClawStatusForwarderBound = false;
let hermesEngineManager: HermesEngineManager | null = null;
let hermesConfigSync: HermesConfigSync | null = null;
let hermesBootstrapPromise: Promise<HermesEngineStatus> | null = null;
let hermesStatusForwarderBound = false;
let hermesIMSessionSyncTimer: ReturnType<typeof setInterval> | null = null;
let hermesIMSessionSyncRunning = false;
let hermesIMSessionSyncFingerprint = '';
let externalAgentCliInstallerForwarderBound = false;
let coworkRuntimeForwarderBound = false;
let memoryMigrationDone = false;
let preventSleepBlockerId: number | null = null;
const sessionSubscriptions = new SessionSubscriptionRegistry();
const sessionSubscriptionCleanupBoundWindowIds = new Set<number>();

const HERMES_IM_SESSION_SYNC_INTERVAL_MS = 4000;

const getTargetWindowsForSession = (sessionId: string, options: { fallbackToAll?: boolean } = {}): BrowserWindow[] => {
  const subscribedWindowIds = new Set(sessionSubscriptions.getSubscribedWindows(sessionId).map(win => win.id));
  const allWindows = BrowserWindow.getAllWindows().filter(win => !win.isDestroyed());
  const subscribedWindows = allWindows.filter(win => subscribedWindowIds.has(win.webContents.id));
  if (subscribedWindows.length > 0 || options.fallbackToAll !== true) {
    return subscribedWindows;
  }
  return allWindows;
};

const sendCoworkStreamPayload = (
  sessionId: string,
  channel: CoworkIpcChannel,
  type: Parameters<typeof recordIpcSend>[0]['type'],
  payload: unknown,
  options: { fallbackToAll?: boolean } = {},
): void => {
  const windows = getTargetWindowsForSession(sessionId, options);
  windows.forEach((win) => {
    if (win.isDestroyed()) return;
    try {
      recordIpcSend({
        type,
        sessionId,
        channel,
        payload,
        windowCount: 1,
      });
      win.webContents.send(channel, payload);
    } catch (error) {
      console.error('[CoworkForwarder] failed to forward cowork stream payload:', error);
    }
  });
};

const bindSessionSubscriptionCleanup = (webContents: WebContents): void => {
  if (sessionSubscriptionCleanupBoundWindowIds.has(webContents.id)) return;
  sessionSubscriptionCleanupBoundWindowIds.add(webContents.id);
  webContents.once('destroyed', () => {
    sessionSubscriptions.removeWindow(webContents.id);
    sessionSubscriptionCleanupBoundWindowIds.delete(webContents.id);
  });
};

const subscribeSenderToCoworkSession = (webContents: WebContents, sessionId: string): void => {
  if (!sessionId || webContents.isDestroyed()) return;
  sessionSubscriptions.subscribe(sessionId, webContents);
  bindSessionSubscriptionCleanup(webContents);
};

const messageUpdateCoalescer = new StreamUpdateCoalescer({
  flushIntervalMs: 500,
  maxPayloadBytes: IPC_UPDATE_CONTENT_MAX_BYTES,
  send: (payload: MessageUpdatePayload) => {
    sendCoworkStreamPayload(
      payload.sessionId,
      CoworkIpcChannel.StreamMessageUpdate,
      'messageUpdate',
      payload,
    );
  },
});

const initStore = async (): Promise<SqliteStore> => {
  if (!storeInitPromise) {
    if (!app.isReady()) {
      throw new Error('Store accessed before app is ready.');
    }
    const startedAt = nowMs();
    // better-sqlite3 opens the database synchronously, so Promise.resolve() resolves
    // immediately. The timeout acts as a safety net for future async changes or
    // unexpected OS-level blocking (e.g., file lock on startup).
    storeInitPromise = Promise.race([
      Promise.resolve(SqliteStore.create(app.getPath('userData'))),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Store initialization timed out after 15s')), 15_000)
      ),
    ]).finally(() => {
      markTiming('db_init_ms', startedAt);
    });
  }
  return storeInitPromise;
};

const getStore = (): SqliteStore => {
  if (!store) {
    throw new Error('Store not initialized. Call initStore() first.');
  }
  return store;
};

const getOpenClawEngineManager = (): OpenClawEngineManager => {
  if (!openClawEngineManager) {
    openClawEngineManager = new OpenClawEngineManager();
  }
  return openClawEngineManager;
};

const getHermesEngineManager = (): HermesEngineManager => {
  if (!hermesEngineManager) {
    hermesEngineManager = new HermesEngineManager();
  }
  return hermesEngineManager;
};

const forwardOpenClawStatus = (status: OpenClawEngineStatus): void => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (win.isDestroyed()) return;
    try {
      win.webContents.send('openclaw:engine:onProgress', status);
    } catch (error) {
      console.error('Failed to forward OpenClaw engine status:', error);
    }
  });
};

const bindOpenClawStatusForwarder = (): void => {
  if (openClawStatusForwarderBound) return;
  const manager = getOpenClawEngineManager();
  manager.on('status', (status) => {
    forwardOpenClawStatus(status);
  });
  openClawStatusForwarderBound = true;
  forwardOpenClawStatus(manager.getStatus());
};

const forwardHermesStatus = (status: HermesEngineStatus): void => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (win.isDestroyed()) return;
    try {
      win.webContents.send('hermes:engine:onProgress', status);
    } catch (error) {
      console.error('Failed to forward Hermes Agent engine status:', error);
    }
  });
};

const bindHermesStatusForwarder = (): void => {
  if (hermesStatusForwarderBound) return;
  const manager = getHermesEngineManager();
  manager.on('status', (status) => {
    forwardHermesStatus(status);
  });
  hermesStatusForwarderBound = true;
  forwardHermesStatus(manager.getStatus());
};

const broadcastCoworkSessionsChanged = (): void => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (win.isDestroyed()) return;
    try {
      win.webContents.send('cowork:sessions:changed');
    } catch (error) {
      console.error('[Cowork] Failed to broadcast session changes:', error);
    }
  });
};

const getEngineNotReadyResponse = (status: { message?: string }) => {
  const fallbackMessage = 'AI engine is initializing. Please try again in a moment.';
  return {
    success: false,
    code: ENGINE_NOT_READY_CODE,
    error: status.message || fallbackMessage,
    engineStatus: status,
  };
};

const bootstrapOpenClawEngine = async (options: { forceReinstall?: boolean; reason?: string } = {}) => {
  if (openClawBootstrapPromise) {
    return openClawBootstrapPromise;
  }

  const manager = getOpenClawEngineManager();
  bindOpenClawStatusForwarder();

  const task = async (): Promise<OpenClawEngineStatus> => {
    const reason = options.reason || 'unknown';
    const t0 = Date.now();
    const elapsed = () => `${Date.now() - t0}ms`;
    try {
      console.log(`[OpenClaw] bootstrap starting (reason=${reason})`);

      // Start MCP Bridge before config sync so mcpBridge tools are included in openclaw.json
      const bridgeResult = await startMcpBridge().catch((err: unknown) => {
        console.error(`[OpenClaw] bootstrap: MCP bridge startup failed (non-fatal):`, err);
        return null as McpBridgeConfig | null;
      });
      console.log(`[OpenClaw] bootstrap: MCP bridge setup done (${elapsed()}), result=${bridgeResult ? `${bridgeResult.tools.length} tools` : 'null'}`);
      console.log(`[OpenClaw] bootstrap: mcpBridgeServer=${mcpBridgeServer?.callbackUrl || 'null'}, mcpServerManager.tools=${mcpServerManager?.toolManifest?.length ?? 'null'}, secret=${mcpBridgeSecret ? 'set' : 'null'}`);

      // Ensure IDENTITY.md has default content in the current workspace
      try {
        ensureDefaultIdentity(getCoworkStore().getConfig().workingDirectory);
      } catch (err) {
        console.warn('[OpenClaw] bootstrap: ensureDefaultIdentity failed (non-fatal):', err);
      }

      const syncResult = await syncOpenClawConfig({
        reason: `bootstrap:${reason}`,
        restartGatewayIfRunning: false,
      });
      console.log(`[OpenClaw] bootstrap: syncOpenClawConfig done (${elapsed()}), success=${syncResult.success}`);
      if (!syncResult.success) {
        return syncResult.status || manager.getStatus();
      }
      if (options.forceReinstall) {
        await manager.stopGateway();
        console.log(`[OpenClaw] bootstrap: stopGateway done (${elapsed()})`);
      }
      const ensuredStatus = await manager.ensureReady({
        forceReinstall: Boolean(options.forceReinstall),
      });
      console.log(`[OpenClaw] bootstrap: ensureReady done (${elapsed()}), phase=${ensuredStatus.phase}`);
      if (ensuredStatus.phase !== 'ready' && ensuredStatus.phase !== 'running') {
        return ensuredStatus;
      }
      const result = await manager.startGateway();
      console.log(`[OpenClaw] bootstrap completed (${elapsed()}), phase=${result.phase}`);
      return result;
    } catch (error) {
      console.error(`[OpenClaw] bootstrap failed (${reason}, ${elapsed()}):`, error);
      return manager.getStatus();
    }
  };

  const promise = task().finally(() => {
    if (openClawBootstrapPromise === promise) {
      openClawBootstrapPromise = null;
    }
  });
  openClawBootstrapPromise = promise;
  return promise;
};

const getHermesConfigSync = (): HermesConfigSync => {
  if (!hermesConfigSync) {
    hermesConfigSync = new HermesConfigSync({
      engineManager: getHermesEngineManager(),
      getCoworkConfig: () => getCoworkStore().getConfig(),
      getFeishuInstances: () => {
        try {
          return getIMGatewayManager().getIMStore().getFeishuInstances(FeishuEngineKey.Hermes);
        } catch {
          return [];
        }
      },
      getFeishuRuntimeOwnership: () => getFeishuRuntimeOwnership(FeishuEngineKey.Hermes),
    });
  }
  return hermesConfigSync;
};

const bootstrapHermesEngine = async (options: { forceReinstall?: boolean; reason?: string } = {}) => {
  if (hermesBootstrapPromise) {
    return hermesBootstrapPromise;
  }

  const manager = getHermesEngineManager();
  bindHermesStatusForwarder();

  const task = async (): Promise<HermesEngineStatus> => {
    const reason = options.reason || 'unknown';
    try {
      const syncResult = getHermesConfigSync().sync(`bootstrap:${reason}`);
      if (!syncResult.success) {
        return syncResult.status || manager.getStatus();
      }
      if (options.forceReinstall) {
        await manager.stopGateway();
      }
      const ensuredStatus = await manager.ensureReady();
      if (ensuredStatus.phase !== 'ready' && ensuredStatus.phase !== 'running') {
        return ensuredStatus;
      }
      return await manager.startGateway();
    } catch (error) {
      console.error(`[Hermes] bootstrap failed (${reason}):`, error);
      return manager.getStatus();
    }
  };

  const promise = task().finally(() => {
    if (hermesBootstrapPromise === promise) {
      hermesBootstrapPromise = null;
    }
  });
  hermesBootstrapPromise = promise;
  return promise;
};

// Module-level handle so ensureOpenClawRunningForCowork can await any in-flight
// proactive token refresh before syncing config to the gateway.
let pendingTokenRefresh: Promise<string | null> | null = null;

const ensureOpenClawRunningForCowork = async () => {
  const manager = getOpenClawEngineManager();

  if (pendingTokenRefresh) {
    console.log('[OpenClaw] ensureRunning: awaiting pending token refresh before gateway start');
    await pendingTokenRefresh.catch(() => {});
  }

  // Ensure MCP bridge is started and config is synced before launching the gateway,
  // so that mcpBridge tools are available in openclaw.json when the gateway loads.
  await startMcpBridge().catch((err: unknown) => {
    console.error('[OpenClaw] ensureRunning: MCP bridge startup failed (non-fatal):', err);
  });
  const syncResult = await syncOpenClawConfig({
    reason: 'ensureRunning:mcpBridge',
    restartGatewayIfRunning: false,
  });
  if (!syncResult.success) {
    console.error('[OpenClaw] ensureRunning: config sync failed:', syncResult.error);
  }

  const status = manager.getStatus();
  if (status.phase === 'running' || status.phase === 'starting') {
    return status;
  }

  return await manager.startGateway();
};

const ensureHermesRunningForCowork = async () => {
  bindHermesStatusForwarder();
  const manager = getHermesEngineManager();
  const status = manager.getStatus();
  const syncResult = getHermesConfigSync().sync('ensureRunning');
  if (!syncResult.success) {
    console.error('[Hermes] ensureRunning: config sync failed:', syncResult.error);
    return syncResult.status || manager.getStatus();
  }
  if (status.phase === 'running') {
    if (syncResult.changed) {
      return await manager.restartGateway();
    }
    return manager.getStatus();
  }
  if (status.phase === 'starting') {
    return await manager.startGateway();
  }
  return await manager.startGateway();
};

const getCoworkStore = () => {
  if (!coworkStore) {
    const sqliteStore = getStore();
    coworkStore = new CoworkStore(sqliteStore.getDatabase());
    coworkStore.setCreatorAssetStore(getCreatorAssetStore());
    const cleaned = coworkStore.autoDeleteNonPersonalMemories();
    if (cleaned > 0) {
      console.info(`[cowork-memory] Auto-deleted ${cleaned} non-personal/procedural memories`);
    }
  }
  return coworkStore;
};

const getCreatorAssetStore = () => {
  if (!creatorAssetStore) {
    creatorAssetStore = new CreatorAssetStore(getStore().getDatabase());
  }
  return creatorAssetStore;
};

const getCoworkFileActivityTracker = (): CoworkFileActivityTracker => {
  if (!coworkFileActivityTracker) {
    coworkFileActivityTracker = new CoworkFileActivityTracker((activity) => {
      updateDesktopPetTaskSnapshot(activity.sessionId, DesktopPetTaskStatus.Coding);
      const safeActivity = sanitizeCoworkFileActivityForIpc(activity);
      const payload = {
        sessionId: activity.sessionId,
        activity: safeActivity,
      };
      sendCoworkStreamPayload(activity.sessionId, CoworkIpcChannel.StreamFileActivity, 'fileActivity', payload);
    });
  }
  return coworkFileActivityTracker;
};

const startCoworkFileActivityForSession = (sessionId: string): void => {
  try {
    const session = getCoworkStore().getSessionMeta(sessionId);
    if (!session?.cwd) return;
    getCoworkFileActivityTracker().startSession(sessionId, session.cwd);
  } catch {
    // Session may not exist yet for very early channel events.
  }
};

const getExternalAgentProviderStore = (): ExternalAgentProviderStore => {
  if (!externalAgentProviderStore) {
    externalAgentProviderStore = new ExternalAgentProviderStore(getStore().getDatabase());
  }
  return externalAgentProviderStore;
};

const getRuntimeTelemetryStore = (): RuntimeTelemetryStore => {
  if (!runtimeTelemetryStore) {
    runtimeTelemetryStore = new RuntimeTelemetryStore(getStore().getDatabase());
  }
  return runtimeTelemetryStore;
};

const getConfigSourceForEngine = (engine: CoworkAgentEngine): string | null => {
  const config = getCoworkStore().getConfig();
  if (engine === CoworkAgentEngineValue.ClaudeCode) return config.claudeCodeConfigSource;
  if (engine === CoworkAgentEngineValue.Codex) return config.codexConfigSource;
  if (engine === CoworkAgentEngineValue.CodexApp) return ExternalAgentConfigSource.LocalCli;
  if (engine === CoworkAgentEngineValue.Hermes) return config.hermesConfigSource;
  if (engine === CoworkAgentEngineValue.OpenCode) return config.opencodeConfigSource;
  if (engine === CoworkAgentEngineValue.GrokBuild) return ExternalAgentConfigSource.LocalCli;
  if (engine === CoworkAgentEngineValue.QwenCode) return config.qwenCodeConfigSource;
  if (engine === CoworkAgentEngineValue.DeepSeekTui) return config.deepseekTuiConfigSource;
  return ExternalAgentConfigSource.WesightModel;
};

const getExternalProviderAppTypeForEngine = (
  engine: CoworkAgentEngine,
): ExternalAgentProviderAppType | null => {
  if (engine === CoworkAgentEngineValue.ClaudeCode) return 'claude';
  if (engine === CoworkAgentEngineValue.Codex) return 'codex';
  if (engine === CoworkAgentEngineValue.Hermes) return 'hermes';
  if (engine === CoworkAgentEngineValue.OpenCode) return 'opencode';
  if (engine === CoworkAgentEngineValue.GrokBuild) return 'grok';
  if (engine === CoworkAgentEngineValue.QwenCode) return 'qwen';
  if (engine === CoworkAgentEngineValue.DeepSeekTui) return 'deepseek_tui';
  return null;
};

const resolveRuntimeModelSnapshot = (engine: CoworkAgentEngine): RuntimeModelSnapshot => {
  const configSource = getConfigSourceForEngine(engine);
  if (engine === CoworkAgentEngineValue.CodexApp) {
    return {
      providerKey: 'codex_app',
      providerName: 'Codex App',
      modelId: null,
      modelName: null,
      configSource,
    };
  }
  const appType = getExternalProviderAppTypeForEngine(engine);
  if (appType && configSource === ExternalAgentConfigSource.LocalCli) {
    const provider = getExternalAgentProviderStore().getCurrentProvider(appType);
    return {
      providerKey: provider?.id ?? null,
      providerName: provider?.name ?? null,
      modelId: provider?.summary.model?.trim() || null,
      modelName: provider?.summary.model?.trim() || null,
      configSource,
    };
  }

  try {
    const resolution = resolveCurrentApiConfig();
    return {
      providerKey: resolution.providerMetadata?.providerName ?? null,
      providerName: resolution.providerMetadata?.providerName ?? null,
      modelId: resolution.config?.model ?? null,
      modelName: resolution.providerMetadata?.modelName ?? resolution.config?.model ?? null,
      configSource,
    };
  } catch {
    return {
      providerKey: null,
      providerName: null,
      modelId: null,
      modelName: null,
      configSource,
    };
  }
};

const getEngineSnapshotLabel = (engine: CoworkAgentEngine): string => {
  if (engine === CoworkAgentEngineValue.OpenClaw) return 'OpenClaw';
  if (engine === CoworkAgentEngineValue.Hermes) return 'Hermes Agent';
  if (engine === CoworkAgentEngineValue.ClaudeCode) return 'Claude Code';
  if (engine === CoworkAgentEngineValue.Codex) return 'Codex CLI';
  if (engine === CoworkAgentEngineValue.CodexApp) return 'Codex App';
  if (engine === CoworkAgentEngineValue.OpenCode) return 'OpenCode';
  if (engine === CoworkAgentEngineValue.GrokBuild) return 'Grok Build';
  if (engine === CoworkAgentEngineValue.QwenCode) return 'Qwen Code';
  if (engine === CoworkAgentEngineValue.DeepSeekTui) return 'DeepSeek-TUI';
  return 'Cowork';
};

const getClaudeCodePermissionLabel = (mode: string | null | undefined): string | null => {
  if (mode === ClaudeCodePermissionMode.BypassPermissions) return 'Auto Execute';
  if (mode === ClaudeCodePermissionMode.Default) return 'Default';
  if (mode === ClaudeCodePermissionMode.Plan) return 'Plan';
  if (mode === ClaudeCodePermissionMode.AcceptEdits) return 'Accept Edits';
  return null;
};

const resolveSessionRuntimeSnapshot = (
  engine: CoworkAgentEngine,
): CoworkSessionRuntimeSnapshot => {
  const model = resolveRuntimeModelSnapshot(engine);
  const config = getCoworkStore().getConfig();
  const permissionMode = engine === CoworkAgentEngineValue.ClaudeCode
    ? config.claudeCodePermissionMode
    : null;
  const modelLabel = engine === CoworkAgentEngineValue.CodexApp
    ? 'Codex App Config'
    : [model.providerName, model.modelName || model.modelId]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(' · ');
  return {
    agentEngine: engine,
    engineLabel: getEngineSnapshotLabel(engine),
    providerKey: model.providerKey,
    providerName: model.providerName,
    modelId: model.modelId,
    modelName: model.modelName,
    modelLabel: modelLabel || 'Unknown model',
    configSource: model.configSource,
    permissionMode,
    permissionModeLabel: getClaudeCodePermissionLabel(permissionMode),
    capturedAt: Date.now(),
  };
};

const restoreRuntimeSnapshotProvider = (snapshot?: CoworkSessionRuntimeSnapshot | null): void => {
  if (!snapshot || snapshot.configSource !== ExternalAgentConfigSource.LocalCli || !snapshot.providerKey) {
    return;
  }
  const appType = getExternalProviderAppTypeForEngine(snapshot.agentEngine);
  if (!appType) return;
  try {
    getExternalAgentProviderStore().setCurrentProvider(appType, snapshot.providerKey);
  } catch (error) {
    console.warn('[CoworkRuntime] failed to restore locked local provider:', error);
  }
};

const getApiOverrideFromRuntimeSnapshot = (
  snapshot?: CoworkSessionRuntimeSnapshot | null,
): { modelId?: string | null; providerName?: string | null } | undefined => {
  if (!snapshot || snapshot.configSource === ExternalAgentConfigSource.LocalCli) {
    return undefined;
  }
  if (!snapshot.modelId && !snapshot.providerKey && !snapshot.providerName) {
    return undefined;
  }
  return {
    modelId: snapshot.modelId,
    providerName: snapshot.providerKey || snapshot.providerName,
  };
};

const configureRuntimeSnapshotProxy = (snapshot?: CoworkSessionRuntimeSnapshot | null): void => {
  const override = getApiOverrideFromRuntimeSnapshot(snapshot);
  if (!override) return;
  try {
    resolveCurrentApiConfig('local', override);
  } catch (error) {
    console.warn('[CoworkRuntime] failed to configure locked model proxy:', error);
  }
};

const prepareRuntimeSnapshotForTurn = (snapshot?: CoworkSessionRuntimeSnapshot | null): void => {
  restoreRuntimeSnapshotProvider(snapshot);
  configureRuntimeSnapshotProxy(snapshot);
};

const getRuntimeTelemetryTracker = (): RuntimeTelemetryTracker => {
  if (!runtimeTelemetryTracker) {
    runtimeTelemetryTracker = new RuntimeTelemetryTracker({
      store: getCoworkStore(),
      telemetryStore: getRuntimeTelemetryStore(),
      getModelSnapshot: resolveRuntimeModelSnapshot,
    });
  }
  return runtimeTelemetryTracker;
};

const getExternalAgentCliInstaller = (): ExternalAgentCliInstaller => {
  if (!externalAgentCliInstaller) {
    externalAgentCliInstaller = new ExternalAgentCliInstaller();
  }
  return externalAgentCliInstaller;
};

const getCodexAppManager = (): CodexAppManager => {
  if (!codexAppManager) {
    codexAppManager = new CodexAppManager();
  }
  return codexAppManager;
};

const getCodexAppServerClient = (): CodexAppServerClient => {
  if (!codexAppServerClient) {
    codexAppServerClient = new CodexAppServerClient(getCodexAppManager());
  }
  return codexAppServerClient;
};

const getCodexAppTaskSync = (): CodexAppTaskSync => {
  if (!codexAppTaskSync) {
    codexAppTaskSync = new CodexAppTaskSync({
      store: getCoworkStore(),
      client: getCodexAppServerClient(),
    });
  }
  return codexAppTaskSync;
};

const getDeepSeekTuiRuntimeManager = (): DeepSeekTuiRuntimeManager => {
  if (!deepSeekTuiRuntimeManager) {
    deepSeekTuiRuntimeManager = new DeepSeekTuiRuntimeManager();
  }
  return deepSeekTuiRuntimeManager;
};

const forwardExternalAgentCliInstallProgress = (progress: ExternalAgentCliInstallProgress): void => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (win.isDestroyed()) return;
    try {
      win.webContents.send(CoworkIpcChannel.AgentCliInstallProgress, progress);
    } catch (error) {
      console.error('[ExternalAgentCliInstaller] failed to forward install progress:', error);
    }
  });
};

const bindExternalAgentCliInstallerForwarder = (): void => {
  if (externalAgentCliInstallerForwarderBound) return;
  getExternalAgentCliInstaller().onProgress((progress) => {
    if (progress.appType === 'hermes') {
      getHermesEngineManager().reportInstallProgress(progress);
    }
    forwardExternalAgentCliInstallProgress(progress);
  });
  externalAgentCliInstallerForwarderBound = true;
};

let agentManager: AgentManager | null = null;
const getAgentManager = () => {
  if (!agentManager) {
    agentManager = new AgentManager(getCoworkStore());
  }
  return agentManager;
};

const resolveCoworkAgentEngine = (): CoworkAgentEngine => {
  const configured = getCoworkStore().getConfig().agentEngine;
  return isCoworkAgentEngine(configured) ? configured : CoworkAgentEngineValue.YdCowork;
};

const ensureSelectedEngineReadyForStartup = async (engine: CoworkAgentEngine): Promise<void> => {
  if (isOpenClawCoworkAgentEngine(engine)) {
    const status = await getOpenClawEngineManager().ensureReady();
    if (status.phase === 'error' || status.phase === 'not_installed') {
      throw new Error(status.message || 'OpenClaw CLI is not ready.');
    }
    return;
  }

  if (engine === CoworkAgentEngineValue.Hermes) {
    const status = await getHermesEngineManager().ensureReady();
    if (status.phase === 'error' || status.phase === 'not_installed') {
      throw new Error(status.message || 'Hermes Agent CLI is not ready.');
    }
  }
};

type FeishuIMAgentEngine =
  | typeof CoworkAgentEngineValue.OpenClaw
  | typeof CoworkAgentEngineValue.Hermes
  | typeof CoworkAgentEngineValue.ClaudeCode
  | typeof CoworkAgentEngineValue.Codex;

const resolveFeishuIMAgentEngine = (): FeishuIMAgentEngine | null => {
  const engine = resolveCoworkAgentEngine();
  if (
    engine === CoworkAgentEngineValue.OpenClaw
    || engine === CoworkAgentEngineValue.Hermes
    || engine === CoworkAgentEngineValue.ClaudeCode
    || engine === CoworkAgentEngineValue.Codex
  ) {
    return engine;
  }
  return null;
};

const resolveFeishuEngineKey = (): FeishuEngineKeyType => {
  const engine = resolveFeishuIMAgentEngine();
  if (engine === CoworkAgentEngineValue.Hermes) return FeishuEngineKey.Hermes;
  if (engine === CoworkAgentEngineValue.ClaudeCode) return FeishuEngineKey.ClaudeCode;
  if (engine === CoworkAgentEngineValue.Codex) return FeishuEngineKey.Codex;
  return FeishuEngineKey.OpenClaw;
};

const normalizeFeishuEngineKey = (value: unknown): FeishuEngineKeyType => (
  isFeishuEngineKey(value) ? value : resolveFeishuEngineKey()
);

const getFeishuManagementMode = (): FeishuManagementModeType => {
  try {
    const mode = getIMGatewayManager().getIMStore().getFeishuManagementMode();
    return isFeishuManagementMode(mode) ? mode : FeishuManagementMode.LocalOpenClaw;
  } catch {
    return FeishuManagementMode.LocalOpenClaw;
  }
};

const getFeishuRuntimeOwnership = (engineKey: FeishuEngineKeyType): FeishuRuntimeOwnershipType => {
  try {
    return getIMGatewayManager().getIMStore().getFeishuRuntimeOwnership(engineKey);
  } catch {
    if (engineKey === FeishuEngineKey.OpenClaw) {
      return FeishuRuntimeOwnership.LocalRuntime;
    }
    return FeishuRuntimeOwnership.WesightManaged;
  }
};

const isFeishuEngineManagedByWeSight = (engineKey: FeishuEngineKeyType): boolean => (
  getFeishuRuntimeOwnership(engineKey) === FeishuRuntimeOwnership.WesightManaged
);

const shouldWriteOpenClawFeishuChannel = (): boolean => (
  isFeishuEngineManagedByWeSight(FeishuEngineKey.OpenClaw)
);

const isFeishuManagedByOpenClawConfig = (): boolean => (
  isFeishuEngineManagedByWeSight(FeishuEngineKey.OpenClaw)
  && resolveFeishuIMAgentEngine() === CoworkAgentEngineValue.OpenClaw
);

const detectLocalOpenClawFeishu = (): OpenClawLocalFeishuDetection => {
  const detection = detectOpenClawLocalFeishuConfig();
  const localStatus = getOpenClawEngineManager().getLocalChannelStatus();
  return {
    ...detection,
    configured: detection.configured || Boolean(localStatus.feishuConfigured),
    enabled: detection.enabled || Boolean(localStatus.feishuRunning),
  };
};

const hasLocalOpenClawFeishuConfigured = (): boolean => {
  const detection = detectLocalOpenClawFeishu();
  return Boolean(detection.configured || detection.enabled);
};

const shouldSyncHermesIMSessions = (): boolean => {
  if (resolveFeishuIMAgentEngine() !== CoworkAgentEngineValue.Hermes) {
    return false;
  }
  try {
    const config = getIMGatewayManager().getConfig();
    return Boolean(config.feishu?.instances?.some(instance => (
      instance.enabled && instance.appId && instance.appSecret
    )));
  } catch {
    return false;
  }
};

const syncHermesIMSessionsToCowork = async (reason: string): Promise<void> => {
  if (hermesIMSessionSyncRunning) {
    return;
  }
  hermesIMSessionSyncRunning = true;
  try {
    if (!shouldSyncHermesIMSessions()) {
      return;
    }
    const coworkConfig = getCoworkStore().getConfig();
    const result = syncHermesIMSessions({
      coworkStore: getCoworkStore(),
      imStore: getIMGatewayManager().getIMStore(),
      cwd: coworkConfig.workingDirectory || os.homedir(),
      systemPrompt: coworkConfig.systemPrompt,
      executionMode: coworkConfig.executionMode,
      agentId: 'main',
    });

    const fingerprint = [
      result.importedSessions,
      result.importedMessages,
      result.latestUpdatedAt,
    ].join(':');
    if (result.changed && fingerprint !== hermesIMSessionSyncFingerprint) {
      hermesIMSessionSyncFingerprint = fingerprint;
      console.log(
        `[HermesIM] synced ${result.importedSessions} session(s) and ${result.importedMessages} message(s) (${reason})`,
      );
      broadcastCoworkSessionsChanged();
    }
  } catch (error) {
    console.warn('[HermesIM] session sync failed:', error);
  } finally {
    hermesIMSessionSyncRunning = false;
  }
};

const startHermesIMSessionSyncPolling = (): void => {
  if (hermesIMSessionSyncTimer) {
    return;
  }
  hermesIMSessionSyncTimer = setInterval(() => {
    void syncHermesIMSessionsToCowork('poll');
  }, HERMES_IM_SESSION_SYNC_INTERVAL_MS);
  void syncHermesIMSessionsToCowork('start');
};

const stopHermesIMSessionSyncPolling = (): void => {
  if (!hermesIMSessionSyncTimer) {
    return;
  }
  clearInterval(hermesIMSessionSyncTimer);
  hermesIMSessionSyncTimer = null;
};

const applyExternalAgentConfigSourceForEngine = (engine: CoworkAgentEngine): void => {
  const config = getCoworkStore().getConfig();
  if (engine === CoworkAgentEngineValue.OpenClaw) {
    // OpenClaw config is synced by ensureOpenClawRunningForCowork before each
    // task starts. Running another async sync here can trigger an internal
    // gateway reload between "ready" and chat.send.
    return;
  }
  if (engine === CoworkAgentEngineValue.ClaudeCode) {
    applyExternalAgentConfigForEngine(engine, config.claudeCodeConfigSource);
    return;
  }
  if (engine === CoworkAgentEngineValue.Codex) {
    applyExternalAgentConfigForEngine(engine, config.codexConfigSource);
    return;
  }
  if (engine === CoworkAgentEngineValue.Hermes) {
    getHermesConfigSync().sync('external-agent-config-source');
    return;
  }
  if (engine === CoworkAgentEngineValue.OpenCode) {
    applyExternalAgentConfigForEngine(engine, config.opencodeConfigSource);
    return;
  }
  if (engine === CoworkAgentEngineValue.QwenCode) {
    applyExternalAgentConfigForEngine(engine, config.qwenCodeConfigSource);
    return;
  }
  if (engine === CoworkAgentEngineValue.DeepSeekTui) {
    applyExternalAgentConfigForEngine(engine, config.deepseekTuiConfigSource);
  }
};

const ensureCoworkEngineReady = async (
  engine: CoworkAgentEngine,
): Promise<{ success: boolean; error?: string; engineStatus?: OpenClawEngineStatus | HermesEngineStatus }> => {
  if (isOpenClawCoworkAgentEngine(engine)) {
    const engineStatus = await ensureOpenClawRunningForCowork();
    if (engineStatus.phase !== 'running') {
      return {
        success: false,
        error: engineStatus.message || 'OpenClaw runtime is not ready.',
        engineStatus,
      };
    }
  }
  if (engine === CoworkAgentEngineValue.Hermes) {
    const engineStatus = await ensureHermesRunningForCowork();
    if (engineStatus.phase !== 'running') {
      return {
        success: false,
        error: engineStatus.message || 'Hermes runtime is not ready.',
        engineStatus,
      };
    }
  }
  if (engine === CoworkAgentEngineValue.CodexApp) {
    const cwd = getCoworkStore().getConfig().workingDirectory || os.homedir();
    const status = getCodexAppManager().getStatus();
    if (status.phase === 'error' || !status.cliFound || !status.appInstalled || !status.appServerSupported) {
      return {
        success: false,
        error: status.error || status.message || 'Codex App is not ready.',
      };
    }
    try {
      await getCodexAppServerClient().ensureConnected(cwd);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Codex App app-server is not ready.',
      };
    }
  }
  return { success: true };
};

const resolveAgentRuntimeEngine = (agentId?: string | null): CoworkAgentEngine => {
  const fallback = resolveCoworkAgentEngine();
  if (!agentId || agentId === 'main') {
    return fallback;
  }
  const agent = getAgentManager().getAgent(agentId);
  if (agent?.agentEngine && isCoworkAgentEngine(agent.agentEngine)) {
    return agent.agentEngine;
  }
  return fallback;
};

const isExternalAgentProviderAppType = (value: unknown): value is ExternalAgentProviderAppType => (
  value === 'claude'
  || value === 'codex'
  || value === 'hermes'
  || value === 'openclaw'
  || value === 'opencode'
  || value === 'grok'
  || value === 'qwen'
  || value === 'deepseek_tui'
);

const normalizeAgentEngineSnapshotAppTypes = (value: unknown): ExternalAgentProviderAppType[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.filter(isExternalAgentProviderAppType)));
};

const AGENT_ENGINE_SNAPSHOT_TTL_MS = 30_000;

interface AgentEngineSnapshotResponse {
  success: boolean;
  snapshot: ExternalAgentEnvironmentSnapshot & { codexApp: ReturnType<CodexAppManager['getStatus']> };
  refreshing: boolean;
  cachedAt?: number;
  error?: string;
}

let agentEngineSnapshotCache: AgentEngineSnapshotResponse['snapshot'] | null = null;
let agentEngineSnapshotCachedAt = 0;
let agentEngineSnapshotRefreshing = false;
let agentEngineSnapshotLastError: string | null = null;

const mergeCodexAppStatus = (
  snapshot: ExternalAgentEnvironmentSnapshot,
): AgentEngineSnapshotResponse['snapshot'] => ({
  ...snapshot,
  codexApp: getCodexAppManager().getStatus(),
});

const summarizeAgentEngineProbeReport = (report: ExternalAgentEnvironmentProbeReport): void => {
  console.debug(`[AgentEngineSnapshot] refreshed CLI environment snapshot in ${report.durationMs}ms.`);
  for (const metric of report.metrics) {
    if (metric.timedOut) {
      console.debug(`[AgentEngineSnapshot] ${metric.command} probe timed out after ${metric.resolveMs + (metric.versionMs ?? 0)}ms.`);
      continue;
    }
    if (metric.error && !metric.found) {
      console.debug(`[AgentEngineSnapshot] ${metric.command} was not found after ${metric.resolveMs}ms.`);
      continue;
    }
    console.debug(`[AgentEngineSnapshot] ${metric.command} probe completed in ${metric.resolveMs + (metric.versionMs ?? 0)}ms.`);
  };
};

const broadcastAgentEngineSnapshotChanged = (response: AgentEngineSnapshotResponse): void => {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.isDestroyed()) return;
    win.webContents.send(CoworkIpcChannel.AgentEnginesChanged, response);
  });
};

const refreshAgentEngineSnapshotInBackground = (forceRefresh = false): void => {
  const cacheFresh = agentEngineSnapshotCache
    && Date.now() - agentEngineSnapshotCachedAt < AGENT_ENGINE_SNAPSHOT_TTL_MS;
  if (!forceRefresh && cacheFresh) return;
  if (agentEngineSnapshotRefreshing) return;

  agentEngineSnapshotRefreshing = true;
  void getExternalAgentEnvironmentSnapshot()
    .then(({ snapshot, report }) => {
      agentEngineSnapshotCache = mergeCodexAppStatus(snapshot);
      agentEngineSnapshotCachedAt = Date.now();
      agentEngineSnapshotLastError = null;
      summarizeAgentEngineProbeReport(report);
      broadcastAgentEngineSnapshotChanged({
        success: true,
        snapshot: agentEngineSnapshotCache,
        refreshing: false,
        cachedAt: agentEngineSnapshotCachedAt,
      });
    })
    .catch((error) => {
      agentEngineSnapshotLastError = error instanceof Error ? error.message : 'Failed to refresh agent engine snapshot';
      console.warn('[AgentEngineSnapshot] failed to refresh CLI environment snapshot:', error);
      const snapshot = agentEngineSnapshotCache ?? mergeCodexAppStatus(getPlaceholderExternalAgentEnvironmentSnapshot());
      broadcastAgentEngineSnapshotChanged({
        success: true,
        snapshot,
        refreshing: false,
        cachedAt: agentEngineSnapshotCache ? agentEngineSnapshotCachedAt : undefined,
        error: agentEngineSnapshotLastError,
      });
    })
    .finally(() => {
      agentEngineSnapshotRefreshing = false;
    });
};

const getCachedAgentEngineSnapshot = (options: { forceRefresh?: boolean } = {}): AgentEngineSnapshotResponse => {
  const cacheFresh = agentEngineSnapshotCache
    && Date.now() - agentEngineSnapshotCachedAt < AGENT_ENGINE_SNAPSHOT_TTL_MS;
  const shouldRefresh = options.forceRefresh === true || !cacheFresh;
  if (shouldRefresh) {
    refreshAgentEngineSnapshotInBackground(options.forceRefresh === true);
  }
  const snapshot = agentEngineSnapshotCache ?? mergeCodexAppStatus(getPlaceholderExternalAgentEnvironmentSnapshot());
  return {
    success: true,
    snapshot,
    refreshing: agentEngineSnapshotRefreshing || !agentEngineSnapshotCache,
    cachedAt: agentEngineSnapshotCache ? agentEngineSnapshotCachedAt : undefined,
    error: agentEngineSnapshotLastError ?? undefined,
  };
};

const getFilteredAgentEngineSnapshot = async (
  appTypes: ExternalAgentProviderAppType[],
): Promise<AgentEngineSnapshotResponse> => {
  const { snapshot, report } = await getExternalAgentEnvironmentSnapshot({ appTypes });
  const mergedSnapshot = mergeCodexAppStatus(snapshot);
  summarizeAgentEngineProbeReport(report);
  return {
    success: true,
    snapshot: mergedSnapshot,
    refreshing: false,
    cachedAt: Date.now(),
  };
};

const getOpenClawConfigSync = (): OpenClawConfigSync => {
  if (!openClawConfigSync) {
    openClawConfigSync = new OpenClawConfigSync({
      engineManager: getOpenClawEngineManager(),
      getCoworkConfig: () => getCoworkStore().getConfig(),
      isEnterprise: () => !!getStore().get('enterprise_config'),
      getSkillsList: () => getSkillManager().listSkills().map(s => ({ id: s.id, enabled: s.enabled })),
      getTelegramOpenClawConfig: () => {
        try {
          return getIMGatewayManager()?.getConfig()?.telegram ?? null;
        } catch {
          return null;
        }
      },
      getDingTalkInstances: () => {
        try {
          return getIMGatewayManager().getIMStore().getDingTalkInstances();
        } catch {
          return [];
        }
      },
      getFeishuInstances: () => {
        try {
          return getIMGatewayManager().getIMStore().getFeishuInstances(FeishuEngineKey.OpenClaw);
        } catch {
          return [];
        }
      },
      isFeishuManagedByOpenClaw: isFeishuManagedByOpenClawConfig,
      shouldWriteFeishuChannel: shouldWriteOpenClawFeishuChannel,
      getQQInstances: () => {
        try {
          return getIMGatewayManager().getIMStore().getQQInstances();
        } catch {
          return [];
        }
      },
      getWecomConfig: () => {
        try {
          return getIMGatewayManager().getConfig().wecom;
        } catch {
          return null;
        }
      },
      getPopoConfig: () => {
        try {
          return getIMGatewayManager().getConfig().popo;
          } catch {
          return null;
        }
      },
      getNimConfig: () => {
        try {
          return getIMGatewayManager().getConfig().nim;
        } catch {
          return null;
        }
      },
      getNeteaseBeeChanConfig: () => {
        try {
          return getIMGatewayManager().getConfig()['netease-bee'];
        } catch {
          return null;
        }
      },
      getWeixinConfig: () => {
        try {
          return getIMGatewayManager().getConfig().weixin;
        } catch {
          return null;
        }
      },
      getIMSettings: () => {
        try {
          return getIMGatewayManager().getConfig().settings;
        } catch {
          return null;
        }
      },
      getDiscordOpenClawConfig: () => {
        try {
          return getIMGatewayManager()?.getConfig()?.discord ?? null;
        } catch {
          return null;
        }
      },
      getMcpBridgeConfig: (): McpBridgeConfig | null => {
        if (!mcpBridgeServer?.callbackUrl || !mcpBridgeServer?.askUserCallbackUrl || !mcpBridgeSecret) {
          return null;
        }
        return {
          callbackUrl: mcpBridgeServer.callbackUrl,
          askUserCallbackUrl: mcpBridgeServer.askUserCallbackUrl,
          secret: mcpBridgeSecret,
          tools: mcpServerManager?.toolManifest ?? [],
        };
      },
      getAgents: () => getCoworkStore().listAgents(),
    });
  }
  return openClawConfigSync;
};

// Deferred gateway restart: when a config change requires a gateway restart
// but active cowork sessions or cron jobs exist, we defer the restart until
// all workloads complete.  A polling interval checks periodically; a hard
// timeout ensures the restart eventually happens even if a session hangs.
let deferredRestartTimer: ReturnType<typeof setInterval> | null = null;
let deferredRestartTimeout: ReturnType<typeof setTimeout> | null = null;
const DEFERRED_RESTART_POLL_MS = 3_000;
const DEFERRED_RESTART_MAX_WAIT_MS = 5 * 60_000; // 5 minutes hard cap

const hasActiveGatewayWorkloads = (): boolean => {
  if (openClawRuntimeAdapter?.hasActiveSessions()) return true;
  try {
    if (getCronJobService()?.hasRunningJobs()) return true;
  } catch {
    // CronJobService may not be initialized yet.
  }
  return false;
};

const clearDeferredRestart = () => {
  if (deferredRestartTimer) { clearInterval(deferredRestartTimer); deferredRestartTimer = null; }
  if (deferredRestartTimeout) { clearTimeout(deferredRestartTimeout); deferredRestartTimeout = null; }
};

const executeDeferredGatewayRestart = async (reason: string) => {
  clearDeferredRestart();
  console.log(`[OpenClaw] executeDeferredGatewayRestart: performing deferred restart (reason: ${reason})`);
  await syncOpenClawConfig({ reason: `deferred:${reason}` });
};

const scheduleDeferredGatewayRestart = (reason: string) => {
  // If already scheduled, the latest config is already on disk — just let
  // the existing timer handle the restart.
  if (deferredRestartTimer) {
    console.log(`[OpenClaw] scheduleDeferredGatewayRestart: already scheduled, skipping (reason: ${reason})`);
    return;
  }

  deferredRestartTimer = setInterval(() => {
    if (!hasActiveGatewayWorkloads()) {
      void executeDeferredGatewayRestart(reason);
    }
  }, DEFERRED_RESTART_POLL_MS);

  // Hard timeout: restart anyway after max wait to avoid config drift.
  deferredRestartTimeout = setTimeout(() => {
    console.warn(`[OpenClaw] scheduleDeferredGatewayRestart: max wait exceeded, forcing restart (reason: ${reason})`);
    void executeDeferredGatewayRestart(reason);
  }, DEFERRED_RESTART_MAX_WAIT_MS);
};

const syncOpenClawConfig = async (
  options: { reason: string; restartGatewayIfRunning?: boolean } = { reason: 'unknown' },
): Promise<{ success: boolean; changed: boolean; status?: OpenClawEngineStatus; error?: string }> => {
  if (process.env.WESIGHT_OPENCLAW_VERBOSE_LOGS === '1') {
    console.debug(`[OpenClaw] syncing config for ${options.reason}; gateway restart ${options.restartGatewayIfRunning ? 'enabled' : 'skipped'}`);
  }
  // Always write openclaw.json immediately. OpenClaw's built-in file-watcher
  // will detect the change and gracefully reload (waiting for active tasks to
  // complete before restarting, up to a 30s drain timeout).  Previous versions
  // deferred the file write when active workloads existed, but that caused
  // stale config (e.g. model switches not taking effect for new sessions).

  const syncResult = getOpenClawConfigSync().sync(options.reason);
  if (!syncResult.ok) {
    const status = getOpenClawEngineManager().setExternalError(
      `OpenClaw config sync failed: ${syncResult.error || 'unknown error'}`,
    );
    return {
      success: false,
      changed: false,
      status,
      error: syncResult.error,
    };
  }

  // Update secret env vars so the gateway process receives the latest
  // plaintext credentials via environment variables (openclaw.json only
  // contains ${VAR} placeholders, never plaintext secrets).
  const manager = getOpenClawEngineManager();
  const nextSecretEnvVars = getOpenClawConfigSync().collectSecretEnvVars();
  const prevSecretEnvVars = manager.getSecretEnvVars();
  const secretEnvVarsChanged = JSON.stringify(nextSecretEnvVars) !== JSON.stringify(prevSecretEnvVars);
  const shouldUseManagedGateway = getCoworkStore().getConfig().openclawConfigSource === ExternalAgentConfigSource.WesightModel;
  manager.setSecretEnvVars(nextSecretEnvVars);
  manager.setRequireManagedGateway(shouldUseManagedGateway);

  if (syncResult.skipped) {
    return {
      success: true,
      changed: false,
      status: manager.getStatus(),
    };
  }

  // After every successful config sync, merge enterprise openclaw.json
  // fields into the generated runtime config. Enterprise values win.
  try {
    mergeEnterpriseOpenclawConfig(manager.getConfigPath());
  } catch { /* non-critical */ }

  // When secret env vars change, the running gateway must be restarted even if
  // the caller didn't request it — the ${VAR} placeholders in openclaw.json
  // resolve from the process environment which is fixed at spawn time.
  const status = manager.getStatus();
  const needsManagedModeRestart = shouldUseManagedGateway
    && status.phase === 'running'
    && status.gatewayMode !== 'managed';
  const needsHardRestart = secretEnvVarsChanged
    || needsManagedModeRestart
    || (syncResult.changed && options.restartGatewayIfRunning);

  if (!needsHardRestart) {
    // Config file was written; OpenClaw's file-watcher will handle the reload.
    return {
      success: true,
      changed: syncResult.changed,
    };
  }

  if (status.phase !== 'running') {
    return {
      success: true,
      changed: true,
      status,
    };
  }

  // Hard restart required (e.g. secret env vars changed) but active workloads
  // exist — defer the restart to avoid killing in-flight sessions.
  if (hasActiveGatewayWorkloads()) {
    console.log(`[OpenClaw] syncOpenClawConfig: deferring hard restart because active workloads exist (reason: ${options.reason})`);
    scheduleDeferredGatewayRestart(options.reason);
    return {
      success: true,
      changed: true,
      status,
    };
  }

  // Tear down the runtime adapter's WebSocket client BEFORE killing the gateway process.
  // This prevents a race where the old client's async `onClose` fires after a new client
  // has already been created, destroying the new connection.
  if (openClawRuntimeAdapter) {
    console.log(`[OpenClaw] syncOpenClawConfig: pre-emptively disconnecting runtime adapter before gateway restart (reason: ${options.reason})`);
    openClawRuntimeAdapter.disconnectGatewayClient();
  }

  await manager.stopGateway();
  const restarted = await manager.startGateway();
  if (restarted.phase !== 'running') {
    return {
      success: false,
      changed: true,
      status: restarted,
      error: restarted.message || 'Failed to restart OpenClaw gateway after config sync.',
    };
  }
  return {
    success: true,
    changed: true,
    status: restarted,
  };
};

const getCoworkRunner = () => {
  if (!coworkRunner) {
    coworkRunner = new CoworkRunner(getCoworkStore());

    // Provide MCP server configuration to the runner
    coworkRunner.setMcpServerProvider(() => {
      return getMcpStore().getEnabledServers();
    });
  }
  return coworkRunner;
};

const bindCoworkRuntimeForwarder = (): void => {
  if (coworkRuntimeForwarderBound) return;
  const runtime = getCoworkEngineRouter();

  runtime.on('message', (sessionId: string, message: CoworkMessage) => {
    startCoworkFileActivityForSession(sessionId);
    updateDesktopPetTaskSnapshot(sessionId, getDesktopPetStatusForMessage(message));
    try {
      const session = getCoworkStore().getSessionMeta(sessionId);
      if (session?.cwd) {
        getCoworkFileActivityTracker().handleToolMessage(sessionId, session.cwd, message);
      }
    } catch {
      // File activity is best-effort and must not block message rendering.
    }
    const safeMessage = sanitizeCoworkMessageForIpc(message);
    const payload = { sessionId, message: safeMessage };
    sendCoworkStreamPayload(sessionId, CoworkIpcChannel.StreamMessage, 'message', payload);
  });

  runtime.on('messageUpdate', (sessionId: string, messageId: string, content: string) => {
    startCoworkFileActivityForSession(sessionId);
    updateDesktopPetTaskSnapshot(sessionId, DesktopPetTaskStatus.Replying);
    const safeContent = truncateIpcString(content, IPC_UPDATE_CONTENT_MAX_CHARS);
    messageUpdateCoalescer.append(sessionId, messageId, safeContent);
  });

  runtime.on('permissionRequest', (sessionId: string, request: any) => {
    updateDesktopPetTaskSnapshot(sessionId, DesktopPetTaskStatus.Permission);
    if (runtime.getSessionConfirmationMode(sessionId) === 'text') {
      return;
    }
    const safeRequest = sanitizePermissionRequestForIpc(request);
    const payload = { sessionId, request: safeRequest };
    sendCoworkStreamPayload(sessionId, CoworkIpcChannel.StreamPermission, 'permission', payload, { fallbackToAll: true });
  });

  runtime.on('complete', (sessionId: string, claudeSessionId: string | null) => {
    messageUpdateCoalescer.flushSession(sessionId, 'final');
    messageUpdateCoalescer.clearSession(sessionId);
    getCoworkFileActivityTracker().stopSession(sessionId, 1200);
    updateDesktopPetTaskSnapshot(sessionId, DesktopPetTaskStatus.Completed);
    const payload = { sessionId, claudeSessionId };
    sendCoworkStreamPayload(sessionId, CoworkIpcChannel.StreamComplete, 'complete', payload, { fallbackToAll: true });
    // If session used a server model, notify renderer to refresh quota
    try {
      const apiConfig = resolveCurrentApiConfig();
      if (apiConfig.providerMetadata?.providerName === 'wesight-server') {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
          if (win.isDestroyed()) return;
          win.webContents.send('auth:quotaChanged');
        });
      }
    } catch {
      // ignore
    }
  });

  runtime.on('error', (sessionId: string, error: string) => {
    messageUpdateCoalescer.flushSession(sessionId, 'final');
    messageUpdateCoalescer.clearSession(sessionId);
    getCoworkFileActivityTracker().stopSession(sessionId, 1200);
    updateDesktopPetTaskSnapshot(sessionId, DesktopPetTaskStatus.Error);
    // Mark session as error in store so the .catch() fallback can detect duplicates.
    try { getCoworkStore().updateSession(sessionId, { status: 'error' }); } catch { /* ignore */ }
    const payload = { sessionId, error };
    sendCoworkStreamPayload(sessionId, CoworkIpcChannel.StreamError, 'error', payload, { fallbackToAll: true });
  });

  runtime.on('sessionStopped', (sessionId: string) => {
    messageUpdateCoalescer.flushSession(sessionId, 'final');
    messageUpdateCoalescer.clearSession(sessionId);
    getCoworkFileActivityTracker().stopSession(sessionId);
    updateDesktopPetTaskSnapshot(sessionId, DesktopPetTaskStatus.Stopped);
  });

  coworkRuntimeForwarderBound = true;
};

const broadcastCoworkMessage = (sessionId: string, message: CoworkMessage): void => {
  const safeMessage = sanitizeCoworkMessageForIpc(message);
  sendCoworkStreamPayload(sessionId, CoworkIpcChannel.StreamMessage, 'message', { sessionId, message: safeMessage });
  broadcastCoworkSessionsChanged();
};

const broadcastCoworkComplete = (sessionId: string): void => {
  sendCoworkStreamPayload(
    sessionId,
    CoworkIpcChannel.StreamComplete,
    'complete',
    { sessionId, claudeSessionId: null },
    { fallbackToAll: true },
  );
  broadcastCoworkSessionsChanged();
};

const broadcastCoworkError = (sessionId: string, error: string): void => {
  sendCoworkStreamPayload(
    sessionId,
    CoworkIpcChannel.StreamError,
    'error',
    { sessionId, error },
    { fallbackToAll: true },
  );
  broadcastCoworkSessionsChanged();
};

const getCoworkEngineRouter = () => {
  if (!coworkEngineRouter) {
    if (!claudeRuntimeAdapter) {
      claudeRuntimeAdapter = new ClaudeRuntimeAdapter(getCoworkRunner());
    }
    if (!openClawRuntimeAdapter) {
      openClawRuntimeAdapter = new OpenClawRuntimeAdapter(getCoworkStore(), getOpenClawEngineManager());
      // Wire up channel session sync for IM conversations via OpenClaw
      try {
        const imManager = getIMGatewayManager();
        const imStore = imManager.getIMStore();
        if (imStore) {
          const channelSessionSync = new OpenClawChannelSessionSync({
            coworkStore: getCoworkStore(),
            imStore,
            getDefaultCwd: () => getCoworkStore().getConfig().workingDirectory || os.homedir(),
            resolveJobName: (jobId) => getCronJobService().getJobNameSync(jobId),
          });
          openClawRuntimeAdapter.setChannelSessionSync(channelSessionSync);
        }
      } catch (error) {
        console.warn('[Main] Failed to set up channel session sync:', error);
      }
    }
    if (!claudeCodeRuntimeAdapter) {
      claudeCodeRuntimeAdapter = new ExternalCliRuntimeAdapter({
        engine: CoworkAgentEngineValue.ClaudeCode,
        store: getCoworkStore(),
        getCurrentProvider: (appType) => getExternalAgentProviderStore().getCurrentProvider(appType),
      });
    }
    if (!codexRuntimeAdapter) {
      codexRuntimeAdapter = new ExternalCliRuntimeAdapter({
        engine: CoworkAgentEngineValue.Codex,
        store: getCoworkStore(),
        getCurrentProvider: (appType) => getExternalAgentProviderStore().getCurrentProvider(appType),
      });
    }
    if (!codexAppRuntimeAdapter) {
      codexAppRuntimeAdapter = new CodexAppRuntimeAdapter({
        store: getCoworkStore(),
        manager: getCodexAppManager(),
        client: getCodexAppServerClient(),
      });
    }
    if (!openCodeRuntimeAdapter) {
      openCodeRuntimeAdapter = new ExternalCliRuntimeAdapter({
        engine: CoworkAgentEngineValue.OpenCode,
        store: getCoworkStore(),
        getCurrentProvider: (appType) => getExternalAgentProviderStore().getCurrentProvider(appType),
      });
    }
    if (!grokBuildRuntimeAdapter) {
      grokBuildRuntimeAdapter = new ExternalCliRuntimeAdapter({
        engine: CoworkAgentEngineValue.GrokBuild,
        store: getCoworkStore(),
        getCurrentProvider: (appType) => getExternalAgentProviderStore().getCurrentProvider(appType),
      });
    }
    if (!qwenCodeRuntimeAdapter) {
      qwenCodeRuntimeAdapter = new ExternalCliRuntimeAdapter({
        engine: CoworkAgentEngineValue.QwenCode,
        store: getCoworkStore(),
        getCurrentProvider: (appType) => getExternalAgentProviderStore().getCurrentProvider(appType),
      });
    }
    if (!deepSeekTuiRuntimeAdapter) {
      deepSeekTuiRuntimeAdapter = new DeepSeekTuiRuntimeAdapter({
        store: getCoworkStore(),
        runtimeManager: getDeepSeekTuiRuntimeManager(),
        getCurrentProvider: (appType) => getExternalAgentProviderStore().getCurrentProvider(appType),
      });
    }
    if (!hermesRuntimeAdapter) {
      hermesRuntimeAdapter = new HermesRuntimeAdapter({
        store: getCoworkStore(),
        engineManager: getHermesEngineManager(),
        ensureRunning: ensureHermesRunningForCowork,
      });
    }
    coworkEngineRouter = new CoworkEngineRouter({
      getCurrentEngine: resolveCoworkAgentEngine,
      openclawRuntime: openClawRuntimeAdapter,
      hermesRuntime: hermesRuntimeAdapter,
      claudeRuntime: claudeRuntimeAdapter,
      claudeCodeRuntime: claudeCodeRuntimeAdapter,
      codexRuntime: codexRuntimeAdapter,
      codexAppRuntime: codexAppRuntimeAdapter,
      openCodeRuntime: openCodeRuntimeAdapter,
      grokBuildRuntime: grokBuildRuntimeAdapter,
      qwenCodeRuntime: qwenCodeRuntimeAdapter,
      deepSeekTuiRuntime: deepSeekTuiRuntimeAdapter,
      telemetryTracker: getRuntimeTelemetryTracker(),
    });
  }
  return coworkEngineRouter;
};

const getAgentTeamRunner = (): AgentTeamRunner => {
  if (!agentTeamRunner) {
    agentTeamRunner = new AgentTeamRunner({
      coworkStore: getCoworkStore(),
      agentManager: getAgentManager(),
      runtime: getCoworkEngineRouter(),
      resolveFallbackEngine: resolveCoworkAgentEngine,
      ensureEngineReady: ensureCoworkEngineReady,
      applyEngineConfigSource: applyExternalAgentConfigSourceForEngine,
      resolveRuntimeSnapshot: resolveSessionRuntimeSnapshot,
      prepareRuntimeSnapshot: prepareRuntimeSnapshotForTurn,
      mergeSystemPrompt: mergeCoworkSystemPrompt,
      broadcastMessage: broadcastCoworkMessage,
      broadcastComplete: broadcastCoworkComplete,
      broadcastError: broadcastCoworkError,
      startFileActivity: (sessionId, cwd) => getCoworkFileActivityTracker().startSession(sessionId, cwd),
    });
  }
  return agentTeamRunner;
};

const getSkillManager = () => {
  if (!skillManager) {
    skillManager = new SkillManager(getStore);
  }
  return skillManager;
};

const getMcpStore = () => {
  if (!mcpStore) {
    const sqliteStore = getStore();
    mcpStore = new McpStore(sqliteStore.getDatabase());
  }
  return mcpStore;
};

/**
 * Start the MCP Bridge: server manager + HTTP callback.
 * Called during OpenClaw bootstrap before config sync.
 * Returns the bridge config to be written into openclaw.json.
 *
 * The HTTP callback server is always started (even without MCP servers)
 * because the AskUserQuestion plugin also uses it for user confirmation dialogs.
 */
const startMcpBridge = (): Promise<McpBridgeConfig | null> => {
  // Deduplicate concurrent calls — only one initialization at a time
  if (mcpBridgeStartPromise) {
    return mcpBridgeStartPromise;
  }
  const mcpStartedAt = nowMs();
  mcpBridgeStartPromise = (async (): Promise<McpBridgeConfig | null> => {
  try {
    console.log('[McpBridge] startMcpBridge called');

    // Generate a per-session secret for bridge auth
    if (!mcpBridgeSecret) {
      const crypto = await import('crypto');
      mcpBridgeSecret = crypto.randomUUID();
    }

    // Discover MCP tools (may be empty if no servers configured)
    const enabledServers = getMcpStore().getEnabledServers();
    console.log(`[McpBridge] enabledServers: ${enabledServers.length} (${enabledServers.map(s => s.name).join(', ')})`);

    let tools: Awaited<ReturnType<McpServerManager['startServers']>> = [];
    if (enabledServers.length > 0) {
      if (!mcpServerManager) {
        mcpServerManager = new McpServerManager();
      }
      console.log('[McpBridge] starting MCP servers...');
      tools = await mcpServerManager.startServers(enabledServers);
      console.log(`[McpBridge] tools discovered: ${tools.length}`);
    }

    // Always start HTTP callback server (serves both MCP Bridge and AskUserQuestion)
    if (!mcpServerManager) {
      mcpServerManager = new McpServerManager();
    }
    if (!mcpBridgeServer) {
      mcpBridgeServer = new McpBridgeServer(mcpServerManager, mcpBridgeSecret);
    }
    if (!mcpBridgeServer.port) {
      console.log('[McpBridge] starting HTTP callback server...');
      await mcpBridgeServer.start();
    }

    // Register AskUserQuestion callback — shows a permission modal when the
    // ask-user-question OpenClaw plugin sends a request via HTTP.
    mcpBridgeServer.onAskUser((request) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((win) => {
        if (win.isDestroyed()) return;
        try {
          win.webContents.send(CoworkIpcChannel.StreamPermission, {
            sessionId: '__askuser__',
            request: {
              requestId: request.requestId,
              toolName: 'AskUserQuestion',
              toolInput: { questions: request.questions },
            },
          });
        } catch (error) {
          console.error('[AskUser] failed to send permission request to window:', error);
        }
      });
    });

    // Dismiss the AskUser modal when timeout or resolved from server side.
    // Simulate a deny response to remove it from the renderer's pending queue.
    mcpBridgeServer.onAskUserDismiss((requestId) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((win) => {
        if (win.isDestroyed()) return;
        try {
          win.webContents.send(CoworkIpcChannel.StreamPermissionDismiss, { requestId });
        } catch {
          // ignore
        }
      });
    });

    const callbackUrl = mcpBridgeServer.callbackUrl;
    const askUserCallbackUrl = mcpBridgeServer.askUserCallbackUrl;
    if (!callbackUrl || !askUserCallbackUrl) {
      console.error('[McpBridge] failed to get callback URL');
      return null;
    }

    console.log(`[McpBridge] started: ${tools.length} MCP tools, callback=${callbackUrl}`);
    return { callbackUrl, askUserCallbackUrl, secret: mcpBridgeSecret, tools };
  } catch (error) {
    console.error('[McpBridge] startup error:', error instanceof Error ? error.stack || error.message : String(error));
    return null;
  }
  })().finally(() => {
    markTiming('mcp_ready_ms', mcpStartedAt);
    mcpBridgeStartPromise = null;
  });
  return mcpBridgeStartPromise;
};

/**
 * Stop the MCP Bridge: server manager + HTTP callback.
 */
const stopMcpBridge = async (): Promise<void> => {
  try {
    if (mcpServerManager) {
      await mcpServerManager.stopServers();
    }
    if (mcpBridgeServer) {
      await mcpBridgeServer.stop();
    }
  } catch (error) {
    console.error('[McpBridge] shutdown error:', error instanceof Error ? error.message : String(error));
  }
};

/**
 * Refresh the MCP Bridge after server config changes:
 * stop existing MCP servers → restart with new config → sync openclaw.json → restart gateway.
 * Returns a summary for the renderer to display.
 */
let mcpBridgeRefreshPromise: Promise<{ tools: number; error?: string }> | null = null;

const broadcastMcpBridgeSync = (channel: string, data?: Record<string, unknown>): void => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (win.isDestroyed()) return;
    try {
      win.webContents.send(channel, data ?? {});
    } catch (error) {
      console.error(`[McpBridge] Failed to broadcast ${channel}:`, error);
    }
  });
};

const refreshMcpBridge = (): Promise<{ tools: number; error?: string }> => {
  if (mcpBridgeRefreshPromise) {
    return mcpBridgeRefreshPromise;
  }
  mcpBridgeRefreshPromise = (async () => {
    try {
      console.log('[McpBridge] refreshing after config change...');
      broadcastMcpBridgeSync('mcp:bridge:syncStart');

      // 1. Stop existing MCP servers (but keep HTTP callback server alive — port stays the same)
      if (mcpServerManager) {
        await mcpServerManager.stopServers();
      }

      // 2. Re-discover tools from the new set of enabled servers
      const bridgeConfig = await startMcpBridge();
      const toolCount = bridgeConfig?.tools.length ?? 0;
      console.log(`[McpBridge] refresh: ${toolCount} tools discovered`);

      // 3. Sync openclaw.json — OpenClaw's file watcher will hot-reload;
      // hard restart only happens when secret env vars change.
      const syncResult = await syncOpenClawConfig({
        reason: 'mcp-server-changed',
      });
      if (!syncResult.success) {
        console.error('[McpBridge] refresh: config sync failed:', syncResult.error);
        return { tools: toolCount, error: syncResult.error };
      }

      console.log(`[McpBridge] refresh complete: ${toolCount} tools, gateway restarted=${syncResult.changed}`);
      return { tools: toolCount };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[McpBridge] refresh error:', msg);
      return { tools: 0, error: msg };
    }
  })().then((result) => {
    broadcastMcpBridgeSync('mcp:bridge:syncDone', { tools: result.tools, error: result.error });
    return result;
  }).catch((err) => {
    const error = err instanceof Error ? err.message : String(err);
    broadcastMcpBridgeSync('mcp:bridge:syncDone', { tools: 0, error });
    return { tools: 0, error };
  }).finally(() => {
    mcpBridgeRefreshPromise = null;
  });
  return mcpBridgeRefreshPromise;
};

const getIMGatewayManager = () => {
  if (!imGatewayManager) {
    const sqliteStore = getStore();

    // Get Cowork dependencies for IM Cowork mode
    const runtime = getCoworkEngineRouter();
    const store = getCoworkStore();

    imGatewayManager = new IMGatewayManager(
      sqliteStore.getDatabase(),
      {
        coworkRuntime: runtime,
        coworkStore: store,
        ensureCoworkReady: async () => {
          const engine = resolveCoworkAgentEngine();
          if (isOpenClawCoworkAgentEngine(engine)) {
            const status = await ensureOpenClawRunningForCowork();
            if (status.phase !== 'running') {
              throw new Error(status.message || 'AI engine is initializing. Please try again in a moment.');
            }
            return;
          }
          if (engine !== CoworkAgentEngineValue.Hermes) {
            return;
          }
          const status = await ensureHermesRunningForCowork();
          if (status.phase !== 'running') {
            throw new Error(status.message || 'AI engine is initializing. Please try again in a moment.');
          }
        },
        isOpenClawEngine: () => isOpenClawCoworkAgentEngine(resolveCoworkAgentEngine()),
        getFeishuAgentEngine: resolveFeishuIMAgentEngine,
        getFeishuManagementMode,
        getFeishuRuntimeOwnership,
        getFeishuRuntimeOwnershipStatus,
        detectOpenClawLocalFeishu: detectLocalOpenClawFeishu,
        syncOpenClawConfig: async () => {
          await syncOpenClawConfig({
            reason: 'im-gateway-start',
          });
        },
        syncHermesConfig: async () => {
          const syncResult = getHermesConfigSync().sync('im-gateway-start');
          if (!syncResult.success) {
            throw new Error(syncResult.error || 'Hermes Agent config sync failed.');
          }
        },
        ensureOpenClawGatewayConnected: async () => {
          if (openClawRuntimeAdapter) {
            await openClawRuntimeAdapter.connectGatewayIfNeeded();
          }
        },
        hasLocalOpenClawFeishuEnabled: hasLocalOpenClawFeishuConfigured,
        ensureHermesGatewayReady: async () => {
          const status = await ensureHermesRunningForCowork();
          if (status.phase !== 'running') {
            throw new Error(status.message || 'Hermes Agent gateway is not running.');
          }
          startHermesIMSessionSyncPolling();
          void syncHermesIMSessionsToCowork('gateway-ready');
        },
        getOpenClawGatewayClient: () => openClawRuntimeAdapter?.getGatewayClient() ?? null,
        ensureOpenClawGatewayReady: async () => {
          if (!openClawRuntimeAdapter) {
            throw new Error('OpenClaw runtime adapter not initialized.');
          }
          await openClawRuntimeAdapter.ensureReady();
          await openClawRuntimeAdapter.connectGatewayIfNeeded();
        },
        getOpenClawSessionKeysForCoworkSession: (sessionId: string) => {
          return openClawRuntimeAdapter?.getSessionKeysForSession(sessionId) ?? [];
        },
        runTeamSession: async ({ teamId, parentSessionId, prompt, runtimeSource }) => {
          await getAgentTeamRunner().run({
            teamId,
            parentSessionId,
            prompt,
            runtimeSource,
          });
        },
        createScheduledTask: async ({ sessionId, message, request }) => {
          // if (message.platform === 'dingtalk') {
          //   await getIMGatewayManager().primeConversationReplyRoute(
          //     message.platform,
          //     message.conversationId,
          //     sessionId,
          //   );
          // }
          const channelName = PlatformRegistry.channelOf(message.platform);
          const hasChannel = !!(channelName && message.conversationId);
          // Strip IM subtype prefix (e.g. "direct:ou_xxx" -> "ou_xxx")
          let deliveryTo = message.conversationId;
          if (hasChannel && deliveryTo) {
            const colonIdx = deliveryTo.indexOf(':');
            if (colonIdx > 0) {
              deliveryTo = deliveryTo.slice(colonIdx + 1);
            }
          }
          const task = await getCronJobService().addJob({
            name: request.taskName,
            description: '',
            enabled: true,
            schedule: {
              kind: 'at',
              at: request.scheduleAt,
            },
            sessionTarget: hasChannel ? 'isolated' : 'main',
            wakeMode: 'now',
            payload: hasChannel
              ? { kind: 'agentTurn', message: request.payloadText }
              : { kind: 'systemEvent', text: request.payloadText },
            delivery: {
              mode: hasChannel ? 'announce' : 'none',
              ...(channelName ? { channel: channelName } : {}),
              ...(hasChannel ? { to: deliveryTo } : message.conversationId ? { to: message.conversationId } : {}),
            },
            agentId: DEFAULT_MANAGED_AGENT_ID,
            ...(hasChannel ? {} : { sessionKey: buildManagedSessionKey(sessionId, DEFAULT_MANAGED_AGENT_ID) }),
          });
          return {
            id: task.id,
            name: task.name,
            agentId: task.agentId,
            sessionKey: task.sessionKey,
            payloadText: task.payload.kind === 'systemEvent'
              ? task.payload.text
              : task.payload.kind === 'agentTurn'
                ? task.payload.message
                : '',
            scheduleAt: task.schedule.kind === 'at' ? task.schedule.at : request.scheduleAt,
          };
        },
      }
    );

    // Initialize with LLM config provider
    imGatewayManager.initialize({
      getLLMConfig: async () => {
        const appConfig = sqliteStore.get<any>('app_config');
        if (!appConfig) return null;

        // Find first enabled provider
        const providers = appConfig.providers || {};
        for (const [providerName, providerConfig] of Object.entries(providers) as [string, any][]) {
          if (providerConfig.enabled && providerConfig.apiKey) {
            const model = providerConfig.models?.[0]?.id;
            return {
              apiKey: providerConfig.apiKey,
              baseUrl: providerConfig.baseUrl,
              model: model,
              provider: providerName,
            };
          }
        }

        // Fallback to legacy api config
        if (appConfig.api?.key) {
          return {
            apiKey: appConfig.api.key,
            baseUrl: appConfig.api.baseUrl,
            model: appConfig.model?.defaultModel,
          };
        }

        return null;
      },
      getSkillsPrompt: async () => {
        return getSkillManager().buildAutoRoutingPrompt();
      },
    });

    // Forward IM events to renderer
    imGatewayManager.on('statusChange', (status) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('im:status:change', status);
        }
      });
    });

    imGatewayManager.on('message', (message) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('im:message:received', message);
        }
      });
    });

    imGatewayManager.on('error', ({ platform, error }) => {
      console.error(`[IM Gateway] ${platform} error:`, error);
    });

    const feishuMigrationEngineKey = hasLocalOpenClawFeishuConfigured()
      ? FeishuEngineKey.OpenClaw
      : resolveFeishuEngineKey();
    imGatewayManager.getIMStore().migrateLegacyFeishuInstances(feishuMigrationEngineKey);
  }
  return imGatewayManager;
};

function mergeCoworkSystemPrompt(
  engine: CoworkAgentEngine,
  systemPrompt?: string,
): string | undefined {
  const sections = [
    buildScheduledTaskEnginePrompt(engine),
    systemPrompt?.trim() || '',
  ].filter(Boolean);
  return sections.length > 0 ? sections.join('\n\n') : undefined;
}

// 获取正确的预加载脚本路径
const PRELOAD_PATH = app.isPackaged
  ? path.join(__dirname, 'preload.js')
  : path.join(__dirname, '../dist-electron/preload.js');

// 获取应用图标路径（Windows 使用 .ico，其他平台使用 .png）
const getAppIconPath = (): string | undefined => {
  if (process.platform !== 'win32' && process.platform !== 'linux') return undefined;
  const basePath = app.isPackaged
    ? path.join(process.resourcesPath, 'tray')
    : path.join(__dirname, '..', 'resources', 'tray');
  return process.platform === 'win32'
    ? path.join(basePath, 'tray-icon.ico')
    : path.join(basePath, 'tray-icon.png');
};

// 保存对主窗口的引用
let mainWindow: BrowserWindow | null = null;
let desktopPetWindow: BrowserWindow | null = null;
let desktopPetPreviewConfig: PetConfig | null = null;

let isQuitting = false;

// 存储活跃的流式请求控制器
const activeStreamControllers = new Map<string, AbortController>();
let lastReloadAt = 0;
const MIN_RELOAD_INTERVAL_MS = 5000;
type AppConfigSettings = {
  theme?: string;
  language?: string;
  useSystemProxy?: boolean;
  pet?: Partial<PetConfig> | null;
};

const getUseSystemProxyFromConfig = (config?: { useSystemProxy?: boolean }): boolean => {
  return config?.useSystemProxy === true;
};

const resolveThemeFromConfig = (config?: AppConfigSettings): 'light' | 'dark' => {
  if (config?.theme === 'dark') {
    return 'dark';
  }
  if (config?.theme === 'light') {
    return 'light';
  }
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
};

const getInitialTheme = (): 'light' | 'dark' => {
  const config = getStore().get<AppConfigSettings>('app_config');
  return resolveThemeFromConfig(config);
};

const getTitleBarOverlayOptions = () => {
  const config = getStore().get<AppConfigSettings>('app_config');
  const theme = resolveThemeFromConfig(config);
  return {
    color: TITLEBAR_COLORS[theme].color,
    symbolColor: TITLEBAR_COLORS[theme].symbolColor,
    height: TITLEBAR_HEIGHT,
  };
};

const updateTitleBarOverlay = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!isMac && !isWindows) {
    mainWindow.setTitleBarOverlay(getTitleBarOverlayOptions());
  }
  // Also update the window background color to match the theme
  const config = getStore().get<AppConfigSettings>('app_config');
  const theme = resolveThemeFromConfig(config);
  mainWindow.setBackgroundColor(theme === 'dark' ? '#0F1117' : '#F8F9FB');
};

const DESKTOP_PET_WINDOW_SIZE = {
  width: 292,
  height: 236,
} as const;

const DESKTOP_PET_TASK_TITLE_MAX_CHARS = 42;
let desktopPetTaskSnapshot: DesktopPetTaskSnapshot | null = null;

const getStoredDesktopPetConfig = (): PetConfig => {
  const config = getStore().get<AppConfigSettings>('app_config');
  return normalizePetConfig(config?.pet);
};

const getEffectiveDesktopPetConfig = (): PetConfig => {
  return desktopPetPreviewConfig ?? getStoredDesktopPetConfig();
};

const getDefaultDesktopPetPosition = (): PetPosition => {
  const workArea = screen.getPrimaryDisplay().workArea;
  return {
    x: workArea.x + workArea.width - DESKTOP_PET_WINDOW_SIZE.width - 64,
    y: workArea.y + workArea.height - DESKTOP_PET_WINDOW_SIZE.height - 72,
  };
};

const clampDesktopPetPosition = (position: PetPosition): PetPosition => {
  const display = screen.getDisplayNearestPoint({
    x: Math.round(position.x),
    y: Math.round(position.y),
  });
  const workArea = display.workArea;
  return {
    x: Math.min(
      workArea.x + workArea.width - DESKTOP_PET_WINDOW_SIZE.width,
      Math.max(workArea.x, Math.round(position.x)),
    ),
    y: Math.min(
      workArea.y + workArea.height - DESKTOP_PET_WINDOW_SIZE.height,
      Math.max(workArea.y, Math.round(position.y)),
    ),
  };
};

const resolveDesktopPetPosition = (config: PetConfig): PetPosition => {
  return clampDesktopPetPosition(config.position ?? getDefaultDesktopPetPosition());
};

const buildDesktopPetLoadUrl = (): string => {
  if (isDev) {
    const url = new URL(DEV_SERVER_URL);
    url.searchParams.set('window', 'desktop-pet');
    return url.toString();
  }
  return '';
};

const sendDesktopPetConfig = (config: PetConfig): void => {
  if (!desktopPetWindow || desktopPetWindow.isDestroyed() || desktopPetWindow.webContents.isDestroyed()) {
    return;
  }
  desktopPetWindow.webContents.send(DesktopPetIpcChannel.ConfigChanged, config);
};

const sendDesktopPetTaskSnapshot = (): void => {
  if (!desktopPetWindow || desktopPetWindow.isDestroyed() || desktopPetWindow.webContents.isDestroyed()) {
    return;
  }
  desktopPetWindow.webContents.send(DesktopPetIpcChannel.TaskChanged, desktopPetTaskSnapshot);
};

const trimDesktopPetTaskText = (value: string, maxChars = DESKTOP_PET_TASK_TITLE_MAX_CHARS): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
};

const getDesktopPetEngineLabel = (engine: CoworkAgentEngine): string => {
  if (engine === CoworkAgentEngineValue.ClaudeCode) return 'Claude Code';
  if (engine === CoworkAgentEngineValue.Codex) return 'Codex CLI';
  if (engine === CoworkAgentEngineValue.CodexApp) return 'Codex App';
  if (engine === CoworkAgentEngineValue.OpenClaw) return 'OpenClaw';
  if (engine === CoworkAgentEngineValue.Hermes) return 'Hermes Agent';
  if (engine === CoworkAgentEngineValue.OpenCode) return 'OpenCode';
  if (engine === CoworkAgentEngineValue.GrokBuild) return 'Grok Build';
  if (engine === CoworkAgentEngineValue.QwenCode) return 'Qwen Code';
  if (engine === CoworkAgentEngineValue.DeepSeekTui) return 'DeepSeek-TUI';
  return 'WeSight';
};

const getDesktopPetTaskActivityText = (status: DesktopPetTaskStatus): string => {
  switch (status) {
    case DesktopPetTaskStatus.Waiting:
      return 'waiting';
    case DesktopPetTaskStatus.Thinking:
      return 'thinking';
    case DesktopPetTaskStatus.Replying:
      return 'replying';
    case DesktopPetTaskStatus.Coding:
      return 'coding';
    case DesktopPetTaskStatus.Permission:
      return 'needs_confirmation';
    case DesktopPetTaskStatus.Completed:
      return 'completed';
    case DesktopPetTaskStatus.Error:
      return 'error';
    case DesktopPetTaskStatus.Stopped:
      return 'stopped';
    default:
      return 'waiting';
  }
};

const getDesktopPetTaskSource = (session: CoworkSessionMeta): DesktopPetTaskSnapshot['source'] => {
  if (/^\[[^\]]+\]\s/.test(session.title)) {
    return DesktopPetTaskSource.Im;
  }
  return DesktopPetTaskSource.Chat;
};

const isDesktopPetRunningTaskStatus = (status: DesktopPetTaskStatus): boolean => (
  status === DesktopPetTaskStatus.Waiting
  || status === DesktopPetTaskStatus.Thinking
  || status === DesktopPetTaskStatus.Replying
  || status === DesktopPetTaskStatus.Coding
  || status === DesktopPetTaskStatus.Permission
);

const shouldReplaceDesktopPetTaskSnapshot = (sessionId: string, status: DesktopPetTaskStatus): boolean => {
  if (!desktopPetTaskSnapshot) return true;
  if (desktopPetTaskSnapshot.sessionId === sessionId) return true;
  if (isDesktopPetRunningTaskStatus(status)) return true;
  return !isDesktopPetRunningTaskStatus(desktopPetTaskSnapshot.status);
};

const updateDesktopPetTaskSnapshot = (sessionId: string, status: DesktopPetTaskStatus): void => {
  if (!shouldReplaceDesktopPetTaskSnapshot(sessionId, status)) {
    return;
  }

  const session = getCoworkStore().getSessionMeta(sessionId);
  if (!session) {
    return;
  }

  const config = getCoworkStore().getConfig();
  const engine = config.agentEngine;
  const model = resolveRuntimeModelSnapshot(engine);
  const projectName = session.cwd ? path.basename(session.cwd) || APP_NAME : APP_NAME;
  desktopPetTaskSnapshot = {
    sessionId,
    title: trimDesktopPetTaskText(session.title || projectName),
    projectName: trimDesktopPetTaskText(projectName, 28),
    source: getDesktopPetTaskSource(session),
    status,
    engineLabel: getDesktopPetEngineLabel(engine),
    modelLabel: model.modelName || model.modelId || '-',
    activityText: getDesktopPetTaskActivityText(status),
    updatedAt: Date.now(),
  };
  sendDesktopPetTaskSnapshot();
};

const getDesktopPetStatusForMessage = (message: CoworkMessage): DesktopPetTaskStatus => {
  if (message.type === 'user') return DesktopPetTaskStatus.Thinking;
  if (message.type === 'assistant') return DesktopPetTaskStatus.Replying;
  if (message.type === 'tool_use' || message.type === 'tool_result') {
    const toolName = String(message.metadata?.toolName ?? '').toLowerCase();
    if (
      toolName.includes('write')
      || toolName.includes('edit')
      || toolName.includes('multiedit')
      || toolName.includes('file')
    ) {
      return DesktopPetTaskStatus.Coding;
    }
    return DesktopPetTaskStatus.Thinking;
  }
  return DesktopPetTaskStatus.Thinking;
};

const ensureMacDockVisible = (): void => {
  if (isMac) {
    app.dock.show();
  }
};

const createDesktopPetWindow = (config: PetConfig): BrowserWindow => {
  const position = resolveDesktopPetPosition(config);
  ensureMacDockVisible();
  const petWindow = new BrowserWindow({
    width: DESKTOP_PET_WINDOW_SIZE.width,
    height: DESKTOP_PET_WINDOW_SIZE.height,
    x: position.x,
    y: position.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    fullscreenable: false,
    skipTaskbar: !isMac,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    acceptFirstMouse: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: PRELOAD_PATH,
      backgroundThrottling: false,
      devTools: isDev,
      spellcheck: false,
      enableWebSQL: false,
      autoplayPolicy: 'no-user-gesture-required',
      disableDialogs: true,
      navigateOnDragDrop: false,
    },
  });

  petWindow.setMenu(null);
  petWindow.setAlwaysOnTop(true, isMac ? 'floating' : 'normal');
  petWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  petWindow.once('ready-to-show', () => {
    if (petWindow.isDestroyed()) return;
    petWindow.showInactive();
    sendDesktopPetConfig(config);
  });

  petWindow.webContents.on('did-finish-load', () => {
    sendDesktopPetConfig(getEffectiveDesktopPetConfig());
    sendDesktopPetTaskSnapshot();
  });

  petWindow.on('closed', () => {
    if (desktopPetWindow === petWindow) {
      desktopPetWindow = null;
    }
  });

  if (isDev) {
    petWindow.loadURL(buildDesktopPetLoadUrl()).catch((error) => {
      console.error('[DesktopPet] failed to load dev window:', error);
    });
  } else {
    petWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { window: 'desktop-pet' },
    }).catch((error) => {
      console.error('[DesktopPet] failed to load window:', error);
    });
  }

  return petWindow;
};

const applyDesktopPetConfig = (config: PetConfig): void => {
  const normalized = normalizePetConfig(config);
  if (!normalized.enabled) {
    if (desktopPetWindow && !desktopPetWindow.isDestroyed()) {
      desktopPetWindow.close();
    }
    desktopPetWindow = null;
    return;
  }

  if (!desktopPetWindow || desktopPetWindow.isDestroyed()) {
    ensureMacDockVisible();
    desktopPetWindow = createDesktopPetWindow(normalized);
    return;
  }

  const position = resolveDesktopPetPosition(normalized);
  desktopPetWindow.setBounds({
    ...position,
    ...DESKTOP_PET_WINDOW_SIZE,
  });
  if (!desktopPetWindow.isVisible()) {
    desktopPetWindow.showInactive();
  }
  ensureMacDockVisible();
  sendDesktopPetConfig(normalized);
};

const applyDesktopPetConfigFromStore = (): void => {
  desktopPetPreviewConfig = null;
  applyDesktopPetConfig(getStoredDesktopPetConfig());
};

const restoreMainWindowFromDesktopPet = (): boolean => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  if (isMac) {
    ensureMacDockVisible();
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.moveTop();
  mainWindow.focus();
  app.focus({ steal: true });
  return true;
};

const persistDesktopPetPosition = (position: PetPosition): void => {
  if (desktopPetPreviewConfig) {
    desktopPetPreviewConfig = {
      ...desktopPetPreviewConfig,
      position: clampDesktopPetPosition(position),
    };
    sendDesktopPetConfig(desktopPetPreviewConfig);
    return;
  }
  const currentConfig = getStore().get<AppConfigSettings>('app_config') ?? {};
  const currentPet = normalizePetConfig(currentConfig.pet);
  getStore().set('app_config', {
    ...currentConfig,
    pet: {
      ...currentPet,
      position: clampDesktopPetPosition(position),
    },
  });
};

const applyProxyPreference = async (useSystemProxy: boolean): Promise<void> => {
  try {
    await session.defaultSession.setProxy({ mode: useSystemProxy ? 'system' : 'direct' });
  } catch (error) {
    console.error('[Main] Failed to apply session proxy mode:', error);
  }

  setSystemProxyEnabled(useSystemProxy);

  if (!useSystemProxy) {
    restoreOriginalProxyEnv();
    console.log('[Main] System proxy disabled (direct mode).');
    return;
  }

  const proxyUrl = await resolveSystemProxyUrl('https://openrouter.ai');
  applySystemProxyEnv(proxyUrl);

  if (proxyUrl) {
    console.log('[Main] System proxy enabled for process env:', proxyUrl);
  } else {
    console.warn('[Main] System proxy mode enabled, but no proxy endpoint was resolved (DIRECT).');
  }
};

const emitWindowState = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('window:state-changed', {
    isMaximized: mainWindow.isMaximized(),
    isFullscreen: mainWindow.isFullScreen(),
    isFocused: mainWindow.isFocused(),
  });
};

const showSystemMenu = (position?: { x?: number; y?: number }) => {
  if (!isWindows) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const isMaximized = mainWindow.isMaximized();
  const menu = Menu.buildFromTemplate([
    { label: 'Restore', enabled: isMaximized, click: () => mainWindow.restore() },
    { role: 'minimize' },
    { label: 'Maximize', enabled: !isMaximized, click: () => mainWindow.maximize() },
    { type: 'separator' },
    { role: 'close' },
  ]);

  menu.popup({
    window: mainWindow,
    x: Math.max(0, Math.round(position?.x ?? 0)),
    y: Math.max(0, Math.round(position?.y ?? 0)),
  });
};

const scheduleReload = (reason: string, webContents?: WebContents) => {
  const target = webContents ?? mainWindow?.webContents;
  if (!target || target.isDestroyed()) {
    return;
  }
  const now = Date.now();
  if (now - lastReloadAt < MIN_RELOAD_INTERVAL_MS) {
    console.warn(`Skipping reload (${reason}); last reload was ${now - lastReloadAt}ms ago.`);
    return;
  }
  lastReloadAt = now;
  console.warn(`Reloading window due to ${reason}`);
  target.reloadIgnoringCache();
};

const registerOAuthProtocol = (): void => {
  const scheme = 'wesight';
  const appPath = app.getAppPath();
  const registered = process.defaultApp
    ? app.setAsDefaultProtocolClient(scheme, process.execPath, [appPath])
    : app.setAsDefaultProtocolClient(scheme);
  console.log(`[Auth] custom protocol ${registered ? 'registered' : 'registration failed'} for ${scheme}://`);
};

// 确保应用程序只有一个实例
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // Register custom protocol for OAuth callback
  registerOAuthProtocol();

  // Buffer for deep link auth code received before renderer is ready
  let pendingAuthCode: string | null = null;
  let desktopAuthCallbackServer: http.Server | null = null;
  let desktopAuthCallbackUrl: string | null = null;

  /**
   * Parse a wesight:// deep link and send (or buffer) the auth code.
   */
  const deliverAuthCode = (code: string) => {
    pendingAuthCode = code;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth:callback', { code });
    }
  };

  const handleDeepLink = (url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'auth' && parsed.pathname === '/callback') {
        const code = parsed.searchParams.get('code');
        if (code) {
          deliverAuthCode(code);
        }
      }
    } catch (e) {
      console.error('[Main] Failed to parse deep link:', e);
    }
  };

  const ensureDesktopAuthCallbackUrl = async (): Promise<string> => {
    if (desktopAuthCallbackUrl && desktopAuthCallbackServer?.listening) {
      return desktopAuthCallbackUrl;
    }

    const callbackToken = randomBytes(18).toString('base64url');
    desktopAuthCallbackServer = http.createServer((request, response) => {
      try {
        const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
        if (requestUrl.pathname !== '/auth/callback' || requestUrl.searchParams.get('token') !== callbackToken) {
          response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Not found');
          return;
        }

        const code = requestUrl.searchParams.get('code');
        if (!code) {
          response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Missing auth code');
          return;
        }

        deliverAuthCode(code);
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        response.end(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>WeSight 登录完成</title>
  </head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#191917;background:#f6f3ea;">
    <h1>WeSight 登录完成</h1>
    <p>可以回到 WeSight 桌面端继续使用。</p>
    <script>window.close();</script>
  </body>
</html>`);
      } catch (error) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('OAuth callback failed');
        console.error('[Auth] local OAuth callback failed:', error);
      }
    });

    await new Promise<void>((resolve, reject) => {
      desktopAuthCallbackServer?.once('error', reject);
      desktopAuthCallbackServer?.listen(0, '127.0.0.1', resolve);
    });

    const address = desktopAuthCallbackServer.address() as AddressInfo;
    desktopAuthCallbackUrl = `http://127.0.0.1:${address.port}/auth/callback?token=${callbackToken}`;
    console.log('[Auth] local OAuth callback server started');
    return desktopAuthCallbackUrl;
  };

  // Allow renderer to retrieve a buffered auth code on init
  ipcMain.handle('auth:getPendingCallback', () => {
    const code = pendingAuthCode;
    pendingAuthCode = null;
    return code;
  });

  // macOS: handle open-url event for deep links
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  app.on('second-instance', (_event, commandLine, workingDirectory) => {
    console.debug('[Main] second-instance event', { commandLine, workingDirectory });

    // Check for deep link in command line args (Windows/Linux)
    const deepLink = commandLine.find(arg => arg.startsWith('wesight://'));
    if (deepLink) {
      handleDeepLink(deepLink);
    }

    // Focus main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      if (!mainWindow.isFocused()) mainWindow.focus();
    }
  });

  // IPC 处理程序
  ipcMain.handle('store:get', (_event, key) => {
    return getStore().get(key);
  });

  ipcMain.handle('store:set', async (_event, key, value) => {
    getStore().set(key, value);
    if (key === 'app_config') {
      refreshEndpointsTestMode(getStore());
      const syncResult = await syncOpenClawConfig({
        reason: 'app-config-change',
        restartGatewayIfRunning: false,
      });
      if (!syncResult.success) {
        console.error('[OpenClaw] Failed to sync config after app_config update:', syncResult.error);
      }
    }
  });

  ipcMain.handle('store:remove', (_event, key) => {
    getStore().delete(key);
  });

  ipcMain.handle('enterprise:getConfig', async () => {
    try {
      return getStore().get('enterprise_config') ?? null;
    } catch {
      return null;
    }
  });

  ipcMain.handle(DesktopPetIpcChannel.GetConfig, () => {
    return getEffectiveDesktopPetConfig();
  });

  ipcMain.handle(DesktopPetIpcChannel.ApplyPreview, (_event, config: Partial<PetConfig>) => {
    desktopPetPreviewConfig = normalizePetConfig({
      ...getStoredDesktopPetConfig(),
      ...config,
    });
    applyDesktopPetConfig(desktopPetPreviewConfig);
    return desktopPetPreviewConfig;
  });

  ipcMain.handle(DesktopPetIpcChannel.GetBounds, () => {
    if (!desktopPetWindow || desktopPetWindow.isDestroyed()) {
      return null;
    }
    return desktopPetWindow.getBounds();
  });

  ipcMain.handle(DesktopPetIpcChannel.SetPosition, (_event, input: PetPosition & { persist?: boolean }) => {
    if (!desktopPetWindow || desktopPetWindow.isDestroyed()) {
      return null;
    }
    const position = clampDesktopPetPosition(input);
    desktopPetWindow.setBounds({
      ...position,
      ...DESKTOP_PET_WINDOW_SIZE,
    });
    if (input.persist) {
      persistDesktopPetPosition(position);
    }
    return desktopPetWindow.getBounds();
  });

  ipcMain.handle(DesktopPetIpcChannel.OpenMainWindow, () => {
    return restoreMainWindowFromDesktopPet();
  });

  ipcMain.handle(DesktopPetIpcChannel.GetTaskSnapshot, () => {
    return desktopPetTaskSnapshot;
  });

  ipcMain.handle(DesktopPetIpcChannel.OpenTask, (_event, input: { sessionId?: string }) => {
    const sessionId = typeof input?.sessionId === 'string' ? input.sessionId : '';
    const restored = restoreMainWindowFromDesktopPet();
    if (restored && sessionId && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(DesktopPetIpcChannel.OpenTaskRequested, { sessionId });
    }
    return restored;
  });

  // Network status change handler
  // Remove any existing listener first to avoid duplicate registrations
  ipcMain.removeAllListeners('network:status-change');
  ipcMain.on('network:status-change', (_event, status: 'online' | 'offline') => {
    console.log(`[Main] Network status changed: ${status}`);

    if (status === 'online' && imGatewayManager) {
      console.log('[Main] Network restored, reconnecting IM gateways...');
      imGatewayManager.reconnectAllDisconnected();
    }
  });

  // Log IPC handlers
  ipcMain.handle('log:getPath', () => {
    return getLogFilePath();
  });

  ipcMain.handle('log:openFolder', () => {
    const logPath = getLogFilePath();
    if (logPath) {
      shell.showItemInFolder(logPath);
    }
  });

  ipcMain.handle('log:exportZip', async (event) => {
    try {
      const ownerWindow = BrowserWindow.fromWebContents(event.sender);
      if (!ownerWindow || ownerWindow.isDestroyed()) {
        return { success: false, error: 'Window is not available' };
      }

      const saveOptions = {
        title: 'Export Logs',
        defaultPath: path.join(app.getPath('downloads'), buildLogExportFileName()),
        filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
      };

      const saveResult = await dialog.showSaveDialog(ownerWindow, saveOptions);

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: true, canceled: true };
      }

      const outputPath = ensureZipFileName(saveResult.filePath);
      const archiveResult = await exportLogsZip({
        outputPath,
        entries: [
          ...getRecentMainLogEntries(),
          { archiveName: 'cowork.log', filePath: getCoworkLogPath() },
        ],
        bufferEntries: [
          {
            archiveName: 'performance-snapshot.json',
            buffer: Buffer.from(JSON.stringify(getPerformanceSnapshot({
              appVersion: app.getVersion(),
              platform: process.platform,
              arch: process.arch,
            }), null, 2), 'utf8'),
          },
          {
            archiveName: 'event-timeline-summary.json',
            buffer: Buffer.from(JSON.stringify(getCoworkStore().getEventTimelineSummary(200), null, 2), 'utf8'),
          },
        ],
      });

      return {
        success: true,
        canceled: false,
        path: outputPath,
        missingEntries: archiveResult.missingEntries,
      };
    } catch (error) {
      console.error('[LogExport] export failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export logs',
      };
    }
  });

  // Auto-launch IPC handlers
  // Use SQLite store as the source of truth for UI state, because
  // app.getLoginItemSettings() returns unreliable values on macOS and
  // requires matching args on Windows.
  ipcMain.handle('app:getAutoLaunch', () => {
    const stored = getStore().get<boolean>('auto_launch_enabled');
    // Fall back to OS API if SQLite has no record yet (e.g. upgraded from older version)
    const enabled = stored ?? getAutoLaunchEnabled();
    return { enabled };
  });

  ipcMain.handle('app:setAutoLaunch', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      return { success: false, error: 'Invalid parameter: enabled must be boolean' };
    }
    try {
      setAutoLaunchEnabled(enabled);
      getStore().set('auto_launch_enabled', enabled);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set auto-launch',
      };
    }
  });

  ipcMain.handle('app:getPreventSleep', () => {
    const enabled = getStore().get<boolean>('prevent_sleep_enabled') ?? false;
    return { enabled };
  });

  ipcMain.handle('app:setPreventSleep', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      return { success: false, error: 'Invalid parameter: enabled must be boolean' };
    }
    try {
      if (enabled) {
        if (preventSleepBlockerId === null || !powerSaveBlocker.isStarted(preventSleepBlockerId)) {
          preventSleepBlockerId = powerSaveBlocker.start('prevent-display-sleep');
        }
      } else {
        if (preventSleepBlockerId !== null && powerSaveBlocker.isStarted(preventSleepBlockerId)) {
          powerSaveBlocker.stop(preventSleepBlockerId);
          preventSleepBlockerId = null;
        }
      }
      getStore().set('prevent_sleep_enabled', enabled);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set prevent-sleep',
      };
    }
  });

  // Window control IPC handlers
  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });

  ipcMain.on('window:showSystemMenu', (_event, position: { x?: number; y?: number } | undefined) => {
    showSystemMenu(position);
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getSystemLocale', () => app.getLocale());

  // ── Auth IPC handlers ──

  /**
   * Helper: Persist auth tokens into the kv store.
   */
  const saveAuthTokens = (accessToken: string, refreshToken: string) => {
    getStore().set('auth_tokens', { accessToken, refreshToken });
  };

  const getAuthTokens = (): { accessToken: string; refreshToken: string } | null => {
    return getStore().get<{ accessToken: string; refreshToken: string }>('auth_tokens') || null;
  };

  const clearAuthTokens = () => {
    getStore().delete('auth_tokens');
  };

  /**
   * Helper: Fetch with Bearer token, auto-refresh on 401 and retry once.
   */
  const fetchWithAuth = async (url: string, options?: RequestInit): Promise<Response> => {
    const tokens = getAuthTokens();
    if (!tokens) throw new Error('No auth tokens');

    const doFetch = (accessToken: string) =>
      net.fetch(url, {
        ...options,
        headers: { ...(options?.headers as Record<string, string>), Authorization: `Bearer ${accessToken}` },
      });

    let resp = await doFetch(tokens.accessToken);

    if (resp.status === 401 && tokens.refreshToken) {
      const serverBaseUrl = getServerApiBaseUrl();
      const refreshResp = await net.fetch(`${serverBaseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (refreshResp.ok) {
        const refreshBody = await refreshResp.json() as { code: number; data: { accessToken: string; refreshToken?: string } };
        if (refreshBody.code === 0 && refreshBody.data) {
          saveAuthTokens(refreshBody.data.accessToken, refreshBody.data.refreshToken || tokens.refreshToken);
          resp = await doFetch(refreshBody.data.accessToken);
        }
      } else {
        clearAuthTokens();
        clearServerModelMetadata();
      }
    }

    return resp;
  };

  /**
   * Normalize quota data from various server response formats into a unified shape.
   */
  const normalizeQuota = (raw: Record<string, unknown>) => {
    let creditsLimit = 0;
    let creditsUsed = 0;
    let planName = t('authPlanFree');
    let subscriptionStatus = 'free';

    if (typeof raw.freeCreditsTotal === 'number') {
      // Free user format from /api/user/quota
      creditsLimit = raw.freeCreditsTotal as number;
      creditsUsed = (raw.freeCreditsUsed as number) || 0;
      planName = (raw.planName as string) || t('authPlanFree');
      subscriptionStatus = (raw.subscriptionStatus as string) || 'free';
    } else if (typeof raw.monthlyCreditsLimit === 'number') {
      // Paid user format from /api/user/quota
      creditsLimit = raw.monthlyCreditsLimit as number;
      creditsUsed = (raw.monthlyCreditsUsed as number) || 0;
      planName = (raw.planName as string) || t('authPlanStandard');
      subscriptionStatus = (raw.subscriptionStatus as string) || 'active';
    } else if (typeof raw.dailyCreditsLimit === 'number') {
      // Legacy exchange format
      creditsLimit = raw.dailyCreditsLimit as number;
      creditsUsed = (raw.dailyCreditsUsed as number) || 0;
      planName = (raw.planName as string) || t('authPlanFree');
      subscriptionStatus = (raw.subscriptionStatus as string) || 'free';
    } else if (typeof raw.creditsLimit === 'number') {
      // Already normalized
      return raw;
    }

    return {
      planName,
      subscriptionStatus,
      creditsLimit,
      creditsUsed,
      creditsRemaining: Math.max(0, creditsLimit - creditsUsed),
    };
  };

  ipcMain.handle('auth:login', async (_event, { loginUrl }: { loginUrl?: string } = {}) => {
    try {
      const baseUrl = loginUrl || `${getServerApiBaseUrl()}/login`;
      const url = new URL(baseUrl);
      url.searchParams.set('source', 'electron');
      if (!loginUrl) {
        url.searchParams.set('desktopCallback', await ensureDesktopAuthCallbackUrl());
      }
      await shell.openExternal(url.toString());
      return { success: true };
    } catch (error) {
      console.error('[Auth] login failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open login' };
    }
  });

  ipcMain.handle('auth:exchange', async (_event, { code }: { code: string }) => {
    try {
      const serverBaseUrl = getServerApiBaseUrl();
      const resp = await net.fetch(`${serverBaseUrl}/api/auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authCode: code }),
      });
      if (!resp.ok) {
        return { success: false, error: `Exchange failed: ${resp.status}` };
      }
      const body = await resp.json() as {
        code: number;
        message?: string;
        data: {
          accessToken: string;
          refreshToken: string;
          user: Record<string, unknown>;
          quota: Record<string, unknown>;
        };
      };
      if (body.code !== 0 || !body.data) {
        return { success: false, error: body.message || 'Exchange failed' };
      }
      saveAuthTokens(body.data.accessToken, body.data.refreshToken);
      return { success: true, user: body.data.user, quota: normalizeQuota(body.data.quota) };
    } catch (error) {
      console.error('[Auth] exchange failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Exchange failed' };
    }
  });

  ipcMain.handle('auth:getUser', async () => {
    try {
      const tokens = getAuthTokens();
      if (!tokens) return { success: false };
      const serverBaseUrl = getServerApiBaseUrl();
      // Fetch user profile
      const profileResp = await fetchWithAuth(`${serverBaseUrl}/api/user/profile`);
      if (!profileResp.ok) {
        if (profileResp.status === 401) {
          clearAuthTokens();
          clearServerModelMetadata();
        }
        return { success: false };
      }
      const profileBody = await profileResp.json() as { code: number; data: Record<string, unknown> };
      if (profileBody.code !== 0 || !profileBody.data) return { success: false };
      // Fetch quota separately
      const quotaResp = await fetchWithAuth(`${serverBaseUrl}/api/user/quota`);
      let quota = null;
      if (quotaResp.ok) {
        const quotaBody = await quotaResp.json() as { code: number; data: Record<string, unknown> };
        if (quotaBody.code === 0 && quotaBody.data) {
          quota = normalizeQuota(quotaBody.data);
        }
      }
      return { success: true, user: profileBody.data, quota };
    } catch {
      return { success: false };
    }
  });

  ipcMain.handle('auth:getQuota', async () => {
    try {
      const tokens = getAuthTokens();
      if (!tokens) return { success: false };
      const serverBaseUrl = getServerApiBaseUrl();
      const resp = await fetchWithAuth(`${serverBaseUrl}/api/user/quota`);
      if (!resp.ok) {
        if (resp.status === 401) {
          clearAuthTokens();
          clearServerModelMetadata();
        }
        return { success: false };
      }
      const body = await resp.json() as { code: number; data: Record<string, unknown> };
      if (body.code !== 0 || !body.data) return { success: false };
      return { success: true, quota: normalizeQuota(body.data) };
    } catch {
      return { success: false };
    }
  });

  ipcMain.handle('auth:getProfileSummary', async () => {
    try {
      const tokens = getAuthTokens();
      if (!tokens) return { success: false };
      const serverBaseUrl = getServerApiBaseUrl();
      const resp = await fetchWithAuth(`${serverBaseUrl}/api/user/profile-summary`);
      if (!resp.ok) {
        if (resp.status === 401) {
          clearAuthTokens();
          clearServerModelMetadata();
        }
        return { success: false };
      }
      const body = await resp.json() as { code: number; data: Record<string, unknown> };
      if (body.code !== 0 || !body.data) return { success: false };
      return { success: true, data: body.data };
    } catch {
      return { success: false };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      const tokens = getAuthTokens();
      if (tokens) {
        const serverBaseUrl = getServerApiBaseUrl();
        await net.fetch(`${serverBaseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        }).catch(() => { /* best-effort */ });
      }
      clearAuthTokens();
      clearServerModelMetadata();
      return { success: true };
    } catch {
      clearAuthTokens();
      clearServerModelMetadata();
      return { success: true };
    }
  });

  ipcMain.handle('auth:refreshToken', async () => {
    try {
      const tokens = getAuthTokens();
      if (!tokens?.refreshToken) return { success: false };
      const serverBaseUrl = getServerApiBaseUrl();
      const resp = await net.fetch(`${serverBaseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (!resp.ok) {
        clearAuthTokens();
        clearServerModelMetadata();
        return { success: false };
      }
      const body = await resp.json() as { code: number; data: { accessToken: string; refreshToken?: string } };
      if (body.code !== 0 || !body.data) {
        clearAuthTokens();
        clearServerModelMetadata();
        return { success: false };
      }
      saveAuthTokens(body.data.accessToken, body.data.refreshToken || tokens.refreshToken);
      return { success: true, accessToken: body.data.accessToken };
    } catch {
      return { success: false };
    }
  });

  ipcMain.handle('auth:getAccessToken', async () => {
    const tokens = getAuthTokens();
    return tokens?.accessToken || null;
  });

  ipcMain.handle('auth:getModels', async () => {
    try {
      const tokens = getAuthTokens();
      if (!tokens) {
        console.log('[Auth:getModels] No auth tokens available');
        return { success: false };
      }
      const serverBaseUrl = getServerApiBaseUrl();
      const url = `${serverBaseUrl}/api/models/available`;
      console.log('[Auth:getModels] Fetching:', url);
      const resp = await fetchWithAuth(url);
      console.log('[Auth:getModels] Response status:', resp.status);
      if (!resp.ok) {
        console.log('[Auth:getModels] Response not ok:', resp.status, resp.statusText);
        return { success: false };
      }
      const data = await resp.json() as { code: number; data: Array<{ modelId: string; modelName: string; provider: string; apiFormat: string; supportsImage?: boolean }> };
      console.log('[Auth:getModels] Response data:', JSON.stringify(data).slice(0, 500));
      if (data.code !== 0) return { success: false };
      // Cache server model metadata for use in OpenClaw config sync (supportsImage, etc.)
      updateServerModelMetadata(data.data);
      return { success: true, models: data.data };
    } catch (e) {
      console.error('[Auth:getModels] Error:', e);
      return { success: false };
    }
  });

  // Skills IPC handlers
  ipcMain.handle(SkillsIpcChannel.List, () => {
    try {
      const skills = getSkillManager().listSkills();
      return { success: true, skills };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load skills' };
    }
  });

  ipcMain.handle(SkillsIpcChannel.SetEnabled, (_event, options: { id: string; enabled: boolean }) => {
    try {
      const skills = getSkillManager().setSkillEnabled(options.id, options.enabled);
      return { success: true, skills };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update skill' };
    }
  });

  ipcMain.handle(SkillsIpcChannel.Delete, (_event, id: string) => {
    try {
      const skills = getSkillManager().deleteSkill(id);
      return { success: true, skills };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete skill' };
    }
  });

  ipcMain.handle(SkillsIpcChannel.Download, async (_event, source: string) => {
    return getSkillManager().downloadSkill(source);
  });

  ipcMain.handle(SkillsIpcChannel.Upgrade, async (_event, skillId: string, downloadUrl: string) => {
    return getSkillManager().upgradeSkill(skillId, downloadUrl);
  });

  ipcMain.handle(SkillsIpcChannel.ConfirmInstall, async (_event, pendingId: string, action: string) => {
    const validActions = ['install', 'installDisabled', 'cancel'];
    if (!validActions.includes(action)) {
      return { success: false, error: 'Invalid action' };
    }
    return getSkillManager().confirmPendingInstall(
      pendingId,
      action as 'install' | 'installDisabled' | 'cancel'
    );
  });

  ipcMain.handle(SkillsIpcChannel.GetRoot, () => {
    try {
      const root = getSkillManager().getSkillsRoot();
      return { success: true, path: root };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to resolve skills root' };
    }
  });

  ipcMain.handle(SkillsIpcChannel.AutoRoutingPrompt, () => {
    try {
      const prompt = getSkillManager().buildAutoRoutingPrompt();
      return { success: true, prompt };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to build auto-routing prompt' };
    }
  });

  ipcMain.handle(SkillsIpcChannel.GetConfig, (_event, skillId: string) => {
    return getSkillManager().getSkillConfig(skillId);
  });

  ipcMain.handle(SkillsIpcChannel.SetConfig, (_event, skillId: string, config: Record<string, string>) => {
    return getSkillManager().setSkillConfig(skillId, config);
  });

  ipcMain.handle(SkillsIpcChannel.TestEmailConnectivity, async (
    _event,
    skillId: string,
    config: Record<string, string>
  ) => {
    return getSkillManager().testEmailConnectivity(skillId, config);
  });

  ipcMain.handle(SkillsIpcChannel.FetchMarketplace, async (_event, options) => {
    return getSkillManager().fetchMarketplaceSkills(options ?? {});
  });

  ipcMain.handle(SkillsIpcChannel.SearchMarketplace, async (_event, options) => {
    return getSkillManager().searchMarketplaceSkills(options ?? {});
  });

  ipcMain.handle(SkillsIpcChannel.InstallMarketplaceSkill, async (_event, skill) => {
    return getSkillManager().installMarketplaceSkill(skill);
  });

  ipcMain.handle('openclaw:engine:getStatus', async () => {
    try {
      const manager = getOpenClawEngineManager();
      return {
        success: true,
        status: manager.getStatus(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get OpenClaw engine status',
      };
    }
  });

  ipcMain.handle('openclaw:engine:install', async () => {
    try {
      bindExternalAgentCliInstallerForwarder();
      const installResult = await getExternalAgentCliInstaller().install('openclaw');
      if (!installResult.success) {
        return {
          success: false,
          status: getOpenClawEngineManager().getStatus(),
          error: installResult.error || 'Failed to install OpenClaw CLI',
        };
      }
      const status = await getOpenClawEngineManager().ensureReady();
      return {
        success: status.phase === 'running' || status.phase === 'ready',
        status,
      };
    } catch (error) {
      const manager = getOpenClawEngineManager();
      return {
        success: false,
        status: manager.getStatus(),
        error: error instanceof Error ? error.message : 'Failed to install OpenClaw engine',
      };
    }
  });

  ipcMain.handle('openclaw:engine:retryInstall', async () => {
    try {
      bindExternalAgentCliInstallerForwarder();
      const installResult = await getExternalAgentCliInstaller().install('openclaw');
      if (!installResult.success) {
        return {
          success: false,
          status: getOpenClawEngineManager().getStatus(),
          error: installResult.error || 'Failed to install OpenClaw CLI',
        };
      }
      const status = await getOpenClawEngineManager().ensureReady();
      return {
        success: status.phase === 'running' || status.phase === 'ready',
        status,
      };
    } catch (error) {
      const manager = getOpenClawEngineManager();
      return {
        success: false,
        status: manager.getStatus(),
        error: error instanceof Error ? error.message : 'Failed to retry OpenClaw engine install',
      };
    }
  });

  let restartGatewayPromise: Promise<OpenClawEngineStatus> | null = null;
  ipcMain.handle('openclaw:engine:restartGateway', async () => {
    if (restartGatewayPromise) {
      const status = await restartGatewayPromise;
      return { success: status.phase === 'running' || status.phase === 'ready', status };
    }
    try {
      const manager = getOpenClawEngineManager();
      restartGatewayPromise = manager.restartGateway();
      const status = await restartGatewayPromise;
      return {
        success: status.phase === 'running' || status.phase === 'ready',
        status,
      };
    } catch (error) {
      const manager = getOpenClawEngineManager();
      return {
        success: false,
        status: manager.getStatus(),
        error: error instanceof Error ? error.message : 'Failed to restart OpenClaw gateway',
      };
    } finally {
      restartGatewayPromise = null;
    }
  });

  ipcMain.handle('hermes:engine:getStatus', async () => {
    try {
      const manager = getHermesEngineManager();
      return {
        success: true,
        status: manager.getStatus(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get Hermes Agent engine status',
      };
    }
  });

  ipcMain.handle('hermes:engine:install', async () => {
    try {
      bindExternalAgentCliInstallerForwarder();
      const installResult = await getExternalAgentCliInstaller().install('hermes');
      if (!installResult.success) {
        return {
          success: false,
          status: getHermesEngineManager().getStatus(),
          error: installResult.error || 'Failed to install Hermes Agent CLI',
        };
      }
      getCoworkStore().setConfig({ hermesConfigSource: ExternalAgentConfigSource.WesightModel });
      const status = await bootstrapHermesEngine({
        forceReinstall: false,
        reason: 'manual-install',
      });
      return {
        success: status.phase === 'running' || status.phase === 'ready',
        status,
      };
    } catch (error) {
      const manager = getHermesEngineManager();
      return {
        success: false,
        status: manager.getStatus(),
        error: error instanceof Error ? error.message : 'Failed to install Hermes Agent engine',
      };
    }
  });

  ipcMain.handle('hermes:engine:retryInstall', async () => {
    try {
      bindExternalAgentCliInstallerForwarder();
      const installResult = await getExternalAgentCliInstaller().install('hermes');
      if (!installResult.success) {
        return {
          success: false,
          status: getHermesEngineManager().getStatus(),
          error: installResult.error || 'Failed to install Hermes Agent CLI',
        };
      }
      getCoworkStore().setConfig({ hermesConfigSource: ExternalAgentConfigSource.WesightModel });
      const status = await bootstrapHermesEngine({
        forceReinstall: true,
        reason: 'manual-retry',
      });
      return {
        success: status.phase === 'running' || status.phase === 'ready',
        status,
      };
    } catch (error) {
      const manager = getHermesEngineManager();
      return {
        success: false,
        status: manager.getStatus(),
        error: error instanceof Error ? error.message : 'Failed to retry Hermes Agent engine install',
      };
    }
  });

  let restartHermesGatewayPromise: Promise<HermesEngineStatus> | null = null;
  ipcMain.handle('hermes:engine:restartGateway', async () => {
    if (restartHermesGatewayPromise) {
      const status = await restartHermesGatewayPromise;
      return { success: status.phase === 'running' || status.phase === 'ready', status };
    }
    try {
      const syncResult = getHermesConfigSync().sync('manual-restart');
      if (!syncResult.success) {
        return {
          success: false,
          status: syncResult.status || getHermesEngineManager().getStatus(),
          error: syncResult.error || 'Hermes Agent config sync failed',
        };
      }
      const manager = getHermesEngineManager();
      restartHermesGatewayPromise = manager.restartGateway();
      const status = await restartHermesGatewayPromise;
      return {
        success: status.phase === 'running' || status.phase === 'ready',
        status,
      };
    } catch (error) {
      const manager = getHermesEngineManager();
      return {
        success: false,
        status: manager.getStatus(),
        error: error instanceof Error ? error.message : 'Failed to restart Hermes Agent gateway',
      };
    } finally {
      restartHermesGatewayPromise = null;
    }
  });

  // MCP Server IPC handlers
  ipcMain.handle('mcp:list', () => {
    try {
      const servers = getMcpStore().listServers();
      return { success: true, servers };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list MCP servers' };
    }
  });

  ipcMain.handle('mcp:create', async (_event, data: {
    name: string;
    description: string;
    transportType: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  }) => {
    try {
      getMcpStore().createServer(data as any);
      const servers = getMcpStore().listServers();
      // Trigger async MCP bridge refresh (don't await — let UI show DB result immediately)
      refreshMcpBridge().catch(err => console.error('[McpBridge] background refresh error:', err));
      return { success: true, servers };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create MCP server' };
    }
  });

  ipcMain.handle('mcp:update', async (_event, id: string, data: {
    name?: string;
    description?: string;
    transportType?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  }) => {
    try {
      getMcpStore().updateServer(id, data as any);
      const servers = getMcpStore().listServers();
      refreshMcpBridge().catch(err => console.error('[McpBridge] background refresh error:', err));
      return { success: true, servers };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update MCP server' };
    }
  });

  ipcMain.handle('mcp:delete', async (_event, id: string) => {
    try {
      getMcpStore().deleteServer(id);
      const servers = getMcpStore().listServers();
      refreshMcpBridge().catch(err => console.error('[McpBridge] background refresh error:', err));
      return { success: true, servers };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete MCP server' };
    }
  });

  ipcMain.handle('mcp:setEnabled', async (_event, options: { id: string; enabled: boolean }) => {
    try {
      getMcpStore().setEnabled(options.id, options.enabled);
      const servers = getMcpStore().listServers();
      refreshMcpBridge().catch(err => console.error('[McpBridge] background refresh error:', err));
      return { success: true, servers };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update MCP server' };
    }
  });

  ipcMain.handle('mcp:fetchMarketplace', async () => {
    const url = `${getServerApiBaseUrl()}/api/mcp/marketplace`;
    try {
      const https = await import('https');
      const data = await new Promise<string>((resolve, reject) => {
        const req = https.get(url, { timeout: 10000 }, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            res.resume();
            return;
          }
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => { body += chunk; });
          res.on('end', () => resolve(body));
          res.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      });
      const json = JSON.parse(data);
      const value = json?.data?.value;
      if (!value) {
        return { success: false, error: 'Invalid response: missing data.value' };
      }
      const marketplace = typeof value === 'string' ? JSON.parse(value) : value;
      return { success: true, data: marketplace };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch marketplace' };
    }
  });

  // Explicit bridge refresh — renderer can await this for loading state
  ipcMain.handle('mcp:refreshBridge', async () => {
    try {
      const result = await refreshMcpBridge();
      return { success: true, tools: result.tools, error: result.error };
    } catch (error) {
      return { success: false, tools: 0, error: error instanceof Error ? error.message : 'Failed to refresh MCP bridge' };
    }
  });

  // Cowork IPC handlers
  ipcMain.handle(CoworkIpcChannel.SessionSubscribe, async (event, input: { sessionId?: string } | string) => {
    const sessionId = typeof input === 'string' ? input : input?.sessionId;
    if (!sessionId) {
      return { success: false, error: 'Session id is required.' };
    }
    subscribeSenderToCoworkSession(event.sender, sessionId);
    return { success: true };
  });

  ipcMain.handle(CoworkIpcChannel.SessionUnsubscribe, async (event, input: { sessionId?: string } | string) => {
    const sessionId = typeof input === 'string' ? input : input?.sessionId;
    if (!sessionId) {
      return { success: false, error: 'Session id is required.' };
    }
    sessionSubscriptions.unsubscribe(sessionId, event.sender.id);
    return { success: true };
  });

  ipcMain.handle(CoworkIpcChannel.SessionSubscriptionsDebug, async () => {
    return { success: true, subscriptions: sessionSubscriptions.getSnapshot() };
  });

  ipcMain.handle(CoworkIpcChannel.SessionStart, async (event, options: {
    prompt: string;
    cwd?: string;
    systemPrompt?: string;
    title?: string;
    activeSkillIds?: string[];
    imageAttachments?: Array<{ name: string; mimeType: string; base64Data: string }>;
    messageMetadata?: Record<string, unknown>;
    agentId?: string;
    teamId?: string;
  }) => {
    try {
      const coworkStoreInstance = getCoworkStore();
      const config = coworkStoreInstance.getConfig();
      const targetAgentId = options.agentId || 'main';
      const activeEngine = options.teamId
        ? resolveCoworkAgentEngine()
        : resolveAgentRuntimeEngine(targetAgentId);
      const ready = await ensureCoworkEngineReady(activeEngine);
      if (!ready.success) {
        if (ready.engineStatus) {
          return getEngineNotReadyResponse(ready.engineStatus);
        }
        return { success: false, error: ready.error || 'Agent engine is not ready.' };
      }
      const systemPrompt = mergeCoworkSystemPrompt(
        activeEngine,
        options.systemPrompt ?? config.systemPrompt,
      );
      const selectedWorkspaceRoot = (options.cwd || config.workingDirectory || '').trim();

      if (!selectedWorkspaceRoot) {
        return {
          success: false,
          error: 'Please select a task folder before submitting.',
        };
      }
      applyExternalAgentConfigSourceForEngine(activeEngine);
      const runtimeSnapshot = resolveSessionRuntimeSnapshot(activeEngine);
      prepareRuntimeSnapshotForTurn(runtimeSnapshot);
      console.log(
        `[CoworkSession] starting session with ${getDesktopPetEngineLabel(activeEngine)} using ${runtimeSnapshot.configSource} config.`,
      );

      // Generate title from first line of prompt
      const fallbackTitle = options.prompt.split('\n')[0].slice(0, 50) || 'New Session';
      const title = options.title?.trim() || fallbackTitle;
      const taskWorkingDirectory = resolveTaskWorkingDirectory(selectedWorkspaceRoot);

      const session = coworkStoreInstance.createSession(
        title,
        taskWorkingDirectory,
        systemPrompt,
        config.executionMode || 'local',
        options.activeSkillIds || [],
        options.teamId ? `team:${options.teamId}` : targetAgentId,
        options.teamId
          ? {
            sessionKind: CoworkSessionKind.TeamParent,
          teamId: options.teamId,
          runtimeSnapshot,
        }
          : { runtimeSnapshot },
      );
      subscribeSenderToCoworkSession(event.sender, session.id);

      // Update session status to 'running' before starting async task
      // This ensures the frontend receives the correct status immediately
      coworkStoreInstance.updateSession(session.id, { status: 'running' });

      // Build metadata, include imageAttachments if present
      const messageMetadata: Record<string, unknown> = { ...(options.messageMetadata ?? {}) };
      if (options.activeSkillIds?.length) {
        messageMetadata.skillIds = options.activeSkillIds;
      }
      if (options.imageAttachments?.length) {
        messageMetadata.imageAttachments = options.imageAttachments;
      }
      coworkStoreInstance.addMessage(session.id, {
        type: 'user',
        content: options.prompt,
        metadata: Object.keys(messageMetadata).length > 0 ? messageMetadata : undefined,
      });
      updateDesktopPetTaskSnapshot(session.id, DesktopPetTaskStatus.Thinking);

      if (options.teamId) {
        getCoworkFileActivityTracker().startSession(session.id, taskWorkingDirectory);
        getAgentTeamRunner().run({
          teamId: options.teamId,
          parentSessionId: session.id,
          prompt: options.prompt,
          runtimeSource: RuntimeCallSource.Chat,
        }).catch(error => {
          console.error('[AgentTeamRunner] team session failed:', error);
          const existing = coworkStoreInstance.getSessionMeta(session.id);
          if (existing?.status === 'error') return;
          const errorMessage = error instanceof Error ? error.message : String(error);
          updateDesktopPetTaskSnapshot(session.id, DesktopPetTaskStatus.Error);
          broadcastCoworkError(session.id, errorMessage);
        });
        const sessionMeta = coworkStoreInstance.getSessionMeta(session.id) || {
          ...session,
          status: 'running' as const,
        };
        const sessionWithMessages = {
          ...sessionMeta,
          messages: coworkStoreInstance.getRecentMessages(session.id, 120),
        };
        return { success: true, session: sessionWithMessages };
      }

      // Update session status to 'running' before starting async task
      // This ensures the frontend receives the correct status immediately
      coworkStoreInstance.updateSession(session.id, { status: 'running' });

      // Start the session asynchronously (skip initial user message since we already added it)
      const runtime = getCoworkEngineRouter();
      getCoworkFileActivityTracker().startSession(session.id, taskWorkingDirectory);
      runtime.startSession(session.id, options.prompt, {
        skipInitialUserMessage: true,
        systemPrompt,
        skillIds: options.activeSkillIds,
        workspaceRoot: selectedWorkspaceRoot,
        confirmationMode: 'modal',
        imageAttachments: options.imageAttachments,
        messageMetadata: options.messageMetadata,
        agentId: targetAgentId,
        agentEngine: activeEngine,
        runtimeSnapshot,
      }).catch(error => {
        console.error('Cowork session error:', error);
        // The engine router already emits an 'error' event (handled at line ~990)
        // which sends cowork:stream:error to the renderer. Only send here if the
        // session hasn't been marked as error yet, to avoid duplicate messages.
        const existing = coworkStoreInstance.getSessionMeta(session.id);
        if (existing?.status === 'error') return;
        const errorMessage = error instanceof Error ? error.message : String(error);
        updateDesktopPetTaskSnapshot(session.id, DesktopPetTaskStatus.Error);
        sendCoworkStreamPayload(
          session.id,
          CoworkIpcChannel.StreamError,
          'error',
          { sessionId: session.id, error: errorMessage },
          { fallbackToAll: true },
        );
      });

      const sessionMeta = coworkStoreInstance.getSessionMeta(session.id) || {
        ...session,
        status: 'running' as const,
      };
      const sessionWithMessages = {
        ...sessionMeta,
        messages: coworkStoreInstance.getRecentMessages(session.id, 120),
      };
      return { success: true, session: sessionWithMessages };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start session',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.SessionContinue, async (event, options: {
    sessionId: string;
    prompt: string;
    systemPrompt?: string;
    activeSkillIds?: string[];
    imageAttachments?: Array<{ name: string; mimeType: string; base64Data: string }>;
    messageMetadata?: Record<string, unknown>;
  }) => {
    try {
      subscribeSenderToCoworkSession(event.sender, options.sessionId);
      const existingSession = getCoworkStore().getSessionMeta(options.sessionId);
      const inferredEngine = existingSession?.teamId
        ? resolveCoworkAgentEngine()
        : resolveAgentRuntimeEngine(existingSession?.agentId || 'main');
      const runtimeSnapshot = existingSession?.runtimeSnapshot
        ?? resolveSessionRuntimeSnapshot(inferredEngine);
      if (existingSession && !existingSession.runtimeSnapshot) {
        getCoworkStore().updateSession(options.sessionId, { runtimeSnapshot });
      }
      const activeEngine = runtimeSnapshot.agentEngine;
      const ready = await ensureCoworkEngineReady(activeEngine);
      if (!ready.success) {
        if (ready.engineStatus) {
          return getEngineNotReadyResponse(ready.engineStatus);
        }
        return { success: false, error: ready.error || 'Agent engine is not ready.' };
      }
      applyExternalAgentConfigSourceForEngine(activeEngine);
      prepareRuntimeSnapshotForTurn(runtimeSnapshot);
      console.log(
        `[CoworkSession] continuing session with ${getDesktopPetEngineLabel(activeEngine)} using ${runtimeSnapshot.configSource} config.`,
      );

      const runtime = getCoworkEngineRouter();
      if (existingSession?.cwd) {
        getCoworkFileActivityTracker().startSession(options.sessionId, existingSession.cwd);
      }
      updateDesktopPetTaskSnapshot(options.sessionId, DesktopPetTaskStatus.Thinking);
      if (existingSession?.teamId) {
        const messageMetadata: Record<string, unknown> = { ...(options.messageMetadata ?? {}) };
        if (options.activeSkillIds?.length) {
          messageMetadata.skillIds = options.activeSkillIds;
        }
        if (options.imageAttachments?.length) {
          messageMetadata.imageAttachments = options.imageAttachments;
        }
        const userMessage = getCoworkStore().addMessage(options.sessionId, {
          type: 'user',
          content: options.prompt,
          metadata: Object.keys(messageMetadata).length > 0 ? messageMetadata : undefined,
        });
        broadcastCoworkMessage(options.sessionId, userMessage);
        getCoworkStore().updateSession(options.sessionId, { status: 'running' });
        getAgentTeamRunner().run({
          teamId: existingSession.teamId,
          parentSessionId: options.sessionId,
          prompt: options.prompt,
          runtimeSource: RuntimeCallSource.Chat,
        }).catch(error => {
          console.error('[AgentTeamRunner] team continue failed:', error);
          const existing = getCoworkStore().getSessionMeta(options.sessionId);
          if (existing?.status === 'error') return;
          const errorMessage = error instanceof Error ? error.message : String(error);
          updateDesktopPetTaskSnapshot(options.sessionId, DesktopPetTaskStatus.Error);
          broadcastCoworkError(options.sessionId, errorMessage);
        });
        const sessionMeta = getCoworkStore().getSessionMeta(options.sessionId);
        const session = sessionMeta
          ? { ...sessionMeta, messages: getCoworkStore().getRecentMessages(options.sessionId, 120) }
          : null;
        return { success: true, session };
      }
      runtime.continueSession(options.sessionId, options.prompt, {
        systemPrompt: mergeCoworkSystemPrompt(
          activeEngine,
          options.systemPrompt ?? existingSession?.systemPrompt,
        ),
        skillIds: options.activeSkillIds,
        imageAttachments: options.imageAttachments,
        messageMetadata: options.messageMetadata,
        agentId: existingSession?.agentId || 'main',
        agentEngine: activeEngine,
        runtimeSnapshot,
      }).catch(error => {
        console.error('Cowork continue error:', error);
        // The engine router already emits an 'error' event (handled at line ~990)
        // which sends cowork:stream:error to the renderer. Only send here if the
        // session hasn't been marked as error yet, to avoid duplicate messages.
        const existing = getCoworkStore().getSessionMeta(options.sessionId);
        if (existing?.status === 'error') return;
        const errorMessage = error instanceof Error ? error.message : String(error);
        updateDesktopPetTaskSnapshot(options.sessionId, DesktopPetTaskStatus.Error);
        sendCoworkStreamPayload(
          options.sessionId,
          CoworkIpcChannel.StreamError,
          'error',
          { sessionId: options.sessionId, error: errorMessage },
          { fallbackToAll: true },
        );
      });

      const sessionMeta = getCoworkStore().getSessionMeta(options.sessionId);
      const session = sessionMeta
        ? { ...sessionMeta, messages: getCoworkStore().getRecentMessages(options.sessionId, 120) }
        : null;
      return { success: true, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to continue session',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.SessionStop, async (_event, sessionId: string) => {
    try {
      const runtime = getCoworkEngineRouter();
      runtime.stopSession(sessionId);
      getCoworkFileActivityTracker().stopSession(sessionId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop session',
      };
    }
  });

  ipcMain.handle('cowork:session:delete', async (_event, sessionId: string) => {
    try {
      getCoworkEngineRouter().stopSession(sessionId);
      getCoworkFileActivityTracker().stopSession(sessionId);
      const coworkStoreInstance = getCoworkStore();
      getRuntimeTelemetryStore().deleteBySession(sessionId);
      coworkStoreInstance.deleteSession(sessionId);
      // Clean up IM session mapping so that new channel messages
      // create a fresh session instead of referencing a deleted one.
      try {
        getIMGatewayManager()?.getIMStore()?.deleteSessionMappingByCoworkSessionId(sessionId);
      } catch {
        // IM store may not be initialised yet; safe to ignore.
      }
      // Notify runtime to purge in-memory caches for this session
      // so that channel messages can create a fresh session.
      try {
        getCoworkEngineRouter().onSessionDeleted(sessionId);
      } catch {
        // Router may not be initialised yet; safe to ignore.
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete session',
      };
    }
  });

  ipcMain.handle('cowork:session:deleteBatch', async (_event, sessionIds: string[]) => {
    try {
      const runtime = getCoworkEngineRouter();
      sessionIds.forEach((sessionId) => {
        runtime.stopSession(sessionId);
        getCoworkFileActivityTracker().stopSession(sessionId);
      });
      const coworkStoreInstance = getCoworkStore();
      getRuntimeTelemetryStore().deleteBySessions(sessionIds);
      coworkStoreInstance.deleteSessions(sessionIds);
      const router = getCoworkEngineRouter();
      for (const sessionId of sessionIds) {
        try {
          getIMGatewayManager()?.getIMStore()?.deleteSessionMappingByCoworkSessionId(sessionId);
        } catch {
          // IM store may not be initialised yet; safe to ignore.
        }
        try {
          router.onSessionDeleted(sessionId);
        } catch {
          // Router may not be initialised yet; safe to ignore.
        }
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to batch delete sessions',
      };
    }
  });

  ipcMain.handle('cowork:session:pin', async (_event, options: { sessionId: string; pinned: boolean }) => {
    try {
      const coworkStoreInstance = getCoworkStore();
      coworkStoreInstance.setSessionPinned(options.sessionId, options.pinned);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update session pin',
      };
    }
  });

  ipcMain.handle('cowork:session:rename', async (_event, options: { sessionId: string; title: string }) => {
    try {
      const title = options.title.trim();
      if (!title) {
        return { success: false, error: 'Title is required' };
      }
      const coworkStoreInstance = getCoworkStore();
      coworkStoreInstance.updateSession(options.sessionId, { title });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to rename session',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.SessionGet, async (_event, sessionId: string) => {
    try {
      const session = getCoworkStore().getSession(sessionId);
      return { success: true, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.SessionGetMeta, async (_event, sessionId: string) => {
    try {
      const session = getCoworkStore().getSessionMeta(sessionId);
      return { success: true, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session metadata',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.SessionGetRecentMessages, async (_event, input: { sessionId: string; limit?: number }) => {
    try {
      const messages = getCoworkStore().getRecentMessages(input.sessionId, input.limit);
      return { success: true, messages };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get recent messages',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.SessionGetMessagesAfter, async (_event, input: { sessionId: string; sequence: number }) => {
    try {
      const messages = getCoworkStore().getMessagesAfter(input.sessionId, input.sequence);
      return { success: true, messages };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get messages after sequence',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.SessionGetMessagesBefore, async (_event, input: { sessionId: string; sequence: number; limit?: number }) => {
    try {
      const messages = getCoworkStore().getMessagesBefore(input.sessionId, input.sequence, input.limit);
      return { success: true, messages };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get messages before sequence',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.SessionGetRuntimeSnapshot, async (_event, sessionId: string) => {
    try {
      const runtimeSnapshot = getCoworkStore().getSessionRuntimeSnapshot(sessionId);
      return { success: true, runtimeSnapshot };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session runtime snapshot',
      };
    }
  });

  ipcMain.handle('cowork:session:remoteManaged', async (_event, sessionId: string) => {
    try {
      const mapping = getIMGatewayManager()?.getIMStore()?.getSessionMappingByCoworkSessionId(sessionId);
      return { success: true, remoteManaged: !!mapping };
    } catch (error) {
      return {
        success: false,
        remoteManaged: false,
        error: error instanceof Error ? error.message : 'Failed to check remote managed session',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.SessionList, async (_event, agentId?: string) => {
    try {
      const sessions = getCoworkStore().listSessions(agentId);
      return { success: true, sessions };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list sessions',
      };
    }
  });

  // ========== Agent IPC Handlers ==========

  ipcMain.handle('agents:list', async () => {
    try {
      const agents = getAgentManager().listAgents();
      return { success: true, agents };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list agents' };
    }
  });

  ipcMain.handle('agents:get', async (_event, id: string) => {
    try {
      const agent = getAgentManager().getAgent(id);
      return { success: true, agent };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get agent' };
    }
  });

  ipcMain.handle('agents:create', async (_event, request: import('./coworkStore').CreateAgentRequest) => {
    try {
      const agent = getAgentManager().createAgent(request);
      // Sync config so workspace files (SOUL.md, IDENTITY.md) are written
      // before OpenClaw scaffolds default templates for the new agent.
      syncOpenClawConfig({ reason: 'agent-created' }).catch(() => {});
      return { success: true, agent };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create agent' };
    }
  });

  ipcMain.handle('agents:update', async (_event, id: string, updates: import('./coworkStore').UpdateAgentRequest) => {
    try {
      const agent = getAgentManager().updateAgent(id, updates);
      syncOpenClawConfig({ reason: 'agent-updated' }).catch(() => {});
      return { success: true, agent };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update agent' };
    }
  });

  ipcMain.handle('agents:delete', async (_event, id: string) => {
    try {
      const result = getAgentManager().deleteAgent(id);

      // Clean up IM platform bindings that reference the deleted agent
      // so that channels fall back to the default 'main' agent.
      try {
        const imStore = getIMGatewayManager()?.getIMStore();
        if (imStore) {
          const imSettings = imStore.getIMSettings();
          const bindings = imSettings.platformAgentBindings;
          if (bindings) {
            let changed = false;
            for (const [platform, agentId] of Object.entries(bindings)) {
              if (agentId === id || agentId === `agent:${id}`) {
                delete bindings[platform];
                changed = true;
              }
            }
            if (changed) {
              imStore.setIMSettings({ platformAgentBindings: bindings });
            }
          }
        }
      } catch {
        // IM store may not be initialised yet; safe to ignore.
      }

      syncOpenClawConfig({ reason: 'agent-deleted' }).catch(() => {});
      return { success: true, deleted: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete agent' };
    }
  });

  ipcMain.handle('agents:presets', async () => {
    try {
      const presets = getAgentManager().getPresetAgents();
      return { success: true, presets };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get presets' };
    }
  });

  ipcMain.handle('agents:addPreset', async (_event, presetId: string) => {
    try {
      const agent = getAgentManager().addPresetAgent(presetId);
      syncOpenClawConfig({ reason: 'agent-preset-added' }).catch(() => {});
      return { success: true, agent };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to add preset agent' };
    }
  });

  ipcMain.handle('agents:teams:list', async () => {
    try {
      const teams = getAgentManager().listAgentTeams();
      return { success: true, teams };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list agent teams' };
    }
  });

  ipcMain.handle('agents:teams:get', async (_event, id: string) => {
    try {
      const team = getAgentManager().getAgentTeam(id);
      return { success: true, team };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get agent team' };
    }
  });

  ipcMain.handle('agents:teams:create', async (_event, request: import('./coworkStore').CreateAgentTeamRequest) => {
    try {
      const team = getAgentManager().createAgentTeam(request);
      syncOpenClawConfig({ reason: 'agent-team-created' }).catch(() => {});
      return { success: true, team };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create agent team' };
    }
  });

  ipcMain.handle('agents:teams:update', async (_event, id: string, updates: import('./coworkStore').UpdateAgentTeamRequest) => {
    try {
      const team = getAgentManager().updateAgentTeam(id, updates);
      syncOpenClawConfig({ reason: 'agent-team-updated' }).catch(() => {});
      return { success: true, team };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update agent team' };
    }
  });

  ipcMain.handle('agents:teams:delete', async (_event, id: string) => {
    try {
      const deleted = getAgentManager().deleteAgentTeam(id);
      return { success: true, deleted };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete agent team' };
    }
  });

  ipcMain.handle('agents:teams:installDevelopmentTemplate', async () => {
    try {
      const team = getAgentManager().installDevelopmentTeamTemplate();
      syncOpenClawConfig({ reason: 'agent-team-template-installed' }).catch(() => {});
      return { success: true, team };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to install development team' };
    }
  });

  ipcMain.handle('cowork:session:exportResultImage', async (
    event,
    options: {
      rect: { x: number; y: number; width: number; height: number };
      defaultFileName?: string;
    }
  ) => {
    try {
      const { rect, defaultFileName } = options || {};
      const captureRect = normalizeCaptureRect(rect);
      if (!captureRect) {
        return { success: false, error: 'Capture rect is required' };
      }

      const image = await event.sender.capturePage(captureRect);
      return savePngWithDialog(event.sender, image.toPNG(), defaultFileName);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export session image',
      };
    }
  });

  ipcMain.handle('cowork:session:captureImageChunk', async (
    event,
    options: {
      rect: { x: number; y: number; width: number; height: number };
    }
  ) => {
    try {
      const captureRect = normalizeCaptureRect(options?.rect);
      if (!captureRect) {
        return { success: false, error: 'Capture rect is required' };
      }

      const image = await event.sender.capturePage(captureRect);
      const pngBuffer = image.toPNG();

      return {
        success: true,
        width: captureRect.width,
        height: captureRect.height,
        pngBase64: pngBuffer.toString('base64'),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to capture session image chunk',
      };
    }
  });

  ipcMain.handle('cowork:session:saveResultImage', async (
    event,
    options: {
      pngBase64: string;
      defaultFileName?: string;
    }
  ) => {
    try {
      const base64 = typeof options?.pngBase64 === 'string' ? options.pngBase64.trim() : '';
      if (!base64) {
        return { success: false, error: 'Image data is required' };
      }

      const pngBuffer = Buffer.from(base64, 'base64');
      if (pngBuffer.length <= 0) {
        return { success: false, error: 'Invalid image data' };
      }

      return savePngWithDialog(event.sender, pngBuffer, options?.defaultFileName);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save session image',
      };
    }
  });

  ipcMain.handle('cowork:clipboard:copy', async (
    _event,
    options: { text?: string; imageBase64?: string }
  ) => {
    try {
      const { clipboard, nativeImage } = require('electron');
      const { text, imageBase64 } = options || {};

      if (imageBase64) {
        const pngBuffer = Buffer.from(imageBase64, 'base64');
        const image = nativeImage.createFromBuffer(pngBuffer);
        if (image.isEmpty()) {
          return { success: false, error: 'Invalid image data' };
        }
        clipboard.write({ text: text || '', image });
      } else if (text) {
        clipboard.writeText(text);
      } else {
        return { success: false, error: 'Nothing to copy' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Clipboard write failed' };
    }
  });

  ipcMain.handle('cowork:session:exportText', async (
    event,
    options: {
      content: string;
      defaultFileName?: string;
      fileExtension?: string;
    }
  ) => {
    try {
      const content = typeof options?.content === 'string' ? options.content : '';
      if (!content) {
        return { success: false, error: 'Export content is empty' };
      }

      const ext = options?.fileExtension || 'md';
      const filterName = ext === 'json' ? 'JSON' : 'Markdown';
      const defaultName = options?.defaultFileName || `session-export.${ext}`;
      const ownerWindow = BrowserWindow.fromWebContents(event.sender);
      const saveOptions = {
        title: 'Export Session',
        defaultPath: path.join(app.getPath('downloads'), defaultName),
        filters: [{ name: filterName, extensions: [ext] }],
      };
      const saveResult = ownerWindow
        ? await dialog.showSaveDialog(ownerWindow, saveOptions)
        : await dialog.showSaveDialog(saveOptions);

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: true, canceled: true };
      }

      await fs.promises.writeFile(saveResult.filePath, content, 'utf-8');
      return { success: true, canceled: false, path: saveResult.filePath };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export session',
      };
    }
  });

  ipcMain.handle('cowork:permission:respond', async (_event, options: {
    requestId: string;
    result: PermissionResult;
  }) => {
    try {
      // Dual-dispatch pattern: permission responses arrive through one IPC channel
      // but may target either of two independent subsystems.
      //
      // - resolveAskUser() handles AskUserQuestion plugin requests routed through
      //   the McpBridgeServer HTTP callback. It is a no-op when the requestId does
      //   not match a pending bridge request (i.e. for normal SDK permission requests).
      //
      // - respondToPermission() handles standard Claude Agent SDK permission requests
      //   managed by the CoworkEngineRouter. It is a no-op when the requestId does
      //   not match a pending SDK permission (i.e. for bridge plugin requests).
      //
      // Both calls are safe to invoke unconditionally; exactly one will match.

      // AskUserQuestion plugin responses go to the bridge server, not the runtime
      if (mcpBridgeServer && options.requestId) {
        const result = options.result;
        const askUserResponse: import('./libs/mcpBridgeServer').AskUserResponse = {
          behavior: result.behavior === 'allow' ? 'allow' : 'deny',
          answers: result.behavior === 'allow' && result.updatedInput && typeof result.updatedInput === 'object'
            ? (result.updatedInput as Record<string, unknown>).answers as Record<string, string> | undefined
            : undefined,
        };
        mcpBridgeServer.resolveAskUser(options.requestId, askUserResponse);
      }

      const runtime = getCoworkEngineRouter();
      runtime.respondToPermission(options.requestId, options.result);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to respond to permission',
      };
    }
  });

  ipcMain.handle('cowork:config:get', async () => {
    try {
      const config = getCoworkStore().getConfig();
      return { success: true, config };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get config',
      };
    }
  });

  ipcMain.handle('cowork:agentEngines:list', async (_event, input: { forceRefresh?: unknown; appTypes?: unknown } = {}) => {
    try {
      const appTypes = normalizeAgentEngineSnapshotAppTypes(input?.appTypes);
      if (appTypes.length > 0) {
        return await getFilteredAgentEngineSnapshot(appTypes);
      }
      return getCachedAgentEngineSnapshot({ forceRefresh: input?.forceRefresh === true });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read agent engine status',
      };
    }
  });

  ipcMain.handle('codexApp:engine:getStatus', async () => {
    try {
      return { success: true, status: getCodexAppManager().getStatus() };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read Codex App status',
      };
    }
  });

  ipcMain.handle('codexApp:engine:start', async () => {
    try {
      const cwd = getCoworkStore().getConfig().workingDirectory || os.homedir();
      const status = await getCodexAppManager().start(cwd);
      if (status.phase !== 'error') {
        await getCodexAppServerClient().ensureConnected(cwd);
      }
      return { success: status.phase !== 'error', status: getCodexAppManager().getStatus(), error: status.error };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start Codex App',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.CodexAppTasksSync, async (_event, input: {
    cwd?: string;
    includeAll?: boolean;
    limit?: number;
  } = {}) => {
    try {
      const cwd = input.cwd || getCoworkStore().getConfig().workingDirectory || os.homedir();
      const result = await getCodexAppTaskSync().syncThreads({
        cwd,
        includeAll: Boolean(input.includeAll),
        limit: input.limit,
      });
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync Codex App tasks',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.CodexAppTaskOpen, async (_event, input: { threadId?: string }) => {
    try {
      const threadId = input.threadId?.trim();
      if (!threadId) {
        return { success: false, error: 'Codex App thread id is required.' };
      }
      const result = await getCodexAppTaskSync().openThread(threadId);
      broadcastCoworkSessionsChanged();
      return { success: true, sessionId: result.sessionId, threadId: result.threadId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open Codex App task',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.RuntimeMetricsSummary, async (_event, input: unknown) => {
    try {
      const filters = normalizeRuntimeMetricsFilters(input);
      return { success: true, summary: getRuntimeTelemetryStore().getSummary(filters) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load runtime metrics summary',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.RuntimeMetricsCalls, async (_event, input: unknown) => {
    try {
      const filters = normalizeRuntimeMetricsFilters(input);
      return { success: true, ...getRuntimeTelemetryStore().listCalls(filters) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load runtime calls',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.RuntimeMetricsDetail, async (_event, input: { callId?: unknown }) => {
    try {
      if (typeof input?.callId !== 'string' || !input.callId.trim()) {
        return { success: false, error: 'Invalid runtime call id.' };
      }
      return { success: true, ...getRuntimeTelemetryStore().getDetail(input.callId.trim()) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load runtime call detail',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.PerformanceRendererReady, async (_event, input: {
    firstPaintMs?: unknown;
    firstInteractiveMs?: unknown;
    configLoadedMs?: unknown;
    recentSessionsLoadedMs?: unknown;
  }) => {
    const firstPaintMs = Number(input?.firstPaintMs);
    if (Number.isFinite(firstPaintMs) && firstPaintMs >= 0) {
      markTimingValue('first_paint_ms', firstPaintMs);
    }
    const firstInteractiveMs = Number(input?.firstInteractiveMs);
    if (Number.isFinite(firstInteractiveMs) && firstInteractiveMs >= 0) {
      markTimingValue('first_interactive_ms', firstInteractiveMs);
    }
    const configLoadedMs = Number(input?.configLoadedMs);
    if (Number.isFinite(configLoadedMs) && configLoadedMs >= 0) {
      markTimingValue('config_loaded_ms', configLoadedMs);
    }
    const recentSessionsLoadedMs = Number(input?.recentSessionsLoadedMs);
    if (Number.isFinite(recentSessionsLoadedMs) && recentSessionsLoadedMs >= 0) {
      markTimingValue('recent_sessions_loaded_ms', recentSessionsLoadedMs);
    }
    return { success: true };
  });

  ipcMain.handle(CoworkIpcChannel.PerformanceSettingsMetric, async (_event, input: {
    type?: unknown;
    durationMs?: unknown;
    tab?: unknown;
    channel?: unknown;
    success?: unknown;
    error?: unknown;
    triggeredRuntimeStart?: unknown;
  }) => {
    const type = input?.type;
    if (type !== 'open' && type !== 'interactive' && type !== 'tabLoad' && type !== 'ipc') {
      return { success: false, error: 'Invalid settings metric type' };
    }
    const durationMs = Number(input.durationMs);
    recordSettingsMetric({
      type,
      durationMs: Number.isFinite(durationMs) ? durationMs : 0,
      tab: typeof input.tab === 'string' ? input.tab.slice(0, 80) : undefined,
      channel: typeof input.channel === 'string' ? input.channel.slice(0, 120) : undefined,
      success: typeof input.success === 'boolean' ? input.success : undefined,
      error: typeof input.error === 'string' ? input.error : undefined,
      triggeredRuntimeStart: input.triggeredRuntimeStart === true,
    });
    return { success: true };
  });

  ipcMain.handle(CoworkIpcChannel.StartupServicesStatus, async () => ({
    success: true,
    services: getStartupServicesSnapshot(),
  }));

  ipcMain.handle(CoworkIpcChannel.StudioAssetsEnsure, async () => {
    return ensureCoworkStudioAssets();
  });

  ipcMain.handle(CoworkIpcChannel.AgentCliInstall, async (_event, input: { appType?: unknown }) => {
    try {
      if (!isExternalAgentProviderAppType(input?.appType)) {
        return { success: false, error: 'Invalid agent CLI app type.' };
      }
      bindExternalAgentCliInstallerForwarder();
      const result = await getExternalAgentCliInstaller().install(input.appType);
      if (result.success && input.appType === 'hermes') {
        getCoworkStore().setConfig({ hermesConfigSource: ExternalAgentConfigSource.WesightModel });
        getHermesConfigSync().sync('agent-cli-install');
        bindHermesStatusForwarder();
        await getHermesEngineManager().ensureReady();
      }
      if (result.success && input.appType === 'openclaw') {
        getCoworkStore().setConfig({ openclawConfigSource: ExternalAgentConfigSource.WesightModel });
        bindOpenClawStatusForwarder();
        await getOpenClawEngineManager().ensureReady();
      }
      if (result.snapshot) {
        agentEngineSnapshotCache = mergeCodexAppStatus(result.snapshot);
        agentEngineSnapshotCachedAt = Date.now();
        agentEngineSnapshotLastError = null;
        broadcastAgentEngineSnapshotChanged({
          success: true,
          snapshot: agentEngineSnapshotCache,
          refreshing: false,
          cachedAt: agentEngineSnapshotCachedAt,
        });
      }
      refreshAgentEngineSnapshotInBackground(true);
      return {
        ...result,
        snapshot: agentEngineSnapshotCache ?? result.snapshot,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to install agent CLI',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.AgentConfigImportLocalToModelSettings, async (_event, input: { appType?: unknown }) => {
    try {
      if (!isExternalAgentProviderAppType(input?.appType)) {
        return { success: false, error: 'Invalid agent CLI app type.' };
      }
      if (input.appType === 'openclaw') {
        return {
          success: false,
          imported: false,
          error: 'OpenClaw local config import is not available yet. Use Local CLI Config to keep your existing OpenClaw setup.',
        };
      }
      const result = importLocalAgentConfigToModelSettings(getStore(), input.appType);
      if (result.imported) {
        refreshEndpointsTestMode(getStore());
        const syncResult = await syncOpenClawConfig({
          reason: 'agent-local-config-import',
          restartGatewayIfRunning: false,
        });
        if (!syncResult.success) {
          console.warn('[ExternalAgentConfigSync] OpenClaw config sync after model import failed:', syncResult.error);
        }
      }
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import local agent config to model settings',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.AgentConfigSyncOpenClawGlobal, async () => {
    try {
      getCoworkStore().setConfig({ openclawConfigSource: ExternalAgentConfigSource.WesightModel });
      const syncResult = await syncOpenClawConfig({
        reason: 'manual-openclaw-model-sync',
        restartGatewayIfRunning: false,
      });
      return {
        success: syncResult.success,
        changed: syncResult.changed,
        status: syncResult.status ?? getOpenClawEngineManager().getStatus(),
        error: syncResult.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync OpenClaw config',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.AgentConfigSyncOpenCodeGlobal, async () => {
    try {
      syncOpenCodeGlobalConfigFromWesightModel();
      const list = getExternalAgentProviderStore().listProviders('opencode');
      return { success: true, ...list };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync OpenCode config',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.AgentConfigSyncQwenCodeGlobal, async () => {
    try {
      syncQwenCodeGlobalConfigFromWesightModel();
      const list = getExternalAgentProviderStore().listProviders('qwen');
      return { success: true, ...list };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync Qwen Code config',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.AgentConfigSyncDeepSeekTuiGlobal, async () => {
    try {
      syncDeepSeekTuiGlobalConfigFromWesightModel();
      const list = getExternalAgentProviderStore().listProviders('deepseek_tui');
      return { success: true, ...list };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync DeepSeek-TUI config',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.AgentProvidersList, async (_event, input: { appType?: unknown }) => {
    try {
      if (!isExternalAgentProviderAppType(input?.appType)) {
        return { success: false, error: 'Invalid agent provider app type.' };
      }
      const result = getExternalAgentProviderStore().listProviders(input.appType);
      return { success: true, ...result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list agent providers',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.AgentProvidersSave, async (_event, input: ExternalAgentProviderInput) => {
    try {
      if (!isExternalAgentProviderAppType(input?.appType)) {
        return { success: false, error: 'Invalid agent provider app type.' };
      }
      const provider = getExternalAgentProviderStore().saveProvider(input);
      const list = getExternalAgentProviderStore().listProviders(input.appType);
      return { success: true, provider, ...list };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save agent provider',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.AgentProvidersDelete, async (_event, input: { appType?: unknown; id?: unknown }) => {
    try {
      if (!isExternalAgentProviderAppType(input?.appType) || typeof input?.id !== 'string') {
        return { success: false, error: 'Invalid agent provider delete request.' };
      }
      getExternalAgentProviderStore().deleteProvider(input.appType, input.id);
      const list = getExternalAgentProviderStore().listProviders(input.appType);
      return { success: true, ...list };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete agent provider',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.AgentProvidersSetCurrent, async (_event, input: { appType?: unknown; id?: unknown }) => {
    try {
      if (!isExternalAgentProviderAppType(input?.appType) || typeof input?.id !== 'string') {
        return { success: false, error: 'Invalid agent provider switch request.' };
      }
      const provider = getExternalAgentProviderStore().setCurrentProvider(input.appType, input.id);
      const list = getExternalAgentProviderStore().listProviders(input.appType);
      return { success: true, provider, ...list };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to switch agent provider',
      };
    }
  });

  ipcMain.handle(CoworkIpcChannel.AgentProvidersImportLive, async (_event, input: { appType?: unknown }) => {
    try {
      if (!isExternalAgentProviderAppType(input?.appType)) {
        return { success: false, error: 'Invalid agent provider app type.' };
      }
      const provider = getExternalAgentProviderStore().importLiveProvider(input.appType);
      const list = getExternalAgentProviderStore().listProviders(input.appType);
      return { success: true, provider, ...list };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import local agent provider',
      };
    }
  });

  ipcMain.handle('cowork:memory:listEntries', async (_event, input: {
    query?: string;
    status?: 'created' | 'stale' | 'deleted' | 'all';
    includeDeleted?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    try {
      const config = getCoworkStore().getConfig();
      const filePath = resolveMemoryFilePath(config.workingDirectory);

      // Lazy migration: SQLite → MEMORY.md (one-time, cached in memory)
      if (!memoryMigrationDone) {
        migrateSqliteToMemoryMd(filePath, {
          isMigrationDone: () => getStore().get<string>('openclawMemory.migration.v1.completed') === '1',
          markMigrationDone: () => {
            getStore().set('openclawMemory.migration.v1.completed', '1');
            memoryMigrationDone = true;
          },
          getActiveMemoryTexts: () => {
            return getCoworkStore().listUserMemories({ status: 'all', includeDeleted: false, limit: 200 })
              .map((m) => m.text);
          },
        });
        // Even if migration found nothing, skip future checks this session
        memoryMigrationDone = true;
      }

      const query = input?.query?.trim() || '';
      const entries = query
        ? searchMemoryEntries(filePath, query)
        : readMemoryEntries(filePath);
      return { success: true, entries };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list memory entries',
      };
    }
  });
  ipcMain.handle('cowork:memory:createEntry', async (_event, input: {
    text: string;
    confidence?: number;
    isExplicit?: boolean;
  }) => {
    try {
      const config = getCoworkStore().getConfig();
      const filePath = resolveMemoryFilePath(config.workingDirectory);
      const entry = addMemoryEntry(filePath, input.text);
      return { success: true, entry };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create memory entry',
      };
    }
  });
  ipcMain.handle('cowork:memory:updateEntry', async (_event, input: {
    id: string;
    text?: string;
    confidence?: number;
    status?: 'created' | 'stale' | 'deleted';
    isExplicit?: boolean;
  }) => {
    try {
      const config = getCoworkStore().getConfig();
      const filePath = resolveMemoryFilePath(config.workingDirectory);
      if (!input.text) {
        return { success: false, error: 'Memory text is required' };
      }
      const entry = updateMemoryEntry(filePath, input.id, input.text);
      if (!entry) {
        return { success: false, error: 'Memory entry not found' };
      }
      return { success: true, entry };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update memory entry',
      };
    }
  });
  ipcMain.handle('cowork:memory:deleteEntry', async (_event, input: {
    id: string;
  }) => {
    try {
      const config = getCoworkStore().getConfig();
      const filePath = resolveMemoryFilePath(config.workingDirectory);
      const success = deleteMemoryEntry(filePath, input.id);
      return success
        ? { success: true }
        : { success: false, error: 'Memory entry not found' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete memory entry',
      };
    }
  });
  ipcMain.handle('cowork:memory:getStats', async () => {
    try {
      const config = getCoworkStore().getConfig();
      const filePath = resolveMemoryFilePath(config.workingDirectory);
      const entries = readMemoryEntries(filePath);
      return {
        success: true,
        stats: {
          total: entries.length,
          created: entries.length,
          stale: 0,
          deleted: 0,
          explicit: entries.length,
          implicit: 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get memory stats',
      };
    }
  });
  ipcMain.handle('cowork:bootstrap:read', async (_event, filename: string) => {
    try {
      const config = getCoworkStore().getConfig();
      const content = readBootstrapFile(config.workingDirectory, filename);
      return { success: true, content };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : 'Failed to read bootstrap file',
      };
    }
  });
  ipcMain.handle('cowork:bootstrap:write', async (_event, filename: string, content: string) => {
    try {
      const config = getCoworkStore().getConfig();
      writeBootstrapFile(config.workingDirectory, filename, content);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write bootstrap file',
      };
    }
  });
  ipcMain.handle('cowork:config:set', async (_event, config: {
    workingDirectory?: string;
    executionMode?: 'auto' | 'local' | 'sandbox';
    agentEngine?: CoworkAgentEngine;
    claudeCodeConfigSource?: unknown;
    claudeCodePermissionMode?: unknown;
    codexConfigSource?: unknown;
    hermesConfigSource?: unknown;
    opencodeConfigSource?: unknown;
    opencodePermissionMode?: unknown;
    qwenCodeConfigSource?: unknown;
    qwenCodePermissionMode?: unknown;
    deepseekTuiConfigSource?: unknown;
    deepseekTuiPermissionMode?: unknown;
    memoryEnabled?: boolean;
    memoryImplicitUpdateEnabled?: boolean;
    memoryLlmJudgeEnabled?: boolean;
    memoryGuardLevel?: 'strict' | 'standard' | 'relaxed';
    memoryUserMemoriesMaxItems?: number;
  }) => {
    try {
      const normalizedExecutionMode =
        config.executionMode && String(config.executionMode) === 'container'
          ? 'local'
          : config.executionMode;
      const normalizedAgentEngine = isCoworkAgentEngine(config.agentEngine)
        ? config.agentEngine
        : undefined;
      const normalizedClaudeCodeConfigSource = isExternalAgentConfigSource(config.claudeCodeConfigSource)
        ? config.claudeCodeConfigSource
        : undefined;
      const normalizedClaudeCodePermissionMode = isClaudeCodePermissionMode(config.claudeCodePermissionMode)
        ? config.claudeCodePermissionMode
        : undefined;
      const normalizedCodexConfigSource = isExternalAgentConfigSource(config.codexConfigSource)
        ? config.codexConfigSource
        : undefined;
      const normalizedHermesConfigSource = isExternalAgentConfigSource(config.hermesConfigSource)
        ? config.hermesConfigSource
        : undefined;
      const normalizedOpenCodeConfigSource = isExternalAgentConfigSource(config.opencodeConfigSource)
        ? config.opencodeConfigSource
        : undefined;
      const normalizedOpenCodePermissionMode = isOpenCodePermissionMode(config.opencodePermissionMode)
        ? config.opencodePermissionMode
        : undefined;
      const normalizedQwenCodeConfigSource = isExternalAgentConfigSource(config.qwenCodeConfigSource)
        ? config.qwenCodeConfigSource
        : undefined;
      const normalizedQwenCodePermissionMode = isQwenCodePermissionMode(config.qwenCodePermissionMode)
        ? config.qwenCodePermissionMode
        : undefined;
      const normalizedDeepSeekTuiConfigSource = isExternalAgentConfigSource(config.deepseekTuiConfigSource)
        ? config.deepseekTuiConfigSource
        : undefined;
      const normalizedDeepSeekTuiPermissionMode = isDeepSeekTuiPermissionMode(config.deepseekTuiPermissionMode)
        ? config.deepseekTuiPermissionMode
        : undefined;
      const normalizedMemoryEnabled = typeof config.memoryEnabled === 'boolean'
        ? config.memoryEnabled
        : undefined;
      const normalizedMemoryImplicitUpdateEnabled = typeof config.memoryImplicitUpdateEnabled === 'boolean'
        ? config.memoryImplicitUpdateEnabled
        : undefined;
      const normalizedMemoryLlmJudgeEnabled = typeof config.memoryLlmJudgeEnabled === 'boolean'
        ? config.memoryLlmJudgeEnabled
        : undefined;
      const normalizedMemoryGuardLevel = config.memoryGuardLevel === 'strict'
        || config.memoryGuardLevel === 'standard'
        || config.memoryGuardLevel === 'relaxed'
        ? config.memoryGuardLevel
        : undefined;
      const normalizedMemoryUserMemoriesMaxItems =
        typeof config.memoryUserMemoriesMaxItems === 'number' && Number.isFinite(config.memoryUserMemoriesMaxItems)
          ? Math.max(
            MIN_MEMORY_USER_MEMORIES_MAX_ITEMS,
            Math.min(MAX_MEMORY_USER_MEMORIES_MAX_ITEMS, Math.floor(config.memoryUserMemoriesMaxItems))
          )
        : undefined;
      const normalizedConfig: Parameters<CoworkStore['setConfig']>[0] = {
        ...config,
        executionMode: normalizedExecutionMode,
        agentEngine: normalizedAgentEngine,
        claudeCodeConfigSource: normalizedClaudeCodeConfigSource,
        claudeCodePermissionMode: normalizedClaudeCodePermissionMode,
        codexConfigSource: normalizedCodexConfigSource,
        hermesConfigSource: normalizedHermesConfigSource,
        opencodeConfigSource: normalizedOpenCodeConfigSource,
        opencodePermissionMode: normalizedOpenCodePermissionMode,
        qwenCodeConfigSource: normalizedQwenCodeConfigSource,
        qwenCodePermissionMode: normalizedQwenCodePermissionMode,
        deepseekTuiConfigSource: normalizedDeepSeekTuiConfigSource,
        deepseekTuiPermissionMode: normalizedDeepSeekTuiPermissionMode,
        memoryEnabled: normalizedMemoryEnabled,
        memoryImplicitUpdateEnabled: normalizedMemoryImplicitUpdateEnabled,
        memoryLlmJudgeEnabled: normalizedMemoryLlmJudgeEnabled,
        memoryGuardLevel: normalizedMemoryGuardLevel,
        memoryUserMemoriesMaxItems: normalizedMemoryUserMemoriesMaxItems,
      };
      const previousConfig = getCoworkStore().getConfig();
      const previousWorkingDir = previousConfig.workingDirectory;
      const nextConfigPreview = { ...previousConfig };
      if (normalizedAgentEngine !== undefined) {
        nextConfigPreview.agentEngine = normalizedAgentEngine;
      }
      if (normalizedClaudeCodeConfigSource !== undefined) {
        nextConfigPreview.claudeCodeConfigSource = normalizedClaudeCodeConfigSource;
      }
      if (normalizedClaudeCodePermissionMode !== undefined) {
        nextConfigPreview.claudeCodePermissionMode = normalizedClaudeCodePermissionMode;
      }
      if (normalizedCodexConfigSource !== undefined) {
        nextConfigPreview.codexConfigSource = normalizedCodexConfigSource;
      }
      if (normalizedHermesConfigSource !== undefined) {
        nextConfigPreview.hermesConfigSource = normalizedHermesConfigSource;
      }
      if (normalizedOpenCodeConfigSource !== undefined) {
        nextConfigPreview.opencodeConfigSource = normalizedOpenCodeConfigSource;
      }
      if (normalizedOpenCodePermissionMode !== undefined) {
        nextConfigPreview.opencodePermissionMode = normalizedOpenCodePermissionMode;
      }
      if (normalizedQwenCodeConfigSource !== undefined) {
        nextConfigPreview.qwenCodeConfigSource = normalizedQwenCodeConfigSource;
      }
      if (normalizedQwenCodePermissionMode !== undefined) {
        nextConfigPreview.qwenCodePermissionMode = normalizedQwenCodePermissionMode;
      }
      if (normalizedDeepSeekTuiConfigSource !== undefined) {
        nextConfigPreview.deepseekTuiConfigSource = normalizedDeepSeekTuiConfigSource;
      }
      if (normalizedDeepSeekTuiPermissionMode !== undefined) {
        nextConfigPreview.deepseekTuiPermissionMode = normalizedDeepSeekTuiPermissionMode;
      }
      const shouldApplyExternalAgentConfig =
        (nextConfigPreview.agentEngine === CoworkAgentEngineValue.ClaudeCode
          && (normalizedAgentEngine !== undefined || normalizedClaudeCodeConfigSource !== undefined))
        || (nextConfigPreview.agentEngine === CoworkAgentEngineValue.Codex
          && (normalizedAgentEngine !== undefined || normalizedCodexConfigSource !== undefined))
        || (nextConfigPreview.agentEngine === CoworkAgentEngineValue.OpenCode
          && (normalizedAgentEngine !== undefined || normalizedOpenCodeConfigSource !== undefined))
        || (nextConfigPreview.agentEngine === CoworkAgentEngineValue.QwenCode
          && (normalizedAgentEngine !== undefined || normalizedQwenCodeConfigSource !== undefined))
        || (nextConfigPreview.agentEngine === CoworkAgentEngineValue.DeepSeekTui
          && (normalizedAgentEngine !== undefined || normalizedDeepSeekTuiConfigSource !== undefined));
      if (shouldApplyExternalAgentConfig) {
        const source = nextConfigPreview.agentEngine === CoworkAgentEngineValue.ClaudeCode
          ? nextConfigPreview.claudeCodeConfigSource
          : nextConfigPreview.agentEngine === CoworkAgentEngineValue.Codex
            ? nextConfigPreview.codexConfigSource
            : nextConfigPreview.agentEngine === CoworkAgentEngineValue.OpenCode
              ? nextConfigPreview.opencodeConfigSource
              : nextConfigPreview.agentEngine === CoworkAgentEngineValue.QwenCode
                ? nextConfigPreview.qwenCodeConfigSource
                : nextConfigPreview.deepseekTuiConfigSource;
        applyExternalAgentConfigForEngine(nextConfigPreview.agentEngine, source);
      }
      getCoworkStore().setConfig(normalizedConfig);
      if (normalizedConfig.workingDirectory !== undefined && normalizedConfig.workingDirectory !== previousWorkingDir) {
        getSkillManager().handleWorkingDirectoryChange();
        // Sync MEMORY.md to new workspace directory
        const syncResult = syncMemoryFileOnWorkspaceChange(previousWorkingDir, normalizedConfig.workingDirectory);
        if (syncResult.error) {
          console.warn('[OpenClaw Memory] Workspace sync failed:', syncResult.error);
        }
        // Ensure IDENTITY.md has default content in the new workspace
        try {
          ensureDefaultIdentity(normalizedConfig.workingDirectory);
        } catch (err) {
          console.warn('[OpenClaw] ensureDefaultIdentity failed (non-fatal):', err);
        }
      }

      const nextConfig = getCoworkStore().getConfig();
      if (normalizedAgentEngine !== undefined && normalizedAgentEngine !== previousConfig.agentEngine) {
        getCoworkEngineRouter().handleEngineConfigChanged(normalizedAgentEngine);
      }
      const switchedToOpenClaw = normalizedAgentEngine === CoworkAgentEngineValue.OpenClaw
        && previousConfig.agentEngine !== CoworkAgentEngineValue.OpenClaw;
      const switchedToHermes = normalizedAgentEngine === CoworkAgentEngineValue.Hermes
        && previousConfig.agentEngine !== CoworkAgentEngineValue.Hermes;
      const switchedAwayFromHermes = normalizedAgentEngine !== undefined
        && previousConfig.agentEngine === CoworkAgentEngineValue.Hermes
        && normalizedAgentEngine !== CoworkAgentEngineValue.Hermes;

      const openClawConfigRelevant = normalizedAgentEngine === CoworkAgentEngineValue.OpenClaw
        || previousConfig.agentEngine === CoworkAgentEngineValue.OpenClaw
        || nextConfig.agentEngine === CoworkAgentEngineValue.OpenClaw;
      const shouldSyncOpenClawConfig = openClawConfigRelevant
        && (normalizedExecutionMode !== undefined
          || normalizedAgentEngine !== undefined
          || (normalizedConfig.workingDirectory !== undefined && normalizedConfig.workingDirectory !== previousWorkingDir));
      if (shouldSyncOpenClawConfig) {
        const syncResult = await syncOpenClawConfig({
          reason: 'cowork-config-change',
          restartGatewayIfRunning: normalizedAgentEngine !== undefined,
        });
        if (!syncResult.success && nextConfig.agentEngine === CoworkAgentEngineValue.OpenClaw) {
          return {
            success: false,
            code: ENGINE_NOT_READY_CODE,
            error: syncResult.error || 'OpenClaw config sync failed.',
            engineStatus: syncResult.status || getOpenClawEngineManager().getStatus(),
          };
        }
      }

      const hermesConfigRelevant = normalizedAgentEngine === CoworkAgentEngineValue.Hermes
        || previousConfig.agentEngine === CoworkAgentEngineValue.Hermes
        || nextConfig.agentEngine === CoworkAgentEngineValue.Hermes;
      const shouldSyncHermesConfig = hermesConfigRelevant
        && (normalizedExecutionMode !== undefined
          || normalizedAgentEngine !== undefined
          || normalizedHermesConfigSource !== undefined
          || (normalizedConfig.workingDirectory !== undefined && normalizedConfig.workingDirectory !== previousWorkingDir));
      if (shouldSyncHermesConfig) {
        const syncResult = getHermesConfigSync().sync('cowork-config-change');
        if (!syncResult.success && nextConfig.agentEngine === CoworkAgentEngineValue.Hermes) {
          return {
            success: false,
            code: ENGINE_NOT_READY_CODE,
            error: syncResult.error || 'Hermes Agent config sync failed.',
            engineStatus: syncResult.status || getHermesEngineManager().getStatus(),
          };
        }
      }

      if (switchedToOpenClaw) {
        void ensureOpenClawRunningForCowork().catch((error) => {
          console.error('[OpenClaw] Failed to auto-start gateway after engine switch:', error);
        });
      }
      if (switchedToHermes) {
        void ensureHermesRunningForCowork()
          .then((status) => {
            if (status.phase === 'running') {
              startHermesIMSessionSyncPolling();
              void syncHermesIMSessionsToCowork('engine-switch');
            }
          })
          .catch((error) => {
            console.error('[Hermes] Failed to auto-start gateway after engine switch:', error);
          });
      }
      if (switchedAwayFromHermes) {
        stopHermesIMSessionSyncPolling();
        if (isFeishuEngineManagedByWeSight(FeishuEngineKey.Hermes)) {
          void getHermesEngineManager().stopGateway().catch((error) => {
            console.error('[Hermes] Failed to stop gateway after engine switch:', error);
          });
        }
      }
      if (normalizedAgentEngine !== undefined && normalizedAgentEngine !== previousConfig.agentEngine) {
        void getIMGatewayManager().startAllEnabled().catch((error) => {
          console.error('[IM] Failed to reconcile enabled gateways after engine switch:', error);
        });
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set config',
      };
    }
  });

  // ==================== Scheduled Task IPC Handlers (OpenClaw) ====================

  initCronJobServiceManager({
    getOpenClawRuntimeAdapter: () => openClawRuntimeAdapter,
  });
  initScheduledTaskHelpers({
    getIMGatewayManager: () => getIMGatewayManager() as any,
  });
  registerScheduledTaskHandlers({
    getCronJobService,
    getIMGatewayManager: () => getIMGatewayManager() as any,
    getOpenClawRuntimeAdapter: () => openClawRuntimeAdapter as any,
  });

  // ==================== Creator Studio IPC Handlers ====================

  registerCreatorStudioIpcHandlers(ipcMain, getCreatorAssetStore);

  // ==================== Permissions IPC Handlers ====================

  ipcMain.handle('permissions:checkCalendar', async () => {
    try {
      const status = await checkCalendarPermission();

      // Development mode: Auto-request permission if not determined
      // This provides a better dev experience without affecting production
      if (isDev && status === 'not-determined' && process.platform === 'darwin') {
        console.log('[Permissions] Development mode: Auto-requesting calendar permission...');
        try {
          await requestCalendarPermission();
          const newStatus = await checkCalendarPermission();
          console.log('[Permissions] Development mode: Permission status after request:', newStatus);
          return { success: true, status: newStatus, autoRequested: true };
        } catch (requestError) {
          console.warn('[Permissions] Development mode: Auto-request failed:', requestError);
        }
      }

      return { success: true, status };
    } catch (error) {
      console.error('[Main] Error checking calendar permission:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to check permission' };
    }
  });

  ipcMain.handle('permissions:requestCalendar', async () => {
    try {
      // Request permission and check status
      const granted = await requestCalendarPermission();
      const status = await checkCalendarPermission();
      return { success: true, granted, status };
    } catch (error) {
      console.error('[Main] Error requesting calendar permission:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to request permission' };
    }
  });

  // ==================== IM Gateway IPC Handlers ====================

  ipcMain.handle('im:config:get', async () => {
    try {
      const config = getIMGatewayManager().getConfig();
      return { success: true, config };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get IM config',
      };
    }
  });

  // Debounce + serialization for im:config:set → syncOpenClawConfig.
  // Rapid sequential config changes (e.g. toggling 4 platforms) are coalesced
  // into a single gateway restart instead of N restarts.
  // The running/pending flags prevent concurrent sync operations from racing:
  // if a sync is in progress when new changes arrive, they are queued and
  // a follow-up sync runs after the current one completes.
  let imConfigSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let imConfigSyncRunning = false;
  let imConfigSyncPending = false;
  const IM_CONFIG_SYNC_DEBOUNCE_MS = 600;

  const hasEnabledOpenClawManagedIMPlatform = (): boolean => {
    const config = getIMGatewayManager().getConfig();
    const feishuManagedByOpenClaw = resolveFeishuIMAgentEngine() === CoworkAgentEngineValue.OpenClaw;
    const feishuManagedByWeSight = isFeishuEngineManagedByWeSight(FeishuEngineKey.OpenClaw);
    const localOpenClawFeishuEnabled = feishuManagedByOpenClaw
      && !feishuManagedByWeSight
      && Boolean(getOpenClawEngineManager().getLocalChannelStatus().feishuConfigured);
    return Boolean(
      config.dingtalk?.instances?.some(i => i.enabled && i.clientId && i.clientSecret)
      || localOpenClawFeishuEnabled
      || (feishuManagedByOpenClaw && feishuManagedByWeSight && config.feishu?.instances?.some(i => i.enabled && i.appId && i.appSecret))
      || (config.telegram?.enabled && config.telegram.botToken)
      || (config.discord?.enabled && config.discord.botToken)
      || config.qq?.instances?.some(i => i.enabled && i.appId && i.appSecret)
      || (config.wecom?.enabled && config.wecom.botId && config.wecom.secret)
      || config.weixin?.enabled
      || (config.popo?.enabled && config.popo.appKey && config.popo.appSecret && config.popo.aesKey)
      || (config.nim?.enabled && config.nim.appKey && config.nim.account && config.nim.token)
      || (config['netease-bee']?.enabled && config['netease-bee'].clientId && config['netease-bee'].secret)
    );
  };

  const doImConfigSync = async () => {
    imConfigSyncRunning = true;
    try {
      await syncOpenClawConfig({
        reason: 'im-config-change',
        restartGatewayIfRunning: true,
      });
      // After config sync, ensure the runtime adapter's WebSocket client
      // is connected so channel events are received.
      if (openClawRuntimeAdapter && hasEnabledOpenClawManagedIMPlatform()) {
        try {
          await openClawRuntimeAdapter.connectGatewayIfNeeded();
        } catch (connectError) {
          console.error('[IM] Failed to connect gateway client after config sync:', connectError);
        }
      }
      if (isFeishuEngineManagedByWeSight(FeishuEngineKey.Hermes)) {
        const hermesSyncResult = getHermesConfigSync().sync('im-config-change');
        if (!hermesSyncResult.success) {
          throw new Error(hermesSyncResult.error || 'Hermes Agent config sync failed.');
        }
        const hermesStatus = getHermesEngineManager().getStatus();
        if (hermesSyncResult.changed && hermesStatus.phase === 'running') {
          const restarted = await getHermesEngineManager().restartGateway();
          if (restarted.phase !== 'running') {
            throw new Error(restarted.message || 'Hermes Agent gateway failed to restart after IM config sync.');
          }
        }
      }
      const feishuAgentEngine = resolveFeishuIMAgentEngine();
      if (feishuAgentEngine === CoworkAgentEngineValue.Hermes) {
        startHermesIMSessionSyncPolling();
        void syncHermesIMSessionsToCowork('im-config-change');
      } else if (
        feishuAgentEngine === CoworkAgentEngineValue.ClaudeCode
        || feishuAgentEngine === CoworkAgentEngineValue.Codex
      ) {
        await getIMGatewayManager().startAllEnabled();
      }
    } catch (error) {
      console.error('[IM] Debounced config sync failed:', error);
    } finally {
      imConfigSyncRunning = false;
      if (imConfigSyncPending) {
        imConfigSyncPending = false;
        scheduleImConfigSync();
      }
    }
  };

  const scheduleImConfigSync = () => {
    if (imConfigSyncRunning) {
      // A sync is already in progress; mark pending so it re-runs after completion.
      imConfigSyncPending = true;
      return;
    }
    if (imConfigSyncTimer) clearTimeout(imConfigSyncTimer);
    imConfigSyncTimer = setTimeout(() => {
      imConfigSyncTimer = null;
      void doImConfigSync();
    }, IM_CONFIG_SYNC_DEBOUNCE_MS);
  };

  const shouldSyncRunningIMGatewayConfig = () => (
    getOpenClawEngineManager().getStatus().phase === 'running'
    || getHermesEngineManager().getStatus().phase === 'running'
    || resolveFeishuIMAgentEngine() === CoworkAgentEngineValue.Hermes
    || resolveFeishuIMAgentEngine() === CoworkAgentEngineValue.ClaudeCode
    || resolveFeishuIMAgentEngine() === CoworkAgentEngineValue.Codex
  );

  ipcMain.handle('im:config:set', async (_event, config: Partial<IMGatewayConfig>, options?: { syncGateway?: boolean }) => {
    try {
      getIMGatewayManager().setConfig(config, { syncGateway: options?.syncGateway });

      // Sync OpenClaw config once for all platform changes (instead of per-platform).
      // setConfig() already persists to DB synchronously, so syncOpenClawConfig just
      // needs to regenerate openclaw.json and restart the gateway once.
      // Only trigger sync when explicitly requested via syncGateway flag (e.g. from
      // the global Save button), to avoid frequent gateway restarts on every field blur.
      const hasOpenClawChange = config.telegram || config.discord || config.dingtalk
        || config.feishu || config.qq || config.wecom || config.popo || config.weixin;
      if (options?.syncGateway && hasOpenClawChange && shouldSyncRunningIMGatewayConfig()) {
        scheduleImConfigSync();
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set IM config',
      };
    }
  });

  // Explicitly trigger OpenClaw config sync + gateway restart.
  // Called from the global Settings Save button after config fields have been
  // persisted to DB via im:config:set (without syncGateway flag).
  ipcMain.handle('im:config:sync', async () => {
    try {
      if (shouldSyncRunningIMGatewayConfig()) {
        scheduleImConfigSync();
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync IM config',
      };
    }
  });

  ipcMain.handle('im:gateway:start', async (_event, platform: Platform) => {
    try {
      // Persist enabled state
      const manager = getIMGatewayManager();
      manager.setConfig({ [platform]: { enabled: true } });
      await manager.startGateway(platform);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start gateway',
      };
    }
  });

  ipcMain.handle('im:gateway:stop', async (_event, platform: Platform) => {
    try {
      // Persist disabled state
      const manager = getIMGatewayManager();
      manager.setConfig({ [platform]: { enabled: false } });
      await manager.stopGateway(platform);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop gateway',
      };
    }
  });

  ipcMain.handle('im:gateway:test', async (
    _event,
    platform: Platform,
    configOverride?: Partial<IMGatewayConfig>
  ) => {
    try {
      const result = await getIMGatewayManager().testGateway(platform, configOverride);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test gateway connectivity',
      };
    }
  });

  // Weixin QR login
  ipcMain.handle('im:weixin:qr-login-start', async () => {
    try {
      const result = await getIMGatewayManager().weixinQrLoginStart();
      return { success: true, ...result };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Failed to start Weixin QR login' };
    }
  });

  ipcMain.handle('im:weixin:qr-login-wait', async (_event, accountId?: string) => {
    try {
      const result = await getIMGatewayManager().weixinQrLoginWait(accountId);
      if (result.connected) {
        // Restart gateway so the plugin picks up the new token and starts
        // a fresh monitor loop (the old one may be stuck in a session pause).
        console.log('[IMGatewayManager] Weixin login succeeded, restarting OpenClaw gateway');
        await getOpenClawEngineManager().restartGateway();
      }
      return { success: true, ...result };
    } catch (error) {
      return { success: false, connected: false, message: error instanceof Error ? error.message : 'Weixin QR login failed' };
    }
  });

  ipcMain.handle('im:status:get', async () => {
    try {
      const status = getIMGatewayManager().getStatus();
      return { success: true, status };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get IM status',
      };
    }
  });

  ipcMain.handle('im:getLocalIp', () => {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return '127.0.0.1';
  });
  ipcMain.handle('im:openclaw:config-schema', async (_event, input?: { allowRuntimeStart?: boolean }) => {
    const startedAt = nowMs();
    const allowRuntimeStart = input?.allowRuntimeStart === true;
    try {
      const result = await getIMGatewayManager().getOpenClawConfigSchema({ allowRuntimeStart });
      recordSettingsMetric({
        type: 'ipc',
        channel: 'im:openclaw:config-schema',
        durationMs: nowMs() - startedAt,
        success: true,
        triggeredRuntimeStart: allowRuntimeStart,
      });
      return { success: true, result };
    } catch (error) {
      recordSettingsMetric({
        type: 'ipc',
        channel: 'im:openclaw:config-schema',
        durationMs: nowMs() - startedAt,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get OpenClaw config schema',
        triggeredRuntimeStart: allowRuntimeStart,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get OpenClaw config schema',
      };
    }
  });

  ipcMain.handle(ImIpcChannel.FeishuDetectOpenClawLocal, async () => {
    try {
      return {
        success: true,
        result: detectLocalOpenClawFeishu(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to detect local OpenClaw Feishu config',
      };
    }
  });

  ipcMain.handle(ImIpcChannel.FeishuImportOpenClawLocal, async () => {
    try {
      const candidate = importOpenClawLocalFeishuConfig();
      if (!candidate.canImport) {
        return {
          success: false,
          error: candidate.message || 'No importable local OpenClaw Feishu config was found.',
        };
      }
      const instanceId = crypto.randomUUID();
      const instance = {
        ...candidate.instanceConfig,
        instanceId,
        instanceName: 'OpenClaw Feishu Bot',
        enabled: false,
        importSource: FeishuImportSource.OpenClawLocal,
      };
      getIMGatewayManager().getIMStore().setFeishuInstanceConfigForEngine(FeishuEngineKey.OpenClaw, instanceId, {
        ...instance,
        engineKey: FeishuEngineKey.OpenClaw,
      });
      getIMGatewayManager().getIMStore().setFeishuManagementMode(FeishuManagementMode.LocalOpenClaw);
      return {
        success: true,
        instance,
        result: detectLocalOpenClawFeishu(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import local OpenClaw Feishu config',
      };
    }
  });

  ipcMain.handle(ImIpcChannel.FeishuSetManagementMode, async (_event, mode: unknown) => {
    try {
      if (!isFeishuManagementMode(mode)) {
        return {
          success: false,
          error: 'Invalid Feishu management mode.',
        };
      }
      getIMGatewayManager().getIMStore().setFeishuManagementMode(mode);
      if (shouldSyncRunningIMGatewayConfig()) {
        scheduleImConfigSync();
      }
      if (mode === FeishuManagementMode.LocalOpenClaw) {
        await getIMGatewayManager().stopGateway('feishu').catch((error) => {
          console.warn('[IM] Failed to stop native Feishu gateway after management mode switch:', error);
        });
      } else {
        await getIMGatewayManager().startAllEnabled().catch((error) => {
          console.warn('[IM] Failed to restart Feishu gateway after management mode switch:', error);
        });
      }
      return {
        success: true,
        mode,
        status: getIMGatewayManager().getStatus().feishu.openClawLocal,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update Feishu management mode',
      };
    }
  });

  ipcMain.handle(ImIpcChannel.FeishuSetRuntimeOwnership, async (_event, input: unknown) => {
    try {
      const record = input && typeof input === 'object' && !Array.isArray(input)
        ? input as { engineKey?: unknown; ownership?: unknown }
        : {};
      if (!isFeishuEngineKey(record.engineKey)) {
        return {
          success: false,
          error: 'Invalid Feishu engine ownership target.',
        };
      }
      if (record.engineKey !== FeishuEngineKey.OpenClaw && record.engineKey !== FeishuEngineKey.Hermes) {
        return {
          success: false,
          error: 'Only OpenClaw and Hermes Agent support local runtime ownership.',
        };
      }
      if (!isFeishuRuntimeOwnership(record.ownership)) {
        return {
          success: false,
          error: 'Invalid Feishu runtime ownership mode.',
        };
      }

      const manager = getIMGatewayManager();
      const engineKey = record.engineKey;
      const ownership = record.ownership;
      const transferResult = ownership === FeishuRuntimeOwnership.LocalRuntime
        ? await transferFeishuToLocalRuntime(
          engineKey,
          manager.getIMStore().getFeishuInstances(engineKey),
          {
            openClawEngineManager: getOpenClawEngineManager(),
            hermesEngineManager: getHermesEngineManager(),
          },
        )
        : await transferFeishuToWesightRuntime(engineKey);

      if (!transferResult.success) {
        return transferResult;
      }

      manager.getIMStore().setFeishuRuntimeOwnership(engineKey, ownership);
      if (ownership === FeishuRuntimeOwnership.LocalRuntime) {
        await manager.stopGateway('feishu').catch((error) => {
          console.warn('[IM] Failed to stop WeSight Feishu gateway after local runtime ownership switch:', error);
        });
      } else {
        if (shouldSyncRunningIMGatewayConfig()) {
          scheduleImConfigSync();
        }
        await manager.startAllEnabled().catch((error) => {
          console.warn('[IM] Failed to restart Feishu gateway after WeSight ownership switch:', error);
        });
      }

      return {
        success: true,
        ownership,
        status: transferResult.status ?? getFeishuRuntimeOwnershipStatus(engineKey, ownership),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update Feishu runtime ownership.',
      };
    }
  });

  ipcMain.handle(ImIpcChannel.FeishuRefreshRuntimeOwnership, async (_event, engineKeyInput: unknown) => {
    try {
      const engineKey = normalizeFeishuEngineKey(engineKeyInput);
      const ownership = getFeishuRuntimeOwnership(engineKey);
      return {
        success: true,
        ownership,
        status: getFeishuRuntimeOwnershipStatus(engineKey, ownership),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refresh Feishu runtime ownership status.',
      };
    }
  });

  // ---- Pairing IPC handlers ----

  ipcMain.handle('im:pairing:list', async (_event, platform: string) => {
    try {
      const stateDir = getOpenClawEngineManager().getStateDir();
      const requests = listPairingRequests(platform, stateDir);
      const allowFrom = readAllowFromStore(platform, stateDir);
      return { success: true, requests, allowFrom };
    } catch (error) {
      return {
        success: false,
        requests: [],
        allowFrom: [],
        error: error instanceof Error ? error.message : 'Failed to list pairing requests',
      };
    }
  });

  ipcMain.handle('im:pairing:approve', async (_event, platform: string, code: string) => {
    try {
      const stateDir = getOpenClawEngineManager().getStateDir();
      const approved = approvePairingCode(platform, code, stateDir);
      if (!approved) {
        return { success: false, error: 'Pairing code not found or expired' };
      }
      await syncOpenClawConfig({
        reason: `im-pairing-approval:${platform}`,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to approve pairing code',
      };
    }
  });

  ipcMain.handle('im:pairing:reject', async (_event, platform: string, code: string) => {
    try {
      const stateDir = getOpenClawEngineManager().getStateDir();
      const rejected = rejectPairingRequest(platform, code, stateDir);
      if (!rejected) {
        return { success: false, error: 'Pairing code not found or expired' };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reject pairing request',
      };
    }
  });

  // DingTalk Multi-Instance handlers
  ipcMain.handle('im:dingtalk:instance:add', async (_event, name: string) => {
    try {
      const instanceId = crypto.randomUUID();
      const { DEFAULT_DINGTALK_OPENCLAW_CONFIG: defaults } = await import('./im/types');
      const instance = {
        ...defaults,
        instanceId,
        instanceName: name || 'DingTalk Bot',
      };
      getIMGatewayManager().getIMStore().setDingTalkInstanceConfig(instanceId, instance);
      return { success: true, instance };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add DingTalk instance',
      };
    }
  });

  ipcMain.handle('im:dingtalk:instance:delete', async (_event, instanceId: string) => {
    try {
      getIMGatewayManager().getIMStore().deleteDingTalkInstance(instanceId);
      if (shouldSyncRunningIMGatewayConfig()) {
        scheduleImConfigSync();
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete DingTalk instance',
      };
    }
  });

  ipcMain.handle('im:dingtalk:instance:config:set', async (_event, instanceId: string, config: any, options?: { syncGateway?: boolean }) => {
    try {
      getIMGatewayManager().getIMStore().setDingTalkInstanceConfig(instanceId, config);
      if (options?.syncGateway && shouldSyncRunningIMGatewayConfig()) {
        scheduleImConfigSync();
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set DingTalk instance config',
      };
    }
  });

  // QQ Multi-Instance handlers
  ipcMain.handle('im:qq:instance:add', async (_event, name: string) => {
    try {
      const instanceId = crypto.randomUUID();
      const { DEFAULT_QQ_CONFIG: defaults } = await import('./im/types');
      const instance = {
        ...defaults,
        instanceId,
        instanceName: name || 'QQ Bot',
      };
      getIMGatewayManager().getIMStore().setQQInstanceConfig(instanceId, instance);
      return { success: true, instance };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add QQ instance',
      };
    }
  });

  ipcMain.handle('im:qq:instance:delete', async (_event, instanceId: string) => {
    try {
      getIMGatewayManager().getIMStore().deleteQQInstance(instanceId);
      if (shouldSyncRunningIMGatewayConfig()) {
        scheduleImConfigSync();
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete QQ instance',
      };
    }
  });

  ipcMain.handle('im:qq:instance:config:set', async (_event, instanceId: string, config: any, options?: { syncGateway?: boolean }) => {
    try {
      getIMGatewayManager().getIMStore().setQQInstanceConfig(instanceId, config);
      if (options?.syncGateway && shouldSyncRunningIMGatewayConfig()) {
        scheduleImConfigSync();
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set QQ instance config',
      };
    }
  });

  // Feishu Multi-Instance handlers
  ipcMain.handle('im:feishu:instance:add', async (_event, name: string, engineKeyValue?: unknown) => {
    try {
      const engineKey = normalizeFeishuEngineKey(engineKeyValue);
      const instanceId = crypto.randomUUID();
      const { DEFAULT_FEISHU_OPENCLAW_CONFIG: defaults } = await import('./im/types');
      const instance = {
        ...defaults,
        instanceId,
        instanceName: name || 'Feishu Bot',
        engineKey,
      };
      getIMGatewayManager().getIMStore().setFeishuInstanceConfigForEngine(engineKey, instanceId, instance);
      return { success: true, instance };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add Feishu instance',
      };
    }
  });

  ipcMain.handle('im:feishu:instance:delete', async (_event, instanceId: string, engineKeyValue?: unknown) => {
    try {
      const engineKey = normalizeFeishuEngineKey(engineKeyValue);
      getIMGatewayManager().getIMStore().deleteFeishuInstanceForEngine(engineKey, instanceId);
      if (shouldSyncRunningIMGatewayConfig()) {
        scheduleImConfigSync();
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete Feishu instance',
      };
    }
  });

  ipcMain.handle('im:feishu:instance:config:set', async (_event, instanceId: string, config: any, options?: { syncGateway?: boolean; engineKey?: unknown }) => {
    try {
      const engineKey = normalizeFeishuEngineKey(options?.engineKey ?? config?.engineKey);
      getIMGatewayManager().getIMStore().setFeishuInstanceConfigForEngine(engineKey, instanceId, {
        ...config,
        engineKey,
      });
      if (options?.syncGateway && shouldSyncRunningIMGatewayConfig()) {
        scheduleImConfigSync();
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set Feishu instance config',
      };
    }
  });

  // Feishu bot install helpers
  ipcMain.handle('feishu:install:qrcode', async (_event, { isLark }: { isLark: boolean }) => {
    try {
      return await getIMGatewayManager().startFeishuInstallQrcode(isLark);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '获取二维码失败');
    }
  });

  ipcMain.handle('feishu:install:poll', async (_event, { deviceCode }: { deviceCode: string }) => {
    try {
      return await getIMGatewayManager().pollFeishuInstall(deviceCode);
    } catch (error) {
      return { done: false, error: error instanceof Error ? error.message : '轮询失败' };
    }
  });

  ipcMain.handle('feishu:install:verify', async (_event, { appId, appSecret }: { appId: string; appSecret: string }) => {
    try {
      return await getIMGatewayManager().verifyFeishuCredentials(appId, appSecret);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '验证失败' };
    }
  });

  // GitHub Copilot device code authentication handlers
  ipcMain.handle('github-copilot:request-device-code', async () => {
    const { requestDeviceCode } = await import('./libs/githubCopilotAuth');
    try {
      const result = await requestDeviceCode();
      return {
        userCode: result.user_code,
        verificationUri: result.verification_uri,
        deviceCode: result.device_code,
        interval: result.interval,
        expiresIn: result.expires_in,
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to request device code');
    }
  });

  ipcMain.handle('github-copilot:poll-for-token', async (_event, { deviceCode, interval, expiresIn }: { deviceCode: string; interval: number; expiresIn: number }) => {
    const { pollForAccessToken, getCopilotToken, getGitHubUser } = await import('./libs/githubCopilotAuth');
    try {
      const githubAccessToken = await pollForAccessToken(deviceCode, interval, expiresIn);
      const githubUser = await getGitHubUser(githubAccessToken);
      const { token: copilotToken, expiresAt, baseUrl } = await getCopilotToken(githubAccessToken);
      // Store the GitHub access token for later token refresh
      getStore().set('github_copilot_github_token', githubAccessToken);
      // Register with the token manager for automatic refresh
      setCopilotTokenState({ copilotToken, baseUrl, expiresAt, githubToken: githubAccessToken });
      return { success: true, token: copilotToken, githubUser, baseUrl };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Authentication failed' };
    }
  });

  ipcMain.handle('github-copilot:cancel-polling', async () => {
    const { cancelPolling } = await import('./libs/githubCopilotAuth');
    cancelPolling();
  });

  ipcMain.handle('github-copilot:sign-out', async () => {
    getStore().delete('github_copilot_github_token');
    clearCopilotTokenState();
  });

  ipcMain.handle('github-copilot:refresh-token', async () => {
    try {
      const state = await refreshCopilotTokenNow();
      return { success: true, token: state.copilotToken, baseUrl: state.baseUrl };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Token refresh failed' };
    }
  });

  ipcMain.handle('generate-session-title', async (_event, userInput: string | null) => {
    return generateSessionTitle(userInput);
  });

  ipcMain.handle('get-recent-cwds', async (_event, limit?: number) => {
    const boundedLimit = limit ? Math.min(Math.max(limit, 1), 20) : 8;
    return getCoworkStore().listRecentCwds(boundedLimit);
  });

  ipcMain.handle('get-api-config', async () => {
    return getCurrentApiConfig();
  });

  ipcMain.handle('check-api-config', async (_event, options?: { probeModel?: boolean }) => {
    const { config, error } = resolveCurrentApiConfig();
    if (config && options?.probeModel) {
      const probe = await probeCoworkModelReadiness();
      if (probe.ok === false) {
        return { hasConfig: false, config: null, error: probe.error };
      }
    }
    return { hasConfig: config !== null, config, error };
  });

  ipcMain.handle('save-api-config', async (_event, config: {
    apiKey: string;
    baseURL: string;
    model: string;
    apiType?: 'anthropic' | 'openai';
  }) => {
    try {
      saveCoworkApiConfig(config);
      if (getCoworkStore().getConfig().agentEngine === CoworkAgentEngineValue.Hermes) {
        const syncResult = getHermesConfigSync().sync('model-config-save');
        if (syncResult.success && syncResult.changed && getHermesEngineManager().getStatus().phase === 'running') {
          void getHermesEngineManager().restartGateway().catch((error) => {
            console.error('[Hermes] Failed to restart gateway after model config save:', error);
          });
        }
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save API config',
      };
    }
  });

  // Dialog handlers
  ipcMain.handle('dialog:selectDirectory', async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = {
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
    };
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, path: null };
    }
    return { success: true, path: result.filePaths[0] };
  });

  ipcMain.handle('dialog:selectFile', async (event, options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = {
      properties: ['openFile'] as ('openFile')[],
      title: options?.title,
      filters: options?.filters,
    };
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, path: null };
    }
    return { success: true, path: result.filePaths[0] };
  });

  ipcMain.handle('dialog:selectFiles', async (event, options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = {
      properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
      title: options?.title,
      filters: options?.filters,
    };
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, paths: [] };
    }
    return { success: true, paths: result.filePaths };
  });

  ipcMain.handle(
    DialogIpcChannel.SaveLocalImageToDirectory,
    async (
      event,
      options?: { sourcePath?: string; fileName?: string }
    ): Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }> => {
      try {
        const rawSourcePath = typeof options?.sourcePath === 'string' ? options.sourcePath.trim() : '';
        if (!rawSourcePath) {
          return { success: false, error: 'Missing image path' };
        }

        const sourcePath = normalizeLocalFilePath(rawSourcePath);
        const sourceStat = await fs.promises.stat(sourcePath);
        if (!sourceStat.isFile()) {
          return { success: false, error: 'Image path is not a file' };
        }

        const sourceExtension = path.extname(sourcePath).toLowerCase();
        if (!IMAGE_FILE_EXTENSIONS.has(sourceExtension)) {
          return { success: false, error: 'Unsupported image file type' };
        }

        const ownerWindow = BrowserWindow.fromWebContents(event.sender);
        const dialogOptions = {
          defaultPath: app.getPath('downloads'),
          properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
        };
        const result = ownerWindow
          ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);
        if (result.canceled || result.filePaths.length === 0) {
          return { success: true, canceled: true };
        }

        const selectedDirectory = result.filePaths[0];
        const sourceName = path.basename(sourcePath);
        const safeFileName = sanitizeAttachmentFileName(options?.fileName || sourceName);
        const finalName = path.extname(safeFileName)
          ? safeFileName
          : `${safeFileName}${sourceExtension}`;
        const targetPath = await buildUniqueTargetPath(selectedDirectory, finalName);
        await fs.promises.copyFile(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
        return { success: true, canceled: false, path: targetPath };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save image',
        };
      }
    }
  );

  ipcMain.handle(
    'dialog:saveInlineFile',
    async (
      _event,
      options?: { dataBase64?: string; fileName?: string; mimeType?: string; cwd?: string }
    ) => {
      try {
        const dataBase64 = typeof options?.dataBase64 === 'string' ? options.dataBase64.trim() : '';
        if (!dataBase64) {
          return { success: false, path: null, error: 'Missing file data' };
        }

        const buffer = Buffer.from(dataBase64, 'base64');
        if (!buffer.length) {
          return { success: false, path: null, error: 'Invalid file data' };
        }
        if (buffer.length > MAX_INLINE_ATTACHMENT_BYTES) {
          return {
            success: false,
            path: null,
            error: `File too large (max ${Math.floor(MAX_INLINE_ATTACHMENT_BYTES / (1024 * 1024))}MB)`,
          };
        }

        const dir = resolveInlineAttachmentDir(options?.cwd);
        await fs.promises.mkdir(dir, { recursive: true });

        const safeFileName = sanitizeAttachmentFileName(options?.fileName);
        const extension = inferAttachmentExtension(safeFileName, options?.mimeType);
        const baseName = extension ? safeFileName.slice(0, -extension.length) : safeFileName;
        const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const finalName = `${baseName || 'attachment'}-${uniqueSuffix}${extension}`;
        const outputPath = path.join(dir, finalName);

        await fs.promises.writeFile(outputPath, buffer);
        return { success: true, path: outputPath };
      } catch (error) {
        return {
          success: false,
          path: null,
          error: error instanceof Error ? error.message : 'Failed to save inline file',
        };
      }
    }
  );

  // Read a local file as a data URL (data:<mime>;base64,...)
  const MAX_READ_AS_DATA_URL_BYTES = 20 * 1024 * 1024;
  const MIME_BY_EXT: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
  };
  ipcMain.handle(
    'dialog:readFileAsDataUrl',
    async (_event, filePath?: string): Promise<{ success: boolean; dataUrl?: string; error?: string }> => {
      try {
        if (typeof filePath !== 'string' || !filePath.trim()) {
          return { success: false, error: 'Missing file path' };
        }
        const resolvedPath = path.resolve(filePath.trim());
        const stat = await fs.promises.stat(resolvedPath);
        if (!stat.isFile()) {
          return { success: false, error: 'Not a file' };
        }
        if (stat.size > MAX_READ_AS_DATA_URL_BYTES) {
          return {
            success: false,
            error: `File too large (max ${Math.floor(MAX_READ_AS_DATA_URL_BYTES / (1024 * 1024))}MB)`,
          };
        }
        const buffer = await fs.promises.readFile(resolvedPath);
        const ext = path.extname(resolvedPath).toLowerCase();
        const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream';
        const base64 = buffer.toString('base64');
        return { success: true, dataUrl: `data:${mimeType};base64,${base64}` };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read file',
        };
      }
    }
  );

  // Shell handlers - 打开文件/文件夹
  ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
    try {
      const normalizedPath = normalizeWindowsShellPath(filePath);
      const result = await shell.openPath(normalizedPath);
      if (result) {
        // 如果返回非空字符串，表示打开失败
        return { success: false, error: result };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('shell:showItemInFolder', async (_event, filePath: string) => {
    try {
      const normalizedPath = normalizeWindowsShellPath(filePath);
      shell.showItemInFolder(normalizedPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // App update download & install
  ipcMain.handle('appUpdate:download', async (event, url: string) => {
    // Block downloads in enterprise mode
    const enterprise = getStore().get<{ disableUpdate?: boolean }>('enterprise_config');
    if (enterprise?.disableUpdate) {
      return { success: false, error: 'Updates are managed by enterprise' };
    }
    try {
      const filePath = await downloadUpdate(url, (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('appUpdate:downloadProgress', progress);
        }
      });
      return { success: true, filePath };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Download failed' };
    }
  });

  ipcMain.handle('appUpdate:cancelDownload', async () => {
    const cancelled = cancelActiveDownload();
    return { success: cancelled };
  });

  ipcMain.handle('appUpdate:install', async (_event, filePath: string) => {
    try {
      await installUpdate(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Installation failed' };
    }
  });

  // Helper: detect if a URL belongs to GitHub Copilot and apply token refresh on 401.
  const isCopilotUrl = (url: string) =>
    url.includes('githubcopilot.com');
  const retryCopilotWithRefreshedToken = async (
    opts: { url: string; method: string; headers: Record<string, string>; body?: string },
  ): Promise<{ headers: Record<string, string>; retried: boolean }> => {
    try {
      const state = await refreshCopilotTokenNow();
      const refreshedHeaders = { ...opts.headers, Authorization: `Bearer ${state.copilotToken}` };
      console.log('[CopilotRetry] token refreshed, retrying request');
      return { headers: refreshedHeaders, retried: true };
    } catch (err) {
      console.warn('[CopilotRetry] token refresh failed, not retrying:', err);
      return { headers: opts.headers, retried: false };
    }
  };

  // API 代理处理程序 - 解决 CORS 问题
  ipcMain.handle('api:fetch', async (_event, options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
    expectedStatuses?: number[];
  }) => {
    console.log(`[api:fetch] ${options.method} ${options.url}, headers: ${formatApiFetchLogPayload(options.headers)}, body: ${formatApiFetchLogPayload(options.body ?? '')}`);

    const doFetch = async (headers: Record<string, string>) => {
      const response = await session.defaultSession.fetch(options.url, {
        method: options.method,
        headers,
        body: options.body,
      });

      const contentType = response.headers.get('content-type') || '';
      let data: string | object;

      if (contentType.includes('text/event-stream')) {
        data = await response.text();
      } else if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data,
      };
    };

    try {
      let result = await doFetch(options.headers);
      const isExpectedStatus = Array.isArray(options.expectedStatuses)
        && options.expectedStatuses.includes(result.status);
      if (isExpectedStatus) {
        console.log(`[api:fetch] ${options.method} ${options.url} -> ${result.status} ${result.statusText} (expected)`);
      } else {
        console.log(`[api:fetch] ${options.method} ${options.url} -> ${result.status} ${result.statusText}`, formatApiFetchLogPayload(result.data));
      }

      // Auto-retry once for Copilot 401/403
      if (!result.ok && (result.status === 401 || result.status === 403) && isCopilotUrl(options.url)) {
        console.log('[api:fetch] Copilot auth error, attempting token refresh and retry');
        const { headers: refreshedHeaders, retried } = await retryCopilotWithRefreshedToken(options);
        if (retried) {
          result = await doFetch(refreshedHeaders);
          console.log(`[api:fetch] retry -> ${result.status} ${result.statusText}`);
        }
      }

      return result;
    } catch (error) {
      console.error(`[api:fetch] ${options.method} ${options.url} -> ERROR:`, error instanceof Error ? error.message : error);
      return {
        ok: false,
        status: 0,
        statusText: error instanceof Error ? error.message : 'Network error',
        headers: {},
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // SSE 流式 API 代理
  ipcMain.handle('api:stream', async (event, options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
    requestId: string;
  }) => {
    const controller = new AbortController();

    // 存储 controller 以便后续取消
    activeStreamControllers.set(options.requestId, controller);

    try {
      let response = await session.defaultSession.fetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });

      // Auto-retry once for Copilot 401/403
      if (!response.ok && (response.status === 401 || response.status === 403) && isCopilotUrl(options.url)) {
        console.log('[api:stream] Copilot auth error, attempting token refresh and retry');
        const { headers: refreshedHeaders, retried } = await retryCopilotWithRefreshedToken(options);
        if (retried) {
          response = await session.defaultSession.fetch(options.url, {
            method: options.method,
            headers: refreshedHeaders,
            body: options.body,
            signal: controller.signal,
          });
          console.log(`[api:stream] retry -> ${response.status} ${response.statusText}`);
        }
      }

      if (!response.ok) {
        const errorData = await response.text();
        activeStreamControllers.delete(options.requestId);
        return {
          ok: false,
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        };
      }

      if (!response.body) {
        activeStreamControllers.delete(options.requestId);
        return {
          ok: false,
          status: response.status,
          statusText: 'No response body',
        };
      }

      // 读取流式响应并通过 IPC 发送
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      const readStream = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              event.sender.send(`api:stream:${options.requestId}:done`);
              break;
            }
            const chunk = decoder.decode(value);
            event.sender.send(`api:stream:${options.requestId}:data`, chunk);
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            event.sender.send(`api:stream:${options.requestId}:abort`);
          } else {
            event.sender.send(`api:stream:${options.requestId}:error`,
              error instanceof Error ? error.message : 'Stream error');
          }
        } finally {
          activeStreamControllers.delete(options.requestId);
        }
      };

      // 异步读取流，立即返回成功状态
      readStream();

      return {
        ok: true,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error) {
      activeStreamControllers.delete(options.requestId);
      return {
        ok: false,
        status: 0,
        statusText: error instanceof Error ? error.message : 'Network error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // 取消流式请求
  ipcMain.handle('api:stream:cancel', (_event, requestId: string) => {
    const controller = activeStreamControllers.get(requestId);
    if (controller) {
      controller.abort();
      activeStreamControllers.delete(requestId);
      return true;
    }
    return false;
  });

  // Qwen OAuth 登录
  ipcMain.handle('qwen:oauth:login', async (event) => {
    const { startQwenOAuth } = await import('./libs/qwenOAuth');

    const progressCallback = {
      update: (message: string) => {
        event.sender.send('qwen:oauth:progress', message);
      },
      stop: (message?: string) => {
        if (message) {
          event.sender.send('qwen:oauth:progress', message);
        }
      }
    };

    try {
      const oauthToken = await startQwenOAuth(progressCallback);
      return {
        success: true,
        data: oauthToken
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth login failed'
      };
    }
  });

  // Qwen OAuth 刷新 token
  ipcMain.handle('qwen:oauth:refresh', async (_event, refreshToken: string) => {
    const { refreshQwenOAuthToken } = await import('./libs/qwenOAuth');

    try {
      const oauthToken = await refreshQwenOAuthToken(refreshToken);
      return {
        success: true,
        data: oauthToken
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed'
      };
    }
  });

  // 企微 SDK 授权弹窗白名单域名
  const WECOM_AUTH_HOSTNAMES = new Set([
    'work.weixin.qq.com',
    'open.work.weixin.qq.com',
    'wwcdn.weixin.qq.com',
  ]);

  const isWecomAuthUrl = (url: string): boolean => {
    try {
      const hostname = new URL(url).hostname;
      return WECOM_AUTH_HOSTNAMES.has(hostname);
    } catch {
      return false;
    }
  };

  // 设置 Content Security Policy
  const setContentSecurityPolicy = () => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      // 跳过企微授权页面，让其使用自身的 CSP（否则外部脚本被阻止导致空白页）
      if (isWecomAuthUrl(details.url)) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }

      const devPort = process.env.ELECTRON_START_URL?.match(/:(\d+)/)?.[1] || '5175';
      const cspDirectives = [
        "default-src 'self'",
        isDev ? `script-src 'self' 'unsafe-inline' http://localhost:${devPort} ws://localhost:${devPort}` : "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: http: localfile:",
        // 允许连接到所有域名，不做限制
        "connect-src *",
        "font-src 'self' data:",
        "media-src 'self'",
        "worker-src 'self' blob:",
        "frame-src 'self'"
      ];

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': cspDirectives.join('; ')
        }
      });
    });
  };

  // 创建主窗口
  const createWindow = () => {
    const windowCreateStartedAt = nowMs();
    // 如果窗口已经存在，就不再创建新窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      if (!mainWindow.isFocused()) mainWindow.focus();
      return;
    }

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: APP_NAME,
      icon: getAppIconPath(),
      ...(isMac
        ? {
            titleBarStyle: 'hiddenInset' as const,
            trafficLightPosition: { x: 12, y: 20 },
          }
        : isWindows
          ? {
              frame: false,
              titleBarStyle: 'hidden' as const,
            }
          : {
            titleBarStyle: 'hidden' as const,
            titleBarOverlay: getTitleBarOverlayOptions(),
          }),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        preload: PRELOAD_PATH,
        backgroundThrottling: false,
        devTools: isDev,
        spellcheck: false,
        enableWebSQL: false,
        autoplayPolicy: 'document-user-activation-required',
        disableDialogs: true,
        navigateOnDragDrop: false
      },
      backgroundColor: getInitialTheme() === 'dark' ? '#0F1117' : '#F8F9FB',
      show: false,
      autoHideMenuBar: true,
      enableLargerThanScreen: false
    });

    // 设置 macOS Dock 图标（开发模式下 Electron 默认图标不是应用 Logo）
    if (isMac && isDev) {
      ensureMacDockVisible();
      const iconPath = path.join(__dirname, '../build/icons/mac/icon.png');
      if (fs.existsSync(iconPath)) {
        app.dock.setIcon(nativeImage.createFromPath(iconPath));
      }
    }

    // 禁用窗口菜单
    mainWindow.setMenu(null);
    markTiming('window_created_ms', windowCreateStartedAt);

    // 处理 window.open 请求（企微 SDK 授权弹窗等）
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isWecomAuthUrl(url)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 950,
            height: 640,
            title: '企业微信授权',
            autoHideMenuBar: true,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
            },
          },
        };
      }
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // 监听子窗口创建事件（企微授权弹窗安全限制）
    mainWindow.webContents.on('did-create-window', (childWindow) => {
      // 限制子窗口只能导航到企微域名，防止被劫持到其他站点
      childWindow.webContents.on('will-navigate', (event, navUrl) => {
        if (!isWecomAuthUrl(navUrl)) {
          event.preventDefault();
        }
      });
    });

    // 设置窗口的最小尺寸
    mainWindow.setMinimumSize(800, 600);

    // 设置窗口加载超时
    const loadTimeout = setTimeout(() => {
      if (mainWindow && mainWindow.webContents.isLoadingMainFrame()) {
        console.log('Window load timed out, attempting to reload...');
        scheduleReload('load-timeout');
      }
    }, 30000);

    // 清除超时
    mainWindow.webContents.once('did-finish-load', () => {
      clearTimeout(loadTimeout);
    });
    mainWindow.webContents.on('did-finish-load', () => {
      markTiming('window_did_finish_load_ms', windowCreateStartedAt);
      emitWindowState();
      if (openClawEngineManager && !mainWindow?.isDestroyed()) {
        mainWindow.webContents.send('openclaw:engine:onProgress', openClawEngineManager.getStatus());
      }
      if (hermesEngineManager && !mainWindow?.isDestroyed()) {
        mainWindow.webContents.send('hermes:engine:onProgress', hermesEngineManager.getStatus());
      }
    });

    // 处理窗口关闭
    mainWindow.on('close', (e) => {
      // In development, close should actually quit so `npm run electron:dev`
      // restarts from a clean process. In production we keep tray behavior.
      if (mainWindow && !isQuitting && !isDev) {
        e.preventDefault();
        mainWindow.hide();
      }
    });

    // 处理渲染进程崩溃或退出
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('Window render process gone:', details);
      scheduleReload('webContents-crashed');
    });

    if (isDev) {
      // 开发环境
      const maxRetries = 3;
      let retryCount = 0;

      const tryLoadURL = () => {
        mainWindow?.loadURL(DEV_SERVER_URL).catch((err) => {
          console.error('Failed to load URL:', err);
          retryCount++;

          if (retryCount < maxRetries) {
            console.log(`Retrying to load URL (${retryCount}/${maxRetries})...`);
            setTimeout(tryLoadURL, 3000);
          } else {
            console.error('Failed to load URL after maximum retries');
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.loadFile(path.join(__dirname, '../resources/error.html'));
            }
          }
        });
      };

      tryLoadURL();

      // 打开开发者工具
      mainWindow.webContents.openDevTools();
    } else {
      // 生产环境
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // 添加错误处理
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error('Page failed to load:', errorCode, errorDescription);
      // 如果加载失败，尝试重新加载
      if (isDev) {
        setTimeout(() => {
          scheduleReload('did-fail-load');
        }, 3000);
      }
    });

    // 当窗口关闭时，清除引用
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    const forwardWindowState = () => emitWindowState();
    mainWindow.on('maximize', forwardWindowState);
    mainWindow.on('unmaximize', forwardWindowState);
    mainWindow.on('enter-full-screen', forwardWindowState);
    mainWindow.on('leave-full-screen', forwardWindowState);
    mainWindow.on('focus', forwardWindowState);
    mainWindow.on('blur', forwardWindowState);

    // 等待内容加载完成后再显示窗口
    mainWindow.once('ready-to-show', () => {
      markTiming('window_ready_to_show_ms', windowCreateStartedAt);
      emitWindowState();
      // 开机自启时不显示窗口，仅显示托盘图标
      if (!isAutoLaunched()) {
        mainWindow?.show();
      }
      // Initialize main-process i18n from stored language before creating UI elements.
      const initLang = getStore().get<{ language?: string }>('app_config')?.language;
      setLanguage(initLang === 'en' ? 'en' : 'zh');
      // 窗口就绪后创建系统托盘
      createTray(() => mainWindow);

      // Start cron polling after the window is ready.
      (async () => {
        try {
          getCronJobService().startPolling();
        } catch (err) {
          console.warn('[Main] CronJobService not available yet, will start polling when OpenClaw is ready:', err);
        }

        // One-time migration: move tasks from legacy SQLite tables to OpenClaw gateway.
        migrateScheduledTasksToOpenclaw({
          db: getStore().getDatabase(),
          getKv: (key) => getStore().get(key),
          setKv: (key, value) => getStore().set(key, value),
          cronJobService: getCronJobService(),
        }).catch((err) => {
          console.warn('[Main] Scheduled tasks migration failed:', err);
        });

        // One-time migration: copy legacy run history to OpenClaw cron/runs/ JSONL files.
        migrateScheduledTaskRunsToOpenclaw({
          db: getStore().getDatabase(),
          getKv: (key) => getStore().get(key),
          setKv: (key, value) => getStore().set(key, value),
          openclawStateDir: getOpenClawEngineManager().getStateDir(),
        }).catch((err) => {
          console.warn('[Main] Scheduled task run history migration failed:', err);
        });
      })();
    });
  };

  let isCleanupFinished = false;
  let isCleanupInProgress = false;
  const cleanupTimeoutMs = isDev ? 8000 : 15000;

  const runAppCleanup = async (): Promise<void> => {
    console.log('[Main] App is quitting, starting cleanup...');
    destroyTray();
    stopHermesIMSessionSyncPolling();
    if (desktopPetWindow && !desktopPetWindow.isDestroyed()) {
      desktopPetWindow.close();
      desktopPetWindow = null;
    }
    skillManager?.stopWatching();

    // Stop Cowork sessions without blocking shutdown.
    if (coworkEngineRouter) {
      console.log('[Main] Stopping cowork sessions...');
      coworkEngineRouter.stopAllSessions();
    }
    coworkFileActivityTracker?.stopAll();

    await stopCoworkOpenAICompatProxy().catch((error) => {
      console.error('Failed to stop OpenAI compatibility proxy:', error);
    });

    stopOpenClawTokenProxy();

    // Stop skill services.
    const skillServices = getSkillServiceManager();
    await skillServices.stopAll();

    // Stop all IM gateways gracefully.
    if (imGatewayManager) {
      await imGatewayManager.stopAll().catch(err => {
        console.error('[IM Gateway] Error stopping gateways on quit:', err);
      });
    }

    if (openClawEngineManager) {
      await openClawEngineManager.stopGateway().catch((error) => {
        console.error('[OpenClaw] Failed to stop gateway on quit:', error);
      });
    }

    // Stop the cron job polling
    try {
      getCronJobService().stopPolling();
    } catch {
      // CronJobService may not have been initialized — safe to ignore.
    }

    // Close the SQLite database to flush the WAL and release the file lock.
    try {
      getStore().close();
    } catch {
      // Store may not have been initialized — safe to ignore.
    }
  };

  const runAppCleanupWithTimeout = async (reason: string): Promise<void> => {
    let cleanupTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        runAppCleanup(),
        new Promise<void>((resolve) => {
          cleanupTimeout = setTimeout(() => {
            console.warn(`[Main] Cleanup timed out after ${cleanupTimeoutMs} ms ${reason}, forcing exit.`);
            resolve();
          }, cleanupTimeoutMs);
          cleanupTimeout.unref?.();
        }),
      ]);
    } finally {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
      }
    }
  };

  const finishAppExit = (exitCode: number) => {
    isCleanupFinished = true;
    isCleanupInProgress = false;
    app.exit(exitCode);
  };

  app.on('before-quit', (e) => {
    if (isCleanupFinished) return;

    e.preventDefault();
    if (isCleanupInProgress) {
      return;
    }

    isCleanupInProgress = true;
    isQuitting = true;

    void runAppCleanupWithTimeout('before app quit')
      .catch((error) => {
        console.error('[Main] Cleanup error:', error);
      })
      .finally(() => {
        finishAppExit(0);
      });
  });

  const handleTerminationSignal = (signal: NodeJS.Signals) => {
    if (isCleanupFinished) {
      app.exit(0);
      return;
    }
    if (isCleanupInProgress) {
      console.warn(`[Main] Received ${signal} while cleanup is still running, forcing exit.`);
      finishAppExit(signal === 'SIGINT' ? 130 : 143);
      return;
    }
    console.log(`[Main] Received ${signal}, running cleanup before exit...`);
    isCleanupInProgress = true;
    isQuitting = true;
    void runAppCleanupWithTimeout(`during ${signal}`)
      .catch((error) => {
        console.error(`[Main] Cleanup error during ${signal}:`, error);
      })
      .finally(() => {
        finishAppExit(signal === 'SIGINT' ? 130 : 143);
      });
  };

  process.on('SIGINT', () => handleTerminationSignal('SIGINT'));
  process.on('SIGTERM', () => handleTerminationSignal('SIGTERM'));

  type StartupServiceStatus = 'pending' | 'running' | 'ready' | 'error' | 'degraded';
  type StartupServiceName =
    | 'session_recovery'
    | 'runtime_call_recovery'
    | 'token_proxy'
    | 'enterprise_sync'
    | 'runtime_forwarders'
    | 'openclaw_config_sync'
    | 'openclaw_proxy_config_sync'
    | 'hermes_config_sync'
    | 'selected_engine'
    | 'scheduled_tasks'
    | 'skills'
    | 'python_runtime'
    | 'skill_services'
    | 'app_config'
    | 'openai_compat_proxy'
    | 'im_gateways';

  type StartupServiceState = {
    name: StartupServiceName;
    status: StartupServiceStatus;
    startedAt?: number;
    finishedAt?: number;
    durationMs?: number;
    error?: string;
  };

  const startupServiceStates = new Map<StartupServiceName, StartupServiceState>();
  const startupServiceNames: StartupServiceName[] = [
    'session_recovery',
    'runtime_call_recovery',
    'token_proxy',
    'enterprise_sync',
    'runtime_forwarders',
    'openclaw_config_sync',
    'openclaw_proxy_config_sync',
    'hermes_config_sync',
    'selected_engine',
    'scheduled_tasks',
    'skills',
    'python_runtime',
    'skill_services',
    'app_config',
    'openai_compat_proxy',
    'im_gateways',
  ];

  for (const name of startupServiceNames) {
    startupServiceStates.set(name, { name, status: 'pending' });
  }

  const getStartupServicesSnapshot = (): StartupServiceState[] =>
    startupServiceNames.map(name => startupServiceStates.get(name) ?? { name, status: 'pending' });

  const broadcastStartupServicesStatus = (): void => {
    const snapshot = getStartupServicesSnapshot();
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.webContents.send(CoworkIpcChannel.StartupServicesChanged, snapshot);
    }
  };

  const setStartupServiceStatus = (
    name: StartupServiceName,
    status: StartupServiceStatus,
    input: { startedAt?: number; error?: string } = {},
  ): void => {
    const existing = startupServiceStates.get(name) ?? { name, status: 'pending' };
    const finishedAt = status === 'ready' || status === 'error' || status === 'degraded'
      ? Date.now()
      : existing.finishedAt;
    const startedAt = input.startedAt ?? existing.startedAt ?? (status === 'running' ? Date.now() : undefined);
    startupServiceStates.set(name, {
      ...existing,
      status,
      startedAt,
      finishedAt,
      durationMs: startedAt && finishedAt ? finishedAt - startedAt : existing.durationMs,
      error: input.error,
    });
    broadcastStartupServicesStatus();
  };

  const runStartupService = async (
    name: StartupServiceName,
    task: () => Promise<void> | void,
    options: { degradedOnError?: boolean } = {},
  ): Promise<void> => {
    const startedAt = Date.now();
    setStartupServiceStatus(name, 'running', { startedAt });
    try {
      await task();
      setStartupServiceStatus(name, 'ready', { startedAt });
    } catch (error) {
      setStartupServiceStatus(name, options.degradedOnError ? 'degraded' : 'error', {
        startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      if (options.degradedOnError) {
        console.warn(`[Startup] service ${name} degraded during background startup:`, error);
        return;
      }
      console.error(`[Startup] service ${name} failed during background startup:`, error);
    }
  };

  // 初始化应用
  const initApp = async () => {
    console.log('[Main] initApp: waiting for app.whenReady()');
    await app.whenReady();
    markTiming('app_ready_ms');
    console.log('[Main] initApp: app is ready');

    // Note: Calendar permission is checked on-demand when calendar operations are requested
    // We don't trigger permission dialogs at startup to avoid annoying users

    // Ensure default working directory exists
    const defaultProjectDir = path.join(os.homedir(), 'wesight', 'project');
    if (!fs.existsSync(defaultProjectDir)) {
      fs.mkdirSync(defaultProjectDir, { recursive: true });
      console.log('Created default project directory:', defaultProjectDir);
    }
    console.log('[Main] initApp: default project dir ensured');

    // 注册 localfile:// 自定义协议，用于安全加载本地文件（图片等）
    protocol.handle('localfile', (request) => {
      const url = new URL(request.url);
      const filePath = decodeURIComponent(url.pathname);
      return net.fetch(`file://${filePath}`);
    });

    console.log('[Main] initApp: starting initStore()');
    store = await initStore();
    console.log('[Main] initApp: store initialized');
    refreshEndpointsTestMode(store);
    setContentSecurityPolicy();
    bindCoworkRuntimeForwarder();
    bindOpenClawStatusForwarder();

    console.log('[Main] initApp: creating window');
    createWindow();
    markTiming('t0_ready_ms');
    console.log('[Main] initApp: window created');
    applyDesktopPetConfigFromStore();

    // Windows/Linux cold start: parse deep link from process.argv
    // Always buffer since renderer is not ready yet after createWindow().
    const coldStartDeepLink = process.argv.find(arg => arg.startsWith('wesight://'));
    if (coldStartDeepLink) {
      try {
        const parsed = new URL(coldStartDeepLink);
        if (parsed.hostname === 'auth' && parsed.pathname === '/callback') {
          const code = parsed.searchParams.get('code');
          if (code) {
            pendingAuthCode = code;
          }
        }
      } catch (e) {
        console.error('[Main] Failed to parse cold-start deep link:', e);
      }
    }

    // Defensive recovery: app may be force-closed during execution and leave
    // stale running flags in DB. Normalize them after the shell is created.
    await runStartupService('session_recovery', () => {
      const recoveryStartedAt = nowMs();
      const resetCount = getCoworkStore().resetRunningSessions();
      markTiming('session_recovery_ms', recoveryStartedAt);
      console.log('[Main] initApp: resetRunningSessions done, count:', resetCount);
      if (resetCount > 0) {
        console.log(`[Main] Reset ${resetCount} stuck cowork session(s) from running -> idle`);
      }
    }, { degradedOnError: true });
    await runStartupService('runtime_call_recovery', () => {
      const recoveryStartedAt = nowMs();
      const resetRuntimeCallCount = getRuntimeTelemetryStore().resetRunningCalls();
      markTiming('runtime_call_recovery_ms', recoveryStartedAt);
      if (resetRuntimeCallCount > 0) {
        console.log(`[Main] Reset ${resetRuntimeCallCount} stale runtime call(s) from running -> stopped`);
      }
    }, { degradedOnError: true });
    // Inject store getter into claudeSettings
    setStoreGetter(() => store);
    // Inject auth getters for wesight-server provider routing
    // The getter proactively triggers a background token refresh when the
    // accessToken is within 5 minutes of expiry, so that the SDK always
    // gets a fresh token without blocking.
    //
    // refreshOnce() is the single entry-point for all token refresh paths
    // (proactive, proxy 401/403 retry). It deduplicates concurrent calls via
    // pendingTokenRefresh so that rolling refresh tokens are never consumed twice.
    const refreshOnce = async (reason: string): Promise<string | null> => {
      if (pendingTokenRefresh) {
        return pendingTokenRefresh;
      }
      let resolvedToken: string | null = null;
      pendingTokenRefresh = (async () => {
        try {
          const tokens = getAuthTokens();
          if (!tokens?.refreshToken) return null;
          const serverBaseUrl = getServerApiBaseUrl();
          const resp = await net.fetch(`${serverBaseUrl}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: tokens.refreshToken }),
          });
          if (resp.ok) {
            const body = await resp.json() as { code: number; data: { accessToken: string; refreshToken?: string } };
            if (body.code === 0 && body.data) {
              saveAuthTokens(body.data.accessToken, body.data.refreshToken || tokens.refreshToken);
              console.log(`[Auth] token refresh succeeded (reason: ${reason})`);
              resolvedToken = body.data.accessToken;
              // Token proxy handles fresh tokens dynamically — no need
              // to restart the gateway on token refresh.
              syncOpenClawConfig({ reason: `token-refresh:${reason}`, restartGatewayIfRunning: false }).catch((err) => {
                console.warn('[Auth] post-refresh OpenClaw config sync failed:', err);
              });
            }
          }
        } catch (err) {
          console.warn(`[Auth] token refresh failed (reason: ${reason}):`, err);
        } finally {
          pendingTokenRefresh = null;
        }
        return resolvedToken;
      })();
      return pendingTokenRefresh;
    };

    setAuthTokensGetter(() => {
      const tokens = getAuthTokens();
      if (!tokens) return null;
      // Check if accessToken is close to expiry and trigger background refresh
      try {
        const payload = JSON.parse(Buffer.from(tokens.accessToken.split('.')[1], 'base64').toString());
        const expiresAt = payload.exp * 1000;
        if (expiresAt - Date.now() < 5 * 60 * 1000) {
          void refreshOnce('proactive'); // fire-and-forget
        }
      } catch { /* unable to parse JWT, return token as-is */ }
      return tokens;
    });
    setServerBaseUrlGetter(() => getServerApiBaseUrl());

    // Initialize Copilot token manager and restore token state if available
    initCopilotTokenManager(getStore);
    const storedGithubToken = getStore().get('github_copilot_github_token') as string | undefined;
    if (storedGithubToken) {
      import('./libs/githubCopilotAuth').then(({ getCopilotToken }) =>
        getCopilotToken(storedGithubToken).then(({ token, expiresAt, baseUrl }) => {
          setCopilotTokenState({ copilotToken: token, baseUrl, expiresAt, githubToken: storedGithubToken });
          console.log('[Main] restored Copilot token state from stored GitHub token');
        })
      ).catch((err) => {
        console.warn('[Main] failed to restore Copilot token on startup:', err);
      });
    }

    registerProxyTokenRefresher('wesight-server', async () => {
      const tokens = getAuthTokens();
      if (!tokens?.refreshToken) return null;
      const serverBaseUrl = getServerApiBaseUrl();
      try {
        const resp = await net.fetch(`${serverBaseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        if (resp.ok) {
          const body = await resp.json() as { code: number; data: { accessToken: string; refreshToken?: string } };
          if (body.code === 0 && body.data) {
            saveAuthTokens(body.data.accessToken, body.data.refreshToken || tokens.refreshToken);
            console.log('[Auth] proxy token refresh succeeded');
            return body.data.accessToken;
          }
        }
      } catch (err) {
        console.warn('[Auth] proxy token refresh failed:', err);
      }
      return null;
    });

    registerProxyTokenRefresher('github-copilot', async () => {
      try {
        const { refreshCopilotTokenNow } = await import('./libs/copilotTokenManager');
        const refreshed = await refreshCopilotTokenNow();
        return refreshed.copilotToken;
      } catch (err) {
        console.warn('[Auth] Copilot proxy token refresh failed:', err);
        return null;
      }
    });

    markTiming('t1_ready_ms');

    void (async () => {

    // Start the lightweight token proxy before OpenClaw config sync so that
    // wesight-server provider can use the proxy URL in its config.
    await runStartupService('token_proxy', async () => {
      await startOpenClawTokenProxy({
        getAuthTokens,
        refreshToken: refreshOnce,
        getServerBaseUrl: getServerApiBaseUrl,
      });
      console.log('[Main] OpenClaw token proxy started');
    }, { degradedOnError: true });

    // Enterprise config sync — must run before openclawConfigSync
    // so enterprise data is in SQLite when the config is generated.
    await runStartupService('enterprise_sync', () => {
      const enterpriseConfigPath = resolveEnterpriseConfigPath();
      if (enterpriseConfigPath) {
        const imStoreInstance = getIMGatewayManager().getIMStore();
        const mcpStoreInstance = getMcpStore();
        syncEnterpriseConfig(
          enterpriseConfigPath,
          store,
          imStoreInstance,
          (server) => {
            const existing = mcpStoreInstance.listServers().find(s => s.name === server.name);
            if (existing) {
              mcpStoreInstance.updateServer(existing.id, {
                name: server.name,
                description: server.description,
                transportType: server.transportType as 'stdio' | 'sse' | 'http',
                command: server.command,
                args: server.args,
                env: server.env,
              });
            } else {
              mcpStoreInstance.createServer({
                name: server.name,
                description: server.description,
                transportType: server.transportType as 'stdio' | 'sse' | 'http',
                command: server.command,
                args: server.args,
                env: server.env,
              });
            }
          },
          () => {
            // Clear all MCP servers (for overwrite mode)
            for (const s of mcpStoreInstance.listServers()) {
              mcpStoreInstance.deleteServer(s.id);
            }
          },
          (config) => {
            const cs = getCoworkStore();
            cs.setConfig(config);
          },
          () => {
            const cs = getCoworkStore();
            return cs.getConfig().workingDirectory;
          },
        );
      } else {
        // No enterprise config package found — clear any previously stored config
        // so the app exits enterprise mode after the package is removed.
        const hadEnterprise = store.get('enterprise_config');
        if (hadEnterprise) {
          store.delete('enterprise_config');
          // Reset executionMode to default so sandbox mode reverts to "off".
          const cs = getCoworkStore();
          cs.setConfig({ executionMode: 'local' });
          console.log('[Enterprise] config package removed, cleared enterprise mode and reset executionMode');
        }
      }
    }, { degradedOnError: true });

    await runStartupService('runtime_forwarders', () => {
      bindCoworkRuntimeForwarder();
      bindOpenClawStatusForwarder();
    }, { degradedOnError: true });

    await runStartupService('openclaw_config_sync', async () => {
      const startupSync = await syncOpenClawConfig({
        reason: 'startup',
        restartGatewayIfRunning: false,
      });
      if (!startupSync.success) {
        throw new Error(startupSync.error || 'OpenClaw config sync failed.');
      }
    }, { degradedOnError: true });
    await runStartupService('hermes_config_sync', () => {
      const hermesStartupSync = getHermesConfigSync().sync('startup');
      if (!hermesStartupSync.success) {
        throw new Error(hermesStartupSync.error || 'Hermes config sync failed.');
      }
    }, { degradedOnError: true });
    await runStartupService('selected_engine', async () => {
      const selectedEngineDetectStartedAt = nowMs();
      try {
        const selectedEngine = resolveCoworkAgentEngine();
        await ensureSelectedEngineReadyForStartup(selectedEngine);
      } finally {
        markTiming('selected_engine_detect_ms', selectedEngineDetectStartedAt);
        markTiming('selected_engine_ready_ms', selectedEngineDetectStartedAt);
      }
    }, { degradedOnError: true });

    await runStartupService('scheduled_tasks', () => {
      getCronJobService().startPolling();
    }, { degradedOnError: true });

    console.log('[Main] initApp: setStoreGetter done');
    const skillsStartedAt = nowMs();
    await runStartupService('skills', () => {
      const manager = getSkillManager();
      console.log('[Main] initApp: getSkillManager done');

      // When skills change (install/enable/disable/delete), re-sync AGENTS.md
      // so OpenClaw's IM channel agents pick up the latest skill list.
      manager.onSkillsChanged(() => {
        syncOpenClawConfig({ reason: 'skills-changed' }).catch((error) => {
          console.warn('[Main] Failed to sync OpenClaw config after skills change:', error);
        });
      });

      // Non-critical: sync bundled skills to user data.
      manager.syncBundledSkillsToUserData();
      console.log('[Main] initApp: syncBundledSkillsToUserData done');

      manager.recoverInterruptedUpgrades();
      console.log('[Main] initApp: recoverInterruptedUpgrades done');

      manager.startWatching();
      console.log('[Main] initApp: startWatching done');
    }, { degradedOnError: true });

    await runStartupService('python_runtime', async () => {
      const runtimeResult = await ensurePythonRuntimeReady();
      if (!runtimeResult.success) {
        throw new Error(runtimeResult.error || 'Python runtime preparation failed.');
      }
      console.log('[Main] initApp: ensurePythonRuntimeReady done');
    }, { degradedOnError: true });

    // Start skill services (non-critical)
    await runStartupService('skill_services', async () => {
      const skillServices = getSkillServiceManager();
      console.log('[Main] initApp: getSkillServiceManager done');
      await skillServices.startAll();
      console.log('[Main] initApp: skill services started');
    }, { degradedOnError: true }).finally(() => {
      markTiming('skills_ready_ms', skillsStartedAt);
    });

    await runStartupService('app_config', async () => {
      const configLoadStartedAt = nowMs();
      const appConfig = getStore().get<AppConfigSettings>('app_config');
      markTiming('config_loaded_ms', configLoadStartedAt);
      await applyProxyPreference(getUseSystemProxyFromConfig(appConfig));
    }, { degradedOnError: true });

    await runStartupService('openai_compat_proxy', async () => {
      await startCoworkOpenAICompatProxy();
    }, { degradedOnError: true });

    // Re-sync OpenClaw config after proxy is ready so that providers that route
    // through the proxy (e.g. github-copilot) get the correct baseUrl.
    await runStartupService('openclaw_proxy_config_sync', async () => {
      if (isOpenClawCoworkAgentEngine(resolveCoworkAgentEngine())) {
        const proxyResync = await syncOpenClawConfig({
          reason: 'proxy-ready',
        });
        if (proxyResync.changed) {
          console.log('[Main] OpenClaw config updated after proxy ready, gateway will restart to pick up new config');
        }
      }
    }, { degradedOnError: true });

    // Auto-reconnect IM bots that were enabled before restart.
    await runStartupService('im_gateways', async () => {
      const imStartedAt = nowMs();
      await getIMGatewayManager().startAllEnabled();
      markTiming('im_ready_ms', imStartedAt);
      if (resolveFeishuIMAgentEngine() === CoworkAgentEngineValue.Hermes) {
        startHermesIMSessionSyncPolling();
        void syncHermesIMSessionsToCowork('startup');
      }
    }, { degradedOnError: true });
    markTiming('t2_ready_ms');
    })().catch((error) => {
      console.error('[Startup] background services failed:', error);
    });

    // Reconnect OpenClaw gateway WS after system wake from sleep/suspend
    powerMonitor.on('resume', () => {
      if (openClawRuntimeAdapter) {
        openClawRuntimeAdapter.onSystemResume();
      }
    });

    // 首次启动时默认开启开机自启动（先写标记再设置，避免崩溃后重复设置）
    if (!getStore().get('auto_launch_initialized')) {
      getStore().set('auto_launch_initialized', true);
      getStore().set('auto_launch_enabled', true);
      setAutoLaunchEnabled(true);
    }

    // Restore prevent-sleep setting
    const preventSleepEnabled = getStore().get<boolean>('prevent_sleep_enabled');
    if (preventSleepEnabled) {
      try {
        preventSleepBlockerId = powerSaveBlocker.start('prevent-display-sleep');
      } catch (err) {
        console.error('[Main] Failed to start prevent-sleep blocker:', err);
      }
    }

    let lastLanguage = getStore().get<AppConfigSettings>('app_config')?.language;
    let lastUseSystemProxy = getUseSystemProxyFromConfig(getStore().get<AppConfigSettings>('app_config'));
    getStore().onDidChange<AppConfigSettings>('app_config', (newConfig, oldConfig) => {
      updateTitleBarOverlay();
      // 仅在语言变更时刷新托盘菜单文本
      const currentLanguage = newConfig?.language;
      if (currentLanguage !== lastLanguage) {
        lastLanguage = currentLanguage;
        setLanguage(currentLanguage === 'en' ? 'en' : 'zh');
        updateTrayMenu(() => mainWindow);
      }

      const previousUseSystemProxy = oldConfig
        ? getUseSystemProxyFromConfig(oldConfig)
        : lastUseSystemProxy;
      const currentUseSystemProxy = getUseSystemProxyFromConfig(newConfig);
      if (currentUseSystemProxy !== previousUseSystemProxy) {
        void applyProxyPreference(currentUseSystemProxy).then(() => {
          if (getOpenClawEngineManager().getStatus().phase === 'running') {
            void getOpenClawEngineManager().restartGateway();
          }
        });
      }
      const previousPetConfig = normalizePetConfig(oldConfig?.pet);
      const currentPetConfig = normalizePetConfig(newConfig?.pet);
      if (JSON.stringify(previousPetConfig) !== JSON.stringify(currentPetConfig)) {
        applyDesktopPetConfigFromStore();
      }
      lastUseSystemProxy = currentUseSystemProxy;
    });

    // 在 macOS 上，当点击 dock 图标时显示已有窗口或重新创建
    app.on('activate', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!mainWindow.isVisible()) mainWindow.show();
        if (!mainWindow.isFocused()) mainWindow.focus();
        return;
      }
      createWindow();
    });
  };

  // 启动应用
  initApp().catch(console.error);

  // 当所有窗口关闭时退出应用
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || isDev) {
      app.quit();
    }
  });
}
