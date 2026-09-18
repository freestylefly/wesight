import type { CoworkApiConfig } from './coworkConfigStore';

export interface OpenCodeProviderConfig {
  name?: string;
  npm?: string;
  options?: Record<string, unknown>;
  models?: Record<string, unknown> | string[] | Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface OpenCodeConfig {
  model?: string;
  provider?: Record<string, OpenCodeProviderConfig>;
  [key: string]: unknown;
}

export interface OpenCodeModelProviderRecord {
  id: string;
  name: string;
  model: string;
  providerKey: string;
  modelId: string;
  apiKey: string;
  baseUrl: string;
  config: OpenCodeConfig;
  isCurrent: boolean;
}

const WESIGHT_PROVIDER_MARKER = 'wesight';

export const DEFAULT_OPENCODE_MODEL = 'anthropic/claude-sonnet-4-5';

/**
 * Marker written into a provider's settings_config when WeSight deliberately
 * stores no model for it.
 *
 * Needed because `summarizeOpenCodeSettingsConfig` otherwise falls back to
 * DEFAULT_OPENCODE_MODEL for an empty model, which would resurrect the very
 * unauthenticated Anthropic default we dropped and hand it to
 * `opencode run --model` (issue #78).
 */
export const OPENCODE_MODEL_UNSET_KEY = 'modelUnset';

// Credentials OpenCode writes to ~/.local/share/opencode/auth.json follow its
// Auth.Info discriminated union:
//   { "deepseek": { "type": "api", "key": "sk-..." } }
//   { "anthropic": { "type": "oauth", "refresh": "...", "access": "...", "expires": 0 } }
//   { "acme": { "type": "wellknown", "key": "...", "token": "..." } }
// The provider IDs are the only reliable signal of which models a user can
// actually run when opencode.json(c) carries no `model` field.
const OPENCODE_PLACEHOLDER_SECRETS = new Set(['***', 'sk-wesight-local', 'wesight-openai-compat', 'qwen-oauth']);

const isUsableAuthSecret = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('$')) return false;
  if (trimmed.includes('WESIGHT_APIKEY_')) return false;
  return !OPENCODE_PLACEHOLDER_SECRETS.has(trimmed.toLowerCase());
};

export const openCodeAuthEntryLoggedIn = (entry: unknown): boolean => {
  if (!isRecord(entry)) return false;
  const hasValue = (field: string): boolean => isUsableAuthSecret(entry[field]);
  switch (entry.type) {
    case 'api':
      return hasValue('key');
    case 'oauth':
      // Usable while a refresh token remains; a live access token alone also works.
      return hasValue('refresh') || hasValue('access');
    case 'wellknown':
      return hasValue('key') || hasValue('token');
    default:
      // Tolerate older/future shapes that omit the discriminator.
      return ['api', 'key', 'apiKey', 'token', 'access', 'refresh'].some(hasValue);
  }
};

// Returns the provider IDs in an OpenCode auth.json that hold a usable credential.
export const listOpenCodeAuthProviderIds = (authJson: unknown): string[] => {
  if (!isRecord(authJson)) return [];
  return Object.entries(authJson)
    .filter(([providerKey, entry]) => Boolean(providerKey.trim()) && openCodeAuthEntryLoggedIn(entry))
    .map(([providerKey]) => providerKey);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

const getString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

export const parseOpenCodeConfig = (value: unknown): OpenCodeConfig => {
  return isRecord(value) ? value as OpenCodeConfig : {};
};

export const parseOpenCodeConfigText = (text: string): OpenCodeConfig => {
  try {
    return parseOpenCodeConfig(JSON.parse(text || '{}'));
  } catch {
    return {};
  }
};

export const splitOpenCodeModel = (model: string): { providerKey: string; modelId: string } => {
  const trimmed = model.trim();
  const slashIndex = trimmed.indexOf('/');
  if (slashIndex <= 0 || slashIndex === trimmed.length - 1) {
    return {
      providerKey: trimmed || 'opencode',
      modelId: trimmed || DEFAULT_OPENCODE_MODEL,
    };
  }
  return {
    providerKey: trimmed.slice(0, slashIndex),
    modelId: trimmed.slice(slashIndex + 1),
  };
};

export const buildOpenCodeModel = (providerKey: string, modelId: string): string => {
  const safeProviderKey = providerKey.trim() || 'opencode';
  const safeModelId = modelId.trim() || DEFAULT_OPENCODE_MODEL;
  if (safeModelId.includes('/')) return safeModelId;
  return `${safeProviderKey}/${safeModelId}`;
};

const sanitizeProviderKey = (value: string): string => {
  const key = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  return key || WESIGHT_PROVIDER_MARKER;
};

const providerDisplayName = (value: string | undefined): string => {
  const normalized = value?.trim() || WESIGHT_PROVIDER_MARKER;
  const known: Record<string, string> = {
    anthropic: 'Anthropic',
    deepseek: 'DeepSeek',
    gemini: 'Gemini',
    kimi: 'Kimi',
    moonshot: 'Moonshot',
    openai: 'OpenAI',
    qwen: 'Qwen',
    wesight: 'WeSight',
  };
  return known[normalized.toLowerCase()]
    ?? normalized
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getProviderOptions = (provider: OpenCodeProviderConfig | undefined): Record<string, unknown> => {
  return isRecord(provider?.options) ? provider.options as Record<string, unknown> : {};
};

const getProviderModels = (providerKey: string, provider: OpenCodeProviderConfig): string[] => {
  const models = provider.models;
  if (Array.isArray(models)) {
    return models
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (isRecord(item)) return getString(item.id) || getString(item.name);
        return '';
      })
      .filter(Boolean);
  }
  if (isRecord(models)) {
    return Object.keys(models).filter(Boolean);
  }
  return [];
};

const getCurrentProviderModel = (config: OpenCodeConfig): string => {
  return getString(config.model) || DEFAULT_OPENCODE_MODEL;
};

export interface ListOpenCodeModelProvidersOptions {
  /**
   * Provider IDs known to hold a usable credential (see listOpenCodeAuthProviderIds).
   * When supplied, the synthesized DEFAULT_OPENCODE_MODEL fallback is only kept if
   * its provider is actually logged in, so WeSight stops advertising an Anthropic
   * model to users who only authenticated DeepSeek/Google (issue #78).
   * Omit the option entirely to preserve the previous unconditional behaviour.
   */
  authProviderIds?: string[];
}

export const listOpenCodeModelProviders = (
  config: OpenCodeConfig,
  options?: ListOpenCodeModelProvidersOptions,
): OpenCodeModelProviderRecord[] => {
  const providerMap = isRecord(config.provider) ? config.provider as Record<string, OpenCodeProviderConfig> : {};
  const explicitModel = getString(config.model);
  const currentModel = getCurrentProviderModel(config);
  // Only gate the synthesized default: an explicitly configured model is the
  // user's own declaration and must always be surfaced.
  const authProviderIds = options?.authProviderIds;
  const authGateActive = Array.isArray(authProviderIds);
  const skipSynthesizedDefault = !explicitModel
    && authGateActive
    && !authProviderIds.some(
      (providerKey) => providerKey.trim().toLowerCase()
        === splitOpenCodeModel(currentModel).providerKey.toLowerCase(),
    );
  const records: OpenCodeModelProviderRecord[] = [];
  const seen = new Set<string>();
  const addRecord = (model: string, providerConfig?: OpenCodeProviderConfig) => {
    const normalizedModel = model.trim();
    if (!normalizedModel || seen.has(normalizedModel)) return;
    seen.add(normalizedModel);
    const { providerKey, modelId } = splitOpenCodeModel(normalizedModel);
    const provider = providerConfig ?? providerMap[providerKey];
    const options = getProviderOptions(provider);
    const name = getString(provider?.name) || providerDisplayName(providerKey);
    records.push({
      id: `opencode-${normalizedModel}`,
      name,
      model: normalizedModel,
      providerKey,
      modelId,
      apiKey: getString(options.apiKey) || getString(options.api_key),
      baseUrl: getString(options.baseURL) || getString(options.baseUrl) || getString(options.base_url),
      config,
      isCurrent: normalizedModel === currentModel,
    });
  };

  if (!skipSynthesizedDefault) {
    addRecord(currentModel);
  }
  for (const [providerKey, provider] of Object.entries(providerMap)) {
    for (const modelId of getProviderModels(providerKey, provider)) {
      addRecord(buildOpenCodeModel(providerKey, modelId), provider);
    }
  }
  // Dropping the unusable synthesized default must not leave the list empty:
  // an empty list makes the store fall back to the raw live config, whose
  // `model` is again DEFAULT_OPENCODE_MODEL, so the user is back to a stalled
  // task with an unauthenticated provider. Emit one credential-backed entry per
  // logged-in provider instead and let OpenCode resolve the concrete model.
  if (records.length === 0 && authGateActive) {
    for (const providerKey of authProviderIds) {
      const normalizedKey = providerKey.trim();
      if (!normalizedKey) continue;
      const provider = providerMap[normalizedKey];
      const options = getProviderOptions(provider);
      const id = `opencode-auth-${normalizedKey}`;
      if (seen.has(id)) continue;
      seen.add(id);
      records.push({
        id,
        name: getString(provider?.name) || providerDisplayName(normalizedKey),
        // Empty model: WeSight has a usable credential but no model declaration,
        // so the runtime must not pass `--model`.
        model: '',
        providerKey: normalizedKey,
        modelId: '',
        apiKey: getString(options.apiKey) || getString(options.api_key),
        baseUrl: getString(options.baseURL) || getString(options.baseUrl) || getString(options.base_url),
        config,
        isCurrent: records.length === 0,
      });
    }
  }
  return records;
};

export const summarizeOpenCodeSettingsConfig = (
  settingsConfig: Record<string, unknown>,
): { apiKey: string; baseUrl: string; model: string } => {
  const config = parseOpenCodeConfig(settingsConfig.config);
  // A provider stored with the unset marker intentionally carries no model, so
  // the DEFAULT_OPENCODE_MODEL fallback below must be bypassed: re-deriving it
  // would hand `opencode run --model` a provider the user never authenticated.
  const modelUnset = settingsConfig[OPENCODE_MODEL_UNSET_KEY] === true;
  const model = modelUnset
    ? ''
    : getString(settingsConfig.model) || getCurrentProviderModel(config);
  const { providerKey } = splitOpenCodeModel(model);
  const providerMap = isRecord(config.provider) ? config.provider as Record<string, OpenCodeProviderConfig> : {};
  const options = getProviderOptions(providerMap[providerKey]);
  return {
    apiKey: getString(options.apiKey) || getString(options.api_key),
    baseUrl: getString(options.baseURL) || getString(options.baseUrl) || getString(options.base_url),
    model,
  };
};

export const settingsConfigFromOpenCodeRecord = (
  record: OpenCodeModelProviderRecord,
): Record<string, unknown> => {
  if (!record.model.trim()) {
    return {
      config: record.config,
      model: '',
      [OPENCODE_MODEL_UNSET_KEY]: true,
    };
  }
  return {
    config: record.config,
    model: record.model,
  };
};

export const mergeOpenCodeConfigForWesightModel = (
  existingConfig: OpenCodeConfig,
  config: CoworkApiConfig,
  providerName?: string,
): OpenCodeConfig => {
  const isAnthropic = config.apiType === 'anthropic';
  const providerKey = isAnthropic ? 'anthropic' : sanitizeProviderKey(providerName || 'wesight');
  const displayName = isAnthropic ? 'Anthropic' : providerDisplayName(providerName || 'wesight');
  const modelId = config.model.trim() || (isAnthropic ? 'claude-sonnet-4-5' : 'gpt-5.4');
  const providerMap = isRecord(existingConfig.provider)
    ? { ...(existingConfig.provider as Record<string, OpenCodeProviderConfig>) }
    : {};
  const existingProvider = providerMap[providerKey] ?? {};

  providerMap[providerKey] = {
    ...existingProvider,
    name: displayName,
    npm: isAnthropic ? '@ai-sdk/anthropic' : '@ai-sdk/openai-compatible',
    options: {
      ...getProviderOptions(existingProvider),
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    },
    models: {
      ...(isRecord(existingProvider.models) ? existingProvider.models as Record<string, unknown> : {}),
      [modelId]: {
        name: modelId,
      },
    },
  };

  return {
    ...existingConfig,
    model: buildOpenCodeModel(providerKey, modelId),
    provider: providerMap,
  };
};

export const buildOpenCodeRuntimeConfigContent = (
  config: CoworkApiConfig,
  providerName?: string,
): string => {
  return JSON.stringify(mergeOpenCodeConfigForWesightModel({}, config, providerName));
};
