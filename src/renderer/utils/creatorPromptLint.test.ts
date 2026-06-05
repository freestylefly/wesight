import { describe, expect, test } from 'vitest';

import type { CreatorPromptSpec } from '../types/creatorStudio';
import { CreatorPromptSourceMode, CreatorStudioSourceType } from '../types/creatorStudio';
import { CreatorPromptLintSeverity, lintCreatorPromptSpec } from './creatorPromptLint';

const createPromptSpec = (overrides: Partial<CreatorPromptSpec> = {}): CreatorPromptSpec => ({
  sourceType: CreatorStudioSourceType.Template,
  sourceMode: CreatorPromptSourceMode.Blank,
  sourceId: 'blank',
  sourceTitle: 'Blank builder',
  language: 'en',
  caseIds: [],
  styles: [],
  scenes: [],
  taskType: 'Poster',
  subject: 'Spring launch',
  platform: 'Instagram',
  audience: '',
  mainObject: '',
  visualStyle: 'Premium editorial',
  colorPreference: '',
  outputCount: '2',
  constraints: {
    aspectRatio: '4:5',
  },
  templateGuidance: [],
  templatePitfalls: [],
  templateFieldValues: {},
  ...overrides,
});

describe('creator prompt lint', () => {
  test('returns a clean score for a basic executable prompt spec', () => {
    const result = lintCreatorPromptSpec(createPromptSpec());

    expect(result.score).toBe(100);
    expect(result.issues).toEqual([]);
  });

  test('blocks execution when subject and aspect ratio are missing', () => {
    const result = lintCreatorPromptSpec(createPromptSpec({
      subject: '',
      mainObject: '',
      constraints: {},
    }));

    expect(result.issues.map((issue) => issue.code)).toContain('subject_missing');
    expect(result.issues.map((issue) => issue.code)).toContain('aspect_ratio_missing');
    expect(result.issues.some((issue) => issue.severity === CreatorPromptLintSeverity.Error)).toBe(true);
  });

  test('warns on long required text and invalid output count', () => {
    const result = lintCreatorPromptSpec(createPromptSpec({
      outputCount: 'many',
      constraints: {
        aspectRatio: '4:5',
        requiredText: 'A very long required text line that is likely to be unreadable inside a generated image layout because it asks for too much copy',
      },
    }));

    expect(result.issues.map((issue) => issue.code)).toContain('required_text_too_long');
    expect(result.issues.map((issue) => issue.code)).toContain('output_count_invalid');
    expect(result.issues.every((issue) => issue.severity !== CreatorPromptLintSeverity.Error)).toBe(true);
  });

  test('flags unavailable materials', () => {
    const result = lintCreatorPromptSpec(createPromptSpec({
      materials: [{
        id: 'material-1',
        role: 'reference',
        source: 'file',
        name: 'missing.png',
        path: 'missing.png',
        mimeType: 'image/png',
        hasImageAttachment: false,
        localPathAvailable: false,
      }],
    }));

    expect(result.issues.map((issue) => issue.code)).toContain('material_unavailable');
  });
});
