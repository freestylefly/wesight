import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect, test } from 'vitest';

import { CoworkAgentEngine, ExternalAgentConfigSource } from '../../shared/cowork/constants';
import { buildEnvForConfig } from './claudeSettings';
import {
  acquireWesightClaudeRuntimeConfig,
  applyExternalAgentConfigForEngine,
  cleanupWesightManagedClaudeSettings,
  cleanupWesightManagedCodexConfig,
  createWesightClaudeSettingsBackup,
  mergeClaudeSettingsForWesightModel,
  mergeCodexConfigForLocalCli,
  mergeCodexConfigForWesightModel,
  normalizeCodexConfigForCurrentCli,
  releaseWesightClaudeRuntimeConfig,
  removeWesightManagedClaudeSettings,
  writeTextFileWithBackupIfChanged,
} from './externalAgentConfigSync';

const apiConfig = {
  apiKey: 'sk-wesight-secret',
  baseURL: 'https://api.example.com/v1',
  model: 'glm-5.1-highspeed',
  apiType: 'openai' as const,
};

test('mergeCodexConfigForWesightModel preserves user TOML content', () => {
  const existing = [
    '# user comment',
    '[features]',
    'web_search_request = true',
    '',
    '[model_providers.local]',
    'name = "local"',
    'base_url = "https://local.example/v1"',
    '',
  ].join('\n');

  const merged = mergeCodexConfigForWesightModel(
    existing,
    'Zhipu GLM',
    apiConfig.baseURL,
    apiConfig.model,
  );

  expect(merged).toContain('# user comment');
  expect(merged).toContain('[features]');
  expect(merged).toContain('web_search_request = true');
  expect(merged).toContain('[model_providers.local]');
  expect(merged).toContain('model_provider = "zhipu_glm"');
  expect(merged).toContain('model = "glm-5.1-highspeed"');
  expect(merged).toContain('[model_providers.zhipu_glm]');
  expect(merged).toContain('base_url = "https://api.example.com/v1"');
  expect(merged).toContain('# WeSight managed Codex config: begin');
  expect(merged).not.toContain('sk-wesight-secret');
});

test('normalizeCodexConfigForCurrentCli migrates legacy priority service tier', () => {
  const normalized = normalizeCodexConfigForCurrentCli([
    'service_tier = "priority"',
    'model_provider = "local_codex"',
    '',
    '[model_providers.local_codex]',
    'name = "Local Codex"',
    '',
  ].join('\n'));

  expect(normalized).toContain('service_tier = "fast"');
  expect(normalized).not.toContain('service_tier = "priority"');
});

test('mergeCodexConfigForWesightModel is idempotent and removes duplicate managed entries', () => {
  const existing = [
    '# user comment',
    'model_provider = "old"',
    'model = "old-model"',
    'model_provider = "duplicate-old"',
    'model = "duplicate-model"',
    'model_reasoning_effort = "low"',
    'disable_response_storage = false',
    'disable_response_storage = false',
    '',
    '[features]',
    'web_search_request = true',
    '',
    '[model_providers.zhipu_glm]',
    'name = "old"',
    'base_url = "https://old.example/v1"',
    '',
    '[model_providers.local]',
    'name = "local"',
    'base_url = "https://local.example/v1"',
    '',
    '[model_providers.zhipu_glm]',
    'name = "duplicate-old"',
    'base_url = "https://duplicate.example/v1"',
    '',
  ].join('\n');

  const merged = mergeCodexConfigForWesightModel(
    existing,
    'Zhipu GLM',
    apiConfig.baseURL,
    apiConfig.model,
  );
  const mergedAgain = mergeCodexConfigForWesightModel(
    merged,
    'Zhipu GLM',
    apiConfig.baseURL,
    apiConfig.model,
  );

  expect(mergedAgain).toBe(merged);
  expect(merged.match(/^model_provider\s*=/gm)).toHaveLength(1);
  expect(merged.match(/^model\s*=/gm)).toHaveLength(1);
  expect(merged.match(/^model_reasoning_effort\s*=/gm)).toHaveLength(1);
  expect(merged.match(/^disable_response_storage\s*=/gm)).toHaveLength(1);
  expect(merged.match(/^\[model_providers\.zhipu_glm\]/gm)).toHaveLength(1);
  expect(merged).toContain('[model_providers.local]');
  expect(merged).toContain('[features]');
  expect(merged).toContain('web_search_request = true');
});

test('mergeCodexConfigForLocalCli switches back to local_codex when available', () => {
  const existing = [
    '# user comment',
    'model_provider = "minimax"',
    'model = "MiniMax-M2"',
    '',
    '[model_providers.local_codex]',
    'name = "Local Codex"',
    'wire_api = "responses"',
    'requires_openai_auth = true',
    '',
    '[model_providers.minimax]',
    'name = "minimax"',
    'base_url = "https://api.minimaxi.com/v1"',
    'wire_api = "responses"',
    'requires_openai_auth = true',
    '',
  ].join('\n');

  const merged = mergeCodexConfigForLocalCli(existing);

  expect(merged).toContain('# user comment');
  expect(merged).toContain('model_provider = "local_codex"');
  expect(merged).not.toContain('model = "MiniMax-M2"');
  expect(merged).toContain('[model_providers.local_codex]');
  expect(merged).toContain('[model_providers.minimax]');
});

test('mergeCodexConfigForLocalCli restores the original model after WeSight model sync', () => {
  const localConfig = [
    '# user comment',
    'model_provider = "local_codex"',
    'model = "gpt-5.1-codex-max"',
    'model_reasoning_effort = "medium"',
    'disable_response_storage = false',
    '',
    '[model_providers.local_codex]',
    'name = "Local Codex"',
    'wire_api = "responses"',
    'requires_openai_auth = true',
    '',
  ].join('\n');
  const wesightConfig = mergeCodexConfigForWesightModel(
    localConfig,
    'deepseek',
    'https://api.deepseek.com',
    'deepseek-v4-flash',
  );

  const restored = mergeCodexConfigForLocalCli(wesightConfig);

  expect(restored).toContain('# user comment');
  expect(restored).not.toContain('# WeSight managed Codex config');
  expect(restored).toContain('model_provider = "local_codex"');
  expect(restored).toContain('model = "gpt-5.1-codex-max"');
  expect(restored).toContain('model_reasoning_effort = "medium"');
  expect(restored).toContain('disable_response_storage = false');
  expect(restored).toContain('[model_providers.local_codex]');
  expect(restored).toContain('[model_providers.deepseek]');
});

test('mergeCodexConfigForLocalCli removes legacy WeSight model residue without metadata', () => {
  const existing = [
    'model_provider = "deepseek"',
    'model = "deepseek-v4-flash"',
    'model_reasoning_effort = "high"',
    'disable_response_storage = true',
    '',
    '[model_providers.local_codex]',
    'name = "Local Codex"',
    'wire_api = "responses"',
    'requires_openai_auth = true',
    '',
    '[model_providers.deepseek]',
    'name = "deepseek"',
    'base_url = "https://api.deepseek.com"',
    'wire_api = "responses"',
    'requires_openai_auth = true',
    '',
  ].join('\n');

  const restored = mergeCodexConfigForLocalCli(existing);

  expect(restored).toContain('model_provider = "local_codex"');
  expect(restored).not.toContain('model = "deepseek-v4-flash"');
  expect(restored).not.toContain('model_reasoning_effort = "high"');
  expect(restored).not.toContain('disable_response_storage = true');
  expect(restored).toContain('[model_providers.local_codex]');
});

test('cleanupWesightManagedCodexConfig restores config on disk', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-codex-config-'));
  const configPath = path.join(tempDir, 'config.toml');
  try {
    const wesightConfig = mergeCodexConfigForWesightModel([
      'model_provider = "local_codex"',
      'model = "gpt-5.4"',
      '',
      '[model_providers.local_codex]',
      'name = "Local Codex"',
      'wire_api = "responses"',
      'requires_openai_auth = true',
      '',
    ].join('\n'), 'deepseek', 'https://api.deepseek.com', 'deepseek-v4-flash');
    fs.writeFileSync(configPath, wesightConfig, 'utf8');

    expect(cleanupWesightManagedCodexConfig(configPath)).toBe(true);
    const restored = fs.readFileSync(configPath, 'utf8');

    expect(restored).not.toContain('# WeSight managed Codex config');
    expect(restored).toContain('model_provider = "local_codex"');
    expect(restored).toContain('model = "gpt-5.4"');
    expect(restored).not.toContain('model = "deepseek-v4-flash"');
    expect(fs.existsSync(path.join(tempDir, '.wesight-backups'))).toBe(true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('applyExternalAgentConfigForEngine leaves Codex local config untouched for WeSight model mode', () => {
  expect(() => applyExternalAgentConfigForEngine(
    CoworkAgentEngine.Codex,
    ExternalAgentConfigSource.WesightModel,
  )).not.toThrow();
});

test('mergeCodexConfigForLocalCli leaves config unchanged when local_codex is missing', () => {
  const existing = [
    'model_provider = "minimax"',
    '',
    '[model_providers.minimax]',
    'name = "minimax"',
    '',
  ].join('\n');

  expect(mergeCodexConfigForLocalCli(existing)).toBe(existing);
});

test('mergeClaudeSettingsForWesightModel overwrites stale Claude Code model config', () => {
  const merged = mergeClaudeSettingsForWesightModel({
    env: {
      ANTHROPIC_API_KEY: 'sk-minimax-secret',
      ANTHROPIC_AUTH_TOKEN: 'sk-minimax-secret',
      ANTHROPIC_BASE_URL: 'https://api.minimaxi.com/anthropic',
      ANTHROPIC_MODEL: 'MiniMax-M3.0',
      FOO_TOKEN: 'keep-me',
    },
    theme: 'dark',
  }, apiConfig);

  expect(merged.theme).toBe('dark');
  const env = merged.env as Record<string, unknown>;
  expect(env.ANTHROPIC_AUTH_TOKEN).toBe(apiConfig.apiKey);
  expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(env.FOO_TOKEN).toBe('keep-me');
  expect(env.ANTHROPIC_BASE_URL).toBe(apiConfig.baseURL);
  expect(env.ANTHROPIC_MODEL).toBe(apiConfig.model);
  expect(JSON.stringify(merged)).not.toContain('${WESIGHT_APIKEY_ACTIVE_PROVIDER}');
});

test('mergeClaudeSettingsForWesightModel replaces old WeSight placeholders with real credentials', () => {
  const merged = mergeClaudeSettingsForWesightModel({
    env: {
      ANTHROPIC_API_KEY: '${WESIGHT_APIKEY_ACTIVE_PROVIDER}',
      ANTHROPIC_AUTH_TOKEN: '${WESIGHT_APIKEY_ACTIVE_PROVIDER}',
    },
    hooks: {
      Stop: [],
    },
  }, apiConfig);

  const env = merged.env as Record<string, unknown>;
  expect(env.ANTHROPIC_AUTH_TOKEN).toBe(apiConfig.apiKey);
  expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(merged.hooks).toEqual({ Stop: [] });
  expect(JSON.stringify(merged)).not.toContain('${WESIGHT_APIKEY_ACTIVE_PROVIDER}');
  expect(JSON.stringify(merged)).toContain(apiConfig.apiKey);
});

test('mergeClaudeSettingsForWesightModel records all managed Claude env keys', () => {
  const merged = mergeClaudeSettingsForWesightModel({}, apiConfig);
  const managed = (merged.__wesight_managed as Record<string, unknown>).claudeCode as Record<string, unknown>;

  expect(managed.envKeys).toEqual([
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_REASONING_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'ANTHROPIC_SMALL_FAST_MODEL',
  ]);
});

test('mergeClaudeSettingsForWesightModel respects an existing API key credential field', () => {
  const merged = mergeClaudeSettingsForWesightModel({
    env: {
      ANTHROPIC_API_KEY: 'sk-local',
      ANTHROPIC_BASE_URL: 'https://local.example/v1',
    },
  }, apiConfig);

  const env = merged.env as Record<string, unknown>;
  expect(env.ANTHROPIC_API_KEY).toBe(apiConfig.apiKey);
  expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();

  const cleaned = removeWesightManagedClaudeSettings(merged);
  expect(cleaned.env).toEqual({
    ANTHROPIC_API_KEY: 'sk-local',
    ANTHROPIC_BASE_URL: 'https://local.example/v1',
  });
});

test('removeWesightManagedClaudeSettings restores original Claude env keys', () => {
  const merged = mergeClaudeSettingsForWesightModel({
    env: {
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      ANTHROPIC_MODEL: 'deepseek-v4-flash',
      USER_TOKEN: 'keep-me',
    },
    theme: 'dark',
  }, apiConfig);

  const cleaned = removeWesightManagedClaudeSettings(merged);

  expect(cleaned.theme).toBe('dark');
  expect(cleaned.__wesight_managed).toBeUndefined();
  expect(cleaned.env).toEqual({
    ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
    ANTHROPIC_MODEL: 'deepseek-v4-flash',
    USER_TOKEN: 'keep-me',
  });
});

test('removeWesightManagedClaudeSettings preserves legacy marker env values', () => {
  const legacy = {
    env: {
      ANTHROPIC_API_KEY: 'sk-local',
      ANTHROPIC_BASE_URL: 'https://local.example/v1',
      USER_TOKEN: 'keep-me',
    },
    __wesight_managed: {
      claudeCode: {
        envKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL'],
      },
    },
  };

  const cleaned = removeWesightManagedClaudeSettings(legacy);

  expect(cleaned.__wesight_managed).toBeUndefined();
  expect(cleaned.env).toEqual(legacy.env);
});

test('mergeClaudeSettingsForWesightModel preserves the earliest original env snapshot', () => {
  const first = mergeClaudeSettingsForWesightModel({
    env: {
      ANTHROPIC_BASE_URL: 'https://local.example/v1',
      ANTHROPIC_MODEL: 'local-claude',
    },
  }, apiConfig);
  const second = mergeClaudeSettingsForWesightModel(first, {
    ...apiConfig,
    apiKey: 'sk-second',
    baseURL: 'https://second.example/v1',
    model: 'second-model',
  });

  const cleaned = removeWesightManagedClaudeSettings(second);

  expect(cleaned.env).toEqual({
    ANTHROPIC_BASE_URL: 'https://local.example/v1',
    ANTHROPIC_MODEL: 'local-claude',
  });
});

test('mergeClaudeSettingsForWesightModel records the managed overlay env', () => {
  const merged = mergeClaudeSettingsForWesightModel({}, apiConfig);
  const managed = (merged.__wesight_managed as Record<string, unknown>).claudeCode as Record<string, unknown>;

  expect(managed.managedEnv).toEqual({
    ANTHROPIC_AUTH_TOKEN: apiConfig.apiKey,
    ANTHROPIC_BASE_URL: apiConfig.baseURL,
    ANTHROPIC_MODEL: apiConfig.model,
    ANTHROPIC_REASONING_MODEL: apiConfig.model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: apiConfig.model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: apiConfig.model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: apiConfig.model,
    ANTHROPIC_SMALL_FAST_MODEL: apiConfig.model,
  });
});

const externallySwitchedEnv = {
  ANTHROPIC_AUTH_TOKEN: 'sk-local-b',
  ANTHROPIC_BASE_URL: 'https://local-b.example/v1',
  ANTHROPIC_MODEL: 'model-b',
  ANTHROPIC_REASONING_MODEL: 'model-b',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'model-b',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'model-b',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'model-b',
  ANTHROPIC_SMALL_FAST_MODEL: 'model-b',
};

test('removeWesightManagedClaudeSettings keeps an externally switched local env instead of restoring a stale snapshot', () => {
  const merged = mergeClaudeSettingsForWesightModel({
    env: {
      ANTHROPIC_BASE_URL: 'https://local-a.example/v1',
      ANTHROPIC_MODEL: 'model-a',
    },
  }, apiConfig);
  // An external tool (or the user) switches the local provider while WeSight
  // metadata is present, e.g. by rewriting settings.json wholesale.
  const externallySwitched = {
    ...merged,
    env: { ...externallySwitchedEnv },
  };

  const cleaned = removeWesightManagedClaudeSettings(externallySwitched);

  expect(cleaned.__wesight_managed).toBeUndefined();
  expect(cleaned.env).toEqual(externallySwitchedEnv);
});

test('mergeClaudeSettingsForWesightModel refreshes a stale snapshot after an external local env change', () => {
  const merged = mergeClaudeSettingsForWesightModel({
    env: {
      ANTHROPIC_BASE_URL: 'https://local-a.example/v1',
      ANTHROPIC_MODEL: 'model-a',
    },
  }, apiConfig);
  const externallySwitched = {
    ...merged,
    env: { ...externallySwitchedEnv },
  };

  const remerged = mergeClaudeSettingsForWesightModel(externallySwitched, apiConfig);
  const runtimeEnv = remerged.env as Record<string, unknown>;
  expect(runtimeEnv.ANTHROPIC_BASE_URL).toBe(apiConfig.baseURL);
  expect(runtimeEnv.ANTHROPIC_MODEL).toBe(apiConfig.model);

  const cleaned = removeWesightManagedClaudeSettings(remerged);
  expect(cleaned.env).toEqual(externallySwitchedEnv);
});

test('removeWesightManagedClaudeSettings restores the snapshot for legacy metadata without managedEnv', () => {
  const legacy = {
    env: {
      ANTHROPIC_BASE_URL: 'https://wesight-overlay.example/v1',
      ANTHROPIC_MODEL: 'wesight-overlay-model',
    },
    __wesight_managed: {
      claudeCode: {
        envKeys: ['ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL'],
        originalEnv: {
          ANTHROPIC_BASE_URL: 'https://local.example/v1',
          ANTHROPIC_MODEL: 'local-claude',
        },
      },
    },
  };

  const cleaned = removeWesightManagedClaudeSettings(legacy);

  expect(cleaned.__wesight_managed).toBeUndefined();
  expect(cleaned.env).toEqual({
    ANTHROPIC_BASE_URL: 'https://local.example/v1',
    ANTHROPIC_MODEL: 'local-claude',
  });
});

test('cleanupWesightManagedClaudeSettings restores settings on disk', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-claude-settings-'));
  const settingsPath = path.join(tempDir, 'settings.json');
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(mergeClaudeSettingsForWesightModel({
      env: {
        ANTHROPIC_BASE_URL: 'https://local.example/v1',
        KEEP_ME: 'yes',
      },
    }, apiConfig)), 'utf8');

    expect(cleanupWesightManagedClaudeSettings(settingsPath)).toBe(true);
    const cleaned = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(cleaned.__wesight_managed).toBeUndefined();
    expect(cleaned.env).toEqual({
      ANTHROPIC_BASE_URL: 'https://local.example/v1',
      KEEP_ME: 'yes',
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('releaseWesightClaudeRuntimeConfig restores settings after the final lease', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-claude-runtime-'));
  const settingsPath = path.join(tempDir, 'settings.json');
  try {
    fs.writeFileSync(settingsPath, JSON.stringify({
      env: {
        ANTHROPIC_API_KEY: 'sk-local',
        ANTHROPIC_BASE_URL: 'https://api.minimaxi.com/anthropic',
        ANTHROPIC_MODEL: 'MiniMax-M3',
      },
      theme: 'dark',
    }), 'utf8');

    const firstLease = acquireWesightClaudeRuntimeConfig(apiConfig, settingsPath);
    const secondLease = acquireWesightClaudeRuntimeConfig({
      ...apiConfig,
      model: 'glm-second',
    }, settingsPath);

    let runtimeSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    let runtimeEnv = runtimeSettings.env as Record<string, unknown>;
    expect(runtimeEnv.ANTHROPIC_API_KEY).toBe(apiConfig.apiKey);
    expect(runtimeEnv.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(runtimeEnv.ANTHROPIC_MODEL).toBe('glm-second');

    expect(releaseWesightClaudeRuntimeConfig(firstLease)).toBe(false);
    runtimeSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    runtimeEnv = runtimeSettings.env as Record<string, unknown>;
    expect(runtimeEnv.ANTHROPIC_MODEL).toBe('glm-second');

    expect(releaseWesightClaudeRuntimeConfig(secondLease)).toBe(true);
    const restored = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    expect(restored).toEqual({
      env: {
        ANTHROPIC_API_KEY: 'sk-local',
        ANTHROPIC_BASE_URL: 'https://api.minimaxi.com/anthropic',
        ANTHROPIC_MODEL: 'MiniMax-M3',
      },
      theme: 'dark',
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('createWesightClaudeSettingsBackup copies existing settings file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-claude-backup-'));
  const settingsPath = path.join(tempDir, 'settings.json');
  try {
    fs.writeFileSync(settingsPath, '{"env":{"KEEP_ME":"yes"}}\n', 'utf8');

    const backupPath = createWesightClaudeSettingsBackup(settingsPath);

    expect(backupPath).toBeTruthy();
    expect(backupPath && fs.existsSync(backupPath)).toBe(true);
    expect(backupPath).toContain(`${path.sep}.wesight-backups${path.sep}`);
    expect(fs.readFileSync(backupPath as string, 'utf8')).toBe('{"env":{"KEEP_ME":"yes"}}\n');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('writeTextFileWithBackupIfChanged backs up each changed existing config file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-config-backup-'));
  const configPath = path.join(tempDir, 'config.toml');
  try {
    fs.writeFileSync(configPath, 'model = "first"\n', 'utf8');

    expect(writeTextFileWithBackupIfChanged(configPath, 'model = "second"\n')).toBe(true);
    expect(writeTextFileWithBackupIfChanged(configPath, 'model = "third"\n')).toBe(true);

    const backupsDir = path.join(tempDir, '.wesight-backups');
    const backupContents = fs.readdirSync(backupsDir)
      .map((fileName) => fs.readFileSync(path.join(backupsDir, fileName), 'utf8'))
      .sort();

    expect(fs.readFileSync(configPath, 'utf8')).toBe('model = "third"\n');
    expect(backupContents).toEqual([
      'model = "first"\n',
      'model = "second"\n',
    ]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('writeTextFileWithBackupIfChanged keeps the first backup permanently', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-config-first-backup-'));
  const configPath = path.join(tempDir, 'config.toml');
  try {
    fs.writeFileSync(configPath, 'model = "version-0"\n', 'utf8');
    for (let index = 1; index <= 25; index += 1) {
      writeTextFileWithBackupIfChanged(configPath, `model = "version-${index}"\n`);
    }

    const backupsDir = path.join(tempDir, '.wesight-backups');
    const backupContents = fs.readdirSync(backupsDir)
      .map((fileName) => fs.readFileSync(path.join(backupsDir, fileName), 'utf8'));

    expect(backupContents).toHaveLength(21);
    expect(backupContents).toContain('model = "version-0"\n');
    expect(backupContents).toContain('model = "version-24"\n');
    expect(fs.readFileSync(configPath, 'utf8')).toBe('model = "version-25"\n');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('writeTextFileWithBackupIfChanged skips unchanged config files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-config-unchanged-'));
  const configPath = path.join(tempDir, 'config.toml');
  try {
    fs.writeFileSync(configPath, 'model = "same"\n', 'utf8');

    expect(writeTextFileWithBackupIfChanged(configPath, 'model = "same"\n')).toBe(false);

    expect(fs.existsSync(path.join(tempDir, '.wesight-backups'))).toBe(false);
    expect(fs.readFileSync(configPath, 'utf8')).toBe('model = "same"\n');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('buildEnvForConfig injects real secrets only into process env', () => {
  const env = buildEnvForConfig(apiConfig);

  expect(env.WESIGHT_APIKEY_ACTIVE_PROVIDER).toBe(apiConfig.apiKey);
  expect(env.ANTHROPIC_AUTH_TOKEN).toBe(apiConfig.apiKey);
  expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(env.OPENAI_API_KEY).toBe(apiConfig.apiKey);
  expect(env.OPENAI_BASE_URL).toBe(apiConfig.baseURL);
  expect(env.OPENAI_MODEL).toBe(apiConfig.model);
});
