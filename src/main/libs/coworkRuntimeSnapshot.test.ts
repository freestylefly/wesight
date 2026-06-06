import { describe, expect, test } from 'vitest';

import {
  CoworkAgentEngine,
  ExternalAgentConfigSource,
} from '../../shared/cowork/constants';
import type { CoworkSessionRuntimeSnapshot } from '../../shared/cowork/runtimeSnapshot';
import { resolveContinuationRuntimeSnapshot } from './coworkRuntimeSnapshot';

const oldSnapshot: CoworkSessionRuntimeSnapshot = {
  agentEngine: CoworkAgentEngine.ClaudeCode,
  engineLabel: 'Claude Code',
  providerKey: 'deepseek',
  providerName: 'DeepSeek',
  modelId: 'deepseek-chat',
  modelName: 'DeepSeek Chat',
  modelLabel: 'DeepSeek · DeepSeek Chat',
  configSource: ExternalAgentConfigSource.WesightModel,
  capturedAt: 1,
};

describe('resolveContinuationRuntimeSnapshot', () => {
  test('refreshes the model for a continued session while preserving engine and config source', () => {
    const refreshed = resolveContinuationRuntimeSnapshot({
      existingSnapshot: oldSnapshot,
      inferredEngine: CoworkAgentEngine.Codex,
      resolveSnapshot: (engine, options) => ({
        agentEngine: engine,
        engineLabel: 'Claude Code',
        providerKey: options.configSource === ExternalAgentConfigSource.WesightModel ? 'moonshot' : null,
        providerName: 'Moonshot',
        modelId: options.modelOverride?.modelId ?? 'kimi-k2',
        modelName: options.modelOverride?.modelName ?? 'Kimi K2',
        modelLabel: 'Moonshot · Kimi K2',
        configSource: options.configSource ?? null,
        capturedAt: 2,
      }),
      modelOverride: {
        modelId: 'kimi-k2',
        providerKey: 'moonshot',
        modelName: 'Kimi K2',
      },
    });

    expect(refreshed.agentEngine).toBe(CoworkAgentEngine.ClaudeCode);
    expect(refreshed.configSource).toBe(ExternalAgentConfigSource.WesightModel);
    expect(refreshed.modelId).toBe('kimi-k2');
    expect(refreshed.providerKey).toBe('moonshot');
    expect(refreshed.capturedAt).toBe(2);
  });
});
