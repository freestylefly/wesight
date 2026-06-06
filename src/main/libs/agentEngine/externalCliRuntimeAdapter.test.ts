import { describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    isPackaged: false,
  },
}));

import {
  CoworkAgentEngine,
  ExternalAgentConfigSource,
} from '../../../shared/cowork/constants';
import type { CoworkMessage, CoworkStore } from '../../coworkStore';
import type { ExternalAgentProvider } from '../externalAgentProviderStore';
import {
  appendNodeRequireOption,
  ExternalCliRuntimeAdapter,
} from './externalCliRuntimeAdapter';

const codexProvider: ExternalAgentProvider = {
  id: 'ccswitch-tokln',
  appType: 'codex',
  name: 'tokln.com',
  settingsConfig: {
    auth: {
      OPENAI_API_KEY: 'sk-test-provider-key',
    },
    config: [
      'model_provider = "custom"',
      'model = "gpt-5.4"',
      '',
      '[model_providers.custom]',
      'name = "custom"',
      'base_url = "https://api.tokln.com/v1"',
      'wire_api = "responses"',
      'requires_openai_auth = true',
      '',
    ].join('\n'),
  },
  category: 'cc-switch',
  isCurrent: true,
  createdAt: 1,
  updatedAt: 2,
  summary: {
    apiKey: 'sk-test-provider-key',
    baseUrl: 'https://api.tokln.com/v1',
    model: 'gpt-5.5',
  },
};

const createStore = (codexConfigSource = ExternalAgentConfigSource.LocalCli) => {
  const messages: CoworkMessage[] = [];
  const store = {
    getConfig: () => ({
      codexConfigSource,
    }),
    getSession: () => ({
      id: 'session-1',
      messages,
      status: 'running',
    }),
    updateSession: () => undefined,
    addMessage: (_sessionId: string, input: Omit<CoworkMessage, 'id' | 'timestamp'>) => {
      const message = {
        ...input,
        id: `message-${messages.length + 1}`,
        timestamp: Date.now(),
      } as CoworkMessage;
      messages.push(message);
      return message;
    },
    updateMessage: (_sessionId: string, messageId: string, patch: Partial<CoworkMessage>) => {
      const index = messages.findIndex((message) => message.id === messageId);
      if (index >= 0) {
        messages[index] = { ...messages[index], ...patch };
      }
    },
  } as unknown as CoworkStore;

  return { store, messages };
};

describe('appendNodeRequireOption', () => {
  test('escapes preload paths for NODE_OPTIONS without losing backslashes', () => {
    const scriptPath = 'C:\\Users\\Test User\\AppData\\Local\\Temp\\wesight "dev"\\external_cli_windows_hide_init.cjs';
    const nodeOptions = appendNodeRequireOption('--max-old-space-size=4096', scriptPath);

    expect(nodeOptions).toBe(
      '--max-old-space-size=4096 --require="C:\\\\Users\\\\Test User\\\\AppData\\\\Local\\\\Temp\\\\wesight \\"dev\\"\\\\external_cli_windows_hide_init.cjs"',
    );
  });

  test('does not append the same preload twice', () => {
    const scriptPath = 'C:\\Temp\\wesight-cowork-bin\\external_cli_windows_hide_init.cjs';
    const nodeOptions = appendNodeRequireOption(undefined, scriptPath);

    expect(appendNodeRequireOption(nodeOptions, scriptPath)).toBe(nodeOptions);
  });
});

describe('ExternalCliRuntimeAdapter Codex local config', () => {
  test('uses the selected Codex provider when running with local CLI config', () => {
    const { store } = createStore();
    const adapter = new ExternalCliRuntimeAdapter({
      engine: CoworkAgentEngine.Codex,
      store,
      getCurrentProvider: () => codexProvider,
    });
    const env: Record<string, string | undefined> = {};
    const internals = adapter as unknown as {
      getSelectedProviderForLocalCli: () => ExternalAgentProvider | null;
      prepareCodexHomeForExecMode: (
        env: Record<string, string | undefined>,
        provider: ExternalAgentProvider | null,
      ) => string | null;
      cleanupCodexHomeDir: (codexHomeDir: string | null) => void;
      buildCommandArgs: (
        cwd: string,
        prompt: string,
        imagePaths: string[],
        selectedProvider: ExternalAgentProvider | null,
        sessionTitle: string,
        cliSessionId: string | null,
      ) => string[];
    };

    const selectedProvider = internals.getSelectedProviderForLocalCli();
    expect(selectedProvider).toBe(codexProvider);
    const codexHomeDir = internals.prepareCodexHomeForExecMode(env, selectedProvider);
    expect(codexHomeDir).toBeTruthy();
    expect(env.CODEX_HOME).toBe(codexHomeDir);
    expect(env.OPENAI_API_KEY).toBe('sk-test-provider-key');

    const args = internals.buildCommandArgs(
      'D:\\LHA\\wesight',
      'hello',
      [],
      selectedProvider,
      'session',
      null,
    );

    expect(args).toContain('exec');
    expect(args).toContain('--json');
    expect(args).not.toContain('model_provider="ccswitch_tokln"');
    expect(args).not.toContain('model="gpt-5.5"');
    internals.cleanupCodexHomeDir(codexHomeDir);
  });

  test('builds a Codex runtime config for WeSight model routing', () => {
    const { store } = createStore(ExternalAgentConfigSource.WesightModel);
    const adapter = new ExternalCliRuntimeAdapter({
      engine: CoworkAgentEngine.Codex,
      store,
    });
    const internals = adapter as unknown as {
      buildCodexRuntimeConfig: (providerName: string, baseUrl: string, model: string) => string;
    };

    const config = internals.buildCodexRuntimeConfig(
      'deepseek',
      'https://api.deepseek.com',
      'deepseek-v4-flash',
    );
    expect(config).toContain('model_provider = "deepseek"');
    expect(config).toContain('model = "deepseek-v4-flash"');
    expect(config).toContain('base_url = "https://api.deepseek.com"');
    expect(config).toContain('wire_api = "responses"');
    expect(config).toContain('requires_openai_auth = true');
  });

  test('extracts assistant text from Codex CLI 0.136 JSONL events', () => {
    const { store, messages } = createStore();
    const adapter = new ExternalCliRuntimeAdapter({
      engine: CoworkAgentEngine.Codex,
      store,
    });
    const internals = adapter as unknown as {
      handleCodexEvent: (active: {
        sessionId: string;
        cliSessionId: string | null;
        assistantMessageId: string | null;
        assistantContent: string;
        initialMessageCount: number;
        codexGeneratedImageIds: Set<string>;
      }, event: unknown) => void;
    };
    const active = {
      sessionId: 'session-1',
      cliSessionId: null,
      assistantMessageId: null,
      assistantContent: '',
      initialMessageCount: 0,
      codexGeneratedImageIds: new Set<string>(),
    };

    internals.handleCodexEvent(active, {
      type: 'thread.started',
      thread_id: '019e91b4-dedf-7653-987d-4177cab868a8',
    });
    internals.handleCodexEvent(active, {
      type: 'item.completed',
      item: {
        id: 'item_0',
        type: 'agent_message',
        text: '我是 GPT-5 驱动的 Codex 编程助手。',
      },
    });

    expect(active.cliSessionId).toBe('019e91b4-dedf-7653-987d-4177cab868a8');
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('assistant');
    expect(messages[0].content).toBe('我是 GPT-5 驱动的 Codex 编程助手。');
    expect(messages[0].metadata).toEqual({ isStreaming: false, isFinal: true });
  });

  test('redacts Claude Code stream text from log summaries', () => {
    const { store } = createStore();
    const adapter = new ExternalCliRuntimeAdapter({
      engine: CoworkAgentEngine.ClaudeCode,
      store,
    });
    const internals = adapter as unknown as {
      summarizeClaudeCliEvent: (event: Record<string, unknown>) => Record<string, unknown>;
    };

    const summary = internals.summarizeClaudeCliEvent({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: 'private assistant response text',
        },
      },
    });

    expect(JSON.stringify(summary)).not.toContain('private assistant response text');
    expect(summary).toMatchObject({
      type: 'stream_event',
      streamType: 'content_block_delta',
      deltaType: 'text_delta',
      textChars: 31,
    });
  });

  test('does not log every Claude Code stream event', () => {
    const { store } = createStore();
    const adapter = new ExternalCliRuntimeAdapter({
      engine: CoworkAgentEngine.ClaudeCode,
      store,
    });
    const internals = adapter as unknown as {
      handleClaudeCliEvent: (active: {
        sessionId: string;
        cliSessionId: string | null;
        assistantMessageId: string | null;
        assistantContent: string;
        initialMessageCount: number;
      }, event: unknown) => void;
    };
    const active = {
      sessionId: 'session-1',
      cliSessionId: null,
      assistantMessageId: null,
      assistantContent: '',
      initialMessageCount: 0,
    };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      internals.handleClaudeCliEvent(active, {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: 'streamed text',
          },
        },
      });

      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });
});
