import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  FeishuImportSource,
  FeishuSecretStatus,
} from '../../shared/im/constants';
import {
  detectOpenClawLocalFeishuConfig,
  importOpenClawLocalFeishuConfig,
  mergeOpenClawGatewayConfig,
  summarizeOpenClawConfig,
  summarizeOpenClawProbe,
} from './openclawSystemRuntime';

describe('openclawSystemRuntime', () => {
  it('summarizes global OpenClaw config without dropping existing Feishu settings', () => {
    const summary = summarizeOpenClawConfig({
      gateway: {
        port: 18789,
        bind: 'loopback',
        auth: {
          mode: 'token',
          token: 'secret-token',
        },
      },
      agents: {
        defaults: {
          model: {
            primary: 'openai-codex/gpt-5.5',
          },
        },
      },
      channels: {
        feishu: {
          enabled: true,
          appId: 'cli_xxx',
        },
      },
    });

    expect(summary.gatewayPort).toBe(18789);
    expect(summary.gatewayBind).toBe('loopback');
    expect(summary.gatewayToken).toBe('secret-token');
    expect(summary.currentModel).toBe('openai-codex/gpt-5.5');
    expect(summary.feishuConfigured).toBe(true);
  });

  it('extracts Feishu running state from OpenClaw gateway probe targets', () => {
    const summary = summarizeOpenClawProbe({
      ok: true,
      primaryTargetId: 'localLoopback',
      network: {
        localLoopbackUrl: 'ws://127.0.0.1:18789',
      },
      targets: [
        {
          id: 'localLoopback',
          active: true,
          url: 'ws://127.0.0.1:18789',
          self: {
            version: '2026.5.7',
          },
          config: {
            path: '/Users/example/.openclaw/openclaw.json',
          },
          health: {
            channels: {
              feishu: {
                configured: true,
                running: true,
              },
            },
          },
        },
      ],
    });

    expect(summary.ok).toBe(true);
    expect(summary.url).toBe('ws://127.0.0.1:18789');
    expect(summary.port).toBe(18789);
    expect(summary.version).toBe('2026.5.7');
    expect(summary.configPath).toBe('/Users/example/.openclaw/openclaw.json');
    expect(summary.feishuConfigured).toBe(true);
    expect(summary.feishuRunning).toBe(true);
  });

  it('imports direct local Feishu config as a disabled WeSight draft', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-openclaw-feishu-'));
    const configPath = path.join(dir, 'openclaw.json');
    fs.writeFileSync(configPath, JSON.stringify({
      channels: {
        feishu: {
          enabled: true,
          appId: 'cli_local_app_id',
          appSecret: 'local-secret',
          domain: 'feishu',
          dmPolicy: 'allowlist',
          allowFrom: ['ou_1'],
          groupPolicy: 'open',
          requireMention: false,
        },
      },
    }), 'utf8');

    const imported = importOpenClawLocalFeishuConfig(configPath, {});

    expect(imported.canImport).toBe(true);
    expect(imported.channelKey).toBe('feishu');
    expect(imported.secretNeedsInput).toBe(false);
    expect(imported.instanceConfig.enabled).toBe(false);
    expect(imported.instanceConfig.appId).toBe('cli_local_app_id');
    expect(imported.instanceConfig.appSecret).toBe('local-secret');
    expect(imported.instanceConfig.dmPolicy).toBe('allowlist');
    expect(imported.instanceConfig.groupPolicy).toBe('open');
    expect(imported.instanceConfig.groups).toEqual({ '*': { requireMention: false } });
    expect(imported.instanceConfig.importSource).toBe(FeishuImportSource.OpenClawLocal);
    expect(imported.instanceConfig.secretStatus).toBe(FeishuSecretStatus.Resolved);
  });

  it('detects env placeholder secrets that need user input', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-openclaw-feishu-env-'));
    const configPath = path.join(dir, 'openclaw.json');
    fs.writeFileSync(configPath, JSON.stringify({
      channels: {
        'openclaw-feishu': {
          accounts: {
            primary: {
              enabled: true,
              appId: 'cli_env_app_id',
              appSecret: '${FEISHU_APP_SECRET}',
            },
          },
        },
      },
    }), 'utf8');

    const detection = detectOpenClawLocalFeishuConfig(configPath, {});
    const imported = importOpenClawLocalFeishuConfig(configPath, {});

    expect(detection.canImport).toBe(true);
    expect(detection.channelKey).toBe('openclaw-feishu');
    expect(detection.secretNeedsInput).toBe(true);
    expect(imported.instanceConfig.appSecret).toBe('');
    expect(imported.instanceConfig.secretStatus).toBe(FeishuSecretStatus.NeedsInput);
  });
});

describe('mergeOpenClawGatewayConfig', () => {
  it('keeps the gateway owned auth credentials when a sync runs', () => {
    const merged = mergeOpenClawGatewayConfig(
      {
        mode: 'local',
        port: 18789,
        bind: 'loopback',
        auth: {
          mode: 'token',
          token: 'gateway-owned-token',
        },
      },
      {
        mode: 'local',
      },
    );

    expect(merged).toEqual({
      mode: 'local',
      port: 18789,
      bind: 'loopback',
      auth: {
        mode: 'token',
        token: 'gateway-owned-token',
      },
    });
  });

  it('applies managed gateway overrides without dropping unmanaged keys', () => {
    const merged = mergeOpenClawGatewayConfig(
      {
        mode: 'remote',
        port: 18789,
        auth: { mode: 'token', token: 'gateway-owned-token' },
        controlUi: { allowInsecureAuth: true },
      },
      {
        mode: 'local',
        http: { endpoints: { chatCompletions: { enabled: true } } },
      },
    );

    expect(merged.mode).toBe('local');
    expect(merged.port).toBe(18789);
    expect(merged.auth).toEqual({ mode: 'token', token: 'gateway-owned-token' });
    expect(merged.controlUi).toEqual({ allowInsecureAuth: true });
    expect(merged.http).toEqual({ endpoints: { chatCompletions: { enabled: true } } });
  });

  it('merges http endpoints instead of replacing them', () => {
    const merged = mergeOpenClawGatewayConfig(
      {
        http: {
          enabled: true,
          endpoints: { health: { enabled: true } },
        },
      },
      {
        http: {
          endpoints: { chatCompletions: { enabled: true } },
        },
      },
    );

    expect(merged.http).toEqual({
      enabled: true,
      endpoints: {
        health: { enabled: true },
        chatCompletions: { enabled: true },
      },
    });
  });
});
