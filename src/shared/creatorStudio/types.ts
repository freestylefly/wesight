import type {
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
  [key: string]: unknown;
}

export interface CreatorStudioSourceContext {
  templateId: string | null;
  caseIds: string[];
  promptSpec: CreatorPromptSpecSnapshot | null;
  promptText: string;
  sourceTitle: string | null;
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
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface CreatorProductionAssetRecord {
  id: string;
  kind: CreatorProductionAssetKind;
  status: CreatorProductionAssetStatus;
  source: CreatorProductionAssetSource;
  runId: string | null;
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
  limit?: number;
  offset?: number;
}

export interface CreatorProductionAssetListResult {
  assets: CreatorProductionAssetRecord[];
  total: number;
}
