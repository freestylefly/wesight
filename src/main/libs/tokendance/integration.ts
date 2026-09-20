import { ipcMain, safeStorage, session, shell } from 'electron';

import { TokenDance, TokenDanceEndpoint, TokenDanceError, TokenDanceIpc } from '../../../shared/tokendance/constants';
import { t } from '../../i18n';
import type { SqliteStore } from '../../sqliteStore';
import { getTokenDanceService, setTokenDanceService, TokenDanceService } from './service';

export async function startTokenDance(store: SqliteStore): Promise<TokenDanceService> {
  const service = new TokenDanceService({
    read: key => store.get(key),
    write: (key, value) => store.set(key, value),
    canEncrypt: () => safeStorage.isEncryptionAvailable()
      && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
    encrypt: value => safeStorage.encryptString(value).toString('base64'),
    decrypt: value => safeStorage.decryptString(Buffer.from(value, 'base64')),
    fetch: (url, init) => session.defaultSession.fetch(url, init),
    openExternal: url => shell.openExternal(url),
    errorMessage: error => t(error),
    callbackHtml: `<!doctype html><html><meta charset="utf-8"><title>WeSight</title><body><h1>WeSight</h1><p>${t('tokendanceCallbackReceived')}</p></body></html>`,
  });
  await service.start();
  setTokenDanceService(service);
  return service;
}

export function registerTokenDanceIpc(): void {
  const unavailable = () => ({ success: false, error: TokenDanceError.NotConnected });
  ipcMain.handle(TokenDanceIpc.Status, () => getTokenDanceService()?.status() ?? unavailable());
  ipcMain.handle(TokenDanceIpc.Authorize, () => getTokenDanceService()?.authorize() ?? unavailable());
  ipcMain.handle(TokenDanceIpc.Cancel, () => getTokenDanceService()?.cancel());
  ipcMain.handle(TokenDanceIpc.Disconnect, () => getTokenDanceService()?.disconnect() ?? unavailable());
  ipcMain.handle(TokenDanceIpc.Catalog, () => getTokenDanceService()?.refreshCatalog() ?? unavailable());
  ipcMain.handle(TokenDanceIpc.Test, (_event, model: unknown) => typeof model === 'string'
    ? getTokenDanceService()?.test(model) ?? unavailable() : unavailable());
}

/** Translate an opaque renderer credential reference into a loopback request. */
export function routeTokenDanceRequest<T extends { url: string; headers: Record<string, string>; body?: string }>(options: T): T {
  if (!Object.values(options.headers).some(value => value.includes(TokenDance.CredentialRef))) return options;
  const url = new URL(options.url);
  const endpoint = url.pathname.replace(/^\/gateway/, '');
  if (url.origin !== TokenDance.Origin || url.search || !Object.values(TokenDanceEndpoint).includes(endpoint as typeof TokenDanceEndpoint[keyof typeof TokenDanceEndpoint])) {
    throw new Error(TokenDanceError.Protocol);
  }
  const body = JSON.parse(options.body ?? '{}') as { model: string };
  const runtime = getTokenDanceService()?.runtimeConfig(body.model);
  if (!runtime) throw new Error(TokenDanceError.NotConnected);
  return {
    ...options,
    url: `${runtime.baseUrl.replace(/\/v1$/, '')}${endpoint}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${runtime.apiKey}` },
  };
}
