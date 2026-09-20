import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { openCodeAuthEntryLoggedIn, summarizeCliAuthStatus } from './externalAgentEnvironment';

// Entry shapes follow OpenCode's Auth.Info schema (api | oauth | wellknown).
describe('openCodeAuthEntryLoggedIn', () => {
  it('accepts an api entry with a key', () => {
    expect(openCodeAuthEntryLoggedIn({ type: 'api', key: 'sk-abc123' })).toBe(true);
  });

  it('rejects an api entry with an empty key', () => {
    expect(openCodeAuthEntryLoggedIn({ type: 'api', key: '   ' })).toBe(false);
  });

  it('accepts an oauth entry holding a refresh token', () => {
    expect(openCodeAuthEntryLoggedIn({
      type: 'oauth',
      refresh: 'rt-abc',
      access: '',
      expires: 0,
    })).toBe(true);
  });

  it('accepts an oauth entry holding only an access token', () => {
    expect(openCodeAuthEntryLoggedIn({ type: 'oauth', access: 'at-abc', expires: 1 })).toBe(true);
  });

  it('rejects an oauth entry with no usable token', () => {
    expect(openCodeAuthEntryLoggedIn({ type: 'oauth', refresh: '', access: '', expires: 0 })).toBe(false);
  });

  it('accepts a wellknown entry', () => {
    expect(openCodeAuthEntryLoggedIn({ type: 'wellknown', key: 'k', token: 't' })).toBe(true);
  });

  it('falls back to field sniffing when the discriminator is absent', () => {
    expect(openCodeAuthEntryLoggedIn({ api: 'sk-legacy' })).toBe(true);
    expect(openCodeAuthEntryLoggedIn({ unrelated: 'value' })).toBe(false);
  });

  it('rejects non-object entries', () => {
    expect(openCodeAuthEntryLoggedIn(null)).toBe(false);
    expect(openCodeAuthEntryLoggedIn('sk-abc')).toBe(false);
    expect(openCodeAuthEntryLoggedIn(['sk-abc'])).toBe(false);
  });
});

describe('summarizeCliAuthStatus for opencode auth.json', () => {
  const tmpDirs: string[] = [];

  const writeAuthJson = (content: string): { configDir: string; authPath: string } => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-opencode-auth-'));
    tmpDirs.push(dir);
    const authPath = path.join(dir, 'auth.json');
    fs.writeFileSync(authPath, content, 'utf8');
    return { configDir: dir, authPath };
  };

  const snapshotFor = (authPath: string, configDir: string) => ({
    configDir,
    primaryConfigPath: path.join(configDir, 'opencode.jsonc'),
    secondaryConfigPaths: [authPath],
    configExists: false,
    currentProviderId: null,
    currentProviderName: null,
    providerCount: 0,
  });

  afterEach(() => {
    while (tmpDirs.length) {
      const dir = tmpDirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects an api-type login (the shape reported in issue #78)', () => {
    const { configDir, authPath } = writeAuthJson(JSON.stringify({
      deepseek: { type: 'api', key: 'sk-deepseek' },
      google: { type: 'api', key: 'AIzaExample' },
    }));
    const summary = summarizeCliAuthStatus('opencode', snapshotFor(authPath, configDir));
    expect(summary.authStatus).toBe('logged_in');
    expect(summary.authMessage).toBe('file');
  });

  it('detects an oauth-type login that carries no api key at all', () => {
    const { configDir, authPath } = writeAuthJson(JSON.stringify({
      anthropic: { type: 'oauth', refresh: 'rt-value', access: 'at-value', expires: 0 },
    }));
    expect(summarizeCliAuthStatus('opencode', snapshotFor(authPath, configDir)).authStatus)
      .toBe('logged_in');
  });

  it('reports logged_out for an empty credential map', () => {
    const { configDir, authPath } = writeAuthJson('{}');
    expect(summarizeCliAuthStatus('opencode', snapshotFor(authPath, configDir)).authStatus)
      .toBe('logged_out');
  });

  it('does not throw on malformed auth.json', () => {
    const { configDir, authPath } = writeAuthJson('{ broken');
    expect(summarizeCliAuthStatus('opencode', snapshotFor(authPath, configDir)).authStatus)
      .toBe('logged_out');
  });
});
