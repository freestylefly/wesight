import { afterEach, expect, test, vi } from 'vitest';

import { TokenDance, TokenDanceEndpoint, TokenDanceError } from '../../../shared/tokendance/constants';
import { routeTokenDanceRequest } from './integration';
import { setTokenDanceService, TokenDanceService } from './service';

afterEach(() => setTokenDanceService(undefined));

test('renderer credential references route through the local gateway without exposing the upstream key', () => {
  const service = new TokenDanceService({
    read: () => undefined, write: () => {}, canEncrypt: () => true,
    encrypt: value => value, decrypt: value => value,
    fetch: vi.fn(), openExternal: vi.fn(), callbackHtml: '',
  });
  vi.spyOn(service, 'runtimeConfig').mockReturnValue({
    baseUrl: 'http://127.0.0.1:54321/v1', apiKey: 'ephemeral-loopback-token',
    apiFormat: 'openai', nativeResponses: true,
  });
  setTokenDanceService(service);
  const input = {
    url: `${TokenDance.MessagesBaseUrl}${TokenDanceEndpoint.Chat}`,
    headers: { Authorization: `Bearer ${TokenDance.CredentialRef}`, 'X-Untrusted': 'discard' },
    body: JSON.stringify({ model: TokenDance.DefaultModel }),
  };
  expect(routeTokenDanceRequest(input)).toEqual({
    ...input, url: 'http://127.0.0.1:54321/v1/chat/completions',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ephemeral-loopback-token' },
  });
  expect(service.runtimeConfig).toHaveBeenCalledWith(TokenDance.DefaultModel);
});

test('credential reference cannot target another origin, a query string or an unsupported endpoint', () => {
  for (const url of [
    'https://example.com/gateway/v1/chat/completions',
    `${TokenDance.BaseUrl}/chat/completions?redirect=1`,
    `${TokenDance.BaseUrl}/files`,
  ]) {
    expect(() => routeTokenDanceRequest({
      url, headers: { Authorization: `Bearer ${TokenDance.CredentialRef}` },
    })).toThrow(TokenDanceError.Protocol);
  }
});

test('requests for other providers are preserved', () => {
  const input = { url: 'https://example.com/v1/chat/completions', headers: { Authorization: 'Bearer unrelated-provider-key' } };
  expect(routeTokenDanceRequest(input)).toBe(input);
});
