import { describe, expect, test } from 'vitest';

import { CreatorStudioSourceType } from '../types/creatorStudio';
import { buildPromptSpec, renderCreatorPrompt } from './creatorStudio';

describe('creator studio prompt utilities', () => {
  test('omits empty form fields from rendered prompts', () => {
    const spec = buildPromptSpec(null, {
      subject: '',
      platform: '',
      mainObject: 'A compact camera',
      requiredText: '',
      visualStyle: '',
      aspectRatio: '',
      negativeRequirements: '',
    }, 'en', 'Blank builder');

    const prompt = renderCreatorPrompt(spec);

    expect(prompt).toContain('Main subject: A compact camera');
    expect(prompt).not.toContain('not specified');
    expect(prompt).not.toContain('未填写');
  });

  test('preserves structured template and case context', () => {
    const spec = buildPromptSpec({
      sourceType: CreatorStudioSourceType.Template,
      sourceId: 'poster-system',
      sourceTitle: 'Poster System',
      templateId: 'poster-system',
      caseIds: ['case-1', 'case-2'],
      category: 'Posters & Typography',
      styles: ['Poster', 'Typography'],
      scenes: ['Campaign'],
      templateGuidance: ['Lock hierarchy and readable text.'],
      templatePitfalls: ['Avoid generic layouts.'],
    }, {
      subject: 'Spring launch',
      platform: 'Xiaohongshu cover',
      mainObject: '',
      requiredText: 'NEW DROP',
      visualStyle: 'Bold editorial poster',
      aspectRatio: '3:4',
      negativeRequirements: 'No unreadable text',
    }, 'en', 'Blank builder');

    expect(spec.templateId).toBe('poster-system');
    expect(spec.caseIds).toEqual(['case-1', 'case-2']);
    expect(spec.styles).toEqual(['Poster', 'Typography']);
    expect(spec.scenes).toEqual(['Campaign']);
    expect(spec.constraints).toEqual({
      aspectRatio: '3:4',
      requiredText: 'NEW DROP',
      negativeRequirements: 'No unreadable text',
    });

    const prompt = renderCreatorPrompt(spec);
    expect(prompt).toContain('Template guidance');
    expect(prompt).toContain('Avoid generic layouts.');
  });
});
