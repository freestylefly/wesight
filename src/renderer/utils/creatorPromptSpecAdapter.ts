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
  const templateFields = (spec.templateFieldSchema ?? [])
    .map((field) => ({
      id: field.id,
      label: field.label,
      value: spec.templateFieldValues[field.id]?.trim() ?? '',
    }))
    .filter((field) => field.value.length > 0);
  return {
    ...spec,
    schemaVersion: CreatorPromptSpecSchemaVersion.V1,
    templateFields,
    source: {
      mode: sourceMode,
      sourceType: spec.sourceType,
      sourceId: spec.sourceId,
      sourceTitle: spec.sourceTitle,
      templateId: spec.templateId ?? null,
      caseIds: spec.caseIds,
      variantOfAssetId: spec.variantOfAssetId ?? null,
      referencePrompt: spec.referencePrompt ?? null,
      referenceAnalysis: spec.referenceAnalysis,
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
    template: {
      templateId: spec.templateId ?? null,
      fields: templateFields,
    },
    provenance: {
      templateId: spec.templateId ?? null,
      caseIds: spec.caseIds,
      variantOfAssetId: spec.variantOfAssetId ?? null,
    },
  };
};
