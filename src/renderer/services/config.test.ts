import { expect, test, vi } from 'vitest';

import { ModelVendor } from '../../shared/models/constants';
import { OpenLux } from '../../shared/openlux/constants';
import { ApiFormat, ProviderName, ProviderRegistry } from '../../shared/providers';
import { KimiModelMode } from '../../shared/providers/kimi/constants';
import { defaultConfig, getVisibleProviders } from '../config';
import { switchKimiModelMode } from './kimiProvider';

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock('./store', () => ({ localStore: storage }));

import { configService } from './config';

test('old configurations gain a disabled OpenLux provider while preserving existing credentials and selection', async () => {
  const old = structuredClone(defaultConfig);
  delete old.providers![ProviderName.OpenLux];
  old.providers![ProviderName.OpenAI].enabled = true;
  old.providers![ProviderName.OpenAI].apiKey = 'existing-test-key';
  old.model.defaultModelProvider = ProviderName.OpenAI;
  old.model.defaultModel = 'gpt-5.5';
  storage.getItem.mockResolvedValue(old);
  await configService.init();
  const config = configService.getConfig();
  expect(config.providers![ProviderName.OpenLux]).toMatchObject({ enabled: false, apiKey: '', baseUrl: OpenLux.BaseUrl, apiFormat: ApiFormat.OpenAI, models: [] });
  expect(config.providers![ProviderName.OpenAI].apiKey).toBe('existing-test-key');
  expect(config.model.defaultModelProvider).toBe(ProviderName.OpenAI);
  for (const language of ['zh', 'en'] as const) {
    expect(getVisibleProviders(language).slice(0, 2)).toEqual([ProviderName.TokenDance, ProviderName.OpenLux]);
  }
});

test('saving and reloading OpenLux preserves grouping and selection and normalizes its protocol', async () => {
  const config = structuredClone(defaultConfig);
  config.providers![ProviderName.OpenLux] = {
    enabled: true, apiKey: 'test-key', baseUrl: `${OpenLux.BaseUrl}/`, apiFormat: ApiFormat.Anthropic,
    defaultModel: 'gemini-2.5-pro', models: [{ id: 'gemini-2.5-pro', name: 'Gemini', modelVendor: ModelVendor.Google, supportsImage: true }],
  };
  await configService.updateConfig(config);
  const saved = structuredClone(storage.setItem.mock.calls[storage.setItem.mock.calls.length - 1][1]);
  expect(saved.providers[ProviderName.OpenLux].apiFormat).toBe(ApiFormat.OpenAI);
  storage.getItem.mockResolvedValue(saved);
  await configService.init();
  expect(configService.getConfig().providers![ProviderName.OpenLux]).toMatchObject({
    baseUrl: OpenLux.BaseUrl, apiFormat: ApiFormat.OpenAI, defaultModel: 'gemini-2.5-pro',
    models: [{ id: 'gemini-2.5-pro', modelVendor: ModelVendor.Google, supportsImage: true }],
  });
});

test('saving and reloading Kimi preserves separate mode credentials and the Code catalog', async () => {
  const config = structuredClone(defaultConfig);
  const api = { ...config.providers![ProviderName.Moonshot], apiKey: 'saved-api-key', baseUrl: 'https://proxy.example.test/v1' };
  const code = switchKimiModelMode(api, KimiModelMode.Code);
  config.providers![ProviderName.Moonshot] = { ...code, apiKey: 'saved-code-key', enabled: true };
  await configService.updateConfig(config);
  const saved = structuredClone(storage.setItem.mock.calls[storage.setItem.mock.calls.length - 1][1]);
  storage.getItem.mockResolvedValue(saved);
  await configService.init();
  const reloadedCode = configService.getConfig().providers![ProviderName.Moonshot];
  expect(reloadedCode).toMatchObject({ apiKey: 'saved-code-key', codingPlanEnabled: true, apiFormat: ApiFormat.OpenAI });
  expect(reloadedCode.models?.map(model => model.id)).toEqual(['kimi-for-coding']);
  expect(switchKimiModelMode(reloadedCode, KimiModelMode.Api)).toMatchObject({
    apiKey: 'saved-api-key', baseUrl: api.baseUrl, codingPlanEnabled: false, models: api.models,
  });
});

test('loading a legacy Kimi Code URL migrates its protocol and API-only model list', async () => {
  const legacy = structuredClone(defaultConfig);
  legacy.providers![ProviderName.Moonshot] = {
    ...legacy.providers![ProviderName.Moonshot],
    apiKey: 'legacy-code-key',
    baseUrl: 'https://api.kimi.com/coding',
    apiFormat: ApiFormat.Anthropic,
  };
  storage.getItem.mockResolvedValue(legacy);
  await configService.init();
  expect(configService.getConfig().providers![ProviderName.Moonshot]).toMatchObject({
    apiKey: 'legacy-code-key',
    codingPlanEnabled: true,
    apiFormat: ApiFormat.OpenAI,
    baseUrl: 'https://api.kimi.com/coding/v1',
    models: [{ id: 'kimi-for-coding', name: 'Kimi K2.6', supportsImage: true }],
  });
});

test('legacy Kimi defaults follow the normalized Code catalog instead of selecting another provider', async () => {
  const definition = ProviderRegistry.get(ProviderName.Moonshot)!;
  for (const provider of [ProviderName.Moonshot, undefined]) {
    const legacy = structuredClone(defaultConfig);
    legacy.providers![ProviderName.OpenAI].enabled = true;
    legacy.providers![ProviderName.Moonshot] = {
      ...legacy.providers![ProviderName.Moonshot],
      enabled: true,
      apiKey: 'legacy-code-key',
      baseUrl: definition.codingPlanUrls!.anthropic,
    };
    legacy.model.defaultModel = definition.defaultModels[0].id;
    legacy.model.defaultModelProvider = provider;
    storage.getItem.mockResolvedValue(legacy);
    await configService.init();
    expect(configService.getConfig().model).toMatchObject({
      defaultModel: definition.codingPlanModels![0].id,
      defaultModelProvider: ProviderName.Moonshot,
    });
  }
});

test('Kimi catalog migrations leave unrelated custom default model identities unchanged', async () => {
  const legacy = structuredClone(defaultConfig);
  legacy.providers![ProviderName.Moonshot].codingPlanEnabled = true;
  legacy.model.defaultModel = 'unrelated-custom-model';
  legacy.model.defaultModelProvider = ProviderName.Moonshot;
  storage.getItem.mockResolvedValue(legacy);
  await configService.init();
  expect(configService.getConfig().model).toMatchObject({
    defaultModel: 'unrelated-custom-model',
    defaultModelProvider: ProviderName.Moonshot,
  });
});
