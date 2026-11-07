import { expect, test } from 'vitest';

import { ApiFormat, ProviderName, ProviderRegistry } from '../../shared/providers';
import { KimiModelMode } from '../../shared/providers/kimi/constants';
import { defaultConfig } from '../config';
import { getKimiModelMode, normalizeKimiProviderConfig, switchKimiModelMode } from './kimiProvider';

const getProvider = () => structuredClone(defaultConfig.providers![ProviderName.Moonshot]);

test('switching modes restores separate credentials, custom API endpoint and edited model catalogs', () => {
  const api = {
    ...getProvider(),
    apiKey: 'api-test-key',
    baseUrl: 'https://proxy.example.test/v1',
    models: [{ id: 'custom-api-model', name: 'Custom API model', supportsImage: true }],
    defaultModel: 'custom-api-model',
  };
  const firstCode = switchKimiModelMode(api, KimiModelMode.Code);
  expect(firstCode.apiKey).toBe('');
  expect(firstCode.baseUrl).toBe(ProviderRegistry.getCodingPlanUrl(ProviderName.Moonshot, ApiFormat.OpenAI));
  expect(firstCode.models).toEqual(ProviderRegistry.get(ProviderName.Moonshot)!.codingPlanModels);

  const editedCode = {
    ...firstCode,
    apiKey: 'code-test-key',
    models: [{ id: 'custom-code-model', name: 'Custom Code model' }],
    defaultModel: 'custom-code-model',
  };
  const restoredApi = switchKimiModelMode(editedCode, KimiModelMode.Api);
  expect(restoredApi).toMatchObject({
    apiKey: api.apiKey,
    baseUrl: api.baseUrl,
    models: api.models,
    defaultModel: api.defaultModel,
    codingPlanEnabled: false,
  });
  expect(switchKimiModelMode(restoredApi, KimiModelMode.Code)).toMatchObject({
    apiKey: editedCode.apiKey,
    models: editedCode.models,
    defaultModel: editedCode.defaultModel,
    codingPlanEnabled: true,
  });
  expect(api.models).toEqual([{ id: 'custom-api-model', name: 'Custom API model', supportsImage: true }]);
});

test('legacy Code endpoints select Code mode and migrate to its OpenAI endpoint and model', () => {
  const definition = ProviderRegistry.get(ProviderName.Moonshot)!;
  for (const endpoint of Object.values(definition.codingPlanUrls!)) {
    const migrated = normalizeKimiProviderConfig({ ...getProvider(), baseUrl: `${endpoint}/`, apiKey: 'legacy-key' });
    expect(getKimiModelMode(migrated)).toBe(KimiModelMode.Code);
    expect(migrated).toMatchObject({
      codingPlanEnabled: true,
      apiKey: 'legacy-key',
      apiFormat: ApiFormat.OpenAI,
      baseUrl: definition.codingPlanUrls!.openai,
      models: definition.codingPlanModels,
      defaultModel: definition.codingPlanModels![0].id,
    });
  }
});

test('normalizing a legacy API configuration keeps its credentials and selected model', () => {
  const api = { ...getProvider(), apiKey: 'existing-api-key', defaultModel: getProvider().models![0].id };
  const normalized = normalizeKimiProviderConfig(api);
  expect(getKimiModelMode(normalized)).toBe(KimiModelMode.Api);
  expect(normalized).toMatchObject(api);
  expect(normalized.kimiModeConfigs?.[KimiModelMode.Api]?.apiKey).toBe(api.apiKey);
  expect(normalized.kimiModeConfigs?.[KimiModelMode.Code]).toBeUndefined();
});

test('saving active edits synchronizes its snapshot without changing the inactive configuration', () => {
  const code = switchKimiModelMode({ ...getProvider(), apiKey: 'saved-api-key' }, KimiModelMode.Code);
  const saved = normalizeKimiProviderConfig({ ...code, apiKey: 'updated-code-key', models: [] });
  expect(saved.kimiModeConfigs?.[KimiModelMode.Code]?.apiKey).toBe('updated-code-key');
  expect(saved.kimiModeConfigs?.[KimiModelMode.Code]?.models).toEqual([]);
  expect(saved.kimiModeConfigs?.[KimiModelMode.Api]?.apiKey).toBe('saved-api-key');
  expect(saved.defaultModel).toBeUndefined();
});

test('normalizing Code removes standard models previously injected during startup', () => {
  const definition = ProviderRegistry.get(ProviderName.Moonshot)!;
  const config = normalizeKimiProviderConfig({
    ...getProvider(),
    codingPlanEnabled: true,
    models: [...definition.defaultModels, ...definition.codingPlanModels!],
  });
  expect(config.models).toEqual(definition.codingPlanModels);
});

test('editing the API URL cannot overwrite a saved Code credential or implicitly change modes', () => {
  const definition = ProviderRegistry.get(ProviderName.Moonshot)!;
  const initialCode = switchKimiModelMode({ ...getProvider(), apiKey: 'original-api-key' }, KimiModelMode.Code);
  const api = switchKimiModelMode({ ...initialCode, apiKey: 'original-code-key' }, KimiModelMode.Api);
  const editedApi = { ...api, baseUrl: definition.codingPlanUrls!.openai };
  expect(getKimiModelMode(editedApi)).toBe(KimiModelMode.Api);
  const saved = normalizeKimiProviderConfig(editedApi);
  expect(saved.codingPlanEnabled).toBe(false);
  expect(saved.apiKey).toBe('original-api-key');
  expect(saved.baseUrl).toBe(definition.defaultBaseUrl);
  const restoredCode = switchKimiModelMode(saved, KimiModelMode.Code);
  expect(restoredCode.apiKey).toBe('original-code-key');
  expect(restoredCode.models).toEqual(definition.codingPlanModels);
});
