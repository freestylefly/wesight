import type {
  CoworkAgentEngine,
} from '../../shared/cowork/constants';
import type {
  CoworkModelOverride,
  CoworkSessionRuntimeSnapshot,
} from '../../shared/cowork/runtimeSnapshot';

export type RuntimeSnapshotResolver = (
  engine: CoworkAgentEngine,
  options: {
    configSource?: string | null;
    modelOverride?: CoworkModelOverride | null;
  },
) => CoworkSessionRuntimeSnapshot;

export interface ResolveContinuationRuntimeSnapshotOptions {
  existingSnapshot?: CoworkSessionRuntimeSnapshot | null;
  inferredEngine: CoworkAgentEngine;
  resolveSnapshot: RuntimeSnapshotResolver;
  modelOverride?: CoworkModelOverride | null;
}

export function resolveContinuationRuntimeSnapshot({
  existingSnapshot,
  inferredEngine,
  resolveSnapshot,
  modelOverride,
}: ResolveContinuationRuntimeSnapshotOptions): CoworkSessionRuntimeSnapshot {
  if (!existingSnapshot) {
    return resolveSnapshot(inferredEngine, { modelOverride });
  }

  return resolveSnapshot(existingSnapshot.agentEngine, {
    configSource: existingSnapshot.configSource,
    modelOverride,
  });
}
