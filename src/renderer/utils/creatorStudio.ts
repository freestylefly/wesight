import type {
  CreatorBuilderMaterial,
  CreatorCreativeDirection,
  CreatorPromptMaterial,
  CreatorPromptReferenceAnalysis,
  CreatorPromptSpec,
  CreatorTemplateFieldSchema,
} from '../types/creatorStudio';
import { CreatorMaterialRole } from '../types/creatorStudio';
import { CreatorPromptSourceMode } from '../types/creatorStudio';
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
  sourceMode?: CreatorPromptSpec['sourceMode'];
  sourceId: string;
  sourceTitle: string;
  referencePrompt?: string;
  templateId?: string;
  templateUseWhen?: string;
  caseIds?: string[];
  category?: string;
  styles?: string[];
  scenes?: string[];
  templateGuidance?: string[];
  templatePitfalls?: string[];
  templateFieldSchema?: CreatorTemplateFieldSchema[];
  referenceAnalysis?: CreatorPromptReferenceAnalysis;
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
  taskType: string;
  subject: string;
  platform: string;
  audience: string;
  mainObject: string;
  requiredText: string;
  visualStyle: string;
  colorPreference: string;
  aspectRatio: string;
  outputCount: string;
  negativeRequirements: string;
  templateFieldValues: Record<string, string>;
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
  const values = [
    form.taskType,
    form.subject,
    form.platform,
    form.audience,
    form.mainObject,
    form.requiredText,
    form.visualStyle,
    form.colorPreference,
    form.aspectRatio,
    form.outputCount,
    form.negativeRequirements,
    ...Object.values(form.templateFieldValues),
  ];
  return values.some((value) => /[\u3400-\u9fff]/.test(value)) ? 'zh' : 'en';
};

export const buildPromptSpec = (
  seed: CreatorPromptSeed | null,
  form: CreatorPromptForm,
  language: 'zh' | 'en',
  blankSourceTitle: string,
  materials: CreatorBuilderMaterial[] = []
): CreatorPromptSpec => {
  const promptMaterials = materials.map((material) => toPromptMaterial(material, language));
  const baseSpec: CreatorPromptSpec = {
    sourceType: seed?.sourceType ?? CreatorStudioSourceType.Template,
    sourceMode: seed?.sourceMode ?? CreatorPromptSourceMode.Blank,
    sourceId: seed?.sourceId ?? 'blank',
    sourceTitle: seed?.sourceTitle ?? blankSourceTitle,
    language,
    category: seed?.category,
    caseIds: seed?.caseIds ?? [],
    styles: seed?.styles ?? [],
    scenes: seed?.scenes ?? [],
    taskType: form.taskType.trim(),
    subject: form.subject.trim(),
    platform: form.platform.trim(),
    audience: form.audience.trim(),
    mainObject: form.mainObject.trim(),
    visualStyle: form.visualStyle.trim(),
    colorPreference: form.colorPreference.trim(),
    outputCount: form.outputCount.trim(),
    constraints: {
      ...(form.aspectRatio.trim() ? { aspectRatio: form.aspectRatio.trim() } : {}),
      ...(form.requiredText.trim() ? { requiredText: form.requiredText.trim() } : {}),
      ...(form.negativeRequirements.trim() ? { negativeRequirements: form.negativeRequirements.trim() } : {}),
    },
    templateGuidance: seed?.templateGuidance ?? [],
    templatePitfalls: seed?.templatePitfalls ?? [],
    templateFieldValues: form.templateFieldValues,
    templateFieldSchema: seed?.templateFieldSchema,
    referenceAnalysis: seed?.referenceAnalysis,
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
  spec.taskType ? `任务类型：${spec.taskType}` : '',
  spec.subject ? `主题：${spec.subject}` : '',
  spec.platform ? `使用场景 / 平台：${spec.platform}` : '',
  spec.audience ? `目标受众：${spec.audience}` : '',
  spec.mainObject ? `主体：${spec.mainObject}` : '',
  spec.constraints.requiredText ? `必须出现的文字：${spec.constraints.requiredText}` : '',
  spec.visualStyle ? `视觉风格：${spec.visualStyle}` : '',
  spec.colorPreference ? `色彩偏好：${spec.colorPreference}` : '',
  spec.styles.length > 0 ? `继承风格标签：${spec.styles.join('、')}` : '',
  spec.scenes.length > 0 ? `适用场景标签：${spec.scenes.join('、')}` : '',
  spec.constraints.aspectRatio ? `画面比例：${spec.constraints.aspectRatio}` : '',
  spec.outputCount ? `输出数量：${spec.outputCount}` : '',
  spec.templateGuidance.length > 0 ? `模板建议：\n${spec.templateGuidance.map((item) => `- ${item}`).join('\n')}` : '',
  spec.templatePitfalls.length > 0 ? `避免问题：\n${spec.templatePitfalls.map((item) => `- ${item}`).join('\n')}` : '',
  renderTemplateFieldLines(spec),
  spec.constraints.negativeRequirements ? `负向要求：${spec.constraints.negativeRequirements}` : '',
  spec.contextPack ? `Context Pack：\n${spec.contextPack}` : '',
  spec.selectedCreativeDirection ? `已选择创意方向：\n${renderSelectedDirection(spec.selectedCreativeDirection, spec.language)}` : '',
  !spec.selectedCreativeDirection && spec.creativeDirections && spec.creativeDirections.length > 0
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
      !promptSpec.selectedCreativeDirection && promptSpec.creativeDirections && promptSpec.creativeDirections.length > 0
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
    !promptSpec.selectedCreativeDirection && promptSpec.creativeDirections && promptSpec.creativeDirections.length > 0
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
  spec.taskType ? `Task type: ${spec.taskType}` : '',
  spec.subject ? `Topic: ${spec.subject}` : '',
  spec.platform ? `Platform or usage context: ${spec.platform}` : '',
  spec.audience ? `Audience: ${spec.audience}` : '',
  spec.mainObject ? `Main subject: ${spec.mainObject}` : '',
  spec.constraints.requiredText ? `Required visible text: ${spec.constraints.requiredText}` : '',
  spec.visualStyle ? `Visual style: ${spec.visualStyle}` : '',
  spec.colorPreference ? `Color preference: ${spec.colorPreference}` : '',
  spec.styles.length > 0 ? `Inherited style tags: ${spec.styles.join(', ')}` : '',
  spec.scenes.length > 0 ? `Usage scene tags: ${spec.scenes.join(', ')}` : '',
  spec.constraints.aspectRatio ? `Aspect ratio: ${spec.constraints.aspectRatio}` : '',
  spec.outputCount ? `Output count: ${spec.outputCount}` : '',
  spec.templateGuidance.length > 0 ? `Template guidance:\n${spec.templateGuidance.map((item) => `- ${item}`).join('\n')}` : '',
  spec.templatePitfalls.length > 0 ? `Avoid:\n${spec.templatePitfalls.map((item) => `- ${item}`).join('\n')}` : '',
  renderTemplateFieldLines(spec),
  spec.constraints.negativeRequirements ? `Negative requirements: ${spec.constraints.negativeRequirements}` : '',
  spec.contextPack ? `Context Pack:\n${spec.contextPack}` : '',
  spec.selectedCreativeDirection ? `Selected creative direction:\n${renderSelectedDirection(spec.selectedCreativeDirection, spec.language)}` : '',
  !spec.selectedCreativeDirection && spec.creativeDirections && spec.creativeDirections.length > 0
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

const getCreatorMaterialPriority = (role: CreatorMaterialRole): string => {
  switch (role) {
    case CreatorMaterialRole.Reference:
    case CreatorMaterialRole.Brand:
      return 'primary';
    case CreatorMaterialRole.Negative:
      return 'avoid';
    case CreatorMaterialRole.Style:
    case CreatorMaterialRole.Source:
    default:
      return 'secondary';
  }
};

const getCreatorMaterialUsageInstruction = (
  role: CreatorMaterialRole,
  language: 'zh' | 'en'
): string => {
  const zh: Record<CreatorMaterialRole, string> = {
    [CreatorMaterialRole.Reference]: '参考主体、构图或整体方向，但不要强制复制全部细节',
    [CreatorMaterialRole.Style]: '只参考色彩、质感、光线、时代感和视觉语言',
    [CreatorMaterialRole.Brand]: '优先保留品牌色、logo、语气和识别特征，不要错误重绘品牌资产',
    [CreatorMaterialRole.Source]: '只作为事实来源和内容约束，不作为视觉风格来源',
    [CreatorMaterialRole.Negative]: '只用于避免，不得作为正向视觉参考',
  };
  const en: Record<CreatorMaterialRole, string> = {
    [CreatorMaterialRole.Reference]: 'Use for subject, composition, or overall direction without copying every detail.',
    [CreatorMaterialRole.Style]: 'Use only for color, texture, lighting, period feel, and visual language.',
    [CreatorMaterialRole.Brand]: 'Prioritize brand colors, logo, tone, and identity cues; do not redraw brand assets incorrectly.',
    [CreatorMaterialRole.Source]: 'Use only as factual source material and content constraints, not as visual style.',
    [CreatorMaterialRole.Negative]: 'Use only as avoidance guidance; never treat it as a positive visual reference.',
  };
  return language === 'zh' ? zh[role] : en[role];
};

const toPromptMaterial = (
  material: CreatorBuilderMaterial,
  language: 'zh' | 'en'
): CreatorPromptMaterial => ({
  id: material.id,
  role: material.role,
  source: material.source,
  name: material.name,
  path: material.path,
  mimeType: material.mimeType,
  hasImageAttachment: hasImageAttachment(material),
  localPathAvailable: hasUsableLocalPath(material.path),
  priority: getCreatorMaterialPriority(material.role),
  usageInstruction: getCreatorMaterialUsageInstruction(material.role, language),
  imageAnalysis: material.imageAnalysis,
});

const renderCreatorContextPackConflicts = (
  materials: CreatorPromptMaterial[],
  language: 'zh' | 'en'
): string[] => {
  const roles = new Set(materials.map((material) => material.role));
  const conflicts: string[] = [];
  if (roles.has(CreatorMaterialRole.Negative) && (roles.has(CreatorMaterialRole.Reference) || roles.has(CreatorMaterialRole.Style))) {
    conflicts.push(language === 'zh'
      ? '冲突提醒：negative 素材只用于避免，不得混入 reference/style 的正向参考。'
      : 'Conflict note: negative materials are avoidance constraints and must not be blended into positive reference/style guidance.');
  }
  if (roles.has(CreatorMaterialRole.Brand) && roles.has(CreatorMaterialRole.Style)) {
    conflicts.push(language === 'zh'
      ? '优先级提醒：brand 素材优先于 style 素材，若两者冲突，以品牌识别为准。'
      : 'Priority note: brand materials override style materials when they conflict; preserve brand identity first.');
  }
  if (roles.has(CreatorMaterialRole.Source) && (roles.has(CreatorMaterialRole.Reference) || roles.has(CreatorMaterialRole.Style))) {
    conflicts.push(language === 'zh'
      ? '来源提醒：source 素材只约束事实内容，不要把事实来源当成视觉风格。'
      : 'Source note: source materials constrain factual content only; do not treat them as visual style.');
  }
  return conflicts;
};

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
  const conflicts = renderCreatorContextPackConflicts(materials, language);
  return [
    header,
    ...materials.map((material, index) => {
      const attachment = material.hasImageAttachment ? 'base64' : 'none';
      const localPath = material.localPathAvailable ? 'available' : 'unavailable';
      const priority = material.priority ?? getCreatorMaterialPriority(material.role);
      const usageInstruction = material.usageInstruction ?? getCreatorMaterialUsageInstruction(material.role, language);
      const imageSummary = material.imageAnalysis
        ? (
          language === 'zh'
            ? `；image=${material.imageAnalysis.width}x${material.imageAnalysis.height}；colors=${material.imageAnalysis.dominantColors.join(', ')}`
            : `; image=${material.imageAnalysis.width}x${material.imageAnalysis.height}; colors=${material.imageAnalysis.dominantColors.join(', ')}`
        )
        : '';
      const fallbackNote = !material.localPathAvailable && material.hasImageAttachment
        ? (
          language === 'zh'
            ? '；note=该素材没有真实本地路径，非视觉模型只能依据附件说明处理'
            : '; note=this material has no real local path, so non-vision models can only use the attachment description'
        )
        : '';
      return language === 'zh'
        ? `${index + 1}. role=${material.role}（${roleText(material.role)}）；priority=${priority}；usage=${usageInstruction}；name=${material.name}；path=${material.path}；mime=${material.mimeType}；attachment=${attachment}；localPath=${localPath}${imageSummary}${fallbackNote}`
        : `${index + 1}. role=${material.role} (${roleText(material.role)}); priority=${priority}; usage=${usageInstruction}; name=${material.name}; path=${material.path}; mime=${material.mimeType}; attachment=${attachment}; localPath=${localPath}${imageSummary}${fallbackNote}`;
    }),
    ...conflicts,
  ].join('\n');
};

export const buildCreatorCreativeDirections = (spec: CreatorPromptSpec): CreatorCreativeDirection[] => {
  const topic = spec.subject || spec.mainObject || spec.sourceTitle;
  if (spec.category === 'UI & Interfaces') {
    return buildUiCreativeDirections(spec, topic);
  }
  if (spec.category === 'Posters & Typography') {
    return buildPosterCreativeDirections(spec, topic);
  }
  if (spec.category === 'Charts & Infographics') {
    return buildInfographicCreativeDirections(spec, topic);
  }
  if (spec.category === 'Products & E-commerce') {
    return buildProductCreativeDirections(spec, topic);
  }
  return buildDefaultCreativeDirections(spec, topic);
};

const buildUiCreativeDirections = (
  spec: CreatorPromptSpec,
  topic: string
): CreatorCreativeDirection[] => {
  if (spec.language === 'zh') {
    return [
      {
        id: 'ui-product-flow',
        title: '产品流程截图',
        template: '真实界面框架 + 清晰操作路径',
        style: spec.visualStyle || '高保真 SaaS / App 截图',
        reason: `适合把「${topic}」呈现为可理解的产品流程。`,
        promptFocus: '明确状态栏、导航、核心卡片、按钮状态和可读 UI 文案。',
      },
      {
        id: 'ui-dashboard-density',
        title: '数据仪表盘',
        template: '密集信息面板 + 层级化指标',
        style: '专业 dashboard / analytics UI',
        reason: '适合呈现运营、数据、监控和决策场景。',
        promptFocus: '强化 KPI、图表、筛选器、表格和信息分组，不做空泛界面。',
      },
      {
        id: 'ui-social-context',
        title: '社媒界面语境',
        template: '平台截图 + 评论/互动层',
        style: '真实社媒截图 / mobile UI',
        reason: '适合把内容放进可传播的平台环境。',
        promptFocus: '加入平台 chrome、点赞评论、头像、时间戳和边缘安全区。',
      },
      {
        id: 'ui-state-variant',
        title: '关键状态变体',
        template: '同一界面的状态差异',
        style: '产品原型 / design review',
        reason: '适合对比加载、空状态、成功、异常或选中状态。',
        promptFocus: '突出交互状态变化，同时保持界面系统一致。',
      },
    ];
  }
  return [
    {
      id: 'ui-product-flow',
      title: 'Product flow screenshot',
      template: 'real interface frame with clear action path',
      style: spec.visualStyle || 'high-fidelity SaaS / app screenshot',
      reason: `Best for presenting "${topic}" as an understandable product flow.`,
      promptFocus: 'Specify chrome, navigation, primary cards, button states, and readable UI copy.',
    },
    {
      id: 'ui-dashboard-density',
      title: 'Dashboard density',
      template: 'dense information panel with metric hierarchy',
      style: 'professional dashboard / analytics UI',
      reason: 'Best for operations, data, monitoring, and decision-support scenes.',
      promptFocus: 'Emphasize KPIs, charts, filters, tables, and grouped information instead of generic UI.',
    },
    {
      id: 'ui-social-context',
      title: 'Social context UI',
      template: 'platform screenshot with comments and interaction layers',
      style: 'realistic social / mobile UI',
      reason: 'Best for placing content inside a recognizable distribution context.',
      promptFocus: 'Add platform chrome, reactions, comments, avatars, timestamps, and safe margins.',
    },
    {
      id: 'ui-state-variant',
      title: 'State variant',
      template: 'same interface with a meaningful state difference',
      style: 'product prototype / design review',
      reason: 'Best for comparing loading, empty, success, error, or selected states.',
      promptFocus: 'Make the interaction state obvious while preserving system consistency.',
    },
  ];
};

const buildPosterCreativeDirections = (
  spec: CreatorPromptSpec,
  topic: string
): CreatorCreativeDirection[] => {
  if (spec.language === 'zh') {
    return [
      {
        id: 'poster-type-hero',
        title: '大字主视觉',
        template: '强标题 + 单一视觉符号',
        style: spec.visualStyle || '高冲击商业海报',
        reason: `适合快速建立「${topic}」的首屏记忆点。`,
        promptFocus: '控制标题层级、留白、对比和主体轮廓，保证远距离可读。',
      },
      {
        id: 'poster-editorial-grid',
        title: '编辑网格',
        template: '杂志网格 + 多层信息',
        style: 'editorial poster / typography system',
        reason: '适合活动、展览、发布和内容型海报。',
        promptFocus: '用网格、编号、短标签和图片块组织信息层级。',
      },
      {
        id: 'poster-symbolic-collage',
        title: '符号拼贴',
        template: '核心符号 + 情绪化拼贴',
        style: 'campaign collage / art direction',
        reason: '适合建立更强的情绪、叙事和品牌识别。',
        promptFocus: '将主体、纹理、背景符号和辅助文字形成统一视觉隐喻。',
      },
      {
        id: 'poster-minimal-premium',
        title: '高级极简',
        template: '大留白 + 精准主体',
        style: 'premium minimal poster',
        reason: '适合高端、克制、品牌感强的表达。',
        promptFocus: '减少元素数量，强化材质、比例、字距和细节控制。',
      },
    ];
  }
  return [
    {
      id: 'poster-type-hero',
      title: 'Type hero',
      template: 'bold headline with one visual symbol',
      style: spec.visualStyle || 'high-impact commercial poster',
      reason: `Best for making "${topic}" memorable at first glance.`,
      promptFocus: 'Control headline hierarchy, whitespace, contrast, and subject silhouette for distance readability.',
    },
    {
      id: 'poster-editorial-grid',
      title: 'Editorial grid',
      template: 'magazine grid with layered information',
      style: 'editorial poster / typography system',
      reason: 'Best for events, exhibitions, launches, and content-led posters.',
      promptFocus: 'Use grids, numbering, short labels, and image blocks to organize hierarchy.',
    },
    {
      id: 'poster-symbolic-collage',
      title: 'Symbolic collage',
      template: 'core symbol with expressive collage',
      style: 'campaign collage / art direction',
      reason: 'Best when the image needs stronger emotion, story, and brand recall.',
      promptFocus: 'Unify subject, texture, background symbols, and supporting text into one visual metaphor.',
    },
    {
      id: 'poster-minimal-premium',
      title: 'Premium minimal',
      template: 'large negative space with precise subject',
      style: 'premium minimal poster',
      reason: 'Best for restrained, high-end, brand-led expression.',
      promptFocus: 'Reduce elements and tighten material, scale, spacing, and detail control.',
    },
  ];
};

const buildInfographicCreativeDirections = (
  spec: CreatorPromptSpec,
  topic: string
): CreatorCreativeDirection[] => {
  if (spec.language === 'zh') {
    return [
      {
        id: 'info-step-system',
        title: '步骤系统',
        template: '分步流程 + 编号节点',
        style: spec.visualStyle || '清晰信息图 / explainable diagram',
        reason: `适合解释「${topic}」的流程、方法或操作步骤。`,
        promptFocus: '明确起点、终点、箭头、编号和每步短标签。',
      },
      {
        id: 'info-comparison',
        title: '对比结构',
        template: '左右/矩阵对比 + 关键差异',
        style: 'comparison infographic',
        reason: '适合呈现方案、版本、对象或指标之间的差异。',
        promptFocus: '使用统一尺度、分区、图标和高亮色表达差异。',
      },
      {
        id: 'info-map-network',
        title: '关系地图',
        template: '节点网络 + 关系说明',
        style: 'knowledge map / system diagram',
        reason: '适合复杂对象、概念、生态或系统架构。',
        promptFocus: '控制节点层级、连线含义、分组边界和阅读顺序。',
      },
      {
        id: 'info-editorial-explainer',
        title: '编辑解释图',
        template: '主图 + 标注 + 小型数据块',
        style: 'editorial explainer',
        reason: '适合把知识说明做得更有传播感。',
        promptFocus: '结合主视觉、短注释、数据点和版面节奏。',
      },
    ];
  }
  return [
    {
      id: 'info-step-system',
      title: 'Step system',
      template: 'step-by-step flow with numbered nodes',
      style: spec.visualStyle || 'clean infographic / explainable diagram',
      reason: `Best for explaining the process, method, or steps behind "${topic}".`,
      promptFocus: 'Specify start, end, arrows, numbers, and short labels for each step.',
    },
    {
      id: 'info-comparison',
      title: 'Comparison structure',
      template: 'side-by-side or matrix comparison with key differences',
      style: 'comparison infographic',
      reason: 'Best for showing differences between options, versions, objects, or metrics.',
      promptFocus: 'Use consistent scale, zones, icons, and highlight colors to express differences.',
    },
    {
      id: 'info-map-network',
      title: 'Relationship map',
      template: 'node network with relationship explanations',
      style: 'knowledge map / system diagram',
      reason: 'Best for complex concepts, ecosystems, systems, or architectures.',
      promptFocus: 'Control node hierarchy, line meaning, group boundaries, and reading order.',
    },
    {
      id: 'info-editorial-explainer',
      title: 'Editorial explainer',
      template: 'hero visual with annotations and small data blocks',
      style: 'editorial explainer',
      reason: 'Best when educational content needs stronger shareability.',
      promptFocus: 'Combine hero visual, short annotations, data points, and editorial rhythm.',
    },
  ];
};

const buildProductCreativeDirections = (
  spec: CreatorPromptSpec,
  topic: string
): CreatorCreativeDirection[] => {
  if (spec.language === 'zh') {
    return [
      {
        id: 'product-hero-commerce',
        title: '商品主图',
        template: '产品主体 + 卖点层级',
        style: spec.visualStyle || '高级电商主视觉',
        reason: `适合把「${topic}」转成可销售的商品视觉。`,
        promptFocus: '突出产品轮廓、材质、包装、卖点和购买理由。',
      },
      {
        id: 'product-lifestyle-use',
        title: '生活方式场景',
        template: '产品使用情境 + 人物/环境线索',
        style: 'lifestyle commerce photography',
        reason: '适合让用户理解产品如何进入真实生活。',
        promptFocus: '加入使用动作、场景道具、真实光线和情绪收益。',
      },
      {
        id: 'product-detail-breakdown',
        title: '细节拆解',
        template: '局部特写 + 功能标注',
        style: 'technical product breakdown',
        reason: '适合解释材质、结构、功能和差异化卖点。',
        promptFocus: '使用放大细节、箭头、标签和对比区块。',
      },
      {
        id: 'product-offer-campaign',
        title: '促销活动视觉',
        template: '活动信息 + 产品组合',
        style: 'retail campaign visual',
        reason: '适合节日、上新、组合包和限时优惠。',
        promptFocus: '平衡价格/权益文字、产品数量、节日元素和行动召唤。',
      },
    ];
  }
  return [
    {
      id: 'product-hero-commerce',
      title: 'Commerce hero',
      template: 'product hero with benefit hierarchy',
      style: spec.visualStyle || 'premium e-commerce hero visual',
      reason: `Best for turning "${topic}" into a sellable product visual.`,
      promptFocus: 'Emphasize silhouette, materials, packaging, benefits, and purchase reason.',
    },
    {
      id: 'product-lifestyle-use',
      title: 'Lifestyle use',
      template: 'product-in-use scene with human or environment cues',
      style: 'lifestyle commerce photography',
      reason: 'Best for showing how the product fits into real life.',
      promptFocus: 'Add use actions, contextual props, realistic light, and emotional benefit.',
    },
    {
      id: 'product-detail-breakdown',
      title: 'Detail breakdown',
      template: 'close-up details with feature callouts',
      style: 'technical product breakdown',
      reason: 'Best for explaining materials, structure, features, and differentiators.',
      promptFocus: 'Use magnified details, arrows, labels, and comparison zones.',
    },
    {
      id: 'product-offer-campaign',
      title: 'Offer campaign',
      template: 'offer message with product bundle',
      style: 'retail campaign visual',
      reason: 'Best for holidays, drops, bundles, and limited-time offers.',
      promptFocus: 'Balance price or benefit copy, product count, seasonal cues, and call to action.',
    },
  ];
};

const buildDefaultCreativeDirections = (
  spec: CreatorPromptSpec,
  topic: string
): CreatorCreativeDirection[] => {
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

const renderTemplateFieldLines = (spec: CreatorPromptSpec): string => {
  const fieldSchema = spec.templateFieldSchema ?? [];
  const values = fieldSchema
    .map((field) => ({
      label: field.label[spec.language],
      value: spec.templateFieldValues[field.id]?.trim() ?? '',
    }))
    .filter((item) => item.value.length > 0);
  if (values.length === 0) {
    return '';
  }
  const body = values.map((item) => `- ${item.label}: ${item.value}`).join('\n');
  return spec.language === 'zh'
    ? `模板动态字段：\n${body}`
    : `Template fields:\n${body}`;
};

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
