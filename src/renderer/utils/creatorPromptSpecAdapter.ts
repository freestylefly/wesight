import type { CreatorPromptSpecSnapshot } from '@shared/creatorStudio/types';

import type { CreatorPromptSpec } from '../types/creatorStudio';
import { CreatorPromptSourceMode } from '../types/creatorStudio';

export const CreatorPromptSpecSchemaVersion = {
  V1: 'creator.prompt.v1',
} as const;

export type CreatorPromptSpecSchemaVersion =
  typeof CreatorPromptSpecSchemaVersion[keyof typeof CreatorPromptSpecSchemaVersion];

export const toCreatorPromptSpecSnapshot = (
  spec: CreatorPromptSpec,
  runtime?: {
    activeSkillIds?: string[];
    missingSkillIds?: string[];
    requestImageGeneration?: boolean;
  }
): CreatorPromptSpecSnapshot => {
  const sourceMode = spec.sourceMode ?? CreatorPromptSourceMode.Blank;
  const aspectRatio = spec.constraints.aspectRatio ?? '';
  const requiredText = spec.constraints.requiredText ?? '';
  const negativeRequirements = spec.constraints.negativeRequirements ?? '';
  return {
    ...spec,
    schemaVersion: CreatorPromptSpecSchemaVersion.V1,
    source: {
      mode: sourceMode,
      sourceType: spec.sourceType,
      sourceId: spec.sourceId,
      sourceTitle: spec.sourceTitle,
      templateId: spec.templateId ?? null,
      caseIds: spec.caseIds,
      variantOfAssetId: spec.variantOfAssetId ?? null,
      referencePrompt: spec.referencePrompt ?? null,
    },
    brief: {
      taskType: spec.taskType,
      subject: spec.subject,
      goal: spec.subject || spec.sourceTitle,
      platform: spec.platform,
      audience: spec.audience,
      language: spec.language,
    },
    composition: {
      aspectRatio,
      mainObject: spec.mainObject,
    },
    style: {
      visualStyle: spec.visualStyle,
      styles: spec.styles,
      scenes: spec.scenes,
      colorPreference: spec.colorPreference,
    },
    text: {
      requiredText,
      negativeRequirements,
    },
    output: {
      count: spec.outputCount,
    },
    runtime,
    provenance: {
      templateId: spec.templateId ?? null,
      caseIds: spec.caseIds,
      variantOfAssetId: spec.variantOfAssetId ?? null,
    },
  };
};
