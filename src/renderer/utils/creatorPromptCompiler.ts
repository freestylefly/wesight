import type { CreatorPromptSpecSnapshot } from '@shared/creatorStudio/types';

import type { CreatorBuilderMaterial, CreatorPromptSpec } from '../types/creatorStudio';
import { toCreatorPromptSpecSnapshot } from './creatorPromptSpecAdapter';
import {
  renderCreatorCoworkDraft,
  renderCreatorPrompt,
  selectCreatorCreativeDirection,
} from './creatorStudio';

export const CreatorPromptCompileTarget = {
  CopyText: 'copyText',
  CoworkDraft: 'coworkDraft',
  BatchTask: 'batchTask',
} as const;

export type CreatorPromptCompileTarget =
  typeof CreatorPromptCompileTarget[keyof typeof CreatorPromptCompileTarget];

export interface CreatorPromptCompileRuntime {
  installedSkillIds?: string[];
  missingSkillIds?: string[];
  requestImageGeneration?: boolean;
}

export interface CreatorPromptCompileBatchTask {
  batchRunId: string;
  batchTaskId: string;
  directionId: string;
  modelName: string;
  templateId: string;
  size: string;
}

export interface CreatorPromptCompileResult {
  target: CreatorPromptCompileTarget;
  promptText: string;
  promptSpec: CreatorPromptSpecSnapshot;
  draftText?: string;
  attachments?: Array<{
    path: string;
    name: string;
    isImage: boolean;
    dataUrl: string;
  }>;
}

export const compileCreatorPrompt = ({
  spec,
  target,
  materials = [],
  runtime = {},
  batchTask,
}: {
  spec: CreatorPromptSpec;
  target: CreatorPromptCompileTarget;
  materials?: CreatorBuilderMaterial[];
  runtime?: CreatorPromptCompileRuntime;
  batchTask?: CreatorPromptCompileBatchTask;
}): CreatorPromptCompileResult => {
  const promptText = renderCreatorPrompt(spec);
  const basePromptSpec = toCreatorPromptSpecSnapshot(spec, {
    activeSkillIds: runtime.installedSkillIds ?? [],
    missingSkillIds: runtime.missingSkillIds ?? [],
    requestImageGeneration: runtime.requestImageGeneration ?? false,
  });
  const promptSpec = batchTask
    ? {
      ...basePromptSpec,
      templateId: batchTask.templateId,
      constraints: {
        ...(basePromptSpec.constraints ?? {}),
        aspectRatio: batchTask.size,
      },
      batch: {
        batchRunId: batchTask.batchRunId,
        batchTaskId: batchTask.batchTaskId,
        directionId: batchTask.directionId,
        modelName: batchTask.modelName,
        templateId: batchTask.templateId,
        size: batchTask.size,
      },
    }
    : basePromptSpec;
  const attachments = materials
    .filter((material) => material.dataUrl?.startsWith('data:image/'))
    .map((material) => ({
      path: material.path,
      name: material.name,
      isImage: true,
      dataUrl: material.dataUrl as string,
    }));

  if (target === CreatorPromptCompileTarget.CoworkDraft) {
    return {
      target,
      promptText,
      promptSpec,
      draftText: renderCreatorCoworkDraft({
        promptSpec: spec,
        promptText,
        installedSkillIds: runtime.installedSkillIds ?? [],
        missingSkillIds: runtime.missingSkillIds ?? [],
        requestImageGeneration: runtime.requestImageGeneration,
      }),
      attachments,
    };
  }

  if (target === CreatorPromptCompileTarget.BatchTask && batchTask) {
    return {
      target,
      promptText: [
        '[Creator Studio]',
        '',
        `batchRunId: ${batchTask.batchRunId}`,
        `batchTaskId: ${batchTask.batchTaskId}`,
        `directionId: ${batchTask.directionId}`,
        `templateId: ${batchTask.templateId}`,
        `size: ${batchTask.size}`,
        `model: ${batchTask.modelName}`,
        '',
        'PromptSpec:',
        '```json',
        JSON.stringify(promptSpec, null, 2),
        '```',
        '',
        'Prompt:',
        '```text',
        [
          promptText,
          '',
          'Batch execution constraints:',
          `model=${batchTask.modelName}`,
          `templateId=${batchTask.templateId}`,
          `size=${batchTask.size}`,
        ].join('\n'),
        '```',
      ].join('\n'),
      promptSpec,
      attachments,
    };
  }

  return {
    target,
    promptText,
    promptSpec,
    attachments,
  };
};

export const compileCreatorDirectionPrompt = (
  spec: CreatorPromptSpec,
  directionId: string
): {
  promptSpec: CreatorPromptSpecSnapshot;
  promptText: string;
} => {
  const directionSpec = selectCreatorCreativeDirection(spec, directionId);
  return {
    promptSpec: toCreatorPromptSpecSnapshot(directionSpec),
    promptText: renderCreatorPrompt(directionSpec),
  };
};
