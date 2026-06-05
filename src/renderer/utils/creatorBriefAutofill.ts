import type { CreatorPromptForm } from './creatorStudio';

export interface CreatorBriefAutofillResult {
  form: CreatorPromptForm;
  changedFields: CreatorBriefAutofillField[];
}

export type CreatorBriefAutofillField = Exclude<keyof CreatorPromptForm, 'templateFieldValues'>;

const CreatorBriefAutofillFields: CreatorBriefAutofillField[] = [
  'taskType',
  'subject',
  'platform',
  'audience',
  'mainObject',
  'requiredText',
  'visualStyle',
  'colorPreference',
  'aspectRatio',
  'outputCount',
  'negativeRequirements',
];

const ASPECT_RATIO_PATTERN = /\b(\d{1,2})\s*[:x]\s*(\d{1,2})\b/i;
const QUOTED_TEXT_PATTERN = /["“”'‘’]([^"“”'‘’]{1,80})["“”'‘’]/;

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const firstNonEmptySentence = (brief: string): string => {
  const sentence = brief
    .split(/[。.!?\n]/)
    .map(normalizeWhitespace)
    .find((item) => item.length > 0);
  return sentence ? sentence.slice(0, 120) : '';
};

const matchValue = (brief: string, patterns: RegExp[]): string => {
  for (const pattern of patterns) {
    const match = brief.match(pattern);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]).slice(0, 160);
    }
  }
  return '';
};

const inferTaskType = (brief: string): string => {
  const normalized = brief.toLowerCase();
  if (/ui|interface|dashboard|app screen|网页|界面|仪表盘|截图/.test(normalized)) return 'UI screenshot';
  if (/infographic|timeline|diagram|chart|信息图|时间线|图解|图表/.test(normalized)) return 'Infographic';
  if (/poster|campaign|海报|活动视觉|主视觉/.test(normalized)) return 'Poster';
  if (/product|commerce|e-commerce|商品|电商|产品图/.test(normalized)) return 'Product visual';
  if (/cover|social|小红书|instagram|tiktok|封面|社媒/.test(normalized)) return 'Social cover';
  return '';
};

const inferPlatform = (brief: string): string => {
  const platformPatterns: Array<[RegExp, string]> = [
    [/小红书|xiaohongshu/i, 'Xiaohongshu'],
    [/instagram|ig/i, 'Instagram'],
    [/tiktok|抖音/i, 'TikTok / Douyin'],
    [/youtube/i, 'YouTube'],
    [/dashboard|仪表盘/i, 'Dashboard'],
    [/app|mobile|移动端/i, 'Mobile app'],
    [/web|website|网页/i, 'Web'],
  ];
  return platformPatterns.find(([pattern]) => pattern.test(brief))?.[1] ?? '';
};

const inferColors = (brief: string): string => {
  const colors = [
    'black', 'white', 'red', 'blue', 'green', 'yellow', 'gold', 'silver', 'purple', 'pink',
    '黑', '白', '红', '蓝', '绿', '黄', '金', '银', '紫', '粉',
  ].filter((color) => brief.toLowerCase().includes(color));
  return [...new Set(colors)].join(', ');
};

const inferOutputCount = (brief: string): string => {
  const match = brief.match(/(?:输出|生成|produce|generate)\s*(\d{1,2})\s*(?:张|个|版|images?|outputs?|variations?)?/i);
  return match?.[1] ?? '';
};

const inferAspectRatio = (brief: string): string => {
  const match = brief.match(ASPECT_RATIO_PATTERN);
  return match ? `${match[1]}:${match[2]}` : '';
};

const createDraft = (brief: string): Partial<CreatorPromptForm> => {
  const normalizedBrief = normalizeWhitespace(brief);
  return {
    taskType: inferTaskType(normalizedBrief),
    subject: matchValue(normalizedBrief, [
      /(?:主题|topic|subject)[:：]\s*([^。.;；]+)/i,
      /(?:about|for)\s+([^。.;；]{3,80})/i,
    ]) || firstNonEmptySentence(normalizedBrief),
    platform: inferPlatform(normalizedBrief),
    audience: matchValue(normalizedBrief, [
      /(?:目标受众|受众|audience)[:：]\s*([^。.;；]+)/i,
      /(?:for|面向)\s+([^。.;；]{3,80})(?:用户|people|customers|audience)?/i,
    ]),
    mainObject: matchValue(normalizedBrief, [
      /(?:主体|主角|main subject|hero subject)[:：]\s*([^。.;；]+)/i,
      /(?:of|展示|突出)\s+([^。.;；]{3,80})/i,
    ]),
    requiredText: normalizedBrief.match(QUOTED_TEXT_PATTERN)?.[1] ?? '',
    visualStyle: matchValue(normalizedBrief, [
      /(?:风格|视觉风格|style|mood)[:：]\s*([^。.;；]+)/i,
    ]),
    colorPreference: inferColors(normalizedBrief),
    aspectRatio: inferAspectRatio(normalizedBrief),
    outputCount: inferOutputCount(normalizedBrief),
    negativeRequirements: matchValue(normalizedBrief, [
      /(?:不要|避免|禁止|negative|avoid|do not)[:：]?\s*([^。.;；]+)/i,
    ]),
  };
};

export const applyCreatorBriefAutofill = (
  form: CreatorPromptForm,
  brief: string
): CreatorBriefAutofillResult => {
  const draft = createDraft(brief);
  const nextForm = { ...form };
  const changedFields: CreatorBriefAutofillField[] = [];

  CreatorBriefAutofillFields.forEach((field) => {
    const currentValue = nextForm[field];
    const draftValue = draft[field] ?? '';
    if (currentValue.trim() || !draftValue.trim()) return;
    nextForm[field] = draftValue;
    changedFields.push(field);
  });

  return { form: nextForm, changedFields };
};
