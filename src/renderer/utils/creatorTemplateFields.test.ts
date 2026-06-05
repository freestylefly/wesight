import { describe, expect, test } from 'vitest';

import type { CreatorStudioTemplate } from '../types/creatorStudio';
import { CreatorTemplateFieldKind } from '../types/creatorStudio';
import { getCreatorTemplateFieldSchema } from './creatorTemplateFields';

const createTemplate = (overrides: Partial<CreatorStudioTemplate>): CreatorStudioTemplate => ({
  id: 'template',
  anchor: 'tpl-template',
  cover: null,
  title: { en: 'Template', zh: '模板' },
  description: { en: '', zh: '' },
  category: 'Other Use Cases',
  styles: [],
  scenes: [],
  tags: [],
  useWhen: { en: '', zh: '' },
  guidance: { en: [], zh: [] },
  pitfalls: { en: [], zh: [] },
  exampleCases: [],
  ...overrides,
});

describe('creator template fields', () => {
  test('returns different schemas for UI and poster templates', () => {
    const uiFields = getCreatorTemplateFieldSchema(createTemplate({
      id: 'ui-screenshot-system',
      category: 'UI & Interfaces',
    }));
    const posterFields = getCreatorTemplateFieldSchema(createTemplate({
      id: 'poster-layout-system',
      category: 'Posters & Typography',
    }));

    expect(uiFields.map((field) => field.id)).toContain('screenType');
    expect(uiFields.map((field) => field.id)).not.toContain('headline');
    expect(posterFields.map((field) => field.id)).toContain('headline');
    expect(posterFields.map((field) => field.id)).not.toContain('screenType');
  });

  test('prefers explicit template fieldSchema over category defaults', () => {
    const fields = getCreatorTemplateFieldSchema(createTemplate({
      category: 'UI & Interfaces',
      fieldSchema: [{
        id: 'customField',
        kind: CreatorTemplateFieldKind.Text,
        label: { en: 'Custom', zh: '自定义' },
      }],
    }));

    expect(fields.map((field) => field.id)).toEqual(['customField']);
  });
});
