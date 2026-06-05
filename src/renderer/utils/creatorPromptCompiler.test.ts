import { describe, expect, test } from 'vitest';

import {
  type CreatorBuilderMaterial,
  CreatorMaterialRole,
  CreatorMaterialSource,
  CreatorPromptSourceMode,
  CreatorStudioSourceType,
  CreatorTemplateFieldKind,
} from '../types/creatorStudio';
import {
  compileCreatorDirectionPrompt,
  compileCreatorPrompt,
  CreatorPromptCompileTarget,
} from './creatorPromptCompiler';
import { CreatorPromptSpecSchemaVersion } from './creatorPromptSpecAdapter';
import { buildPromptSpec, type CreatorPromptForm } from './creatorStudio';

const createPromptForm = (overrides: Partial<CreatorPromptForm> = {}): CreatorPromptForm => ({
  taskType: 'Campaign image',
  subject: 'Spring launch',
  platform: 'Instagram',
  audience: 'New customers',
  mainObject: 'Mirrorless camera',
  requiredText: 'NEW DROP',
  visualStyle: 'Premium editorial',
  colorPreference: 'black, white, red',
  aspectRatio: '4:5',
  outputCount: '2',
  negativeRequirements: 'No unreadable text',
  templateFieldValues: {
    headline: 'NEW DROP',
  },
  ...overrides,
});

const createPromptSpec = () => buildPromptSpec({
  sourceType: CreatorStudioSourceType.Template,
  sourceMode: CreatorPromptSourceMode.TemplateDraft,
  sourceId: 'poster-system',
  sourceTitle: 'Poster System',
  templateId: 'poster-system',
  caseIds: ['case-1'],
  styles: ['Poster'],
  scenes: ['Campaign'],
  templateGuidance: ['Keep text readable.'],
  templatePitfalls: ['Avoid generic layouts.'],
  templateFieldSchema: [{
    id: 'headline',
    kind: CreatorTemplateFieldKind.Text,
    label: { en: 'Headline', zh: '主标题' },
  }],
}, createPromptForm(), 'en', 'Blank builder');

describe('creator prompt compiler', () => {
  test('compiles copy text with PromptSpecV1 snapshot', () => {
    const compiled = compileCreatorPrompt({
      spec: createPromptSpec(),
      target: CreatorPromptCompileTarget.CopyText,
    });

    expect(compiled.target).toBe(CreatorPromptCompileTarget.CopyText);
    expect(compiled.promptText).toContain('Generate a professional visual image.');
    expect(compiled.promptText).toContain('Task type: Campaign image');
    expect(compiled.promptText).toContain('Template fields');
    expect(compiled.promptText).toContain('Headline: NEW DROP');
    expect(compiled.promptSpec.schemaVersion).toBe(CreatorPromptSpecSchemaVersion.V1);
    expect(compiled.promptSpec.templateId).toBe('poster-system');
    expect(compiled.promptSpec.source).toMatchObject({
      mode: CreatorPromptSourceMode.TemplateDraft,
      templateId: 'poster-system',
      caseIds: ['case-1'],
    });
    expect(compiled.promptSpec.brief).toMatchObject({
      subject: 'Spring launch',
      audience: 'New customers',
    });
  });

  test('compiles cowork draft with runtime metadata and image attachments', () => {
    const materials: CreatorBuilderMaterial[] = [{
      id: 'material-1',
      role: CreatorMaterialRole.Reference,
      source: CreatorMaterialSource.File,
      name: 'reference.png',
      path: '/Users/demo/reference.png',
      mimeType: 'image/png',
      size: 1024,
      previewUrl: 'data:image/png;base64,AAAA',
      dataUrl: 'data:image/png;base64,AAAA',
      addedAt: 1,
    }, {
      id: 'material-2',
      role: CreatorMaterialRole.Source,
      source: CreatorMaterialSource.File,
      name: 'brief.txt',
      path: '/Users/demo/brief.txt',
      mimeType: 'text/plain',
      size: 512,
      previewUrl: '',
      dataUrl: 'plain text',
      addedAt: 2,
    }];
    const spec = createPromptSpec();

    const compiled = compileCreatorPrompt({
      spec,
      target: CreatorPromptCompileTarget.CoworkDraft,
      materials,
      runtime: {
        installedSkillIds: ['seedream'],
        missingSkillIds: ['gpt-image-2-style-library'],
        requestImageGeneration: true,
      },
    });

    expect(compiled.target).toBe(CreatorPromptCompileTarget.CoworkDraft);
    expect(compiled.draftText).toContain('[Creator Studio]');
    expect(compiled.draftText).toContain('templateId: poster-system');
    expect(compiled.draftText).toContain('generate the image first');
    expect(compiled.promptSpec.runtime).toMatchObject({
      activeSkillIds: ['seedream'],
      missingSkillIds: ['gpt-image-2-style-library'],
      requestImageGeneration: true,
    });
    expect(compiled.attachments).toEqual([{
      path: '/Users/demo/reference.png',
      name: 'reference.png',
      isImage: true,
      dataUrl: 'data:image/png;base64,AAAA',
    }]);
  });

  test('compiles selected direction without all direction alternatives', () => {
    const compiled = compileCreatorDirectionPrompt(createPromptSpec(), 'bold-campaign');

    expect(compiled.promptSpec.selectedCreativeDirectionId).toBe('bold-campaign');
    expect(compiled.promptText).toContain('Selected creative direction');
    expect(compiled.promptText).toContain('Bold campaign');
    expect(compiled.promptText).not.toContain('Four differentiated creative directions');
    expect(compiled.promptText).not.toContain('Clarity hero');
  });
});
