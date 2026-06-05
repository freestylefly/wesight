export interface LocalizedText {
  en: string;
  zh: string;
}

export interface CreatorStudioCase {
  id: string;
  sourceCaseId: number;
  title: string;
  image: string | null;
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

export interface CreatorPromptSpec {
  sourceType: CreatorStudioSourceType;
  sourceId: string;
  sourceTitle: string;
  language: 'zh' | 'en';
  category?: string;
  caseIds: string[];
  styles: string[];
  scenes: string[];
  subject: string;
  platform: string;
  mainObject: string;
  visualStyle: string;
  constraints: {
    aspectRatio?: string;
    requiredText?: string;
    negativeRequirements?: string;
  };
  templateGuidance: string[];
  templatePitfalls: string[];
  referencePrompt?: string;
  templateId?: string;
}
