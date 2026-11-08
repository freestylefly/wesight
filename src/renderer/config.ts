import { DEFAULT_PET_CONFIG, type PetConfig } from '@shared/pet/constants';
import { ProviderName, ProviderRegistry } from '@shared/providers';
import type { KimiModeConfigs } from '@shared/providers/kimi/constants';
import {
  createDefaultThemeSkinState,
  ThemeAppearanceMode,
  type ThemeAppearanceMode as ThemeAppearanceModeType,
  type ThemeSkinState,
} from '@shared/theme/constants';

import { CIYUAN_TRANSLATIONS } from '../shared/ciyuan/translations';

// 配置类型定义
export interface AppConfig {
  // API 配置
  api: {
    key: string;
    baseUrl: string;
  };
  // 模型配置
  model: {
    availableModels: Array<{
      id: string;
      name: string;
      supportsImage?: boolean;
    }>;
    defaultModel: string;
    defaultModelProvider?: string;
  };
  // 多模型提供商配置
  providers?: {
    openai: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      // API 协议格式：anthropic 为 Anthropic 兼容，openai 为 OpenAI 兼容
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    deepseek: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    moonshot: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      /** 是否启用 Moonshot Coding Plan 模式（使用专属 Coding API 端点） */
      codingPlanEnabled?: boolean;
      kimiModeConfigs?: KimiModeConfigs;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    zhipu: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      /** 是否启用 GLM Coding Plan 模式（使用专属 Coding API 端点） */
      codingPlanEnabled?: boolean;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    minimax: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      /** OAuth auth type: 'apikey' (default) or 'oauth' (MiniMax Portal OAuth) */
      authType?: 'apikey' | 'oauth';
      /** OAuth refresh token for automatic token renewal */
      oauthRefreshToken?: string;
      /** OAuth token expiry as Unix timestamp in milliseconds */
      oauthTokenExpiresAt?: number;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    youdaozhiyun: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    qwen: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      /** 是否启用 Qwen Coding Plan 模式（使用专属 Coding API 端点） */
      codingPlanEnabled?: boolean;
      /** OAuth 凭据 */
      oauthCredentials?: {
        access: string;
        refresh: string;
        expires: number;
        resourceUrl?: string;
      };
      /** OAuth 专用 Base URL（与 API Key 的 baseUrl 独立） */
      oauthBaseUrl?: string;
      /** 是否使用OAuth方式而非API Key */
      useOAuth?: boolean;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    openrouter: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    gemini: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    anthropic: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    volcengine: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      /** 是否启用 Volcengine Coding Plan 模式（使用专属 Coding API 端点） */
      codingPlanEnabled?: boolean;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    xiaomi: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    stepfun: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    'github-copilot': {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    ollama: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    custom: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
      }>;
    };
    [key: string]: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      defaultModel?: string;
      codingPlanEnabled?: boolean;
      kimiModeConfigs?: KimiModeConfigs;
      oauthCredentials?: {
        access: string;
        refresh: string;
        expires: number;
        resourceUrl?: string;
      };
      oauthBaseUrl?: string;
      useOAuth?: boolean;
      authType?: 'apikey' | 'oauth';
      oauthRefreshToken?: string;
      oauthTokenExpiresAt?: number;
      displayName?: string;
      credentialRef?: string;
      models?: Array<{
        id: string;
        name: string;
        supportsImage?: boolean;
        modelVendor?: string;
        supportedProtocols?: string[];
        contextLength?: number;
      }>;
    };
  };
  // 主题配置
  theme: ThemeAppearanceModeType;
  // Versioned theme and wallpaper composition.
  themeSkin: ThemeSkinState;
  // 语言配置
  language: 'zh' | 'en';
  // 是否使用系统代理
  useSystemProxy: boolean;
  // 桌面宠物配置
  pet: PetConfig;
  // 语言初始化标记 (用于判断是否是首次启动)
  language_initialized?: boolean;
  // 应用配置
  app: {
    port: number;
    isDevelopment: boolean;
    testMode?: boolean;
  };
  // 快捷键配置
  shortcuts?: {
    newChat: string;
    search: string;
    settings: string;
    [key: string]: string | undefined;
  };
}

const buildDefaultProviders = (): AppConfig['providers'] => {
  const providers: Record<string, {
    enabled: boolean;
    apiKey: string;
    baseUrl: string;
    apiFormat?: 'anthropic' | 'openai' | 'gemini';
    codingPlanEnabled?: boolean;
    models?: Array<{ id: string; name: string; supportsImage?: boolean }>;
  }> = {};

  for (const id of ProviderRegistry.providerIds) {
    const def = ProviderRegistry.get(id)!;
    providers[id] = {
      enabled: false,
      apiKey: '',
      baseUrl: def.defaultBaseUrl,
      apiFormat: def.defaultApiFormat,
      ...(def.codingPlanSupported ? { codingPlanEnabled: false } : {}),
      models: def.defaultModels.map(m => ({ ...m })),
    };
  }

  return providers as AppConfig['providers'];
};

// 默认配置
export const defaultConfig: AppConfig = {
  api: {
    key: '',
    baseUrl: 'https://api.deepseek.com/anthropic',
  },
  model: {
    availableModels: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', supportsImage: false },
    ],
    defaultModel: 'deepseek-v4-flash',
    defaultModelProvider: 'deepseek',
  },
  providers: buildDefaultProviders(),
  theme: ThemeAppearanceMode.System,
  themeSkin: createDefaultThemeSkinState(),
  language: 'zh',
  useSystemProxy: false,
  pet: DEFAULT_PET_CONFIG,
  app: {
    port: 3000,
    isDevelopment: process.env.NODE_ENV === 'development',
    testMode: process.env.NODE_ENV === 'development',
  },
  shortcuts: {
    newChat: 'Ctrl+N',
    search: 'Ctrl+F',
    settings: 'Ctrl+,',
  }
};

// 配置存储键
export const CONFIG_KEYS = {
  APP_CONFIG: 'app_config',
  AUTH: 'auth_state',
  CONVERSATIONS: 'conversations',
  PROVIDERS_EXPORT_KEY: 'providers_export_key',
  SKILLS: 'skills',
};

// Provider lists derived from ProviderRegistry — single source of truth
export const CHINA_PROVIDERS = [...ProviderRegistry.idsByRegion('china')] as const;
export const GLOBAL_PROVIDERS = ProviderRegistry.idsByRegion('global');
export const OFFICIAL_GLOBAL_PROVIDERS = [
  ProviderName.OpenAI,
  ProviderName.Anthropic,
  ProviderName.Gemini,
] as const;

const BUILTIN_PROVIDER_DISPLAY_NAMES: Partial<Record<string, string>> = {
  [ProviderName.TokenDance]: 'TokenDance · 词元跳动',
  [ProviderName.OpenAI]: 'OpenAI',
  [ProviderName.Anthropic]: 'Claude',
  [ProviderName.Gemini]: 'Google',
};

export const getVisibleProviders = (language: 'zh' | 'en'): readonly string[] => {
  if (language === 'zh') {
    return [ProviderName.TokenDance, ProviderName.Ciyuan, ...OFFICIAL_GLOBAL_PROVIDERS, ...CHINA_PROVIDERS.filter(id => id !== ProviderName.TokenDance)];
  }
  return ProviderRegistry.idsForEnLocale();
};

/**
 * 判断 provider key 是否为自定义提供商，包括保留的旧 OpenLux 账号。
 */
export const isCustomProvider = (key: string): boolean => key.startsWith('custom_') || key === ProviderName.OpenLux;

/**
 * 从 custom_N key 中提取默认显示名称（如 custom_0 → "Custom0"）
 */
export const getCustomProviderDefaultName = (key: string): string => {
  if (key === ProviderName.OpenLux) return 'OpenLux';
  const suffix = key.replace('custom_', '');
  return `Custom${suffix}`;
};

/**
 * 获取 provider 的显示名称，自定义 provider 优先使用 displayName，
 * 内置 provider 使用首字母大写的 key。
 */
export const getProviderDisplayName = (
  providerKey: string,
  providerConfig?: Record<string, unknown>,
  language: AppConfig['language'] = 'zh',
): string => {
  if (providerKey === ProviderName.Ciyuan) return CIYUAN_TRANSLATIONS[language].ciyuanName;
  if (isCustomProvider(providerKey)) {
    const name = providerConfig && typeof providerConfig.displayName === 'string'
      ? providerConfig.displayName
      : '';
    return name || getCustomProviderDefaultName(providerKey);
  }
  const builtinName = BUILTIN_PROVIDER_DISPLAY_NAMES[providerKey];
  if (builtinName) {
    return builtinName;
  }
  return providerKey.charAt(0).toUpperCase() + providerKey.slice(1);
};
