import type { CatalogModel } from '../../models/catalog';
import type { ApiFormat } from '../constants';

export const KimiModelMode = {
  Code: 'code',
  Api: 'api',
} as const;

export type KimiModelMode = typeof KimiModelMode[keyof typeof KimiModelMode];

export interface KimiModeConfig {
  apiKey: string;
  baseUrl: string;
  apiFormat?: ApiFormat;
  models?: CatalogModel[];
  defaultModel?: string;
}

export type KimiModeConfigs = Partial<Record<KimiModelMode, KimiModeConfig>>;
