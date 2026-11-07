import { ApiFormat, ProviderName, ProviderRegistry } from '../../shared/providers';
import {
  type KimiModeConfig,
  type KimiModeConfigs,
  KimiModelMode,
} from '../../shared/providers/kimi/constants';

interface KimiProviderState extends KimiModeConfig {
  codingPlanEnabled?: boolean;
  kimiModeConfigs?: KimiModeConfigs;
}

const definition = ProviderRegistry.get(ProviderName.Moonshot)!;
const codeBaseUrl = ProviderRegistry.getCodingPlanUrl(ProviderName.Moonshot, ApiFormat.OpenAI)!;
const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '');

const isCodeBaseUrl = (url: string) => Object.values(definition.codingPlanUrls ?? {})
  .some(endpoint => normalizeUrl(endpoint).toLowerCase() === normalizeUrl(url).toLowerCase());

export function getKimiModelMode(config: Pick<KimiProviderState, 'codingPlanEnabled' | 'baseUrl' | 'kimiModeConfigs'>): KimiModelMode {
  return config.codingPlanEnabled || (!config.kimiModeConfigs && isCodeBaseUrl(config.baseUrl))
    ? KimiModelMode.Code
    : KimiModelMode.Api;
}

function normalizeModeConfig(mode: KimiModelMode, config?: KimiModeConfig): KimiModeConfig {
  const isCode = mode === KimiModelMode.Code;
  const defaultModels = isCode ? definition.codingPlanModels ?? definition.defaultModels : definition.defaultModels;
  const suppliedModels = config?.models;
  // Older Code configurations may still contain the standard API model list.
  const modeModels = isCode ? suppliedModels?.filter(model => !definition.defaultModels.some(defaultModel => defaultModel.id === model.id)) : suppliedModels;
  const needsDefaultModels = modeModels === undefined || (suppliedModels?.length && !modeModels.length);
  const models = (needsDefaultModels ? defaultModels : modeModels!)
    .map(model => ({ ...model }));
  const baseUrl = normalizeUrl(config?.baseUrl ?? '');
  const apiAnthropicUrl = ProviderRegistry.getSwitchableBaseUrl(ProviderName.Moonshot, ApiFormat.Anthropic);
  return {
    apiKey: config?.apiKey ?? '',
    baseUrl: isCode ? codeBaseUrl : (!baseUrl || isCodeBaseUrl(baseUrl) || baseUrl === apiAnthropicUrl ? definition.defaultBaseUrl : baseUrl),
    apiFormat: ApiFormat.OpenAI,
    models,
    defaultModel: models.some(model => model.id === config?.defaultModel) ? config!.defaultModel : models[0]?.id,
  };
}

/** Keep the active fields available to existing runtime consumers. */
export function normalizeKimiProviderConfig<T extends KimiProviderState>(config: T): T {
  const mode = getKimiModelMode(config);
  const active = normalizeModeConfig(mode, config);
  const kimiModeConfigs: KimiModeConfigs = { ...config.kimiModeConfigs, [mode]: active };
  for (const savedMode of Object.values(KimiModelMode)) {
    const snapshot = kimiModeConfigs[savedMode];
    if (snapshot) kimiModeConfigs[savedMode] = normalizeModeConfig(savedMode, snapshot);
  }
  return {
    ...config,
    ...active,
    codingPlanEnabled: mode === KimiModelMode.Code,
    kimiModeConfigs,
  };
}

export function switchKimiModelMode<T extends KimiProviderState>(config: T, mode: KimiModelMode): T {
  const normalized = normalizeKimiProviderConfig(config);
  if (getKimiModelMode(normalized) === mode) return normalized;
  const next = normalizeModeConfig(mode, normalized.kimiModeConfigs?.[mode]);
  return normalizeKimiProviderConfig({
    ...normalized,
    ...next,
    codingPlanEnabled: mode === KimiModelMode.Code,
  });
}
