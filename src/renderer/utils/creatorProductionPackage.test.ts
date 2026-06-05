import {
  CreatorAssetAdoptionStatus,
  CreatorBatchRunStatus,
  CreatorBatchTaskStatus,
  CreatorProductionAssetKind,
  CreatorProductionAssetSource,
  CreatorProductionAssetStatus,
} from '@shared/creatorStudio/constants';
import type {
  CreatorBatchRunRecord,
  CreatorProductionAssetRecord,
  CreatorRecipeRecord,
} from '@shared/creatorStudio/types';
import { describe, expect, test } from 'vitest';

import {
  buildCreatorProductionPackage,
  buildCreatorProductionPerformance,
  CreatorProductionPackageIssueSeverity,
  CreatorProductionPackageSchemaVersion,
  summarizeCreatorProductionPackage,
} from './creatorProductionPackage';

const createAsset = (overrides: Partial<CreatorProductionAssetRecord> = {}): CreatorProductionAssetRecord => ({
  id: 'asset-1',
  projectId: 'project-1',
  kind: CreatorProductionAssetKind.Image,
  status: CreatorProductionAssetStatus.Ready,
  source: CreatorProductionAssetSource.CoworkGeneratedImage,
  runId: 'run-1',
  variantOfAssetId: null,
  sessionId: 'session-1',
  messageId: 'message-1',
  templateId: 'poster',
  caseIds: ['case-1'],
  promptSpec: { schemaVersion: 'creator.prompt.v1', subject: 'Launch' },
  promptText: 'Generate launch image',
  parentPromptAssetId: null,
  promptVersionId: null,
  recipeId: null,
  selectedDirectionId: null,
  filePath: '/tmp/output.png',
  fileName: 'output.png',
  mimeType: 'image/png',
  favorite: false,
  adoptionStatus: CreatorAssetAdoptionStatus.Unset,
  tags: [],
  collectionIds: [],
  selected: false,
  licenseNote: null,
  usageNote: null,
  createdAt: 1,
  updatedAt: 1,
  sourceSessionAvailable: true,
  ...overrides,
});

const createRecipe = (overrides: Partial<CreatorRecipeRecord> = {}): CreatorRecipeRecord => ({
  id: 'recipe-1',
  projectId: 'project-1',
  title: 'Recipe',
  description: null,
  sourcePromptAssetId: null,
  promptSpec: { schemaVersion: 'creator.prompt.v1', subject: 'Launch' },
  defaultRuntime: {},
  defaultOutput: {},
  tags: ['poster'],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const createBatchRun = (overrides: Partial<CreatorBatchRunRecord> = {}): CreatorBatchRunRecord => ({
  id: 'batch-1',
  projectId: 'project-1',
  status: CreatorBatchRunStatus.Completed,
  briefTitle: 'Batch',
  promptSpec: { schemaVersion: 'creator.prompt.v1', subject: 'Launch' },
  promptText: 'Batch prompt',
  summary: {
    taskCount: 2,
    modelIds: ['seedream'],
    modelNames: ['Seedream'],
    templateIds: ['poster'],
    sizes: ['4:5'],
    estimatedCostUnits: 2,
    costUnitLabel: 'unit',
  },
  createdAt: 1,
  updatedAt: 1,
  completedAt: 2,
  tasks: [{
    id: 'task-1',
    batchRunId: 'batch-1',
    projectId: 'project-1',
    status: CreatorBatchTaskStatus.Completed,
    directionId: 'direction-1',
    directionTitle: 'Direction',
    modelId: 'seedream',
    modelName: 'Seedream',
    templateId: 'poster',
    size: '4:5',
    promptSpec: { schemaVersion: 'creator.prompt.v1', subject: 'Launch' },
    promptText: 'Task prompt',
    assetIds: ['asset-1'],
    error: null,
    costEstimateText: '1 unit',
    createdAt: 1,
    updatedAt: 1,
    completedAt: 2,
  }, {
    id: 'task-2',
    batchRunId: 'batch-1',
    projectId: 'project-1',
    status: CreatorBatchTaskStatus.Failed,
    directionId: 'direction-2',
    directionTitle: 'Direction 2',
    modelId: 'seedream',
    modelName: 'Seedream',
    templateId: 'poster',
    size: '4:5',
    promptSpec: { schemaVersion: 'creator.prompt.v1', subject: 'Launch' },
    promptText: 'Task prompt',
    assetIds: [],
    error: 'failed',
    costEstimateText: '1 unit',
    createdAt: 1,
    updatedAt: 1,
    completedAt: null,
  }],
  ...overrides,
});

describe('creator production package', () => {
  test('builds a manifest with local adoption metrics', () => {
    const manifest = buildCreatorProductionPackage({
      projectId: 'project-1',
      project: { id: 'project-1', name: 'Project', description: null, createdAt: 1, updatedAt: 1 },
      assets: [
        createAsset({
          selected: true,
          adoptionStatus: CreatorAssetAdoptionStatus.Adopted,
          licenseNote: 'Owned',
          usageNote: 'Campaign',
        }),
        createAsset({ id: 'asset-2', favorite: true, adoptionStatus: CreatorAssetAdoptionStatus.Favorite }),
      ],
      recipes: [createRecipe()],
      batchRuns: [createBatchRun()],
      exportedAt: '2026-06-05T00:00:00.000Z',
    });

    expect(manifest.schemaVersion).toBe(CreatorProductionPackageSchemaVersion.V1);
    expect(manifest.summary.totalAssets).toBe(2);
    expect(manifest.summary.selectedAssets).toBe(1);
    expect(manifest.summary.adoptedAssets).toBe(1);
    expect(manifest.summary.favoriteAssets).toBe(1);
    expect(manifest.summary.completionRate).toBe(50);
    expect(manifest.performance.byTemplate[0]).toMatchObject({
      id: 'poster',
      totalAssets: 2,
      batchTasks: 2,
      completionRate: 50,
    });
    expect(manifest.governance.issues.some((issue) => issue.code === 'failed_batch_tasks')).toBe(true);
  });

  test('aggregates performance by template, model, and direction', () => {
    const performance = buildCreatorProductionPerformance({
      assets: [
        createAsset({
          selected: true,
          adoptionStatus: CreatorAssetAdoptionStatus.Adopted,
          templateId: 'poster',
          selectedDirectionId: 'direction-1',
        }),
        createAsset({
          id: 'asset-2',
          favorite: true,
          adoptionStatus: CreatorAssetAdoptionStatus.Favorite,
          templateId: 'story',
          selectedDirectionId: 'direction-2',
        }),
      ],
      batchRuns: [createBatchRun({
        tasks: [
          {
            ...createBatchRun().tasks[0],
            templateId: 'poster',
            directionId: 'direction-1',
            directionTitle: 'Hero direction',
            modelId: 'seedream',
            modelName: 'Seedream',
            status: CreatorBatchTaskStatus.Completed,
          },
          {
            ...createBatchRun().tasks[1],
            templateId: 'story',
            directionId: 'direction-2',
            directionTitle: 'Story direction',
            modelId: 'gpt-image',
            modelName: 'GPT Image',
            status: CreatorBatchTaskStatus.Failed,
          },
        ],
      })],
    });

    expect(performance.byTemplate[0]).toMatchObject({
      id: 'poster',
      selectedAssets: 1,
      adoptedAssets: 1,
      completedBatchTasks: 1,
      completionRate: 100,
    });
    expect(performance.byModel).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'seedream',
        label: 'Seedream',
        completedBatchTasks: 1,
        completionRate: 100,
      }),
      expect.objectContaining({
        id: 'gpt-image',
        label: 'GPT Image',
        failedBatchTasks: 1,
        completionRate: 0,
      }),
    ]));
    expect(performance.byDirection[0]).toMatchObject({
      id: 'direction-1',
      label: 'Hero direction',
      adoptedAssets: 1,
    });
  });

  test('flags blockers for secrets and missing production files', () => {
    const summary = summarizeCreatorProductionPackage({
      projectId: 'project-1',
      project: null,
      assets: [
        createAsset({
          selected: true,
          status: CreatorProductionAssetStatus.Missing,
          promptText: 'use sk-testsecretvalue1234567890',
        }),
      ],
      recipes: [],
      batchRuns: [],
    });

    expect(summary.blockerCount).toBe(2);
    expect(summary.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: CreatorProductionPackageIssueSeverity.Blocker,
        code: 'sensitive_prompt_values',
      }),
      expect.objectContaining({
        severity: CreatorProductionPackageIssueSeverity.Blocker,
        code: 'missing_production_files',
      }),
    ]));
  });
});
