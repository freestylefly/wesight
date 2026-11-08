import { ProviderName } from '../../shared/providers';
import type { Model } from '../store/slices/modelSlice';

export const ServerModelGroupKey = '__server_models__';

export interface ModelProviderGroup {
  key: string;
  label: string;
  models: Model[];
}

export function groupModelsByProvider(models: readonly Model[], serverLabel: string, fallbackLabel: string): ModelProviderGroup[] {
  const groups = new Map<string, ModelProviderGroup>();
  for (const model of models) {
    const label = model.isServerModel ? serverLabel : model.provider?.trim() || fallbackLabel;
    const key = model.isServerModel ? ServerModelGroupKey : model.providerKey?.trim() || `provider:${label}`;
    const group = groups.get(key) ?? { key, label, models: [] };
    group.models.push(model);
    groups.set(key, group);
  }
  const priority = [ProviderName.TokenDance, ProviderName.Ciyuan, ServerModelGroupKey];
  return [
    ...priority.flatMap(key => groups.get(key) ? [groups.get(key)!] : []),
    ...[...groups.values()].filter(group => !priority.includes(group.key)),
  ];
}
