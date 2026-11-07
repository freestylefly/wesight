import type { CatalogModel } from '../../shared/models/catalog';
import { ApiFormat } from '../../shared/providers';
import { type KimiModeConfig, type KimiModeConfigs, KimiModelMode } from '../../shared/providers/kimi/constants';
import { type EncryptedPayload, encryptWithPassword, type PasswordEncryptedPayload } from './encryption';

type ImportedApiKey = EncryptedPayload | PasswordEncryptedPayload | string;
type ModeSnapshot<ApiKey> = Omit<KimiModeConfig, 'apiKey'> & { apiKey: ApiKey };

export type EncryptedKimiModeConfigs = Partial<Record<KimiModelMode, ModeSnapshot<PasswordEncryptedPayload>>>;
export type ImportedKimiModeConfigs = Partial<Record<KimiModelMode, ModeSnapshot<ImportedApiKey>>>;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

function readModels(value: unknown): CatalogModel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const models = new Map<string, CatalogModel>();
  for (const model of value) {
    if (!isRecord(model) || typeof model.id !== 'string' || !model.id.trim()) continue;
    const id = model.id.trim();
    if (models.has(id)) continue;
    models.set(id, {
      id,
      name: typeof model.name === 'string' && model.name.trim() ? model.name.trim() : id,
      ...(typeof model.supportsImage === 'boolean' ? { supportsImage: model.supportsImage } : {}),
      ...(typeof model.modelVendor === 'string' ? { modelVendor: model.modelVendor } : {}),
    });
  }
  return [...models.values()];
}

function readMetadata(snapshot: unknown): Omit<KimiModeConfig, 'apiKey'> {
  if (!isRecord(snapshot) || typeof snapshot.baseUrl !== 'string') {
    throw new Error('Invalid Kimi mode configuration');
  }
  const models = readModels(snapshot.models);
  const apiFormat = Object.values(ApiFormat).find(format => format === snapshot.apiFormat);
  return {
    baseUrl: snapshot.baseUrl,
    ...(apiFormat ? { apiFormat } : {}),
    ...(models ? { models } : {}),
    ...(typeof snapshot.defaultModel === 'string' ? { defaultModel: snapshot.defaultModel } : {}),
  };
}

function readApiKey(value: unknown): ImportedApiKey {
  if (typeof value === 'string') return value;
  if (!isRecord(value) || typeof value.encrypted !== 'string' || !value.encrypted
    || typeof value.iv !== 'string' || !value.iv) {
    throw new Error('Invalid encrypted Kimi API key');
  }
  if ('salt' in value) {
    if (typeof value.salt !== 'string' || !value.salt) throw new Error('Invalid encrypted Kimi API key');
    return { encrypted: value.encrypted, iv: value.iv, salt: value.salt };
  }
  return { encrypted: value.encrypted, iv: value.iv };
}

export async function encryptKimiModeConfigs(configs: KimiModeConfigs | undefined, password: string): Promise<EncryptedKimiModeConfigs | undefined> {
  if (configs === undefined) return undefined;
  if (!isRecord(configs)) throw new Error('Invalid Kimi mode configurations');
  const encrypted: EncryptedKimiModeConfigs = {};
  for (const mode of Object.values(KimiModelMode)) {
    const snapshot = configs[mode];
    if (snapshot === undefined) continue;
    const metadata = readMetadata(snapshot);
    if (typeof snapshot.apiKey !== 'string') throw new Error('Invalid Kimi API key');
    encrypted[mode] = { ...metadata, apiKey: await encryptWithPassword(snapshot.apiKey, password) };
  }
  return encrypted;
}

export async function decryptKimiModeConfigs(
  configs: ImportedKimiModeConfigs | undefined,
  decrypt: (key: ImportedApiKey) => Promise<string>,
): Promise<KimiModeConfigs | undefined> {
  if (configs === undefined) return undefined;
  if (!isRecord(configs)) throw new Error('Invalid Kimi mode configurations');
  const decrypted: KimiModeConfigs = {};
  for (const mode of Object.values(KimiModelMode)) {
    const snapshot = configs[mode];
    if (snapshot === undefined) continue;
    const metadata = readMetadata(snapshot);
    const apiKey = await decrypt(readApiKey(snapshot.apiKey));
    if (typeof apiKey !== 'string') throw new Error('Invalid decrypted Kimi API key');
    decrypted[mode] = { ...metadata, apiKey };
  }
  return decrypted;
}
