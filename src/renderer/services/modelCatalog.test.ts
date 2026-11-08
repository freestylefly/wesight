import { expect, test } from 'vitest';

import { ProviderName } from '../../shared/providers';
import { getModelIdentityKey, isSameModelIdentity } from '../store/slices/modelSlice';
import { groupModelsByProvider, ServerModelGroupKey } from './modelCatalog';

test('prioritizes TokenDance and Ciyuan and retains server and custom providers', () => {
  const groups = groupModelsByProvider([
    { id: 'gpt-4o', name: 'GPT-4o', providerKey: ProviderName.OpenAI, provider: 'OpenAI' },
    { id: 'gpt-4o', name: 'GPT-4o', providerKey: ProviderName.Ciyuan, provider: 'Ciyuan' },
    { id: 'gpt-4o', name: 'GPT-4o', isServerModel: true },
    { id: 'custom', name: 'Custom', providerKey: 'custom_0', provider: 'My server' },
    { id: 'gpt-4o', name: 'GPT-4o', providerKey: ProviderName.TokenDance, provider: 'TokenDance' },
  ], 'Platform', 'User');
  expect(groups.map(group => group.key)).toEqual([ProviderName.TokenDance, ProviderName.Ciyuan, ServerModelGroupKey, ProviderName.OpenAI, 'custom_0']);
  expect(groups.find(group => group.key === ServerModelGroupKey)?.label).toBe('Platform');
  const ciyuan = groups[1].models[0];
  const openai = groups[3].models[0];
  expect(isSameModelIdentity(ciyuan, openai)).toBe(false);
  expect(getModelIdentityKey(ciyuan)).not.toBe(getModelIdentityKey(openai));
  expect(isSameModelIdentity(ciyuan, { id: 'gpt-4o' })).toBe(true);
});
