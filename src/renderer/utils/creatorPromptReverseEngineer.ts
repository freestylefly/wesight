import type { CreatorPromptReferenceAnalysis } from '../types/creatorStudio';
import type { CreatorPromptForm } from './creatorStudio';

export interface CreatorPromptReverseEngineeringResult {
  analysis: CreatorPromptReferenceAnalysis;
  formDraft: Partial<CreatorPromptForm>;
}

const SECTION_HEADING_PATTERN = /^([A-Z][A-Z0-9 /&(),.-]{2,}|[\u3400-\u9fffA-Za-z0-9 /&(),.-]{2,})[:：]\s*$/;
const ASPECT_RATIO_PATTERN = /\b(\d{1,2})\s*[:x]\s*(\d{1,2})\b/i;

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const truncate = (value: string, maxLength: number): string => (
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
);

const extractAspectRatio = (prompt: string): string => {
  const outputLine = prompt
    .split('\n')
    .find((line) => /aspect ratio|output|比例|画幅|尺寸/i.test(line) && ASPECT_RATIO_PATTERN.test(line));
  const match = (outputLine ?? prompt).match(ASPECT_RATIO_PATTERN);
  return match ? `${match[1]}:${match[2]}` : '';
};

const extractSectionSummaries = (prompt: string): string[] => {
  const lines = prompt.split('\n').map((line) => line.trim());
  const sections: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!SECTION_HEADING_PATTERN.test(line)) {
      continue;
    }
    const body = lines
      .slice(index + 1)
      .filter(Boolean)
      .slice(0, 3)
      .join(' ');
    if (body) {
      sections.push(`${line.replace(/[:：]\s*$/, '')}: ${truncate(normalizeWhitespace(body), 180)}`);
    }
  }
  return sections.slice(0, 5);
};

const extractLinesByKeyword = (prompt: string, keywords: RegExp, limit: number): string[] => (
  prompt
    .split('\n')
    .map((line) => normalizeWhitespace(line.replace(/^[-*]\s*/, '')))
    .filter((line) => line.length > 0 && keywords.test(line))
    .map((line) => truncate(line, 160))
    .slice(0, limit)
);

export const reverseEngineerCreatorPrompt = (
  prompt: string,
  fallbackSubject: string
): CreatorPromptReverseEngineeringResult => {
  const aspectRatio = extractAspectRatio(prompt);
  const structure = extractSectionSummaries(prompt);
  const styleNotes = extractLinesByKeyword(
    prompt,
    /style|atmosphere|lighting|aesthetic|tone|quality|visual|风格|氛围|光线|质感|画面/i,
    4
  );
  const textNotes = extractLinesByKeyword(
    prompt,
    /text|typography|headline|label|caption|文字|标题|字体|标签/i,
    3
  );
  const constraintNotes = extractLinesByKeyword(
    prompt,
    /avoid|no |do not|without|negative|避免|不要|禁止|负向/i,
    3
  );
  const analysis: CreatorPromptReferenceAnalysis = {
    aspectRatio,
    structure,
    styleNotes,
    textNotes,
    constraintNotes,
  };
  return {
    analysis,
    formDraft: {
      subject: fallbackSubject,
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(styleNotes.length > 0 ? { visualStyle: styleNotes.join('; ') } : {}),
      ...(constraintNotes.length > 0 ? { negativeRequirements: constraintNotes.join('\n') } : {}),
    },
  };
};
