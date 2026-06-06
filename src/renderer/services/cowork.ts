import { CoworkAgentEngine } from '@shared/cowork/constants';

import { classifyErrorKey } from '../../common/coworkErrorClassify';
import { store } from '../store';
import {
  addMessage,
  addSession,
  appendMessages,
  clearCurrentSession,
  clearPendingPermissions,
  deleteSession as deleteSessionAction,
  deleteSessions as deleteSessionsAction,
  dequeuePendingPermission,
  enqueuePendingPermission,
  prependMessages,
  setConfig,
  setCurrentSession,
  setRemoteManaged,
  setSessions,
  setStreaming,
  updateMessageContent,
  updateSessionPinned,
  updateSessionStatus,
  updateSessionTitle,
  upsertLiveFileActivity,
} from '../store/slices/coworkSlice';
import type {
  CoworkApiConfig,
  CoworkConfigUpdate,
  CoworkContinueOptions,
  CoworkMemoryStats,
  CoworkMessage,
  CoworkPermissionResult,
  CoworkSession,
  CoworkStartOptions,
  CoworkUserMemoryEntry,
  ExternalAgentCliInstallProgress,
  ExternalAgentCliInstallResult,
  ExternalAgentEnvironmentSnapshot,
  ExternalAgentModelImportResult,
  ExternalAgentProviderAppType,
  ExternalAgentProviderInput,
  ExternalAgentProviderListResult,
  HermesEngineStatus,
  OpenClawEngineStatus,
  RuntimeCallRecord,
  RuntimeMetricsFilters,
  RuntimeMetricsSummary,
  StartupServiceState,
} from '../types/cowork';
import { i18nService } from './i18n';

const classifyError = (error: string): string => {
  const key = classifyErrorKey(error);
  return key ? i18nService.t(key) : error;
};

class CoworkService {
  private streamListenerCleanups: Array<() => void> = [];
  private initialized = false;
  private openClawStatus: OpenClawEngineStatus | null = null;
  private openClawStatusListeners = new Set<(status: OpenClawEngineStatus) => void>();
  private openClawEngineListenerAttached = false;
  private hermesStatus: HermesEngineStatus | null = null;
  private hermesStatusListeners = new Set<(status: HermesEngineStatus) => void>();
  private hermesEngineListenerAttached = false;
  private latestLoadSessionsRequestId = 0;
  private latestLoadSessionRequestId = 0;
  private subscribedSessionId: string | null = null;
  private latestSubscriptionRequestId = 0;

  async init(): Promise<void> {
    if (this.initialized) return;

    // Load initial config
    await this.loadConfig();

    // Load sessions list
    await this.loadSessions();

    // Set up stream listeners
    this.setupStreamListeners();
    this.setupOpenClawEngineListeners();
    this.setupHermesEngineListeners();

    // Managed engine status is not needed for first paint. Refresh it in the
    // background so slow gateway checks cannot delay the initial shell.
    void this.loadOpenClawEngineStatus().catch((error) => {
      console.debug('[CoworkService] failed to load OpenClaw engine status:', error);
    });
    void this.loadHermesEngineStatus().catch((error) => {
      console.debug('[CoworkService] failed to load Hermes engine status:', error);
    });

    this.initialized = true;
  }

  private setupStreamListeners(): void {
    const cowork = window.electron?.cowork;
    if (!cowork) return;

    // Clean up any existing listeners
    this.cleanupListeners();

    // Message listener - also check if session exists (for IM-created sessions)
    const messageCleanup = cowork.onStreamMessage(async ({ sessionId, message }) => {
      // Debug: log user messages to check if imageAttachments are preserved
      if (message.type === 'user') {
        const meta = message.metadata as Record<string, unknown> | undefined;
        console.log('[CoworkService] onStreamMessage received user message', {
          sessionId,
          messageId: message.id,
          hasMetadata: !!meta,
          metadataKeys: meta ? Object.keys(meta) : [],
          hasImageAttachments: !!(meta?.imageAttachments),
          imageAttachmentsCount: Array.isArray(meta?.imageAttachments) ? (meta.imageAttachments as unknown[]).length : 0,
        });
      }
      // Check if session exists in current list
      const state = store.getState().cowork;
      const sessionExists = state.sessions.some(s => s.id === sessionId);

      console.log('[CoworkService] onStreamMessage: sessionId=', sessionId, 'type=', message.type, 'sessionExists=', sessionExists, 'totalSessions=', state.sessions.length);
      if (!sessionExists) {
        // Session was created by IM or another source, refresh the session list
        console.log('[CoworkService] onStreamMessage: session NOT found in Redux, calling loadSessions...');
        await this.loadSessions();
        const newState = store.getState().cowork;
        const nowExists = newState.sessions.some(s => s.id === sessionId);
        console.log('[CoworkService] onStreamMessage: after loadSessions, sessionExists=', nowExists, 'totalSessions=', newState.sessions.length);
      }

      // A new user turn means this session is actively running again
      // (especially important for IM-triggered turns that do not call continueSession from renderer).
      if (message.type === 'user') {
        store.dispatch(updateSessionStatus({ sessionId, status: 'running' }));
      }

      // Do not force status back to "running" on arbitrary messages.
      // Late stream chunks can arrive after an error/complete event.
      store.dispatch(addMessage({ sessionId, message }));
    });
    this.streamListenerCleanups.push(messageCleanup);

    // Message update listener (for streaming content updates)
    const messageUpdateCleanup = cowork.onStreamMessageUpdate((payload) => {
      store.dispatch(updateMessageContent(payload));
    });
    this.streamListenerCleanups.push(messageUpdateCleanup);

    const fileActivityCleanup = cowork.onStreamFileActivity(({ sessionId, activity }) => {
      store.dispatch(upsertLiveFileActivity({ sessionId, activity }));
    });
    this.streamListenerCleanups.push(fileActivityCleanup);

    // Permission request listener
    const permissionCleanup = cowork.onStreamPermission(({ sessionId, request }) => {
      store.dispatch(enqueuePendingPermission({
        sessionId,
        toolName: request.toolName,
        toolInput: request.toolInput,
        requestId: request.requestId,
        toolUseId: request.toolUseId ?? null,
      }));
    });
    this.streamListenerCleanups.push(permissionCleanup);

    // Permission dismiss listener (timeout or server-side resolution)
    const permissionDismissCleanup = cowork.onStreamPermissionDismiss(({ requestId }) => {
      store.dispatch(dequeuePendingPermission({ requestId }));
    });
    this.streamListenerCleanups.push(permissionDismissCleanup);

    // Complete listener
    const completeCleanup = cowork.onStreamComplete(({ sessionId }) => {
      store.dispatch(updateSessionStatus({ sessionId, status: 'completed' }));
    });
    this.streamListenerCleanups.push(completeCleanup);

    // Error listener
    const errorCleanup = cowork.onStreamError(({ sessionId, error }) => {
      store.dispatch(updateSessionStatus({ sessionId, status: 'error' }));
      // Surface the error as a visible message so the user knows what happened.
      if (error) {
        store.dispatch(addMessage({
          sessionId,
          message: {
            id: `error-${Date.now()}`,
            type: 'system',
            content: classifyError(error),
            timestamp: Date.now(),
          },
        }));
      }
    });
    this.streamListenerCleanups.push(errorCleanup);

    // Sessions changed listener (new channel sessions discovered or updated by polling)
    const sessionsChangedCleanup = cowork.onSessionsChanged(() => {
      const beforeState = store.getState().cowork;
      const currentSessionId = beforeState.currentSessionId;

      void this.loadSessions().then(async () => {
        const state = store.getState().cowork;
        const currentSessionStillExists = currentSessionId
          ? state.sessions.some((session) => session.id === currentSessionId)
          : false;
        const currentSessionStillSelected = store.getState().cowork.currentSessionId === currentSessionId;

        if (currentSessionId && currentSessionStillExists && currentSessionStillSelected) {
          await this.loadSession(currentSessionId);
        }
      }).catch((err) => {
        console.error('[CoworkService] failed to refresh cowork sessions:', err);
      });
    });
    this.streamListenerCleanups.push(sessionsChangedCleanup);
  }

  private setupOpenClawEngineListeners(): void {
    if (this.openClawEngineListenerAttached) return;
    const engineApi = window.electron?.openclaw?.engine;
    if (!engineApi?.onProgress) return;

    const statusCleanup = engineApi.onProgress((status) => {
      this.notifyOpenClawStatus(status);
    });
    this.streamListenerCleanups.push(statusCleanup);
    this.openClawEngineListenerAttached = true;
  }

  private setupHermesEngineListeners(): void {
    if (this.hermesEngineListenerAttached) return;
    const engineApi = window.electron?.hermes?.engine;
    if (!engineApi?.onProgress) return;

    const statusCleanup = engineApi.onProgress((status) => {
      this.notifyHermesStatus(status);
    });
    this.streamListenerCleanups.push(statusCleanup);
    this.hermesEngineListenerAttached = true;
  }

  private notifyOpenClawStatus(status: OpenClawEngineStatus): void {
    this.openClawStatus = status;
    this.openClawStatusListeners.forEach((listener) => {
      listener(status);
    });
  }

  private notifyHermesStatus(status: HermesEngineStatus): void {
    this.hermesStatus = status;
    this.hermesStatusListeners.forEach((listener) => {
      listener(status);
    });
  }

  private notifyActiveManagedEngineStatus(status: OpenClawEngineStatus | HermesEngineStatus): void {
    const activeEngine = store.getState().cowork.config.agentEngine;
    if (activeEngine === CoworkAgentEngine.Hermes) {
      this.notifyHermesStatus(status);
      return;
    }
    this.notifyOpenClawStatus(status);
  }

  private cleanupListeners(): void {
    this.streamListenerCleanups.forEach(cleanup => cleanup());
    this.streamListenerCleanups = [];
    this.openClawEngineListenerAttached = false;
    this.hermesEngineListenerAttached = false;
  }

  private async subscribeToSession(sessionId: string): Promise<void> {
    const cowork = window.electron?.cowork;
    if (!cowork?.subscribeSession) return;
    if (this.subscribedSessionId === sessionId) return;
    const requestId = ++this.latestSubscriptionRequestId;
    const previousSessionId = this.subscribedSessionId;
    this.subscribedSessionId = null;
    if (previousSessionId && cowork.unsubscribeSession) {
      await cowork.unsubscribeSession(previousSessionId).catch((error) => {
        console.debug('[CoworkService] failed to unsubscribe from previous session stream:', error);
      });
    }
    const result = await cowork.subscribeSession(sessionId).catch((error) => {
      console.debug('[CoworkService] failed to subscribe to session stream:', error);
      return null;
    });
    if (requestId !== this.latestSubscriptionRequestId) {
      if (result?.success) {
        await cowork.unsubscribeSession?.(sessionId)?.catch((error) => {
          console.debug('[CoworkService] failed to unsubscribe from stale session stream:', error);
        });
      }
      return;
    }
    if (result?.success) {
      this.subscribedSessionId = sessionId;
    }
  }

  private async unsubscribeCurrentSession(): Promise<void> {
    const cowork = window.electron?.cowork;
    this.latestSubscriptionRequestId += 1;
    const sessionId = this.subscribedSessionId;
    if (!sessionId) return;
    this.subscribedSessionId = null;
    await cowork?.unsubscribeSession?.(sessionId)?.catch((error) => {
      console.debug('[CoworkService] failed to unsubscribe from session stream:', error);
    });
  }

  async loadSessions(agentId?: string): Promise<void> {
    const startedAt = performance.now();
    const requestId = ++this.latestLoadSessionsRequestId;
    await this.syncCodexAppTasksForCurrentConfig(agentId);
    const result = await window.electron?.cowork?.listSessions(agentId);
    if (result?.success && result.sessions) {
      // High-frequency IM traffic can trigger overlapping list refreshes.
      // Ignore stale responses so an older snapshot does not hide newer sessions.
      if (requestId !== this.latestLoadSessionsRequestId) {
        return;
      }
      store.dispatch(setSessions(result.sessions));
    }
    void window.electron?.cowork?.reportRendererReady?.({
      recentSessionsLoadedMs: Math.round(performance.now() - startedAt),
    })?.catch(() => {});
  }

  async loadConfig(): Promise<void> {
    const startedAt = performance.now();
    const result = await window.electron?.cowork?.getConfig();
    if (result?.success && result.config) {
      store.dispatch(setConfig(result.config));
    }
    void window.electron?.cowork?.reportRendererReady?.({
      configLoadedMs: Math.round(performance.now() - startedAt),
    })?.catch(() => {});
  }

  async getStartupServicesStatus(): Promise<StartupServiceState[]> {
    const result = await window.electron?.cowork?.getStartupServicesStatus?.();
    return result?.success && result.services ? result.services : [];
  }

  onStartupServicesChanged(callback: (services: StartupServiceState[]) => void): () => void {
    return window.electron?.cowork?.onStartupServicesChanged?.(callback) ?? (() => {});
  }

  async loadOpenClawEngineStatus(): Promise<OpenClawEngineStatus | null> {
    this.setupOpenClawEngineListeners();
    const engineApi = window.electron?.openclaw?.engine;
    if (!engineApi?.getStatus) {
      return null;
    }
    const result = await engineApi.getStatus();
    if (result?.success && result.status) {
      this.notifyOpenClawStatus(result.status);
      return result.status;
    }
    return this.openClawStatus;
  }

  async loadHermesEngineStatus(): Promise<HermesEngineStatus | null> {
    this.setupHermesEngineListeners();
    const engineApi = window.electron?.hermes?.engine;
    if (!engineApi?.getStatus) {
      return null;
    }
    const result = await engineApi.getStatus();
    if (result?.success && result.status) {
      this.notifyHermesStatus(result.status);
      return result.status;
    }
    return this.hermesStatus;
  }

  async getCodexAppStatus() {
    const engineApi = window.electron?.codexApp?.engine;
    if (!engineApi?.getStatus) {
      return null;
    }
    const result = await engineApi.getStatus();
    return result?.status ?? null;
  }

  async startCodexApp() {
    const engineApi = window.electron?.codexApp?.engine;
    if (!engineApi?.start) {
      return { success: false, error: 'Codex App API not available' };
    }
    return engineApi.start();
  }

  async syncCodexAppTasks(options?: { cwd?: string; includeAll?: boolean; limit?: number }) {
    const tasksApi = window.electron?.codexApp?.tasks;
    if (!tasksApi?.sync) {
      return { success: false, error: 'Codex App task API not available' };
    }
    return tasksApi.sync(options);
  }

  async openCodexAppTask(threadId: string) {
    const tasksApi = window.electron?.codexApp?.tasks;
    if (!tasksApi?.open) {
      return { success: false, error: 'Codex App task API not available' };
    }
    return tasksApi.open({ threadId });
  }

  private async syncCodexAppTasksForCurrentConfig(agentId?: string): Promise<void> {
    if (agentId) return;
    const state = store.getState().cowork;
    if (state.config.agentEngine !== CoworkAgentEngine.CodexApp) return;
    const tasksApi = window.electron?.codexApp?.tasks;
    if (!tasksApi?.sync) return;
    try {
      await tasksApi.sync({
        cwd: state.config.workingDirectory,
        includeAll: false,
        limit: 50,
      });
    } catch (error) {
      console.debug('[CoworkService] Codex App task sync failed:', error);
    }
  }

  async startSession(options: CoworkStartOptions): Promise<{ session: CoworkSession | null; error?: string }> {
    const cowork = window.electron?.cowork;
    if (!cowork) {
      console.error('Cowork API not available');
      return { session: null, error: 'Cowork API not available' };
    }

    store.dispatch(setStreaming(true));

    const result = await cowork.startSession(options);
    if (result.success && result.session) {
      await this.subscribeToSession(result.session.id);
      store.dispatch(addSession(result.session));
      if (result.session.status !== 'running') {
        store.dispatch(setStreaming(false));
      }
      return { session: result.session };
    }

    if (result.engineStatus) {
      this.notifyActiveManagedEngineStatus(result.engineStatus);
    }

    // Show a user-visible error when session start fails
    if (result.error) {
      const errorContent = result.code === 'ENGINE_NOT_READY'
        ? i18nService.t('coworkErrorEngineNotReady')
        : classifyError(result.error);
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: errorContent }));
    }

    store.dispatch(setStreaming(false));
    console.error('Failed to start session:', result.error);
    return { session: null, error: result.error };
  }

  async continueSession(options: CoworkContinueOptions): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork) {
      console.error('Cowork API not available');
      return false;
    }

    store.dispatch(setStreaming(true));
    store.dispatch(updateSessionStatus({ sessionId: options.sessionId, status: 'running' }));
    await this.subscribeToSession(options.sessionId);

    const result = await cowork.continueSession({
      sessionId: options.sessionId,
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      activeSkillIds: options.activeSkillIds,
      modelOverride: options.modelOverride,
      imageAttachments: options.imageAttachments,
    });
    if (!result.success) {
      store.dispatch(setStreaming(false));
      if (result.engineStatus) {
        this.notifyActiveManagedEngineStatus(result.engineStatus);
      }
      if (result.code !== 'ENGINE_NOT_READY') {
        store.dispatch(updateSessionStatus({ sessionId: options.sessionId, status: 'error' }));
        if (result.error) {
          store.dispatch(addMessage({
            sessionId: options.sessionId,
            message: {
              id: `error-${Date.now()}`,
              type: 'system',
              content: i18nService.t('coworkErrorSessionContinueFailed').replace('{error}', result.error),
              timestamp: Date.now(),
            },
          }));
        }
      }
      // Show a user-visible error message in the session
      if (result.error) {
        const errorContent = result.code === 'ENGINE_NOT_READY'
          ? i18nService.t('coworkErrorEngineNotReady')
          : classifyError(result.error);
        store.dispatch(addMessage({
          sessionId: options.sessionId,
          message: {
            id: `error-${Date.now()}`,
            type: 'system',
            content: errorContent,
            timestamp: Date.now(),
          },
        }));
      }
      console.error('Failed to continue session:', result.error);
      return false;
    }

    return true;
  }

  async stopSession(sessionId: string): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork) return false;

    const result = await cowork.stopSession(sessionId);
    if (result.success) {
      store.dispatch(setStreaming(false));
      store.dispatch(updateSessionStatus({ sessionId, status: 'idle' }));
      return true;
    }

    console.error('Failed to stop session:', result.error);
    return false;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork) return false;

    const result = await cowork.deleteSession(sessionId);
    if (result.success) {
      store.dispatch(deleteSessionAction(sessionId));
      return true;
    }

    console.error('Failed to delete session:', result.error);
    return false;
  }

  async deleteSessions(sessionIds: string[]): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork) return false;

    const result = await cowork.deleteSessions(sessionIds);
    if (result.success) {
      store.dispatch(deleteSessionsAction(sessionIds));
      return true;
    }

    console.error('Failed to batch delete sessions:', result.error);
    return false;
  }

  async setSessionPinned(sessionId: string, pinned: boolean): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork?.setSessionPinned) return false;

    const result = await cowork.setSessionPinned({ sessionId, pinned });
    if (result.success) {
      store.dispatch(updateSessionPinned({ sessionId, pinned }));
      return true;
    }

    console.error('Failed to update session pin:', result.error);
    return false;
  }

  async renameSession(sessionId: string, title: string): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork?.renameSession) return false;

    const normalizedTitle = title.trim();
    if (!normalizedTitle) return false;

    const result = await cowork.renameSession({ sessionId, title: normalizedTitle });
    if (result.success) {
      store.dispatch(updateSessionTitle({ sessionId, title: normalizedTitle }));
      return true;
    }

    console.error('Failed to rename session:', result.error);
    return false;
  }

  async exportSessionResultImage(options: {
    rect: { x: number; y: number; width: number; height: number };
    defaultFileName?: string;
  }): Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }> {
    const cowork = window.electron?.cowork;
    if (!cowork?.exportResultImage) {
      return { success: false, error: 'Cowork export API not available' };
    }

    try {
      const result = await cowork.exportResultImage(options);
      return result ?? { success: false, error: 'Failed to export session image' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export session image',
      };
    }
  }

  async captureSessionImageChunk(options: {
    rect: { x: number; y: number; width: number; height: number };
  }): Promise<{ success: boolean; width?: number; height?: number; pngBase64?: string; error?: string }> {
    const cowork = window.electron?.cowork;
    if (!cowork?.captureImageChunk) {
      return { success: false, error: 'Cowork capture API not available' };
    }

    try {
      const result = await cowork.captureImageChunk(options);
      return result ?? { success: false, error: 'Failed to capture session image chunk' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to capture session image chunk',
      };
    }
  }

  async saveSessionResultImage(options: {
    pngBase64: string;
    defaultFileName?: string;
  }): Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }> {
    const cowork = window.electron?.cowork;
    if (!cowork?.saveResultImage) {
      return { success: false, error: 'Cowork save image API not available' };
    }

    try {
      const result = await cowork.saveResultImage(options);
      return result ?? { success: false, error: 'Failed to save session image' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save session image',
      };
    }
  }

  async loadSession(sessionId: string): Promise<CoworkSession | null> {
    const cowork = window.electron?.cowork;
    if (!cowork) return null;
    const requestId = ++this.latestLoadSessionRequestId;
    await this.subscribeToSession(sessionId);

    if (!cowork.getSessionMeta || !cowork.getRecentMessages) {
      return this.loadSessionLegacy(sessionId, requestId);
    }

    const [metaResult, messagesResult] = await Promise.all([
      cowork.getSessionMeta(sessionId),
      cowork.getRecentMessages({ sessionId, limit: 120 }),
    ]);

    if (metaResult.success && metaResult.session) {
      let session: CoworkSession = {
        ...metaResult.session,
        messages: messagesResult.success ? messagesResult.messages || [] : [],
      };

      if (session.codexAppThreadId) {
        const shouldRefreshCodexThread = session.messages.length === 0
          || session.status === 'running';
        if (shouldRefreshCodexThread) {
          await this.openCodexAppTask(session.codexAppThreadId).catch((error) => {
            console.debug('[CoworkService] Codex App thread read failed:', error);
          });
          const [refreshedMetaResult, refreshedMessagesResult] = await Promise.all([
            cowork.getSessionMeta(sessionId),
            cowork.getRecentMessages({ sessionId, limit: 120 }),
          ]);
          if (refreshedMetaResult.success && refreshedMetaResult.session) {
            session = {
              ...refreshedMetaResult.session,
              messages: refreshedMessagesResult.success ? refreshedMessagesResult.messages || [] : [],
            };
          }
        }
      }

      // Keep only the latest session load result to avoid stale async overwrites.
      if (requestId !== this.latestLoadSessionRequestId) {
        return session;
      }
      store.dispatch(setCurrentSession(session));
      store.dispatch(setStreaming(session.status === 'running'));

      const imResult = await cowork.remoteManaged(sessionId);
      if (requestId === this.latestLoadSessionRequestId) {
        store.dispatch(setRemoteManaged(imResult?.remoteManaged ?? false));
      }

      return session;
    }

    if (requestId === this.latestLoadSessionRequestId) {
      await this.unsubscribeCurrentSession();
    }
    console.error('Failed to load session:', metaResult.error || messagesResult.error);
    return null;
  }

  private async loadSessionLegacy(sessionId: string, requestId: number): Promise<CoworkSession | null> {
    const cowork = window.electron?.cowork;
    if (!cowork) return null;
    let result = await cowork.getSession(sessionId);
    if (result.success && result.session?.codexAppThreadId) {
      const shouldRefreshCodexThread = result.session.messages.length === 0
        || result.session.status === 'running';
      if (shouldRefreshCodexThread) {
        await this.openCodexAppTask(result.session.codexAppThreadId).catch((error) => {
          console.debug('[CoworkService] Codex App thread read failed:', error);
        });
        result = await cowork.getSession(sessionId);
      }
    }
    if (result.success && result.session) {
      // Keep only the latest session load result to avoid stale async overwrites.
      if (requestId !== this.latestLoadSessionRequestId) {
        return result.session;
      }
      store.dispatch(setCurrentSession(result.session));
      store.dispatch(setStreaming(result.session.status === 'running'));

      const imResult = await cowork.remoteManaged(sessionId);
      if (requestId === this.latestLoadSessionRequestId) {
        store.dispatch(setRemoteManaged(imResult?.remoteManaged ?? false));
      }

      return result.session;
    }

    if (requestId === this.latestLoadSessionRequestId) {
      await this.unsubscribeCurrentSession();
    }
    console.error('Failed to load session:', result.error);
    return null;
  }

  async loadOlderMessages(sessionId: string, beforeSequence: number, limit: number = 100): Promise<CoworkMessage[]> {
    const cowork = window.electron?.cowork;
    if (!cowork?.getMessagesBefore) return [];
    const result = await cowork.getMessagesBefore({ sessionId, sequence: beforeSequence, limit });
    if (result.success && result.messages?.length) {
      store.dispatch(prependMessages({ sessionId, messages: result.messages }));
      return result.messages;
    }
    return [];
  }

  async loadMessagesAfter(sessionId: string, sequence: number): Promise<CoworkMessage[]> {
    const cowork = window.electron?.cowork;
    if (!cowork?.getMessagesAfter) return [];
    const result = await cowork.getMessagesAfter({ sessionId, sequence });
    if (result.success && result.messages?.length) {
      store.dispatch(appendMessages({ sessionId, messages: result.messages }));
      return result.messages;
    }
    return [];
  }

  async respondToPermission(requestId: string, result: CoworkPermissionResult): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork) return false;

    const response = await cowork.respondToPermission({ requestId, result });
    if (response.success) {
      store.dispatch(dequeuePendingPermission({ requestId }));
      return true;
    }

    console.error('Failed to respond to permission:', response.error);
    return false;
  }

  async updateConfig(config: CoworkConfigUpdate): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork) return false;

    const currentConfig = store.getState().cowork.config;
    const engineChanged = config.agentEngine !== undefined
      && config.agentEngine !== currentConfig.agentEngine;
    const result = await cowork.setConfig(config);
    if (result.success) {
      store.dispatch(setConfig({ ...currentConfig, ...config }));
      if (engineChanged) {
        store.dispatch(clearPendingPermissions());
        store.dispatch(setStreaming(false));
      }
      return true;
    }

    console.error('Failed to update config:', result.error);
    return false;
  }

  async getAgentEngineSnapshot(options: {
    forceRefresh?: boolean;
    appTypes?: ExternalAgentProviderAppType[];
  } = {}): Promise<ExternalAgentEnvironmentSnapshot | null> {
    const api = window.electron?.cowork?.listAgentEngines;
    if (!api) return null;
    const result = await api(options);
    if (!result?.success || !result.snapshot) {
      return null;
    }
    return result.snapshot;
  }

  onAgentEnginesChanged(callback: (snapshot: ExternalAgentEnvironmentSnapshot) => void): () => void {
    return window.electron?.cowork?.onAgentEnginesChanged?.((result) => {
      if (result?.success && result.snapshot) {
        callback(result.snapshot);
      }
    }) ?? (() => {});
  }

  async getRuntimeMetricsSummary(filters: RuntimeMetricsFilters): Promise<RuntimeMetricsSummary | null> {
    const api = window.electron?.cowork?.getRuntimeMetricsSummary;
    if (!api) return null;
    const result = await api(filters);
    if (!result?.success || !result.summary) {
      return null;
    }
    return result.summary;
  }

  async listRuntimeCalls(filters: RuntimeMetricsFilters): Promise<{ total: number; calls: RuntimeCallRecord[] }> {
    const api = window.electron?.cowork?.listRuntimeCalls;
    if (!api) return { total: 0, calls: [] };
    const result = await api(filters);
    if (!result?.success) {
      return { total: 0, calls: [] };
    }
    return {
      total: result.total ?? 0,
      calls: result.calls ?? [],
    };
  }

  async getRuntimeCallDetail(callId: string): Promise<RuntimeCallRecord | null> {
    const api = window.electron?.cowork?.getRuntimeCallDetail;
    if (!api) return null;
    const result = await api(callId);
    if (!result?.success) {
      return null;
    }
    return result.call ?? null;
  }

  async ensureStudioAssets() {
    const api = window.electron?.cowork?.ensureStudioAssets;
    if (!api) return null;
    return api();
  }

  async installAgentCli(appType: ExternalAgentProviderAppType): Promise<ExternalAgentCliInstallResult> {
    const api = window.electron?.cowork?.installAgentCli;
    if (!api) return { success: false, error: 'Cowork CLI installer API not available' };
    return api(appType);
  }

  onAgentCliInstallProgress(listener: (progress: ExternalAgentCliInstallProgress) => void): () => void {
    const api = window.electron?.cowork?.onAgentCliInstallProgress;
    if (!api) return () => {};
    return api(listener);
  }

  async listAgentProviders(appType: ExternalAgentProviderAppType): Promise<ExternalAgentProviderListResult> {
    const api = window.electron?.cowork?.listAgentProviders;
    if (!api) return { success: false, error: 'Cowork provider API not available' };
    return api(appType);
  }

  async saveAgentProvider(input: ExternalAgentProviderInput): Promise<ExternalAgentProviderListResult> {
    const api = window.electron?.cowork?.saveAgentProvider;
    if (!api) return { success: false, error: 'Cowork provider API not available' };
    return api(input);
  }

  async deleteAgentProvider(
    appType: ExternalAgentProviderAppType,
    id: string,
  ): Promise<ExternalAgentProviderListResult> {
    const api = window.electron?.cowork?.deleteAgentProvider;
    if (!api) return { success: false, error: 'Cowork provider API not available' };
    return api({ appType, id });
  }

  async setCurrentAgentProvider(
    appType: ExternalAgentProviderAppType,
    id: string,
  ): Promise<ExternalAgentProviderListResult> {
    const api = window.electron?.cowork?.setCurrentAgentProvider;
    if (!api) return { success: false, error: 'Cowork provider API not available' };
    return api({ appType, id });
  }

  async importLiveAgentProvider(appType: ExternalAgentProviderAppType): Promise<ExternalAgentProviderListResult> {
    const api = window.electron?.cowork?.importLiveAgentProvider;
    if (!api) return { success: false, error: 'Cowork provider API not available' };
    return api(appType);
  }

  async importLocalAgentConfigToModelSettings(appType: ExternalAgentProviderAppType): Promise<ExternalAgentModelImportResult> {
    const api = window.electron?.cowork?.importLocalAgentConfigToModelSettings;
    if (!api) return { success: false, error: 'Cowork model import API not available' };
    return api(appType);
  }

  async syncOpenCodeGlobalConfig(): Promise<ExternalAgentProviderListResult> {
    const api = window.electron?.cowork?.syncOpenCodeGlobalConfig;
    if (!api) return { success: false, error: 'Cowork OpenCode sync API not available' };
    return api();
  }

  async syncOpenClawGlobalConfig(): Promise<{ success: boolean; changed?: boolean; status?: OpenClawEngineStatus; error?: string }> {
    const api = window.electron?.cowork?.syncOpenClawGlobalConfig;
    if (!api) return { success: false, error: 'Cowork OpenClaw sync API not available' };
    return api();
  }

  async syncQwenCodeGlobalConfig(): Promise<ExternalAgentProviderListResult> {
    const api = window.electron?.cowork?.syncQwenCodeGlobalConfig;
    if (!api) return { success: false, error: 'Cowork Qwen Code sync API not available' };
    return api();
  }

  async syncDeepSeekTuiGlobalConfig(): Promise<ExternalAgentProviderListResult> {
    const api = window.electron?.cowork?.syncDeepSeekTuiGlobalConfig;
    if (!api) return { success: false, error: 'Cowork DeepSeek-TUI sync API not available' };
    return api();
  }

  async getApiConfig(): Promise<CoworkApiConfig | null> {
    if (!window.electron?.getApiConfig) {
      return null;
    }
    return window.electron.getApiConfig();
  }

  async checkApiConfig(options?: { probeModel?: boolean }): Promise<{ hasConfig: boolean; config: CoworkApiConfig | null; error?: string } | null> {
    if (!window.electron?.checkApiConfig) {
      return null;
    }
    return window.electron.checkApiConfig(options);
  }

  async saveApiConfig(config: CoworkApiConfig): Promise<{ success: boolean; error?: string } | null> {
    if (!window.electron?.saveApiConfig) {
      return null;
    }
    return window.electron.saveApiConfig(config);
  }

  async listMemoryEntries(input: {
    query?: string;
    limit?: number;
    offset?: number;
  }): Promise<CoworkUserMemoryEntry[]> {
    const api = window.electron?.cowork?.listMemoryEntries;
    if (!api) return [];
    const result = await api(input);
    if (!result?.success || !result.entries) return [];
    return result.entries;
  }

  async createMemoryEntry(input: {
    text: string;
  }): Promise<CoworkUserMemoryEntry | null> {
    const api = window.electron?.cowork?.createMemoryEntry;
    if (!api) return null;
    const result = await api(input);
    if (!result?.success || !result.entry) return null;
    return result.entry;
  }

  async updateMemoryEntry(input: {
    id: string;
    text: string;
  }): Promise<CoworkUserMemoryEntry | null> {
    const api = window.electron?.cowork?.updateMemoryEntry;
    if (!api) return null;
    const result = await api(input);
    if (!result?.success || !result.entry) return null;
    return result.entry;
  }

  async deleteMemoryEntry(input: { id: string }): Promise<boolean> {
    const api = window.electron?.cowork?.deleteMemoryEntry;
    if (!api) return false;
    const result = await api(input);
    return Boolean(result?.success);
  }

  async getMemoryStats(): Promise<CoworkMemoryStats | null> {
    const api = window.electron?.cowork?.getMemoryStats;
    if (!api) return null;
    const result = await api();
    if (!result?.success || !result.stats) return null;
    return result.stats;
  }

  async readBootstrapFile(filename: string): Promise<string> {
    const api = window.electron?.cowork?.readBootstrapFile;
    if (!api) return '';
    const result = await api(filename);
    if (!result?.success) {
      console.warn(`[CoworkService] readBootstrapFile: failed to read ${filename}`, result?.error);
      return '';
    }
    return result.content || '';
  }

  async writeBootstrapFile(filename: string, content: string): Promise<boolean> {
    const api = window.electron?.cowork?.writeBootstrapFile;
    if (!api) return false;
    const result = await api(filename, content);
    return Boolean(result?.success);
  }

  onOpenClawEngineStatus(callback: (status: OpenClawEngineStatus) => void): () => void {
    this.setupOpenClawEngineListeners();
    this.openClawStatusListeners.add(callback);
    if (this.openClawStatus) {
      callback(this.openClawStatus);
    }
    return () => {
      this.openClawStatusListeners.delete(callback);
    };
  }

  async getOpenClawEngineStatus(): Promise<OpenClawEngineStatus | null> {
    return this.loadOpenClawEngineStatus();
  }

  async installOpenClawEngine(): Promise<OpenClawEngineStatus | null> {
    const engineApi = window.electron?.openclaw?.engine;
    if (!engineApi?.install) {
      return null;
    }
    const result = await engineApi.install();
    if (result?.status) {
      this.notifyOpenClawStatus(result.status);
      return result.status;
    }
    return this.openClawStatus;
  }

  async retryOpenClawInstall(): Promise<OpenClawEngineStatus | null> {
    const engineApi = window.electron?.openclaw?.engine;
    if (!engineApi?.retryInstall) {
      return null;
    }
    const result = await engineApi.retryInstall();
    if (result?.status) {
      this.notifyOpenClawStatus(result.status);
      return result.status;
    }
    return this.openClawStatus;
  }

  async restartOpenClawGateway(): Promise<OpenClawEngineStatus | null> {
    const engineApi = window.electron?.openclaw?.engine;
    if (!engineApi?.restartGateway) {
      return null;
    }
    const result = await engineApi.restartGateway();
    if (result?.status) {
      this.notifyOpenClawStatus(result.status);
      return result.status;
    }
    return this.openClawStatus;
  }

  onHermesEngineStatus(callback: (status: HermesEngineStatus) => void): () => void {
    this.setupHermesEngineListeners();
    this.hermesStatusListeners.add(callback);
    if (this.hermesStatus) {
      callback(this.hermesStatus);
    }
    return () => {
      this.hermesStatusListeners.delete(callback);
    };
  }

  async getHermesEngineStatus(): Promise<HermesEngineStatus | null> {
    return this.loadHermesEngineStatus();
  }

  async installHermesEngine(): Promise<HermesEngineStatus | null> {
    const engineApi = window.electron?.hermes?.engine;
    if (!engineApi?.install) {
      return null;
    }
    const result = await engineApi.install();
    if (result?.status) {
      this.notifyHermesStatus(result.status);
      return result.status;
    }
    return this.hermesStatus;
  }

  async retryHermesInstall(): Promise<HermesEngineStatus | null> {
    const engineApi = window.electron?.hermes?.engine;
    if (!engineApi?.retryInstall) {
      return null;
    }
    const result = await engineApi.retryInstall();
    if (result?.status) {
      this.notifyHermesStatus(result.status);
      return result.status;
    }
    return this.hermesStatus;
  }

  async restartHermesGateway(): Promise<HermesEngineStatus | null> {
    const engineApi = window.electron?.hermes?.engine;
    if (!engineApi?.restartGateway) {
      return null;
    }
    const result = await engineApi.restartGateway();
    if (result?.status) {
      this.notifyHermesStatus(result.status);
      return result.status;
    }
    return this.hermesStatus;
  }

  async generateSessionTitle(prompt: string | null): Promise<string | null> {
    if (!window.electron?.generateSessionTitle) {
      return null;
    }
    return window.electron.generateSessionTitle(prompt);
  }

  async getRecentCwds(limit?: number): Promise<string[]> {
    if (!window.electron?.getRecentCwds) {
      return [];
    }
    return window.electron.getRecentCwds(limit);
  }

  clearSession(): void {
    void this.unsubscribeCurrentSession();
    store.dispatch(clearCurrentSession());
  }

  destroy(): void {
    void this.unsubscribeCurrentSession();
    this.cleanupListeners();
    this.openClawStatusListeners.clear();
    this.hermesStatusListeners.clear();
    this.initialized = false;
  }
}

export const coworkService = new CoworkService();
