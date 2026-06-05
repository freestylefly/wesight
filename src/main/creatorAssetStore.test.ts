import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  CreatorAssetAdoptionStatus,
  CreatorProductionAssetKind,
  CreatorProductionAssetSource,
  CreatorProductionAssetStatus,
  CreatorProductionRunStatus,
  CreatorStudioDefaultProjectId,
} from '../shared/creatorStudio/constants';
import { CreatorAssetStore, parseCreatorStudioSourceContext } from './creatorAssetStore';
import { ensureCreatorProductionSchema } from './creatorProductionSchema';

let db: Database.Database;
let store: CreatorAssetStore;

const createCoworkTables = () => {
  db.exec(`
    CREATE TABLE cowork_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE cowork_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      sequence INTEGER
    );
  `);
};

const creatorDraft = `General intro

[Creator Studio]

templateId: poster-system
caseIds: case-1, case-2

PromptSpec:
\`\`\`json
{
  "templateId": "poster-system",
  "caseIds": ["case-1", "case-2"],
  "sourceTitle": "Poster System",
  "variantOfAssetId": "asset-parent"
}
\`\`\`

Prompt:
\`\`\`text
Generate a poster.
\`\`\``;

const secondCreatorDraft = `General intro

[Creator Studio]

templateId: product-card
caseIds: case-3

PromptSpec:
\`\`\`json
{
  "templateId": "product-card",
  "caseIds": ["case-3"],
  "sourceTitle": "Product Card"
}
\`\`\`

Prompt:
\`\`\`text
Generate a product card.
\`\`\``;

beforeEach(() => {
  db = new Database(':memory:');
  createCoworkTables();
  ensureCreatorProductionSchema(db);
  store = new CreatorAssetStore(db);
});

afterEach(() => {
  db.close();
});

describe('CreatorAssetStore', () => {
  test('parses creator studio source context from cowork draft', () => {
    const context = parseCreatorStudioSourceContext(creatorDraft);

    expect(context?.templateId).toBe('poster-system');
    expect(context?.caseIds).toEqual(['case-1', 'case-2']);
    expect(context?.promptText).toBe('Generate a poster.');
    expect(context?.promptSpec?.sourceTitle).toBe('Poster System');
    expect(context?.variantOfAssetId).toBe('asset-parent');
  });

  test('creates run from creator draft and ingests generated image asset', () => {
    db.prepare('INSERT INTO cowork_sessions (id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('session-1', 'Creative Producer', 'running', 1, 1);

    store.handleCoworkMessageInserted({
      sessionId: 'session-1',
      message: {
        id: 'message-user',
        type: 'user',
        content: creatorDraft,
        timestamp: 10,
        sequence: 1,
      },
    });

    store.handleCoworkMessageInserted({
      sessionId: 'session-1',
      message: {
        id: 'message-assistant',
        type: 'assistant',
        content: 'Generated image',
        timestamp: 20,
        sequence: 2,
        metadata: {
          generatedImages: [{
            path: '/tmp/generated.png',
            name: 'generated.png',
            mimeType: 'image/png',
            source: 'codex',
          }],
        },
      },
    });

    const result = store.listAssets();
    expect(result.total).toBe(1);
    expect(result.assets[0].templateId).toBe('poster-system');
    expect(result.assets[0].caseIds).toEqual(['case-1', 'case-2']);
    expect(result.assets[0].messageId).toBe('message-assistant');
    expect(result.assets[0].variantOfAssetId).toBe('asset-parent');
    expect(result.assets[0].status).toBe(CreatorProductionAssetStatus.Missing);

    const run = db.prepare('SELECT status, variant_of_asset_id FROM production_runs WHERE session_id = ?').get('session-1') as {
      status: string;
      variant_of_asset_id: string | null;
    };
    expect(run.status).toBe(CreatorProductionRunStatus.Completed);
    expect(run.variant_of_asset_id).toBe('asset-parent');
  });

  test('creates a separate run for each creator draft in one session', () => {
    db.prepare('INSERT INTO cowork_sessions (id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('session-1', 'Creative Producer', 'running', 1, 1);

    store.handleCoworkMessageInserted({
      sessionId: 'session-1',
      message: {
        id: 'message-user-1',
        type: 'user',
        content: creatorDraft,
        timestamp: 10,
        sequence: 1,
      },
    });
    store.handleCoworkMessageInserted({
      sessionId: 'session-1',
      message: {
        id: 'message-assistant-1',
        type: 'assistant',
        content: 'Generated image',
        timestamp: 20,
        sequence: 2,
        metadata: {
          generatedImages: [{ path: '/tmp/generated-one.png' }],
        },
      },
    });
    store.handleCoworkMessageInserted({
      sessionId: 'session-1',
      message: {
        id: 'message-user-2',
        type: 'user',
        content: secondCreatorDraft,
        timestamp: 30,
        sequence: 3,
      },
    });
    store.handleCoworkMessageInserted({
      sessionId: 'session-1',
      message: {
        id: 'message-assistant-2',
        type: 'assistant',
        content: 'Generated image',
        timestamp: 40,
        sequence: 4,
        metadata: {
          generatedImages: [{ path: '/tmp/generated-two.png' }],
        },
      },
    });

    const result = store.listAssets();
    expect(result.total).toBe(2);
    const firstAsset = result.assets.find((asset) => asset.messageId === 'message-assistant-1');
    const secondAsset = result.assets.find((asset) => asset.messageId === 'message-assistant-2');

    expect(firstAsset?.templateId).toBe('poster-system');
    expect(firstAsset?.caseIds).toEqual(['case-1', 'case-2']);
    expect(secondAsset?.templateId).toBe('product-card');
    expect(secondAsset?.caseIds).toEqual(['case-3']);
    expect(firstAsset?.runId).toBeTruthy();
    expect(secondAsset?.runId).toBeTruthy();
    expect(firstAsset?.runId).not.toBe(secondAsset?.runId);

    const runs = db.prepare('SELECT status, output_asset_ids_json FROM production_runs WHERE session_id = ?').all('session-1') as Array<{
      status: string;
      output_asset_ids_json: string;
    }>;
    expect(runs).toHaveLength(2);
    expect(runs.every((run) => run.status === CreatorProductionRunStatus.Completed)).toBe(true);
    expect(runs.every((run) => JSON.parse(run.output_asset_ids_json).length === 1)).toBe(true);
  });

  test('keeps asset record when source session is deleted', () => {
    db.prepare('INSERT INTO cowork_sessions (id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('session-1', 'Creative Producer', 'running', 1, 1);

    store.createRunFromPrompt('session-1', creatorDraft, 10);
    store.handleCoworkMessageInserted({
      sessionId: 'session-1',
      message: {
        id: 'message-assistant',
        type: 'assistant',
        content: 'Generated image',
        timestamp: 20,
        sequence: 2,
        metadata: {
          generatedImages: [{ path: '/tmp/generated.png' }],
        },
      },
    });

    db.prepare('DELETE FROM cowork_sessions WHERE id = ?').run('session-1');
    const asset = store.listAssets().assets[0];
    const source = store.getAssetSource(asset.id);

    expect(asset.sourceSessionAvailable).toBe(false);
    expect(source?.session).toBeNull();
  });

  test('keeps project asset collections isolated by current project', () => {
    db.prepare('INSERT INTO cowork_sessions (id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('session-1', 'Creative Producer', 'running', 1, 1);

    const workspace = store.createProject({ name: 'Launch Campaign' });
    const projectId = workspace.currentProjectId;
    expect(projectId).not.toBe(CreatorStudioDefaultProjectId);

    store.handleCoworkMessageInserted({
      sessionId: 'session-1',
      message: {
        id: 'message-user',
        type: 'user',
        content: creatorDraft,
        timestamp: 10,
        sequence: 1,
      },
    });
    store.handleCoworkMessageInserted({
      sessionId: 'session-1',
      message: {
        id: 'message-assistant',
        type: 'assistant',
        content: 'Generated image',
        timestamp: 20,
        sequence: 2,
        metadata: {
          generatedImages: [{ path: '/tmp/generated-project.png' }],
        },
      },
    });

    expect(store.listAssets({ projectId }).total).toBe(1);
    expect(store.listAssets({ projectId: CreatorStudioDefaultProjectId }).total).toBe(0);

    const collectionWorkspace = store.createCollection({ projectId, name: 'Shortlist' });
    const collection = collectionWorkspace.collections.find((item) => item.name === 'Shortlist')!;
    const asset = store.listAssets({ projectId }).assets[0];
    const updated = store.updateAsset({
      assetId: asset.id,
      adoptionStatus: CreatorAssetAdoptionStatus.Shortlisted,
      tags: ['hero', 'launch'],
      licenseNote: 'Internal generated asset.',
      selected: true,
    });
    expect(updated?.adoptionStatus).toBe(CreatorAssetAdoptionStatus.Shortlisted);
    expect(updated?.tags).toEqual(['hero', 'launch']);
    expect(updated?.licenseNote).toBe('Internal generated asset.');
    expect(updated?.selected).toBe(true);

    const collected = store.addAssetToCollection({ assetId: asset.id, collectionId: collection.id });
    expect(collected?.collectionIds).toContain(collection.id);
    expect(store.listAssets({ projectId, collectionId: collection.id }).total).toBe(1);
    expect(store.listAssets({ projectId, tag: 'hero' }).total).toBe(1);
    expect(store.listAssets({ projectId, adoptionStatus: CreatorAssetAdoptionStatus.Shortlisted }).total).toBe(1);
  });

  test('stores prompt and case assets in the current project without local file backing', () => {
    const workspace = store.createProject({ name: 'Prompt Library' });
    const projectId = workspace.currentProjectId;

    const promptAsset = store.createPromptAsset({
      projectId,
      title: 'Hero Prompt',
      promptText: 'Generate a launch poster.',
      promptSpec: {
        sourceType: 'template',
        sourceId: 'poster-system',
        sourceTitle: 'Poster System',
        templateId: 'poster-system',
        caseIds: ['case-1'],
      },
      templateId: 'poster-system',
      caseIds: ['case-1'],
      tags: ['poster'],
    });

    const caseAsset = store.createCaseAsset({
      projectId,
      caseId: 'case-2',
      title: 'Reference Case',
      promptText: 'Generate a reference composition.',
      sourceLabel: 'awesome-gpt-image-2',
      sourceUrl: 'https://example.com/case',
      githubUrl: 'https://github.com/example/repo',
      category: 'poster',
      styles: ['typography'],
      scenes: ['campaign'],
    });

    expect(promptAsset.kind).toBe(CreatorProductionAssetKind.Prompt);
    expect(promptAsset.status).toBe(CreatorProductionAssetStatus.Ready);
    expect(promptAsset.source).toBe(CreatorProductionAssetSource.CreatorPrompt);
    expect(promptAsset.filePath).toMatch(/^creator:\/\/prompt\//);

    expect(caseAsset.kind).toBe(CreatorProductionAssetKind.Case);
    expect(caseAsset.status).toBe(CreatorProductionAssetStatus.Ready);
    expect(caseAsset.source).toBe(CreatorProductionAssetSource.CreatorCase);
    expect(caseAsset.caseIds).toEqual(['case-2']);

    expect(store.listAssets({ projectId }).total).toBe(2);
    expect(store.listAssets({ projectId, source: CreatorProductionAssetSource.CreatorPrompt }).total).toBe(1);
    expect(store.listAssets({ projectId, tag: 'typography' }).total).toBe(1);
  });
});
