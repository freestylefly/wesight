import { expect, test, vi } from 'vitest';

import { ModelVendor } from '../../shared/models/constants';
import { OpenLux } from '../../shared/openlux/constants';
import { ApiFormat, ProviderName } from '../../shared/providers';
import { defaultConfig, getVisibleProviders } from '../config';

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock('./store', () => ({ localStore: storage }));

import { configService } from './config';

test.each(['MiniMax-M2.5', 'MiniMax-text-01', 'abab7-chat-preview', 'MiniMax-M2.7', 'my-custom-model'])('MiniMax migration preserves saved %s and exposes Flash first', async (modelId) => {
  const old = structuredClone(defaultConfig);
  const saved = { id: modelId, name: 'Saved model', supportsImage: true };
  old.providers![ProviderName.Minimax] = {
    enabled: true, apiKey: 'existing-test-key', baseUrl: 'https://api.minimax.io/anthropic',
    apiFormat: ApiFormat.Anthropic, defaultModel: modelId, models: [saved],
  };
  old.model.defaultModel = modelId;
  old.model.defaultModelProvider = ProviderName.Minimax;
  storage.getItem.mockResolvedValue(old);
  await configService.init();
  const config = configService.getConfig();
  expect(config.providers![ProviderName.Minimax]).toMatchObject({
    enabled: true, apiKey: 'existing-test-key', baseUrl: 'https://api.minimax.io/anthropic',
    defaultModel: modelId,
    models: [
      { id: 'MiniMax-M3.1-Flash', supportsImage: false },
      { id: 'MiniMax-M3', supportsImage: false },
      saved,
    ],
  });
  expect(config.model.defaultModel).toBe(modelId);
  expect(config.model.defaultModelProvider).toBe(ProviderName.Minimax);
});

test('fresh MiniMax choices contain only Flash then M3', () => {
  expect(defaultConfig.providers![ProviderName.Minimax].models?.map(model => model.id))
    .toEqual(['MiniMax-M3.1-Flash', 'MiniMax-M3']);
  expect(defaultConfig.model.defaultModel).toBe('deepseek-v4-flash');
});

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
