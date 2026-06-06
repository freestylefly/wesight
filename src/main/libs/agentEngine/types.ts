import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';

import type {
  CoworkAgentEngine,
  RuntimeCallSource,
} from '../../../shared/cowork/constants';
import type { CoworkModelOverride, CoworkSessionRuntimeSnapshot } from '../../../shared/cowork/runtimeSnapshot';
import type { CoworkMessage } from '../../coworkStore';

export type { CoworkAgentEngine, RuntimeCallSource };

export const ENGINE_SWITCHED_CODE = 'ENGINE_SWITCHED';

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseId?: string | null;
}

export type CoworkRuntimeMetric =
  | {
      type: 'usage';
      inputTokens?: number | null;
      outputTokens?: number | null;
      cacheReadTokens?: number | null;
      cacheWriteTokens?: number | null;
      contextTokens?: number | null;
      tokensEstimated?: boolean;
    }
  | {
      type: 'step';
      label?: string;
    };

export interface CoworkRuntimeEvents {
  message: (sessionId: string, message: CoworkMessage) => void;
  messageUpdate: (sessionId: string, messageId: string, content: string) => void;
  permissionRequest: (sessionId: string, request: PermissionRequest) => void;
  runtimeMetric: (sessionId: string, metric: CoworkRuntimeMetric) => void;
  complete: (sessionId: string, claudeSessionId: string | null) => void;
  error: (sessionId: string, error: string) => void;
  sessionStopped: (sessionId: string) => void;
}

export type CoworkImageAttachment = {
  name: string;
  mimeType: string;
  base64Data: string;
};

export type CoworkStartOptions = {
  skipInitialUserMessage?: boolean;
  skillIds?: string[];
  systemPrompt?: string;
  autoApprove?: boolean;
  workspaceRoot?: string;
  confirmationMode?: 'modal' | 'text';
  imageAttachments?: CoworkImageAttachment[];
  agentId?: string;
  agentEngine?: CoworkAgentEngine;
  modelOverride?: CoworkModelOverride | null;
  runtimeSnapshot?: CoworkSessionRuntimeSnapshot | null;
  runtimeSource?: RuntimeCallSource;
};

export type CoworkContinueOptions = {
  systemPrompt?: string;
  skillIds?: string[];
  imageAttachments?: CoworkImageAttachment[];
  agentId?: string;
  agentEngine?: CoworkAgentEngine;
  modelOverride?: CoworkModelOverride | null;
  runtimeSnapshot?: CoworkSessionRuntimeSnapshot | null;
  runtimeSource?: RuntimeCallSource;
};

export interface CoworkRuntime {
  on<U extends keyof CoworkRuntimeEvents>(
    event: U,
    listener: CoworkRuntimeEvents[U],
  ): this;
  off<U extends keyof CoworkRuntimeEvents>(
    event: U,
    listener: CoworkRuntimeEvents[U],
  ): this;
  startSession(sessionId: string, prompt: string, options?: CoworkStartOptions): Promise<void>;
  continueSession(sessionId: string, prompt: string, options?: CoworkContinueOptions): Promise<void>;
  stopSession(sessionId: string): void;
  stopAllSessions(): void;
  respondToPermission(requestId: string, result: PermissionResult): void;
  isSessionActive(sessionId: string): boolean;
  getSessionConfirmationMode(sessionId: string): 'modal' | 'text' | null;
  onSessionDeleted?(sessionId: string): void;
}
