import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  applyJsoncTopLevelUpdates,
  parseJsonObjectText,
  stringifyJsoncPreservingComments,
} from './jsoncUtil';

const asRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

const REAL_CONFIG = `{
  "$schema": "https://opencode.ai/config.json",
  // my preferred model, do not change
  "model": "deepseek/deepseek-chat",
  /* team-wide endpoint, see wiki */
  "provider": {
    "deepseek": {
      "name": "DeepSeek",
      "options": { "baseURL": "https://api.deepseek.com/v1" }
    }
  }
}
`;

const tmpFile = (name: string, content: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonc-'));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
};

describe('applyJsoncTopLevelUpdates', () => {
  it('replaces a top-level string value and keeps every comment', () => {
    const out = applyJsoncTopLevelUpdates(REAL_CONFIG, { model: 'deepseek/deepseek-reasoner' });
    expect(out).not.toBeNull();
    expect(out).toContain('// my preferred model, do not change');
    expect(out).toContain('/* team-wide endpoint, see wiki */');
    expect(parseJsonObjectText(out!, 'a.jsonc')!.model).toBe('deepseek/deepseek-reasoner');
  });

  it('does not treat a nested key with the same name as top level', () => {
    const src = `{
  // comment
  "model": "a/b",
  "provider": { "x": { "model": "nested/value" } }
}
`;
    const out = applyJsoncTopLevelUpdates(src, { model: 'c/d' })!;
    const parsed = parseJsonObjectText(out, 'a.jsonc')!;
    expect(parsed.model).toBe('c/d');
    expect(asRecord(asRecord(parsed.provider).x).model).toBe('nested/value');
    expect(out).toContain('// comment');
  });

  it('replaces a nested object value wholesale with matching indentation', () => {
    const out = applyJsoncTopLevelUpdates(REAL_CONFIG, {
      provider: { deepseek: { name: 'DeepSeek', options: { baseURL: 'https://x/v1' } } },
    })!;
    expect(out).toContain('// my preferred model, do not change');
    const parsed = parseJsonObjectText(out, 'a.jsonc')!;
    expect(asRecord(asRecord(asRecord(parsed.provider).deepseek).options).baseURL).toBe('https://x/v1');
  });

  it('inserts a brand-new key without disturbing existing comments', () => {
    const out = applyJsoncTopLevelUpdates(REAL_CONFIG, { theme: 'dark' })!;
    expect(out).toContain('// my preferred model, do not change');
    const parsed = parseJsonObjectText(out, 'a.jsonc')!;
    expect(parsed.theme).toBe('dark');
    expect(parsed.model).toBe('deepseek/deepseek-chat');
  });

  it('ignores a comment-like sequence inside a string value', () => {
    const src = `{
  "note": "not // a comment and not /* one either */",
  "model": "a/b"
}
`;
    const out = applyJsoncTopLevelUpdates(src, { model: 'c/d' })!;
    expect(parseJsonObjectText(out, 'a.jsonc')!.note).toBe('not // a comment and not /* one either */');
  });

  it('handles an escaped quote inside a key and a windows path value', () => {
    const src = `{
  "wi\\"rd": 1,
  // keep
  "path": "C:\\\\Users\\\\yan\\\\.config",
  "model": "a/b"
}
`;
    const out = applyJsoncTopLevelUpdates(src, { model: 'c/d' })!;
    const parsed = parseJsonObjectText(out, 'a.jsonc')!;
    expect(parsed.path).toBe('C:\\Users\\yan\\.config');
    expect(parsed.model).toBe('c/d');
    expect(out).toContain('// keep');
  });

  it('preserves a trailing comma layout', () => {
    const src = `{
  // c
  "model": "a/b",
}
`;
    const out = applyJsoncTopLevelUpdates(src, { model: 'c/d' })!;
    expect(out).toContain('// c');
    expect(parseJsonObjectText(out, 'a.jsonc')!.model).toBe('c/d');
  });

  it('returns the input unchanged when there is nothing to update', () => {
    expect(applyJsoncTopLevelUpdates(REAL_CONFIG, {})).toBe(REAL_CONFIG);
  });

  it('returns null for a non-object root', () => {
    expect(applyJsoncTopLevelUpdates('[1,2,3]', { a: 1 })).toBeNull();
  });

  it('returns null for an unterminated object', () => {
    expect(applyJsoncTopLevelUpdates('{ "model": "a/b"', { model: 'c' })).toBeNull();
  });

  it('respects tab indentation when inserting', () => {
    const src = '{\n\t// c\n\t"model": "a/b"\n}\n';
    const out = applyJsoncTopLevelUpdates(src, { theme: 'dark' })!;
    expect(out).toContain('\t"theme"');
  });
});

describe('stringifyJsoncPreservingComments', () => {
  it('preserves comments for the reported #60 config shape', () => {
    const filePath = tmpFile('opencode.jsonc', REAL_CONFIG);
    const existing = fs.readFileSync(filePath, 'utf8');
    const next = { ...parseJsonObjectText(existing, filePath)!, model: 'deepseek/deepseek-reasoner' };
    const out = stringifyJsoncPreservingComments(filePath, existing, next, ['model']);
    expect(out).toContain('// my preferred model, do not change');
    expect(parseJsonObjectText(out, filePath)!.model).toBe('deepseek/deepseek-reasoner');
  });

  it('falls back to a full rewrite for a plain .json file', () => {
    const filePath = tmpFile('opencode.json', '{\n  "model": "a/b"\n}\n');
    const existing = fs.readFileSync(filePath, 'utf8');
    const out = stringifyJsoncPreservingComments(filePath, existing, { model: 'c/d' }, ['model']);
    expect(out).toBe('{\n  "model": "c/d"\n}\n');
  });

  it('falls back to a full rewrite when the .jsonc file has no comments', () => {
    const filePath = tmpFile('opencode.jsonc', '{\n  "model": "a/b"\n}\n');
    const existing = fs.readFileSync(filePath, 'utf8');
    const out = stringifyJsoncPreservingComments(filePath, existing, { model: 'c/d' }, ['model']);
    expect(out).toBe('{\n  "model": "c/d"\n}\n');
  });

  it('falls back to a full rewrite when the file does not exist yet', () => {
    const out = stringifyJsoncPreservingComments('/nope/opencode.jsonc', null, { model: 'c/d' }, ['model']);
    expect(out).toBe('{\n  "model": "c/d"\n}\n');
  });

  it('falls back to a full rewrite when a key was removed', () => {
    const src = '{\n  // c\n  "model": "a/b",\n  "gone": 1\n}\n';
    const filePath = tmpFile('opencode.jsonc', src);
    const out = stringifyJsoncPreservingComments(filePath, src, { model: 'c/d' }, ['model']);
    expect(out).not.toContain('gone');
    expect(out).not.toContain('// c');
  });

  it('falls back when a key changed but was not declared in changedKeys', () => {
    const src = '{\n  // c\n  "model": "a/b",\n  "other": 1\n}\n';
    const filePath = tmpFile('opencode.jsonc', src);
    const out = stringifyJsoncPreservingComments(filePath, src, { model: 'c/d', other: 2 }, ['model']);
    expect(parseJsonObjectText(out, filePath)).toEqual({ model: 'c/d', other: 2 });
    expect(out).not.toContain('// c');
  });

  it('never returns text that fails to round-trip to the intended object', () => {
    const filePath = tmpFile('opencode.jsonc', REAL_CONFIG);
    const next = { ...parseJsonObjectText(REAL_CONFIG, filePath)!, model: 'x/y' };
    const out = stringifyJsoncPreservingComments(filePath, REAL_CONFIG, next, ['model']);
    expect(parseJsonObjectText(out, filePath)).toEqual(next);
  });

  it('is idempotent across repeated writes of the same value', () => {
    const filePath = tmpFile('opencode.jsonc', REAL_CONFIG);
    const next = { ...parseJsonObjectText(REAL_CONFIG, filePath)!, model: 'x/y' };
    const first = stringifyJsoncPreservingComments(filePath, REAL_CONFIG, next, ['model']);
    const second = stringifyJsoncPreservingComments(filePath, first, next, ['model']);
    expect(second).toBe(first);
  });
});
