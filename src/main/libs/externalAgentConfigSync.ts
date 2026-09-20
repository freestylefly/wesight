import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  CoworkAgentEngine,
  type CoworkAgentEngine as CoworkAgentEngineType,
  ExternalAgentConfigSource,
  type ExternalAgentConfigSource as ExternalAgentConfigSourceType,
} from '../../shared/cowork/constants';
import type { SqliteStore } from '../sqliteStore';
import { resolveRawApiConfig } from './claudeSettings';
import type { CoworkApiConfig } from './coworkConfigStore';
import {
  DEFAULT_DEEPSEEK_TUI_MODEL,
  mergeDeepSeekTuiConfigForWesightModel,
  parseDeepSeekTuiConfigText,
  serializeDeepSeekTuiConfig,
  summarizeDeepSeekTuiSettingsConfig,
} from './deepSeekTuiConfig';
import { type CliAppType, getPlaceholderExternalAgentEnvironmentSnapshot } from './externalAgentEnvironment';
import {
  DEFAULT_GROK_BUILD_MODEL,
  parseGrokBuildConfigText,
  summarizeGrokBuildConfig,
} from './grokBuildConfig';
import {
  DEFAULT_HERMES_MODEL,
  parseHermesConfigText,
  parseHermesDotenvText,
  summarizeHermesSettingsConfig,
} from './hermesConfig';
import {
  DEFAULT_OPENCODE_MODEL,
  mergeOpenCodeConfigForWesightModel,
  summarizeOpenCodeSettingsConfig,
} from './openCodeConfig';
import {
  DEFAULT_QWEN_CODE_MODEL,
  mergeQwenCodeConfigForWesightModel,
  summarizeQwenCodeSettingsConfig,
} from './qwenCodeConfig';

type ModelProviderConfig = {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  apiFormat?: 'anthropic' | 'openai' | 'gemini';
  displayName?: string;
  models?: Array<{ id: string; name: string; supportsImage?: boolean }>;
};

type AppConfigForModelImport = {
  providers?: Record<string, ModelProviderConfig>;
};

export interface ExternalAgentModelImportResult {
  success: boolean;
  appType?: CliAppType;
  imported?: boolean;
  duplicate?: boolean;
  providerKey?: string;
  providerName?: string;
  modelId?: string;
  providerConfig?: ModelProviderConfig;
  error?: string;
}

const CUSTOM_PROVIDER_KEYS = [
  'custom_0',
  'custom_1',
  'custom_2',
  'custom_3',
  'custom_4',
  'custom_5',
  'custom_6',
  'custom_7',
  'custom_8',
  'custom_9',
] as const;

const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5';
const DEFAULT_CODEX_MODEL = 'gpt-5.4';
const DEFAULT_HERMES_LOCAL_MODEL = DEFAULT_HERMES_MODEL;
const DEFAULT_OPENCODE_LOCAL_MODEL = DEFAULT_OPENCODE_MODEL;
const DEFAULT_GROK_LOCAL_MODEL = DEFAULT_GROK_BUILD_MODEL;
const DEFAULT_QWEN_CODE_LOCAL_MODEL = DEFAULT_QWEN_CODE_MODEL;
const DEFAULT_DEEPSEEK_TUI_LOCAL_MODEL = DEFAULT_DEEPSEEK_TUI_MODEL;
const CODEX_LOCAL_PROVIDER_KEY = 'local_codex';
const WESIGHT_CONFIG_BACKUP_DIR = '.wesight-backups';
const WESIGHT_CONFIG_BACKUP_RECENT_RETENTION = 20;
const WESIGHT_MANAGED_META_KEY = '__wesight_managed';
const CODEX_WESIGHT_META_BEGIN = '# WeSight managed Codex config: begin';
const CODEX_WESIGHT_META_END = '# WeSight managed Codex config: end';
const CODEX_LEGACY_SERVICE_TIER_PRIORITY = 'priority';
const CODEX_SERVICE_TIER_FAST = 'fast';
const CODEX_WESIGHT_META_KEYS = {
  OriginalModelProvider: 'original_model_provider',
  OriginalModel: 'original_model',
  OriginalModelReasoningEffort: 'original_model_reasoning_effort',
  OriginalDisableResponseStorage: 'original_disable_response_storage',
  ManagedModelProvider: 'managed_model_provider',
  ManagedModel: 'managed_model',
} as const;
type CodexWesightManagedMeta = {
  hasMeta: boolean;
  originalModelProvider?: string;
  originalModel?: string;
  originalModelReasoningEffort?: string;
  originalDisableResponseStorage?: boolean;
  managedModelProvider?: string;
  managedModel?: string;
};
const CLAUDE_CREDENTIAL_ENV_KEYS = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
] as const;
export type ClaudeCredentialEnvKey = typeof CLAUDE_CREDENTIAL_ENV_KEYS[number];
const DEFAULT_CLAUDE_CREDENTIAL_ENV_KEY: ClaudeCredentialEnvKey = 'ANTHROPIC_AUTH_TOKEN';
const CLAUDE_MODEL_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_REASONING_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
] as const;
const CLAUDE_MANAGED_ENV_KEYS = [
  ...CLAUDE_CREDENTIAL_ENV_KEYS,
  ...CLAUDE_MODEL_ENV_KEYS,
] as const;
export type ClaudeRuntimeConfigLease = {
  settingsPath: string;
  credentialKey: ClaudeCredentialEnvKey;
  baseURL: string;
  model: string;
};

const claudeRuntimeTakeovers = new Map<string, { refCount: number }>();

const homeDir = (): string => os.homedir();

const expandHome = (value: string): string => {
  return value.replace(/^~(?=$|\/|\\)/, homeDir());
};

const ensureParentDir = (filePath: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

const atomicWrite = (filePath: string, content: string): void => {
  ensureParentDir(filePath);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
};

const pruneWesightConfigFileBackups = (backupsDir: string, baseName: string): void => {
  const prefix = `${baseName}.`;
  const entries = fs.readdirSync(backupsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith('.bak'))
    .map((entry) => {
      const backupPath = path.join(backupsDir, entry.name);
      return {
        name: entry.name,
        path: backupPath,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  if (entries.length <= WESIGHT_CONFIG_BACKUP_RECENT_RETENTION + 1) {
    return;
  }

  const firstBackup = entries[0];
  const recentBackups = entries
    .slice(1)
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, WESIGHT_CONFIG_BACKUP_RECENT_RETENTION);
  const retained = new Set([firstBackup.path, ...recentBackups.map((entry) => entry.path)]);

  for (const entry of entries) {
    if (retained.has(entry.path)) continue;
    fs.unlinkSync(entry.path);
  }
};

export const createWesightConfigFileBackup = (filePath: string): string | null => {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const backupsDir = path.join(path.dirname(filePath), WESIGHT_CONFIG_BACKUP_DIR);
  fs.mkdirSync(backupsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const uniqueSuffix = process.hrtime.bigint().toString(36);
  const backupPath = path.join(backupsDir, `${path.basename(filePath)}.${timestamp}.${process.pid}.${uniqueSuffix}.bak`);
  fs.copyFileSync(filePath, backupPath);
  pruneWesightConfigFileBackups(backupsDir, path.basename(filePath));
  return backupPath;
};

export const writeTextFileWithBackupIfChanged = (filePath: string, content: string): boolean => {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (existing === content) {
    return false;
  }
  if (existing !== null) {
    createWesightConfigFileBackup(filePath);
  }
  atomicWrite(filePath, content);
  return true;
};

export const writeJsonObjectWithBackupIfChanged = (filePath: string, value: Record<string, unknown>): boolean => {
  return writeTextFileWithBackupIfChanged(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const readJsonObject = (filePath: string): Record<string, unknown> | null => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

const writeJsonObject = (filePath: string, value: Record<string, unknown>): void => {
  atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const getNestedRecord = (value: unknown, key: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : {};
};

const getString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const isClaudeCredentialEnvKey = (value: unknown): value is ClaudeCredentialEnvKey => {
  return value === 'ANTHROPIC_AUTH_TOKEN' || value === 'ANTHROPIC_API_KEY';
};

export const chooseClaudeCredentialEnvKey = (
  existingEnv: Record<string, unknown>,
  preferred?: unknown,
): ClaudeCredentialEnvKey => {
  if (isClaudeCredentialEnvKey(preferred)) {
    return preferred;
  }
  const hasAuthToken = Object.prototype.hasOwnProperty.call(existingEnv, 'ANTHROPIC_AUTH_TOKEN');
  const hasApiKey = Object.prototype.hasOwnProperty.call(existingEnv, 'ANTHROPIC_API_KEY');
  if (hasAuthToken && !hasApiKey) {
    return 'ANTHROPIC_AUTH_TOKEN';
  }
  if (hasApiKey && !hasAuthToken) {
    return 'ANTHROPIC_API_KEY';
  }
  return DEFAULT_CLAUDE_CREDENTIAL_ENV_KEY;
};

export const applySingleClaudeCredentialEnv = (
  env: Record<string, string | undefined>,
  apiKey: string,
  credentialKey: ClaudeCredentialEnvKey,
): void => {
  for (const key of CLAUDE_CREDENTIAL_ENV_KEYS) {
    delete env[key];
  }
  env[credentialKey] = apiKey;
};

const getStringArray = (value: unknown): string[] => {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
};

const tomlString = (value: string): string => {
  return JSON.stringify(value);
};

const sanitizeProviderKey = (value: string): string => {
  const key = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  return key || 'wesight';
};

export const buildCodexConfig = (providerName: string, baseUrl: string, model: string): string => {
  const providerKey = sanitizeProviderKey(providerName);
  return [
    `model_provider = ${tomlString(providerKey)}`,
    `model = ${tomlString(model || DEFAULT_CODEX_MODEL)}`,
    'model_reasoning_effort = "high"',
    'disable_response_storage = true',
    '',
    `[model_providers.${providerKey}]`,
    `name = ${tomlString(providerName || providerKey)}`,
    baseUrl.trim() ? `base_url = ${tomlString(baseUrl.trim())}` : '',
    'wire_api = "responses"',
    'requires_openai_auth = true',
    '',
  ].filter((line) => line !== '').join('\n');
};

const isWesightPlaceholder = (value: unknown): boolean => {
  return typeof value === 'string'
    && /^\$\{(?:WESIGHT|LOBSTER)_[A-Z0-9_]+\}$/.test(value.trim());
};

const removeTrailingBlankLines = (value: string): string => {
  return value.replace(/\s+$/g, '');
};

const splitTomlHeadAndTables = (configText: string): { head: string; tables: string } => {
  const match = configText.match(/^\s*\[/m);
  if (!match || match.index === undefined) {
    return { head: configText, tables: '' };
  }
  return {
    head: configText.slice(0, match.index),
    tables: configText.slice(match.index),
  };
};

const parseTomlStringValue = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    try {
      return JSON.parse(trimmed.replace(/^'/, '"').replace(/'$/, '"'));
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed.split(/\s+#/)[0]?.trim() || null;
};

const extractTomlTopLevelString = (head: string, key: string): string | null => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = head.match(new RegExp(`^\\s*${escaped}\\s*=\\s*(.+)$`, 'm'));
  return match?.[1] ? parseTomlStringValue(match[1]) : null;
};

const extractTomlTopLevelBoolean = (head: string, key: string): boolean | null => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = head.match(new RegExp(`^\\s*${escaped}\\s*=\\s*(true|false)\\s*(?:#.*)?$`, 'm'));
  if (!match?.[1]) return null;
  return match[1] === 'true';
};

const upsertTomlTopLevelOptionalString = (head: string, key: string, value: string | undefined): string => {
  return value === undefined ? head : upsertTomlTopLevelString(head, key, value);
};

const upsertTomlTopLevelOptionalBoolean = (head: string, key: string, value: boolean | undefined): string => {
  return value === undefined ? head : upsertTomlTopLevelBoolean(head, key, value);
};

const removeCodexWesightManagedMetaBlock = (head: string): string => {
  const pattern = new RegExp(
    `${CODEX_WESIGHT_META_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?\\n[\\s\\S]*?${CODEX_WESIGHT_META_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?\\n?`,
    'm',
  );
  return head.replace(pattern, '');
};

const extractCodexWesightManagedMeta = (head: string): CodexWesightManagedMeta => {
  const pattern = new RegExp(
    `${CODEX_WESIGHT_META_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?\\n([\\s\\S]*?)${CODEX_WESIGHT_META_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    'm',
  );
  const match = head.match(pattern);
  if (!match?.[1]) {
    return { hasMeta: false };
  }

  const values = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^#\s*([a-z_]+)\s*=\s*(.+)$/);
    if (item?.[1] && item[2]) {
      values.set(item[1], item[2]);
    }
  }

  const getMetaString = (key: string): string | undefined => (
    values.has(key) ? parseTomlStringValue(values.get(key) || '') ?? undefined : undefined
  );
  const getMetaBoolean = (key: string): boolean | undefined => {
    const value = values.get(key)?.trim();
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  };

  return {
    hasMeta: true,
    originalModelProvider: getMetaString(CODEX_WESIGHT_META_KEYS.OriginalModelProvider),
    originalModel: getMetaString(CODEX_WESIGHT_META_KEYS.OriginalModel),
    originalModelReasoningEffort: getMetaString(CODEX_WESIGHT_META_KEYS.OriginalModelReasoningEffort),
    originalDisableResponseStorage: getMetaBoolean(CODEX_WESIGHT_META_KEYS.OriginalDisableResponseStorage),
    managedModelProvider: getMetaString(CODEX_WESIGHT_META_KEYS.ManagedModelProvider),
    managedModel: getMetaString(CODEX_WESIGHT_META_KEYS.ManagedModel),
  };
};

const buildCodexWesightManagedMetaBlock = (meta: CodexWesightManagedMeta): string => {
  const lines = [
    CODEX_WESIGHT_META_BEGIN,
  ];
  const addString = (key: string, value: string | undefined) => {
    if (value !== undefined) {
      lines.push(`# ${key} = ${tomlString(value)}`);
    }
  };
  const addBoolean = (key: string, value: boolean | undefined) => {
    if (value !== undefined) {
      lines.push(`# ${key} = ${value ? 'true' : 'false'}`);
    }
  };

  addString(CODEX_WESIGHT_META_KEYS.OriginalModelProvider, meta.originalModelProvider);
  addString(CODEX_WESIGHT_META_KEYS.OriginalModel, meta.originalModel);
  addString(CODEX_WESIGHT_META_KEYS.OriginalModelReasoningEffort, meta.originalModelReasoningEffort);
  addBoolean(CODEX_WESIGHT_META_KEYS.OriginalDisableResponseStorage, meta.originalDisableResponseStorage);
  addString(CODEX_WESIGHT_META_KEYS.ManagedModelProvider, meta.managedModelProvider);
  addString(CODEX_WESIGHT_META_KEYS.ManagedModel, meta.managedModel);
  lines.push(CODEX_WESIGHT_META_END);
  return `${lines.join('\n')}\n`;
};

const upsertTomlTopLevelString = (head: string, key: string, value: string): string => {
  const line = `${key} = ${tomlString(value)}`;
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  if (pattern.test(head)) {
    return head.replace(pattern, line);
  }
  const trimmed = removeTrailingBlankLines(head);
  return trimmed ? `${trimmed}\n${line}\n` : `${line}\n`;
};

const removeTomlTopLevelKeys = (head: string, keys: readonly string[]): string => {
  const managedKeys = new Set(keys);
  return head
    .split(/\r?\n/)
    .filter((line) => {
      const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
      return !match || !managedKeys.has(match[1]);
    })
    .join('\n');
};

const upsertTomlTopLevelBoolean = (head: string, key: string, value: boolean): string => {
  const line = `${key} = ${value ? 'true' : 'false'}`;
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  if (pattern.test(head)) {
    return head.replace(pattern, line);
  }
  const trimmed = removeTrailingBlankLines(head);
  return trimmed ? `${trimmed}\n${line}\n` : `${line}\n`;
};

const removeCodexProviderTables = (tables: string, providerKey: string): string => {
  const escaped = providerKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tablePattern = new RegExp(
    `(^|\\n)\\[model_providers\\.${escaped}\\][\\s\\S]*?(?=\\n\\[|$)`,
    'g',
  );
  return tables.replace(tablePattern, '$1');
};

const hasCodexProviderTable = (configText: string, providerKey: string): boolean => {
  const escaped = providerKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\n)\\[model_providers\\.${escaped}\\](?=\\s|\\n|$)`).test(configText);
};

const replaceCodexProviderTable = (
  tables: string,
  providerKey: string,
  providerName: string,
  baseUrl: string,
): string => {
  const providerBlock = [
    `[model_providers.${providerKey}]`,
    `name = ${tomlString(providerName || providerKey)}`,
    baseUrl.trim() ? `base_url = ${tomlString(baseUrl.trim())}` : '',
    'wire_api = "responses"',
    'requires_openai_auth = true',
    '',
  ].filter((line) => line !== '').join('\n');
  const trimmed = removeTrailingBlankLines(removeCodexProviderTables(tables, providerKey).replace(/^\s+/, ''));
  return trimmed ? `${trimmed}\n\n${providerBlock}\n` : `${providerBlock}\n`;
};

export const mergeCodexConfigForWesightModel = (
  existingText: string,
  providerName: string,
  baseUrl: string,
  model: string,
): string => {
  const providerKey = sanitizeProviderKey(providerName);
  const split = splitTomlHeadAndTables(existingText);
  const existingMeta = extractCodexWesightManagedMeta(split.head);
  const cleanHead = removeCodexWesightManagedMetaBlock(split.head);
  const meta: CodexWesightManagedMeta = {
    hasMeta: true,
    originalModelProvider: existingMeta.hasMeta
      ? existingMeta.originalModelProvider
      : extractTomlTopLevelString(cleanHead, 'model_provider') ?? undefined,
    originalModel: existingMeta.hasMeta
      ? existingMeta.originalModel
      : extractTomlTopLevelString(cleanHead, 'model') ?? undefined,
    originalModelReasoningEffort: existingMeta.hasMeta
      ? existingMeta.originalModelReasoningEffort
      : extractTomlTopLevelString(cleanHead, 'model_reasoning_effort') ?? undefined,
    originalDisableResponseStorage: existingMeta.hasMeta
      ? existingMeta.originalDisableResponseStorage
      : extractTomlTopLevelBoolean(cleanHead, 'disable_response_storage') ?? undefined,
    managedModelProvider: providerKey,
    managedModel: model || DEFAULT_CODEX_MODEL,
  };
  let head = removeTomlTopLevelKeys(cleanHead, [
    'model_provider',
    'model',
    'model_reasoning_effort',
    'disable_response_storage',
  ]);
  head = upsertTomlTopLevelString(head, 'model_provider', providerKey);
  head = upsertTomlTopLevelString(head, 'model', model || DEFAULT_CODEX_MODEL);
  head = upsertTomlTopLevelString(head, 'model_reasoning_effort', 'high');
  head = upsertTomlTopLevelBoolean(head, 'disable_response_storage', true);
  const tables = replaceCodexProviderTable(split.tables, providerKey, providerName, baseUrl);
  return `${buildCodexWesightManagedMetaBlock(meta)}${removeTrailingBlankLines(head)}\n\n${removeTrailingBlankLines(tables)}\n`;
};

export const mergeCodexConfigForLocalCli = (existingText: string): string => {
  const normalizedText = normalizeCodexConfigForCurrentCli(existingText);
  const split = splitTomlHeadAndTables(normalizedText);
  const existingMeta = extractCodexWesightManagedMeta(split.head);
  if (!existingMeta.hasMeta && !hasCodexProviderTable(normalizedText, CODEX_LOCAL_PROVIDER_KEY)) {
    return normalizedText;
  }

  const cleanHead = removeCodexWesightManagedMetaBlock(split.head);
  const currentProvider = extractTomlString(cleanHead, 'model_provider');
  const restoredProvider = existingMeta.originalModelProvider
    ?? (hasCodexProviderTable(normalizedText, CODEX_LOCAL_PROVIDER_KEY) ? CODEX_LOCAL_PROVIDER_KEY : undefined);
  if (!restoredProvider) {
    return normalizedText;
  }

  if (
    !existingMeta.hasMeta
    && currentProvider === restoredProvider
    && !extractTomlTopLevelString(cleanHead, 'model')
  ) {
    return normalizedText;
  }

  let head = removeTomlTopLevelKeys(cleanHead, [
    'model_provider',
    'model',
    'model_reasoning_effort',
    'disable_response_storage',
  ]);
  head = upsertTomlTopLevelString(head, 'model_provider', restoredProvider);
  head = upsertTomlTopLevelOptionalString(head, 'model', existingMeta.originalModel);
  head = upsertTomlTopLevelOptionalString(
    head,
    'model_reasoning_effort',
    existingMeta.originalModelReasoningEffort,
  );
  head = upsertTomlTopLevelOptionalBoolean(
    head,
    'disable_response_storage',
    existingMeta.originalDisableResponseStorage,
  );
  return `${removeTrailingBlankLines(head)}\n\n${removeTrailingBlankLines(split.tables)}\n`;
};

export const normalizeCodexConfigForCurrentCli = (configText: string): string => {
  return configText.replace(
    new RegExp(`^(\\s*service_tier\\s*=\\s*)["']${CODEX_LEGACY_SERVICE_TIER_PRIORITY}["']\\s*$`, 'gm'),
    `$1"${CODEX_SERVICE_TIER_FAST}"`,
  );
};

const extractTomlString = (configText: string, key: string): string => {
  const match = configText.match(new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']*)["']`, 'm'));
  return match?.[1]?.trim() ?? '';
};

const extractCodexProviderBaseUrl = (configText: string, provider: string): string => {
  if (!provider) return '';
  const escaped = provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tableMatch = configText.match(new RegExp(`\\[model_providers\\.${escaped}\\]([\\s\\S]*?)(?:\\n\\[|$)`));
  if (!tableMatch?.[1]) return '';
  return extractTomlString(tableMatch[1], 'base_url');
};

const getCliConfigPaths = (appType: CliAppType): { primaryConfigPath: string; secondaryConfigPaths: string[] } => {
  const snapshot = getPlaceholderExternalAgentEnvironmentSnapshot();
  const engine = snapshot.engines.find((item) => item.appType === appType);
  if (engine) {
    return {
      primaryConfigPath: engine.config.primaryConfigPath,
      secondaryConfigPaths: engine.config.secondaryConfigPaths,
    };
  }
  const configDir = appType === 'claude'
    ? path.join(homeDir(), '.claude')
    : appType === 'codex'
      ? path.join(homeDir(), '.codex')
      : appType === 'hermes'
        ? path.join(homeDir(), '.hermes')
      : appType === 'openclaw'
        ? path.join(homeDir(), '.openclaw')
      : appType === 'opencode'
        ? path.join(homeDir(), '.config', 'opencode')
        : appType === 'grok'
          ? path.join(homeDir(), '.grok')
        : appType === 'qwen'
          ? path.join(homeDir(), '.qwen')
          : path.join(homeDir(), '.deepseek');
  return {
    primaryConfigPath: appType === 'claude'
      ? path.join(configDir, 'settings.json')
      : appType === 'codex'
        ? path.join(configDir, 'config.toml')
        : appType === 'hermes'
          ? path.join(configDir, 'config.yaml')
        : appType === 'openclaw'
          ? path.join(configDir, 'openclaw.json')
        : appType === 'opencode'
          ? path.join(configDir, 'opencode.json')
          : appType === 'grok'
            ? path.join(configDir, 'config.toml')
          : appType === 'qwen'
            ? path.join(configDir, 'settings.json')
            : path.join(configDir, 'config.toml'),
    secondaryConfigPaths: appType === 'claude'
      ? [path.join(homeDir(), '.claude.json')]
      : appType === 'codex'
        ? [path.join(configDir, 'auth.json')]
        : appType === 'hermes'
          ? [path.join(configDir, '.env')]
        : appType === 'openclaw'
          ? [path.join(configDir, '.env')]
        : appType === 'opencode'
          ? [path.join(homeDir(), '.local', 'share', 'opencode', 'auth.json')]
          : appType === 'grok'
            ? [path.join(configDir, 'auth.json')]
          : appType === 'qwen'
            ? [path.join(configDir, 'oauth_creds.json')]
            : [path.join(configDir, 'sessions')],
  };
};

const requireApiConfig = (resolution: ReturnType<typeof resolveRawApiConfig>): CoworkApiConfig => {
  if (!resolution.config) {
    throw new Error(resolution.error || 'No WeSight model is configured.');
  }
  return resolution.config;
};

const buildClaudeEnvForConfig = (
  existingEnv: Record<string, unknown>,
  config: CoworkApiConfig,
  credentialKey = chooseClaudeCredentialEnvKey(existingEnv),
): Record<string, unknown> => {
  const env = { ...existingEnv };
  for (const key of CLAUDE_CREDENTIAL_ENV_KEYS) {
    delete env[key];
  }
  env[credentialKey] = config.apiKey;
  return {
    ...env,
    ANTHROPIC_BASE_URL: config.baseURL,
    ANTHROPIC_MODEL: config.model,
    ANTHROPIC_REASONING_MODEL: config.model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: config.model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: config.model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: config.model,
    ANTHROPIC_SMALL_FAST_MODEL: config.model,
  };
};

const getOwnValue = (record: Record<string, unknown>, key: string): unknown => (
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined
);

const claudeEnvMatchesManagedOverlay = (
  env: Record<string, unknown>,
  managedEnv: Record<string, unknown>,
): boolean => CLAUDE_MANAGED_ENV_KEYS.every(
  (key) => getOwnValue(env, key) === getOwnValue(managedEnv, key),
);

export const mergeClaudeSettingsForWesightModel = (
  existingSettings: Record<string, unknown>,
  config: CoworkApiConfig,
  options: { credentialKey?: ClaudeCredentialEnvKey } = {},
): Record<string, unknown> => {
  const existingManaged = getNestedRecord(existingSettings, WESIGHT_MANAGED_META_KEY);
  const existingClaude = getNestedRecord(existingManaged, 'claudeCode');
  const previousEnvKeys = getStringArray(existingClaude.envKeys);
  const previousCreatedEnvKeys = getStringArray(existingClaude.createdEnvKeys);
  const previousOriginalEnv = getNestedRecord(existingClaude, 'originalEnv');
  const previousManagedEnv = getNestedRecord(existingClaude, 'managedEnv');
  const hasRecoverableSnapshot = Object.keys(previousOriginalEnv).length > 0 || previousCreatedEnvKeys.length > 0;
  const baselineEnv = { ...getNestedRecord(existingSettings, 'env') };
  // When the live env no longer matches the overlay WeSight last wrote, an
  // external tool (or the user) changed the local config; the stored snapshot
  // is stale and must be refreshed from the live env instead of restored.
  const overlayModifiedExternally = Object.keys(previousManagedEnv).length > 0
    && !claudeEnvMatchesManagedOverlay(baselineEnv, previousManagedEnv);

  if (hasRecoverableSnapshot && !overlayModifiedExternally) {
    for (const key of previousEnvKeys) {
      if (Object.prototype.hasOwnProperty.call(previousOriginalEnv, key)) {
        baselineEnv[key] = previousOriginalEnv[key];
      } else if (previousCreatedEnvKeys.includes(key)) {
        delete baselineEnv[key];
      }
    }
  }
  for (const key of CLAUDE_MANAGED_ENV_KEYS) {
    if (isWesightPlaceholder(baselineEnv[key])) {
      delete baselineEnv[key];
    }
  }

  const originalEnv = Object.fromEntries(
    Object.entries(previousOriginalEnv).filter(([, value]) => !isWesightPlaceholder(value)),
  );
  const createdEnvKeys = new Set(previousCreatedEnvKeys);
  for (const key of CLAUDE_MANAGED_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(baselineEnv, key)) {
      if (overlayModifiedExternally || !Object.prototype.hasOwnProperty.call(originalEnv, key)) {
        originalEnv[key] = baselineEnv[key];
      }
      createdEnvKeys.delete(key);
    } else {
      if (overlayModifiedExternally) {
        delete originalEnv[key];
      }
      createdEnvKeys.add(key);
    }
  }

  const credentialKey = chooseClaudeCredentialEnvKey(baselineEnv, options.credentialKey);
  const env = buildClaudeEnvForConfig(baselineEnv, config, credentialKey);
  const envKeys = [...CLAUDE_MANAGED_ENV_KEYS];
  const managedEnv = Object.fromEntries(
    envKeys
      .filter((key) => Object.prototype.hasOwnProperty.call(env, key))
      .map((key) => [key, env[key]]),
  );
  return {
    ...existingSettings,
    env,
    [WESIGHT_MANAGED_META_KEY]: {
      ...existingManaged,
      claudeCode: {
        ...existingClaude,
        envKeys,
        createdEnvKeys: envKeys.filter((key) => createdEnvKeys.has(key)),
        originalEnv,
        managedEnv,
        credentialKey,
      },
    },
  };
};

const removeClaudeManagedMetadata = (
  existingSettings: Record<string, unknown>,
  existingManaged: Record<string, unknown>,
  existingClaude: Record<string, unknown>,
  env?: Record<string, unknown>,
): Record<string, unknown> => {
  const claudeManaged = { ...existingClaude };
  delete claudeManaged.envKeys;
  delete claudeManaged.createdEnvKeys;
  delete claudeManaged.originalEnv;
  delete claudeManaged.managedEnv;
  delete claudeManaged.credentialKey;

  const managed = { ...existingManaged };
  if (Object.keys(claudeManaged).length > 0) {
    managed.claudeCode = claudeManaged;
  } else {
    delete managed.claudeCode;
  }

  const next = { ...existingSettings };
  if (env) {
    if (Object.keys(env).length > 0) {
      next.env = env;
    } else {
      delete next.env;
    }
  }
  if (Object.keys(managed).length > 0) {
    next[WESIGHT_MANAGED_META_KEY] = managed;
  } else {
    delete next[WESIGHT_MANAGED_META_KEY];
  }
  return next;
};

export const removeWesightManagedClaudeSettings = (
  existingSettings: Record<string, unknown>,
): Record<string, unknown> => {
  const existingManaged = getNestedRecord(existingSettings, WESIGHT_MANAGED_META_KEY);
  const existingClaude = getNestedRecord(existingManaged, 'claudeCode');
  const previousEnvKeys = getStringArray(existingClaude.envKeys);
  const previousCreatedEnvKeys = getStringArray(existingClaude.createdEnvKeys);
  const previousOriginalEnv = getNestedRecord(existingClaude, 'originalEnv');
  const hasRecoverableSnapshot = Object.keys(previousOriginalEnv).length > 0 || previousCreatedEnvKeys.length > 0;

  if (previousEnvKeys.length === 0) {
    return existingSettings;
  }

  if (!hasRecoverableSnapshot) {
    console.warn('[ExternalAgentConfigSync] found legacy Claude Code managed marker without original environment snapshot; preserving local environment values.');
    return removeClaudeManagedMetadata(existingSettings, existingManaged, existingClaude);
  }

  const env = { ...getNestedRecord(existingSettings, 'env') };
  const previousManagedEnv = getNestedRecord(existingClaude, 'managedEnv');
  if (
    Object.keys(previousManagedEnv).length > 0
    && !claudeEnvMatchesManagedOverlay(env, previousManagedEnv)
  ) {
    // The local env was changed externally after WeSight applied its overlay;
    // keep the user's current values instead of restoring the stale snapshot.
    return removeClaudeManagedMetadata(existingSettings, existingManaged, existingClaude, env);
  }
  for (const key of previousEnvKeys) {
    if (Object.prototype.hasOwnProperty.call(previousOriginalEnv, key)) {
      env[key] = previousOriginalEnv[key];
    } else if (previousCreatedEnvKeys.includes(key) || isWesightPlaceholder(env[key])) {
      delete env[key];
    }
  }

  return removeClaudeManagedMetadata(existingSettings, existingManaged, existingClaude, env);
};

export const cleanupWesightManagedClaudeSettings = (settingsPath = getCliConfigPaths('claude').primaryConfigPath): boolean => {
  const settings = readJsonObject(settingsPath);
  if (!settings) return false;
  const cleaned = removeWesightManagedClaudeSettings(settings);
  if (cleaned === settings || JSON.stringify(cleaned) === JSON.stringify(settings)) {
    return false;
  }
  return writeJsonObjectWithBackupIfChanged(settingsPath, cleaned);
};

export const createWesightClaudeSettingsBackup = (
  settingsPath = getCliConfigPaths('claude').primaryConfigPath,
): string | null => createWesightConfigFileBackup(settingsPath);

export const acquireWesightClaudeRuntimeConfig = (
  config: CoworkApiConfig,
  settingsPath = getCliConfigPaths('claude').primaryConfigPath,
): ClaudeRuntimeConfigLease => {
  const resolvedSettingsPath = expandHome(settingsPath);
  const existingSettings = readJsonObject(resolvedSettingsPath) ?? {};
  const credentialKey = chooseClaudeCredentialEnvKey(getNestedRecord(existingSettings, 'env'));
  const merged = mergeClaudeSettingsForWesightModel(existingSettings, config, { credentialKey });
  writeJsonObjectWithBackupIfChanged(resolvedSettingsPath, merged);

  const current = claudeRuntimeTakeovers.get(resolvedSettingsPath);
  claudeRuntimeTakeovers.set(resolvedSettingsPath, {
    refCount: (current?.refCount ?? 0) + 1,
  });

  return {
    settingsPath: resolvedSettingsPath,
    credentialKey,
    baseURL: config.baseURL,
    model: config.model,
  };
};

export const releaseWesightClaudeRuntimeConfig = (lease: ClaudeRuntimeConfigLease | null): boolean => {
  if (!lease) return false;
  const current = claudeRuntimeTakeovers.get(lease.settingsPath);
  if (!current) {
    return cleanupWesightManagedClaudeSettings(lease.settingsPath);
  }
  if (current.refCount > 1) {
    claudeRuntimeTakeovers.set(lease.settingsPath, { refCount: current.refCount - 1 });
    return false;
  }
  claudeRuntimeTakeovers.delete(lease.settingsPath);
  return cleanupWesightManagedClaudeSettings(lease.settingsPath);
};

const syncClaudeCodeFromWesightModel = (): void => {
  console.log('[ExternalAgentConfigSync] preserving native Claude Code settings; WeSight model config will be applied during Claude Code runtime.');
};

const syncCodexFromWesightModel = (): void => {
  console.log('[ExternalAgentConfigSync] preserving native Codex settings; WeSight model config will be injected at runtime.');
};

const syncCodexFromLocalCliConfig = (): void => {
  const paths = getCliConfigPaths('codex');
  if (!fs.existsSync(paths.primaryConfigPath)) {
    return;
  }

  const existingConfigText = fs.readFileSync(paths.primaryConfigPath, 'utf8');
  const nextConfigText = mergeCodexConfigForLocalCli(existingConfigText);
  if (nextConfigText !== existingConfigText) {
    writeTextFileWithBackupIfChanged(paths.primaryConfigPath, nextConfigText);
  }
};

export const cleanupWesightManagedCodexConfig = (
  configPath = getCliConfigPaths('codex').primaryConfigPath,
): boolean => {
  if (!fs.existsSync(configPath)) {
    return false;
  }

  const existingConfigText = fs.readFileSync(configPath, 'utf8');
  const nextConfigText = mergeCodexConfigForLocalCli(existingConfigText);
  if (nextConfigText === existingConfigText) {
    return false;
  }
  return writeTextFileWithBackupIfChanged(configPath, nextConfigText);
};

export const syncOpenCodeGlobalConfigFromWesightModel = (): void => {
  const resolved = resolveRawApiConfig();
  const config = requireApiConfig(resolved);
  const paths = getCliConfigPaths('opencode');
  const existing = readJsonObject(paths.primaryConfigPath) ?? {};
  writeJsonObject(
    paths.primaryConfigPath,
    mergeOpenCodeConfigForWesightModel(existing, config, resolved.providerMetadata?.providerName),
  );
};

export const syncQwenCodeGlobalConfigFromWesightModel = (): void => {
  const resolved = resolveRawApiConfig();
  const config = requireApiConfig(resolved);
  const paths = getCliConfigPaths('qwen');
  const existing = readJsonObject(paths.primaryConfigPath) ?? {};
  writeJsonObject(
    paths.primaryConfigPath,
    mergeQwenCodeConfigForWesightModel(existing, config, resolved.providerMetadata?.providerName),
  );
};

export const syncDeepSeekTuiGlobalConfigFromWesightModel = (): void => {
  const resolved = resolveRawApiConfig();
  const config = requireApiConfig(resolved);
  const paths = getCliConfigPaths('deepseek_tui');
  const existing = fs.existsSync(paths.primaryConfigPath)
    ? parseDeepSeekTuiConfigText(fs.readFileSync(paths.primaryConfigPath, 'utf8'))
    : {};
  atomicWrite(
    paths.primaryConfigPath,
    serializeDeepSeekTuiConfig(
      mergeDeepSeekTuiConfigForWesightModel(existing, config, resolved.providerMetadata?.providerName),
    ),
  );
};

export const applyExternalAgentConfigForEngine = (
  engine: CoworkAgentEngineType,
  source: ExternalAgentConfigSourceType,
): void => {
  if (source === ExternalAgentConfigSource.LocalCli) {
    if (engine === CoworkAgentEngine.Codex) {
      syncCodexFromLocalCliConfig();
    }
    return;
  }
  if (engine === CoworkAgentEngine.ClaudeCode) {
    syncClaudeCodeFromWesightModel();
    return;
  }
  if (engine === CoworkAgentEngine.Codex) {
    syncCodexFromWesightModel();
    return;
  }
  if (engine === CoworkAgentEngine.OpenCode) {
    return;
  }
  if (engine === CoworkAgentEngine.GrokBuild) {
    return;
  }
  if (engine === CoworkAgentEngine.QwenCode) {
    return;
  }
  if (engine === CoworkAgentEngine.DeepSeekTui) {
    return;
  }
  if (engine === CoworkAgentEngine.OpenSquilla) {
    return;
  }
};

const buildProviderConfig = (
  appType: CliAppType,
  input: { apiKey: string; baseUrl: string; model: string },
): ModelProviderConfig => {
  const displayName = appType === 'claude'
    ? 'Claude Code 本机配置'
    : appType === 'codex'
      ? 'Codex 本机配置'
      : appType === 'hermes'
        ? 'Hermes Agent 本机配置'
      : appType === 'opencode'
        ? 'OpenCode 本机配置'
      : appType === 'grok'
        ? 'Grok Build 本机配置'
        : appType === 'qwen'
          ? 'Qwen Code 本机配置'
          : 'DeepSeek-TUI 本机配置';
  const modelId = input.model || (appType === 'claude'
    ? DEFAULT_CLAUDE_MODEL
    : appType === 'codex'
      ? DEFAULT_CODEX_MODEL
      : appType === 'hermes'
        ? DEFAULT_HERMES_LOCAL_MODEL
      : appType === 'opencode'
        ? DEFAULT_OPENCODE_LOCAL_MODEL
        : appType === 'grok'
          ? DEFAULT_GROK_LOCAL_MODEL
        : appType === 'qwen'
          ? DEFAULT_QWEN_CODE_LOCAL_MODEL
          : DEFAULT_DEEPSEEK_TUI_LOCAL_MODEL);
  return {
    enabled: true,
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    apiFormat: appType === 'claude' || modelId.startsWith('anthropic/') ? 'anthropic' : 'openai',
    displayName,
    models: [
      {
        id: modelId,
        name: modelId,
        supportsImage: false,
      },
    ],
  };
};

const readClaudeLocalConfig = (): { apiKey: string; baseUrl: string; model: string } => {
  const paths = getCliConfigPaths('claude');
  const settings = readJsonObject(expandHome(paths.primaryConfigPath));
  const env = getNestedRecord(settings, 'env');
  const apiKey = getString(env.ANTHROPIC_AUTH_TOKEN) || getString(env.ANTHROPIC_API_KEY);
  const baseUrl = getString(env.ANTHROPIC_BASE_URL);
  const model = getString(env.ANTHROPIC_MODEL)
    || getString(env.ANTHROPIC_DEFAULT_SONNET_MODEL)
    || getString(env.ANTHROPIC_DEFAULT_OPUS_MODEL)
    || getString(env.ANTHROPIC_DEFAULT_HAIKU_MODEL)
    || DEFAULT_CLAUDE_MODEL;

  if (!apiKey || !baseUrl) {
    throw new Error('本机 Claude Code 配置缺少可导入的 API Key 或 Base URL。');
  }
  return { apiKey, baseUrl, model };
};

const readCodexLocalConfig = (): { apiKey: string; baseUrl: string; model: string } => {
  const paths = getCliConfigPaths('codex');
  const configText = fs.existsSync(paths.primaryConfigPath)
    ? fs.readFileSync(paths.primaryConfigPath, 'utf8')
    : '';
  const authPath = paths.secondaryConfigPaths[0] || path.join(path.dirname(paths.primaryConfigPath), 'auth.json');
  const auth = readJsonObject(authPath) ?? {};
  const provider = extractTomlString(configText, 'model_provider');
  const apiKey = getString(auth.OPENAI_API_KEY);
  const baseUrl = extractCodexProviderBaseUrl(configText, provider);
  const model = extractTomlString(configText, 'model') || DEFAULT_CODEX_MODEL;

  if (!apiKey) {
    throw new Error('本机 Codex 配置看起来使用登录态，无法直接导入为 WeSight API 模型配置。可继续使用“本机 CLI 配置”模式。');
  }
  if (!baseUrl) {
    throw new Error('本机 Codex 配置缺少可导入的 Base URL。');
  }
  return { apiKey, baseUrl, model };
};

const readHermesLocalConfig = (): { apiKey: string; baseUrl: string; model: string } => {
  const paths = getCliConfigPaths('hermes');
  const config = fs.existsSync(paths.primaryConfigPath)
    ? parseHermesConfigText(fs.readFileSync(paths.primaryConfigPath, 'utf8'))
    : {};
  const envPath = paths.secondaryConfigPaths[0] || path.join(path.dirname(paths.primaryConfigPath), '.env');
  const env = fs.existsSync(envPath)
    ? parseHermesDotenvText(fs.readFileSync(envPath, 'utf8'))
    : {};
  const summary = summarizeHermesSettingsConfig({
    config,
    env,
  });
  if (!summary.apiKey) {
    throw new Error('本机 Hermes Agent 配置缺少可导入的 API Key。可继续使用“本机 CLI 配置”模式。');
  }
  if (!summary.baseUrl) {
    throw new Error('本机 Hermes Agent 配置缺少可导入的 Base URL。');
  }
  return {
    apiKey: summary.apiKey,
    baseUrl: summary.baseUrl,
    model: summary.model || DEFAULT_HERMES_LOCAL_MODEL,
  };
};

const readOpenCodeLocalConfig = (): { apiKey: string; baseUrl: string; model: string } => {
  const paths = getCliConfigPaths('opencode');
  const config = readJsonObject(paths.primaryConfigPath) ?? {};
  const summary = summarizeOpenCodeSettingsConfig({
    config,
    model: typeof config.model === 'string' ? config.model : DEFAULT_OPENCODE_LOCAL_MODEL,
  });
  if (!summary.apiKey) {
    throw new Error('本机 OpenCode 配置缺少可导入的 API Key。可继续使用“本机 CLI 配置”模式。');
  }
  if (!summary.baseUrl) {
    throw new Error('本机 OpenCode 配置缺少可导入的 Base URL。');
  }
  return {
    apiKey: summary.apiKey,
    baseUrl: summary.baseUrl,
    model: summary.model || DEFAULT_OPENCODE_LOCAL_MODEL,
  };
};

const readGrokBuildLocalConfig = (): { apiKey: string; baseUrl: string; model: string } => {
  const paths = getCliConfigPaths('grok');
  const configText = fs.existsSync(paths.primaryConfigPath)
    ? fs.readFileSync(paths.primaryConfigPath, 'utf8')
    : '';
  const summary = summarizeGrokBuildConfig(parseGrokBuildConfigText(configText));
  return {
    apiKey: '',
    baseUrl: '',
    model: summary.model || DEFAULT_GROK_LOCAL_MODEL,
  };
};

const readQwenCodeLocalConfig = (): { apiKey: string; baseUrl: string; model: string } => {
  const paths = getCliConfigPaths('qwen');
  const config = readJsonObject(paths.primaryConfigPath) ?? {};
  const model = getNestedRecord(config, 'model');
  const summary = summarizeQwenCodeSettingsConfig({
    authType: getNestedRecord(getNestedRecord(config, 'security'), 'auth').selectedType,
    config,
    model: getString(model.name) || DEFAULT_QWEN_CODE_LOCAL_MODEL,
  });
  if (!summary.apiKey) {
    throw new Error('本机 Qwen Code 配置缺少可导入的 API Key。可继续使用“本机 CLI 配置”模式。');
  }
  if (!summary.baseUrl) {
    throw new Error('本机 Qwen Code 配置缺少可导入的 Base URL。');
  }
  return {
    apiKey: summary.apiKey,
    baseUrl: summary.baseUrl,
    model: summary.model || DEFAULT_QWEN_CODE_LOCAL_MODEL,
  };
};

const readDeepSeekTuiLocalConfig = (): { apiKey: string; baseUrl: string; model: string } => {
  const paths = getCliConfigPaths('deepseek_tui');
  const config = fs.existsSync(paths.primaryConfigPath)
    ? parseDeepSeekTuiConfigText(fs.readFileSync(paths.primaryConfigPath, 'utf8'))
    : {};
  const summary = summarizeDeepSeekTuiSettingsConfig({
    provider: config.provider ?? 'deepseek',
    config,
    model: config.default_text_model ?? DEFAULT_DEEPSEEK_TUI_LOCAL_MODEL,
  });
  if (!summary.apiKey) {
    throw new Error('本机 DeepSeek-TUI 配置缺少可导入的 API Key。可继续使用“本机 CLI 配置”模式。');
  }
  if (!summary.baseUrl) {
    throw new Error('本机 DeepSeek-TUI 配置缺少可导入的 Base URL。');
  }
  return {
    apiKey: summary.apiKey,
    baseUrl: summary.baseUrl,
    model: summary.model || DEFAULT_DEEPSEEK_TUI_LOCAL_MODEL,
  };
};

const valuesMatch = (left: string | undefined, right: string | undefined): boolean => {
  return (left ?? '').trim() === (right ?? '').trim();
};

const findDuplicateProvider = (
  providers: Record<string, ModelProviderConfig>,
  candidate: ModelProviderConfig,
): string | null => {
  const candidateModel = candidate.models?.[0]?.id ?? '';
  for (const [providerKey, providerConfig] of Object.entries(providers)) {
    const providerModel = providerConfig.models?.[0]?.id ?? '';
    if (
      valuesMatch(providerConfig.apiKey, candidate.apiKey)
      && valuesMatch(providerConfig.baseUrl, candidate.baseUrl)
      && valuesMatch(providerConfig.apiFormat, candidate.apiFormat)
      && valuesMatch(providerModel, candidateModel)
    ) {
      return providerKey;
    }
  }
  return null;
};

const findFreeCustomProviderKey = (providers: Record<string, ModelProviderConfig>): string | null => {
  return CUSTOM_PROVIDER_KEYS.find((key) => !providers[key]) ?? null;
};

export const importLocalAgentConfigToModelSettings = (
  store: SqliteStore,
  appType: CliAppType,
): ExternalAgentModelImportResult => {
  const localConfig = appType === 'claude'
    ? readClaudeLocalConfig()
    : appType === 'codex'
      ? readCodexLocalConfig()
      : appType === 'hermes'
        ? readHermesLocalConfig()
      : appType === 'opencode'
        ? readOpenCodeLocalConfig()
        : appType === 'grok'
          ? readGrokBuildLocalConfig()
        : appType === 'qwen'
          ? readQwenCodeLocalConfig()
          : readDeepSeekTuiLocalConfig();
  const providerConfig = buildProviderConfig(appType, localConfig);
  const appConfig = store.get<AppConfigForModelImport>('app_config') ?? {};
  const providers = { ...(appConfig.providers ?? {}) };
  const duplicateProviderKey = findDuplicateProvider(providers, providerConfig);
  const modelId = providerConfig.models?.[0]?.id ?? '';

  if (duplicateProviderKey) {
    return {
      success: true,
      appType,
      imported: false,
      duplicate: true,
      providerKey: duplicateProviderKey,
      providerName: providers[duplicateProviderKey]?.displayName,
      modelId,
      providerConfig: providers[duplicateProviderKey],
    };
  }

  const providerKey = findFreeCustomProviderKey(providers);
  if (!providerKey) {
    throw new Error('自定义模型配置槽位已满，请先删除一个自定义配置。');
  }

  providers[providerKey] = providerConfig;
  store.set('app_config', {
    ...appConfig,
    providers,
  });

  return {
    success: true,
    appType,
    imported: true,
    duplicate: false,
    providerKey,
    providerName: providerConfig.displayName,
    modelId,
    providerConfig,
  };
};
