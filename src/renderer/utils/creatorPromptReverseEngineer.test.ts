import { describe, expect, test } from 'vitest';

import { reverseEngineerCreatorPrompt } from './creatorPromptReverseEngineer';

describe('creator prompt reverse engineer', () => {
  test('extracts editable draft fields and structure from a case prompt', () => {
    const result = reverseEngineerCreatorPrompt([
      'A cinematic character promotional poster of [SUBJECT].',
      '',
      'STRUCTURE:',
      'Top-heavy hierarchical layout with a large recognizable silhouette.',
      'The lower section contains the full-body version as a secondary subject.',
      '',
      'STYLE & ATMOSPHERE:',
      'Large areas of negative space, ink-wash diffusion edges, calm premium cinematic tone.',
      '',
      'OUTPUT:',
      '9:16 aspect ratio, poster-ready composition.',
    ].join('\n'), 'Character poster');

    expect(result.analysis.aspectRatio).toBe('9:16');
    expect(result.analysis.structure[0]).toContain('STRUCTURE');
    expect(result.analysis.styleNotes[0]).toContain('STYLE & ATMOSPHERE');
    expect(result.formDraft.subject).toBe('Character poster');
    expect(result.formDraft.aspectRatio).toBe('9:16');
    expect(result.formDraft.visualStyle).toContain('STYLE & ATMOSPHERE');
  });
});
