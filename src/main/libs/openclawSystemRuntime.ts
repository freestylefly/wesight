import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  FeishuImportSource,
  FeishuSecretStatus,
} from '../../shared/im/constants';
import {
  DEFAULT_FEISHU_OPENCLAW_CONFIG,
  type FeishuInstanceConfig,
} from '../im/types';

export const OPENCLAW_GLOBAL_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
export const OPENCLAW_DEFAULT_GATEWAY_PORT = 18789;

export interface OpenClawSystemRuntimeMetadata {
  commandPath: string | null;
  packageRoot: string | null;
  version: string | null;
  configPath: string;
  configExists: boolean;
  gatewayPort: number;
  gatewayBind: 'loopback' | 'all' | string;
  gatewayToken: string | null;
  clientEntryPath: string | null;
  currentModel: string | null;
  expectedPathHint: string;
}

export interface OpenClawGatewayProbeSummary {
  ok: boolean;
  url: string | null;
  port: number | null;
  version: string | null;
  configPath: string | null;
  feishuConfigured: boolean;
  feishuRunning: boolean;
  raw?: Record<string, unknown>;
  error?: string;
}

export interface OpenClawLocalFeishuDetection {
  available: boolean;
  configured: boolean;
  enabled: boolean;
  canImport: boolean;
  configPath: string;
  channelKey: string | null;
  domain: string | null;
  appIdPreview: string | null;
  secretNeedsInput: boolean;
  message: string | null;
}

export interface OpenClawLocalFeishuImportCandidate extends OpenClawLocalFeishuDetection {
  instanceConfig: Partial<FeishuInstanceConfig>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const getNestedRecord = (value: Record<string, unknown>, key: string): Record<string, unknown> => {
  const nested = value[key];
  return isRecord(nested) ? nested : {};
};

const getString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const getBoolean = (value: unknown): boolean | null => (
  typeof value === 'boolean' ? value : null
);

const getStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map((item) => getString(item)).filter(Boolean)
    : []
);

const getNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value <= 0 || value > 65535) return null;
  return value;
};

export const readOpenClawGlobalConfig = (
  configPath = OPENCLAW_GLOBAL_CONFIG_PATH,
): Record<string, unknown> | null => {
  try {
    if (!fs.existsSync(configPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeFeishuDomain = (value: unknown): string => {
  const domain = getString(value).toLowerCase();
  return domain === 'lark' ? 'lark' : 'feishu';
};

const normalizeFeishuDmPolicy = (value: unknown): FeishuInstanceConfig['dmPolicy'] => {
  const policy = getString(value);
  if (policy === 'pairing' || policy === 'allowlist' || policy === 'open' || policy === 'disabled') {
    return policy;
  }
  return DEFAULT_FEISHU_OPENCLAW_CONFIG.dmPolicy;
};

const normalizeFeishuGroupPolicy = (value: unknown): FeishuInstanceConfig['groupPolicy'] => {
  const policy = getString(value);
  if (policy === 'allowlist' || policy === 'open' || policy === 'disabled') {
    return policy;
  }
  return DEFAULT_FEISHU_OPENCLAW_CONFIG.groupPolicy;
};

const resolveSecretValue = (
  value: unknown,
  env: NodeJS.ProcessEnv,
): { value: string; needsInput: boolean } => {
  const raw = getString(value);
  if (!raw) return { value: '', needsInput: true };

  const braced = raw.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
  const bare = raw.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  const envName = braced?.[1] || bare?.[1] || '';
  if (!envName) return { value: raw, needsInput: false };

  const resolved = getString(env[envName]);
  return { value: resolved, needsInput: !resolved };
};

const maskAppId = (value: string): string | null => {
  if (!value) return null;
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const findFeishuChannel = (
  config: Record<string, unknown> | null,
): { channelKey: string | null; channel: Record<string, unknown> | null } => {
  const channels = config ? getNestedRecord(config, 'channels') : {};
  for (const key of ['feishu', 'openclaw-feishu']) {
    const channel = channels[key];
    if (isRecord(channel)) {
      return { channelKey: key, channel };
    }
  }
  return { channelKey: null, channel: null };
};

const selectFeishuAccount = (
  channel: Record<string, unknown>,
): Record<string, unknown> => {
  const accounts = channel.accounts;
  if (!isRecord(accounts)) return channel;

  const accountRecords = Object.values(accounts).filter(isRecord);
  const enabled = accountRecords.find((account) => account.enabled === true);
  return enabled ?? accountRecords[0] ?? {};
};

const buildFeishuGroups = (account: Record<string, unknown>): FeishuInstanceConfig['groups'] => {
  if (isRecord(account.groups) && Object.keys(account.groups).length > 0) {
    return account.groups as FeishuInstanceConfig['groups'];
  }
  const requireMention = getBoolean(account.requireMention);
  return {
    '*': {
      requireMention: requireMention ?? true,
    },
  };
};

const buildLocalFeishuDetection = (
  options: {
    configPath: string;
    channelKey: string | null;
    channel: Record<string, unknown> | null;
    env: NodeJS.ProcessEnv;
  },
): OpenClawLocalFeishuImportCandidate => {
  const { configPath, channelKey, channel, env } = options;
  if (!channel) {
    return {
      available: false,
      configured: false,
      enabled: false,
      canImport: false,
      configPath,
      channelKey: null,
      domain: null,
      appIdPreview: null,
      secretNeedsInput: false,
      message: 'No local OpenClaw Feishu channel was found.',
      instanceConfig: {},
    };
  }

  const account = selectFeishuAccount(channel);
  const appId = getString(account.appId);
  const secret = resolveSecretValue(account.appSecret, env);
  const enabled = account.enabled === true || channel.enabled === true;
  const domain = normalizeFeishuDomain(account.domain ?? channel.domain);
  const configured = Boolean(appId || getString(account.appSecret));
  const secretStatus = secret.needsInput ? FeishuSecretStatus.NeedsInput : FeishuSecretStatus.Resolved;
  const instanceConfig: Partial<FeishuInstanceConfig> = {
    ...DEFAULT_FEISHU_OPENCLAW_CONFIG,
    enabled: false,
    appId,
    appSecret: secret.value,
    domain,
    dmPolicy: normalizeFeishuDmPolicy(account.dmPolicy),
    allowFrom: getStringArray(account.allowFrom),
    groupPolicy: normalizeFeishuGroupPolicy(account.groupPolicy),
    groupAllowFrom: getStringArray(account.groupAllowFrom),
    groups: buildFeishuGroups(account),
    historyLimit: getNumber(account.historyLimit) ?? DEFAULT_FEISHU_OPENCLAW_CONFIG.historyLimit,
    replyMode: getString(account.replyMode) === 'static' || getString(account.replyMode) === 'streaming'
      ? getString(account.replyMode) as FeishuInstanceConfig['replyMode']
      : DEFAULT_FEISHU_OPENCLAW_CONFIG.replyMode,
    mediaMaxMb: getNumber(account.mediaMaxMb) ?? DEFAULT_FEISHU_OPENCLAW_CONFIG.mediaMaxMb,
    debug: getBoolean(account.debug) ?? DEFAULT_FEISHU_OPENCLAW_CONFIG.debug,
    importSource: FeishuImportSource.OpenClawLocal,
    secretStatus,
    sourceChannelKey: channelKey || undefined,
  };

  return {
    available: true,
    configured,
    enabled,
    canImport: Boolean(appId),
    configPath,
    channelKey,
    domain,
    appIdPreview: maskAppId(appId),
    secretNeedsInput: secret.needsInput,
    message: appId
      ? null
      : 'The local OpenClaw Feishu channel is missing appId.',
    instanceConfig,
  };
};

export const detectOpenClawLocalFeishuConfig = (
  configPath = OPENCLAW_GLOBAL_CONFIG_PATH,
  env: NodeJS.ProcessEnv = process.env,
): OpenClawLocalFeishuDetection => {
  const config = readOpenClawGlobalConfig(configPath);
  const { channelKey, channel } = findFeishuChannel(config);
  const detection = buildLocalFeishuDetection({ configPath, channelKey, channel, env });
  const { instanceConfig: _instanceConfig, ...safeDetection } = detection;
  return safeDetection;
};

export const importOpenClawLocalFeishuConfig = (
  configPath = OPENCLAW_GLOBAL_CONFIG_PATH,
  env: NodeJS.ProcessEnv = process.env,
): OpenClawLocalFeishuImportCandidate => {
  const config = readOpenClawGlobalConfig(configPath);
  const { channelKey, channel } = findFeishuChannel(config);
  return buildLocalFeishuDetection({ configPath, channelKey, channel, env });
};

export const atomicWriteJson = (filePath: string, value: Record<string, unknown>): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
};

export const buildOpenClawCommandPath = (): string => {
  const homePath = os.homedir();
  const basePaths = process.platform === 'win32'
    ? [
        path.join(homePath, 'AppData', 'Roaming', 'npm'),
        path.join(homePath, 'AppData', 'Local', 'pnpm'),
        path.join(homePath, '.npm-global', 'bin'),
        path.join(homePath, '.local', 'bin'),
      ]
    : [
        path.join(homePath, '.npm-global', 'bin'),
        path.join(homePath, '.local', 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
      ];
  return [
    ...basePaths,
    process.env.PATH ?? '',
  ]
    .filter(Boolean)
    .join(path.delimiter);
};

const quoteForShell = (value: string): string => {
  return `'${value.replace(/'/g, `'\\''`)}'`;
};

const candidateCommandPaths = (): string[] => {
  const homePath = os.homedir();
  if (process.platform === 'win32') {
    return [
      path.join(homePath, 'AppData', 'Roaming', 'npm', 'openclaw.cmd'),
      path.join(homePath, 'AppData', 'Roaming', 'npm', 'openclaw'),
      path.join(homePath, 'AppData', 'Roaming', 'npm', 'openclaw.exe'),
      path.join(homePath, 'AppData', 'Local', 'pnpm', 'openclaw.cmd'),
      path.join(homePath, 'AppData', 'Local', 'pnpm', 'openclaw'),
      path.join(homePath, '.npm-global', 'bin', 'openclaw.cmd'),
      path.join(homePath, '.npm-global', 'bin', 'openclaw'),
      path.join(homePath, '.local', 'bin', 'openclaw.cmd'),
      path.join(homePath, '.local', 'bin', 'openclaw'),
    ];
  }
  return [
    path.join(homePath, '.npm-global', 'bin', 'openclaw'),
    path.join(homePath, '.local', 'bin', 'openclaw'),
    '/opt/homebrew/bin/openclaw',
    '/usr/local/bin/openclaw',
  ];
};

export const resolveOpenClawCommandPath = (): string | null => {
  if (process.platform === 'win32') {
    // On Windows, use `where` to locate the openclaw command.
    // `where` output is in the system code page, so use buffer encoding
    // and decode with the same GBK-aware logic as other spawns.
    for (const cmd of ['openclaw', 'openclaw.cmd']) {
      const result = spawnSync('where', [cmd], {
        timeout: 10_000,
        env: {
          ...process.env,
          PATH: buildOpenClawCommandPath(),
        },
      });
      // where returns 0 on success, 1 if not found
      if (result.status === 0 && result.stdout) {
        const output = result.stdout.toString('utf8');
        const resolved = output
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line && /openclaw(?:\.(?:cmd|exe))?$/i.test(line));
        if (resolved && fs.existsSync(resolved)) return resolved;
      }
    }
  } else {
    // On macOS / Linux, use the POSIX shell approach.
    const shellPath = process.env.SHELL || '/bin/zsh';
    const result = spawnSync(shellPath, ['-lc', `command -v ${quoteForShell('openclaw')}`], {
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: buildOpenClawCommandPath(),
      },
    });
    if (result.status === 0) {
      const resolved = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      if (resolved) return resolved;
    }
  }

  return candidateCommandPaths().find((candidate) => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).mode & 0o111;
    } catch {
      return false;
    }
  }) ?? null;
};

const readOpenClawVersion = (commandPath: string): string | null => {
  const result = spawnSync(commandPath, ['--version'], {
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      PATH: buildOpenClawCommandPath(),
    },
  });
  if (result.status !== 0) return null;
  const output = (result.stdout || result.stderr || '').trim();
  const match = output.match(/OpenClaw\s+([^\s]+)/i);
  return match?.[1]?.trim() || output.split(/\s+/).find(Boolean) || null;
};

const findPackageRoot = (commandPath: string): string | null => {
  let resolvedPath = commandPath;
  try {
    resolvedPath = fs.realpathSync(commandPath);
  } catch {
    // keep original path
  }

  let cursor = fs.statSync(resolvedPath).isDirectory()
    ? resolvedPath
    : path.dirname(resolvedPath);
  for (let i = 0; i < 8; i += 1) {
    const packagePath = path.join(cursor, 'package.json');
    if (fs.existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        if (pkg?.name === 'openclaw') return cursor;
      } catch {
        // keep walking
      }
    }
    const next = path.dirname(cursor);
    if (next === cursor) break;
    cursor = next;
  }
  return null;
};

const findGatewayClientEntry = (packageRoot: string | null): string | null => {
  if (!packageRoot) return null;
  const distRoot = path.join(packageRoot, 'dist');
  const directCandidates = [
    path.join(distRoot, 'gateway', 'client.js'),
    path.join(distRoot, 'client.js'),
  ];
  for (const candidate of directCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  try {
    const candidates = fs.readdirSync(distRoot)
      .filter((name) => /^client(?:-.*)?\.js$/i.test(name))
      .map((name) => path.join(distRoot, name));
    const withGatewayClientExport = candidates.find((candidate) => {
      try {
        const content = fs.readFileSync(candidate, 'utf8');
        return /\bGatewayClient\b/.test(content);
      } catch {
        return false;
      }
    });
    return withGatewayClientExport ?? candidates[0] ?? null;
  } catch {
    return null;
  }
};

export const summarizeOpenClawConfig = (
  config: Record<string, unknown> | null,
): Pick<OpenClawSystemRuntimeMetadata, 'gatewayPort' | 'gatewayBind' | 'gatewayToken' | 'currentModel'> & {
  feishuConfigured: boolean;
} => {
  const gateway = config ? getNestedRecord(config, 'gateway') : {};
  const auth = getNestedRecord(gateway, 'auth');
  const agents = config ? getNestedRecord(config, 'agents') : {};
  const defaults = getNestedRecord(agents, 'defaults');
  const model = getNestedRecord(defaults, 'model');
  const channels = config ? getNestedRecord(config, 'channels') : {};
  const feishu = getNestedRecord(channels, 'feishu');

  return {
    gatewayPort: getNumber(gateway.port) ?? OPENCLAW_DEFAULT_GATEWAY_PORT,
    gatewayBind: getString(gateway.bind) || 'loopback',
    gatewayToken: getString(auth.token) || null,
    currentModel: getString(model.primary) || getString(defaults.model) || null,
    feishuConfigured: Boolean(feishu.enabled) || Boolean(getString(feishu.appId)),
  };
};

/**
 * Merge a WeSight-managed `gateway` section into the existing one.
 *
 * The OpenClaw gateway owns `gateway.auth`, `gateway.port`, `gateway.bind` and
 * similar keys: it generates and persists `gateway.auth.token` on first start
 * and every client (WeSight included) reads that value back to authenticate.
 * Managed syncs therefore must keep those keys instead of replacing the whole
 * section, otherwise the running gateway and its clients drift apart and every
 * connection fails with "gateway token mismatch".
 */
export const mergeOpenClawGatewayConfig = (
  existingGateway: Record<string, unknown> | null,
  managedGateway: Record<string, unknown> | null,
): Record<string, unknown> => {
  const existing = existingGateway ?? {};
  const managed = managedGateway ?? {};
  const merged: Record<string, unknown> = {
    ...existing,
    ...managed,
  };

  const existingHttp = getNestedRecord(existing, 'http');
  const managedHttp = getNestedRecord(managed, 'http');
  if (Object.keys(existingHttp).length > 0 || Object.keys(managedHttp).length > 0) {
    const existingEndpoints = getNestedRecord(existingHttp, 'endpoints');
    const managedEndpoints = getNestedRecord(managedHttp, 'endpoints');
    const http: Record<string, unknown> = {
      ...existingHttp,
      ...managedHttp,
    };
    if (Object.keys(existingEndpoints).length > 0 || Object.keys(managedEndpoints).length > 0) {
      http.endpoints = {
        ...existingEndpoints,
        ...managedEndpoints,
      };
    }
    merged.http = http;
  }

  return merged;
};

export const resolveOpenClawSystemRuntime = (): OpenClawSystemRuntimeMetadata => {
  const commandPath = resolveOpenClawCommandPath();
  const packageRoot = commandPath ? findPackageRoot(commandPath) : null;
  const config = readOpenClawGlobalConfig();
  const summary = summarizeOpenClawConfig(config);
  return {
    commandPath,
    packageRoot,
    version: commandPath ? readOpenClawVersion(commandPath) : null,
    configPath: OPENCLAW_GLOBAL_CONFIG_PATH,
    configExists: fs.existsSync(OPENCLAW_GLOBAL_CONFIG_PATH),
    gatewayPort: summary.gatewayPort,
    gatewayBind: summary.gatewayBind,
    gatewayToken: summary.gatewayToken,
    clientEntryPath: findGatewayClientEntry(packageRoot),
    currentModel: summary.currentModel,
    expectedPathHint: process.platform === 'win32'
      ? [
          'PATH\\openclaw.cmd',
          '%APPDATA%\\npm\\openclaw.cmd',
          '%LOCALAPPDATA%\\pnpm\\openclaw.cmd',
          '~\\.npm-global\\bin\\openclaw.cmd',
        ].join(', ')
      : [
          'PATH/openclaw',
          '~/.npm-global/bin/openclaw',
          '~/.local/bin/openclaw',
          '/opt/homebrew/bin/openclaw',
          '/usr/local/bin/openclaw',
        ].join(', '),
  };
};

const extractProbePort = (probe: Record<string, unknown>): number | null => {
  const gateway = getNestedRecord(probe, 'gateway');
  const url = getString(gateway.url) || getString(probe.url);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return getNumber(Number(parsed.port));
  } catch {
    const match = url.match(/:(\d+)(?:\/|$)/);
    return match ? getNumber(Number(match[1])) : null;
  }
};

const getPrimaryProbeTarget = (probe: Record<string, unknown>): Record<string, unknown> => {
  const targets = Array.isArray(probe.targets) ? probe.targets : [];
  const primaryTargetId = getString(probe.primaryTargetId);
  const target = targets.find((item) => (
    isRecord(item) && (
      (primaryTargetId && item.id === primaryTargetId)
      || item.active === true
    )
  ));
  return isRecord(target) ? target : {};
};

export const summarizeOpenClawProbe = (
  probe: Record<string, unknown> | null,
  error?: string,
): OpenClawGatewayProbeSummary => {
  if (!probe) {
    return {
      ok: false,
      url: null,
      port: null,
      version: null,
      configPath: null,
      feishuConfigured: false,
      feishuRunning: false,
      error,
    };
  }
  const target = getPrimaryProbeTarget(probe);
  const gateway = getNestedRecord(probe, 'gateway');
  const config = getNestedRecord(target, 'config');
  const health = getNestedRecord(target, 'health');
  const channels = getNestedRecord(health, 'channels');
  const feishu = getNestedRecord(channels, 'feishu');
  const network = getNestedRecord(probe, 'network');
  const url = getString(target.url)
    || getString(network.localLoopbackUrl)
    || getString(gateway.url)
    || getString(probe.url)
    || null;
  return {
    ok: Boolean(probe.ok),
    url,
    port: extractProbePort({ ...probe, url }),
    version: getString(probe.version) || getString(getNestedRecord(target, 'self').version) || null,
    configPath: getString(config.path) || null,
    feishuConfigured: Boolean(feishu.configured),
    feishuRunning: Boolean(feishu.running),
    raw: probe,
    error,
  };
};

export const probeOpenClawGateway = (commandPath: string): OpenClawGatewayProbeSummary => {
  const result = spawnSync(commandPath, ['gateway', 'probe', '--json'], {
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      PATH: buildOpenClawCommandPath(),
    },
  });
  const output = (result.stdout || result.stderr || '').trim();
  try {
    const parsed = JSON.parse(output);
    return summarizeOpenClawProbe(isRecord(parsed) ? parsed : null, result.status === 0 ? undefined : output);
  } catch {
    return summarizeOpenClawProbe(null, output || 'OpenClaw gateway probe failed.');
  }
};
