import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  DeepSeekTuiPermissionMode,
  ExternalAgentConfigSource,
} from '../../../shared/cowork/constants';
import type { CoworkSessionRuntimeSnapshot } from '../../../shared/cowork/runtimeSnapshot';
import type {
  CoworkMessage,
  CoworkMessageMetadata,
  CoworkStore,
} from '../../coworkStore';
import { type ApiConfigOverride,resolveRawApiConfig } from '../claudeSettings';
import { getEnhancedEnvWithTmpdir } from '../coworkUtil';
import {
  buildDeepSeekTuiRuntimeEnv,
  DEFAULT_DEEPSEEK_TUI_MODEL,
} from '../deepSeekTuiConfig';
import type {
  DeepSeekTuiRuntimeConnection,
} from '../deepSeekTuiRuntimeManager';
import { DeepSeekTuiRuntimeManager } from '../deepSeekTuiRuntimeManager';
import {
  normalizeDeepSeekTuiSseEvent,
  parseDeepSeekTuiSseFrame,
} from '../deepSeekTuiSseEvent';
import type {
  ExternalAgentProvider,
  ExternalAgentProviderAppType,
} from '../externalAgentProviderStore';
import type {
  CoworkContinueOptions,
  CoworkRuntime,
  CoworkRuntimeEvents,
  CoworkStartOptions,
} from './types';

const STREAMING_TEXT_MAX_CHARS = 120_000;
const CONTENT_TRUNCATED_HINT = '\n...[truncated to prevent memory pressure]';

type ActiveDeepSeekTuiSession = {
  sessionId: string;
  connection: DeepSeekTuiRuntimeConnection;
  abortController: AbortController;
  assistantMessageId: string | null;
  assistantContent: string;
  threadId: string;
  turnId: string | null;
  imagePaths: string[];
};

type DeepSeekTuiRuntimeAdapterDeps = {
  store: CoworkStore;
  runtimeManager: DeepSeekTuiRuntimeManager;
  getCurrentProvider?: (appType: ExternalAgentProviderAppType) => ExternalAgentProvider | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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

const getString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const truncateLargeContent = (content: string, maxChars: number): string => {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}${CONTENT_TRUNCATED_HINT}`;
};

const extractId = (value: unknown, ...keys: string[]): string | null => {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const direct = getString(value[key]);
    if (direct) return direct;
  }
  return null;
};

export class DeepSeekTuiRuntimeAdapter extends EventEmitter implements CoworkRuntime {
  private readonly store: CoworkStore;
  private readonly runtimeManager: DeepSeekTuiRuntimeManager;
  private readonly getCurrentProvider?: (appType: ExternalAgentProviderAppType) => ExternalAgentProvider | null;
  private readonly activeSessions = new Map<string, ActiveDeepSeekTuiSession>();
  private readonly pendingApprovals = new Map<string, {
    sessionId: string;
    connection: DeepSeekTuiRuntimeConnection;
    approvalId: string;
  }>();
  private readonly stoppedSessions = new Set<string>();

  constructor(deps: DeepSeekTuiRuntimeAdapterDeps) {
    super();
    this.store = deps.store;
    this.runtimeManager = deps.runtimeManager;
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
      active.abortController.abort();
      void this.interruptTurn(active);
      this.cleanupImagePaths(active.imagePaths);
      this.activeSessions.delete(sessionId);
    }
    this.clearApprovalsForSession(sessionId);
    this.store.updateSession(sessionId, { status: 'idle' });
    this.emit('sessionStopped', sessionId);
  }

  stopAllSessions(): void {
    for (const sessionId of Array.from(this.activeSessions.keys())) {
      this.stopSession(sessionId);
    }
    this.runtimeManager.stop();
  }

  respondToPermission(requestId: string, result: PermissionResult): void {
    const pending = this.pendingApprovals.get(requestId);
    if (!pending) return;
    const decision = result.behavior === 'allow' ? 'allow' : 'deny';
    void this.runtimeFetch(pending.connection, `/v1/approvals/${encodeURIComponent(pending.approvalId)}`, {
      method: 'POST',
      body: JSON.stringify({
        decision,
        remember: false,
      }),
    }).catch((error) => {
      this.handleError(pending.sessionId, error instanceof Error ? error.message : String(error));
    });
    if (result.behavior === 'allow' || result.behavior === 'deny') {
      this.pendingApprovals.delete(requestId);
    }
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
      if (options.skillIds?.length) metadata.skillIds = options.skillIds;
      if (options.imageAttachments?.length) metadata.imageAttachments = options.imageAttachments;
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

    const config = this.store.getConfig();
    const configSource = config.deepseekTuiConfigSource;
    const permissionMode = config.deepseekTuiPermissionMode;
    const selectedProvider = configSource === ExternalAgentConfigSource.LocalCli
      ? this.getCurrentProvider?.('deepseek_tui') ?? null
      : null;
    const apiConfigOverride = getApiOverrideFromRuntimeSnapshot(options.runtimeSnapshot);
    const model = this.resolveRuntimeModel(selectedProvider, apiConfigOverride);
    const env = await getEnhancedEnvWithTmpdir(cwd, 'local', {
      injectCoworkModelConfig: false,
      apiConfigOverride,
    });
    if (configSource === ExternalAgentConfigSource.WesightModel) {
      const resolved = resolveRawApiConfig(apiConfigOverride);
      if (!resolved.config) {
        this.handleError(sessionId, resolved.error || '请先在设置的模型配置中选择可用于 DeepSeek-TUI 的模型。');
        return;
      }
      try {
        Object.assign(env, buildDeepSeekTuiRuntimeEnv(resolved.config, resolved.providerMetadata?.providerName));
      } catch (error) {
        this.handleError(sessionId, error instanceof Error ? error.message : String(error));
        return;
      }
    }

    const imagePaths = this.materializeImageAttachments(sessionId, options.imageAttachments);
    const promptWithAttachments = imagePaths.length > 0
      ? `${prompt}\n\n${imagePaths.map((imagePath) => `@${imagePath}`).join('\n')}`
      : prompt;

    try {
      const connection = await this.runtimeManager.ensureRunning({
        cwd,
        env,
        configSource,
      });
      const threadId = currentSession?.claudeSessionId
        || await this.createThread(connection, cwd, model, permissionMode, options.systemPrompt ?? currentSession?.systemPrompt ?? '');
      this.store.updateSession(sessionId, { claudeSessionId: threadId });
      const turnId = await this.startTurn(connection, threadId, promptWithAttachments, model, permissionMode);
      const active: ActiveDeepSeekTuiSession = {
        sessionId,
        connection,
        abortController: new AbortController(),
        assistantMessageId: null,
        assistantContent: '',
        threadId,
        turnId,
        imagePaths,
      };
      this.activeSessions.set(sessionId, active);
      await this.consumeEvents(active);
    } catch (error) {
      if (!this.stoppedSessions.has(sessionId)) {
        this.handleError(sessionId, error instanceof Error ? error.message : String(error));
      }
    } finally {
      const active = this.activeSessions.get(sessionId);
      if (active) {
        this.finalizeAssistant(active);
        this.cleanupImagePaths(active.imagePaths);
        this.activeSessions.delete(sessionId);
      } else {
        this.cleanupImagePaths(imagePaths);
      }
      this.clearApprovalsForSession(sessionId);
      const latestSession = this.store.getSession(sessionId);
      if (!this.stoppedSessions.has(sessionId) && latestSession?.status !== 'error') {
        this.store.updateSession(sessionId, { status: 'completed' });
        this.applyTurnMemoryUpdates(sessionId);
        this.emit('complete', sessionId, this.store.getSession(sessionId)?.claudeSessionId ?? null);
      }
    }
  }

  private resolveRuntimeModel(
    provider: ExternalAgentProvider | null,
    apiConfigOverride?: ApiConfigOverride,
  ): string | null {
    if (provider?.summary.model.trim()) {
      return provider.summary.model.trim();
    }
    const resolved = resolveRawApiConfig(apiConfigOverride);
    return resolved.config?.model?.trim() || DEFAULT_DEEPSEEK_TUI_MODEL;
  }

  private async createThread(
    connection: DeepSeekTuiRuntimeConnection,
    cwd: string,
    model: string | null,
    permissionMode: typeof DeepSeekTuiPermissionMode[keyof typeof DeepSeekTuiPermissionMode],
    systemPrompt: string,
  ): Promise<string> {
    const auto = permissionMode === DeepSeekTuiPermissionMode.Auto;
    const response = await this.runtimeFetch(connection, '/v1/threads', {
      method: 'POST',
      body: JSON.stringify({
        model: model || undefined,
        workspace: cwd,
        mode: 'agent',
        allow_shell: auto,
        trust_mode: auto,
        auto_approve: auto,
        archived: false,
        system_prompt: systemPrompt.trim() || undefined,
      }),
    });
    const threadId = extractId(response, 'id', 'thread_id');
    if (!threadId) {
      throw new Error('DeepSeek-TUI did not return a thread id.');
    }
    return threadId;
  }

  private async startTurn(
    connection: DeepSeekTuiRuntimeConnection,
    threadId: string,
    prompt: string,
    model: string | null,
    permissionMode: typeof DeepSeekTuiPermissionMode[keyof typeof DeepSeekTuiPermissionMode],
  ): Promise<string | null> {
    const auto = permissionMode === DeepSeekTuiPermissionMode.Auto;
    const response = await this.runtimeFetch(connection, `/v1/threads/${encodeURIComponent(threadId)}/turns`, {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        input_summary: null,
        model: model || undefined,
        mode: 'agent',
        allow_shell: auto,
        trust_mode: auto,
        auto_approve: auto,
      }),
    });
    if (isRecord(response.turn)) {
      return extractId(response.turn, 'id', 'turn_id');
    }
    return extractId(response, 'turn_id');
  }

  private async consumeEvents(active: ActiveDeepSeekTuiSession): Promise<void> {
    const query = active.turnId ? 'since_seq=0' : 'since_seq=0';
    const response = await fetch(
      `${active.connection.baseUrl}/v1/threads/${encodeURIComponent(active.threadId)}/events?${query}`,
      {
        headers: this.authHeaders(active.connection),
        signal: active.abortController.signal,
      },
    );
    if (!response.ok || !response.body) {
      throw new Error(`DeepSeek-TUI event stream failed with HTTP ${response.status}.`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        if (this.handleSseFrame(active, frame)) {
          return;
        }
      }
    }
    if (buffer.trim()) {
      this.handleSseFrame(active, buffer);
    }
  }

  private handleSseFrame(active: ActiveDeepSeekTuiSession, frame: string): boolean {
    const parsed = parseDeepSeekTuiSseFrame(frame);
    if (!parsed) return false;
    if (!this.eventBelongsToTurn(active, parsed.data)) return false;
    const normalized = normalizeDeepSeekTuiSseEvent(parsed.event, parsed.data);
    switch (normalized.kind) {
      case 'assistant_text':
        this.appendAssistant(active, normalized.text);
        return false;
      case 'tool_started':
        this.addToolMessage(active.sessionId, {
          type: 'tool_use',
          content: `Using tool: ${normalized.toolName}`,
          metadata: {
            toolName: normalized.toolName,
            toolInput: normalized.input,
            toolUseId: normalized.toolCallId,
          },
        });
        return false;
      case 'tool_progress':
        if (normalized.output.trim()) {
          this.addToolMessage(active.sessionId, {
            type: 'tool_result',
            content: normalized.output,
            metadata: {
              toolName: 'DeepSeek-TUI',
              toolResult: normalized.output,
              toolUseId: normalized.toolCallId,
              isStreaming: true,
            },
          });
        }
        return false;
      case 'tool_completed':
        this.addToolMessage(active.sessionId, {
          type: 'tool_result',
          content: normalized.output,
          metadata: {
            toolName: normalized.toolName,
            toolResult: normalized.output,
            toolUseId: normalized.toolCallId,
            isError: normalized.isError,
          },
        });
        return false;
      case 'status':
        this.addSystemMessage(active.sessionId, normalized.message);
        return false;
      case 'approval_required': {
        const requestId = normalized.approvalId || randomUUID();
        this.pendingApprovals.set(requestId, {
          sessionId: active.sessionId,
          connection: active.connection,
          approvalId: normalized.approvalId,
        });
        this.emit('permissionRequest', active.sessionId, {
          requestId,
          toolName: normalized.toolName,
          toolInput: normalized.input,
          toolUseId: normalized.approvalId,
        });
        return false;
      }
      case 'error':
        this.handleError(active.sessionId, normalized.message);
        return true;
      case 'turn_completed':
      case 'done':
        return true;
      case 'none':
        return false;
    }
  }

  private eventBelongsToTurn(active: ActiveDeepSeekTuiSession, data: unknown): boolean {
    if (!active.turnId || !isRecord(data)) return true;
    const turnId = getString(data.turn_id);
    return !turnId || turnId === active.turnId;
  }

  private async interruptTurn(active: ActiveDeepSeekTuiSession): Promise<void> {
    if (!active.turnId) return;
    try {
      await this.runtimeFetch(
        active.connection,
        `/v1/threads/${encodeURIComponent(active.threadId)}/turns/${encodeURIComponent(active.turnId)}/interrupt`,
        { method: 'POST' },
      );
    } catch {
      // Interrupt is best effort during manual stop.
    }
  }

  private async runtimeFetch(
    connection: DeepSeekTuiRuntimeConnection,
    route: string,
    init: RequestInit = {},
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${connection.baseUrl}${route}`, {
      ...init,
      headers: {
        ...this.authHeaders(connection),
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text.trim() || `DeepSeek-TUI HTTP request failed with status ${response.status}.`);
    }
    if (!text.trim()) return {};
    try {
      const parsed = JSON.parse(text);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return { text };
    }
  }

  private authHeaders(connection: DeepSeekTuiRuntimeConnection): Record<string, string> {
    return {
      Authorization: `Bearer ${connection.token}`,
      'x-deepseek-runtime-token': connection.token,
    };
  }

  private appendAssistant(active: ActiveDeepSeekTuiSession, delta: string): void {
    const next = truncateLargeContent(`${active.assistantContent}${delta}`, STREAMING_TEXT_MAX_CHARS);
    this.replaceAssistant(active, next, false);
  }

  private replaceAssistant(active: ActiveDeepSeekTuiSession, content: string, isFinal: boolean): void {
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

  private finalizeAssistant(active: ActiveDeepSeekTuiSession): void {
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
    const message = this.store.addMessage(sessionId, input);
    this.emit('message', sessionId, message);
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

  private materializeImageAttachments(
    sessionId: string,
    imageAttachments?: CoworkStartOptions['imageAttachments'],
  ): string[] {
    if (!imageAttachments?.length) return [];
    const dir = path.join(os.tmpdir(), 'wesight-deepseek-tui-images', sessionId);
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

  private clearApprovalsForSession(sessionId: string): void {
    for (const [requestId, pending] of this.pendingApprovals.entries()) {
      if (pending.sessionId === sessionId) {
        this.pendingApprovals.delete(requestId);
      }
    }
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
