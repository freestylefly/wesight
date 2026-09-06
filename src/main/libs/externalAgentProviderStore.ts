import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { ExternalAgentConfigSource } from '../../shared/cowork/constants';
import {
  getClaudeCodeModelFromSettingsConfig,
  getClaudeConfigDir as resolveClaudeConfigDir,
} from './claudeCodeLiveConfig';
import {
  DEFAULT_DEEPSEEK_TUI_MODEL,
  listDeepSeekTuiModelProviders,
  mergeDeepSeekTuiConfigForWesightModel,
  parseDeepSeekTuiConfig,
  parseDeepSeekTuiConfigText,
  serializeDeepSeekTuiConfig,
  settingsConfigFromDeepSeekTuiRecord,
  summarizeDeepSeekTuiSettingsConfig,
} from './deepSeekTuiConfig';
import {
  mergeClaudeSettingsForWesightModel,
  mergeCodexConfigForWesightModel,
  removeWesightManagedClaudeSettings,
  writeJsonObjectWithBackupIfChanged,
  writeTextFileWithBackupIfChanged,
} from './externalAgentConfigSync';
import { type CliAppType } from './externalAgentEnvironment';
import {
  DEFAULT_GROK_BUILD_MODEL,
  mergeGrokBuildDefaultModel,
  parseGrokBuildConfigText,
  summarizeGrokBuildConfig,
} from './grokBuildConfig';
import {
  DEFAULT_HERMES_MODEL,
  listHermesModelProviders,
  mergeHermesConfigForWesightModel,
  parseHermesConfig,
  parseHermesConfigText,
  parseHermesDotenvText,
  serializeHermesConfig,
  settingsConfigFromHermesRecord,
  summarizeHermesSettingsConfig,
} from './hermesConfig';
import {
  DEFAULT_OPENCODE_MODEL,
  listOpenCodeModelProviders,
  mergeOpenCodeConfigForWesightModel,
  parseOpenCodeConfig,
  settingsConfigFromOpenCodeRecord,
  summarizeOpenCodeSettingsConfig,
} from './openCodeConfig';
import {
  DEFAULT_QWEN_CODE_MODEL,
  listQwenCodeModelProviders,
  mergeQwenCodeConfigForWesightModel,
  parseQwenCodeSettings,
  settingsConfigFromQwenCodeRecord,
  summarizeQwenCodeSettingsConfig,
} from './qwenCodeConfig';

export type ExternalAgentProviderAppType = CliAppType;

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

export interface ExternalAgentProviderSummary {
  apiKey: string;
  baseUrl: string;
  model: string;
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
  appType: ExternalAgentProviderAppType;
  providers: ExternalAgentProvider[];
  currentProviderId: string | null;
  liveConfigPaths: {
    primaryConfigPath: string;
    secondaryConfigPaths: string[];
  };
}

type ExternalAgentProviderRow = {
  id: string;
  app_type: ExternalAgentProviderAppType;
  name: string;
  settings_config: string;
  category: string | null;
  is_current: number;
  created_at: number;
  updated_at: number;
};

type CcSwitchProviderRow = {
  id: string;
  name: string;
  settings_config: string;
  meta?: string | null;
  category?: string | null;
  is_current?: number | null;
  created_at?: number | null;
};

const CLAUDE_APP_TYPE: ExternalAgentProviderAppType = 'claude';
const CODEX_APP_TYPE: ExternalAgentProviderAppType = 'codex';
const HERMES_APP_TYPE: ExternalAgentProviderAppType = 'hermes';
const OPENCLAW_APP_TYPE: ExternalAgentProviderAppType = 'openclaw';
const OPENCODE_APP_TYPE: ExternalAgentProviderAppType = 'opencode';
const GROK_APP_TYPE: ExternalAgentProviderAppType = 'grok';
const QWEN_APP_TYPE: ExternalAgentProviderAppType = 'qwen';
const DEEPSEEK_TUI_APP_TYPE: ExternalAgentProviderAppType = 'deepseek_tui';
const OPENSQUILLA_APP_TYPE: ExternalAgentProviderAppType = 'opensquilla';
const KIMI_APP_TYPE: ExternalAgentProviderAppType = 'kimi';
const INTERNAL_META_KEY = '__wesightProviderMeta';

/**
 * Injected from main.ts so the store can tell whether an app type is currently
 * set to follow the machine's own CLI config. Defaults to WeSight-managed mode
 * until wired, which keeps the pre-existing write behaviour.
 */
let configSourceGetter: ((appType: ExternalAgentProviderAppType) => ExternalAgentConfigSource) | null = null;

export const setExternalAgentConfigSourceGetter = (
  getter: (appType: ExternalAgentProviderAppType) => ExternalAgentConfigSource,
): void => {
  configSourceGetter = getter;
};

const getConfigSourceForAppType = (appType: ExternalAgentProviderAppType): ExternalAgentConfigSource => {
  try {
    return configSourceGetter?.(appType) ?? ExternalAgentConfigSource.WesightModel;
  } catch (error) {
    console.warn('[ExternalAgentProviderStore] could not read the configured source, assuming WeSight-managed:', error);
    return ExternalAgentConfigSource.WesightModel;
  }
};

/**
 * Claude Code in local-CLI mode is strictly read-only: WeSight follows whatever
 * `claude` itself would read and never writes back to ~/.claude/settings.json or
 * the cc-switch database. Other app types keep their existing behaviour, where
 * switching a provider inside WeSight is still expected to apply to the CLI.
 */
const isReadOnlyLocalConfig = (appType: ExternalAgentProviderAppType): boolean => (
  appType === CLAUDE_APP_TYPE
  && getConfigSourceForAppType(appType) === ExternalAgentConfigSource.LocalCli
);

/**
 * cc-switch only ever managed Claude and Codex. Claude is deliberately excluded:
 * WeSight reads the machine's own Claude config chain instead, so ~/.cc-switch
 * is never read from or written to on its behalf.
 */
const usesCcSwitchIntegration = (appType: ExternalAgentProviderAppType): boolean => (
  appType === CODEX_APP_TYPE
);

const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5';
const DEFAULT_CODEX_MODEL = 'gpt-5.4';
const DEFAULT_HERMES_LOCAL_MODEL = DEFAULT_HERMES_MODEL;
const DEFAULT_OPENCLAW_LOCAL_MODEL = 'openai-codex/gpt-5.5';
const DEFAULT_OPENCODE_LOCAL_MODEL = DEFAULT_OPENCODE_MODEL;
const DEFAULT_GROK_LOCAL_MODEL = DEFAULT_GROK_BUILD_MODEL;
const DEFAULT_QWEN_CODE_LOCAL_MODEL = DEFAULT_QWEN_CODE_MODEL;
const DEFAULT_DEEPSEEK_TUI_LOCAL_MODEL = DEFAULT_DEEPSEEK_TUI_MODEL;
const DEFAULT_OPENSQUILLA_LOCAL_MODEL = 'local-opensquilla';
const DEFAULT_KIMI_CODE_LOCAL_MODEL = 'local-kimi-code';

const homeDir = (): string => os.homedir();

const readJsonObject = (filePath: string): Record<string, unknown> | null => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    // Strip single-line (//) and block (/* */) comments for .jsonc files
    const text = filePath.endsWith('.jsonc')
      ? raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^
]*/g, '')
      : raw;
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

const normalizePathSetting = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? path.resolve(trimmed.replace(/^~(?=$|\/|\\)/, homeDir())) : null;
};

const readCcSwitchSettings = (): Record<string, unknown> => {
  return readJsonObject(path.join(homeDir(), '.cc-switch', 'settings.json')) ?? {};
};

const parseJsonObject = (value: string | null | undefined): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

// Claude Code uses its own CLAUDE_CONFIG_DIR; cc-switch's directory override is
// deliberately not consulted.
const getClaudeConfigDir = (): string => resolveClaudeConfigDir();

const getCodexConfigDir = (): string => {
  const settings = readCcSwitchSettings();
  return normalizePathSetting(settings.codexConfigDir)
    ?? normalizePathSetting(settings.codex_config_dir)
    ?? path.join(homeDir(), '.codex');
};

const getClaudeSettingsPath = (): string => {
  const configDir = getClaudeConfigDir();
  const settingsPath = path.join(configDir, 'settings.json');
  if (fs.existsSync(settingsPath)) return settingsPath;
  const legacyPath = path.join(configDir, 'claude.json');
  if (fs.existsSync(legacyPath)) return legacyPath;
  return settingsPath;
};

const getCodexAuthPath = (): string => path.join(getCodexConfigDir(), 'auth.json');
const getCodexConfigPath = (): string => path.join(getCodexConfigDir(), 'config.toml');
const getHermesConfigDir = (): string => path.join(homeDir(), '.hermes');
const getHermesConfigPath = (): string => path.join(getHermesConfigDir(), 'config.yaml');
const getHermesEnvPath = (): string => path.join(getHermesConfigDir(), '.env');
const getOpenClawConfigDir = (): string => path.join(homeDir(), '.openclaw');
const getOpenClawConfigPath = (): string => path.join(getOpenClawConfigDir(), 'openclaw.json');
const getOpenCodeConfigDir = (): string => path.join(homeDir(), '.config', 'opencode');
const getOpenCodeConfigPath = (): string => {
  const jsoncPath = path.join(getOpenCodeConfigDir(), 'opencode.jsonc');
  return fs.existsSync(jsoncPath) ? jsoncPath : path.join(getOpenCodeConfigDir(), 'opencode.json');
};
const getOpenCodeAuthPath = (): string => path.join(homeDir(), '.local', 'share', 'opencode', 'auth.json');
const getGrokBuildConfigDir = (): string => path.join(homeDir(), '.grok');
const getGrokBuildConfigPath = (): string => path.join(getGrokBuildConfigDir(), 'config.toml');
const getGrokBuildAuthPath = (): string => path.join(getGrokBuildConfigDir(), 'auth.json');
const getQwenCodeConfigDir = (): string => path.join(homeDir(), '.qwen');
const getQwenCodeSettingsPath = (): string => path.join(getQwenCodeConfigDir(), 'settings.json');
const getQwenCodeOauthPath = (): string => path.join(getQwenCodeConfigDir(), 'oauth_creds.json');
const getDeepSeekTuiConfigDir = (): string => path.join(homeDir(), '.deepseek');
const getDeepSeekTuiConfigPath = (): string => path.join(getDeepSeekTuiConfigDir(), 'config.toml');
const getOpenSquillaConfigDir = (): string => path.join(homeDir(), '.opensquilla');
const getOpenSquillaConfigPath = (): string => path.join(getOpenSquillaConfigDir(), 'config.toml');
const getKimiCodeConfigDir = (): string => path.join(homeDir(), '.kimi-code');
const getKimiSdkConfigDir = (): string => path.join(homeDir(), '.kimi');
const getKimiCodeConfigPath = (): string => path.join(getKimiCodeConfigDir(), 'config.toml');
const getKimiSdkConfigPath = (): string => path.join(getKimiSdkConfigDir(), 'config.toml');
const getKimiCodeCredentialsPath = (): string => path.join(getKimiCodeConfigDir(), 'credentials', 'kimi-code.json');

const getLiveConfigPaths = (appType: ExternalAgentProviderAppType): ExternalAgentProviderListResult['liveConfigPaths'] => {
  if (appType === CLAUDE_APP_TYPE) {
    return {
      primaryConfigPath: getClaudeSettingsPath(),
      secondaryConfigPaths: [],
    };
  }
  if (appType === OPENCODE_APP_TYPE) {
    return {
      primaryConfigPath: getOpenCodeConfigPath(),
      secondaryConfigPaths: [getOpenCodeAuthPath()],
    };
  }
  if (appType === GROK_APP_TYPE) {
    return {
      primaryConfigPath: getGrokBuildConfigPath(),
      secondaryConfigPaths: [getGrokBuildAuthPath()],
    };
  }
  if (appType === HERMES_APP_TYPE) {
    return {
      primaryConfigPath: getHermesConfigPath(),
      secondaryConfigPaths: [getHermesEnvPath()],
    };
  }
  if (appType === OPENCLAW_APP_TYPE) {
    return {
      primaryConfigPath: getOpenClawConfigPath(),
      secondaryConfigPaths: [path.join(getOpenClawConfigDir(), 'identity', 'device-auth.json')],
    };
  }
  if (appType === QWEN_APP_TYPE) {
    return {
      primaryConfigPath: getQwenCodeSettingsPath(),
      secondaryConfigPaths: [getQwenCodeOauthPath()],
    };
  }
  if (appType === DEEPSEEK_TUI_APP_TYPE) {
    return {
      primaryConfigPath: getDeepSeekTuiConfigPath(),
      secondaryConfigPaths: [path.join(getDeepSeekTuiConfigDir(), 'sessions')],
    };
  }
  if (appType === OPENSQUILLA_APP_TYPE) {
    return {
      primaryConfigPath: getOpenSquillaConfigPath(),
      secondaryConfigPaths: [path.join(getOpenSquillaConfigDir(), '.env'), path.join(getOpenSquillaConfigDir(), 'state')],
    };
  }
  if (appType === KIMI_APP_TYPE) {
    return {
      primaryConfigPath: getKimiCodeConfigPath(),
      secondaryConfigPaths: [
        getKimiCodeCredentialsPath(),
        getKimiSdkConfigPath(),
        path.join(getKimiCodeConfigDir(), 'session_index.jsonl'),
        path.join(getKimiSdkConfigDir(), 'session_index.jsonl'),
        path.join(getKimiCodeConfigDir(), 'skills'),
        path.join(getKimiSdkConfigDir(), 'skills'),
      ],
    };
  }
  return {
    primaryConfigPath: getCodexConfigPath(),
    secondaryConfigPaths: [getCodexAuthPath()],
  };
};

const atomicWrite = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, filePath);
};

const writeJsonFile = (filePath: string, value: unknown): void => {
  atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const sanitizeProviderKey = (value: string): string => {
  const key = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  return key || 'custom';
};

const tomlString = (value: string): string => {
  return JSON.stringify(value);
};

const buildCodexConfig = (providerName: string, baseUrl: string, model: string): string => {
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

const getNestedRecord = (value: unknown, key: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : {};
};

const getString = (value: unknown): string => {
  return typeof value === 'string' ? value : '';
};

const resolveOpenClawCurrentModel = (config: Record<string, unknown>): string => {
  const agents = getNestedRecord(config, 'agents');
  const defaults = getNestedRecord(agents, 'defaults');
  const model = getNestedRecord(defaults, 'model');
  return getString(model.primary) || getString(defaults.model) || DEFAULT_OPENCLAW_LOCAL_MODEL;
};

const listOpenClawModelIds = (config: Record<string, unknown>): string[] => {
  const currentModel = resolveOpenClawCurrentModel(config);
  const agents = getNestedRecord(config, 'agents');
  const defaults = getNestedRecord(agents, 'defaults');
  const models = getNestedRecord(defaults, 'models');
  const modelIds = new Set<string>();
  for (const key of Object.keys(models)) {
    if (key.trim()) modelIds.add(key.trim());
  }
  if (currentModel.trim()) modelIds.add(currentModel.trim());
  return [...modelIds];
};

const summarizeOpenClawSettingsConfig = (
  settingsConfig: Record<string, unknown>,
): ExternalAgentProviderSummary => {
  const model = getString(settingsConfig.model) || DEFAULT_OPENCLAW_LOCAL_MODEL;
  return {
    apiKey: '',
    baseUrl: '',
    model,
  };
};

const extractTomlString = (configText: string, key: string): string => {
  const match = configText.match(new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']*)["']`, 'm'));
  return match?.[1] ?? '';
};

const readTomlTableBody = (configText: string, tableName: string): string => {
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = configText.match(
    new RegExp(`^\\s*\\[${escapedTableName}\\]\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n\\s*\\[|$)`, 'm'),
  );
  return match?.[1] ?? '';
};

const summarizeOpenSquillaSettingsConfig = (
  settingsConfig: Record<string, unknown>,
): ExternalAgentProviderSummary => {
  const configText = getString(settingsConfig.config);
  const llmConfig = getNestedRecord(settingsConfig, 'llm');
  const llmBody = readTomlTableBody(configText, 'llm');
  const routingBody = readTomlTableBody(configText, 'llm.provider_routing');
  const provider = getString(settingsConfig.provider)
    || getString(llmConfig.provider)
    || extractTomlString(llmBody, 'provider')
    || extractTomlString(routingBody, 'provider')
    || extractTomlString(configText, 'llm.provider')
    || extractTomlString(configText, 'provider')
    || extractTomlString(configText, 'model_provider');
  const model = getString(settingsConfig.model)
    || getString(llmConfig.model)
    || extractTomlString(llmBody, 'model')
    || extractTomlString(routingBody, 'model')
    || extractTomlString(configText, 'llm.model')
    || extractTomlString(configText, 'model')
    || extractTomlString(configText, 'default_model')
    || DEFAULT_OPENSQUILLA_LOCAL_MODEL;
  const baseUrl = getString(settingsConfig.baseUrl)
    || getString(llmConfig.base_url)
    || extractTomlString(llmBody, 'base_url')
    || extractTomlString(configText, 'llm.base_url')
    || extractTomlString(configText, 'base_url');
  return {
    apiKey: '',
    baseUrl,
    model: provider && model ? `${provider}/${model}` : model,
  };
};

const summarizeKimiCodeSettingsConfig = (
  settingsConfig: Record<string, unknown>,
): ExternalAgentProviderSummary => {
  const configText = getString(settingsConfig.config);
  const defaultModel = getString(settingsConfig.defaultModel)
    || extractTomlString(configText, 'default_model')
    || extractTomlString(configText, 'defaultModel')
    || extractTomlString(configText, 'model')
    || DEFAULT_KIMI_CODE_LOCAL_MODEL;
  const provider = getString(settingsConfig.provider)
    || extractTomlString(configText, 'provider')
    || extractTomlString(configText, 'model_provider');
  return {
    apiKey: '',
    baseUrl: '',
    model: defaultModel || provider,
  };
};

type KimiCodeModelRecord = {
  id: string;
  name: string;
  provider: string;
  isCurrent: boolean;
};

const listKimiCodeModelRecords = (configText: string): KimiCodeModelRecord[] => {
  const defaultModel = extractTomlString(configText, 'default_model')
    || extractTomlString(configText, 'defaultModel')
    || extractTomlString(configText, 'model')
    || DEFAULT_KIMI_CODE_LOCAL_MODEL;
  const records: KimiCodeModelRecord[] = [];
  const seen = new Set<string>();
  const tablePattern = /^\s*\[models\.(?:"([^"]+)"|'([^']+)'|([^\]]+))\]\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(configText)) !== null) {
    const modelId = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!modelId || seen.has(modelId)) continue;
    seen.add(modelId);
    const tableStart = tablePattern.lastIndex;
    const nextTableIndex = configText.slice(tableStart).search(/^\s*\[/m);
    const tableBody = nextTableIndex >= 0
      ? configText.slice(tableStart, tableStart + nextTableIndex)
      : configText.slice(tableStart);
    const displayName = extractTomlString(tableBody, 'display_name')
      || extractTomlString(tableBody, 'name')
      || modelId;
    const provider = extractTomlString(tableBody, 'provider')
      || extractTomlString(configText, 'provider')
      || 'kimi';
    records.push({
      id: modelId,
      name: displayName,
      provider,
      isCurrent: modelId === defaultModel,
    });
  }
  if (!seen.has(defaultModel)) {
    records.unshift({
      id: defaultModel,
      name: defaultModel,
      provider: extractTomlString(configText, 'provider') || 'kimi',
      isCurrent: true,
    });
  }
  return records;
};

const settingsConfigFromKimiCodeRecord = (
  record: KimiCodeModelRecord,
  configText: string,
): Record<string, unknown> => ({
  config: configText,
  credentialsPath: fs.existsSync(getKimiCodeCredentialsPath()) ? getKimiCodeCredentialsPath() : '',
  provider: record.provider,
  defaultModel: record.id,
  model: record.id,
  modelName: record.name,
});

const extractCodexProviderBaseUrl = (configText: string): string => {
  const provider = extractTomlString(configText, 'model_provider');
  if (!provider) {
    return extractTomlString(configText, 'base_url');
  }
  const tableMatch = configText.match(new RegExp(`\\[model_providers\\.${provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]([\\s\\S]*?)(?:\\n\\[|$)`));
  return extractTomlString(tableMatch?.[1] ?? '', 'base_url');
};

const summarizeProvider = (
  appType: ExternalAgentProviderAppType,
  settingsConfig: Record<string, unknown>,
): ExternalAgentProviderSummary => {
  if (appType === CLAUDE_APP_TYPE) {
    const env = getNestedRecord(settingsConfig, 'env');
    return {
      apiKey: getString(env.ANTHROPIC_AUTH_TOKEN) || getString(env.ANTHROPIC_API_KEY),
      baseUrl: getString(env.ANTHROPIC_BASE_URL),
      model: getClaudeCodeModelFromSettingsConfig(settingsConfig),
    };
  }

  if (appType === OPENCODE_APP_TYPE) {
    return summarizeOpenCodeSettingsConfig(settingsConfig);
  }
  if (appType === HERMES_APP_TYPE) {
    return summarizeHermesSettingsConfig(settingsConfig);
  }

  if (appType === OPENCLAW_APP_TYPE) {
    return summarizeOpenClawSettingsConfig(settingsConfig);
  }

  if (appType === QWEN_APP_TYPE) {
    return summarizeQwenCodeSettingsConfig(settingsConfig);
  }

  if (appType === DEEPSEEK_TUI_APP_TYPE) {
    return summarizeDeepSeekTuiSettingsConfig(settingsConfig);
  }
  if (appType === OPENSQUILLA_APP_TYPE) {
    return summarizeOpenSquillaSettingsConfig(settingsConfig);
  }
  if (appType === KIMI_APP_TYPE) {
    return summarizeKimiCodeSettingsConfig(settingsConfig);
  }
  if (appType === GROK_APP_TYPE) {
    return {
      apiKey: '',
      baseUrl: '',
      model: getString(settingsConfig.model) || DEFAULT_GROK_LOCAL_MODEL,
    };
  }

  const auth = getNestedRecord(settingsConfig, 'auth');
  const configText = getString(settingsConfig.config);
  return {
    apiKey: getString(auth.OPENAI_API_KEY),
    baseUrl: extractCodexProviderBaseUrl(configText),
    model: extractTomlString(configText, 'model'),
  };
};

const buildSettingsConfigFromInput = (input: ExternalAgentProviderInput): Record<string, unknown> => {
  if (input.settingsConfig && typeof input.settingsConfig === 'object') {
    return input.settingsConfig;
  }

  if (input.appType === CLAUDE_APP_TYPE) {
    const model = input.model?.trim() || DEFAULT_CLAUDE_MODEL;
    const env: Record<string, string> = {
      ANTHROPIC_BASE_URL: input.baseUrl?.trim() || '',
      ANTHROPIC_API_KEY: input.apiKey?.trim() || '',
      ANTHROPIC_AUTH_TOKEN: input.apiKey?.trim() || '',
      ANTHROPIC_MODEL: model,
      ANTHROPIC_REASONING_MODEL: model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: model,
      ANTHROPIC_DEFAULT_OPUS_MODEL: model,
      ANTHROPIC_SMALL_FAST_MODEL: model,
    };
    return { env };
  }

  if (input.appType === OPENCODE_APP_TYPE) {
    const model = input.model?.trim() || DEFAULT_OPENCODE_LOCAL_MODEL;
    return {
      config: mergeOpenCodeConfigForWesightModel({}, {
        apiKey: input.apiKey?.trim() || '',
        baseURL: input.baseUrl?.trim() || '',
        model: model.includes('/') ? model.split('/').slice(1).join('/') : model,
        apiType: 'openai',
      }, input.name),
      model,
    };
  }
  if (input.appType === OPENCLAW_APP_TYPE) {
    return {
      model: input.model?.trim() || DEFAULT_OPENCLAW_LOCAL_MODEL,
    };
  }
  if (input.appType === HERMES_APP_TYPE) {
    const model = input.model?.trim() || DEFAULT_HERMES_LOCAL_MODEL;
    return {
      config: mergeHermesConfigForWesightModel({}, {
        apiKey: input.apiKey?.trim() || '',
        baseURL: input.baseUrl?.trim() || '',
        model,
        apiType: 'openai',
      }, {
        providerName: input.name,
      }),
      env: {
        HERMES_INFERENCE_API_KEY: input.apiKey?.trim() || '',
        HERMES_INFERENCE_BASE_URL: input.baseUrl?.trim() || '',
        HERMES_INFERENCE_MODEL: model,
      },
      model,
    };
  }

  if (input.appType === QWEN_APP_TYPE) {
    const model = input.model?.trim() || DEFAULT_QWEN_CODE_LOCAL_MODEL;
    return {
      config: mergeQwenCodeConfigForWesightModel({}, {
        apiKey: input.apiKey?.trim() || '',
        baseURL: input.baseUrl?.trim() || '',
        model,
        apiType: 'openai',
      }, input.name),
      model,
      authType: 'openai',
    };
  }

  if (input.appType === DEEPSEEK_TUI_APP_TYPE) {
    const model = input.model?.trim() || DEFAULT_DEEPSEEK_TUI_LOCAL_MODEL;
    return {
      provider: 'openai',
      config: mergeDeepSeekTuiConfigForWesightModel({}, {
        apiKey: input.apiKey?.trim() || '',
        baseURL: input.baseUrl?.trim() || '',
        model,
        apiType: 'openai',
      }, input.name),
      model,
    };
  }
  if (input.appType === GROK_APP_TYPE) {
    return {
      model: input.model?.trim() || DEFAULT_GROK_LOCAL_MODEL,
    };
  }
  if (input.appType === OPENSQUILLA_APP_TYPE) {
    return {
      model: input.model?.trim() || DEFAULT_OPENSQUILLA_LOCAL_MODEL,
      provider: input.name.trim() || 'OpenSquilla',
      baseUrl: input.baseUrl?.trim() || '',
    };
  }
  if (input.appType === KIMI_APP_TYPE) {
    return {
      model: input.model?.trim() || DEFAULT_KIMI_CODE_LOCAL_MODEL,
      provider: input.name.trim() || 'Kimi Code',
    };
  }

  const model = input.model?.trim() || DEFAULT_CODEX_MODEL;
  return {
    auth: {
      OPENAI_API_KEY: input.apiKey?.trim() || '',
    },
    config: buildCodexConfig(input.name, input.baseUrl?.trim() || '', model),
  };
};

export const appTypeFromEngine = (engine: string): ExternalAgentProviderAppType | null => {
  if (engine === 'openclaw') return OPENCLAW_APP_TYPE;
  if (engine === 'claude_code') return CLAUDE_APP_TYPE;
  if (engine === 'codex') return CODEX_APP_TYPE;
  if (engine === 'hermes') return HERMES_APP_TYPE;
  if (engine === 'opencode') return OPENCODE_APP_TYPE;
  if (engine === 'grok_build') return GROK_APP_TYPE;
  if (engine === 'qwen_code') return QWEN_APP_TYPE;
  if (engine === 'deepseek_tui') return DEEPSEEK_TUI_APP_TYPE;
  if (engine === 'opensquilla') return OPENSQUILLA_APP_TYPE;
  if (engine === 'kimi_code') return KIMI_APP_TYPE;
  return null;
};

export class ExternalAgentProviderStore {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  listProviders(appType: ExternalAgentProviderAppType): ExternalAgentProviderListResult {
    this.syncConfiguredProviders(appType);
    const rows = this.db
      .prepare(
        `
        SELECT id, app_type, name, settings_config, category, is_current, created_at, updated_at
        FROM external_agent_providers
        WHERE app_type = ?
        ORDER BY is_current DESC, updated_at DESC, created_at DESC
      `,
      )
      .all(appType) as ExternalAgentProviderRow[];
    const providers = rows.map((row) => this.mapProviderRow(row));
    return {
      appType,
      providers,
      currentProviderId: providers.find((provider) => provider.isCurrent)?.id ?? null,
      liveConfigPaths: getLiveConfigPaths(appType),
    };
  }

  saveProvider(input: ExternalAgentProviderInput): ExternalAgentProvider {
    const now = Date.now();
    const id = input.id?.trim() || crypto.randomUUID();
    const name = input.name.trim();
    if (!name) {
      throw new Error('Provider name is required.');
    }
    const settingsConfig = buildSettingsConfigFromInput(input);
    const existing = this.db
      .prepare('SELECT created_at FROM external_agent_providers WHERE app_type = ? AND id = ?')
      .get(input.appType, id) as { created_at: number } | undefined;
    this.db
      .prepare(
        `
        INSERT INTO external_agent_providers (
          id, app_type, name, settings_config, category, is_current, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)
        ON CONFLICT(id, app_type) DO UPDATE SET
          name = excluded.name,
          settings_config = excluded.settings_config,
          category = excluded.category,
          updated_at = excluded.updated_at
      `,
      )
      .run(
        id,
        input.appType,
        name,
        JSON.stringify(settingsConfig),
        input.category ?? null,
        existing?.created_at ?? now,
        now,
      );

    if (input.setCurrent) {
      this.setCurrentProvider(input.appType, id);
    }

    const provider = this.getProvider(input.appType, id);
    if (!provider) {
      throw new Error('Provider was not saved.');
    }
    return provider;
  }

  deleteProvider(appType: ExternalAgentProviderAppType, id: string): void {
    const current = this.getProvider(appType, id)?.isCurrent ?? false;
    this.db
      .prepare('DELETE FROM external_agent_providers WHERE app_type = ? AND id = ?')
      .run(appType, id);
    if (current) {
      const fallback = this.db
        .prepare(
          `
          SELECT id FROM external_agent_providers
          WHERE app_type = ?
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
        `,
        )
        .get(appType) as { id: string } | undefined;
      if (fallback?.id) {
        this.setCurrentProvider(appType, fallback.id);
      }
    }
  }

  setCurrentProvider(appType: ExternalAgentProviderAppType, id: string): ExternalAgentProvider {
    const provider = this.getProvider(appType, id);
    if (!provider) {
      throw new Error('Provider not found.');
    }
    const transaction = this.db.transaction(() => {
      this.db
        .prepare('UPDATE external_agent_providers SET is_current = 0 WHERE app_type = ?')
        .run(appType);
      this.db
        .prepare('UPDATE external_agent_providers SET is_current = 1, updated_at = ? WHERE app_type = ? AND id = ?')
        .run(Date.now(), appType, id);
    });
    transaction();
    this.applyProviderToLive(provider);
    const updated = this.getProvider(appType, id);
    if (!updated) {
      throw new Error('Provider not found after switch.');
    }
    return updated;
  }

  getCurrentProvider(appType: ExternalAgentProviderAppType): ExternalAgentProvider | null {
    this.syncConfiguredProviders(appType);
    const row = this.db
      .prepare(
        `
        SELECT id, app_type, name, settings_config, category, is_current, created_at, updated_at
        FROM external_agent_providers
        WHERE app_type = ? AND is_current = 1
        LIMIT 1
      `,
      )
      .get(appType) as ExternalAgentProviderRow | undefined;
    return row ? this.mapProviderRow(row) : null;
  }

  applyCurrentProvider(appType: ExternalAgentProviderAppType): void {
    const row = this.db
      .prepare(
        `
        SELECT id, app_type, name, settings_config, category, is_current, created_at, updated_at
        FROM external_agent_providers
        WHERE app_type = ? AND is_current = 1
        LIMIT 1
      `,
      )
      .get(appType) as ExternalAgentProviderRow | undefined;
    if (row) {
      this.applyProviderToLive(this.mapProviderRow(row));
    }
  }

  importLiveProvider(appType: ExternalAgentProviderAppType): ExternalAgentProvider | null {
    const settingsConfig = this.readLiveSettingsConfig(appType);
    if (!settingsConfig) return null;
    const existing = this.getProvider(appType, 'local-live');
    const localName = appType === CLAUDE_APP_TYPE
      ? 'Local Claude Code'
      : appType === HERMES_APP_TYPE
        ? 'Local Hermes Agent'
      : appType === OPENCLAW_APP_TYPE
        ? 'Local OpenClaw'
      : appType === OPENSQUILLA_APP_TYPE
        ? 'Local OpenSquilla'
      : appType === KIMI_APP_TYPE
        ? 'Local Kimi Code'
      : appType === OPENCODE_APP_TYPE
        ? 'Local OpenCode'
        : appType === GROK_APP_TYPE
          ? 'Local Grok Build'
        : appType === QWEN_APP_TYPE
          ? 'Local Qwen Code'
          : appType === DEEPSEEK_TUI_APP_TYPE
            ? 'Local DeepSeek-TUI'
            : 'Local Codex';
    return this.saveProvider({
      appType,
      id: existing?.id ?? 'local-live',
      name: localName,
      settingsConfig,
      category: 'local',
      setCurrent: !this.getCurrentProviderId(appType),
    });
  }

  importCcSwitchProviders(appType: ExternalAgentProviderAppType, options: { seedCurrent?: boolean } = {}): number {
    if (!usesCcSwitchIntegration(appType)) {
      return 0;
    }
    const dbPath = path.join(homeDir(), '.cc-switch', 'cc-switch.db');
    if (!fs.existsSync(dbPath)) return 0;
    let sourceDb: Database.Database | null = null;
    try {
      sourceDb = new Database(dbPath, { readonly: true, fileMustExist: true });
      const currentProviderId = this.getCcSwitchCurrentProviderId(appType);
      let shouldSeedCurrent = Boolean(options.seedCurrent && !this.getCurrentProviderId(appType));
      const rows = sourceDb
        .prepare(
          `
          SELECT id, name, settings_config, meta, category, is_current, created_at
          FROM providers
          WHERE app_type = ?
          ORDER BY COALESCE(sort_index, 999999), created_at ASC, id ASC
        `,
        )
        .all(appType) as CcSwitchProviderRow[];
      let imported = 0;
      for (const row of rows) {
        const settingsConfig = JSON.parse(row.settings_config || '{}') as Record<string, unknown>;
        const meta = parseJsonObject(row.meta);
        if (Object.keys(meta).length > 0) {
          settingsConfig[INTERNAL_META_KEY] = meta;
        }
        const isCurrent = currentProviderId
          ? row.id === currentProviderId
          : Boolean(row.is_current);
        this.saveProvider({
          appType,
          id: `ccswitch-${row.id}`,
          name: row.name,
          settingsConfig,
          category: row.category ?? 'cc-switch',
          setCurrent: shouldSeedCurrent && isCurrent,
        });
        if (shouldSeedCurrent && isCurrent) {
          shouldSeedCurrent = false;
        }
        imported += 1;
      }
      if (shouldSeedCurrent && rows[0]?.id) {
        this.setCurrentProvider(appType, `ccswitch-${rows[0].id}`);
      }
      return imported;
    } finally {
      try {
        sourceDb?.close();
      } catch {
        // Ignore snapshot close failures.
      }
    }
  }

  private getProvider(appType: ExternalAgentProviderAppType, id: string): ExternalAgentProvider | null {
    const row = this.db
      .prepare(
        `
        SELECT id, app_type, name, settings_config, category, is_current, created_at, updated_at
        FROM external_agent_providers
        WHERE app_type = ? AND id = ?
      `,
      )
      .get(appType, id) as ExternalAgentProviderRow | undefined;
    return row ? this.mapProviderRow(row) : null;
  }

  private getCcSwitchCurrentProviderId(appType: ExternalAgentProviderAppType): string | null {
    if (!usesCcSwitchIntegration(appType)) return null;
    const settings = readCcSwitchSettings();
    const value = settings.currentProviderCodex ?? settings.current_provider_codex;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private getCurrentProviderId(appType: ExternalAgentProviderAppType): string | null {
    const row = this.db
      .prepare('SELECT id FROM external_agent_providers WHERE app_type = ? AND is_current = 1 LIMIT 1')
      .get(appType) as { id: string } | undefined;
    return row?.id ?? null;
  }

  private deleteLiveProviderSnapshot(appType: ExternalAgentProviderAppType): boolean {
    const row = this.db
      .prepare('SELECT is_current FROM external_agent_providers WHERE app_type = ? AND id = ? LIMIT 1')
      .get(appType, 'local-live') as { is_current?: number } | undefined;
    if (!row) return false;
    this.db
      .prepare('DELETE FROM external_agent_providers WHERE app_type = ? AND id = ?')
      .run(appType, 'local-live');
    return Boolean(row.is_current);
  }

  private selectFallbackProvider(appType: ExternalAgentProviderAppType): void {
    const row = this.db
      .prepare(
        `
        SELECT id FROM external_agent_providers
        WHERE app_type = ?
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `,
      )
      .get(appType) as { id: string } | undefined;
    if (row?.id) {
      this.setCurrentProvider(appType, row.id);
    }
  }

  private refreshLiveProviderSnapshot(appType: ExternalAgentProviderAppType): void {
    if (this.importLiveProvider(appType)) {
      return;
    }
    const deletedCurrentLiveSnapshot = this.deleteLiveProviderSnapshot(appType);
    if (deletedCurrentLiveSnapshot) {
      this.selectFallbackProvider(appType);
    }
  }

  private stripInternalSettingsConfig(settingsConfig: Record<string, unknown>): Record<string, unknown> {
    const next = { ...settingsConfig };
    delete next[INTERNAL_META_KEY];
    return next;
  }

  private getCcSwitchProviderId(provider: ExternalAgentProvider): string | null {
    if (!provider.id.startsWith('ccswitch-')) return null;
    return provider.id.slice('ccswitch-'.length);
  }

  private writeCcSwitchCurrentProvider(appType: ExternalAgentProviderAppType, provider: ExternalAgentProvider): void {
    if (!usesCcSwitchIntegration(appType)) return;
    const providerId = this.getCcSwitchProviderId(provider);
    if (!providerId) return;

    const appDir = path.join(homeDir(), '.cc-switch');
    const settingsPath = path.join(appDir, 'settings.json');
    const dbPath = path.join(appDir, 'cc-switch.db');
    const settings = readJsonObject(settingsPath) ?? {};
    settings.currentProviderCodex = providerId;
    if (Object.prototype.hasOwnProperty.call(settings, 'current_provider_codex')) {
      settings.current_provider_codex = providerId;
    }
    writeJsonFile(settingsPath, settings);

    if (!fs.existsSync(dbPath)) return;
    let sourceDb: Database.Database | null = null;
    try {
      sourceDb = new Database(dbPath);
      sourceDb
        .prepare('UPDATE providers SET is_current = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE app_type = ?')
        .run(providerId, appType);
    } finally {
      try {
        sourceDb?.close();
      } catch {
        // Ignore close errors after syncing the local provider pointer.
      }
    }
  }

  private selectCcSwitchCurrentProvider(appType: ExternalAgentProviderAppType): void {
    if (!usesCcSwitchIntegration(appType)) return;
    const currentProviderId = this.getCcSwitchCurrentProviderId(appType);
    const currentProvider = currentProviderId
      ? this.getProvider(appType, `ccswitch-${currentProviderId}`)
      : null;
    if (currentProvider) {
      this.setCurrentProvider(appType, currentProvider.id);
      return;
    }

    const row = this.db
      .prepare(
        `
        SELECT id FROM external_agent_providers
        WHERE app_type = ? AND id LIKE 'ccswitch-%'
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `,
      )
      .get(appType) as { id: string } | undefined;
    if (row?.id) {
      this.setCurrentProvider(appType, row.id);
    }
  }

  private importLiveProviderIfEmpty(appType: ExternalAgentProviderAppType): void {
    const row = this.db
      .prepare('SELECT id FROM external_agent_providers WHERE app_type = ? LIMIT 1')
      .get(appType);
    if (!row) {
      this.importLiveProvider(appType);
    }
  }

  private syncConfiguredProviders(appType: ExternalAgentProviderAppType): void {
    if (appType === CLAUDE_APP_TYPE) {
      // WeSight keeps no provider records for Claude Code: the machine's own
      // settings chain is the single source of truth, read on demand.
      return;
    }
    if (appType === OPENCODE_APP_TYPE) {
      this.syncOpenCodeLiveProviders();
      return;
    }
    if (appType === HERMES_APP_TYPE) {
      this.syncHermesLiveProviders();
      return;
    }
    if (appType === OPENCLAW_APP_TYPE) {
      this.syncOpenClawLiveProviders();
      return;
    }
    if (appType === QWEN_APP_TYPE) {
      this.syncQwenCodeLiveProviders();
      return;
    }
    if (appType === DEEPSEEK_TUI_APP_TYPE) {
      this.syncDeepSeekTuiLiveProviders();
      return;
    }
    if (appType === GROK_APP_TYPE) {
      this.importLiveProviderIfEmpty(appType);
      return;
    }
    if (appType === OPENSQUILLA_APP_TYPE) {
      this.refreshLiveProviderSnapshot(appType);
      return;
    }
    if (appType === KIMI_APP_TYPE) {
      this.syncKimiCodeLiveProviders();
      return;
    }
    const hasCurrent = Boolean(this.getCurrentProviderId(appType));
    const imported = this.importCcSwitchProviders(appType, { seedCurrent: !hasCurrent });
    if (imported > 0) {
      const deletedCurrentLiveSnapshot = this.deleteLiveProviderSnapshot(appType);
      if (deletedCurrentLiveSnapshot || !this.getCurrentProviderId(appType)) {
        this.selectCcSwitchCurrentProvider(appType);
      }
    }
    if (imported === 0) {
      this.refreshLiveProviderSnapshot(appType);
    }
  }

  private syncOpenClawLiveProviders(): void {
    const config = readJsonObject(getOpenClawConfigPath());
    if (!config) {
      this.importLiveProviderIfEmpty(OPENCLAW_APP_TYPE);
      return;
    }
    const currentModel = resolveOpenClawCurrentModel(config);
    const modelIds = listOpenClawModelIds(config);
    this.db
      .prepare('DELETE FROM external_agent_providers WHERE app_type = ? AND category = ?')
      .run(OPENCLAW_APP_TYPE, 'local');
    const now = Date.now();
    for (const modelId of modelIds) {
      const providerId = modelId.includes('/') ? modelId.split('/')[0] : 'openclaw';
      this.db
        .prepare(
          `
          INSERT INTO external_agent_providers (
            id, app_type, name, settings_config, category, is_current, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id, app_type) DO UPDATE SET
            name = excluded.name,
            settings_config = excluded.settings_config,
            category = excluded.category,
            is_current = excluded.is_current,
            updated_at = excluded.updated_at
        `,
        )
        .run(
          `local-${crypto.createHash('sha1').update(modelId).digest('hex').slice(0, 16)}`,
          OPENCLAW_APP_TYPE,
          providerId === 'openclaw' ? modelId : providerId,
          JSON.stringify({ model: modelId }),
          'local',
          modelId === currentModel ? 1 : 0,
          now,
          now,
        );
    }
    if (!modelIds.includes(currentModel) && currentModel) {
      this.importLiveProvider(OPENCLAW_APP_TYPE);
    }
  }

  private syncOpenCodeLiveProviders(): void {
    const config = readJsonObject(getOpenCodeConfigPath());
    if (!config) {
      this.importLiveProviderIfEmpty(OPENCODE_APP_TYPE);
      return;
    }
    const records = listOpenCodeModelProviders(parseOpenCodeConfig(config));
    this.db
      .prepare('DELETE FROM external_agent_providers WHERE app_type = ? AND category = ?')
      .run(OPENCODE_APP_TYPE, 'local');
    const now = Date.now();
    for (const record of records) {
      this.db
        .prepare(
          `
          INSERT INTO external_agent_providers (
            id, app_type, name, settings_config, category, is_current, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id, app_type) DO UPDATE SET
            name = excluded.name,
            settings_config = excluded.settings_config,
            category = excluded.category,
            is_current = excluded.is_current,
            updated_at = excluded.updated_at
        `,
        )
        .run(
          record.id,
          OPENCODE_APP_TYPE,
          record.name,
          JSON.stringify(settingsConfigFromOpenCodeRecord(record)),
          'local',
          record.isCurrent ? 1 : 0,
          now,
          now,
        );
    }
    if (!records.some((record) => record.isCurrent) && records[0]) {
      this.db
        .prepare('UPDATE external_agent_providers SET is_current = 1 WHERE app_type = ? AND id = ?')
        .run(OPENCODE_APP_TYPE, records[0].id);
    }
  }

  private syncHermesLiveProviders(): void {
    const configPath = getHermesConfigPath();
    if (!fs.existsSync(configPath)) {
      this.importLiveProviderIfEmpty(HERMES_APP_TYPE);
      return;
    }
    const config = parseHermesConfigText(fs.readFileSync(configPath, 'utf8'));
    const env = fs.existsSync(getHermesEnvPath())
      ? parseHermesDotenvText(fs.readFileSync(getHermesEnvPath(), 'utf8'))
      : {};
    const records = listHermesModelProviders(config, env);
    this.db
      .prepare('DELETE FROM external_agent_providers WHERE app_type = ? AND category = ?')
      .run(HERMES_APP_TYPE, 'local');
    const now = Date.now();
    for (const record of records) {
      this.db
        .prepare(
          `
          INSERT INTO external_agent_providers (
            id, app_type, name, settings_config, category, is_current, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id, app_type) DO UPDATE SET
            name = excluded.name,
            settings_config = excluded.settings_config,
            category = excluded.category,
            is_current = excluded.is_current,
            updated_at = excluded.updated_at
        `,
        )
        .run(
          record.id,
          HERMES_APP_TYPE,
          record.name,
          JSON.stringify(settingsConfigFromHermesRecord(record)),
          'local',
          record.isCurrent ? 1 : 0,
          now,
          now,
        );
    }
    if (!records.some((record) => record.isCurrent) && records[0]) {
      this.db
        .prepare('UPDATE external_agent_providers SET is_current = 1 WHERE app_type = ? AND id = ?')
        .run(HERMES_APP_TYPE, records[0].id);
    }
  }

  private syncQwenCodeLiveProviders(): void {
    const config = readJsonObject(getQwenCodeSettingsPath());
    if (!config) {
      this.importLiveProviderIfEmpty(QWEN_APP_TYPE);
      return;
    }
    const records = listQwenCodeModelProviders(parseQwenCodeSettings(config));
    this.db
      .prepare('DELETE FROM external_agent_providers WHERE app_type = ? AND category = ?')
      .run(QWEN_APP_TYPE, 'local');
    const now = Date.now();
    for (const record of records) {
      this.db
        .prepare(
          `
          INSERT INTO external_agent_providers (
            id, app_type, name, settings_config, category, is_current, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id, app_type) DO UPDATE SET
            name = excluded.name,
            settings_config = excluded.settings_config,
            category = excluded.category,
            is_current = excluded.is_current,
            updated_at = excluded.updated_at
        `,
        )
        .run(
          record.id,
          QWEN_APP_TYPE,
          record.name,
          JSON.stringify(settingsConfigFromQwenCodeRecord(record)),
          'local',
          record.isCurrent ? 1 : 0,
          now,
          now,
        );
    }
    if (!records.some((record) => record.isCurrent) && records[0]) {
      this.db
        .prepare('UPDATE external_agent_providers SET is_current = 1 WHERE app_type = ? AND id = ?')
        .run(QWEN_APP_TYPE, records[0].id);
    }
  }

  private syncDeepSeekTuiLiveProviders(): void {
    const configPath = getDeepSeekTuiConfigPath();
    if (!fs.existsSync(configPath)) {
      this.importLiveProviderIfEmpty(DEEPSEEK_TUI_APP_TYPE);
      return;
    }
    const config = parseDeepSeekTuiConfigText(fs.readFileSync(configPath, 'utf8'));
    const records = listDeepSeekTuiModelProviders(config);
    this.db
      .prepare('DELETE FROM external_agent_providers WHERE app_type = ? AND category = ?')
      .run(DEEPSEEK_TUI_APP_TYPE, 'local');
    const now = Date.now();
    for (const record of records) {
      this.db
        .prepare(
          `
          INSERT INTO external_agent_providers (
            id, app_type, name, settings_config, category, is_current, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id, app_type) DO UPDATE SET
            name = excluded.name,
            settings_config = excluded.settings_config,
            category = excluded.category,
            is_current = excluded.is_current,
            updated_at = excluded.updated_at
        `,
        )
        .run(
          record.id,
          DEEPSEEK_TUI_APP_TYPE,
          record.name,
          JSON.stringify(settingsConfigFromDeepSeekTuiRecord(record)),
          'local',
          record.isCurrent ? 1 : 0,
          now,
          now,
        );
    }
    if (!records.some((record) => record.isCurrent) && records[0]) {
      this.db
        .prepare('UPDATE external_agent_providers SET is_current = 1 WHERE app_type = ? AND id = ?')
        .run(DEEPSEEK_TUI_APP_TYPE, records[0].id);
    }
  }

  private syncKimiCodeLiveProviders(): void {
    const primaryPath = fs.existsSync(getKimiCodeConfigPath())
      ? getKimiCodeConfigPath()
      : getKimiSdkConfigPath();
    if (!fs.existsSync(primaryPath)) {
      this.importLiveProviderIfEmpty(KIMI_APP_TYPE);
      return;
    }
    const configText = fs.readFileSync(primaryPath, 'utf8');
    const records = listKimiCodeModelRecords(configText);
    this.db
      .prepare('DELETE FROM external_agent_providers WHERE app_type = ? AND category = ?')
      .run(KIMI_APP_TYPE, 'local');
    const now = Date.now();
    for (const record of records) {
      const recordId = `local-${crypto.createHash('sha1').update(record.id).digest('hex').slice(0, 16)}`;
      this.db
        .prepare(
          `
          INSERT INTO external_agent_providers (
            id, app_type, name, settings_config, category, is_current, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id, app_type) DO UPDATE SET
            name = excluded.name,
            settings_config = excluded.settings_config,
            category = excluded.category,
            is_current = excluded.is_current,
            updated_at = excluded.updated_at
        `,
        )
        .run(
          recordId,
          KIMI_APP_TYPE,
          record.name,
          JSON.stringify(settingsConfigFromKimiCodeRecord(record, configText)),
          'local',
          record.isCurrent ? 1 : 0,
          now,
          now,
        );
    }
    if (!records.some((record) => record.isCurrent) && records[0]) {
      const fallbackId = `local-${crypto.createHash('sha1').update(records[0].id).digest('hex').slice(0, 16)}`;
      this.db
        .prepare('UPDATE external_agent_providers SET is_current = 1 WHERE app_type = ? AND id = ?')
        .run(KIMI_APP_TYPE, fallbackId);
    }
  }

  private mapProviderRow(row: ExternalAgentProviderRow): ExternalAgentProvider {
    let settingsConfig: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.settings_config);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        settingsConfig = parsed as Record<string, unknown>;
      }
    } catch {
      settingsConfig = {};
    }
    return {
      id: row.id,
      appType: row.app_type,
      name: row.name,
      settingsConfig,
      category: row.category,
      isCurrent: Boolean(row.is_current),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      summary: summarizeProvider(row.app_type, settingsConfig),
    };
  }

  private readLiveSettingsConfig(appType: ExternalAgentProviderAppType): Record<string, unknown> | null {
    if (appType === CLAUDE_APP_TYPE) {
      const settings = readJsonObject(getClaudeSettingsPath());
      return settings ? removeWesightManagedClaudeSettings(settings) : null;
    }
    if (appType === OPENCODE_APP_TYPE) {
      const config = readJsonObject(getOpenCodeConfigPath());
      if (!config) return null;
      return {
        config,
        model: typeof config.model === 'string' ? config.model : DEFAULT_OPENCODE_LOCAL_MODEL,
      };
    }
    if (appType === GROK_APP_TYPE) {
      if (!fs.existsSync(getGrokBuildConfigPath())) return null;
      const configText = fs.readFileSync(getGrokBuildConfigPath(), 'utf8');
      const summary = summarizeGrokBuildConfig(parseGrokBuildConfigText(configText));
      return {
        config: configText,
        model: summary.model || DEFAULT_GROK_LOCAL_MODEL,
      };
    }
    if (appType === HERMES_APP_TYPE) {
      if (!fs.existsSync(getHermesConfigPath())) return null;
      const config = parseHermesConfigText(fs.readFileSync(getHermesConfigPath(), 'utf8'));
      const env = fs.existsSync(getHermesEnvPath())
        ? parseHermesDotenvText(fs.readFileSync(getHermesEnvPath(), 'utf8'))
        : {};
      const summary = summarizeHermesSettingsConfig({ config, env });
      return {
        config,
        env,
        model: summary.model || DEFAULT_HERMES_LOCAL_MODEL,
      };
    }
    if (appType === OPENCLAW_APP_TYPE) {
      const config = readJsonObject(getOpenClawConfigPath());
      if (!config) return null;
      return {
        config,
        model: resolveOpenClawCurrentModel(config),
      };
    }
    if (appType === QWEN_APP_TYPE) {
      const config = readJsonObject(getQwenCodeSettingsPath());
      if (!config) return null;
      const model = getNestedRecord(config, 'model');
      const security = getNestedRecord(config, 'security');
      const auth = getNestedRecord(security, 'auth');
      return {
        authType: getString(auth.selectedType) || 'openai',
        config,
        model: getString(model.name) || DEFAULT_QWEN_CODE_LOCAL_MODEL,
      };
    }
    if (appType === DEEPSEEK_TUI_APP_TYPE) {
      const configPath = getDeepSeekTuiConfigPath();
      if (!fs.existsSync(configPath)) return null;
      const config = parseDeepSeekTuiConfigText(fs.readFileSync(configPath, 'utf8'));
      return {
        provider: config.provider ?? 'deepseek',
        config,
        model: config.default_text_model ?? DEFAULT_DEEPSEEK_TUI_LOCAL_MODEL,
      };
    }
    if (appType === OPENSQUILLA_APP_TYPE) {
      if (!fs.existsSync(getOpenSquillaConfigPath())) return null;
      const configText = fs.readFileSync(getOpenSquillaConfigPath(), 'utf8');
      const llmBody = readTomlTableBody(configText, 'llm');
      const provider = extractTomlString(llmBody, 'provider')
        || extractTomlString(configText, 'llm.provider')
        || extractTomlString(configText, 'provider');
      const model = extractTomlString(llmBody, 'model')
        || extractTomlString(configText, 'llm.model')
        || extractTomlString(configText, 'model')
        || DEFAULT_OPENSQUILLA_LOCAL_MODEL;
      const baseUrl = extractTomlString(llmBody, 'base_url')
        || extractTomlString(configText, 'llm.base_url')
        || extractTomlString(configText, 'base_url');
      return {
        config: configText,
        provider,
        baseUrl,
        model,
        llm: {
          provider,
          model,
          base_url: baseUrl,
        },
      };
    }
    if (appType === KIMI_APP_TYPE) {
      const primaryPath = fs.existsSync(getKimiCodeConfigPath())
        ? getKimiCodeConfigPath()
        : getKimiSdkConfigPath();
      const configText = fs.existsSync(primaryPath) ? fs.readFileSync(primaryPath, 'utf8') : '';
      const skillsDir = fs.existsSync(path.join(getKimiCodeConfigDir(), 'skills'))
        ? path.join(getKimiCodeConfigDir(), 'skills')
        : path.join(getKimiSdkConfigDir(), 'skills');
      if (!configText.trim() && !fs.existsSync(skillsDir)) return null;
      const defaultModel = extractTomlString(configText, 'default_model')
        || extractTomlString(configText, 'defaultModel')
        || extractTomlString(configText, 'model')
        || DEFAULT_KIMI_CODE_LOCAL_MODEL;
      const provider = extractTomlString(configText, 'provider')
        || extractTomlString(configText, 'model_provider')
        || 'kimi';
      return {
        config: configText,
        credentialsPath: fs.existsSync(getKimiCodeCredentialsPath()) ? getKimiCodeCredentialsPath() : '',
        provider,
        defaultModel,
        model: defaultModel,
        skillsDir,
      };
    }
    const auth = readJsonObject(getCodexAuthPath()) ?? {};
    const configPath = getCodexConfigPath();
    const config = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    if (!config.trim() && Object.keys(auth).length === 0) return null;
    return { auth, config };
  }

  private applyProviderToLive(provider: ExternalAgentProvider): void {
    if (isReadOnlyLocalConfig(provider.appType)) {
      console.debug(
        `[ExternalAgentProviderStore] skipped writing live ${provider.appType} config because it follows the local CLI.`,
      );
      return;
    }
    const settingsConfig = this.stripInternalSettingsConfig(provider.settingsConfig);
    this.writeCcSwitchCurrentProvider(provider.appType, provider);
    if (provider.appType === CLAUDE_APP_TYPE) {
      const settingsPath = getClaudeSettingsPath();
      const existingConfig = readJsonObject(settingsPath) ?? {};
      writeJsonObjectWithBackupIfChanged(
        settingsPath,
        mergeClaudeSettingsForWesightModel(existingConfig, {
          apiKey: provider.summary.apiKey,
          baseURL: provider.summary.baseUrl,
          model: provider.summary.model || DEFAULT_CLAUDE_MODEL,
          apiType: 'anthropic',
        }),
      );
      return;
    }
    if (provider.appType === OPENCODE_APP_TYPE) {
      const existingConfig = readJsonObject(getOpenCodeConfigPath()) ?? {};
      const selectedModel = getString(settingsConfig.model)
        || summarizeOpenCodeSettingsConfig(settingsConfig).model
        || DEFAULT_OPENCODE_LOCAL_MODEL;
      const storedConfig = parseOpenCodeConfig(settingsConfig.config);
      const nextConfig = {
        ...existingConfig,
        ...(Object.keys(storedConfig).length > 0 ? storedConfig : {}),
        model: selectedModel,
      };
      writeJsonFile(getOpenCodeConfigPath(), nextConfig);
      return;
    }
    if (provider.appType === HERMES_APP_TYPE) {
      const existingText = fs.existsSync(getHermesConfigPath())
        ? fs.readFileSync(getHermesConfigPath(), 'utf8')
        : '';
      const existingConfig = parseHermesConfigText(existingText);
      const selectedModel = getString(settingsConfig.model)
        || summarizeHermesSettingsConfig(settingsConfig).model
        || DEFAULT_HERMES_LOCAL_MODEL;
      const storedConfig = parseHermesConfig(settingsConfig.config);
      const nextConfig = {
        ...existingConfig,
        ...storedConfig,
        model: {
          ...getNestedRecord(existingConfig, 'model'),
          ...getNestedRecord(storedConfig, 'model'),
          default: selectedModel,
        },
      };
      atomicWrite(getHermesConfigPath(), serializeHermesConfig(nextConfig));
      return;
    }
    if (provider.appType === OPENCLAW_APP_TYPE) {
      const existingConfig = readJsonObject(getOpenClawConfigPath()) ?? {};
      const selectedModel = getString(settingsConfig.model)
        || summarizeOpenClawSettingsConfig(settingsConfig).model
        || DEFAULT_OPENCLAW_LOCAL_MODEL;
      const agents = getNestedRecord(existingConfig, 'agents');
      const defaults = getNestedRecord(agents, 'defaults');
      const models = getNestedRecord(defaults, 'models');
      const model = getNestedRecord(defaults, 'model');
      const nextConfig = {
        ...existingConfig,
        agents: {
          ...agents,
          defaults: {
            ...defaults,
            models: {
              ...models,
              [selectedModel]: models[selectedModel] ?? {},
            },
            model: {
              ...model,
              primary: selectedModel,
            },
          },
        },
      };
      writeJsonFile(getOpenClawConfigPath(), nextConfig);
      return;
    }
    if (provider.appType === GROK_APP_TYPE) {
      const existingConfigText = fs.existsSync(getGrokBuildConfigPath())
        ? fs.readFileSync(getGrokBuildConfigPath(), 'utf8')
        : '';
      const selectedModel = getString(settingsConfig.model)
        || summarizeProvider(provider.appType, settingsConfig).model
        || DEFAULT_GROK_LOCAL_MODEL;
      atomicWrite(getGrokBuildConfigPath(), mergeGrokBuildDefaultModel(existingConfigText, selectedModel));
      return;
    }
    if (provider.appType === QWEN_APP_TYPE) {
      const existingConfig = readJsonObject(getQwenCodeSettingsPath()) ?? {};
      const selectedModel = getString(settingsConfig.model)
        || summarizeQwenCodeSettingsConfig(settingsConfig).model
        || DEFAULT_QWEN_CODE_LOCAL_MODEL;
      const authType = getString(settingsConfig.authType) || 'openai';
      const storedConfig = parseQwenCodeSettings(settingsConfig.config);
      const existingSecurity = getNestedRecord(existingConfig, 'security');
      const storedSecurity = getNestedRecord(storedConfig, 'security');
      const existingAuth = getNestedRecord(existingSecurity, 'auth');
      const storedAuth = getNestedRecord(storedSecurity, 'auth');
      const nextConfig = {
        ...existingConfig,
        ...(Object.keys(storedConfig).length > 0 ? storedConfig : {}),
        security: {
          ...existingSecurity,
          ...storedSecurity,
          auth: {
            ...existingAuth,
            ...storedAuth,
            selectedType: authType,
          },
        },
        model: {
          ...getNestedRecord(existingConfig, 'model'),
          ...getNestedRecord(storedConfig, 'model'),
          name: selectedModel,
        },
      };
      writeJsonFile(getQwenCodeSettingsPath(), nextConfig);
      return;
    }
    if (provider.appType === DEEPSEEK_TUI_APP_TYPE) {
      const existingText = fs.existsSync(getDeepSeekTuiConfigPath())
        ? fs.readFileSync(getDeepSeekTuiConfigPath(), 'utf8')
        : '';
      const existingConfig = parseDeepSeekTuiConfigText(existingText);
      const selectedModel = getString(settingsConfig.model)
        || summarizeDeepSeekTuiSettingsConfig(settingsConfig).model
        || DEFAULT_DEEPSEEK_TUI_LOCAL_MODEL;
      const selectedProvider = getString(settingsConfig.provider)
        || getString(parseDeepSeekTuiConfig(settingsConfig.config).provider)
        || 'deepseek';
      const storedConfig = parseDeepSeekTuiConfig(settingsConfig.config);
      const nextConfig = {
        ...existingConfig,
        ...storedConfig,
        provider: selectedProvider,
        default_text_model: selectedModel,
      };
      atomicWrite(getDeepSeekTuiConfigPath(), serializeDeepSeekTuiConfig(nextConfig));
      return;
    }
    if (provider.appType === OPENSQUILLA_APP_TYPE || provider.appType === KIMI_APP_TYPE) {
      return;
    }

    const existingConfigText = fs.existsSync(getCodexConfigPath())
      ? fs.readFileSync(getCodexConfigPath(), 'utf8')
      : '';
    writeTextFileWithBackupIfChanged(
      getCodexConfigPath(),
      mergeCodexConfigForWesightModel(
        existingConfigText,
        provider.name,
        provider.summary.baseUrl,
        provider.summary.model || DEFAULT_CODEX_MODEL,
      ),
    );
  }
}
