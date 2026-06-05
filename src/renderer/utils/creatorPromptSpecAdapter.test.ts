import { describe, expect, test } from 'vitest';

import {
  CreatorPromptSourceMode,
  type CreatorPromptSpec,
  CreatorStudioSourceType,
  CreatorTemplateFieldKind,
} from '../types/creatorStudio';
import { CreatorPromptSpecSchemaVersion, toCreatorPromptSpecSnapshot } from './creatorPromptSpecAdapter';

const createPromptSpec = (overrides: Partial<CreatorPromptSpec> = {}): CreatorPromptSpec => ({
  sourceType: CreatorStudioSourceType.Template,
  sourceMode: CreatorPromptSourceMode.TemplateDraft,
  sourceId: 'poster-system',
  sourceTitle: 'Poster System',
  language: 'en',
  category: 'Posters & Typography',
  caseIds: ['case-1'],
  styles: ['Poster'],
  scenes: ['Campaign'],
  taskType: 'Poster',
  subject: 'Spring launch',
  platform: 'Instagram',
  audience: 'New customers',
  mainObject: 'Camera',
  visualStyle: 'Premium editorial',
  colorPreference: 'black, white, red',
  outputCount: '2',
  constraints: {
    aspectRatio: '4:5',
    requiredText: 'NEW DROP',
    negativeRequirements: 'No unreadable text',
  },
  templateGuidance: ['Keep text readable.'],
  templatePitfalls: ['Avoid generic layouts.'],
  templateFieldValues: {
    headline: 'NEW DROP',
  },
  templateFieldSchema: [{
    id: 'headline',
    kind: CreatorTemplateFieldKind.Text,
    label: { en: 'Headline', zh: '主标题' },
  }],
  templateId: 'poster-system',
  ...overrides,
});

describe('creator prompt spec adapter', () => {
  test('keeps legacy fields and adds PromptSpecV1 sections', () => {
    const snapshot = toCreatorPromptSpecSnapshot(createPromptSpec());

    expect(snapshot.schemaVersion).toBe(CreatorPromptSpecSchemaVersion.V1);
    expect(snapshot.templateId).toBe('poster-system');
    expect(snapshot.source).toMatchObject({
      mode: CreatorPromptSourceMode.TemplateDraft,
      sourceType: CreatorStudioSourceType.Template,
      sourceId: 'poster-system',
      templateId: 'poster-system',
      caseIds: ['case-1'],
    });
    expect(snapshot.brief).toMatchObject({
      taskType: 'Poster',
      subject: 'Spring launch',
      platform: 'Instagram',
      audience: 'New customers',
    });
    expect(snapshot.composition).toMatchObject({
      aspectRatio: '4:5',
      mainObject: 'Camera',
    });
    expect(snapshot.style).toMatchObject({
      visualStyle: 'Premium editorial',
      colorPreference: 'black, white, red',
    });
    expect(snapshot.text).toMatchObject({
      requiredText: 'NEW DROP',
      negativeRequirements: 'No unreadable text',
    });
    expect(snapshot.template).toMatchObject({
      templateId: 'poster-system',
      fields: [{
        id: 'headline',
        label: { en: 'Headline', zh: '主标题' },
        value: 'NEW DROP',
      }],
    });
  });
});
