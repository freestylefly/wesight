import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import {
  CreatorProductionAssetKind,
  CreatorProductionAssetSource,
  CreatorProductionAssetStatus,
  CreatorProductionRunSource,
  CreatorProductionRunStatus,
} from '../shared/creatorStudio/constants';
import type {
  CreatorProductionAssetListInput,
  CreatorProductionAssetListResult,
  CreatorProductionAssetRecord,
  CreatorProductionAssetSourceLookup,
  CreatorProductionRunRecord,
  CreatorPromptSpecSnapshot,
  CreatorStudioSourceContext,
} from '../shared/creatorStudio/types';
import type { CoworkMessage, CoworkMessageMetadata } from './coworkStore';

interface ProductionAssetRow {
  id: string;
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
  created_at: number;
  updated_at: number;
  source_session_available?: number | null;
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

const CREATOR_STUDIO_MARKER = '[Creator Studio]';

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

const firstNonEmptyString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
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

  listAssets(input: CreatorProductionAssetListInput = {}): CreatorProductionAssetListResult {
    const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 60), 200));
    const offset = Math.max(0, Math.floor(input.offset ?? 0));
    const rows = this.db.prepare(`
      SELECT
        a.*,
        CASE WHEN s.id IS NULL THEN 0 ELSE 1 END AS source_session_available
      FROM production_assets a
      LEFT JOIN cowork_sessions s ON s.id = COALESCE(a.source_session_id, a.session_id)
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as ProductionAssetRow[];
    const totalRow = this.db.prepare('SELECT COUNT(*) AS count FROM production_assets').get() as { count: number };
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
    this.db.prepare('UPDATE production_assets SET favorite = ?, updated_at = ? WHERE id = ?')
      .run(favorite ? 1 : 0, Date.now(), id);
    return this.getAsset(id);
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
        id, kind, title, status, source, run_id, source_run_id, variant_of_asset_id, session_id,
        source_session_id, message_id, source_message_id, template_id,
        case_ids, case_ids_json, prompt_spec, prompt_spec_json, prompt_text, file_path, file_name, mime_type,
        favorite, metadata, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      }
    })();
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
      JSON.stringify({ sourceTitle: context.sourceTitle }),
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

  private mapAssetRow(row: ProductionAssetRow): CreatorProductionAssetRecord {
    const exists = fs.existsSync(row.file_path);
    return {
      id: row.id,
      kind: row.kind as CreatorProductionAssetKind,
      status: exists
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sourceSessionAvailable: Boolean(row.source_session_available),
    };
  }
}
