import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { parseJsonObjectText, readJsonOrJsoncObject, stripJsonComments } from './jsoncUtil';

const tmpDirs: string[] = [];

const writeTempFile = (name: string, content: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-jsonc-'));
  tmpDirs.push(dir);
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
};

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('stripJsonComments', () => {
  it('keeps // sequences that live inside string values', () => {
    const input = '{"$schema": "https://opencode.ai/config.json"}';
    expect(JSON.parse(stripJsonComments(input))).toEqual({
      $schema: 'https://opencode.ai/config.json',
    });
  });

  it('removes line comments and trailing commas', () => {
    const input = '{\n  // pick a model\n  "model": "deepseek/deepseek-chat",\n}';
    expect(JSON.parse(stripJsonComments(input))).toEqual({
      model: 'deepseek/deepseek-chat',
    });
  });

  it('removes block comments while preserving nested URLs', () => {
    const input = '{\n  /* provider block */\n  "provider": { "deepseek": { "options": { "baseURL": "https://api.deepseek.com/v1" } } }\n}';
    expect(JSON.parse(stripJsonComments(input))).toEqual({
      provider: { deepseek: { options: { baseURL: 'https://api.deepseek.com/v1' } } },
    });
  });
});

describe('readJsonOrJsoncObject', () => {
  it('reads a commented .jsonc file containing URLs', () => {
    const filePath = writeTempFile(
      'opencode.jsonc',
      '{\n  // OpenCode config\n  "$schema": "https://opencode.ai/config.json",\n  "model": "deepseek/deepseek-chat",\n}\n',
    );
    expect(readJsonOrJsoncObject(filePath)).toEqual({
      $schema: 'https://opencode.ai/config.json',
      model: 'deepseek/deepseek-chat',
    });
  });

  it('reads a plain .json file unchanged', () => {
    const filePath = writeTempFile('opencode.json', '{"$schema": "https://opencode.ai/config.json"}');
    expect(readJsonOrJsoncObject(filePath)).toEqual({
      $schema: 'https://opencode.ai/config.json',
    });
  });

  it('returns null for a missing file', () => {
    expect(readJsonOrJsoncObject(path.join(os.tmpdir(), 'wesight-does-not-exist.jsonc'))).toBeNull();
  });

  it('returns null for malformed content instead of throwing', () => {
    const filePath = writeTempFile('broken.jsonc', '{ not json at all ');
    expect(readJsonOrJsoncObject(filePath)).toBeNull();
  });

  it('returns null for a JSON array root', () => {
    const filePath = writeTempFile('array.json', '[1, 2, 3]');
    expect(readJsonOrJsoncObject(filePath)).toBeNull();
  });

  it('does not strip comments for non-.jsonc paths', () => {
    expect(parseJsonObjectText('{\n // c\n "a": 1\n}', '/tmp/x.json')).toBeNull();
    expect(parseJsonObjectText('{\n // c\n "a": 1\n}', '/tmp/x.jsonc')).toEqual({ a: 1 });
  });
});
