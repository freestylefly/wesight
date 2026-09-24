import { EyeIcon, EyeSlashIcon, XCircleIcon as XCircleIconSolid } from '@heroicons/react/20/solid';
import { ArrowPathIcon, ArrowTopRightOnSquareIcon,ChatBubbleLeftIcon, CheckCircleIcon, ClockIcon, Cog6ToothIcon, CommandLineIcon, CpuChipIcon, CubeIcon, EnvelopeIcon, InformationCircleIcon, SignalIcon, SwatchIcon, UserCircleIcon, UserGroupIcon, XCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import {
  ClaudeCodePermissionMode as ClaudeCodePermissionModeValue,
  CoworkAgentEngine as CoworkAgentEngineValue,
  DeepSeekTuiPermissionMode as DeepSeekTuiPermissionModeValue,
  ExternalAgentConfigSource as ExternalAgentConfigSourceValue,
  KimiCodePermissionMode as KimiCodePermissionModeValue,
  OpenCodePermissionMode as OpenCodePermissionModeValue,
  OpenSquillaPermissionMode as OpenSquillaPermissionModeValue,
  QwenCodePermissionMode as QwenCodePermissionModeValue,
} from '@shared/cowork/constants';
import {
  DEFAULT_PET_CONFIG,
  LOCAL_TTS_DEFAULT_BASE_URL,
  LOCAL_TTS_DEFAULT_MODEL,
  LOCAL_TTS_DEFAULT_VOICE_ID,
  LOCAL_TTS_DEFAULT_VOICE_NAME,
  normalizePetConfig,
  normalizePetVoiceConfig,
  PET_VOICE_TTS_MODELS,
  type PetConfig,
  PetMotion,
  type PetMotion as PetMotionType,
  PetVariant,
  type PetVariant as PetVariantType,
  PetVoiceAuthMode,
  type PetVoiceConfig,
  type PetVoiceProfile,
  PetVoiceProvider,
  PetVoiceSource,
} from '@shared/pet/constants';
import React, { useCallback,useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { ProviderRegistry, resolveCodingPlanBaseUrl } from '../../shared/providers';
import { TokenDance } from '../../shared/tokendance/constants';
import { type AppConfig, defaultConfig, getCustomProviderDefaultName,getProviderDisplayName,getVisibleProviders, isCustomProvider } from '../config';
import { APP_ID, EXPORT_FORMAT_TYPE, EXPORT_PASSWORD } from '../constants/app';
import { apiService } from '../services/api';
import type { AppUpdateInfo } from '../services/appUpdate';
import { checkForAppUpdate } from '../services/appUpdate';
import { configService } from '../services/config';
import { coworkService } from '../services/cowork';
import { decryptSecret, decryptWithPassword, EncryptedPayload, encryptWithPassword, PasswordEncryptedPayload } from '../services/encryption';
import { i18nService, LanguageType } from '../services/i18n';
import { imService } from '../services/im';
import { themeService } from '../services/theme';
import { RootState } from '../store';
import { setAvailableModels, setSelectedModel } from '../store/slices/modelSlice';
import type {
  ClaudeCodeLiveConfigSnapshot,
  ClaudeCodePermissionMode,
  CoworkAgentEngine,
  CoworkMemoryStats,
  CoworkUserMemoryEntry,
  DeepSeekTuiPermissionMode,
  ExternalAgentCliInstallProgress,
  ExternalAgentConfigSource,
  ExternalAgentEnvironmentSnapshot,
  ExternalAgentProvider,
  ExternalAgentProviderAppType,
  ExternalAgentProviderListResult,
  HermesEngineStatus,
  KimiCodePermissionMode,
  OpenClawEngineStatus,
  OpenCodePermissionMode,
  OpenSquillaPermissionMode,
  QwenCodePermissionMode,
  StartupServiceState,
} from '../types/cowork';
import AgentsView from './agent/AgentsView';
import Modal from './common/Modal';
import AgentEnvironmentSetup from './cowork/AgentEnvironmentSetup';
import ErrorMessage from './ErrorMessage';
import BrainIcon from './icons/BrainIcon';
import ConnectorIcon from './icons/ConnectorIcon';
import PencilIcon from './icons/PencilIcon';
import PlusCircleIcon from './icons/PlusCircleIcon';
import {
  AnthropicIcon,
  CustomProviderIcon,
  DeepSeekIcon,
  GeminiIcon,
  GitHubCopilotIcon,
  MiniMaxIcon,
  MoonshotIcon,
  OllamaIcon,
  OpenAIIcon,
  OpenRouterIcon,
  QwenIcon,
  RequestyIcon,
  StepfunIcon,
  VolcengineIcon,
  XiaomiIcon,
  YouDaoZhiYunIcon,
  ZhipuIcon,
} from './icons/providers';
import TrashIcon from './icons/TrashIcon';
import IMSettings from './im/IMSettings';
import McpManager from './mcp/McpManager';
import PetSprite, { PetMood } from './pet/PetSprite';
import { ScheduledTasksView } from './scheduledTasks';
import { SettingsTab, type SettingsTab as SettingsTabType } from './settings/constants';
import ThemeSkinSettings from './settings/ThemeSkinSettings';
import { TokenDanceSettings } from './settings/TokenDanceSettings';
import EmailSkillConfig from './skills/EmailSkillConfig';
import ThemedSelect from './ui/ThemedSelect';

const SHOW_LEGACY_THEME_CONTROLS = false;

const COWORK_AGENT_ENGINE_OPTIONS: Array<{
  value: CoworkAgentEngine;
  labelKey: string;
  hintKey: string;
}> = [
  {
    value: CoworkAgentEngineValue.ClaudeCode,
    labelKey: 'coworkAgentEngineClaudeCode',
    hintKey: 'coworkAgentEngineClaudeCodeHint',
  },
  {
    value: CoworkAgentEngineValue.OpenClaw,
    labelKey: 'coworkAgentEngineOpenClaw',
    hintKey: 'coworkAgentEngineOpenClawHint',
  },
  {
    value: CoworkAgentEngineValue.Hermes,
    labelKey: 'coworkAgentEngineHermes',
    hintKey: 'coworkAgentEngineHermesHint',
  },
  {
    value: CoworkAgentEngineValue.OpenSquilla,
    labelKey: 'coworkAgentEngineOpenSquilla',
    hintKey: 'coworkAgentEngineOpenSquillaHint',
  },
  {
    value: CoworkAgentEngineValue.KimiCode,
    labelKey: 'coworkAgentEngineKimiCode',
    hintKey: 'coworkAgentEngineKimiCodeHint',
  },
  {
    value: CoworkAgentEngineValue.YdCowork,
    labelKey: 'coworkAgentEngineClaudeLegacy',
    hintKey: 'coworkAgentEngineClaudeLegacyHint',
  },
  {
    value: CoworkAgentEngineValue.Codex,
    labelKey: 'coworkAgentEngineCodex',
    hintKey: 'coworkAgentEngineCodexHint',
  },
  {
    value: CoworkAgentEngineValue.CodexApp,
    labelKey: 'coworkAgentEngineCodexApp',
    hintKey: 'coworkAgentEngineCodexAppHint',
  },
  {
    value: CoworkAgentEngineValue.OpenCode,
    labelKey: 'coworkAgentEngineOpenCode',
    hintKey: 'coworkAgentEngineOpenCodeHint',
  },
  {
    value: CoworkAgentEngineValue.GrokBuild,
    labelKey: 'coworkAgentEngineGrokBuild',
    hintKey: 'coworkAgentEngineGrokBuildHint',
  },
  {
    value: CoworkAgentEngineValue.QwenCode,
    labelKey: 'coworkAgentEngineQwenCode',
    hintKey: 'coworkAgentEngineQwenCodeHint',
  },
  {
    value: CoworkAgentEngineValue.DeepSeekTui,
    labelKey: 'coworkAgentEngineDeepSeekTui',
    hintKey: 'coworkAgentEngineDeepSeekTuiHint',
  },
];

const mergeAgentEnvironmentSnapshots = (
  previous: ExternalAgentEnvironmentSnapshot | null,
  next: ExternalAgentEnvironmentSnapshot,
): ExternalAgentEnvironmentSnapshot => {
  if (!previous) return next;
  const enginesByAppType = new Map(previous.engines.map((engine) => [engine.appType, engine]));
  next.engines.forEach((engine) => {
    enginesByAppType.set(engine.appType, engine);
  });
  return {
    ...previous,
    ...next,
    engines: Array.from(enginesByAppType.values()),
  };
};

const PET_VARIANT_OPTIONS: Array<{
  value: PetVariantType;
  labelKey: string;
}> = [
  { value: PetVariant.WeSightAgent, labelKey: 'petVariantWeSightAgent' },
  { value: PetVariant.BlueBot, labelKey: 'petVariantBlueBot' },
  { value: PetVariant.AquaDrop, labelKey: 'petVariantAquaDrop' },
  { value: PetVariant.FlameBuddy, labelKey: 'petVariantFlameBuddy' },
  { value: PetVariant.WoodBox, labelKey: 'petVariantWoodBox' },
  { value: PetVariant.SproutBox, labelKey: 'petVariantSproutBox' },
  { value: PetVariant.StackBot, labelKey: 'petVariantStackBot' },
  { value: PetVariant.AstroBot, labelKey: 'petVariantAstroBot' },
  { value: PetVariant.ShadowBot, labelKey: 'petVariantShadowBot' },
  { value: PetVariant.Nana, labelKey: 'petVariantNana' },
];

const PET_MOTION_OPTIONS: Array<{
  value: PetMotionType;
  labelKey: string;
}> = [
  { value: PetMotion.Calm, labelKey: 'petMotionCalm' },
  { value: PetMotion.Playful, labelKey: 'petMotionPlayful' },
];

const DEFAULT_PET_VOICE_TEST_TEXT = '你好，我是你的 WeSight 桌面宠物。';

const getPetVoiceProfileForVariant = (
  voiceConfig: PetVoiceConfig,
  variant: PetVariantType,
): PetVoiceProfile | null => (
  voiceConfig.voiceProfilesByVariant[variant]
  ?? voiceConfig.voiceProfilesByVariant[PetVariant.WeSightAgent]
  ?? null
);

const toAudioSource = (audioPath: string): string => (
  audioPath.startsWith('file://') || audioPath.startsWith('data:')
    ? audioPath
    : `file://${encodeURI(audioPath)}`
);

export type SettingsOpenOptions = {
  initialTab?: SettingsTabType;
  notice?: string;
  noticeI18nKey?: string;
  noticeExtra?: string;
  openedAtMs?: number;
};

interface SettingsProps extends SettingsOpenOptions {
  onClose: () => void;
  onUpdateFound?: (info: AppUpdateInfo) => void;
  enterpriseConfig?: {
    ui?: Record<string, 'hide' | 'disable' | 'readonly'>;
    disableUpdate?: boolean;
  } | null;
}


const CUSTOM_PROVIDER_KEYS = [
  'custom_0', 'custom_1', 'custom_2', 'custom_3', 'custom_4',
  'custom_5', 'custom_6', 'custom_7', 'custom_8', 'custom_9',
] as const;

const providerKeys = [
  TokenDance.Provider,
  'openai',
  'gemini',
  'anthropic',
  'deepseek',
  'moonshot',
  'zhipu',
  'minimax',
  'volcengine',
  'qwen',
  'youdaozhiyun',
  'stepfun',
  'xiaomi',
  'openrouter',
  'requesty',
  'github-copilot',
  'ollama',
  ...CUSTOM_PROVIDER_KEYS,
] as const;

type ProviderType = (typeof providerKeys)[number];
type ProvidersConfig = NonNullable<AppConfig['providers']>;
type ProviderConfig = ProvidersConfig[string];
type Model = NonNullable<ProviderConfig['models']>[number];
type ProviderConnectionTestResult = {
  success: boolean;
  message: string;
  provider: ProviderType;
};

type OpenSquillaGatewayAction = 'status' | 'start' | 'restart' | 'stop';
type OpenSquillaGatewayResult = {
  success: boolean;
  action: OpenSquillaGatewayAction | string;
  payload?: Record<string, unknown> | null;
  error?: string;
};

interface ProviderExportEntry {
  enabled: boolean;
  apiKey: PasswordEncryptedPayload;
  baseUrl: string;
  apiFormat?: 'anthropic' | 'openai' | 'gemini';
  codingPlanEnabled?: boolean;
  models?: Model[];
}

interface ProvidersExportPayload {
  type: typeof EXPORT_FORMAT_TYPE;
  version: 2;
  exportedAt: string;
  encryption: {
    algorithm: 'AES-GCM';
    keySource: 'password';
    keyDerivation: 'PBKDF2';
  };
  providers: Record<string, ProviderExportEntry>;
}

interface ProvidersImportEntry {
  enabled?: boolean;
  apiKey?: EncryptedPayload | PasswordEncryptedPayload | string;
  apiKeyEncrypted?: string;
  apiKeyIv?: string;
  baseUrl?: string;
  apiFormat?: 'anthropic' | 'openai' | 'native';
  codingPlanEnabled?: boolean;
  models?: Model[];
}

interface ProvidersImportPayload {
  type?: string;
  version?: number;
  encryption?: {
    algorithm?: string;
    keySource?: string;
    keyDerivation?: string;
  };
  providers?: Record<string, ProvidersImportEntry>;
}

const providerMeta: Record<ProviderType, { label: string; icon: React.ReactNode }> = {
  [TokenDance.Provider]: { label: 'TokenDance', icon: <span aria-hidden className="text-lg font-bold text-primary">T</span> },
  openai: { label: 'OpenAI', icon: <OpenAIIcon /> },
  deepseek: { label: 'DeepSeek', icon: <DeepSeekIcon /> },
  gemini: { label: 'Google', icon: <GeminiIcon /> },
  anthropic: { label: 'Claude', icon: <AnthropicIcon /> },
  moonshot: { label: 'Moonshot', icon: <MoonshotIcon /> },
  zhipu: { label: 'Zhipu', icon: <ZhipuIcon /> },
  minimax: { label: 'MiniMax', icon: <MiniMaxIcon /> },
  youdaozhiyun: { label: 'Youdao', icon: <YouDaoZhiYunIcon /> },
  qwen: { label: 'Qwen', icon: <QwenIcon /> },
  xiaomi: { label: 'Xiaomi', icon: <XiaomiIcon /> },
  stepfun: { label: 'StepFun', icon: <StepfunIcon /> },
  volcengine: { label: 'Volcengine', icon: <VolcengineIcon /> },
  openrouter: { label: 'OpenRouter', icon: <OpenRouterIcon /> },
  requesty: { label: 'Requesty', icon: <RequestyIcon /> },
  'github-copilot': { label: 'GitHub Copilot', icon: <GitHubCopilotIcon /> },
  ollama: { label: 'Ollama', icon: <OllamaIcon /> },
  ...Object.fromEntries(
    CUSTOM_PROVIDER_KEYS.map(key => [key, { label: getCustomProviderDefaultName(key), icon: <CustomProviderIcon /> }])
  ) as Record<(typeof CUSTOM_PROVIDER_KEYS)[number], { label: string; icon: React.ReactNode }>,
};

const providerLinks: Partial<Record<ProviderType, { website: string; apiKey?: string }>> = {
  [TokenDance.Provider]: { website: TokenDance.Origin },
  openai:       { website: 'https://platform.openai.com',              apiKey: 'https://platform.openai.com/api-keys' },
  gemini:       { website: 'https://aistudio.google.com',              apiKey: 'https://aistudio.google.com/apikey' },
  anthropic:    { website: 'https://console.anthropic.com',            apiKey: 'https://console.anthropic.com/settings/keys' },
  deepseek:     { website: 'https://platform.deepseek.com',            apiKey: 'https://platform.deepseek.com/api_keys' },
  moonshot:     { website: 'https://platform.moonshot.cn',             apiKey: 'https://platform.moonshot.cn/console/api-keys' },
  zhipu:        { website: 'https://open.bigmodel.cn',                 apiKey: 'https://open.bigmodel.cn/usercenter/apikeys' },
  minimax:      { website: 'https://platform.minimaxi.com',            apiKey: 'https://platform.minimaxi.com/user-center/basic-information/interface-key' },
  volcengine:   { website: 'https://console.volcengine.com/ark',       apiKey: 'https://console.volcengine.com/ark' },
  qwen:         { website: 'https://dashscope.console.aliyun.com',     apiKey: 'https://dashscope.console.aliyun.com/apiKey' },
  youdaozhiyun: { website: 'https://ai.youdao.com',                    apiKey: 'https://ai.youdao.com/console' },
  stepfun:      { website: 'https://platform.stepfun.com',             apiKey: 'https://platform.stepfun.com/interface-key' },
  xiaomi:       { website: 'https://dev.mi.com/platform',              apiKey: 'https://dev.mi.com/platform' },
  openrouter:   { website: 'https://openrouter.ai',                    apiKey: 'https://openrouter.ai/keys' },
  requesty:     { website: 'https://requesty.ai',                      apiKey: 'https://app.requesty.ai/api-keys' },
  ollama:       { website: 'https://ollama.com' },
};

const providerRequiresApiKey = (provider: ProviderType) => provider !== 'ollama' && provider !== 'github-copilot';
const normalizeBaseUrl = (baseUrl: string): string => baseUrl.trim().replace(/\/+$/, '').toLowerCase();
const normalizeApiFormat = (value: unknown): 'anthropic' | 'openai' => (
  value === 'openai' ? 'openai' : 'anthropic'
);
const ABOUT_CONTACT_EMAIL = 'hello@wesight.ai';
const ABOUT_USER_MANUAL_URL = 'https://wesight.ai/docs';
const ABOUT_USER_COMMUNITY_URL = '敬请期待';
const ABOUT_SERVICE_TERMS_URL = 'https://wesight.ai/terms';

// MiniMax Portal OAuth constants
const MINIMAX_OAUTH_CLIENT_ID = '78257093-7e40-4613-99e0-527b14b39113';
const MINIMAX_OAUTH_SCOPE = 'group_id profile model.completion';
const MINIMAX_OAUTH_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:user_code';
const MINIMAX_BASE_URL_CN = 'https://api.minimaxi.com/anthropic';
const MINIMAX_BASE_URL_GLOBAL = 'https://api.minimax.io/anthropic';
const MINIMAX_CODE_ENDPOINT_CN = 'https://api.minimaxi.com/oauth/code';
const MINIMAX_CODE_ENDPOINT_GLOBAL = 'https://api.minimax.io/oauth/code';
const MINIMAX_TOKEN_ENDPOINT_CN = 'https://api.minimaxi.com/oauth/token';
const MINIMAX_TOKEN_ENDPOINT_GLOBAL = 'https://api.minimax.io/oauth/token';

type MiniMaxRegion = 'cn' | 'global';
type MiniMaxOAuthPhase =
  | { kind: 'idle' }
  | { kind: 'requesting_code' }
  | { kind: 'pending'; userCode: string; verificationUri: string }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

async function generateMiniMaxPkce(): Promise<{ verifier: string; challenge: string; state: string }> {
  const verifierArray = new Uint8Array(32);
  crypto.getRandomValues(verifierArray);
  const verifier = btoa(String.fromCharCode(...verifierArray))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const stateArray = new Uint8Array(16);
  crypto.getRandomValues(stateArray);
  const state = btoa(String.fromCharCode(...stateArray))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return { verifier, challenge, state };
}

const copyTextFallback = (text: string): boolean => {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  return copied;
};

const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (clipboardError) {
      console.warn('Navigator clipboard write failed, trying fallback:', clipboardError);
    }
  }

  try {
    return copyTextFallback(text);
  } catch (fallbackError) {
    console.error('Fallback clipboard copy failed:', fallbackError);
    return false;
  }
};

const getFixedApiFormatForProvider = (provider: string): 'anthropic' | 'openai' | 'gemini' | null => {
  if (provider === TokenDance.Provider) return 'openai';
  if (provider === 'openai' || provider === 'stepfun') {
    return 'openai';
  }
  if (provider === 'youdaozhiyun' || provider === 'github-copilot') {
    return 'openai';
  }
  // Moonshot /anthropic endpoint does not fully implement the Anthropic Messages
  // spec (tool use, streaming, etc.), so the Claude Agent SDK cannot use it.
  // Force OpenAI format — requests go through the built-in compat proxy instead.
  if (provider === 'moonshot') {
    return 'openai';
  }
  if (provider === 'anthropic') {
    return 'anthropic';
  }
  if (provider === 'gemini') {
    return 'gemini';
  }
  return null;
};
const getEffectiveApiFormat = (provider: string, value: unknown): 'anthropic' | 'openai' | 'gemini' => (
  getFixedApiFormatForProvider(provider) ?? normalizeApiFormat(value)
);
const shouldShowApiFormatSelector = (provider: string): boolean => (
  getFixedApiFormatForProvider(provider) === null
);
const getProviderDefaultBaseUrl = (
  provider: ProviderType,
  apiFormat: 'anthropic' | 'openai' | 'gemini'
): string | null => {
  if (apiFormat === 'gemini') return null;
  return ProviderRegistry.getSwitchableBaseUrl(provider, apiFormat) ?? null;
};
const resolveBaseUrl = (
  provider: ProviderType,
  baseUrl: string,
  apiFormat: 'anthropic' | 'openai' | 'gemini'
): string => {
  if (baseUrl.trim()) {
    if (shouldAutoSwitchProviderBaseUrl(provider, baseUrl) && (apiFormat === 'anthropic' || apiFormat === 'openai')) {
      const switchedUrl = ProviderRegistry.getSwitchableBaseUrl(provider, apiFormat);
      if (switchedUrl) return switchedUrl;
    }
    return baseUrl;
  }
  return getProviderDefaultBaseUrl(provider, apiFormat)
    || defaultConfig.providers?.[provider]?.baseUrl
    || '';
};
const shouldAutoSwitchProviderBaseUrl = (provider: ProviderType, currentBaseUrl: string): boolean => {
  const anthropicUrl = ProviderRegistry.getSwitchableBaseUrl(provider, 'anthropic');
  const openaiUrl = ProviderRegistry.getSwitchableBaseUrl(provider, 'openai');
  if (!anthropicUrl && !openaiUrl) {
    return false;
  }

  const normalizedCurrent = normalizeBaseUrl(currentBaseUrl);
  return (
    (anthropicUrl ? normalizedCurrent === normalizeBaseUrl(anthropicUrl) : false)
    || (openaiUrl ? normalizedCurrent === normalizeBaseUrl(openaiUrl) : false)
  );
};
const buildOpenAICompatibleChatCompletionsUrl = (baseUrl: string, provider: string): string => {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) {
    return '/v1/chat/completions';
  }
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }

  const isGeminiLike = provider === 'gemini' || normalized.includes('generativelanguage.googleapis.com');
  if (isGeminiLike) {
    if (normalized.endsWith('/v1beta/openai') || normalized.endsWith('/v1/openai')) {
      return `${normalized}/chat/completions`;
    }
    if (normalized.endsWith('/v1beta') || normalized.endsWith('/v1')) {
      const betaBase = normalized.endsWith('/v1')
        ? `${normalized.slice(0, -3)}v1beta`
        : normalized;
      return `${betaBase}/openai/chat/completions`;
    }
    return `${normalized}/v1beta/openai/chat/completions`;
  }

  if (provider === 'github-copilot') {
    return `${normalized}/chat/completions`;
  }

  // Handle /v1, /v4 etc. versioned paths
  if (/\/v\d+$/.test(normalized)) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
};
const buildOpenAIResponsesUrl = (baseUrl: string): string => {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) {
    return '/v1/responses';
  }
  if (normalized.endsWith('/responses')) {
    return normalized;
  }
  if (normalized.endsWith('/v1')) {
    return `${normalized}/responses`;
  }
  return `${normalized}/v1/responses`;
};
const shouldUseOpenAIResponsesForProvider = (provider: string): boolean => (
  provider === 'openai'
);
const shouldUseMaxCompletionTokensForOpenAI = (provider: string, modelId?: string): boolean => {
  if (provider !== 'openai') {
    return false;
  }
  const normalizedModel = (modelId ?? '').toLowerCase();
  const resolvedModel = normalizedModel.includes('/')
    ? normalizedModel.slice(normalizedModel.lastIndexOf('/') + 1)
    : normalizedModel;
  return resolvedModel.startsWith('gpt-5')
    || resolvedModel.startsWith('o1')
    || resolvedModel.startsWith('o3')
    || resolvedModel.startsWith('o4');
};
const CONNECTIVITY_TEST_TOKEN_BUDGET = 64;

const getDefaultProviders = (): ProvidersConfig => {
  const providers = (defaultConfig.providers ?? {}) as ProvidersConfig;
  const entries = Object.entries(providers) as Array<[string, ProviderConfig]>;
  const secureSuffix = i18nService.t('modelSuffixSecure');
  return Object.fromEntries(
    entries.map(([providerKey, providerConfig]) => [
      providerKey,
      {
        ...providerConfig,
        models: providerConfig.models?.map(model => ({
          ...model,
          name: model.name.replace('(Secure)', secureSuffix),
          supportsImage: model.supportsImage ?? false,
        })),
      },
    ])
  ) as ProvidersConfig;
};

const getDefaultActiveProvider = (): ProviderType => {
  return TokenDance.Provider;
};

/** Join workspace directory with a filename using platform-aware separator. */
const joinWorkspacePath = (dir: string | undefined, filename: string): string => {
  const base = dir?.trim() || '~/.openclaw/workspace';
  const sep = window.electron.platform === 'win32' ? '\\' : '/';
  // Normalize: if base already ends with a separator, don't double it
  return base.endsWith(sep) || base.endsWith('/') || base.endsWith('\\')
    ? `${base}${filename}`
    : `${base}${sep}${filename}`;
};

// System shortcuts that should not be captured (clipboard, undo, select-all, quit, etc.)
const isSystemShortcut = (e: KeyboardEvent): boolean => {
  const key = e.key.toLowerCase();
  if (e.metaKey && ['c', 'v', 'x', 'z', 'y', 'a', 'q', 'w'].includes(key)) return true;
  if (e.metaKey && e.shiftKey && key === 'z') return true;
  if (e.ctrlKey && ['c', 'v', 'x', 'z', 'y', 'a', 'w'].includes(key)) return true;
  return false;
};

const formatShortcutFromEvent = (e: React.KeyboardEvent): string | null => {
  // Skip standalone modifier keys
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return null;
  // Require at least one non-Shift modifier
  if (!e.metaKey && !e.ctrlKey && !e.altKey) return null;
  if (isSystemShortcut(e.nativeEvent)) return null;

  const parts: string[] = [];
  if (e.metaKey) parts.push('Cmd');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const keyMap: Record<string, string> = {
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    ' ': 'Space', Escape: 'Esc', Enter: 'Enter', Backspace: 'Backspace',
    Delete: 'Delete', Tab: 'Tab',
  };
  const key = keyMap[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  parts.push(key);
  return parts.join('+');
};

const ShortcutRecorder: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [recording, setRecording] = useState(false);
  const divRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { setRecording(false); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { onChange(''); setRecording(false); return; }
    const shortcut = formatShortcutFromEvent(e);
    if (shortcut) { onChange(shortcut); setRecording(false); }
  };

  useEffect(() => {
    if (!recording) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (divRef.current && !divRef.current.contains(e.target as Node)) setRecording(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [recording]);

  return (
    <div
      ref={divRef}
      tabIndex={0}
      data-shortcut-input="true"
      onKeyDown={handleKeyDown}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      className={`w-36 rounded-xl border px-3 py-1.5 text-sm cursor-pointer select-none text-center outline-none transition-colors
        dark:bg-claude-darkSurfaceInset bg-claude-surfaceInset dark:text-claude-darkText text-claude-text
        ${recording
          ? 'border-claude-accent ring-1 ring-claude-accent/30 dark:text-claude-darkTextSecondary text-claude-textSecondary'
          : 'dark:border-claude-darkBorder border-claude-border hover:border-claude-accent/50'
        }`}
    >
      {value || i18nService.t('shortcutNotSet')}
    </div>
  );
};

const Settings: React.FC<SettingsProps> = ({ onClose, initialTab, notice, noticeI18nKey, noticeExtra, openedAtMs, onUpdateFound, enterpriseConfig }) => {
  const dispatch = useDispatch();
  // 状态
  const [activeTab, setActiveTab] = useState<SettingsTabType>(initialTab ?? SettingsTab.General);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [themeId, setThemeId] = useState<string>(themeService.getThemeId());
  const [petEnabled, setPetEnabled] = useState(DEFAULT_PET_CONFIG.enabled);
  const [petVariant, setPetVariant] = useState<PetVariantType>(DEFAULT_PET_CONFIG.variant);
  const [petMotion, setPetMotion] = useState<PetMotionType>(DEFAULT_PET_CONFIG.motion);
  const [petVoice, setPetVoice] = useState<PetVoiceConfig>(() => normalizePetVoiceConfig(DEFAULT_PET_CONFIG.voice));
  const [petVoiceCloneAudioPath, setPetVoiceCloneAudioPath] = useState('');
  const [petVoicePromptAudioPath, setPetVoicePromptAudioPath] = useState('');
  const [petVoicePromptText, setPetVoicePromptText] = useState('');
  const [petVoiceDisplayName, setPetVoiceDisplayName] = useState('');
  const [petVoiceTestText, setPetVoiceTestText] = useState(DEFAULT_PET_VOICE_TEST_TEXT);
  const [isCloningPetVoice, setIsCloningPetVoice] = useState(false);
  const [isTestingPetVoice, setIsTestingPetVoice] = useState(false);
  const petVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const [language, setLanguage] = useState<LanguageType>('zh');
  const [autoLaunch, setAutoLaunchState] = useState(false);
  const [useSystemProxy, setUseSystemProxy] = useState(false);
  const [isUpdatingAutoLaunch, setIsUpdatingAutoLaunch] = useState(false);
  const [preventSleep, setPreventSleepState] = useState(false);
  const [isUpdatingPreventSleep, setIsUpdatingPreventSleep] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buildNoticeMessage = useCallback((): string | null => {
    if (noticeI18nKey) {
      const base = i18nService.t(noticeI18nKey);
      return noticeExtra ? `${base} (${noticeExtra})` : base;
    }
    return notice ?? null;
  }, [notice, noticeExtra, noticeI18nKey]);

  const [noticeMessage, setNoticeMessage] = useState<string | null>(() => buildNoticeMessage());
  const [testResult, setTestResult] = useState<ProviderConnectionTestResult | null>(null);
  const [isTestResultModalOpen, setIsTestResultModalOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [pendingDeleteProvider, setPendingDeleteProvider] = useState<ProviderType | null>(null);
  const [isImportingProviders, setIsImportingProviders] = useState(false);
  const [isExportingProviders, setIsExportingProviders] = useState(false);
  const initialPetConfigRef = useRef<PetConfig>(DEFAULT_PET_CONFIG);
  const initialLanguageRef = useRef<LanguageType>(i18nService.getLanguage());
  const didSaveRef = useRef(false);
  const openedAtRef = useRef(openedAtMs);
  const reportedOpenRef = useRef(false);
  const reportedTabsRef = useRef<Set<SettingsTabType>>(new Set());
  const activeTabRef = useRef<SettingsTabType>(activeTab);

  // Add state for active provider
  const [activeProvider, setActiveProvider] = useState<ProviderType>(getDefaultActiveProvider());
  const [tokenDanceDefault, setTokenDanceDefault] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // MiniMax OAuth state
  const [minimaxOAuthPhase, setMinimaxOAuthPhase] = useState<MiniMaxOAuthPhase>({ kind: 'idle' });
  const [minimaxOAuthRegion, setMinimaxOAuthRegion] = useState<MiniMaxRegion>('cn');
  const minimaxOAuthCancelRef = useRef(false);

  // Add state for providers configuration
  const [providers, setProviders] = useState<ProvidersConfig>(() => getDefaultProviders());


  // authType defaults to undefined on first open, which should behave as OAuth mode
  const minimaxIsOAuthMode = providers.minimax.authType !== 'apikey';
  const isBaseUrlLocked = (activeProvider === 'zhipu' && providers.zhipu.codingPlanEnabled) || (activeProvider === 'qwen' && providers.qwen.codingPlanEnabled) || (activeProvider === 'volcengine' && providers.volcengine.codingPlanEnabled) || (activeProvider === 'moonshot' && providers.moonshot.codingPlanEnabled) || (activeProvider === 'minimax' && minimaxIsOAuthMode);
  
  // 创建引用来确保内容区域的滚动
  const contentRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const emailCopiedTimerRef = useRef<number | null>(null);
  const updateCheckTimerRef = useRef<number | null>(null);
  
  // 快捷键设置
  const [shortcuts, setShortcuts] = useState({
    newChat: 'Ctrl+N',
    search: 'Ctrl+F',
    settings: 'Ctrl+,',
  });

  // GitHub Copilot device code auth state
  const [copilotAuthStatus, setCopilotAuthStatus] = useState<'idle' | 'requesting' | 'awaiting_user' | 'polling' | 'authenticated' | 'error'>('idle');
  const [copilotUserCode, setCopilotUserCode] = useState('');
  const [copilotVerificationUri, setCopilotVerificationUri] = useState('');
  const [copilotGithubUser, setCopilotGithubUser] = useState('');
  const [copilotError, setCopilotError] = useState<string | null>(null);

  // State for model editing
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [isEditingModel, setIsEditingModel] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [newModelName, setNewModelName] = useState('');
  const [newModelId, setNewModelId] = useState('');
  const [newModelSupportsImage, setNewModelSupportsImage] = useState(false);
  const [modelFormError, setModelFormError] = useState<string | null>(null);

  // About tab
  const [appVersion, setAppVersion] = useState('');
  const [emailCopied, setEmailCopied] = useState(false);
  const [isExportingLogs, setIsExportingLogs] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [testModeUnlocked, setTestModeUnlocked] = useState(false);
  const [updateCheckStatus, setUpdateCheckStatus] = useState<'idle' | 'checking' | 'upToDate' | 'error'>('idle');

  useEffect(() => {
    window.electron.appInfo.getVersion().then(setAppVersion);
  }, []);

  const reportSettingsMetric = useCallback((input: {
    type: 'open' | 'interactive' | 'tabLoad' | 'ipc';
    durationMs?: number;
    tab?: string;
    channel?: string;
    success?: boolean;
    error?: string;
    triggeredRuntimeStart?: boolean;
  }) => {
    window.electron?.cowork?.reportSettingsMetric?.(input).catch((metricError) => {
      console.debug('[Settings] failed to report settings performance metric:', metricError);
    });
  }, []);

  const measureSettingsIpc = useCallback(async <T,>(
    channel: string,
    task: () => Promise<T>,
    options: { triggeredRuntimeStart?: boolean } = {},
  ): Promise<T> => {
    const startedAt = performance.now();
    try {
      const result = await task();
      reportSettingsMetric({
        type: 'ipc',
        channel,
        durationMs: Math.round(performance.now() - startedAt),
        tab: activeTabRef.current,
        success: true,
        triggeredRuntimeStart: options.triggeredRuntimeStart === true,
      });
      return result;
    } catch (error) {
      reportSettingsMetric({
        type: 'ipc',
        channel,
        durationMs: Math.round(performance.now() - startedAt),
        tab: activeTabRef.current,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        triggeredRuntimeStart: options.triggeredRuntimeStart === true,
      });
      throw error;
    }
  }, [reportSettingsMetric]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (reportedOpenRef.current) return;
    reportedOpenRef.current = true;
    const openedAt = openedAtRef.current;
    if (typeof openedAt !== 'number') return;
    const openDurationMs = Math.round(performance.now() - openedAt);
    reportSettingsMetric({
      type: 'open',
      durationMs: openDurationMs,
      tab: activeTab,
      success: true,
    });
    const frameId = window.requestAnimationFrame(() => {
      reportSettingsMetric({
        type: 'interactive',
        durationMs: Math.round(performance.now() - openedAt),
        tab: activeTab,
        success: true,
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeTab, reportSettingsMetric]);

  useEffect(() => {
    if (reportedTabsRef.current.has(activeTab)) return;
    reportedTabsRef.current.add(activeTab);
    const startedAt = performance.now();
    const frameId = window.requestAnimationFrame(() => {
      reportSettingsMetric({
        type: 'tabLoad',
        durationMs: Math.round(performance.now() - startedAt),
        tab: activeTab,
        success: true,
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeTab, reportSettingsMetric]);

  useEffect(() => {
    setShowApiKey(false);
  }, [activeProvider]);

  const applyPetConfigPreview = useCallback((nextConfig: PetConfig) => {
    const normalized = normalizePetConfig(nextConfig);
    setPetEnabled(normalized.enabled);
    setPetVariant(normalized.variant);
    setPetMotion(normalized.motion);
    setPetVoice(normalized.voice);
    void window.electron.desktopPet.applyPreview(normalized);
  }, []);

  const buildCurrentPetConfig = useCallback((voiceConfig = petVoice): PetConfig => normalizePetConfig({
    enabled: petEnabled,
    variant: petVariant,
    motion: petMotion,
    voice: voiceConfig,
  }), [petEnabled, petMotion, petVariant, petVoice]);

  const updatePetVoiceConfig = useCallback((updater: (current: PetVoiceConfig) => PetVoiceConfig) => {
    const nextVoice = normalizePetVoiceConfig(updater(petVoice));
    setPetVoice(nextVoice);
    void window.electron.desktopPet.applyPreview(buildCurrentPetConfig(nextVoice));
  }, [buildCurrentPetConfig, petVoice]);

  const updateCurrentPetVoiceProfile = useCallback((patch: Partial<PetVoiceProfile>) => {
    updatePetVoiceConfig((current) => {
      const currentProfile = getPetVoiceProfileForVariant(current, petVariant);
      const voiceId = typeof patch.voiceId === 'string'
        ? patch.voiceId.trim()
        : currentProfile?.voiceId ?? '';
      const profiles = { ...current.voiceProfilesByVariant };
      if (!voiceId) {
        delete profiles[petVariant];
        return {
          ...current,
          voiceProfilesByVariant: profiles,
        };
      }
      profiles[petVariant] = {
        voiceId,
        displayName: patch.displayName ?? currentProfile?.displayName ?? voiceId,
        source: patch.source ?? currentProfile?.source ?? PetVoiceSource.System,
        model: patch.model ?? currentProfile?.model ?? current.model,
        speed: patch.speed ?? currentProfile?.speed ?? current.speed,
        volume: patch.volume ?? currentProfile?.volume ?? current.volume,
        createdAt: patch.createdAt ?? currentProfile?.createdAt ?? Date.now(),
      };
      return {
        ...current,
        voiceProfilesByVariant: profiles,
      };
    });
  }, [petVariant, updatePetVoiceConfig]);

  const handlePetVoiceProviderChange = useCallback((provider: PetVoiceProvider) => {
    updatePetVoiceConfig((current) => {
      if (current.provider === provider) {
        return current;
      }
      const profiles = { ...current.voiceProfilesByVariant };
      if (provider === PetVoiceProvider.LocalTts) {
        profiles[petVariant] = {
          voiceId: LOCAL_TTS_DEFAULT_VOICE_ID,
          displayName: LOCAL_TTS_DEFAULT_VOICE_NAME,
          source: PetVoiceSource.System,
          model: LOCAL_TTS_DEFAULT_MODEL,
          speed: current.speed,
          volume: current.volume,
          createdAt: Date.now(),
        };
        return {
          ...current,
          provider,
          authMode: PetVoiceAuthMode.PetApiKey,
          baseUrl: LOCAL_TTS_DEFAULT_BASE_URL,
          model: LOCAL_TTS_DEFAULT_MODEL,
          voiceProfilesByVariant: profiles,
        };
      }
      return {
        ...current,
        provider,
        baseUrl: DEFAULT_PET_CONFIG.voice.baseUrl,
        model: DEFAULT_PET_CONFIG.voice.model,
        voiceProfilesByVariant: profiles,
      };
    });
  }, [petVariant, updatePetVoiceConfig]);

  const handleSelectPetVoiceAudio = useCallback(async (target: 'clone' | 'prompt') => {
    const result = await window.electron.dialog.selectFile({
      title: target === 'clone'
        ? i18nService.t('petVoiceSelectCloneAudio')
        : i18nService.t('petVoiceSelectPromptAudio'),
      filters: [
        { name: 'Audio', extensions: ['mp3', 'm4a', 'wav'] },
      ],
    });
    if (!result.success || !result.path) return;
    if (target === 'clone') {
      setPetVoiceCloneAudioPath(result.path);
    } else {
      setPetVoicePromptAudioPath(result.path);
    }
  }, []);

  const playPetVoiceAudio = useCallback((audioSource: string) => {
    try {
      petVoiceAudioRef.current?.pause();
      const audio = new Audio(toAudioSource(audioSource));
      petVoiceAudioRef.current = audio;
      void audio.play().catch((playError) => {
        console.debug('[Settings] failed to play pet voice audio:', playError);
      });
    } catch (playError) {
      console.debug('[Settings] failed to prepare pet voice audio:', playError);
    }
  }, []);

  const getPetVoiceModelProviderApiKey = useCallback(() => {
    if (petVoice.provider !== PetVoiceProvider.MiniMax) {
      return undefined;
    }
    if (petVoice.authMode !== PetVoiceAuthMode.ReuseModelProvider) {
      return undefined;
    }
    return providers.minimax.apiKey.trim() || undefined;
  }, [petVoice.authMode, petVoice.provider, providers.minimax.apiKey]);

  const handleClonePetVoice = useCallback(async () => {
    if (!petVoiceCloneAudioPath) {
      setError(i18nService.t('petVoiceCloneAudioRequired'));
      return;
    }
    setIsCloningPetVoice(true);
    setError(null);
    try {
      const result = await window.electron.desktopPet.cloneVoice({
        variant: petVariant,
        voiceConfig: petVoice,
        modelProviderApiKey: getPetVoiceModelProviderApiKey(),
        cloneAudioPath: petVoiceCloneAudioPath,
        promptAudioPath: petVoicePromptAudioPath || null,
        promptText: petVoicePromptText,
        displayName: petVoiceDisplayName,
      });
      if (!result.success || !result.profile) {
        setError(result.error || i18nService.t('petVoiceCloneFailed'));
        return;
      }
      updatePetVoiceConfig((current) => ({
        ...current,
        voiceProfilesByVariant: {
          ...current.voiceProfilesByVariant,
          [petVariant]: result.profile!,
        },
      }));
      setNoticeMessage(i18nService.t('petVoiceCloneSuccess'));
      setPetVoiceDisplayName('');
    } catch (cloneError) {
      setError(cloneError instanceof Error ? cloneError.message : i18nService.t('petVoiceCloneFailed'));
    } finally {
      setIsCloningPetVoice(false);
    }
  }, [
    petVariant,
    petVoice,
    petVoiceCloneAudioPath,
    petVoiceDisplayName,
    petVoicePromptAudioPath,
    petVoicePromptText,
    getPetVoiceModelProviderApiKey,
    updatePetVoiceConfig,
  ]);

  const handleTestPetVoice = useCallback(async () => {
    setIsTestingPetVoice(true);
    setError(null);
    try {
      const result = await window.electron.desktopPet.testVoice({
        variant: petVariant,
        voiceConfig: petVoice,
        modelProviderApiKey: getPetVoiceModelProviderApiKey(),
        text: petVoiceTestText,
      });
      if (!result.success || (!result.audioPath && !result.audioDataUrl)) {
        setError(result.error || i18nService.t('petVoiceTestFailed'));
        return;
      }
      playPetVoiceAudio(result.audioDataUrl || result.audioPath || '');
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : i18nService.t('petVoiceTestFailed'));
    } finally {
      setIsTestingPetVoice(false);
    }
  }, [petVariant, petVoice, petVoiceTestText, getPetVoiceModelProviderApiKey, playPetVoiceAudio]);

  const handleCopyContactEmail = useCallback(async () => {
    const copied = await copyTextToClipboard(ABOUT_CONTACT_EMAIL);
    if (copied) {
      setEmailCopied(true);
      if (emailCopiedTimerRef.current != null) {
        window.clearTimeout(emailCopiedTimerRef.current);
      }
      emailCopiedTimerRef.current = window.setTimeout(() => {
        setEmailCopied(false);
        emailCopiedTimerRef.current = null;
      }, 1200);
    }
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    if (updateCheckStatus === 'checking' || !appVersion) return;
    setUpdateCheckStatus('checking');
    try {
      const info = await checkForAppUpdate(appVersion, true);
      if (info) {
        setUpdateCheckStatus('idle');
        onUpdateFound?.(info);
      } else {
        setUpdateCheckStatus('upToDate');
        if (updateCheckTimerRef.current != null) {
          window.clearTimeout(updateCheckTimerRef.current);
        }
        updateCheckTimerRef.current = window.setTimeout(() => {
          setUpdateCheckStatus('idle');
          updateCheckTimerRef.current = null;
        }, 3000);
      }
    } catch {
      setUpdateCheckStatus('error');
      if (updateCheckTimerRef.current != null) {
        window.clearTimeout(updateCheckTimerRef.current);
      }
      updateCheckTimerRef.current = window.setTimeout(() => {
        setUpdateCheckStatus('idle');
        updateCheckTimerRef.current = null;
      }, 3000);
    }
  }, [appVersion, updateCheckStatus, onUpdateFound]);

  const handleOpenUserManual = useCallback(() => {
    void window.electron.shell.openExternal(ABOUT_USER_MANUAL_URL);
  }, []);

  const handleOpenUserCommunity = useCallback(() => {
    if (ABOUT_USER_COMMUNITY_URL.startsWith('http')) {
      void window.electron.shell.openExternal(ABOUT_USER_COMMUNITY_URL);
    }
  }, []);

  const handleOpenServiceTerms = useCallback(() => {
    void window.electron.shell.openExternal(ABOUT_SERVICE_TERMS_URL);
  }, []);

  const handleExportLogs = useCallback(async () => {
    if (isExportingLogs) {
      return;
    }

    setError(null);
    setNoticeMessage(null);
    setIsExportingLogs(true);
    try {
      const result = await window.electron.log.exportZip();
      if (!result.success) {
        setError(result.error || i18nService.t('aboutExportLogsFailed'));
        return;
      }
      if (result.canceled) {
        return;
      }

      if (result.path) {
        await window.electron.shell.showItemInFolder(result.path);
      }

      if ((result.missingEntries?.length ?? 0) > 0) {
        const missingList = result.missingEntries?.join(', ') || '';
        setNoticeMessage(`${i18nService.t('aboutExportLogsPartial')}: ${missingList}`);
      } else {
        setNoticeMessage(i18nService.t('aboutExportLogsSuccess'));
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : i18nService.t('aboutExportLogsFailed'));
    } finally {
      setIsExportingLogs(false);
    }
  }, [isExportingLogs]);

  const coworkConfig = useSelector((state: RootState) => state.cowork.config);

  const [coworkAgentEngine, setCoworkAgentEngine] = useState<CoworkAgentEngine>(coworkConfig.agentEngine || CoworkAgentEngineValue.YdCowork);
  const [expandedCoworkAgentEngine, setExpandedCoworkAgentEngine] = useState<CoworkAgentEngine | null>(null);
  const [coworkMemoryEnabled, setCoworkMemoryEnabled] = useState<boolean>(coworkConfig.memoryEnabled ?? true);
  const [coworkMemoryLlmJudgeEnabled, setCoworkMemoryLlmJudgeEnabled] = useState<boolean>(coworkConfig.memoryLlmJudgeEnabled ?? false);
  const [coworkMemoryEntries, setCoworkMemoryEntries] = useState<CoworkUserMemoryEntry[]>([]);
  const [coworkMemoryStats, setCoworkMemoryStats] = useState<CoworkMemoryStats | null>(null);
  const [coworkMemoryListLoading, setCoworkMemoryListLoading] = useState<boolean>(false);
  const [coworkMemoryQuery, setCoworkMemoryQuery] = useState<string>('');
  const [coworkMemoryEditingId, setCoworkMemoryEditingId] = useState<string | null>(null);
  const [coworkMemoryDraftText, setCoworkMemoryDraftText] = useState<string>('');
  const [showMemoryModal, setShowMemoryModal] = useState<boolean>(false);
  const [bootstrapIdentity, setBootstrapIdentity] = useState<string>('');
  const [bootstrapUser, setBootstrapUser] = useState<string>('');
  const [bootstrapSoul, setBootstrapSoul] = useState<string>('');
  const [bootstrapLoaded, setBootstrapLoaded] = useState<boolean>(false);
  const [openClawEngineStatus, setOpenClawEngineStatus] = useState<OpenClawEngineStatus | null>(null);
  const [hermesEngineStatus, setHermesEngineStatus] = useState<HermesEngineStatus | null>(null);
  const [startupServices, setStartupServices] = useState<StartupServiceState[]>([]);
  const [agentEnvironmentSnapshot, setAgentEnvironmentSnapshot] = useState<ExternalAgentEnvironmentSnapshot | null>(null);
  const [codexAppStarting, setCodexAppStarting] = useState(false);
  const [openclawConfigSource, setOpenClawConfigSource] = useState<ExternalAgentConfigSource>(
    coworkConfig.openclawConfigSource ?? ExternalAgentConfigSourceValue.LocalCli,
  );
  const [claudeCodeConfigSource, setClaudeCodeConfigSource] = useState<ExternalAgentConfigSource>(
    coworkConfig.claudeCodeConfigSource ?? ExternalAgentConfigSourceValue.LocalCli,
  );
  const [claudeCodePermissionMode, setClaudeCodePermissionMode] = useState<ClaudeCodePermissionMode>(
    coworkConfig.claudeCodePermissionMode ?? ClaudeCodePermissionModeValue.BypassPermissions,
  );
  const [codexConfigSource, setCodexConfigSource] = useState<ExternalAgentConfigSource>(
    coworkConfig.codexConfigSource ?? ExternalAgentConfigSourceValue.LocalCli,
  );
  const [hermesConfigSource, setHermesConfigSource] = useState<ExternalAgentConfigSource>(
    coworkConfig.hermesConfigSource ?? ExternalAgentConfigSourceValue.WesightModel,
  );
  const [opencodeConfigSource, setOpenCodeConfigSource] = useState<ExternalAgentConfigSource>(
    coworkConfig.opencodeConfigSource ?? ExternalAgentConfigSourceValue.WesightModel,
  );
  const [opencodePermissionMode, setOpenCodePermissionMode] = useState<OpenCodePermissionMode>(
    coworkConfig.opencodePermissionMode ?? OpenCodePermissionModeValue.Auto,
  );
  const [qwenCodeConfigSource, setQwenCodeConfigSource] = useState<ExternalAgentConfigSource>(
    coworkConfig.qwenCodeConfigSource ?? ExternalAgentConfigSourceValue.WesightModel,
  );
  const [qwenCodePermissionMode, setQwenCodePermissionMode] = useState<QwenCodePermissionMode>(
    coworkConfig.qwenCodePermissionMode ?? QwenCodePermissionModeValue.Auto,
  );
  const [deepseekTuiConfigSource, setDeepSeekTuiConfigSource] = useState<ExternalAgentConfigSource>(
    coworkConfig.deepseekTuiConfigSource ?? ExternalAgentConfigSourceValue.WesightModel,
  );
  const [deepseekTuiPermissionMode, setDeepSeekTuiPermissionMode] = useState<DeepSeekTuiPermissionMode>(
    coworkConfig.deepseekTuiPermissionMode ?? DeepSeekTuiPermissionModeValue.Auto,
  );
  const [opensquillaConfigSource, setOpenSquillaConfigSource] = useState<ExternalAgentConfigSource>(
    coworkConfig.opensquillaConfigSource ?? ExternalAgentConfigSourceValue.LocalCli,
  );
  const [opensquillaPermissionMode, setOpenSquillaPermissionMode] = useState<OpenSquillaPermissionMode>(
    coworkConfig.opensquillaPermissionMode ?? OpenSquillaPermissionModeValue.Bypass,
  );
  const [kimiCodeConfigSource, setKimiCodeConfigSource] = useState<ExternalAgentConfigSource>(
    coworkConfig.kimiCodeConfigSource ?? ExternalAgentConfigSourceValue.LocalCli,
  );
  const [kimiCodePermissionMode, setKimiCodePermissionMode] = useState<KimiCodePermissionMode>(
    coworkConfig.kimiCodePermissionMode ?? KimiCodePermissionModeValue.Auto,
  );
  const [openSquillaGatewayResult, setOpenSquillaGatewayResult] = useState<OpenSquillaGatewayResult | null>(null);
  const [openSquillaGatewayBusyAction, setOpenSquillaGatewayBusyAction] = useState<OpenSquillaGatewayAction | null>(null);
  const [agentConfigImportingAppType, setAgentConfigImportingAppType] = useState<ExternalAgentProviderAppType | null>(null);
  const [openclawGlobalSyncing, setOpenClawGlobalSyncing] = useState(false);
  const [opencodeGlobalSyncing, setOpenCodeGlobalSyncing] = useState(false);
  const [qwenCodeGlobalSyncing, setQwenCodeGlobalSyncing] = useState(false);
  const [deepseekTuiGlobalSyncing, setDeepSeekTuiGlobalSyncing] = useState(false);
  const [agentCliInstallingAppType, setAgentCliInstallingAppType] = useState<ExternalAgentProviderAppType | null>(null);
  const [agentCliInstallProgress, setAgentCliInstallProgress] = useState<Record<ExternalAgentProviderAppType, string>>({
    claude: '',
    codex: '',
    hermes: '',
    openclaw: '',
    opencode: '',
    grok: '',
    qwen: '',
    deepseek_tui: '',
    opensquilla: '',
    kimi: '',
  });
  const [agentProviderLists, setAgentProviderLists] = useState<Partial<Record<ExternalAgentProviderAppType, ExternalAgentProviderListResult>>>({});
  const [agentProviderLoadingAppType, setAgentProviderLoadingAppType] = useState<ExternalAgentProviderAppType | null>(null);
  const [agentProviderSwitchingId, setAgentProviderSwitchingId] = useState<string | null>(null);
  const [claudeLiveConfig, setClaudeLiveConfig] = useState<ClaudeCodeLiveConfigSnapshot | null>(null);
  const [claudeLiveConfigLoading, setClaudeLiveConfigLoading] = useState(false);

  const selectedExternalAgentAppType = useMemo<ExternalAgentProviderAppType | null>(() => {
    if (coworkAgentEngine === CoworkAgentEngineValue.ClaudeCode) return 'claude';
    if (coworkAgentEngine === CoworkAgentEngineValue.Codex) return 'codex';
    if (coworkAgentEngine === CoworkAgentEngineValue.Hermes) return 'hermes';
    if (coworkAgentEngine === CoworkAgentEngineValue.OpenCode) return 'opencode';
    if (coworkAgentEngine === CoworkAgentEngineValue.QwenCode) return 'qwen';
    if (coworkAgentEngine === CoworkAgentEngineValue.DeepSeekTui) return 'deepseek_tui';
    if (coworkAgentEngine === CoworkAgentEngineValue.OpenSquilla) return 'opensquilla';
    if (coworkAgentEngine === CoworkAgentEngineValue.KimiCode) return 'kimi';
    return null;
  }, [coworkAgentEngine]);

  useEffect(() => {
    setCoworkAgentEngine(coworkConfig.agentEngine || CoworkAgentEngineValue.YdCowork);
    setOpenClawConfigSource(coworkConfig.openclawConfigSource ?? ExternalAgentConfigSourceValue.LocalCli);
    setClaudeCodeConfigSource(coworkConfig.claudeCodeConfigSource ?? ExternalAgentConfigSourceValue.LocalCli);
    setClaudeCodePermissionMode(coworkConfig.claudeCodePermissionMode ?? ClaudeCodePermissionModeValue.BypassPermissions);
    setCodexConfigSource(coworkConfig.codexConfigSource ?? ExternalAgentConfigSourceValue.LocalCli);
    setHermesConfigSource(coworkConfig.hermesConfigSource ?? ExternalAgentConfigSourceValue.WesightModel);
    setOpenCodeConfigSource(coworkConfig.opencodeConfigSource ?? ExternalAgentConfigSourceValue.WesightModel);
    setOpenCodePermissionMode(coworkConfig.opencodePermissionMode ?? OpenCodePermissionModeValue.Auto);
    setQwenCodeConfigSource(coworkConfig.qwenCodeConfigSource ?? ExternalAgentConfigSourceValue.WesightModel);
    setQwenCodePermissionMode(coworkConfig.qwenCodePermissionMode ?? QwenCodePermissionModeValue.Auto);
    setDeepSeekTuiConfigSource(coworkConfig.deepseekTuiConfigSource ?? ExternalAgentConfigSourceValue.WesightModel);
    setDeepSeekTuiPermissionMode(coworkConfig.deepseekTuiPermissionMode ?? DeepSeekTuiPermissionModeValue.Auto);
    setOpenSquillaConfigSource(coworkConfig.opensquillaConfigSource ?? ExternalAgentConfigSourceValue.LocalCli);
    setOpenSquillaPermissionMode(coworkConfig.opensquillaPermissionMode ?? OpenSquillaPermissionModeValue.Bypass);
    setKimiCodeConfigSource(coworkConfig.kimiCodeConfigSource ?? ExternalAgentConfigSourceValue.LocalCli);
    setKimiCodePermissionMode(coworkConfig.kimiCodePermissionMode ?? KimiCodePermissionModeValue.Auto);
    setCoworkMemoryEnabled(coworkConfig.memoryEnabled ?? true);
    setCoworkMemoryLlmJudgeEnabled(coworkConfig.memoryLlmJudgeEnabled ?? false);
  }, [
    coworkConfig.agentEngine,
    coworkConfig.openclawConfigSource,
    coworkConfig.claudeCodeConfigSource,
    coworkConfig.claudeCodePermissionMode,
    coworkConfig.codexConfigSource,
    coworkConfig.hermesConfigSource,
    coworkConfig.opencodeConfigSource,
    coworkConfig.opencodePermissionMode,
    coworkConfig.qwenCodeConfigSource,
    coworkConfig.qwenCodePermissionMode,
    coworkConfig.deepseekTuiConfigSource,
    coworkConfig.deepseekTuiPermissionMode,
    coworkConfig.opensquillaConfigSource,
    coworkConfig.opensquillaPermissionMode,
    coworkConfig.kimiCodeConfigSource,
    coworkConfig.kimiCodePermissionMode,
    coworkConfig.memoryEnabled,
    coworkConfig.memoryLlmJudgeEnabled,
  ]);

  useEffect(() => () => {
    if (emailCopiedTimerRef.current != null) {
      window.clearTimeout(emailCopiedTimerRef.current);
    }
    if (updateCheckTimerRef.current != null) {
      window.clearTimeout(updateCheckTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== SettingsTab.CoworkAgentEngine) return;
    let active = true;
    void measureSettingsIpc('cowork:agentEngine:snapshot', () => coworkService.getAgentEngineSnapshot()).then((snapshot) => {
      if (!active) return;
      setAgentEnvironmentSnapshot((previous) => (
        snapshot ? mergeAgentEnvironmentSnapshots(previous, snapshot) : previous
      ));
    });
    const unsubscribe = coworkService.onAgentEnginesChanged((snapshot) => {
      if (!active) return;
      setAgentEnvironmentSnapshot((previous) => mergeAgentEnvironmentSnapshots(previous, snapshot));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [activeTab, measureSettingsIpc]);

  useEffect(() => {
    const unsubscribe = coworkService.onAgentCliInstallProgress((progress: ExternalAgentCliInstallProgress) => {
      const message = progress.detail
        ? `${progress.message} ${progress.detail}`
        : progress.message;
      setAgentCliInstallProgress((prev) => ({
        ...prev,
        [progress.appType]: message,
      }));
      if (progress.phase === 'starting' || progress.phase === 'installing' || progress.phase === 'verifying') {
        setAgentCliInstallingAppType(progress.appType);
      }
      if (progress.phase === 'success' || progress.phase === 'error' || progress.phase === 'unsupported') {
        setAgentCliInstallingAppType((current) => (
          current === progress.appType ? null : current
        ));
        if (progress.phase === 'success') {
          void refreshAgentEnvironmentSnapshot({ forceRefresh: true, appTypes: [progress.appType] });
        }
      }
    });
    return unsubscribe;
  }, []);

  const loadAgentProviders = useCallback(async (appType: ExternalAgentProviderAppType) => {
    // WeSight keeps no provider records for Claude Code; its panel reads the
    // machine's live config instead.
    if (appType === 'claude') return { success: true } as ExternalAgentProviderListResult;
    setAgentProviderLoadingAppType(appType);
    try {
      const result = await measureSettingsIpc(`cowork:agentProviders:list:${appType}`, () => coworkService.listAgentProviders(appType));
      if (result.success) {
        setAgentProviderLists((prev) => ({
          ...prev,
          [appType]: result,
        }));
      }
      return result;
    } finally {
      setAgentProviderLoadingAppType((current) => (current === appType ? null : current));
    }
  }, [measureSettingsIpc]);

  const loadClaudeLiveConfig = useCallback(async () => {
    setClaudeLiveConfigLoading(true);
    try {
      const result = await measureSettingsIpc(
        'cowork:claudeCodeLiveConfig:get',
        () => coworkService.getClaudeCodeLiveConfig(),
      );
      setClaudeLiveConfig(result.success ? result.snapshot ?? null : null);
    } finally {
      setClaudeLiveConfigLoading(false);
    }
  }, [measureSettingsIpc]);

  useEffect(() => {
    if (activeTab !== SettingsTab.CoworkAgentEngine || !selectedExternalAgentAppType) return;
    void refreshAgentEnvironmentSnapshot({ forceRefresh: true, appTypes: [selectedExternalAgentAppType] });
    void loadAgentProviders(selectedExternalAgentAppType);
  }, [activeTab, loadAgentProviders, selectedExternalAgentAppType]);

  useEffect(() => {
    if (activeTab !== SettingsTab.General) return;
    let active = true;
    void measureSettingsIpc('cowork:startupServices:status', () => coworkService.getStartupServicesStatus()).then((services) => {
      if (!active) return;
      setStartupServices(services);
    });
    const unsubscribe = coworkService.onStartupServicesChanged((services) => {
      if (!active) return;
      setStartupServices(services);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [activeTab, measureSettingsIpc]);

  useEffect(() => {
    if (
      activeTab !== SettingsTab.CoworkAgentEngine
      || (coworkAgentEngine !== CoworkAgentEngineValue.OpenClaw
        && expandedCoworkAgentEngine !== CoworkAgentEngineValue.OpenClaw)
    ) return;
    let active = true;
    void measureSettingsIpc('openclaw:engine:status', () => coworkService.getOpenClawEngineStatus()).then((status) => {
      if (!active || !status) return;
      setOpenClawEngineStatus(status);
    });
    const unsubscribe = coworkService.onOpenClawEngineStatus((status) => {
      if (!active) return;
      setOpenClawEngineStatus(status);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [activeTab, coworkAgentEngine, expandedCoworkAgentEngine, measureSettingsIpc]);

  useEffect(() => {
    if (
      activeTab !== SettingsTab.CoworkAgentEngine
      || (coworkAgentEngine !== CoworkAgentEngineValue.Hermes
        && expandedCoworkAgentEngine !== CoworkAgentEngineValue.Hermes)
    ) return;
    let active = true;
    void measureSettingsIpc('hermes:engine:status', () => coworkService.getHermesEngineStatus()).then((status) => {
      if (!active || !status) return;
      setHermesEngineStatus(status);
    });
    const unsubscribe = coworkService.onHermesEngineStatus((status) => {
      if (!active) return;
      setHermesEngineStatus(status);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [activeTab, coworkAgentEngine, expandedCoworkAgentEngine, measureSettingsIpc]);

  useEffect(() => {
    try {
      const config = configService.getConfig();
      
      // Set general settings
      initialLanguageRef.current = config.language;
      const savedPetConfig = normalizePetConfig(config.pet);
      initialPetConfigRef.current = savedPetConfig;
      setTheme(config.theme);
      setLanguage(config.language);
      setUseSystemProxy(config.useSystemProxy ?? false);
      setPetEnabled(savedPetConfig.enabled);
      setPetVariant(savedPetConfig.variant);
      setPetMotion(savedPetConfig.motion);
      setPetVoice(savedPetConfig.voice);
      const savedTestMode = config.app?.testMode ?? false;
      setTestMode(savedTestMode);
      if (savedTestMode) setTestModeUnlocked(true);

      // Load auto-launch setting
      measureSettingsIpc('autoLaunch:get', () => window.electron.autoLaunch.get()).then(({ enabled }) => {
        setAutoLaunchState(enabled);
      }).catch(err => {
        console.error('Failed to load auto-launch setting:', err);
      });

      // Load prevent-sleep setting
      measureSettingsIpc('preventSleep:get', () => window.electron.preventSleep.get()).then(({ enabled }) => {
        setPreventSleepState(enabled);
      }).catch(err => {
        console.error('Failed to load prevent-sleep setting:', err);
      });

      // Set up providers based on saved config
      if (config.api) {
        // For backward compatibility with older config
        // Initialize active provider based on baseUrl
        const normalizedApiBaseUrl = config.api.baseUrl.toLowerCase();
        if (normalizedApiBaseUrl.includes('openai')) {
          setActiveProvider('openai');
          setProviders(prev => ({
            ...prev,
            openai: {
              ...prev.openai,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('deepseek')) {
          setActiveProvider('deepseek');
          setProviders(prev => ({
            ...prev,
            deepseek: {
              ...prev.deepseek,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('moonshot.ai') || normalizedApiBaseUrl.includes('moonshot.cn')) {
          setActiveProvider('moonshot');
          setProviders(prev => ({
            ...prev,
            moonshot: {
              ...prev.moonshot,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('bigmodel.cn')) {
          setActiveProvider('zhipu');
          setProviders(prev => ({
            ...prev,
            zhipu: {
              ...prev.zhipu,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('minimax')) {
          setActiveProvider('minimax');
          setProviders(prev => ({
            ...prev,
            minimax: {
              ...prev.minimax,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('openapi.youdao.com')) {
          setActiveProvider('youdaozhiyun');
          setProviders(prev => ({
            ...prev,
            youdaozhiyun: {
              ...prev.youdaozhiyun,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('dashscope')) {
          setActiveProvider('qwen');
          setProviders(prev => ({
            ...prev,
            qwen: {
              ...prev.qwen,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('stepfun')) {
          setActiveProvider('stepfun');
          setProviders(prev => ({
            ...prev,
            stepfun: {
              ...prev.stepfun,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('openrouter.ai')) {
          setActiveProvider('openrouter');
          setProviders(prev => ({
            ...prev,
            openrouter: {
              ...prev.openrouter,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('requesty.ai')) {
          setActiveProvider('requesty');
          setProviders(prev => ({
            ...prev,
            requesty: {
              ...prev.requesty,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('googleapis')) {
          setActiveProvider('gemini');
          setProviders(prev => ({
            ...prev,
            gemini: {
              ...prev.gemini,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('anthropic')) {
          setActiveProvider('anthropic');
          setProviders(prev => ({
            ...prev,
            anthropic: {
              ...prev.anthropic,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        } else if (normalizedApiBaseUrl.includes('ollama') || normalizedApiBaseUrl.includes('11434')) {
          setActiveProvider('ollama');
          setProviders(prev => ({
            ...prev,
            ollama: {
              ...prev.ollama,
              enabled: true,
              apiKey: config.api.key,
              baseUrl: config.api.baseUrl
            }
          }));
        }
      }
      
      // Load provider-specific configurations if available
      // 合并已保存的配置和默认配置，确保新添加的 provider 能被显示
      if (config.providers) {
        setProviders(prev => {
          const merged = {
            ...prev,  // 保留默认的 providers（包括新添加的 anthropic）
            ...config.providers,  // 覆盖已保存的配置
          };

          // After merging, find the first enabled provider to set as activeProvider
          // This ensures we don't use stale activeProvider from old config.api.baseUrl
          const firstEnabledProvider = providerKeys.find(providerKey => merged[providerKey]?.enabled);
          if (firstEnabledProvider) {
            setActiveProvider(firstEnabledProvider);
          }

          return Object.fromEntries(
            Object.entries(merged).map(([providerKey, providerConfig]) => {
              const models = providerConfig.models?.map((model, idx) => {
                let id = model.id;
                // Fix corrupted model IDs from previous OAuth mutation bug
                if (providerKey === 'qwen' && (id === 'vision-model' || id === 'coder-model')) {
                  const defaultModel = defaultConfig.providers?.qwen?.models?.[idx];
                  id = defaultModel?.id || (model.supportsImage ? 'qwen3.5-plus' : 'qwen3-coder-plus');
                }
                return {
                  ...model,
                  id,
                  supportsImage: model.supportsImage ?? false,
                };
              });
              return [
                providerKey,
                {
                  ...providerConfig,
                  apiFormat: getEffectiveApiFormat(providerKey, (providerConfig as ProviderConfig).apiFormat),
                  models,
                },
              ];
            })
          ) as ProvidersConfig;
        });
      }
      
      // 加载快捷键设置
      if (config.shortcuts) {
        setShortcuts(prev => ({
          ...prev,
          ...config.shortcuts,
        }));
      }
    } catch {
      setError('Failed to load settings');
    }
  }, [measureSettingsIpc]);

  useEffect(() => {
    const initialPetConfig = initialPetConfigRef.current;
    const initialLanguage = initialLanguageRef.current;
    return () => {
      if (didSaveRef.current) {
        return;
      }
      void window.electron.desktopPet.applyPreview(initialPetConfig);
      i18nService.setLanguage(initialLanguage, { persist: false });
    };
  }, []);

  // 监听标签页切换，确保内容区域滚动到顶部
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  useEffect(() => {
    setNoticeMessage(buildNoticeMessage());
  }, [buildNoticeMessage]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Subscribe to language changes
  useEffect(() => {
    const unsubscribe = i18nService.subscribe(() => {
      setLanguage(i18nService.getLanguage());
      // Re-translate notice message on language change
      if (noticeI18nKey) {
        const base = i18nService.t(noticeI18nKey);
        setNoticeMessage(noticeExtra ? `${base} (${noticeExtra})` : base);
      }
    });
    return unsubscribe;
  }, [noticeI18nKey, noticeExtra]);

  // Compute visible providers based on language, including active custom_N entries
  const visibleProviders = useMemo(() => {
    const visibleKeys = getVisibleProviders(language);
    const filtered: Partial<ProvidersConfig> = {};
    for (const key of visibleKeys) {
      if (providers[key as keyof ProvidersConfig]) {
        filtered[key as keyof ProvidersConfig] = providers[key as keyof ProvidersConfig];
      }
    }
    // Append custom_N providers that exist in state, sorted by numeric suffix
    for (const key of CUSTOM_PROVIDER_KEYS) {
      if (providers[key]) {
        filtered[key] = providers[key];
      }
    }
    return filtered as ProvidersConfig;
  }, [language, providers]);

  // Ensure activeProvider is always in visibleProviders when language changes
  useEffect(() => {
    const visibleKeys = Object.keys(visibleProviders) as ProviderType[];
    if (visibleKeys.length > 0 && !visibleKeys.includes(activeProvider)) {
      // If current activeProvider is not visible, switch to first visible provider
      const firstEnabledVisible = visibleKeys.find(key => visibleProviders[key]?.enabled);
      setActiveProvider(firstEnabledVisible ?? visibleKeys[0]);
    }
  }, [visibleProviders, activeProvider]);

  // Handle adding a new custom provider
  const handleAddCustomProvider = () => {
    // Find the first unused custom slot
    const usedKeys = new Set(Object.keys(providers));
    const newKey = CUSTOM_PROVIDER_KEYS.find(k => !usedKeys.has(k));
    if (!newKey) return; // All 10 slots used
    setProviders(prev => ({
      ...prev,
      [newKey]: {
        enabled: false,
        apiKey: '',
        baseUrl: '',
        apiFormat: 'openai' as const,
        models: [],
        displayName: undefined,
      },
    }));
    setActiveProvider(newKey);
    setShowApiKey(false);
    setIsAddingModel(false);
    setIsEditingModel(false);
    setEditingModelId(null);
    setNewModelName('');
    setNewModelId('');
    setNewModelSupportsImage(false);
    setModelFormError(null);
  };

  // Handle deleting a custom provider
  const handleDeleteCustomProvider = (key: ProviderType) => {
    setPendingDeleteProvider(key);
  };

  const confirmDeleteCustomProvider = () => {
    const key = pendingDeleteProvider;
    if (!key) return;
    setPendingDeleteProvider(null);
    setProviders(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    // Persist the deletion immediately so it survives window close
    const currentConfig = configService.getConfig();
    const updatedProviders = { ...currentConfig.providers };
    delete updatedProviders[key];
    configService.updateConfig({ providers: updatedProviders as AppConfig['providers'] });
    // If the deleted provider was active, switch to first visible
    if (activeProvider === key) {
      const visibleKeys = Object.keys(visibleProviders).filter(k => k !== key) as ProviderType[];
      const firstEnabled = visibleKeys.find(k => visibleProviders[k]?.enabled);
      setActiveProvider(firstEnabled ?? visibleKeys[0] ?? providerKeys[0]);
    }
  };

  // Handle provider change
  const handleProviderChange = (provider: ProviderType) => {
    setIsAddingModel(false);
    setIsEditingModel(false);
    setEditingModelId(null);
    setNewModelName('');
    setNewModelId('');
    setNewModelSupportsImage(false);
    setModelFormError(null);
    setActiveProvider(provider);
    // 切换 provider 时清除测试结果
    setIsTestResultModalOpen(false);
    setTestResult(null);
  };

  // Handle provider configuration change
  const handleProviderConfigChange = (provider: ProviderType, field: string, value: string) => {
    setProviders(prev => {
      if (field === 'apiFormat') {
        const nextApiFormat = getEffectiveApiFormat(provider, value);
        const nextProviderConfig: ProviderConfig = {
          ...prev[provider],
          apiFormat: nextApiFormat,
        };

        // Only auto-switch URL when current value is still a known default URL.
        if (shouldAutoSwitchProviderBaseUrl(provider, prev[provider].baseUrl)) {
          const defaultBaseUrl = getProviderDefaultBaseUrl(provider, nextApiFormat);
          if (defaultBaseUrl) {
            nextProviderConfig.baseUrl = defaultBaseUrl;
          }
        }

        return {
          ...prev,
          [provider]: nextProviderConfig,
        };
      }

      // Handle codingPlanEnabled toggle for all supported providers
      if (field === 'codingPlanEnabled') {
        const def = ProviderRegistry.get(provider);
        if (def?.codingPlanSupported) {
          const enabled = value === 'true';
          const nextModels = enabled && def.codingPlanModels
            ? def.codingPlanModels.map(m => ({ ...m }))
            : def.defaultModels.map(m => ({ ...m }));
          return {
            ...prev,
            [provider]: {
              ...prev[provider],
              codingPlanEnabled: enabled,
              models: nextModels,
            },
          };
        }
      }

      return {
        ...prev,
        [provider]: {
          ...prev[provider],
          [field]: value,
        },
      };
    });
  };

  const handleMiniMaxDeviceLogin = async (region: MiniMaxRegion) => {
    minimaxOAuthCancelRef.current = false;
    setMinimaxOAuthPhase({ kind: 'requesting_code' });

    const codeEndpoint = region === 'cn' ? MINIMAX_CODE_ENDPOINT_CN : MINIMAX_CODE_ENDPOINT_GLOBAL;
    const tokenEndpoint = region === 'cn' ? MINIMAX_TOKEN_ENDPOINT_CN : MINIMAX_TOKEN_ENDPOINT_GLOBAL;
    const defaultBaseUrl = region === 'cn' ? MINIMAX_BASE_URL_CN : MINIMAX_BASE_URL_GLOBAL;

    try {
      const { verifier, challenge, state } = await generateMiniMaxPkce();

      const codeBody = [
        'response_type=code',
        `client_id=${encodeURIComponent(MINIMAX_OAUTH_CLIENT_ID)}`,
        `scope=${encodeURIComponent(MINIMAX_OAUTH_SCOPE)}`,
        `code_challenge=${encodeURIComponent(challenge)}`,
        'code_challenge_method=S256',
        `state=${encodeURIComponent(state)}`,
      ].join('&');

      const codeRes = await window.electron.api.fetch({
        url: codeEndpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: codeBody,
      });

      if (!codeRes.ok) {
        throw new Error(`MiniMax OAuth authorization failed: ${codeRes.status}`);
      }

      const codePayload = (codeRes.data ?? {}) as {
        user_code?: string;
        verification_uri?: string;
        expired_in?: number;
        interval?: number;
        state?: string;
        error?: string;
      };

      if (!codePayload.user_code || !codePayload.verification_uri) {
        throw new Error(codePayload.error ?? 'MiniMax OAuth returned incomplete authorization payload');
      }

      if (codePayload.state !== state) {
        throw new Error('MiniMax OAuth state mismatch: possible CSRF attack or session corruption');
      }

      try {
        await window.electron.shell.openExternal(codePayload.verification_uri);
      } catch { /* ignore: user can open manually */ }

      setMinimaxOAuthPhase({
        kind: 'pending',
        userCode: codePayload.user_code,
        verificationUri: codePayload.verification_uri,
      });

      let pollIntervalMs = codePayload.interval ?? 2000;
      const expireTimeMs = codePayload.expired_in ?? (Date.now() + 5 * 60 * 1000);

      while (Date.now() < expireTimeMs) {
        if (minimaxOAuthCancelRef.current) {
          setMinimaxOAuthPhase({ kind: 'idle' });
          return;
        }

        await new Promise(r => setTimeout(r, pollIntervalMs));

        if (minimaxOAuthCancelRef.current) {
          setMinimaxOAuthPhase({ kind: 'idle' });
          return;
        }

        const tokenBody = [
          `grant_type=${encodeURIComponent(MINIMAX_OAUTH_GRANT_TYPE)}`,
          `client_id=${encodeURIComponent(MINIMAX_OAUTH_CLIENT_ID)}`,
          `user_code=${encodeURIComponent(codePayload.user_code)}`,
          `code_verifier=${encodeURIComponent(verifier)}`,
        ].join('&');

        const tokenRes = await window.electron.api.fetch({
          url: tokenEndpoint,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: tokenBody,
        });

        const tokenPayload = (tokenRes.data ?? {}) as {
          status?: string;
          access_token?: string;
          refresh_token?: string;
          expired_in?: number;
          resource_url?: string;
          notification_message?: string;
          base_resp?: { status_code?: number; status_msg?: string };
        };

        if (tokenPayload.status === 'error') {
          throw new Error(tokenPayload.base_resp?.status_msg ?? 'MiniMax OAuth error');
        }

        if (tokenPayload.status === 'success') {
          if (!tokenPayload.access_token || !tokenPayload.refresh_token) {
            throw new Error('MiniMax OAuth returned incomplete token payload');
          }

          let baseUrl = (tokenPayload.resource_url ?? '').trim();
          if (baseUrl && !baseUrl.startsWith('http')) {
            baseUrl = `https://${baseUrl}`;
          }
          if (!baseUrl) {
            baseUrl = defaultBaseUrl;
          }

          setProviders(prev => ({
            ...prev,
            minimax: {
              ...prev.minimax,
              enabled: true,
              apiKey: tokenPayload.access_token!,
              baseUrl,
              apiFormat: 'anthropic',
              authType: 'oauth',
              oauthRefreshToken: tokenPayload.refresh_token,
              oauthTokenExpiresAt: tokenPayload.expired_in,
              models: [...(defaultConfig.providers?.minimax.models ?? [])],
            },
          }));

          setMinimaxOAuthPhase({ kind: 'success' });
          setTimeout(() => setMinimaxOAuthPhase({ kind: 'idle' }), 1500);
          return;
        }

        // Still pending — back off gradually
        pollIntervalMs = Math.min(pollIntervalMs * 1.5, 10000);
      }

      throw new Error('MiniMax OAuth timed out waiting for authorization');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMinimaxOAuthPhase({ kind: 'error', message });
    }
  };

  const handleCancelMiniMaxLogin = () => {
    minimaxOAuthCancelRef.current = true;
    setMinimaxOAuthPhase({ kind: 'idle' });
  };

  const handleMiniMaxOAuthLogout = () => {
    setProviders(prev => ({
      ...prev,
      minimax: {
        ...prev.minimax,
        apiKey: '',
        oauthRefreshToken: undefined,
        oauthTokenExpiresAt: undefined,
      },
    }));
    setMinimaxOAuthPhase({ kind: 'idle' });
  };

  const hasCoworkConfigChanges = coworkAgentEngine !== coworkConfig.agentEngine
    || openclawConfigSource !== coworkConfig.openclawConfigSource
    || claudeCodeConfigSource !== coworkConfig.claudeCodeConfigSource
    || claudeCodePermissionMode !== coworkConfig.claudeCodePermissionMode
    || codexConfigSource !== coworkConfig.codexConfigSource
    || hermesConfigSource !== coworkConfig.hermesConfigSource
    || opencodeConfigSource !== coworkConfig.opencodeConfigSource
    || opencodePermissionMode !== coworkConfig.opencodePermissionMode
    || qwenCodeConfigSource !== coworkConfig.qwenCodeConfigSource
    || qwenCodePermissionMode !== coworkConfig.qwenCodePermissionMode
    || deepseekTuiConfigSource !== coworkConfig.deepseekTuiConfigSource
    || deepseekTuiPermissionMode !== coworkConfig.deepseekTuiPermissionMode
    || opensquillaConfigSource !== coworkConfig.opensquillaConfigSource
    || opensquillaPermissionMode !== coworkConfig.opensquillaPermissionMode
    || kimiCodeConfigSource !== coworkConfig.kimiCodeConfigSource
    || kimiCodePermissionMode !== coworkConfig.kimiCodePermissionMode
    || coworkMemoryEnabled !== coworkConfig.memoryEnabled
    || coworkMemoryLlmJudgeEnabled !== coworkConfig.memoryLlmJudgeEnabled;
  const hasCoworkAgentEngineApplyChanges = coworkAgentEngine !== coworkConfig.agentEngine
    || (coworkAgentEngine === CoworkAgentEngineValue.OpenClaw
      && openclawConfigSource !== coworkConfig.openclawConfigSource)
    || (coworkAgentEngine === CoworkAgentEngineValue.ClaudeCode
      && (claudeCodeConfigSource !== coworkConfig.claudeCodeConfigSource
        || claudeCodePermissionMode !== coworkConfig.claudeCodePermissionMode))
    || (coworkAgentEngine === CoworkAgentEngineValue.Codex
      && codexConfigSource !== coworkConfig.codexConfigSource)
    || (coworkAgentEngine === CoworkAgentEngineValue.Hermes
      && hermesConfigSource !== coworkConfig.hermesConfigSource)
    || (coworkAgentEngine === CoworkAgentEngineValue.OpenCode
      && (opencodeConfigSource !== coworkConfig.opencodeConfigSource
        || opencodePermissionMode !== coworkConfig.opencodePermissionMode))
    || (coworkAgentEngine === CoworkAgentEngineValue.QwenCode
      && (qwenCodeConfigSource !== coworkConfig.qwenCodeConfigSource
        || qwenCodePermissionMode !== coworkConfig.qwenCodePermissionMode))
    || (coworkAgentEngine === CoworkAgentEngineValue.DeepSeekTui
      && (deepseekTuiConfigSource !== coworkConfig.deepseekTuiConfigSource
        || deepseekTuiPermissionMode !== coworkConfig.deepseekTuiPermissionMode))
    || (coworkAgentEngine === CoworkAgentEngineValue.OpenSquilla
      && (opensquillaConfigSource !== coworkConfig.opensquillaConfigSource
        || opensquillaPermissionMode !== coworkConfig.opensquillaPermissionMode))
    || (coworkAgentEngine === CoworkAgentEngineValue.KimiCode
      && (kimiCodeConfigSource !== coworkConfig.kimiCodeConfigSource
        || kimiCodePermissionMode !== coworkConfig.kimiCodePermissionMode));
  const isCoworkAgentConfigApplying = isSaving
    && activeTab === SettingsTab.CoworkAgentEngine
    && hasCoworkAgentEngineApplyChanges;

  const openClawProgressPercent = useMemo(() => {
    if (typeof openClawEngineStatus?.progressPercent !== 'number' || !Number.isFinite(openClawEngineStatus.progressPercent)) {
      return null;
    }
    return Math.max(0, Math.min(100, Math.round(openClawEngineStatus.progressPercent)));
  }, [openClawEngineStatus]);

  const hermesProgressPercent = useMemo(() => {
    if (typeof hermesEngineStatus?.progressPercent !== 'number' || !Number.isFinite(hermesEngineStatus.progressPercent)) {
      return null;
    }
    return Math.max(0, Math.min(100, Math.round(hermesEngineStatus.progressPercent)));
  }, [hermesEngineStatus]);

  const resolveOpenClawStatusText = (status: OpenClawEngineStatus | null): string => {
    if (!status) {
      return i18nService.t('coworkOpenClawNotInstalledNotice');
    }
    if ((status.phase === 'installing' || status.phase === 'error') && status.message?.trim()) {
      return status.message.trim();
    }
    switch (status.phase) {
      case 'not_installed':
        return i18nService.t('coworkOpenClawNotInstalledNotice');
      case 'installing':
        return i18nService.t('coworkOpenClawInstalling');
      case 'ready':
        return i18nService.t('coworkOpenClawReadyNotice');
      case 'starting':
        return i18nService.t('coworkOpenClawStarting');
      case 'error':
        return i18nService.t('coworkOpenClawError');
      case 'running':
      default:
        return i18nService.t('coworkOpenClawRunning');
    }
  };

  const resolveHermesStatusText = (status: HermesEngineStatus | null): string => {
    if (!status) {
      return i18nService.t('coworkHermesNotInstalledNotice');
    }
    if (status.message?.trim()) {
      return status.message.trim();
    }
    switch (status.phase) {
      case 'not_installed':
        return i18nService.t('coworkHermesNotInstalledNotice');
      case 'installing':
        return i18nService.t('coworkHermesInstalling');
      case 'ready':
        return i18nService.t('coworkHermesReadyNotice');
      case 'starting':
        return i18nService.t('coworkHermesStarting');
      case 'error':
        return i18nService.t('coworkHermesError');
      case 'running':
      default:
        return i18nService.t('coworkHermesRunning');
    }
  };

  const loadCoworkMemoryData = useCallback(async () => {
    setCoworkMemoryListLoading(true);
    try {
      const [entries, stats] = await Promise.all([
        coworkService.listMemoryEntries({
          query: coworkMemoryQuery.trim() || undefined,
        }),
        coworkService.getMemoryStats(),
      ]);
      setCoworkMemoryEntries(entries);
      setCoworkMemoryStats(stats);
    } catch (loadError) {
      console.error('Failed to load cowork memory data:', loadError);
      setCoworkMemoryEntries([]);
      setCoworkMemoryStats(null);
    } finally {
      setCoworkMemoryListLoading(false);
    }
  }, [
    coworkMemoryQuery,
  ]);

  useEffect(() => {
    if (activeTab !== SettingsTab.CoworkMemory) return;
    void loadCoworkMemoryData();
  }, [activeTab, loadCoworkMemoryData]);

  /**
   * Detect OpenClaw default template content and return empty string.
   * Templates contain YAML frontmatter and specific marker phrases.
   */
  const stripDefaultTemplate = (content: string): string => {
    if (!content.trim()) return '';
    const TEMPLATE_MARKERS = [
      'Fill this in during your first conversation',
      "You're not a chatbot. You're becoming someone",
      'Learn about the person you\'re helping',
    ];
    if (TEMPLATE_MARKERS.some((m) => content.includes(m))) return '';
    return content;
  };

  useEffect(() => {
    if (activeTab !== SettingsTab.CoworkAgent) return;
    if (!bootstrapLoaded) {
      void (async () => {
        const [identity, user, soul] = await Promise.all([
          coworkService.readBootstrapFile('IDENTITY.md'),
          coworkService.readBootstrapFile('USER.md'),
          coworkService.readBootstrapFile('SOUL.md'),
        ]);
        setBootstrapIdentity(stripDefaultTemplate(identity));
        setBootstrapUser(stripDefaultTemplate(user));
        setBootstrapSoul(stripDefaultTemplate(soul));
        setBootstrapLoaded(true);
      })();
    }
  }, [activeTab, bootstrapLoaded]);

  const resetCoworkMemoryEditor = () => {
    setCoworkMemoryEditingId(null);
    setCoworkMemoryDraftText('');
    setShowMemoryModal(false);
  };

  const handleSaveCoworkMemoryEntry = async () => {
    const text = coworkMemoryDraftText.trim();
    if (!text) return;

    setCoworkMemoryListLoading(true);
    try {
      if (coworkMemoryEditingId) {
        await coworkService.updateMemoryEntry({
          id: coworkMemoryEditingId,
          text,
        });
      } else {
        await coworkService.createMemoryEntry({
          text,
        });
      }
      resetCoworkMemoryEditor();
      await loadCoworkMemoryData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : i18nService.t('coworkMemoryCrudSaveFailed'));
    } finally {
      setCoworkMemoryListLoading(false);
    }
  };

  const handleEditCoworkMemoryEntry = (entry: CoworkUserMemoryEntry) => {
    setCoworkMemoryEditingId(entry.id);
    setCoworkMemoryDraftText(entry.text);
    setShowMemoryModal(true);
  };

  const handleDeleteCoworkMemoryEntry = async (entry: CoworkUserMemoryEntry) => {
    setCoworkMemoryListLoading(true);
    try {
      await coworkService.deleteMemoryEntry({ id: entry.id });
      if (coworkMemoryEditingId === entry.id) {
        resetCoworkMemoryEditor();
      }
      await loadCoworkMemoryData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : i18nService.t('coworkMemoryCrudDeleteFailed'));
    } finally {
      setCoworkMemoryListLoading(false);
    }
  };

  const handleOpenCoworkMemoryModal = () => {
    resetCoworkMemoryEditor();
    setShowMemoryModal(true);
  };

  // Toggle provider enabled status
  const toggleProviderEnabled = (provider: ProviderType) => {
    const providerConfig = providers[provider];
    const isEnabling = !providerConfig.enabled;
    const missingApiKey = providerRequiresApiKey(provider) && !providerConfig.apiKey.trim();

    if (isEnabling && missingApiKey) {
      setError(i18nService.t('apiKeyRequired'));
      return;
    }

    // GitHub Copilot requires device code auth — redirect to sign-in flow
    if (provider === 'github-copilot' && isEnabling && !providerConfig.apiKey.trim()) {
      handleCopilotSignIn();
      return;
    }

    setProviders(prev => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        enabled: !prev[provider].enabled
      }
    }));
  };

  const enableProvider = (provider: ProviderType) => {
    setProviders(prev => {
      if (prev[provider].enabled) {
        return prev;
      }

      return {
        ...prev,
        [provider]: {
          ...prev[provider],
          enabled: true,
        },
      };
    });
  };

  // GitHub Copilot device code authentication
  const handleCopilotSignIn = async () => {
    try {
      setCopilotAuthStatus('requesting');
      setCopilotError(null);

      // Step 1: Request device code
      const { userCode, verificationUri, deviceCode, interval, expiresIn } =
        await window.electron.githubCopilot.requestDeviceCode();

      setCopilotUserCode(userCode);
      setCopilotVerificationUri(verificationUri);
      setCopilotAuthStatus('awaiting_user');

      // Open verification URL in browser
      await window.electron.shell.openExternal(verificationUri);

      // Step 2: Poll for token
      setCopilotAuthStatus('polling');
      const result = await window.electron.githubCopilot.pollForToken(deviceCode, interval, expiresIn);

      if (result.success && result.token) {
        setCopilotGithubUser(result.githubUser || '');
        setCopilotAuthStatus('authenticated');

        // Store the Copilot API token in the provider's apiKey field
        handleProviderConfigChange('github-copilot', 'apiKey', result.token);
        if (result.baseUrl) {
          handleProviderConfigChange('github-copilot', 'baseUrl', result.baseUrl);
        }
        // Auto-enable the provider
        enableProvider('github-copilot');
      } else {
        setCopilotError(result.error || 'Authentication failed');
        setCopilotAuthStatus('error');
      }
    } catch (error: unknown) {
      setCopilotError(error instanceof Error ? error.message : 'Authentication failed');
      setCopilotAuthStatus('error');
    }
  };

  const handleCopilotSignOut = async () => {
    try {
      await window.electron.githubCopilot.signOut();
      setCopilotAuthStatus('idle');
      setCopilotGithubUser('');
      setCopilotUserCode('');
      setCopilotError(null);
      // Clear the token from provider config
      handleProviderConfigChange('github-copilot', 'apiKey', '');
      // Disable the provider
      setProviders(prev => ({
        ...prev,
        'github-copilot': { ...prev['github-copilot'], enabled: false },
      }));
    } catch (error) {
      console.error('[Settings] GitHub Copilot sign-out failed:', error);
    }
  };

  const handleCopilotCancelAuth = async () => {
    try {
      await window.electron.githubCopilot.cancelPolling();
      setCopilotAuthStatus('idle');
      setCopilotUserCode('');
      setCopilotError(null);
    } catch (error) {
      console.error('[Settings] GitHub Copilot cancel polling failed:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const normalizedProviders = Object.fromEntries(
        Object.entries(providers).map(([providerKey, providerConfig]) => {
          const apiFormat = getEffectiveApiFormat(providerKey, providerConfig.apiFormat);
          return [
            providerKey,
            {
              ...providerConfig,
              apiFormat,
              baseUrl: resolveBaseUrl(providerKey as ProviderType, providerConfig.baseUrl, apiFormat),
            },
          ];
        })
      ) as ProvidersConfig;

      // Find the first enabled provider to use as the primary API
      const firstEnabledProvider = Object.entries(normalizedProviders).find(
        ([_, config]) => config.enabled
      );

      const primaryProvider = firstEnabledProvider
        ? firstEnabledProvider[1]
        : normalizedProviders[activeProvider];

      const currentSavedPetConfig = normalizePetConfig(configService.getConfig().pet);

      await configService.updateConfig({
        api: {
          key: primaryProvider.apiKey,
          baseUrl: primaryProvider.baseUrl,
        },
        ...(tokenDanceDefault && normalizedProviders[TokenDance.Provider]?.enabled
          && normalizedProviders[TokenDance.Provider].models?.some(model => model.id === tokenDanceDefault)
          ? { model: { ...configService.getConfig().model, defaultModel: tokenDanceDefault, defaultModelProvider: TokenDance.Provider } }
          : {}),
        providers: normalizedProviders, // Save all providers configuration
        language,
        useSystemProxy,
        pet: {
          ...currentSavedPetConfig,
          enabled: petEnabled,
          variant: petVariant,
          motion: petMotion,
          voice: normalizePetVoiceConfig(petVoice),
        },
        shortcuts,
        app: {
          ...configService.getConfig().app,
          testMode,
        },
      });

      // 应用语言
      i18nService.setLanguage(language, { persist: false });

      // Set API with the primary provider - handle Qwen OAuth
      let apiKeyToUse = primaryProvider.apiKey;
      let baseUrlToUse = primaryProvider.baseUrl;

      // For Qwen provider, check if OAuth should be used
      if (firstEnabledProvider && firstEnabledProvider[0] === 'qwen') {
        const qwenConfig = firstEnabledProvider[1] as ProviderConfig;
        if (!qwenConfig.apiKey && qwenConfig.oauthCredentials) {
          // Use OAuth token as API key placeholder
          apiKeyToUse = 'qwen-oauth';
          baseUrlToUse = qwenConfig.oauthCredentials.resourceUrl || qwenConfig.baseUrl;
        }
      }

      apiService.setConfig({
        apiKey: apiKeyToUse,
        baseUrl: baseUrlToUse,
      });

      // 更新 Redux store 中的可用模型列表
      const allModels: { id: string; name: string; provider?: string; providerKey?: string; supportsImage?: boolean }[] = [];
      Object.entries(normalizedProviders).forEach(([providerName, config]) => {
        if (config.enabled && config.models) {
          config.models.forEach(model => {
            allModels.push({
              id: model.id,
              name: model.name,
              provider: getProviderDisplayName(providerName, config),
              providerKey: providerName,
              supportsImage: model.supportsImage ?? false,
            });
          });
        }
      });
      dispatch(setAvailableModels(allModels));
      if (tokenDanceDefault) {
        const selected = allModels.find(model => model.providerKey === TokenDance.Provider && model.id === tokenDanceDefault);
        if (selected) dispatch(setSelectedModel(selected));
      }

      if (hasCoworkConfigChanges) {
        const updated = await coworkService.updateConfig({
          agentEngine: coworkAgentEngine,
          openclawConfigSource,
          claudeCodeConfigSource,
          claudeCodePermissionMode,
          codexConfigSource,
          hermesConfigSource,
          opencodeConfigSource,
          opencodePermissionMode,
          qwenCodeConfigSource,
          qwenCodePermissionMode,
          deepseekTuiConfigSource,
          deepseekTuiPermissionMode,
          opensquillaConfigSource,
          opensquillaPermissionMode,
          kimiCodeConfigSource,
          kimiCodePermissionMode,
          memoryEnabled: coworkMemoryEnabled,
          memoryLlmJudgeEnabled: coworkMemoryLlmJudgeEnabled,
        });
        if (!updated) {
          throw new Error(i18nService.t('coworkConfigSaveFailed'));
        }
      }

      // Save bootstrap files (IDENTITY.md, USER.md, SOUL.md) only if loaded
      if (bootstrapLoaded) {
        const results = await Promise.all([
          coworkService.writeBootstrapFile('IDENTITY.md', bootstrapIdentity),
          coworkService.writeBootstrapFile('USER.md', bootstrapUser),
          coworkService.writeBootstrapFile('SOUL.md', bootstrapSoul),
        ]);
        if (results.some(r => !r)) {
          throw new Error(i18nService.t('coworkBootstrapSaveFailed'));
        }
      }

      // Sync IM gateway config (regenerate openclaw.json and restart gateway if running).
      // This is done on every save regardless of activeTab, because the user may have
      // edited IM config then switched tabs before clicking Save.
      await imService.saveAndSyncConfig();

      didSaveRef.current = true;
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  // 标签页切换处理
  const handleTabChange = (tab: SettingsTabType) => {
    if (tab !== SettingsTab.Model) {
      setIsAddingModel(false);
      setIsEditingModel(false);
      setEditingModelId(null);
      setNewModelName('');
      setNewModelId('');
      setNewModelSupportsImage(false);
      setModelFormError(null);
    }
    setActiveTab(tab);
  };

  // 快捷键更新处理
  const handleShortcutChange = (key: keyof typeof shortcuts, value: string) => {
    setShortcuts(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // 阻止点击设置窗口时事件传播到背景
  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Handlers for model operations
  const handleAddModel = () => {
    setIsAddingModel(true);
    setIsEditingModel(false);
    setEditingModelId(null);
    setNewModelName('');
    setNewModelId('');
    setNewModelSupportsImage(false);
    setModelFormError(null);
  };

  const handleEditModel = (modelId: string, modelName: string, supportsImage?: boolean) => {
    setIsAddingModel(false);
    setIsEditingModel(true);
    setEditingModelId(modelId);
    setNewModelName(modelName);
    setNewModelId(modelId);
    setNewModelSupportsImage(!!supportsImage);
    setModelFormError(null);
  };

  const handleDeleteModel = (modelId: string) => {
    if (!providers[activeProvider].models) return;
    
    const updatedModels = providers[activeProvider].models.filter(
      model => model.id !== modelId
    );
    
    setProviders(prev => ({
      ...prev,
      [activeProvider]: {
        ...prev[activeProvider],
        models: updatedModels
      }
    }));
  };

  const handleFetchModels = async () => {
    const providerKey = activeProvider;
    const providerConfig = providers[providerKey];
    setIsFetchingModels(true);

    try {
      // Check API key for providers that require it
      if (providerRequiresApiKey(providerKey) && !providerConfig.apiKey) {
        alert(i18nService.t('getModelListNeedApiKey'));
        setIsFetchingModels(false);
        return;
      }

      // For Ollama, use local API
      let baseUrl: string;
      let effectiveApiFormat: 'anthropic' | 'openai' | 'gemini';
      if (providerKey === 'ollama') {
        baseUrl = providerConfig.baseUrl || 'http://localhost:11434';
        effectiveApiFormat = 'openai';
      } else {
        effectiveApiFormat = getEffectiveApiFormat(providerKey, providerConfig.apiFormat);
        baseUrl = resolveBaseUrl(providerKey, providerConfig.baseUrl, effectiveApiFormat);
      }

      const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
      let modelsUrl: string;
      let headers: Record<string, string> = {};

      if (providerKey === 'ollama') {
        // Ollama: GET /api/tags
        modelsUrl = `${normalizedBaseUrl}/api/tags`;
      } else if (providerKey === 'gemini') {
        // Gemini: use the OpenAI-compatible endpoint if available
        modelsUrl = `${normalizedBaseUrl}/models`;
        if (providerConfig.apiKey) {
          const separator = modelsUrl.includes('?') ? '&' : '?';
          modelsUrl = `${modelsUrl}${separator}key=${encodeURIComponent(providerConfig.apiKey)}`;
        }
      } else {
        // Build the /v1/models URL
        if (normalizedBaseUrl.endsWith('/v1')) {
          modelsUrl = `${normalizedBaseUrl}/models`;
        } else if (normalizedBaseUrl.includes('/v1/')) {
          modelsUrl = `${normalizedBaseUrl.replace(/\/v1\/.*$/, '')}/v1/models`;
        } else {
          modelsUrl = `${normalizedBaseUrl}/v1/models`;
        }

        if (providerConfig.apiKey) {
          if (effectiveApiFormat === 'anthropic') {
            headers['x-api-key'] = providerConfig.apiKey;
          } else {
            headers.Authorization = `Bearer ${providerConfig.apiKey}`;
          }
        }
      }

      const response = await window.electron.api.fetch({
        url: modelsUrl,
        method: 'GET',
        headers,
      });

      // Anthropic's native API does not expose a /v1/models endpoint.
      // If the request fails for an Anthropic-format provider, offer a curated
      // list of well-known Anthropic models as a fallback instead of an error.
      const isAnthropicNative = effectiveApiFormat === 'anthropic'
        && (normalizedBaseUrl.includes('api.anthropic.com') || providerKey === 'anthropic');

      if (!response.ok && isAnthropicNative) {
        const anthropicFallback = [
          { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
          { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
          { id: 'claude-haiku-3-5-20251001', name: 'Claude 3.5 Haiku' },
        ];
        if (!confirm(i18nService.t('getModelListAnthropicFallback'))) {
          setIsFetchingModels(false);
          return;
        }
        // Merge fallback models directly
        const existingModels = providerConfig.models || [];
        const existingMap = new Map(existingModels.map(m => [m.id, m]));
        const mergedModels: Array<{ id: string; name: string; supportsImage: boolean }> = anthropicFallback.map(m => ({
          id: m.id,
          name: existingMap.get(m.id)?.name || m.name,
          supportsImage: existingMap.get(m.id)?.supportsImage ?? true,
        }));
        for (const existing of existingModels) {
          if (!anthropicFallback.some(m => m.id === existing.id)) {
            mergedModels.push({
              id: existing.id,
              name: existing.name,
              supportsImage: existing.supportsImage ?? false,
            });
          }
        }
        setProviders(prev => ({
          ...prev,
          [providerKey]: {
            ...prev[providerKey],
            models: mergedModels,
          },
        }));
        setIsFetchingModels(false);
        return;
      }

      if (!response.ok) {
        console.error('[FetchModels] Response not ok:', response.status, response.statusText);
        alert(i18nService.t('getModelListFailed'));
        setIsFetchingModels(false);
        return;
      }

      let modelList: Array<{ id: string; name?: string }> = [];

      if (providerKey === 'ollama') {
        // Ollama response: { models: [{ name: string, ... }] }
        const data = response.data as { models?: Array<{ name: string }> };
        if (data.models && Array.isArray(data.models)) {
          modelList = data.models.map(m => ({ id: m.name, name: m.name }));
        }
      } else if (providerKey === 'gemini') {
        // Gemini response: { models: [{ name: string, displayName: string }] }
        // name format: "models/gemini-pro" -> extract "gemini-pro"
        const data = response.data as { models?: Array<{ name: string; displayName?: string }> };
        if (data.models && Array.isArray(data.models)) {
          modelList = data.models
            .filter(m => m.name && !m.name.includes('embedding') && !m.name.includes('embed'))
            .map(m => {
              const id = m.name.replace(/^models\//, '');
              return { id, name: m.displayName || id };
            });
        }
      } else {
        // OpenAI-compatible response: { data: [{ id: string, ... }] }
        const data = response.data as { data?: Array<{ id: string }> };
        if (data.data && Array.isArray(data.data)) {
          modelList = data.data.map(m => {
            const modelName = m.id
              .replace(/^models\//, '')
              .replace(/^azureml-/, '')
              .trim();
            return { id: m.id, name: modelName };
          });
        }
      }

      if (modelList.length === 0) {
        alert(i18nService.t('getModelListNoModels'));
        setIsFetchingModels(false);
        return;
      }

      // Merge with existing models, preserving user-edited names
      const existingModels = providerConfig.models || [];
      const existingMap = new Map(existingModels.map(m => [m.id, m]));

      const mergedModels: Array<{ id: string; name: string; supportsImage: boolean }> = modelList.map(m => {
        const existing = existingMap.get(m.id);
        return {
          id: m.id,
          name: existing?.name || m.name || m.id,
          supportsImage: existing?.supportsImage ?? false,
        };
      });

      // Add any user-added models that are not in the fetched list
      for (const existing of existingModels) {
        if (!modelList.some(m => m.id === existing.id)) {
          mergedModels.push({
            id: existing.id,
            name: existing.name,
            supportsImage: existing.supportsImage ?? false,
          });
        }
      }

      setProviders(prev => ({
        ...prev,
        [providerKey]: {
          ...prev[providerKey],
          models: mergedModels,
        },
      }));

      alert(i18nService.t('getModelListSuccess').replace('{count}', String(modelList.length)));
    } catch (e) {
      console.error('[FetchModels] Error:', e);
      alert(i18nService.t('getModelListFailed'));
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSaveNewModel = () => {
    const modelId = newModelId.trim();

    if (activeProvider === 'ollama') {
      // For Ollama, only the model name (stored as modelId) is required
      if (!modelId) {
        setModelFormError(i18nService.t('ollamaModelNameRequired'));
        return;
      }
    } else {
      const modelName = newModelName.trim();
      if (!modelName || !modelId) {
        setModelFormError(i18nService.t('modelNameAndIdRequired'));
        return;
      }
    }

    // For Ollama, auto-fill display name from modelId if not provided
    const modelName = activeProvider === 'ollama'
      ? (newModelName.trim() && newModelName.trim() !== modelId ? newModelName.trim() : modelId)
      : newModelName.trim();

    const currentModels = providers[activeProvider].models ?? [];
    const duplicateModel = currentModels.find(
      model => model.id === modelId && (!isEditingModel || model.id !== editingModelId)
    );
    if (duplicateModel) {
      setModelFormError(i18nService.t('modelIdExists'));
      return;
    }

    const nextModel = {
      id: modelId,
      name: modelName,
      supportsImage: newModelSupportsImage,
    };
    const updatedModels = isEditingModel && editingModelId
      ? currentModels.map(model => (model.id === editingModelId ? nextModel : model))
      : [...currentModels, nextModel];

    setProviders(prev => ({
      ...prev,
      [activeProvider]: {
        ...prev[activeProvider],
        models: updatedModels
      }
    }));

    setIsAddingModel(false);
    setIsEditingModel(false);
    setEditingModelId(null);
    setNewModelName('');
    setNewModelId('');
    setNewModelSupportsImage(false);
    setModelFormError(null);
  };

  const handleCancelModelEdit = () => {
    setIsAddingModel(false);
    setIsEditingModel(false);
    setEditingModelId(null);
    setNewModelName('');
    setNewModelId('');
    setNewModelSupportsImage(false);
    setModelFormError(null);
  };

  const handleModelDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelModelEdit();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveNewModel();
    }
  };

  const showTestResultModal = (
    result: Omit<ProviderConnectionTestResult, 'provider'>,
    provider: ProviderType
  ) => {
    setTestResult({
      ...result,
      provider,
    });
    setIsTestResultModalOpen(true);
  };

  // 测试 API 连接
  const handleTestConnection = async () => {
    const testingProvider = activeProvider;
    const providerConfig = providers[testingProvider];
    setIsTesting(true);
    setIsTestResultModalOpen(false);
    setTestResult(null);

    // Check if provider has valid authentication (API Key or OAuth for Qwen)
    const qwenOAuthCredentials = testingProvider === 'qwen' ? providers.qwen.oauthCredentials : undefined;
    const hasValidAuth = providerConfig.apiKey || qwenOAuthCredentials;
    
    if (providerRequiresApiKey(testingProvider) && !hasValidAuth) {
      showTestResultModal({ success: false, message: i18nService.t('apiKeyRequired') }, testingProvider);
      setIsTesting(false);
      return;
    }

    // 获取第一个可用模型 - use a shallow copy to avoid mutating state
    const originalModel = providerConfig.models?.[0];
    if (!originalModel) {
      showTestResultModal({ success: false, message: i18nService.t('noModelsConfigured') }, testingProvider);
      setIsTesting(false);
      return;
    }

    const firstModel = { ...originalModel };

    try {
      let response: Awaited<ReturnType<typeof window.electron.api.fetch>>;
      // Apply Coding Plan endpoint switch
      let effectiveBaseUrl = resolveBaseUrl(testingProvider, providerConfig.baseUrl, getEffectiveApiFormat(testingProvider, providerConfig.apiFormat));
      let effectiveApiFormat = getEffectiveApiFormat(testingProvider, providerConfig.apiFormat);
      
      // Handle Coding Plan endpoint switch for supported providers
      if ((providerConfig as { codingPlanEnabled?: boolean }).codingPlanEnabled && (effectiveApiFormat === 'anthropic' || effectiveApiFormat === 'openai')) {
        const resolved = resolveCodingPlanBaseUrl(testingProvider, true, effectiveApiFormat, effectiveBaseUrl);
        effectiveBaseUrl = resolved.baseUrl;
        effectiveApiFormat = resolved.effectiveFormat;
      }
      
      let normalizedBaseUrl = effectiveBaseUrl.replace(/\/+$/, '');

      // Determine effective API key
      let effectiveApiKey = providerConfig.apiKey;

      if (testingProvider === 'qwen') {
        // Use regular API Key mode
        effectiveApiKey = providerConfig.apiKey;
        // Ensure model ID is not an OAuth-mapped name (vision-model/coder-model)
        // This can happen if a previous OAuth test mutated the model in state and it got persisted
        if (firstModel.id === 'vision-model' || firstModel.id === 'coder-model') {
          // Restore from defaultConfig's first qwen model
          const defaultQwenModel = defaultConfig.providers?.qwen?.models?.[0];
          firstModel.id = defaultQwenModel?.id || 'qwen3.5-plus';
        }
      }

      // Determine format after all overrides (OAuth may switch to openai)
      // 统一为两种协议格式：
      // - anthropic: /v1/messages
      // - openai provider: /v1/responses
      // - other openai-compatible providers: /v1/chat/completions
      const useAnthropicFormat = effectiveApiFormat === 'anthropic';

      if (useAnthropicFormat) {
        const anthropicUrl = normalizedBaseUrl.endsWith('/v1')
          ? `${normalizedBaseUrl}/messages`
          : `${normalizedBaseUrl}/v1/messages`;
        response = await window.electron.api.fetch({
          url: anthropicUrl,
          method: 'POST',
          headers: {
            'x-api-key': effectiveApiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: firstModel.id,
            max_tokens: CONNECTIVITY_TEST_TOKEN_BUDGET,
            messages: [{ role: 'user', content: 'Hi' }],
          }),
        });
      } else {
        const useResponsesApi = shouldUseOpenAIResponsesForProvider(testingProvider);
        const openaiUrl = useResponsesApi
          ? buildOpenAIResponsesUrl(normalizedBaseUrl)
          : buildOpenAICompatibleChatCompletionsUrl(normalizedBaseUrl, testingProvider);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (effectiveApiKey) {
          headers.Authorization = `Bearer ${effectiveApiKey}`;
        }
        if (testingProvider === 'github-copilot') {
                  headers['Copilot-Integration-Id'] = 'vscode-chat';
                  headers['Editor-Version'] = 'vscode/1.96.2';
                  headers['Editor-Plugin-Version'] = 'copilot-chat/0.26.7';
                  headers['User-Agent'] = 'GitHubCopilotChat/0.26.7';
                  headers['Openai-Intent'] = 'conversation-panel';
        }
        const openAIRequestBody: Record<string, unknown> = useResponsesApi
          ? {
              model: firstModel.id,
              input: [{ role: 'user', content: [{ type: 'input_text', text: 'Hi' }] }],
              max_output_tokens: CONNECTIVITY_TEST_TOKEN_BUDGET,
            }
          : {
              model: firstModel.id,
              messages: [{ role: 'user', content: 'Hi' }],
            };
        if (!useResponsesApi && shouldUseMaxCompletionTokensForOpenAI(testingProvider, firstModel.id)) {
          openAIRequestBody.max_completion_tokens = CONNECTIVITY_TEST_TOKEN_BUDGET;
        } else {
          if (!useResponsesApi) {
            openAIRequestBody.max_tokens = CONNECTIVITY_TEST_TOKEN_BUDGET;
          }
        }
        response = await window.electron.api.fetch({
          url: openaiUrl,
          method: 'POST',
          headers,
          body: JSON.stringify(openAIRequestBody),
        });
      }

      if (response.ok) {
        enableProvider(testingProvider);
        showTestResultModal({ success: true, message: i18nService.t('connectionSuccess') }, testingProvider);
      } else {
        const data = response.data || {};
        // 提取错误信息
        const errorMessage = data.error?.message || data.message || `${i18nService.t('connectionFailed')}: ${response.status}`;
        if (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes('model output limit was reached')) {
          enableProvider(testingProvider);
          showTestResultModal({ success: true, message: i18nService.t('connectionSuccess') }, testingProvider);
          return;
        }
        showTestResultModal({ success: false, message: errorMessage }, testingProvider);
      }
    } catch (err) {
      showTestResultModal({
        success: false,
        message: err instanceof Error ? err.message : i18nService.t('connectionFailed'),
      }, testingProvider);
    } finally {
      setIsTesting(false);
    }
  };

  const buildProvidersExport = async (password: string): Promise<ProvidersExportPayload> => {
    const entries = await Promise.all(
      Object.entries(providers).map(async ([providerKey, providerConfig]) => {
        const apiKey = await encryptWithPassword(providerKey === TokenDance.Provider ? '' : providerConfig.apiKey, password);
        const apiFormat = getEffectiveApiFormat(providerKey, providerConfig.apiFormat);
        return [
          providerKey,
          {
            enabled: providerConfig.enabled,
            apiKey,
            baseUrl: resolveBaseUrl(providerKey as ProviderType, providerConfig.baseUrl, apiFormat),
            apiFormat,
            codingPlanEnabled: (providerConfig as ProviderConfig).codingPlanEnabled,
            models: providerConfig.models,
          },
        ] as const;
      })
    );

    return {
      type: EXPORT_FORMAT_TYPE,
      version: 2,
      exportedAt: new Date().toISOString(),
      encryption: {
        algorithm: 'AES-GCM',
        keySource: 'password',
        keyDerivation: 'PBKDF2',
      },
      providers: Object.fromEntries(entries),
    };
  };

  const normalizeModels = (models?: Model[]) =>
    models?.map(model => ({
      ...model,
      supportsImage: model.supportsImage ?? false,
    }));

  const DEFAULT_EXPORT_PASSWORD = EXPORT_PASSWORD;

  const handleExportProviders = async () => {
    setError(null);
    setIsExportingProviders(true);

    try {
      const payload = await buildProvidersExport(DEFAULT_EXPORT_PASSWORD);
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${APP_ID}-providers-${date}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      console.error('Failed to export providers:', err);
      setError(i18nService.t('exportProvidersFailed'));
    } finally {
      setIsExportingProviders(false);
    }
  };

  const handleImportProvidersClick = () => {
    importInputRef.current?.click();
  };

  const handleImportProviders = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setError(null);

    try {
      const raw = await file.text();
      let payload: ProvidersImportPayload;
      try {
        payload = JSON.parse(raw) as ProvidersImportPayload;
      } catch {
        setError(i18nService.t('invalidProvidersFile'));
        return;
      }

      if (!payload || payload.type !== EXPORT_FORMAT_TYPE || !payload.providers) {
        setError(i18nService.t('invalidProvidersFile'));
        return;
      }

      // Check if it's version 2 (password-based encryption)
      if (payload.version === 2 && payload.encryption?.keySource === 'password') {
        await processImportPayloadWithPassword(payload);
        return;
      }

      // Version 1 (legacy local-store key) - try to decrypt with local key
      if (payload.version === 1) {
        await processImportPayloadWithLocalKey(payload);
        return;
      }

      setError(i18nService.t('invalidProvidersFile'));
    } catch (err) {
      console.error('Failed to import providers:', err);
      setError(i18nService.t('importProvidersFailed'));
    }
  };

  const processImportPayloadWithLocalKey = async (payload: ProvidersImportPayload) => {
    setIsImportingProviders(true);
    try {
      const providerUpdates: Partial<ProvidersConfig> = {};
      let hadDecryptFailure = false;
      for (const providerKey of providerKeys) {
        const providerData = payload.providers?.[providerKey];
        if (!providerData) {
          continue;
        }

        let apiKey: string | undefined;
        if (typeof providerData.apiKey === 'string') {
          apiKey = providerData.apiKey;
        } else if (providerData.apiKey && typeof providerData.apiKey === 'object') {
          try {
            apiKey = await decryptSecret(providerData.apiKey as EncryptedPayload);
          } catch (error) {
            hadDecryptFailure = true;
            console.warn(`Failed to decrypt provider key for ${providerKey}`, error);
          }
        } else if (typeof providerData.apiKeyEncrypted === 'string' && typeof providerData.apiKeyIv === 'string') {
          try {
            apiKey = await decryptSecret({ encrypted: providerData.apiKeyEncrypted, iv: providerData.apiKeyIv });
          } catch (error) {
            hadDecryptFailure = true;
            console.warn(`Failed to decrypt provider key for ${providerKey}`, error);
          }
        }

        const models = normalizeModels(providerData.models);

        providerUpdates[providerKey] = {
          enabled: typeof providerData.enabled === 'boolean' ? providerData.enabled : providers[providerKey].enabled,
          apiKey: apiKey ?? providers[providerKey].apiKey,
          baseUrl: typeof providerData.baseUrl === 'string' ? providerData.baseUrl : providers[providerKey].baseUrl,
          apiFormat: getEffectiveApiFormat(providerKey, providerData.apiFormat ?? providers[providerKey].apiFormat),
          codingPlanEnabled: typeof providerData.codingPlanEnabled === 'boolean' ? providerData.codingPlanEnabled : (providers[providerKey] as ProviderConfig).codingPlanEnabled,
          models: models ?? providers[providerKey].models,
        };
      }

      if (Object.keys(providerUpdates).length === 0) {
        setError(i18nService.t('invalidProvidersFile'));
        return;
      }

      setProviders(prev => {
        const next = { ...prev };
        Object.entries(providerUpdates).forEach(([providerKey, update]) => {
          next[providerKey] = {
            ...prev[providerKey],
            ...update,
          };
        });
        return next;
      });
      setIsTestResultModalOpen(false);
      setTestResult(null);
      if (hadDecryptFailure) {
        setNoticeMessage(i18nService.t('decryptProvidersPartial'));
      }
    } catch (err) {
      console.error('Failed to import providers:', err);
      const isDecryptError = err instanceof Error
        && (err.message === 'Invalid encrypted payload' || err.name === 'OperationError');
      const message = isDecryptError
        ? i18nService.t('decryptProvidersFailed')
        : i18nService.t('importProvidersFailed');
      setError(message);
    } finally {
      setIsImportingProviders(false);
    }
  };

  const processImportPayloadWithPassword = async (payload: ProvidersImportPayload) => {
    if (!payload.providers) {
      return;
    }

    setIsImportingProviders(true);

    try {
      const providerUpdates: Partial<ProvidersConfig> = {};
      let hadDecryptFailure = false;

      for (const providerKey of providerKeys) {
        const providerData = payload.providers[providerKey];
        if (!providerData) {
          continue;
        }

        let apiKey: string | undefined;
        if (typeof providerData.apiKey === 'string') {
          apiKey = providerData.apiKey;
        } else if (providerData.apiKey && typeof providerData.apiKey === 'object') {
          const apiKeyObj = providerData.apiKey as PasswordEncryptedPayload;
          if (apiKeyObj.salt) {
            // Version 2 password-based encryption
            try {
              apiKey = await decryptWithPassword(apiKeyObj, DEFAULT_EXPORT_PASSWORD);
            } catch (error) {
              hadDecryptFailure = true;
              console.warn(`Failed to decrypt provider key for ${providerKey}`, error);
            }
          }
        }

        const models = normalizeModels(providerData.models);

        providerUpdates[providerKey] = {
          enabled: typeof providerData.enabled === 'boolean' ? providerData.enabled : providers[providerKey].enabled,
          apiKey: apiKey ?? providers[providerKey].apiKey,
          baseUrl: typeof providerData.baseUrl === 'string' ? providerData.baseUrl : providers[providerKey].baseUrl,
          apiFormat: getEffectiveApiFormat(providerKey, providerData.apiFormat ?? providers[providerKey].apiFormat),
          codingPlanEnabled: typeof providerData.codingPlanEnabled === 'boolean' ? providerData.codingPlanEnabled : (providers[providerKey] as ProviderConfig).codingPlanEnabled,
          models: models ?? providers[providerKey].models,
        };
      }

      if (Object.keys(providerUpdates).length === 0) {
        setError(i18nService.t('invalidProvidersFile'));
        return;
      }

      // Check if any key was successfully decrypted
      const anyKeyDecrypted = Object.entries(providerUpdates).some(
        ([key, update]) => update?.apiKey && update.apiKey !== providers[key]?.apiKey
      );

      if (!anyKeyDecrypted && hadDecryptFailure) {
        // All decryptions failed - likely wrong password
        setError(i18nService.t('decryptProvidersFailed'));
        return;
      }

      setProviders(prev => {
        const next = { ...prev };
        Object.entries(providerUpdates).forEach(([providerKey, update]) => {
          next[providerKey] = {
            ...prev[providerKey],
            ...update,
          };
        });
        return next;
      });
      setIsTestResultModalOpen(false);
      setTestResult(null);
      if (hadDecryptFailure) {
        setNoticeMessage(i18nService.t('decryptProvidersPartial'));
      }
    } catch (err) {
      console.error('Failed to import providers:', err);
      const isDecryptError = err instanceof Error
        && (err.message === 'Invalid encrypted payload' || err.name === 'OperationError');
      const message = isDecryptError
        ? i18nService.t('decryptProvidersFailed')
        : i18nService.t('importProvidersFailed');
      setError(message);
    } finally {
      setIsImportingProviders(false);
    }
  };

  // 渲染标签页
  const sidebarTabs: { key: SettingsTabType; label: string; icon: React.ReactNode }[] = useMemo(() => {
    const tabLabel = (key: string): string => {
      if (language === 'en' || language === 'zh') {
        return i18nService.t(key);
      }
      return i18nService.t(key);
    };
    const allTabs = [
      { key: SettingsTab.General,        label: tabLabel('general'),        icon: <Cog6ToothIcon className="h-5 w-5" /> },
      { key: SettingsTab.CoworkAgentEngine, label: tabLabel('coworkAgentEngine'), icon: <CpuChipIcon className="h-5 w-5" /> },
      { key: SettingsTab.Model,          label: tabLabel('model'),          icon: <CubeIcon className="h-5 w-5" /> },
      { key: SettingsTab.Im,             label: tabLabel('imBot'),          icon: <ChatBubbleLeftIcon className="h-5 w-5" /> },
      { key: SettingsTab.Email,          label: tabLabel('emailTab'),       icon: <EnvelopeIcon className="h-5 w-5" /> },
      { key: SettingsTab.ScheduledTasks, label: tabLabel('scheduledTasksTitle'), icon: <ClockIcon className="h-5 w-5" /> },
      { key: SettingsTab.Mcp,            label: tabLabel('mcpServers'),     icon: <ConnectorIcon className="h-5 w-5" /> },
      { key: SettingsTab.CoworkMemory,   label: tabLabel('coworkMemoryTitle'), icon: <BrainIcon className="h-5 w-5" /> },
      { key: SettingsTab.CoworkAgent,    label: tabLabel('coworkAgentTab'),    icon: <UserCircleIcon className="h-5 w-5" /> },
      { key: SettingsTab.Agents,         label: tabLabel('agentManagement'), icon: <UserGroupIcon className="h-5 w-5" /> },
      { key: SettingsTab.Shortcuts,      label: tabLabel('shortcuts'),      icon: <CommandLineIcon className="h-5 w-5" /> },
      { key: SettingsTab.ThemeSkin,      label: tabLabel('themeSkinTitle'), icon: <SwatchIcon className="h-5 w-5" /> },
      { key: SettingsTab.About,          label: tabLabel('about'),          icon: <InformationCircleIcon className="h-5 w-5" /> },
    ];
    // Filter out tabs hidden by enterprise config
    // Filter out tabs with 'hide' action in enterprise config
    // e.g., ui: { "settings.im": "hide" } → hide the 'im' tab
    const ui = enterpriseConfig?.ui;
    if (ui) {
      return allTabs.filter(tab => ui[`settings.${tab.key}`] !== 'hide');
    }
    return allTabs;
  }, [language, enterpriseConfig]);

  const activeTabLabel = useMemo(() => {
    return sidebarTabs.find(t => t.key === activeTab)?.label ?? '';
  }, [activeTab, sidebarTabs]);

  const getCliEngineStatus = (engine: CoworkAgentEngine) => {
    return agentEnvironmentSnapshot?.engines.find((item) => item.engine === engine) ?? null;
  };

  const getCliAuthMeta = (status: NonNullable<ExternalAgentEnvironmentSnapshot['engines'][number]>) => {
    switch (status.authStatus) {
      case 'logged_in':
        return {
          label: i18nService.t('coworkAgentEngineAuthStatusLoggedIn'),
          tone: 'text-green-600 dark:text-green-400',
          dot: 'bg-green-500',
        };
      case 'expired':
        return {
          label: i18nService.t('coworkAgentEngineAuthStatusExpired'),
          tone: 'text-amber-600 dark:text-amber-400',
          dot: 'bg-amber-500',
        };
      case 'logged_out':
        return {
          label: i18nService.t('coworkAgentEngineAuthStatusLoggedOut'),
          tone: 'text-amber-600 dark:text-amber-400',
          dot: 'bg-amber-500',
        };
      case 'unconfigured':
        return {
          label: i18nService.t('coworkAgentEngineAuthStatusUnconfigured'),
          tone: 'text-red-600 dark:text-red-400',
          dot: 'bg-red-500',
        };
      case 'unknown':
      default:
        return {
          label: i18nService.t('coworkAgentEngineAuthStatusUnknown'),
          tone: 'text-secondary',
          dot: 'bg-secondary',
        };
    }
  };

  const formatCliAuthSource = (status: NonNullable<ExternalAgentEnvironmentSnapshot['engines'][number]>): string => {
    if (!status.authSource) return '';
    if (status.authMessage === 'env') {
      return `${i18nService.t('coworkAgentEngineAuthSourceEnv')} · ${status.authSource}`;
    }
    if (status.authMessage === 'file') {
      return `${i18nService.t('coworkAgentEngineAuthSourceFile')} · ${status.authSource}`;
    }
    return status.authSource;
  };

  const refreshAgentEnvironmentSnapshot = async (options: { forceRefresh?: boolean; appTypes?: ExternalAgentProviderAppType[] } = {}) => {
    const snapshot = await coworkService.getAgentEngineSnapshot(options);
    setAgentEnvironmentSnapshot((previous) => (
      snapshot ? mergeAgentEnvironmentSnapshots(previous, snapshot) : previous
    ));
  };

  const handleInstallAgentCli = async (appType: ExternalAgentProviderAppType) => {
    if (window.electron?.platform !== 'darwin' && window.electron?.platform !== 'win32') {
      setError(i18nService.t('coworkAgentEngineInstallCliUnsupported'));
      return;
    }
    setError(null);
    setAgentCliInstallingAppType(appType);
    setAgentCliInstallProgress((prev) => ({
      ...prev,
      [appType]: i18nService.t('coworkAgentEngineInstallCliStarting'),
    }));
    try {
      const result = await coworkService.installAgentCli(appType);
      if (result.snapshot) {
        setAgentEnvironmentSnapshot((previous) => mergeAgentEnvironmentSnapshots(previous, result.snapshot!));
      } else {
        await refreshAgentEnvironmentSnapshot({ forceRefresh: true, appTypes: [appType] });
      }
      if (!result.success) {
        setError(result.error || i18nService.t('coworkAgentEngineInstallCliFailed'));
        return;
      }
      if (appType === 'hermes') {
        setHermesConfigSource(ExternalAgentConfigSourceValue.WesightModel);
      }
      setNoticeMessage(i18nService.t('coworkAgentEngineInstallCliSuccess'));
      setAgentCliInstallProgress((prev) => ({
        ...prev,
        [appType]: result.version || result.binaryPath || i18nService.t('coworkAgentEngineInstallCliSuccess'),
      }));
    } finally {
      setAgentCliInstallingAppType((current) => (
        current === appType ? null : current
      ));
    }
  };

  const handleInstallHermesEngine = async () => {
    if (window.electron?.platform !== 'darwin' && window.electron?.platform !== 'win32') {
      setError(i18nService.t('coworkAgentEngineInstallCliUnsupported'));
      return;
    }
    setError(null);
    setAgentCliInstallingAppType('hermes');
    setAgentCliInstallProgress((prev) => ({
      ...prev,
      hermes: i18nService.t('coworkAgentEngineInstallCliStarting'),
    }));
    setHermesEngineStatus((current) => ({
      phase: 'installing',
      version: current?.version ?? null,
      progressPercent: 8,
      message: i18nService.t('coworkHermesInstalling'),
      canRetry: false,
    }));
    try {
      const status = await coworkService.installHermesEngine();
      if (status) {
        setHermesEngineStatus(status);
      }
      await refreshAgentEnvironmentSnapshot({ forceRefresh: true });
      if (!status || status.phase === 'error' || status.phase === 'not_installed') {
        setError(status?.message || i18nService.t('coworkAgentEngineInstallCliFailed'));
        return;
      }
      setHermesConfigSource(ExternalAgentConfigSourceValue.WesightModel);
      setNoticeMessage(i18nService.t('coworkAgentEngineInstallCliSuccess'));
    } finally {
      setAgentCliInstallingAppType((current) => (
        current === 'hermes' ? null : current
      ));
    }
  };

  const handleStartCodexApp = async () => {
    if (codexAppStarting) return;
    setError(null);
    setCodexAppStarting(true);
    try {
      const result = await coworkService.startCodexApp();
      if (!result.success) {
        setError(result.error || i18nService.t('coworkAgentCodexAppMissing'));
      }
      await refreshAgentEnvironmentSnapshot({ forceRefresh: true });
      if (result.success) {
        setNoticeMessage(i18nService.t('coworkAgentCodexAppReady'));
      }
    } finally {
      setCodexAppStarting(false);
    }
  };

  const refreshOpenSquillaGatewayStatus = useCallback(async () => {
    setOpenSquillaGatewayBusyAction('status');
    try {
      const result = await window.electron.openSquillaGateway.status();
      setOpenSquillaGatewayResult(result);
      if (!result.success) {
        setError(result.error || i18nService.t('coworkAgentOpenSquillaGatewayFailed'));
      }
    } catch (error) {
      setOpenSquillaGatewayResult({
        success: false,
        action: 'status',
        error: error instanceof Error ? error.message : i18nService.t('coworkAgentOpenSquillaGatewayFailed'),
      });
      setError(error instanceof Error ? error.message : i18nService.t('coworkAgentOpenSquillaGatewayFailed'));
    } finally {
      setOpenSquillaGatewayBusyAction(null);
    }
  }, []);

  const runOpenSquillaGatewayAction = useCallback(async (action: 'start' | 'restart' | 'stop') => {
    setOpenSquillaGatewayBusyAction(action);
    setError(null);
    try {
      const api = window.electron.openSquillaGateway;
      const result = action === 'start'
        ? await api.start()
        : action === 'restart'
          ? await api.restart()
          : await api.stop();
      setOpenSquillaGatewayResult(result);
      if (!result.success) {
        setError(result.error || i18nService.t('coworkAgentOpenSquillaGatewayFailed'));
        return;
      }
      setNoticeMessage(action === 'stop'
        ? i18nService.t('coworkAgentOpenSquillaGatewayStopped')
        : i18nService.t('coworkAgentOpenSquillaGatewayReady'));
      const status = await window.electron.openSquillaGateway.status();
      setOpenSquillaGatewayResult(status);
    } catch (error) {
      setError(error instanceof Error ? error.message : i18nService.t('coworkAgentOpenSquillaGatewayFailed'));
    } finally {
      setOpenSquillaGatewayBusyAction(null);
    }
  }, []);

  useEffect(() => {
    if (selectedExternalAgentAppType !== 'opensquilla') return;
    void refreshOpenSquillaGatewayStatus();
  }, [refreshOpenSquillaGatewayStatus, selectedExternalAgentAppType]);

  const handleSelectCoworkAgentEngine = (engine: CoworkAgentEngine) => {
    if (isSaving) return;
    setCoworkAgentEngine(engine);
    setExpandedCoworkAgentEngine(engine);
  };

  const handleToggleCoworkAgentEngineDetails = (engine: CoworkAgentEngine) => {
    if (isSaving) return;
    setExpandedCoworkAgentEngine((current) => (
      current === engine ? null : engine
    ));
  };

  const renderCoworkAgentApplyProgress = () => {
    if (!isCoworkAgentConfigApplying) return null;
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-3">
        <div className="flex items-center justify-between gap-3 text-xs text-secondary">
          <span>{i18nService.t('coworkAgentConfigApplying')}</span>
          <span className="text-[11px] text-primary">
            {i18nService.t('coworkAgentConfigApplyingHint')}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
        </div>
      </div>
    );
  };

  const renderOpenSquillaGatewayControls = () => {
    const payload = openSquillaGatewayResult?.payload;
    const running = payload?.running === true || payload?.status === 'running' || payload?.state === 'running';
    const pid = typeof payload?.pid === 'number' || typeof payload?.pid === 'string'
      ? String(payload.pid)
      : '';
    const host = typeof payload?.host === 'string' ? payload.host : '127.0.0.1';
    const port = typeof payload?.port === 'number' || typeof payload?.port === 'string'
      ? String(payload.port)
      : '18791';
    const gatewayUrl = running ? `http://${host}:${port}` : '-';
    const statusLabel = openSquillaGatewayBusyAction === 'status'
      ? i18nService.t('coworkAgentOpenSquillaGatewayChecking')
      : running
        ? i18nService.t('coworkAgentOpenSquillaGatewayRunning')
        : openSquillaGatewayResult?.success === false
          ? i18nService.t('coworkAgentOpenSquillaGatewayError')
          : i18nService.t('coworkAgentOpenSquillaGatewayStoppedStatus');
    const statusTone = running
      ? 'text-green-600 dark:text-green-400'
      : openSquillaGatewayResult?.success === false
        ? 'text-red-600 dark:text-red-400'
        : 'text-amber-600 dark:text-amber-400';
    const statusDot = running
      ? 'bg-green-500'
      : openSquillaGatewayResult?.success === false
        ? 'bg-red-500'
        : 'bg-amber-500';
    const isBusy = openSquillaGatewayBusyAction !== null;
    const buttonClass = 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60';

    return (
      <div className="rounded-xl border border-border px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-foreground">
              {i18nService.t('coworkAgentOpenSquillaGatewayTitle')}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-secondary">
              {i18nService.t('coworkAgentOpenSquillaGatewayHint')}
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[11px] ${statusTone}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
            {statusLabel}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-[96px_minmax(0,1fr)] gap-2 text-[11px] leading-5">
          <span className="text-secondary">{i18nService.t('coworkAgentOpenSquillaGatewayUrl')}</span>
          <span className="truncate font-mono text-foreground/80" title={gatewayUrl}>{gatewayUrl}</span>
          <span className="text-secondary">{i18nService.t('coworkAgentOpenSquillaGatewayPid')}</span>
          <span className="truncate font-mono text-foreground/80">{pid || '-'}</span>
        </div>
        {openSquillaGatewayResult?.success === false && openSquillaGatewayResult.error && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] leading-5 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {openSquillaGatewayResult.error}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runOpenSquillaGatewayAction('start')}
            disabled={isBusy}
            className={buttonClass}
          >
            <CommandLineIcon className="h-3.5 w-3.5" />
            {i18nService.t('coworkAgentOpenSquillaGatewayStart')}
          </button>
          <button
            type="button"
            onClick={() => void runOpenSquillaGatewayAction('restart')}
            disabled={isBusy}
            className={buttonClass}
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${openSquillaGatewayBusyAction === 'restart' ? 'animate-spin' : ''}`} />
            {i18nService.t('coworkAgentOpenSquillaGatewayRestart')}
          </button>
          <button
            type="button"
            onClick={() => void runOpenSquillaGatewayAction('stop')}
            disabled={isBusy}
            className={buttonClass}
          >
            <XCircleIcon className="h-3.5 w-3.5" />
            {i18nService.t('coworkAgentOpenSquillaGatewayStop')}
          </button>
          <button
            type="button"
            onClick={() => void refreshOpenSquillaGatewayStatus()}
            disabled={isBusy}
            className={buttonClass}
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${openSquillaGatewayBusyAction === 'status' ? 'animate-spin' : ''}`} />
            {i18nService.t('coworkAgentOpenSquillaGatewayRefresh')}
          </button>
        </div>
      </div>
    );
  };

  const renderAgentEngineMeta = (engine: CoworkAgentEngine) => {
    const cliStatus = getCliEngineStatus(engine);
    if (!cliStatus) return null;
    const canInstall = window.electron?.platform === 'darwin' || window.electron?.platform === 'win32';
    const isInstalling = agentCliInstallingAppType === cliStatus.appType;
    const installProgress = agentCliInstallProgress[cliStatus.appType];
    const isChecking = cliStatus.checking === true;
    const authMeta = getCliAuthMeta(cliStatus);
    const authSource = formatCliAuthSource(cliStatus);

    const rows = [
      {
        label: i18nService.t('coworkAgentEngineCommandPath'),
        value: cliStatus.path || (!isChecking ? cliStatus.error : '') || '',
      },
      {
        label: i18nService.t('coworkAgentEngineVersion'),
        value: cliStatus.version || '',
      },
      {
        label: i18nService.t('coworkAgentEngineConfigPath'),
        value: cliStatus.config.primaryConfigPath,
      },
    ].filter((row) => row.value);

    return (
      <div className="mt-3 space-y-1.5 rounded-lg bg-surface-raised/60 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${cliStatus.found ? 'bg-green-500' : isChecking ? 'bg-primary animate-pulse' : 'bg-amber-500'}`} />
            <span className={cliStatus.found ? 'text-green-600 dark:text-green-400' : isChecking ? 'text-primary' : 'text-amber-600 dark:text-amber-400'}>
              {i18nService.t(cliStatus.found
                ? 'coworkAgentEngineCliInstalled'
                : isChecking
                  ? 'coworkAgentEngineCliChecking'
                  : 'coworkAgentEngineCliMissing')}
            </span>
          </span>
          {!cliStatus.found && !isChecking && (
            canInstall ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleInstallAgentCli(cliStatus.appType);
                }}
                disabled={Boolean(agentCliInstallingAppType)}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-background disabled:opacity-50"
              >
                {i18nService.t(isInstalling ? 'coworkAgentEngineInstallCliInstalling' : 'coworkAgentEngineInstallCli')}
              </button>
            ) : (
              <span className="text-[11px] text-secondary">
                {i18nService.t('coworkAgentEngineInstallCliUnsupported')}
              </span>
            )
          )}
        </div>
        {!cliStatus.found && installProgress && (
          <div className="truncate text-[11px] leading-5 text-secondary" title={installProgress}>
            {installProgress}
          </div>
        )}
        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 text-[11px] leading-5">
          <span className="text-secondary">{i18nService.t('coworkAgentEngineAuthTitle')}</span>
          <span className="min-w-0">
            <span className={`inline-flex max-w-full items-center gap-1.5 truncate ${authMeta.tone}`} title={authSource || authMeta.label}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${authMeta.dot}`} />
              <span className="truncate">{authMeta.label}</span>
            </span>
            {authSource && (
              <span className="ml-1 text-secondary" title={authSource}>
                · {authSource}
              </span>
            )}
          </span>
        </div>
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 text-[11px] leading-5">
            <span className="text-secondary">{row.label}</span>
            <span className="truncate font-mono text-foreground/80" title={row.value}>{row.value}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderOpenClawAgentEngineDetails = () => {
    const cliStatus = agentEnvironmentSnapshot?.engines.find((item) => item.appType === 'openclaw');
    const installProgress = agentCliInstallProgress.openclaw;
    const isInstalling = agentCliInstallingAppType === 'openclaw' || openClawEngineStatus?.phase === 'installing';
    const statusRows = [
      { label: i18nService.t('coworkAgentEngineCommandPath'), value: openClawEngineStatus?.binaryPath || cliStatus?.path || '-' },
      { label: i18nService.t('coworkAgentEngineVersion'), value: openClawEngineStatus?.version || cliStatus?.version || '-' },
      { label: i18nService.t('coworkAgentEngineConfigPath'), value: openClawEngineStatus?.configPath || cliStatus?.config.primaryConfigPath || '-' },
      { label: i18nService.t('coworkAgentOpenClawGateway'), value: openClawEngineStatus?.gatewayUrl || (openClawEngineStatus?.gatewayPort ? `loopback:${openClawEngineStatus.gatewayPort}` : '-') },
      { label: i18nService.t('coworkAgentOpenClawGatewayMode'), value: openClawEngineStatus?.gatewayMode ? i18nService.t(openClawEngineStatus.gatewayMode === 'attached' ? 'coworkAgentOpenClawGatewayAttached' : 'coworkAgentOpenClawGatewayManaged') : '-' },
      { label: i18nService.t('coworkAgentOpenClawCurrentModel'), value: openClawEngineStatus?.currentModel || cliStatus?.config.currentProviderName || '-' },
      { label: i18nService.t('coworkAgentOpenClawFeishuStatus'), value: openClawEngineStatus?.feishuRunning ? i18nService.t('coworkAgentOpenClawFeishuRunning') : openClawEngineStatus?.feishuConfigured ? i18nService.t('coworkAgentOpenClawFeishuConfigured') : '-' },
    ];
    const sourceOptions = [
      {
        value: ExternalAgentConfigSourceValue.LocalCli,
        labelKey: 'coworkAgentConfigSourceLocalCli',
        hintKey: 'coworkAgentOpenClawLocalCliHint',
      },
      {
        value: ExternalAgentConfigSourceValue.WesightModel,
        labelKey: 'coworkAgentConfigSourceWesightModel',
        hintKey: 'coworkAgentOpenClawWesightModelHint',
      },
    ];

    return (
      <div className="mt-4 space-y-4">
        {renderAgentEngineMeta(CoworkAgentEngineValue.OpenClaw)}
        <div className="space-y-3 border-t border-border pt-4">
          <div className="text-sm font-medium text-foreground">
            {i18nService.t('coworkAgentConfigSourceTitle')}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {sourceOptions.map((option) => {
              const checked = openclawConfigSource === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex gap-3 rounded-xl border px-3 py-3 transition-colors ${isSaving ? 'cursor-wait opacity-70' : 'cursor-pointer'} ${checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface-raised'}`}
                >
                  <input
                    type="radio"
                    name="openclaw-config-source"
                    checked={checked}
                    disabled={isSaving}
                    onChange={() => setOpenClawConfigSource(option.value)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {i18nService.t(option.labelKey)}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-secondary">
                      {i18nService.t(option.hintKey)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className={`rounded-xl border px-4 py-3 text-sm ${openClawEngineStatus?.phase === 'error'
          ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
          : 'border-border bg-surface-raised/60 text-foreground'}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              {resolveOpenClawStatusText(openClawEngineStatus)}
              {openClawProgressPercent !== null && (
                <span className="ml-2 text-xs opacity-80">{openClawProgressPercent}%</span>
              )}
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (openClawEngineStatus?.phase === 'not_installed') {
                  void coworkService.installOpenClawEngine();
                } else {
                  void coworkService.restartOpenClawGateway();
                }
              }}
              disabled={isInstalling || openClawEngineStatus?.phase === 'starting'}
              className="shrink-0 rounded-md border border-current/20 px-2 py-1 text-[11px] font-medium hover:bg-black/5 disabled:cursor-wait disabled:opacity-50 dark:hover:bg-white/10"
            >
              {i18nService.t(openClawEngineStatus?.phase === 'not_installed'
                ? 'coworkOpenClawInstallCli'
                : openClawEngineStatus?.gatewayMode === 'attached'
                  ? 'coworkOpenClawReconnectGateway'
                  : 'coworkOpenClawRestartGateway')}
            </button>
          </div>
          {installProgress && (
            <div className="mt-2 truncate text-[11px] leading-5 text-secondary" title={installProgress}>
              {installProgress}
            </div>
          )}
          {openClawProgressPercent !== null && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${openClawProgressPercent}%` }}
              />
            </div>
          )}
          <div className="mt-3 space-y-1">
            {statusRows.map((row) => (
              <div key={row.label} className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 text-[11px] leading-5">
                <span className="text-secondary">{row.label}</span>
                <span className="truncate font-mono text-foreground/80" title={row.value}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border px-3 py-3 text-xs leading-5 text-secondary">
          {i18nService.t('coworkAgentOpenClawFeishuLocalHint')}
        </div>

        {openclawConfigSource === ExternalAgentConfigSourceValue.WesightModel && (
          <div className="flex flex-col gap-2 rounded-xl border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-5 text-secondary">
              {i18nService.t('coworkAgentOpenClawSyncGlobalHint')}
            </div>
            <button
              type="button"
              onClick={() => void handleSyncOpenClawGlobalConfig()}
              disabled={openclawGlobalSyncing}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-raised disabled:cursor-wait disabled:opacity-50"
            >
              {i18nService.t(openclawGlobalSyncing
                ? 'coworkAgentOpenClawSyncGlobalSyncing'
                : 'coworkAgentOpenClawSyncGlobal')}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderHermesAgentEngineDetails = () => (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="text-xs text-secondary">
        {i18nService.t('coworkHermesInstallHint')}
      </div>
      <div className={`rounded-xl border px-4 py-3 text-sm ${hermesEngineStatus?.phase === 'error'
        ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
        : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300'}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            {resolveHermesStatusText(hermesEngineStatus)}
            {hermesProgressPercent !== null && (
              <span className="ml-2 text-xs opacity-80">{hermesProgressPercent}%</span>
            )}
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (hermesEngineStatus?.phase === 'not_installed') {
                void handleInstallHermesEngine();
              } else {
                void coworkService.restartHermesGateway();
              }
            }}
            disabled={
              agentCliInstallingAppType === 'hermes'
              || hermesEngineStatus?.phase === 'installing'
              || hermesEngineStatus?.phase === 'starting'
            }
            className="shrink-0 rounded-md border border-current/20 px-2 py-1 text-[11px] font-medium hover:bg-black/5 disabled:cursor-wait disabled:opacity-50 dark:hover:bg-white/10"
          >
            {i18nService.t(
              agentCliInstallingAppType === 'hermes'
                ? 'coworkAgentEngineInstallCliInstalling'
                : hermesEngineStatus?.phase === 'not_installed'
                  ? 'coworkAgentEngineInstallCli'
                  : 'coworkHermesRestartGateway',
            )}
          </button>
        </div>
        {hermesProgressPercent !== null && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${hermesProgressPercent}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );

  const renderCodexAppAgentEngineDetails = () => {
    const status = agentEnvironmentSnapshot?.codexApp;
    const ready = Boolean(status?.cliFound && status.appInstalled && status.appServerSupported);
    const rows = [
      { label: i18nService.t('coworkAgentEngineCommandPath'), value: status?.cliPath || '-' },
      { label: i18nService.t('coworkAgentEngineVersion'), value: status?.cliVersion || '-' },
      { label: i18nService.t('coworkAgentCodexAppAppPath'), value: status?.appPath || '-' },
      {
        label: i18nService.t('coworkAgentCodexAppServer'),
        value: status?.appServerSupported
          ? i18nService.t('coworkAgentCodexAppServerReady')
          : i18nService.t('coworkAgentCodexAppServerMissing'),
      },
      { label: i18nService.t('coworkAgentCodexAppSocket'), value: status?.socketPath || '-' },
      { label: i18nService.t('coworkAgentCodexAppModelSource'), value: i18nService.t('coworkAgentCodexAppModelSourceValue') },
    ];

    return (
      <div className="mt-4 space-y-4">
        <div className={`rounded-xl border px-4 py-3 text-sm ${ready
          ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300'
          : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300'}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">
                {i18nService.t('coworkAgentCodexAppStatusTitle')}
              </div>
              <div className="mt-1 text-xs opacity-90">
                {status?.message || i18nService.t('coworkAgentCodexAppMissing')}
              </div>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void handleStartCodexApp();
              }}
              disabled={codexAppStarting}
              className="shrink-0 rounded-md border border-current/20 px-2 py-1 text-[11px] font-medium hover:bg-black/5 disabled:cursor-wait disabled:opacity-50 dark:hover:bg-white/10"
            >
              {i18nService.t(status?.appRunning ? 'coworkAgentCodexAppReconnect' : 'coworkAgentCodexAppLaunch')}
            </button>
          </div>
          {codexAppStarting && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
            </div>
          )}
          <div className="mt-3 space-y-1">
            {rows.map((row) => (
              <div key={row.label} className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 text-[11px] leading-5">
                <span className="text-secondary">{row.label}</span>
                <span className="truncate font-mono text-foreground/80" title={row.value}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border px-3 py-3 text-xs leading-5 text-secondary">
          {i18nService.t('coworkAgentEngineCodexAppHint')}
        </div>
      </div>
    );
  };

  const renderSelectedAgentEngineDetails = (engine: CoworkAgentEngine) => {
    if (engine === CoworkAgentEngineValue.CodexApp) {
      return renderCodexAppAgentEngineDetails();
    }
    if (
      engine === CoworkAgentEngineValue.ClaudeCode
      || engine === CoworkAgentEngineValue.Codex
      || engine === CoworkAgentEngineValue.Hermes
      || engine === CoworkAgentEngineValue.OpenCode
      || engine === CoworkAgentEngineValue.GrokBuild
      || engine === CoworkAgentEngineValue.QwenCode
      || engine === CoworkAgentEngineValue.DeepSeekTui
      || engine === CoworkAgentEngineValue.OpenSquilla
      || engine === CoworkAgentEngineValue.KimiCode
    ) {
      return (
        <div className="mt-4 space-y-4">
          {renderAgentEngineMeta(engine)}
          {engine === CoworkAgentEngineValue.Hermes && renderHermesAgentEngineDetails()}
          {renderAgentConfigSourceSettings()}
        </div>
      );
    }
    if (engine === CoworkAgentEngineValue.OpenClaw) {
      return renderOpenClawAgentEngineDetails();
    }
    return (
      <div className="mt-4 rounded-lg border border-border bg-surface-raised/50 px-3 py-2 text-xs leading-5 text-secondary">
        {i18nService.t('coworkAgentEngineNoExtraConfig')}
      </div>
    );
  };

  const renderAgentEngineOption = (option: typeof COWORK_AGENT_ENGINE_OPTIONS[number]) => {
    const checked = coworkAgentEngine === option.value;
    const expanded = checked && expandedCoworkAgentEngine === option.value;
    return (
      <div
        key={option.value}
        role="button"
        tabIndex={0}
        onClick={() => handleSelectCoworkAgentEngine(option.value)}
        aria-disabled={isSaving}
        onKeyDown={(event) => {
          if (isSaving) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleSelectCoworkAgentEngine(option.value);
          }
        }}
        className={`rounded-xl border px-3 py-3 text-sm transition-colors ${isSaving ? 'cursor-wait opacity-70' : 'cursor-pointer'} ${checked
          ? 'border-primary/60 bg-primary/5'
          : `border-border ${isSaving ? '' : 'hover:bg-surface-raised'}`}`}
      >
        <div className="flex items-start gap-3">
          <input
            type="radio"
            name="cowork-agent-engine"
            checked={checked}
            disabled={isSaving}
            onChange={() => handleSelectCoworkAgentEngine(option.value)}
            onClick={(event) => event.stopPropagation()}
            className="mt-1"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-foreground">
              {i18nService.t(option.labelKey)}
            </span>
            <span className="mt-1 block text-xs leading-5 text-secondary">
              {i18nService.t(option.hintKey)}
            </span>
          </span>
          {checked && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleToggleCoworkAgentEngineDetails(option.value);
              }}
              disabled={isSaving}
              className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-background disabled:cursor-wait disabled:opacity-50"
            >
              {i18nService.t(expanded ? 'coworkAgentEngineCollapseConfig' : 'coworkAgentEngineExpandConfig')}
            </button>
          )}
        </div>
        {expanded && renderSelectedAgentEngineDetails(option.value)}
      </div>
    );
  };

  const selectedAgentConfigSource = useMemo<ExternalAgentConfigSource | null>(() => {
    if (selectedExternalAgentAppType === 'claude') return claudeCodeConfigSource;
    if (selectedExternalAgentAppType === 'codex') return codexConfigSource;
    if (selectedExternalAgentAppType === 'hermes') return hermesConfigSource;
    if (selectedExternalAgentAppType === 'opencode') return opencodeConfigSource;
    if (selectedExternalAgentAppType === 'qwen') return qwenCodeConfigSource;
    if (selectedExternalAgentAppType === 'deepseek_tui') return deepseekTuiConfigSource;
    if (selectedExternalAgentAppType === 'opensquilla') return opensquillaConfigSource;
    if (selectedExternalAgentAppType === 'kimi') return kimiCodeConfigSource;
    return null;
  }, [
    claudeCodeConfigSource,
    codexConfigSource,
    deepseekTuiConfigSource,
    hermesConfigSource,
    kimiCodeConfigSource,
    opencodeConfigSource,
    opensquillaConfigSource,
    qwenCodeConfigSource,
    selectedExternalAgentAppType,
  ]);

  // Claude Code in local-CLI mode shows the machine's live config instead of a
  // provider switcher, so it is read fresh whenever that panel becomes visible.
  const isClaudeLocalConfigMode = selectedExternalAgentAppType === 'claude'
    && selectedAgentConfigSource === ExternalAgentConfigSourceValue.LocalCli;

  useEffect(() => {
    if (activeTab !== SettingsTab.CoworkAgentEngine || !isClaudeLocalConfigMode) return;
    void loadClaudeLiveConfig();
  }, [activeTab, isClaudeLocalConfigMode, loadClaudeLiveConfig]);

  const setSelectedAgentConfigSource = (source: ExternalAgentConfigSource) => {
    if (isSaving) return;
    if (selectedExternalAgentAppType === 'claude') {
      setClaudeCodeConfigSource(source);
      return;
    }
    if (selectedExternalAgentAppType === 'codex') {
      setCodexConfigSource(source);
      return;
    }
    if (selectedExternalAgentAppType === 'hermes') {
      setHermesConfigSource(source);
      return;
    }
    if (selectedExternalAgentAppType === 'opencode') {
      setOpenCodeConfigSource(source);
      return;
    }
    if (selectedExternalAgentAppType === 'qwen') {
      setQwenCodeConfigSource(source);
      return;
    }
    if (selectedExternalAgentAppType === 'deepseek_tui') {
      setDeepSeekTuiConfigSource(source);
      return;
    }
    if (selectedExternalAgentAppType === 'opensquilla') {
      setOpenSquillaConfigSource(source);
      return;
    }
    if (selectedExternalAgentAppType === 'kimi') {
      setKimiCodeConfigSource(source);
    }
  };

  const selectedAgentProviderList = selectedExternalAgentAppType
    ? agentProviderLists[selectedExternalAgentAppType] ?? null
    : null;
  const selectedAgentProvider = useMemo<ExternalAgentProvider | null>(() => {
    const providers = selectedAgentProviderList?.providers ?? [];
    return providers.find((provider) => provider.id === selectedAgentProviderList?.currentProviderId)
      ?? providers.find((provider) => provider.isCurrent)
      ?? providers[0]
      ?? null;
  }, [selectedAgentProviderList]);

  const currentModelSummary = useMemo(() => {
    const config = configService.getConfig();
    const providerKey = config.model?.defaultModelProvider || activeProvider;
    const providerConfig = providers[providerKey as ProviderType];
    const modelId = config.model?.defaultModel || providerConfig?.models?.[0]?.id || '';
    const providerName = providerConfig
      ? getProviderDisplayName(providerKey, providerConfig)
      : providerKey;
    const apiFormat = providerConfig
      ? getEffectiveApiFormat(providerKey, providerConfig.apiFormat)
      : undefined;
    return {
      providerKey,
      providerName,
      modelId,
      apiFormat,
      baseUrl: providerConfig?.baseUrl ?? '',
    };
  }, [activeProvider, providers]);

  const effectiveAgentModelSummary = useMemo(() => {
    if (isClaudeLocalConfigMode) {
      return {
        providerKey: null,
        providerName: claudeLiveConfig?.configPath
          || claudeLiveConfig?.sourceName
          || i18nService.t('coworkAgentClaudeLiveConfigEmpty'),
        modelId: claudeLiveConfig?.resolvedModel || i18nService.t('coworkAgentClaudeLiveConfigModelDefault'),
        apiFormat: 'anthropic',
        baseUrl: claudeLiveConfig?.baseUrl || '',
      };
    }
    if (selectedAgentConfigSource === ExternalAgentConfigSourceValue.LocalCli && selectedAgentProvider) {
      return {
        providerKey: selectedAgentProvider.id,
        providerName: selectedAgentProvider.name,
        modelId: selectedAgentProvider.summary.model || i18nService.t('coworkAgentLocalModelUnknown'),
        apiFormat: selectedExternalAgentAppType === 'claude' ? 'anthropic' : 'openai',
        baseUrl: selectedAgentProvider.summary.baseUrl,
      };
    }
    return currentModelSummary;
  }, [
    claudeLiveConfig,
    currentModelSummary,
    isClaudeLocalConfigMode,
    selectedAgentConfigSource,
    selectedAgentProvider,
    selectedExternalAgentAppType,
  ]);

  const handleSelectAgentProvider = async (providerId: string) => {
    if (!selectedExternalAgentAppType || !providerId || agentProviderSwitchingId) return;
    setAgentProviderSwitchingId(providerId);
    setError(null);
    try {
      const result = await coworkService.setCurrentAgentProvider(selectedExternalAgentAppType, providerId);
      if (!result.success) {
        setError(result.error || i18nService.t('coworkAgentLocalModelSwitchFailed'));
        return;
      }
      setAgentProviderLists((prev) => ({
        ...prev,
        [selectedExternalAgentAppType]: result,
      }));
      window.dispatchEvent(new CustomEvent('wesight-agent-provider-changed', {
        detail: { appType: selectedExternalAgentAppType },
      }));
      await refreshAgentEnvironmentSnapshot({
        forceRefresh: true,
        appTypes: [selectedExternalAgentAppType],
      });
    } finally {
      setAgentProviderSwitchingId(null);
    }
  };

  const applyImportedModelProviderToState = (
    providerKey: string | undefined,
    providerConfig: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      apiFormat?: 'anthropic' | 'openai' | 'gemini';
      displayName?: string;
      models?: Array<{ id: string; name: string; supportsImage?: boolean }>;
    } | undefined,
  ) => {
    if (!providerKey || !providerConfig) return;
    setProviders(prev => ({
      ...prev,
      [providerKey]: providerConfig as ProviderConfig,
    }));
    if ((providerKeys as readonly string[]).includes(providerKey)) {
      setActiveProvider(providerKey as ProviderType);
    }
  };

  const handleImportLocalAgentConfigToModelSettings = async () => {
    if (!selectedExternalAgentAppType) return;
    setError(null);
    setAgentConfigImportingAppType(selectedExternalAgentAppType);
    try {
      const result = await coworkService.importLocalAgentConfigToModelSettings(selectedExternalAgentAppType);
      if (!result.success) {
        setError(result.error || i18nService.t('coworkAgentConfigImportModelFailed'));
        return;
      }
      applyImportedModelProviderToState(result.providerKey, result.providerConfig);
      setNoticeMessage(result.duplicate
        ? i18nService.t('coworkAgentConfigImportModelDuplicate')
        : i18nService.t('coworkAgentConfigImportModelSuccess'));
    } finally {
      setAgentConfigImportingAppType(null);
    }
  };

  const handleSyncOpenClawGlobalConfig = async () => {
    setError(null);
    setOpenClawGlobalSyncing(true);
    try {
      const result = await coworkService.syncOpenClawGlobalConfig();
      if (!result.success) {
        setError(result.error || i18nService.t('coworkAgentOpenClawSyncGlobalFailed'));
        return;
      }
      if (result.status) {
        setOpenClawEngineStatus(result.status);
      }
      setOpenClawConfigSource(ExternalAgentConfigSourceValue.WesightModel);
      setNoticeMessage(i18nService.t('coworkAgentOpenClawSyncGlobalSuccess'));
    } finally {
      setOpenClawGlobalSyncing(false);
    }
  };

  const handleSyncOpenCodeGlobalConfig = async () => {
    setError(null);
    setOpenCodeGlobalSyncing(true);
    try {
      const result = await coworkService.syncOpenCodeGlobalConfig();
      if (!result.success) {
        setError(result.error || i18nService.t('coworkAgentOpenCodeSyncGlobalFailed'));
        return;
      }
      setAgentProviderLists((prev) => ({
        ...prev,
        opencode: result,
      }));
      setNoticeMessage(i18nService.t('coworkAgentOpenCodeSyncGlobalSuccess'));
      window.dispatchEvent(new CustomEvent('wesight-agent-provider-changed', {
        detail: { appType: 'opencode' },
      }));
    } finally {
      setOpenCodeGlobalSyncing(false);
    }
  };

  const handleSyncQwenCodeGlobalConfig = async () => {
    setError(null);
    setQwenCodeGlobalSyncing(true);
    try {
      const result = await coworkService.syncQwenCodeGlobalConfig();
      if (!result.success) {
        setError(result.error || i18nService.t('coworkAgentQwenCodeSyncGlobalFailed'));
        return;
      }
      setAgentProviderLists((prev) => ({
        ...prev,
        qwen: result,
      }));
      setNoticeMessage(i18nService.t('coworkAgentQwenCodeSyncGlobalSuccess'));
      window.dispatchEvent(new CustomEvent('wesight-agent-provider-changed', {
        detail: { appType: 'qwen' },
      }));
    } finally {
      setQwenCodeGlobalSyncing(false);
    }
  };

  const handleSyncDeepSeekTuiGlobalConfig = async () => {
    setError(null);
    setDeepSeekTuiGlobalSyncing(true);
    try {
      const result = await coworkService.syncDeepSeekTuiGlobalConfig();
      if (!result.success) {
        setError(result.error || i18nService.t('coworkAgentDeepSeekTuiSyncGlobalFailed'));
        return;
      }
      setAgentProviderLists((prev) => ({
        ...prev,
        deepseek_tui: result,
      }));
      setNoticeMessage(i18nService.t('coworkAgentDeepSeekTuiSyncGlobalSuccess'));
      window.dispatchEvent(new CustomEvent('wesight-agent-provider-changed', {
        detail: { appType: 'deepseek_tui' },
      }));
    } finally {
      setDeepSeekTuiGlobalSyncing(false);
    }
  };

  const renderAgentConfigSourceSettings = () => {
    if (!selectedExternalAgentAppType || !selectedAgentConfigSource) return null;
    const cliStatus = agentEnvironmentSnapshot?.engines.find((item) => item.appType === selectedExternalAgentAppType);
    const configPaths = cliStatus
      ? [cliStatus.config.primaryConfigPath, ...cliStatus.config.secondaryConfigPaths].filter(Boolean)
      : [];
    const isImporting = agentConfigImportingAppType === selectedExternalAgentAppType;
    const sourceOptions = selectedExternalAgentAppType === 'opensquilla' || selectedExternalAgentAppType === 'kimi' ? [
      {
        value: ExternalAgentConfigSourceValue.LocalCli,
        labelKey: 'coworkAgentConfigSourceLocalCli',
        hintKey: selectedExternalAgentAppType === 'kimi'
          ? 'coworkAgentKimiCodeLocalConfigHint'
          : 'coworkAgentOpenSquillaLocalConfigHint',
      },
    ] : selectedExternalAgentAppType === 'claude' ? [
      {
        value: ExternalAgentConfigSourceValue.LocalCli,
        labelKey: 'coworkAgentConfigSourceClaudeLocal',
        hintKey: 'coworkAgentConfigSourceClaudeLocalHint',
      },
      {
        value: ExternalAgentConfigSourceValue.WesightModel,
        labelKey: 'coworkAgentConfigSourceWesightModel',
        hintKey: 'coworkAgentConfigSourceClaudeWesightHint',
      },
    ] : [
      {
        value: ExternalAgentConfigSourceValue.WesightModel,
        labelKey: 'coworkAgentConfigSourceWesightModel',
        hintKey: 'coworkAgentConfigSourceWesightModelHint',
      },
      {
        value: ExternalAgentConfigSourceValue.LocalCli,
        labelKey: 'coworkAgentConfigSourceLocalCli',
        hintKey: 'coworkAgentConfigSourceLocalCliHint',
      },
    ];

    return (
      <div className="space-y-4 border-t border-border pt-5">
        <div>
          <div className="text-sm font-medium text-foreground">
            {i18nService.t('coworkAgentConfigSourceTitle')}
          </div>
          <div className="mt-1 text-xs leading-5 text-secondary">
            {i18nService.t('coworkAgentConfigSourceHint')}
          </div>
        </div>

        {renderCoworkAgentApplyProgress()}

        <div className="grid gap-3 sm:grid-cols-2">
          {sourceOptions.map((option) => {
            const checked = selectedAgentConfigSource === option.value;
            return (
              <label
                key={option.value}
                className={`flex gap-3 rounded-xl border px-3 py-3 transition-colors ${isSaving ? 'cursor-wait opacity-70' : 'cursor-pointer'} ${checked
                  ? 'border-primary bg-primary/5'
                  : `border-border ${isSaving ? '' : 'hover:bg-surface-raised'}`}`}
              >
                <input
                  type="radio"
                  name="external-agent-config-source"
                  checked={checked}
                  disabled={isSaving}
                  onChange={() => setSelectedAgentConfigSource(option.value)}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {i18nService.t(option.labelKey)}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-secondary">
                    {i18nService.t(option.hintKey)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {selectedExternalAgentAppType === 'opencode' && (
          <div className="rounded-xl border border-border px-3 py-3">
            <div className="text-xs font-medium text-foreground">
              {i18nService.t('coworkAgentOpenCodePermissionTitle')}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-secondary">
              {i18nService.t('coworkAgentOpenCodePermissionHint')}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                {
                  value: OpenCodePermissionModeValue.Auto,
                  labelKey: 'coworkAgentOpenCodePermissionAuto',
                  hintKey: 'coworkAgentOpenCodePermissionAutoHint',
                },
                {
                  value: OpenCodePermissionModeValue.Conservative,
                  labelKey: 'coworkAgentOpenCodePermissionConservative',
                  hintKey: 'coworkAgentOpenCodePermissionConservativeHint',
                },
              ].map((option) => {
                const checked = opencodePermissionMode === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex gap-3 rounded-lg border px-3 py-2 ${checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface-raised'}`}
                  >
                    <input
                      type="radio"
                      name="opencode-permission-mode"
                      checked={checked}
                      disabled={isSaving}
                      onChange={() => setOpenCodePermissionMode(option.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-xs font-medium text-foreground">
                        {i18nService.t(option.labelKey)}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-5 text-secondary">
                        {i18nService.t(option.hintKey)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {selectedExternalAgentAppType === 'claude' && (
          <div className="rounded-xl border border-border px-3 py-3">
            <div className="text-xs font-medium text-foreground">
              {i18nService.t('coworkAgentClaudeCodePermissionTitle')}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-secondary">
              {i18nService.t('coworkAgentClaudeCodePermissionHint')}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                {
                  value: ClaudeCodePermissionModeValue.BypassPermissions,
                  labelKey: 'coworkAgentClaudeCodePermissionAuto',
                  hintKey: 'coworkAgentClaudeCodePermissionAutoHint',
                },
                {
                  value: ClaudeCodePermissionModeValue.Default,
                  labelKey: 'coworkAgentClaudeCodePermissionDefault',
                  hintKey: 'coworkAgentClaudeCodePermissionDefaultHint',
                },
                {
                  value: ClaudeCodePermissionModeValue.Plan,
                  labelKey: 'coworkAgentClaudeCodePermissionPlan',
                  hintKey: 'coworkAgentClaudeCodePermissionPlanHint',
                },
                {
                  value: ClaudeCodePermissionModeValue.AcceptEdits,
                  labelKey: 'coworkAgentClaudeCodePermissionAcceptEdits',
                  hintKey: 'coworkAgentClaudeCodePermissionAcceptEditsHint',
                },
              ].map((option) => {
                const checked = claudeCodePermissionMode === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex gap-3 rounded-lg border px-3 py-2 ${checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface-raised'}`}
                  >
                    <input
                      type="radio"
                      name="claude-code-permission-mode"
                      checked={checked}
                      disabled={isSaving}
                      onChange={() => setClaudeCodePermissionMode(option.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-xs font-medium text-foreground">
                        {i18nService.t(option.labelKey)}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-5 text-secondary">
                        {i18nService.t(option.hintKey)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {selectedExternalAgentAppType === 'qwen' && (
          <div className="rounded-xl border border-border px-3 py-3">
            <div className="text-xs font-medium text-foreground">
              {i18nService.t('coworkAgentQwenCodePermissionTitle')}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-secondary">
              {i18nService.t('coworkAgentQwenCodePermissionHint')}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                {
                  value: QwenCodePermissionModeValue.Auto,
                  labelKey: 'coworkAgentQwenCodePermissionAuto',
                  hintKey: 'coworkAgentQwenCodePermissionAutoHint',
                },
                {
                  value: QwenCodePermissionModeValue.Conservative,
                  labelKey: 'coworkAgentQwenCodePermissionConservative',
                  hintKey: 'coworkAgentQwenCodePermissionConservativeHint',
                },
              ].map((option) => {
                const checked = qwenCodePermissionMode === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex gap-3 rounded-lg border px-3 py-2 ${checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface-raised'}`}
                  >
                    <input
                      type="radio"
                      name="qwen-code-permission-mode"
                      checked={checked}
                      disabled={isSaving}
                      onChange={() => setQwenCodePermissionMode(option.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-xs font-medium text-foreground">
                        {i18nService.t(option.labelKey)}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-5 text-secondary">
                        {i18nService.t(option.hintKey)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {selectedExternalAgentAppType === 'deepseek_tui' && (
          <div className="rounded-xl border border-border px-3 py-3">
            <div className="text-xs font-medium text-foreground">
              {i18nService.t('coworkAgentDeepSeekTuiPermissionTitle')}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-secondary">
              {i18nService.t('coworkAgentDeepSeekTuiPermissionHint')}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                {
                  value: DeepSeekTuiPermissionModeValue.Auto,
                  labelKey: 'coworkAgentDeepSeekTuiPermissionAuto',
                  hintKey: 'coworkAgentDeepSeekTuiPermissionAutoHint',
                },
                {
                  value: DeepSeekTuiPermissionModeValue.Conservative,
                  labelKey: 'coworkAgentDeepSeekTuiPermissionConservative',
                  hintKey: 'coworkAgentDeepSeekTuiPermissionConservativeHint',
                },
              ].map((option) => {
                const checked = deepseekTuiPermissionMode === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex gap-3 rounded-lg border px-3 py-2 ${checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface-raised'}`}
                  >
                    <input
                      type="radio"
                      name="deepseek-tui-permission-mode"
                      checked={checked}
                      disabled={isSaving}
                      onChange={() => setDeepSeekTuiPermissionMode(option.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-xs font-medium text-foreground">
                        {i18nService.t(option.labelKey)}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-5 text-secondary">
                        {i18nService.t(option.hintKey)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {selectedExternalAgentAppType === 'opensquilla' && (
          <>
            {renderOpenSquillaGatewayControls()}
            <div className="rounded-xl border border-border px-3 py-3">
              <div className="text-xs font-medium text-foreground">
                {i18nService.t('coworkAgentOpenSquillaPermissionTitle')}
              </div>
              <div className="mt-1 text-[11px] leading-5 text-secondary">
                {i18nService.t('coworkAgentOpenSquillaPermissionHint')}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  {
                    value: OpenSquillaPermissionModeValue.Bypass,
                    labelKey: 'coworkAgentOpenSquillaPermissionBypass',
                    hintKey: 'coworkAgentOpenSquillaPermissionBypassHint',
                  },
                  {
                    value: OpenSquillaPermissionModeValue.On,
                    labelKey: 'coworkAgentOpenSquillaPermissionOn',
                    hintKey: 'coworkAgentOpenSquillaPermissionOnHint',
                  },
                  {
                    value: OpenSquillaPermissionModeValue.Restricted,
                    labelKey: 'coworkAgentOpenSquillaPermissionRestricted',
                    hintKey: 'coworkAgentOpenSquillaPermissionRestrictedHint',
                  },
                  {
                    value: OpenSquillaPermissionModeValue.Full,
                    labelKey: 'coworkAgentOpenSquillaPermissionFull',
                    hintKey: 'coworkAgentOpenSquillaPermissionFullHint',
                  },
                ].map((option) => {
                  const checked = opensquillaPermissionMode === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex gap-3 rounded-lg border px-3 py-2 ${checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface-raised'}`}
                    >
                      <input
                        type="radio"
                        name="opensquilla-permission-mode"
                        checked={checked}
                        disabled={isSaving}
                        onChange={() => setOpenSquillaPermissionMode(option.value)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-xs font-medium text-foreground">
                          {i18nService.t(option.labelKey)}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-5 text-secondary">
                          {i18nService.t(option.hintKey)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {selectedExternalAgentAppType === 'kimi' && (
          <div className="rounded-xl border border-border px-3 py-3">
            <div className="text-xs font-medium text-foreground">
              {i18nService.t('coworkAgentKimiCodePermissionTitle')}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-secondary">
              {i18nService.t('coworkAgentKimiCodePermissionHint')}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                {
                  value: KimiCodePermissionModeValue.Auto,
                  labelKey: 'coworkAgentKimiCodePermissionAuto',
                  hintKey: 'coworkAgentKimiCodePermissionAutoHint',
                },
                {
                  value: KimiCodePermissionModeValue.Yolo,
                  labelKey: 'coworkAgentKimiCodePermissionYolo',
                  hintKey: 'coworkAgentKimiCodePermissionYoloHint',
                },
                {
                  value: KimiCodePermissionModeValue.Plan,
                  labelKey: 'coworkAgentKimiCodePermissionPlan',
                  hintKey: 'coworkAgentKimiCodePermissionPlanHint',
                },
              ].map((option) => {
                const checked = kimiCodePermissionMode === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex gap-3 rounded-lg border px-3 py-2 ${checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface-raised'}`}
                  >
                    <input
                      type="radio"
                      name="kimi-code-permission-mode"
                      checked={checked}
                      disabled={isSaving}
                      onChange={() => setKimiCodePermissionMode(option.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-xs font-medium text-foreground">
                        {i18nService.t(option.labelKey)}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-5 text-secondary">
                        {i18nService.t(option.hintKey)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {isClaudeLocalConfigMode && (
          <div className="rounded-xl border border-border px-3 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-medium text-foreground">
                  {i18nService.t('coworkAgentClaudeLiveConfigTitle')}
                </div>
                <div className="mt-1 text-[11px] leading-5 text-secondary">
                  {i18nService.t('coworkAgentClaudeLiveConfigHint')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadClaudeLiveConfig()}
                disabled={claudeLiveConfigLoading}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-raised disabled:cursor-wait disabled:opacity-50"
              >
                {i18nService.t(claudeLiveConfigLoading
                  ? 'coworkAgentLocalModelRefreshing'
                  : 'coworkAgentLocalModelRefresh')}
              </button>
            </div>
            {claudeLiveConfig ? (
              <div className="mt-3 grid gap-1.5 text-[11px] leading-5 text-secondary">
                <div className="min-w-0">
                  {i18nService.t('coworkAgentClaudeLiveConfigSource')}:{' '}
                  <span className="break-all font-mono text-foreground">
                    {claudeLiveConfig.configPath || claudeLiveConfig.sourceName}
                  </span>
                </div>
                <div>
                  {i18nService.t('coworkAgentCurrentModelModel')}:{' '}
                  <span className="font-mono text-foreground">
                    {claudeLiveConfig.resolvedModel || i18nService.t('coworkAgentClaudeLiveConfigModelDefault')}
                  </span>
                  {claudeLiveConfig.model
                    && claudeLiveConfig.resolvedModel !== claudeLiveConfig.model && (
                    <span className="text-secondary">
                      {' '}({i18nService.t('coworkAgentClaudeLiveConfigModelAlias')}: {claudeLiveConfig.model})
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  {i18nService.t('coworkAgentClaudeLiveConfigEndpoint')}:{' '}
                  <span className="break-all font-mono text-foreground">
                    {claudeLiveConfig.baseUrl || i18nService.t('coworkAgentClaudeLiveConfigEndpointOfficial')}
                  </span>
                </div>
                <div>
                  {i18nService.t('coworkAgentClaudeLiveConfigCredential')}:{' '}
                  <span className="font-mono text-foreground">
                    {claudeLiveConfig.credentialSource
                      || i18nService.t(claudeLiveConfig.usesOfficialLogin
                        ? 'coworkAgentClaudeLiveConfigCredentialOauth'
                        : 'coworkAgentClaudeLiveConfigCredentialNone')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-[11px] leading-5 text-secondary">
                {i18nService.t(claudeLiveConfigLoading ? 'loading' : 'coworkAgentClaudeLiveConfigEmpty')}
              </div>
            )}
          </div>
        )}

        {!isClaudeLocalConfigMode && selectedAgentConfigSource === ExternalAgentConfigSourceValue.LocalCli && (
          <div className="rounded-xl border border-border px-3 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-medium text-foreground">
                  {i18nService.t('coworkAgentLocalModelTitle')}
                </div>
                <div className="mt-1 text-[11px] leading-5 text-secondary">
                  {i18nService.t('coworkAgentLocalModelHint')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => selectedExternalAgentAppType && void loadAgentProviders(selectedExternalAgentAppType)}
                disabled={agentProviderLoadingAppType === selectedExternalAgentAppType}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-raised disabled:cursor-wait disabled:opacity-50"
              >
                {i18nService.t(agentProviderLoadingAppType === selectedExternalAgentAppType
                  ? 'coworkAgentLocalModelRefreshing'
                  : 'coworkAgentLocalModelRefresh')}
              </button>
            </div>
            <select
              value={selectedAgentProvider?.id ?? ''}
              onChange={(event) => void handleSelectAgentProvider(event.target.value)}
              disabled={
                agentProviderLoadingAppType === selectedExternalAgentAppType
                || Boolean(agentProviderSwitchingId)
                || (selectedAgentProviderList?.providers ?? []).length === 0
              }
              className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary disabled:cursor-wait disabled:opacity-70"
            >
              {(selectedAgentProviderList?.providers ?? []).length === 0 ? (
                <option value="">
                  {i18nService.t(agentProviderLoadingAppType === selectedExternalAgentAppType
                    ? 'loading'
                    : 'coworkAgentLocalModelEmpty')}
                </option>
              ) : (
                (selectedAgentProviderList?.providers ?? []).map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.summary.model
                      ? `${provider.name} · ${provider.summary.model}`
                      : provider.name}
                  </option>
                ))
              )}
            </select>
          </div>
        )}

        {selectedExternalAgentAppType === 'opencode' && selectedAgentConfigSource === ExternalAgentConfigSourceValue.WesightModel && (
          <div className="flex flex-col gap-2 rounded-xl border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-5 text-secondary">
              {i18nService.t('coworkAgentOpenCodeSyncGlobalHint')}
            </div>
            <button
              type="button"
              onClick={() => void handleSyncOpenCodeGlobalConfig()}
              disabled={opencodeGlobalSyncing}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-raised disabled:cursor-wait disabled:opacity-50"
            >
              {i18nService.t(opencodeGlobalSyncing
                ? 'coworkAgentOpenCodeSyncGlobalSyncing'
                : 'coworkAgentOpenCodeSyncGlobal')}
            </button>
          </div>
        )}

        {selectedExternalAgentAppType === 'qwen' && selectedAgentConfigSource === ExternalAgentConfigSourceValue.WesightModel && (
          <div className="flex flex-col gap-2 rounded-xl border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-5 text-secondary">
              {i18nService.t('coworkAgentQwenCodeSyncGlobalHint')}
            </div>
            <button
              type="button"
              onClick={() => void handleSyncQwenCodeGlobalConfig()}
              disabled={qwenCodeGlobalSyncing}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-raised disabled:cursor-wait disabled:opacity-50"
            >
              {i18nService.t(qwenCodeGlobalSyncing
                ? 'coworkAgentQwenCodeSyncGlobalSyncing'
                : 'coworkAgentQwenCodeSyncGlobal')}
            </button>
          </div>
        )}

        {selectedExternalAgentAppType === 'deepseek_tui' && selectedAgentConfigSource === ExternalAgentConfigSourceValue.WesightModel && (
          <div className="flex flex-col gap-2 rounded-xl border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-5 text-secondary">
              {i18nService.t('coworkAgentDeepSeekTuiSyncGlobalHint')}
            </div>
            <button
              type="button"
              onClick={() => void handleSyncDeepSeekTuiGlobalConfig()}
              disabled={deepseekTuiGlobalSyncing}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-raised disabled:cursor-wait disabled:opacity-50"
            >
              {i18nService.t(deepseekTuiGlobalSyncing
                ? 'coworkAgentDeepSeekTuiSyncGlobalSyncing'
                : 'coworkAgentDeepSeekTuiSyncGlobal')}
            </button>
          </div>
        )}

        <div className="rounded-xl border border-border px-3 py-3">
          <div className="text-xs font-medium text-foreground">
            {i18nService.t('coworkAgentCurrentModelTitle')}
          </div>
          <div className="mt-2 grid gap-1.5 text-[11px] leading-5 text-secondary sm:grid-cols-2">
            <div>
              {i18nService.t('coworkAgentCurrentModelProvider')}: <span className="text-foreground">{effectiveAgentModelSummary.providerName}</span>
            </div>
            <div>
              {i18nService.t('coworkAgentCurrentModelModel')}: <span className="font-mono text-foreground">{effectiveAgentModelSummary.modelId}</span>
            </div>
            {effectiveAgentModelSummary.apiFormat && (
              <div>
                {i18nService.t('coworkAgentCurrentModelFormat')}: <span className="font-mono text-foreground">{effectiveAgentModelSummary.apiFormat}</span>
              </div>
            )}
            {effectiveAgentModelSummary.baseUrl && (
              <div className="truncate" title={effectiveAgentModelSummary.baseUrl}>
                {i18nService.t('coworkAgentCurrentModelBaseUrl')}: <span className="font-mono text-foreground">{effectiveAgentModelSummary.baseUrl}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs leading-5 text-secondary">
            {i18nService.t('coworkAgentConfigImportModelHint')}
          </div>
          <button
            type="button"
            onClick={() => void handleImportLocalAgentConfigToModelSettings()}
            disabled={isImporting}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-raised disabled:opacity-50"
          >
            {i18nService.t(isImporting ? 'coworkAgentConfigImportModelImporting' : 'coworkAgentConfigImportModel')}
          </button>
        </div>

        {configPaths.length > 0 && (
          <div className="space-y-1 text-[11px] text-secondary">
            <div>{i18nService.t('coworkAgentConfigLocalPath')}</div>
            {configPaths.map((configPath) => (
              <div key={configPath} className="truncate font-mono" title={configPath}>
                {configPath}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const resolveStartupServiceStatusClass = (status: StartupServiceState['status']): string => {
    if (status === 'ready') return 'bg-green-500';
    if (status === 'running') return 'bg-blue-500';
    if (status === 'degraded') return 'bg-amber-500';
    if (status === 'error') return 'bg-red-500';
    return 'bg-gray-400';
  };

  const resolveStartupServiceStatusText = (status: StartupServiceState['status']): string =>
    i18nService.t(`startupServiceStatus_${status}`);

  const renderTabContent = () => {
    switch(activeTab) {
      case SettingsTab.General:
        return (
          <div className="space-y-8">
            <section className="rounded-2xl border border-border bg-surface-raised/40 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    {i18nService.t('languageRegion')}
                  </h4>
                  <p className="mt-1 text-xs text-secondary">
                    {i18nService.t('appLanguageHint')}
                  </p>
                </div>
                <div className="w-[180px] shrink-0">
                  <ThemedSelect
                    id="language"
                    value={language}
                    onChange={(value) => {
                      const nextLanguage = value as LanguageType;
                      setLanguage(nextLanguage);
                      i18nService.setLanguage(nextLanguage);
                    }}
                    options={[
                      { value: 'zh', label: i18nService.t('chinese') },
                      { value: 'en', label: i18nService.t('english') }
                    ]}
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                <span className="text-sm font-medium text-foreground">
                  {i18nService.t('appLanguage')}
                </span>
                <span className="text-xs text-secondary">
                  {language === 'zh' ? i18nService.t('chinese') : i18nService.t('english')}
                </span>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface-raised/40 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    {i18nService.t('startupServicesTitle')}
                  </h4>
                  <p className="mt-1 text-xs text-secondary">
                    {i18nService.t('startupServicesHint')}
                  </p>
                </div>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-secondary">
                  {startupServices.filter(service => service.status === 'ready').length}/{startupServices.length}
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {startupServices.map((service) => (
                  <div
                    key={service.name}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${resolveStartupServiceStatusClass(service.status)}`} />
                      <span className="truncate text-xs font-medium text-foreground">
                        {i18nService.t(`startupService_${service.name}`)}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-secondary">
                      {resolveStartupServiceStatusText(service.status)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Auto-launch Section */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3">
                {i18nService.t('autoLaunch')}
              </h4>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-secondary">
                  {i18nService.t('autoLaunchDescription')}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoLaunch}
                  onClick={async () => {
                    if (isUpdatingAutoLaunch) return;
                    const next = !autoLaunch;
                    setIsUpdatingAutoLaunch(true);
                    try {
                      const result = await window.electron.autoLaunch.set(next);
                      if (result.success) {
                        setAutoLaunchState(next);
                      } else {
                        setError(result.error || 'Failed to update auto-launch setting');
                      }
                    } catch (err) {
                      console.error('Failed to set auto-launch:', err);
                      setError('Failed to update auto-launch setting');
                    } finally {
                      setIsUpdatingAutoLaunch(false);
                    }
                  }}
                  disabled={isUpdatingAutoLaunch}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                    isUpdatingAutoLaunch ? 'opacity-50 cursor-not-allowed' : ''
                  } ${
                    autoLaunch
                      ? 'bg-primary'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      autoLaunch ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>
            </div>

            {/* Prevent Sleep Section */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3">
                {i18nService.t('preventSleep')}
              </h4>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-secondary">
                  {i18nService.t('preventSleepDescription')}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preventSleep}
                  onClick={async () => {
                    if (isUpdatingPreventSleep) return;
                    const next = !preventSleep;
                    setIsUpdatingPreventSleep(true);
                    try {
                      const result = await window.electron.preventSleep.set(next);
                      if (result.success) {
                        setPreventSleepState(next);
                      } else {
                        setError(result.error || 'Failed to update prevent-sleep setting');
                      }
                    } catch (err) {
                      console.error('Failed to set prevent-sleep:', err);
                      setError('Failed to update prevent-sleep setting');
                    } finally {
                      setIsUpdatingPreventSleep(false);
                    }
                  }}
                  disabled={isUpdatingPreventSleep}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                    isUpdatingPreventSleep ? 'opacity-50 cursor-not-allowed' : ''
                  } ${
                    preventSleep
                      ? 'bg-primary'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      preventSleep ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>
            </div>

            {/* System proxy Section */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3">
                {i18nService.t('useSystemProxy')}
              </h4>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-secondary">
                  {i18nService.t('useSystemProxyDescription')}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={useSystemProxy}
                  onClick={() => {
                    setUseSystemProxy((prev) => !prev);
                  }}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                    useSystemProxy
                      ? 'bg-primary'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      useSystemProxy ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>
            </div>

            {/* Appearance Section — mode selector + theme gallery */}
            {SHOW_LEGACY_THEME_CONTROLS && (
            <div>
              <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--lobster-text-primary)' }}>
                {i18nService.t('appearance')}
              </h4>

              {/* Level 1: Mode selector */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {(['light', 'dark', 'system'] as const).map((mode) => {
                  const isSelected = theme === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setTheme(mode);
                        themeService.setTheme(mode);
                        setThemeId(themeService.getThemeId());
                      }}
                      className="flex flex-col items-center rounded-xl border-2 p-3 transition-colors cursor-pointer"
                      style={{
                        borderColor: isSelected ? 'var(--lobster-primary)' : 'var(--lobster-border)',
                        backgroundColor: isSelected ? 'var(--lobster-primary-muted)' : undefined,
                      }}
                    >
                      <svg viewBox="0 0 120 80" className="w-full h-auto rounded-md mb-2 overflow-hidden" xmlns="http://www.w3.org/2000/svg">
                        {mode === 'light' && (
                          <>
                            <rect width="120" height="80" fill="#F8F9FB" />
                            <rect x="0" y="0" width="30" height="80" fill="#EBEDF0" />
                            <rect x="4" y="8" width="22" height="4" rx="2" fill="#C8CBD0" />
                            <rect x="4" y="16" width="18" height="3" rx="1.5" fill="#D5D7DB" />
                            <rect x="4" y="22" width="20" height="3" rx="1.5" fill="#D5D7DB" />
                            <rect x="4" y="28" width="16" height="3" rx="1.5" fill="#D5D7DB" />
                            <rect x="36" y="8" width="78" height="64" rx="4" fill="#FFFFFF" />
                            <rect x="42" y="16" width="50" height="4" rx="2" fill="#D5D7DB" />
                            <rect x="42" y="24" width="66" height="3" rx="1.5" fill="#E2E4E7" />
                            <rect x="42" y="30" width="60" height="3" rx="1.5" fill="#E2E4E7" />
                            <rect x="42" y="36" width="55" height="3" rx="1.5" fill="#E2E4E7" />
                            <rect x="42" y="46" width="40" height="4" rx="2" fill="#D5D7DB" />
                            <rect x="42" y="54" width="66" height="3" rx="1.5" fill="#E2E4E7" />
                            <rect x="42" y="60" width="58" height="3" rx="1.5" fill="#E2E4E7" />
                          </>
                        )}
                        {mode === 'dark' && (
                          <>
                            <rect width="120" height="80" fill="#0F1117" />
                            <rect x="0" y="0" width="30" height="80" fill="#151820" />
                            <rect x="4" y="8" width="22" height="4" rx="2" fill="#3A3F4B" />
                            <rect x="4" y="16" width="18" height="3" rx="1.5" fill="#2A2F3A" />
                            <rect x="4" y="22" width="20" height="3" rx="1.5" fill="#2A2F3A" />
                            <rect x="4" y="28" width="16" height="3" rx="1.5" fill="#2A2F3A" />
                            <rect x="36" y="8" width="78" height="64" rx="4" fill="#1A1D27" />
                            <rect x="42" y="16" width="50" height="4" rx="2" fill="#3A3F4B" />
                            <rect x="42" y="24" width="66" height="3" rx="1.5" fill="#252930" />
                            <rect x="42" y="30" width="60" height="3" rx="1.5" fill="#252930" />
                            <rect x="42" y="36" width="55" height="3" rx="1.5" fill="#252930" />
                            <rect x="42" y="46" width="40" height="4" rx="2" fill="#3A3F4B" />
                            <rect x="42" y="54" width="66" height="3" rx="1.5" fill="#252930" />
                            <rect x="42" y="60" width="58" height="3" rx="1.5" fill="#252930" />
                          </>
                        )}
                        {mode === 'system' && (
                          <>
                            <defs>
                              <clipPath id="left-half">
                                <rect x="0" y="0" width="60" height="80" />
                              </clipPath>
                              <clipPath id="right-half">
                                <rect x="60" y="0" width="60" height="80" />
                              </clipPath>
                            </defs>
                            <g clipPath="url(#left-half)">
                              <rect width="120" height="80" fill="#F8F9FB" />
                              <rect x="0" y="0" width="30" height="80" fill="#EBEDF0" />
                              <rect x="4" y="8" width="22" height="4" rx="2" fill="#C8CBD0" />
                              <rect x="4" y="16" width="18" height="3" rx="1.5" fill="#D5D7DB" />
                              <rect x="4" y="22" width="20" height="3" rx="1.5" fill="#D5D7DB" />
                              <rect x="4" y="28" width="16" height="3" rx="1.5" fill="#D5D7DB" />
                              <rect x="36" y="8" width="78" height="64" rx="4" fill="#FFFFFF" />
                              <rect x="42" y="16" width="50" height="4" rx="2" fill="#D5D7DB" />
                              <rect x="42" y="24" width="66" height="3" rx="1.5" fill="#E2E4E7" />
                              <rect x="42" y="30" width="60" height="3" rx="1.5" fill="#E2E4E7" />
                              <rect x="42" y="36" width="55" height="3" rx="1.5" fill="#E2E4E7" />
                              <rect x="42" y="46" width="40" height="4" rx="2" fill="#D5D7DB" />
                              <rect x="42" y="54" width="66" height="3" rx="1.5" fill="#E2E4E7" />
                            </g>
                            <g clipPath="url(#right-half)">
                              <rect width="120" height="80" fill="#0F1117" />
                              <rect x="0" y="0" width="30" height="80" fill="#151820" />
                              <rect x="4" y="8" width="22" height="4" rx="2" fill="#3A3F4B" />
                              <rect x="4" y="16" width="18" height="3" rx="1.5" fill="#2A2F3A" />
                              <rect x="4" y="22" width="20" height="3" rx="1.5" fill="#2A2F3A" />
                              <rect x="4" y="28" width="16" height="3" rx="1.5" fill="#2A2F3A" />
                              <rect x="36" y="8" width="78" height="64" rx="4" fill="#1A1D27" />
                              <rect x="42" y="16" width="50" height="4" rx="2" fill="#3A3F4B" />
                              <rect x="42" y="24" width="66" height="3" rx="1.5" fill="#252930" />
                              <rect x="42" y="30" width="60" height="3" rx="1.5" fill="#252930" />
                              <rect x="42" y="36" width="55" height="3" rx="1.5" fill="#252930" />
                              <rect x="42" y="46" width="40" height="4" rx="2" fill="#3A3F4B" />
                              <rect x="42" y="54" width="66" height="3" rx="1.5" fill="#252930" />
                            </g>
                            <line x1="60" y1="0" x2="60" y2="80" stroke="#888" strokeWidth="0.5" />
                          </>
                        )}
                      </svg>
                      <span className="text-xs font-medium" style={{ color: isSelected ? 'var(--lobster-primary)' : 'var(--lobster-text-primary)' }}>
                        {i18nService.t(mode)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Theme color gallery — all themes */}
              <h4 className="text-sm font-medium mb-3 mt-5" style={{ color: 'var(--lobster-text-primary)' }}>
                {i18nService.t('themeColor')}
              </h4>
              {(() => {
                const allThemes = themeService.getAllThemes();
                const classicThemes = allThemes.filter(t => t.meta.id === 'classic-light' || t.meta.id === 'classic-dark');
                const otherThemes = allThemes.filter(t => t.meta.id !== 'classic-light' && t.meta.id !== 'classic-dark');
                const renderTile = (t: import('../theme').ThemeDefinition) => {
                  const isSelected = themeId === t.meta.id;
                  const [bg, c1, c2, c3] = t.meta.preview;
                  return (
                    <button
                      key={t.meta.id}
                      type="button"
                      onClick={() => {
                        themeService.setThemeById(t.meta.id);
                        setThemeId(t.meta.id);
                        setTheme(t.meta.appearance as 'light' | 'dark');
                      }}
                      className="flex flex-col items-center rounded-xl border-2 p-2 transition-colors cursor-pointer"
                      style={{
                        borderColor: isSelected ? 'var(--lobster-primary)' : 'var(--lobster-border)',
                        backgroundColor: isSelected ? 'var(--lobster-primary-muted)' : undefined,
                      }}
                    >
                      <svg viewBox="0 0 80 48" className="w-full h-auto rounded-md mb-1.5 overflow-hidden" xmlns="http://www.w3.org/2000/svg">
                        <rect width="80" height="48" fill={bg} />
                        <rect x="4" y="6" width="20" height="36" rx="3" fill={c1} opacity="0.7" />
                        <rect x="28" y="6" width="48" height="36" rx="3" fill={c2} opacity="0.5" />
                        <circle cx="52" cy="24" r="8" fill={c3} opacity="0.8" />
                        <rect x="32" y="34" width="40" height="4" rx="2" fill={c1} opacity="0.6" />
                      </svg>
                      <span className="text-[10px] font-medium truncate w-full text-center" style={{ color: isSelected ? 'var(--lobster-primary)' : 'var(--lobster-text-primary)' }}>
                        {t.meta.name}
                      </span>
                    </button>
                  );
                };
                return (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {classicThemes.map(renderTile)}
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      {otherThemes.map(renderTile)}
                    </div>
                  </>
                );
              })()}
            </div>
            )}

            {(() => {
                const currentPetConfig: PetConfig = {
                  enabled: petEnabled,
                  variant: petVariant,
                  motion: petMotion,
                  voice: petVoice,
                };
                const currentVoiceProfile = getPetVoiceProfileForVariant(petVoice, petVariant);
                const isLocalTtsVoice = petVoice.provider === PetVoiceProvider.LocalTts;

                return (
                  <div className="mt-6 rounded-xl border border-border bg-surface-raised/60 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h4 className="text-sm font-medium text-foreground">
                          {i18nService.t('petCompanion')}
                        </h4>
                        <p className="mt-1 text-xs leading-5 text-secondary">
                          {i18nService.t('petCompanionHint')}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={petEnabled}
                        onClick={() => applyPetConfigPreview({
                          ...currentPetConfig,
                          enabled: !petEnabled,
                        })}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                          petEnabled
                            ? 'bg-primary'
                            : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            petEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {petEnabled && (
                      <div className="mt-4 space-y-4">
                        <div>
                          <div className="mb-2 text-xs font-medium text-secondary">
                            {i18nService.t('petVariant')}
                          </div>
                          <div className="grid grid-cols-4 gap-3">
                            {PET_VARIANT_OPTIONS.map((option) => {
                              const isSelected = petVariant === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => applyPetConfigPreview({
                                    ...currentPetConfig,
                                    variant: option.value,
                                  })}
                                  className="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-xl border-2 px-2 py-2 transition-colors"
                                  style={{
                                    borderColor: isSelected ? 'var(--lobster-primary)' : 'var(--lobster-border)',
                                    backgroundColor: isSelected ? 'var(--lobster-primary-muted)' : 'transparent',
                                  }}
                                >
                                  <PetSprite
                                    variant={option.value}
                                    motion={petMotion}
                                    mood={isSelected ? PetMood.Happy : PetMood.Idle}
                                    size={62}
                                  />
                                  <span
                                    className="text-xs font-medium"
                                    style={{ color: isSelected ? 'var(--lobster-primary)' : 'var(--lobster-text-primary)' }}
                                  >
                                    {i18nService.t(option.labelKey)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <div className="mb-2 text-xs font-medium text-secondary">
                            {i18nService.t('petMotion')}
                          </div>
                          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-background p-1">
                            {PET_MOTION_OPTIONS.map((option) => {
                              const isSelected = petMotion === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => applyPetConfigPreview({
                                    ...currentPetConfig,
                                    motion: option.value,
                                  })}
                                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                    isSelected
                                      ? 'bg-primary text-white shadow-sm'
                                      : 'text-secondary hover:bg-surface-raised hover:text-foreground'
                                  }`}
                                >
                                  {i18nService.t(option.labelKey)}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-background p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold uppercase tracking-wide text-secondary">
                                {i18nService.t('petVoiceTitle')}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-secondary">
                                {i18nService.t('petVoiceHint')}
                              </p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={petVoice.enabled}
                              onClick={() => updatePetVoiceConfig((current) => ({
                                ...current,
                                enabled: !current.enabled,
                              }))}
                              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                                petVoice.enabled
                                  ? 'bg-primary'
                                  : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  petVoice.enabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>

                          {petVoice.enabled && (
                            <div className="mt-4 space-y-4">
                              <div>
                                <div className="mb-2 text-xs font-medium text-secondary">
                                  {i18nService.t('petVoiceProvider')}
                                </div>
                                <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-raised p-1">
                                  {[
                                    { value: PetVoiceProvider.MiniMax, label: i18nService.t('petVoiceProviderMiniMax') },
                                    { value: PetVoiceProvider.LocalTts, label: i18nService.t('petVoiceProviderLocalTts') },
                                  ].map((option) => {
                                    const isSelected = petVoice.provider === option.value;
                                    return (
                                      <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => handlePetVoiceProviderChange(option.value)}
                                        className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                                          isSelected
                                            ? 'bg-primary text-white shadow-sm'
                                            : 'text-secondary hover:bg-background hover:text-foreground'
                                        }`}
                                      >
                                        {option.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {!isLocalTtsVoice && (
                              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-raised p-1">
                                {[
                                  { value: PetVoiceAuthMode.ReuseModelProvider, label: i18nService.t('petVoiceReuseMiniMaxProvider') },
                                  { value: PetVoiceAuthMode.PetApiKey, label: i18nService.t('petVoiceUseSeparateApiKey') },
                                ].map((option) => {
                                  const isSelected = petVoice.authMode === option.value;
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => updatePetVoiceConfig((current) => ({
                                        ...current,
                                        authMode: option.value,
                                      }))}
                                      className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                                        isSelected
                                          ? 'bg-primary text-white shadow-sm'
                                          : 'text-secondary hover:bg-background hover:text-foreground'
                                      }`}
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })}
                              </div>
                              )}

                              {isLocalTtsVoice && (
                                <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-5 text-secondary">
                                  {i18nService.t('petVoiceLocalTtsSynthesisOnly')}
                                </div>
                              )}

                              {(isLocalTtsVoice || petVoice.authMode === PetVoiceAuthMode.PetApiKey) && (
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-secondary">
                                    {i18nService.t(isLocalTtsVoice ? 'petVoiceLocalTtsApiKey' : 'petVoiceMiniMaxApiKey')}
                                  </label>
                                  <input
                                    type="password"
                                    value={petVoice.apiKey}
                                    onChange={(event) => updatePetVoiceConfig((current) => ({
                                      ...current,
                                      apiKey: event.target.value,
                                    }))}
                                    placeholder="sk-..."
                                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                                  />
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-secondary">
                                    {i18nService.t('petVoiceTtsModel')}
                                  </label>
                                  {isLocalTtsVoice ? (
                                    <input
                                      type="text"
                                      value={petVoice.model}
                                      onChange={(event) => updatePetVoiceConfig((current) => ({
                                        ...current,
                                        model: event.target.value,
                                      }))}
                                      placeholder={LOCAL_TTS_DEFAULT_MODEL}
                                      className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                                    />
                                  ) : (
                                    <ThemedSelect
                                      id="pet-voice-model"
                                      value={petVoice.model}
                                      onChange={(value) => updatePetVoiceConfig((current) => ({
                                        ...current,
                                        model: value,
                                      }))}
                                      options={PET_VOICE_TTS_MODELS.map((model) => ({
                                        value: model,
                                        label: model,
                                      }))}
                                    />
                                  )}
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-secondary">
                                    {i18nService.t(isLocalTtsVoice ? 'petVoiceLocalTtsBaseUrl' : 'petVoiceBaseUrl')}
                                  </label>
                                  <input
                                    type="text"
                                    value={petVoice.baseUrl}
                                    onChange={(event) => updatePetVoiceConfig((current) => ({
                                      ...current,
                                      baseUrl: event.target.value,
                                    }))}
                                    placeholder={isLocalTtsVoice ? LOCAL_TTS_DEFAULT_BASE_URL : undefined}
                                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-secondary">
                                    {i18nService.t('petVoiceSpeed')}
                                  </label>
                                  <input
                                    type="range"
                                    min="0.5"
                                    max="2"
                                    step="0.05"
                                    value={petVoice.speed}
                                    onChange={(event) => updatePetVoiceConfig((current) => ({
                                      ...current,
                                      speed: Number(event.target.value),
                                    }))}
                                    className="w-full accent-primary"
                                  />
                                  <div className="mt-1 text-xs text-secondary">{petVoice.speed.toFixed(2)}</div>
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-secondary">
                                    {i18nService.t('petVoiceVolume')}
                                  </label>
                                  <input
                                    type="range"
                                    min="0.1"
                                    max="2"
                                    step="0.05"
                                    value={petVoice.volume}
                                    onChange={(event) => updatePetVoiceConfig((current) => ({
                                      ...current,
                                      volume: Number(event.target.value),
                                    }))}
                                    className="w-full accent-primary"
                                  />
                                  <div className="mt-1 text-xs text-secondary">{petVoice.volume.toFixed(2)}</div>
                                </div>
                              </div>

                              <div className="rounded-xl border border-border bg-surface-raised p-3">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-xs font-medium text-secondary">
                                      {i18nService.t('petVoiceCurrentProfile')}
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-foreground">
                                      {currentVoiceProfile?.displayName || i18nService.t('petVoiceNoProfile')}
                                    </div>
                                  </div>
                                  <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                                    {i18nService.t(PET_VARIANT_OPTIONS.find((option) => option.value === petVariant)?.labelKey ?? 'petVariantWeSightAgent')}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-secondary">
                                      {i18nService.t('petVoiceId')}
                                    </label>
                                    <input
                                      type="text"
                                      value={currentVoiceProfile?.voiceId ?? ''}
                                      onChange={(event) => updateCurrentPetVoiceProfile({
                                        voiceId: event.target.value,
                                        source: PetVoiceSource.System,
                                      })}
                                      placeholder={isLocalTtsVoice ? LOCAL_TTS_DEFAULT_VOICE_ID : 'male-qn-qingse'}
                                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-secondary">
                                      {i18nService.t('petVoiceDisplayName')}
                                    </label>
                                    <input
                                      type="text"
                                      value={currentVoiceProfile?.displayName ?? ''}
                                      onChange={(event) => updateCurrentPetVoiceProfile({
                                        displayName: event.target.value,
                                      })}
                                      placeholder={i18nService.t('petVoiceDisplayNamePlaceholder')}
                                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                                    />
                                  </div>
                                </div>

                                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                                  <input
                                    type="text"
                                    value={petVoiceTestText}
                                    onChange={(event) => setPetVoiceTestText(event.target.value)}
                                    className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                                  />
                                  <button
                                    type="button"
                                    disabled={isTestingPetVoice}
                                    onClick={handleTestPetVoice}
                                    className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {isTestingPetVoice ? i18nService.t('petVoiceTesting') : i18nService.t('petVoiceTest')}
                                  </button>
                                </div>
                              </div>

                              {!isLocalTtsVoice && (
                              <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                                  {i18nService.t('petVoiceCloneTitle')}
                                </div>
                                <p className="mt-1 text-xs leading-5 text-secondary">
                                  {i18nService.t('petVoiceCloneHint')}
                                </p>
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectPetVoiceAudio('clone')}
                                    className="rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-foreground hover:border-primary/50"
                                  >
                                    <span className="block font-medium">{i18nService.t('petVoiceCloneAudio')}</span>
                                    <span className="mt-1 block truncate text-secondary">
                                      {petVoiceCloneAudioPath || i18nService.t('petVoiceNoAudioSelected')}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectPetVoiceAudio('prompt')}
                                    className="rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-foreground hover:border-primary/50"
                                  >
                                    <span className="block font-medium">{i18nService.t('petVoicePromptAudio')}</span>
                                    <span className="mt-1 block truncate text-secondary">
                                      {petVoicePromptAudioPath || i18nService.t('petVoiceOptionalAudio')}
                                    </span>
                                  </button>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                  <input
                                    type="text"
                                    value={petVoiceDisplayName}
                                    onChange={(event) => setPetVoiceDisplayName(event.target.value)}
                                    placeholder={i18nService.t('petVoiceCloneDisplayNamePlaceholder')}
                                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                                  />
                                  <input
                                    type="text"
                                    value={petVoicePromptText}
                                    onChange={(event) => setPetVoicePromptText(event.target.value)}
                                    placeholder={i18nService.t('petVoicePromptTextPlaceholder')}
                                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                                  />
                                </div>
                                <div className="mt-3 flex justify-end">
                                  <button
                                    type="button"
                                    disabled={isCloningPetVoice}
                                    onClick={handleClonePetVoice}
                                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {isCloningPetVoice ? i18nService.t('petVoiceCloning') : i18nService.t('petVoiceCloneAction')}
                                  </button>
                                </div>
                              </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
            })()}
          </div>
        );

      case SettingsTab.Email:
        return <EmailSkillConfig />;

      case SettingsTab.CoworkAgentEngine:
        return (
          <div className="space-y-6">
            <AgentEnvironmentSetup
              selectedEngine={coworkAgentEngine}
              onEngineChange={(engine) => setCoworkAgentEngine(engine)}
              onSnapshotChange={setAgentEnvironmentSnapshot}
              compact
            />
            {window.electron?.platform === 'win32' && (
              <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                {i18nService.t('coworkAgentEngineWslUnsupportedHint')}
              </div>
            )}
            {expandedCoworkAgentEngine !== coworkAgentEngine && renderCoworkAgentApplyProgress()}
            <div className="space-y-3">
              {COWORK_AGENT_ENGINE_OPTIONS.map(renderAgentEngineOption)}
            </div>
          </div>
        );

      case SettingsTab.CoworkMemory:
        return (
          <div className="space-y-6">
            {/* Section 1: Long-term Memory (MEMORY.md) */}
            <div className="space-y-3 rounded-xl border px-4 py-4 border-border">
              <div className="text-sm font-medium text-foreground">
                {i18nService.t('coworkMemoryTitle')}
              </div>
              {/* Memory toggle hidden – always enabled by default */}
              <div className="mt-2 text-xs text-secondary">
                <span className="font-medium">{i18nService.t('coworkMemoryFilePath')}:</span>{' '}
                <span className="break-all font-mono opacity-80">
                  {joinWorkspacePath(coworkConfig.workingDirectory, 'MEMORY.md')}
                </span>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border px-4 py-4 border-border">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-foreground">
                    {i18nService.t('coworkMemoryCrudTitle')}
                  </div>
                  <div className="text-xs text-secondary">
                    {i18nService.t('coworkMemoryManageHint')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenCoworkMemoryModal}
                  className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm transition-colors active:scale-[0.98]"
                >
                  <PlusCircleIcon className="h-4 w-4 mr-1.5" />
                  {i18nService.t('coworkMemoryCrudCreate')}
                </button>
              </div>

              {coworkMemoryStats && (
                <div className="text-xs text-secondary">
                  {`${i18nService.t('coworkMemoryTotalLabel')}: ${coworkMemoryStats.total}`}
                </div>
              )}

              <input
                type="text"
                value={coworkMemoryQuery}
                onChange={(event) => setCoworkMemoryQuery(event.target.value)}
                placeholder={i18nService.t('coworkMemorySearchPlaceholder')}
                className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface"
              />

              <div className="rounded-lg border border-border">
                {coworkMemoryListLoading ? (
                  <div className="px-3 py-3 text-xs text-secondary">
                    {i18nService.t('loading')}
                  </div>
                ) : coworkMemoryEntries.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-secondary">
                    {i18nService.t('coworkMemoryEmpty')}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {coworkMemoryEntries.map((entry) => (
                      <div key={entry.id} className="px-3 py-3 text-xs hover:bg-surface-raised transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-foreground break-words">
                              {entry.text}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditCoworkMemoryEntry(entry)}
                              className="rounded border px-2 py-1 border-border text-foreground hover:bg-surface-raised transition-colors"
                            >
                              {i18nService.t('edit')}
                            </button>
                            <button
                              type="button"
                              onClick={() => { void handleDeleteCoworkMemoryEntry(entry); }}
                              className="rounded border px-2 py-1 text-red-500 border-border hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60 transition-colors"
                              disabled={coworkMemoryListLoading}
                            >
                              {i18nService.t('delete')}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        );

      case SettingsTab.Model:
        return (
          <div className="flex h-full">
            {/* Provider List - Left Side */}
            <div className="w-2/5 border-r border-border pr-3 space-y-1.5 overflow-y-auto">
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-sm font-medium text-foreground">
                  {i18nService.t('modelProviders')}
                </h3>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={handleImportProvidersClick}
                    disabled={isImportingProviders || isExportingProviders}
                    className="inline-flex items-center px-2 py-1 text-[11px] font-medium rounded-lg border border-border text-foreground hover:bg-surface-raised disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
                  >
                    {i18nService.t('import')}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportProviders}
                    disabled={isImportingProviders || isExportingProviders}
                    className="inline-flex items-center px-2 py-1 text-[11px] font-medium rounded-lg border border-border text-foreground hover:bg-surface-raised disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
                  >
                    {i18nService.t('export')}
                  </button>
                </div>
              </div>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportProviders}
              />
              {Object.entries(visibleProviders).map(([provider, config]) => {
                const providerKey = provider as ProviderType;
                const isCustom = isCustomProvider(provider);
                const providerInfo = providerMeta[providerKey];
                const missingApiKey = providerRequiresApiKey(providerKey) && !config.apiKey.trim();
                const canToggleProvider = config.enabled || !missingApiKey;
                const displayLabel = isCustom
                  ? ((config as ProviderConfig).displayName || getCustomProviderDefaultName(provider))
                  : (providerInfo?.label ?? getProviderDisplayName(provider));
                return (
                  <div
                    key={provider}
                    onClick={() => handleProviderChange(providerKey)}
                    className={`group flex items-center p-2 rounded-xl cursor-pointer transition-colors ${
                      activeProvider === provider
                        ? 'bg-primary-muted border border-primary shadow-subtle'
                        : 'bg-surface hover:bg-surface-raised border border-transparent'
                    }`}
                  >
                    <div className="flex flex-1 items-center min-w-0">
                      <div className="mr-2 flex h-7 w-7 items-center justify-center shrink-0">
                        <span className="text-foreground">
                          {isCustom ? <CustomProviderIcon /> : providerInfo?.icon}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-sm font-medium truncate ${
                          activeProvider === provider
                            ? 'text-primary'
                            : 'text-foreground'
                        }`}>
                          {displayLabel}
                        </span>
                        {isCustom && (
                          <span className="text-[9px] leading-tight mt-0.5 text-primary">
                            {i18nService.t('customBadge')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center ml-2 gap-1">
                      {isCustom && (
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-claude-secondaryText hover:text-red-500 dark:text-claude-darkSecondaryText dark:hover:text-red-400 p-0.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCustomProvider(providerKey);
                          }}
                          title={i18nService.t('deleteCustomProvider')}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                          </svg>
                        </button>
                      )}
                      <div
                        title={!canToggleProvider ? i18nService.t('configureApiKey') : undefined}
                        className={`w-7 h-4 rounded-full flex items-center transition-colors ${
                          config.enabled ? 'bg-primary' : 'bg-gray-400 dark:bg-gray-600'
                        } ${
                          canToggleProvider ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!canToggleProvider) {
                            return;
                          }
                          toggleProviderEnabled(providerKey);
                        }}
                      >
                        <div
                          className={`w-3 h-3 rounded-full bg-white shadow-md transform transition-transform ${
                            config.enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Add Custom Provider Button */}
              {CUSTOM_PROVIDER_KEYS.some(k => !providers[k]) && (
              <button
                type="button"
                onClick={handleAddCustomProvider}
                className="w-full flex items-center justify-center p-2 rounded-xl border border-dashed border-claude-border dark:border-claude-darkBorder text-claude-secondaryText dark:text-claude-darkSecondaryText hover:border-claude-accent hover:text-claude-accent transition-colors text-sm"
              >
                {i18nService.t('addCustomProvider')}
              </button>
              )}
            </div>

            {/* Provider Settings - Right Side */}
            <div className="w-3/5 pl-4 pr-2 space-y-4 overflow-y-auto [scrollbar-gutter:stable]">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-base font-medium text-foreground">
                    {isCustomProvider(activeProvider)
                      ? ((providers[activeProvider] as ProviderConfig)?.displayName || getCustomProviderDefaultName(activeProvider))
                      : (providerMeta[activeProvider]?.label ?? getProviderDisplayName(activeProvider))
                    } {i18nService.t('providerSettings')}
                  </h3>
                  {providerLinks[activeProvider]?.website && (
                    <button
                      type="button"
                      onClick={() => void window.electron.shell.openExternal(providerLinks[activeProvider]!.website)}
                      className="p-0.5 rounded text-secondary hover:text-primary transition-colors"
                      title={i18nService.t('visitOfficialSite')}
                      aria-label={i18nService.t('visitOfficialSite')}
                    >
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div
                  className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                    providers[activeProvider].enabled
                      ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                      : 'bg-red-500/20 text-red-600 dark:text-red-400'
                  }`}
                >
                  {providers[activeProvider].enabled ? i18nService.t('providerStatusOn') : i18nService.t('providerStatusOff')}
                </div>
              </div>

              {activeProvider === TokenDance.Provider ? (
                <TokenDanceSettings
                  config={providers[TokenDance.Provider]}
                  onChange={patch => setProviders(previous => ({ ...previous, [TokenDance.Provider]: { ...previous[TokenDance.Provider], ...patch } }))}
                  onMakeDefault={setTokenDanceDefault}
                  isDefault={tokenDanceDefault === (providers[TokenDance.Provider].defaultModel ?? TokenDance.DefaultModel)}
                />
              ) : <>
              {/* MiniMax OAuth auth section */}
              {activeProvider === 'minimax' && (
                <div className="space-y-3">
                  {/* Auth type tabs */}
                  <div>
                    <div className="flex rounded-xl overflow-hidden border border-border mb-3">
                      <button
                        type="button"
                        onClick={() => setProviders(prev => ({ ...prev, minimax: { ...prev.minimax, authType: 'oauth' } }))}
                        className={`flex-1 py-1.5 text-xs font-medium transition-colors ${minimaxIsOAuthMode ? 'bg-primary text-white' : 'text-secondary hover:bg-surface-raised'}`}
                      >
                        {i18nService.t('minimaxOAuthTabOAuth')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setProviders(prev => ({ ...prev, minimax: { ...prev.minimax, authType: 'apikey' } }));
                          setMinimaxOAuthPhase({ kind: 'idle' });
                        }}
                        className={`flex-1 py-1.5 text-xs font-medium transition-colors ${!minimaxIsOAuthMode ? 'bg-primary text-white' : 'text-secondary hover:bg-surface-raised'}`}
                      >
                        {i18nService.t('minimaxOAuthTabApiKey')}
                      </button>
                    </div>
                  </div>

                  {/* API Key mode */}
                  {!minimaxIsOAuthMode && (
                    <div className="min-h-[68px]">
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="minimax-apiKey" className="block text-xs font-medium dark:text-claude-darkText text-claude-text">
                          {i18nService.t('apiKey')}
                        </label>
                        {providerLinks.minimax?.apiKey && (
                          <button
                            type="button"
                            onClick={() => void window.electron.shell.openExternal(providerLinks.minimax!.apiKey!)}
                            className="text-[11px] text-claude-accent hover:underline transition-colors"
                          >
                            {i18nService.t('getApiKey')} →
                          </button>
                        )}
                      </div>
                      <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        id="minimax-apiKey"
                        value={providers.minimax.apiKey}
                        onChange={(e) => handleProviderConfigChange('minimax', 'apiKey', e.target.value)}
                        className="block w-full rounded-xl bg-surface-inset border-border border focus:border-primary focus:ring-1 focus:ring-primary/30 text-foreground px-3 py-2 pr-16 text-xs"
                        placeholder={i18nService.t('apiKeyPlaceholder')}
                      />
                      <div className="absolute right-2 inset-y-0 flex items-center gap-1">
                        {providers.minimax.apiKey && (
                          <button
                            type="button"
                            onClick={() => handleProviderConfigChange('minimax', 'apiKey', '')}
                            className="p-0.5 rounded text-secondary hover:text-primary transition-colors"
                            title={i18nService.t('clear') || 'Clear'}
                          >
                            <XCircleIconSolid className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="p-0.5 rounded text-secondary hover:text-primary transition-colors"
                          title={showApiKey ? (i18nService.t('hide') || 'Hide') : (i18nService.t('show') || 'Show')}
                        >
                          {showApiKey ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                        </button>
                      </div>
                      </div>
                    </div>
                  )}

                  {/* OAuth mode */}
                  {minimaxIsOAuthMode && (
                    <div className="space-y-2 min-h-[68px]">
                      {/* Already logged in */}
                      {minimaxOAuthPhase.kind === 'idle' && providers.minimax.apiKey && (
                        <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 space-y-2">
                          <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                            {i18nService.t('minimaxOAuthLoggedIn')}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleMiniMaxDeviceLogin(minimaxOAuthRegion)}
                              className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-border text-foreground hover:bg-surface-raised transition-colors"
                            >
                              {i18nService.t('minimaxOAuthRelogin')}
                            </button>
                            <button
                              type="button"
                              onClick={handleMiniMaxOAuthLogout}
                              className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              {i18nService.t('minimaxOAuthLogout')}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Not logged in yet — show region selector + login button */}
                      {minimaxOAuthPhase.kind === 'idle' && !providers.minimax.apiKey && (
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-foreground mb-1">
                              {i18nService.t('minimaxOAuthRegionLabel')}
                            </label>
                            <div className="flex rounded-xl overflow-hidden border border-border">
                              <button
                                type="button"
                                onClick={() => setMinimaxOAuthRegion('cn')}
                                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${minimaxOAuthRegion === 'cn' ? 'bg-primary text-white' : 'text-secondary hover:bg-surface-raised'}`}
                              >
                                {i18nService.t('minimaxOAuthRegionCN')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setMinimaxOAuthRegion('global')}
                                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${minimaxOAuthRegion === 'global' ? 'bg-primary text-white' : 'text-secondary hover:bg-surface-raised'}`}
                              >
                                {i18nService.t('minimaxOAuthRegionGlobal')}
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleMiniMaxDeviceLogin(minimaxOAuthRegion)}
                            className="w-full py-2 text-xs font-medium rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors"
                          >
                            {i18nService.t('minimaxOAuthLogin')}
                          </button>
                          <p className="text-[11px] text-secondary">
                            {i18nService.t('minimaxOAuthHint')}
                          </p>
                        </div>
                      )}

                      {/* Requesting code */}
                      {minimaxOAuthPhase.kind === 'requesting_code' && (
                        <div className="p-3 rounded-xl bg-surface-inset border border-border">
                          <p className="text-xs text-secondary">
                            {i18nService.t('minimaxOAuthLoggingIn')}
                          </p>
                        </div>
                      )}

                      {/* Pending — show user code */}
                      {minimaxOAuthPhase.kind === 'pending' && (
                        <div className="p-3 rounded-xl bg-surface-inset border border-border space-y-2">
                          <p className="text-xs text-foreground font-medium">
                            {i18nService.t('minimaxOAuthOpenBrowserHint')}
                          </p>
                          <div>
                            <span className="text-[11px] text-secondary">
                              {i18nService.t('minimaxOAuthUserCode')}:&nbsp;
                            </span>
                            <code className="text-xs font-mono text-primary">
                              {minimaxOAuthPhase.userCode}
                            </code>
                          </div>
                          <a
                            href={minimaxOAuthPhase.verificationUri}
                            onClick={(e) => { e.preventDefault(); void window.electron.shell.openExternal(minimaxOAuthPhase.verificationUri); }}
                            className="block text-[11px] text-primary underline truncate"
                          >
                            {minimaxOAuthPhase.verificationUri}
                          </a>
                          <p className="text-[11px] text-secondary">
                            {i18nService.t('minimaxOAuthStatusPending')}
                          </p>
                          <button
                            type="button"
                            onClick={handleCancelMiniMaxLogin}
                            className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-border text-foreground hover:bg-surface-raised transition-colors"
                          >
                            {i18nService.t('minimaxOAuthCancel')}
                          </button>
                        </div>
                      )}

                      {/* Success */}
                      {minimaxOAuthPhase.kind === 'success' && (
                        <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                          <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                            {i18nService.t('minimaxOAuthStatusSuccess')}
                          </p>
                        </div>
                      )}

                      {/* Error */}
                      {minimaxOAuthPhase.kind === 'error' && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-2">
                          <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                            {i18nService.t('minimaxOAuthStatusError')}
                          </p>
                          <p className="text-[11px] text-red-600/80 dark:text-red-400/80 break-words">
                            {minimaxOAuthPhase.message}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleMiniMaxDeviceLogin(minimaxOAuthRegion)}
                              className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors"
                            >
                              {i18nService.t('minimaxOAuthRelogin')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setMinimaxOAuthPhase({ kind: 'idle' })}
                              className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-border text-foreground hover:bg-surface-raised transition-colors"
                            >
                              {i18nService.t('minimaxOAuthCancel')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Standard API key section for non-MiniMax providers */}
              {providerRequiresApiKey(activeProvider) && activeProvider !== 'minimax' && (
                <div>
                  {/* Standard API Key input for non-Qwen providers */}
                  {activeProvider !== 'qwen' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor={`${activeProvider}-apiKey`} className="block text-xs font-medium dark:text-claude-darkText text-claude-text">
                          {i18nService.t('apiKey')}
                        </label>
                        {providerLinks[activeProvider]?.apiKey && (
                          <button
                            type="button"
                            onClick={() => void window.electron.shell.openExternal(providerLinks[activeProvider]!.apiKey!)}
                            className="text-[11px] text-claude-accent hover:underline transition-colors"
                          >
                            {i18nService.t('getApiKey')} →
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          id={`${activeProvider}-apiKey`}
                          value={providers[activeProvider].apiKey}
                          onChange={(e) => handleProviderConfigChange(activeProvider, 'apiKey', e.target.value)}
                          className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-16 text-xs"
                          placeholder={i18nService.t('apiKeyPlaceholder')}
                        />
                        <div className="absolute right-2 inset-y-0 flex items-center gap-1">
                          {providers[activeProvider].apiKey && (
                            <button
                              type="button"
                              onClick={() => handleProviderConfigChange(activeProvider, 'apiKey', '')}
                              className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                              title={i18nService.t('clear') || 'Clear'}
                            >
                              <XCircleIconSolid className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                            title={showApiKey ? (i18nService.t('hide') || 'Hide') : (i18nService.t('show') || 'Show')}
                          >
                            {showApiKey ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Qwen API Key section */}
                  {activeProvider === 'qwen' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="qwen-apiKey" className="block text-xs font-medium dark:text-claude-darkText text-claude-text">
                          API Key
                        </label>
                        {providerLinks.qwen?.apiKey && (
                          <button
                            type="button"
                            onClick={() => void window.electron.shell.openExternal(providerLinks.qwen!.apiKey!)}
                            className="text-[11px] text-claude-accent hover:underline transition-colors"
                          >
                            {i18nService.t('getApiKey')} →
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          id="qwen-apiKey"
                          value={providers.qwen.apiKey}
                          onChange={(e) => handleProviderConfigChange('qwen', 'apiKey', e.target.value)}
                          className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-16 text-xs"
                          placeholder={i18nService.t('apiKeyPlaceholder')}
                        />
                        <div className="absolute right-2 inset-y-0 flex items-center gap-1">
                          {providers.qwen.apiKey && (
                            <button
                              type="button"
                              onClick={() => handleProviderConfigChange('qwen', 'apiKey', '')}
                              className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                              title={i18nService.t('clear') || 'Clear'}
                            >
                              <XCircleIconSolid className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                            title={showApiKey ? (i18nService.t('hide') || 'Hide') : (i18nService.t('show') || 'Show')}
                          >
                            {showApiKey ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeProvider === 'github-copilot' && (
                <div>
                  <label className="block text-xs font-medium dark:text-claude-darkText text-claude-text mb-2">
                    {i18nService.t('githubCopilotAuth')}
                  </label>

                  {(copilotAuthStatus === 'idle' || copilotAuthStatus === 'error') && !providers['github-copilot'].apiKey && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={handleCopilotSignIn}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-claude-accent text-white text-xs font-medium hover:bg-claude-accent/90 transition-colors"
                      >
                        <GitHubCopilotIcon className="w-4 h-4" />
                        {i18nService.t('githubCopilotSignIn')}
                      </button>
                      {copilotError && (
                        <p className="text-xs text-red-500 dark:text-red-400">{copilotError}</p>
                      )}
                    </div>
                  )}

                  {copilotAuthStatus === 'requesting' && (
                    <div className="flex items-center gap-2 text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {i18nService.t('githubCopilotRequesting')}
                    </div>
                  )}

                  {(copilotAuthStatus === 'awaiting_user' || copilotAuthStatus === 'polling') && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset border border-claude-border dark:border-claude-darkBorder">
                        <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary mb-2">
                          {i18nService.t('githubCopilotEnterCode')}
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="text-lg font-mono font-bold tracking-widest dark:text-claude-darkText text-claude-text">
                            {copilotUserCode}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(copilotUserCode);
                            }}
                            className="px-2 py-0.5 rounded text-[10px] text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent border border-claude-border dark:border-claude-darkBorder transition-colors"
                          >
                            {i18nService.t('copy') || 'Copy'}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => window.electron.shell.openExternal(copilotVerificationUri)}
                          className="mt-2 text-xs text-claude-accent hover:underline"
                        >
                          {copilotVerificationUri}
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          {i18nService.t('githubCopilotWaiting')}
                        </div>
                        <button
                          type="button"
                          onClick={handleCopilotCancelAuth}
                          className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-red-500 transition-colors"
                        >
                          {i18nService.t('cancel')}
                        </button>
                      </div>
                    </div>
                  )}

                  {(copilotAuthStatus === 'authenticated' || providers['github-copilot'].apiKey) && copilotAuthStatus !== 'requesting' && copilotAuthStatus !== 'awaiting_user' && copilotAuthStatus !== 'polling' && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset border border-claude-border dark:border-claude-darkBorder">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs dark:text-claude-darkText text-claude-text">
                          {copilotGithubUser
                            ? `${i18nService.t('githubCopilotConnected')} @${copilotGithubUser}`
                            : i18nService.t('githubCopilotConnected')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopilotSignOut}
                        className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-red-500 transition-colors"
                      >
                        {i18nService.t('githubCopilotSignOut')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {isCustomProvider(activeProvider) && (
                <div>
                  <label htmlFor={`${activeProvider}-displayName`} className="block text-xs font-medium dark:text-claude-darkText text-claude-text mb-1">
                    {i18nService.t('customDisplayName')}
                  </label>
                  <input
                    type="text"
                    id={`${activeProvider}-displayName`}
                    value={(providers[activeProvider] as ProviderConfig)?.displayName ?? ''}
                    onChange={(e) => handleProviderConfigChange(activeProvider, 'displayName', e.target.value)}
                    className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-xs"
                    placeholder={i18nService.t('customDisplayNamePlaceholder')}
                  />
                </div>
              )}

              {!(activeProvider === 'minimax' && minimaxIsOAuthMode) && (
              <div>
                <label htmlFor={`${activeProvider}-baseUrl`} className="block text-xs font-medium text-foreground mb-1">
                  {i18nService.t('baseUrl')}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id={`${activeProvider}-baseUrl`}
                    value={
                      (() => {
                        // Coding plan override: delegate to ProviderRegistry (50e20b76)
                        const fmt = getEffectiveApiFormat(activeProvider, providers[activeProvider].apiFormat);
                        if (fmt !== 'gemini') {
                          const cpUrl = (providers[activeProvider] as { codingPlanEnabled?: boolean }).codingPlanEnabled
                            ? ProviderRegistry.getCodingPlanUrl(activeProvider, fmt)
                            : undefined;
                          if (cpUrl) return cpUrl;
                        }
                        return providers[activeProvider].baseUrl;
                      })()
                    }
                    onChange={(e) => handleProviderConfigChange(activeProvider, 'baseUrl', e.target.value)}
                    disabled={isBaseUrlLocked}
                    className={`block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-8 text-xs ${isBaseUrlLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder={
                      activeProvider === 'qwen'
                        ? 'https://dashscope.aliyuncs.com/apps/anthropic'
                        : getProviderDefaultBaseUrl(activeProvider, getEffectiveApiFormat(activeProvider, providers[activeProvider].apiFormat)) || defaultConfig.providers?.[activeProvider]?.baseUrl || i18nService.t('baseUrlPlaceholder')
                    }
                  />
                  {providers[activeProvider].baseUrl && !isBaseUrlLocked && (
                    <div className="absolute right-2 inset-y-0 flex items-center">
                      <button
                        type="button"
                        onClick={() => handleProviderConfigChange(activeProvider, 'baseUrl', '')}
                        className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                        title={i18nService.t('clear') || 'Clear'}
                      >
                        <XCircleIconSolid className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                {isCustomProvider(activeProvider) && (
                <div className="mt-1.5 space-y-0.5 text-[11px] text-secondary">
                  <p>
                    <span className="text-sm text-muted mr-1">•</span>
                    {i18nService.t('baseUrlHint1')}
                    <code className="ml-1 text-primary break-all">{i18nService.t('baseUrlHintExample1')}</code>
                  </p>
                  <p>
                    <span className="text-sm text-muted mr-1">•</span>
                    {i18nService.t('baseUrlHint2')}
                    <code className="ml-1 text-primary break-all">{i18nService.t('baseUrlHintExample2')}</code>
                  </p>
                </div>
                )}
                {/* GLM Coding Plan 提示 */}
                {activeProvider === 'zhipu' && providers.zhipu.codingPlanEnabled && (
                  <div className="mt-1.5 p-2 rounded-lg bg-primary-muted border border-primary-muted">
                    <p className="text-[11px] text-primary dark:text-primary">
                      <span className="font-medium">GLM Coding Plan:</span> {i18nService.t('zhipuCodingPlanEndpointHint')}
                    </p>
                  </div>
                )}
                {/* Qwen Coding Plan 提示 */}
                {activeProvider === 'qwen' && providers.qwen.codingPlanEnabled && (
                  <div className="mt-1.5 p-2 rounded-lg bg-primary-muted border border-primary-muted">
                    <p className="text-[11px] text-primary dark:text-primary">
                      <span className="font-medium">Coding Plan:</span> {i18nService.t('qwenCodingPlanEndpointHint')}
                    </p>
                  </div>
                )}
                {/* Volcengine Coding Plan 提示 */}
                {activeProvider === 'volcengine' && providers.volcengine.codingPlanEnabled && (
                  <div className="mt-1.5 p-2 rounded-lg bg-primary-muted border border-primary-muted">
                    <p className="text-[11px] text-primary dark:text-primary">
                      <span className="font-medium">Coding Plan:</span> {i18nService.t('volcengineCodingPlanEndpointHint')}
                    </p>
                  </div>
                )}
                {/* Moonshot Coding Plan 提示 */}
                {activeProvider === 'moonshot' && providers.moonshot.codingPlanEnabled && (
                  <div className="mt-1.5 p-2 rounded-lg bg-primary-muted border border-primary-muted">
                    <p className="text-[11px] text-primary dark:text-primary">
                      <span className="font-medium">Coding Plan:</span> {i18nService.t('moonshotCodingPlanEndpointHint')}
                    </p>
                  </div>
                )}
              </div>
              )}

              {/* API 格式选择器 */}
              {shouldShowApiFormatSelector(activeProvider) && !(activeProvider === 'minimax' && minimaxIsOAuthMode) && (
                <div>
                  <label htmlFor={`${activeProvider}-apiFormat`} className="block text-xs font-medium text-foreground mb-1">
                    {i18nService.t('apiFormat')}
                  </label>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name={`${activeProvider}-apiFormat`}
                        value="anthropic"
                        checked={getEffectiveApiFormat(activeProvider, providers[activeProvider].apiFormat) !== 'openai'}
                        onChange={() => handleProviderConfigChange(activeProvider, 'apiFormat', 'anthropic')}
                        className="h-3.5 w-3.5 text-claude-accent focus:ring-claude-accent dark:bg-claude-darkSurface bg-claude-surface disabled:opacity-50"
                      />
                      <span className="ml-2 text-xs text-foreground">
                        {i18nService.t('apiFormatNative')}
                      </span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name={`${activeProvider}-apiFormat`}
                        value="openai"
                        checked={getEffectiveApiFormat(activeProvider, providers[activeProvider].apiFormat) === 'openai'}
                        onChange={() => handleProviderConfigChange(activeProvider, 'apiFormat', 'openai')}
                        className="h-3.5 w-3.5 text-claude-accent focus:ring-claude-accent dark:bg-claude-darkSurface bg-claude-surface disabled:opacity-50"
                      />
                      <span className="ml-2 text-xs text-foreground">
                        {i18nService.t('apiFormatOpenAI')}
                      </span>
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-secondary">
                    {i18nService.t('apiFormatHint')}
                  </p>
                </div>
              )}

              {/* GLM Coding Plan 开关 (仅 Zhipu) */}
              {activeProvider === 'zhipu' && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-medium text-foreground">
                        GLM Coding Plan
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary-muted text-primary">
                        Beta
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-secondary">
                      {i18nService.t('zhipuCodingPlanHint')}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-3">
                    <input
                      type="checkbox"
                      checked={providers.zhipu.codingPlanEnabled ?? false}
                      onChange={(e) => handleProviderConfigChange('zhipu', 'codingPlanEnabled', e.target.checked ? 'true' : 'false')}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                  </label>
                </div>
              )}

              {/* Qwen Coding Plan 开关 (仅 Qwen) */}
              {activeProvider === 'qwen' && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-medium text-foreground">
                        Coding Plan
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary-muted text-primary">
                        {i18nService.t('codingPlanSubscriptionBadge')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-secondary">
                      {i18nService.t('qwenCodingPlanHint')}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-3">
                    <input
                      type="checkbox"
                      checked={providers.qwen.codingPlanEnabled ?? false}
                      onChange={(e) => handleProviderConfigChange('qwen', 'codingPlanEnabled', e.target.checked ? 'true' : 'false')}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                  </label>
                </div>
              )}

              {/* Volcengine Coding Plan 开关 (仅 Volcengine) */}
              {activeProvider === 'volcengine' && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-medium text-foreground">
                        Coding Plan
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary-muted text-primary">
                        Beta
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-secondary">
                      {i18nService.t('volcengineCodingPlanHint')}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-3">
                    <input
                      type="checkbox"
                      checked={providers.volcengine.codingPlanEnabled ?? false}
                      onChange={(e) => handleProviderConfigChange('volcengine', 'codingPlanEnabled', e.target.checked ? 'true' : 'false')}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                  </label>
                </div>
              )}

              {/* Moonshot Coding Plan 开关 (仅 Moonshot) */}
              {activeProvider === 'moonshot' && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-medium text-foreground">
                        Coding Plan
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary-muted text-primary">
                        Beta
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-secondary">
                      {i18nService.t('moonshotCodingPlanHint')}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-3">
                    <input
                      type="checkbox"
                      checked={providers.moonshot.codingPlanEnabled ?? false}
                      onChange={(e) => handleProviderConfigChange('moonshot', 'codingPlanEnabled', e.target.checked ? 'true' : 'false')}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                  </label>
                </div>
              )}

              {/* 测试连接按钮 */}
              {!(activeProvider === 'minimax' && minimaxIsOAuthMode) && (
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting || (providerRequiresApiKey(activeProvider) && !providers[activeProvider].apiKey && !(activeProvider === 'qwen' && providers.qwen.oauthCredentials))}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-xl border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
                >
                  <SignalIcon className="h-3.5 w-3.5 mr-1.5" />
                  {isTesting ? i18nService.t('testing') : i18nService.t('testConnection')}
                </button>
              </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-xs font-medium text-foreground">
                    {i18nService.t('availableModels')}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleFetchModels}
                      disabled={isFetchingModels}
                      className="inline-flex items-center text-xs text-secondary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title={i18nService.t('getModelList')}
                    >
                      <ArrowPathIcon className={`h-3.5 w-3.5 mr-1 ${isFetchingModels ? 'animate-spin' : ''}`} />
                      {isFetchingModels ? i18nService.t('gettingModelList') : i18nService.t('getModelList')}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddModel}
                      className="inline-flex items-center text-xs text-primary hover:text-primary-hover"
                    >
                      <PlusCircleIcon className="h-3.5 w-3.5 mr-1" />
                      {i18nService.t('addModel')}
                    </button>
                  </div>
                </div>

                {/* Models List */}
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {(providers[activeProvider].models ?? []).map(model => (
                    <div
                      key={model.id}
                      className="bg-surface p-2 rounded-xl border-border border transition-colors hover:border-primary group"
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <div className="w-1.5 h-1.5 shrink-0 rounded-full bg-green-400"></div>
                          <div className="min-w-0">
                            <div className="text-foreground font-medium text-[11px] truncate">{model.name}</div>
                            <div className="text-[10px] text-secondary truncate">{model.id}</div>
                          </div>
                        </div>
                        <div className="flex items-center shrink-0 space-x-1">
                          {model.supportsImage && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary-muted text-primary">
                              {i18nService.t('imageInput')}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEditModel(model.id, model.name, model.supportsImage)}
                            className="p-0.5 text-secondary hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <PencilIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteModel(model.id)}
                            className="p-0.5 text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {(!providers[activeProvider].models || providers[activeProvider].models.length === 0) && (
                    <div className="bg-surface p-2.5 rounded-xl border border-border-subtle text-center">
                      <p className="text-[11px] text-secondary">{i18nService.t('noModelsAvailable')}</p>
                      <button
                        type="button"
                        onClick={handleAddModel}
                        className="mt-1.5 inline-flex items-center text-[11px] font-medium text-primary hover:text-primary-hover"
                      >
                        <PlusCircleIcon className="h-3 w-3 mr-1" />
                        {i18nService.t('addFirstModel')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              </>}
            </div>
          </div>
        );

      case SettingsTab.CoworkAgent:
        return (
          <div className="space-y-6">
            {/* Agent Settings (IDENTITY.md + SOUL.md) */}
            <div className="space-y-4 rounded-xl border px-4 py-4 border-border">
              <div className="text-sm font-medium text-foreground">
                {i18nService.t('coworkBootstrapAgentSectionTitle')}
              </div>
              {[
                { filename: 'IDENTITY.md', titleKey: 'coworkBootstrapIdentityTitle', hintKey: 'coworkBootstrapIdentityHint', value: bootstrapIdentity, setter: setBootstrapIdentity },
                { filename: 'SOUL.md', titleKey: 'coworkBootstrapSoulTitle', hintKey: 'coworkBootstrapSoulHint', value: bootstrapSoul, setter: setBootstrapSoul },
              ].map(({ filename, titleKey, hintKey, value, setter }) => (
                <div key={filename} className="space-y-2">
                  <div className="text-xs font-medium text-secondary">
                    {i18nService.t(titleKey)}
                    <span className="ml-1.5 font-normal opacity-60">
                      （{i18nService.t('coworkBootstrapStoragePath')}：<span className="font-mono">{joinWorkspacePath(coworkConfig.workingDirectory, filename)}</span>）
                    </span>
                  </div>
                  <textarea
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface text-foreground resize-y"
                    placeholder={i18nService.t(hintKey)}
                  />
                </div>
              ))}
            </div>

            {/* User Profile (USER.md) */}
            <div className="space-y-3 rounded-xl border px-4 py-4 border-border">
              <div className="text-sm font-medium text-foreground">
                {i18nService.t('coworkBootstrapUserTitle')}
                <span className="ml-1.5 text-xs font-normal opacity-60 text-secondary">
                  （{i18nService.t('coworkBootstrapStoragePath')}：<span className="font-mono">{joinWorkspacePath(coworkConfig.workingDirectory, 'USER.md')}</span>）
                </span>
              </div>
              <textarea
                value={bootstrapUser}
                onChange={(e) => setBootstrapUser(e.target.value)}
                rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface text-foreground resize-y"
                placeholder={i18nService.t('coworkBootstrapUserHint')}
              />
            </div>
          </div>
        );

      case SettingsTab.Shortcuts:
        return (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                {i18nService.t('keyboardShortcuts')}
              </label>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{i18nService.t('newChat')}</span>
                  <ShortcutRecorder value={shortcuts.newChat} onChange={(v) => handleShortcutChange('newChat', v)} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{i18nService.t('search')}</span>
                  <ShortcutRecorder value={shortcuts.search} onChange={(v) => handleShortcutChange('search', v)} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{i18nService.t('openSettings')}</span>
                  <ShortcutRecorder value={shortcuts.settings} onChange={(v) => handleShortcutChange('settings', v)} />
                </div>
              </div>
            </div>
          </div>
        );

      case SettingsTab.Im:
        return <IMSettings />;

      case SettingsTab.ScheduledTasks:
        return (
          <div className="h-full min-h-0">
            <ScheduledTasksView embedded />
          </div>
        );

      case SettingsTab.Mcp:
        return <McpManager />;

      case SettingsTab.Agents:
        return <AgentsView embedded />;

      case SettingsTab.ThemeSkin:
        return (
          <ThemeSkinSettings
            readOnly={enterpriseConfig?.ui?.['settings.themeSkin'] === 'readonly'}
          />
        );

      case SettingsTab.About:
        return (
          <div className="flex min-h-full flex-col items-center pt-6 pb-3">
            {/* Logo & App Name */}
            <img
              src="logo.png"
              alt="WeSight"
              className="w-16 h-16 mb-3 cursor-pointer select-none"
              onClick={() => {
                const next = logoClickCount + 1;
                setLogoClickCount(next);
                if (next >= 10 && !testModeUnlocked) {
                  setTestModeUnlocked(true);
                }
              }}
            />
            <h3 className="text-lg font-semibold text-foreground">WeSight</h3>
            <span className="text-xs text-secondary mt-1">v{appVersion}</span>

            {/* Info Card */}
            <div className="w-full mt-8 rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm text-foreground">{i18nService.t('aboutVersion')}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-secondary">{appVersion}</span>
                  {!enterpriseConfig?.disableUpdate && (
                  <button
                    type="button"
                    disabled={updateCheckStatus === 'checking'}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleCheckUpdate();
                    }}
                    className="text-xs px-2 py-0.5 rounded-md border border-border text-secondary hover:text-primary dark:hover:text-primary hover:border-primary dark:hover:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updateCheckStatus === 'checking' && i18nService.t('updateChecking')}
                    {updateCheckStatus === 'upToDate' && i18nService.t('updateUpToDate')}
                    {updateCheckStatus === 'error' && i18nService.t('updateCheckFailed')}
                    {updateCheckStatus === 'idle' && i18nService.t('checkForUpdate')}
                  </button>
                  )}
                  {enterpriseConfig?.disableUpdate && (
                  <span className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                    {i18nService.t('settings.enterprise.managed')}
                  </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm text-foreground">{i18nService.t('aboutContactEmail')}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleCopyContactEmail();
                    }}
                    title={i18nService.t('copyToClipboard')}
                    className="text-sm text-secondary bg-transparent border-none appearance-none p-0 m-0 cursor-pointer focus:outline-none"
                  >
                    {ABOUT_CONTACT_EMAIL}
                  </button>
                  {emailCopied && (
                    <span className="text-[11px] leading-4 text-emerald-600 dark:text-emerald-400">
                      {i18nService.t('copied')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm text-foreground">{i18nService.t('aboutUserManual')}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenUserManual();
                  }}
                  className="text-sm text-secondary hover:text-primary dark:hover:text-primary bg-transparent border-none appearance-none px-1.5 py-0.5 -mx-1.5 -my-0.5 rounded-md cursor-pointer focus:outline-none hover:bg-surface-raised transition-colors"
                >
                  {ABOUT_USER_MANUAL_URL}
                </button>
              </div>
              <div className={`flex items-center justify-between px-4 py-3${testModeUnlocked ? ' border-b border-border' : ''}`}>
                <span className="text-sm text-foreground">{i18nService.t('aboutUserCommunity')}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenUserCommunity();
                  }}
                  className="text-sm text-secondary hover:text-primary dark:hover:text-primary bg-transparent border-none appearance-none px-1.5 py-0.5 -mx-1.5 -my-0.5 rounded-md cursor-pointer focus:outline-none hover:bg-surface-raised transition-colors"
                >
                  {ABOUT_USER_COMMUNITY_URL}
                </button>
              </div>
              {testModeUnlocked && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-foreground">{i18nService.t('testMode')}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={testMode}
                    onClick={() => setTestMode((prev) => !prev)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                      testMode ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        testMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-auto w-full pt-14 pb-2 flex flex-col items-center">
              <div className="flex items-center justify-center text-sm text-secondary">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenServiceTerms();
                  }}
                  className="bg-transparent border-none appearance-none px-1.5 py-0.5 -mx-1.5 -my-0.5 rounded-md cursor-pointer hover:text-primary dark:hover:text-primary transition-colors"
                >
                  {i18nService.t('aboutServiceTerms')}
                </button>
                <span className="mx-3 text-xs opacity-40">|</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleExportLogs();
                  }}
                  disabled={isExportingLogs}
                  className="bg-transparent border-none appearance-none px-1.5 py-0.5 -mx-1.5 -my-0.5 rounded-md cursor-pointer hover:text-primary dark:hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExportingLogs ? i18nService.t('aboutExportingLogs') : i18nService.t('aboutExportLogs')}
                </button>
                <span className="mx-3 text-xs opacity-40">|</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void window.electron.shell.openExternal('https://github.com/freestylefly/wesight');
                  }}
                  className="bg-transparent border-none appearance-none px-1.5 py-0.5 -mx-1.5 -my-0.5 rounded-md cursor-pointer hover:text-primary dark:hover:text-primary transition-colors"
                >
                  开源项目
                </button>
              </div>

              <p className="mt-5 text-xs text-secondary">
                &copy; {new Date().getFullYear()} WeSight by 苍何团队 · 数据本地存储 版权所有
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const handleCloseSettings = () => {
    if (isSaving) return;
    onClose();
  };

  const isThemeSkinTab = activeTab === SettingsTab.ThemeSkin;
  const isEmbeddedToolTab = activeTab === SettingsTab.ScheduledTasks
    || activeTab === SettingsTab.Mcp
    || activeTab === SettingsTab.Agents
    || isThemeSkinTab;
  const isFullHeightTab = activeTab === SettingsTab.ScheduledTasks
    || activeTab === SettingsTab.Agents
    || isThemeSkinTab;
  const contentClassName = isFullHeightTab
    ? 'p-0 flex-1 overflow-hidden'
    : 'px-6 py-4 flex-1 overflow-y-auto';
  const contentStyle = isFullHeightTab ? undefined : { scrollbarGutter: 'stable' as const };
  const settingsContent = (
    <div
      ref={contentRef}
      className={contentClassName}
      style={contentStyle}
    >
      {renderTabContent()}
    </div>
  );

  return (
    <Modal onClose={handleCloseSettings} overlayClassName="fixed inset-0 z-50 modal-backdrop flex items-center justify-center">
      <div
        className={`relative flex max-w-[calc(100vw-48px)] rounded-2xl border-border border shadow-modal overflow-hidden modal-content ${
          isThemeSkinTab ? 'w-[1180px]' : isEmbeddedToolTab ? 'w-[1040px]' : 'w-[900px]'
        } ${isThemeSkinTab ? 'h-[90vh]' : 'h-[80vh]'}`}
        onClick={handleSettingsClick}
      >
        {/* Left sidebar */}
        <div className="w-[220px] shrink-0 flex flex-col bg-surface-raised border-r border-border rounded-l-2xl overflow-y-auto">
          <div className="px-5 pt-5 pb-3">
            <h2 className="text-lg font-semibold text-foreground">{i18nService.t('settings')}</h2>
          </div>
          <nav className="flex flex-col gap-0.5 px-3 pb-4">
            {sidebarTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                disabled={isSaving}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  activeTab === tab.key
                    ? 'bg-primary-muted text-primary'
                    : 'text-secondary hover:text-foreground hover:bg-surface-raised'
                } disabled:cursor-wait disabled:opacity-60`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Right content */}
        <div className="relative flex-1 flex flex-col min-w-0 overflow-hidden bg-background rounded-r-2xl">
          {/* Content header */}
          <div className="flex justify-between items-center px-6 pt-5 pb-3 shrink-0">
            <h3 className="text-lg font-semibold text-foreground">{activeTabLabel}</h3>
            <button
              onClick={handleCloseSettings}
              disabled={isSaving}
              className="text-secondary hover:text-foreground p-1.5 hover:bg-surface-raised rounded-lg transition-colors disabled:cursor-wait disabled:opacity-50"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {noticeMessage && (
            <div className="px-6">
              <ErrorMessage
                message={noticeMessage}
                onClose={() => setNoticeMessage(null)}
              />
            </div>
          )}

          {error && (
            <div className="px-6">
              <ErrorMessage
                message={error}
                onClose={() => setError(null)}
              />
            </div>
          )}

          {isEmbeddedToolTab ? (
            <div className="flex flex-col flex-1 overflow-hidden">
              {settingsContent}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              {settingsContent}

              <div className="flex justify-end space-x-4 p-4 border-border border-t bg-background shrink-0">
                <button
                  type="button"
                  onClick={handleCloseSettings}
                  disabled={isSaving}
                  className="px-4 py-2 text-foreground hover:bg-surface-raised rounded-xl transition-colors text-sm font-medium border border-border active:scale-[0.98] disabled:cursor-wait disabled:opacity-50"
                >
                  {i18nService.t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {isCoworkAgentConfigApplying
                    ? i18nService.t('coworkAgentConfigApplying')
                    : isSaving ? i18nService.t('saving') : i18nService.t('save')}
                </button>
              </div>
            </form>
          )}

        </div>

        {isTestResultModalOpen && testResult && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/35 px-4 rounded-2xl"
            onClick={() => setIsTestResultModalOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={i18nService.t('connectionTestResult')}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-background border-border border shadow-modal p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-foreground">
                  {i18nService.t('connectionTestResult')}
                </h4>
                <button
                  type="button"
                  onClick={() => setIsTestResultModalOpen(false)}
                  className="p-1 text-secondary hover:text-foreground rounded-md hover:bg-surface-raised"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-secondary">
                <span>{providerMeta[testResult.provider]?.label ?? testResult.provider}</span>
                <span className="text-[11px]">•</span>
                <span className={`inline-flex items-center gap-1 ${testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {testResult.success ? (
                    <CheckCircleIcon className="h-4 w-4" />
                  ) : (
                    <XCircleIcon className="h-4 w-4" />
                  )}
                  {testResult.success ? i18nService.t('connectionSuccess') : i18nService.t('connectionFailed')}
                </span>
              </div>

              <p className="mt-3 text-xs leading-5 text-foreground whitespace-pre-wrap break-words max-h-56 overflow-y-auto">
                {testResult.message}
              </p>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsTestResultModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-xl border border-border text-foreground hover:bg-surface-raised transition-colors active:scale-[0.98]"
                >
                  {i18nService.t('close')}
                </button>
              </div>
            </div>
          </div>
        )}

        {pendingDeleteProvider && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 px-4 rounded-2xl"
            onClick={() => setPendingDeleteProvider(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl dark:bg-claude-darkSurface bg-claude-bg dark:border-claude-darkBorder border-claude-border border shadow-modal p-4"
            >
              <p className="text-sm dark:text-claude-darkText text-claude-text">
                {i18nService.t('confirmDeleteCustomProvider')}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingDeleteProvider(null)}
                  className="px-3 py-1.5 text-xs font-medium rounded-xl border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors active:scale-[0.98]"
                >
                  {i18nService.t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteCustomProvider}
                  className="px-3 py-1.5 text-xs font-medium rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors active:scale-[0.98]"
                >
                  {i18nService.t('deleteCustomProvider')}
                </button>
              </div>
            </div>
          </div>
        )}

        {(isAddingModel || isEditingModel) && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 px-4 rounded-2xl"
            onClick={handleCancelModelEdit}
          >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={isEditingModel ? i18nService.t('editModel') : i18nService.t('addNewModel')}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleModelDialogKeyDown}
                className="w-full max-w-md rounded-2xl bg-background border-border border shadow-modal p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-foreground">
                    {isEditingModel ? i18nService.t('editModel') : i18nService.t('addNewModel')}
                  </h4>
                  <button
                    type="button"
                    onClick={handleCancelModelEdit}
                    className="p-1 text-secondary hover:text-foreground rounded-md hover:bg-surface-raised"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>

                {modelFormError && (
                  <p className="mb-3 text-xs text-red-600 dark:text-red-400">
                    {modelFormError}
                  </p>
                )}

                <div className="space-y-3">
                  {activeProvider === 'ollama' ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-secondary mb-1">
                          {i18nService.t('ollamaModelName')}
                        </label>
                        <input
                          autoFocus
                          type="text"
                          value={newModelId}
                          onChange={(e) => {
                            setNewModelId(e.target.value);
                            if (!newModelName || newModelName === newModelId) {
                              setNewModelName(e.target.value);
                            }
                            if (modelFormError) {
                              setModelFormError(null);
                            }
                          }}
                          className="block w-full rounded-xl bg-surface-inset border-border border focus:border-primary focus:ring-1 focus:ring-primary/30 text-foreground px-3 py-2 text-xs"
                          placeholder={i18nService.t('ollamaModelNamePlaceholder')}
                        />
                        <p className="mt-1 text-[11px] text-muted">
                          {i18nService.t('ollamaModelNameHint')}
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-secondary mb-1">
                          {i18nService.t('ollamaDisplayName')}
                        </label>
                        <input
                          type="text"
                          value={newModelName === newModelId ? '' : newModelName}
                          onChange={(e) => {
                            setNewModelName(e.target.value || newModelId);
                            if (modelFormError) {
                              setModelFormError(null);
                            }
                          }}
                          className="block w-full rounded-xl bg-surface-inset border-border border focus:border-primary focus:ring-1 focus:ring-primary/30 text-foreground px-3 py-2 text-xs"
                          placeholder={i18nService.t('ollamaDisplayNamePlaceholder')}
                        />
                        <p className="mt-1 text-[11px] text-muted">
                          {i18nService.t('ollamaDisplayNameHint')}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-secondary mb-1">
                          {i18nService.t('modelName')}
                        </label>
                        <input
                          autoFocus
                          type="text"
                          value={newModelName}
                          onChange={(e) => {
                            setNewModelName(e.target.value);
                            if (modelFormError) {
                              setModelFormError(null);
                            }
                          }}
                          className="block w-full rounded-xl bg-surface-inset border-border border focus:border-primary focus:ring-1 focus:ring-primary/30 text-foreground px-3 py-2 text-xs"
                          placeholder="GPT-4"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-secondary mb-1">
                          {i18nService.t('modelId')}
                        </label>
                        <input
                          type="text"
                          value={newModelId}
                          onChange={(e) => {
                            setNewModelId(e.target.value);
                            if (modelFormError) {
                              setModelFormError(null);
                            }
                          }}
                          className="block w-full rounded-xl bg-surface-inset border-border border focus:border-primary focus:ring-1 focus:ring-primary/30 text-foreground px-3 py-2 text-xs"
                          placeholder="gpt-4"
                        />
                      </div>
                    </>
                  )}
                  <div className="flex items-center space-x-2">
                    <input
                      id={`${activeProvider}-supportsImage`}
                      type="checkbox"
                      checked={newModelSupportsImage}
                      onChange={(e) => setNewModelSupportsImage(e.target.checked)}
                      className="h-3.5 w-3.5 text-primary focus:ring-primary bg-surface border-border rounded"
                    />
                    <label
                      htmlFor={`${activeProvider}-supportsImage`}
                      className="text-xs text-secondary"
                    >
                      {i18nService.t('supportsImageInput')}
                    </label>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 mt-4">
                  <button
                    type="button"
                    onClick={handleCancelModelEdit}
                    className="px-3 py-1.5 text-xs text-foreground hover:bg-surface-raised rounded-xl border border-border"
                  >
                    {i18nService.t('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNewModel}
                    className="px-3 py-1.5 text-xs text-white bg-primary hover:bg-primary-hover rounded-xl active:scale-[0.98]"
                  >
                    {i18nService.t('save')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Memory Modal */}
          {showMemoryModal && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 px-4 rounded-2xl"
              onClick={resetCoworkMemoryEditor}
            >
              <div
                className="bg-surface border-border border rounded-2xl shadow-xl w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-5 pt-5 pb-4 border-b border-border">
                  <h3 className="text-base font-semibold text-foreground">
                    {coworkMemoryEditingId ? i18nService.t('coworkMemoryCrudUpdate') : i18nService.t('coworkMemoryCrudCreate')}
                  </h3>
                </div>

                <div className="px-5 py-4 space-y-4">
                  {coworkMemoryEditingId && (
                    <div className="rounded-lg border px-2 py-1 text-xs border-border text-secondary">
                      {i18nService.t('coworkMemoryEditingTag')}
                    </div>
                  )}
                  <textarea
                    value={coworkMemoryDraftText}
                    onChange={(event) => setCoworkMemoryDraftText(event.target.value)}
                    placeholder={i18nService.t('coworkMemoryCrudTextPlaceholder')}
                    autoFocus
                    className="min-h-[200px] w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                <div className="flex justify-end space-x-2 px-5 pb-5">
                  <button
                    type="button"
                    onClick={resetCoworkMemoryEditor}
                    className="px-3 py-1.5 text-sm text-foreground hover:bg-surface-raised rounded-xl border border-border transition-colors"
                  >
                    {i18nService.t('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleSaveCoworkMemoryEntry(); }}
                    disabled={!coworkMemoryDraftText.trim() || coworkMemoryListLoading}
                    className="px-3 py-1.5 text-sm text-white bg-primary hover:bg-primary-hover rounded-xl disabled:opacity-60 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
                  >
                    {coworkMemoryEditingId ? i18nService.t('save') : i18nService.t('coworkMemoryCrudCreate')}
                  </button>
                </div>
              </div>
            </div>
          )}
      </div>
    </Modal>
  );
};

export default Settings; 
