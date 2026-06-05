import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  ClaudeCodePermissionMode,
  type CliCoworkAgentEngine,
  CoworkAgentEngine,
  ExternalAgentConfigSource,
  isClaudeCodePermissionMode,
  OpenCodePermissionMode,
  QwenCodePermissionMode,
} from '../../../shared/cowork/constants';
import type { CoworkSessionRuntimeSnapshot } from '../../../shared/cowork/runtimeSnapshot';
import type {
  CoworkMessage,
  CoworkMessageMetadata,
  CoworkStore,
} from '../../coworkStore';
import { t } from '../../i18n';
import { type ApiConfigOverride,resolveRawApiConfig } from '../claudeSettings';
import { getElectronNodeRuntimePath, getEnhancedEnvWithTmpdir } from '../coworkUtil';
import {
  applyLocalClaudeCodeEnvForPrintMode,
  buildClaudeCodeConfigDiagnostics,
  type LocalClaudeCodeEnvLoadResult,
} from '../externalAgentLocalEnv';
import type {
  ExternalAgentProvider,
  ExternalAgentProviderAppType,
} from '../externalAgentProviderStore';
import { normalizeOpenCodeCliEvent } from '../openCodeCliEvent';
import { buildOpenCodeRuntimeConfigContent } from '../openCodeConfig';
import { normalizeQwenCodeCliEvent } from '../qwenCodeCliEvent';
import { buildQwenCodeRuntimeEnv, qwenAuthTypeForCoworkConfig } from '../qwenCodeConfig';
import type {
  CoworkContinueOptions,
  CoworkRuntime,
  CoworkRuntimeEvents,
  CoworkStartOptions,
} from './types';

const LOCAL_HISTORY_MAX_MESSAGES = 24;
const LOCAL_HISTORY_MAX_TOTAL_CHARS = 32_000;
const LOCAL_HISTORY_MAX_MESSAGE_CHARS = 4_000;
const STREAMING_TEXT_MAX_CHARS = 120_000;
const STDERR_TAIL_MAX_CHARS = 24_000;
const CLI_STARTUP_TIMEOUT_MS = 30_000;
const CLAUDE_NO_CONTENT_NOTICE_MS = 8_000;
const CLAUDE_NO_CONTENT_TIMEOUT_MS = 120_000;
const CODEX_NO_JSON_NOTICE_MS = 12_000;
const CONTENT_TRUNCATED_HINT = '\n...[truncated to prevent memory pressure]';
const WINDOWS_HIDE_INIT_SCRIPT_NAME = 'external_cli_windows_hide_init.cjs';
const WINDOWS_HIDE_INIT_SCRIPT_CONTENT = [
  '\'use strict\';',
  '',
  'if (process.platform === \'win32\') {',
  '  const childProcess = require(\'child_process\');',
  '',
  '  const addWindowsHide = (options) => {',
  '    if (options == null) return { windowsHide: true };',
  '    if (typeof options !== \'object\') return options;',
  '    if (Object.prototype.hasOwnProperty.call(options, \'windowsHide\')) return options;',
  '    return { ...options, windowsHide: true };',
  '  };',
  '',
  '  const patch = (name, buildWrapper) => {',
  '    const original = childProcess[name];',
  '    if (typeof original !== \'function\') return;',
  '    childProcess[name] = buildWrapper(original);',
  '  };',
  '',
  '  patch(\'spawn\', (original) => function patchedSpawn(command, args, options) {',
  '    if (Array.isArray(args) || args === undefined) {',
  '      return original.call(this, command, args, addWindowsHide(options));',
  '    }',
  '    return original.call(this, command, addWindowsHide(args));',
  '  });',
  '',
  '  patch(\'spawnSync\', (original) => function patchedSpawnSync(command, args, options) {',
  '    if (Array.isArray(args) || args === undefined) {',
  '      return original.call(this, command, args, addWindowsHide(options));',
  '    }',
  '    return original.call(this, command, addWindowsHide(args));',
  '  });',
  '',
  '  patch(\'fork\', (original) => function patchedFork(modulePath, args, options) {',
  '    if (Array.isArray(args) || args === undefined) {',
  '      return original.call(this, modulePath, args, addWindowsHide(options));',
  '    }',
  '    return original.call(this, modulePath, addWindowsHide(args));',
  '  });',
  '',
  '  patch(\'exec\', (original) => function patchedExec(command, options, callback) {',
  '    if (typeof options === \'function\' || options === undefined) {',
  '      return original.call(this, command, addWindowsHide(undefined), options);',
  '    }',
  '    return original.call(this, command, addWindowsHide(options), callback);',
  '  });',
  '',
  '  patch(\'execFile\', (original) => function patchedExecFile(file, args, options, callback) {',
  '    if (Array.isArray(args) || args === undefined) {',
  '      if (typeof options === \'function\' || options === undefined) {',
  '        return original.call(this, file, args, addWindowsHide(undefined), options);',
  '      }',
  '      return original.call(this, file, args, addWindowsHide(options), callback);',
  '    }',
  '    if (typeof args === \'function\' || args === undefined) {',
  '      return original.call(this, file, addWindowsHide(undefined), args);',
  '    }',
  '    return original.call(this, file, addWindowsHide(args), options);',
  '  });',
  '}',
  '',
].join('\n');

const CodexCliEventType = {
  ThreadStarted: 'thread.started',
  Error: 'error',
  ItemStarted: 'item.started',
  ItemCompleted: 'item.completed',
  AgentMessageDelta: 'item.agent_message.delta',
  ResponseItem: 'response_item',
  EventMessage: 'event_msg',
  TurnFailed: 'turn.failed',
} as const;

const CodexCliItemType = {
  AgentMessage: 'agent_message',
  CommandExecution: 'command_execution',
  FileChange: 'file_change',
  ImageGenerationCall: 'image_generation_call',
  ImageGenerationEnd: 'image_generation_end',
} as const;

type ActiveCliSession = {
  child: ChildProcessWithoutNullStreams;
  sessionId: string;
  cliSessionId: string | null;
  initialMessageCount: number;
  assistantMessageId: string | null;
  assistantContent: string;
  stderrTail: string;
  cliErrorMessage: string | null;
  sawEvent: boolean;
  sawClaudeVisibleOutput: boolean;
  startupTimer: ReturnType<typeof setTimeout> | null;
  noContentNoticeTimer: ReturnType<typeof setTimeout> | null;
  noContentTimeoutTimer: ReturnType<typeof setTimeout> | null;
  imagePaths: string[];
  codexHomeDir: string | null;
  localClaudeConfig: LocalClaudeCodeEnvLoadResult | null;
  configSource: ExternalAgentConfigSource;
  codexGeneratedImageIds: Set<string>;
};

type ExternalCliRuntimeAdapterDeps = {
  engine: CliCoworkAgentEngine;
  store: CoworkStore;
  getCurrentProvider?: (appType: ExternalAgentProviderAppType) => ExternalAgentProvider | null;
};

type SpawnCommandSpec = {
  command: string;
  args: string[];
  source: string;
};

type AssistantOutputStats = {
  messageCount: number;
  chars: number;
  bytes: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

const truncateLargeContent = (content: string, maxChars: number): string => {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}${CONTENT_TRUNCATED_HINT}`;
};

const stringifyPayload = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const firstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
};

const ensureWindowsChildProcessHideInitScript = (): string | null => {
  if (process.platform !== 'win32') {
    return null;
  }

  try {
    const initDir = path.join(os.tmpdir(), 'wesight-cowork-bin');
    fs.mkdirSync(initDir, { recursive: true });
    const initScriptPath = path.join(initDir, WINDOWS_HIDE_INIT_SCRIPT_NAME);
    const existing = fs.existsSync(initScriptPath)
      ? fs.readFileSync(initScriptPath, 'utf8')
      : '';
    if (existing !== WINDOWS_HIDE_INIT_SCRIPT_CONTENT) {
      fs.writeFileSync(initScriptPath, WINDOWS_HIDE_INIT_SCRIPT_CONTENT, 'utf8');
    }
    return initScriptPath;
  } catch {
    return null;
  }
};

export const appendNodeRequireOption = (nodeOptions: string | undefined, scriptPath: string): string => {
  const quotedScriptPath = JSON.stringify(scriptPath);
  if (nodeOptions?.includes(scriptPath) || nodeOptions?.includes(quotedScriptPath)) {
    return nodeOptions;
  }
  return [nodeOptions?.trim(), `--require=${quotedScriptPath}`].filter(Boolean).join(' ');
};

const maskSecretForLog = (value: string | undefined): string => {
  const text = value?.trim() ?? '';
  if (!text) return '(not set)';
  if (text.length <= 10) return `<redacted:${text.length}>`;
  return `${text.slice(0, 5)}...${text.slice(-5)} (${text.length})`;
};

const looksLikePlaceholder = (value: string | undefined): boolean => {
  return /^\$\{[^}]+\}$/.test(value?.trim() ?? '');
};

const firstNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
};

const getApiOverrideFromRuntimeSnapshot = (
  snapshot?: CoworkSessionRuntimeSnapshot | null,
): ApiConfigOverride | undefined => {
  if (!snapshot || snapshot.configSource === ExternalAgentConfigSource.LocalCli) {
    return undefined;
  }
  if (!snapshot.modelId && !snapshot.providerKey && !snapshot.providerName) {
    return undefined;
  }
  return {
    modelId: snapshot.modelId,
    providerName: snapshot.providerKey || snapshot.providerName,
  };
};

export class ExternalCliRuntimeAdapter extends EventEmitter implements CoworkRuntime {
  private readonly engine: CliCoworkAgentEngine;
  private readonly store: CoworkStore;
  private readonly getCurrentProvider?: (appType: ExternalAgentProviderAppType) => ExternalAgentProvider | null;
  private readonly activeSessions = new Map<string, ActiveCliSession>();
  private readonly stoppedSessions = new Set<string>();

  constructor(deps: ExternalCliRuntimeAdapterDeps) {
    super();
    this.engine = deps.engine;
    this.store = deps.store;
    this.getCurrentProvider = deps.getCurrentProvider;
  }

  override on<U extends keyof CoworkRuntimeEvents>(
    event: U,
    listener: CoworkRuntimeEvents[U],
  ): this {
    return super.on(event, listener);
  }

  override off<U extends keyof CoworkRuntimeEvents>(
    event: U,
    listener: CoworkRuntimeEvents[U],
  ): this {
    return super.off(event, listener);
  }

  async startSession(sessionId: string, prompt: string, options: CoworkStartOptions = {}): Promise<void> {
    await this.runTurn(sessionId, prompt, options, !options.skipInitialUserMessage);
  }

  async continueSession(sessionId: string, prompt: string, options: CoworkContinueOptions = {}): Promise<void> {
    await this.runTurn(sessionId, prompt, options, true);
  }

  stopSession(sessionId: string): void {
    this.stoppedSessions.add(sessionId);
    const active = this.activeSessions.get(sessionId);
    if (active) {
      this.clearSessionTimers(active);
      active.child.kill('SIGTERM');
      this.cleanupImagePaths(active.imagePaths);
      this.cleanupCodexHomeDir(active.codexHomeDir);
      this.activeSessions.delete(sessionId);
    }
    this.store.updateSession(sessionId, { status: 'idle' });
    this.emit('sessionStopped', sessionId);
  }

  stopAllSessions(): void {
    for (const sessionId of Array.from(this.activeSessions.keys())) {
      this.stopSession(sessionId);
    }
  }

  respondToPermission(_requestId: string, _result: PermissionResult): void {
    // External CLI engines run in non-interactive mode. Their approval behavior
    // is controlled by the CLI config and flags.
  }

  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  getSessionConfirmationMode(_sessionId: string): 'modal' | 'text' | null {
    return null;
  }

  onSessionDeleted(sessionId: string): void {
    this.stopSession(sessionId);
    this.stoppedSessions.delete(sessionId);
  }

  private async runTurn(
    sessionId: string,
    prompt: string,
    options: CoworkStartOptions | CoworkContinueOptions,
    shouldAddUserMessage: boolean,
  ): Promise<void> {
    if (this.activeSessions.has(sessionId)) {
      throw new Error('This session is already running.');
    }
    this.stoppedSessions.delete(sessionId);
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    this.store.updateSession(sessionId, { status: 'running' });

    if (shouldAddUserMessage) {
      const metadata: Record<string, unknown> = { ...(options.messageMetadata ?? {}) };
      if (options.skillIds?.length) {
        metadata.skillIds = options.skillIds;
      }
      if (options.imageAttachments?.length) {
        metadata.imageAttachments = options.imageAttachments;
      }
      const message = this.store.addMessage(sessionId, {
        type: 'user',
        content: prompt,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
      this.emit('message', sessionId, message);
    }

    const currentSession = this.store.getSession(sessionId);
    const cwd = path.resolve(currentSession?.cwd || this.store.getConfig().workingDirectory || os.homedir());
    if (!fs.existsSync(cwd)) {
      this.handleError(sessionId, `Working directory does not exist: ${cwd}`);
      return;
    }
    const systemPrompt = options.systemPrompt ?? currentSession?.systemPrompt ?? '';
    const claudeCodePermissionMode = this.resolveClaudeCodePermissionMode(options.runtimeSnapshot);
    const effectivePrompt = this.buildEffectivePrompt(sessionId, prompt, systemPrompt, claudeCodePermissionMode);
    const imagePaths = this.materializeImageAttachments(sessionId, options.imageAttachments);
    const apiConfigOverride = getApiOverrideFromRuntimeSnapshot(options.runtimeSnapshot);
    const env = await getEnhancedEnvWithTmpdir(cwd, 'local', {
      injectCoworkModelConfig: this.shouldInjectCoworkModelConfig(),
      apiConfigOverride,
      proxyProbeUrl: this.engine === CoworkAgentEngine.Codex ? 'https://api.openai.com' : undefined,
    });
    let localClaudeConfig: LocalClaudeCodeEnvLoadResult | null = null;
    const configSource = this.getConfigSource();
    const selectedProvider = this.getSelectedProviderForLocalCli();
    if (this.engine === CoworkAgentEngine.ClaudeCode && configSource === ExternalAgentConfigSource.LocalCli) {
      localClaudeConfig = applyLocalClaudeCodeEnvForPrintMode(env, selectedProvider);
    }
    if (this.engine === CoworkAgentEngine.ClaudeCode && process.platform === 'win32') {
      const windowsHideInitScript = ensureWindowsChildProcessHideInitScript();
      if (windowsHideInitScript) {
        env.NODE_OPTIONS = appendNodeRequireOption(env.NODE_OPTIONS, windowsHideInitScript);
      }
    }
    if (this.engine === CoworkAgentEngine.OpenCode && configSource === ExternalAgentConfigSource.WesightModel) {
      this.applyOpenCodeRuntimeConfig(env, apiConfigOverride);
    }
    if (this.engine === CoworkAgentEngine.QwenCode && configSource === ExternalAgentConfigSource.WesightModel) {
      this.applyQwenCodeRuntimeConfig(env, apiConfigOverride);
    }
    const command = this.getCommandName();
    const codexHomeDir = this.prepareCodexHomeForExecMode(env, selectedProvider, apiConfigOverride);
    const args = this.buildCommandArgs(
      cwd,
      effectivePrompt,
      imagePaths,
      selectedProvider,
      currentSession?.title ?? session.title,
      currentSession?.claudeSessionId ?? null,
      apiConfigOverride,
      claudeCodePermissionMode,
    );
    const spawnSpec = this.resolveSpawnCommandSpec(command, args, env);
    if (this.engine === CoworkAgentEngine.ClaudeCode) {
      console.log('[ExternalCliRuntimeAdapter] starting Claude Code CLI.', {
        command: spawnSpec.command,
        cwd,
        configSource,
        localConfig: this.describeLocalClaudeConfig(localClaudeConfig, configSource),
        permissionMode: claudeCodePermissionMode,
        baseUrl: env.ANTHROPIC_BASE_URL || '(not set)',
        model: env.ANTHROPIC_MODEL || '(not set)',
        defaultSonnetModel: env.ANTHROPIC_DEFAULT_SONNET_MODEL || '(not set)',
        smallFastModel: env.ANTHROPIC_SMALL_FAST_MODEL || '(not set)',
        anthropicApiKey: maskSecretForLog(env.ANTHROPIC_API_KEY),
        anthropicAuthToken: maskSecretForLog(env.ANTHROPIC_AUTH_TOKEN),
        apiKeyLooksLikePlaceholder: looksLikePlaceholder(env.ANTHROPIC_API_KEY),
        authTokenLooksLikePlaceholder: looksLikePlaceholder(env.ANTHROPIC_AUTH_TOKEN),
        nodeOptionsHasWindowsHidePreload: Boolean(env.NODE_OPTIONS?.includes(WINDOWS_HIDE_INIT_SCRIPT_NAME)),
        argsWithoutPrompt: spawnSpec.args.slice(0, -1),
        promptChars: effectivePrompt.length,
      });
      console.log(
        '[ExternalCliRuntimeAdapter] Claude Code config diagnostics.',
        buildClaudeCodeConfigDiagnostics(env, selectedProvider),
      );
    }
    if (this.engine === CoworkAgentEngine.Codex) {
      console.log('[ExternalCliRuntimeAdapter] starting Codex CLI.', {
        command: spawnSpec.command,
        cwd,
        configSource,
        usesTemporaryCodexHome: Boolean(codexHomeDir),
        proxyEnv: this.summarizeProxyEnv(env),
        spawnSource: spawnSpec.source,
        argsWithoutPrompt: spawnSpec.args.slice(0, -1),
        promptChars: effectivePrompt.length,
      });
    }
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: process.platform === 'win32',
    });

    const active: ActiveCliSession = {
      child,
      sessionId,
      cliSessionId: currentSession?.claudeSessionId ?? null,
      initialMessageCount: currentSession?.messages.length ?? 0,
      assistantMessageId: null,
      assistantContent: '',
      stderrTail: '',
      cliErrorMessage: null,
      sawEvent: false,
      sawClaudeVisibleOutput: false,
      startupTimer: null,
      noContentNoticeTimer: null,
      noContentTimeoutTimer: null,
      imagePaths,
      codexHomeDir,
      localClaudeConfig,
      configSource,
      codexGeneratedImageIds: new Set(),
    };
    active.startupTimer = setTimeout(() => {
      if (active.sawEvent) return;
      active.stderrTail = this.appendStderrTail(active.stderrTail, 'CLI startup timed out before producing output.');
      child.kill('SIGTERM');
    }, CLI_STARTUP_TIMEOUT_MS);
    this.activeSessions.set(sessionId, active);
    if (this.engine === CoworkAgentEngine.ClaudeCode) {
      this.scheduleClaudeNoContentDiagnostics(active);
    }
    if (this.engine === CoworkAgentEngine.Codex) {
      this.scheduleCodexNoJsonDiagnostics(active);
    }

    await new Promise<void>((resolve) => {
      let stdoutBuffer = '';
      let spawnFailed = false;

      child.stdout.on('data', (chunk: Buffer) => {
        active.sawEvent = true;
        stdoutBuffer += chunk.toString('utf8');
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? '';
        for (const line of lines) {
          this.handleOutputLine(active, line);
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        active.stderrTail = this.appendStderrTail(active.stderrTail, chunk.toString('utf8'));
      });

      child.on('error', (error) => {
        spawnFailed = true;
        this.clearSessionTimers(active);
        this.cleanupImagePaths(active.imagePaths);
        this.cleanupCodexHomeDir(active.codexHomeDir);
        this.activeSessions.delete(sessionId);
        this.handleError(sessionId, `${this.getEngineDisplayName()} failed to start: ${error.message}`);
        resolve();
      });
      child.on('close', async (code, signal) => {
        if (spawnFailed) {
          return;
        }
        if (stdoutBuffer.trim()) {
          this.handleOutputLine(active, stdoutBuffer);
        }
        this.clearSessionTimers(active);
        this.finalizeAssistant(active);
        this.cleanupImagePaths(active.imagePaths);
        this.cleanupCodexHomeDir(active.codexHomeDir);
        this.activeSessions.delete(sessionId);
        this.logCliProcessFinished(active, code, signal);

        if (this.stoppedSessions.has(sessionId)) {
          this.store.updateSession(sessionId, { status: 'idle' });
          this.emit('sessionStopped', sessionId);
          resolve();
          return;
        }

        if (code === 0) {
          const latestSession = this.store.getSession(sessionId);
          if (latestSession?.status === 'error') {
            resolve();
            return;
          }
          if (this.engine === CoworkAgentEngine.Codex) {
            this.addCodexGeneratedImagesFromDirectory(active);
          }
          if (this.engine === CoworkAgentEngine.ClaudeCode && !this.hasVisibleOutput(active)) {
            this.replaceAssistant(active, t('externalCliClaudeNoVisibleOutput'), true);
          }
          if (this.engine === CoworkAgentEngine.Codex && !this.hasVisibleOutput(active)) {
            this.replaceAssistant(active, t('externalCliCodexNoVisibleOutput'), true);
          }
          this.store.updateSession(sessionId, { status: 'completed', claudeSessionId: active.cliSessionId });
          this.applyTurnMemoryUpdates(sessionId);
          this.emit('complete', sessionId, active.cliSessionId);
          resolve();
          return;
        }

        if (this.shouldRetryCodexWithoutResume(active, code)) {
          console.warn('[ExternalCliRuntimeAdapter] Codex resume failed because the local rollout was missing; retrying with a fresh thread.');
          this.store.updateSession(sessionId, {
            status: 'running',
            claudeSessionId: null,
          });
          await this.runTurn(sessionId, prompt, options, false);
          resolve();
          return;
        }

        const detail = [
          `${this.getEngineDisplayName()} exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}.`,
          active.cliErrorMessage ? `CLI error:\n${active.cliErrorMessage}` : '',
          active.stderrTail.trim() ? `Process stderr:\n${active.stderrTail.trim()}` : '',
        ].filter(Boolean).join('\n\n');
        this.handleError(sessionId, detail);
        resolve();
      });
    });
  }

  private shouldRetryCodexWithoutResume(active: ActiveCliSession, code: number | null): boolean {
    if (this.engine !== CoworkAgentEngine.Codex) return false;
    if (code === 0) return false;
    if (!active.cliSessionId) return false;
    if (active.assistantMessageId) return false;
    const stderr = active.stderrTail.toLowerCase();
    return stderr.includes('thread/resume')
      && (
        stderr.includes('no rollout found')
        || stderr.includes('thread/resume failed')
      );
  }

  private buildCommandArgs(
    cwd: string,
    prompt: string,
    imagePaths: string[],
    selectedProvider: ExternalAgentProvider | null,
    sessionTitle: string,
    cliSessionId: string | null,
    apiConfigOverride?: ApiConfigOverride,
    claudeCodePermissionMode: ClaudeCodePermissionMode = ClaudeCodePermissionMode.BypassPermissions,
  ): string[] {
    if (this.engine === CoworkAgentEngine.ClaudeCode) {
      const args = [
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--permission-mode',
        claudeCodePermissionMode,
      ];
      args.push(prompt);
      return args;
    }

    if (this.engine === CoworkAgentEngine.OpenCode) {
      const args = [
        'run',
        '--format',
        'json',
        '--dir',
        cwd,
      ];
      if (this.store.getConfig().opencodePermissionMode === OpenCodePermissionMode.Auto) {
        args.push('--dangerously-skip-permissions');
      }
      if (sessionTitle.trim()) {
        args.push('--title', sessionTitle.trim());
      }
      if (cliSessionId) {
        args.push('--session', cliSessionId);
      }
      const model = selectedProvider?.summary.model?.trim();
      if (model) {
        args.push('--model', model);
      }
      for (const imagePath of imagePaths) {
        args.push('--file', imagePath);
      }
      args.push(prompt);
      return args;
    }

    if (this.engine === CoworkAgentEngine.QwenCode) {
      const promptWithFiles = imagePaths.length > 0
        ? `${prompt}\n\n${imagePaths.map((imagePath) => `@${imagePath}`).join('\n')}`
        : prompt;
      const args = [
        '--bare',
        '--output-format',
        'stream-json',
        '--include-partial-messages',
      ];
      if (this.store.getConfig().qwenCodePermissionMode === QwenCodePermissionMode.Auto) {
        args.push('--yolo');
      } else {
        args.push('--approval-mode', 'plan');
      }
      if (cliSessionId) {
        args.push('--resume', cliSessionId);
      }
      if (this.getConfigSource() === ExternalAgentConfigSource.WesightModel) {
        const resolved = resolveRawApiConfig(apiConfigOverride);
        if (resolved.config) {
          args.push('--auth-type', qwenAuthTypeForCoworkConfig(resolved.config));
          args.push('--model', resolved.config.model);
        }
      } else {
        const model = selectedProvider?.summary.model?.trim();
        if (model) {
          args.push('--model', model);
        }
      }
      args.push('-p', promptWithFiles);
      return args;
    }

    if (this.engine === CoworkAgentEngine.GrokBuild) {
      const promptWithFiles = imagePaths.length > 0
        ? `${prompt}\n\nAttached local files:\n${imagePaths.map((imagePath) => imagePath).join('\n')}`
        : prompt;
      const args = [
        '--cwd',
        cwd,
        '--output-format',
        'streaming-json',
        '--no-auto-update',
        '--always-approve',
        '-p',
        promptWithFiles,
      ];
      const model = selectedProvider?.summary.model?.trim();
      if (model) {
        args.splice(6, 0, '--model', model);
      }
      return args;
    }

    if (cliSessionId) {
      const resumeArgs = [
        'exec',
        'resume',
        '--json',
        '--skip-git-repo-check',
        '-c',
        'approval_policy="never"',
        '-c',
        'sandbox_mode="workspace-write"',
      ];
      resumeArgs.push(...this.buildCodexProviderOverrideArgs(selectedProvider));
      for (const imagePath of imagePaths) {
        resumeArgs.push('--image', imagePath);
      }
      resumeArgs.push(cliSessionId, prompt);
      return resumeArgs;
    }

    const args = [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--cd',
      cwd,
      '--sandbox',
      'workspace-write',
      '-c',
      'approval_policy="never"',
    ];
    args.push(...this.buildCodexProviderOverrideArgs(selectedProvider));
    for (const imagePath of imagePaths) {
      args.push('--image', imagePath);
    }
    args.push(prompt);
    return args;
  }

  private shouldInjectCoworkModelConfig(): boolean {
    if (this.engine === CoworkAgentEngine.GrokBuild) {
      return false;
    }
    return this.getConfigSource() !== ExternalAgentConfigSource.LocalCli;
  }

  private getConfigSource(): ExternalAgentConfigSource {
    const config = this.store.getConfig();
    if (this.engine === CoworkAgentEngine.ClaudeCode) {
      return config.claudeCodeConfigSource;
    }
    if (this.engine === CoworkAgentEngine.Codex) {
      return config.codexConfigSource;
    }
    if (this.engine === CoworkAgentEngine.OpenCode) {
      return config.opencodeConfigSource;
    }
    if (this.engine === CoworkAgentEngine.QwenCode) {
      return config.qwenCodeConfigSource;
    }
    if (this.engine === CoworkAgentEngine.GrokBuild) {
      return ExternalAgentConfigSource.LocalCli;
    }
    return ExternalAgentConfigSource.WesightModel;
  }

  private getSelectedProviderForLocalCli(): ExternalAgentProvider | null {
    if (this.getConfigSource() !== ExternalAgentConfigSource.LocalCli) {
      return null;
    }
    if (this.engine === CoworkAgentEngine.ClaudeCode) {
      return this.getCurrentProvider?.('claude') ?? null;
    }
    if (this.engine === CoworkAgentEngine.Codex) {
      return null;
    }
    if (this.engine === CoworkAgentEngine.OpenCode) {
      return this.getCurrentProvider?.('opencode') ?? null;
    }
    if (this.engine === CoworkAgentEngine.QwenCode) {
      return this.getCurrentProvider?.('qwen') ?? null;
    }
    if (this.engine === CoworkAgentEngine.GrokBuild) {
      return this.getCurrentProvider?.('grok') ?? null;
    }
    return null;
  }

  private applyOpenCodeRuntimeConfig(
    env: Record<string, string | undefined>,
    apiConfigOverride?: ApiConfigOverride,
  ): void {
    const resolved = resolveRawApiConfig(apiConfigOverride);
    if (!resolved.config) return;
    env.OPENCODE_CONFIG_CONTENT = buildOpenCodeRuntimeConfigContent(
      resolved.config,
      resolved.providerMetadata?.providerName,
    );
  }

  private applyQwenCodeRuntimeConfig(
    env: Record<string, string | undefined>,
    apiConfigOverride?: ApiConfigOverride,
  ): void {
    const resolved = resolveRawApiConfig(apiConfigOverride);
    if (!resolved.config) return;
    Object.assign(env, buildQwenCodeRuntimeEnv(resolved.config));
  }

  private getCommandName(): string {
    if (this.engine === CoworkAgentEngine.ClaudeCode) return 'claude';
    if (this.engine === CoworkAgentEngine.Codex) return 'codex';
    if (this.engine === CoworkAgentEngine.OpenCode) return 'opencode';
    if (this.engine === CoworkAgentEngine.GrokBuild) return 'grok';
    return 'qwen';
  }

  private resolveSpawnCommandSpec(
    command: string,
    args: string[],
    env: Record<string, string | undefined>,
  ): SpawnCommandSpec {
    if (this.engine !== CoworkAgentEngine.Codex || process.platform !== 'win32') {
      return { command, args, source: 'path' };
    }

    const codexJsPath = this.resolveWindowsCodexJsPath(env);
    if (!codexJsPath) {
      return { command, args, source: 'path' };
    }

    const nodeRuntime = this.resolveWindowsNodeRuntime(env);
    if (!nodeRuntime) {
      env.ELECTRON_RUN_AS_NODE = '1';
      return {
        command: getElectronNodeRuntimePath(),
        args: [codexJsPath, ...args],
        source: 'npm-global-js-electron-node',
      };
    }

    return {
      command: nodeRuntime,
      args: [codexJsPath, ...args],
      source: 'npm-global-js-node',
    };
  }

  private resolveWindowsNodeRuntime(env: Record<string, string | undefined>): string | null {
    const candidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
      process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'] as string, 'nodejs', 'node.exe') : null,
      env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Programs', 'nodejs', 'node.exe') : null,
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'nodejs', 'node.exe') : null,
    ].filter((item): item is string => Boolean(item?.trim()));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    try {
      const result = spawnSync('where.exe', ['node'], {
        env: { ...env } as NodeJS.ProcessEnv,
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      });
      if (result.status !== 0) return null;
      return result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.toLowerCase().endsWith('node.exe') && fs.existsSync(line))
        ?? null;
    } catch {
      return null;
    }
  }

  private resolveWindowsCodexJsPath(env: Record<string, string | undefined>): string | null {
    const homeDir = os.homedir();
    const candidateDirs = [
      ...this.getWindowsPathEntries(env),
      env.APPDATA ? path.join(env.APPDATA, 'npm') : null,
      process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : null,
      path.join(homeDir, 'AppData', 'Roaming', 'npm'),
      env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'pnpm') : null,
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'pnpm') : null,
      path.join(homeDir, 'AppData', 'Local', 'pnpm'),
      path.join(homeDir, '.npm-global', 'bin'),
      path.join(homeDir, '.local', 'bin'),
    ].filter((item): item is string => Boolean(item?.trim()));

    const seen = new Set<string>();
    for (const dir of candidateDirs) {
      const normalized = path.resolve(dir);
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const codexJsPath = path.join(normalized, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
      if (fs.existsSync(codexJsPath)) {
        return codexJsPath;
      }
    }

    return null;
  }

  private getWindowsPathEntries(env: Record<string, string | undefined>): string[] {
    const pathValue = env.PATH || env.Path || env.path || process.env.PATH || process.env.Path || '';
    return pathValue
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private applyCodexProviderEnvForExecMode(
    env: Record<string, string | undefined>,
    provider: ExternalAgentProvider | null,
  ): void {
    if (!provider || provider.appType !== 'codex') return;
    const auth = this.getNestedRecord(provider.settingsConfig, 'auth');
    const apiKey = this.getString(auth.OPENAI_API_KEY);
    if (apiKey) {
      env.OPENAI_API_KEY = apiKey;
    }
  }

  private prepareCodexHomeForExecMode(
    env: Record<string, string | undefined>,
    provider: ExternalAgentProvider | null,
    apiConfigOverride?: ApiConfigOverride,
  ): string | null {
    if (this.engine !== CoworkAgentEngine.Codex) return null;
    if (this.getConfigSource() === ExternalAgentConfigSource.WesightModel) {
      return this.prepareCodexWesightModelHomeForExecMode(env, apiConfigOverride);
    }
    return this.prepareCodexProviderHomeForExecMode(env, provider);
  }

  private prepareCodexProviderHomeForExecMode(
    env: Record<string, string | undefined>,
    provider: ExternalAgentProvider | null,
  ): string | null {
    if (this.getConfigSource() === ExternalAgentConfigSource.LocalCli) return null;
    if (!provider || provider.appType !== 'codex') return null;

    const auth = this.getNestedRecord(provider.settingsConfig, 'auth');
    const apiKey = this.getString(auth.OPENAI_API_KEY);
    const configText = this.getString(provider.settingsConfig.config);
    if (!apiKey || !configText) return null;

    try {
      const codexHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-codex-home-'));
      fs.writeFileSync(path.join(codexHomeDir, 'auth.json'), `${JSON.stringify({ OPENAI_API_KEY: apiKey }, null, 2)}\n`, 'utf8');
      fs.writeFileSync(path.join(codexHomeDir, 'config.toml'), this.overrideCodexConfigModel(configText, provider.summary.model), 'utf8');
      env.CODEX_HOME = codexHomeDir;
      return codexHomeDir;
    } catch (error) {
      console.warn('[ExternalCliRuntimeAdapter] Failed to prepare temporary Codex provider config:', error);
      return null;
    }
  }

  private prepareCodexWesightModelHomeForExecMode(
    env: Record<string, string | undefined>,
    apiConfigOverride?: ApiConfigOverride,
  ): string | null {
    const resolved = resolveRawApiConfig(apiConfigOverride);
    if (!resolved.config) return null;
    if (resolved.config.apiType === 'anthropic') return null;
    const apiKey = resolved.config.apiKey.trim();
    const baseUrl = resolved.config.baseURL.trim();
    if (!apiKey || !baseUrl) return null;

    try {
      const providerName = resolved.providerMetadata?.providerName || 'wesight';
      const codexHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-codex-home-'));
      fs.writeFileSync(path.join(codexHomeDir, 'auth.json'), `${JSON.stringify({ OPENAI_API_KEY: apiKey }, null, 2)}\n`, 'utf8');
      fs.writeFileSync(
        path.join(codexHomeDir, 'config.toml'),
        this.buildCodexRuntimeConfig(providerName, baseUrl, resolved.config.model),
        'utf8',
      );
      env.CODEX_HOME = codexHomeDir;
      env.OPENAI_API_KEY = apiKey;
      return codexHomeDir;
    } catch (error) {
      console.warn('[ExternalCliRuntimeAdapter] Failed to prepare temporary Codex WeSight config:', error);
      return null;
    }
  }

  private buildCodexRuntimeConfig(providerName: string, baseUrl: string, model: string): string {
    const providerKey = this.sanitizeCodexProviderKey(providerName);
    return [
      `model_provider = ${this.tomlString(providerKey)}`,
      `model = ${this.tomlString(model || 'gpt-5.1-codex-max')}`,
      'model_reasoning_effort = "high"',
      'disable_response_storage = true',
      '',
      `[model_providers.${providerKey}]`,
      `name = ${this.tomlString(providerName || providerKey)}`,
      `base_url = ${this.tomlString(baseUrl)}`,
      'wire_api = "responses"',
      'requires_openai_auth = true',
      '',
    ].join('\n');
  }

  private overrideCodexConfigModel(configText: string, model: string): string {
    const normalizedModel = model.trim();
    if (!normalizedModel) return configText;
    const modelLine = `model = ${this.tomlString(normalizedModel)}`;
    if (/^\s*model\s*=.*$/m.test(configText)) {
      return configText.replace(/^\s*model\s*=.*$/m, modelLine);
    }
    return `${modelLine}\n${configText}`;
  }

  private cleanupCodexHomeDir(codexHomeDir: string | null): void {
    if (!codexHomeDir) return;
    const tmpRoot = path.resolve(os.tmpdir());
    const resolved = path.resolve(codexHomeDir);
    if (!resolved.startsWith(tmpRoot + path.sep)) return;
    if (!path.basename(resolved).startsWith('wesight-codex-home-')) return;
    try {
      fs.rmSync(resolved, { recursive: true, force: true });
    } catch {
      // Temporary Codex config cleanup is best effort.
    }
  }

  private buildCodexProviderOverrideArgs(provider: ExternalAgentProvider | null): string[] {
    if (this.getConfigSource() === ExternalAgentConfigSource.LocalCli) return [];
    if (!provider || provider.appType !== 'codex') return [];
    const providerKey = this.sanitizeCodexProviderKey(provider.id || provider.name);
    const model = provider.summary.model.trim();
    const baseUrl = provider.summary.baseUrl.trim();
    const args: string[] = [
      '-c',
      `model_provider=${this.tomlString(providerKey)}`,
    ];
    if (model) {
      args.push('-c', `model=${this.tomlString(model)}`);
    }
    args.push('-c', `model_providers.${providerKey}.name=${this.tomlString(provider.name)}`);
    if (baseUrl) {
      args.push('-c', `model_providers.${providerKey}.base_url=${this.tomlString(baseUrl)}`);
    }
    args.push('-c', `model_providers.${providerKey}.wire_api="responses"`);
    args.push('-c', `model_providers.${providerKey}.requires_openai_auth=true`);
    return args;
  }

  private sanitizeCodexProviderKey(value: string): string {
    const key = value
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '');
    return key || 'local_provider';
  }

  private tomlString(value: string): string {
    return JSON.stringify(value);
  }

  private summarizeProxyEnv(env: Record<string, string | undefined>): Record<string, boolean> {
    return {
      httpProxy: Boolean(env.HTTP_PROXY || env.http_proxy),
      httpsProxy: Boolean(env.HTTPS_PROXY || env.https_proxy),
      allProxy: Boolean(env.ALL_PROXY || env.all_proxy),
      noProxy: Boolean(env.NO_PROXY || env.no_proxy),
    };
  }

  private getNestedRecord(value: unknown, key: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const nested = (value as Record<string, unknown>)[key];
    return nested && typeof nested === 'object' && !Array.isArray(nested)
      ? nested as Record<string, unknown>
      : {};
  }

  private getString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private resolveClaudeCodePermissionMode(
    snapshot?: CoworkSessionRuntimeSnapshot | null,
  ): ClaudeCodePermissionMode {
    const snapshotMode = snapshot?.permissionMode;
    if (isClaudeCodePermissionMode(snapshotMode)) {
      return snapshotMode;
    }
    const configMode = this.store.getConfig().claudeCodePermissionMode;
    if (isClaudeCodePermissionMode(configMode)) {
      return configMode;
    }
    return ClaudeCodePermissionMode.BypassPermissions;
  }

  private buildEffectivePrompt(
    sessionId: string,
    prompt: string,
    systemPrompt: string,
    claudeCodePermissionMode: ClaudeCodePermissionMode,
  ): string {
    const history = this.buildHistoryContext(sessionId, prompt);
    const runtimeNoteLines = this.engine === CoworkAgentEngine.Codex
      ? [
        'Runtime note:',
        '- Use the user-level Codex CLI configuration that Codex already loads.',
        '- For simple identity, capability, or general chat questions, answer directly without inspecting project files.',
        '- Use shell commands and read project files only when they are needed to answer or complete the user request.',
        '- Create memory files only when the user explicitly asks to remember or persist information.',
      ]
      : [
        'Runtime note:',
        '- Use the user-level CLI configuration that the local engine already loads.',
        '- Project memory files such as SOUL.md, USER.md, MEMORY.md, and memory/YYYY-MM-DD.md are optional.',
        '- If an optional memory file is missing, skip it silently and continue.',
        '- Create memory files only when the user explicitly asks to remember or persist information.',
      ];
    if (this.engine === CoworkAgentEngine.ClaudeCode) {
      if (claudeCodePermissionMode === ClaudeCodePermissionMode.Plan) {
        runtimeNoteLines.push(
          '- WeSight runs Claude Code in plan mode. Present the plan clearly and wait for the CLI plan flow.',
        );
      } else {
        runtimeNoteLines.push(
          '- WeSight runs Claude Code as a graphical task executor. Do not enter planning-only flows or wait for plan approval.',
          '- For build, edit, debug, or create requests, perform the work directly and report concrete results.',
          '- Do not stop after writing a plan file. Create or modify the requested files and verify the result when possible.',
        );
      }
    }
    const runtimeNote = runtimeNoteLines.join('\n');
    return [
      runtimeNote,
      systemPrompt.trim() ? `System instructions:\n${systemPrompt.trim()}` : '',
      history,
      `Current user request:\n${prompt}`,
    ].filter(Boolean).join('\n\n---\n\n');
  }

  private buildHistoryContext(sessionId: string, prompt: string): string {
    const session = this.store.getSession(sessionId);
    const messages = session?.messages ?? [];
    const historyMessages = [...messages];
    const lastMessage = historyMessages[historyMessages.length - 1];
    if (lastMessage?.type === 'user' && lastMessage.content === prompt) {
      historyMessages.pop();
    }

    const selected = historyMessages
      .filter((message) => message.type === 'user' || message.type === 'assistant' || message.type === 'system')
      .slice(-LOCAL_HISTORY_MAX_MESSAGES);
    if (selected.length === 0) return '';

    let total = 0;
    const lines: string[] = [];
    for (const message of selected) {
      const role = message.type === 'assistant' ? 'Assistant' : message.type === 'system' ? 'System' : 'User';
      const clipped = truncateLargeContent(message.content, LOCAL_HISTORY_MAX_MESSAGE_CHARS);
      const next = `${role}: ${clipped}`;
      if (total + next.length > LOCAL_HISTORY_MAX_TOTAL_CHARS) break;
      lines.push(next);
      total += next.length;
    }
    return lines.length > 0 ? `Conversation history:\n${lines.join('\n\n')}` : '';
  }

  private clearSessionTimers(active: ActiveCliSession): void {
    if (active.startupTimer) {
      clearTimeout(active.startupTimer);
      active.startupTimer = null;
    }
    if (active.noContentNoticeTimer) {
      clearTimeout(active.noContentNoticeTimer);
      active.noContentNoticeTimer = null;
    }
    if (active.noContentTimeoutTimer) {
      clearTimeout(active.noContentTimeoutTimer);
      active.noContentTimeoutTimer = null;
    }
  }

  private scheduleClaudeNoContentDiagnostics(active: ActiveCliSession): void {
    active.noContentNoticeTimer = setTimeout(() => {
      if (!this.activeSessions.has(active.sessionId)) return;
      if (active.sawClaudeVisibleOutput || active.assistantMessageId) return;
      this.addSystemMessage(active.sessionId, t('externalCliClaudeWaitingForOutput', {
        provider: this.describeLocalClaudeConfig(active.localClaudeConfig, active.configSource),
      }));
    }, CLAUDE_NO_CONTENT_NOTICE_MS);

    active.noContentTimeoutTimer = setTimeout(() => {
      if (!this.activeSessions.has(active.sessionId)) return;
      if (active.sawClaudeVisibleOutput || active.assistantMessageId) return;
      active.stderrTail = this.appendStderrTail(active.stderrTail, t('externalCliClaudeNoOutputTimeout', {
        seconds: Math.round(CLAUDE_NO_CONTENT_TIMEOUT_MS / 1000),
        provider: this.describeLocalClaudeConfig(active.localClaudeConfig, active.configSource),
      }));
      active.child.kill('SIGTERM');
    }, CLAUDE_NO_CONTENT_TIMEOUT_MS);
  }

  private scheduleCodexNoJsonDiagnostics(active: ActiveCliSession): void {
    active.noContentNoticeTimer = setTimeout(() => {
      if (!this.activeSessions.has(active.sessionId)) return;
      if (active.sawEvent || active.assistantMessageId) return;
      console.warn('[ExternalCliRuntimeAdapter] Codex CLI is still waiting for JSON output.', {
        configSource: active.configSource,
        stderrChars: active.stderrTail.length,
        stderrTail: active.stderrTail.trim().slice(-1000),
      });
    }, CODEX_NO_JSON_NOTICE_MS);
  }

  private markClaudeVisibleOutput(active: ActiveCliSession): void {
    if (active.sawClaudeVisibleOutput) return;
    active.sawClaudeVisibleOutput = true;
    if (active.noContentNoticeTimer) {
      clearTimeout(active.noContentNoticeTimer);
      active.noContentNoticeTimer = null;
    }
    if (active.noContentTimeoutTimer) {
      clearTimeout(active.noContentTimeoutTimer);
      active.noContentTimeoutTimer = null;
    }
  }

  private describeLocalClaudeConfig(
    config: LocalClaudeCodeEnvLoadResult | null,
    configSource: ExternalAgentConfigSource,
  ): string {
    if (configSource === ExternalAgentConfigSource.WesightModel) {
      return t('externalCliClaudeWesightModelConfig');
    }
    if (!config) {
      return t('externalCliClaudeLocalConfigUnknown');
    }
    const details = [
      config.sourceName,
      config.model,
      config.baseUrl,
      config.credentialSource,
    ].filter(Boolean);
    return details.join(' · ');
  }

  private materializeImageAttachments(
    sessionId: string,
    imageAttachments?: CoworkStartOptions['imageAttachments'],
  ): string[] {
    if (!imageAttachments?.length) return [];
    if (this.engine === CoworkAgentEngine.ClaudeCode) {
      this.addSystemMessage(sessionId, t('externalCliClaudeImageUnsupported'));
      return [];
    }
    const dir = path.join(os.tmpdir(), 'wesight-cli-images', sessionId);
    fs.mkdirSync(dir, { recursive: true });
    const paths: string[] = [];
    for (const attachment of imageAttachments) {
      const ext = this.extensionFromMimeType(attachment.mimeType);
      const filePath = path.join(dir, `${randomUUID()}${ext}`);
      fs.writeFileSync(filePath, Buffer.from(attachment.base64Data, 'base64'));
      paths.push(filePath);
    }
    return paths;
  }

  private cleanupImagePaths(imagePaths: string[]): void {
    for (const imagePath of imagePaths) {
      try {
        fs.unlinkSync(imagePath);
      } catch {
        // Temporary image cleanup is best effort.
      }
    }
  }

  private extensionFromMimeType(mimeType: string): string {
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    if (mimeType === 'image/gif') return '.gif';
    return '.jpg';
  }

  private handleOutputLine(active: ActiveCliSession, line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const event = JSON.parse(trimmed);
      this.emitUsageMetricFromEvent(active, event);
      if (this.engine === CoworkAgentEngine.Codex) {
        this.handleCodexEvent(active, event);
      } else if (this.engine === CoworkAgentEngine.OpenCode) {
        this.handleOpenCodeEvent(active, event);
      } else if (this.engine === CoworkAgentEngine.GrokBuild) {
        this.handleGrokBuildEvent(active, event);
      } else if (this.engine === CoworkAgentEngine.QwenCode) {
        this.handleQwenCodeEvent(active, event);
      } else {
        this.handleClaudeCliEvent(active, event);
      }
    } catch {
      if (this.engine === CoworkAgentEngine.ClaudeCode) {
        this.markClaudeVisibleOutput(active);
      }
      this.appendAssistant(active, line);
    }
  }

  private emitUsageMetricFromEvent(active: ActiveCliSession, event: unknown): void {
    if (!isRecord(event)) return;
    const usageCandidates = [
      event.usage,
      isRecord(event.result) ? event.result.usage : null,
      isRecord(event.response) ? event.response.usage : null,
      isRecord(event.payload) ? event.payload.usage : null,
      isRecord(event.message) ? event.message.usage : null,
    ];
    const usage = usageCandidates.find(isRecord);
    if (!usage) return;
    const inputTokens = firstNumber(usage.input_tokens, usage.prompt_tokens, usage.inputTokens, usage.promptTokens);
    const outputTokens = firstNumber(usage.output_tokens, usage.completion_tokens, usage.outputTokens, usage.completionTokens);
    const cacheReadTokens = firstNumber(usage.cache_read_input_tokens, usage.cacheReadInputTokens, usage.cache_read_tokens);
    const cacheWriteTokens = firstNumber(usage.cache_creation_input_tokens, usage.cacheCreationInputTokens, usage.cache_write_tokens);
    if (inputTokens === null && outputTokens === null && cacheReadTokens === null && cacheWriteTokens === null) {
      return;
    }
    this.emit('runtimeMetric', active.sessionId, {
      type: 'usage',
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      contextTokens: firstNumber(usage.context_tokens, usage.contextTokens, usage.input_tokens, usage.prompt_tokens),
      tokensEstimated: false,
    });
  }

  private handleCodexEvent(active: ActiveCliSession, event: unknown): void {
    if (!isRecord(event)) return;
    const type = String(event.type ?? '');
    if (type === CodexCliEventType.ThreadStarted && typeof event.thread_id === 'string') {
      active.cliSessionId = event.thread_id;
      this.store.updateSession(active.sessionId, { claudeSessionId: event.thread_id });
      return;
    }
    if (type === CodexCliEventType.Error) {
      this.handleError(active.sessionId, firstString(event.message, event.error) ?? 'Codex CLI returned an error.');
      return;
    }
    if (type === CodexCliEventType.ItemStarted && isRecord(event.item)) {
      this.handleCodexItem(active, event.item, false);
      return;
    }
    if (type === CodexCliEventType.ItemCompleted && isRecord(event.item)) {
      this.handleCodexItem(active, event.item, true);
      return;
    }
    if (type === CodexCliEventType.ResponseItem && isRecord(event.payload)) {
      this.handleCodexItem(active, event.payload, true);
      return;
    }
    if (type === CodexCliEventType.EventMessage && isRecord(event.payload)) {
      this.handleCodexEventMessage(active, event.payload);
      return;
    }
    if (type === CodexCliEventType.AgentMessageDelta) {
      const delta = firstString(event.delta, event.text, isRecord(event.params) ? event.params.delta : null);
      if (delta) this.appendAssistant(active, delta);
      return;
    }
    if (type === CodexCliEventType.TurnFailed) {
      this.handleError(active.sessionId, firstString(event.message, event.error) ?? 'Codex turn failed.');
    }
  }

  private handleCodexEventMessage(active: ActiveCliSession, payload: Record<string, unknown>): void {
    const payloadType = String(payload.type ?? '');
    if (payloadType !== CodexCliItemType.ImageGenerationEnd) return;
    const imageId = firstString(payload.call_id, payload.id);
    this.handleCodexImageGenerationItem(active, {
      type: CodexCliItemType.ImageGenerationCall,
      id: imageId,
    });
  }

  private handleCodexItem(active: ActiveCliSession, item: Record<string, unknown>, completed: boolean): void {
    const itemType = String(item.type ?? '');
    if (itemType === CodexCliItemType.AgentMessage) {
      const text = this.extractCodexText(item);
      if (text) {
        this.replaceAssistant(active, text, completed);
      }
      return;
    }
    if (itemType === CodexCliItemType.ImageGenerationCall) {
      this.handleCodexImageGenerationItem(active, item);
      return;
    }
    if (!completed && itemType === CodexCliItemType.CommandExecution) {
      const command = firstString(item.command) ?? 'command';
      this.addToolMessage(active.sessionId, {
        type: 'tool_use',
        content: `Using tool: ${command}`,
        metadata: {
          toolName: 'Bash',
          toolInput: { command },
        },
      });
      return;
    }
    if (completed && itemType === CodexCliItemType.CommandExecution) {
      const output = firstString(item.output, item.aggregated_output, item.text)
        ?? stringifyPayload(item);
      this.addToolMessage(active.sessionId, {
        type: 'tool_result',
        content: output,
        metadata: {
          toolName: 'Bash',
          toolResult: output,
          isError: item.status === 'failed',
        },
      });
      return;
    }
    if (completed && itemType === CodexCliItemType.FileChange) {
      const text = firstString(item.text, item.summary) ?? stringifyPayload(item);
      this.addToolMessage(active.sessionId, {
        type: 'tool_use',
        content: text,
        metadata: {
          toolName: 'FileChange',
          toolInput: item,
        },
      });
    }
  }

  private handleCodexImageGenerationItem(active: ActiveCliSession, item: Record<string, unknown>): void {
    const imageId = firstString(item.id, item.call_id);
    if (imageId && active.codexGeneratedImageIds.has(imageId)) return;
    const imagePath = this.resolveCodexGeneratedImagePath(active, item, imageId);
    if (!imagePath) return;
    if (imageId) {
      active.codexGeneratedImageIds.add(imageId);
    }
    const message = this.store.addMessage(active.sessionId, {
      type: 'assistant',
      content: t('externalCliCodexGeneratedImage'),
      metadata: {
        isStreaming: false,
        isFinal: true,
        generatedImages: [
          {
            path: imagePath,
            name: path.basename(imagePath),
            mimeType: 'image/png',
            source: 'codex',
          },
        ],
      },
    });
    this.emit('message', active.sessionId, message);
  }

  private addCodexGeneratedImagesFromDirectory(active: ActiveCliSession): void {
    if (!active.cliSessionId) return;
    const imageDir = path.join(os.homedir(), '.codex', 'generated_images', active.cliSessionId);
    if (!fs.existsSync(imageDir)) return;
    let entries: string[];
    try {
      entries = fs.readdirSync(imageDir);
    } catch (error) {
      console.warn('[ExternalCliRuntimeAdapter] failed to read Codex generated image directory:', error);
      return;
    }
    const imagePaths = entries
      .filter((entry) => /\.(png|jpe?g|webp|gif)$/i.test(entry))
      .map((entry) => path.join(imageDir, entry))
      .filter((imagePath) => {
        try {
          return fs.statSync(imagePath).isFile();
        } catch {
          return false;
        }
      })
      .sort((left, right) => {
        try {
          return fs.statSync(left).mtimeMs - fs.statSync(right).mtimeMs;
        } catch {
          return left.localeCompare(right);
        }
      });
    for (const imagePath of imagePaths) {
      const imageId = path.basename(imagePath, path.extname(imagePath));
      if (active.codexGeneratedImageIds.has(imageId)) continue;
      this.handleCodexImageGenerationItem(active, {
        type: CodexCliItemType.ImageGenerationCall,
        id: imageId,
      });
    }
  }

  private resolveCodexGeneratedImagePath(
    active: ActiveCliSession,
    item: Record<string, unknown>,
    imageId: string | null,
  ): string | null {
    const defaultPath = imageId
      ? path.join(
        os.homedir(),
        '.codex',
        'generated_images',
        active.cliSessionId || active.sessionId,
        `${imageId}.png`,
      )
      : null;
    if (defaultPath && fs.existsSync(defaultPath)) {
      return defaultPath;
    }

    const result = firstString(item.result, item.image, item.base64, item.data);
    if (!result || !imageId) return null;
    const targetPath = defaultPath ?? path.join(os.tmpdir(), 'wesight-codex-images', active.sessionId, `${imageId}.png`);
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      const base64Data = result.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').replace(/\s/g, '');
      fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
      return targetPath;
    } catch (error) {
      console.warn('[ExternalCliRuntimeAdapter] failed to persist Codex generated image:', error);
      return null;
    }
  }

  private handleOpenCodeEvent(active: ActiveCliSession, event: unknown): void {
    const normalized = normalizeOpenCodeCliEvent(event);
    if (normalized.sessionId) {
      active.cliSessionId = normalized.sessionId;
      this.store.updateSession(active.sessionId, { claudeSessionId: normalized.sessionId });
    }
    switch (normalized.kind) {
      case 'assistant_text':
        this.appendAssistant(active, normalized.text);
        break;
      case 'tool_use':
        this.addToolMessage(active.sessionId, {
          type: 'tool_use',
          content: `Using tool: ${normalized.toolName}`,
          metadata: {
            toolName: normalized.toolName,
            toolInput: normalized.input,
          },
        });
        break;
      case 'tool_result':
        this.addToolMessage(active.sessionId, {
          type: 'tool_result',
          content: normalized.output,
          metadata: {
            toolName: normalized.toolName,
            toolResult: normalized.output,
            isError: normalized.isError,
          },
        });
        break;
      case 'step_start':
        this.emit('runtimeMetric', active.sessionId, {
          type: 'step',
          label: normalized.message,
        });
        this.addSystemMessage(active.sessionId, normalized.message);
        break;
      case 'step_finish':
        if (normalized.message) {
          this.addToolMessage(active.sessionId, {
            type: 'tool_result',
            content: normalized.message,
            metadata: {
              toolName: 'OpenCode',
              toolResult: normalized.message,
            },
          });
        }
        break;
      case 'error':
        this.handleError(active.sessionId, normalized.message);
        break;
      case 'none':
        break;
    }
  }

  private handleQwenCodeEvent(active: ActiveCliSession, event: unknown): void {
    const normalized = normalizeQwenCodeCliEvent(event);
    if (normalized.sessionId) {
      active.cliSessionId = normalized.sessionId;
      this.store.updateSession(active.sessionId, { claudeSessionId: normalized.sessionId });
    }
    switch (normalized.kind) {
      case 'assistant_text':
        if (normalized.replace) {
          this.replaceAssistant(active, normalized.text, true);
        } else {
          this.appendAssistant(active, normalized.text);
        }
        break;
      case 'tool_use':
        this.addToolMessage(active.sessionId, {
          type: 'tool_use',
          content: `Using tool: ${normalized.toolName}`,
          metadata: {
            toolName: normalized.toolName,
            toolInput: normalized.input,
          },
        });
        break;
      case 'tool_result':
        this.addToolMessage(active.sessionId, {
          type: 'tool_result',
          content: normalized.output,
          metadata: {
            toolName: normalized.toolName,
            toolResult: normalized.output,
            isError: normalized.isError,
          },
        });
        break;
      case 'error':
        this.handleError(active.sessionId, normalized.message);
        break;
      case 'none':
        break;
    }
  }

  private handleGrokBuildEvent(active: ActiveCliSession, event: unknown): void {
    if (!isRecord(event)) return;
    const type = String(event.type ?? event.event ?? event.kind ?? '').toLowerCase();
    const payload = isRecord(event.payload) ? event.payload : {};
    const item = isRecord(event.item) ? event.item : {};

    const cliSessionId = firstString(
      event.session_id,
      event.sessionId,
      event.thread_id,
      event.threadId,
      event.conversation_id,
      event.conversationId,
      payload.session_id,
      payload.sessionId,
      item.session_id,
      item.sessionId,
    );
    if (cliSessionId) {
      active.cliSessionId = cliSessionId;
      this.store.updateSession(active.sessionId, { claudeSessionId: cliSessionId });
    }

    if (type.includes('error') || event.error) {
      this.handleError(active.sessionId, this.extractGrokBuildError(event) ?? 'Grok Build CLI returned an error.');
      return;
    }

    if (this.isGrokBuildToolEvent(type, event, payload, item)) {
      this.handleGrokBuildToolEvent(active, type, event, payload, item);
      return;
    }

    if (type.includes('step') || type.includes('status') || type.includes('thinking')) {
      const label = firstString(event.message, event.status, payload.message, item.message);
      if (label) {
        this.emit('runtimeMetric', active.sessionId, {
          type: 'step',
          label,
        });
      }
    }

    const text = this.extractGrokBuildText(event);
    if (text) {
      this.appendAssistant(active, text);
    }
  }

  private isGrokBuildToolEvent(
    type: string,
    event: Record<string, unknown>,
    payload: Record<string, unknown>,
    item: Record<string, unknown>,
  ): boolean {
    return type.includes('tool')
      || type.includes('command')
      || type.includes('exec')
      || type.includes('shell')
      || isRecord(event.tool)
      || isRecord(event.command)
      || isRecord(payload.tool)
      || isRecord(item.tool);
  }

  private handleGrokBuildToolEvent(
    active: ActiveCliSession,
    type: string,
    event: Record<string, unknown>,
    payload: Record<string, unknown>,
    item: Record<string, unknown>,
  ): void {
    const commandRecord = isRecord(event.command)
      ? event.command
      : isRecord(payload.command)
        ? payload.command
        : isRecord(item.command)
          ? item.command
          : {};
    const toolName = firstString(
      event.tool_name,
      event.toolName,
      event.name,
      payload.tool_name,
      payload.toolName,
      payload.name,
      item.tool_name,
      item.toolName,
      item.name,
      commandRecord.name,
      commandRecord.command,
    ) ?? 'Grok';
    const output = firstString(
      event.output,
      event.result,
      event.text,
      payload.output,
      payload.result,
      payload.text,
      item.output,
      item.result,
      item.text,
      commandRecord.output,
      commandRecord.result,
    );
    const completed = type.includes('finish')
      || type.includes('complete')
      || type.includes('result')
      || type.includes('done')
      || type.includes('failed')
      || type.includes('error');

    if (!completed) {
      this.addToolMessage(active.sessionId, {
        type: 'tool_use',
        content: `Using tool: ${toolName}`,
        metadata: {
          toolName,
          toolInput: isRecord(event.input)
            ? event.input
            : isRecord(payload.input)
              ? payload.input
              : isRecord(item.input)
                ? item.input
                : commandRecord,
        },
      });
      return;
    }

    this.addToolMessage(active.sessionId, {
      type: 'tool_result',
      content: output ?? stringifyPayload(event),
      metadata: {
        toolName,
        toolResult: output ?? stringifyPayload(event),
        isError: type.includes('failed') || type.includes('error') || event.status === 'failed',
      },
    });
  }

  private extractGrokBuildError(event: Record<string, unknown>): string | null {
    const error = event.error;
    if (typeof error === 'string' && error.trim()) return error;
    if (isRecord(error)) {
      return firstString(error.message, error.error, error.detail);
    }
    return firstString(event.message, event.detail);
  }

  private extractGrokBuildText(value: unknown): string | null {
    if (typeof value === 'string') {
      return value.trim() ? value : null;
    }
    if (Array.isArray(value)) {
      const parts = value
        .map((item) => this.extractGrokBuildText(item))
        .filter((item): item is string => Boolean(item));
      return parts.length > 0 ? parts.join('') : null;
    }
    if (!isRecord(value)) return null;
    const direct = firstString(
      value.delta,
      value.text,
      value.content,
      value.message,
      value.output,
      value.response,
      value.result,
    );
    if (direct) return direct;
    return this.extractGrokBuildText(value.delta)
      ?? this.extractGrokBuildText(value.content)
      ?? this.extractGrokBuildText(value.message)
      ?? this.extractGrokBuildText(value.payload)
      ?? this.extractGrokBuildText(value.item)
      ?? this.extractGrokBuildText(value.data);
  }

  private handleClaudeCliEvent(active: ActiveCliSession, event: unknown): void {
    if (!isRecord(event)) return;
    const type = String(event.type ?? '');
    if (type === 'system' && event.subtype === 'init' && typeof event.session_id === 'string') {
      active.cliSessionId = event.session_id;
      this.store.updateSession(active.sessionId, { claudeSessionId: event.session_id });
      return;
    }
    if (type === 'stream_event' && isRecord(event.event)) {
      if (this.handleClaudeStreamEvent(active, event.event)) {
        this.markClaudeVisibleOutput(active);
      }
      return;
    }
    if (type === 'assistant' && isRecord(event.message)) {
      const cliError = this.extractClaudeCliError(event);
      if (cliError) {
        active.cliErrorMessage = cliError;
        this.replaceAssistant(active, cliError, true);
        this.markClaudeVisibleOutput(active);
        return;
      }
      if (this.handleClaudeMessage(active, event.message)) {
        this.markClaudeVisibleOutput(active);
      }
      return;
    }
    if (type === 'result') {
      const result = firstString(event.result);
      if (result) {
        this.replaceAssistant(active, result, true);
        this.markClaudeVisibleOutput(active);
      }
      if (String(event.subtype ?? 'success') !== 'success') {
        this.handleError(active.sessionId, firstString(event.error) ?? 'Claude Code CLI run failed.');
      }
    }
  }

  private extractCodexText(value: unknown): string | null {
    if (typeof value === 'string') {
      return value.trim() ? value : null;
    }
    if (Array.isArray(value)) {
      const parts = value
        .map((item) => this.extractCodexText(item))
        .filter((item): item is string => Boolean(item));
      return parts.length > 0 ? parts.join('') : null;
    }
    if (!isRecord(value)) return null;
    const direct = firstString(value.text, value.message, value.content, value.output);
    if (direct) return direct;
    return this.extractCodexText(value.text)
      ?? this.extractCodexText(value.message)
      ?? this.extractCodexText(value.content)
      ?? this.extractCodexText(value.output)
      ?? this.extractCodexText(value.payload);
  }

  private summarizeClaudeCliEvent(event: Record<string, unknown>): Record<string, unknown> {
    const type = String(event.type ?? '');
    const summary: Record<string, unknown> = {
      type,
      subtype: firstString(event.subtype) ?? undefined,
    };
    if (typeof event.session_id === 'string') {
      summary.sessionId = event.session_id;
    }
    if (typeof event.model === 'string') {
      summary.model = event.model;
    }
    if (type === 'system' && event.subtype === 'init') {
      summary.cwd = firstString(event.cwd);
      summary.tools = Array.isArray(event.tools) ? event.tools.length : undefined;
      summary.mcpServers = Array.isArray(event.mcp_servers) ? event.mcp_servers.length : undefined;
      return summary;
    }
    if (type === 'stream_event' && isRecord(event.event)) {
      const streamEvent = event.event;
      const streamType = String(streamEvent.type ?? '');
      summary.streamType = streamType;
      if (typeof streamEvent.index === 'number') {
        summary.index = streamEvent.index;
      }
      if (isRecord(streamEvent.delta)) {
        const delta = streamEvent.delta;
        const text = firstString(delta.text, delta.thinking);
        summary.deltaType = firstString(delta.type) ?? undefined;
        summary.textChars = text?.length ?? 0;
      }
      if (isRecord(streamEvent.message)) {
        summary.message = this.summarizeClaudeMessage(streamEvent.message);
      }
      return summary;
    }
    if (type === 'assistant' && isRecord(event.message)) {
      summary.message = this.summarizeClaudeMessage(event.message);
      return summary;
    }
    if (type === 'result') {
      const result = firstString(event.result);
      const error = firstString(event.error);
      summary.resultChars = result?.length ?? 0;
      summary.error = error;
      summary.isError = String(event.subtype ?? 'success') !== 'success';
      return summary;
    }
    return summary;
  }

  private summarizeClaudeMessage(message: Record<string, unknown>): Record<string, unknown> {
    const content = message.content;
    const summary: Record<string, unknown> = {
      id: firstString(message.id) ?? undefined,
      role: firstString(message.role) ?? undefined,
      model: firstString(message.model) ?? undefined,
      stopReason: firstString(message.stop_reason, message.stopReason) ?? undefined,
    };
    if (!Array.isArray(content)) {
      const text = firstString(content);
      summary.contentShape = typeof content;
      summary.textChars = text?.length ?? 0;
      return summary;
    }
    const blockSummaries = content
      .filter(isRecord)
      .map((block) => {
        const blockType = String(block.type ?? '');
        const text = firstString(block.text, block.thinking);
        return {
          type: blockType,
          name: firstString(block.name) ?? undefined,
          textChars: text?.length ?? 0,
        };
      });
    summary.contentShape = 'array';
    summary.contentBlocks = blockSummaries;
    summary.totalTextChars = blockSummaries.reduce((total, block) => total + block.textChars, 0);
    return summary;
  }

  private extractClaudeCliError(event: Record<string, unknown>): string | null {
    const status = firstNumber(event.apiErrorStatus, event.status, event.status_code);
    const explicitApiError = event.isApiErrorMessage === true || status !== null;
    const message = isRecord(event.message) ? event.message : {};
    const content = message.content;
    let text: string | null = null;
    if (Array.isArray(content)) {
      const textBlock = content.find((block) => isRecord(block) && block.type === 'text') as Record<string, unknown> | undefined;
      text = textBlock ? firstString(textBlock.text) : null;
    } else {
      text = firstString(content);
    }
    if (!text) {
      text = firstString(event.error, event.message, event.result);
    }
    if (!text) return null;
    if (explicitApiError || /^API Error:/i.test(text.trim())) {
      return text.trim();
    }
    return null;
  }

  private handleClaudeStreamEvent(active: ActiveCliSession, event: Record<string, unknown>): boolean {
    const type = String(event.type ?? '');
    if (type !== 'content_block_delta' || !isRecord(event.delta)) return false;
    const delta = event.delta;
    const text = firstString(delta.text, delta.thinking);
    if (text) {
      this.appendAssistant(active, text);
      return true;
    }
    return false;
  }

  private handleClaudeMessage(active: ActiveCliSession, message: Record<string, unknown>): boolean {
    const content = message.content;
    if (!Array.isArray(content)) {
      const text = firstString(content);
      if (text) {
        this.replaceAssistant(active, text, true);
        return true;
      }
      return false;
    }
    let hasVisibleOutput = false;
    for (const block of content) {
      if (!isRecord(block)) continue;
      const blockType = String(block.type ?? '');
      if (blockType === 'text') {
        const text = firstString(block.text);
        if (text) {
          this.replaceAssistant(active, text, true);
          hasVisibleOutput = true;
        }
      } else if (blockType === 'tool_use') {
        const toolName = firstString(block.name) ?? 'Tool';
        const toolInput = isRecord(block.input) ? block.input : {};
        this.addToolMessage(active.sessionId, {
          type: 'tool_use',
          content: `Using tool: ${toolName}`,
          metadata: {
            toolName,
            toolInput,
            toolUseId: firstString(block.id),
          },
        });
        hasVisibleOutput = true;
      }
    }
    return hasVisibleOutput;
  }

  private appendAssistant(active: ActiveCliSession, delta: string): void {
    const next = truncateLargeContent(`${active.assistantContent}${delta}`, STREAMING_TEXT_MAX_CHARS);
    this.replaceAssistant(active, next, false);
  }

  private replaceAssistant(active: ActiveCliSession, content: string, isFinal: boolean): void {
    const safeContent = truncateLargeContent(content, STREAMING_TEXT_MAX_CHARS);
    active.assistantContent = safeContent;
    if (!active.assistantMessageId) {
      const message = this.store.addMessage(active.sessionId, {
        type: 'assistant',
        content: safeContent,
        metadata: { isStreaming: !isFinal, isFinal },
      });
      active.assistantMessageId = message.id;
      this.emit('message', active.sessionId, message);
      return;
    }
    this.store.updateMessage(active.sessionId, active.assistantMessageId, {
      content: safeContent,
      metadata: { isStreaming: !isFinal, isFinal },
    });
    this.emit('messageUpdate', active.sessionId, active.assistantMessageId, safeContent);
  }

  private finalizeAssistant(active: ActiveCliSession): void {
    if (!active.assistantMessageId) return;
    this.store.updateMessage(active.sessionId, active.assistantMessageId, {
      content: active.assistantContent,
      metadata: { isStreaming: false, isFinal: true },
    });
    this.emit('messageUpdate', active.sessionId, active.assistantMessageId, active.assistantContent);
  }

  private addToolMessage(
    sessionId: string,
    input: { type: CoworkMessage['type']; content: string; metadata?: CoworkMessageMetadata },
  ): void {
    if (input.type === 'tool_use') {
      this.splitAssistantSegmentBeforeTool(sessionId);
    }
    const message = this.store.addMessage(sessionId, input);
    this.emit('message', sessionId, message);
  }

  private splitAssistantSegmentBeforeTool(sessionId: string): void {
    const active = this.activeSessions.get(sessionId);
    if (!active?.assistantMessageId) return;
    this.finalizeAssistant(active);
    active.assistantMessageId = null;
    active.assistantContent = '';
  }

  private addSystemMessage(sessionId: string, content: string): void {
    const message = this.store.addMessage(sessionId, {
      type: 'system',
      content,
    });
    this.emit('message', sessionId, message);
  }

  private handleError(sessionId: string, error: string): void {
    if (this.stoppedSessions.has(sessionId)) return;
    if (this.store.getSession(sessionId)?.status === 'error') return;
    this.store.updateSession(sessionId, { status: 'error' });
    this.emit('error', sessionId, error);
  }

  private appendStderrTail(previous: string, next: string): string {
    const combined = `${previous}${next}`;
    return combined.length > STDERR_TAIL_MAX_CHARS
      ? combined.slice(-STDERR_TAIL_MAX_CHARS)
      : combined;
  }

  private applyTurnMemoryUpdates(sessionId: string): void {
    const config = this.store.getConfig();
    if (!config.memoryEnabled) return;
    const session = this.store.getSession(sessionId);
    if (!session) return;
    const lastUser = [...session.messages].reverse().find((message) => message.type === 'user');
    const lastAssistant = [...session.messages].reverse().find((message) => message.type === 'assistant');
    if (!lastUser || !lastAssistant) return;
    void this.store.applyTurnMemoryUpdates({
      sessionId,
      userText: lastUser.content,
      assistantText: lastAssistant.content,
      implicitEnabled: config.memoryImplicitUpdateEnabled,
      memoryLlmJudgeEnabled: config.memoryLlmJudgeEnabled,
      guardLevel: config.memoryGuardLevel,
      userMessageId: lastUser.id,
      assistantMessageId: lastAssistant.id,
    });
  }

  private hasVisibleOutput(active: ActiveCliSession): boolean {
    const session = this.store.getSession(active.sessionId);
    if (!session) return Boolean(active.assistantMessageId);
    return session.messages
      .slice(active.initialMessageCount)
      .some((message) => message.type === 'assistant' || message.type === 'system' || message.type === 'tool_use' || message.type === 'tool_result');
  }

  private getAssistantOutputStats(active: ActiveCliSession): AssistantOutputStats {
    const session = this.store.getSession(active.sessionId);
    const assistantMessages = session?.messages
      .slice(active.initialMessageCount)
      .filter((message) => message.type === 'assistant')
      ?? [];
    const content = assistantMessages.map((message) => message.content).join('');
    return {
      messageCount: assistantMessages.length,
      chars: content.length,
      bytes: Buffer.byteLength(content, 'utf8'),
    };
  }

  private logCliProcessFinished(active: ActiveCliSession, code: number | null, signal: NodeJS.Signals | null): void {
    const assistantOutput = this.getAssistantOutputStats(active);
    console.log('[ExternalCliRuntimeAdapter] CLI process finished.', {
      engine: this.getEngineDisplayName(),
      exitCode: code,
      signal,
      cliSessionId: active.cliSessionId || '(not set)',
      assistantMessageCount: assistantOutput.messageCount,
      assistantOutputChars: assistantOutput.chars,
      assistantOutputBytes: assistantOutput.bytes,
      hasAssistantOutput: assistantOutput.bytes > 0,
      hasVisibleOutput: this.hasVisibleOutput(active),
      stderrChars: active.stderrTail.length,
    });
  }

  private getEngineDisplayName(): string {
    if (this.engine === CoworkAgentEngine.ClaudeCode) return 'Claude Code CLI';
    if (this.engine === CoworkAgentEngine.Codex) return 'Codex CLI';
    if (this.engine === CoworkAgentEngine.OpenCode) return 'OpenCode CLI';
    if (this.engine === CoworkAgentEngine.GrokBuild) return 'Grok Build CLI';
    return 'Qwen Code CLI';
  }
}
