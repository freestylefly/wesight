import { normalizePetConfig } from '@shared/pet/constants';

import { TokenDance } from '../../shared/tokendance/constants';
import { AppConfig, CONFIG_KEYS, defaultConfig, isCustomProvider } from '../config';
import { normalizeThemeSkinState } from '../theme/skin/config';
import { localStore } from './store';

const getFixedProviderApiFormat = (providerKey: string): 'anthropic' | 'openai' | 'gemini' | null => {
  if (providerKey === TokenDance.Provider || providerKey === 'openai' || providerKey === 'stepfun' || providerKey === 'youdaozhiyun' || providerKey === 'github-copilot') {
    return 'openai';
  }
  if (providerKey === 'anthropic') {
    return 'anthropic';
  }
  if (providerKey === 'gemini') {
    return 'gemini';
  }
  return null;
};

const normalizeProviderBaseUrl = (providerKey: string, baseUrl: unknown): string => {
  if (providerKey === TokenDance.Provider) return TokenDance.BaseUrl;
  if (typeof baseUrl !== 'string') {
    return '';
  }

  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (providerKey !== 'gemini') {
    return normalized;
  }

  if (!normalized || !normalized.includes('generativelanguage.googleapis.com')) {
    return normalized;
  }

  // Strip the /openai suffix for native Gemini API
  if (normalized.endsWith('/v1beta/openai')) {
    return normalized.slice(0, -'/openai'.length);
  }
  if (normalized.endsWith('/v1/openai')) {
    return normalized.slice(0, -'/openai'.length);
  }
  if (normalized.endsWith('/v1beta')) {
    return normalized;
  }
  if (normalized.endsWith('/v1')) {
    return `${normalized.slice(0, -3)}v1beta`;
  }

  return 'https://generativelanguage.googleapis.com/v1beta';
};

const normalizeProviderApiFormat = (providerKey: string, apiFormat: unknown): 'anthropic' | 'openai' | 'gemini' => {
  const fixed = getFixedProviderApiFormat(providerKey);
  if (fixed) {
    return fixed;
  }
  if (apiFormat === 'openai') {
    return 'openai';
  }
  return 'anthropic';
};

const normalizeProvidersConfig = (providers: AppConfig['providers']): AppConfig['providers'] => {
  if (!providers) {
    return providers;
  }

  return Object.fromEntries(
    Object.entries(providers).map(([providerKey, providerConfig]) => [
      providerKey,
      {
        ...providerConfig,
        baseUrl: normalizeProviderBaseUrl(providerKey, providerConfig.baseUrl),
        apiFormat: normalizeProviderApiFormat(providerKey, providerConfig.apiFormat),
        ...(providerKey === TokenDance.Provider ? {
          apiKey: providerConfig.apiKey ? TokenDance.CredentialRef : '',
          credentialRef: providerConfig.apiKey ? TokenDance.CredentialRef : undefined,
        } : {}),
      },
    ])
  ) as AppConfig['providers'];
};

/**
 * Migrate legacy single `custom` provider to `custom_0`.
 */
const migrateCustomProviders = (config: AppConfig): AppConfig => {
  const providers = config.providers;
  if (!providers) return config;

  // Migrate legacy `custom` key (without underscore) to `custom_0`
  if ('custom' in providers && !isCustomProvider('custom')) {
    const legacyCustom = providers['custom'];
    if (legacyCustom) {
      const updatedProviders: Record<string, NonNullable<AppConfig['providers']>[string]> = { ...providers };
      updatedProviders['custom_0'] = { ...legacyCustom };
      delete updatedProviders['custom'];
      return {
        ...config,
        providers: updatedProviders as AppConfig['providers'],
      };
    }
  }

  return config;
};

// Model IDs that have been removed from specific providers.
// These will be filtered out from saved configs during migration.
const REMOVED_PROVIDER_MODELS: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v3.2-exp'],
  openai: ['gpt-5.2-2025-12-11', 'gpt-5.2'],
  'github-copilot': ['gpt-4o'],
  minimax: ['MiniMax-M2.5', 'MiniMax-text-01', 'abab7-chat-preview'],
  zhipu: ['glm-4.5', 'glm-4.6'],
  moonshot: ['kimi-k2.5'],
};

// Models to inject into existing saved configs (for existing users).
// These models will be added on every startup if missing from the stored config.
// Note: users cannot permanently remove these models — they will be re-injected
// on next launch. Once all users have upgraded, entries here should be removed
// so the models follow normal user-editable behavior (same as other models).
// position: 'start' inserts at the beginning, 'end' appends at the end.
const ADDED_PROVIDER_MODELS: Record<string, { models: Array<{ id: string; name: string; supportsImage?: boolean }>; position: 'start' | 'end' }> = {
  deepseek: {
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', supportsImage: false },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', supportsImage: false },
    ],
    position: 'start',
  },
  minimax: {
    models: [
      { id: 'MiniMax-M3', name: 'MiniMax M3', supportsImage: false },
    ],
    position: 'start',
  },
  zhipu: {
    models: [
      { id: 'glm-5.1', name: 'GLM 5.1', supportsImage: false },
      { id: 'glm-4.7-flash', name: 'GLM 4.7 Flash', supportsImage: false },
    ],
    position: 'start',
  },
  xiaomi: {
    models: [
      { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro', supportsImage: false },
      { id: 'mimo-v2-pro', name: 'MiMo V2 Pro', supportsImage: false },
    ],
    position: 'start',
  },
  anthropic: {
    models: [
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', supportsImage: true },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', supportsImage: true },
    ],
    position: 'start',
  },
  'github-copilot': {
    models: [
      { id: 'gpt-5', name: 'GPT-5', supportsImage: true },
      { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', supportsImage: true },
      { id: 'claude-opus-4.8', name: 'Claude Opus 4.8', supportsImage: true },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', supportsImage: true },
    ],
    position: 'start',
  },
  openai: {
    models: [
      { id: 'gpt-5.5', name: 'GPT-5.5', supportsImage: true },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', supportsImage: true },
    ],
    position: 'start',
  },
  moonshot: {
    models: [
      { id: 'kimi-k2.6', name: 'Kimi K2.6', supportsImage: true },
    ],
    position: 'start',
  },
  qwen: {
    models: [
      { id: 'qwen3-max', name: 'Qwen3 Max', supportsImage: true },
      { id: 'qwen3-coder-480b-a35b-instruct', name: 'Qwen3 Coder 480B', supportsImage: false },
    ],
    position: 'start',
  },
  gemini: {
    models: [
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', supportsImage: true },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', supportsImage: true },
    ],
    position: 'start',
  },
};

class ConfigService {
  private config: AppConfig = defaultConfig;

  async init() {
    try {
      const storedConfig = await localStore.getItem<AppConfig>(CONFIG_KEYS.APP_CONFIG);
      if (storedConfig) {
        const mergedProviders = storedConfig.providers
          ? Object.fromEntries(
              Object.entries({
                ...(defaultConfig.providers ?? {}),
                ...storedConfig.providers,
              }).map(([providerKey, providerConfig]) => [
                providerKey,
                (() => {
                  const mergedProvider = {
                    ...(defaultConfig.providers as NonNullable<AppConfig['providers']>)?.[providerKey],
                    ...providerConfig,
                  };
                  // Filter out removed models
                  const removedIds = REMOVED_PROVIDER_MODELS[providerKey];
                  if (removedIds && mergedProvider.models) {
                    mergedProvider.models = mergedProvider.models.filter(
                      (m: { id: string }) => !removedIds.includes(m.id)
                    );
                  }
                  // Inject added models (for existing users who already have saved config)
                  const addedConfig = ADDED_PROVIDER_MODELS[providerKey];
                  if (addedConfig && mergedProvider.models) {
                    const existingIds = new Set(mergedProvider.models.map((m: { id: string }) => m.id));
                    const newModels = addedConfig.models.filter(m => !existingIds.has(m.id));
                    if (newModels.length > 0) {
                      mergedProvider.models = addedConfig.position === 'start'
                        ? [...newModels, ...mergedProvider.models]
                        : [...mergedProvider.models, ...newModels];
                    }
                  }
                  return {
                    ...mergedProvider,
                    baseUrl: normalizeProviderBaseUrl(providerKey, mergedProvider.baseUrl),
                    apiFormat: normalizeProviderApiFormat(providerKey, mergedProvider.apiFormat),
                  };
                })(),
              ])
            )
          : defaultConfig.providers;

        // Migrate model.defaultModel if it was removed
        const allRemovedIds = Object.values(REMOVED_PROVIDER_MODELS).flat();
        const migratedModel = { ...defaultConfig.model, ...storedConfig.model };
        if (allRemovedIds.includes(migratedModel.defaultModel)) {
          migratedModel.defaultModel = defaultConfig.model.defaultModel;
        }
        if (migratedModel.availableModels) {
          migratedModel.availableModels = migratedModel.availableModels.filter(
            (m: { id: string }) => !allRemovedIds.includes(m.id)
          );
        }

        const legacyThemeId = typeof localStorage !== 'undefined'
          ? localStorage.getItem('lobster-theme-id')
          : null;
        const themeSkin = normalizeThemeSkinState(
          storedConfig.themeSkin,
          storedConfig.theme,
          legacyThemeId,
        );

        this.config = migrateCustomProviders({
          ...defaultConfig,
          ...storedConfig,
          api: {
            ...defaultConfig.api,
            ...storedConfig.api,
          },
          model: migratedModel,
          pet: normalizePetConfig(storedConfig.pet),
          app: {
            ...defaultConfig.app,
            ...storedConfig.app,
          },
          shortcuts: {
            ...defaultConfig.shortcuts!,
            ...(storedConfig.shortcuts ?? {}),
          } as AppConfig['shortcuts'],
          providers: mergedProviders as AppConfig['providers'],
          theme: themeSkin.active.appearanceMode,
          themeSkin,
        });

        const storedThemeSkin = storedConfig.themeSkin;
        const needsThemeSkinMigration = !storedThemeSkin
          || storedThemeSkin.schemaVersion !== 1
          || legacyThemeId !== null;
        if (needsThemeSkinMigration) {
          await localStore.setItem(CONFIG_KEYS.APP_CONFIG, this.config);
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('lobster-theme-id');
          }
        }
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }

  getConfig(): AppConfig {
    return this.config;
  }

  async updateConfig(
    newConfig: Partial<AppConfig>,
    options?: { syncRuntimeConfig?: boolean },
  ) {
    const normalizedProviders = normalizeProvidersConfig(newConfig.providers as AppConfig['providers'] | undefined);
    const normalizedPet = newConfig.pet ? normalizePetConfig(newConfig.pet) : undefined;
    const themeSkin = normalizeThemeSkinState(
      newConfig.themeSkin ?? this.config.themeSkin,
      newConfig.theme ?? this.config.theme,
      null,
    );
    this.config = {
      ...this.config,
      ...newConfig,
      ...(normalizedProviders ? { providers: normalizedProviders } : {}),
      ...(normalizedPet ? { pet: normalizedPet } : {}),
      theme: themeSkin.active.appearanceMode,
      themeSkin,
    };
    await localStore.setItem(CONFIG_KEYS.APP_CONFIG, this.config, options);
  }

  getApiConfig() {
    return {
      apiKey: this.config.api.key,
      baseUrl: this.config.api.baseUrl,
    };
  }
}

export const configService = new ConfigService(); 
