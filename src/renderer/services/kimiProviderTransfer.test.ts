import { expect, test } from 'vitest';

import { ApiFormat } from '../../shared/providers';
import { type KimiModeConfigs, KimiModelMode } from '../../shared/providers/kimi/constants';
import { decryptWithPassword, type PasswordEncryptedPayload } from './encryption';
import { decryptKimiModeConfigs, encryptKimiModeConfigs, type ImportedKimiModeConfigs } from './kimiProviderTransfer';

test('portable mode snapshots encrypt both credentials and retain independent custom models and URLs', async () => {
  const configs: KimiModeConfigs = {
    [KimiModelMode.Code]: {
      apiKey: 'test-code-credential',
      baseUrl: 'https://api.kimi.com/coding/v1',
      apiFormat: ApiFormat.OpenAI,
      defaultModel: 'kimi-for-coding',
      models: [{ id: 'kimi-for-coding', name: 'Code model', supportsImage: true }],
    },
    [KimiModelMode.Api]: {
      apiKey: 'test-api-credential',
      baseUrl: 'https://custom.example/v1',
      apiFormat: ApiFormat.OpenAI,
      defaultModel: 'custom-kimi',
      models: [{ id: 'custom-kimi', name: 'Custom model', supportsImage: false, modelVendor: 'moonshot' }],
    },
  };
  const encrypted = await encryptKimiModeConfigs(configs, 'test-export-password');
  const json = JSON.stringify(encrypted);
  expect(json).not.toContain(configs[KimiModelMode.Code]!.apiKey);
  expect(json).not.toContain(configs[KimiModelMode.Api]!.apiKey);
  const restored = await decryptKimiModeConfigs(JSON.parse(json), key => (
    decryptWithPassword(key as PasswordEncryptedPayload, 'test-export-password')
  ));
  expect(restored).toEqual(configs);
});

test('a wrong password rejects the import without returning partially decrypted snapshots', async () => {
  const encrypted = await encryptKimiModeConfigs({
    [KimiModelMode.Code]: { apiKey: 'code-key', baseUrl: 'https://api.kimi.com/coding/v1' },
    [KimiModelMode.Api]: { apiKey: 'api-key', baseUrl: 'https://api.moonshot.cn/v1' },
  }, 'correct-password');
  await expect(decryptKimiModeConfigs(encrypted, key => (
    decryptWithPassword(key as PasswordEncryptedPayload, 'incorrect-password')
  ))).rejects.toThrow();
});

test('import strips malformed models and unknown fields while retaining supported snapshot data', async () => {
  const imported = {
    [KimiModelMode.Api]: {
      apiKey: 'legacy-key',
      baseUrl: 'https://custom.example/v1',
      apiFormat: 'invalid-format',
      defaultModel: 'custom-model',
      models: [null, { id: 4 }, { id: '' }, {
        id: 'custom-model', name: 'Custom', supportsImage: true, unknownField: 'ignored',
      }, { id: 'custom-model', name: 'Duplicate' }],
      unknownField: 'ignored',
    },
    unknownMode: { apiKey: 'ignored-key', baseUrl: 'https://example.com' },
  } as unknown as ImportedKimiModeConfigs;
  const restored = await decryptKimiModeConfigs(imported, async key => key as string);
  expect(restored).toEqual({
    [KimiModelMode.Api]: {
      apiKey: 'legacy-key', baseUrl: 'https://custom.example/v1', defaultModel: 'custom-model',
      models: [{ id: 'custom-model', name: 'Custom', supportsImage: true }],
    },
  });
});

test('invalid snapshots and malformed encrypted payloads reject imports, while absent legacy snapshots stay absent', async () => {
  expect(await encryptKimiModeConfigs(undefined, 'password')).toBeUndefined();
  expect(await decryptKimiModeConfigs(undefined, async () => '')).toBeUndefined();
  await expect(decryptKimiModeConfigs({
    [KimiModelMode.Code]: { apiKey: 'key', baseUrl: 4 },
  } as unknown as ImportedKimiModeConfigs, async () => '')).rejects.toThrow('Invalid Kimi mode configuration');
  await expect(decryptKimiModeConfigs({
    [KimiModelMode.Api]: { apiKey: { encrypted: 'payload', iv: '' }, baseUrl: 'https://example.com' },
  }, async () => '')).rejects.toThrow('Invalid encrypted Kimi API key');
});
