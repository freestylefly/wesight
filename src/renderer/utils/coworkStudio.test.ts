import { ClaudeCodePermissionMode, CoworkAgentEngine, ExternalAgentConfigSource } from '@shared/cowork/constants';
import {
  type CoworkFileActivity,
  CoworkFileActivitySource,
  CoworkFileActivityStatus,
} from '@shared/cowork/fileActivity';
import { describe, expect, test } from 'vitest';

import { CoworkStudioState } from '../components/cowork/studioConstants';
import type { CoworkConfig, CoworkSession } from '../types/cowork';
import {
  ActivityItemStatus,
  type CoworkActivitySnapshot,
} from './coworkActivity';
import { buildCoworkStudioSnapshot, getCoworkStudioAvatar } from './coworkStudio';

const makeSession = (status: CoworkSession['status'] = 'running'): CoworkSession => ({
  id: 'session-1',
  title: 'Studio test',
  claudeSessionId: null,
  status,
  pinned: false,
  cwd: '/tmp/project',
  systemPrompt: '',
  executionMode: 'local',
  activeSkillIds: [],
  agentId: 'main',
  createdAt: 1,
  updatedAt: 1,
  messages: [
    {
      id: 'user-1',
      type: 'user',
      content: 'build',
      timestamp: 10,
    },
  ],
});

const makeConfig = (agentEngine: CoworkAgentEngine): CoworkConfig => ({
  workingDirectory: '/tmp/project',
  systemPrompt: '',
  executionMode: 'local',
  agentEngine,
  openclawConfigSource: ExternalAgentConfigSource.LocalCli,
  claudeCodeConfigSource: ExternalAgentConfigSource.WesightModel,
  claudeCodePermissionMode: ClaudeCodePermissionMode.BypassPermissions,
  codexConfigSource: ExternalAgentConfigSource.LocalCli,
  hermesConfigSource: ExternalAgentConfigSource.WesightModel,
  opencodeConfigSource: ExternalAgentConfigSource.WesightModel,
  opencodePermissionMode: 'auto',
  qwenCodeConfigSource: ExternalAgentConfigSource.WesightModel,
  qwenCodePermissionMode: 'auto',
  deepseekTuiConfigSource: ExternalAgentConfigSource.WesightModel,
  deepseekTuiPermissionMode: 'auto',
  memoryEnabled: true,
  memoryImplicitUpdateEnabled: true,
  memoryLlmJudgeEnabled: false,
  memoryGuardLevel: 'strict',
  memoryUserMemoriesMaxItems: 12,
});

const makeActivity = (toolName?: string, summary?: string): CoworkActivitySnapshot => ({
  todos: [],
  skills: [],
  fileChanges: [],
  artifacts: [],
  activeTool: toolName
    ? {
      id: 'tool-1',
      toolName,
      summary: summary ?? null,
      status: ActivityItemStatus.Running,
      timestamp: 11,
      filePath: null,
      skillName: null,
    }
    : null,
  toolTimeline: [],
});

const buildSnapshot = (input: {
  session?: CoworkSession;
  activitySnapshot?: CoworkActivitySnapshot;
  liveFileActivities?: CoworkFileActivity[];
  config?: CoworkConfig;
}) => buildCoworkStudioSnapshot({
  session: input.session ?? makeSession(),
  activitySnapshot: input.activitySnapshot ?? makeActivity(),
  liveFileActivities: input.liveFileActivities ?? [],
  runtimeCall: null,
  config: input.config ?? makeConfig(CoworkAgentEngine.ClaudeCode),
  selectedModel: { id: 'glm-5.1', name: 'GLM 5.1' },
  engineLabel: 'Claude Code',
  configSourceLocalCliLabel: 'Local CLI',
  configSourceWesightLabel: 'WeSight',
  idleDetail: 'idle',
  runningDetail: 'running',
  writingDetail: 'writing',
  researchingDetail: 'researching',
  executingDetail: 'executing',
  syncingDetail: 'syncing',
  errorDetail: 'error',
});

describe('getCoworkStudioAvatar', () => {
  test('resolves every agent engine to a stable avatar', () => {
    Object.values(CoworkAgentEngine).forEach((engine) => {
      const avatar = getCoworkStudioAvatar(engine);
      expect(avatar.id).toBeTruthy();
      expect(avatar.nameTag).toBeTruthy();
    });
  });
});

describe('buildCoworkStudioSnapshot', () => {
  test('shows the active engine avatar and labels', () => {
    const snapshot = buildSnapshot({
      config: makeConfig(CoworkAgentEngine.Codex),
    });

    expect(snapshot.engine).toBe(CoworkAgentEngine.Codex);
    expect(snapshot.avatar.id).toBe('codex');
    expect(snapshot.modelLabel).toBe('GLM 5.1');
    expect(snapshot.configSourceLabel).toBe('Local CLI');
  });

  test('maps write activity to writing state', () => {
    const snapshot = buildSnapshot({
      activitySnapshot: makeActivity('Edit'),
    });

    expect(snapshot.state).toBe(CoworkStudioState.Writing);
  });

  test('fresh file activity overrides generic running state', () => {
    const snapshot = buildSnapshot({
      liveFileActivities: [
        {
          sessionId: 'session-1',
          filePath: '/tmp/project/app.ts',
          relativePath: 'app.ts',
          content: 'const app = true;',
          language: 'ts',
          status: CoworkFileActivityStatus.Modified,
          source: CoworkFileActivitySource.Watcher,
          timestamp: 12,
          truncated: false,
        },
      ],
    });

    expect(snapshot.state).toBe(CoworkStudioState.Writing);
  });

  test('maps shell sync commands to syncing state', () => {
    const snapshot = buildSnapshot({
      activitySnapshot: makeActivity('Bash', 'git push origin main'),
    });

    expect(snapshot.state).toBe(CoworkStudioState.Syncing);
  });

  test('maps errored sessions to error state', () => {
    const snapshot = buildSnapshot({
      session: makeSession('error'),
    });

    expect(snapshot.state).toBe(CoworkStudioState.Error);
  });
});
