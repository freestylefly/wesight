/** TokenDance's public catalog uses these exact protocol identifiers. */
export const TokenDanceProtocol = {
  Chat: 'openai:chat-completions',
  Messages: 'anthropic:messages',
  Responses: 'openai:responses',
} as const;
export type TokenDanceProtocol = typeof TokenDanceProtocol[keyof typeof TokenDanceProtocol];

export const TokenDance = {
  Provider: 'tokendance',
  Origin: 'https://tokendance.space',
  BaseUrl: 'https://tokendance.space/gateway/v1',
  MessagesBaseUrl: 'https://tokendance.space/gateway',
  CatalogUrl: 'https://tokendance.space/gateway/v1/models',
  AuthUrl: 'https://tokendance.space/auth',
  ExchangeUrl: 'https://tokendance.space/portal/api/v1/auth/keys',
  AppUrl: 'https://wesight.ai',
  CredentialRef: 'wesight-credential:tokendance',
  CredentialStoreKey: 'tokendance.encrypted-key',
  CatalogStoreKey: 'tokendance.catalog',
  DefaultModel: 'deepseek-v4.1-flash',
} as const;

export const TokenDanceIpc = {
  Status: 'tokendance:status',
  Authorize: 'tokendance:authorize',
  Cancel: 'tokendance:cancel',
  Disconnect: 'tokendance:disconnect',
  Catalog: 'tokendance:catalog',
  Test: 'tokendance:test',
} as const;

export const TokenDanceError = {
  Authorization: 'tokendanceErrorAuthorization',
  Cancelled: 'tokendanceErrorCancelled',
  Storage: 'tokendanceErrorStorage',
  Network: 'tokendanceErrorNetwork',
  Catalog: 'tokendanceErrorCatalog',
  Protocol: 'tokendanceErrorProtocol',
  NotConnected: 'tokendanceErrorNotConnected',
  TopUp: 'tokendanceErrorTopUp',
  Quota: 'tokendanceErrorQuota',
  Reauthorize: 'tokendanceErrorReauthorize',
} as const;
export type TokenDanceError = typeof TokenDanceError[keyof typeof TokenDanceError];
export const TokenDanceRecovery = {
  TopUp: 'top_up_balance',
  Reauthorize: 'reauthorize_api_key',
  Quota: 'api_key_quota',
} as const;
export const TokenDanceEndpoint = {
  Chat: '/v1/chat/completions',
  Responses: '/v1/responses',
  Messages: '/v1/messages',
  CountTokens: '/v1/messages/count_tokens',
} as const;

export interface TokenDanceModel {
  id: string;
  name: string;
  supportsImage: boolean;
  supportedProtocols: TokenDanceProtocol[];
  contextLength: number;
}
const all = [TokenDanceProtocol.Chat, TokenDanceProtocol.Messages, TokenDanceProtocol.Responses];
const chatMessages = [TokenDanceProtocol.Chat, TokenDanceProtocol.Messages];
const chatResponses = [TokenDanceProtocol.Chat, TokenDanceProtocol.Responses];
/** Snapshot verified against the public catalog on 2026-09-19. */
export const TOKEN_DANCE_MODELS: readonly TokenDanceModel[] = [
  { id: TokenDance.DefaultModel, name: 'DeepSeek V4.1 Flash', supportsImage: true, supportedProtocols: [...all], contextLength: 1000000 },
  { id: 'glm-5.3-flash', name: 'GLM 5.3 Flash', supportsImage: true, supportedProtocols: [...chatMessages], contextLength: 1000000 },
  { id: 'glm-5.3', name: 'GLM 5.3', supportsImage: false, supportedProtocols: [...chatMessages], contextLength: 1000000 },
  { id: 'deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro 0813', supportsImage: false, supportedProtocols: [...all], contextLength: 1000000 },
  { id: 'kimi-k3', name: 'Kimi K3', supportsImage: true, supportedProtocols: [...chatResponses], contextLength: 1048576 },
  { id: 'hy4-preview', name: 'Hy4 Preview', supportsImage: false, supportedProtocols: [...chatResponses], contextLength: 1024000 },
];

export interface TokenDanceStatus { connected: boolean }
export interface TokenDanceResult {
  success: boolean;
  error?: TokenDanceError;
  status?: TokenDanceStatus;
  models?: TokenDanceModel[];
  missingIds?: string[];
}
export interface TokenDanceApi {
  status(): Promise<TokenDanceResult>;
  authorize(): Promise<TokenDanceResult>;
  cancel(): Promise<void>;
  disconnect(): Promise<TokenDanceResult>;
  catalog(): Promise<TokenDanceResult>;
  test(model: string): Promise<TokenDanceResult>;
}

export function parseTokenDanceCatalog(payload: unknown): { models: TokenDanceModel[]; missingIds: string[] } {
  if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray(payload.data)) {
    throw new Error(TokenDanceError.Catalog);
  }
  const models: TokenDanceModel[] = [];
  const missingIds: string[] = [];
  for (const preset of TOKEN_DANCE_MODELS) {
    const row = payload.data.find((item: unknown) => item && typeof item === 'object' && 'id' in item && item.id === preset.id);
    if (!row || !Array.isArray(row.supported_protocols)) {
      missingIds.push(preset.id);
      continue;
    }
    const supportedProtocols = Object.values(TokenDanceProtocol).filter(p => row.supported_protocols.includes(p));
    if (!supportedProtocols.includes(TokenDanceProtocol.Chat)) {
      missingIds.push(preset.id);
      continue;
    }
    models.push({ ...preset, supportedProtocols, contextLength: typeof row.context_length === 'number' ? row.context_length : preset.contextLength });
  }
  return { models, missingIds };
}

export function tokenDanceRecoveryError(action: string | null): TokenDanceError {
  switch (action) {
    case TokenDanceRecovery.TopUp: return TokenDanceError.TopUp;
    case TokenDanceRecovery.Quota: return TokenDanceError.Quota;
    case TokenDanceRecovery.Reauthorize: return TokenDanceError.Reauthorize;
    default: return TokenDanceError.Network;
  }
}
