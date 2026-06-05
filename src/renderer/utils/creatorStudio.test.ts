import { describe, expect, test } from 'vitest';

import { type CreatorBuilderMaterial, CreatorMaterialRole, CreatorMaterialSource, CreatorStudioSourceType } from '../types/creatorStudio';
import {
  buildPromptSpec,
  hasSeedreamApiConfig,
  renderCreatorCoworkDraft,
  renderCreatorPrompt,
  selectCreatorCreativeDirection,
} from './creatorStudio';

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

  test('renders cowork draft with creator studio context block', () => {
    const spec = buildPromptSpec({
      sourceType: CreatorStudioSourceType.Template,
      sourceId: 'poster-system',
      sourceTitle: 'Poster System',
      templateId: 'poster-system',
      caseIds: ['case-1'],
      styles: ['Poster'],
      scenes: ['Campaign'],
    }, {
      subject: 'Spring launch',
      platform: '',
      mainObject: '',
      requiredText: '',
      visualStyle: '',
      aspectRatio: '1:1',
      negativeRequirements: '',
    }, 'en', 'Blank builder');
    const promptText = renderCreatorPrompt(spec);

    const draft = renderCreatorCoworkDraft({
      promptSpec: spec,
      promptText,
      installedSkillIds: ['seedream'],
      missingSkillIds: ['gpt-image-2-style-library'],
    });

    expect(draft).toContain('[Creator Studio]');
    expect(draft).toContain('templateId: poster-system');
    expect(draft).toContain('caseIds: case-1');
    expect(draft).toContain('PromptSpec:');
    expect(draft).toContain('Prompt:');
    expect(draft).toContain('gpt-image-2-style-library');
  });

  test('renders material context pack and four differentiated directions', () => {
    const materials: CreatorBuilderMaterial[] = [{
      id: 'material-1',
      role: CreatorMaterialRole.Brand,
      source: CreatorMaterialSource.File,
      name: 'logo.png',
      path: '/Users/demo/brand/logo.png',
      mimeType: 'image/png',
      size: 1234,
      previewUrl: 'data:image/png;base64,AAAA',
      dataUrl: 'data:image/png;base64,AAAA',
      addedAt: 1,
    }, {
      id: 'material-2',
      role: CreatorMaterialRole.Negative,
      source: CreatorMaterialSource.File,
      name: 'avoid.jpg',
      path: '/Users/demo/avoid.jpg',
      mimeType: 'image/jpeg',
      size: 5678,
      previewUrl: 'data:image/jpeg;base64,BBBB',
      dataUrl: 'data:image/jpeg;base64,BBBB',
      addedAt: 2,
    }];
    const spec = buildPromptSpec(null, {
      subject: 'Launch poster',
      platform: 'Instagram',
      mainObject: 'Camera',
      requiredText: '',
      visualStyle: 'Premium editorial',
      aspectRatio: '4:5',
      negativeRequirements: '',
    }, 'en', 'Blank builder', materials);

    expect(spec.materials).toHaveLength(2);
    expect(spec.contextPack).toContain('role=brand');
    expect(spec.contextPack).toContain('/Users/demo/brand/logo.png');
    expect(spec.contextPack).toContain('attachment=base64');
    expect(spec.contextPack).toContain('localPath=available');
    expect(spec.contextPack).toContain('role=negative');
    expect(spec.creativeDirections).toHaveLength(4);
    expect(new Set(spec.creativeDirections?.map((direction) => direction.id)).size).toBe(4);

    const draft = renderCreatorCoworkDraft({
      promptSpec: spec,
      promptText: renderCreatorPrompt(spec),
      installedSkillIds: [],
      missingSkillIds: [],
    });
    expect(draft).toContain('Context Pack:');
    expect(draft).toContain('Creative Directions:');
    expect(draft).toContain('materials marked attachment=base64');
  });

  test('selects one creative direction into prompt and draft metadata', () => {
    const spec = buildPromptSpec({
      sourceType: CreatorStudioSourceType.Template,
      sourceId: 'poster-system',
      sourceTitle: 'Poster System',
      templateId: 'poster-system',
      caseIds: ['case-1'],
      variantOfAssetId: 'asset-parent',
    }, {
      subject: 'Spring launch',
      platform: '',
      mainObject: '',
      requiredText: '',
      visualStyle: '',
      aspectRatio: '1:1',
      negativeRequirements: '',
    }, 'en', 'Blank builder');
    const selectedSpec = selectCreatorCreativeDirection(spec, 'bold-campaign');
    const prompt = renderCreatorPrompt(selectedSpec);
    const draft = renderCreatorCoworkDraft({
      promptSpec: selectedSpec,
      promptText: prompt,
      installedSkillIds: [],
      missingSkillIds: [],
    });

    expect(selectedSpec.selectedCreativeDirectionId).toBe('bold-campaign');
    expect(prompt).toContain('Selected creative direction');
    expect(prompt).toContain('Bold campaign');
    expect(draft).toContain('Selected Creative Direction:');
    expect(draft).toContain('variantOfAssetId: asset-parent');
  });

  test('adds image generation intent to cowork draft when requested', () => {
    const spec = buildPromptSpec({
      sourceType: CreatorStudioSourceType.Template,
      sourceId: 'poster-system',
      sourceTitle: 'Poster System',
      templateId: 'poster-system',
      caseIds: ['case-1'],
    }, {
      subject: 'Spring launch',
      platform: '',
      mainObject: '',
      requiredText: '',
      visualStyle: '',
      aspectRatio: '1:1',
      negativeRequirements: '',
    }, 'en', 'Blank builder');

    const draft = renderCreatorCoworkDraft({
      promptSpec: spec,
      promptText: renderCreatorPrompt(spec),
      installedSkillIds: ['seedream'],
      missingSkillIds: [],
      requestImageGeneration: true,
    });

    expect(draft).toContain('if the Seedream skill and API configuration are available, generate the image first');
  });

  test('detects seedream API configuration keys', () => {
    expect(hasSeedreamApiConfig({ ARK_API_KEY: 'secret' })).toBe(true);
    expect(hasSeedreamApiConfig({ apiKey: 'secret' })).toBe(true);
    expect(hasSeedreamApiConfig({ ARK_API_KEY: '   ' })).toBe(false);
    expect(hasSeedreamApiConfig({ model: 'doubao-seedream' })).toBe(false);
  });
});
