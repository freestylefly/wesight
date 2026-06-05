export interface LocalizedText {
  en: string;
  zh: string;
}

export interface CreatorStudioImageMetadata {
  width: number;
  height: number;
  aspectRatio: number;
  mimeType: string;
  byteSize: number;
}

export interface CreatorStudioCase {
  id: string;
  sourceCaseId: number;
  title: string;
  image: string | null;
  imageOriginal: CreatorStudioImageMetadata | null;
  imageThumbnail: CreatorStudioImageMetadata | null;
  imageAlt: string;
  sourceLabel: string;
  sourceUrl: string | null;
  githubUrl: string | null;
  prompt: string;
  promptPreview: string;
  category: string;
  styles: string[];
  scenes: string[];
  featured: boolean;
  tags: string[];
}

export interface CreatorStudioCategory {
  id: string;
  value: string;
  anchor: string;
  templateAnchor?: string;
  cover: string;
  title: LocalizedText;
  description: LocalizedText;
}

export interface CreatorStudioStyle {
  id: string;
  value: string;
  title: LocalizedText;
  keywords: string[];
}

export interface CreatorStudioScene {
  id: string;
  value: string;
  title: LocalizedText;
  keywords: string[];
}

export interface CreatorStudioTemplate {
  id: string;
  anchor: string;
  cover: string | null;
  title: LocalizedText;
  description: LocalizedText;
  category: string;
  styles: string[];
  scenes: string[];
  tags: string[];
  useWhen: LocalizedText;
  guidance: Record<'en' | 'zh', string[]>;
  pitfalls: Record<'en' | 'zh', string[]>;
  exampleCases: number[];
  fieldSchema?: CreatorTemplateFieldSchema[];
}

export interface CreatorStudioStyleLibrary {
  version: number;
  repository: string;
  templateDocument: string;
  tagLabels: Record<string, LocalizedText>;
  categories: CreatorStudioCategory[];
  styles: CreatorStudioStyle[];
  scenes: CreatorStudioScene[];
  templates: CreatorStudioTemplate[];
}

export interface CreatorStudioManifest {
  schemaVersion: number;
  appVersion: string | null;
  source: {
    name: string;
    repository: string;
    version: number | null;
    commit: string | null;
    paths: {
      cases: string;
      styleLibrary: string;
    };
  };
  importedAt: string;
  counts: {
    cases: number;
    categories: number;
    styles: number;
    scenes: number;
    templates: number;
  };
  runtimeDependency: {
    referPathRequired: boolean;
    imageAssetsCopied: boolean;
    thumbnailsCopied: boolean;
    thumbnailMaxSize: number;
    thumbnailPath: string;
  };
  skillStrategy: {
    gptImage2StyleLibrary: 'skillhub_recommendation' | 'copy_to_skills';
    copiedToSkills: boolean;
    note: string;
  };
}

export const CreatorStudioSourceType = {
  Case: 'case',
  Template: 'template',
} as const;

export type CreatorStudioSourceType = typeof CreatorStudioSourceType[keyof typeof CreatorStudioSourceType];

export const CreatorPromptSourceMode = {
  Blank: 'blank',
  CaseRemix: 'case-remix',
  TemplateDraft: 'template-draft',
  RecipeDraft: 'recipe-draft',
  AssetVariant: 'asset-variant',
} as const;

export type CreatorPromptSourceMode = typeof CreatorPromptSourceMode[keyof typeof CreatorPromptSourceMode];

export const CreatorMaterialRole = {
  Reference: 'reference',
  Style: 'style',
  Brand: 'brand',
  Source: 'source',
  Negative: 'negative',
} as const;

export type CreatorMaterialRole = typeof CreatorMaterialRole[keyof typeof CreatorMaterialRole];

export const CreatorMaterialSource = {
  File: 'file',
  Clipboard: 'clipboard',
} as const;

export type CreatorMaterialSource = typeof CreatorMaterialSource[keyof typeof CreatorMaterialSource];

export const CreatorTemplateFieldKind = {
  Text: 'text',
  Textarea: 'textarea',
  Select: 'select',
} as const;

export type CreatorTemplateFieldKind =
  typeof CreatorTemplateFieldKind[keyof typeof CreatorTemplateFieldKind];

export interface CreatorTemplateFieldOption {
  value: string;
  label: LocalizedText;
}

export interface CreatorTemplateFieldSchema {
  id: string;
  kind: CreatorTemplateFieldKind;
  label: LocalizedText;
  help?: LocalizedText;
  placeholder?: LocalizedText;
  options?: CreatorTemplateFieldOption[];
}

export interface CreatorBuilderMaterial {
  id: string;
  role: CreatorMaterialRole;
  source: CreatorMaterialSource;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  previewUrl: string;
  dataUrl?: string;
  imageAnalysis?: CreatorMaterialImageAnalysis;
  addedAt: number;
}

export interface CreatorMaterialImageAnalysis {
  width: number;
  height: number;
  dominantColors: string[];
  orientation?: 'landscape' | 'portrait' | 'square';
  aspectRatio?: string;
  brightness?: 'dark' | 'balanced' | 'bright';
  contrast?: 'low' | 'medium' | 'high';
  colorMood?: 'warm' | 'cool' | 'neutral' | 'mixed';
  summary?: string;
}

export interface CreatorPromptMaterial {
  id: string;
  role: CreatorMaterialRole;
  source: CreatorMaterialSource;
  name: string;
  path: string;
  mimeType: string;
  hasImageAttachment: boolean;
  localPathAvailable: boolean;
  priority?: string;
  usageInstruction?: string;
  imageAnalysis?: CreatorMaterialImageAnalysis;
}

export interface CreatorCreativeDirection {
  id: string;
  title: string;
  template: string;
  style: string;
  reason: string;
  promptFocus: string;
}

export interface CreatorPromptReferenceAnalysis {
  aspectRatio: string;
  structure: string[];
  styleNotes: string[];
  textNotes: string[];
  constraintNotes: string[];
}

export interface CreatorPromptSpec {
  sourceType: CreatorStudioSourceType;
  sourceMode?: CreatorPromptSourceMode;
  sourceId: string;
  sourceTitle: string;
  language: 'zh' | 'en';
  category?: string;
  caseIds: string[];
  styles: string[];
  scenes: string[];
  taskType: string;
  subject: string;
  platform: string;
  audience: string;
  mainObject: string;
  visualStyle: string;
  colorPreference: string;
  outputCount: string;
  constraints: {
    aspectRatio?: string;
    requiredText?: string;
    negativeRequirements?: string;
  };
  templateGuidance: string[];
  templatePitfalls: string[];
  templateFieldValues: Record<string, string>;
  templateFieldSchema?: CreatorTemplateFieldSchema[];
  referenceAnalysis?: CreatorPromptReferenceAnalysis;
  referencePrompt?: string;
  templateId?: string;
  materials?: CreatorPromptMaterial[];
  contextPack?: string;
  creativeDirections?: CreatorCreativeDirection[];
  selectedCreativeDirectionId?: string;
  selectedCreativeDirection?: CreatorCreativeDirection;
  variantOfAssetId?: string;
}
