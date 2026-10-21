import { afterEach, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({ resolution: {} as Record<string, unknown> }));
vi.mock('./claudeSettings', () => ({
  resolveCurrentApiConfig: () => state.resolution,
  resolveRawApiConfig: () => state.resolution,
}));
vi.mock('./coworkLogger', () => ({ coworkLog: vi.fn() }));
vi.mock('./pythonRuntime', () => ({}));
vi.mock('./systemProxy', () => ({}));
vi.mock('./wesightSharedRuntime', () => ({}));

import { generateSessionTitle, probeCoworkModelReadiness } from './coworkUtil';

afterEach(() => vi.unstubAllGlobals());

test.each(['minimaxi.com', 'minimax.io'])('Flash title and readiness serialize compatible HTTP bodies for %s', async (host) => {
  for (const apiType of ['anthropic', 'openai']) {
    const baseURL = `https://api.${host}/${apiType === 'anthropic' ? 'anthropic' : 'v1'}`;
    state.resolution = {
      config: { model: 'MiniMax-M3.1-Flash', apiKey: 'offline-test-key', baseURL, apiType },
      providerMetadata: { providerName: 'minimax' },
    };
    const fetchMock = vi.fn(async () => Response.json(apiType === 'anthropic'
      ? { content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: 'Project plan' }] }
      : { choices: [{ message: { reasoning_content: 'hidden', content: 'Project plan' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await generateSessionTitle('Help me plan the project')).toBe('Project plan');
    expect(await probeCoworkModelReadiness()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const args of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(args[0]).toBe(`${baseURL}/${apiType === 'anthropic' ? 'v1/messages' : 'chat/completions'}`);
      const body = JSON.parse(args[1].body as string);
      expect(body.model).toBe('MiniMax-M3.1-Flash');
      expect(body.max_tokens).toBe(4096);
      expect(body.thinking).toBeUndefined();
      expect(body.service_tier).toBeUndefined();
      expect(apiType === 'anthropic' ? body.output_config : body.reasoning_effort)
        .toEqual(apiType === 'anthropic' ? { effort: 'low' } : 'low');
      expect(args[1].headers).toMatchObject(apiType === 'anthropic'
        ? { 'x-api-key': 'offline-test-key' }
        : { Authorization: 'Bearer offline-test-key' });
    }
  }
});

test.each(['MiniMax-M3', 'MiniMax-M2.7', 'my-custom-model'])('saved MiniMax %s keeps its request and existing title policy', async (model) => {
  state.resolution = {
    config: { model, apiKey: 'offline-test-key', baseURL: 'https://api.minimaxi.com/anthropic', apiType: 'anthropic' },
    providerMetadata: { providerName: 'minimax' },
  };
  const fetchMock = vi.fn(async () => Response.json({ content: [{ type: 'text', text: 'Project plan' }] }));
  vi.stubGlobal('fetch', fetchMock);
  await generateSessionTitle('Plan project');
  const [, options] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0];
  expect(JSON.parse(options.body as string)).toMatchObject({ model, thinking: { type: 'disabled' } });
  expect(JSON.parse(options.body as string).output_config).toBeUndefined();
});

test('a custom provider using the same model ID is not given MiniMax parameters', async () => {
  state.resolution = {
    config: { model: 'MiniMax-M3.1-Flash', apiKey: 'offline-test-key', baseURL: 'https://custom.example/anthropic', apiType: 'anthropic' },
    providerMetadata: { providerName: 'custom_example' },
  };
  const fetchMock = vi.fn(async () => Response.json({ content: [{ type: 'text', text: 'Project plan' }] }));
  vi.stubGlobal('fetch', fetchMock);
  await generateSessionTitle('Plan project');
  const [, options] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0];
  const body = JSON.parse(options.body as string);
  expect(body.output_config).toBeUndefined();
  expect(body.thinking).toBeUndefined();
  expect(body.max_tokens).not.toBe(4096);
});
