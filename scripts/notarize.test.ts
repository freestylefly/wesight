import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import { expect, test } from 'vitest';

function loadAppHook(failNotarization = false) {
  const events: string[] = [];
  const commands: Array<{ command: string; args: string[] }> = [];
  const exports = {} as {
    default: (context: {
      electronPlatformName: string;
      appOutDir: string;
      packager: { appInfo: { productFilename: string } };
    }) => Promise<void>;
  };
  runInNewContext(readFileSync(new URL('./notarize.js', import.meta.url), 'utf8'), {
    exports,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    process: { env: {
      APPLE_ID: 'release@example.test', APPLE_TEAM_ID: 'TESTTEAM',
      APPLE_APP_SPECIFIC_PASSWORD: 'private-test-password', WESIGHT_REQUIRE_APPLE_NOTARIZATION: 'true',
    } },
    setTimeout: (callback: () => void) => callback(),
    require: (name: string) => {
      if (name === 'path') return path;
      if (name === 'dotenv') return { config: () => {} };
      if (name === 'fs') return {
        mkdirSync: () => {},
        mkdtempSync: (prefix: string) => `${prefix}unique`,
        rmSync: () => events.push('cleanup'),
      };
      if (name === 'child_process') return {
        spawnSync: (command: string, args: string[]) => {
          commands.push({ command, args });
          events.push(command === 'xcrun' ? args[1] : command);
          return { status: 0 };
        },
      };
      if (name === './mac-notarization.cjs') return {
        submitAndWait: async (archive: string, _authentication: string[], _password: string, attempts: number) => {
          expect(archive).toContain('/pending-notarization/app-unique/WeSight.mac-arm64.zip');
          expect(attempts).toBe(4);
          events.push('wait');
          if (failNotarization) throw new Error('network query failed');
        },
      };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return {
    commands,
    events,
    run: () => exports.default({
      electronPlatformName: 'darwin', appOutDir: '/release/mac-arm64',
      packager: { appInfo: { productFilename: 'WeSight' } },
    }),
  };
}

test('verifies and archives the signed app before waiting and validates its ticket before cleanup', async () => {
  const hook = loadAppHook();
  await hook.run();
  expect(hook.events).toEqual(['codesign', 'ditto', 'wait', 'staple', 'validate', 'cleanup']);
  expect(hook.commands[0].args).toContain('--strict');
  expect(hook.commands[1].args).toContain('--keepParent');
});

test('preserves the signed app archive after a failed notarization query', async () => {
  const hook = loadAppHook(true);
  await expect(hook.run()).rejects.toThrow('network query failed');
  expect(hook.events).toEqual(['codesign', 'ditto', 'wait']);
});
