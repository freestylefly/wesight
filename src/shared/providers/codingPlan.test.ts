import { describe, expect, test } from 'vitest';

import { resolveCodingPlanBaseUrl } from './codingPlan';
import { ApiFormat, ProviderName } from './constants';

describe('resolveCodingPlanBaseUrl', () => {
  test('returns currentBaseUrl unchanged when codingPlanEnabled is false', () => {
    const result = resolveCodingPlanBaseUrl(ProviderName.Zhipu, false, 'anthropic', 'https://custom.url');
    expect(result.baseUrl).toBe('https://custom.url');
    expect(result.effectiveFormat).toBe('anthropic');
  });

  test('returns currentBaseUrl unchanged for provider without codingPlan support', () => {
    const result = resolveCodingPlanBaseUrl(ProviderName.OpenAI, true, 'openai', 'https://api.openai.com/v1');
    expect(result.baseUrl).toBe('https://api.openai.com/v1');
    expect(result.effectiveFormat).toBe('openai');
  });

  describe('Zhipu', () => {
    test('keeps anthropic URL when caller passes anthropic format', () => {
      const result = resolveCodingPlanBaseUrl(ProviderName.Zhipu, true, 'anthropic', 'https://open.bigmodel.cn/api/anthropic');
      expect(result.baseUrl).toBe('https://open.bigmodel.cn/api/anthropic');
      expect(result.effectiveFormat).toBe('anthropic');
    });

    test('uses openai URL when caller passes openai format', () => {
      const result = resolveCodingPlanBaseUrl(ProviderName.Zhipu, true, 'openai', 'https://open.bigmodel.cn/api/paas/v4');
      expect(result.baseUrl).toBe('https://open.bigmodel.cn/api/coding/paas/v4');
      expect(result.effectiveFormat).toBe('openai');
    });
  });

  describe('Moonshot — OpenAI-compatible Code endpoint', () => {
    test('migrates callers using the legacy Anthropic format to the displayed Code endpoint', () => {
      const result = resolveCodingPlanBaseUrl(ProviderName.Moonshot, true, ApiFormat.Anthropic, 'https://api.kimi.com/coding');
      expect(result.baseUrl).toBe('https://api.kimi.com/coding/v1');
      expect(result.effectiveFormat).toBe(ApiFormat.OpenAI);
    });

    test('keeps the OpenAI endpoint and format used by the Code settings tab', () => {
      const result = resolveCodingPlanBaseUrl(ProviderName.Moonshot, true, ApiFormat.OpenAI, 'https://api.kimi.com/coding/v1');
      expect(result.baseUrl).toBe('https://api.kimi.com/coding/v1');
      expect(result.effectiveFormat).toBe(ApiFormat.OpenAI);
    });
  });

  describe('Volcengine — no preferredCodingPlanFormat', () => {
    test('returns anthropic coding plan URL', () => {
      const result = resolveCodingPlanBaseUrl(ProviderName.Volcengine, true, 'anthropic', '');
      expect(result.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/coding');
      expect(result.effectiveFormat).toBe('anthropic');
    });

    test('returns openai coding plan URL', () => {
      const result = resolveCodingPlanBaseUrl(ProviderName.Volcengine, true, 'openai', '');
      expect(result.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/coding/v3');
      expect(result.effectiveFormat).toBe('openai');
    });
  });

  describe('Qwen — preferredCodingPlanFormat=openai', () => {
    test('overrides anthropic to openai coding plan URL', () => {
      const result = resolveCodingPlanBaseUrl(ProviderName.Qwen, true, 'anthropic', '');
      expect(result.baseUrl).toBe('https://coding.dashscope.aliyuncs.com/v1');
      expect(result.effectiveFormat).toBe('openai');
    });

    test('returns openai coding plan URL', () => {
      const result = resolveCodingPlanBaseUrl(ProviderName.Qwen, true, 'openai', '');
      expect(result.baseUrl).toBe('https://coding.dashscope.aliyuncs.com/v1');
      expect(result.effectiveFormat).toBe('openai');
    });
  });
});
