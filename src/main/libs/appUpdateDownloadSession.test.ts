import { __resetMockPartitionSessions, mockPartitionSessions, session } from 'electron';
import { beforeEach, describe, expect, test } from 'vitest';

import { prepareUpdateDownloadSession } from './appUpdateInstaller';

describe('prepareUpdateDownloadSession', () => {
  beforeEach(() => {
    __resetMockPartitionSessions();
  });

  test('does not download on the default session', async () => {
    const updateSession = await prepareUpdateDownloadSession();
    expect(updateSession).not.toBe(session.defaultSession);
  });

  test('requests system proxy mode so local-proxy users can download (issue #73)', async () => {
    const updateSession = await prepareUpdateDownloadSession();
    expect(updateSession.setProxyCalls).toEqual([{ mode: 'system' }]);
  });

  test('uses a non-persistent partition so installer payloads are not written to userData', async () => {
    const updateSession = await prepareUpdateDownloadSession();
    expect(updateSession.partition.startsWith('persist:')).toBe(false);
  });

  test('disables cache so large installers do not fill the HTTP cache', async () => {
    const updateSession = await prepareUpdateDownloadSession();
    expect(updateSession.options).toEqual({ cache: false });
  });

  test('leaves the default session proxy configuration untouched', async () => {
    await prepareUpdateDownloadSession();
    expect('proxyConfig' in session.defaultSession).toBe(false);
  });

  test('reuses the same partition across repeated downloads', async () => {
    const first = await prepareUpdateDownloadSession();
    const second = await prepareUpdateDownloadSession();
    expect(second).toBe(first);
    expect(mockPartitionSessions.size).toBe(1);
  });

  test('still returns a usable session when setProxy rejects', async () => {
    const failing = await prepareUpdateDownloadSession();
    failing.setProxy = async () => {
      throw new Error('proxy unavailable');
    };
    __resetMockPartitionSessions();
    mockPartitionSessions.set('wesight-update-download', failing);

    await expect(prepareUpdateDownloadSession()).resolves.toBe(failing);
  });
});
