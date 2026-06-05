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
  getBoardWorkspace: vi.fn(() => ({ projectId: 'project-1', currentBoardId: 'board-1', boards: [], cards: [], selectedCardIds: [], brandKit: null })),
  createBoard: vi.fn(() => ({ projectId: 'project-1', currentBoardId: 'board-2', boards: [], cards: [], selectedCardIds: [], brandKit: null })),
  setCurrentBoard: vi.fn(() => ({ projectId: 'project-1', currentBoardId: 'board-1', boards: [], cards: [], selectedCardIds: [], brandKit: null })),
  addBoardCard: vi.fn(),
  updateBoardCard: vi.fn(),
  removeBoardCard: vi.fn(),
  moveBoardCard: vi.fn(),
  selectBoardCard: vi.fn(),
  buildBoardContextPack: vi.fn(() => ({ boardId: 'board-1', cardIds: [], contextPack: '' })),
  updateBrandKit: vi.fn(() => ({ projectId: 'project-1', currentBoardId: 'board-1', boards: [], cards: [], selectedCardIds: [], brandKit: null })),
  listCreativeModelCapabilities: vi.fn(() => []),
  createBatchRun: vi.fn(() => ({ id: 'batch-1', projectId: 'project-1', tasks: [] })),
  listBatchRuns: vi.fn(() => ({ runs: [], total: 0 })),
  getBatchRun: vi.fn(() => ({ id: 'batch-1', projectId: 'project-1', tasks: [] })),
  retryBatchTask: vi.fn(() => ({ id: 'batch-1', projectId: 'project-1', tasks: [] })),
  skipBatchTask: vi.fn(() => ({ id: 'batch-1', projectId: 'project-1', tasks: [] })),
  failBatchTask: vi.fn(() => ({ id: 'batch-1', projectId: 'project-1', tasks: [] })),
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
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BoardWorkspaceGet, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BoardCreate, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BoardSetCurrent, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BoardCardAdd, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BoardCardUpdate, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BoardCardRemove, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BoardCardMove, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BoardCardSelect, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BoardBuildContextPack, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BrandKitUpdate, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.ModelCapabilityList, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BatchRunCreate, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BatchRunList, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BatchRunGet, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BatchTaskRetry, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BatchTaskSkip, expect.any(Function));
  expect(ipcMain.handle).toHaveBeenCalledWith(CreatorStudioIpcChannel.BatchTaskFail, expect.any(Function));
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

test('normalizes creator batch run creation before reaching the store', async () => {
  const store = createStore();
  registerCreatorStudioIpcHandlers(ipcMain, () => store);

  const handler = handlers.get(CreatorStudioIpcChannel.BatchRunCreate);
  expect(handler).toBeDefined();
  const result = await handler?.(null, {
    projectId: ' project-1 ',
    briefTitle: ' Launch ',
    promptSpec: { sourceTitle: 'Launch' },
    promptText: ' Generate a launch visual. ',
    directions: [{
      id: ' route-a ',
      title: ' Route A ',
      promptText: ' Generate route A. ',
      promptSpec: { sourceTitle: 'Route A' },
    }],
    modelIds: ['seedream-image'],
    templateIds: ['poster-system'],
    sizes: ['1:1'],
  });

  expect(result).toMatchObject({ success: true });
  expect(store.createBatchRun).toHaveBeenCalledWith({
    projectId: 'project-1',
    briefTitle: 'Launch',
    promptSpec: { sourceTitle: 'Launch' },
    promptText: 'Generate a launch visual.',
    directions: [{
      id: 'route-a',
      title: 'Route A',
      template: '',
      style: '',
      reason: '',
      promptFocus: '',
      promptText: 'Generate route A.',
      promptSpec: { sourceTitle: 'Route A' },
    }],
    modelIds: ['seedream-image'],
    templateIds: ['poster-system'],
    sizes: ['1:1'],
  });
});

test('rejects invalid creator batch fail requests', async () => {
  registerCreatorStudioIpcHandlers(ipcMain, createStore);

  const handler = handlers.get(CreatorStudioIpcChannel.BatchTaskFail);
  expect(handler).toBeDefined();
  const result = await handler?.(null, { taskId: 'task-1' });

  expect(result).toEqual({ success: false, error: 'taskId and error are required' });
});
