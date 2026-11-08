import { describe, expect, test } from 'vitest';

import {
  DEFAULT_OPENCODE_MODEL,
  listOpenCodeAuthProviderIds,
  listOpenCodeModelProviders,
  OPENCODE_MODEL_UNSET_KEY,
  settingsConfigFromOpenCodeRecord,
  summarizeOpenCodeSettingsConfig,
} from './openCodeConfig';

// Exact reporter setup from issue #78: opencode.json(c) carries only "$schema",
// auth.json holds DeepSeek + Google.
const reporterConfig = { $schema: 'https://opencode.ai/config.json' };
const reporterAuth = {
  deepseek: { type: 'api', key: 'sk-deepseek-real' },
  google: { type: 'api', key: 'sk-google-real' },
};
const reporterRecords = () => listOpenCodeModelProviders(reporterConfig, {
  authProviderIds: listOpenCodeAuthProviderIds(reporterAuth),
});

describe('OpenCode auth-backed provider fallback (issue #78)', () => {
  test('does not advertise the unauthenticated Anthropic default', () => {
    expect(reporterRecords().map((record) => record.model)).not.toContain(DEFAULT_OPENCODE_MODEL);
  });

  test('still surfaces one entry per logged-in provider instead of an empty list', () => {
    expect(reporterRecords().map((record) => record.providerKey).sort()).toEqual(['deepseek', 'google']);
  });

  test('auth-backed entries carry no model so the runtime omits --model', () => {
    for (const record of reporterRecords()) {
      expect(record.model).toBe('');
      expect(record.modelId).toBe('');
    }
  });

  test('exactly one auth-backed entry is marked current', () => {
    expect(reporterRecords().filter((record) => record.isCurrent)).toHaveLength(1);
  });

  test('a stored auth-backed entry does not re-derive the default model', () => {
    const stored = settingsConfigFromOpenCodeRecord(reporterRecords()[0]);
    expect(stored[OPENCODE_MODEL_UNSET_KEY]).toBe(true);
    expect(summarizeOpenCodeSettingsConfig(stored).model).toBe('');
  });

  test('provider credentials/baseUrl are carried over when the config declares them', () => {
    const records = listOpenCodeModelProviders(
      {
        ...reporterConfig,
        provider: { deepseek: { name: 'DeepSeek Pro', options: { apiKey: 'sk-cfg', baseURL: 'https://x/v1' } } },
      },
      { authProviderIds: ['deepseek'] },
    );
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('DeepSeek Pro');
    expect(records[0].apiKey).toBe('sk-cfg');
    expect(records[0].baseUrl).toBe('https://x/v1');
  });
});

describe('no behaviour change outside the reporter scenario', () => {
  test('an explicitly configured model is always kept, even unauthenticated', () => {
    const records = listOpenCodeModelProviders(
      { model: 'anthropic/claude-sonnet-4-5' },
      { authProviderIds: ['deepseek'] },
    );
    expect(records.map((record) => record.model)).toContain('anthropic/claude-sonnet-4-5');
    // The auth fallback must not fire when real records already exist.
    expect(records.every((record) => !record.id.startsWith('opencode-auth-'))).toBe(true);
  });

  test('omitting authProviderIds preserves the original unconditional behaviour', () => {
    const records = listOpenCodeModelProviders(reporterConfig);
    expect(records.map((record) => record.model)).toEqual([DEFAULT_OPENCODE_MODEL]);
  });

  test('the authenticated default provider still yields the normal default record', () => {
    const records = listOpenCodeModelProviders(reporterConfig, { authProviderIds: ['anthropic'] });
    expect(records.map((record) => record.model)).toEqual([DEFAULT_OPENCODE_MODEL]);
  });

  test('no logged-in provider and no config yields an empty list, not a bogus model', () => {
    expect(listOpenCodeModelProviders(reporterConfig, { authProviderIds: [] })).toEqual([]);
  });

  test('models declared under provider blocks still win over the auth fallback', () => {
    const records = listOpenCodeModelProviders(
      { ...reporterConfig, provider: { deepseek: { models: { 'deepseek-v4': {} } } } },
      { authProviderIds: ['deepseek'] },
    );
    expect(records.map((record) => record.model)).toEqual(['deepseek/deepseek-v4']);
  });

  test('an ordinary stored record keeps its model and carries no unset marker', () => {
    const stored = settingsConfigFromOpenCodeRecord(
      listOpenCodeModelProviders({ model: 'deepseek/deepseek-v4' })[0],
    );
    expect(stored[OPENCODE_MODEL_UNSET_KEY]).toBeUndefined();
    expect(summarizeOpenCodeSettingsConfig(stored).model).toBe('deepseek/deepseek-v4');
  });
});
