import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  CreatorAssetAdoptionStatus,
  CreatorBatchRunStatus,
  CreatorBatchTaskStatus,
  CreatorBoardCardKind,
  CreatorBoardMoveDirection,
  CreatorProductionAssetKind,
  CreatorProductionAssetSource,
  CreatorProductionAssetStatus,
  CreatorProductionRunStatus,
  CreatorPromptSpecSchemaVersion,
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

const creatorBatchDraft = `General intro

[Creator Studio]

batchRunId: batch-run-1
batchTaskId: batch-task-1
templateId: poster-system
caseIds: case-1

PromptSpec:
\`\`\`json
{
  "templateId": "poster-system",
  "caseIds": ["case-1"],
  "sourceTitle": "Batch Task",
  "batch": {
    "batchRunId": "batch-run-1",
    "batchTaskId": "batch-task-1",
    "modelId": "seedream-image"
  }
}
\`\`\`

Prompt:
\`\`\`text
Generate a batch visual.
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

  test('parses creator batch ids from cowork draft', () => {
    const context = parseCreatorStudioSourceContext(creatorBatchDraft);

    expect(context?.batchRunId).toBe('batch-run-1');
    expect(context?.batchTaskId).toBe('batch-task-1');
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
    expect(promptAsset.promptSpec?.schemaVersion).toBe(CreatorPromptSpecSchemaVersion.V1);
    expect(promptAsset.promptSpec?.source).toEqual(expect.objectContaining({
      sourceType: 'template',
      sourceId: 'poster-system',
      sourceTitle: 'Poster System',
      templateId: 'poster-system',
      caseIds: ['case-1'],
    }));
    expect(promptAsset.promptSpec?.brief).toBeTruthy();
    expect(promptAsset.promptSpec?.composition).toBeTruthy();
    expect(promptAsset.promptSpec?.style).toBeTruthy();
    expect(promptAsset.promptSpec?.text).toBeTruthy();
    expect(promptAsset.promptSpec?.output).toBeTruthy();
    expect(promptAsset.promptSpec?.template).toBeTruthy();
    expect(promptAsset.promptSpec?.provenance).toBeTruthy();

    expect(caseAsset.kind).toBe(CreatorProductionAssetKind.Case);
    expect(caseAsset.status).toBe(CreatorProductionAssetStatus.Ready);
    expect(caseAsset.source).toBe(CreatorProductionAssetSource.CreatorCase);
    expect(caseAsset.caseIds).toEqual(['case-2']);

    expect(store.listAssets({ projectId }).total).toBe(2);
    expect(store.listAssets({ projectId, source: CreatorProductionAssetSource.CreatorPrompt }).total).toBe(1);
    expect(store.listAssets({ projectId, tag: 'typography' }).total).toBe(1);
  });

  test('tracks prompt versions, recipes, diffs, and forks', () => {
    const workspace = store.createProject({ name: 'Recipe Project' });
    const projectId = workspace.currentProjectId;
    const promptAsset = store.createPromptAsset({
      projectId,
      title: 'Reusable Poster Prompt',
      promptText: 'Generate a launch poster.',
      promptSpec: {
        sourceTitle: 'Reusable Poster Prompt',
        templateId: 'poster-system',
        caseIds: ['case-1'],
        subject: 'Launch poster',
      },
      templateId: 'poster-system',
      caseIds: ['case-1'],
      selectedDirectionId: 'bold',
      tags: ['poster', 'launch'],
    });

    expect(promptAsset.promptVersionId).toBeTruthy();
    expect(promptAsset.selectedDirectionId).toBe('bold');

    const firstVersions = store.listPromptVersions({ promptAssetId: promptAsset.id });
    expect(firstVersions.total).toBe(1);
    expect(firstVersions.versions[0].version).toBe(1);

    const secondVersion = store.createPromptVersion({
      promptAssetId: promptAsset.id,
      promptText: 'Generate a refined launch poster.',
      promptSpec: {
        ...promptAsset.promptSpec!,
        subject: 'Refined launch poster',
      },
      changeNote: 'Refine subject',
    });
    expect(secondVersion.version).toBe(2);

    const diff = store.diffPromptVersions({
      fromVersionId: firstVersions.versions[0].id,
      toVersionId: secondVersion.id,
    });
    expect(diff.promptTextChanged).toBe(true);
    expect(diff.promptSpecChanged).toBe(true);

    const recipe = store.createRecipe({
      projectId,
      title: 'Weekly launch poster',
      sourcePromptAssetId: promptAsset.id,
      promptSpec: secondVersion.promptSpec,
      defaultRuntime: { modelId: 'seedream-image' },
      defaultOutput: { aspectRatio: '1:1' },
      tags: ['poster', 'weekly'],
    });
    expect(recipe.sourcePromptAssetId).toBe(promptAsset.id);
    expect(store.listRecipes({ projectId, tag: 'weekly' }).total).toBe(1);

    const imported = store.importRecipe({
      projectId,
      recipe: {
        title: 'Imported poster recipe',
        promptSpec: recipe.promptSpec,
        tags: ['imported'],
      },
    });
    expect(imported.title).toBe('Imported poster recipe');

    const forked = store.forkPromptVersion({
      promptVersionId: firstVersions.versions[0].id,
      projectId,
      title: 'Rollback fork',
    });
    expect(forked.parentPromptAssetId).toBe(promptAsset.id);
    expect(forked.promptText).toBe('Generate a launch poster.');
    expect(store.listPromptVersions({ promptAssetId: forked.id }).total).toBe(1);
  });

  test('carries prompt version and recipe lineage from cowork draft to generated assets', () => {
    db.prepare('INSERT INTO cowork_sessions (id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('session-1', 'Creative Producer', 'running', 1, 1);
    const workspace = store.createProject({ name: 'Lineage Project' });
    const projectId = workspace.currentProjectId;
    const promptAsset = store.createPromptAsset({
      projectId,
      title: 'Lineage Prompt',
      promptText: 'Generate a lineage visual.',
      promptSpec: {
        sourceTitle: 'Lineage Prompt',
        templateId: 'poster-system',
        caseIds: ['case-1'],
      },
      templateId: 'poster-system',
      caseIds: ['case-1'],
      selectedDirectionId: 'route-a',
    });
    const recipe = store.createRecipe({
      projectId,
      title: 'Lineage recipe',
      sourcePromptAssetId: promptAsset.id,
      promptSpec: promptAsset.promptSpec!,
    });

    store.handleCoworkMessageInserted({
      sessionId: 'session-1',
      message: {
        id: 'message-user',
        type: 'user',
        content: [
          '[Creator Studio]',
          '',
          `promptVersionId: ${promptAsset.promptVersionId}`,
          `recipeId: ${recipe.id}`,
          'selectedDirectionId: route-a',
          'templateId: poster-system',
          '',
          'PromptSpec:',
          '```json',
          JSON.stringify({
            ...promptAsset.promptSpec,
            promptVersionId: promptAsset.promptVersionId,
            recipeId: recipe.id,
            selectedDirectionId: 'route-a',
          }, null, 2),
          '```',
          '',
          'Prompt:',
          '```text',
          promptAsset.promptText,
          '```',
        ].join('\n'),
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
          generatedImages: [{ path: '/tmp/generated-lineage.png' }],
        },
      },
    });

    const asset = store.listAssets({ projectId }).assets.find((item) => item.kind === CreatorProductionAssetKind.Image);
    expect(asset?.promptVersionId).toBe(promptAsset.promptVersionId);
    expect(asset?.recipeId).toBe(recipe.id);
    expect(asset?.selectedDirectionId).toBe('route-a');
  });

  test('persists project boards, card selection, context packs, and brand kit', () => {
    const workspace = store.createProject({ name: 'Board Project' });
    const projectId = workspace.currentProjectId;
    const boardWorkspace = store.getBoardWorkspace(projectId);

    expect(boardWorkspace.projectId).toBe(projectId);
    expect(boardWorkspace.boards).toHaveLength(1);
    expect(boardWorkspace.cards).toHaveLength(0);
    const asset = store.createPromptAsset({
      projectId,
      title: 'Reference prompt asset',
      promptText: 'Generate a reusable reference image.',
      promptSpec: {
        sourceTitle: 'Reference prompt asset',
        templateId: 'poster-system',
        caseIds: ['case-9'],
      },
      templateId: 'poster-system',
      caseIds: ['case-9'],
      tags: ['reference', 'poster'],
    });

    const promptCard = store.addBoardCard({
      boardId: boardWorkspace.currentBoardId,
      kind: CreatorBoardCardKind.Prompt,
      title: 'Launch prompt',
      promptText: 'Generate a launch visual.',
      promptSpec: { sourceTitle: 'Launch prompt', caseIds: [] },
      groupName: 'Round 1',
    });
    const assetCard = store.addBoardCard({
      boardId: boardWorkspace.currentBoardId,
      kind: CreatorBoardCardKind.Asset,
      title: 'Reference asset',
      assetId: asset.id,
      groupName: 'style-reference',
      notes: 'Use as a visual system reference.',
    });
    const directionCard = store.addBoardCard({
      boardId: boardWorkspace.currentBoardId,
      kind: CreatorBoardCardKind.Direction,
      title: 'Bold route',
      direction: {
        id: 'bold',
        title: 'Bold route',
        template: 'Large headline',
        style: 'High contrast',
        reason: 'Social launch',
        promptFocus: 'Increase visual contrast.',
      },
    });
    const renamedDirection = store.updateBoardCard({
      cardId: directionCard.id,
      title: 'Renamed bold route',
    });
    expect(renamedDirection?.direction?.title).toBe('Renamed bold route');

    store.selectBoardCard({ cardId: promptCard.id, selected: true });
    store.selectBoardCard({ cardId: assetCard.id, selected: true });
    store.selectBoardCard({ cardId: directionCard.id, selected: true });
    store.moveBoardCard({ cardId: directionCard.id, direction: CreatorBoardMoveDirection.Up });

    const updated = store.updateBrandKit({
      projectId,
      colors: ['#112233', '#ffffff'],
      bannedWords: ['cheap'],
      tone: 'confident',
      visualPreferences: 'clean grid, premium lighting',
    });
    expect(updated.brandKit.colors).toEqual(['#112233', '#ffffff']);
    expect(updated.brandKit.bannedWords).toEqual(['cheap']);

    const context = store.buildBoardContextPack({ boardId: boardWorkspace.currentBoardId });
    expect(context.cardIds).toHaveLength(3);
    expect(context.contextPack).toContain('Board: Creative Board');
    expect(context.contextPack).toContain('Launch prompt');
    expect(context.contextPack).toContain('Renamed bold route');
    expect(context.contextPack).toContain('assetKind=prompt');
    expect(context.contextPack).toContain('assetSource=creator_prompt');
    expect(context.contextPack).toContain('filePath=creator://prompt/');
    expect(context.contextPack).toContain('assetRole=style-reference');
    expect(context.contextPack).toContain('templateId=poster-system');
    expect(context.contextPack).toContain('tags=reference, poster');
    expect(context.contextPack).toContain('cheap');

    const secondBoard = store.createBoard({ projectId, name: 'Round 2' });
    expect(secondBoard.currentBoardId).not.toBe(boardWorkspace.currentBoardId);
    expect(store.setCurrentBoard(projectId, boardWorkspace.currentBoardId).currentBoardId).toBe(boardWorkspace.currentBoardId);
  });

  test('requires explicit board selection before building context pack', () => {
    const workspace = store.createProject({ name: 'Empty Selection Project' });
    const boardWorkspace = store.getBoardWorkspace(workspace.currentProjectId);
    store.addBoardCard({
      boardId: boardWorkspace.currentBoardId,
      kind: CreatorBoardCardKind.Prompt,
      title: 'Unselected prompt',
      promptText: 'Keep this unselected.',
    });

    expect(() => store.buildBoardContextPack({ boardId: boardWorkspace.currentBoardId }))
      .toThrow('Board selection is empty');
  });

  test('creates batch run matrix from directions, models, templates, and sizes', () => {
    const workspace = store.createProject({ name: 'Batch Project' });
    const projectId = workspace.currentProjectId;
    const capabilities = store.listCreativeModelCapabilities();
    expect(capabilities.some((model) => model.supportsBatch)).toBe(true);

    const batchRun = store.createBatchRun({
      projectId,
      briefTitle: 'Launch visual batch',
      promptSpec: {
        sourceTitle: 'Launch visual',
        subject: 'New product launch',
        templateId: 'poster-system',
        caseIds: ['case-1'],
        constraints: { aspectRatio: '1:1' },
      },
      promptText: 'Generate a launch visual.',
      directions: [
        {
          id: 'bold',
          title: 'Bold route',
          template: 'Poster',
          style: 'High contrast',
          reason: 'Awareness',
          promptFocus: 'Use a large headline.',
          promptText: 'Generate a bold launch visual.',
          promptSpec: { sourceTitle: 'Bold route', constraints: { aspectRatio: '1:1' } },
        },
        {
          id: 'detail',
          title: 'Detail route',
          template: 'Product detail',
          style: 'Macro',
          reason: 'Consideration',
          promptFocus: 'Emphasize product texture.',
          promptText: 'Generate a detail launch visual.',
          promptSpec: { sourceTitle: 'Detail route', constraints: { aspectRatio: '1:1' } },
        },
      ],
      modelIds: ['seedream-image', 'prompt-only-review'],
      templateIds: ['poster-system', 'product-card'],
      sizes: ['1:1', '16:9'],
    });

    expect(batchRun.status).toBe(CreatorBatchRunStatus.Running);
    expect(batchRun.summary.taskCount).toBe(16);
    expect(batchRun.summary.modelIds).toEqual(['seedream-image', 'prompt-only-review']);
    expect(batchRun.summary.templateIds).toEqual(['poster-system', 'product-card']);
    expect(batchRun.summary.sizes).toEqual(['1:1', '16:9']);
    expect(batchRun.tasks).toHaveLength(16);
    expect(batchRun.tasks[0].status).toBe(CreatorBatchTaskStatus.Pending);
    expect(batchRun.promptSpec.schemaVersion).toBe(CreatorPromptSpecSchemaVersion.V1);
    expect(batchRun.tasks[0].promptText).toContain('Batch execution constraints');
    expect(batchRun.tasks[0].promptText).toContain('[Creator Studio]');
    expect(batchRun.tasks[0].promptText).toContain(`batchRunId: ${batchRun.id}`);
    expect(batchRun.tasks[0].promptText).toContain(`batchTaskId: ${batchRun.tasks[0].id}`);
    expect(batchRun.tasks[0].promptText).toContain('PromptSpec:');
    expect(batchRun.tasks[0].promptSpec.batch).toMatchObject({
      batchRunId: batchRun.id,
      batchTaskId: batchRun.tasks[0].id,
      modelId: batchRun.tasks[0].modelId,
    });
    expect(batchRun.tasks[0].promptSpec.schemaVersion).toBe(CreatorPromptSpecSchemaVersion.V1);

    const context = parseCreatorStudioSourceContext(batchRun.tasks[0].promptText);
    expect(context?.batchRunId).toBe(batchRun.id);
    expect(context?.batchTaskId).toBe(batchRun.tasks[0].id);
    expect(context?.promptSpec?.schemaVersion).toBe(CreatorPromptSpecSchemaVersion.V1);
    expect(context?.promptText).toContain('Generate a bold launch visual.');

    const listed = store.listBatchRuns({ projectId });
    expect(listed.total).toBe(1);
    expect(listed.runs[0].tasks).toHaveLength(16);
  });

  test('skips and retries individual batch tasks without blocking the run', () => {
    const workspace = store.createProject({ name: 'Batch Recovery Project' });
    const batchRun = store.createBatchRun({
      projectId: workspace.currentProjectId,
      briefTitle: 'Recovery batch',
      promptSpec: { sourceTitle: 'Recovery batch', constraints: { aspectRatio: '1:1' } },
      promptText: 'Generate a recovery visual.',
      directions: [{
        id: 'route-a',
        title: 'Route A',
        template: 'Poster',
        style: 'Clean',
        reason: 'Baseline',
        promptFocus: 'Simple layout.',
        promptText: 'Generate route A.',
        promptSpec: { sourceTitle: 'Route A', constraints: { aspectRatio: '1:1' } },
      }],
      modelIds: ['seedream-image'],
      templateIds: ['poster-system'],
      sizes: ['1:1', '16:9'],
    });
    const [firstTask, secondTask] = batchRun.tasks;

    const afterSkip = store.skipBatchTask(firstTask.id);
    expect(afterSkip?.tasks.find((task) => task.id === firstTask.id)?.status).toBe(CreatorBatchTaskStatus.Skipped);
    expect(afterSkip?.tasks.find((task) => task.id === secondTask.id)?.status).toBe(CreatorBatchTaskStatus.Pending);
    expect(afterSkip?.status).toBe(CreatorBatchRunStatus.Running);

    db.prepare('UPDATE creator_batch_tasks SET status = ?, completed_at = ? WHERE id = ?')
      .run(CreatorBatchTaskStatus.Completed, Date.now(), secondTask.id);
    store.skipBatchTask(firstTask.id);
    const partial = store.getBatchRun(batchRun.id);
    expect(partial?.status).toBe(CreatorBatchRunStatus.PartialFailed);

    const retried = store.retryBatchTask(firstTask.id);
    expect(retried?.status).toBe(CreatorBatchRunStatus.Running);
    expect(retried?.tasks.find((task) => task.id === firstTask.id)?.status).toBe(CreatorBatchTaskStatus.Pending);
  });

  test('rejects unsupported or oversized batch model plans', () => {
    const workspace = store.createProject({ name: 'Batch Guard Project' });
    const baseInput = {
      projectId: workspace.currentProjectId,
      briefTitle: 'Guard batch',
      promptSpec: { sourceTitle: 'Guard batch', constraints: { aspectRatio: '1:1' } },
      promptText: 'Generate a guarded visual.',
      directions: [{
        id: 'route-a',
        title: 'Route A',
        template: 'Poster',
        style: 'Clean',
        reason: 'Baseline',
        promptFocus: 'Simple layout.',
        promptText: 'Generate route A.',
        promptSpec: { sourceTitle: 'Route A', constraints: { aspectRatio: '1:1' } },
      }],
      templateIds: ['poster-system'],
      sizes: ['1:1'],
    };

    expect(() => store.createBatchRun({
      ...baseInput,
      modelIds: ['seedance-video'],
    })).toThrow('Model does not support batch');

    expect(() => store.createBatchRun({
      ...baseInput,
      directions: Array.from({ length: 6 }, (_, index) => ({
        ...baseInput.directions[0],
        id: `route-${index}`,
        title: `Route ${index}`,
      })),
      modelIds: ['seedream-image'],
      templateIds: ['poster-system', 'product-card', 'campaign-poster'],
      sizes: ['1:1', '4:5', '16:9', '3:2', '9:16'],
    })).toThrow('Batch task count exceeds model limit');
  });

  test('marks batch tasks completed from generated images and failed from store API', () => {
    db.prepare('INSERT INTO cowork_sessions (id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('session-1', 'Creative Producer', 'running', 1, 1);

    const workspace = store.createProject({ name: 'Batch Completion Project' });
    const batchRun = store.createBatchRun({
      projectId: workspace.currentProjectId,
      briefTitle: 'Completion batch',
      promptSpec: { sourceTitle: 'Completion batch', constraints: { aspectRatio: '1:1' } },
      promptText: 'Generate a completion visual.',
      directions: [{
        id: 'route-a',
        title: 'Route A',
        template: 'Poster',
        style: 'Clean',
        reason: 'Baseline',
        promptFocus: 'Simple layout.',
        promptText: 'Generate route A.',
        promptSpec: { sourceTitle: 'Route A', constraints: { aspectRatio: '1:1' } },
      }],
      modelIds: ['seedream-image'],
      templateIds: ['poster-system'],
      sizes: ['1:1', '16:9'],
    });
    const [firstTask, secondTask] = batchRun.tasks;

    store.handleCoworkMessageInserted({
      sessionId: 'session-1',
      message: {
        id: 'message-user',
        type: 'user',
        content: [
          '[Creator Studio]',
          '',
          `batchRunId: ${batchRun.id}`,
          `batchTaskId: ${firstTask.id}`,
          `templateId: ${firstTask.templateId}`,
          '',
          'PromptSpec:',
          '```json',
          JSON.stringify(firstTask.promptSpec, null, 2),
          '```',
          '',
          'Prompt:',
          '```text',
          firstTask.promptText,
          '```',
        ].join('\n'),
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
          generatedImages: [{ path: '/tmp/generated-batch.png' }],
        },
      },
    });

    const completed = store.getBatchRun(batchRun.id);
    const completedTask = completed?.tasks.find((task) => task.id === firstTask.id);
    expect(completedTask?.status).toBe(CreatorBatchTaskStatus.Completed);
    expect(completedTask?.assetIds).toHaveLength(1);
    expect(completed?.status).toBe(CreatorBatchRunStatus.Running);

    const failed = store.failBatchTask({ taskId: secondTask.id, error: 'Provider timeout' });
    const failedTask = failed?.tasks.find((task) => task.id === secondTask.id);
    expect(failedTask?.status).toBe(CreatorBatchTaskStatus.Failed);
    expect(failedTask?.error).toBe('Provider timeout');
    expect(failed?.status).toBe(CreatorBatchRunStatus.PartialFailed);
  });
});
