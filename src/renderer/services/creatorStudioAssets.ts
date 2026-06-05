import type {
  CreatorAssetCollectionAddInput,
  CreatorAssetCollectionCreateInput,
  CreatorAssetUpdateInput,
  CreatorCaseAssetCreateInput,
  CreatorProductionAssetListInput,
  CreatorProductionAssetListResult,
  CreatorProductionAssetRecord,
  CreatorProductionAssetSourceLookup,
  CreatorProjectCreateInput,
  CreatorPromptAssetCreateInput,
  CreatorWorkspaceSnapshot,
} from '@shared/creatorStudio/types';

class CreatorStudioAssetService {
  async listAssets(input: CreatorProductionAssetListInput = {}): Promise<CreatorProductionAssetListResult> {
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

  async updateAsset(input: CreatorAssetUpdateInput): Promise<CreatorProductionAssetRecord | null> {
    const result = await window.electron.creatorStudio.updateAsset(input);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update creator asset');
    }
    return result.asset ?? null;
  }

  async createPromptAsset(input: CreatorPromptAssetCreateInput): Promise<CreatorProductionAssetRecord | null> {
    const result = await window.electron.creatorStudio.createPromptAsset(input);
    if (!result.success) {
      throw new Error(result.error || 'Failed to save creator prompt asset');
    }
    return result.asset ?? null;
  }

  async createCaseAsset(input: CreatorCaseAssetCreateInput): Promise<CreatorProductionAssetRecord | null> {
    const result = await window.electron.creatorStudio.createCaseAsset(input);
    if (!result.success) {
      throw new Error(result.error || 'Failed to save creator case asset');
    }
    return result.asset ?? null;
  }

  async revealAssetInFolder(assetId: string): Promise<void> {
    const result = await window.electron.creatorStudio.revealAssetInFolder(assetId);
    if (!result.success) {
      throw new Error(result.error || 'Failed to reveal creator asset');
    }
  }

  async getWorkspace(): Promise<CreatorWorkspaceSnapshot> {
    const result = await window.electron.creatorStudio.getWorkspace();
    if (!result.success || !result.workspace) {
      throw new Error(result.error || 'Failed to load creator workspace');
    }
    return result.workspace;
  }

  async createProject(input: CreatorProjectCreateInput): Promise<CreatorWorkspaceSnapshot> {
    const result = await window.electron.creatorStudio.createProject(input);
    if (!result.success || !result.workspace) {
      throw new Error(result.error || 'Failed to create creator project');
    }
    return result.workspace;
  }

  async setCurrentProject(projectId: string): Promise<CreatorWorkspaceSnapshot> {
    const result = await window.electron.creatorStudio.setCurrentProject(projectId);
    if (!result.success || !result.workspace) {
      throw new Error(result.error || 'Failed to switch creator project');
    }
    return result.workspace;
  }

  async createCollection(input: CreatorAssetCollectionCreateInput): Promise<CreatorWorkspaceSnapshot> {
    const result = await window.electron.creatorStudio.createCollection(input);
    if (!result.success || !result.workspace) {
      throw new Error(result.error || 'Failed to create creator collection');
    }
    return result.workspace;
  }

  async addAssetToCollection(input: CreatorAssetCollectionAddInput): Promise<CreatorProductionAssetRecord | null> {
    const result = await window.electron.creatorStudio.addAssetToCollection(input);
    if (!result.success) {
      throw new Error(result.error || 'Failed to add asset to collection');
    }
    return result.asset ?? null;
  }
}

export const creatorStudioAssetService = new CreatorStudioAssetService();
