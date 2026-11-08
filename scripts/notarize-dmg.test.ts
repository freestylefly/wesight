import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import { expect, test } from 'vitest';

interface CommandResult {
  status: number;
  stdout?: string;
  stderr?: string;
}

function loadHook(waitResults: CommandResult[]) {
  const calls: Array<{ command: string; args: string[] }> = [];
  const exports = {} as {
    default: (context: { artifactPaths: string[] }) => Promise<unknown>;
    NotarizationStatus: { Accepted: string; Invalid: string };
  };
  const submissionId = 'b9e9e435-b395-42ad-9068-d9978cd5c15a';
  const context = {
    exports,
    console: { log: () => {}, warn: () => {} },
    process: {
      platform: 'darwin',
      env: {
        APPLE_ID: 'release@example.test',
        APPLE_TEAM_ID: 'TESTTEAM',
        APPLE_APP_SPECIFIC_PASSWORD: 'private-test-password',
        WESIGHT_REQUIRE_APPLE_NOTARIZATION: 'true',
      },
    },
    setTimeout: (callback: () => void) => callback(),
  };
  const requireMock = (name: string): unknown => {
    if (name === 'path') return path;
    if (name === './mac-notarization.cjs') {
      const helperExports = {};
      runInNewContext(readFileSync(new URL('./mac-notarization.cjs', import.meta.url), 'utf8'), {
        ...context, exports: helperExports, require: requireMock,
      });
      return helperExports;
    }
    if (name === 'child_process') {
      return {
        spawnSync: (command: string, args: string[]) => {
          calls.push({ command, args });
          if (args[0] === 'notarytool' && args[1] === 'submit') {
            return { status: 0, stdout: JSON.stringify({ id: submissionId }) };
          }
          if (args[0] === 'notarytool' && args[1] === 'wait') {
            return waitResults.shift() ?? {
              status: 0,
              stdout: JSON.stringify({ id: submissionId, status: exports.NotarizationStatus.Accepted }),
            };
          }
          return { status: 0 };
        },
      };
    }
    throw new Error(`Unexpected dependency ${name}`);
  };
  runInNewContext(readFileSync(new URL('./notarize-dmg.cjs', import.meta.url), 'utf8'), {
    ...context, require: requireMock,
  });
  return {
    calls,
    submissionId,
    statuses: exports.NotarizationStatus,
    run: () => exports.default({ artifactPaths: [path.join('/release', 'WeSight.1.0.12.mac.arm64.dmg')] }),
  };
}

test('resumes the original notarization request after a transient network error', async () => {
  const hook = loadHook([{ status: 1, stderr: 'NSURLErrorDomain -1009 network offline' }]);
  await hook.run();
  expect(hook.calls.filter(call => call.args[1] === 'submit')).toHaveLength(1);
  const waits = hook.calls.filter(call => call.args[1] === 'wait');
  expect(waits).toHaveLength(2);
  expect(waits.map(call => call.args[2])).toEqual([hook.submissionId, hook.submissionId]);
  expect(hook.calls.filter(call => call.args[0] === 'stapler').map(call => call.args[1])).toEqual(['staple', 'validate']);
});

test('continues waiting for a slow request after the Apple CLI timeout', async () => {
  const hook = loadHook([{ status: 124, stderr: 'Timeout of 1800 seconds was reached' }]);
  await hook.run();
  expect(hook.calls.filter(call => call.args[1] === 'submit')).toHaveLength(1);
  expect(hook.calls.filter(call => call.args[1] === 'wait')).toHaveLength(2);
});

test('recognizes network failures returned through stdout in JSON mode', async () => {
  const hook = loadHook([{ status: 1, stdout: JSON.stringify({ message: 'NSURLErrorDomain network timeout' }) }]);
  await hook.run();
  expect(hook.calls.filter(call => call.args[1] === 'submit')).toHaveLength(1);
  expect(hook.calls.filter(call => call.args[1] === 'wait')).toHaveLength(2);
});

test('rejects invalid notarization results before stapling', async () => {
  const results: CommandResult[] = [];
  const hook = loadHook(results);
  results.push({ status: 0, stdout: JSON.stringify({ status: hook.statuses.Invalid }) });
  await expect(hook.run()).rejects.toThrow(`completed with status ${hook.statuses.Invalid}`);
  expect(hook.calls.filter(call => call.args[0] === 'stapler')).toHaveLength(0);
});

test('fails immediately on an authentication error', async () => {
  const hook = loadHook([{ status: 1, stderr: 'HTTPError statusCode 401 Unauthorized' }]);
  await expect(hook.run()).rejects.toThrow('401 Unauthorized');
  expect(hook.calls.filter(call => call.args[1] === 'wait')).toHaveLength(1);
  expect(hook.calls.filter(call => call.args[0] === 'stapler')).toHaveLength(0);
});

test('stops after bounded retries and redacts the password from the failure', async () => {
  const hook = loadHook(Array.from({ length: 6 }, () => ({
    status: 1, stderr: 'NSURLErrorDomain private-test-password',
  })));
  const error = await hook.run().then(() => null, (failure: Error) => failure);
  expect(error?.message).toContain('[redacted]');
  expect(error?.message).not.toContain('private-test-password');
  expect(hook.calls.filter(call => call.args[1] === 'submit')).toHaveLength(1);
  expect(hook.calls.filter(call => call.args[1] === 'wait')).toHaveLength(6);
  expect(hook.calls.filter(call => call.args[0] === 'stapler')).toHaveLength(0);
});
