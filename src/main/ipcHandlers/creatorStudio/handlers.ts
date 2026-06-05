import type { IpcMain } from 'electron';
import { shell } from 'electron';
import fs from 'fs';

import {
  CreatorStudioAssetListDefaultLimit,
  CreatorStudioAssetListMaxLimit,
  CreatorStudioIpcChannel,
  isCreatorAssetAdoptionStatus,
  isCreatorProductionAssetSource,
} from '../../../shared/creatorStudio/constants';
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
      const asset = getCreatorAssetStore().updateAsset({
        assetId,
        ...(toTrimmedString(record.projectId) ? { projectId: toTrimmedString(record.projectId)! } : {}),
        ...(typeof record.favorite === 'boolean' ? { favorite: record.favorite } : {}),
        ...(isCreatorAssetAdoptionStatus(record.adoptionStatus) ? { adoptionStatus: record.adoptionStatus } : {}),
        ...(normalizeStringArray(record.tags) ? { tags: normalizeStringArray(record.tags)! } : {}),
        ...(record.licenseNote === null || typeof record.licenseNote === 'string' ? { licenseNote: record.licenseNote } : {}),
        ...(record.usageNote === null || typeof record.usageNote === 'string' ? { usageNote: record.usageNote } : {}),
        ...(typeof record.selected === 'boolean' ? { selected: record.selected } : {}),
      });
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
      });
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
};

export type CreatorStudioIpcListAssetsResult = CreatorStudioIpcResponse<ReturnType<CreatorAssetStore['listAssets']>>;
