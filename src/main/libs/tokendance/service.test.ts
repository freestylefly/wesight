import { createHash } from 'crypto';
import { afterEach, expect, test, vi } from 'vitest';

import { TOKEN_DANCE_MODELS, TokenDance, TokenDanceEndpoint, TokenDanceError, TokenDanceProtocol } from '../../../shared/tokendance/constants';
import { createPkce, type TokenDanceDependencies,TokenDanceService } from './service';

const services: TokenDanceService[] = [];
afterEach(() => { services.splice(0).forEach(service => service.close()); });
const testKey = 'test-only-upstream-key';
function setup(overrides: Partial<TokenDanceDependencies> = {}) {
  const data = new Map<string, unknown>();
  const deps: TokenDanceDependencies = {
    read: key => data.get(key), write: (key, value) => { data.set(key, value); },
    canEncrypt: () => true, encrypt: () => 'encrypted-test-value', decrypt: () => testKey,
    fetch: vi.fn(async () => Response.json({ choices: [{ message: { content: 'OK' } }] })),
    openExternal: vi.fn(async () => {}), callbackHtml: '<p>Return to WeSight</p>',
    authorizationTimeoutMs: 1000, ...overrides,
  };
  const service = new TokenDanceService(deps);
  services.push(service);
  return { service, deps, data };
}

test('PKCE uses a valid verifier and S256 base64url challenge', () => {
  const { verifier, challenge } = createPkce();
  expect(verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
  expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
});

test('authorization checks its random callback path and stores only ciphertext', async () => {
  let authUrl: URL | undefined;
  const { service, deps, data } = setup({
    openExternal: async url => {
      authUrl = new URL(url);
      const callback = new URL(authUrl.searchParams.get('callback_url')!);
      expect((await fetch(new URL('/callback/wrong-flow', callback))).status).toBe(404);
      callback.searchParams.set('code', 'single-use-code');
      expect((await fetch(callback)).status).toBe(200);
    },
    fetch: async (url, init) => {
      expect(url).toBe(TokenDance.ExchangeUrl);
      const payload = JSON.parse(init!.body as string);
      expect(payload.code).toBe('single-use-code');
      expect(createHash('sha256').update(payload.code_verifier).digest('base64url')).toBe(authUrl!.searchParams.get('code_challenge'));
      return Response.json({ key: testKey });
    },
  });
  const result = await service.authorize();
  expect(result).toEqual({ success: true, status: { connected: true } });
  expect(data.get(TokenDance.CredentialStoreKey)).toBe(deps.encrypt(testKey));
  expect(JSON.stringify([...data])).not.toContain(testKey);
  expect(JSON.stringify(result)).not.toContain(testKey);
});

test('insecure storage blocks authorization before opening a browser', async () => {
  const open = vi.fn(async () => {});
  const { service } = setup({ canEncrypt: () => false, openExternal: open });
  expect(await service.authorize()).toEqual({ success: false, error: TokenDanceError.Storage });
  expect(open).not.toHaveBeenCalled();
});

test('cancelling authorization keeps the previous credential and does not exchange code', async () => {
  const { service, data, deps } = setup({ openExternal: async () => { service.cancel(); } });
  data.set(TokenDance.CredentialStoreKey, 'previous-encrypted-key');
  expect((await service.authorize()).error).toBe(TokenDanceError.Cancelled);
  expect(data.get(TokenDance.CredentialStoreKey)).toBe('previous-encrypted-key');
  expect(deps.fetch).not.toHaveBeenCalled();
});

test('model protocol routing never claims Messages or Responses for unsupported models', async () => {
  const { service, data } = setup();
  data.set(TokenDance.CredentialStoreKey, 'ciphertext');
  await service.start();
  for (const model of TOKEN_DANCE_MODELS) {
    const runtime = service.runtimeConfig(model.id, true);
    expect(runtime.apiFormat).toBe(model.supportedProtocols.includes(TokenDanceProtocol.Messages) ? 'anthropic' : 'openai');
    expect(runtime.nativeResponses).toBe(model.supportedProtocols.includes(TokenDanceProtocol.Responses));
    expect(runtime.apiKey).not.toBe(testKey);
    expect(runtime.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+/);
  }
});

test('gateway enforces local authentication, model and protocol before sending upstream', async () => {
  const { service, data, deps } = setup();
  data.set(TokenDance.CredentialStoreKey, 'ciphertext');
  await service.start();
  const runtime = service.runtimeConfig(TokenDance.DefaultModel);
  const origin = runtime.baseUrl.replace(/\/v1$/, '');
  const send = (endpoint: string, model: string, key = runtime.apiKey) => fetch(`${origin}${endpoint}`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ model }),
  });
  expect((await send(TokenDanceEndpoint.Chat, TokenDance.DefaultModel, 'wrong')).status).toBe(401);
  expect((await send(TokenDanceEndpoint.Messages, TOKEN_DANCE_MODELS[4].id)).status).toBe(400);
  expect((await send(TokenDanceEndpoint.Responses, TOKEN_DANCE_MODELS[1].id)).status).toBe(400);
  expect(deps.fetch).not.toHaveBeenCalled();
  expect((await send(TokenDanceEndpoint.Chat, TokenDance.DefaultModel)).status).toBe(200);
  expect(deps.fetch).toHaveBeenCalledWith(`${TokenDance.MessagesBaseUrl}${TokenDanceEndpoint.Chat}`, expect.objectContaining({ redirect: 'error', headers: expect.objectContaining({ Authorization: `Bearer ${testKey}` }) }));
});

test('gateway streams tool-call chunks unchanged and never exposes upstream error bodies', async () => {
  const sse = 'data: {"choices":[{"delta":{"tool_calls":[{"id":"call-1","function":{"name":"read_file","arguments":"{}"}}]}}]}\n\ndata: [DONE]\n\n';
  let fail = false;
  const { service, data } = setup({ fetch: async () => fail
    ? new Response(`private diagnostic ${testKey}`, { status: 402, headers: { 'TokenDance-Recovery-Action': 'top_up_balance' } })
    : new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } }) });
  data.set(TokenDance.CredentialStoreKey, 'ciphertext');
  await service.start();
  const runtime = service.runtimeConfig(TokenDance.DefaultModel);
  const send = () => fetch(`${runtime.baseUrl}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.apiKey}` }, body: JSON.stringify({ model: TokenDance.DefaultModel, stream: true }) });
  expect(await (await send()).text()).toBe(sse);
  fail = true;
  const response = await send();
  expect(response.status).toBe(402);
  const body = await response.text();
  expect(body).toContain(TokenDanceError.TopUp);
  expect(body).not.toContain(testKey);
});

test('catalog refresh drops missing models, preserves last good catalog after network failure', async () => {
  let fail = false;
  const { service, data } = setup({ fetch: async () => {
    if (fail) throw new Error('offline');
    return Response.json({ data: [{ id: TokenDance.DefaultModel, supported_protocols: [TokenDanceProtocol.Chat], context_length: 123456 }] });
  } });
  data.set(TokenDance.CredentialStoreKey, 'ciphertext');
  await service.start();
  const result = await service.refreshCatalog();
  expect(result.models).toHaveLength(1);
  expect(result.missingIds).toHaveLength(5);
  expect(service.runtimeConfig(TokenDance.DefaultModel, true).apiFormat).toBe('openai');
  expect(() => service.runtimeConfig(TOKEN_DANCE_MODELS[1].id)).toThrow(TokenDanceError.Protocol);
  fail = true;
  expect((await service.refreshCatalog()).success).toBe(false);
  expect(service.runtimeConfig(TokenDance.DefaultModel).nativeResponses).toBe(false);
});

test('disconnect invalidates already issued local credentials', async () => {
  const { service, data } = setup();
  data.set(TokenDance.CredentialStoreKey, 'ciphertext');
  await service.start();
  const runtime = service.runtimeConfig(TokenDance.DefaultModel);
  service.disconnect();
  const response = await fetch(`${runtime.baseUrl}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.apiKey}` }, body: JSON.stringify({ model: TokenDance.DefaultModel }) });
  expect(response.status).toBe(401);
  expect(() => service.runtimeConfig(TokenDance.DefaultModel)).toThrow(TokenDanceError.NotConnected);
});
