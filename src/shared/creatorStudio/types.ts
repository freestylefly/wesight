import type {
  CreatorAssetAdoptionStatus,
  CreatorBatchRunStatus,
  CreatorBatchTaskStatus,
  CreatorBoardCardKind,
  CreatorBoardMoveDirection,
  CreatorCreativeModelOutputKind,
  CreatorProductionAssetKind,
  CreatorProductionAssetSource,
  CreatorProductionAssetStatus,
  CreatorProductionRunSource,
  CreatorProductionRunStatus,
} from './constants';

export interface CreatorPromptSpecSnapshot {
  schemaVersion?: 'creator.prompt.v1';
  sourceType?: string;
  sourceMode?: string;
  sourceId?: string;
  sourceTitle?: string;
  language?: 'zh' | 'en';
  category?: string;
  caseIds?: string[];
  styles?: string[];
  scenes?: string[];
  taskType?: string;
  subject?: string;
  platform?: string;
  audience?: string;
  mainObject?: string;
  visualStyle?: string;
  colorPreference?: string;
  outputCount?: string;
  constraints?: Record<string, string | undefined>;
  templateGuidance?: string[];
  templatePitfalls?: string[];
  templateFieldValues?: Record<string, string>;
  templateFields?: CreatorPromptSpecTemplateFieldSnapshot[];
  referenceAnalysis?: CreatorPromptSpecReferenceAnalysis;
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
    priority?: string;
    usageInstruction?: string;
    imageAnalysis?: {
      width: number;
      height: number;
      dominantColors: string[];
    };
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
  source?: CreatorPromptSpecSourceV1;
  brief?: CreatorPromptSpecBriefV1;
  composition?: CreatorPromptSpecCompositionV1;
  style?: CreatorPromptSpecStyleV1;
  text?: CreatorPromptSpecTextV1;
  output?: CreatorPromptSpecOutputV1;
  runtime?: CreatorPromptSpecRuntimeV1;
  template?: CreatorPromptSpecTemplateV1;
  provenance?: CreatorPromptSpecProvenanceV1;
  [key: string]: unknown;
}

export interface CreatorPromptSpecSourceV1 {
  mode: string;
  sourceType: string;
  sourceId: string;
  sourceTitle: string;
  templateId: string | null;
  caseIds: string[];
  variantOfAssetId: string | null;
  referencePrompt: string | null;
  referenceAnalysis?: CreatorPromptSpecReferenceAnalysis;
}

export interface CreatorPromptSpecReferenceAnalysis {
  aspectRatio: string;
  structure: string[];
  styleNotes: string[];
  textNotes: string[];
  constraintNotes: string[];
}

export interface CreatorPromptSpecBriefV1 {
  taskType: string;
  subject: string;
  goal: string;
  platform: string;
  audience: string;
  language: 'zh' | 'en';
}

export interface CreatorPromptSpecCompositionV1 {
  aspectRatio: string;
  mainObject: string;
}

export interface CreatorPromptSpecStyleV1 {
  visualStyle: string;
  styles: string[];
  scenes: string[];
  colorPreference: string;
}

export interface CreatorPromptSpecTextV1 {
  requiredText: string;
  negativeRequirements: string;
}

export interface CreatorPromptSpecOutputV1 {
  count: string;
}

export interface CreatorPromptSpecRuntimeV1 {
  activeSkillIds?: string[];
  missingSkillIds?: string[];
  requestImageGeneration?: boolean;
}

export interface CreatorPromptSpecTemplateFieldSnapshot {
  id: string;
  label: {
    zh: string;
    en: string;
  };
  value: string;
}

export interface CreatorPromptSpecTemplateV1 {
  templateId: string | null;
  fields: CreatorPromptSpecTemplateFieldSnapshot[];
}

export interface CreatorPromptSpecProvenanceV1 {
  templateId: string | null;
  caseIds: string[];
  variantOfAssetId: string | null;
}

export interface CreatorStudioSourceContext {
  templateId: string | null;
  caseIds: string[];
  promptSpec: CreatorPromptSpecSnapshot | null;
  promptText: string;
  sourceTitle: string | null;
  variantOfAssetId: string | null;
  batchRunId: string | null;
  batchTaskId: string | null;
  promptVersionId: string | null;
  recipeId: string | null;
  selectedDirectionId: string | null;
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
  promptVersionId: string | null;
  recipeId: string | null;
  selectedDirectionId: string | null;
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
  parentPromptAssetId: string | null;
  promptVersionId: string | null;
  recipeId: string | null;
  selectedDirectionId: string | null;
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
  parentPromptAssetId?: string | null;
  recipeId?: string | null;
  selectedDirectionId?: string | null;
  changeNote?: string | null;
}

export interface CreatorRecipeRecord {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  sourcePromptAssetId: string | null;
  promptSpec: CreatorPromptSpecSnapshot;
  defaultRuntime: Record<string, unknown>;
  defaultOutput: Record<string, unknown>;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CreatorRecipeCreateInput {
  projectId: string;
  title: string;
  description?: string | null;
  sourcePromptAssetId?: string | null;
  promptSpec: CreatorPromptSpecSnapshot;
  defaultRuntime?: Record<string, unknown>;
  defaultOutput?: Record<string, unknown>;
  tags?: string[];
}

export interface CreatorRecipeListInput {
  projectId?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export interface CreatorRecipeListResult {
  recipes: CreatorRecipeRecord[];
  total: number;
}

export interface CreatorRecipeImportInput {
  projectId: string;
  recipe: Omit<CreatorRecipeCreateInput, 'projectId'> & {
    projectId?: string;
  };
}

export interface CreatorPromptVersionRecord {
  id: string;
  promptAssetId: string;
  version: number;
  promptText: string;
  promptSpec: CreatorPromptSpecSnapshot;
  changeNote: string | null;
  createdAt: number;
}

export interface CreatorPromptVersionCreateInput {
  promptAssetId: string;
  promptText: string;
  promptSpec: CreatorPromptSpecSnapshot;
  changeNote?: string | null;
}

export interface CreatorPromptVersionListInput {
  promptAssetId: string;
  limit?: number;
  offset?: number;
}

export interface CreatorPromptVersionListResult {
  versions: CreatorPromptVersionRecord[];
  total: number;
}

export interface CreatorPromptVersionForkInput {
  promptVersionId: string;
  projectId?: string;
  title?: string;
  changeNote?: string | null;
}

export interface CreatorPromptVersionDiffInput {
  fromVersionId: string;
  toVersionId: string;
}

export interface CreatorPromptVersionDiffResult {
  fromVersion: CreatorPromptVersionRecord;
  toVersion: CreatorPromptVersionRecord;
  promptTextChanged: boolean;
  promptSpecChanged: boolean;
  promptTextBefore: string;
  promptTextAfter: string;
  promptSpecBefore: CreatorPromptSpecSnapshot;
  promptSpecAfter: CreatorPromptSpecSnapshot;
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

export interface CreatorBoardRecord {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreatorBoardDirectionSnapshot {
  id: string;
  title: string;
  template: string;
  style: string;
  reason: string;
  promptFocus: string;
}

export interface CreatorBoardCardRecord {
  id: string;
  boardId: string;
  projectId: string;
  kind: CreatorBoardCardKind;
  title: string;
  assetId: string | null;
  caseId: string | null;
  promptText: string;
  promptSpec: CreatorPromptSpecSnapshot | null;
  direction: CreatorBoardDirectionSnapshot | null;
  groupName: string | null;
  notes: string | null;
  position: number;
  selected: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreatorBrandKitRecord {
  projectId: string;
  colors: string[];
  logoAssetId: string | null;
  logoPath: string | null;
  bannedWords: string[];
  tone: string;
  visualPreferences: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreatorBoardWorkspaceSnapshot {
  projectId: string;
  currentBoardId: string;
  boards: CreatorBoardRecord[];
  cards: CreatorBoardCardRecord[];
  selectedCardIds: string[];
  brandKit: CreatorBrandKitRecord;
}

export interface CreatorBoardCreateInput {
  projectId: string;
  name: string;
  description?: string;
}

export interface CreatorBoardCardCreateInput {
  boardId: string;
  kind: CreatorBoardCardKind;
  title: string;
  assetId?: string | null;
  caseId?: string | null;
  promptText?: string;
  promptSpec?: CreatorPromptSpecSnapshot | null;
  direction?: CreatorBoardDirectionSnapshot | null;
  groupName?: string | null;
  notes?: string | null;
}

export interface CreatorBoardCardUpdateInput {
  cardId: string;
  title?: string;
  groupName?: string | null;
  notes?: string | null;
  direction?: CreatorBoardDirectionSnapshot | null;
}

export interface CreatorBoardCardMoveInput {
  cardId: string;
  direction: CreatorBoardMoveDirection;
}

export interface CreatorBoardCardSelectInput {
  cardId: string;
  selected: boolean;
}

export interface CreatorBoardContextPackInput {
  boardId: string;
  cardIds?: string[];
}

export interface CreatorBoardContextPackResult {
  boardId: string;
  cardIds: string[];
  contextPack: string;
}

export interface CreatorBrandKitUpdateInput {
  projectId: string;
  colors?: string[];
  logoAssetId?: string | null;
  logoPath?: string | null;
  bannedWords?: string[];
  tone?: string;
  visualPreferences?: string;
}

export interface CreatorCreativeModelCapability {
  id: string;
  providerId: string;
  displayName: string;
  outputKinds: CreatorCreativeModelOutputKind[];
  supportsVision: boolean;
  supportsReferenceImages: boolean;
  supportsBatch: boolean;
  recommendedFor: string[];
  sizes: string[];
  maxBatchTasks: number;
  costUnitLabel: string;
  costUnitEstimate: number;
}

export interface CreatorBatchDirectionInput {
  id: string;
  title: string;
  template: string;
  style: string;
  reason: string;
  promptFocus: string;
  promptText: string;
  promptSpec: CreatorPromptSpecSnapshot;
}

export interface CreatorBatchRunSummary {
  taskCount: number;
  modelIds: string[];
  modelNames: string[];
  templateIds: string[];
  sizes: string[];
  estimatedCostUnits: number;
  costUnitLabel: string;
}

export interface CreatorBatchRunCreateInput {
  projectId: string;
  briefTitle: string;
  promptSpec: CreatorPromptSpecSnapshot;
  promptText: string;
  directions: CreatorBatchDirectionInput[];
  modelIds: string[];
  templateIds: string[];
  sizes: string[];
}

export interface CreatorBatchTaskFailInput {
  taskId: string;
  error: string;
}

export interface CreatorBatchRunListInput {
  projectId?: string;
  limit?: number;
  offset?: number;
}

export interface CreatorBatchTaskRecord {
  id: string;
  batchRunId: string;
  projectId: string;
  status: CreatorBatchTaskStatus;
  directionId: string;
  directionTitle: string;
  modelId: string;
  modelName: string;
  templateId: string;
  size: string;
  promptSpec: CreatorPromptSpecSnapshot;
  promptText: string;
  assetIds: string[];
  error: string | null;
  costEstimateText: string;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface CreatorBatchRunRecord {
  id: string;
  projectId: string;
  status: CreatorBatchRunStatus;
  briefTitle: string;
  promptSpec: CreatorPromptSpecSnapshot;
  promptText: string;
  summary: CreatorBatchRunSummary;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  tasks: CreatorBatchTaskRecord[];
}

export interface CreatorBatchRunListResult {
  runs: CreatorBatchRunRecord[];
  total: number;
}
