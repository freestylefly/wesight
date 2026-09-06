import Database from 'better-sqlite3';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  type CliCoworkAgentEngine,
  CoworkAgentEngine,
} from '../../shared/cowork/constants';
import { getClaudeConfigDir } from './claudeCodeLiveConfig';
import { resolveUserShellPath } from './coworkUtil';
import {
  listDeepSeekTuiModelProviders,
  parseDeepSeekTuiConfigText,
} from './deepSeekTuiConfig';
import {
  parseGrokBuildConfigText,
  summarizeGrokBuildConfig,
} from './grokBuildConfig';
import {
  listHermesModelProviders,
  parseHermesConfigText,
  parseHermesDotenvText,
} from './hermesConfig';
import { readOpenClawGlobalConfig, summarizeOpenClawConfig } from './openclawSystemRuntime';
import { getWesightLarkCliBinDir } from './wesightSharedRuntime';

export type CliAppType = 'claude' | 'codex' | 'hermes' | 'openclaw' | 'opencode' | 'grok' | 'qwen' | 'deepseek_tui' | 'opensquilla' | 'kimi';
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
  engine: CliCoworkAgentEngine;
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
}

export interface CliProbeMetric {
  command: string;
  path: string | null;
  version: string | null;
  resolveMs: number;
  versionMs?: number;
  found: boolean;
  timedOut: boolean;
  error: string | null;
}

export interface ExternalAgentEnvironmentProbeReport {
  durationMs: number;
  metrics: CliProbeMetric[];
}

export interface ExternalAgentEnvironmentSnapshotResult {
  snapshot: ExternalAgentEnvironmentSnapshot;
  report: ExternalAgentEnvironmentProbeReport;
}

export interface ExternalAgentEnvironmentProbeOptions {
  commandProbeTimeoutMs?: number;
  versionProbeTimeoutMs?: number;
  versionProbeTimeoutMsByAppType?: Partial<Record<CliAppType, number>>;
  appTypes?: CliAppType[];
  includeUserShellPath?: boolean;
}

type CcSwitchSettings = {
  claude_config_dir?: unknown;
  codex_config_dir?: unknown;
  current_provider_claude?: unknown;
  current_provider_codex?: unknown;
  claudeConfigDir?: unknown;
  codexConfigDir?: unknown;
  currentProviderClaude?: unknown;
  currentProviderCodex?: unknown;
};

type ProviderRow = {
  id: string;
  name: string;
};

type CliConfigSummary = {
  providerId: string | null;
  providerName: string | null;
  count: number;
};

const homeDir = (): string => os.homedir();

const ccSwitchAppDir = (): string => path.join(homeDir(), '.cc-switch');

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

const isNonPlaceholderSecret = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const normalized = trimmed.toLowerCase();
  if (trimmed.startsWith('${') || trimmed.startsWith('$')) return false;
  if (trimmed.includes('WESIGHT_APIKEY_') || trimmed.includes('WESIGHT_APIKEY_ACTIVE_PROVIDER')) return false;
  if (['***', 'sk-wesight-local', 'wesight-openai-compat', 'qwen-oauth'].includes(normalized)) return false;
  return true;
};

const isCredentialLikeKey = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return normalized.includes('api_key')
    || normalized.includes('apikey')
    || normalized.includes('api-key')
    || normalized.includes('auth_token')
    || normalized.includes('access_token')
    || normalized.includes('refresh_token')
    || normalized.includes('id_token')
    || normalized === 'token'
    || normalized.includes('credential')
    || normalized.includes('secret');
};

const recordContainsCredential = (value: unknown, parentKey = ''): boolean => {
  if (typeof value === 'string') {
    return isCredentialLikeKey(parentKey) && isNonPlaceholderSecret(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => recordContainsCredential(item, parentKey));
  }
  if (!value || typeof value !== 'object') {
    return false;
  }
  return Object.entries(value as Record<string, unknown>).some(([key, item]) => (
    recordContainsCredential(item, key)
  ));
};

const fileContainsCredential = (filePath: string): boolean => {
  try {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return false;
    try {
      return recordContainsCredential(JSON.parse(content));
    } catch {
      const credentialLinePattern = /(?:api[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|secret|credential|token)\s*[:=]\s*["']?([^"'\n#]+)/i;
      const match = content.match(credentialLinePattern);
      return isNonPlaceholderSecret(match?.[1]);
    }
  } catch {
    return false;
  }
};

const envContainsCredential = (keys: string[]): string | null => {
  for (const key of keys) {
    if (isNonPlaceholderSecret(process.env[key])) {
      return key;
    }
  }
  return null;
};

const readCcSwitchSettings = (settingsPath: string): CcSwitchSettings => {
  return readJsonObject(settingsPath) ?? {};
};

const normalizedPathSetting = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? path.resolve(trimmed.replace(/^~(?=$|\/|\\)/, homeDir())) : null;
};

const getConfigDirSetting = (settings: CcSwitchSettings, appType: CliAppType): string | null => {
  if (appType === 'claude') {
    return normalizedPathSetting(settings.claudeConfigDir)
      ?? normalizedPathSetting(settings.claude_config_dir);
  }
  if (appType === 'codex') {
    return normalizedPathSetting(settings.codexConfigDir)
      ?? normalizedPathSetting(settings.codex_config_dir);
  }
  return null;
};

const getCurrentProviderSetting = (settings: CcSwitchSettings, appType: CliAppType): string | null => {
  if (appType !== 'claude' && appType !== 'codex') {
    return null;
  }
  const value = appType === 'claude'
    ? settings.currentProviderClaude ?? settings.current_provider_claude
    : settings.currentProviderCodex ?? settings.current_provider_codex;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const resolveClaudeMcpPath = (configDir: string, hasOverride: boolean): string => {
  if (!hasOverride) {
    return path.join(homeDir(), '.claude.json');
  }
  const parent = path.dirname(configDir);
  const basename = path.basename(configDir);
  return path.join(parent, `${basename}.json`);
};

const resolveClaudeSettingsPath = (configDir: string): string => {
  const settingsPath = path.join(configDir, 'settings.json');
  if (fs.existsSync(settingsPath)) return settingsPath;
  const legacyPath = path.join(configDir, 'claude.json');
  if (fs.existsSync(legacyPath)) return legacyPath;
  return settingsPath;
};

const getOpenCodeDataDir = (): string => path.join(homeDir(), '.local', 'share', 'opencode');

const getHermesConfigDir = (): string => path.join(homeDir(), '.hermes');

const getOpenClawConfigDir = (): string => path.join(homeDir(), '.openclaw');

const getGrokBuildConfigDir = (): string => path.join(homeDir(), '.grok');

const getQwenCodeConfigDir = (): string => path.join(homeDir(), '.qwen');

const getDeepSeekTuiConfigDir = (): string => path.join(homeDir(), '.deepseek');

const getOpenSquillaConfigDir = (): string => path.join(homeDir(), '.opensquilla');

const getKimiCodeConfigDir = (): string => path.join(homeDir(), '.kimi-code');

const getKimiSdkConfigDir = (): string => path.join(homeDir(), '.kimi');

const getKimiCodeBinDir = (): string => path.join(getKimiCodeConfigDir(), 'bin');

const getKimiCodeCredentialsPath = (): string => path.join(getKimiCodeConfigDir(), 'credentials', 'kimi-code.json');

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

const extractTomlString = (configText: string, key: string): string => {
  const match = configText.match(new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']*)["']`, 'm'));
  return match?.[1]?.trim() ?? '';
};

const readTomlTableBody = (configText: string, tableName: string): string => {
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = configText.match(
    new RegExp(`^\\s*\\[${escapedTableName}\\]\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n\\s*\\[|$)`, 'm'),
  );
  return match?.[1] ?? '';
};

const normalizeTomlTableKey = (value: string): string => {
  return value
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
};

const listCodexModelProviderIds = (configText: string): string[] => {
  const ids = new Set<string>();
  const tablePattern = /^\s*\[model_providers\.([^\]]+)\]\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(configText)) !== null) {
    const id = normalizeTomlTableKey(match[1] ?? '');
    if (id) ids.add(id);
  }
  return [...ids];
};

const readCodexModelProviderBody = (configText: string, providerId: string): string => {
  const escapedProviderId = providerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tableMatch = configText.match(
    new RegExp(`^\\s*\\[model_providers\\.(?:"${escapedProviderId}"|'${escapedProviderId}'|${escapedProviderId})\\]\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n\\s*\\[|$)`, 'm'),
  );
  return tableMatch?.[1] ?? '';
};

const readClaudeNativeConfigSummary = (settingsPath: string): CliConfigSummary => {
  const settings = readJsonObject(settingsPath);
  if (!settings) return { providerId: null, providerName: null, count: 0 };
  const env = getNestedRecord(settings, 'env');
  const apiKey = getString(env.ANTHROPIC_AUTH_TOKEN) || getString(env.ANTHROPIC_API_KEY);
  const baseUrl = getString(env.ANTHROPIC_BASE_URL);
  const model = getString(env.ANTHROPIC_MODEL)
    || getString(env.ANTHROPIC_DEFAULT_SONNET_MODEL)
    || getString(env.ANTHROPIC_DEFAULT_OPUS_MODEL)
    || getString(env.ANTHROPIC_DEFAULT_HAIKU_MODEL)
    || getString(env.ANTHROPIC_SMALL_FAST_MODEL);
  if (!isNonPlaceholderSecret(apiKey) || (!baseUrl && !model)) {
    return { providerId: null, providerName: model || null, count: 0 };
  }
  return {
    providerId: 'local-live',
    providerName: 'Local Claude Code',
    count: 1,
  };
};

const readCodexNativeConfigSummary = (
  configPath: string,
  authPath: string,
): CliConfigSummary => {
  const configText = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const modelProvider = extractTomlString(configText, 'model_provider');
  const model = extractTomlString(configText, 'model');
  const providerIds = listCodexModelProviderIds(configText);
  const providerBody = modelProvider ? readCodexModelProviderBody(configText, modelProvider) : '';
  const providerName = extractTomlString(providerBody, 'name') || modelProvider || model || null;
  if (providerIds.length > 0) {
    return {
      providerId: modelProvider || providerIds[0] || null,
      providerName,
      count: providerIds.length,
    };
  }
  if (modelProvider || model || fileContainsCredential(authPath)) {
    return {
      providerId: modelProvider || 'local-live',
      providerName: providerName || 'Local Codex',
      count: 1,
    };
  }
  return { providerId: null, providerName: null, count: 0 };
};

const readOpenCodeConfigSummary = (
  configPath: string,
): CliConfigSummary => {
  const config = readJsonObject(configPath);
  if (!config) {
    return { providerId: null, providerName: null, count: 0 };
  }
  const model = typeof config.model === 'string' ? config.model.trim() : '';
  const providerId = model.includes('/') ? model.split('/')[0] : model || null;
  const provider = config.provider && typeof config.provider === 'object' && !Array.isArray(config.provider)
    ? config.provider as Record<string, unknown>
    : {};
  const count = Object.keys(provider).length;
  const providerConfig = providerId ? provider[providerId] : null;
  const providerName = providerConfig && typeof providerConfig === 'object' && !Array.isArray(providerConfig)
    ? typeof (providerConfig as Record<string, unknown>).name === 'string'
      ? ((providerConfig as Record<string, unknown>).name as string)
      : providerId
    : providerId;
  return { providerId, providerName, count };
};

const readQwenCodeConfigSummary = (
  configPath: string,
): CliConfigSummary => {
  const config = readJsonObject(configPath);
  if (!config) {
    return { providerId: null, providerName: null, count: 0 };
  }
  const model = config.model && typeof config.model === 'object' && !Array.isArray(config.model)
    ? typeof (config.model as Record<string, unknown>).name === 'string'
      ? ((config.model as Record<string, unknown>).name as string)
      : ''
    : '';
  const security = config.security && typeof config.security === 'object' && !Array.isArray(config.security)
    ? config.security as Record<string, unknown>
    : {};
  const auth = security.auth && typeof security.auth === 'object' && !Array.isArray(security.auth)
    ? security.auth as Record<string, unknown>
    : {};
  const providerId = typeof auth.selectedType === 'string' && auth.selectedType.trim()
    ? auth.selectedType.trim()
    : model || null;
  const providers = config.modelProviders && typeof config.modelProviders === 'object' && !Array.isArray(config.modelProviders)
    ? config.modelProviders as Record<string, unknown>
    : {};
  const count = Object.values(providers).reduce<number>((total, entries) => (
    total + (Array.isArray(entries) ? entries.length : 0)
  ), 0);
  return { providerId, providerName: model || providerId, count };
};

const readDeepSeekTuiConfigSummary = (
  configPath: string,
): CliConfigSummary => {
  if (!fs.existsSync(configPath)) {
    return { providerId: null, providerName: null, count: 0 };
  }
  const config = parseDeepSeekTuiConfigText(fs.readFileSync(configPath, 'utf8'));
  const records = listDeepSeekTuiModelProviders(config);
  const current = records.find((record) => record.isCurrent) ?? records[0] ?? null;
  return {
    providerId: current?.provider ?? config.provider ?? null,
    providerName: current?.name ?? current?.provider ?? null,
    count: records.length,
  };
};

const readGrokBuildConfigSummary = (
  configPath: string,
): CliConfigSummary => {
  if (!fs.existsSync(configPath)) {
    return { providerId: null, providerName: null, count: 0 };
  }
  const summary = summarizeGrokBuildConfig(parseGrokBuildConfigText(fs.readFileSync(configPath, 'utf8')));
  return {
    providerId: summary.providerId,
    providerName: summary.providerName,
    count: summary.count,
  };
};

const readHermesConfigSummary = (
  configPath: string,
  envPath: string,
): CliConfigSummary => {
  if (!fs.existsSync(configPath)) {
    return { providerId: null, providerName: null, count: 0 };
  }
  const config = parseHermesConfigText(fs.readFileSync(configPath, 'utf8'));
  const env = fs.existsSync(envPath)
    ? parseHermesDotenvText(fs.readFileSync(envPath, 'utf8'))
    : {};
  const records = listHermesModelProviders(config, env);
  const current = records[0] ?? null;
  return {
    providerId: current ? `${current.provider}/${current.model}` : null,
    providerName: current?.name ?? current?.provider ?? null,
    count: records.length,
  };
};

const readOpenClawConfigSummary = (
  configPath: string,
): CliConfigSummary => {
  const summary = summarizeOpenClawConfig(readOpenClawGlobalConfig(configPath));
  const model = summary.currentModel;
  return {
    providerId: model?.includes('/') ? model.split('/')[0] : model,
    providerName: model,
    count: model ? 1 : 0,
  };
};

const readOpenSquillaConfigSummary = (
  configPath: string,
  secondaryConfigPaths: string[],
): CliConfigSummary => {
  const configText = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const llmBody = readTomlTableBody(configText, 'llm');
  const providerRoutingBody = readTomlTableBody(configText, 'llm.provider_routing');
  const provider = extractTomlString(llmBody, 'provider')
    || extractTomlString(providerRoutingBody, 'provider')
    || extractTomlString(configText, 'llm.provider')
    || extractTomlString(configText, 'provider')
    || extractTomlString(configText, 'model_provider')
    || extractTomlString(configText, 'router');
  const model = extractTomlString(llmBody, 'model')
    || extractTomlString(providerRoutingBody, 'model')
    || extractTomlString(configText, 'llm.model')
    || extractTomlString(configText, 'model')
    || extractTomlString(configText, 'default_model')
    || extractTomlString(configText, 'model_id');
  const providerName = provider && model ? `${provider}/${model}` : provider || model || null;
  const hasConfig = Boolean(configText.trim()) || secondaryConfigPaths.some((filePath) => fs.existsSync(filePath));
  return {
    providerId: provider || (hasConfig ? 'local-cli' : null),
    providerName: providerName || (hasConfig ? 'Local OpenSquilla' : null),
    count: hasConfig ? 1 : 0,
  };
};

const readKimiCodeConfigSummary = (
  configPath: string,
  secondaryConfigPaths: string[],
): CliConfigSummary => {
  const configText = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const defaultModel = extractTomlString(configText, 'default_model')
    || extractTomlString(configText, 'defaultModel')
    || extractTomlString(configText, 'model');
  const provider = extractTomlString(configText, 'provider')
    || extractTomlString(configText, 'model_provider');
  const modelCount = (configText.match(/^\s*\[\[?models(?:\.|\])|^\s*\[models\./gm) ?? []).length;
  const hasConfig = Boolean(configText.trim()) || secondaryConfigPaths.some((filePath) => fs.existsSync(filePath));
  return {
    providerId: provider || (hasConfig ? 'local-cli' : null),
    providerName: defaultModel || provider || (hasConfig ? 'Local Kimi Code' : null),
    count: modelCount || (hasConfig ? 1 : 0),
  };
};

interface CliAuthSummary {
  authStatus: CliAuthStatus;
  authSource: string | null;
  authMessage: string | null;
}

const localEnvKeysByAppType: Record<CliAppType, string[]> = {
  claude: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'],
  codex: ['OPENAI_API_KEY'],
  hermes: ['HERMES_INFERENCE_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GLM_API_KEY', 'ZAI_API_KEY', 'Z_AI_API_KEY'],
  openclaw: ['OPENCLAW_GATEWAY_TOKEN', 'OPENAI_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'],
  opencode: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
  grok: ['GROK_API_KEY', 'XAI_API_KEY', 'X_AI_API_KEY'],
  qwen: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY'],
  deepseek_tui: ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY'],
  opensquilla: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'DEEPSEEK_API_KEY', 'DASHSCOPE_API_KEY', 'QWEN_API_KEY', 'MOONSHOT_API_KEY', 'ZAI_API_KEY', 'Z_AI_API_KEY'],
  kimi: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
};

const formatAuthSource = (filePath: string): string => (
  filePath.startsWith(homeDir())
    ? `~${filePath.slice(homeDir().length)}`
    : filePath
);

const buildAuthPathCandidates = (
  appType: CliAppType,
  configDir: string,
  primaryConfigPath: string,
  secondaryConfigPaths: string[],
): string[] => {
  const common = [primaryConfigPath, ...secondaryConfigPaths];
  if (appType === 'claude') {
    return [
      ...common,
      path.join(configDir, '.credentials.json'),
      path.join(configDir, 'credentials.json'),
      path.join(configDir, 'oauth.json'),
    ];
  }
  if (appType === 'codex') {
    return [
      ...common,
      path.join(configDir, 'auth.json'),
    ];
  }
  if (appType === 'opencode') {
    return [
      ...common,
      path.join(getOpenCodeDataDir(), 'auth.json'),
    ];
  }
  if (appType === 'qwen') {
    return [
      ...common,
      path.join(configDir, 'oauth_creds.json'),
    ];
  }
  if (appType === 'kimi') {
    const sdkDir = getKimiSdkConfigDir();
    return [
      ...common,
      path.join(configDir, 'auth.json'),
      path.join(configDir, 'credentials.json'),
      path.join(configDir, 'oauth.json'),
      getKimiCodeCredentialsPath(),
      path.join(sdkDir, 'config.toml'),
      path.join(sdkDir, 'auth.json'),
      path.join(sdkDir, 'credentials.json'),
      path.join(sdkDir, 'oauth.json'),
    ];
  }
  return common;
};

export const summarizeCliAuthStatus = (
  appType: CliAppType,
  config: Pick<CliAppConfigSnapshot, 'configDir' | 'primaryConfigPath' | 'secondaryConfigPaths' | 'configExists' | 'currentProviderId' | 'currentProviderName' | 'providerCount'>,
): CliAuthSummary => {
  const envKey = envContainsCredential(localEnvKeysByAppType[appType] ?? []);
  if (envKey) {
    return {
      authStatus: 'logged_in',
      authSource: envKey,
      authMessage: 'env',
    };
  }

  const candidates = buildAuthPathCandidates(
    appType,
    config.configDir,
    config.primaryConfigPath,
    config.secondaryConfigPaths,
  );
  const credentialPath = candidates.find((filePath) => fileContainsCredential(filePath));
  if (credentialPath) {
    return {
      authStatus: 'logged_in',
      authSource: formatAuthSource(credentialPath),
      authMessage: 'file',
    };
  }

  const anyConfigFileExists = config.configExists || config.secondaryConfigPaths.some((filePath) => fs.existsSync(filePath));
  if (!anyConfigFileExists && !config.currentProviderId && config.providerCount === 0) {
    return {
      authStatus: 'unconfigured',
      authSource: null,
      authMessage: null,
    };
  }

  return {
    authStatus: 'logged_out',
    authSource: null,
    authMessage: config.currentProviderName ?? config.currentProviderId ?? null,
  };
};

const countProviders = (db: Database.Database, appType: CliAppType): number => {
  try {
    const row = db
      .prepare('SELECT COUNT(*) as total FROM providers WHERE app_type = ?')
      .get(appType) as { total?: number } | undefined;
    return Number(row?.total ?? 0);
  } catch {
    return 0;
  }
};

const readCurrentProviderFromDb = (
  dbPath: string,
  appType: CliAppType,
  settingsCurrentProviderId: string | null,
): { provider: ProviderRow | null; count: number } => {
  if (appType === 'openclaw' || appType === 'opencode' || appType === 'grok' || appType === 'qwen' || appType === 'deepseek_tui' || appType === 'opensquilla' || appType === 'kimi') {
    return { provider: null, count: 0 };
  }
  if (!fs.existsSync(dbPath)) {
    return { provider: null, count: 0 };
  }

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const count = countProviders(db, appType);
    const provider = settingsCurrentProviderId
      ? db
        .prepare('SELECT id, name FROM providers WHERE app_type = ? AND id = ? LIMIT 1')
        .get(appType, settingsCurrentProviderId) as ProviderRow | undefined
      : db
        .prepare('SELECT id, name FROM providers WHERE app_type = ? AND is_current = 1 LIMIT 1')
        .get(appType) as ProviderRow | undefined;
    return { provider: provider ?? null, count };
  } catch {
    return { provider: null, count: 0 };
  } finally {
    try {
      db?.close();
    } catch {
      // Ignore close errors from a read-only snapshot.
    }
  }
};

const quoteForShell = (value: string): string => {
  return `'${value.replace(/'/g, `'\\''`)}'`;
};

const DEFAULT_CLI_PROBE_TIMEOUT_MS = 1500;

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error: string | null;
}

export interface CliCommandResolution {
  found: boolean;
  path: string | null;
  error: string | null;
  timedOut: boolean;
}

const runCommand = (
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; timeoutMs?: number; windowsVerbatimArguments?: boolean } = {},
): Promise<CommandResult> => (
  new Promise((resolve) => {
    const child = spawn(command, args, {
      env: options.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: process.platform === 'win32',
      windowsVerbatimArguments: options.windowsVerbatimArguments,
    });
    const timeoutMs = options.timeoutMs ?? DEFAULT_CLI_PROBE_TIMEOUT_MS;
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({
        status: null,
        stdout,
        stderr,
        timedOut: true,
        error: `${command} timed out after ${timeoutMs}ms.`,
      });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        status: null,
        stdout,
        stderr,
        timedOut: false,
        error: error.message,
      });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        status: code,
        stdout,
        stderr,
        timedOut: false,
        error: null,
      });
    });
  })
);

const buildProbeEnv = (
  options: ExternalAgentEnvironmentProbeOptions = {},
): NodeJS.ProcessEnv => {
  const pathEntries = [
    process.env.PATH ?? '',
    getWesightLarkCliBinDir(process.env, homeDir()),
    path.join(homeDir(), '.npm-global', 'bin'),
    path.join(homeDir(), '.local', 'bin'),
    getKimiCodeBinDir(),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  if (options.includeUserShellPath !== false) {
    pathEntries.push(resolveUserShellPath() ?? '');
  }
  return {
    ...process.env,
    PATH: pathEntries.join(path.delimiter),
  };
};

const getWindowsSearchPaths = (command: string): string[] => {
  const home = homeDir();
  const appData = process.env.APPDATA || '';
  const localAppData = process.env.LOCALAPPDATA || '';
  const userName = path.basename(home);

  if (command === 'hermes') {
    return [
      path.join(appData, 'npm', 'hermes.cmd'),
      path.join(appData, 'npm', 'hermes.exe'),
      path.join(home, '.local', 'bin', 'hermes.exe'),
      path.join(home, '.hermes', 'bin', 'hermes.exe'),
      path.join(localAppData, 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
      `\\\\wsl$\\Ubuntu\\home\\${userName}\\.local\\bin\\hermes`,
      `\\\\wsl$\\Ubuntu\\home\\${userName}\\.hermes\\bin\\hermes`,
      'D:\\Program Files\\Hermes Studio\\resources\\python\\Scripts\\hermes.cmd',
      'C:\\Program Files\\Hermes Studio\\resources\\python\\Scripts\\hermes.cmd',
    ];
  }
  if (command === 'claude') {
    return [
      localAppData
        ? path.join(localAppData, 'Programs', 'Claude', 'claude.exe')
        : null,
      path.join(appData, 'npm', 'claude.cmd'),
      path.join(home, 'AppData', 'Local', 'Programs', 'Claude', 'claude.exe'),
      path.join(home, '.local', 'bin', 'claude.exe'),
    ].filter((candidate): candidate is string => Boolean(candidate));
  }
  if (command === 'codex') {
    return [
      path.join(appData, 'npm', 'codex.cmd'),
    ];
  }
  if (command === 'openclaw') {
    return [
      path.join(appData, 'npm', 'openclaw.cmd'),
      'C:\\Program Files (x86)\\ClawX\\resources\\cli\\openclaw',
      'C:\\Program Files\\ClawX\\resources\\cli\\openclaw',
      path.join(localAppData, 'Programs', 'ClawX', 'resources', 'cli', 'openclaw'),
      path.join(home, '.openclaw', 'bin', 'openclaw'),
    ];
  }
  if (command === 'opencode') {
    return [
      path.join(appData, 'npm', 'opencode.cmd'),
    ];
  }
  if (command === 'qwen') {
    return [
      path.join(appData, 'npm', 'qwen.cmd'),
    ];
  }
  if (command === 'deepseek-tui') {
    return [
      path.join(appData, 'npm', 'deepseek-tui.cmd'),
    ];
  }
  if (command === 'opensquilla') {
    return [
      path.join(home, '.local', 'bin', 'opensquilla.exe'),
      path.join(home, '.local', 'bin', 'opensquilla'),
    ];
  }
  if (command === 'kimi') {
    return [
      path.join(appData, 'npm', 'kimi.cmd'),
      path.join(home, '.kimi-code', 'bin', 'kimi.exe'),
      path.join(home, '.kimi-code', 'bin', 'kimi'),
      path.join(home, '.local', 'bin', 'kimi.exe'),
      path.join(home, '.local', 'bin', 'kimi'),
    ];
  }

  return [];
};

const isWindowsNetworkPath = (candidate: string): boolean => (
  /^\\\\/.test(candidate)
);

const isSafeWindowsFastProbePath = (candidate: string): boolean => (
  !isWindowsNetworkPath(candidate)
);

const preferWindowsExecutable = (candidates: string[]): string | null => {
  if (candidates.length === 0) return null;
  return candidates.find((candidate) => /\.(cmd|exe|bat)$/i.test(candidate))
    ?? candidates[0]
    ?? null;
};

export const isWindowsCommandShim = (commandPath: string): boolean => {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(commandPath);
};

export const buildWindowsCommandShimArgs = (commandPath: string, args: string[]): string[] => {
  return ['/d', '/s', '/c', `call "${commandPath}" ${args.map((arg) => `"${arg.replace(/"/g, '\\"')}"`).join(' ')}`];
};

export const resolveCliCommand = async (
  command: string,
  options: ExternalAgentEnvironmentProbeOptions = {},
): Promise<CliCommandResolution> => {
  if (process.platform === 'win32') {
    for (const candidate of getWindowsSearchPaths(command)) {
      if (candidate && isSafeWindowsFastProbePath(candidate) && fs.existsSync(candidate)) {
        return { found: true, path: candidate, error: null, timedOut: false };
      }
    }
  }

  const result = await runCommand(process.platform === 'win32' ? 'where' : 'which', [command], {
    env: buildProbeEnv(options),
    timeoutMs: options.commandProbeTimeoutMs,
  });
  if (result.status === 0) {
    const candidates = result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const commandPath = process.platform === 'win32'
      ? preferWindowsExecutable(candidates)
      : candidates[0] ?? null;
    return { found: Boolean(commandPath), path: commandPath, error: null, timedOut: result.timedOut };
  }

  if (process.platform !== 'win32') {
    const shellPath = process.env.SHELL || '/bin/zsh';
    const shellResult = await runCommand(shellPath, ['-lc', `command -v ${quoteForShell(command)}`], {
      env: buildProbeEnv(options),
      timeoutMs: options.commandProbeTimeoutMs,
    });
    if (shellResult.status === 0) {
      const commandPath = shellResult.stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? null;
      return { found: Boolean(commandPath), path: commandPath, error: null, timedOut: shellResult.timedOut };
    }
    const error = (shellResult.error || shellResult.stderr || shellResult.stdout || result.error || result.stderr || result.stdout || '').trim();
    return {
      found: false,
      path: null,
      error: error || `${command} was not found in PATH.`,
      timedOut: result.timedOut || shellResult.timedOut,
    };
  }

  const error = (result.error || result.stderr || result.stdout || '').trim();
  return {
    found: false,
    path: null,
    error: error || `${command} was not found in PATH.`,
    timedOut: result.timedOut,
  };
};

const readCommandVersion = async (
  command: string,
  appType: CliAppType,
  options: ExternalAgentEnvironmentProbeOptions = {},
): Promise<{ version: string | null; durationMs: number; timedOut: boolean }> => {
  const startedAt = Date.now();
  const executable = isWindowsCommandShim(command) ? 'cmd.exe' : command;
  const args = isWindowsCommandShim(command)
    ? buildWindowsCommandShimArgs(command, ['--version'])
    : ['--version'];
  const result = await runCommand(executable, args, {
    timeoutMs: options.versionProbeTimeoutMsByAppType?.[appType]
      ?? options.versionProbeTimeoutMs
      ?? options.commandProbeTimeoutMs,
    windowsVerbatimArguments: isWindowsCommandShim(command),
  });
  const durationMs = Date.now() - startedAt;
  if (result.status !== 0) {
    return { version: null, durationMs, timedOut: result.timedOut };
  }
  return {
    version: (result.stdout || result.stderr || '').trim() || null,
    durationMs,
    timedOut: result.timedOut,
  };
};

const buildCliConfigSnapshot = (
  appType: CliAppType,
  settings: CcSwitchSettings,
  dbPath: string,
): CliAppConfigSnapshot => {
  // Claude Code no longer follows cc-switch's directory override: it uses its
  // own CLAUDE_CONFIG_DIR, the same thing the CLI honours in a terminal.
  const codexOverride = getConfigDirSetting(settings, 'codex');
  const configDir = appType === 'claude'
    ? getClaudeConfigDir()
    : appType === 'codex'
      ? codexOverride ?? path.join(homeDir(), '.codex')
      : appType === 'hermes'
        ? getHermesConfigDir()
      : appType === 'openclaw'
        ? getOpenClawConfigDir()
      : appType === 'opencode'
        ? path.join(homeDir(), '.config', 'opencode')
      : appType === 'grok'
        ? getGrokBuildConfigDir()
        : appType === 'qwen'
          ? getQwenCodeConfigDir()
          : appType === 'deepseek_tui'
            ? getDeepSeekTuiConfigDir()
            : appType === 'opensquilla'
              ? getOpenSquillaConfigDir()
              : fs.existsSync(path.join(getKimiCodeConfigDir(), 'config.toml'))
                ? getKimiCodeConfigDir()
                : getKimiSdkConfigDir();
  const primaryConfigPath = appType === 'claude'
    ? resolveClaudeSettingsPath(configDir)
    : appType === 'codex'
      ? path.join(configDir, 'config.toml')
    : appType === 'hermes'
      ? path.join(configDir, 'config.yaml')
    : appType === 'openclaw'
      ? path.join(configDir, 'openclaw.json')
    : appType === 'opencode'
      ? (fs.existsSync(path.join(configDir, 'opencode.jsonc')) ? path.join(configDir, 'opencode.jsonc') : path.join(configDir, 'opencode.json'))
      : appType === 'grok'
        ? path.join(configDir, 'config.toml')
        : appType === 'qwen'
          ? path.join(configDir, 'settings.json')
          : appType === 'deepseek_tui'
            ? path.join(configDir, 'config.toml')
            : appType === 'opensquilla'
              ? path.join(configDir, 'config.toml')
              : path.join(configDir, 'config.toml');
  const secondaryConfigPaths = appType === 'claude'
    ? [resolveClaudeMcpPath(configDir, Boolean(process.env.CLAUDE_CONFIG_DIR?.trim()))]
    : appType === 'codex'
      ? [path.join(configDir, 'auth.json')]
    : appType === 'hermes'
      ? [path.join(configDir, '.env')]
    : appType === 'openclaw'
      ? [path.join(configDir, '.env')]
    : appType === 'opencode'
      ? [path.join(getOpenCodeDataDir(), 'auth.json')]
      : appType === 'grok'
        ? [path.join(configDir, 'auth.json')]
        : appType === 'qwen'
          ? [path.join(configDir, 'oauth_creds.json')]
          : appType === 'deepseek_tui'
            ? [path.join(configDir, 'sessions')]
            : appType === 'opensquilla'
              ? [path.join(configDir, 'opensquilla.toml'), path.join(configDir, '.env'), path.join(configDir, 'state')]
              : [
                path.join(configDir, 'session_index.jsonl'),
                path.join(configDir, 'skills'),
                path.join(configDir, 'mcp.json'),
                path.join(getKimiCodeConfigDir(), 'config.toml'),
                getKimiCodeCredentialsPath(),
                path.join(getKimiCodeConfigDir(), 'session_index.jsonl'),
                path.join(getKimiCodeConfigDir(), 'skills'),
                path.join(getKimiSdkConfigDir(), 'config.toml'),
                path.join(getKimiSdkConfigDir(), 'session_index.jsonl'),
                path.join(getKimiSdkConfigDir(), 'skills'),
              ];
  const settingsCurrentProviderId = getCurrentProviderSetting(settings, appType);
  if (appType === 'opencode') {
    const summary = readOpenCodeConfigSummary(primaryConfigPath);
    return {
      appType,
      configDir,
      primaryConfigPath,
      secondaryConfigPaths,
      configExists: fs.existsSync(primaryConfigPath),
      currentProviderId: summary.providerId ?? settingsCurrentProviderId,
      currentProviderName: summary.providerName,
      providerCount: summary.count,
    };
  }
  if (appType === 'hermes') {
    const summary = readHermesConfigSummary(primaryConfigPath, secondaryConfigPaths[0] || path.join(configDir, '.env'));
    return {
      appType,
      configDir,
      primaryConfigPath,
      secondaryConfigPaths,
      configExists: fs.existsSync(primaryConfigPath),
      currentProviderId: summary.providerId,
      currentProviderName: summary.providerName,
      providerCount: summary.count,
    };
  }
  if (appType === 'openclaw') {
    const summary = readOpenClawConfigSummary(primaryConfigPath);
    return {
      appType,
      configDir,
      primaryConfigPath,
      secondaryConfigPaths,
      configExists: fs.existsSync(primaryConfigPath),
      currentProviderId: summary.providerId,
      currentProviderName: summary.providerName,
      providerCount: summary.count,
    };
  }
  if (appType === 'qwen') {
    const summary = readQwenCodeConfigSummary(primaryConfigPath);
    return {
      appType,
      configDir,
      primaryConfigPath,
      secondaryConfigPaths,
      configExists: fs.existsSync(primaryConfigPath),
      currentProviderId: summary.providerId,
      currentProviderName: summary.providerName,
      providerCount: summary.count,
    };
  }
  if (appType === 'grok') {
    const summary = readGrokBuildConfigSummary(primaryConfigPath);
    return {
      appType,
      configDir,
      primaryConfigPath,
      secondaryConfigPaths,
      configExists: fs.existsSync(primaryConfigPath),
      currentProviderId: summary.providerId,
      currentProviderName: summary.providerName,
      providerCount: summary.count,
    };
  }
  if (appType === 'deepseek_tui') {
    const summary = readDeepSeekTuiConfigSummary(primaryConfigPath);
    return {
      appType,
      configDir,
      primaryConfigPath,
      secondaryConfigPaths,
      configExists: fs.existsSync(primaryConfigPath),
      currentProviderId: summary.providerId,
      currentProviderName: summary.providerName,
      providerCount: summary.count,
    };
  }
  if (appType === 'opensquilla') {
    const summary = readOpenSquillaConfigSummary(primaryConfigPath, secondaryConfigPaths);
    return {
      appType,
      configDir,
      primaryConfigPath,
      secondaryConfigPaths,
      configExists: fs.existsSync(primaryConfigPath),
      currentProviderId: summary.providerId,
      currentProviderName: summary.providerName,
      providerCount: summary.count,
    };
  }
  if (appType === 'kimi') {
    const summary = readKimiCodeConfigSummary(primaryConfigPath, secondaryConfigPaths);
    return {
      appType,
      configDir,
      primaryConfigPath,
      secondaryConfigPaths,
      configExists: fs.existsSync(primaryConfigPath),
      currentProviderId: summary.providerId,
      currentProviderName: summary.providerName,
      providerCount: summary.count,
    };
  }
  const { provider, count } = readCurrentProviderFromDb(dbPath, appType, settingsCurrentProviderId);
  const nativeSummary = !provider && count === 0
    ? appType === 'claude'
      ? readClaudeNativeConfigSummary(primaryConfigPath)
      : appType === 'codex'
        ? readCodexNativeConfigSummary(primaryConfigPath, secondaryConfigPaths[0] || path.join(configDir, 'auth.json'))
        : { providerId: null, providerName: null, count: 0 }
    : { providerId: null, providerName: null, count: 0 };

  return {
    appType,
    configDir,
    primaryConfigPath,
    secondaryConfigPaths,
    configExists: fs.existsSync(primaryConfigPath),
    currentProviderId: provider?.id ?? settingsCurrentProviderId ?? nativeSummary.providerId,
    currentProviderName: provider?.name ?? nativeSummary.providerName,
    providerCount: count || nativeSummary.count,
  };
};

const buildCommandStatus = (
  engine: CliCoworkAgentEngine,
  appType: CliAppType,
  command: string,
  settings: CcSwitchSettings,
  dbPath: string,
  options: ExternalAgentEnvironmentProbeOptions = {},
): Promise<{ status: CliCommandStatus; metric: CliProbeMetric }> => (
  (async () => {
    const resolveStartedAt = Date.now();
    const resolution = await resolveCliCommand(command, options);
    const resolveMs = Date.now() - resolveStartedAt;
    const versionResult = resolution.found
      ? await readCommandVersion(resolution.path ?? command, appType, options)
      : { version: null, durationMs: 0, timedOut: false };
    const config = buildCliConfigSnapshot(appType, settings, dbPath);
    const auth = summarizeCliAuthStatus(appType, config);
    return {
      status: {
        engine,
        appType,
        command,
        found: resolution.found,
        path: resolution.path,
        version: versionResult.version,
        error: resolution.error,
        ...auth,
        config,
      },
      metric: {
        command,
        path: resolution.path,
        version: versionResult.version,
        resolveMs,
        versionMs: versionResult.durationMs,
        found: resolution.found,
        timedOut: resolution.timedOut || versionResult.timedOut,
        error: resolution.error,
      },
    };
  })()
);

const buildPlaceholderCommandStatus = (
  engine: CliCoworkAgentEngine,
  appType: CliAppType,
  command: string,
  settings: CcSwitchSettings,
  dbPath: string,
): CliCommandStatus => ({
  engine,
  appType,
  command,
  found: false,
  path: null,
  version: null,
  error: null,
  authStatus: 'unknown',
  authSource: null,
  authMessage: null,
  checking: true,
  config: buildCliConfigSnapshot(appType, settings, dbPath),
});

const AGENT_ENGINE_COMMANDS = [
  { engine: CoworkAgentEngine.ClaudeCode, appType: 'claude', command: 'claude' },
  { engine: CoworkAgentEngine.Codex, appType: 'codex', command: 'codex' },
  { engine: CoworkAgentEngine.OpenClaw, appType: 'openclaw', command: 'openclaw' },
  { engine: CoworkAgentEngine.Hermes, appType: 'hermes', command: 'hermes' },
  { engine: CoworkAgentEngine.OpenCode, appType: 'opencode', command: 'opencode' },
  { engine: CoworkAgentEngine.GrokBuild, appType: 'grok', command: 'grok' },
  { engine: CoworkAgentEngine.QwenCode, appType: 'qwen', command: 'qwen' },
  { engine: CoworkAgentEngine.DeepSeekTui, appType: 'deepseek_tui', command: 'deepseek-tui' },
  { engine: CoworkAgentEngine.OpenSquilla, appType: 'opensquilla', command: 'opensquilla' },
  { engine: CoworkAgentEngine.KimiCode, appType: 'kimi', command: 'kimi' },
] as const satisfies Array<{ engine: CliCoworkAgentEngine; appType: CliAppType; command: string }>;

const listAgentEngineCommands = (
  options: ExternalAgentEnvironmentProbeOptions = {},
): typeof AGENT_ENGINE_COMMANDS[number][] => {
  if (!options.appTypes?.length) {
    return [...AGENT_ENGINE_COMMANDS];
  }
  const appTypes = new Set<CliAppType>(options.appTypes);
  return AGENT_ENGINE_COMMANDS.filter(({ appType }) => appTypes.has(appType));
};

const buildCcSwitchSnapshot = (
  appDir: string,
  settingsPath: string,
  dbPath: string,
  settings: CcSwitchSettings,
): CcSwitchSnapshot => {
  const claudeOverride = getConfigDirSetting(settings, 'claude');
  const codexOverride = getConfigDirSetting(settings, 'codex');
  return {
    installed: fs.existsSync(appDir),
    appDir,
    dbPath,
    settingsPath,
    settingsExists: fs.existsSync(settingsPath),
    databaseExists: fs.existsSync(dbPath),
    claudeConfigDirOverride: claudeOverride,
    codexConfigDirOverride: codexOverride,
  };
};

const readBaseSnapshotInputs = (): {
  appDir: string;
  settingsPath: string;
  dbPath: string;
  settings: CcSwitchSettings;
} => {
  const appDir = ccSwitchAppDir();
  const settingsPath = path.join(appDir, 'settings.json');
  const dbPath = path.join(appDir, 'cc-switch.db');
  const settings = readCcSwitchSettings(settingsPath);
  return { appDir, settingsPath, dbPath, settings };
};

export function getPlaceholderExternalAgentEnvironmentSnapshot(
  options: ExternalAgentEnvironmentProbeOptions = {},
): ExternalAgentEnvironmentSnapshot {
  const { appDir, settingsPath, dbPath, settings } = readBaseSnapshotInputs();
  const commands = listAgentEngineCommands(options);
  return {
    ccSwitch: buildCcSwitchSnapshot(appDir, settingsPath, dbPath, settings),
    engines: commands.map(({ engine, appType, command }) => (
      buildPlaceholderCommandStatus(engine, appType, command, settings, dbPath)
    )),
  };
}

export async function getExternalAgentEnvironmentSnapshot(
  options: ExternalAgentEnvironmentProbeOptions = {},
): Promise<ExternalAgentEnvironmentSnapshotResult> {
  const startedAt = Date.now();
  const { appDir, settingsPath, dbPath, settings } = readBaseSnapshotInputs();
  const results = await Promise.all(listAgentEngineCommands(options).map(({ engine, appType, command }) => (
    buildCommandStatus(engine, appType, command, settings, dbPath, options)
  )));

  return {
    snapshot: {
      ccSwitch: buildCcSwitchSnapshot(appDir, settingsPath, dbPath, settings),
      engines: results.map(result => result.status),
    },
    report: {
      durationMs: Date.now() - startedAt,
      metrics: results.map(result => result.metric),
    },
  };
}
