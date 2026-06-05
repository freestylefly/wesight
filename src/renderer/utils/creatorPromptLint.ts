import type { CreatorPromptSpec } from '../types/creatorStudio';

export const CreatorPromptLintSeverity = {
  Error: 'error',
  Warning: 'warning',
  Info: 'info',
} as const;

export type CreatorPromptLintSeverity =
  typeof CreatorPromptLintSeverity[keyof typeof CreatorPromptLintSeverity];

export interface CreatorPromptLintIssue {
  severity: CreatorPromptLintSeverity;
  code: string;
  fieldPath: string;
  messageKey: string;
  suggestionKey?: string;
}

export interface CreatorPromptLintResult {
  score: number;
  issues: CreatorPromptLintIssue[];
}

const ASPECT_RATIO_PATTERN = /^\s*\d+(?:\.\d+)?\s*[:/]\s*\d+(?:\.\d+)?\s*$/;
const MAX_REQUIRED_TEXT_LENGTH = 80;
const MAX_OUTPUT_COUNT = 12;

const createIssue = (
  severity: CreatorPromptLintSeverity,
  code: string,
  fieldPath: string,
  messageKey: string,
  suggestionKey?: string
): CreatorPromptLintIssue => ({
  severity,
  code,
  fieldPath,
  messageKey,
  ...(suggestionKey ? { suggestionKey } : {}),
});

export const lintCreatorPromptSpec = (spec: CreatorPromptSpec): CreatorPromptLintResult => {
  const issues: CreatorPromptLintIssue[] = [];

  if (!spec.taskType.trim()) {
    issues.push(createIssue(
      CreatorPromptLintSeverity.Warning,
      'task_type_missing',
      'taskType',
      'creatorPromptLintTaskTypeMissing',
      'creatorPromptLintTaskTypeMissingSuggestion'
    ));
  }

  if (!spec.subject.trim() && !spec.mainObject.trim()) {
    issues.push(createIssue(
      CreatorPromptLintSeverity.Error,
      'subject_missing',
      'subject',
      'creatorPromptLintSubjectMissing',
      'creatorPromptLintSubjectMissingSuggestion'
    ));
  }

  const aspectRatio = spec.constraints.aspectRatio?.trim() ?? '';
  if (!aspectRatio) {
    issues.push(createIssue(
      CreatorPromptLintSeverity.Error,
      'aspect_ratio_missing',
      'constraints.aspectRatio',
      'creatorPromptLintAspectRatioMissing',
      'creatorPromptLintAspectRatioMissingSuggestion'
    ));
  } else if (!ASPECT_RATIO_PATTERN.test(aspectRatio)) {
    issues.push(createIssue(
      CreatorPromptLintSeverity.Warning,
      'aspect_ratio_format',
      'constraints.aspectRatio',
      'creatorPromptLintAspectRatioFormat',
      'creatorPromptLintAspectRatioFormatSuggestion'
    ));
  }

  const requiredText = spec.constraints.requiredText?.trim() ?? '';
  if (requiredText.length > MAX_REQUIRED_TEXT_LENGTH) {
    issues.push(createIssue(
      CreatorPromptLintSeverity.Warning,
      'required_text_too_long',
      'constraints.requiredText',
      'creatorPromptLintRequiredTextTooLong',
      'creatorPromptLintRequiredTextTooLongSuggestion'
    ));
  }

  const outputCount = spec.outputCount.trim();
  if (outputCount) {
    const parsedCount = Number(outputCount);
    if (!Number.isInteger(parsedCount) || parsedCount < 1) {
      issues.push(createIssue(
        CreatorPromptLintSeverity.Warning,
        'output_count_invalid',
        'outputCount',
        'creatorPromptLintOutputCountInvalid',
        'creatorPromptLintOutputCountInvalidSuggestion'
      ));
    } else if (parsedCount > MAX_OUTPUT_COUNT) {
      issues.push(createIssue(
        CreatorPromptLintSeverity.Warning,
        'output_count_high',
        'outputCount',
        'creatorPromptLintOutputCountHigh',
        'creatorPromptLintOutputCountHighSuggestion'
      ));
    }
  }

  if (spec.templatePitfalls.length > 0 && !spec.constraints.negativeRequirements?.trim()) {
    issues.push(createIssue(
      CreatorPromptLintSeverity.Info,
      'template_pitfalls_not_reflected',
      'constraints.negativeRequirements',
      'creatorPromptLintTemplatePitfallsNotReflected',
      'creatorPromptLintTemplatePitfallsNotReflectedSuggestion'
    ));
  }

  const unavailableMaterials = (spec.materials ?? []).filter((material) => (
    !material.localPathAvailable && !material.hasImageAttachment
  ));
  if (unavailableMaterials.length > 0) {
    issues.push(createIssue(
      CreatorPromptLintSeverity.Warning,
      'material_unavailable',
      'materials',
      'creatorPromptLintMaterialUnavailable',
      'creatorPromptLintMaterialUnavailableSuggestion'
    ));
  }

  const errorCount = issues.filter((issue) => issue.severity === CreatorPromptLintSeverity.Error).length;
  const warningCount = issues.filter((issue) => issue.severity === CreatorPromptLintSeverity.Warning).length;
  const infoCount = issues.filter((issue) => issue.severity === CreatorPromptLintSeverity.Info).length;
  const score = Math.max(0, 100 - errorCount * 35 - warningCount * 12 - infoCount * 4);

  return {
    score,
    issues,
  };
};
