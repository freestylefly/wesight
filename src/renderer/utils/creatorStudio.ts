import type { CreatorBuilderMaterial, CreatorCreativeDirection, CreatorPromptMaterial, CreatorPromptSpec } from '../types/creatorStudio';
import { CreatorMaterialRole } from '../types/creatorStudio';
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
  variantOfAssetId?: string;
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

export const CREATOR_MATERIAL_ROLE_LABELS: Record<CreatorMaterialRole, { zh: string; en: string }> = {
  [CreatorMaterialRole.Reference]: { zh: '参考图', en: 'Reference image' },
  [CreatorMaterialRole.Style]: { zh: '风格参考', en: 'Style reference' },
  [CreatorMaterialRole.Brand]: { zh: '品牌素材', en: 'Brand asset' },
  [CreatorMaterialRole.Source]: { zh: '事实来源', en: 'Source material' },
  [CreatorMaterialRole.Negative]: { zh: '负向约束', en: 'Negative constraint' },
};

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
  blankSourceTitle: string,
  materials: CreatorBuilderMaterial[] = []
): CreatorPromptSpec => {
  const promptMaterials = materials.map(toPromptMaterial);
  const baseSpec: CreatorPromptSpec = {
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
    variantOfAssetId: seed?.variantOfAssetId,
  };
  const contextPack = renderCreatorContextPack(promptMaterials, language);
  const creativeDirections = buildCreatorCreativeDirections(baseSpec);
  return {
    ...baseSpec,
    materials: promptMaterials,
    contextPack,
    creativeDirections,
  };
};

export const selectCreatorCreativeDirection = (
  spec: CreatorPromptSpec,
  directionId: string | null
): CreatorPromptSpec => {
  const selectedDirection = spec.creativeDirections?.find((direction) => direction.id === directionId);
  if (!selectedDirection) {
    const { selectedCreativeDirection, selectedCreativeDirectionId, ...rest } = spec;
    void selectedCreativeDirection;
    void selectedCreativeDirectionId;
    return rest;
  }
  return {
    ...spec,
    selectedCreativeDirectionId: selectedDirection.id,
    selectedCreativeDirection: selectedDirection,
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
  spec.contextPack ? `Context Pack：\n${spec.contextPack}` : '',
  spec.selectedCreativeDirection ? `已选择创意方向：\n${renderSelectedDirection(spec.selectedCreativeDirection, spec.language)}` : '',
  spec.creativeDirections && spec.creativeDirections.length > 0
    ? `四个差异化创意方向：\n${renderDirectionLines(spec.creativeDirections)}`
    : '',
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
      `variantOfAssetId：${promptSpec.variantOfAssetId || 'none'}`,
      `已激活推荐 skills：${installedSkillIds.length > 0 ? installedSkillIds.join(', ') : 'none'}`,
      missingSkillIds.length > 0
        ? `未安装或不可用的推荐 skills：${missingSkillIds.join(', ')}。请不要因此中断，可先基于 prompt 给出可执行方案。`
        : '推荐 skills 已可用。若 Seedream 未配置 API，也不要中断，可先生成可复制 prompt 或执行替代方案。',
      promptSpec.materials && promptSpec.materials.length > 0
        ? '素材说明：标记 attachment=base64 的素材已作为图片附件进入 Cowork；未带附件的素材请按 Context Pack 中的本地路径和素材角色处理。'
        : '',
      promptSpec.selectedCreativeDirection
        ? [
          '',
          'Selected Creative Direction:',
          '```text',
          renderSelectedDirection(promptSpec.selectedCreativeDirection, promptSpec.language),
          '```',
        ].join('\n')
        : '',
      promptSpec.contextPack
        ? [
          '',
          'Context Pack:',
          '```text',
          promptSpec.contextPack,
          '```',
        ].join('\n')
        : '',
      promptSpec.creativeDirections && promptSpec.creativeDirections.length > 0
        ? [
          '',
          'Creative Directions:',
          '```text',
          renderDirectionLines(promptSpec.creativeDirections),
          '```',
        ].join('\n')
        : '',
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
    `variantOfAssetId: ${promptSpec.variantOfAssetId || 'none'}`,
    `Activated recommended skills: ${installedSkillIds.length > 0 ? installedSkillIds.join(', ') : 'none'}`,
    missingSkillIds.length > 0
      ? `Missing or unavailable recommended skills: ${missingSkillIds.join(', ')}. Do not block on this; proceed with an executable plan or reusable prompt.`
      : 'Recommended skills are available. If Seedream is not configured, do not block; produce a reusable prompt or alternative plan first.',
    promptSpec.materials && promptSpec.materials.length > 0
      ? 'Material note: materials marked attachment=base64 are sent as Cowork image attachments; materials without attachments remain local-path references in the Context Pack.'
      : '',
    promptSpec.selectedCreativeDirection
      ? [
        '',
        'Selected Creative Direction:',
        '```text',
        renderSelectedDirection(promptSpec.selectedCreativeDirection, promptSpec.language),
        '```',
      ].join('\n')
      : '',
    promptSpec.contextPack
      ? [
        '',
        'Context Pack:',
        '```text',
        promptSpec.contextPack,
        '```',
      ].join('\n')
      : '',
    promptSpec.creativeDirections && promptSpec.creativeDirections.length > 0
      ? [
        '',
        'Creative Directions:',
        '```text',
        renderDirectionLines(promptSpec.creativeDirections),
        '```',
      ].join('\n')
      : '',
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
  spec.contextPack ? `Context Pack:\n${spec.contextPack}` : '',
  spec.selectedCreativeDirection ? `Selected creative direction:\n${renderSelectedDirection(spec.selectedCreativeDirection, spec.language)}` : '',
  spec.creativeDirections && spec.creativeDirections.length > 0
    ? `Four differentiated creative directions:\n${renderDirectionLines(spec.creativeDirections)}`
    : '',
  `Source: ${spec.sourceTitle}`,
  spec.referencePrompt ? `Use the reference prompt structure and production quality, but adapt it to the current brief:\n${spec.referencePrompt}` : '',
];

const hasUsableLocalPath = (path: string): boolean => {
  const normalized = path.trim();
  return normalized.startsWith('/')
    || /^file:\/\//i.test(normalized)
    || /^[a-zA-Z]:[\\/]/.test(normalized);
};

const hasImageAttachment = (material: CreatorBuilderMaterial): boolean => (
  Boolean(material.dataUrl?.startsWith('data:image/'))
);

const toPromptMaterial = (material: CreatorBuilderMaterial): CreatorPromptMaterial => ({
  id: material.id,
  role: material.role,
  source: material.source,
  name: material.name,
  path: material.path,
  mimeType: material.mimeType,
  hasImageAttachment: hasImageAttachment(material),
  localPathAvailable: hasUsableLocalPath(material.path),
});

export const renderCreatorContextPack = (
  materials: CreatorPromptMaterial[],
  language: 'zh' | 'en'
): string => {
  if (materials.length === 0) {
    return '';
  }
  const roleText = (role: CreatorMaterialRole) => CREATOR_MATERIAL_ROLE_LABELS[role][language];
  const header = language === 'zh'
    ? '以下素材用于约束和增强生成结果。请严格按 role 理解，不要把负向约束当作参考。'
    : 'Use the following materials to constrain and improve the output. Treat each role literally; do not use negative constraints as positive references.';
  return [
    header,
    ...materials.map((material, index) => {
      const attachment = material.hasImageAttachment ? 'base64' : 'none';
      const localPath = material.localPathAvailable ? 'available' : 'unavailable';
      const fallbackNote = !material.localPathAvailable && material.hasImageAttachment
        ? (
          language === 'zh'
            ? '；note=该素材没有真实本地路径，非视觉模型只能依据附件说明处理'
            : '; note=this material has no real local path, so non-vision models can only use the attachment description'
        )
        : '';
      return language === 'zh'
        ? `${index + 1}. role=${material.role}（${roleText(material.role)}）；name=${material.name}；path=${material.path}；mime=${material.mimeType}；attachment=${attachment}；localPath=${localPath}${fallbackNote}`
        : `${index + 1}. role=${material.role} (${roleText(material.role)}); name=${material.name}; path=${material.path}; mime=${material.mimeType}; attachment=${attachment}; localPath=${localPath}${fallbackNote}`;
    }),
  ].join('\n');
};

export const buildCreatorCreativeDirections = (spec: CreatorPromptSpec): CreatorCreativeDirection[] => {
  const topic = spec.subject || spec.mainObject || spec.sourceTitle;
  if (spec.language === 'zh') {
    return [
      {
        id: 'clarity-hero',
        title: '清晰主视觉',
        template: '单一主视觉 + 明确层级',
        style: spec.visualStyle || '高级商业海报',
        reason: `适合快速传达「${topic}」的核心信息。`,
        promptFocus: '强化主体轮廓、品牌文字和第一眼可读性。',
      },
      {
        id: 'editorial-story',
        title: '编辑叙事',
        template: '杂志式构图 + 情境细节',
        style: '纪实 editorial / lifestyle',
        reason: '适合让画面更有场景和使用动机。',
        promptFocus: '加入真实环境、人物动作或产品使用线索。',
      },
      {
        id: 'system-layout',
        title: '信息系统',
        template: '模块化信息图 + 网格排版',
        style: '清晰 UI / infographic',
        reason: '适合解释功能、流程、卖点或多元素关系。',
        promptFocus: '用标签、分区、图标和对比关系组织信息。',
      },
      {
        id: 'bold-campaign',
        title: '强冲击 Campaign',
        template: '大字标题 + 高对比视觉符号',
        style: 'bold campaign / social poster',
        reason: '适合社交媒体首屏吸引和活动传播。',
        promptFocus: '提高色彩对比、标题张力和可分享感。',
      },
    ];
  }

  return [
    {
      id: 'clarity-hero',
      title: 'Clarity hero',
      template: 'single hero subject with clear hierarchy',
      style: spec.visualStyle || 'premium commercial poster',
      reason: `Best for communicating the core idea of "${topic}" quickly.`,
      promptFocus: 'Prioritize subject silhouette, brand text, and first-glance readability.',
    },
    {
      id: 'editorial-story',
      title: 'Editorial story',
      template: 'magazine-like composition with contextual details',
      style: 'documentary editorial / lifestyle',
      reason: 'Best when the image needs a believable scene and motivation.',
      promptFocus: 'Add real environment cues, human action, or product-in-use details.',
    },
    {
      id: 'system-layout',
      title: 'Information system',
      template: 'modular infographic with grid layout',
      style: 'clean UI / infographic',
      reason: 'Best for explaining features, workflows, value props, or multi-part relationships.',
      promptFocus: 'Use labels, zones, icons, and explicit comparisons to organize information.',
    },
    {
      id: 'bold-campaign',
      title: 'Bold campaign',
      template: 'large headline with high-contrast visual symbol',
      style: 'bold campaign / social poster',
      reason: 'Best for social-first impact and campaign memorability.',
      promptFocus: 'Increase color contrast, headline tension, and shareability.',
    },
  ];
};

const renderDirectionLines = (directions: CreatorCreativeDirection[]): string => (
  directions.map((direction, index) => [
    `${index + 1}. ${direction.title}`,
    `   template: ${direction.template}`,
    `   style: ${direction.style}`,
    `   reason: ${direction.reason}`,
    `   promptFocus: ${direction.promptFocus}`,
  ].join('\n')).join('\n')
);

const renderSelectedDirection = (
  direction: CreatorCreativeDirection,
  language: 'zh' | 'en'
): string => {
  if (language === 'zh') {
    return [
      `方向：${direction.title}`,
      `构图模板：${direction.template}`,
      `风格：${direction.style}`,
      `选择原因：${direction.reason}`,
      `生成重点：${direction.promptFocus}`,
    ].join('\n');
  }
  return [
    `Direction: ${direction.title}`,
    `Template: ${direction.template}`,
    `Style: ${direction.style}`,
    `Reason: ${direction.reason}`,
    `Prompt focus: ${direction.promptFocus}`,
  ].join('\n');
};
