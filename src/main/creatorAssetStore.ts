import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import {
  CreatorAssetAdoptionStatus,
  CreatorAssetSelectionStatus,
  CreatorBatchRunStatus,
  CreatorBatchTaskStatus,
  CreatorBoardCardKind,
  CreatorBoardMoveDirection,
  CreatorProductionAssetKind,
  CreatorProductionAssetSource,
  CreatorProductionAssetStatus,
  CreatorProductionRunSource,
  CreatorProductionRunStatus,
  CreatorStudioDefaultProjectId,
} from '../shared/creatorStudio/constants';
import { CREATOR_CREATIVE_MODEL_CAPABILITIES } from '../shared/creatorStudio/modelCapabilities';
import type {
  CreatorAssetCollectionAddInput,
  CreatorAssetCollectionCreateInput,
  CreatorAssetCollectionRecord,
  CreatorAssetUpdateInput,
  CreatorBatchDirectionInput,
  CreatorBatchRunCreateInput,
  CreatorBatchRunListInput,
  CreatorBatchRunListResult,
  CreatorBatchRunRecord,
  CreatorBatchRunSummary,
  CreatorBatchTaskFailInput,
  CreatorBatchTaskRecord,
  CreatorBoardCardCreateInput,
  CreatorBoardCardMoveInput,
  CreatorBoardCardRecord,
  CreatorBoardCardSelectInput,
  CreatorBoardCardUpdateInput,
  CreatorBoardContextPackInput,
  CreatorBoardContextPackResult,
  CreatorBoardCreateInput,
  CreatorBoardDirectionSnapshot,
  CreatorBoardRecord,
  CreatorBoardWorkspaceSnapshot,
  CreatorBrandKitRecord,
  CreatorBrandKitUpdateInput,
  CreatorCaseAssetCreateInput,
  CreatorProductionAssetListInput,
  CreatorProductionAssetListResult,
  CreatorProductionAssetRecord,
  CreatorProductionAssetSourceLookup,
  CreatorProductionRunRecord,
  CreatorProjectCreateInput,
  CreatorPromptAssetCreateInput,
  CreatorPromptSpecSnapshot,
  CreatorStudioSourceContext,
  CreatorWorkspaceSnapshot,
} from '../shared/creatorStudio/types';
import type { CoworkMessage, CoworkMessageMetadata } from './coworkStore';

interface ProductionAssetRow {
  id: string;
  project_id: string | null;
  kind: string;
  title: string | null;
  status: string;
  source: string;
  run_id: string | null;
  source_run_id: string | null;
  variant_of_asset_id: string | null;
  session_id: string | null;
  source_session_id: string | null;
  message_id: string | null;
  source_message_id: string | null;
  template_id: string | null;
  case_ids: string;
  case_ids_json: string | null;
  prompt_spec: string | null;
  prompt_spec_json: string | null;
  prompt_text: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  favorite: number;
  adoption_status: string | null;
  tags_json: string | null;
  license_note: string | null;
  usage_note: string | null;
  created_at: number;
  updated_at: number;
  source_session_available?: number | null;
  collection_ids_json?: string | null;
  selected_status?: string | null;
}

interface ProductionRunRow {
  id: string;
  source: string;
  status: string;
  session_id: string | null;
  template_id: string | null;
  variant_of_asset_id: string | null;
  case_ids: string;
  prompt_spec: string | null;
  prompt_text: string;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

type GeneratedImageInput = {
  path: string;
  name?: string;
  mimeType?: string;
  source?: string;
};

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

interface CollectionRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
  asset_count: number;
}

interface BoardRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

interface BoardCardRow {
  id: string;
  board_id: string;
  project_id: string;
  kind: string;
  title: string;
  asset_id: string | null;
  case_id: string | null;
  prompt_text: string;
  prompt_spec_json: string | null;
  direction_json: string | null;
  group_name: string | null;
  notes: string | null;
  position: number;
  created_at: number;
  updated_at: number;
  selected?: number | null;
}

interface BrandKitRow {
  project_id: string;
  colors_json: string | null;
  logo_asset_id: string | null;
  logo_path: string | null;
  banned_words_json: string | null;
  tone: string | null;
  visual_preferences: string | null;
  created_at: number;
  updated_at: number;
}

interface BatchRunRow {
  id: string;
  project_id: string;
  status: string;
  brief_title: string;
  prompt_spec_json: string;
  prompt_text: string;
  summary_json: string;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

interface BatchTaskRow {
  id: string;
  batch_run_id: string;
  project_id: string;
  status: string;
  direction_id: string;
  direction_title: string;
  model_id: string;
  model_name: string;
  template_id: string;
  size: string;
  prompt_spec_json: string;
  prompt_text: string;
  asset_ids_json: string | null;
  error: string | null;
  cost_estimate_text: string;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

const CREATOR_STUDIO_MARKER = '[Creator Studio]';
const CreatorWorkspaceStateKey = {
  CurrentProjectId: 'current_project_id',
  CurrentBoardIdPrefix: 'current_board_id',
} as const;

const parseJsonArray = (value: string | null | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
};

const normalizeTags = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const tag = value.trim();
    if (!tag) continue;
    unique.add(tag.slice(0, 48));
  }
  return [...unique].slice(0, 24);
};

const normalizeOptionalText = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 1000) : null
);

const isAdoptionStatus = (value: unknown): value is CreatorAssetAdoptionStatus => (
  typeof value === 'string'
  && Object.values(CreatorAssetAdoptionStatus).includes(value as CreatorAssetAdoptionStatus)
);

const parsePromptSpec = (value: string | null | undefined): CreatorPromptSpecSnapshot | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object'
      ? parsed as CreatorPromptSpecSnapshot
      : null;
  } catch {
    return null;
  }
};

const parseBatchSummary = (value: string | null | undefined): CreatorBatchRunSummary => {
  if (!value) {
    return {
      taskCount: 0,
      modelIds: [],
      modelNames: [],
      templateIds: [],
      sizes: [],
      estimatedCostUnits: 0,
      costUnitLabel: 'task',
    };
  }
  try {
    const parsed = JSON.parse(value) as Partial<CreatorBatchRunSummary> | null;
    return {
      taskCount: typeof parsed?.taskCount === 'number' ? parsed.taskCount : 0,
      modelIds: Array.isArray(parsed?.modelIds) ? parsed.modelIds.filter((item): item is string => typeof item === 'string') : [],
      modelNames: Array.isArray(parsed?.modelNames) ? parsed.modelNames.filter((item): item is string => typeof item === 'string') : [],
      templateIds: Array.isArray(parsed?.templateIds) ? parsed.templateIds.filter((item): item is string => typeof item === 'string') : [],
      sizes: Array.isArray(parsed?.sizes) ? parsed.sizes.filter((item): item is string => typeof item === 'string') : [],
      estimatedCostUnits: typeof parsed?.estimatedCostUnits === 'number' ? parsed.estimatedCostUnits : 0,
      costUnitLabel: typeof parsed?.costUnitLabel === 'string' ? parsed.costUnitLabel : 'task',
    };
  } catch {
    return {
      taskCount: 0,
      modelIds: [],
      modelNames: [],
      templateIds: [],
      sizes: [],
      estimatedCostUnits: 0,
      costUnitLabel: 'task',
    };
  }
};

const parseDirection = (value: string | null | undefined): CreatorBoardDirectionSnapshot | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CreatorBoardDirectionSnapshot> | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.title !== 'string') return null;
    return {
      id: typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id : parsed.title,
      title: parsed.title,
      template: typeof parsed.template === 'string' ? parsed.template : '',
      style: typeof parsed.style === 'string' ? parsed.style : '',
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      promptFocus: typeof parsed.promptFocus === 'string' ? parsed.promptFocus : '',
    };
  } catch {
    return null;
  }
};

const firstNonEmptyString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const getPromptSpecBatchString = (promptSpec: CreatorPromptSpecSnapshot | null, key: string): string | null => {
  const batch = promptSpec?.batch;
  if (!batch || typeof batch !== 'object' || Array.isArray(batch)) return null;
  const value = (batch as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const parseLineList = (text: string, key: string): string[] => {
  const pattern = new RegExp(`${key}\\s*[:：]\\s*([^\\n]+)`, 'i');
  const match = text.match(pattern);
  if (!match?.[1]) return [];
  const raw = match[1].trim();
  if (!raw || raw.toLowerCase() === 'none') return [];
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
};

export const parseCreatorStudioSourceContext = (text: string): CreatorStudioSourceContext | null => {
  if (!text.includes(CREATOR_STUDIO_MARKER)) {
    return null;
  }

  const promptSpecMatch = text.match(/PromptSpec:\s*```json\s*([\s\S]*?)```/i);
  const promptTextMatch = text.match(/Prompt:\s*```(?:text)?\s*([\s\S]*?)```/i);
  const promptSpec = parsePromptSpec(promptSpecMatch?.[1] ?? null);
  const templateId = firstNonEmptyString(
    promptSpec?.templateId,
    text.match(/templateId\s*[:：]\s*([^\n]+)/i)?.[1]?.replace(/^none$/i, '')
  );
  const caseIds = promptSpec?.caseIds && Array.isArray(promptSpec.caseIds)
    ? promptSpec.caseIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : parseLineList(text, 'caseIds');

  return {
    templateId,
    caseIds,
    promptSpec,
    promptText: promptTextMatch?.[1]?.trim() || '',
    sourceTitle: firstNonEmptyString(promptSpec?.sourceTitle),
    variantOfAssetId: firstNonEmptyString(promptSpec?.variantOfAssetId),
    batchRunId: firstNonEmptyString(
      getPromptSpecBatchString(promptSpec, 'batchRunId'),
      text.match(/batchRunId\s*[:：]\s*([^\n]+)/i)?.[1]
    ),
    batchTaskId: firstNonEmptyString(
      getPromptSpecBatchString(promptSpec, 'batchTaskId'),
      text.match(/batchTaskId\s*[:：]\s*([^\n]+)/i)?.[1]
    ),
  };
};

const getGeneratedImages = (metadata?: CoworkMessageMetadata): GeneratedImageInput[] => {
  const images = metadata?.generatedImages;
  if (!Array.isArray(images)) return [];
  return images.filter((image): image is GeneratedImageInput => (
    Boolean(image)
    && typeof image === 'object'
    && typeof (image as GeneratedImageInput).path === 'string'
    && (image as GeneratedImageInput).path.trim().length > 0
  ));
};

const getImageName = (image: GeneratedImageInput): string => {
  if (image.name?.trim()) return image.name.trim();
  return path.basename(image.path.trim()) || 'generated-image.png';
};

export class CreatorAssetStore {
  constructor(private readonly db: Database.Database) {}

  handleCoworkMessageInserted(input: { sessionId: string; message: CoworkMessage }): void {
    try {
      if (input.message.type === 'user') {
        this.createRunFromPrompt(input.sessionId, input.message.content, input.message.timestamp);
        return;
      }
      if (input.message.type === 'assistant') {
        this.ingestGeneratedImages(input.sessionId, input.message);
      }
    } catch (error) {
      console.warn('[CreatorAssetStore] failed to process cowork message:', error);
    }
  }

  createRunFromPrompt(sessionId: string, prompt: string, createdAt: number = Date.now()): CreatorProductionRunRecord | null {
    const context = parseCreatorStudioSourceContext(prompt);
    if (!context) return null;
    return this.createRun(sessionId, context, createdAt);
  }

  getWorkspace(): CreatorWorkspaceSnapshot {
    this.ensureDefaultProject();
    const currentProjectId = this.getCurrentProjectId();
    return {
      currentProjectId,
      projects: this.listProjects(),
      collections: this.listCollections(currentProjectId),
    };
  }

  createProject(input: CreatorProjectCreateInput): CreatorWorkspaceSnapshot {
    const name = input.name.trim().slice(0, 80);
    if (!name) {
      throw new Error('Project name is required');
    }
    const now = Date.now();
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO creator_projects (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, normalizeOptionalText(input.description), now, now);
    this.setCurrentProject(id);
    return this.getWorkspace();
  }

  setCurrentProject(projectId: string): CreatorWorkspaceSnapshot {
    const project = this.db.prepare('SELECT id FROM creator_projects WHERE id = ?').get(projectId) as { id: string } | undefined;
    if (!project) {
      throw new Error('Project not found');
    }
    this.db.prepare(`
      INSERT INTO creator_workspace_state (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(CreatorWorkspaceStateKey.CurrentProjectId, projectId, Date.now());
    return this.getWorkspace();
  }

  createCollection(input: CreatorAssetCollectionCreateInput): CreatorWorkspaceSnapshot {
    const projectId = input.projectId.trim();
    const name = input.name.trim().slice(0, 80);
    if (!projectId || !name) {
      throw new Error('projectId and collection name are required');
    }
    const project = this.db.prepare('SELECT id FROM creator_projects WHERE id = ?').get(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO creator_asset_collections (id, project_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), projectId, name, normalizeOptionalText(input.description), now, now);
    return this.getWorkspace();
  }

  addAssetToCollection(input: CreatorAssetCollectionAddInput): CreatorProductionAssetRecord | null {
    const asset = this.getAsset(input.assetId);
    const collection = this.db.prepare(`
      SELECT id, project_id
      FROM creator_asset_collections
      WHERE id = ?
    `).get(input.collectionId) as { id: string; project_id: string } | undefined;
    if (!asset || !collection) {
      return null;
    }
    if (asset.projectId !== collection.project_id) {
      this.db.prepare('UPDATE production_assets SET project_id = ?, updated_at = ? WHERE id = ?')
        .run(collection.project_id, Date.now(), asset.id);
    }
    this.db.prepare(`
      INSERT OR IGNORE INTO creator_asset_collection_items (collection_id, asset_id, added_at)
      VALUES (?, ?, ?)
    `).run(collection.id, asset.id, Date.now());
    return this.getAsset(asset.id);
  }

  createPromptAsset(input: CreatorPromptAssetCreateInput): CreatorProductionAssetRecord {
    const projectId = input.projectId.trim() || this.getCurrentProjectId();
    const project = this.db.prepare('SELECT id FROM creator_projects WHERE id = ?').get(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    const title = input.title.trim().slice(0, 120) || 'Creator Prompt';
    const promptText = input.promptText.trim();
    if (!promptText) {
      throw new Error('Prompt text is required');
    }
    const now = Date.now();
    const id = uuidv4();
    const caseIds = normalizeTags(input.caseIds ?? []);
    const tags = normalizeTags(input.tags ?? []);
    const promptSpecJson = JSON.stringify(input.promptSpec);
    const caseIdsJson = JSON.stringify(caseIds);
    this.db.prepare(`
      INSERT INTO production_assets (
        id, project_id, kind, title, status, source, run_id, source_run_id, variant_of_asset_id, session_id,
        source_session_id, message_id, source_message_id, template_id,
        case_ids, case_ids_json, prompt_spec, prompt_spec_json, prompt_text, file_path, file_name, mime_type,
        favorite, adoption_status, tags_json, license_note, usage_note, metadata, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, NULL, NULL, ?, ?, ?)
    `).run(
      id,
      projectId,
      CreatorProductionAssetKind.Prompt,
      title,
      CreatorProductionAssetStatus.Ready,
      CreatorProductionAssetSource.CreatorPrompt,
      input.templateId ?? null,
      caseIdsJson,
      caseIdsJson,
      promptSpecJson,
      promptSpecJson,
      promptText,
      `creator://prompt/${id}`,
      `${title}.prompt.txt`,
      CreatorAssetAdoptionStatus.Unset,
      JSON.stringify(tags),
      JSON.stringify({ sourceTitle: input.promptSpec.sourceTitle ?? title }),
      now,
      now
    );
    return this.getAsset(id)!;
  }

  createCaseAsset(input: CreatorCaseAssetCreateInput): CreatorProductionAssetRecord {
    const projectId = input.projectId.trim() || this.getCurrentProjectId();
    const project = this.db.prepare('SELECT id FROM creator_projects WHERE id = ?').get(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    const caseId = input.caseId.trim();
    const title = input.title.trim().slice(0, 120) || 'Creator Case';
    const promptText = input.promptText.trim();
    if (!caseId || !promptText) {
      throw new Error('Case id and prompt text are required');
    }
    const now = Date.now();
    const id = uuidv4();
    const caseIds = [caseId];
    const tags = normalizeTags([
      input.category ?? '',
      ...(input.styles ?? []),
      ...(input.scenes ?? []),
      ...(input.tags ?? []),
    ]);
    const promptSpec = {
      sourceType: 'case',
      sourceId: caseId,
      sourceTitle: title,
      category: input.category ?? undefined,
      caseIds,
      styles: normalizeTags(input.styles ?? []),
      scenes: normalizeTags(input.scenes ?? []),
      referencePrompt: promptText,
    };
    const promptSpecJson = JSON.stringify(promptSpec);
    const caseIdsJson = JSON.stringify(caseIds);
    this.db.prepare(`
      INSERT INTO production_assets (
        id, project_id, kind, title, status, source, run_id, source_run_id, variant_of_asset_id, session_id,
        source_session_id, message_id, source_message_id, template_id,
        case_ids, case_ids_json, prompt_spec, prompt_spec_json, prompt_text, file_path, file_name, mime_type,
        favorite, adoption_status, tags_json, license_note, usage_note, metadata, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, NULL, NULL, ?, ?, ?)
    `).run(
      id,
      projectId,
      CreatorProductionAssetKind.Case,
      title,
      CreatorProductionAssetStatus.Ready,
      CreatorProductionAssetSource.CreatorCase,
      caseIdsJson,
      caseIdsJson,
      promptSpecJson,
      promptSpecJson,
      promptText,
      `creator://case/${caseId}`,
      `${title}.case.txt`,
      CreatorAssetAdoptionStatus.Unset,
      JSON.stringify(tags),
      JSON.stringify({
        sourceLabel: input.sourceLabel ?? null,
        sourceUrl: input.sourceUrl ?? null,
        githubUrl: input.githubUrl ?? null,
      }),
      now,
      now
    );
    return this.getAsset(id)!;
  }

  listAssets(input: CreatorProductionAssetListInput = {}): CreatorProductionAssetListResult {
    const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 60), 200));
    const offset = Math.max(0, Math.floor(input.offset ?? 0));
    const projectId = input.projectId?.trim() || this.getCurrentProjectId();
    const clauses = ['COALESCE(a.project_id, ?) = ?'];
    const params: unknown[] = [CreatorStudioDefaultProjectId, projectId];
    if (input.collectionId?.trim()) {
      clauses.push(`EXISTS (
        SELECT 1
        FROM creator_asset_collection_items ci
        WHERE ci.asset_id = a.id AND ci.collection_id = ?
      )`);
      params.push(input.collectionId.trim());
    }
    if (input.source?.trim()) {
      clauses.push('a.source = ?');
      params.push(input.source.trim());
    }
    if (input.templateId?.trim()) {
      clauses.push('a.template_id = ?');
      params.push(input.templateId.trim());
    }
    if (input.tag?.trim()) {
      clauses.push('a.tags_json LIKE ?');
      params.push(`%"${input.tag.trim().replace(/"/g, '\\"')}"%`);
    }
    if (input.adoptionStatus?.trim()) {
      clauses.push('a.adoption_status = ?');
      params.push(input.adoptionStatus.trim());
    }
    if (typeof input.favorite === 'boolean') {
      clauses.push('a.favorite = ?');
      params.push(input.favorite ? 1 : 0);
    }
    const whereSql = `WHERE ${clauses.join(' AND ')}`;
    const rows = this.db.prepare(`
      SELECT
        a.*,
        CASE WHEN s.id IS NULL THEN 0 ELSE 1 END AS source_session_available
      FROM production_assets a
      LEFT JOIN cowork_sessions s ON s.id = COALESCE(a.source_session_id, a.session_id)
      ${whereSql}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as ProductionAssetRow[];
    const totalRow = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM production_assets a
      ${whereSql}
    `).get(...params) as { count: number };
    return {
      assets: rows.map((row) => this.mapAssetRow(row)),
      total: totalRow.count,
    };
  }

  getAsset(id: string): CreatorProductionAssetRecord | null {
    const row = this.db.prepare(`
      SELECT
        a.*,
        CASE WHEN s.id IS NULL THEN 0 ELSE 1 END AS source_session_available
      FROM production_assets a
      LEFT JOIN cowork_sessions s ON s.id = COALESCE(a.source_session_id, a.session_id)
      WHERE a.id = ?
    `).get(id) as ProductionAssetRow | undefined;
    return row ? this.mapAssetRow(row) : null;
  }

  getAssetSource(id: string): CreatorProductionAssetSourceLookup | null {
    const asset = this.getAsset(id);
    if (!asset) return null;
    const session = asset.sessionId
      ? this.db.prepare(`
        SELECT id, title, status, created_at, updated_at
        FROM cowork_sessions
        WHERE id = ?
      `).get(asset.sessionId) as {
        id: string;
        title: string;
        status: string;
        created_at: number;
        updated_at: number;
      } | undefined
      : undefined;
    return {
      asset,
      session: session
        ? {
          id: session.id,
          title: session.title,
          status: session.status,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
        }
        : null,
    };
  }

  setFavorite(id: string, favorite: boolean): CreatorProductionAssetRecord | null {
    this.db.prepare(`
      UPDATE production_assets
      SET favorite = ?,
        adoption_status = CASE
          WHEN ? = 1 THEN ?
          WHEN adoption_status = ? THEN ?
          ELSE adoption_status
        END,
        updated_at = ?
      WHERE id = ?
    `).run(
      favorite ? 1 : 0,
      favorite ? 1 : 0,
      CreatorAssetAdoptionStatus.Favorite,
      CreatorAssetAdoptionStatus.Favorite,
      CreatorAssetAdoptionStatus.Unset,
      Date.now(),
      id
    );
    return this.getAsset(id);
  }

  updateAsset(input: CreatorAssetUpdateInput): CreatorProductionAssetRecord | null {
    const asset = this.getAsset(input.assetId);
    if (!asset) return null;
    const favorite = typeof input.favorite === 'boolean' ? input.favorite : asset.favorite;
    const adoptionStatus = isAdoptionStatus(input.adoptionStatus)
      ? input.adoptionStatus
      : favorite && asset.adoptionStatus === CreatorAssetAdoptionStatus.Unset
        ? CreatorAssetAdoptionStatus.Favorite
        : asset.adoptionStatus;
    const projectId = input.projectId?.trim() || asset.projectId;
    const tags = Array.isArray(input.tags) ? normalizeTags(input.tags) : asset.tags;
    const now = Date.now();
    this.db.prepare(`
      UPDATE production_assets
      SET project_id = ?,
        favorite = ?,
        adoption_status = ?,
        tags_json = ?,
        license_note = ?,
        usage_note = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      projectId,
      favorite ? 1 : 0,
      adoptionStatus,
      JSON.stringify(tags),
      input.licenseNote === undefined ? asset.licenseNote : normalizeOptionalText(input.licenseNote),
      input.usageNote === undefined ? asset.usageNote : normalizeOptionalText(input.usageNote),
      now,
      asset.id
    );
    if (typeof input.selected === 'boolean') {
      if (input.selected) {
        this.db.prepare(`
          INSERT INTO creator_asset_selections (project_id, asset_id, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(project_id, asset_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
        `).run(projectId, asset.id, CreatorAssetSelectionStatus.Selected, now, now);
      } else {
        this.db.prepare(`
          INSERT INTO creator_asset_selections (project_id, asset_id, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(project_id, asset_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
        `).run(projectId, asset.id, CreatorAssetSelectionStatus.Unselected, now, now);
      }
    }
    return this.getAsset(asset.id);
  }

  getBoardWorkspace(projectIdInput?: string): CreatorBoardWorkspaceSnapshot {
    const projectId = projectIdInput?.trim() || this.getCurrentProjectId();
    this.ensureProjectExists(projectId);
    const currentBoardId = this.ensureCurrentBoard(projectId);
    return {
      projectId,
      currentBoardId,
      boards: this.listBoards(projectId),
      cards: this.listBoardCards(currentBoardId),
      selectedCardIds: this.listSelectedBoardCardIds(currentBoardId),
      brandKit: this.getBrandKit(projectId),
    };
  }

  createBoard(input: CreatorBoardCreateInput): CreatorBoardWorkspaceSnapshot {
    const projectId = input.projectId.trim();
    this.ensureProjectExists(projectId);
    const name = input.name.trim().slice(0, 80);
    if (!name) {
      throw new Error('Board name is required');
    }
    const now = Date.now();
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO creator_boards (id, project_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, projectId, name, normalizeOptionalText(input.description), now, now);
    this.setCurrentBoardId(projectId, id);
    return this.getBoardWorkspace(projectId);
  }

  setCurrentBoard(projectId: string, boardId: string): CreatorBoardWorkspaceSnapshot {
    const board = this.db.prepare(`
      SELECT id
      FROM creator_boards
      WHERE id = ? AND project_id = ?
    `).get(boardId, projectId) as { id: string } | undefined;
    if (!board) {
      throw new Error('Board not found');
    }
    this.setCurrentBoardId(projectId, boardId);
    return this.getBoardWorkspace(projectId);
  }

  addBoardCard(input: CreatorBoardCardCreateInput): CreatorBoardCardRecord {
    const board = this.getBoardRow(input.boardId);
    if (!board) {
      throw new Error('Board not found');
    }
    if (!Object.values(CreatorBoardCardKind).includes(input.kind)) {
      throw new Error('Board card kind is invalid');
    }
    const now = Date.now();
    const positionRow = this.db.prepare(`
      SELECT COALESCE(MAX(position), -1) + 1 AS position
      FROM creator_board_cards
      WHERE board_id = ?
    `).get(board.id) as { position: number };
    const asset = input.assetId ? this.getAsset(input.assetId) : null;
    const title = (input.title.trim() || asset?.fileName || 'Board Card').slice(0, 120);
    const promptSpecJson = input.promptSpec ? JSON.stringify(input.promptSpec) : asset?.promptSpec ? JSON.stringify(asset.promptSpec) : null;
    const directionJson = input.direction ? JSON.stringify(input.direction) : null;
    const promptText = (input.promptText ?? asset?.promptText ?? '').trim();
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO creator_board_cards (
        id, board_id, project_id, kind, title, asset_id, case_id, prompt_text,
        prompt_spec_json, direction_json, group_name, notes, position, metadata_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      board.id,
      board.project_id,
      input.kind,
      title,
      input.assetId ?? null,
      input.caseId ?? null,
      promptText,
      promptSpecJson,
      directionJson,
      normalizeOptionalText(input.groupName),
      normalizeOptionalText(input.notes),
      positionRow.position,
      '{}',
      now,
      now
    );
    return this.getBoardCard(id)!;
  }

  updateBoardCard(input: CreatorBoardCardUpdateInput): CreatorBoardCardRecord | null {
    const card = this.getBoardCard(input.cardId);
    if (!card) return null;
    const now = Date.now();
    const nextTitle = input.title === undefined ? card.title : input.title.trim().slice(0, 120) || card.title;
    const nextDirection = input.direction === undefined
      ? card.direction
        ? {
          ...card.direction,
          title: input.title === undefined ? card.direction.title : nextTitle,
        }
        : null
      : input.direction;
    this.db.prepare(`
      UPDATE creator_board_cards
      SET title = ?,
        group_name = ?,
        notes = ?,
        direction_json = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      nextTitle,
      input.groupName === undefined ? card.groupName : normalizeOptionalText(input.groupName),
      input.notes === undefined ? card.notes : normalizeOptionalText(input.notes),
      nextDirection ? JSON.stringify(nextDirection) : null,
      now,
      card.id
    );
    return this.getBoardCard(card.id);
  }

  removeBoardCard(cardId: string): CreatorBoardCardRecord | null {
    const card = this.getBoardCard(cardId);
    if (!card) return null;
    this.db.prepare('DELETE FROM creator_board_selections WHERE card_id = ?').run(card.id);
    this.db.prepare('DELETE FROM creator_board_cards WHERE id = ?').run(card.id);
    this.reindexBoardCards(card.boardId);
    return card;
  }

  moveBoardCard(input: CreatorBoardCardMoveInput): CreatorBoardCardRecord | null {
    const card = this.getBoardCard(input.cardId);
    if (!card) return null;
    const comparator = input.direction === CreatorBoardMoveDirection.Up ? '<' : '>';
    const order = input.direction === CreatorBoardMoveDirection.Up ? 'DESC' : 'ASC';
    const target = this.db.prepare(`
      SELECT id, position
      FROM creator_board_cards
      WHERE board_id = ? AND position ${comparator} ?
      ORDER BY position ${order}
      LIMIT 1
    `).get(card.boardId, card.position) as { id: string; position: number } | undefined;
    if (!target) return card;
    const now = Date.now();
    this.db.transaction(() => {
      this.db.prepare('UPDATE creator_board_cards SET position = ?, updated_at = ? WHERE id = ?')
        .run(target.position, now, card.id);
      this.db.prepare('UPDATE creator_board_cards SET position = ?, updated_at = ? WHERE id = ?')
        .run(card.position, now, target.id);
    })();
    return this.getBoardCard(card.id);
  }

  selectBoardCard(input: CreatorBoardCardSelectInput): CreatorBoardCardRecord | null {
    const card = this.getBoardCard(input.cardId);
    if (!card) return null;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO creator_board_selections (board_id, card_id, selected, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(board_id, card_id) DO UPDATE SET selected = excluded.selected, updated_at = excluded.updated_at
    `).run(card.boardId, card.id, input.selected ? 1 : 0, now, now);
    return this.getBoardCard(card.id);
  }

  buildBoardContextPack(input: CreatorBoardContextPackInput): CreatorBoardContextPackResult {
    const board = this.getBoardRow(input.boardId);
    if (!board) {
      throw new Error('Board not found');
    }
    const requested = Array.isArray(input.cardIds) ? new Set(input.cardIds.filter((id) => id.trim())) : null;
    const cards = this.listBoardCards(board.id)
      .filter((card) => requested ? requested.has(card.id) : card.selected);
    if (cards.length === 0) {
      throw new Error('Board selection is empty');
    }
    const brandKit = this.getBrandKit(board.project_id);
    const contextPack = this.renderBoardContextPack(board, cards, brandKit);
    return {
      boardId: board.id,
      cardIds: cards.map((card) => card.id),
      contextPack,
    };
  }

  updateBrandKit(input: CreatorBrandKitUpdateInput): CreatorBoardWorkspaceSnapshot {
    const projectId = input.projectId.trim();
    this.ensureProjectExists(projectId);
    const current = this.getBrandKit(projectId);
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO creator_brand_kits (
        project_id, colors_json, logo_asset_id, logo_path, banned_words_json,
        tone, visual_preferences, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        colors_json = excluded.colors_json,
        logo_asset_id = excluded.logo_asset_id,
        logo_path = excluded.logo_path,
        banned_words_json = excluded.banned_words_json,
        tone = excluded.tone,
        visual_preferences = excluded.visual_preferences,
        updated_at = excluded.updated_at
    `).run(
      projectId,
      JSON.stringify(Array.isArray(input.colors) ? normalizeTags(input.colors) : current.colors),
      input.logoAssetId === undefined ? current.logoAssetId : normalizeOptionalText(input.logoAssetId),
      input.logoPath === undefined ? current.logoPath : normalizeOptionalText(input.logoPath),
      JSON.stringify(Array.isArray(input.bannedWords) ? normalizeTags(input.bannedWords) : current.bannedWords),
      input.tone === undefined ? current.tone : input.tone.trim().slice(0, 240),
      input.visualPreferences === undefined ? current.visualPreferences : input.visualPreferences.trim().slice(0, 1000),
      current.createdAt || now,
      now
    );
    return this.getBoardWorkspace(projectId);
  }

  listCreativeModelCapabilities() {
    return CREATOR_CREATIVE_MODEL_CAPABILITIES;
  }

  createBatchRun(input: CreatorBatchRunCreateInput): CreatorBatchRunRecord {
    const projectId = input.projectId.trim() || this.getCurrentProjectId();
    this.ensureProjectExists(projectId);
    const directions = this.normalizeBatchDirections(input.directions);
    if (directions.length === 0) {
      throw new Error('At least one direction is required');
    }
    const capabilityById = new Map(CREATOR_CREATIVE_MODEL_CAPABILITIES.map((model) => [model.id, model]));
    const models = normalizeTags(input.modelIds)
      .map((modelId) => capabilityById.get(modelId))
      .filter((model): model is typeof CREATOR_CREATIVE_MODEL_CAPABILITIES[number] => Boolean(model));
    if (models.length === 0) {
      throw new Error('At least one creative model is required');
    }
    const unsupportedModel = models.find((model) => !model.supportsBatch);
    if (unsupportedModel) {
      throw new Error(`Model does not support batch: ${unsupportedModel.id}`);
    }
    const templateIds = normalizeTags(input.templateIds).length > 0
      ? normalizeTags(input.templateIds)
      : normalizeTags([input.promptSpec.templateId ?? 'default-template']);
    const sizes = normalizeTags(input.sizes).length > 0
      ? normalizeTags(input.sizes)
      : normalizeTags([String(input.promptSpec.constraints?.aspectRatio ?? '1:1')]);
    const now = Date.now();
    const id = uuidv4();
    const briefTitle = input.briefTitle.trim().slice(0, 120) || 'Creator Batch Run';
    const taskCount = directions.length * models.length * templateIds.length * sizes.length;
    for (const model of models) {
      const modelTaskCount = directions.length * templateIds.length * sizes.length;
      if (modelTaskCount > model.maxBatchTasks) {
        throw new Error(`Batch task count exceeds model limit: ${model.displayName}`);
      }
    }
    const estimatedCostUnits = directions.reduce((total) => total + models.reduce((modelTotal, model) => (
      modelTotal + (model.costUnitEstimate * templateIds.length * sizes.length)
    ), 0), 0);
    const summary: CreatorBatchRunSummary = {
      taskCount,
      modelIds: models.map((model) => model.id),
      modelNames: models.map((model) => model.displayName),
      templateIds,
      sizes,
      estimatedCostUnits,
      costUnitLabel: 'estimated units',
    };
    const insertTask = this.db.prepare(`
      INSERT INTO creator_batch_tasks (
        id, batch_run_id, project_id, status, direction_id, direction_title,
        model_id, model_name, template_id, size, prompt_spec_json, prompt_text,
        asset_ids_json, error, cost_estimate_text, created_at, updated_at, completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL)
    `);
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO creator_batch_runs (
          id, project_id, status, brief_title, prompt_spec_json, prompt_text,
          summary_json, created_at, updated_at, completed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(
        id,
        projectId,
        CreatorBatchRunStatus.Running,
        briefTitle,
        JSON.stringify(input.promptSpec),
        input.promptText.trim(),
        JSON.stringify(summary),
        now,
        now
      );
      for (const direction of directions) {
        for (const model of models) {
          for (const templateId of templateIds) {
            for (const size of sizes) {
              const taskId = uuidv4();
              const promptSpec = {
                ...direction.promptSpec,
                selectedCreativeDirectionId: direction.id,
                selectedCreativeDirection: {
                  id: direction.id,
                  title: direction.title,
                  template: direction.template,
                  style: direction.style,
                  reason: direction.reason,
                  promptFocus: direction.promptFocus,
                },
                templateId,
                constraints: {
                  ...(direction.promptSpec.constraints ?? {}),
                  aspectRatio: size,
                },
                batch: {
                  batchRunId: id,
                  batchTaskId: taskId,
                  modelId: model.id,
                  modelName: model.displayName,
                  outputKinds: model.outputKinds,
                },
              };
              insertTask.run(
                taskId,
                id,
                projectId,
                CreatorBatchTaskStatus.Pending,
                direction.id,
                direction.title,
                model.id,
                model.displayName,
                templateId,
                size,
                JSON.stringify(promptSpec),
                this.renderBatchTaskPrompt(direction.promptText, model.displayName, templateId, size),
                '[]',
                `${model.costUnitEstimate} ${model.costUnitLabel}`,
                now,
                now
              );
            }
          }
        }
      }
    })();
    return this.getBatchRun(id)!;
  }

  listBatchRuns(input: CreatorBatchRunListInput = {}): CreatorBatchRunListResult {
    const projectId = input.projectId?.trim() || this.getCurrentProjectId();
    const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 20), 100));
    const offset = Math.max(0, Math.floor(input.offset ?? 0));
    const rows = this.db.prepare(`
      SELECT id, project_id, status, brief_title, prompt_spec_json, prompt_text,
        summary_json, created_at, updated_at, completed_at
      FROM creator_batch_runs
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(projectId, limit, offset) as BatchRunRow[];
    const totalRow = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM creator_batch_runs
      WHERE project_id = ?
    `).get(projectId) as { count: number };
    return {
      runs: rows.map((row) => this.mapBatchRunRow(row)),
      total: totalRow.count,
    };
  }

  getBatchRun(id: string): CreatorBatchRunRecord | null {
    const row = this.db.prepare(`
      SELECT id, project_id, status, brief_title, prompt_spec_json, prompt_text,
        summary_json, created_at, updated_at, completed_at
      FROM creator_batch_runs
      WHERE id = ?
    `).get(id) as BatchRunRow | undefined;
    return row ? this.mapBatchRunRow(row) : null;
  }

  retryBatchTask(taskId: string): CreatorBatchRunRecord | null {
    const task = this.getBatchTaskRow(taskId);
    if (!task) return null;
    const now = Date.now();
    this.db.prepare(`
      UPDATE creator_batch_tasks
      SET status = ?,
        error = NULL,
        updated_at = ?,
        completed_at = NULL
      WHERE id = ?
    `).run(CreatorBatchTaskStatus.Pending, now, task.id);
    this.updateBatchRunStatus(task.batch_run_id);
    return this.getBatchRun(task.batch_run_id);
  }

  skipBatchTask(taskId: string): CreatorBatchRunRecord | null {
    const task = this.getBatchTaskRow(taskId);
    if (!task) return null;
    const now = Date.now();
    this.db.prepare(`
      UPDATE creator_batch_tasks
      SET status = ?,
        updated_at = ?,
        completed_at = COALESCE(completed_at, ?)
      WHERE id = ?
    `).run(CreatorBatchTaskStatus.Skipped, now, now, task.id);
    this.updateBatchRunStatus(task.batch_run_id);
    return this.getBatchRun(task.batch_run_id);
  }

  failBatchTask(input: CreatorBatchTaskFailInput): CreatorBatchRunRecord | null {
    const task = this.getBatchTaskRow(input.taskId);
    if (!task) return null;
    const now = Date.now();
    this.db.prepare(`
      UPDATE creator_batch_tasks
      SET status = ?,
        error = ?,
        updated_at = ?,
        completed_at = COALESCE(completed_at, ?)
      WHERE id = ?
    `).run(
      CreatorBatchTaskStatus.Failed,
      input.error.trim().slice(0, 1000) || 'Task failed',
      now,
      now,
      task.id
    );
    this.updateBatchRunStatus(task.batch_run_id);
    return this.getBatchRun(task.batch_run_id);
  }

  private ingestGeneratedImages(sessionId: string, message: CoworkMessage): void {
    const images = getGeneratedImages(message.metadata);
    if (images.length === 0) return;
    const run = this.getLatestPendingRunForSession(sessionId) ?? this.createRunFromLatestPrompt(sessionId, message.timestamp);
    const context = run
      ? {
        templateId: run.templateId,
        caseIds: run.caseIds,
        promptSpec: run.promptSpec,
        promptText: run.promptText,
        variantOfAssetId: run.variantOfAssetId,
      }
      : {
        templateId: null,
        caseIds: [],
        promptSpec: null,
        promptText: '',
        variantOfAssetId: null,
      };
    const now = message.timestamp || Date.now();
    const insertAsset = this.db.prepare(`
      INSERT INTO production_assets (
        id, project_id, kind, title, status, source, run_id, source_run_id, variant_of_asset_id, session_id,
        source_session_id, message_id, source_message_id, template_id,
        case_ids, case_ids_json, prompt_spec, prompt_spec_json, prompt_text, file_path, file_name, mime_type,
        favorite, adoption_status, tags_json, license_note, usage_note, metadata, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, message_id, file_path) DO UPDATE SET
        status = excluded.status,
        run_id = COALESCE(production_assets.run_id, excluded.run_id),
        source_run_id = COALESCE(production_assets.source_run_id, excluded.source_run_id),
        variant_of_asset_id = COALESCE(production_assets.variant_of_asset_id, excluded.variant_of_asset_id),
        source_session_id = COALESCE(production_assets.source_session_id, excluded.source_session_id),
        source_message_id = COALESCE(production_assets.source_message_id, excluded.source_message_id),
        template_id = COALESCE(production_assets.template_id, excluded.template_id),
        case_ids = excluded.case_ids,
        case_ids_json = excluded.case_ids_json,
        prompt_spec = excluded.prompt_spec,
        prompt_spec_json = excluded.prompt_spec_json,
        prompt_text = excluded.prompt_text,
        title = excluded.title,
        file_name = excluded.file_name,
        mime_type = excluded.mime_type,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);
    const getAssetId = this.db.prepare(`
      SELECT id
      FROM production_assets
      WHERE session_id = ? AND message_id = ? AND file_path = ?
      LIMIT 1
    `);

    this.db.transaction(() => {
      const outputAssetIds: string[] = [];
      for (const image of images) {
        const filePath = image.path.trim();
        const caseIdsJson = JSON.stringify(context.caseIds);
        const promptSpecJson = context.promptSpec ? JSON.stringify(context.promptSpec) : null;
        insertAsset.run(
          uuidv4(),
          this.getCurrentProjectId(),
          CreatorProductionAssetKind.Image,
          getImageName(image),
          fs.existsSync(filePath) ? CreatorProductionAssetStatus.Ready : CreatorProductionAssetStatus.Missing,
          CreatorProductionAssetSource.CoworkGeneratedImage,
          run?.id ?? null,
          run?.id ?? null,
          context.variantOfAssetId,
          sessionId,
          sessionId,
          message.id,
          message.id,
          context.templateId,
          caseIdsJson,
          caseIdsJson,
          promptSpecJson,
          promptSpecJson,
          context.promptText,
          filePath,
          getImageName(image),
          image.mimeType || null,
          0,
          CreatorAssetAdoptionStatus.Unset,
          '[]',
          null,
          null,
          JSON.stringify({ generatedImageSource: image.source || null }),
          now,
          now,
        );
        const assetRow = getAssetId.get(sessionId, message.id, filePath) as { id: string } | undefined;
        if (assetRow?.id) {
          outputAssetIds.push(assetRow.id);
        }
      }

      if (run) {
        this.db.prepare(`
          UPDATE production_runs
          SET status = ?,
            output_asset_ids_json = ?,
            updated_at = ?,
            completed_at = COALESCE(completed_at, ?)
          WHERE id = ?
        `).run(CreatorProductionRunStatus.Completed, JSON.stringify(outputAssetIds), now, now, run.id);
        this.completeBatchTaskForRun(run, outputAssetIds, now);
      }
    })();
  }

  private completeBatchTaskForRun(
    run: CreatorProductionRunRecord,
    outputAssetIds: string[],
    completedAt: number
  ): void {
    const batchRunId = getPromptSpecBatchString(run.promptSpec, 'batchRunId');
    const batchTaskId = getPromptSpecBatchString(run.promptSpec, 'batchTaskId');
    if (!batchRunId || !batchTaskId || outputAssetIds.length === 0) return;
    const task = this.getBatchTaskRow(batchTaskId);
    if (!task || task.batch_run_id !== batchRunId) return;
    const existingAssetIds = parseJsonArray(task.asset_ids_json);
    const nextAssetIds = [...new Set([...existingAssetIds, ...outputAssetIds])];
    this.db.prepare(`
      UPDATE creator_batch_tasks
      SET status = ?,
        asset_ids_json = ?,
        error = NULL,
        updated_at = ?,
        completed_at = COALESCE(completed_at, ?)
      WHERE id = ?
    `).run(
      CreatorBatchTaskStatus.Completed,
      JSON.stringify(nextAssetIds),
      completedAt,
      completedAt,
      batchTaskId
    );
    this.updateBatchRunStatus(batchRunId);
  }

  private createRunFromLatestPrompt(sessionId: string, createdAt: number): CreatorProductionRunRecord | null {
    const row = this.db.prepare(`
      SELECT content, created_at
      FROM cowork_messages
      WHERE session_id = ?
        AND type = 'user'
        AND content LIKE '%[Creator Studio]%'
      ORDER BY COALESCE(sequence, created_at) DESC, created_at DESC
      LIMIT 1
    `).get(sessionId) as { content: string; created_at: number } | undefined;
    if (!row) return null;
    return this.createRunFromPrompt(sessionId, row.content, row.created_at || createdAt);
  }

  private createRun(
    sessionId: string,
    context: CreatorStudioSourceContext,
    createdAt: number
  ): CreatorProductionRunRecord {
    const id = uuidv4();
    const caseIdsJson = JSON.stringify(context.caseIds);
    const promptSpecJson = context.promptSpec ? JSON.stringify(context.promptSpec) : null;
    this.db.prepare(`
      INSERT INTO production_runs (
        id, source, domain, status, session_id, provider, model, agent_id,
        skill_ids_json, runtime_call_id, input_asset_ids_json, output_asset_ids_json,
        template_id, variant_of_asset_id, case_ids, prompt_spec, prompt_text, metadata,
        created_at, updated_at, completed_at
      )
      VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      id,
      CreatorProductionRunSource.CreatorStudio,
      CreatorProductionRunSource.CreatorStudio,
      CreatorProductionRunStatus.Pending,
      sessionId,
      '[]',
      '[]',
      '[]',
      context.templateId,
      context.variantOfAssetId,
      caseIdsJson,
      promptSpecJson,
      context.promptText,
      JSON.stringify({
        sourceTitle: context.sourceTitle,
        batchRunId: context.batchRunId,
        batchTaskId: context.batchTaskId,
      }),
      createdAt,
      createdAt,
    );
    return this.getRun(id)!;
  }

  private getLatestPendingRunForSession(sessionId: string): CreatorProductionRunRecord | null {
    const row = this.db.prepare(`
      SELECT id, source, status, session_id, template_id, variant_of_asset_id, case_ids, prompt_spec,
        prompt_text, created_at, updated_at, completed_at
      FROM production_runs
      WHERE session_id = ?
        AND status = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(sessionId, CreatorProductionRunStatus.Pending) as ProductionRunRow | undefined;
    return row ? this.mapRunRow(row) : null;
  }

  private getRun(id: string): CreatorProductionRunRecord | null {
    const row = this.db.prepare(`
      SELECT id, source, status, session_id, template_id, variant_of_asset_id, case_ids, prompt_spec,
        prompt_text, created_at, updated_at, completed_at
      FROM production_runs
      WHERE id = ?
    `).get(id) as ProductionRunRow | undefined;
    return row ? this.mapRunRow(row) : null;
  }

  private ensureDefaultProject(): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT OR IGNORE INTO creator_projects (id, name, description, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?)
    `).run(CreatorStudioDefaultProjectId, 'Default Project', now, now);
    this.db.prepare(`
      INSERT OR IGNORE INTO creator_workspace_state (key, value, updated_at)
      VALUES (?, ?, ?)
    `).run(CreatorWorkspaceStateKey.CurrentProjectId, CreatorStudioDefaultProjectId, now);
  }

  private getCurrentProjectId(): string {
    this.ensureDefaultProject();
    const row = this.db.prepare(`
      SELECT value
      FROM creator_workspace_state
      WHERE key = ?
    `).get(CreatorWorkspaceStateKey.CurrentProjectId) as { value: string } | undefined;
    const projectId = row?.value || CreatorStudioDefaultProjectId;
    const project = this.db.prepare('SELECT id FROM creator_projects WHERE id = ?').get(projectId);
    return project ? projectId : CreatorStudioDefaultProjectId;
  }

  private listProjects(): CreatorWorkspaceSnapshot['projects'] {
    const rows = this.db.prepare(`
      SELECT id, name, description, created_at, updated_at
      FROM creator_projects
      ORDER BY updated_at DESC, created_at DESC
    `).all() as ProjectRow[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private listCollections(projectId: string): CreatorAssetCollectionRecord[] {
    const rows = this.db.prepare(`
      SELECT
        c.id,
        c.project_id,
        c.name,
        c.description,
        c.created_at,
        c.updated_at,
        COUNT(ci.asset_id) AS asset_count
      FROM creator_asset_collections c
      LEFT JOIN creator_asset_collection_items ci ON ci.collection_id = c.id
      WHERE c.project_id = ?
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.created_at DESC
    `).all(projectId) as CollectionRow[];
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      assetCount: row.asset_count,
    }));
  }

  private ensureProjectExists(projectId: string): void {
    this.ensureDefaultProject();
    const project = this.db.prepare('SELECT id FROM creator_projects WHERE id = ?').get(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
  }

  private getCurrentBoardStateKey(projectId: string): string {
    return `${CreatorWorkspaceStateKey.CurrentBoardIdPrefix}:${projectId}`;
  }

  private setCurrentBoardId(projectId: string, boardId: string): void {
    this.db.prepare(`
      INSERT INTO creator_workspace_state (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(this.getCurrentBoardStateKey(projectId), boardId, Date.now());
  }

  private ensureCurrentBoard(projectId: string): string {
    const currentRow = this.db.prepare(`
      SELECT value
      FROM creator_workspace_state
      WHERE key = ?
    `).get(this.getCurrentBoardStateKey(projectId)) as { value: string } | undefined;
    if (currentRow?.value) {
      const board = this.db.prepare(`
        SELECT id
        FROM creator_boards
        WHERE id = ? AND project_id = ?
      `).get(currentRow.value, projectId) as { id: string } | undefined;
      if (board) return board.id;
    }

    const existing = this.db.prepare(`
      SELECT id
      FROM creator_boards
      WHERE project_id = ?
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `).get(projectId) as { id: string } | undefined;
    if (existing) {
      this.setCurrentBoardId(projectId, existing.id);
      return existing.id;
    }

    const now = Date.now();
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO creator_boards (id, project_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, ?)
    `).run(id, projectId, 'Creative Board', now, now);
    this.setCurrentBoardId(projectId, id);
    return id;
  }

  private getBoardRow(boardId: string): BoardRow | null {
    const row = this.db.prepare(`
      SELECT id, project_id, name, description, created_at, updated_at
      FROM creator_boards
      WHERE id = ?
    `).get(boardId) as BoardRow | undefined;
    return row ?? null;
  }

  private listBoards(projectId: string): CreatorBoardRecord[] {
    const rows = this.db.prepare(`
      SELECT id, project_id, name, description, created_at, updated_at
      FROM creator_boards
      WHERE project_id = ?
      ORDER BY updated_at DESC, created_at DESC
    `).all(projectId) as BoardRow[];
    return rows.map((row) => this.mapBoardRow(row));
  }

  private getBoardCard(cardId: string): CreatorBoardCardRecord | null {
    const row = this.db.prepare(`
      SELECT
        c.*,
        COALESCE(s.selected, 0) AS selected
      FROM creator_board_cards c
      LEFT JOIN creator_board_selections s ON s.board_id = c.board_id AND s.card_id = c.id
      WHERE c.id = ?
    `).get(cardId) as BoardCardRow | undefined;
    return row ? this.mapBoardCardRow(row) : null;
  }

  private listBoardCards(boardId: string): CreatorBoardCardRecord[] {
    const rows = this.db.prepare(`
      SELECT
        c.*,
        COALESCE(s.selected, 0) AS selected
      FROM creator_board_cards c
      LEFT JOIN creator_board_selections s ON s.board_id = c.board_id AND s.card_id = c.id
      WHERE c.board_id = ?
      ORDER BY c.position ASC, c.created_at ASC
    `).all(boardId) as BoardCardRow[];
    return rows.map((row) => this.mapBoardCardRow(row));
  }

  private listSelectedBoardCardIds(boardId: string): string[] {
    const rows = this.db.prepare(`
      SELECT card_id
      FROM creator_board_selections
      WHERE board_id = ? AND selected = 1
      ORDER BY updated_at DESC
    `).all(boardId) as Array<{ card_id: string }>;
    return rows.map((row) => row.card_id);
  }

  private reindexBoardCards(boardId: string): void {
    const rows = this.db.prepare(`
      SELECT id
      FROM creator_board_cards
      WHERE board_id = ?
      ORDER BY position ASC, created_at ASC
    `).all(boardId) as Array<{ id: string }>;
    const now = Date.now();
    const update = this.db.prepare('UPDATE creator_board_cards SET position = ?, updated_at = ? WHERE id = ?');
    this.db.transaction(() => {
      rows.forEach((row, index) => update.run(index, now, row.id));
    })();
  }

  private getBrandKit(projectId: string): CreatorBrandKitRecord {
    const now = Date.now();
    const row = this.db.prepare(`
      SELECT project_id, colors_json, logo_asset_id, logo_path, banned_words_json,
        tone, visual_preferences, created_at, updated_at
      FROM creator_brand_kits
      WHERE project_id = ?
    `).get(projectId) as BrandKitRow | undefined;
    if (!row) {
      return {
        projectId,
        colors: [],
        logoAssetId: null,
        logoPath: null,
        bannedWords: [],
        tone: '',
        visualPreferences: '',
        createdAt: now,
        updatedAt: now,
      };
    }
    return {
      projectId: row.project_id,
      colors: parseJsonArray(row.colors_json),
      logoAssetId: row.logo_asset_id,
      logoPath: row.logo_path,
      bannedWords: parseJsonArray(row.banned_words_json),
      tone: row.tone ?? '',
      visualPreferences: row.visual_preferences ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private renderBoardContextPack(
    board: BoardRow,
    cards: CreatorBoardCardRecord[],
    brandKit: CreatorBrandKitRecord
  ): string {
    const lines = [
      `Board: ${board.name}`,
      `projectId: ${board.project_id}`,
      '',
      'Brand Kit:',
      `colors: ${brandKit.colors.length > 0 ? brandKit.colors.join(', ') : 'none'}`,
      `logo: ${brandKit.logoPath || brandKit.logoAssetId || 'none'}`,
      `tone: ${brandKit.tone || 'none'}`,
      `visualPreferences: ${brandKit.visualPreferences || 'none'}`,
      `bannedWords: ${brandKit.bannedWords.length > 0 ? brandKit.bannedWords.join(', ') : 'none'}`,
      '',
      'Selected Board Cards:',
    ];
    cards.forEach((card, index) => {
      lines.push(`${index + 1}. kind=${card.kind}; title=${card.title}; group=${card.groupName || 'none'}`);
      if (card.assetId) {
        lines.push(`   assetId=${card.assetId}`);
        const asset = this.getAsset(card.assetId);
        if (asset) {
          lines.push(`   assetKind=${asset.kind}; assetSource=${asset.source}; fileName=${asset.fileName}`);
          lines.push(`   filePath=${asset.filePath}`);
          lines.push(`   assetRole=${card.groupName || asset.kind}`);
          if (asset.templateId) lines.push(`   templateId=${asset.templateId}`);
          if (asset.caseIds.length > 0) lines.push(`   caseIds=${asset.caseIds.join(', ')}`);
          if (asset.tags.length > 0) lines.push(`   tags=${asset.tags.join(', ')}`);
          if (asset.promptText) lines.push(`   assetPrompt=${asset.promptText.slice(0, 1200)}`);
        }
      }
      if (card.caseId) lines.push(`   caseId=${card.caseId}`);
      if (card.notes) lines.push(`   notes=${card.notes}`);
      if (card.direction) {
        lines.push(`   direction=${card.direction.title}; template=${card.direction.template}; style=${card.direction.style}; reason=${card.direction.reason}; focus=${card.direction.promptFocus}`);
      }
      if (card.promptText) lines.push(`   prompt=${card.promptText.slice(0, 1200)}`);
    });
    return lines.join('\n');
  }

  private getAssetCollectionIds(assetId: string): string[] {
    const rows = this.db.prepare(`
      SELECT collection_id
      FROM creator_asset_collection_items
      WHERE asset_id = ?
      ORDER BY added_at DESC
    `).all(assetId) as Array<{ collection_id: string }>;
    return rows.map((row) => row.collection_id);
  }

  private isAssetSelected(projectId: string, assetId: string): boolean {
    const row = this.db.prepare(`
      SELECT status
      FROM creator_asset_selections
      WHERE project_id = ? AND asset_id = ?
    `).get(projectId, assetId) as { status: string } | undefined;
    return row?.status === CreatorAssetSelectionStatus.Selected;
  }

  private normalizeBatchDirections(directions: CreatorBatchDirectionInput[]): CreatorBatchDirectionInput[] {
    if (!Array.isArray(directions)) return [];
    const normalized: CreatorBatchDirectionInput[] = [];
    for (const direction of directions) {
      const id = direction.id?.trim();
      const title = direction.title?.trim();
      const promptText = direction.promptText?.trim();
      if (!id || !title || !promptText || !direction.promptSpec) continue;
      normalized.push({
        id: id.slice(0, 80),
        title: title.slice(0, 120),
        template: (direction.template ?? '').trim().slice(0, 240),
        style: (direction.style ?? '').trim().slice(0, 240),
        reason: (direction.reason ?? '').trim().slice(0, 500),
        promptFocus: (direction.promptFocus ?? '').trim().slice(0, 500),
        promptText,
        promptSpec: direction.promptSpec,
      });
    }
    return normalized.slice(0, 6);
  }

  private renderBatchTaskPrompt(
    promptText: string,
    modelName: string,
    templateId: string,
    size: string
  ): string {
    return [
      promptText.trim(),
      '',
      'Batch execution constraints:',
      `model=${modelName}`,
      `templateId=${templateId}`,
      `size=${size}`,
    ].join('\n');
  }

  private getBatchTaskRow(taskId: string): BatchTaskRow | null {
    const row = this.db.prepare(`
      SELECT id, batch_run_id, project_id, status, direction_id, direction_title,
        model_id, model_name, template_id, size, prompt_spec_json, prompt_text,
        asset_ids_json, error, cost_estimate_text, created_at, updated_at, completed_at
      FROM creator_batch_tasks
      WHERE id = ?
    `).get(taskId) as BatchTaskRow | undefined;
    return row ?? null;
  }

  private listBatchTasks(batchRunId: string): CreatorBatchTaskRecord[] {
    const rows = this.db.prepare(`
      SELECT id, batch_run_id, project_id, status, direction_id, direction_title,
        model_id, model_name, template_id, size, prompt_spec_json, prompt_text,
        asset_ids_json, error, cost_estimate_text, created_at, updated_at, completed_at
      FROM creator_batch_tasks
      WHERE batch_run_id = ?
      ORDER BY direction_id ASC, model_name ASC, template_id ASC, size ASC, created_at ASC
    `).all(batchRunId) as BatchTaskRow[];
    return rows.map((row) => this.mapBatchTaskRow(row));
  }

  private updateBatchRunStatus(batchRunId: string): void {
    const tasks = this.listBatchTasks(batchRunId);
    if (tasks.length === 0) return;
    const hasActive = tasks.some((task) => (
      task.status === CreatorBatchTaskStatus.Pending
      || task.status === CreatorBatchTaskStatus.Running
    ));
    const hasFailed = tasks.some((task) => task.status === CreatorBatchTaskStatus.Failed);
    const hasSkipped = tasks.some((task) => task.status === CreatorBatchTaskStatus.Skipped);
    const hasCompleted = tasks.some((task) => task.status === CreatorBatchTaskStatus.Completed);
    const nextStatus = hasActive
      ? CreatorBatchRunStatus.Running
      : hasFailed || hasSkipped
        ? hasCompleted
          ? CreatorBatchRunStatus.PartialFailed
          : CreatorBatchRunStatus.Failed
        : CreatorBatchRunStatus.Completed;
    const now = Date.now();
    this.db.prepare(`
      UPDATE creator_batch_runs
      SET status = ?,
        updated_at = ?,
        completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, ?) ELSE NULL END
      WHERE id = ?
    `).run(nextStatus, now, hasActive ? 0 : 1, now, batchRunId);
  }

  private mapBatchRunRow(row: BatchRunRow): CreatorBatchRunRecord {
    return {
      id: row.id,
      projectId: row.project_id,
      status: row.status as CreatorBatchRunStatus,
      briefTitle: row.brief_title,
      promptSpec: parsePromptSpec(row.prompt_spec_json) ?? {},
      promptText: row.prompt_text,
      summary: parseBatchSummary(row.summary_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      tasks: this.listBatchTasks(row.id),
    };
  }

  private mapBatchTaskRow(row: BatchTaskRow): CreatorBatchTaskRecord {
    return {
      id: row.id,
      batchRunId: row.batch_run_id,
      projectId: row.project_id,
      status: row.status as CreatorBatchTaskStatus,
      directionId: row.direction_id,
      directionTitle: row.direction_title,
      modelId: row.model_id,
      modelName: row.model_name,
      templateId: row.template_id,
      size: row.size,
      promptSpec: parsePromptSpec(row.prompt_spec_json) ?? {},
      promptText: row.prompt_text,
      assetIds: parseJsonArray(row.asset_ids_json),
      error: row.error,
      costEstimateText: row.cost_estimate_text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  }

  private mapRunRow(row: ProductionRunRow): CreatorProductionRunRecord {
    return {
      id: row.id,
      source: row.source as CreatorProductionRunSource,
      status: row.status as CreatorProductionRunStatus,
      sessionId: row.session_id,
      templateId: row.template_id,
      caseIds: parseJsonArray(row.case_ids),
      promptSpec: parsePromptSpec(row.prompt_spec),
      promptText: row.prompt_text,
      variantOfAssetId: row.variant_of_asset_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  }

  private mapBoardRow(row: BoardRow): CreatorBoardRecord {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapBoardCardRow(row: BoardCardRow): CreatorBoardCardRecord {
    return {
      id: row.id,
      boardId: row.board_id,
      projectId: row.project_id,
      kind: row.kind as CreatorBoardCardKind,
      title: row.title,
      assetId: row.asset_id,
      caseId: row.case_id,
      promptText: row.prompt_text,
      promptSpec: parsePromptSpec(row.prompt_spec_json),
      direction: parseDirection(row.direction_json),
      groupName: row.group_name,
      notes: row.notes,
      position: row.position,
      selected: Boolean(row.selected),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapAssetRow(row: ProductionAssetRow): CreatorProductionAssetRecord {
    const exists = fs.existsSync(row.file_path);
    const projectId = row.project_id || CreatorStudioDefaultProjectId;
    const adoptionStatus = isAdoptionStatus(row.adoption_status)
      ? row.adoption_status
      : CreatorAssetAdoptionStatus.Unset;
    const isFileBackedImage = row.kind === CreatorProductionAssetKind.Image;
    return {
      id: row.id,
      projectId,
      kind: row.kind as CreatorProductionAssetKind,
      status: !isFileBackedImage || exists
        ? row.status as CreatorProductionAssetStatus
        : CreatorProductionAssetStatus.Missing,
      source: row.source as CreatorProductionAssetSource,
      runId: row.source_run_id ?? row.run_id,
      variantOfAssetId: row.variant_of_asset_id,
      sessionId: row.source_session_id ?? row.session_id,
      messageId: row.source_message_id ?? row.message_id,
      templateId: row.template_id,
      caseIds: parseJsonArray(row.case_ids_json ?? row.case_ids),
      promptSpec: parsePromptSpec(row.prompt_spec_json ?? row.prompt_spec),
      promptText: row.prompt_text,
      filePath: row.file_path,
      fileName: row.file_name,
      mimeType: row.mime_type,
      favorite: Boolean(row.favorite),
      adoptionStatus,
      tags: parseJsonArray(row.tags_json),
      collectionIds: this.getAssetCollectionIds(row.id),
      selected: this.isAssetSelected(projectId, row.id),
      licenseNote: row.license_note,
      usageNote: row.usage_note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sourceSessionAvailable: Boolean(row.source_session_available),
    };
  }
}
