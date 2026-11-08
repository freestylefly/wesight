import { ModelVendor } from './constants';

export interface CatalogModel {
  id: string;
  name: string;
  supportsImage?: boolean;
  modelVendor?: string;
}

const vendorAliases: Record<string, ModelVendor> = {
  ...Object.fromEntries(Object.values(ModelVendor).map(vendor => [vendor, vendor])),
  gemini: ModelVendor.Google,
  'google-ai': ModelVendor.Google,
  claude: ModelVendor.Anthropic,
  alibaba: ModelVendor.Qwen,
  'meta-llama': ModelVendor.Meta,
  'mistralai': ModelVendor.Mistral,
  'x-ai': ModelVendor.XAI,
  bytedance: ModelVendor.Volcengine,
  'z-ai': ModelVendor.Zhipu,
};

function vendorFromId(id: string): ModelVendor | undefined {
  // Slash prefixes are common in relay catalogs; retain the original ID for requests.
  const family = id.toLowerCase().replace(/^models\//, '').split('/').pop() ?? '';
  if (/^(gpt-|chatgpt-|o[134](?:-|$))/.test(family)) return ModelVendor.OpenAI;
  if (/^gemini(?:-|$)/.test(family)) return ModelVendor.Google;
  if (/^claude(?:-|$)/.test(family)) return ModelVendor.Anthropic;
  if (/^deepseek(?:-|$)/.test(family)) return ModelVendor.DeepSeek;
  if (/^(kimi-|moonshot-)/.test(family)) return ModelVendor.Moonshot;
  if (/^qwen/.test(family)) return ModelVendor.Qwen;
  if (/^(glm-|chatglm)/.test(family)) return ModelVendor.Zhipu;
  if (/^(minimax-|abab)/.test(family)) return ModelVendor.Minimax;
  if (/^(llama|meta-llama)/.test(family)) return ModelVendor.Meta;
  if (/^(mistral|mixtral|codestral|magistral|devstral)/.test(family)) return ModelVendor.Mistral;
  if (/^grok/.test(family)) return ModelVendor.XAI;
  if (/^(doubao-|seed-)/.test(family)) return ModelVendor.Volcengine;
  if (/^mimo-/.test(family)) return ModelVendor.Xiaomi;
  if (/^step-/.test(family)) return ModelVendor.StepFun;
  return undefined;
}

export function getModelVendor(model: Pick<CatalogModel, 'id' | 'modelVendor'>): ModelVendor {
  const explicit = model.modelVendor?.trim().toLowerCase();
  return (explicit && vendorAliases[explicit]) || vendorFromId(model.id) || ModelVendor.Other;
}

export function groupModelsByVendor<T extends CatalogModel>(models: readonly T[], query = ''): Array<{ vendor: ModelVendor; models: T[] }> {
  const search = query.trim().toLowerCase();
  const groups = new Map<ModelVendor, T[]>();
  for (const model of models) {
    if (search && !`${model.name} ${model.id}`.toLowerCase().includes(search)) continue;
    const vendor = getModelVendor(model);
    const group = groups.get(vendor) ?? [];
    group.push(model);
    groups.set(vendor, group);
  }
  return Object.values(ModelVendor).flatMap(vendor => {
    const group = groups.get(vendor);
    return group ? [{ vendor, models: group }] : [];
  });
}

/** Some relays label every row as owned_by=openai. Known families take precedence. */
export function parseCiyuanCatalog(payload: unknown): CatalogModel[] {
  if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray(payload.data)) {
    throw new Error('Invalid Ciyuan model catalog.');
  }
  const models = new Map<string, CatalogModel>();
  for (const row of payload.data) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id.trim()) continue;
    const id = row.id.trim();
    // Dedicated media/embedding models cannot be selected for an agent chat session.
    if (/(?:embedding|rerank|whisper|tts|dall-e|gpt-image|imagen|veo|sora|suno|flux|seedream|seedance|midjourney|kling)/i.test(id)
      || /gemini.*(?:-image|-tts)/i.test(id)) continue;
    if (models.has(id)) continue;
    const owner = typeof row.owned_by === 'string' ? row.owned_by.trim().toLowerCase() : '';
    const vendor = vendorFromId(id) ?? vendorAliases[owner] ?? ModelVendor.Other;
    models.set(id, {
      id,
      name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : id,
      modelVendor: vendor,
      // Only trust explicit capabilities; names alone do not guarantee vision support.
      ...(typeof row.supportsImage === 'boolean' ? { supportsImage: row.supportsImage }
        : typeof row.supports_image === 'boolean' ? { supportsImage: row.supports_image } : {}),
    });
  }
  return [...models.values()];
}

export function mergeCatalogModels<T extends CatalogModel>(fetched: readonly CatalogModel[], existing: readonly T[]): CatalogModel[] {
  const existingById = new Map(existing.map(model => [model.id, model]));
  const merged = fetched.map(model => {
    const saved = existingById.get(model.id);
    return {
      ...saved,
      ...model,
      name: saved?.name || model.name,
      supportsImage: saved?.supportsImage ?? model.supportsImage ?? false,
    };
  });
  const fetchedIds = new Set(fetched.map(model => model.id));
  return [...merged, ...existing.filter(model => !fetchedIds.has(model.id))];
}
