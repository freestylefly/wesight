import type { CreatorStudioTemplate, CreatorTemplateFieldSchema } from '../types/creatorStudio';
import { CreatorTemplateFieldKind } from '../types/creatorStudio';

const selectOption = (value: string, en: string, zh: string) => ({
  value,
  label: { en, zh },
});

const uiFields: CreatorTemplateFieldSchema[] = [{
  id: 'screenType',
  kind: CreatorTemplateFieldKind.Select,
  label: { en: 'Screen type', zh: '界面类型' },
  help: { en: 'Choose the interface surface the image should depict.', zh: '选择画面要呈现的界面载体。' },
  options: [
    selectOption('mobile-app', 'Mobile app', '移动 App'),
    selectOption('web-dashboard', 'Web dashboard', '网页仪表盘'),
    selectOption('social-feed', 'Social feed', '社媒信息流'),
    selectOption('live-interface', 'Live interface', '直播界面'),
  ],
}, {
  id: 'uiChrome',
  kind: CreatorTemplateFieldKind.Textarea,
  label: { en: 'UI chrome', zh: '界面组件' },
  placeholder: { en: 'status bar, tabs, comments, action row...', zh: '状态栏、Tab、评论层、操作区...' },
}, {
  id: 'interactionState',
  kind: CreatorTemplateFieldKind.Text,
  label: { en: 'Interaction state', zh: '交互状态' },
  placeholder: { en: 'empty state, selected tab, checkout step...', zh: '空状态、选中 Tab、结算步骤...' },
}];

const posterFields: CreatorTemplateFieldSchema[] = [{
  id: 'headline',
  kind: CreatorTemplateFieldKind.Text,
  label: { en: 'Headline', zh: '主标题' },
  placeholder: { en: 'Short visible title', zh: '短主标题' },
}, {
  id: 'hierarchy',
  kind: CreatorTemplateFieldKind.Textarea,
  label: { en: 'Visual hierarchy', zh: '视觉层级' },
  placeholder: { en: 'large headline, hero object, supporting labels...', zh: '大标题、主视觉、辅助标签...' },
}, {
  id: 'typographyMood',
  kind: CreatorTemplateFieldKind.Select,
  label: { en: 'Typography mood', zh: '字体气质' },
  options: [
    selectOption('bold-campaign', 'Bold campaign', '强冲击活动'),
    selectOption('editorial', 'Editorial', '杂志编辑'),
    selectOption('minimal', 'Minimal', '极简'),
    selectOption('experimental', 'Experimental', '实验性'),
  ],
}];

const infographicFields: CreatorTemplateFieldSchema[] = [{
  id: 'informationStructure',
  kind: CreatorTemplateFieldKind.Textarea,
  label: { en: 'Information structure', zh: '信息结构' },
  placeholder: { en: 'timeline, comparison, map, step-by-step...', zh: '时间线、对比、地图、步骤...' },
}, {
  id: 'keyCallouts',
  kind: CreatorTemplateFieldKind.Textarea,
  label: { en: 'Key callouts', zh: '关键标注' },
  placeholder: { en: 'facts, numbers, labels, annotations...', zh: '事实、数字、标签、注释...' },
}, {
  id: 'chartStyle',
  kind: CreatorTemplateFieldKind.Select,
  label: { en: 'Chart style', zh: '图解风格' },
  options: [
    selectOption('clean-ui', 'Clean UI', '清晰 UI'),
    selectOption('editorial-diagram', 'Editorial diagram', '编辑图解'),
    selectOption('technical', 'Technical', '技术说明'),
  ],
}];

const productFields: CreatorTemplateFieldSchema[] = [{
  id: 'productPromise',
  kind: CreatorTemplateFieldKind.Text,
  label: { en: 'Product promise', zh: '产品卖点' },
}, {
  id: 'usageContext',
  kind: CreatorTemplateFieldKind.Textarea,
  label: { en: 'Usage context', zh: '使用场景' },
}, {
  id: 'commerceDetails',
  kind: CreatorTemplateFieldKind.Textarea,
  label: { en: 'Commerce details', zh: '商品细节' },
  placeholder: { en: 'packaging, texture, offer, props...', zh: '包装、材质、优惠、道具...' },
}];

const brandFields: CreatorTemplateFieldSchema[] = [{
  id: 'brandPersonality',
  kind: CreatorTemplateFieldKind.Text,
  label: { en: 'Brand personality', zh: '品牌人格' },
}, {
  id: 'identityElements',
  kind: CreatorTemplateFieldKind.Textarea,
  label: { en: 'Identity elements', zh: '识别元素' },
}, {
  id: 'touchpoints',
  kind: CreatorTemplateFieldKind.Textarea,
  label: { en: 'Touchpoints', zh: '触点物料' },
}];

const photographyFields: CreatorTemplateFieldSchema[] = [{
  id: 'moment',
  kind: CreatorTemplateFieldKind.Text,
  label: { en: 'Moment', zh: '瞬间' },
}, {
  id: 'lighting',
  kind: CreatorTemplateFieldKind.Text,
  label: { en: 'Lighting', zh: '光线' },
}, {
  id: 'cameraFeel',
  kind: CreatorTemplateFieldKind.Select,
  label: { en: 'Camera feel', zh: '镜头质感' },
  options: [
    selectOption('documentary', 'Documentary', '纪实'),
    selectOption('cinematic', 'Cinematic', '电影感'),
    selectOption('commercial', 'Commercial', '商业摄影'),
  ],
}];

const defaultFields: CreatorTemplateFieldSchema[] = [{
  id: 'narrativeFocus',
  kind: CreatorTemplateFieldKind.Textarea,
  label: { en: 'Narrative focus', zh: '叙事重点' },
}, {
  id: 'detailStrategy',
  kind: CreatorTemplateFieldKind.Textarea,
  label: { en: 'Detail strategy', zh: '细节策略' },
}];

const categoryFieldSchemas: Record<string, CreatorTemplateFieldSchema[]> = {
  'UI & Interfaces': uiFields,
  'Posters & Typography': posterFields,
  'Charts & Infographics': infographicFields,
  'Products & E-commerce': productFields,
  'Brand & Logos': brandFields,
  'Photography & Realism': photographyFields,
};

export const getCreatorTemplateFieldSchema = (
  template: CreatorStudioTemplate | null | undefined
): CreatorTemplateFieldSchema[] => {
  if (!template) {
    return [];
  }
  if (template.fieldSchema && template.fieldSchema.length > 0) {
    return template.fieldSchema;
  }
  return categoryFieldSchemas[template.category] ?? defaultFields;
};
