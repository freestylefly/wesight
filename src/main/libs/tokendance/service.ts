import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { once } from 'events';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

import {
  parseTokenDanceCatalog, TOKEN_DANCE_MODELS, TokenDance, TokenDanceEndpoint,
  TokenDanceError, type TokenDanceModel, TokenDanceProtocol, tokenDanceRecoveryError,
  type TokenDanceResult,
} from '../../../shared/tokendance/constants';

export interface TokenDanceDependencies {
  read(key: string): unknown;
  write(key: string, value: unknown): void;
  encrypt(value: string): string;
  decrypt(value: string): string;
  canEncrypt(): boolean;
  fetch(url: string, init?: RequestInit): Promise<Response>;
  openExternal(url: string): Promise<void>;
  callbackHtml: string;
  errorMessage?: (error: TokenDanceError) => string;
  authorizationTimeoutMs?: number;
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

function equalSecret(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class TokenDanceService {
  private gateway?: Server;
  private gatewayUrl = '';
  private readonly gatewayToken = randomBytes(32).toString('base64url');
  private cancelAuthorization?: () => void;
  private catalog: TokenDanceModel[];
  private readonly requests = new Set<AbortController>();

  constructor(private readonly deps: TokenDanceDependencies) {
    const saved = deps.read(TokenDance.CatalogStoreKey);
    this.catalog = Array.isArray(saved)
      ? saved.filter((m): m is TokenDanceModel => !!m && TOKEN_DANCE_MODELS.some(p => p.id === m.id)
        && Array.isArray(m.supportedProtocols))
      : TOKEN_DANCE_MODELS.map(m => ({ ...m }));
  }

  status(): TokenDanceResult {
    try { return { success: true, status: { connected: !!this.getKey() } }; }
    catch { return { success: false, error: TokenDanceError.Storage, status: { connected: false } }; }
  }

  private getKey(): string {
    const encrypted = this.deps.read(TokenDance.CredentialStoreKey);
    if (!encrypted) return '';
    if (typeof encrypted !== 'string' || !this.deps.canEncrypt()) throw new Error(TokenDanceError.Storage);
    return this.deps.decrypt(encrypted);
  }

  cancel(): void { this.cancelAuthorization?.(); }

  disconnect(): TokenDanceResult {
    this.cancel();
    this.requests.forEach(controller => controller.abort());
    this.deps.write(TokenDance.CredentialStoreKey, null);
    return this.status();
  }

  async refreshCatalog(): Promise<TokenDanceResult> {
    try {
      const response = await this.deps.fetch(TokenDance.CatalogUrl, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok) return { success: false, error: TokenDanceError.Catalog };
      const result = parseTokenDanceCatalog(await response.json());
      this.catalog = result.models;
      this.deps.write(TokenDance.CatalogStoreKey, result.models);
      return { success: true, ...result };
    } catch { return { success: false, error: TokenDanceError.Catalog }; }
  }

  async authorize(): Promise<TokenDanceResult> {
    this.cancel();
    if (!this.deps.canEncrypt()) return { success: false, error: TokenDanceError.Storage };
    const { verifier, challenge } = createPkce();
    const flow = randomBytes(24).toString('hex');
    const callbackPath = `/callback/${flow}`;
    const controller = new AbortController();
    let server: Server | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectCode: (reason: Error) => void = () => {};
    const cancel = () => {
      controller.abort();
      rejectCode(new Error(TokenDanceError.Cancelled));
      server?.close();
    };
    this.cancelAuthorization = cancel;
    try {
      const codePromise = new Promise<string>((resolve, reject) => {
        rejectCode = reject;
        server = createServer((req, res) => {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1');
          if (req.method !== 'GET' || url.pathname !== callbackPath) {
            res.writeHead(404).end(); return;
          }
          const code = url.searchParams.get('code');
          if (!code || code.length > 4096) { res.writeHead(400).end(); return; }
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'", 'Referrer-Policy': 'no-referrer',
          }).end(this.deps.callbackHtml);
          resolve(code);
        });
        server.once('error', reject);
      });
      // Attach a rejection handler before opening a browser or awaiting the listener.
      void codePromise.catch(() => {});
      server!.listen(0, '127.0.0.1');
      await once(server!, 'listening');
      const port = (server!.address() as AddressInfo).port;
      const authUrl = new URL(TokenDance.AuthUrl);
      authUrl.searchParams.set('callback_url', `http://127.0.0.1:${port}${callbackPath}`);
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('app_url', TokenDance.AppUrl);
      authUrl.searchParams.set('key_name', 'WeSight');
      timer = setTimeout(cancel, this.deps.authorizationTimeoutMs ?? 10 * 60 * 1000);
      await this.deps.openExternal(authUrl.toString());
      const code = await codePromise;
      server!.close();
      const response = await this.deps.fetch(TokenDance.ExchangeUrl, {
        method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      });
      if (!response.ok) return { success: false, error: TokenDanceError.Authorization };
      const result = await response.json() as { key?: unknown };
      if (controller.signal.aborted) return { success: false, error: TokenDanceError.Cancelled };
      if (typeof result.key !== 'string' || !result.key.trim()) return { success: false, error: TokenDanceError.Authorization };
      try {
        this.deps.write(TokenDance.CredentialStoreKey, this.deps.encrypt(result.key));
      } catch { return { success: false, error: TokenDanceError.Storage }; }
      return this.status();
    } catch {
      return { success: false, error: controller.signal.aborted ? TokenDanceError.Cancelled : TokenDanceError.Authorization };
    } finally {
      clearTimeout(timer);
      server?.close();
      if (this.cancelAuthorization === cancel) this.cancelAuthorization = undefined;
    }
  }

  /** Returns only a local, per-process access token. Never returns the upstream key. */
  runtimeConfig(modelId: string, preferMessages = false): { baseUrl: string; apiKey: string; apiFormat: 'openai' | 'anthropic'; nativeResponses: boolean } {
    const model = this.catalog.find(m => m.id === modelId);
    if (!model || !model.supportedProtocols.includes(TokenDanceProtocol.Chat)) throw new Error(TokenDanceError.Protocol);
    if (!this.status().status?.connected || !this.gatewayUrl) throw new Error(TokenDanceError.NotConnected);
    const messages = preferMessages && model.supportedProtocols.includes(TokenDanceProtocol.Messages);
    return {
      baseUrl: `${this.gatewayUrl}${messages ? '' : '/v1'}`,
      apiKey: this.gatewayToken,
      apiFormat: messages ? 'anthropic' : 'openai',
      nativeResponses: model.supportedProtocols.includes(TokenDanceProtocol.Responses),
    };
  }

  async start(): Promise<void> {
    if (this.gateway) return;
    this.gateway = createServer(async (req, res) => {
      const authorization = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers['x-api-key'];
      if (typeof authorization !== 'string' || !equalSecret(authorization, this.gatewayToken)) {
        res.writeHead(401).end(); return;
      }
      const endpoint = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      const protocol = endpoint === TokenDanceEndpoint.Chat ? TokenDanceProtocol.Chat
        : endpoint === TokenDanceEndpoint.Responses ? TokenDanceProtocol.Responses
          : endpoint === TokenDanceEndpoint.Messages || endpoint === TokenDanceEndpoint.CountTokens ? TokenDanceProtocol.Messages : null;
      if (req.method !== 'POST' || !protocol) { res.writeHead(404).end(); return; }
      const controller = new AbortController();
      this.requests.add(controller);
      res.on('close', () => controller.abort());
      try {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 32 * 1024 * 1024) { res.writeHead(413).end(); return; }
          chunks.push(Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(body) as { model?: string };
        const model = this.catalog.find(m => m.id === parsed.model);
        if (!model?.supportedProtocols.includes(protocol)) {
          res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: this.deps.errorMessage?.(TokenDanceError.Protocol) ?? TokenDanceError.Protocol } })); return;
        }
        const key = this.getKey();
        if (!key) {
          res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: this.deps.errorMessage?.(TokenDanceError.NotConnected) ?? TokenDanceError.NotConnected } })); return;
        }
        const upstream = await this.deps.fetch(`${TokenDance.MessagesBaseUrl}${endpoint}`, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: {
            'Content-Type': 'application/json', Authorization: `Bearer ${key}`,
            ...(protocol === TokenDanceProtocol.Messages ? { 'anthropic-version': '2023-06-01' } : {}),
          }, body,
        });
        if (!upstream.ok) {
          const recovery = upstream.headers.get('TokenDance-Recovery-Action');
          res.writeHead(upstream.status, { 'Content-Type': 'application/json', ...(recovery ? { 'TokenDance-Recovery-Action': recovery } : {}) })
            .end(JSON.stringify({ error: { message: this.deps.errorMessage?.(tokenDanceRecoveryError(recovery)) ?? tokenDanceRecoveryError(recovery) } }));
          await upstream.body?.cancel();
          return;
        }
        res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' });
        if (upstream.body) {
          const reader = upstream.body.getReader();
          try {
            while (!controller.signal.aborted) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!res.write(Buffer.from(value))) await once(res, 'drain', { signal: controller.signal });
            }
          } finally { await reader.cancel().catch(() => {}); }
        }
        res.end();
      } catch {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: this.deps.errorMessage?.(TokenDanceError.Network) ?? TokenDanceError.Network } }));
        else res.destroy();
      } finally { this.requests.delete(controller); }
    });
    this.gateway.listen(0, '127.0.0.1');
    await once(this.gateway, 'listening');
    this.gatewayUrl = `http://127.0.0.1:${(this.gateway.address() as AddressInfo).port}`;
  }

  async test(model: string): Promise<TokenDanceResult> {
    try {
      const config = this.runtimeConfig(model);
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 64 }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) return { success: false, error: tokenDanceRecoveryError(response.headers.get('TokenDance-Recovery-Action')) };
      const payload = await response.json() as { choices?: unknown[] };
      return payload.choices?.length ? { success: true } : { success: false, error: TokenDanceError.Network };
    } catch (error) {
      return { success: false, error: error instanceof Error && Object.values(TokenDanceError).includes(error.message as TokenDanceError)
        ? error.message as TokenDanceError : TokenDanceError.Network };
    }
  }

  close(): void {
    this.cancel();
    this.requests.forEach(controller => controller.abort());
    this.gateway?.close();
    this.gateway?.closeAllConnections();
    this.gateway = undefined;
    this.gatewayUrl = '';
  }
}

let service: TokenDanceService | undefined;
export const setTokenDanceService = (value: TokenDanceService | undefined): void => { service = value; };
export const getTokenDanceService = (): TokenDanceService | undefined => service;
