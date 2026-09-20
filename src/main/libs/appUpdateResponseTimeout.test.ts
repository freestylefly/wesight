import { __resetMockPartitionSessions, mockPartitionSessions } from 'electron';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { cancelActiveDownload, downloadUpdate } from './appUpdateInstaller';

const UPDATE_PARTITION = 'wesight-update-download';

/**
 * Install a partition session whose fetch never produces a response, but which
 * honours AbortSignal the way Electron's `session.fetch` does. This models a
 * proxy that accepts the connection and then black-holes the request.
 */
function installStallingSession(): { fetchCalls: number } {
  const state = { fetchCalls: 0 };
  const stalling = {
    partition: UPDATE_PARTITION,
    options: { cache: false },
    proxyConfig: undefined,
    setProxyCalls: [] as unknown[],
    setProxy: async () => {},
    fetch: (_url: string, init?: { signal?: AbortSignal }) => {
      state.fetchCalls += 1;
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) {
          reject(new Error('aborted'));
          return;
        }
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    },
  };
  mockPartitionSessions.set(UPDATE_PARTITION, stalling as never);
  return state;
}

describe('downloadUpdate response-phase timeout (issue #73)', () => {
  beforeEach(() => {
    __resetMockPartitionSessions();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cancelActiveDownload();
  });

  test('rejects instead of hanging when no response ever arrives', async () => {
    installStallingSession();

    const promise = downloadUpdate('https://example.com/WeSight-1.0.7.dmg', () => {});
    const outcome = promise.then(
      () => 'resolved',
      (error: Error) => error.message,
    );

    await vi.advanceTimersByTimeAsync(60_000);

    await expect(outcome).resolves.toBe('Download timed out: no data received for 60 seconds');
  });

  test('does not fire before the 60s budget elapses', async () => {
    installStallingSession();

    const promise = downloadUpdate('https://example.com/WeSight-1.0.7.dmg', () => {});
    const outcome = promise.then(
      () => 'resolved',
      (error: Error) => error.message,
    );
    const settled = vi.fn();
    outcome.then(settled);

    await vi.advanceTimersByTimeAsync(59_000);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    // Await the real rejection so module-level download state is fully reset
    // before the next test starts.
    await expect(outcome).resolves.toBe('Download timed out: no data received for 60 seconds');
  });

  test('a user cancel during the response phase still reports as cancelled', async () => {
    installStallingSession();

    const promise = downloadUpdate('https://example.com/WeSight-1.0.7.dmg', () => {});
    const outcome = promise.then(
      () => 'resolved',
      (error: Error) => error.message,
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(cancelActiveDownload()).toBe(true);

    await expect(outcome).resolves.toBe('Download cancelled');
  });

  test('the response timer does not abort a download that is already streaming', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(new Uint8Array([1, 2, 3, 4]));
        streamController.close();
      },
    });
    const responding = {
      partition: UPDATE_PARTITION,
      options: { cache: false },
      proxyConfig: undefined,
      setProxyCalls: [] as unknown[],
      setProxy: async () => {},
      fetch: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-length': '4' }),
        body,
      }),
    };
    mockPartitionSessions.set(UPDATE_PARTITION, responding as never);

    const promise = downloadUpdate('https://example.com/WeSight-1.0.7.dmg', () => {});
    // Push past the response budget; a streaming download must be unaffected.
    await vi.advanceTimersByTimeAsync(120_000);

    await expect(promise).resolves.toContain('wesight-update-');
  });

  test('leaves no pending timer behind after a successful download', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(new Uint8Array([7, 7, 7]));
        streamController.close();
      },
    });
    const responding = {
      partition: UPDATE_PARTITION,
      options: { cache: false },
      proxyConfig: undefined,
      setProxyCalls: [] as unknown[],
      setProxy: async () => {},
      fetch: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-length': '3' }),
        body,
      }),
    };
    mockPartitionSessions.set(UPDATE_PARTITION, responding as never);

    await downloadUpdate('https://example.com/WeSight-1.0.7.dmg', () => {});

    expect(vi.getTimerCount()).toBe(0);
  });
});
