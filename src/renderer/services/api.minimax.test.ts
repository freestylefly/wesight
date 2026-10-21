import { afterEach, expect, test, vi } from 'vitest';

import { defaultConfig } from '../config';

const state = vi.hoisted(() => ({ config: {} as typeof defaultConfig, selected: {} }));
vi.mock('../store', () => ({ store: { getState: () => ({ model: { selectedModel: state.selected } }) } }));
vi.mock('./config', () => ({ configService: { getConfig: () => state.config } }));
vi.mock('./i18n', () => ({ i18nService: { t: (key: string) => key } }));

import { apiService } from './api';

afterEach(() => vi.unstubAllGlobals());

test.each(['minimaxi.com', 'minimax.io'])('chat serializes default and explicitly selected models on %s', async (host) => {
  for (const apiFormat of ['anthropic', 'openai'] as const) {
    for (const modelId of [undefined, 'MiniMax-M3', 'MiniMax-M2.7', 'custom-model']) {
      state.config = structuredClone(defaultConfig);
      const provider = state.config.providers!.minimax;
      provider.enabled = true;
      provider.apiKey = 'offline-test-key';
      provider.apiFormat = apiFormat;
      provider.baseUrl = `https://api.${host}/${apiFormat === 'anthropic' ? 'anthropic' : 'v1'}`;
      state.selected = { ...provider.models![0], ...(modelId ? { id: modelId } : {}), providerKey: 'minimax' };
      apiService.setConfig({ apiKey: provider.apiKey, baseUrl: provider.baseUrl, apiFormat });
      let onData: (chunk: string) => void;
      let onDone: () => void;
      const stream = vi.fn(async (request: { url: string; body: string; headers: Record<string, string> }) => {
        const body = JSON.parse(request.body);
        expect(body.model).toBe(modelId ?? 'MiniMax-M3.1-Flash');
        expect(request.url).toBe(`${provider.baseUrl}/${apiFormat === 'anthropic' ? 'v1/messages' : 'chat/completions'}`);
        expect(body.thinking).toBeUndefined();
        expect(body.reasoning_effort).toBeUndefined();
        expect(body.output_config).toBeUndefined();
        expect(body.service_tier).toBeUndefined();
        expect(body.messages.map((item: { role: string }) => item.role)).toEqual(['user', 'assistant', 'user']);
        expect(JSON.stringify(body.messages)).toContain('previous answer');
        expect(JSON.stringify(body.messages)).toContain('follow up');
        expect(request.headers).toMatchObject(apiFormat === 'anthropic'
          ? { 'x-api-key': 'offline-test-key' }
          : { Authorization: 'Bearer offline-test-key' });
        queueMicrotask(() => {
          onData(`data: ${JSON.stringify(apiFormat === 'anthropic'
            ? { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } }
            : { choices: [{ delta: { content: 'ok' } }] })}\n`);
          onDone();
        });
        return { ok: true };
      });
      vi.stubGlobal('window', { electron: { api: {
        onStreamData: (_id: string, callback: typeof onData) => { onData = callback; return () => {}; },
        onStreamDone: (_id: string, callback: typeof onDone) => { onDone = callback; return () => {}; },
        onStreamError: () => () => {}, onStreamAbort: () => () => {}, cancelStream: vi.fn(), stream,
      } } });
      expect(await apiService.chat('follow up', undefined, [
        { role: 'user', content: 'previous question' },
        { role: 'assistant', content: 'previous answer' },
      ])).toMatchObject({ content: 'ok' });
      expect(stream).toHaveBeenCalledTimes(1);
    }
  }
});
