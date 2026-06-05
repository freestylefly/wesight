import type {
  CreatorAssetAdoptionStatus,
  CreatorProductionAssetKind,
  CreatorProductionAssetSource,
  CreatorProductionAssetStatus,
  CreatorProductionRunSource,
  CreatorProductionRunStatus,
} from './constants';

export interface CreatorPromptSpecSnapshot {
  sourceType?: string;
  sourceId?: string;
  sourceTitle?: string;
  language?: 'zh' | 'en';
  category?: string;
  caseIds?: string[];
  styles?: string[];
  scenes?: string[];
  subject?: string;
  platform?: string;
  mainObject?: string;
  visualStyle?: string;
  constraints?: Record<string, string | undefined>;
  templateGuidance?: string[];
  templatePitfalls?: string[];
  referencePrompt?: string;
  templateId?: string;
  materials?: Array<{
    id: string;
    role: string;
    source: string;
    name: string;
    path: string;
    mimeType: string;
    hasImageAttachment?: boolean;
    localPathAvailable?: boolean;
  }>;
  contextPack?: string;
  creativeDirections?: Array<{
    id: string;
    title: string;
    template: string;
    style: string;
    reason: string;
    promptFocus: string;
  }>;
  selectedCreativeDirectionId?: string;
  selectedCreativeDirection?: {
    id: string;
    title: string;
    template: string;
    style: string;
    reason: string;
    promptFocus: string;
  };
  variantOfAssetId?: string;
  [key: string]: unknown;
}

export interface CreatorStudioSourceContext {
  templateId: string | null;
  caseIds: string[];
  promptSpec: CreatorPromptSpecSnapshot | null;
  promptText: string;
  sourceTitle: string | null;
  variantOfAssetId: string | null;
}

export interface CreatorProductionRunRecord {
  id: string;
  source: CreatorProductionRunSource;
  status: CreatorProductionRunStatus;
  sessionId: string | null;
  templateId: string | null;
  caseIds: string[];
  promptSpec: CreatorPromptSpecSnapshot | null;
  promptText: string;
  variantOfAssetId: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface CreatorProductionAssetRecord {
  id: string;
  projectId: string;
  kind: CreatorProductionAssetKind;
  status: CreatorProductionAssetStatus;
  source: CreatorProductionAssetSource;
  runId: string | null;
  variantOfAssetId: string | null;
  sessionId: string | null;
  messageId: string | null;
  templateId: string | null;
  caseIds: string[];
  promptSpec: CreatorPromptSpecSnapshot | null;
  promptText: string;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  favorite: boolean;
  adoptionStatus: CreatorAssetAdoptionStatus;
  tags: string[];
  collectionIds: string[];
  selected: boolean;
  licenseNote: string | null;
  usageNote: string | null;
  createdAt: number;
  updatedAt: number;
  sourceSessionAvailable: boolean;
}

export interface CreatorProductionAssetSourceLookup {
  asset: CreatorProductionAssetRecord;
  session: {
    id: string;
    title: string;
    status: string;
    createdAt: number;
    updatedAt: number;
  } | null;
}

export interface CreatorProductionAssetListInput {
  projectId?: string;
  collectionId?: string;
  source?: CreatorProductionAssetSource;
  templateId?: string;
  tag?: string;
  adoptionStatus?: CreatorAssetAdoptionStatus;
  favorite?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreatorProductionAssetListResult {
  assets: CreatorProductionAssetRecord[];
  total: number;
}

export interface CreatorProjectRecord {
  id: string;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreatorAssetCollectionRecord {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  assetCount: number;
}

export interface CreatorWorkspaceSnapshot {
  currentProjectId: string;
  projects: CreatorProjectRecord[];
  collections: CreatorAssetCollectionRecord[];
}

export interface CreatorProjectCreateInput {
  name: string;
  description?: string;
}

export interface CreatorAssetCollectionCreateInput {
  projectId: string;
  name: string;
  description?: string;
}

export interface CreatorAssetUpdateInput {
  assetId: string;
  projectId?: string;
  favorite?: boolean;
  adoptionStatus?: CreatorAssetAdoptionStatus;
  tags?: string[];
  licenseNote?: string | null;
  usageNote?: string | null;
  selected?: boolean;
}

export interface CreatorAssetCollectionAddInput {
  assetId: string;
  collectionId: string;
}

export interface CreatorPromptAssetCreateInput {
  projectId: string;
  title: string;
  promptText: string;
  promptSpec: CreatorPromptSpecSnapshot;
  templateId?: string | null;
  caseIds?: string[];
  tags?: string[];
}

export interface CreatorCaseAssetCreateInput {
  projectId: string;
  caseId: string;
  title: string;
  promptText: string;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  githubUrl?: string | null;
  category?: string | null;
  styles?: string[];
  scenes?: string[];
  tags?: string[];
}
