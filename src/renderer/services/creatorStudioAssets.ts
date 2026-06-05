import type {
  CreatorProductionAssetListResult,
  CreatorProductionAssetRecord,
  CreatorProductionAssetSourceLookup,
} from '@shared/creatorStudio/types';

class CreatorStudioAssetService {
  async listAssets(input: { limit?: number; offset?: number } = {}): Promise<CreatorProductionAssetListResult> {
    const result = await window.electron.creatorStudio.listAssets(input);
    if (!result.success) {
      throw new Error(result.error || 'Failed to list creator assets');
    }
    return {
      assets: result.assets ?? [],
      total: result.total ?? 0,
    };
  }

  async getAssetSource(assetId: string): Promise<CreatorProductionAssetSourceLookup | null> {
    const result = await window.electron.creatorStudio.getAssetSource(assetId);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get creator asset source');
    }
    return result.source ?? null;
  }

  async setFavorite(assetId: string, favorite: boolean): Promise<CreatorProductionAssetRecord | null> {
    const result = await window.electron.creatorStudio.setAssetFavorite({ assetId, favorite });
    if (!result.success) {
      throw new Error(result.error || 'Failed to update creator asset');
    }
    return result.asset ?? null;
  }

  async revealAssetInFolder(assetId: string): Promise<void> {
    const result = await window.electron.creatorStudio.revealAssetInFolder(assetId);
    if (!result.success) {
      throw new Error(result.error || 'Failed to reveal creator asset');
    }
  }
}

export const creatorStudioAssetService = new CreatorStudioAssetService();
