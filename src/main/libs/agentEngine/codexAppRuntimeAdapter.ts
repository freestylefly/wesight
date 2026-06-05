import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';

 
const iconv = require('iconv-lite') as typeof import('iconv-lite');

import type {
  CoworkMessage,
  CoworkMessageMetadata,
  CoworkStore,
} from '../../coworkStore';
import { decodeCodexAppThreadId, encodeCodexAppThreadId } from '../codexAppIds';
import type { CodexAppManager } from '../codexAppManager';
import type { CodexAppServerClient } from '../codexAppServerClient';
import type {
  CoworkContinueOptions,
  CoworkRuntime,
  CoworkRuntimeEvents,
  CoworkStartOptions,
  PermissionRequest,
} from './types';

const JsonRpcMethod = {
  Initialize: 'initialize',
  Initialized: 'initialized',
  ThreadStart: 'thread/start',
  ThreadResume: 'thread/resume',
  TurnStart: 'turn/start',
  TurnInterrupt: 'turn/interrupt',
  ThreadStarted: 'thread/started',
  TurnStarted: 'turn/started',
  TurnCompleted: 'turn/completed',
  AgentMessageDelta: 'item/agentMessage/delta',
  PlanDelta: 'item/plan/delta',
  ReasoningSummaryDelta: 'item/reasoning/summaryTextDelta',
  ItemStarted: 'item/started',
  ItemCompleted: 'item/completed',
  CommandOutputDelta: 'item/commandExecution/outputDelta',
  FileChangePatchUpdated: 'item/fileChange/patchUpdated',
  TurnDiffUpdated: 'turn/diff/updated',
  TokenUsageUpdated: 'thread/tokenUsage/updated',
  CommandApproval: 'item/commandExecution/requestApproval',
  FileChangeApproval: 'item/fileChange/requestApproval',
  PermissionApproval: 'item/permissions/requestApproval',
  ToolUserInput: 'item/tool/requestUserInput',
  LegacyExecApproval: 'execCommandApproval',
  LegacyApplyPatchApproval: 'applyPatchApproval',
  Error: 'error',
} as const;

const ThreadItemType = {
  AgentMessage: 'agentMessage',
  CommandExecution: 'commandExecution',
  FileChange: 'fileChange',
  McpToolCall: 'mcpToolCall',
  DynamicToolCall: 'dynamicToolCall',
  Plan: 'plan',
  Reasoning: 'reasoning',
  ImageGeneration: 'imageGeneration',
} as const;

const STREAMING_TEXT_MAX_CHARS = 120_000;
const STDERR_TAIL_MAX_CHARS = 24_000;
const CONTENT_TRUNCATED_HINT = '\n...[truncated to prevent memory pressure]';
const APP_SERVER_STARTUP_TIMEOUT_MS = 30_000;
const TURN_START_TIMEOUT_MS = 30_000;

type JsonRpcId = number | string;
type CodexAppApprovalKind =
  | 'command'
  | 'file_change'
  | 'permission'
  | 'user_input'
  | 'legacy_exec'
  | 'legacy_patch';

interface JsonRpcResponse {
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

interface ActiveCodexAppSession {
  child: ChildProcessWithoutNullStreams | null;
  sessionId: string;
  appThreadId: string | null;
  appTurnId: string | null;
  assistantMessageId: string | null;
  assistantContent: string;
  diffMessageId: string | null;
  diffContent: string;
  commandOutputs: Map<string, string>;
  pendingRequests: Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>;
  pendingApprovals: Map<string, {
    jsonRpcId: JsonRpcId;
    kind: CodexAppApprovalKind;
  }>;
  requestSeq: number;
  stderrTail: string;
  completed: boolean;
  stopped: boolean;
  startupTimer: ReturnType<typeof setTimeout> | null;
  turnStartTimer: ReturnType<typeof setTimeout> | null;
  resolveDone: (() => void) | null;
}

interface CodexAppRuntimeAdapterDeps {
  store: CoworkStore;
  manager: CodexAppManager;
  client: CodexAppServerClient;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const firstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
};

const firstNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
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

export class CodexAppRuntimeAdapter extends EventEmitter implements CoworkRuntime {
  private readonly store: CoworkStore;
  private readonly manager: CodexAppManager;
  private readonly client: CodexAppServerClient;
  private readonly activeSessions = new Map<string, ActiveCodexAppSession>();
  private readonly stoppedSessions = new Set<string>();

  constructor(deps: CodexAppRuntimeAdapterDeps) {
    super();
    this.store = deps.store;
    this.manager = deps.manager;
    this.client = deps.client;
    this.client.on('notification', ({ method, params }) => {
      const active = this.resolveActiveSessionFromParams(params);
      if (!active) return;
      this.handleNotification(active, method, params);
    });
    this.client.on('request', (request) => {
      const active = this.resolveActiveSessionFromParams(request.params);
      if (!active) {
        this.client.sendErrorResponse(request.id, {
          message: `No active WeSight session is available for Codex App request: ${request.method}`,
        });
        return;
      }
      this.handleServerRequest(active, request);
    });
    this.client.on('disconnect', (error) => {
      for (const active of Array.from(this.activeSessions.values())) {
        if (active.child) continue;
        if (active.completed || active.stopped) continue;
        this.handleError(active.sessionId, error?.message || 'Codex App app-server disconnected.');
        this.cleanupActiveSession(active, false);
      }
    });
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
      active.stopped = true;
      if (active.appThreadId && active.appTurnId) {
        this.sendRequest(active, JsonRpcMethod.TurnInterrupt, {
          threadId: active.appThreadId,
          turnId: active.appTurnId,
        }, 3000).catch(() => {
          // The child is being stopped anyway.
        });
      }
      this.cleanupActiveSession(active);
    }
    this.store.updateSession(sessionId, { status: 'idle' });
    this.emit('sessionStopped', sessionId);
  }

  stopAllSessions(): void {
    for (const sessionId of Array.from(this.activeSessions.keys())) {
      this.stopSession(sessionId);
    }
  }

  respondToPermission(requestId: string, result: PermissionResult): void {
    const active = this.findSessionByApprovalRequest(requestId);
    if (!active) return;
    const pending = active.pendingApprovals.get(requestId);
    if (!pending) return;

    active.pendingApprovals.delete(requestId);
    const allow = result.behavior === 'allow';
    const response = this.buildApprovalResponse(pending.kind, allow, result);
    this.sendResponse(active, pending.jsonRpcId, response);
  }

  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  getSessionConfirmationMode(sessionId: string): 'modal' | 'text' | null {
    return this.activeSessions.has(sessionId) ? 'modal' : null;
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
      throw new Error('This Codex App session is already running.');
    }
    this.stoppedSessions.delete(sessionId);
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const cwd = path.resolve(session.cwd || this.store.getConfig().workingDirectory || os.homedir());
    if (!fs.existsSync(cwd)) {
      this.handleError(sessionId, `Working directory does not exist: ${cwd}`);
      return;
    }

    const status = this.manager.getStatus();
    if (!status.cliFound || !status.cliPath || !status.appInstalled || !status.appServerSupported) {
      this.handleError(sessionId, status.error || status.message || 'Codex App is not ready.');
      return;
    }
    try {
      await this.client.ensureConnected(cwd);
    } catch (error) {
      this.handleError(sessionId, error instanceof Error ? error.message : 'Codex App app-server is not ready.');
      return;
    }

    this.store.updateSession(sessionId, { status: 'running' });
    if (shouldAddUserMessage) {
      const metadata: Record<string, unknown> = { ...(options.messageMetadata ?? {}) };
      if (options.skillIds?.length) metadata.skillIds = options.skillIds;
      if (options.imageAttachments?.length) metadata.imageAttachments = options.imageAttachments;
      const message = this.store.addMessage(sessionId, {
        type: 'user',
        content: prompt,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
      this.emit('message', sessionId, message);
    }

    const active = this.createActiveSession(
      null,
      sessionId,
      session.codexAppThreadId || decodeCodexAppThreadId(session.claudeSessionId),
    );
    this.activeSessions.set(sessionId, active);

    await new Promise<void>((resolve) => {
      active.resolveDone = resolve;
      this.bootstrapTurn(active, prompt, cwd, options)
        .catch((error) => {
          this.handleError(sessionId, error instanceof Error ? error.message : String(error));
          this.cleanupActiveSession(active);
          resolve();
        });
    });
  }

  private createActiveSession(
    child: ChildProcessWithoutNullStreams | null,
    sessionId: string,
    appThreadId: string | null,
  ): ActiveCodexAppSession {
    return {
      child,
      sessionId,
      appThreadId,
      appTurnId: null,
      assistantMessageId: null,
      assistantContent: '',
      diffMessageId: null,
      diffContent: '',
      commandOutputs: new Map(),
      pendingRequests: new Map(),
      pendingApprovals: new Map(),
      requestSeq: 1,
      stderrTail: '',
      completed: false,
      stopped: false,
      startupTimer: null,
      turnStartTimer: null,
      resolveDone: null,
    };
  }

  private bindChild(active: ActiveCodexAppSession): void {
    if (!active.child) return;
    let stdoutBuffer = '';
    active.startupTimer = setTimeout(() => {
      if (active.appThreadId || active.completed || active.stopped) return;
      active.stderrTail = this.appendStderrTail(active.stderrTail, 'Codex App app-server startup timed out.');
      active.child.kill('SIGTERM');
    }, APP_SERVER_STARTUP_TIMEOUT_MS);

    active.child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        this.handleProtocolLine(active, line);
      }
    });

    active.child.stderr.on('data', (chunk: Buffer) => {
      // On Chinese Windows, the app-server may output text in the system's
      // code page (e.g. GBK/936). Try UTF-8 first; fall back to GBK.
      let text = chunk.toString('utf8');
      if (process.platform === 'win32' && text.includes('\uFFFD')) {
        try {
          const gbk = iconv.decode(chunk, 'cp936');
          if (!gbk.includes('\uFFFD')) text = gbk;
        } catch {
          // iconv-lite decode failed; keep UTF-8 attempt
        }
      }
      active.stderrTail = this.appendStderrTail(active.stderrTail, text);
    });

    active.child.on('error', (error) => {
      this.handleError(active.sessionId, `Codex App app-server failed to start: ${error.message}`);
      this.cleanupActiveSession(active);
    });

    active.child.on('close', (code, signal) => {
      if (stdoutBuffer.trim()) {
        this.handleProtocolLine(active, stdoutBuffer);
      }
      this.rejectPendingRequests(active, `Codex App app-server exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}.`);
      if (!active.completed && !active.stopped && this.store.getSession(active.sessionId)?.status !== 'error') {
        const detail = [
          `Codex App app-server exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}.`,
          active.stderrTail.trim() ? `Process stderr:\n${active.stderrTail.trim()}` : '',
        ].filter(Boolean).join('\n\n');
        this.handleError(active.sessionId, detail);
      }
      this.cleanupActiveSession(active, false);
    });
  }

  private async bootstrapTurn(
    active: ActiveCodexAppSession,
    prompt: string,
    cwd: string,
    options: CoworkStartOptions | CoworkContinueOptions,
  ): Promise<void> {
    if (active.child) {
      await this.sendRequest(active, JsonRpcMethod.Initialize, {
        version: 1,
        clientInfo: {
          name: 'wesight',
          title: 'WeSight',
          version: '0.0.0',
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: null,
        },
      });
      this.sendNotification(active, JsonRpcMethod.Initialized, {});
    }

    const systemPrompt = options.systemPrompt?.trim() || this.store.getSession(active.sessionId)?.systemPrompt?.trim() || '';
    if (active.appThreadId) {
      const resumed = await this.sendRequest(active, JsonRpcMethod.ThreadResume, {
        threadId: active.appThreadId,
        cwd,
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        sandbox: 'workspace-write',
        developerInstructions: systemPrompt || null,
      });
      this.captureThreadResult(active, resumed);
    } else {
      const started = await this.sendRequest(active, JsonRpcMethod.ThreadStart, {
        cwd,
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        sandbox: 'workspace-write',
        developerInstructions: systemPrompt || null,
        threadSource: 'user',
      });
      this.captureThreadResult(active, started);
    }

    if (!active.appThreadId) {
      throw new Error('Codex App did not return a thread id.');
    }

    active.turnStartTimer = setTimeout(() => {
      if (active.appTurnId || active.completed || active.stopped) return;
      this.handleError(active.sessionId, 'Codex App turn did not start in time.');
      this.cleanupActiveSession(active);
    }, TURN_START_TIMEOUT_MS);

    await this.sendRequest(active, JsonRpcMethod.TurnStart, {
      threadId: active.appThreadId,
      input: [
        {
          type: 'text',
          text: prompt,
          textElements: [],
        },
      ],
      cwd,
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      sandboxPolicy: {
        type: 'workspaceWrite',
        writableRoots: [],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
    });
  }

  private sendRequest(
    active: ActiveCodexAppSession,
    method: string,
    params: unknown,
    timeoutMs = 60_000,
  ): Promise<unknown> {
    if (active.stopped) {
      return Promise.reject(new Error('Codex App session was stopped.'));
    }
    if (!active.child) {
      return this.client.sendRequest(method, params, timeoutMs);
    }
    const id = active.requestSeq;
    active.requestSeq += 1;
    const message = { id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        active.pendingRequests.delete(id);
        reject(new Error(`Codex App request timed out: ${method}`));
      }, timeoutMs);
      active.pendingRequests.set(id, { resolve, reject, timer });
      this.writeMessage(active, message);
    });
  }

  private sendNotification(active: ActiveCodexAppSession, method: string, params: unknown): void {
    if (!active.child) {
      this.client.sendNotification(method, params);
      return;
    }
    this.writeMessage(active, { method, params });
  }

  private sendResponse(active: ActiveCodexAppSession, id: JsonRpcId, result: unknown): void {
    if (!active.child) {
      this.client.sendResponse(id, result);
      return;
    }
    this.writeMessage(active, { id, result });
  }

  private writeMessage(active: ActiveCodexAppSession, message: unknown): void {
    if (!active.child) return;
    active.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleProtocolLine(active: ActiveCodexAppSession, line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch {
      active.stderrTail = this.appendStderrTail(active.stderrTail, trimmed);
      return;
    }
    if (!isRecord(message)) return;
    if ('id' in message && ('result' in message || 'error' in message)) {
      this.handleResponse(active, message as unknown as JsonRpcResponse);
      return;
    }
    if ('id' in message && typeof message.method === 'string') {
      this.handleServerRequest(active, {
        id: message.id as JsonRpcId,
        method: message.method,
        params: message.params,
      });
      return;
    }
    if (typeof message.method === 'string') {
      this.handleNotification(active, message.method, isRecord(message.params) ? message.params : {});
    }
  }

  private handleResponse(active: ActiveCodexAppSession, response: JsonRpcResponse): void {
    const id = typeof response.id === 'number' ? response.id : Number(response.id);
    const pending = active.pendingRequests.get(id);
    if (!pending) return;
    active.pendingRequests.delete(id);
    clearTimeout(pending.timer);
    if (response.error) {
      pending.reject(new Error(response.error.message || `Codex App request failed: ${response.error.code ?? 'unknown'}`));
      return;
    }
    pending.resolve(response.result);
  }

  private resolveActiveSessionFromParams(params: Record<string, unknown>): ActiveCodexAppSession | null {
    const thread = isRecord(params.thread) ? params.thread : {};
    const item = isRecord(params.item) ? params.item : {};
    const threadId = firstString(
      params.threadId,
      params.appThreadId,
      thread.id,
      thread.threadId,
      item.threadId,
    );
    if (threadId) {
      for (const active of this.activeSessions.values()) {
        if (active.appThreadId === threadId) return active;
      }
    }
    if (this.activeSessions.size === 1) {
      return Array.from(this.activeSessions.values())[0] ?? null;
    }
    return null;
  }

  private handleServerRequest(
    active: ActiveCodexAppSession,
    request: { id: JsonRpcId; method: string; params?: unknown },
  ): void {
    const method = String(request.method);
    const jsonRpcId = request.id as JsonRpcId;
    const params = isRecord(request.params) ? request.params : {};
    if (method === JsonRpcMethod.CommandApproval || method === JsonRpcMethod.LegacyExecApproval) {
      this.emitApproval(active, jsonRpcId, method === JsonRpcMethod.CommandApproval ? 'command' : 'legacy_exec', {
        requestId: this.buildApprovalRequestId(active, jsonRpcId),
        toolName: 'Bash',
        toolInput: {
          command: firstString(params.command, params.cmd) ?? '',
          cwd: firstString(params.cwd) ?? '',
          reason: firstString(params.reason) ?? '',
          commandActions: Array.isArray(params.commandActions) ? params.commandActions : [],
        },
        toolUseId: firstString(params.itemId),
      });
      return;
    }
    if (method === JsonRpcMethod.FileChangeApproval || method === JsonRpcMethod.LegacyApplyPatchApproval) {
      this.emitApproval(active, jsonRpcId, method === JsonRpcMethod.FileChangeApproval ? 'file_change' : 'legacy_patch', {
        requestId: this.buildApprovalRequestId(active, jsonRpcId),
        toolName: 'FileChange',
        toolInput: {
          reason: firstString(params.reason) ?? '',
          grantRoot: firstString(params.grantRoot) ?? '',
          itemId: firstString(params.itemId),
          ...params,
        },
        toolUseId: firstString(params.itemId),
      });
      return;
    }
    if (method === JsonRpcMethod.PermissionApproval) {
      this.emitApproval(active, jsonRpcId, 'permission', {
        requestId: this.buildApprovalRequestId(active, jsonRpcId),
        toolName: 'Permission',
        toolInput: params,
        toolUseId: firstString(params.itemId),
      });
      return;
    }
    if (method === JsonRpcMethod.ToolUserInput) {
      this.emitApproval(active, jsonRpcId, 'user_input', {
        requestId: this.buildApprovalRequestId(active, jsonRpcId),
        toolName: 'AskUserQuestion',
        toolInput: params,
        toolUseId: firstString(params.itemId),
      });
      return;
    }
    if (!active.child) {
      this.client.sendErrorResponse(jsonRpcId, {
        message: `WeSight does not support Codex App server request: ${method}`,
      });
      return;
    }
    this.sendResponse(active, jsonRpcId, {
      error: {
        message: `WeSight does not support Codex App server request: ${method}`,
      },
    });
  }

  private emitApproval(
    active: ActiveCodexAppSession,
    jsonRpcId: JsonRpcId,
    kind: CodexAppApprovalKind,
    request: PermissionRequest,
  ): void {
    active.pendingApprovals.set(request.requestId, { jsonRpcId, kind });
    this.emit('permissionRequest', active.sessionId, request);
  }

  private buildApprovalRequestId(active: ActiveCodexAppSession, jsonRpcId: JsonRpcId): string {
    return `codex-app:${active.sessionId}:${String(jsonRpcId)}`;
  }

  private handleNotification(active: ActiveCodexAppSession, method: string, params: Record<string, unknown>): void {
    switch (method) {
      case JsonRpcMethod.ThreadStarted:
        this.captureThreadResult(active, params);
        break;
      case JsonRpcMethod.TurnStarted:
        this.handleTurnStarted(active, params);
        break;
      case JsonRpcMethod.AgentMessageDelta:
        this.appendAssistant(active, firstString(params.delta) ?? '');
        break;
      case JsonRpcMethod.PlanDelta:
      case JsonRpcMethod.ReasoningSummaryDelta:
        this.emit('runtimeMetric', active.sessionId, {
          type: 'step',
          label: firstString(params.delta, params.text) ?? method,
        });
        break;
      case JsonRpcMethod.ItemStarted:
        this.handleItem(active, params.item, false);
        break;
      case JsonRpcMethod.ItemCompleted:
        this.handleItem(active, params.item, true);
        break;
      case JsonRpcMethod.CommandOutputDelta:
        this.handleCommandOutputDelta(active, params);
        break;
      case JsonRpcMethod.FileChangePatchUpdated:
        this.handleFileChangePatch(active, params, false);
        break;
      case JsonRpcMethod.TurnDiffUpdated:
        this.handleTurnDiff(active, firstString(params.diff) ?? '');
        break;
      case JsonRpcMethod.TokenUsageUpdated:
        this.handleTokenUsage(active, params.tokenUsage);
        break;
      case JsonRpcMethod.TurnCompleted:
        this.handleTurnCompleted(active, params);
        break;
      case JsonRpcMethod.Error:
        this.handleError(active.sessionId, firstString(params.message, params.error) ?? stringifyPayload(params));
        this.cleanupActiveSession(active);
        break;
      default:
        break;
    }
  }

  private captureThreadResult(active: ActiveCodexAppSession, value: unknown): void {
    const record = isRecord(value) ? value : {};
    const thread = isRecord(record.thread) ? record.thread : record;
    const threadId = firstString(thread.id, thread.sessionId);
    if (threadId) {
      active.appThreadId = threadId;
      this.store.updateSession(active.sessionId, {
        claudeSessionId: encodeCodexAppThreadId(threadId),
        codexAppThreadId: threadId,
      });
    }
  }

  private handleTurnStarted(active: ActiveCodexAppSession, params: Record<string, unknown>): void {
    const turn = isRecord(params.turn) ? params.turn : {};
    const turnId = firstString(turn.id, params.turnId);
    if (turnId) active.appTurnId = turnId;
    if (active.turnStartTimer) {
      clearTimeout(active.turnStartTimer);
      active.turnStartTimer = null;
    }
    this.emit('runtimeMetric', active.sessionId, {
      type: 'step',
      label: 'Codex App turn started',
    });
  }

  private handleItem(active: ActiveCodexAppSession, item: unknown, completed: boolean): void {
    if (!isRecord(item)) return;
    const itemType = String(item.type ?? '');
    if (itemType === ThreadItemType.AgentMessage) {
      const text = firstString(item.text);
      if (text && !active.assistantContent) {
        this.replaceAssistant(active, text, completed);
      } else if (completed) {
        this.finalizeAssistant(active);
      }
      return;
    }
    if (itemType === ThreadItemType.CommandExecution) {
      this.handleCommandItem(active, item, completed);
      return;
    }
    if (itemType === ThreadItemType.FileChange) {
      this.handleFileChangeItem(active, item, completed);
      return;
    }
    if (itemType === ThreadItemType.McpToolCall || itemType === ThreadItemType.DynamicToolCall) {
      this.handleGenericToolItem(active, item, completed);
      return;
    }
    if (itemType === ThreadItemType.ImageGeneration && completed) {
      this.handleImageGenerationItem(active, item);
    }
  }

  private handleCommandItem(active: ActiveCodexAppSession, item: Record<string, unknown>, completed: boolean): void {
    const itemId = firstString(item.id) ?? `command-${Date.now()}`;
    const command = firstString(item.command) ?? 'command';
    if (!completed) {
      this.addToolMessage(active.sessionId, {
        type: 'tool_use',
        content: `Using tool: ${command}`,
        metadata: {
          toolName: 'Bash',
          toolInput: {
            command,
            cwd: firstString(item.cwd),
            source: 'codex_app',
          },
          toolUseId: itemId,
        },
      });
      return;
    }
    const buffered = active.commandOutputs.get(itemId);
    const output = firstString(item.aggregatedOutput, buffered) ?? stringifyPayload(item);
    this.addToolMessage(active.sessionId, {
      type: 'tool_result',
      content: output,
      metadata: {
        toolName: 'Bash',
        toolResult: output,
        isError: item.status === 'failed' || item.status === 'declined',
      },
    });
    active.commandOutputs.delete(itemId);
  }

  private handleCommandOutputDelta(active: ActiveCodexAppSession, params: Record<string, unknown>): void {
    const itemId = firstString(params.itemId);
    const delta = firstString(params.delta);
    if (!itemId || !delta) return;
    const next = truncateLargeContent(`${active.commandOutputs.get(itemId) ?? ''}${delta}`, STREAMING_TEXT_MAX_CHARS);
    active.commandOutputs.set(itemId, next);
  }

  private handleFileChangeItem(active: ActiveCodexAppSession, item: Record<string, unknown>, completed: boolean): void {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const text = changes.length > 0
      ? changes
        .map((change) => isRecord(change)
          ? `${firstString(change.path) ?? 'file'}\n${firstString(change.diff) ?? ''}`
          : stringifyPayload(change))
        .join('\n\n')
      : stringifyPayload(item);
    this.addToolMessage(active.sessionId, {
      type: completed ? 'tool_result' : 'tool_use',
      content: text,
      metadata: completed
        ? {
            toolName: 'FileChange',
            toolResult: text,
            isError: item.status === 'failed' || item.status === 'declined',
          }
        : {
            toolName: 'FileChange',
            toolInput: item,
            toolUseId: firstString(item.id),
          },
    });
  }

  private handleFileChangePatch(active: ActiveCodexAppSession, params: Record<string, unknown>, completed: boolean): void {
    const changes = Array.isArray(params.changes) ? params.changes : [];
    if (changes.length === 0) return;
    this.addToolMessage(active.sessionId, {
      type: completed ? 'tool_result' : 'tool_use',
      content: changes.map(change => stringifyPayload(change)).join('\n\n'),
      metadata: {
        toolName: 'FileChange',
        toolInput: {
          itemId: firstString(params.itemId),
          changes,
        },
        toolUseId: firstString(params.itemId),
      },
    });
  }

  private handleTurnDiff(active: ActiveCodexAppSession, diff: string): void {
    if (!diff.trim()) return;
    active.diffContent = diff;
    const content = `Codex App file diff:\n\n${diff}`;
    if (!active.diffMessageId) {
      const message = this.store.addMessage(active.sessionId, {
        type: 'tool_use',
        content,
        metadata: {
          toolName: 'FileChange',
          toolInput: {
            diff,
            source: 'codex_app',
          },
        },
      });
      active.diffMessageId = message.id;
      this.emit('message', active.sessionId, message);
      return;
    }
    this.store.updateMessage(active.sessionId, active.diffMessageId, {
      content,
      metadata: {
        toolName: 'FileChange',
        toolInput: {
          diff,
          source: 'codex_app',
        },
      },
    });
    this.emit('messageUpdate', active.sessionId, active.diffMessageId, content);
  }

  private handleGenericToolItem(active: ActiveCodexAppSession, item: Record<string, unknown>, completed: boolean): void {
    const toolName = firstString(item.tool, item.name, item.server, item.namespace) ?? String(item.type ?? 'Tool');
    const payload = completed
      ? firstString(item.result, item.error) ?? stringifyPayload(item)
      : stringifyPayload(item.arguments ?? item);
    this.addToolMessage(active.sessionId, {
      type: completed ? 'tool_result' : 'tool_use',
      content: payload,
      metadata: completed
        ? {
            toolName,
            toolResult: payload,
            isError: Boolean(item.error),
          }
        : {
            toolName,
            toolInput: item,
            toolUseId: firstString(item.id),
          },
    });
  }

  private handleImageGenerationItem(active: ActiveCodexAppSession, item: Record<string, unknown>): void {
    const savedPath = firstString(item.savedPath, item.path, item.result);
    if (!savedPath || !fs.existsSync(savedPath)) return;
    const message = this.store.addMessage(active.sessionId, {
      type: 'assistant',
      content: 'Codex App generated an image.',
      metadata: {
        isStreaming: false,
        isFinal: true,
        generatedImages: [
          {
            path: savedPath,
            name: path.basename(savedPath),
            mimeType: 'image/png',
            source: 'codex_app',
          },
        ],
      },
    });
    this.emit('message', active.sessionId, message);
  }

  private handleTokenUsage(active: ActiveCodexAppSession, tokenUsage: unknown): void {
    if (!isRecord(tokenUsage)) return;
    const last = isRecord(tokenUsage.last) ? tokenUsage.last : {};
    const total = isRecord(tokenUsage.total) ? tokenUsage.total : {};
    const inputTokens = firstNumber(last.inputTokens, total.inputTokens);
    const outputTokens = firstNumber(last.outputTokens, total.outputTokens);
    const cacheReadTokens = firstNumber(last.cachedInputTokens, total.cachedInputTokens);
    const contextTokens = firstNumber(last.totalTokens, total.totalTokens, tokenUsage.modelContextWindow);
    if (inputTokens === null && outputTokens === null && contextTokens === null) return;
    this.emit('runtimeMetric', active.sessionId, {
      type: 'usage',
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens: null,
      contextTokens,
      tokensEstimated: false,
    });
  }

  private handleTurnCompleted(active: ActiveCodexAppSession, _params: Record<string, unknown>): void {
    if (active.completed) return;
    active.completed = true;
    this.finalizeAssistant(active);
    this.store.updateSession(active.sessionId, {
      status: 'completed',
      claudeSessionId: active.appThreadId ? encodeCodexAppThreadId(active.appThreadId) : null,
      codexAppThreadId: active.appThreadId,
    });
    this.applyTurnMemoryUpdates(active.sessionId);
    this.emit('complete', active.sessionId, active.appThreadId);
    this.cleanupActiveSession(active);
  }

  private appendAssistant(active: ActiveCodexAppSession, delta: string): void {
    if (!delta) return;
    const next = truncateLargeContent(`${active.assistantContent}${delta}`, STREAMING_TEXT_MAX_CHARS);
    this.replaceAssistant(active, next, false);
  }

  private replaceAssistant(active: ActiveCodexAppSession, content: string, isFinal: boolean): void {
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

  private finalizeAssistant(active: ActiveCodexAppSession): void {
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

  private handleError(sessionId: string, error: string): void {
    if (this.stoppedSessions.has(sessionId)) return;
    if (this.store.getSession(sessionId)?.status === 'error') return;
    this.store.updateSession(sessionId, { status: 'error' });
    this.emit('error', sessionId, error);
  }

  private buildApprovalResponse(
    kind: CodexAppApprovalKind,
    allow: boolean,
    result: PermissionResult,
  ): unknown {
    if (kind === 'command' || kind === 'file_change') {
      return { decision: allow ? 'accept' : 'decline' };
    }
    if (kind === 'legacy_exec') {
      return { decision: allow ? 'approved' : 'denied' };
    }
    if (kind === 'legacy_patch') {
      return { decision: allow ? 'approved' : 'denied' };
    }
    if (kind === 'user_input') {
      return allow ? { answer: result.behavior === 'allow' ? result.updatedInput ?? {} : {} } : { cancelled: true };
    }
    if (kind === 'permission') {
      return allow
        ? {
            permissions: result.behavior === 'allow' ? result.updatedPermissions ?? [] : [],
            scope: 'session',
          }
        : { permissions: [], scope: 'none' };
    }
    return { decision: allow ? 'accept' : 'decline' };
  }

  private findSessionByApprovalRequest(requestId: string): ActiveCodexAppSession | null {
    for (const active of this.activeSessions.values()) {
      if (active.pendingApprovals.has(requestId)) return active;
    }
    return null;
  }

  private cleanupActiveSession(active: ActiveCodexAppSession, killChild = true): void {
    if (active.startupTimer) {
      clearTimeout(active.startupTimer);
      active.startupTimer = null;
    }
    if (active.turnStartTimer) {
      clearTimeout(active.turnStartTimer);
      active.turnStartTimer = null;
    }
    this.rejectPendingRequests(active, 'Codex App session ended.');
    if (killChild && active.child && !active.child.killed) {
      active.child.kill('SIGTERM');
    }
    this.activeSessions.delete(active.sessionId);
    const resolveDone = active.resolveDone;
    active.resolveDone = null;
    resolveDone?.();
  }

  private rejectPendingRequests(active: ActiveCodexAppSession, message: string): void {
    for (const pending of active.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    active.pendingRequests.clear();
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
}
