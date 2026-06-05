import type { IpcMain } from 'electron';
import { beforeEach, expect, test, vi } from 'vitest';

import { CreatorStudioAssetListMaxLimit, CreatorStudioIpcChannel } from '../../../shared/creatorStudio/constants';
import type { CreatorAssetStore } from '../../creatorAssetStore';
import { registerCreatorStudioIpcHandlers } from './handlers';

vi.mock('electron', () => ({
  shell: {
    showItemInFolder: vi.fn(),
  },
}));

type RegisteredHandler = (_event: unknown, input?: unknown) => Promise<unknown> | unknown;

const handlers = new Map<string, RegisteredHandler>();

const ipcMain = {
  handle: vi.fn((channel: string, handler: RegisteredHandler) => {
    handlers.set(channel, handler);
  }),
} as unknown as IpcMain;

const createStore = () => ({
  listAssets: vi.fn(() => ({ assets: [], total: 0, limit: 0, offset: 0 })),
  getAsset: vi.fn(),
  getAssetSource: vi.fn(),
  setFavorite: vi.fn(),
  updateAsset: vi.fn(),
  createPromptAsset: vi.fn(),
  createCaseAsset: vi.fn(),
  getWorkspace: vi.fn(() => ({ currentProjectId: 'project-1', projects: [], collections: [] })),
  createProject: vi.fn(() => ({ currentProjectId: 'project-2', projects: [], collections: [] })),
  setCurrentProject: vi.fn(() => ({ currentProjectId: 'project-1', projects: [], collections: [] })),
  createCollection: vi.fn(() => ({ currentProjectId: 'project-1', projects: [], collections: [] })),
  addAssetToCollection: vi.fn(),
}) as unknown as CreatorAssetStore;

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
});

test('registers creator studio asset IPC handlers with constant channels', () => {
  registerCreatorStudioIpcHandlers(ipcMain, createStore);

  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.AssetList, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.AssetGetSource, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.AssetSetFavorite, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.AssetUpdate, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.AssetCreatePrompt, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.AssetCreateCase, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.AssetRevealInFolder, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.WorkspaceGet, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.ProjectCreate, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.ProjectSetCurrent, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.CollectionCreate, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.CollectionAddAsset, expect.any(Function));
});

test('clamps asset list parameters before reaching the store', async () => {
  const store = createStore();
  registerCreatorStudioIpcHandlers(ipcMain, () => store);

  const handler = handlers.get(CreatorStudioIpcChannel.AssetList);
  expect(handler).toBeDefined();
  await handler?.(null, { limit: 9999, offset: -12 });

  expect(store.listAssets).toHaveBeenCalledWith({
    limit: CreatorStudioAssetListMaxLimit,
    offset: 0,
  });
});

test('rejects asset reveal requests without an asset id', async () => {
  registerCreatorStudioIpcHandlers(ipcMain, createStore);

  const handler = handlers.get(CreatorStudioIpcChannel.AssetRevealInFolder);
  expect(handler).toBeDefined();
  const result = await handler?.(null, { filePath: '/tmp/generated.png' });

  expect(result).toEqual({ success: false, error: 'assetId is required' });
});
