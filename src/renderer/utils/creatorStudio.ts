import type { CreatorPromptSpec } from '../types/creatorStudio';
import { CreatorStudioSourceType } from '../types/creatorStudio';

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
