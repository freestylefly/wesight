import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  parseJsonObjectText,
  readTextFileOrNull,
  stringifyJsoncPreservingComments,
} from './jsoncUtil';

// Mirrors the patched write helper used by both externalAgentProviderStore.ts
// (writeJsonConfigFile) and externalAgentConfigSync.ts (writeJsonConfigObject).
const writeJsonConfigFile = (
  filePath: string,
  value: Record<string, unknown>,
  changedKeys: string[],
): void => {
  fs.writeFileSync(
    filePath,
    stringifyJsoncPreservingComments(filePath, readTextFileOrNull(filePath), value, changedKeys),
  );
};

const asRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

const USER_JSONC = `{
  "$schema": "https://opencode.ai/config.json",
  // pinned by the team, do not switch to anthropic
  "model": "deepseek/deepseek-chat",
  /* keys live in auth.json, not here */
  "provider": {
    "deepseek": {
      "name": "DeepSeek",
      "options": { "baseURL": "https://api.deepseek.com/v1" }
    }
  }
}
`;

const mk = (name: string, content: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-write-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
};

describe('applyProviderToLive write-back (issue #60 follow-up)', () => {
  it('updating the model keeps the user comments in opencode.jsonc', () => {
    const p = mk('opencode.jsonc', USER_JSONC);
    const existing = parseJsonObjectText(readTextFileOrNull(p)!, p)!;
    const next = { ...existing, model: 'deepseek/deepseek-reasoner' };

    writeJsonConfigFile(p, next, ['model']);

    const after = fs.readFileSync(p, 'utf8');
    expect(after).toContain('// pinned by the team, do not switch to anthropic');
    expect(after).toContain('/* keys live in auth.json, not here */');
    expect(parseJsonObjectText(after, p)!.model).toBe('deepseek/deepseek-reasoner');
  });

  it('keeps the $schema URL intact rather than truncating it at the //', () => {
    const p = mk('opencode.jsonc', USER_JSONC);
    const existing = parseJsonObjectText(readTextFileOrNull(p)!, p)!;
    writeJsonConfigFile(p, { ...existing, model: 'x/y' }, ['model']);
    expect(parseJsonObjectText(fs.readFileSync(p, 'utf8'), p)!.$schema)
      .toBe('https://opencode.ai/config.json');
  });

  it('syncing model + provider preserves unrelated commented keys', () => {
    const src = `{
  // do not delete, needed by our CI image
  "autoshare": false,
  "model": "deepseek/deepseek-chat",
  "provider": { "deepseek": { "name": "DeepSeek" } }
}
`;
    const p = mk('opencode.jsonc', src);
    const existing = parseJsonObjectText(src, p)!;
    const next = {
      ...existing,
      model: 'wesight/gpt-5.4',
      provider: { wesight: { name: 'WeSight', options: { baseURL: 'https://x/v1' } } },
    };

    writeJsonConfigFile(p, next, ['model', 'provider']);

    const after = fs.readFileSync(p, 'utf8');
    expect(after).toContain('// do not delete, needed by our CI image');
    const parsed = parseJsonObjectText(after, p)!;
    expect(parsed.autoshare).toBe(false);
    expect(parsed.model).toBe('wesight/gpt-5.4');
    expect(asRecord(asRecord(asRecord(parsed.provider).wesight).options).baseURL).toBe('https://x/v1');
  });

  it('a plain opencode.json is written exactly as before', () => {
    const p = mk('opencode.json', '{\n  "model": "a/b"\n}\n');
    writeJsonConfigFile(p, { model: 'c/d' }, ['model']);
    expect(fs.readFileSync(p, 'utf8')).toBe('{\n  "model": "c/d"\n}\n');
  });

  it('a first-time write to a missing file still produces valid JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-write-'));
    const p = path.join(dir, 'opencode.jsonc');
    writeJsonConfigFile(p, { model: 'c/d' }, ['model']);
    expect(parseJsonObjectText(fs.readFileSync(p, 'utf8'), p)).toEqual({ model: 'c/d' });
  });

  it('the written file always parses back to exactly the intended object', () => {
    const p = mk('opencode.jsonc', USER_JSONC);
    const existing = parseJsonObjectText(USER_JSONC, p)!;
    const next = { ...existing, model: 'q/r' };
    writeJsonConfigFile(p, next, ['model']);
    expect(parseJsonObjectText(fs.readFileSync(p, 'utf8'), p)).toEqual(next);
  });

  it('repeated syncs do not accumulate drift', () => {
    const p = mk('opencode.jsonc', USER_JSONC);
    const existing = parseJsonObjectText(USER_JSONC, p)!;
    const next = { ...existing, model: 'q/r' };
    writeJsonConfigFile(p, next, ['model']);
    const first = fs.readFileSync(p, 'utf8');
    writeJsonConfigFile(p, next, ['model']);
    expect(fs.readFileSync(p, 'utf8')).toBe(first);
    expect(first).toContain('// pinned by the team');
  });
});
