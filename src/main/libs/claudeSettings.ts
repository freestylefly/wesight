import { app } from 'electron';
import { join } from 'path';

import { ProviderName, ProviderRegistry, resolveCodingPlanBaseUrl } from '../../shared/providers';
import { TokenDance, TokenDanceError } from '../../shared/tokendance/constants';
import { t } from '../i18n';
import type { SqliteStore } from '../sqliteStore';
import type { CoworkApiConfig } from './coworkConfigStore';
import { type AnthropicApiFormat,normalizeProviderApiFormat } from './coworkFormatTransform';
import {
  configureCoworkOpenAICompatProxy,
  getCoworkOpenAICompatProxyBaseURL,
  getCoworkOpenAICompatProxyStatus,
  type OpenAICompatProxyTarget,
} from './coworkOpenAICompatProxy';
import { getTokenDanceService } from './tokendance/service';

type ProviderModel = {
  id: string;
  name?: string;
  supportsImage?: boolean;
};

type QwenOAuthCredentials = {
  access: string;
  refresh?: string;
  expires: number;
  resourceUrl?: string;
};

type ProviderConfig = {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  apiFormat?: 'anthropic' | 'openai' | 'native';
  codingPlanEnabled?: boolean;
  oauthCredentials?: QwenOAuthCredentials;
  models?: ProviderModel[];
};

type AppConfig = {
  model?: {
    defaultModel?: string;
    defaultModelProvider?: string;
  };
  providers?: Record<string, ProviderConfig>;
};

export type ApiConfigResolution = {
  config: CoworkApiConfig | null;
  error?: string;
  providerMetadata?: {
    providerName: string;
    codingPlanEnabled: boolean;
    supportsImage?: boolean;
    modelName?: string;
  };
};

export type ApiConfigOverride = {
  modelId?: string | null;
  providerName?: string | null;
};

// Store getter function injected from main.ts
let storeGetter: (() => SqliteStore | null) | null = null;

export function setStoreGetter(getter: () => SqliteStore | null): void {
  storeGetter = getter;
}

// Auth token getter injected from main.ts for server model provider
let authTokensGetter: (() => { accessToken: string; refreshToken: string } | null) | null = null;

export function setAuthTokensGetter(getter: () => { accessToken: string; refreshToken: string } | null): void {
  authTokensGetter = getter;
}

// Server base URL getter injected from main.ts
let serverBaseUrlGetter: (() => string) | null = null;

export function setServerBaseUrlGetter(getter: () => string): void {
  serverBaseUrlGetter = getter;
}

// Cached server model metadata (populated when auth:getModels is called)
// Keyed by modelId → { supportsImage }
let serverModelMetadataCache: Map<string, { supportsImage?: boolean }> = new Map();

export function updateServerModelMetadata(models: Array<{ modelId: string; supportsImage?: boolean }>): void {
  serverModelMetadataCache = new Map(models.map(m => [m.modelId, { supportsImage: m.supportsImage }]));
}

export function clearServerModelMetadata(): void {
  serverModelMetadataCache.clear();
}

export function getAllServerModelMetadata(): Array<{ modelId: string; supportsImage?: boolean }> {
  return Array.from(serverModelMetadataCache.entries()).map(([modelId, meta]) => ({
    modelId,
    supportsImage: meta.supportsImage,
  }));
}

const getStore = (): SqliteStore | null => {
  if (!storeGetter) {
    return null;
  }
  return storeGetter();
};

export function getClaudeCodePath(): string {
  if (app.isPackaged) {
    return join(
      process.resourcesPath,
      'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk/cli.js'
    );
  }

  // In development, try to find the SDK in the project root node_modules
  // app.getAppPath() might point to dist-electron or other build output directories
  // We need to look in the project root
  const appPath = app.getAppPath();
  // If appPath ends with dist-electron, go up one level
  const rootDir = appPath.endsWith('dist-electron') 
    ? join(appPath, '..') 
    : appPath;

  return join(rootDir, 'node_modules/@anthropic-ai/claude-agent-sdk/cli.js');
}

type MatchedProvider = {
  providerName: string;
  providerConfig: ProviderConfig;
  modelId: string;
  apiFormat: AnthropicApiFormat;
  baseURL: string;
  supportsImage?: boolean;
  modelName?: string;
};

function getEffectiveProviderApiFormat(providerName: string, apiFormat: unknown): AnthropicApiFormat {
  if (providerName === ProviderName.OpenAI || providerName === ProviderName.Gemini || providerName === ProviderName.StepFun || providerName === ProviderName.Youdaozhiyun || providerName === ProviderName.Copilot) {
    return 'openai';
  }
  if (providerName === ProviderName.Anthropic) {
    return 'anthropic';
  }
  return normalizeProviderApiFormat(apiFormat);
}

function providerRequiresApiKey(providerName: string): boolean {
  return providerName !== ProviderName.Ollama;
}

function tryWesightServerFallback(modelId?: string): MatchedProvider | null {
  const tokens = authTokensGetter?.();
  const serverBaseUrl = serverBaseUrlGetter?.();
  if (!tokens?.accessToken || !serverBaseUrl) return null;
  const effectiveModelId = modelId?.trim() || '';
  if (!effectiveModelId) return null;
  const baseURL = `${serverBaseUrl}/api/proxy/v1`;
  const cachedMeta = serverModelMetadataCache.get(effectiveModelId);
  console.log('[ClaudeSettings] wesight-server fallback activated:', { baseURL, modelId: effectiveModelId, supportsImage: cachedMeta?.supportsImage });
  return {
    providerName: ProviderName.WesightServer,
    providerConfig: { enabled: true, apiKey: tokens.accessToken, baseUrl: baseURL, apiFormat: 'openai', models: [{ id: effectiveModelId, supportsImage: cachedMeta?.supportsImage }] },
    modelId: effectiveModelId,
    apiFormat: 'openai',
    baseURL,
    supportsImage: cachedMeta?.supportsImage,
  };
}

function resolveMatchedProvider(
  appConfig: AppConfig,
  override: ApiConfigOverride = {},
): { matched: MatchedProvider | null; error?: string } {
  const providers = appConfig.providers ?? {};

  const resolveFallbackModel = (): {
    providerName: string;
    providerConfig: ProviderConfig;
    modelId: string;
  } | null => {
    for (const [providerName, providerConfig] of Object.entries(providers)) {
      if (!providerConfig?.enabled || !providerConfig.models || providerConfig.models.length === 0) {
        continue;
      }
      const fallbackModel = providerConfig.models.find((model) => model.id?.trim());
      if (!fallbackModel) {
        continue;
      }
      return {
        providerName,
        providerConfig,
        modelId: fallbackModel.id.trim(),
      };
    }
    return null;
  };

  const configuredModelId = override.modelId?.trim() || appConfig.model?.defaultModel?.trim();
  let modelId = configuredModelId || '';
  if (!modelId) {
    const fallback = resolveFallbackModel();
    if (!fallback) {
      const serverFallback = tryWesightServerFallback(configuredModelId);
      if (serverFallback) return { matched: serverFallback };
      return { matched: null, error: 'No available model configured in enabled providers.' };
    }
    modelId = fallback.modelId;
  }

  let providerEntry: [string, ProviderConfig] | undefined;
  const preferredProviderName = override.providerName?.trim() || appConfig.model?.defaultModelProvider?.trim();

  // Handle wesight-server provider: dynamically construct from auth tokens
  if (preferredProviderName === ProviderName.WesightServer) {
    const serverMatch = tryWesightServerFallback(modelId);
    if (serverMatch) {
      return { matched: serverMatch };
    }
  }

  if (preferredProviderName) {
    const preferredProvider = providers[preferredProviderName];
    if (
      preferredProvider?.enabled
      && preferredProvider.models?.some((model) => model.id === modelId)
    ) {
      providerEntry = [preferredProviderName, preferredProvider];
    }
  }

  if (!providerEntry) {
    providerEntry = Object.entries(providers).find(([, provider]) => {
      if (!provider?.enabled || !provider.models) {
        return false;
      }
      return provider.models.some((model) => model.id === modelId);
    });
  }

  if (!providerEntry) {
    const fallback = resolveFallbackModel();
    if (fallback) {
      modelId = fallback.modelId;
      providerEntry = [fallback.providerName, fallback.providerConfig];
    } else {
      const serverFallback = tryWesightServerFallback(modelId);
      if (serverFallback) return { matched: serverFallback };
      return { matched: null, error: `No enabled provider found for model: ${modelId}` };
    }
  }

  const [providerName, storedProviderConfig] = providerEntry;
  let providerConfig = storedProviderConfig;
  if (providerName === ProviderName.TokenDance) {
    try {
      const runtime = getTokenDanceService()?.runtimeConfig(modelId);
      if (!runtime) return { matched: null, error: t(TokenDanceError.NotConnected) };
      providerConfig = { ...storedProviderConfig, apiKey: runtime.apiKey, baseUrl: runtime.baseUrl, apiFormat: runtime.apiFormat };
    } catch (error) {
      return { matched: null, error: t(error instanceof Error ? error.message : TokenDanceError.NotConnected) };
    }
  }
  let apiFormat = getEffectiveProviderApiFormat(providerName, providerConfig.apiFormat);
  let baseURL = providerConfig.baseUrl?.trim();

  if (providerConfig.codingPlanEnabled) {
    const resolved = resolveCodingPlanBaseUrl(providerName, true, apiFormat, baseURL ?? '');
    baseURL = resolved.baseUrl;
    apiFormat = resolved.effectiveFormat;
  }

  if (!baseURL) {
    const serverFallback = tryWesightServerFallback(modelId);
    if (serverFallback) return { matched: serverFallback };
    return { matched: null, error: `Provider ${providerName} is missing base URL.` };
  }

   // Check for API key or OAuth credentials
  const hasApiKey = providerConfig.apiKey?.trim();
  const hasOAuthCreds = providerName === 'qwen' && providerConfig.oauthCredentials;
  if (apiFormat === 'anthropic' && providerRequiresApiKey(providerName) && !providerConfig.apiKey?.trim() && !hasApiKey && !hasOAuthCreds) {
    const serverFallback = tryWesightServerFallback(modelId);
    if (serverFallback) return { matched: serverFallback };
    return { matched: null, error: `Provider ${providerName} requires API key for Anthropic-compatible mode.` };
  }

  const matchedModel = providerConfig.models?.find((m) => m.id === modelId);

  return {
    matched: {
      providerName,
      providerConfig,
      modelId,
      apiFormat,
      baseURL,
      supportsImage: matchedModel?.supportsImage,
      modelName: matchedModel?.name,
    },
  };
}

export function resolveCurrentApiConfig(
  target: OpenAICompatProxyTarget = 'local',
  override: ApiConfigOverride = {},
): ApiConfigResolution {
  const sqliteStore = getStore();
  if (!sqliteStore) {
    return {
      config: null,
      error: 'Store is not initialized.',
    };
  }

  const appConfig = sqliteStore.get<AppConfig>('app_config');
  if (!appConfig) {
    return {
      config: null,
      error: 'Application config not found.',
    };
  }

  const { matched, error } = resolveMatchedProvider(appConfig, override);
  if (!matched) {
    return {
      config: null,
      error,
    };
  }

  if (matched.providerName === ProviderName.TokenDance) {
    const runtime = getTokenDanceService()!.runtimeConfig(matched.modelId, true);
    matched.baseURL = runtime.baseUrl;
    matched.apiFormat = runtime.apiFormat;
  }
  const resolvedBaseURL = matched.baseURL;
  let resolvedApiKey = matched.providerConfig.apiKey?.trim() || '';
  
  // Handle Qwen OAuth credentials
  if (matched.providerName === 'qwen' && !resolvedApiKey && matched.providerConfig.oauthCredentials) {
    const oauthCreds = matched.providerConfig.oauthCredentials;
    // Check if token is still valid (with 5 minute buffer)
    const expiryBuffer = 5 * 60 * 1000;
    if (Date.now() < (oauthCreds.expires - expiryBuffer)) {
      resolvedApiKey = oauthCreds.access; // Use access token as API key
    } else {
      // Token expired, should refresh in background
      console.warn('Qwen OAuth token expired, please refresh credentials');
      resolvedApiKey = oauthCreds.access; // Still try to use it, server might refresh
    }
  }
  
  // Providers that don't require auth (e.g. Ollama) still need a non-empty
  // placeholder so downstream components (OpenClaw gateway, compat proxy)
  // don't reject the request with "No API key found for provider".
  const effectiveApiKey = resolvedApiKey
    || (!providerRequiresApiKey(matched.providerName) ? 'sk-wesight-local' : '');

  if (matched.apiFormat === 'anthropic') {
    return {
      config: {
        apiKey: effectiveApiKey,
        baseURL: resolvedBaseURL,
        model: matched.modelId,
        apiType: 'anthropic',
      },
      providerMetadata: {
        providerName: matched.providerName,
        codingPlanEnabled: !!matched.providerConfig.codingPlanEnabled,
        supportsImage: matched.supportsImage,
      },
    };
  }

  const proxyStatus = getCoworkOpenAICompatProxyStatus();
  if (!proxyStatus.running) {
    return {
      config: null,
      error: 'OpenAI compatibility proxy is not running.',
    };
  }

  configureCoworkOpenAICompatProxy({
    baseURL: resolvedBaseURL,
    apiKey: resolvedApiKey || undefined,
    model: matched.modelId,
    provider: matched.providerName,
  });

  const proxyBaseURL = getCoworkOpenAICompatProxyBaseURL(target);
  if (!proxyBaseURL) {
    return {
      config: null,
      error: 'OpenAI compatibility proxy base URL is unavailable.',
    };
  }

  return {
    config: {
      apiKey: resolvedApiKey || 'wesight-openai-compat',
      baseURL: proxyBaseURL,
      model: matched.modelId,
      apiType: 'openai',
    },
    providerMetadata: {
      providerName: matched.providerName,
      codingPlanEnabled: !!matched.providerConfig.codingPlanEnabled,
    },
  };
}

export function resolveCodexWesightApiConfig(
  target: OpenAICompatProxyTarget = 'local',
  override: ApiConfigOverride = {},
): ApiConfigResolution {
  const sqliteStore = getStore();
  if (!sqliteStore) {
    return {
      config: null,
      error: 'Store is not initialized.',
    };
  }

  const appConfig = sqliteStore.get<AppConfig>('app_config');
  if (!appConfig) {
    return {
      config: null,
      error: 'Application config not found.',
    };
  }

  const { matched, error } = resolveMatchedProvider(appConfig, override);
  if (!matched) {
    return {
      config: null,
      error,
    };
  }

  let resolvedApiKey = matched.providerConfig.apiKey?.trim() || '';
  if (matched.providerName === 'qwen' && !resolvedApiKey && matched.providerConfig.oauthCredentials) {
    const oauthCreds = matched.providerConfig.oauthCredentials;
    const expiryBuffer = 5 * 60 * 1000;
    resolvedApiKey = oauthCreds.access || '';
    if (Date.now() >= (oauthCreds.expires - expiryBuffer)) {
      console.warn('Qwen OAuth token expired, please refresh credentials');
    }
  }

  const effectiveApiKey = resolvedApiKey
    || (!providerRequiresApiKey(matched.providerName) ? 'sk-wesight-local' : '');
  if (matched.providerName === ProviderName.TokenDance) {
    const runtime = getTokenDanceService()!.runtimeConfig(matched.modelId);
    if (runtime.nativeResponses) {
      return {
        config: { apiKey: runtime.apiKey, baseURL: runtime.baseUrl, model: matched.modelId, apiType: 'openai' },
        providerMetadata: { providerName: matched.providerName, codingPlanEnabled: false, supportsImage: matched.supportsImage, modelName: matched.modelName },
      };
    }
  }
  const upstreamBaseURL = resolveCodexOpenAICompatibleBaseURL(matched);
  if (!upstreamBaseURL) {
    return {
      config: null,
      error: `Provider ${matched.providerName} does not have an OpenAI-compatible endpoint for Codex CLI.`,
      providerMetadata: {
        providerName: matched.providerName,
        codingPlanEnabled: !!matched.providerConfig.codingPlanEnabled,
        supportsImage: matched.supportsImage,
        modelName: matched.modelName,
      },
    };
  }

  const proxyStatus = getCoworkOpenAICompatProxyStatus();
  if (!proxyStatus.running) {
    return {
      config: null,
      error: 'OpenAI compatibility proxy is not running.',
      providerMetadata: {
        providerName: matched.providerName,
        codingPlanEnabled: !!matched.providerConfig.codingPlanEnabled,
        supportsImage: matched.supportsImage,
        modelName: matched.modelName,
      },
    };
  }

  configureCoworkOpenAICompatProxy({
    baseURL: upstreamBaseURL,
    apiKey: resolvedApiKey || undefined,
    model: matched.modelId,
    provider: matched.providerName,
  });

  const proxyBaseURL = getCoworkOpenAICompatProxyBaseURL(target);
  if (!proxyBaseURL) {
    return {
      config: null,
      error: 'OpenAI compatibility proxy base URL is unavailable.',
      providerMetadata: {
        providerName: matched.providerName,
        codingPlanEnabled: !!matched.providerConfig.codingPlanEnabled,
        supportsImage: matched.supportsImage,
        modelName: matched.modelName,
      },
    };
  }

  return {
    config: {
      apiKey: effectiveApiKey,
      baseURL: proxyBaseURL,
      model: matched.modelId,
      apiType: 'openai',
    },
    providerMetadata: {
      providerName: matched.providerName,
      codingPlanEnabled: !!matched.providerConfig.codingPlanEnabled,
      supportsImage: matched.supportsImage,
      modelName: matched.modelName,
    },
  };
}

function resolveCodexOpenAICompatibleBaseURL(matched: MatchedProvider): string {
  if (matched.providerConfig.codingPlanEnabled) {
    const codingPlanUrl = ProviderRegistry.getCodingPlanUrl(matched.providerName, 'openai')?.trim();
    if (codingPlanUrl) return codingPlanUrl;
  }

  if (matched.apiFormat === 'openai') {
    return matched.baseURL.trim();
  }

  return ProviderRegistry.getSwitchableBaseUrl(matched.providerName, 'openai')?.trim() || '';
}

export function getCurrentApiConfig(
  target: OpenAICompatProxyTarget = 'local',
  override: ApiConfigOverride = {},
): CoworkApiConfig | null {
  return resolveCurrentApiConfig(target, override).config;
}

/**
 * Resolve the raw API config directly from the app config,
 * without requiring the OpenAI compatibility proxy.
 * Used by OpenClaw config sync which has its own model routing.
 */
export function resolveRawApiConfig(override: ApiConfigOverride = {}): ApiConfigResolution {
  const sqliteStore = getStore();
  if (!sqliteStore) {
    return { config: null, error: 'Store is not initialized.' };
  }
  const appConfig = sqliteStore.get<AppConfig>('app_config');
  if (!appConfig) {
    return { config: null, error: 'Application config not found.' };
  }
  const { matched, error } = resolveMatchedProvider(appConfig, override);
  if (!matched) {
    return { config: null, error };
  }
  let apiKey = matched.providerConfig.apiKey?.trim() || '';
  let effectiveBaseURL = matched.baseURL;
  let effectiveApiFormat = matched.apiFormat;
  
  // Handle Qwen OAuth credentials for OpenClaw gateway
  if (matched.providerName === 'qwen' && !apiKey && matched.providerConfig.oauthCredentials) {
    const oauthCreds = matched.providerConfig.oauthCredentials;
    // Check if token is still valid (with 5 minute buffer)
    const expiryBuffer = 5 * 60 * 1000;
    if (Date.now() < (oauthCreds.expires - expiryBuffer)) {
      apiKey = oauthCreds.access; // Use access token as API key
      
      // Use OAuth resourceUrl as baseURL if available
      if (oauthCreds.resourceUrl) {
        effectiveBaseURL = normalizeQwenBaseUrl(oauthCreds.resourceUrl);
        effectiveApiFormat = 'openai'; // OAuth endpoints use OpenAI format
        
        // Map specific model IDs to OAuth endpoint model names
        matched.modelId = mapQwenModelToOAuthModel(matched.modelId, matched.supportsImage);
      }
    } else {
      // Token expired, should refresh in background
      console.warn('Qwen OAuth token expired for OpenClaw gateway, please refresh credentials');
      apiKey = oauthCreds.access; // Still try to use it, server might refresh
      
      if (oauthCreds.resourceUrl) {
        effectiveBaseURL = normalizeQwenBaseUrl(oauthCreds.resourceUrl);
        effectiveApiFormat = 'openai';
        
        // Map specific model IDs to OAuth endpoint model names
        matched.modelId = mapQwenModelToOAuthModel(matched.modelId, matched.supportsImage);
      }
    }
  }
  
  if (process.env.WESIGHT_OPENCLAW_VERBOSE_LOGS === '1') {
    console.debug('[ClaudeSettings] resolved API config for OpenClaw:', JSON.stringify({
      ...matched,
      providerConfig: { ...matched.providerConfig, apiKey: apiKey ? '***' : '' },
    }));
  }
  // OpenClaw's gateway requires a non-empty apiKey for every provider — even
  // local servers (Ollama, vLLM, etc.) that don't enforce auth.  When the user
  // leaves the key blank we supply a placeholder so the gateway doesn't reject
  // the request with "No API key found for provider".
  const effectiveApiKey = apiKey
    || (!providerRequiresApiKey(matched.providerName) ? 'sk-wesight-local' : '');
  return {
    config: {
      apiKey: effectiveApiKey,
      baseURL: effectiveBaseURL,
      model: matched.modelId,
      apiType: effectiveApiFormat === 'anthropic' ? 'anthropic' : 'openai',
    },
    providerMetadata: {
      providerName: matched.providerName,
      codingPlanEnabled: !!matched.providerConfig.codingPlanEnabled,
      supportsImage: matched.supportsImage,
      modelName: matched.modelName,
    },
  };
}

function normalizeQwenBaseUrl(value: string | undefined): string {
  const DEFAULT_BASE_URL = "https://portal.qwen.ai/v1";
  const raw = value?.trim() || DEFAULT_BASE_URL;
  const withProtocol = raw.startsWith("http") ? raw : `https://${raw}`;
  return withProtocol.endsWith("/v1") ? withProtocol : `${withProtocol.replace(/\/+$/, "")}/v1`;
}

/**
 * Map WeSight model IDs to OAuth endpoint model names
 * OAuth endpoint only supports 'coder-model' and 'vision-model'
 */
function mapQwenModelToOAuthModel(modelId: string, supportsImage?: boolean): string {
  // If the model supports image input, use vision-model
  if (supportsImage) {
    return 'vision-model';
  }
  
  // For all other models (including qwen3.5-plus, qwen3-coder-plus), use coder-model
  return 'coder-model';
}
  /**
   * Collect apiKeys for ALL configured providers (not just the currently selected one).
   * Used by OpenClaw config sync to pre-register all apiKeys as env vars at gateway
   * startup, so switching between providers doesn't require a process restart.
   *
   * Returns a map of env-var-safe provider name → apiKey.
   */
export function resolveAllProviderApiKeys(): Record<string, string> {
  const result: Record<string, string> = {};

  // wesight-server token is now managed by the token proxy
  // (openclawTokenProxy.ts) — no longer injected as an env var.

    // wesight-server: uses auth accessToken
    const tokens = authTokensGetter?.();
    const serverBaseUrl = serverBaseUrlGetter?.();
    if (tokens?.accessToken && serverBaseUrl) {
      result.SERVER = tokens.accessToken;
    }

    // All configured custom providers
    const sqliteStore = getStore();
    if (!sqliteStore) return result;
    const appConfig = sqliteStore.get<AppConfig>('app_config');
    if (!appConfig?.providers) return result;

    for (const [providerName, providerConfig] of Object.entries(appConfig.providers)) {
      if (!providerConfig?.enabled) continue;
      const apiKey = providerName === TokenDance.Provider
        ? (() => { try { return getTokenDanceService()?.runtimeConfig(providerConfig.models?.[0]?.id ?? TokenDance.DefaultModel).apiKey; } catch { return undefined; } })()
        : providerConfig.apiKey?.trim();
      if (!apiKey && providerRequiresApiKey(providerName)) continue;
      const envName = providerName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      result[envName] = apiKey || 'sk-wesight-local';
    }

    return result;
  }
  

export function buildEnvForConfig(config: CoworkApiConfig): Record<string, string> {
  const baseEnv = { ...process.env } as Record<string, string>;

  baseEnv.WESIGHT_APIKEY_ACTIVE_PROVIDER = config.apiKey;
  baseEnv.LOBSTER_PROVIDER_API_KEY = config.apiKey;

  delete baseEnv.ANTHROPIC_API_KEY;
  baseEnv.ANTHROPIC_AUTH_TOKEN = config.apiKey;
  baseEnv.ANTHROPIC_BASE_URL = config.baseURL;
  baseEnv.ANTHROPIC_MODEL = config.model;
  baseEnv.ANTHROPIC_REASONING_MODEL = config.model;
  baseEnv.ANTHROPIC_DEFAULT_SONNET_MODEL = config.model;
  baseEnv.ANTHROPIC_DEFAULT_OPUS_MODEL = config.model;
  baseEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL = config.model;
  baseEnv.ANTHROPIC_SMALL_FAST_MODEL = config.model;

  baseEnv.OPENAI_API_KEY = config.apiKey;
  baseEnv.OPENAI_BASE_URL = config.baseURL;
  baseEnv.OPENAI_MODEL = config.model;
  return baseEnv;
}

export type ProviderRawConfig = {
  providerName: string;
  baseURL: string;
  apiKey: string;
  apiType: 'anthropic' | 'openai';
  codingPlanEnabled: boolean;
  models: Array<{ id: string; name?: string; supportsImage?: boolean }>;
};

export function resolveAllEnabledProviderConfigs(): ProviderRawConfig[] {
  const sqliteStore = getStore();
  if (!sqliteStore) return [];
  const appConfig = sqliteStore.get<AppConfig>('app_config');
  if (!appConfig?.providers) return [];

  const result: ProviderRawConfig[] = [];

  for (const [providerName, providerConfig] of Object.entries(appConfig.providers)) {
    if (!providerConfig?.enabled) continue;
    if (providerName === ProviderName.WesightServer) continue;

    if (providerName === ProviderName.TokenDance) {
      try {
        const runtime = getTokenDanceService()?.runtimeConfig(providerConfig.models?.[0]?.id ?? TokenDance.DefaultModel);
        if (runtime) result.push({ providerName, baseURL: runtime.baseUrl, apiKey: runtime.apiKey, apiType: 'openai', codingPlanEnabled: false, models: providerConfig.models ?? [] });
      } catch { /* A disconnected provider must not be sent to the gateway. */ }
      continue;
    }
    const apiKey = providerConfig.apiKey?.trim() || '';
    if (!apiKey && providerRequiresApiKey(providerName)) continue;

    const baseURL = providerConfig.baseUrl?.trim() || '';

    let effectiveBaseURL = baseURL;
    let effectiveApiFormat = getEffectiveProviderApiFormat(providerName, providerConfig.apiFormat);

    if (providerConfig.codingPlanEnabled) {
      const resolved = resolveCodingPlanBaseUrl(providerName, true, effectiveApiFormat, effectiveBaseURL);
      effectiveBaseURL = resolved.baseUrl;
      effectiveApiFormat = resolved.effectiveFormat;
    }

    if (!effectiveBaseURL) continue;

    const models = (providerConfig.models ?? []).filter((m) => m.id?.trim());
    if (models.length === 0) continue;

    result.push({
      providerName,
      baseURL: effectiveBaseURL,
      apiKey: apiKey || 'sk-wesight-local',
      apiType: effectiveApiFormat === 'anthropic' ? 'anthropic' : 'openai',
      codingPlanEnabled: !!providerConfig.codingPlanEnabled,
      models,
    });
  }

  return result;
}

/**
 * Returns the long-lived GitHub OAuth token used by OpenClaw's built-in
 * github-copilot provider to exchange for short-lived Copilot API tokens.
 * OpenClaw reads this from the COPILOT_GITHUB_TOKEN env var.
 */
export function getCopilotGithubToken(): string | null {
  const sqliteStore = getStore();
  if (!sqliteStore) return null;
  const token = sqliteStore.get<string>('github_copilot_github_token');
  return token?.trim() || null;
}
