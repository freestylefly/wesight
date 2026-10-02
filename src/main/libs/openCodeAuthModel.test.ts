import { describe, expect, test } from 'vitest';

import {
  listOpenCodeAuthProviderIds,
  listOpenCodeModelProviders,
} from './openCodeConfig';

// Reproduces the state reported in issue #78: OpenCode CLI works, auth.json holds
// DeepSeek + Google logins, and opencode.json contains only "$schema".
const SCHEMA_ONLY_CONFIG = { $schema: 'https://opencode.ai/config.json' };
const ISSUE_78_AUTH = {
  deepseek: { type: 'api', key: 'sk-deepseek' },
  google: { type: 'api', key: 'AIzaExample' },
};

describe('listOpenCodeAuthProviderIds', () => {
  test('lists provider ids that hold a usable credential', () => {
    expect(listOpenCodeAuthProviderIds(ISSUE_78_AUTH)).toEqual(['deepseek', 'google']);
  });

  test('accepts oauth logins that carry no api key', () => {
    expect(listOpenCodeAuthProviderIds({
      anthropic: { type: 'oauth', refresh: 'rt', access: '', expires: 0 },
    })).toEqual(['anthropic']);
  });

  test('skips entries whose credential is blank or a placeholder', () => {
    expect(listOpenCodeAuthProviderIds({
      deepseek: { type: 'api', key: '   ' },
      openai: { type: 'api', key: '***' },
    })).toEqual([]);
  });

  test('returns an empty list for malformed input', () => {
    expect(listOpenCodeAuthProviderIds(null)).toEqual([]);
    expect(listOpenCodeAuthProviderIds('nope')).toEqual([]);
    expect(listOpenCodeAuthProviderIds([{ type: 'api', key: 'k' }])).toEqual([]);
  });
});

describe('listOpenCodeModelProviders credential awareness (issue #78)', () => {
  test('does not invent an Anthropic current model when only DeepSeek/Google are logged in', () => {
    const records = listOpenCodeModelProviders(SCHEMA_ONLY_CONFIG, {
      authProviderIds: listOpenCodeAuthProviderIds(ISSUE_78_AUTH),
    });
    expect(records.map((record) => record.model)).not.toContain('anthropic/claude-sonnet-4-5');
    // The list must not be left empty either: an empty list sends the store back
    // to the raw live config, whose model is the same unusable Anthropic default.
    // One credential-backed entry per logged-in provider is surfaced instead, with
    // no model, so the runtime omits `--model`.
    expect(records.map((record) => record.providerKey)).toEqual(['deepseek', 'google']);
    expect(records.every((record) => record.model === '')).toBe(true);
    expect(records.filter((record) => record.isCurrent)).toHaveLength(1);
  });

  test('keeps the synthesized default when the default provider is actually logged in', () => {
    const records = listOpenCodeModelProviders(SCHEMA_ONLY_CONFIG, {
      authProviderIds: ['anthropic'],
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ model: 'anthropic/claude-sonnet-4-5', isCurrent: true });
  });

  test('an explicitly configured model always wins, even without a visible credential', () => {
    const records = listOpenCodeModelProviders(
      { ...SCHEMA_ONLY_CONFIG, model: 'deepseek/deepseek-chat' },
      { authProviderIds: [] },
    );
    expect(records[0]).toMatchObject({ model: 'deepseek/deepseek-chat', isCurrent: true });
  });

  test('configured provider models are still listed when the default is dropped', () => {
    const records = listOpenCodeModelProviders(
      { provider: { deepseek: { models: { 'deepseek-chat': { name: 'DeepSeek Chat' } } } } },
      { authProviderIds: ['deepseek'] },
    );
    expect(records.map((record) => record.model)).toEqual(['deepseek/deepseek-chat']);
  });

  test('omitting authProviderIds preserves the historical default-model behaviour', () => {
    const records = listOpenCodeModelProviders(SCHEMA_ONLY_CONFIG);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ model: 'anthropic/claude-sonnet-4-5', isCurrent: true });
  });
});
