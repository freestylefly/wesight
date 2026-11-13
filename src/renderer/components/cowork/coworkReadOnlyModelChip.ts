import { CoworkAgentEngine } from '@shared/cowork/constants';

/**
 * Which data source the read-only model chip should render.
 *
 * The read-only chip is reached whenever the run target is a Team or a
 * non-default Agent (see `canSelectRuntimeEngine` in CoworkView). In that state
 * the chip must still echo the model that will actually run, so it has to cover
 * every engine family the interactive selector covers:
 *
 * - `override`    an explicit label was supplied by the parent
 * - `codexApp`    Codex App resolves its model internally, no provider list
 * - `claudeLive`  Claude following the local CLI reads the machine's live config
 * - `provider`    external CLI engines backed by the provider table (Kimi, ...)
 * - `unknown`     nothing resolvable yet, fall back to the i18n placeholder
 */
export type ReadOnlyModelChipSourceKind =
  | 'override'
  | 'codexApp'
  | 'claudeLive'
  | 'provider'
  | 'unknown';

export interface ReadOnlyModelChipInput {
  hasLabelOverride: boolean;
  engine: CoworkAgentEngine | undefined;
  isClaudeLocalConfig: boolean;
  hasProvider: boolean;
}

/**
 * Pure decision function for the read-only chip, kept outside the component so
 * the engine matrix can be unit tested without a DOM renderer.
 *
 * Precedence mirrors the interactive render path below it: an explicit override
 * always wins, then engine-specific sources, then the generic provider table.
 */
export const resolveReadOnlyModelChipSource = (
  input: ReadOnlyModelChipInput,
): ReadOnlyModelChipSourceKind => {
  if (input.hasLabelOverride) return 'override';
  if (input.engine === CoworkAgentEngine.CodexApp) return 'codexApp';
  if (input.isClaudeLocalConfig) return 'claudeLive';
  if (input.hasProvider) return 'provider';
  return 'unknown';
};
