import type { IpcMain } from 'electron';
import { shell } from 'electron';
import fs from 'fs';

import {
  CreatorStudioAssetListDefaultLimit,
  CreatorStudioAssetListMaxLimit,
  CreatorStudioIpcChannel,
} from '../../../shared/creatorStudio/constants';
import type { CreatorAssetStore } from '../../creatorAssetStore';

type CreatorStudioIpcResponse<T> = {
  success: boolean;
  error?: string;
} & T;

const toTrimmedString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const normalizeListInput = (input: unknown): { limit: number; offset: number } => {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const rawLimit = typeof record.limit === 'number' ? record.limit : CreatorStudioAssetListDefaultLimit;
  const rawOffset = typeof record.offset === 'number' ? record.offset : 0;
  return {
    limit: Math.max(1, Math.min(Math.floor(rawLimit), CreatorStudioAssetListMaxLimit)),
    offset: Math.max(0, Math.floor(rawOffset)),
  };
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
};

export type CreatorStudioIpcListAssetsResult = CreatorStudioIpcResponse<ReturnType<CreatorAssetStore['listAssets']>>;
