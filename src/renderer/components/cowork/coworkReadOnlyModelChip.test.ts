import { CoworkAgentEngine } from '@shared/cowork/constants';
import { describe, expect, it } from 'vitest';

import { resolveReadOnlyModelChipSource } from './coworkReadOnlyModelChip';

describe('resolveReadOnlyModelChipSource', () => {
  const base = {
    hasLabelOverride: false,
    engine: CoworkAgentEngine.KimiCode as CoworkAgentEngine | undefined,
    isClaudeLocalConfig: false,
    hasProvider: true,
  };

  it('uses the provider table for external CLI engines (issue #61 - Kimi Code)', () => {
    expect(resolveReadOnlyModelChipSource(base)).toBe('provider');
  });

  it('prefers an explicit label override over every resolved source', () => {
    expect(resolveReadOnlyModelChipSource({ ...base, hasLabelOverride: true })).toBe('override');
  });

  it('resolves Codex App from its own model source instead of the placeholder', () => {
    // Regression: the readOnly early-return used to sit above the CodexApp
    // branch, so Codex App always rendered "unknown model" for Team targets.
    expect(resolveReadOnlyModelChipSource({
      ...base,
      engine: CoworkAgentEngine.CodexApp,
      hasProvider: false,
    })).toBe('codexApp');
  });

  it('resolves Claude local CLI from the live config snapshot', () => {
    // Regression: same early-return also shadowed the Claude live-config branch.
    expect(resolveReadOnlyModelChipSource({
      ...base,
      engine: CoworkAgentEngine.ClaudeCode,
      isClaudeLocalConfig: true,
      hasProvider: false,
    })).toBe('claudeLive');
  });

  it('keeps Codex App ahead of a stale provider entry', () => {
    expect(resolveReadOnlyModelChipSource({
      ...base,
      engine: CoworkAgentEngine.CodexApp,
      hasProvider: true,
    })).toBe('codexApp');
  });

  it('falls back to the unknown placeholder when nothing is resolvable yet', () => {
    expect(resolveReadOnlyModelChipSource({ ...base, hasProvider: false })).toBe('unknown');
  });

  it('falls back to unknown when the engine is undefined and no provider loaded', () => {
    expect(resolveReadOnlyModelChipSource({
      ...base,
      engine: undefined,
      hasProvider: false,
    })).toBe('unknown');
  });
});
