import { expect, test } from 'vitest';

import { getVisibleProviders } from '../../renderer/config';
import { parseTokenDanceCatalog,TOKEN_DANCE_MODELS, TokenDance, TokenDanceProtocol } from './constants';

test('TokenDance is first in both locales without displacing or duplicating other providers', () => {
  for (const locale of ['zh', 'en'] as const) {
    const ids = getVisibleProviders(locale);
    expect(ids[0]).toBe(TokenDance.Provider);
    expect(new Set(ids).size).toBe(ids.length);
  }
});

test('catalog retains requested order and excludes unrelated and unsupported models', () => {
  const rows = TOKEN_DANCE_MODELS.map(model => ({ id: model.id, supported_protocols: model.supportedProtocols, context_length: model.contextLength }));
  const result = parseTokenDanceCatalog({ data: [{ id: 'unrequested-model', supported_protocols: [TokenDanceProtocol.Chat] }, ...rows.reverse()] });
  expect(result.models.map(model => model.id)).toEqual(TOKEN_DANCE_MODELS.map(model => model.id));
  expect(result.missingIds).toEqual([]);
});

test('malformed catalog cannot overwrite the cached list', () => {
  expect(() => parseTokenDanceCatalog({ error: 'unavailable' })).toThrow();
  expect(() => parseTokenDanceCatalog(null)).toThrow();
});
