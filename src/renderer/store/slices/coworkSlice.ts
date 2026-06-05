import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  ClaudeCodePermissionMode,
  CoworkAgentEngine,
  DeepSeekTuiPermissionMode,
  DefaultCoworkAgentEngine,
  ExternalAgentConfigSource,
  OpenCodePermissionMode,
  QwenCodePermissionMode,
} from '@shared/cowork/constants';
import { type CoworkFileActivity,CoworkFileActivityStatus } from '@shared/cowork/fileActivity';

import type {
  CoworkConfig,
  CoworkMessage,
  CoworkPermissionRequest,
  CoworkSession,
  CoworkSessionStatus,
  CoworkSessionSummary,
} from '../../types/cowork';
import { removeSessionFromState, removeSessionsFromState } from './coworkDeleteState';

export interface DraftAttachment {
  path: string;
  name: string;
  isImage?: boolean;
  dataUrl?: string;
}

interface CoworkState {
  sessions: CoworkSessionSummary[];
  currentSessionId: string | null;
  currentSession: CoworkSession | null;
  draftPrompts: Record<string, string>;
  /** Keyed by draftKey (sessionId or '__home__'), stores pending attachments */
  draftAttachments: Record<string, DraftAttachment[]>;
  /** Keyed by draftKey (sessionId or '__home__'), stores pending message metadata */
  draftMessageMetadata: Record<string, Record<string, unknown>>;
  unreadSessionIds: string[];
  isCoworkActive: boolean;
  isStreaming: boolean;
  remoteManaged: boolean;
  pendingPermissions: CoworkPermissionRequest[];
  liveFileActivitiesBySession: Record<string, CoworkFileActivity[]>;
  config: CoworkConfig;
}

type StreamMessageUpdateMode = 'snapshot' | 'delta' | 'final';

interface StreamMessageUpdatePayload {
  sessionId: string;
  messageId: string;
  content: string;
  mode?: StreamMessageUpdateMode;
  offset?: number;
  sequence?: number;
  finalLength?: number;
}

const initialState: CoworkState = {
  sessions: [],
  currentSessionId: null,
  currentSession: null,
  draftPrompts: {},
  draftAttachments: {},
  draftMessageMetadata: {},
  unreadSessionIds: [],
  isCoworkActive: false,
  isStreaming: false,
  remoteManaged: false,
  pendingPermissions: [],
  liveFileActivitiesBySession: {},
  config: {
    workingDirectory: '',
    systemPrompt: '',
    executionMode: 'local',
    agentEngine: DefaultCoworkAgentEngine,
    openclawConfigSource: ExternalAgentConfigSource.LocalCli,
    claudeCodeConfigSource: ExternalAgentConfigSource.WesightModel,
    claudeCodePermissionMode: ClaudeCodePermissionMode.BypassPermissions,
    codexConfigSource: ExternalAgentConfigSource.LocalCli,
    hermesConfigSource: ExternalAgentConfigSource.WesightModel,
    opencodeConfigSource: ExternalAgentConfigSource.WesightModel,
    opencodePermissionMode: OpenCodePermissionMode.Auto,
    qwenCodeConfigSource: ExternalAgentConfigSource.WesightModel,
    qwenCodePermissionMode: QwenCodePermissionMode.Auto,
    deepseekTuiConfigSource: ExternalAgentConfigSource.WesightModel,
    deepseekTuiPermissionMode: DeepSeekTuiPermissionMode.Auto,
    memoryEnabled: true,
    memoryImplicitUpdateEnabled: true,
    memoryLlmJudgeEnabled: false,
    memoryGuardLevel: 'strict',
    memoryUserMemoriesMaxItems: 12,
  },
};

const markSessionRead = (state: CoworkState, sessionId: string | null) => {
  if (!sessionId) return;
  state.unreadSessionIds = state.unreadSessionIds.filter((id) => id !== sessionId);
};

const markSessionUnread = (state: CoworkState, sessionId: string) => {
  if (state.currentSessionId === sessionId) return;
  if (state.unreadSessionIds.includes(sessionId)) return;
  state.unreadSessionIds.push(sessionId);
};

const STREAMING_MERGE_PROBE_CHARS = 512;

const computeStreamingSuffixPrefixOverlap = (left: string, right: string): number => {
  const leftProbe = left.slice(-STREAMING_MERGE_PROBE_CHARS);
  const rightProbe = right.slice(0, STREAMING_MERGE_PROBE_CHARS);
  const maxOverlap = Math.min(leftProbe.length, rightProbe.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (leftProbe.slice(-size) === rightProbe.slice(0, size)) {
      return size;
    }
  }
  return 0;
};

const mergeStreamingMessageContent = (previousContent: string, incomingContent: string): string => {
  if (!incomingContent) return previousContent;
  if (!previousContent) return incomingContent;
  if (incomingContent === previousContent) return previousContent;

  // Snapshot mode: upstream sends full content each update.
  if (incomingContent.startsWith(previousContent)) {
    return incomingContent;
  }

  // Guard against temporary partial rollback chunks.
  if (previousContent.startsWith(incomingContent)) {
    return previousContent;
  }

  // Another snapshot pattern where previous content is fully contained.
  if (incomingContent.includes(previousContent) && incomingContent.length > previousContent.length) {
    return incomingContent;
  }

  // Delta mode: append the non-overlapping tail.
  const overlap = computeStreamingSuffixPrefixOverlap(previousContent, incomingContent);
  return previousContent + incomingContent.slice(overlap);
};

const applyStructuredStreamingMessageContent = (
  previousContent: string,
  payload: StreamMessageUpdatePayload,
): string => {
  const mode = payload.mode;
  const offset = Math.max(0, payload.offset ?? 0);

  if (mode === 'delta') {
    const before = previousContent.slice(0, offset);
    const afterStart = offset + payload.content.length;
    const after = previousContent.length > afterStart ? previousContent.slice(afterStart) : '';
    const merged = before + payload.content + after;
    return typeof payload.finalLength === 'number' ? merged.slice(0, payload.finalLength) : merged;
  }

  if (mode === 'snapshot' || mode === 'final') {
    const before = previousContent.slice(0, offset);
    const afterStart = offset + payload.content.length;
    const after = previousContent.length > afterStart ? previousContent.slice(afterStart) : '';
    const merged = before + payload.content + after;
    return typeof payload.finalLength === 'number' ? merged.slice(0, payload.finalLength) : merged;
  }

  return mergeStreamingMessageContent(previousContent, payload.content);
};

const coworkSlice = createSlice({
  name: 'cowork',
  initialState,
  reducers: {
    setCoworkActive(state, action: PayloadAction<boolean>) {
      state.isCoworkActive = action.payload;
    },

    setSessions(state, action: PayloadAction<CoworkSessionSummary[]>) {
      state.sessions = action.payload;
      const validSessionIds = new Set(action.payload.map((session) => session.id));
      state.unreadSessionIds = state.unreadSessionIds.filter((id) => {
        return validSessionIds.has(id) && id !== state.currentSessionId;
      });
    },

    setCurrentSessionId(state, action: PayloadAction<string | null>) {
      state.currentSessionId = action.payload;
      markSessionRead(state, action.payload);
    },

    setCurrentSession(state, action: PayloadAction<CoworkSession | null>) {
      state.currentSession = action.payload;
      if (action.payload) {
        state.currentSessionId = action.payload.id;
        if (!action.payload.id.startsWith('temp-')) {
          const { id, title, status, pinned, createdAt, updatedAt } = action.payload;
          const summary: CoworkSessionSummary = {
            id,
            title,
            status,
            pinned: pinned ?? false,
            agentId: action.payload.agentId,
            sessionKind: action.payload.sessionKind,
            parentSessionId: action.payload.parentSessionId,
            teamId: action.payload.teamId,
            runtimeSnapshot: action.payload.runtimeSnapshot,
            createdAt,
            updatedAt,
          };
          const sessionIndex = state.sessions.findIndex((session) => session.id === id);
          if (sessionIndex !== -1) {
            state.sessions[sessionIndex] = {
              ...state.sessions[sessionIndex],
              ...summary,
            };
          } else {
            state.sessions.unshift(summary);
          }
        }
        markSessionRead(state, action.payload.id);
      }
    },

    setDraftPrompt(state, action: PayloadAction<{ sessionId: string; draft: string }>) {
      const { sessionId, draft } = action.payload;
      if (draft) {
        state.draftPrompts[sessionId] = draft;
      } else {
        delete state.draftPrompts[sessionId];
      }
    },

    addSession(state, action: PayloadAction<CoworkSession>) {
      const summary: CoworkSessionSummary = {
        id: action.payload.id,
        title: action.payload.title,
        status: action.payload.status,
        pinned: action.payload.pinned ?? false,
        agentId: action.payload.agentId,
        sessionKind: action.payload.sessionKind,
        parentSessionId: action.payload.parentSessionId,
        teamId: action.payload.teamId,
        runtimeSnapshot: action.payload.runtimeSnapshot,
        createdAt: action.payload.createdAt,
        updatedAt: action.payload.updatedAt,
      };
      state.sessions.unshift(summary);
      state.currentSession = action.payload;
      state.currentSessionId = action.payload.id;
      markSessionRead(state, action.payload.id);
    },

    updateSessionStatus(state, action: PayloadAction<{ sessionId: string; status: CoworkSessionStatus }>) {
      const { sessionId, status } = action.payload;

      // Update in sessions list
      const sessionIndex = state.sessions.findIndex(s => s.id === sessionId);
      if (sessionIndex !== -1) {
        state.sessions[sessionIndex].status = status;
        state.sessions[sessionIndex].updatedAt = Date.now();
      }

      // Update current session if applicable
      if (state.currentSession?.id === sessionId) {
        state.currentSession.status = status;
        state.currentSession.updatedAt = Date.now();
        // Streaming state is tied to the currently opened session only
        state.isStreaming = status === 'running';
      }
    },

    deleteSession(state, action: PayloadAction<string>) {
      removeSessionFromState(state, action.payload);
      delete state.liveFileActivitiesBySession[action.payload];
    },

    deleteSessions(state, action: PayloadAction<string[]>) {
      removeSessionsFromState(state, action.payload);
      action.payload.forEach((sessionId) => {
        delete state.liveFileActivitiesBySession[sessionId];
      });
    },

    addMessage(state, action: PayloadAction<{ sessionId: string; message: CoworkMessage }>) {
      const { sessionId, message } = action.payload;

      if (state.currentSession?.id === sessionId) {
        const exists = state.currentSession.messages.some((item) => item.id === message.id);
        if (!exists) {
          state.currentSession.messages.push(message);
          state.currentSession.updatedAt = message.timestamp;
        }
      }

      // Update session in list
      const sessionIndex = state.sessions.findIndex(s => s.id === sessionId);
      if (sessionIndex !== -1) {
        state.sessions[sessionIndex].updatedAt = message.timestamp;
      }

      markSessionUnread(state, sessionId);
    },

    prependMessages(state, action: PayloadAction<{ sessionId: string; messages: CoworkMessage[] }>) {
      const { sessionId, messages } = action.payload;
      if (messages.length === 0 || state.currentSession?.id !== sessionId) return;
      const existingIds = new Set(state.currentSession.messages.map((message) => message.id));
      const newMessages = messages.filter((message) => !existingIds.has(message.id));
      if (newMessages.length === 0) return;
      state.currentSession.messages = [...newMessages, ...state.currentSession.messages];
    },

    appendMessages(state, action: PayloadAction<{ sessionId: string; messages: CoworkMessage[] }>) {
      const { sessionId, messages } = action.payload;
      if (messages.length === 0 || state.currentSession?.id !== sessionId) return;
      const existingIds = new Set(state.currentSession.messages.map((message) => message.id));
      const newMessages = messages.filter((message) => !existingIds.has(message.id));
      if (newMessages.length === 0) return;
      state.currentSession.messages.push(...newMessages);
      state.currentSession.updatedAt = Math.max(
        state.currentSession.updatedAt,
        ...newMessages.map((message) => message.timestamp),
      );
    },

    updateMessageContent(state, action: PayloadAction<StreamMessageUpdatePayload>) {
      const { sessionId, messageId, content, mode } = action.payload;

      if (state.currentSession?.id === sessionId) {
        const messageIndex = state.currentSession.messages.findIndex(m => m.id === messageId);
        if (messageIndex !== -1) {
          const previousContent = state.currentSession.messages[messageIndex].content || '';
          if (mode) {
            state.currentSession.messages[messageIndex].content = applyStructuredStreamingMessageContent(previousContent, action.payload);
          } else if (state.config.agentEngine === CoworkAgentEngine.YdCowork) {
            state.currentSession.messages[messageIndex].content = mergeStreamingMessageContent(previousContent, content);
          } else {
            state.currentSession.messages[messageIndex].content = content;
          }
        }
      }

      markSessionUnread(state, sessionId);
    },

    setStreaming(state, action: PayloadAction<boolean>) {
      state.isStreaming = action.payload;
    },

    setRemoteManaged(state, action: PayloadAction<boolean>) {
      state.remoteManaged = action.payload;
    },

    updateSessionPinned(state, action: PayloadAction<{ sessionId: string; pinned: boolean }>) {
      const { sessionId, pinned } = action.payload;
      const sessionIndex = state.sessions.findIndex(s => s.id === sessionId);
      if (sessionIndex !== -1) {
        state.sessions[sessionIndex].pinned = pinned;
      }
      if (state.currentSession?.id === sessionId) {
        state.currentSession.pinned = pinned;
      }
    },

    updateSessionTitle(state, action: PayloadAction<{ sessionId: string; title: string }>) {
      const { sessionId, title } = action.payload;
      const sessionIndex = state.sessions.findIndex(s => s.id === sessionId);
      if (sessionIndex !== -1) {
        state.sessions[sessionIndex].title = title;
        state.sessions[sessionIndex].updatedAt = Date.now();
      }
      if (state.currentSession?.id === sessionId) {
        state.currentSession.title = title;
        state.currentSession.updatedAt = Date.now();
      }
    },

    enqueuePendingPermission(state, action: PayloadAction<CoworkPermissionRequest>) {
      const alreadyQueued = state.pendingPermissions.some(
        (permission) => permission.requestId === action.payload.requestId
      );
      if (alreadyQueued) return;
      state.pendingPermissions.push(action.payload);
    },

    dequeuePendingPermission(state, action: PayloadAction<{ requestId?: string } | undefined>) {
      const requestId = action.payload?.requestId;
      if (!requestId) {
        state.pendingPermissions.shift();
        return;
      }
      state.pendingPermissions = state.pendingPermissions.filter(
        (permission) => permission.requestId !== requestId
      );
    },

    clearPendingPermissions(state) {
      state.pendingPermissions = [];
    },

    upsertLiveFileActivity(state, action: PayloadAction<{ sessionId: string; activity: CoworkFileActivity }>) {
      const { sessionId, activity } = action.payload;
      const existing = state.liveFileActivitiesBySession[sessionId] ?? [];
      if (activity.status === CoworkFileActivityStatus.Deleted) {
        const nextActivities = existing.filter((item) => item.filePath !== activity.filePath);
        if (nextActivities.length === 0) {
          delete state.liveFileActivitiesBySession[sessionId];
        } else {
          state.liveFileActivitiesBySession[sessionId] = nextActivities;
        }
        return;
      }
      state.liveFileActivitiesBySession[sessionId] = [
        activity,
        ...existing.filter((item) => item.filePath !== activity.filePath),
      ].slice(0, 20);
    },

    clearLiveFileActivities(state, action: PayloadAction<string>) {
      delete state.liveFileActivitiesBySession[action.payload];
    },

    setConfig(state, action: PayloadAction<CoworkConfig>) {
      state.config = action.payload;
    },

    updateConfig(state, action: PayloadAction<Partial<CoworkConfig>>) {
      state.config = { ...state.config, ...action.payload };
    },

    clearCurrentSession(state) {
      state.currentSessionId = null;
      state.currentSession = null;
      state.isStreaming = false;
      state.remoteManaged = false;
    },

    setDraftAttachments(state, action: PayloadAction<{ draftKey: string; attachments: DraftAttachment[] }>) {
      const { draftKey, attachments } = action.payload;
      if (attachments.length === 0) {
        delete state.draftAttachments[draftKey];
      } else {
        state.draftAttachments[draftKey] = attachments;
      }
    },

    setDraftMessageMetadata(state, action: PayloadAction<{ draftKey: string; metadata?: Record<string, unknown> }>) {
      const { draftKey, metadata } = action.payload;
      if (!metadata || Object.keys(metadata).length === 0) {
        delete state.draftMessageMetadata[draftKey];
      } else {
        state.draftMessageMetadata[draftKey] = metadata;
      }
    },

    addDraftAttachment(state, action: PayloadAction<{ draftKey: string; attachment: DraftAttachment }>) {
      const { draftKey, attachment } = action.payload;
      const existing = state.draftAttachments[draftKey] || [];
      if (existing.some(a => a.path === attachment.path)) return;
      state.draftAttachments[draftKey] = [...existing, attachment];
    },

    clearDraftAttachments(state, action: PayloadAction<string>) {
      delete state.draftAttachments[action.payload];
    },

    clearDraftMessageMetadata(state, action: PayloadAction<string>) {
      delete state.draftMessageMetadata[action.payload];
    },
  },
});

export const {
  setCoworkActive,
  setSessions,
  setCurrentSessionId,
  setCurrentSession,
  setDraftPrompt,
  setDraftAttachments,
  setDraftMessageMetadata,
  addDraftAttachment,
  clearDraftAttachments,
  clearDraftMessageMetadata,
  addSession,
  updateSessionStatus,
  deleteSession,
  deleteSessions,
  addMessage,
  appendMessages,
  prependMessages,
  updateMessageContent,
  setStreaming,
  setRemoteManaged,
  updateSessionPinned,
  updateSessionTitle,
  enqueuePendingPermission,
  dequeuePendingPermission,
  clearPendingPermissions,
  upsertLiveFileActivity,
  clearLiveFileActivities,
  setConfig,
  updateConfig,
  clearCurrentSession,
} = coworkSlice.actions;

export default coworkSlice.reducer;
