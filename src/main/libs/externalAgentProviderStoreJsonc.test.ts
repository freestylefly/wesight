import { expect, test } from 'vitest';

import { stripJsonComments } from './externalAgentProviderStore';

const parse = (input: string): unknown => JSON.parse(stripJsonComments(input));

test('preserves URLs in string values while removing line comments', () => {
  const raw = [
    '{',
    '  "$schema": "https://opencode.ai/config.json",',
    '  // preferred model',
    '  "model": "deepseek/deepseek-chat"',
    '}',
  ].join('\n');

  expect(parse(raw)).toEqual({
    $schema: 'https://opencode.ai/config.json',
    model: 'deepseek/deepseek-chat',
  });
});

test('removes block comments', () => {
  const raw = '{\n  /* multi\n     line note */\n  "model": "a/b"\n}';
  expect(parse(raw)).toEqual({ model: 'a/b' });
});

test('keeps comment-like sequences that appear inside strings', () => {
  const raw = '{ "note": "a // b /* c */ d" }';
  expect(parse(raw)).toEqual({ note: 'a // b /* c */ d' });
});

test('tolerates trailing commas permitted by JSONC', () => {
  const raw = '{ "a": 1, "b": [1, 2,], }';
  expect(parse(raw)).toEqual({ a: 1, b: [1, 2] });
});

test('handles escaped quotes before a trailing comment', () => {
  const raw = '{ "a": "he said \\"hi//\\"", // tail\n  "b": 2 }';
  expect(parse(raw)).toEqual({ a: 'he said "hi//"', b: 2 });
});

test('preserves nested provider baseURL values', () => {
  const raw = [
    '{',
    '  // provider overrides',
    '  "provider": {',
    '    "deepseek": { "options": { "baseURL": "https://api.deepseek.com/v1" } }',
    '  }',
    '}',
  ].join('\n');

  expect(parse(raw)).toEqual({
    provider: { deepseek: { options: { baseURL: 'https://api.deepseek.com/v1' } } },
  });
});

test('leaves escaped Windows-style paths intact', () => {
  const raw = '{ "p": "C:\\\\Users\\\\x" }';
  expect(parse(raw)).toEqual({ p: 'C:\\Users\\x' });
});

test('passes through plain JSON unchanged', () => {
  expect(parse('{"model":"x"}')).toEqual({ model: 'x' });
});
