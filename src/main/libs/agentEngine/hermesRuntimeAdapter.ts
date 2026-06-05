import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

import type {
  CoworkStore,
} from '../../coworkStore';
import type {
  HermesEngineManager,
  HermesEngineStatus,
} from '../hermesEngineManager';
import type {
  CoworkContinueOptions,
  CoworkRuntime,
  CoworkRuntimeEvents,
  CoworkStartOptions,
} from './types';

const STREAMING_TEXT_MAX_CHARS = 120_000;
const HISTORY_MAX_MESSAGES = 32;
const HISTORY_MAX_MESSAGE_CHARS = 12_000;
const CONTENT_TRUNCATED_HINT = '\n...[truncated to prevent memory pressure]';

type HermesRuntimeAdapterDeps = {
  store: CoworkStore;
  engineManager: HermesEngineManager;
  ensureRunning: () => Promise<HermesEngineStatus>;
};

type ActiveHermesSession = {
  sessionId: string;
  controller: AbortController;
  assistantMessageId: string | null;
  assistantContent: string;
};

type OpenAIMessage =
  | { role: 'system' | 'assistant'; content: string }
  | { role: 'user'; content: string | Array<Record<string, unknown>> };

const truncateLargeContent = (content: string, maxChars: number): string => {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}${CONTENT_TRUNCATED_HINT}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

const firstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
};

export class HermesRuntimeAdapter extends EventEmitter implements CoworkRuntime {
  private readonly store: CoworkStore;
  private readonly engineManager: HermesEngineManager;
  private readonly ensureRunning: () => Promise<HermesEngineStatus>;
  private readonly activeSessions = new Map<string, ActiveHermesSession>();
  private readonly stoppedSessions = new Set<string>();

  constructor(deps: HermesRuntimeAdapterDeps) {
    super();
    this.store = deps.store;
    this.engineManager = deps.engineManager;
    this.ensureRunning = deps.ensureRunning;
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
      active.controller.abort();
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
    // Hermes Agent runs through its managed gateway. Permission UI mapping can
    // be added once Hermes exposes structured approval events.
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

    const engineStatus = await this.ensureRunning();
    if (engineStatus.phase !== 'running') {
      this.handleError(sessionId, engineStatus.message || 'Hermes Agent gateway is not ready.');
      return;
    }

    const connection = this.engineManager.getConnectionInfo();
    if (!connection.url || !connection.token) {
      this.handleError(sessionId, 'Hermes Agent gateway connection info is unavailable.');
      return;
    }

    const controller = new AbortController();
    const active: ActiveHermesSession = {
      sessionId,
      controller,
      assistantMessageId: null,
      assistantContent: '',
    };
    this.activeSessions.set(sessionId, active);

    try {
      const messages = this.buildMessages(
        sessionId,
        prompt,
        options.systemPrompt ?? session.systemPrompt,
        options.imageAttachments,
      );
      await this.callHermesApi(active, connection.url, connection.token, messages);
      if (!active.assistantContent.trim()) {
        throw new Error('Hermes Agent returned no visible response. Check the Hermes Agent model provider and gateway logs for details.');
      }
      this.finalizeAssistant(active);
      this.activeSessions.delete(sessionId);

      if (this.stoppedSessions.has(sessionId)) {
        this.store.updateSession(sessionId, { status: 'idle' });
        this.emit('sessionStopped', sessionId);
        return;
      }

      this.store.updateSession(sessionId, { status: 'completed', claudeSessionId: connection.version });
      this.emit('complete', sessionId, connection.version);
    } catch (error) {
      this.activeSessions.delete(sessionId);
      if (this.stoppedSessions.has(sessionId)) {
        this.store.updateSession(sessionId, { status: 'idle' });
        this.emit('sessionStopped', sessionId);
        return;
      }
      this.handleError(sessionId, error instanceof Error ? error.message : String(error));
    }
  }

  private buildMessages(
    sessionId: string,
    prompt: string,
    systemPrompt: string,
    imageAttachments?: CoworkStartOptions['imageAttachments'],
  ): OpenAIMessage[] {
    const session = this.store.getSession(sessionId);
    const messages: OpenAIMessage[] = [];
    if (systemPrompt.trim()) {
      messages.push({ role: 'system', content: systemPrompt.trim() });
    }

    const history = [...(session?.messages ?? [])];
    const last = history[history.length - 1];
    if (last?.type === 'user' && last.content === prompt) {
      history.pop();
    }

    const selected = history
      .filter((message) => message.type === 'user' || message.type === 'assistant')
      .slice(-HISTORY_MAX_MESSAGES);
    for (const message of selected) {
      const content = truncateLargeContent(message.content, HISTORY_MAX_MESSAGE_CHARS);
      messages.push({
        role: message.type === 'assistant' ? 'assistant' : 'user',
        content,
      });
    }

    messages.push({
      role: 'user',
      content: this.buildCurrentUserContent(prompt, imageAttachments),
    });
    return messages;
  }

  private buildCurrentUserContent(
    prompt: string,
    imageAttachments?: CoworkStartOptions['imageAttachments'],
  ): string | Array<Record<string, unknown>> {
    if (!imageAttachments?.length) return prompt;
    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: prompt },
    ];
    for (const image of imageAttachments) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimeType};base64,${image.base64Data}`,
          detail: 'auto',
        },
      });
    }
    return content;
  }

  private async callHermesApi(
    active: ActiveHermesSession,
    gatewayUrl: string,
    token: string,
    messages: OpenAIMessage[],
  ): Promise<void> {
    const requestId = randomUUID();
    const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-WeSight-Request-Id': requestId,
      },
      body: JSON.stringify({
        model: 'hermes-agent',
        messages,
        stream: true,
      }),
      signal: active.controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch((): string => '');
      throw new Error(`Hermes Agent API returned ${response.status}: ${detail || response.statusText}`);
    }

    if (!response.body) {
      const payload = await response.json().catch((): null => null);
      const text = this.extractCompletionText(payload);
      if (text) {
        this.replaceAssistant(active, text, true);
      }
      return;
    }

    await this.consumeSseStream(active, response.body);
  }

  private async consumeSseStream(active: ActiveHermesSession, body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        this.handleSseLine(active, line);
      }
    }
    if (buffer.trim()) {
      this.handleSseLine(active, buffer);
    }
  }

  private handleSseLine(active: ActiveHermesSession, line: string): void {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) return;
    const payload = trimmed.startsWith('data:')
      ? trimmed.slice('data:'.length).trim()
      : trimmed;
    if (!payload || payload === '[DONE]') return;

    try {
      const event = JSON.parse(payload);
      const delta = this.extractStreamDelta(event);
      if (delta) {
        this.appendAssistant(active, delta);
      }
      const fullText = this.extractCompletionText(event);
      if (fullText && !delta) {
        this.replaceAssistant(active, fullText, false);
      }
    } catch {
      this.appendAssistant(active, `${payload}\n`);
    }
  }

  private extractStreamDelta(event: unknown): string | null {
    if (!isRecord(event)) return null;
    const choices = Array.isArray(event.choices) ? event.choices : [];
    for (const choice of choices) {
      if (!isRecord(choice)) continue;
      const delta = isRecord(choice.delta) ? choice.delta : {};
      const content = firstString(delta.content, delta.text);
      if (content) return content;
    }
    return firstString(event.delta, event.text);
  }

  private extractCompletionText(event: unknown): string | null {
    if (!isRecord(event)) return null;
    const choices = Array.isArray(event.choices) ? event.choices : [];
    for (const choice of choices) {
      if (!isRecord(choice)) continue;
      const message = isRecord(choice.message) ? choice.message : {};
      const content = firstString(message.content, choice.text);
      if (content) return content;
    }
    return firstString(event.content, event.message);
  }

  private appendAssistant(active: ActiveHermesSession, delta: string): void {
    const next = truncateLargeContent(`${active.assistantContent}${delta}`, STREAMING_TEXT_MAX_CHARS);
    this.replaceAssistant(active, next, false);
  }

  private replaceAssistant(active: ActiveHermesSession, content: string, isFinal: boolean): void {
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

  private finalizeAssistant(active: ActiveHermesSession): void {
    if (!active.assistantMessageId) return;
    this.store.updateMessage(active.sessionId, active.assistantMessageId, {
      content: active.assistantContent,
      metadata: { isStreaming: false, isFinal: true },
    });
    this.emit('messageUpdate', active.sessionId, active.assistantMessageId, active.assistantContent);
  }

  private handleError(sessionId: string, error: string): void {
    if (this.stoppedSessions.has(sessionId)) return;
    if (this.store.getSession(sessionId)?.status === 'error') return;
    this.store.updateSession(sessionId, { status: 'error' });
    this.emit('error', sessionId, error);
  }

}
