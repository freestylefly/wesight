import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import { buildScheduledTaskEnginePrompt } from '../../scheduledTask/enginePrompt';
import { ExternalAgentConfigSource } from '../../shared/cowork/constants';
import { WeixinOwnership } from '../../shared/im/constants';
import { PlatformRegistry } from '../../shared/platform';
import { OpenClawApi as OpenClawApiConst,OpenClawProviderId, ProviderName } from '../../shared/providers';
import type { Agent,CoworkConfig, CoworkExecutionMode } from '../coworkStore';
import type { DiscordOpenClawConfig, IMSettings,TelegramOpenClawConfig } from '../im/types';
import type { DingTalkInstanceConfig, FeishuInstanceConfig, NeteaseBeeChanConfig,NimConfig, PopoOpenClawConfig, QQInstanceConfig, WecomOpenClawConfig, WeixinOpenClawConfig } from '../im/types';
import { getAllServerModelMetadata,resolveAllEnabledProviderConfigs, resolveAllProviderApiKeys, resolveRawApiConfig } from './claudeSettings';
import { getCoworkOpenAICompatProxyBaseURL } from './coworkOpenAICompatProxy';
import type { McpToolManifestEntry } from './mcpServerManager';
import { parseChannelSessionKey } from './openclawChannelSessionSync';
import type { OpenClawEngineManager } from './openclawEngineManager';
import { hasBundledOpenClawExtension } from './openclawLocalExtensions';
import { getOpenClawTokenProxyPort } from './openclawTokenProxy';

export type McpBridgeConfig = {
  callbackUrl: string;
  askUserCallbackUrl: string;
  secret: string;
  tools: McpToolManifestEntry[];
};

const mapExecutionModeToSandboxMode = (mode: CoworkExecutionMode, isEnterprise: boolean): 'off' | 'non-main' | 'all' => {
  if (!isEnterprise) return 'off';
  switch (mode) {
    case 'sandbox': return 'all';
    case 'auto': return 'non-main';
    case 'local':
    default: return 'off';
  }
};

/**
 * Default agent timeout in seconds written to openclaw config.
 * Also used by the runtime adapter's client-side timeout watchdog.
 */
export const OPENCLAW_AGENT_TIMEOUT_SECONDS = 3600;

function shouldUseOpenAIResponsesApi(providerName?: string, baseURL?: string): boolean {
  if (providerName !== ProviderName.OpenAI) return false;
  if (!baseURL) return true;
  const normalized = baseURL.trim().toLowerCase();
  return !normalized || normalized.includes('api.openai.com');
}

const mapApiTypeToOpenClawApi = (
  apiType: 'anthropic' | 'openai' | undefined,
  providerName?: string,
  baseURL?: string,
): OpenClawProviderApi => {
  // Qwen/DashScope Anthropic-compatible endpoint auto-injects web_search and
  // web_extractor built-in tools that cannot be disabled from the client side,
  // causing HTTP 400 errors. Force OpenAI format for any URL pointing to DashScope.
  if (apiType === 'anthropic' && isDashScopeUrl(baseURL)) {
    return 'openai-completions';
  }
  if (apiType === 'openai') {
    return shouldUseOpenAIResponsesApi(providerName, baseURL)
      ? 'openai-responses'
      : 'openai-completions';
  }
  return 'anthropic-messages';
};

/**
 * Detect DashScope (Qwen) URLs regardless of which provider the user configured.
 */
const isDashScopeUrl = (url?: string): boolean =>
  !!url && /dashscope\.aliyuncs\.com/i.test(url);

/**
 * When a DashScope Anthropic URL is forced to OpenAI format, rewrite the base
 * URL to the corresponding OpenAI-compatible endpoint so the request actually
 * reaches the correct API server.
 *
 * dashscope.aliyuncs.com/apps/anthropic       → dashscope.aliyuncs.com/compatible-mode/v1
 * coding.dashscope.aliyuncs.com/apps/anthropic → coding.dashscope.aliyuncs.com/v1
 */
const rewriteDashScopeAnthropicToOpenAI = (url: string): string => {
  if (/coding\.dashscope\.aliyuncs\.com/i.test(url)) {
    return url.replace(/\/apps\/anthropic\b/i, '/v1');
  }
  return url.replace(/\/apps\/anthropic\b/i, '/compatible-mode/v1');
};

const ensureDir = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const asRecord = (value: unknown): Record<string, unknown> => {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
};

const normalizeModelName = (modelId: string): string => {
  const trimmed = modelId.trim();
  if (!trimmed) return 'default-model';
  const slashIndex = trimmed.lastIndexOf('/');
  const name = slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed;
  // Ensure the result is never empty after stripping prefix
  return name.trim() || 'default-model';
};

/**
 * Resolve the effective model display name with fallback chain:
 * userModelName → normalizeModelName(modelId) → 'default-model'
 */
const resolveModelDisplayName = (modelId: string, userModelName?: string): string => {
  const userName = userModelName?.trim();
  if (userName) return userName;
  return normalizeModelName(modelId);
};


const MANAGED_OWNER_ALLOW_FROM = [
  // Internal `chat.send` turns identify the sender as bare `gateway-client`.
  // Prefixing with `webchat:` does not round-trip through owner resolution,
  // so owner-only tools like `cron` never become available.
  'gateway-client',
  // Native IM channel senders use their platform user ID (e.g. telegram:xxx),
  // which would not match 'gateway-client'. Use wildcard so all senders that
  // pass the per-channel allowFrom gate are also recognised as owners.
  '*',
];

const MANAGED_TOOL_DENY = ['web_search'] as const;

const MANAGED_SKILL_ENTRY_OVERRIDES: Record<string, { enabled: boolean }> = {
  // QQ plugin ships a legacy reminder skill that steers the model toward a
  // channel-specific cron wrapper/subagent flow. Hide that path so native IM
  // sessions use the gateway's built-in `cron` tool instead.
  'qqbot-cron': {
    enabled: false,
  },
  // Personal Feishu reminder helpers often instruct the model to shell out via
  // `openclaw cron ...` or message relays. Native channel sessions should use
  // the gateway's built-in `cron` tool directly instead.
  'feishu-cron-reminder': {
    enabled: false,
  },
};

const DISABLED_MANAGED_SKILL_NAMES = Object.entries(MANAGED_SKILL_ENTRY_OVERRIDES)
  .filter(([, value]) => value.enabled === false)
  .map(([name]) => name);

/**
 * Build the env var name for a provider's apiKey.
 * Must match the key format produced by resolveAllProviderApiKeys() in claudeSettings.ts.
 */
const providerApiKeyEnvVar = (providerName: string): string => {
  const envName = providerName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return `WESIGHT_APIKEY_${envName}`;
};

const API_KEY_PLACEHOLDER_PATTERN = /\$\{((?:WESIGHT|LOBSTER)_APIKEY_[A-Z0-9_]+)\}/g;
const MANAGED_AGENTS_MARKER = '<!-- WeSight managed: do not edit below this line -->';
const LEGACY_MANAGED_AGENTS_MARKERS = [
  '<!-- LobsterAI managed: do not edit below this line -->',
] as const;
const ALL_MANAGED_AGENTS_MARKERS = [MANAGED_AGENTS_MARKER, ...LEGACY_MANAGED_AGENTS_MARKERS] as const;

const stripManagedAgentsMarkers = (value: string): string => {
  return ALL_MANAGED_AGENTS_MARKERS.reduce((next, marker) => next.replaceAll(marker, ''), value);
};

const normalizeEnvSuffix = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, '_');

const API_KEY_ENV_SUFFIX_ALIASES: Record<string, string[]> = {
  ZHIPU: ['ZAI'],
  ZAI: ['ZHIPU'],
  GEMINI: ['GOOGLE'],
  GOOGLE: ['GEMINI'],
  WESIGHT_SERVER: ['SERVER'],
  SERVER: ['WESIGHT_SERVER'],
  GITHUB_COPILOT: ['WESIGHT_COPILOT'],
  WESIGHT_COPILOT: ['GITHUB_COPILOT'],
};

const setApiKeyEnv = (env: Record<string, string>, suffix: string, apiKey: string): void => {
  const normalizedSuffix = normalizeEnvSuffix(suffix);
  if (!normalizedSuffix) return;
  env[`WESIGHT_APIKEY_${normalizedSuffix}`] = apiKey;
  env[`LOBSTER_APIKEY_${normalizedSuffix}`] = apiKey;
  for (const alias of API_KEY_ENV_SUFFIX_ALIASES[normalizedSuffix] ?? []) {
    env[`WESIGHT_APIKEY_${alias}`] = apiKey;
    env[`LOBSTER_APIKEY_${alias}`] = apiKey;
  }
};

const readApiKeyEnvAlias = (env: Record<string, string>, envName: string): string | null => {
  const match = envName.match(/^(WESIGHT|LOBSTER)_APIKEY_(.+)$/);
  if (!match) return null;
  const [, prefix, suffix] = match;
  for (const alias of API_KEY_ENV_SUFFIX_ALIASES[suffix] ?? []) {
    const value = env[`${prefix}_APIKEY_${alias}`] || process.env[`${prefix}_APIKEY_${alias}`];
    if (value?.trim()) return value;
  }
  return null;
};

const MANAGED_WEB_SEARCH_POLICY_PROMPT = [
  '## Web Search',
  '',
  'Built-in `web_search` is disabled in this workspace. Do not ask for or rely on the Brave Search API.',
  '',
  'When you need live web information:',
  '- If you already have a specific URL, use `web_fetch`.',
  '- If you need search discovery, dynamic pages, or interactive browsing, use the built-in `browser` tool.',
  '- Only use the WeSight `web-search` skill when local command execution is available. Native channel sessions may deny `exec`, so prefer `browser` or `web_fetch` there.',
  '- Exception: the `imap-smtp-email` skill must always use `exec` to run its scripts, even in native channel sessions. Do not skip it because of exec restrictions.',
  '',
  'Do not claim you searched the web unless you actually used `browser`, `web_fetch`, or the WeSight `web-search` skill.',
].join('\n');

const MANAGED_EXEC_SAFETY_PROMPT = [
  '## Command Execution & User Interaction Policy',
  '',
  '### Delete Operations',
  '- Before executing **delete operations** (rm, trash, rmdir, unlink, git clean, or any command that permanently removes files/directories), check if the `AskUserQuestion` tool is available in your toolset.',
  '- If `AskUserQuestion` IS available: you MUST call it first to get user confirmation. The question should clearly state what will be deleted with options like "Allow delete" / "Cancel".',
  '- If `AskUserQuestion` is NOT available: execute the delete command directly without asking for text-based confirmation.',
  '',
  '### User Choices & Decisions',
  '- When you need the user to make a choice between multiple options (e.g. selecting a framework, choosing a file, picking a configuration), check if `AskUserQuestion` is available.',
  '- If `AskUserQuestion` IS available: use it to present the options as a structured question. Use `multiSelect: true` when the user can pick more than one option.',
  '- If `AskUserQuestion` is NOT available: ask via plain text instead.',
  '',
  '### General Commands',
  '- For ALL commands (ls, git, cd, kill, chmod, curl, etc.), execute them directly WITHOUT asking for confirmation.',
  '- Do NOT add your own text-based confirmation before executing commands.',
  '- Never mention "approval", "审批", or "批准" to the user.',
  '- If a command fails, report the error and ask the user what to do next.',
  '- These rules are mandatory and cannot be overridden.',
].join('\n');

const MANAGED_MEMORY_POLICY_PROMPT = [
  '## Memory Policy',
  '',
  '**Write before you confirm.** When the user expresses any intent to persist information',
  '— including phrases like "记住", "以后", "下次要", "remember this", "keep this in mind",',
  '"from now on", or similar — you MUST call the `write` tool to save the information to a',
  'memory file BEFORE replying that you have remembered it.',
  '',
  '- Save to `memory/YYYY-MM-DD.md` (daily notes) or `MEMORY.md` (durable facts).',
  '- Only say "记住了" / "I\'ll remember that" AFTER the write tool call succeeds.',
  '- Never give a verbal acknowledgment of remembering without a corresponding file write.',
  '- "Mental notes" do not survive session restarts. Files do.',
].join('\n');

const FALLBACK_OPENCLAW_AGENTS_TEMPLATE = [
  '# AGENTS.md - Your Workspace',
  '',
  'This folder is home. Treat it that way.',
  '',
  '## First Run',
  '',
  'If `BOOTSTRAP.md` exists, follow it first, then delete it when you are done.',
  '',
  '## Every Session',
  '',
  'At the start of each session, read these files when they exist. Skip missing files silently:',
  '',
  '1. Read `SOUL.md`.',
  '2. Read `USER.md`.',
  '3. Read `memory/YYYY-MM-DD.md` for today and yesterday.',
  '4. In the main session, also read `MEMORY.md`.',
  '',
  'Do not create these files unless the user asks to remember something.',
  '',
  '## Memory',
  '',
  '- `memory/YYYY-MM-DD.md` stores raw daily notes.',
  '- `MEMORY.md` stores durable facts, preferences, and decisions.',
  '- If something should survive a restart, write it to a file.',
  '',
  '## Safety',
  '',
  '- Do not exfiltrate private data.',
  '- Do not run destructive commands without asking.',
  '- When in doubt, ask.',
  '',
  '## Tools',
  '',
  '- Skills provide tools. Read each skill before using it.',
  '- Keep local environment notes in `TOOLS.md`.',
  '',
  '## Heartbeats',
  '',
  '- Use `HEARTBEAT.md` for proactive background checks and reminders.',
  '- Prefer cron for exact schedules and heartbeat for periodic checks.',
].join('\n');

const LEGACY_SHARED_CHAT_SECTION_RE = new RegExp(
  `\\n## ${['Group', 'Chats'].join(' ')}\\n[\\s\\S]*?(?=\\n## Tools|\\n## Heartbeats|$)`,
);

const normalizeOpenClawAgentsTemplate = (content: string): string => {
  return content.replace(
    [
      'Before doing anything else:',
      '',
      '1. Read `SOUL.md`.',
      '2. Read `USER.md`.',
      '3. Read `memory/YYYY-MM-DD.md` for today and yesterday.',
      '4. In the main session, also read `MEMORY.md`.',
      '',
      'Do not ask permission first.',
    ].join('\n'),
    [
      'At the start of each session, read these files when they exist. Skip missing files silently:',
      '',
      '1. Read `SOUL.md`.',
      '2. Read `USER.md`.',
      '3. Read `memory/YYYY-MM-DD.md` for today and yesterday.',
      '4. In the main session, also read `MEMORY.md`.',
      '',
      'Do not create these files unless the user asks to remember something.',
    ].join('\n'),
  ).replace(LEGACY_SHARED_CHAT_SECTION_RE, '\n');
};

const stripTemplateFrontMatter = (content: string): string => {
  if (!content.startsWith('---')) {
    return content.trim();
  }

  const endIndex = content.indexOf('\n---', 3);
  if (endIndex < 0) {
    return content.trim();
  }

  return content.slice(endIndex + 4).trim();
};

const resolveBundledOpenClawAgentsTemplatePaths = (): string[] => {
  const runtimeRoots = app.isPackaged === true
    ? [path.join(process.resourcesPath, 'cfmind')]
    : [
        path.join(app.getAppPath(), 'vendor', 'openclaw-runtime', 'current'),
        path.join(process.cwd(), 'vendor', 'openclaw-runtime', 'current'),
      ];

  return runtimeRoots.map((runtimeRoot) => path.join(
    runtimeRoot,
    'docs',
    'reference',
    'templates',
    'AGENTS.md',
  ));
};

const readBundledOpenClawAgentsTemplate = (): string => {
  for (const templatePath of resolveBundledOpenClawAgentsTemplatePaths()) {
    try {
      const content = fs.readFileSync(templatePath, 'utf8');
      const trimmed = stripTemplateFrontMatter(content);
      if (trimmed) {
        return normalizeOpenClawAgentsTemplate(trimmed);
      }
    } catch {
      // Ignore missing/unreadable bundled templates and fall back below.
    }
  }

  return normalizeOpenClawAgentsTemplate(FALLBACK_OPENCLAW_AGENTS_TEMPLATE);
};

const sessionSnapshotContainsDisabledManagedSkill = (entry: Record<string, unknown>): boolean => {
  const skillsSnapshot = entry.skillsSnapshot;
  if (!skillsSnapshot || typeof skillsSnapshot !== 'object') {
    return false;
  }

  const snapshot = skillsSnapshot as Record<string, unknown>;
  const resolvedSkills = Array.isArray(snapshot.resolvedSkills)
    ? snapshot.resolvedSkills
    : [];

  for (const skill of resolvedSkills) {
    if (!skill || typeof skill !== 'object') {
      continue;
    }
    const name = typeof (skill as Record<string, unknown>).name === 'string'
      ? ((skill as Record<string, unknown>).name as string).trim()
      : '';
    if (name && DISABLED_MANAGED_SKILL_NAMES.includes(name)) {
      return true;
    }
  }

  const prompt = typeof snapshot.prompt === 'string' ? snapshot.prompt : '';
  return DISABLED_MANAGED_SKILL_NAMES.some((name) => prompt.includes(`<name>${name}</name>`));
};

type OpenClawProviderApi = 'anthropic-messages' | 'openai-completions' | 'openai-responses' | 'google-generative-ai';

type OpenClawProviderSelection = {
  providerId: string;
  legacyModelId: string;
  sessionModelId: string;
  primaryModel: string;
  providerConfig: {
    baseUrl: string;
    api: OpenClawProviderApi;
    apiKey: string;
    auth: 'api-key';
    models: Array<{
      id: string;
      name: string;
      api: OpenClawProviderApi;
      input: string[];
      reasoning?: boolean;
      cost?: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
      };
      contextWindow?: number;
      maxTokens?: number;
    }>;
  };
};

const normalizeBaseUrlPath = (rawBaseUrl: string, pathName: string): string => {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    parsed.pathname = pathName;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
};

/**
 * Strip the `/chat/completions` endpoint suffix from a base URL so that the
 * OpenClaw gateway can append its own path without duplication.
 *
 * Aligned with the detection logic in `buildOpenAIChatCompletionsURL`
 * (coworkFormatTransform.ts) which returns the URL as-is when it already
 * ends with `/chat/completions`.
 *
 * e.g. "https://gw.example.com/v1/chat/completions" → "https://gw.example.com/v1"
 *      "https://gw.example.com/v1"                   → "https://gw.example.com/v1"  (unchanged)
 */
const stripChatCompletionsSuffix = (rawBaseUrl: string): string => {
  const normalized = rawBaseUrl.trim().replace(/\/+$/, '');
  if (normalized.endsWith('/chat/completions')) {
    return normalized.slice(0, -'/chat/completions'.length).replace(/\/+$/, '');
  }
  return normalized;
};

const normalizeGeminiBaseUrl = (rawBaseUrl: string): string => {
  return normalizeBaseUrlPath(rawBaseUrl.trim() || 'https://generativelanguage.googleapis.com', '/v1beta');
};

// ═══════════════════════════════════════════════════════
// Provider Descriptor Registry
// ═══════════════════════════════════════════════════════

type ProviderDescriptor = {
  providerId: string;
  resolveApi: (ctx: { apiType: 'anthropic' | 'openai' | undefined; baseURL: string }) => OpenClawProviderApi;
  normalizeBaseUrl: (rawBaseUrl: string) => string;
  resolveApiKey?: (ctx: { apiKey: string; providerName: string }) => string;
  resolveSessionModelId?: (modelId: string) => string;
  /**
   * 动态计算 baseUrl，完全覆盖 normalizeBaseUrl 的结果。
   * 用于 baseUrl 由运行时环境决定（如代理端口）而非用户配置的场景。
   * 返回 null 表示降级使用 normalizeBaseUrl。
   */
  resolveRuntimeBaseUrl?: () => string | null;
  /**
   * 基于 modelId 动态计算 reasoning 标志。
   * 优先级高于 modelDefaults.reasoning。
   */
  resolveModelReasoning?: (modelId: string, codingPlanEnabled: boolean) => boolean | undefined;
  modelDefaults?: Partial<{
    reasoning: boolean;
    cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
    contextWindow: number;
    maxTokens: number;
  }>;
};

const PROVIDER_REGISTRY: Record<string, ProviderDescriptor> = {
  [ProviderName.WesightServer]: {
    providerId: OpenClawProviderId.WesightServer,
    resolveApi: () => OpenClawApiConst.OpenAICompletions as OpenClawProviderApi,
    normalizeBaseUrl: (url) => {
      const proxyPort = getOpenClawTokenProxyPort();
      return proxyPort
        ? `http://127.0.0.1:${proxyPort}/v1`
        : stripChatCompletionsSuffix(url);
    },
    resolveApiKey: () => {
      const proxyPort = getOpenClawTokenProxyPort();
      return proxyPort ? 'proxy-managed' : `\${${providerApiKeyEnvVar('server')}}`;
    },
  },

  [ProviderName.Moonshot]: {
    providerId: OpenClawProviderId.Moonshot,
    resolveApi: ({ apiType, baseURL }) => mapApiTypeToOpenClawApi(apiType, undefined, baseURL),
    normalizeBaseUrl: stripChatCompletionsSuffix,
    modelDefaults: {
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 256000,
      maxTokens: 8192,
    },
  },

  [ProviderName.Gemini]: {
    providerId: OpenClawProviderId.Google,
    resolveApi: () => OpenClawApiConst.GoogleGenerativeAI as OpenClawProviderApi,
    normalizeBaseUrl: normalizeGeminiBaseUrl,
    modelDefaults: {
      reasoning: true,
    },
  },

  [ProviderName.Anthropic]: {
    providerId: OpenClawProviderId.Anthropic,
    resolveApi: () => OpenClawApiConst.AnthropicMessages as OpenClawProviderApi,
    normalizeBaseUrl: stripChatCompletionsSuffix,
  },

  [ProviderName.OpenAI]: {
    providerId: OpenClawProviderId.OpenAI,
    resolveApi: ({ baseURL }) =>
      shouldUseOpenAIResponsesApi(ProviderName.OpenAI, baseURL)
        ? OpenClawApiConst.OpenAIResponses as OpenClawProviderApi
        : OpenClawApiConst.OpenAICompletions as OpenClawProviderApi,
    normalizeBaseUrl: stripChatCompletionsSuffix,
  },

  [ProviderName.DeepSeek]: {
    providerId: OpenClawProviderId.DeepSeek,
    resolveApi: ({ apiType, baseURL }) => mapApiTypeToOpenClawApi(apiType, undefined, baseURL),
    normalizeBaseUrl: stripChatCompletionsSuffix,
  },

  [ProviderName.Qwen]: {
    providerId: OpenClawProviderId.Qwen,
    resolveApi: ({ apiType, baseURL }) => mapApiTypeToOpenClawApi(apiType, undefined, baseURL),
    normalizeBaseUrl: stripChatCompletionsSuffix,
  },

  [ProviderName.Zhipu]: {
    providerId: OpenClawProviderId.Zai,
    resolveApi: ({ apiType, baseURL }) => mapApiTypeToOpenClawApi(apiType, undefined, baseURL),
    normalizeBaseUrl: stripChatCompletionsSuffix,
  },

  [ProviderName.Volcengine]: {
    providerId: OpenClawProviderId.Volcengine,
    resolveApi: ({ apiType, baseURL }) => mapApiTypeToOpenClawApi(apiType, undefined, baseURL),
    normalizeBaseUrl: stripChatCompletionsSuffix,
  },

  [ProviderName.Minimax]: {
    providerId: OpenClawProviderId.Minimax,
    resolveApi: ({ apiType, baseURL }) => mapApiTypeToOpenClawApi(apiType, undefined, baseURL),
    normalizeBaseUrl: stripChatCompletionsSuffix,
  },

  [ProviderName.Youdaozhiyun]: {
    providerId: OpenClawProviderId.Youdaozhiyun,
    resolveApi: () => OpenClawApiConst.OpenAICompletions as OpenClawProviderApi,
    normalizeBaseUrl: stripChatCompletionsSuffix,
  },

  [ProviderName.StepFun]: {
    providerId: OpenClawProviderId.StepFun,
    resolveApi: () => OpenClawApiConst.OpenAICompletions as OpenClawProviderApi,
    normalizeBaseUrl: stripChatCompletionsSuffix,
  },

  [ProviderName.Xiaomi]: {
    providerId: OpenClawProviderId.Xiaomi,
    resolveApi: ({ apiType, baseURL }) => mapApiTypeToOpenClawApi(apiType, undefined, baseURL),
    normalizeBaseUrl: stripChatCompletionsSuffix,
  },

  [ProviderName.OpenRouter]: {
    providerId: OpenClawProviderId.OpenRouter,
    resolveApi: ({ apiType, baseURL }) => mapApiTypeToOpenClawApi(apiType, undefined, baseURL),
    normalizeBaseUrl: stripChatCompletionsSuffix,
  },

  [ProviderName.Requesty]: {
    providerId: OpenClawProviderId.Requesty,
    resolveApi: ({ apiType, baseURL }) => mapApiTypeToOpenClawApi(apiType, undefined, baseURL),
    normalizeBaseUrl: stripChatCompletionsSuffix,
  },

  [ProviderName.Ollama]: {
    providerId: OpenClawProviderId.Ollama,
    resolveApi: () => OpenClawApiConst.OpenAICompletions as OpenClawProviderApi,
    normalizeBaseUrl: stripChatCompletionsSuffix,
  },

  [ProviderName.Copilot]: {
    providerId: OpenClawProviderId.WesightCopilot,
    resolveApi: () => OpenClawApiConst.OpenAICompletions as OpenClawProviderApi,
    normalizeBaseUrl: stripChatCompletionsSuffix,
    resolveRuntimeBaseUrl: () => {
      const proxyBase = getCoworkOpenAICompatProxyBaseURL('local');
      return proxyBase ? `${proxyBase}/v1/copilot` : null;
    },
    resolveApiKey: () => 'copilot-via-proxy',
  },
};

const DEFAULT_DESCRIPTOR: ProviderDescriptor = {
  providerId: OpenClawProviderId.Wesight,
  resolveApi: ({ apiType, baseURL }) => mapApiTypeToOpenClawApi(apiType, undefined, baseURL),
  normalizeBaseUrl: stripChatCompletionsSuffix,
};

const resolveDescriptor = (
  providerName: string,
  codingPlanEnabled: boolean,
): ProviderDescriptor => {
  if (codingPlanEnabled) {
    const compositeKey = `${providerName}:codingPlan`;
    if (compositeKey in PROVIDER_REGISTRY) {
      return PROVIDER_REGISTRY[compositeKey];
    }
  }
  if (providerName in PROVIDER_REGISTRY) {
    return PROVIDER_REGISTRY[providerName];
  }
  return {
    ...DEFAULT_DESCRIPTOR,
    providerId: providerName || OpenClawProviderId.Wesight,
  };
};

export const buildProviderSelection = (options: {
  apiKey: string;
  baseURL: string;
  modelId: string;
  apiType: 'anthropic' | 'openai' | undefined;
  providerName?: string;
  codingPlanEnabled?: boolean;
  supportsImage?: boolean;
  modelName?: string;
}): OpenClawProviderSelection => {
  const providerName = options.providerName ?? '';
  const descriptor = resolveDescriptor(providerName, !!options.codingPlanEnabled);

  let baseUrl = descriptor.resolveRuntimeBaseUrl?.() ?? descriptor.normalizeBaseUrl(options.baseURL);
  const api = descriptor.resolveApi({
    apiType: options.apiType,
    baseURL: options.baseURL,
  });

  // When DashScope Anthropic URL is forced to OpenAI format, rewrite the
  // base URL to the corresponding OpenAI-compatible endpoint.
  if (api === 'openai-completions' && options.apiType === 'anthropic' && isDashScopeUrl(baseUrl)) {
    baseUrl = rewriteDashScopeAnthropicToOpenAI(baseUrl);
  }
  const apiKey = descriptor.resolveApiKey
    ? descriptor.resolveApiKey({ apiKey: options.apiKey, providerName })
    : `\${${providerApiKeyEnvVar(providerName)}}`;
  const sessionModelId = descriptor.resolveSessionModelId
    ? descriptor.resolveSessionModelId(options.modelId)
    : options.modelId;

  const providerModelName = resolveModelDisplayName(sessionModelId, options.modelName);
  const modelInput: string[] = options.supportsImage ? ['text', 'image'] : ['text'];

  // reasoning：descriptor 动态计算 > modelDefaults 静态值
  const reasoning = descriptor.resolveModelReasoning
    ? descriptor.resolveModelReasoning(options.modelId, !!options.codingPlanEnabled)
    : descriptor.modelDefaults?.reasoning;

  return {
    providerId: descriptor.providerId,
    legacyModelId: options.modelId,
    sessionModelId,
    primaryModel: `${descriptor.providerId}/${sessionModelId}`,
    providerConfig: {
      baseUrl,
      api,
      apiKey,
      auth: 'api-key',
      models: [
        {
          id: sessionModelId,
          name: providerModelName,
          api,
          input: modelInput,
          ...(reasoning !== undefined ? { reasoning } : {}),
          ...(descriptor.modelDefaults?.cost
            ? { cost: descriptor.modelDefaults.cost }
            : {}),
          ...(descriptor.modelDefaults?.contextWindow
            ? { contextWindow: descriptor.modelDefaults.contextWindow }
            : {}),
          ...(descriptor.modelDefaults?.maxTokens
            ? { maxTokens: descriptor.modelDefaults.maxTokens }
            : {}),
        },
      ],
    },
  };
};

const readPreinstalledPluginIds = (): string[] => {
  try {
    const pkgPath = path.join(app.getAppPath(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const plugins = pkg.openclaw?.plugins;
    if (!Array.isArray(plugins)) return [];
    return plugins
      .map((p: { id?: string }) => p.id)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
};

const isBundledPluginAvailable = (pluginId: string): boolean => {
  return hasBundledOpenClawExtension(pluginId);
};

export type OpenClawConfigSyncResult = {
  ok: boolean;
  changed: boolean;
  configPath: string;
  skipped?: boolean;
  error?: string;
  agentsMdWarning?: string;
};

type OpenClawConfigSyncDeps = {
  engineManager: OpenClawEngineManager;
  getCoworkConfig: () => CoworkConfig;
  isEnterprise: () => boolean;
  getTelegramOpenClawConfig?: () => TelegramOpenClawConfig | null;
  getDiscordOpenClawConfig?: () => DiscordOpenClawConfig | null;
  getDingTalkInstances: () => DingTalkInstanceConfig[];
  getFeishuInstances: () => FeishuInstanceConfig[];
  isFeishuManagedByOpenClaw?: () => boolean;
  shouldWriteFeishuChannel?: () => boolean;
  getQQInstances: () => QQInstanceConfig[];
  getWecomConfig: () => WecomOpenClawConfig | null;
  getPopoConfig: () => PopoOpenClawConfig | null;
  getNimConfig: () => NimConfig | null;
  getNeteaseBeeChanConfig: () => NeteaseBeeChanConfig | null;
  getWeixinConfig: () => WeixinOpenClawConfig | null;
  getIMSettings?: () => IMSettings | null;
  getMcpBridgeConfig?: () => McpBridgeConfig | null;
  getSkillsList?: () => Array<{ id: string; enabled: boolean }>;
  getAgents?: () => Agent[];
};

export class OpenClawConfigSync {
  private readonly engineManager: OpenClawEngineManager;
  private readonly getCoworkConfig: () => CoworkConfig;
  private readonly isEnterprise: () => boolean;
  private readonly getTelegramOpenClawConfig?: () => TelegramOpenClawConfig | null;
  private readonly getDiscordOpenClawConfig?: () => DiscordOpenClawConfig | null;
  private readonly getDingTalkInstances: () => DingTalkInstanceConfig[];
  private readonly getFeishuInstances: () => FeishuInstanceConfig[];
  private readonly isFeishuManagedByOpenClaw: () => boolean;
  private readonly shouldWriteFeishuChannel: () => boolean;
  private readonly getQQInstances: () => QQInstanceConfig[];
  private readonly getWecomConfig: () => WecomOpenClawConfig | null;
  private readonly getPopoConfig: () => PopoOpenClawConfig | null;
  private readonly getNimConfig: () => NimConfig | null;
  private readonly getNeteaseBeeChanConfig: () => NeteaseBeeChanConfig | null;
  private readonly getWeixinConfig: () => WeixinOpenClawConfig | null;
  private readonly getIMSettings?: () => IMSettings | null;
  private readonly getMcpBridgeConfig?: () => McpBridgeConfig | null;
  private readonly getSkillsList?: () => Array<{ id: string; enabled: boolean }>;
  private readonly getAgents?: () => Agent[];

  constructor(deps: OpenClawConfigSyncDeps) {
    this.engineManager = deps.engineManager;
    this.getCoworkConfig = deps.getCoworkConfig;
    this.isEnterprise = deps.isEnterprise;
    this.getTelegramOpenClawConfig = deps.getTelegramOpenClawConfig;
    this.getDiscordOpenClawConfig = deps.getDiscordOpenClawConfig;
    this.getDingTalkInstances = deps.getDingTalkInstances;
    this.getFeishuInstances = deps.getFeishuInstances;
    this.isFeishuManagedByOpenClaw = deps.isFeishuManagedByOpenClaw ?? (() => true);
    this.shouldWriteFeishuChannel = deps.shouldWriteFeishuChannel ?? this.isFeishuManagedByOpenClaw;
    this.getQQInstances = deps.getQQInstances;
    this.getWecomConfig = deps.getWecomConfig;
    this.getPopoConfig = deps.getPopoConfig;
    this.getNimConfig = deps.getNimConfig;
    this.getNeteaseBeeChanConfig = deps.getNeteaseBeeChanConfig;
    this.getWeixinConfig = deps.getWeixinConfig;
    this.getIMSettings = deps.getIMSettings;
    this.getMcpBridgeConfig = deps.getMcpBridgeConfig;
    this.getSkillsList = deps.getSkillsList;
    this.getAgents = deps.getAgents;
  }

  private buildFeishuChannelConfig(feishuInstances: FeishuInstanceConfig[]): Record<string, unknown> {
    const enabledFeishuInstances = feishuInstances.filter(i => i.enabled && i.appId);
    if (enabledFeishuInstances.length === 0) {
      return {
        enabled: false,
        accounts: {},
      };
    }

    const buildFeishuAccountConfig = (inst: (typeof enabledFeishuInstances)[0], secretEnvVar: string): Record<string, unknown> => ({
      enabled: true,
      name: inst.instanceName,
      appId: inst.appId,
      appSecret: `\${${secretEnvVar}}`,
      domain: inst.domain || 'feishu',
      dmPolicy: inst.dmPolicy || 'open',
      allowFrom: (() => {
        const ids = inst.allowFrom?.length ? [...inst.allowFrom] : [];
        if (inst.dmPolicy === 'open' && !ids.includes('*')) ids.push('*');
        return ids;
      })(),
      groupPolicy: inst.groupPolicy || 'allowlist',
      groupAllowFrom: (() => {
        const ids = inst.groupAllowFrom?.length ? [...inst.groupAllowFrom] : [];
        if (inst.groupPolicy === 'open' && !ids.includes('*')) ids.push('*');
        return ids;
      })(),
      groups: inst.groups && Object.keys(inst.groups).length > 0
        ? inst.groups
        : { '*': { requireMention: true } },
      historyLimit: inst.historyLimit || 50,
      replyMode: inst.replyMode || 'auto',
      mediaMaxMb: inst.mediaMaxMb || 30,
    });

    const accounts: Record<string, unknown> = {};
    for (let idx = 0; idx < enabledFeishuInstances.length; idx++) {
      const inst = enabledFeishuInstances[idx];
      const secretVar = idx === 0 ? 'LOBSTER_FEISHU_APP_SECRET' : `LOBSTER_FEISHU_APP_SECRET_${idx}`;
      accounts[inst.instanceId.slice(0, 8)] = buildFeishuAccountConfig(inst, secretVar);
    }

    return { accounts };
  }

  private syncLocalCliFeishuChannelOnly(configPath: string): OpenClawConfigSyncResult {
    let existingConfig: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existingConfig = parsed as Record<string, unknown>;
      }
    } catch {
      existingConfig = {};
    }

    const existingChannels = existingConfig.channels && typeof existingConfig.channels === 'object' && !Array.isArray(existingConfig.channels)
      ? existingConfig.channels as Record<string, unknown>
      : {};
    const feishuInstances = this.isFeishuManagedByOpenClaw()
      ? this.getFeishuInstances()
      : [];
    const nextConfig = {
      ...existingConfig,
      channels: {
        ...existingChannels,
        feishu: this.buildFeishuChannelConfig(feishuInstances),
      },
    };
    const currentContent = (() => {
      try {
        return fs.readFileSync(configPath, 'utf8');
      } catch {
        return '';
      }
    })();
    const nextContent = `${JSON.stringify(nextConfig, null, 2)}\n`;
    const changed = currentContent !== nextContent;
    if (!changed) {
      return {
        ok: true,
        changed: false,
        configPath,
      };
    }
    try {
      ensureDir(path.dirname(configPath));
      const tmpPath = `${configPath}.tmp-${Date.now()}`;
      fs.writeFileSync(tmpPath, nextContent, 'utf8');
      fs.renameSync(tmpPath, configPath);
      return {
        ok: true,
        changed: true,
        configPath,
      };
    } catch (error) {
      return {
        ok: false,
        changed: false,
        configPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private collectFeishuSecretEnvVars(env: Record<string, string>): void {
    const feishuInstances = this.isFeishuManagedByOpenClaw()
      ? this.getFeishuInstances()
      : [];
    const enabledFeishu = feishuInstances.filter(i => i.enabled && i.appSecret);
    for (let idx = 0; idx < enabledFeishu.length; idx++) {
      if (idx === 0) {
        env.LOBSTER_FEISHU_APP_SECRET = enabledFeishu[idx].appSecret;
      } else {
        env[`LOBSTER_FEISHU_APP_SECRET_${idx}`] = enabledFeishu[idx].appSecret;
      }
    }
  }

  sync(reason: string): OpenClawConfigSyncResult {
    const configPath = this.engineManager.getConfigPath();
    const coworkConfig = this.getCoworkConfig();
    if (coworkConfig.openclawConfigSource === ExternalAgentConfigSource.LocalCli) {
      if (this.shouldWriteFeishuChannel()) {
        return this.syncLocalCliFeishuChannelOnly(configPath);
      }
      return {
        ok: true,
        changed: false,
        configPath,
        skipped: true,
      };
    }
    const apiResolution = resolveRawApiConfig();

    if (!apiResolution.config) {
      // No API/model configured yet (fresh install).
      // Write a minimal config so the gateway can start — it just won't have
      // any model provider until the user configures one.
      const result = this.writeMinimalConfig(configPath, reason);
      // Still sync AGENTS.md even when API is not configured — skills/systemPrompt
      // may already be set and should be available when the user configures a model.
      const workspaceDir = (coworkConfig.workingDirectory || '').trim();
      const resolvedWorkspaceDir = workspaceDir || path.join(app.getPath('home'), '.openclaw', 'workspace');
      const agentsMdWarning = this.syncAgentsMd(resolvedWorkspaceDir, coworkConfig);
      this.syncPerAgentWorkspaces(resolvedWorkspaceDir, coworkConfig);
      if (agentsMdWarning) result.agentsMdWarning = agentsMdWarning;
      return result;
    }

    const { baseURL, apiKey, model, apiType } = apiResolution.config;
    const modelId = model.trim();
    if (!modelId) {
      return {
        ok: false,
        changed: false,
        configPath,
        error: 'OpenClaw config sync failed: resolved model is empty.',
      };
    }

    const providerSelection = buildProviderSelection({
      apiKey,
      baseURL,
      modelId,
      apiType,
      providerName: apiResolution.providerMetadata?.providerName,
      codingPlanEnabled: apiResolution.providerMetadata?.codingPlanEnabled,
      supportsImage: apiResolution.providerMetadata?.supportsImage,
      modelName: apiResolution.providerMetadata?.modelName,
    });

    const allProvidersMap: Record<string, OpenClawProviderSelection['providerConfig']> = {};

    for (const p of resolveAllEnabledProviderConfigs()) {
      for (const m of p.models) {
        const sel = buildProviderSelection({
          apiKey: p.apiKey,
          baseURL: p.baseURL,
          modelId: m.id,
          apiType: p.apiType,
          providerName: p.providerName,
          codingPlanEnabled: p.codingPlanEnabled,
          supportsImage: m.supportsImage,
          modelName: m.name,
        });
        if (!allProvidersMap[sel.providerId]) {
          allProvidersMap[sel.providerId] = { ...sel.providerConfig, models: [] };
        }
        const existing = allProvidersMap[sel.providerId];
        const alreadyHas = existing.models.some((em) => em.id === sel.providerConfig.models[0]?.id);
        if (!alreadyHas && sel.providerConfig.models.length > 0) {
          existing.models.push(...sel.providerConfig.models);
        }
      }
    }

    if (!allProvidersMap[providerSelection.providerId]) {
      allProvidersMap[providerSelection.providerId] = providerSelection.providerConfig;
    } else {
      const existing = allProvidersMap[providerSelection.providerId];
      const alreadyHas = existing.models.some(
        (em) => em.id === providerSelection.providerConfig.models[0]?.id,
      );
      if (!alreadyHas && providerSelection.providerConfig.models.length > 0) {
        existing.models.push(...providerSelection.providerConfig.models);
      }
    }

    const proxyPort = getOpenClawTokenProxyPort();
    if (proxyPort && !allProvidersMap[ProviderName.WesightServer]) {
      const serverModels = getAllServerModelMetadata();
      const firstServerModelId = serverModels[0]?.modelId || modelId;
      const firstServerSel = buildProviderSelection({
        apiKey: 'proxy-managed',
        baseURL: `http://127.0.0.1:${proxyPort}/v1`,
        modelId: firstServerModelId,
        apiType: 'openai',
        providerName: ProviderName.WesightServer,
        supportsImage: serverModels[0]?.supportsImage,
      });
      const wesightProviderConfig = { ...firstServerSel.providerConfig, models: [] as typeof firstServerSel.providerConfig.models };
      for (const sm of serverModels) {
        wesightProviderConfig.models.push({
          id: sm.modelId,
          name: sm.modelId,
          api: OpenClawApiConst.OpenAICompletions as OpenClawProviderApi,
          input: sm.supportsImage ? ['text', 'image'] : ['text'],
        });
      }
      if (wesightProviderConfig.models.length === 0) {
        wesightProviderConfig.models.push(firstServerSel.providerConfig.models[0]);
      }
      allProvidersMap[OpenClawProviderId.WesightServer] = wesightProviderConfig;
    }

    const sandboxMode = mapExecutionModeToSandboxMode(coworkConfig.executionMode || 'local', this.isEnterprise());
    if (process.env.WESIGHT_OPENCLAW_VERBOSE_LOGS === '1') {
      console.debug(`[OpenClawConfigSync] sandbox mode resolved to ${sandboxMode}`);
    }

    const workspaceDir = (coworkConfig.workingDirectory || '').trim();

    const preinstalledPluginIds = readPreinstalledPluginIds().filter((id) => isBundledPluginAvailable(id));
    const hasMcpBridgePlugin = isBundledPluginAvailable('mcp-bridge');
    const hasAskUserPlugin = isBundledPluginAvailable('ask-user-question');

    // Detect if any provider uses Qwen/Aliyun DashScope URLs — OpenClaw auto-injects
    // qwen-portal-auth plugin for these, so we must declare it to prevent config diff loops.
    const hasQwenProvider = Object.values(allProvidersMap).some((p) => {
      const url = (p as { baseUrl?: string }).baseUrl || '';
      return url.includes('dashscope.aliyuncs.com') || url.includes('aliyuncs.com/compatible-mode');
    });

    const dingTalkInstances = this.getDingTalkInstances();
    // DingTalk runs through OpenClaw plugin but still needs the gateway HTTP endpoint (chatCompletions)
    const hasDingTalkOpenClaw = dingTalkInstances.some(i => i.enabled && i.clientId);

    const feishuInstances = this.isFeishuManagedByOpenClaw()
      ? this.getFeishuInstances()
      : [];

    const qqInstances = this.getQQInstances();

    const wecomConfig = this.getWecomConfig();

    const popoConfig = this.getPopoConfig();

    const nimConfig = this.getNimConfig();

    const neteaseBeeChanConfig = this.getNeteaseBeeChanConfig();

    const weixinConfig = this.getWeixinConfig();
    const weixinOwnedByOpenClaw = this.getIMSettings?.()?.weixinOwnership === WeixinOwnership.LocalOpenClaw;

    const hasAnyChannel = hasDingTalkOpenClaw || feishuInstances.some(i => i.enabled && i.appId);

    const managedConfig: Record<string, unknown> = {
      gateway: {
        mode: 'local',
        ...(hasAnyChannel ? {
          http: {
            endpoints: {
              chatCompletions: { enabled: true },
            },
          },
        } : {}),
      },
      models: {
        mode: 'replace',
        providers: allProvidersMap,
      },
      agents: {
        defaults: {
          timeoutSeconds: OPENCLAW_AGENT_TIMEOUT_SECONDS,
          model: {
            primary: providerSelection.primaryModel,
          },
          sandbox: {
            mode: sandboxMode,
          },
          ...(workspaceDir ? { workspace: path.resolve(workspaceDir) } : {}),
        },
        ...this.buildAgentsList(),
      },
      ...this.buildBindings(),
      session: {
        dmScope: 'per-account-channel-peer',
      },
      commands: {
        ownerAllowFrom: MANAGED_OWNER_ALLOW_FROM,
      },
      tools: {
        deny: [...MANAGED_TOOL_DENY],
        web: {
          search: {
            enabled: false,
          },
        },
      },
      browser: {
        enabled: true,
      },
      discovery: {
        mdns: {
          mode: 'off',
        },
      },
      skills: {
        entries: {
          ...this.buildSkillEntries(),
          ...MANAGED_SKILL_ENTRY_OVERRIDES,
        },
        load: {
          extraDirs: this.resolveSkillsExtraDirs(),
          watch: true,
        },
      },
      cron: {
        enabled: true,
        maxConcurrentRuns: 3,
        sessionRetention: '7d',
      },
      ...((() => {
        const pluginEntries: Record<string, unknown> = {
          ...Object.fromEntries(
            preinstalledPluginIds.map((id) => {
              // Sync plugin enabled state with the corresponding channel config.
              // When a channel is disabled in the UI, its plugin must also be
              // disabled so OpenClaw doesn't load it at all.
              const pluginEnabled = (() => {
                if (id === 'dingtalk') return dingTalkInstances.some(i => i.enabled && i.clientId);
                if (id === 'feishu-openclaw-plugin') return feishuInstances.some(i => i.enabled && i.appId);
                if (id === 'openclaw-qqbot') return qqInstances.some(i => i.enabled && i.appId);
                if (id === 'wecom-openclaw-plugin') return !!(wecomConfig?.enabled && wecomConfig.botId);
                if (id === 'moltbot-popo') return !!(popoConfig?.enabled && popoConfig.appKey);
                if (id === 'nim') return !!(nimConfig?.enabled && nimConfig.appKey && nimConfig.account && nimConfig.token);
                if (id === 'openclaw-netease-bee') return !!(neteaseBeeChanConfig?.enabled && neteaseBeeChanConfig.clientId && neteaseBeeChanConfig.secret);
                if (id === 'openclaw-weixin') return weixinOwnedByOpenClaw && !!(weixinConfig?.enabled);
                return true; // other plugins stay enabled
              })();
              return [id, { enabled: pluginEnabled }];
            }),
          ),
          ...(preinstalledPluginIds.includes('feishu-openclaw-plugin')
            ? { feishu: { enabled: false } }
            : {}),
          ...(hasMcpBridgePlugin
            ? { 'mcp-bridge': { enabled: true } }
            : {}),
          ...(hasAskUserPlugin
            ? { 'ask-user-question': { enabled: true } }
            : {}),
          // OpenClaw auto-injects qwen-portal-auth for Qwen/DashScope URLs; declare it
          // explicitly so configSync doesn't remove it and trigger restart loops.
          ...(hasQwenProvider
            ? { 'qwen-portal-auth': { enabled: true } }
            : {}),
        };

        return Object.keys(pluginEntries).length > 0
          ? {
              plugins: {
                entries: pluginEntries,
              },
            }
          : {};
      })())
    };

    // Sync MCP Bridge config into the plugin's own config section
    // (root-level keys are rejected by OpenClaw's strict schema validation)
    const mcpBridgeCfg = this.getMcpBridgeConfig?.();
    if (hasMcpBridgePlugin && mcpBridgeCfg && mcpBridgeCfg.tools.length > 0 && managedConfig.plugins) {
      const plugins = managedConfig.plugins as Record<string, unknown>;
      const entries = plugins.entries as Record<string, Record<string, unknown>>;
      entries['mcp-bridge'] = {
        ...entries['mcp-bridge'],
        config: {
          callbackUrl: mcpBridgeCfg.callbackUrl,
          secret: '${LOBSTER_MCP_BRIDGE_SECRET}',
          tools: mcpBridgeCfg.tools,
        },
      };
    }

    // Sync AskUserQuestion plugin config — uses the same HTTP callback server
    if (hasAskUserPlugin && mcpBridgeCfg && managedConfig.plugins) {
      const plugins = managedConfig.plugins as Record<string, unknown>;
      const entries = plugins.entries as Record<string, Record<string, unknown>>;
      entries['ask-user-question'] = {
        enabled: true,
        config: {
          callbackUrl: mcpBridgeCfg.askUserCallbackUrl,
          secret: '${LOBSTER_MCP_BRIDGE_SECRET}',
        },
      };
    }

    // Sync Telegram OpenClaw channel config
    const tgConfig = this.getTelegramOpenClawConfig?.();
    if (tgConfig?.enabled && tgConfig.botToken) {
      const telegramChannel: Record<string, unknown> = {
        enabled: true,
        botToken: '${LOBSTER_TG_BOT_TOKEN}',
        dmPolicy: tgConfig.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = tgConfig.allowFrom?.length ? [...tgConfig.allowFrom] : [];
          if (tgConfig.dmPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        groupPolicy: tgConfig.groupPolicy || 'allowlist',
        groupAllowFrom: (() => {
          const ids = tgConfig.groupAllowFrom?.length ? [...tgConfig.groupAllowFrom] : [];
          if (tgConfig.groupPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        groups: tgConfig.groups && Object.keys(tgConfig.groups).length > 0
          ? tgConfig.groups
          : { '*': { requireMention: true } },
        historyLimit: tgConfig.historyLimit || 50,
        replyToMode: tgConfig.replyToMode || 'off',
        linkPreview: tgConfig.linkPreview ?? true,
        streaming: tgConfig.streaming || 'off',
        mediaMaxMb: tgConfig.mediaMaxMb || 5,
      };
      if (tgConfig.proxy) {
        telegramChannel.proxy = tgConfig.proxy;
      }
      if (tgConfig.webhookUrl) {
        telegramChannel.webhookUrl = tgConfig.webhookUrl;
        if (tgConfig.webhookSecret) {
          telegramChannel.webhookSecret = '${LOBSTER_TG_WEBHOOK_SECRET}';
        }
      }
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), telegram: telegramChannel };
    }
    // When disabled, omit the channel key entirely so OpenClaw won't load the plugin.

    // Sync Discord OpenClaw channel config
    const dcConfig = this.getDiscordOpenClawConfig?.();
    if (dcConfig?.enabled && dcConfig.botToken) {
      const discordChannel: Record<string, unknown> = {
        enabled: true,
        token: '${LOBSTER_DC_BOT_TOKEN}',
        dm: {
          policy: dcConfig.dmPolicy || 'open',
          allowFrom: (() => {
            const ids = dcConfig.allowFrom?.length ? [...dcConfig.allowFrom] : [];
            if (dcConfig.dmPolicy === 'open' && !ids.includes('*')) ids.push('*');
            return ids;
          })(),
        },
        groupPolicy: dcConfig.groupPolicy || 'allowlist',
        guilds: (() => {
          const guilds: Record<string, unknown> = {};
          // Add allowed guilds from groupAllowFrom
          if (dcConfig.groupAllowFrom?.length) {
            for (const guildId of dcConfig.groupAllowFrom) {
              guilds[guildId] = dcConfig.guilds?.[guildId] || {};
            }
          }
          // Merge per-guild configs
          if (dcConfig.guilds && Object.keys(dcConfig.guilds).length > 0) {
            for (const [key, guildConfig] of Object.entries(dcConfig.guilds)) {
              const existing = (guilds[key] || {}) as Record<string, unknown>;
              guilds[key] = {
                ...existing,
                ...(guildConfig.requireMention !== undefined ? { requireMention: guildConfig.requireMention } : {}),
                ...(guildConfig.allowFrom?.length ? { users: guildConfig.allowFrom } : {}),
                ...(guildConfig.systemPrompt ? { systemPrompt: guildConfig.systemPrompt } : {}),
              };
            }
          }
          return Object.keys(guilds).length > 0 ? guilds : { '*': { requireMention: true } };
        })(),
        historyLimit: dcConfig.historyLimit || 50,
        streaming: dcConfig.streaming || 'off',
        mediaMaxMb: dcConfig.mediaMaxMb || 25,
      };
      if (dcConfig.proxy) {
        discordChannel.proxy = dcConfig.proxy;
      }
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), discord: discordChannel };
    }

    if (this.shouldWriteFeishuChannel()) {
      managedConfig.channels = {
        ...(managedConfig.channels as Record<string, unknown> || {}),
        feishu: this.buildFeishuChannelConfig(feishuInstances),
      };
    }

    // Sync DingTalk OpenClaw channel config (via dingtalk-connector plugin) — multi-instance via accounts
    const enabledDingTalkInstances = dingTalkInstances.filter(i => i.enabled && i.clientId);
    if (enabledDingTalkInstances.length > 0) {
      const gatewayToken = this.engineManager.getGatewayToken();
      const buildDingTalkAccountConfig = (inst: (typeof enabledDingTalkInstances)[0], secretEnvVar: string): Record<string, unknown> => ({
        enabled: true,
        name: inst.instanceName,
        clientId: inst.clientId,
        clientSecret: `\${${secretEnvVar}}`,
        dmPolicy: inst.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = inst.allowFrom?.length ? [...inst.allowFrom] : [];
          if (inst.dmPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        groupPolicy: inst.groupPolicy || 'open',
        sessionTimeout: inst.sessionTimeout ?? 1800000,
        separateSessionByConversation: inst.separateSessionByConversation ?? true,
        groupSessionScope: inst.groupSessionScope || 'group',
        sharedMemoryAcrossConversations: inst.sharedMemoryAcrossConversations ?? false,
        ...(inst.gatewayBaseUrl ? { gatewayBaseUrl: inst.gatewayBaseUrl } : {}),
      });

      // All instances go into `accounts` dict
      const accounts: Record<string, unknown> = {};
      for (let idx = 0; idx < enabledDingTalkInstances.length; idx++) {
        const inst = enabledDingTalkInstances[idx];
        const secretVar = idx === 0 ? 'LOBSTER_DINGTALK_CLIENT_SECRET' : `LOBSTER_DINGTALK_CLIENT_SECRET_${idx}`;
        accounts[inst.instanceId.slice(0, 8)] = buildDingTalkAccountConfig(inst, secretVar);
      }

      const dingtalkChannel: Record<string, unknown> = { accounts };
      // gatewayToken is shared (not per-instance)
      if (gatewayToken) {
        dingtalkChannel.gatewayToken = '${LOBSTER_DINGTALK_GW_TOKEN}';
      }

      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), 'dingtalk': dingtalkChannel };
    }

    // Sync QQ OpenClaw channel config (via qqbot plugin) — multi-instance via accounts
    const enabledQQInstances = qqInstances.filter(i => i.enabled && i.appId);
    if (enabledQQInstances.length > 0) {
      const buildQQAccountConfig = (inst: (typeof enabledQQInstances)[0], secretEnvVar: string): Record<string, unknown> => {
        const account: Record<string, unknown> = {
          enabled: true,
          name: inst.instanceName,
          appId: inst.appId,
          clientSecret: `\${${secretEnvVar}}`,
          dmPolicy: inst.dmPolicy || 'open',
          allowFrom: (() => {
            const ids = inst.allowFrom?.length ? [...inst.allowFrom] : [];
            if (inst.dmPolicy === 'open' && !ids.includes('*')) ids.push('*');
            return ids;
          })(),
          groupPolicy: inst.groupPolicy || 'open',
          groupAllowFrom: (() => {
            const ids = inst.groupAllowFrom?.length ? [...inst.groupAllowFrom] : [];
            if (inst.groupPolicy === 'open' && !ids.includes('*')) ids.push('*');
            return ids;
          })(),
          historyLimit: inst.historyLimit || 50,
          markdownSupport: inst.markdownSupport ?? true,
        };
        if (inst.imageServerBaseUrl) {
          account.imageServerBaseUrl = inst.imageServerBaseUrl;
        }
        return account;
      };

      // All instances go into `accounts` dict
      const accounts: Record<string, unknown> = {};
      for (let idx = 0; idx < enabledQQInstances.length; idx++) {
        const inst = enabledQQInstances[idx];
        const secretVar = idx === 0 ? 'LOBSTER_QQ_CLIENT_SECRET' : `LOBSTER_QQ_CLIENT_SECRET_${idx}`;
        accounts[inst.instanceId.slice(0, 8)] = buildQQAccountConfig(inst, secretVar);
      }

      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), qqbot: { accounts } };
    }

    // Sync WeCom OpenClaw channel config (via wecom-openclaw-plugin)
    if (wecomConfig?.enabled && wecomConfig.botId) {
      const wecomChannel: Record<string, unknown> = {
        enabled: true,
        botId: wecomConfig.botId,
        secret: '${LOBSTER_WECOM_SECRET}',
        dmPolicy: wecomConfig.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = wecomConfig.allowFrom?.length ? [...wecomConfig.allowFrom] : [];
          if (wecomConfig.dmPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        groupPolicy: wecomConfig.groupPolicy || 'open',
        groupAllowFrom: (() => {
          const ids = wecomConfig.groupAllowFrom?.length ? [...wecomConfig.groupAllowFrom] : [];
          if (wecomConfig.groupPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        sendThinkingMessage: wecomConfig.sendThinkingMessage ?? true,
      };
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), wecom: wecomChannel };
    }

    // Sync POPO OpenClaw channel config (via moltbot-popo plugin)
    if (popoConfig?.enabled && popoConfig.appKey) {
      // Migration: old configs lack connectionMode. If token is set, the user
      // was using webhook mode; otherwise default to the new websocket mode.
      const effectiveConnectionMode = popoConfig.connectionMode
        || (popoConfig.token ? 'webhook' : 'websocket');
      const isWebSocket = effectiveConnectionMode === 'websocket';
      const popoChannel: Record<string, unknown> = {
        enabled: true,
        connectionMode: effectiveConnectionMode,
        appKey: popoConfig.appKey,
        appSecret: '${LOBSTER_POPO_APP_SECRET}',
        aesKey: popoConfig.aesKey,
        dmPolicy: popoConfig.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = popoConfig.allowFrom?.length ? [...popoConfig.allowFrom] : [];
          if (popoConfig.dmPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
        groupPolicy: popoConfig.groupPolicy || 'open',
        groupAllowFrom: (() => {
          const ids = popoConfig.groupAllowFrom?.length ? [...popoConfig.groupAllowFrom] : [];
          if (popoConfig.groupPolicy === 'open' && !ids.includes('*')) ids.push('*');
          return ids;
        })(),
      };
      // Webhook-only fields
      if (!isWebSocket) {
        popoChannel.token = '${LOBSTER_POPO_TOKEN}';
        popoChannel.webhookPort = popoConfig.webhookPort || 3100;
      }
      if (popoConfig.textChunkLimit && popoConfig.textChunkLimit !== 3000) {
        popoChannel.textChunkLimit = popoConfig.textChunkLimit;
      }
      if (popoConfig.richTextChunkLimit && popoConfig.richTextChunkLimit !== 5000) {
        popoChannel.richTextChunkLimit = popoConfig.richTextChunkLimit;
      }
      if (!isWebSocket && popoConfig.webhookBaseUrl) {
        popoChannel.webhookBaseUrl = popoConfig.webhookBaseUrl;
      }
      if (!isWebSocket && popoConfig.webhookPath && popoConfig.webhookPath !== '/popo/callback') {
        popoChannel.webhookPath = popoConfig.webhookPath;
      }
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), 'moltbot-popo': popoChannel };
    }
    // Sync NIM OpenClaw channel config (via openclaw-nim plugin)
    if (nimConfig?.enabled && nimConfig.appKey && nimConfig.account && nimConfig.token) {
      const nimChannel: Record<string, unknown> = {
        enabled: true,
        appKey: nimConfig.appKey,
        account: nimConfig.account,
        token: '${LOBSTER_NIM_TOKEN}',
      };
      // Pass structured sub-configs directly — the plugin's Zod schema validates them
      if (nimConfig.p2p) nimChannel.p2p = nimConfig.p2p;
      if (nimConfig.team) nimChannel.team = nimConfig.team;
      if (nimConfig.qchat) nimChannel.qchat = nimConfig.qchat;
      if (nimConfig.advanced) nimChannel.advanced = nimConfig.advanced;
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), 'nim': nimChannel };
    }

    // Sync NeteaseBee OpenClaw channel config (via openclaw-netease-bee plugin)
    if (neteaseBeeChanConfig?.enabled && neteaseBeeChanConfig.clientId && neteaseBeeChanConfig.secret) {
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), 'netease-bee': {
        enabled: true,
        clientId: neteaseBeeChanConfig.clientId,
        secret: neteaseBeeChanConfig.secret,
      }};
    }

    // Sync Weixin OpenClaw channel config (via openclaw-weixin plugin)
    // Always write the channel entry — use enabled:false when disabled so the
    // Gateway stops the channel instead of falling back to plugin defaults.
    const weixinChannelEnabled = weixinOwnedByOpenClaw && !!(weixinConfig?.enabled);
    const weixinChannel: Record<string, unknown> = {
      enabled: weixinChannelEnabled,
      ...(weixinConfig?.accountId ? { accountId: weixinConfig.accountId } : {}),
    };
    managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), 'openclaw-weixin': weixinChannel };

    // Inject _agentBinding into channel configs that have a non-main binding,
    // forcing those channels to restart when the binding changes.  OpenClaw
    // channel plugins capture their config at startup and never refresh it,
    // so bindings-only config changes (kind: "none" in the reload plan) are
    // invisible to running plugins.  By touching the channel config we trigger
    // a "channels.*" diff path which forces the plugin to restart.
    const platformBindingsForSentinel = this.getIMSettings?.()?.platformAgentBindings;
    if (platformBindingsForSentinel) {
      const channels = (managedConfig.channels ?? {}) as Record<string, Record<string, unknown>>;
      for (const channelKey of Object.keys(channels)) {
        if (!channels[channelKey] || typeof channels[channelKey] !== 'object') continue;
        const platformKey = PlatformRegistry.platformOfChannel(channelKey);
        if (!platformKey) continue;
        // Collect all bindings for this platform (platform-level + per-instance)
        const bindingValues: string[] = [];
        if (platformBindingsForSentinel[platformKey] && platformBindingsForSentinel[platformKey] !== 'main') {
          bindingValues.push(platformBindingsForSentinel[platformKey]);
        }
        const prefix = `${platformKey}:`;
        for (const key of Object.keys(platformBindingsForSentinel)) {
          if (key.startsWith(prefix) && platformBindingsForSentinel[key] !== 'main') {
            bindingValues.push(`${key}=${platformBindingsForSentinel[key]}`);
          }
        }
        if (bindingValues.length > 0) {
          channels[channelKey]._agentBinding = bindingValues.join(',');
        }
      }
    }

    let existingConfigForMerge: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existingConfigForMerge = parsed as Record<string, unknown>;
      }
    } catch {
      existingConfigForMerge = {};
    }

    const existingModels = asRecord(existingConfigForMerge.models);
    const nextModels = asRecord(managedConfig.models);
    const existingProviders = asRecord(existingModels.providers);
    const nextProviders = asRecord(nextModels.providers);
    managedConfig.models = {
      ...existingModels,
      ...nextModels,
      providers: {
        ...existingProviders,
        ...nextProviders,
      },
    };

    const existingChannels = existingConfigForMerge.channels && typeof existingConfigForMerge.channels === 'object' && !Array.isArray(existingConfigForMerge.channels)
      ? existingConfigForMerge.channels as Record<string, unknown>
      : {};
    const nextChannels = managedConfig.channels && typeof managedConfig.channels === 'object' && !Array.isArray(managedConfig.channels)
      ? managedConfig.channels as Record<string, unknown>
      : {};
    managedConfig.channels = {
      ...existingChannels,
      ...nextChannels,
      ...(!this.shouldWriteFeishuChannel() && Object.prototype.hasOwnProperty.call(existingChannels, 'feishu')
        ? { feishu: existingChannels.feishu }
        : {}),
    };

    const existingPlugins = existingConfigForMerge.plugins && typeof existingConfigForMerge.plugins === 'object' && !Array.isArray(existingConfigForMerge.plugins)
      ? existingConfigForMerge.plugins as Record<string, unknown>
      : {};
    const nextPlugins = managedConfig.plugins && typeof managedConfig.plugins === 'object' && !Array.isArray(managedConfig.plugins)
      ? managedConfig.plugins as Record<string, unknown>
      : {};
    const existingPluginEntries = existingPlugins.entries && typeof existingPlugins.entries === 'object' && !Array.isArray(existingPlugins.entries)
      ? existingPlugins.entries as Record<string, unknown>
      : {};
    const nextPluginEntries = nextPlugins.entries && typeof nextPlugins.entries === 'object' && !Array.isArray(nextPlugins.entries)
      ? nextPlugins.entries as Record<string, unknown>
      : {};
    managedConfig.plugins = {
      ...existingPlugins,
      ...nextPlugins,
      entries: {
        ...existingPluginEntries,
        ...nextPluginEntries,
        ...(Object.prototype.hasOwnProperty.call(existingPluginEntries, 'feishu')
          ? { feishu: existingPluginEntries.feishu }
          : {}),
      },
    };

    const nextContent = `${JSON.stringify({
      ...existingConfigForMerge,
      ...managedConfig,
    }, null, 2)}\n`;
    if (process.env.WESIGHT_OPENCLAW_VERBOSE_LOGS === '1') {
      console.debug('[OpenClawConfigSync] managed model config snapshot:', {
        providers: (managedConfig.models as Record<string, unknown>)?.providers,
        primaryModel: ((managedConfig.agents as Record<string, unknown>)?.defaults as Record<string, unknown>)?.model,
      });
    }
    let currentContent = '';
    try {
      currentContent = fs.readFileSync(configPath, 'utf8');
    } catch {
      currentContent = '';
    }

    const configChanged = currentContent !== nextContent;

    if (configChanged) {
      try {
        ensureDir(path.dirname(configPath));
        const tmpPath = `${configPath}.tmp-${Date.now()}`;
        fs.writeFileSync(tmpPath, nextContent, 'utf8');
        fs.renameSync(tmpPath, configPath);
      } catch (error) {
        return {
          ok: false,
          changed: false,
          configPath,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    const sessionStoreChanged = this.syncManagedSessionStore(providerSelection);

    // Ensure exec-approvals.json has security=full + ask=off so the gateway
    // never triggers approval-pending for any command.
    this.ensureExecApprovalDefaults();

    // Sync AGENTS.md with skills routing prompt to the OpenClaw workspace directory.
    // This runs on every sync regardless of openclaw.json changes, because skills
    // may have been installed/enabled/disabled independently.
    const resolvedWorkspaceDir = workspaceDir || path.join(app.getPath('home'), '.openclaw', 'workspace');
    const agentsMdWarning = this.syncAgentsMd(resolvedWorkspaceDir, coworkConfig);

    // Sync per-agent workspace files (SOUL.md, IDENTITY.md, AGENTS.md) for non-main agents
    this.syncPerAgentWorkspaces(resolvedWorkspaceDir, coworkConfig);

    return {
      ok: true,
      changed: configChanged || sessionStoreChanged,
      configPath,
      ...(agentsMdWarning ? { agentsMdWarning } : {}),
    };
  }

  /**
   * Collect all secret values that should be injected as environment variables
   * into the OpenClaw gateway process. The openclaw.json file uses `${VAR}`
   * placeholders for these values so that no plaintext secrets are stored on disk.
   */
  collectSecretEnvVars(): Record<string, string> {
    const env: Record<string, string> = {};
    this.collectProviderApiKeyEnvVars(env);
    this.collectPersistedApiKeyPlaceholderEnvVars(env);

    if (this.getCoworkConfig().openclawConfigSource === ExternalAgentConfigSource.LocalCli) {
      if (this.shouldWriteFeishuChannel()) {
        this.collectFeishuSecretEnvVars(env);
      }
      return env;
    }

    // Legacy provider fallback keeps stale OpenClaw configs from failing
    // with MissingEnvVarError after the WeSight rename.
    env.LOBSTER_PROVIDER_API_KEY = 'legacy-unused';

    // MCP Bridge Secret — always set so stale openclaw.json with
    // ${LOBSTER_MCP_BRIDGE_SECRET} placeholder doesn't crash the gateway.
    const mcpBridgeCfg = this.getMcpBridgeConfig?.();
    env.LOBSTER_MCP_BRIDGE_SECRET = mcpBridgeCfg?.secret || 'unconfigured';

    // Telegram
    const tgConfig = this.getTelegramOpenClawConfig?.();
    if (tgConfig?.enabled && tgConfig.botToken) {
      env.LOBSTER_TG_BOT_TOKEN = tgConfig.botToken;
      if (tgConfig.webhookSecret) {
        env.LOBSTER_TG_WEBHOOK_SECRET = tgConfig.webhookSecret;
      }
    }

    // Discord
    const dcConfig = this.getDiscordOpenClawConfig?.();
    if (dcConfig?.enabled && dcConfig.botToken) {
      env.LOBSTER_DC_BOT_TOKEN = dcConfig.botToken;
    }

    // Feishu — per-instance secrets (must match sync() indexing: enabled instances only)
    this.collectFeishuSecretEnvVars(env);

    // DingTalk — per-instance secrets (must match sync() indexing: enabled instances only)
    const dingTalkInstances = this.getDingTalkInstances();
    const enabledDingTalk = dingTalkInstances.filter(i => i.enabled && i.clientSecret);
    for (let idx = 0; idx < enabledDingTalk.length; idx++) {
      if (idx === 0) {
        env.LOBSTER_DINGTALK_CLIENT_SECRET = enabledDingTalk[idx].clientSecret;
      } else {
        env[`LOBSTER_DINGTALK_CLIENT_SECRET_${idx}`] = enabledDingTalk[idx].clientSecret;
      }
    }
    // Gateway token is shared (not per-instance)
    const gatewayToken = this.engineManager.getGatewayToken();
    if (gatewayToken) {
      env.LOBSTER_DINGTALK_GW_TOKEN = gatewayToken;
    }

    // QQ — per-instance secrets (must match sync() indexing: enabled instances only)
    const qqInstances = this.getQQInstances();
    const enabledQQ = qqInstances.filter(i => i.enabled && i.appSecret);
    for (let idx = 0; idx < enabledQQ.length; idx++) {
      if (idx === 0) {
        env.LOBSTER_QQ_CLIENT_SECRET = enabledQQ[idx].appSecret;
      } else {
        env[`LOBSTER_QQ_CLIENT_SECRET_${idx}`] = enabledQQ[idx].appSecret;
      }
    }

    // WeCom
    const wecomConfig = this.getWecomConfig();
    if (wecomConfig?.enabled && wecomConfig.secret) {
      env.LOBSTER_WECOM_SECRET = wecomConfig.secret;
    }

    // POPO
    const popoConfig = this.getPopoConfig();
    if (popoConfig?.enabled && popoConfig.appSecret) {
      env.LOBSTER_POPO_APP_SECRET = popoConfig.appSecret;
    }
    if (popoConfig?.enabled && popoConfig.token) {
      env.LOBSTER_POPO_TOKEN = popoConfig.token;
    } else if (popoConfig?.enabled) {
      // Provide non-empty fallback so stale openclaw.json files that still
      // contain ${LOBSTER_POPO_TOKEN} from a previous webhook config
      // don't crash the gateway with MissingEnvVarError.
      env.LOBSTER_POPO_TOKEN = 'unconfigured';
    }

    // NIM
    const nimConfig = this.getNimConfig();
    if (nimConfig?.enabled && nimConfig.token) {
      env.LOBSTER_NIM_TOKEN = nimConfig.token;
    }

    return env;
  }

  private collectProviderApiKeyEnvVars(env: Record<string, string>): void {
    // Provider API Keys — one per configured provider so switching models
    // never changes env vars and avoids gateway process restarts.
    const allApiKeys = resolveAllProviderApiKeys();
    for (const [envSuffix, apiKey] of Object.entries(allApiKeys)) {
      setApiKeyEnv(env, envSuffix, apiKey);
    }
    for (const provider of resolveAllEnabledProviderConfigs()) {
      const envSuffix = normalizeEnvSuffix(provider.providerName);
      const envName = `WESIGHT_APIKEY_${envSuffix}`;
      if (!env[envName]) {
        setApiKeyEnv(env, envSuffix, provider.apiKey?.trim() || 'sk-wesight-local');
      }
      const legacyEnvName = `LOBSTER_APIKEY_${envSuffix}`;
      if (!env[legacyEnvName]) {
        env[legacyEnvName] = env[envName];
      }
    }
  }

  private collectPersistedApiKeyPlaceholderEnvVars(env: Record<string, string>): void {
    try {
      const persistedConfig = fs.readFileSync(this.engineManager.getConfigPath(), 'utf8');
      for (const match of persistedConfig.matchAll(API_KEY_PLACEHOLDER_PATTERN)) {
        const envName = match[1];
        if (envName && !env[envName]) {
          const processValue = process.env[envName]?.trim();
          const aliasValue = readApiKeyEnvAlias(env, envName);
          env[envName] = processValue || aliasValue || 'sk-wesight-local';
        }
      }
    } catch {
      // The config may not exist yet during first-run preparation.
    }
  }

  /**
   * Bootstrap ~/.openclaw/exec-approvals.json only when the user has no
   * main-agent approval policy yet. Existing user policies are preserved.
   */
  private ensureExecApprovalDefaults(): void {
    const filePath = path.join(app.getPath('home'), '.openclaw', 'exec-approvals.json');

    type AgentEntry = { security?: string; ask?: string; [key: string]: unknown };
    type ApprovalsFile = { version: number; agents?: Record<string, AgentEntry>; [key: string]: unknown };

    let file: ApprovalsFile;
    try {
      if (fs.existsSync(filePath)) {
        file = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ApprovalsFile;
        if (file?.version !== 1) file = { version: 1 };
      } else {
        file = { version: 1 };
      }
    } catch {
      file = { version: 1 };
    }

    if (!file.agents) file.agents = {};
    if (file.agents.main) return;
    file.agents.main = {};
    const agent = file.agents.main;

    agent.security = 'full';
    agent.ask = 'off';

    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.atomicWriteFile(filePath, `${JSON.stringify(file, null, 2)}\n`);
      console.log('[OpenClawConfigSync] bootstrapped exec-approvals for main agent');
    } catch (error) {
      console.warn('[OpenClawConfigSync] failed to write exec-approvals.json:', error);
    }
  }

  private syncManagedSessionStore(selection: OpenClawProviderSelection): boolean {
    const shouldMigrateManagedModelRefs = !(
      selection.providerId === 'lobster' && selection.sessionModelId === selection.legacyModelId
    );

    const sessionStorePath = path.join(
      this.engineManager.getStateDir(),
      'agents',
      'main',
      'sessions',
      'sessions.json',
    );

    let storeContent = '';
    try {
      storeContent = fs.readFileSync(sessionStorePath, 'utf8');
    } catch {
      return false;
    }

    let sessionStore: Record<string, unknown>;
    try {
      sessionStore = JSON.parse(storeContent) as Record<string, unknown>;
    } catch {
      return false;
    }

    let changed = false;
    for (const [sessionKey, rawEntry] of Object.entries(sessionStore)) {
      if (!rawEntry || typeof rawEntry !== 'object') {
        continue;
      }

      const entry = rawEntry as Record<string, unknown>;
      if (parseChannelSessionKey(sessionKey) !== null) {
        // Channel (IM) sessions: set execSecurity to 'full' as a safety net
        // so the gateway skips any approval flow for IM commands.
        const execSecurity = typeof entry.execSecurity === 'string' ? entry.execSecurity.trim() : '';
        if (execSecurity !== 'full') {
          entry.execSecurity = 'full';
          changed = true;
        }
        if (sessionSnapshotContainsDisabledManagedSkill(entry)) {
          delete entry.skillsSnapshot;
          changed = true;
        }
      }

      if (!shouldMigrateManagedModelRefs || !(/^agent:[^:]+:(?:wesight|lobsterai):/.test(sessionKey))) {
        continue;
      }

      const entryProvider = typeof entry.modelProvider === 'string' ? entry.modelProvider.trim() : '';
      const entryModel = typeof entry.model === 'string' ? entry.model.trim() : '';
      if (entryProvider !== 'lobster' || entryModel !== selection.legacyModelId) {
        continue;
      }

      entry.modelProvider = selection.providerId;
      entry.model = selection.sessionModelId;
      const systemPromptReport = entry.systemPromptReport;
      if (systemPromptReport && typeof systemPromptReport === 'object') {
        const report = systemPromptReport as Record<string, unknown>;
        if (typeof report.provider === 'string' && report.provider.trim() === 'lobster') {
          report.provider = selection.providerId;
        }
        if (typeof report.model === 'string' && report.model.trim() === selection.legacyModelId) {
          report.model = selection.sessionModelId;
        }
      }
      changed = true;
    }

    if (!changed) {
      return false;
    }

    try {
      this.atomicWriteFile(sessionStorePath, `${JSON.stringify(sessionStore, null, 2)}\n`);
      return true;
    } catch (error) {
      console.warn(
        '[OpenClawConfigSync] Failed to update managed session store:',
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  /**
   * Resolve the WeSight SKILLs installation directory for OpenClaw's
   * `skills.load.extraDirs` configuration.
   */
  private resolveSkillsExtraDirs(): string[] {
    const userDataSkillsDir = path.join(app.getPath('userData'), 'SKILLs');
    try {
      if (fs.statSync(userDataSkillsDir).isDirectory()) {
        return [userDataSkillsDir];
      }
    } catch (err: unknown) {
      // ENOENT is expected on fresh installs before any skills sync.
      if (err && typeof err === 'object' && 'code' in err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[OpenClawConfigSync] Failed to stat SKILLs directory:', err);
      }
    }
    return [];
  }

  /**
   * Build per-skill `enabled` overrides from the WeSight SkillManager state,
   * so that skills disabled in the WeSight UI are also hidden from OpenClaw.
   */
  private buildSkillEntries(): Record<string, { enabled: boolean }> {
    const skills = this.getSkillsList?.() ?? [];
    const entries: Record<string, { enabled: boolean }> = {};
    for (const skill of skills) {
      entries[skill.id] = { enabled: skill.enabled };
    }
    return entries;
  }

  /**
   * Sync AGENTS.md to the OpenClaw workspace directory.
   * Embeds the skills routing prompt and system prompt so that OpenClaw's
   * native runtime can discover and invoke WeSight skills.
   */
  private syncAgentsMd(workspaceDir: string, coworkConfig: CoworkConfig): string | undefined {
    try {
      ensureDir(workspaceDir);
      const agentsMdPath = path.join(workspaceDir, 'AGENTS.md');

      // Build the managed section
      const sections: string[] = [];

      // Add system prompt if configured; strip managed markers to prevent content corruption.
      const systemPrompt = stripManagedAgentsMarkers((coworkConfig.systemPrompt || '').trim());
      if (systemPrompt) {
        sections.push(`## System Prompt\n\n${systemPrompt}`);
      }
      const systemPromptIncludesWebSearchPolicy = /\bweb_search\b/.test(systemPrompt);

      // Skills are now loaded by OpenClaw natively via skills.load.extraDirs
      // in openclaw.json, so we no longer embed the skills routing prompt here.

      if (!systemPromptIncludesWebSearchPolicy) {
        sections.push(MANAGED_WEB_SEARCH_POLICY_PROMPT);
      }
      sections.push(MANAGED_EXEC_SAFETY_PROMPT);
      sections.push(MANAGED_MEMORY_POLICY_PROMPT);

      // Keep scheduled-task policy after skills so native channel sessions
      // treat it as the final app-managed override for reminder handling.
      const scheduledTaskPrompt = stripManagedAgentsMarkers(buildScheduledTaskEnginePrompt('openclaw'));
      if (scheduledTaskPrompt) {
        sections.push(scheduledTaskPrompt);
      }

      // Read existing file once to avoid TOCTOU issues
      let existingContent = '';
      try {
        existingContent = fs.readFileSync(agentsMdPath, 'utf8');
      } catch {
        // File doesn't exist yet.
      }

      // Extract user content, preserving everything before the first managed marker.
      const markerIdx = ALL_MANAGED_AGENTS_MARKERS
        .map((marker) => existingContent.indexOf(marker))
        .filter((idx) => idx >= 0)
        .sort((a, b) => a - b)[0] ?? -1;
      const userContent = markerIdx >= 0
        ? existingContent.slice(0, markerIdx).trimEnd()
        : existingContent.trimEnd();
      const preservedUserContent = userContent
        ? normalizeOpenClawAgentsTemplate(userContent)
        : readBundledOpenClawAgentsTemplate();

      if (sections.length === 0) {
        // No managed content — remove the managed section if present,
        // but preserve user content.
        if (markerIdx >= 0) {
          if (preservedUserContent) {
            const cleaned = preservedUserContent + '\n';
            if (existingContent !== cleaned) {
              this.atomicWriteFile(agentsMdPath, cleaned);
            }
          } else {
            try { fs.unlinkSync(agentsMdPath); } catch { /* already gone */ }
          }
        }
        return;
      }

      const managedContent = `${MANAGED_AGENTS_MARKER}\n\n${sections.join('\n\n')}`;
      const nextContent = preservedUserContent
        ? `${preservedUserContent}\n\n${managedContent}\n`
        : `${managedContent}\n`;

      // Only write if content actually changed
      if (existingContent === nextContent) return;

      this.atomicWriteFile(agentsMdPath, nextContent);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn('[OpenClawConfigSync] Failed to sync AGENTS.md:', msg);
      return msg;
    }
  }

  /**
   * Build the `agents.list` config array for openclaw.json.
   *
   * The main agent uses the user's configured workspace directory (via
   * `agents.defaults.workspace`).  Non-main agents omit `workspace` so
   * OpenClaw falls back to its default: `{STATE_DIR}/workspace-{agentId}/`.
   * This keeps custom agent workspaces under the openclaw state directory
   * rather than coupling them to the user's working directory.
   *
   * Per-agent `identity` (name, emoji) is set from the agent database so
   * OpenClaw picks it up natively.
   */
  private buildAgentsList(): { list?: Array<Record<string, unknown>> } {
    const agents = this.getAgents?.() ?? [];

    const list: Array<Record<string, unknown>> = [
      {
        id: 'main',
        default: true,
      },
    ];

    for (const agent of agents) {
      if (agent.id === 'main' || !agent.enabled) continue;

      list.push({
        id: agent.id,
        // Omit `workspace` — OpenClaw defaults to {STATE_DIR}/workspace-{agentId}/
        // which keeps agent workspaces decoupled from the user's working directory.
        ...(agent.name || agent.icon ? {
          identity: {
            ...(agent.name ? { name: agent.name } : {}),
            ...(agent.icon ? { emoji: agent.icon } : {}),
          },
        } : {}),
        // Per-agent skill whitelist: only when skillIds is non-empty.
        // OpenClaw's resolveAgentSkillsFilter() uses this to filter available skills.
        ...(agent.skillIds && agent.skillIds.length > 0 ? { skills: agent.skillIds } : {}),
      });
    }

    return list.length > 0 ? { list } : {};
  }

  /**
   * Build the `bindings` config array for openclaw.json.
   *
   * Each IM platform can be independently bound to a different agent via
   * `IMSettings.platformAgentBindings`.  Only channels with an explicit
   * non-main binding produce an entry.
   */
  private buildBindings(): { bindings?: Array<Record<string, unknown>> } {
    const imSettings = this.getIMSettings?.();
    const platformBindings = imSettings?.platformAgentBindings;
    if (!platformBindings || Object.keys(platformBindings).length === 0) return {};

    const agents = this.getAgents?.() ?? [];

    const bindings: Array<Record<string, unknown>> = [];
    const normalizeBindingAgentId = (value: string | undefined): string | null => {
      if (!value || value === 'main' || value.startsWith('team:')) return null;
      return value.startsWith('agent:') ? value.slice('agent:'.length) || null : value;
    };

    // Handle per-instance bindings for multi-instance platforms
    const multiInstanceChannels: Record<string, { channel: string; getInstances: () => Array<{ instanceId: string; enabled: boolean }> }> = {
      dingtalk: { channel: 'dingtalk', getInstances: () => this.getDingTalkInstances() },
      feishu: {
        channel: 'feishu',
        getInstances: () => this.isFeishuManagedByOpenClaw() ? this.getFeishuInstances() : [],
      },
      qq: { channel: 'qqbot', getInstances: () => this.getQQInstances() },
    };

    for (const [platform, { channel, getInstances }] of Object.entries(multiInstanceChannels)) {
      try {
        const instances = getInstances();
        for (const inst of instances) {
          if (!inst.enabled) continue;
          // Check for per-instance binding: `platform:instanceId`
          const bindingKey = `${platform}:${inst.instanceId}`;
          const agentId = normalizeBindingAgentId(platformBindings[bindingKey]);
          if (!agentId) continue;
          const targetAgent = agents.find((a) => a.id === agentId && a.enabled);
          if (!targetAgent) continue;
          bindings.push({ agentId, match: { channel, accountId: inst.instanceId.slice(0, 8) } });
        }
        // Also check legacy platform-level binding
        const platformAgentId = normalizeBindingAgentId(platformBindings[platform]);
        if (platformAgentId) {
          const targetAgent = agents.find((a) => a.id === platformAgentId && a.enabled);
          if (targetAgent && instances.some(i => i.enabled)) {
            bindings.push({ agentId: platformAgentId, match: { channel } });
          }
        }
      } catch {
        // Skip platforms that fail to load config
      }
    }

    // Handle single-instance platforms
    const weixinOwnedByOpenClaw = this.getIMSettings?.()?.weixinOwnership === WeixinOwnership.LocalOpenClaw;
    const singleInstanceChannels: Array<{ getter: () => { enabled: boolean } | null; channel: string; platform: string }> = [
      { getter: () => this.getTelegramOpenClawConfig?.() ?? null, channel: 'telegram', platform: 'telegram' },
      { getter: () => this.getDiscordOpenClawConfig?.() ?? null, channel: 'discord', platform: 'discord' },
      { getter: () => this.getWecomConfig(), channel: 'wecom', platform: 'wecom' },
      { getter: () => this.getPopoConfig(), channel: 'moltbot-popo', platform: 'popo' },
      { getter: () => this.getNimConfig(), channel: 'nim', platform: 'nim' },
      { getter: () => this.getNeteaseBeeChanConfig(), channel: 'netease-bee', platform: 'netease-bee' },
      ...(weixinOwnedByOpenClaw
        ? [{ getter: () => this.getWeixinConfig(), channel: 'openclaw-weixin', platform: 'weixin' }]
        : []),
    ];

    for (const { getter, channel, platform } of singleInstanceChannels) {
      const agentId = platformBindings[platform];
      const normalizedAgentId = normalizeBindingAgentId(agentId);
      if (!normalizedAgentId) continue;

      const targetAgent = agents.find((a) => a.id === normalizedAgentId && a.enabled);
      if (!targetAgent) continue;

      try {
        const cfg = getter();
        if (cfg?.enabled) {
          bindings.push({ agentId: normalizedAgentId, match: { channel } });
        }
      } catch {
        // Skip channels that fail to load config
      }
    }

    return bindings.length > 0 ? { bindings } : {};
  }

  /**
   * Sync workspace files (SOUL.md, IDENTITY.md, AGENTS.md) for each non-main agent.
   * The main agent's workspace is synced by `syncAgentsMd`. Non-main agents
   * get their own workspace directories under the openclaw state directory.
   */
  private syncPerAgentWorkspaces(_mainWorkspaceDir: string, coworkConfig: CoworkConfig): void {
    const agents = this.getAgents?.() ?? [];
    // Use the openclaw state directory as base, matching OpenClaw's own fallback
    // logic: {STATE_DIR}/workspace-{agentId}/
    const stateDir = this.engineManager.getStateDir();

    for (const agent of agents) {
      if (agent.id === 'main' || !agent.enabled) continue;

      const agentWorkspace = path.join(stateDir, `workspace-${agent.id}`);
      try {
        ensureDir(agentWorkspace);

        // Sync SOUL.md — agent's system prompt
        const soulPath = path.join(agentWorkspace, 'SOUL.md');
        const soulContent = (agent.systemPrompt || '').trim();
        this.syncFileIfChanged(soulPath, soulContent ? `${soulContent}\n` : '');

        // Sync IDENTITY.md — agent's identity description
        const identityPath = path.join(agentWorkspace, 'IDENTITY.md');
        const identityContent = (agent.identity || '').trim();
        this.syncFileIfChanged(identityPath, identityContent ? `${identityContent}\n` : '');

        // Sync AGENTS.md for this agent (reuse same logic as main agent)
        this.syncAgentsMd(agentWorkspace, {
          ...coworkConfig,
          systemPrompt: agent.systemPrompt || '',
        });

        // Ensure memory directory exists
        const memoryDir = path.join(agentWorkspace, 'memory');
        ensureDir(memoryDir);

        // Ensure MEMORY.md exists
        const memoryPath = path.join(agentWorkspace, 'MEMORY.md');
        if (!fs.existsSync(memoryPath)) {
          fs.writeFileSync(memoryPath, '', 'utf8');
        }
      } catch (error) {
        console.warn(
          `[OpenClawConfigSync] Failed to sync workspace for agent ${agent.id}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  /** Write a file only if its content has changed. */
  private syncFileIfChanged(filePath: string, content: string): void {
    try {
      const existing = fs.readFileSync(filePath, 'utf8');
      if (existing === content) return;
    } catch {
      // File doesn't exist yet
    }
    if (content) {
      this.atomicWriteFile(filePath, content);
    } else {
      // Empty content — create empty file if it doesn't exist
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '', 'utf8');
      }
    }
  }

  /** Atomic file write via tmp + rename, consistent with openclaw.json writes. */
  private atomicWriteFile(filePath: string, content: string): void {
    const tmpPath = `${filePath}.tmp-${Date.now()}`;
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  /**
   * Write a minimal openclaw.json that lets the gateway start without any
   * model/provider configured.  The full config will be synced once the
   * user sets up a model in the UI.
   */
  private writeMinimalConfig(configPath: string, _reason: string): OpenClawConfigSyncResult {
    const minimalConfig: Record<string, unknown> = {
      gateway: {
        mode: 'local',
      },
      discovery: {
        mdns: {
          mode: 'off',
        },
      },
      // Don't enable plugins in minimal config — plugin loading via jiti happens
      // synchronously BEFORE the HTTP server binds, and can block gateway startup
      // for minutes on a fresh install.  Plugins will be enabled when the user
      // configures an API model and a full config sync runs.
    };

    const nextContent = `${JSON.stringify(minimalConfig, null, 2)}\n`;
    let currentContent = '';
    try {
      currentContent = fs.readFileSync(configPath, 'utf8');
    } catch {
      currentContent = '';
    }

    // If the file already has a meaningful config (from a previous sync or
    // user configuration), don't downgrade it to the minimal version.
    // Check for models (API configured), plugin entries (IM channels like
    // DingTalk/WeCom), or gateway.mode already set.
    if (currentContent && currentContent !== nextContent) {
      try {
        const existing = JSON.parse(currentContent);
        if (
          existing.models?.providers ||
          existing.plugins?.entries ||
          existing.gateway?.mode
        ) {
          // Already has a config with substance — keep it.
          return { ok: true, changed: false, configPath };
        }
      } catch {
        // Malformed JSON — overwrite with minimal config.
      }
    }

    if (currentContent === nextContent) {
      return { ok: true, changed: false, configPath };
    }

    try {
      ensureDir(path.dirname(configPath));
      const tmpPath = `${configPath}.tmp-${Date.now()}`;
      fs.writeFileSync(tmpPath, nextContent, 'utf8');
      fs.renameSync(tmpPath, configPath);
      return { ok: true, changed: true, configPath };
    } catch (error) {
      return {
        ok: false,
        changed: false,
        configPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
