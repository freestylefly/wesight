import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import { expect, test } from 'vitest';

test('unlocks signing partitions with the keychain password and imports each certificate with its own password', async () => {
  const require = createRequire(import.meta.url);
  const modulePath = require.resolve('app-builder-lib/out/codeSign/macCodeSign.js');
  const moduleRequire = createRequire(modulePath);
  const calls: string[][] = [];
  const credentials = { application: 'fake-app-certificate', installer: 'fake-installer-certificate' };
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  runInNewContext(readFileSync(modulePath, 'utf8'), {
    exports,
    __dirname: path.dirname(modulePath),
    // Skip the bundled roots setup; every security command is intercepted below.
    process: { platform: 'darwin', env: { TRAVIS: 'true' } },
    require: (name: string) => {
      if (name === 'builder-util') return {
        exec: async (binary: string, args: string[]) => {
          expect(binary).toBe('/usr/bin/security');
          calls.push(args);
          return '';
        },
      };
      if (name === './codesign') return { importCertificate: async (link: string) => link };
      return moduleRequire(name);
    },
  });
  await exports.createKeychain({
    tmpDir: {}, currentDir: '/fake/project', cscLink: '/fake/app.p12',
    cscKeyPassword: credentials.application, cscILink: '/fake/installer.p12',
    cscIKeyPassword: credentials.installer,
  });
  const created = calls.find(args => args[0] === 'create-keychain')!;
  const keychainPassword = created[2];
  expect(keychainPassword).toBeTruthy();
  expect(keychainPassword).not.toBe(credentials.application);
  const imports = calls.filter(args => args[0] === 'import');
  expect(imports.map(args => args[args.indexOf('-P') + 1])).toEqual([
    credentials.application, credentials.installer,
  ]);
  const partitions = calls.filter(args => args[0] === 'set-key-partition-list');
  expect(partitions).toHaveLength(2);
  for (const args of partitions) {
    expect(args[args.indexOf('-k') + 1]).toBe(keychainPassword);
    expect(args.at(-1)).toBe(created.at(-1));
  }
});
