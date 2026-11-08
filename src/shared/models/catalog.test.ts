import { expect, test } from 'vitest';

import { getModelVendor, groupModelsByVendor, mergeCatalogModels, parseCiyuanCatalog } from './catalog';
import { ModelVendor } from './constants';

test('recognizes legacy and prefixed IDs without changing their routing identity', () => {
  expect(getModelVendor({ id: 'google/gemini-2.5-pro' })).toBe(ModelVendor.Google);
  expect(getModelVendor({ id: 'anthropic/claude-sonnet-4' })).toBe(ModelVendor.Anthropic);
  expect(getModelVendor({ id: 'o3-mini' })).toBe(ModelVendor.OpenAI);
  expect(getModelVendor({ id: 'private-model' })).toBe(ModelVendor.Other);
});

test('account catalogs tolerate malformed rows and generic relay owners', () => {
  const models = parseCiyuanCatalog({ data: [
    { id: 'gemini-2.5-pro', owned_by: ModelVendor.OpenAI },
    { id: 'private-model', owned_by: ModelVendor.Anthropic, supports_image: true },
    { id: 'gpt-4o' }, { id: 'gpt-4o' }, null, { id: 4 }, { id: '' },
    { id: 'gpt-image-1' }, { id: 'gemini-2.5-flash-image' }, { id: 'text-embedding-3-small' },
  ] });
  expect(models.map(model => model.id)).toEqual(['gemini-2.5-pro', 'private-model', 'gpt-4o']);
  expect(models[0].modelVendor).toBe(ModelVendor.Google);
  expect(models[1].modelVendor).toBe(ModelVendor.Anthropic);
  expect(models[1].supportsImage).toBe(true);
  expect(models[2].supportsImage).toBeUndefined();
  expect(() => parseCiyuanCatalog({ error: 'unauthorized' })).toThrow();
});

test('search matches names and IDs and retains manufacturer groups', () => {
  const models = [
    { id: 'gpt-4o', name: 'Fast model' },
    { id: 'gemini-2.5-pro', name: 'My vision model' },
    { id: 'custom', name: 'Local' },
  ];
  expect(groupModelsByVendor(models, ' GEMINI ')).toEqual([{ vendor: ModelVendor.Google, models: [models[1]] }]);
  expect(groupModelsByVendor(models, 'vision')[0].models).toEqual([models[1]]);
  expect(groupModelsByVendor(models, 'missing')).toEqual([]);
  expect(groupModelsByVendor(models).map(group => group.vendor)).toEqual([ModelVendor.OpenAI, ModelVendor.Google, ModelVendor.Other]);
});

test('refresh preserves edited names, capabilities, metadata and manually added models', () => {
  const merged = mergeCatalogModels(
    [{ id: 'gpt-4o', name: 'GPT-4o', modelVendor: ModelVendor.OpenAI }],
    [{ id: 'gpt-4o', name: 'My GPT', supportsImage: true, contextLength: 128000 }, { id: 'private', name: 'Private', supportsImage: false }],
  );
  expect(merged).toEqual([
    { id: 'gpt-4o', name: 'My GPT', supportsImage: true, contextLength: 128000, modelVendor: ModelVendor.OpenAI },
    { id: 'private', name: 'Private', supportsImage: false },
  ]);
});
