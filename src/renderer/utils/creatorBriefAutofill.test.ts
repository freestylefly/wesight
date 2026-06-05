import { describe, expect, test } from 'vitest';

import { applyCreatorBriefAutofill } from './creatorBriefAutofill';
import type { CreatorPromptForm } from './creatorStudio';

const createForm = (overrides: Partial<CreatorPromptForm> = {}): CreatorPromptForm => ({
  taskType: '',
  subject: '',
  platform: '',
  audience: '',
  mainObject: '',
  requiredText: '',
  visualStyle: '',
  colorPreference: '',
  aspectRatio: '',
  outputCount: '',
  negativeRequirements: '',
  templateFieldValues: {},
  ...overrides,
});

describe('creator brief autofill', () => {
  test('fills empty fields from a natural-language brief', () => {
    const result = applyCreatorBriefAutofill(
      createForm(),
      'Generate 3 Instagram poster images about Spring camera launch, 4:5, headline "NEW DROP", black white red palette, avoid unreadable text.'
    );

    expect(result.form.taskType).toBe('Poster');
    expect(result.form.platform).toBe('Instagram');
    expect(result.form.requiredText).toBe('NEW DROP');
    expect(result.form.aspectRatio).toBe('4:5');
    expect(result.form.outputCount).toBe('3');
    expect(result.form.colorPreference).toContain('black');
    expect(result.form.negativeRequirements).toContain('unreadable text');
    expect(result.changedFields).toContain('taskType');
  });

  test('does not overwrite fields the user already edited', () => {
    const result = applyCreatorBriefAutofill(
      createForm({
        taskType: 'UI screenshot',
        platform: 'Dashboard',
      }),
      'Generate 2 Instagram poster images, 4:5.'
    );

    expect(result.form.taskType).toBe('UI screenshot');
    expect(result.form.platform).toBe('Dashboard');
    expect(result.form.aspectRatio).toBe('4:5');
    expect(result.form.outputCount).toBe('2');
    expect(result.changedFields).not.toContain('taskType');
    expect(result.changedFields).not.toContain('platform');
  });
});
