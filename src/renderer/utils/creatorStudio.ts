import type { CreatorPromptSpec } from '../types/creatorStudio';
import { CreatorStudioSourceType } from '../types/creatorStudio';

export const CreatorStudioAgentId = {
  CreativeProducer: 'creative-producer',
} as const;

export type CreatorStudioAgentId = typeof CreatorStudioAgentId[keyof typeof CreatorStudioAgentId];

export const CreatorStudioRecommendedSkillId = {
  GptImage2StyleLibrary: 'gpt-image-2-style-library',
  Seedream: 'seedream',
  Seedance: 'seedance',
  CanvasDesign: 'canvas-design',
  FrontendDesign: 'frontend-design',
} as const;

export type CreatorStudioRecommendedSkillId =
  typeof CreatorStudioRecommendedSkillId[keyof typeof CreatorStudioRecommendedSkillId];

export const CREATOR_STUDIO_RECOMMENDED_SKILL_IDS = [
  CreatorStudioRecommendedSkillId.GptImage2StyleLibrary,
  CreatorStudioRecommendedSkillId.Seedream,
  CreatorStudioRecommendedSkillId.Seedance,
  CreatorStudioRecommendedSkillId.CanvasDesign,
  CreatorStudioRecommendedSkillId.FrontendDesign,
] as const;

export interface CreatorPromptSeed {
  sourceType: CreatorPromptSpec['sourceType'];
  sourceId: string;
  sourceTitle: string;
  referencePrompt?: string;
  templateId?: string;
  caseIds?: string[];
  category?: string;
  styles?: string[];
  scenes?: string[];
  templateGuidance?: string[];
  templatePitfalls?: string[];
}

export interface CreatorCoworkDraftInput {
  promptSpec: CreatorPromptSpec;
  promptText: string;
  installedSkillIds: string[];
  missingSkillIds: string[];
  requestImageGeneration?: boolean;
}

export interface CreatorPromptForm {
  subject: string;
  platform: string;
  mainObject: string;
  requiredText: string;
  visualStyle: string;
  aspectRatio: string;
  negativeRequirements: string;
}

export const normalizePromptLanguage = (
  uiLanguage: 'zh' | 'en',
  form: CreatorPromptForm
): 'zh' | 'en' => {
  if (uiLanguage === 'zh') {
    return 'zh';
  }
  return Object.values(form).some((value) => /[\u3400-\u9fff]/.test(value)) ? 'zh' : 'en';
};

export const buildPromptSpec = (
  seed: CreatorPromptSeed | null,
  form: CreatorPromptForm,
  language: 'zh' | 'en',
  blankSourceTitle: string
): CreatorPromptSpec => {
  return {
    sourceType: seed?.sourceType ?? CreatorStudioSourceType.Template,
    sourceId: seed?.sourceId ?? 'blank',
    sourceTitle: seed?.sourceTitle ?? blankSourceTitle,
    language,
    category: seed?.category,
    caseIds: seed?.caseIds ?? [],
    styles: seed?.styles ?? [],
    scenes: seed?.scenes ?? [],
    subject: form.subject.trim(),
    platform: form.platform.trim(),
    mainObject: form.mainObject.trim(),
    visualStyle: form.visualStyle.trim(),
    constraints: {
      ...(form.aspectRatio.trim() ? { aspectRatio: form.aspectRatio.trim() } : {}),
      ...(form.requiredText.trim() ? { requiredText: form.requiredText.trim() } : {}),
      ...(form.negativeRequirements.trim() ? { negativeRequirements: form.negativeRequirements.trim() } : {}),
    },
    templateGuidance: seed?.templateGuidance ?? [],
    templatePitfalls: seed?.templatePitfalls ?? [],
    referencePrompt: seed?.referencePrompt,
    templateId: seed?.templateId,
  };
};

export const renderCreatorPrompt = (spec: CreatorPromptSpec): string => {
  const lines = spec.language === 'zh'
    ? renderChinesePrompt(spec)
    : renderEnglishPrompt(spec);
  return lines.filter((line) => line.trim().length > 0).join('\n\n');
};

const renderChinesePrompt = (spec: CreatorPromptSpec): string[] => [
  '请生成一张专业视觉图像。',
  spec.subject ? `主题：${spec.subject}` : '',
  spec.platform ? `使用场景 / 平台：${spec.platform}` : '',
  spec.mainObject ? `主体：${spec.mainObject}` : '',
  spec.constraints.requiredText ? `必须出现的文字：${spec.constraints.requiredText}` : '',
  spec.visualStyle ? `视觉风格：${spec.visualStyle}` : '',
  spec.styles.length > 0 ? `继承风格标签：${spec.styles.join('、')}` : '',
  spec.scenes.length > 0 ? `适用场景标签：${spec.scenes.join('、')}` : '',
  spec.constraints.aspectRatio ? `画面比例：${spec.constraints.aspectRatio}` : '',
  spec.templateGuidance.length > 0 ? `模板建议：\n${spec.templateGuidance.map((item) => `- ${item}`).join('\n')}` : '',
  spec.templatePitfalls.length > 0 ? `避免问题：\n${spec.templatePitfalls.map((item) => `- ${item}`).join('\n')}` : '',
  spec.constraints.negativeRequirements ? `负向要求：${spec.constraints.negativeRequirements}` : '',
  `来源：${spec.sourceTitle}`,
  spec.referencePrompt ? `参考 prompt 结构与质感，但替换为当前 brief：\n${spec.referencePrompt}` : '',
];

export const renderCreatorCoworkDraft = ({
  promptSpec,
  promptText,
  installedSkillIds,
  missingSkillIds,
  requestImageGeneration = false,
}: CreatorCoworkDraftInput): string => {
  if (promptSpec.language === 'zh') {
    return [
      '[Creator Studio]',
      '',
      '请作为 Creative Producer 执行下面的创意生产 brief。优先保持 PromptSpec 的结构化约束，不要丢失 templateId、caseIds、风格、场景和负向要求。',
      requestImageGeneration
        ? '执行目标：如果 Seedream skill 和 API 配置可用，请优先生成图片；如果不可用，请不要中断，先输出可复制 prompt 和替代执行步骤。'
        : '执行目标：先基于 brief 输出专业 prompt、创意方向或可执行方案。',
      '',
      `来源：${promptSpec.sourceTitle}`,
      `templateId：${promptSpec.templateId || 'none'}`,
      `caseIds：${promptSpec.caseIds.length > 0 ? promptSpec.caseIds.join(', ') : 'none'}`,
      `已激活推荐 skills：${installedSkillIds.length > 0 ? installedSkillIds.join(', ') : 'none'}`,
      missingSkillIds.length > 0
        ? `未安装或不可用的推荐 skills：${missingSkillIds.join(', ')}。请不要因此中断，可先基于 prompt 给出可执行方案。`
        : '推荐 skills 已可用。若 Seedream 未配置 API，也不要中断，可先生成可复制 prompt 或执行替代方案。',
      '',
      'PromptSpec:',
      '```json',
      JSON.stringify(promptSpec, null, 2),
      '```',
      '',
      'Prompt:',
      '```text',
      promptText,
      '```',
    ].join('\n');
  }

  return [
    '[Creator Studio]',
    '',
    'Act as Creative Producer and execute the creative production brief below. Preserve the structured PromptSpec constraints, including templateId, caseIds, styles, scenes, and negative requirements.',
    requestImageGeneration
      ? 'Execution goal: if the Seedream skill and API configuration are available, generate the image first; if not, do not block and produce a copy-ready prompt plus fallback steps.'
      : 'Execution goal: produce a professional prompt, creative direction, or executable plan from the brief first.',
    '',
    `Source: ${promptSpec.sourceTitle}`,
    `templateId: ${promptSpec.templateId || 'none'}`,
    `caseIds: ${promptSpec.caseIds.length > 0 ? promptSpec.caseIds.join(', ') : 'none'}`,
    `Activated recommended skills: ${installedSkillIds.length > 0 ? installedSkillIds.join(', ') : 'none'}`,
    missingSkillIds.length > 0
      ? `Missing or unavailable recommended skills: ${missingSkillIds.join(', ')}. Do not block on this; proceed with an executable plan or reusable prompt.`
      : 'Recommended skills are available. If Seedream is not configured, do not block; produce a reusable prompt or alternative plan first.',
    '',
    'PromptSpec:',
    '```json',
    JSON.stringify(promptSpec, null, 2),
    '```',
    '',
    'Prompt:',
    '```text',
    promptText,
    '```',
  ].join('\n');
};

export const hasSeedreamApiConfig = (config: Record<string, string>): boolean => {
  return Object.entries(config).some(([key, value]) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return value.trim().length > 0
      && (
        normalizedKey === 'arkapikey'
        || normalizedKey.includes('apikey')
        || normalizedKey.includes('accesstoken')
        || normalizedKey.includes('token')
      );
  });
};

const renderEnglishPrompt = (spec: CreatorPromptSpec): string[] => [
  'Generate a professional visual image.',
  spec.subject ? `Topic: ${spec.subject}` : '',
  spec.platform ? `Platform or usage context: ${spec.platform}` : '',
  spec.mainObject ? `Main subject: ${spec.mainObject}` : '',
  spec.constraints.requiredText ? `Required visible text: ${spec.constraints.requiredText}` : '',
  spec.visualStyle ? `Visual style: ${spec.visualStyle}` : '',
  spec.styles.length > 0 ? `Inherited style tags: ${spec.styles.join(', ')}` : '',
  spec.scenes.length > 0 ? `Usage scene tags: ${spec.scenes.join(', ')}` : '',
  spec.constraints.aspectRatio ? `Aspect ratio: ${spec.constraints.aspectRatio}` : '',
  spec.templateGuidance.length > 0 ? `Template guidance:\n${spec.templateGuidance.map((item) => `- ${item}`).join('\n')}` : '',
  spec.templatePitfalls.length > 0 ? `Avoid:\n${spec.templatePitfalls.map((item) => `- ${item}`).join('\n')}` : '',
  spec.constraints.negativeRequirements ? `Negative requirements: ${spec.constraints.negativeRequirements}` : '',
  `Source: ${spec.sourceTitle}`,
  spec.referencePrompt ? `Use the reference prompt structure and production quality, but adapt it to the current brief:\n${spec.referencePrompt}` : '',
];
