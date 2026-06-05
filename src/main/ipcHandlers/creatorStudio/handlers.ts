import type { IpcMain } from 'electron';
import { shell } from 'electron';
import fs from 'fs';

import {
  CreatorStudioAssetListDefaultLimit,
  CreatorStudioAssetListMaxLimit,
  CreatorStudioIpcChannel,
  isCreatorAssetAdoptionStatus,
  isCreatorBoardCardKind,
  isCreatorBoardMoveDirection,
  isCreatorProductionAssetSource,
} from '../../../shared/creatorStudio/constants';
import type {
  CreatorAssetUpdateInput,
  CreatorBoardCardCreateInput,
  CreatorBoardCardUpdateInput,
  CreatorBrandKitUpdateInput,
  CreatorPromptAssetCreateInput,
  CreatorRecipeCreateInput,
} from '../../../shared/creatorStudio/types';
import type { CreatorAssetStore } from '../../creatorAssetStore';

type CreatorStudioIpcResponse<T> = {
  success: boolean;
  error?: string;
} & T;

const toTrimmedString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const normalizeListInput = (input: unknown) => {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const rawLimit = typeof record.limit === 'number' ? record.limit : CreatorStudioAssetListDefaultLimit;
  const rawOffset = typeof record.offset === 'number' ? record.offset : 0;
  return {
    ...(toTrimmedString(record.projectId) ? { projectId: toTrimmedString(record.projectId)! } : {}),
    ...(toTrimmedString(record.collectionId) ? { collectionId: toTrimmedString(record.collectionId)! } : {}),
    ...(isCreatorProductionAssetSource(record.source) ? { source: record.source } : {}),
    ...(toTrimmedString(record.templateId) ? { templateId: toTrimmedString(record.templateId)! } : {}),
    ...(toTrimmedString(record.tag) ? { tag: toTrimmedString(record.tag)! } : {}),
    ...(isCreatorAssetAdoptionStatus(record.adoptionStatus) ? { adoptionStatus: record.adoptionStatus } : {}),
    ...(typeof record.favorite === 'boolean' ? { favorite: record.favorite } : {}),
    limit: Math.max(1, Math.min(Math.floor(rawLimit), CreatorStudioAssetListMaxLimit)),
    offset: Math.max(0, Math.floor(rawOffset)),
  };
};

const normalizeStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
};

const normalizeObject = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const normalizeDirection = (value: unknown) => {
  const record = normalizeObject(value);
  const title = toTrimmedString(record?.title);
  if (!record || !title) return null;
  return {
    id: toTrimmedString(record.id) ?? title,
    title,
    template: toTrimmedString(record.template) ?? '',
    style: toTrimmedString(record.style) ?? '',
    reason: toTrimmedString(record.reason) ?? '',
    promptFocus: toTrimmedString(record.promptFocus) ?? '',
  };
};

const normalizeBatchDirection = (value: unknown) => {
  const record = normalizeObject(value);
  const id = toTrimmedString(record?.id);
  const title = toTrimmedString(record?.title);
  const promptText = toTrimmedString(record?.promptText);
  const promptSpec = normalizeObject(record?.promptSpec);
  if (!record || !id || !title || !promptText || !promptSpec) return null;
  return {
    id,
    title,
    template: toTrimmedString(record.template) ?? '',
    style: toTrimmedString(record.style) ?? '',
    reason: toTrimmedString(record.reason) ?? '',
    promptFocus: toTrimmedString(record.promptFocus) ?? '',
    promptText,
    promptSpec,
  };
};

const normalizeBatchDirections = (value: unknown) => (
  Array.isArray(value)
    ? value.map(normalizeBatchDirection).filter((item): item is NonNullable<ReturnType<typeof normalizeBatchDirection>> => Boolean(item))
    : []
);

const normalizeRecord = (value: unknown): Record<string, unknown> => (
  normalizeObject(value) ?? {}
);

export const registerCreatorStudioIpcHandlers = (
  ipcMain: IpcMain,
  getCreatorAssetStore: () => CreatorAssetStore
): void => {
  ipcMain.handle(CreatorStudioIpcChannel.AssetList, async (_event, input: unknown) => {
    try {
      return {
        success: true,
        ...getCreatorAssetStore().listAssets(normalizeListInput(input)),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list creator assets',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.AssetGetSource, async (_event, input: unknown) => {
    try {
      const assetId = toTrimmedString(input);
      if (!assetId) {
        return { success: false, error: 'assetId is required' };
      }
      const source = getCreatorAssetStore().getAssetSource(assetId);
      if (!source) {
        return { success: false, error: 'Asset not found' };
      }
      return { success: true, source };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get creator asset source',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.AssetSetFavorite, async (_event, input: unknown) => {
    try {
      const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
      const assetId = toTrimmedString(record.assetId);
      if (!assetId || typeof record.favorite !== 'boolean') {
        return { success: false, error: 'assetId and favorite are required' };
      }
      const asset = getCreatorAssetStore().setFavorite(assetId, record.favorite);
      if (!asset) {
        return { success: false, error: 'Asset not found' };
      }
      return { success: true, asset };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update creator asset',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.AssetUpdate, async (_event, input: unknown) => {
    try {
      const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
      const assetId = toTrimmedString(record.assetId);
      if (!assetId) {
        return { success: false, error: 'assetId is required' };
      }
      const licenseNote = record.licenseNote === null
        ? null
        : typeof record.licenseNote === 'string'
          ? record.licenseNote
          : undefined;
      const usageNote = record.usageNote === null
        ? null
        : typeof record.usageNote === 'string'
          ? record.usageNote
          : undefined;
      const updateInput: CreatorAssetUpdateInput = {
        assetId,
        ...(toTrimmedString(record.projectId) ? { projectId: toTrimmedString(record.projectId)! } : {}),
        ...(typeof record.favorite === 'boolean' ? { favorite: record.favorite } : {}),
        ...(isCreatorAssetAdoptionStatus(record.adoptionStatus) ? { adoptionStatus: record.adoptionStatus } : {}),
        ...(normalizeStringArray(record.tags) ? { tags: normalizeStringArray(record.tags)! } : {}),
        ...(licenseNote !== undefined ? { licenseNote } : {}),
        ...(usageNote !== undefined ? { usageNote } : {}),
        ...(typeof record.selected === 'boolean' ? { selected: record.selected } : {}),
      };
      const asset = getCreatorAssetStore().updateAsset(updateInput);
      if (!asset) {
        return { success: false, error: 'Asset not found' };
      }
      return { success: true, asset };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update creator asset',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.AssetCreatePrompt, async (_event, input: unknown) => {
    try {
      const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
      const projectId = toTrimmedString(record.projectId);
      const title = toTrimmedString(record.title);
      const promptText = toTrimmedString(record.promptText);
      const promptSpec = record.promptSpec && typeof record.promptSpec === 'object'
        ? record.promptSpec as Record<string, unknown>
        : null;
      if (!projectId || !title || !promptText || !promptSpec) {
        return { success: false, error: 'projectId, title, promptText, and promptSpec are required' };
      }
      const asset = getCreatorAssetStore().createPromptAsset({
        projectId,
        title,
        promptText,
        promptSpec,
        ...(toTrimmedString(record.templateId) ? { templateId: toTrimmedString(record.templateId)! } : {}),
        ...(normalizeStringArray(record.caseIds) ? { caseIds: normalizeStringArray(record.caseIds)! } : {}),
        ...(normalizeStringArray(record.tags) ? { tags: normalizeStringArray(record.tags)! } : {}),
        ...(record.parentPromptAssetId === null ? { parentPromptAssetId: null } : toTrimmedString(record.parentPromptAssetId) ? { parentPromptAssetId: toTrimmedString(record.parentPromptAssetId)! } : {}),
        ...(record.recipeId === null ? { recipeId: null } : toTrimmedString(record.recipeId) ? { recipeId: toTrimmedString(record.recipeId)! } : {}),
        ...(toTrimmedString(record.selectedDirectionId) ? { selectedDirectionId: toTrimmedString(record.selectedDirectionId)! } : {}),
        ...(record.changeNote === null ? { changeNote: null } : toTrimmedString(record.changeNote) ? { changeNote: toTrimmedString(record.changeNote)! } : {}),
      } satisfies CreatorPromptAssetCreateInput);
      return { success: true, asset };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save creator prompt asset',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.AssetCreateCase, async (_event, input: unknown) => {
    try {
      const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
      const projectId = toTrimmedString(record.projectId);
      const caseId = toTrimmedString(record.caseId);
      const title = toTrimmedString(record.title);
      const promptText = toTrimmedString(record.promptText);
      if (!projectId || !caseId || !title || !promptText) {
        return { success: false, error: 'projectId, caseId, title, and promptText are required' };
      }
      const asset = getCreatorAssetStore().createCaseAsset({
        projectId,
        caseId,
        title,
        promptText,
        ...(toTrimmedString(record.sourceLabel) ? { sourceLabel: toTrimmedString(record.sourceLabel)! } : {}),
        ...(toTrimmedString(record.sourceUrl) ? { sourceUrl: toTrimmedString(record.sourceUrl)! } : {}),
        ...(toTrimmedString(record.githubUrl) ? { githubUrl: toTrimmedString(record.githubUrl)! } : {}),
        ...(toTrimmedString(record.category) ? { category: toTrimmedString(record.category)! } : {}),
        ...(normalizeStringArray(record.styles) ? { styles: normalizeStringArray(record.styles)! } : {}),
        ...(normalizeStringArray(record.scenes) ? { scenes: normalizeStringArray(record.scenes)! } : {}),
        ...(normalizeStringArray(record.tags) ? { tags: normalizeStringArray(record.tags)! } : {}),
      });
      return { success: true, asset };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save creator case asset',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.AssetRevealInFolder, async (_event, input: unknown) => {
    try {
      const assetId = toTrimmedString(input);
      if (!assetId) {
        return { success: false, error: 'assetId is required' };
      }
      const asset = getCreatorAssetStore().getAsset(assetId);
      if (!asset) {
        return { success: false, error: 'Asset not found' };
      }
      if (!fs.existsSync(asset.filePath)) {
        return { success: false, error: 'Asset file not found' };
      }
      shell.showItemInFolder(asset.filePath);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reveal creator asset',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.RecipeCreate, async (_event, input: unknown) => {
    try {
      const record = normalizeRecord(input);
      const projectId = toTrimmedString(record.projectId);
      const title = toTrimmedString(record.title);
      const promptSpec = normalizeObject(record.promptSpec);
      if (!projectId || !title || !promptSpec) {
        return { success: false, error: 'projectId, title, and promptSpec are required' };
      }
      const recipeInput: CreatorRecipeCreateInput = {
        projectId,
        title,
        ...(record.description === null ? { description: null } : toTrimmedString(record.description) ? { description: toTrimmedString(record.description)! } : {}),
        ...(record.sourcePromptAssetId === null ? { sourcePromptAssetId: null } : toTrimmedString(record.sourcePromptAssetId) ? { sourcePromptAssetId: toTrimmedString(record.sourcePromptAssetId)! } : {}),
        promptSpec,
        ...(normalizeObject(record.defaultRuntime) ? { defaultRuntime: normalizeObject(record.defaultRuntime)! } : {}),
        ...(normalizeObject(record.defaultOutput) ? { defaultOutput: normalizeObject(record.defaultOutput)! } : {}),
        ...(normalizeStringArray(record.tags) ? { tags: normalizeStringArray(record.tags)! } : {}),
      };
      return { success: true, recipe: getCreatorAssetStore().createRecipe(recipeInput) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create creator recipe',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.RecipeImport, async (_event, input: unknown) => {
    try {
      const record = normalizeRecord(input);
      const projectId = toTrimmedString(record.projectId);
      const recipe = normalizeObject(record.recipe);
      const title = toTrimmedString(recipe?.title);
      const promptSpec = normalizeObject(recipe?.promptSpec);
      if (!projectId || !recipe || !title || !promptSpec) {
        return { success: false, error: 'projectId and recipe are required' };
      }
      return {
        success: true,
        recipe: getCreatorAssetStore().importRecipe({
          projectId,
          recipe: {
            title,
            ...(recipe.description === null ? { description: null } : toTrimmedString(recipe.description) ? { description: toTrimmedString(recipe.description)! } : {}),
            ...(recipe.sourcePromptAssetId === null ? { sourcePromptAssetId: null } : toTrimmedString(recipe.sourcePromptAssetId) ? { sourcePromptAssetId: toTrimmedString(recipe.sourcePromptAssetId)! } : {}),
            promptSpec,
            ...(normalizeObject(recipe.defaultRuntime) ? { defaultRuntime: normalizeObject(recipe.defaultRuntime)! } : {}),
            ...(normalizeObject(recipe.defaultOutput) ? { defaultOutput: normalizeObject(recipe.defaultOutput)! } : {}),
            ...(normalizeStringArray(recipe.tags) ? { tags: normalizeStringArray(recipe.tags)! } : {}),
          },
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import creator recipe',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.RecipeList, async (_event, input: unknown) => {
    try {
      const record = normalizeRecord(input);
      return {
        success: true,
        ...getCreatorAssetStore().listRecipes({
          ...(toTrimmedString(record.projectId) ? { projectId: toTrimmedString(record.projectId)! } : {}),
          ...(toTrimmedString(record.tag) ? { tag: toTrimmedString(record.tag)! } : {}),
          ...(typeof record.limit === 'number' ? { limit: record.limit } : {}),
          ...(typeof record.offset === 'number' ? { offset: record.offset } : {}),
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list creator recipes',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.PromptVersionCreate, async (_event, input: unknown) => {
    try {
      const record = normalizeRecord(input);
      const promptAssetId = toTrimmedString(record.promptAssetId);
      const promptText = toTrimmedString(record.promptText);
      const promptSpec = normalizeObject(record.promptSpec);
      if (!promptAssetId || !promptText || !promptSpec) {
        return { success: false, error: 'promptAssetId, promptText, and promptSpec are required' };
      }
      return {
        success: true,
        version: getCreatorAssetStore().createPromptVersion({
          promptAssetId,
          promptText,
          promptSpec,
          ...(record.changeNote === null ? { changeNote: null } : toTrimmedString(record.changeNote) ? { changeNote: toTrimmedString(record.changeNote)! } : {}),
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create creator prompt version',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.PromptVersionList, async (_event, input: unknown) => {
    try {
      const record = normalizeRecord(input);
      const promptAssetId = toTrimmedString(record.promptAssetId);
      if (!promptAssetId) {
        return { success: false, error: 'promptAssetId is required' };
      }
      return {
        success: true,
        ...getCreatorAssetStore().listPromptVersions({
          promptAssetId,
          ...(typeof record.limit === 'number' ? { limit: record.limit } : {}),
          ...(typeof record.offset === 'number' ? { offset: record.offset } : {}),
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list creator prompt versions',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.PromptVersionFork, async (_event, input: unknown) => {
    try {
      const record = normalizeRecord(input);
      const promptVersionId = toTrimmedString(record.promptVersionId);
      if (!promptVersionId) {
        return { success: false, error: 'promptVersionId is required' };
      }
      return {
        success: true,
        asset: getCreatorAssetStore().forkPromptVersion({
          promptVersionId,
          ...(toTrimmedString(record.projectId) ? { projectId: toTrimmedString(record.projectId)! } : {}),
          ...(toTrimmedString(record.title) ? { title: toTrimmedString(record.title)! } : {}),
          ...(record.changeNote === null ? { changeNote: null } : toTrimmedString(record.changeNote) ? { changeNote: toTrimmedString(record.changeNote)! } : {}),
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fork creator prompt version',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.PromptVersionDiff, async (_event, input: unknown) => {
    try {
      const record = normalizeRecord(input);
      const fromVersionId = toTrimmedString(record.fromVersionId);
      const toVersionId = toTrimmedString(record.toVersionId);
      if (!fromVersionId || !toVersionId) {
        return { success: false, error: 'fromVersionId and toVersionId are required' };
      }
      return {
        success: true,
        diff: getCreatorAssetStore().diffPromptVersions({ fromVersionId, toVersionId }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to diff creator prompt versions',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.WorkspaceGet, async () => {
    try {
      return { success: true, workspace: getCreatorAssetStore().getWorkspace() };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load creator workspace',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.ProjectCreate, async (_event, input: unknown) => {
    try {
      const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
      const name = toTrimmedString(record.name);
      if (!name) {
        return { success: false, error: 'Project name is required' };
      }
      return {
        success: true,
        workspace: getCreatorAssetStore().createProject({
          name,
          ...(toTrimmedString(record.description) ? { description: toTrimmedString(record.description)! } : {}),
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create creator project',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.ProjectSetCurrent, async (_event, input: unknown) => {
    try {
      const projectId = toTrimmedString(input);
      if (!projectId) {
        return { success: false, error: 'projectId is required' };
      }
      return { success: true, workspace: getCreatorAssetStore().setCurrentProject(projectId) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to switch creator project',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.CollectionCreate, async (_event, input: unknown) => {
    try {
      const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
      const projectId = toTrimmedString(record.projectId);
      const name = toTrimmedString(record.name);
      if (!projectId || !name) {
        return { success: false, error: 'projectId and collection name are required' };
      }
      return {
        success: true,
        workspace: getCreatorAssetStore().createCollection({
          projectId,
          name,
          ...(toTrimmedString(record.description) ? { description: toTrimmedString(record.description)! } : {}),
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create creator collection',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.CollectionAddAsset, async (_event, input: unknown) => {
    try {
      const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
      const assetId = toTrimmedString(record.assetId);
      const collectionId = toTrimmedString(record.collectionId);
      if (!assetId || !collectionId) {
        return { success: false, error: 'assetId and collectionId are required' };
      }
      const asset = getCreatorAssetStore().addAssetToCollection({ assetId, collectionId });
      if (!asset) {
        return { success: false, error: 'Asset or collection not found' };
      }
      return { success: true, asset };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add asset to collection',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BoardWorkspaceGet, async (_event, input: unknown) => {
    try {
      return { success: true, workspace: getCreatorAssetStore().getBoardWorkspace(toTrimmedString(input) ?? undefined) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load creator board',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BoardCreate, async (_event, input: unknown) => {
    try {
      const record = normalizeObject(input) ?? {};
      const projectId = toTrimmedString(record.projectId);
      const name = toTrimmedString(record.name);
      if (!projectId || !name) {
        return { success: false, error: 'projectId and board name are required' };
      }
      return {
        success: true,
        workspace: getCreatorAssetStore().createBoard({
          projectId,
          name,
          ...(toTrimmedString(record.description) ? { description: toTrimmedString(record.description)! } : {}),
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create creator board',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BoardSetCurrent, async (_event, input: unknown) => {
    try {
      const record = normalizeObject(input) ?? {};
      const projectId = toTrimmedString(record.projectId);
      const boardId = toTrimmedString(record.boardId);
      if (!projectId || !boardId) {
        return { success: false, error: 'projectId and boardId are required' };
      }
      return { success: true, workspace: getCreatorAssetStore().setCurrentBoard(projectId, boardId) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to switch creator board',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BoardCardAdd, async (_event, input: unknown) => {
    try {
      const record = normalizeObject(input) ?? {};
      const boardId = toTrimmedString(record.boardId);
      const title = toTrimmedString(record.title);
      if (!boardId || !title || !isCreatorBoardCardKind(record.kind)) {
        return { success: false, error: 'boardId, kind, and title are required' };
      }
      const groupName = record.groupName === null
        ? null
        : typeof record.groupName === 'string'
          ? record.groupName
          : undefined;
      const notes = record.notes === null
        ? null
        : typeof record.notes === 'string'
          ? record.notes
          : undefined;
      const promptSpec = normalizeObject(record.promptSpec);
      const direction = normalizeDirection(record.direction);
      const createInput: CreatorBoardCardCreateInput = {
        boardId,
        kind: record.kind,
        title,
        ...(toTrimmedString(record.assetId) ? { assetId: toTrimmedString(record.assetId)! } : {}),
        ...(toTrimmedString(record.caseId) ? { caseId: toTrimmedString(record.caseId)! } : {}),
        ...(typeof record.promptText === 'string' ? { promptText: record.promptText } : {}),
        ...(promptSpec ? { promptSpec } : {}),
        ...(direction ? { direction } : {}),
        ...(groupName !== undefined ? { groupName } : {}),
        ...(notes !== undefined ? { notes } : {}),
      };
      const card = getCreatorAssetStore().addBoardCard(createInput);
      return { success: true, card };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add creator board card',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BoardCardUpdate, async (_event, input: unknown) => {
    try {
      const record = normalizeObject(input) ?? {};
      const cardId = toTrimmedString(record.cardId);
      if (!cardId) {
        return { success: false, error: 'cardId is required' };
      }
      const groupName = record.groupName === null
        ? null
        : typeof record.groupName === 'string'
          ? record.groupName
          : undefined;
      const notes = record.notes === null
        ? null
        : typeof record.notes === 'string'
          ? record.notes
          : undefined;
      const direction = normalizeDirection(record.direction);
      const updateInput: CreatorBoardCardUpdateInput = {
        cardId,
        ...(typeof record.title === 'string' ? { title: record.title } : {}),
        ...(groupName !== undefined ? { groupName } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(direction ? { direction } : {}),
      };
      const card = getCreatorAssetStore().updateBoardCard(updateInput);
      if (!card) return { success: false, error: 'Card not found' };
      return { success: true, card };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update creator board card',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BoardCardRemove, async (_event, input: unknown) => {
    try {
      const cardId = toTrimmedString(input);
      if (!cardId) return { success: false, error: 'cardId is required' };
      const card = getCreatorAssetStore().removeBoardCard(cardId);
      if (!card) return { success: false, error: 'Card not found' };
      return { success: true, card };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove creator board card',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BoardCardMove, async (_event, input: unknown) => {
    try {
      const record = normalizeObject(input) ?? {};
      const cardId = toTrimmedString(record.cardId);
      if (!cardId || !isCreatorBoardMoveDirection(record.direction)) {
        return { success: false, error: 'cardId and direction are required' };
      }
      const card = getCreatorAssetStore().moveBoardCard({ cardId, direction: record.direction });
      if (!card) return { success: false, error: 'Card not found' };
      return { success: true, card };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to move creator board card',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BoardCardSelect, async (_event, input: unknown) => {
    try {
      const record = normalizeObject(input) ?? {};
      const cardId = toTrimmedString(record.cardId);
      if (!cardId || typeof record.selected !== 'boolean') {
        return { success: false, error: 'cardId and selected are required' };
      }
      const card = getCreatorAssetStore().selectBoardCard({ cardId, selected: record.selected });
      if (!card) return { success: false, error: 'Card not found' };
      return { success: true, card };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to select creator board card',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BoardBuildContextPack, async (_event, input: unknown) => {
    try {
      const record = normalizeObject(input) ?? {};
      const boardId = toTrimmedString(record.boardId);
      if (!boardId) {
        return { success: false, error: 'boardId is required' };
      }
      return {
        success: true,
        contextPack: getCreatorAssetStore().buildBoardContextPack({
          boardId,
          ...(normalizeStringArray(record.cardIds) ? { cardIds: normalizeStringArray(record.cardIds)! } : {}),
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to build creator board context pack',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BrandKitUpdate, async (_event, input: unknown) => {
    try {
      const record = normalizeObject(input) ?? {};
      const projectId = toTrimmedString(record.projectId);
      if (!projectId) {
        return { success: false, error: 'projectId is required' };
      }
      return {
        success: true,
        workspace: getCreatorAssetStore().updateBrandKit({
          projectId,
          ...(normalizeStringArray(record.colors) ? { colors: normalizeStringArray(record.colors)! } : {}),
          ...(record.logoAssetId === null ? { logoAssetId: null } : typeof record.logoAssetId === 'string' ? { logoAssetId: record.logoAssetId } : {}),
          ...(record.logoPath === null ? { logoPath: null } : typeof record.logoPath === 'string' ? { logoPath: record.logoPath } : {}),
          ...(normalizeStringArray(record.bannedWords) ? { bannedWords: normalizeStringArray(record.bannedWords)! } : {}),
          ...(typeof record.tone === 'string' ? { tone: record.tone } : {}),
          ...(typeof record.visualPreferences === 'string' ? { visualPreferences: record.visualPreferences } : {}),
        } satisfies CreatorBrandKitUpdateInput),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update creator brand kit',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.ModelCapabilityList, async () => {
    try {
      return { success: true, capabilities: getCreatorAssetStore().listCreativeModelCapabilities() };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list creative model capabilities',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BatchRunCreate, async (_event, input: unknown) => {
    try {
      const record = normalizeObject(input) ?? {};
      const projectId = toTrimmedString(record.projectId);
      const briefTitle = toTrimmedString(record.briefTitle);
      const promptSpec = normalizeObject(record.promptSpec);
      const promptText = toTrimmedString(record.promptText);
      const directions = normalizeBatchDirections(record.directions);
      const modelIds = normalizeStringArray(record.modelIds) ?? [];
      const templateIds = normalizeStringArray(record.templateIds) ?? [];
      const sizes = normalizeStringArray(record.sizes) ?? [];
      if (!projectId || !briefTitle || !promptSpec || !promptText || directions.length === 0 || modelIds.length === 0) {
        return { success: false, error: 'projectId, briefTitle, promptSpec, promptText, directions, and modelIds are required' };
      }
      return {
        success: true,
        batchRun: getCreatorAssetStore().createBatchRun({
          projectId,
          briefTitle,
          promptSpec,
          promptText,
          directions,
          modelIds,
          templateIds,
          sizes,
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create creator batch run',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BatchRunList, async (_event, input: unknown) => {
    try {
      const record = normalizeObject(input) ?? {};
      const rawLimit = typeof record.limit === 'number' ? record.limit : undefined;
      const rawOffset = typeof record.offset === 'number' ? record.offset : undefined;
      return {
        success: true,
        ...getCreatorAssetStore().listBatchRuns({
          ...(toTrimmedString(record.projectId) ? { projectId: toTrimmedString(record.projectId)! } : {}),
          ...(rawLimit === undefined ? {} : { limit: rawLimit }),
          ...(rawOffset === undefined ? {} : { offset: rawOffset }),
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list creator batch runs',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BatchRunGet, async (_event, input: unknown) => {
    try {
      const batchRunId = toTrimmedString(input);
      if (!batchRunId) {
        return { success: false, error: 'batchRunId is required' };
      }
      const batchRun = getCreatorAssetStore().getBatchRun(batchRunId);
      if (!batchRun) {
        return { success: false, error: 'Batch run not found' };
      }
      return { success: true, batchRun };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get creator batch run',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BatchTaskRetry, async (_event, input: unknown) => {
    try {
      const taskId = toTrimmedString(input);
      if (!taskId) {
        return { success: false, error: 'taskId is required' };
      }
      const batchRun = getCreatorAssetStore().retryBatchTask(taskId);
      if (!batchRun) {
        return { success: false, error: 'Batch task not found' };
      }
      return { success: true, batchRun };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retry creator batch task',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BatchTaskSkip, async (_event, input: unknown) => {
    try {
      const taskId = toTrimmedString(input);
      if (!taskId) {
        return { success: false, error: 'taskId is required' };
      }
      const batchRun = getCreatorAssetStore().skipBatchTask(taskId);
      if (!batchRun) {
        return { success: false, error: 'Batch task not found' };
      }
      return { success: true, batchRun };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to skip creator batch task',
      };
    }
  });

  ipcMain.handle(CreatorStudioIpcChannel.BatchTaskFail, async (_event, input: unknown) => {
    try {
      const record = normalizeObject(input) ?? {};
      const taskId = toTrimmedString(record.taskId);
      const errorMessage = toTrimmedString(record.error);
      if (!taskId || !errorMessage) {
        return { success: false, error: 'taskId and error are required' };
      }
      const batchRun = getCreatorAssetStore().failBatchTask({ taskId, error: errorMessage });
      if (!batchRun) {
        return { success: false, error: 'Batch task not found' };
      }
      return { success: true, batchRun };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark creator batch task failed',
      };
    }
  });
};

export type CreatorStudioIpcListAssetsResult = CreatorStudioIpcResponse<ReturnType<CreatorAssetStore['listAssets']>>;
