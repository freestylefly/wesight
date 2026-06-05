import {
  ArrowDownIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpIcon,
  Bars3Icon,
  ClipboardDocumentIcon,
  DocumentDuplicateIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  RocketLaunchIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { CreatorProductionAssetRecord } from '@shared/creatorStudio/types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import casesData from '../../data/creatorStudio/cases.json';
import manifestData from '../../data/creatorStudio/manifest.json';
import styleLibraryData from '../../data/creatorStudio/style-library.json';
import { i18nService } from '../../services/i18n';
import { skillService } from '../../services/skill';
import { RootState } from '../../store';
import { setActiveSkillIds, setSkills } from '../../store/slices/skillSlice';
import type {
  CreatorBuilderMaterial,
  CreatorPromptSpec,
  CreatorStudioCase,
  CreatorStudioManifest,
  CreatorStudioStyleLibrary,
  CreatorStudioTemplate,
} from '../../types/creatorStudio';
import { CreatorMaterialRole, CreatorMaterialSource, CreatorStudioSourceType } from '../../types/creatorStudio';
import {
  buildPromptSpec,
  CREATOR_MATERIAL_ROLE_LABELS,
  CREATOR_STUDIO_RECOMMENDED_SKILL_IDS,
  type CreatorPromptForm,
  type CreatorPromptSeed,
  CreatorStudioRecommendedSkillId,
  hasSeedreamApiConfig,
  normalizePromptLanguage,
  renderCreatorCoworkDraft,
  renderCreatorPrompt,
  selectCreatorCreativeDirection,
} from '../../utils/creatorStudio';
import { CreatorAssetGrid } from './CreatorAssetGrid';

const cases = casesData as CreatorStudioCase[];
const styleLibrary = styleLibraryData as CreatorStudioStyleLibrary;
const manifest = manifestData as CreatorStudioManifest;

const CreatorStudioTab = {
  Gallery: 'gallery',
  Templates: 'templates',
  Builder: 'builder',
  Assets: 'assets',
} as const;

type CreatorStudioTab = typeof CreatorStudioTab[keyof typeof CreatorStudioTab];

interface CreatorStudioViewProps {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onSendToCowork: (draft: string, options: CreatorCoworkSendOptions) => void | Promise<void>;
  onOpenCoworkSession: (sessionId: string) => Promise<boolean>;
  updateBadge?: React.ReactNode;
}

interface CreatorCoworkSendOptions {
  activeSkillIds: string[];
  preferCreativeProducer?: boolean;
  attachments?: CreatorCoworkDraftAttachment[];
}

interface CreatorCoworkDraftAttachment {
  path: string;
  name: string;
  isImage?: boolean;
  dataUrl?: string;
}

const SeedreamStatus = {
  Missing: 'missing',
  Checking: 'checking',
  NeedsConfig: 'needs_config',
  Configured: 'configured',
} as const;

type SeedreamStatus = typeof SeedreamStatus[keyof typeof SeedreamStatus];

const CASE_PAGE_SIZE = 80;

const defaultBuilderForm: CreatorPromptForm = {
  subject: '',
  platform: '',
  mainObject: '',
  requiredText: '',
  visualStyle: '',
  aspectRatio: '1:1',
  negativeRequirements: '',
};

const dispatchToast = (message: string) => {
  window.dispatchEvent(new CustomEvent('app:showToast', { detail: message }));
};

const getText = (value: { zh: string; en: string }) => value[i18nService.getLanguage()];

const copyText = async (text: string) => {
  await navigator.clipboard.writeText(text);
  dispatchToast(i18nService.t('copied'));
};

const PlaceholderImage: React.FC<{
  src: string | null;
  alt: string;
  className?: string;
}> = ({ src, alt, className = '' }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-surface-raised text-muted ${className}`}>
        <PhotoIcon className="h-10 w-10" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
};

const CreatorStudioView: React.FC<CreatorStudioViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onSendToCowork,
  onOpenCoworkSession,
  updateBadge,
}) => {
  const dispatch = useDispatch();
  const skills = useSelector((state: RootState) => state.skill.skills);
  const [activeTab, setActiveTab] = useState<CreatorStudioTab>(CreatorStudioTab.Gallery);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [style, setStyle] = useState('');
  const [scene, setScene] = useState('');
  const [selectedCase, setSelectedCase] = useState<CreatorStudioCase | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<CreatorStudioTemplate | null>(null);
  const [builderSeed, setBuilderSeed] = useState<CreatorPromptSeed | null>(null);
  const [builderForm, setBuilderForm] = useState<CreatorPromptForm>(defaultBuilderForm);
  const [builderMaterials, setBuilderMaterials] = useState<CreatorBuilderMaterial[]>([]);
  const [visibleCaseCount, setVisibleCaseCount] = useState(CASE_PAGE_SIZE);
  const [seedreamStatus, setSeedreamStatus] = useState<SeedreamStatus>(SeedreamStatus.Missing);
  const [isSendingToCowork, setIsSendingToCowork] = useState(false);

  useEffect(() => {
    void skillService.loadSkills().then((loadedSkills) => {
      dispatch(setSkills(loadedSkills));
    });
  }, [dispatch]);

  const searchableLabels = useMemo(() => {
    const labels = new Map<string, string[]>();
    for (const categoryItem of styleLibrary.categories) {
      labels.set(categoryItem.value, [
        categoryItem.title.en,
        categoryItem.title.zh,
        categoryItem.description.en,
        categoryItem.description.zh,
      ]);
    }
    for (const styleItem of styleLibrary.styles) {
      labels.set(styleItem.value, [styleItem.title.en, styleItem.title.zh, ...styleItem.keywords]);
    }
    for (const sceneItem of styleLibrary.scenes) {
      labels.set(sceneItem.value, [sceneItem.title.en, sceneItem.title.zh, ...sceneItem.keywords]);
    }
    return labels;
  }, []);

  const filteredCases = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return cases.filter((item) => {
      const matchesQuery = !normalizedQuery || [
        item.title,
        item.prompt,
        item.sourceLabel,
        item.category,
        ...item.styles,
        ...item.scenes,
        ...item.tags,
        ...(searchableLabels.get(item.category) ?? []),
        ...item.styles.flatMap((tag) => searchableLabels.get(tag) ?? []),
        ...item.scenes.flatMap((tag) => searchableLabels.get(tag) ?? []),
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesCategory = !category || item.category === category;
      const matchesStyle = !style || item.styles.includes(style);
      const matchesScene = !scene || item.scenes.includes(scene);
      return matchesQuery && matchesCategory && matchesStyle && matchesScene;
    });
  }, [category, query, scene, searchableLabels, style]);

  const templateCasesById = useMemo(() => new Map(cases.map((item) => [item.sourceCaseId, item])), []);
  const visibleCases = filteredCases.slice(0, visibleCaseCount);
  const installedRecommendedSkillIds = useMemo(() => {
    const availableSkillIds = new Set(skills.map((skill) => skill.id));
    return CREATOR_STUDIO_RECOMMENDED_SKILL_IDS.filter((skillId) => availableSkillIds.has(skillId));
  }, [skills]);
  const missingRecommendedSkillIds = useMemo(() => {
    const installed = new Set(installedRecommendedSkillIds);
    return CREATOR_STUDIO_RECOMMENDED_SKILL_IDS.filter((skillId) => !installed.has(skillId));
  }, [installedRecommendedSkillIds]);

  useEffect(() => {
    let cancelled = false;
    const seedreamInstalled = skills.some((skill) => skill.id === CreatorStudioRecommendedSkillId.Seedream);
    if (!seedreamInstalled) {
      setSeedreamStatus(SeedreamStatus.Missing);
      return () => {
        cancelled = true;
      };
    }

    setSeedreamStatus(SeedreamStatus.Checking);
    void skillService.getSkillConfig(CreatorStudioRecommendedSkillId.Seedream)
      .then((config) => {
        if (cancelled) return;
        setSeedreamStatus(hasSeedreamApiConfig(config) ? SeedreamStatus.Configured : SeedreamStatus.NeedsConfig);
      })
      .catch(() => {
        if (cancelled) return;
        setSeedreamStatus(SeedreamStatus.NeedsConfig);
      });

    return () => {
      cancelled = true;
    };
  }, [skills]);

  useEffect(() => {
    setVisibleCaseCount(CASE_PAGE_SIZE);
  }, [category, query, scene, style]);

  const startFromCase = (item: CreatorStudioCase) => {
    setBuilderSeed({
      sourceType: CreatorStudioSourceType.Case,
      sourceId: item.id,
      sourceTitle: item.title,
      referencePrompt: item.prompt,
      caseIds: [item.id],
      category: item.category,
      styles: item.styles,
      scenes: item.scenes,
    });
    setBuilderForm({
      ...defaultBuilderForm,
      subject: item.title,
      visualStyle: [...item.styles, ...item.scenes].join(', '),
    });
    setActiveTab(CreatorStudioTab.Builder);
  };

  const startFromTemplate = (template: CreatorStudioTemplate) => {
    setBuilderSeed({
      sourceType: CreatorStudioSourceType.Template,
      sourceId: template.id,
      sourceTitle: getText(template.title),
      templateId: template.id,
      caseIds: template.exampleCases.map((sourceCaseId) => `case-${sourceCaseId}`),
      category: template.category,
      styles: template.styles,
      scenes: template.scenes,
      templateGuidance: template.guidance[i18nService.getLanguage()],
      templatePitfalls: template.pitfalls[i18nService.getLanguage()],
    });
    setBuilderForm({
      ...defaultBuilderForm,
      visualStyle: [...template.styles, ...template.scenes].join(', '),
    });
    setActiveTab(CreatorStudioTab.Builder);
  };

  const openExampleCase = (sourceCaseId: number) => {
    const item = templateCasesById.get(sourceCaseId);
    if (!item) return;
    setSelectedTemplate(null);
    setSelectedCase(item);
    setActiveTab(CreatorStudioTab.Gallery);
  };

  const useAssetAsReference = (asset: CreatorProductionAssetRecord) => {
    setBuilderSeed({
      sourceType: CreatorStudioSourceType.Template,
      sourceId: asset.id,
      sourceTitle: asset.fileName,
      referencePrompt: asset.promptText || (asset.promptSpec ? JSON.stringify(asset.promptSpec, null, 2) : undefined),
      templateId: asset.templateId ?? undefined,
      caseIds: asset.caseIds,
      category: typeof asset.promptSpec?.category === 'string' ? asset.promptSpec.category : undefined,
      styles: Array.isArray(asset.promptSpec?.styles) ? asset.promptSpec.styles : [],
      scenes: Array.isArray(asset.promptSpec?.scenes) ? asset.promptSpec.scenes : [],
      templateGuidance: Array.isArray(asset.promptSpec?.templateGuidance) ? asset.promptSpec.templateGuidance : [],
      templatePitfalls: Array.isArray(asset.promptSpec?.templatePitfalls) ? asset.promptSpec.templatePitfalls : [],
      variantOfAssetId: asset.id,
    });
    setBuilderForm({
      subject: asset.promptSpec?.subject ?? asset.fileName,
      platform: asset.promptSpec?.platform ?? '',
      mainObject: asset.promptSpec?.mainObject ?? '',
      requiredText: asset.promptSpec?.constraints?.requiredText ?? '',
      visualStyle: asset.promptSpec?.visualStyle ?? '',
      aspectRatio: asset.promptSpec?.constraints?.aspectRatio ?? '1:1',
      negativeRequirements: asset.promptSpec?.constraints?.negativeRequirements ?? '',
    });
    setBuilderMaterials((items) => [{
      id: createMaterialId(),
      role: CreatorMaterialRole.Reference,
      source: CreatorMaterialSource.File,
      name: asset.fileName,
      path: asset.filePath,
      mimeType: asset.mimeType || 'image/png',
      size: 0,
      previewUrl: encodeLocalFileSrc(asset.filePath),
      addedAt: Date.now(),
    }, ...items]);
    setActiveTab(CreatorStudioTab.Builder);
  };

  const sendToCowork = async (
    promptSpec: CreatorPromptSpec,
    promptText: string,
    materials: CreatorBuilderMaterial[],
    requestImageGeneration = false
  ) => {
    setIsSendingToCowork(true);
    try {
      dispatch(setActiveSkillIds(installedRecommendedSkillIds));
      await onSendToCowork(renderCreatorCoworkDraft({
        promptSpec,
        promptText,
        installedSkillIds: installedRecommendedSkillIds,
        missingSkillIds: missingRecommendedSkillIds,
        requestImageGeneration,
      }), {
        activeSkillIds: installedRecommendedSkillIds,
        preferCreativeProducer: true,
        attachments: materials.filter((material) => material.dataUrl?.startsWith('data:image/')).map((material) => ({
          path: material.path,
          name: material.name,
          isImage: true,
          dataUrl: material.dataUrl,
        })),
      });
    } catch {
      dispatchToast(i18nService.t('creatorSendToCoworkFailed'));
    } finally {
      setIsSendingToCowork(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
            aria-label={i18nService.t('expand')}
          >
            <Bars3Icon className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{i18nService.t('creatorStudioTitle')}</h1>
          <div className="mt-0.5 text-xs text-muted">
            {i18nService.t('creatorStudioDataSummary')
              .replace('{cases}', String(manifest.counts.cases))
              .replace('{templates}', String(manifest.counts.templates))}
          </div>
        </div>
        {updateBadge}
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <TabButton active={activeTab === CreatorStudioTab.Gallery} onClick={() => setActiveTab(CreatorStudioTab.Gallery)}>
          {i18nService.t('creatorGalleryTab')}
        </TabButton>
        <TabButton active={activeTab === CreatorStudioTab.Templates} onClick={() => setActiveTab(CreatorStudioTab.Templates)}>
          {i18nService.t('creatorTemplatesTab')}
        </TabButton>
        <TabButton active={activeTab === CreatorStudioTab.Builder} onClick={() => setActiveTab(CreatorStudioTab.Builder)}>
          {i18nService.t('creatorBuilderTab')}
        </TabButton>
        <TabButton active={activeTab === CreatorStudioTab.Assets} onClick={() => setActiveTab(CreatorStudioTab.Assets)}>
          {i18nService.t('creatorAssetsTab')}
        </TabButton>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === CreatorStudioTab.Gallery && (
          <Gallery
            query={query}
            category={category}
            style={style}
            scene={scene}
            cases={visibleCases}
            totalCount={filteredCases.length}
            hasMore={visibleCaseCount < filteredCases.length}
            onQueryChange={setQuery}
            onCategoryChange={setCategory}
            onStyleChange={setStyle}
            onSceneChange={setScene}
            onClearFilters={() => {
              setQuery('');
              setCategory('');
              setStyle('');
              setScene('');
            }}
            onSelectCase={setSelectedCase}
            onUseCase={startFromCase}
            onLoadMore={() => setVisibleCaseCount((count) => count + CASE_PAGE_SIZE)}
          />
        )}
        {activeTab === CreatorStudioTab.Templates && (
          <TemplateLibrary
            templates={styleLibrary.templates}
            templateCasesById={templateCasesById}
            onSelectTemplate={setSelectedTemplate}
            onUseTemplate={startFromTemplate}
          />
        )}
        {activeTab === CreatorStudioTab.Builder && (
          <PromptBuilder
            seed={builderSeed}
            form={builderForm}
            onFormChange={setBuilderForm}
            materials={builderMaterials}
            onMaterialsChange={setBuilderMaterials}
            installedSkillIds={installedRecommendedSkillIds}
            missingSkillIds={missingRecommendedSkillIds}
            seedreamStatus={seedreamStatus}
            isSendingToCowork={isSendingToCowork}
            onSendToCowork={sendToCowork}
          />
        )}
        {activeTab === CreatorStudioTab.Assets && (
          <CreatorAssetGrid
            onOpenCoworkSession={onOpenCoworkSession}
            onUseAssetAsReference={useAssetAsReference}
          />
        )}
      </main>

      {selectedCase && (
        <CaseDrawer
          item={selectedCase}
          onClose={() => setSelectedCase(null)}
          onUseCase={startFromCase}
        />
      )}
      {selectedTemplate && (
        <TemplateDrawer
          template={selectedTemplate}
          templateCasesById={templateCasesById}
          onClose={() => setSelectedTemplate(null)}
          onUseTemplate={startFromTemplate}
          onOpenExampleCase={openExampleCase}
        />
      )}
    </div>
  );
};

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-primary text-white'
        : 'text-secondary hover:bg-surface-raised hover:text-foreground'
    }`}
  >
    {children}
  </button>
);

const Gallery: React.FC<{
  query: string;
  category: string;
  style: string;
  scene: string;
  cases: CreatorStudioCase[];
  totalCount: number;
  hasMore: boolean;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onSceneChange: (value: string) => void;
  onClearFilters: () => void;
  onSelectCase: (item: CreatorStudioCase) => void;
  onUseCase: (item: CreatorStudioCase) => void;
  onLoadMore: () => void;
}> = ({
  query,
  category,
  style,
  scene,
  cases: filteredCases,
  totalCount,
  hasMore,
  onQueryChange,
  onCategoryChange,
  onStyleChange,
  onSceneChange,
  onClearFilters,
  onSelectCase,
  onUseCase,
  onLoadMore,
}) => (
  <section className="space-y-4 p-4">
    <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_160px_160px_auto]">
      <label className="relative block">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={i18nService.t('creatorSearchPlaceholder')}
          className="h-10 w-full rounded-lg border border-border bg-surface px-9 text-sm outline-none focus:border-primary"
        />
      </label>
      <FilterSelect value={category} onChange={onCategoryChange} label={i18nService.t('creatorFilterCategory')}>
        {styleLibrary.categories.map((item) => (
          <option key={item.id} value={item.value}>{getText(item.title)}</option>
        ))}
      </FilterSelect>
      <FilterSelect value={style} onChange={onStyleChange} label={i18nService.t('creatorFilterStyle')}>
        {styleLibrary.styles.map((item) => (
          <option key={item.id} value={item.value}>{getText(item.title)}</option>
        ))}
      </FilterSelect>
      <FilterSelect value={scene} onChange={onSceneChange} label={i18nService.t('creatorFilterScene')}>
        {styleLibrary.scenes.map((item) => (
          <option key={item.id} value={item.value}>{getText(item.title)}</option>
        ))}
      </FilterSelect>
      <button
        type="button"
        onClick={onClearFilters}
        className="h-10 rounded-lg border border-border px-3 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
      >
        {i18nService.t('creatorClearFilters')}
      </button>
    </div>
    <div className="text-xs text-muted">
      {i18nService.t('creatorResultCount').replace('{count}', String(totalCount))}
    </div>
    {totalCount === 0 ? (
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface text-center">
        <PhotoIcon className="h-10 w-10 text-muted" />
        <div className="mt-3 text-sm font-medium">{i18nService.t('creatorEmptyTitle')}</div>
        <div className="mt-1 text-xs text-muted">{i18nService.t('creatorEmptyHint')}</div>
      </div>
    ) : (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredCases.map((item) => (
            <CaseCard key={item.id} item={item} onSelect={onSelectCase} onUseCase={onUseCase} />
          ))}
        </div>
        {hasMore && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={onLoadMore}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              {i18nService.t('creatorLoadMore')}
            </button>
          </div>
        )}
      </>
    )}
  </section>
);

const FilterSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: React.ReactNode;
}> = ({ value, onChange, label, children }) => (
  <select
    value={value}
    onChange={(event) => onChange(event.target.value)}
    aria-label={label}
    className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary"
  >
    <option value="">{label}</option>
    {children}
  </select>
);

const CaseCard: React.FC<{
  item: CreatorStudioCase;
  onSelect: (item: CreatorStudioCase) => void;
  onUseCase: (item: CreatorStudioCase) => void;
}> = ({ item, onSelect, onUseCase }) => (
  <article className="overflow-hidden rounded-lg border border-border bg-surface">
    <button type="button" className="block w-full text-left" onClick={() => onSelect(item)}>
      <PlaceholderImage src={item.image} alt={item.imageAlt} className="aspect-[4/3] w-full" />
      <div className="space-y-2 p-3">
        <div className="line-clamp-2 min-h-[40px] text-sm font-semibold">{item.title}</div>
        <div className="flex flex-wrap gap-1.5">
          {[item.category, ...item.styles.slice(0, 2), ...item.scenes.slice(0, 1)].map((tag) => (
            <span key={tag} className="rounded-md bg-surface-raised px-2 py-0.5 text-[11px] text-secondary">
              {tag}
            </span>
          ))}
        </div>
        <div className="truncate text-xs text-muted">{item.sourceLabel || i18nService.t('creatorUnknownSource')}</div>
      </div>
    </button>
    <div className="border-t border-border p-2">
      <button
        type="button"
        onClick={() => onUseCase(item)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
      >
        <SparklesIcon className="h-4 w-4" />
        {i18nService.t('creatorUseCase')}
      </button>
    </div>
  </article>
);

const TemplateLibrary: React.FC<{
  templates: CreatorStudioTemplate[];
  templateCasesById: Map<number, CreatorStudioCase>;
  onSelectTemplate: (template: CreatorStudioTemplate) => void;
  onUseTemplate: (template: CreatorStudioTemplate) => void;
}> = ({ templates, templateCasesById, onSelectTemplate, onUseTemplate }) => (
  <section className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-3">
    {templates.map((template) => {
      const exampleCases = template.exampleCases
        .map((sourceCaseId) => templateCasesById.get(sourceCaseId))
        .filter((item): item is CreatorStudioCase => Boolean(item));
      return (
        <article key={template.id} className="rounded-lg border border-border bg-surface p-4">
          <div className="flex gap-3">
            <PlaceholderImage src={template.cover} alt={getText(template.title)} className="h-20 w-20 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 text-sm font-semibold">{getText(template.title)}</h2>
              <p className="mt-1 line-clamp-2 text-xs text-secondary">{getText(template.description)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {template.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-md bg-surface-raised px-2 py-0.5 text-[11px] text-secondary">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs text-muted">
            {i18nService.t('creatorExampleCases').replace('{count}', String(exampleCases.length))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onSelectTemplate(template)}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              {i18nService.t('creatorDetails')}
            </button>
            <button
              type="button"
              onClick={() => onUseTemplate(template)}
              className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              {i18nService.t('creatorUseTemplate')}
            </button>
          </div>
        </article>
      );
    })}
  </section>
);

const PromptBuilder: React.FC<{
  seed: CreatorPromptSeed | null;
  form: CreatorPromptForm;
  onFormChange: (form: CreatorPromptForm) => void;
  materials: CreatorBuilderMaterial[];
  onMaterialsChange: (materials: CreatorBuilderMaterial[]) => void;
  installedSkillIds: readonly string[];
  missingSkillIds: readonly string[];
  seedreamStatus: SeedreamStatus;
  isSendingToCowork: boolean;
  onSendToCowork: (
    promptSpec: CreatorPromptSpec,
    promptText: string,
    materials: CreatorBuilderMaterial[],
    requestImageGeneration?: boolean
  ) => void;
}> = ({
  seed,
  form,
  onFormChange,
  materials,
  onMaterialsChange,
  installedSkillIds,
  missingSkillIds,
  seedreamStatus,
  isSendingToCowork,
  onSendToCowork,
}) => {
  const [selectedDirectionId, setSelectedDirectionId] = useState<string | null>(null);
  const promptLanguage = normalizePromptLanguage(i18nService.getLanguage(), form);
  const basePromptSpec: CreatorPromptSpec = buildPromptSpec(seed, form, promptLanguage, i18nService.t('creatorBlankBuilder'), materials);
  const promptSpec = selectCreatorCreativeDirection(basePromptSpec, selectedDirectionId);
  const prompt = renderCreatorPrompt(promptSpec);
  const seedreamReady = seedreamStatus === SeedreamStatus.Configured;
  const seedreamHint = getSeedreamStatusHint(seedreamStatus);

  useEffect(() => {
    setSelectedDirectionId(null);
  }, [seed?.sourceId]);

  const updateField = (field: keyof CreatorPromptForm, value: string) => {
    onFormChange({ ...form, [field]: value });
  };

  return (
    <section className="grid gap-4 p-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
      <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <div className="text-xs font-medium uppercase text-muted">{i18nService.t('creatorBuilderSource')}</div>
          <div className="mt-1 text-sm font-semibold">{promptSpec.sourceTitle}</div>
        </div>
        <BuilderInput label={i18nService.t('creatorFieldSubject')} value={form.subject} onChange={(value) => updateField('subject', value)} />
        <BuilderInput label={i18nService.t('creatorFieldPlatform')} value={form.platform} onChange={(value) => updateField('platform', value)} />
        <BuilderInput label={i18nService.t('creatorFieldMainObject')} value={form.mainObject} onChange={(value) => updateField('mainObject', value)} />
        <BuilderInput label={i18nService.t('creatorFieldRequiredText')} value={form.requiredText} onChange={(value) => updateField('requiredText', value)} />
        <BuilderInput label={i18nService.t('creatorFieldVisualStyle')} value={form.visualStyle} onChange={(value) => updateField('visualStyle', value)} />
        <BuilderInput label={i18nService.t('creatorFieldAspectRatio')} value={form.aspectRatio} onChange={(value) => updateField('aspectRatio', value)} />
        <BuilderTextarea label={i18nService.t('creatorFieldNegative')} value={form.negativeRequirements} onChange={(value) => updateField('negativeRequirements', value)} />
        <MaterialTray materials={materials} onMaterialsChange={onMaterialsChange} />
      </div>
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{i18nService.t('creatorPromptPreview')}</h2>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => void copyText(prompt)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
              >
                <ClipboardDocumentIcon className="h-4 w-4" />
                {i18nService.t('creatorCopyPrompt')}
              </button>
              <button
                type="button"
                disabled={isSendingToCowork}
                onClick={() => onSendToCowork(promptSpec, prompt, materials)}
                className="inline-flex items-center gap-2 rounded-lg border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RocketLaunchIcon className="h-4 w-4" />
                {isSendingToCowork ? i18nService.t('creatorSendingToCowork') : i18nService.t('creatorSendToCowork')}
              </button>
              <button
                type="button"
                disabled={!seedreamReady || isSendingToCowork}
                title={seedreamHint}
                onClick={() => onSendToCowork(promptSpec, prompt, materials, true)}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
              >
                <SparklesIcon className="h-4 w-4" />
                {i18nService.t('creatorGenerateWithSeedream')}
              </button>
            </div>
          </div>
          <pre className="max-h-[420px] whitespace-pre-wrap overflow-auto p-4 text-sm leading-6 text-foreground">{prompt}</pre>
        </div>
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{i18nService.t('creatorContextPack')}</h2>
          </div>
          <pre className="max-h-56 whitespace-pre-wrap overflow-auto p-4 text-xs leading-5 text-secondary">
            {promptSpec.contextPack || i18nService.t('creatorContextPackEmpty')}
          </pre>
        </div>
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{i18nService.t('creatorCreativeDirections')}</h2>
          </div>
          <div className="grid gap-2 p-4 md:grid-cols-2">
            {basePromptSpec.creativeDirections?.map((direction) => {
              const selected = direction.id === selectedDirectionId;
              return (
                <div
                  key={direction.id}
                  className={`rounded-lg border p-3 ${
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-surface-raised'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold">{direction.title}</h3>
                    <button
                      type="button"
                      onClick={() => setSelectedDirectionId(direction.id)}
                      className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                        selected
                          ? 'bg-primary text-white'
                          : 'border border-border text-secondary hover:bg-surface hover:text-foreground'
                      }`}
                    >
                      {selected ? i18nService.t('creatorDirectionSelected') : i18nService.t('creatorUseDirection')}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-secondary">{direction.template}</p>
                  <p className="mt-2 text-xs text-muted">{direction.reason}</p>
                  <p className="mt-2 text-xs text-secondary">{direction.promptFocus}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">{i18nService.t('creatorRecommendedRuntime')}</h2>
          <p className="mt-1 text-xs leading-5 text-muted">{i18nService.t('creatorRecommendedRuntimeHint')}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...installedSkillIds, ...missingSkillIds].map((skillId) => {
              const isInstalled = installedSkillIds.includes(skillId);
              return (
                <span
                  key={skillId}
                  className={`rounded-md px-2 py-1 text-[11px] ${
                    isInstalled
                      ? 'bg-primary/10 text-primary'
                      : 'bg-surface-raised text-muted'
                  }`}
                >
                  {skillId}{isInstalled ? '' : ` · ${i18nService.t('creatorSkillMissing')}`}
                </span>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">{seedreamHint}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{i18nService.t('creatorPromptSpec')}</h2>
            <button
              type="button"
              onClick={() => void copyText(JSON.stringify(promptSpec, null, 2))}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <DocumentDuplicateIcon className="h-4 w-4" />
              {i18nService.t('copy')}
            </button>
          </div>
          <pre className="max-h-64 overflow-auto p-4 text-xs leading-5 text-secondary">{JSON.stringify(promptSpec, null, 2)}</pre>
        </div>
      </div>
    </section>
  );
};

const getSeedreamStatusHint = (status: SeedreamStatus): string => {
  switch (status) {
    case SeedreamStatus.Configured:
      return i18nService.t('creatorSeedreamConfiguredHint');
    case SeedreamStatus.Checking:
      return i18nService.t('creatorSeedreamCheckingHint');
    case SeedreamStatus.NeedsConfig:
      return i18nService.t('creatorSeedreamConfigRequired');
    case SeedreamStatus.Missing:
    default:
      return i18nService.t('creatorSeedreamMissingHint');
  }
};

const createMaterialId = (): string => (
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `material-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
  reader.readAsDataURL(file);
});

const getFilePath = (file: File, source: CreatorMaterialSource): string => {
  const fileWithPath = file as File & { path?: string };
  if (fileWithPath.path?.trim()) {
    return fileWithPath.path.trim();
  }
  return `${source}:${file.name || `image-${Date.now()}`}`;
};

const encodeLocalFileSrc = (filePath: string): string => {
  const raw = filePath.trim();
  const normalized = raw.replace(/\\/g, '/');
  const fileUrl = /^file:\/\//i.test(normalized)
    ? normalized
    : normalized.startsWith('/')
      ? `file://${normalized}`
      : `file:///${normalized}`;
  return encodeURI(fileUrl)
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/^file:\/\//i, 'localfile://');
};

const createMaterialFromFile = async (
  file: File,
  source: CreatorMaterialSource,
  role: CreatorMaterialRole = CreatorMaterialRole.Reference
): Promise<CreatorBuilderMaterial> => {
  const dataUrl = await readFileAsDataUrl(file);
  return {
    id: createMaterialId(),
    role,
    source,
    name: file.name || `image-${Date.now()}.png`,
    path: getFilePath(file, source),
    mimeType: file.type || 'image/png',
    size: file.size,
    previewUrl: dataUrl,
    dataUrl,
    addedAt: Date.now(),
  };
};

const MaterialTray: React.FC<{
  materials: CreatorBuilderMaterial[];
  onMaterialsChange: (materials: CreatorBuilderMaterial[]) => void;
}> = ({ materials, onMaterialsChange }) => {
  const language = i18nService.getLanguage();
  const roleOptions = Object.values(CreatorMaterialRole);

  const addFiles = useCallback(async (files: FileList | File[], source: CreatorMaterialSource) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    const newMaterials = await Promise.all(imageFiles.map((file) => createMaterialFromFile(file, source)));
    onMaterialsChange([...materials, ...newMaterials]);
  }, [materials, onMaterialsChange]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
      if (files.length === 0) return;
      event.preventDefault();
      void addFiles(files, CreatorMaterialSource.Clipboard);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addFiles]);

  const updateRole = (id: string, role: CreatorMaterialRole) => {
    onMaterialsChange(materials.map((material) => material.id === id ? { ...material, role } : material));
  };

  const removeMaterial = (id: string) => {
    onMaterialsChange(materials.filter((material) => material.id !== id));
  };

  const moveMaterial = (id: string, direction: -1 | 1) => {
    const index = materials.findIndex((material) => material.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= materials.length) return;
    const nextMaterials = [...materials];
    const [item] = nextMaterials.splice(index, 1);
    nextMaterials.splice(nextIndex, 0, item);
    onMaterialsChange(nextMaterials);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void addFiles(event.dataTransfer.files, CreatorMaterialSource.File);
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-medium text-secondary">{i18nService.t('creatorMaterialTray')}</div>
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="mt-2 flex min-h-28 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-raised px-3 py-4 text-center"
        >
          <PhotoIcon className="h-8 w-8 text-muted" />
          <p className="mt-2 text-xs leading-5 text-muted">{i18nService.t('creatorMaterialDropHint')}</p>
        </div>
      </div>
      {materials.length > 0 && (
        <div className="space-y-2">
          {materials.map((material, index) => (
            <div key={material.id} className="grid grid-cols-[56px_1fr_auto] gap-2 rounded-lg border border-border bg-background p-2">
              <img
                src={material.previewUrl}
                alt={material.name}
                className="h-14 w-14 rounded-md bg-surface-raised object-cover"
              />
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{material.name}</div>
                <div className="truncate text-[11px] text-muted">{material.path}</div>
                <select
                  value={material.role}
                  onChange={(event) => updateRole(material.id, event.target.value as CreatorMaterialRole)}
                  className="mt-2 w-full rounded-md border border-border bg-surface px-2 py-1 text-xs"
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {CREATOR_MATERIAL_ROLE_LABELS[role][language]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveMaterial(material.id, -1)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-raised hover:text-foreground disabled:opacity-30"
                  aria-label={i18nService.t('creatorMaterialMoveUp')}
                >
                  <ArrowUpIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={index === materials.length - 1}
                  onClick={() => moveMaterial(material.id, 1)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-raised hover:text-foreground disabled:opacity-30"
                  aria-label={i18nService.t('creatorMaterialMoveDown')}
                >
                  <ArrowDownIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeMaterial(material.id)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-red-500/10 hover:text-red-600"
                  aria-label={i18nService.t('creatorMaterialRemove')}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const BuilderInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => (
  <label className="block">
    <span className="text-xs font-medium text-secondary">{label}</span>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
    />
  </label>
);

const BuilderTextarea: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => (
  <label className="block">
    <span className="text-xs font-medium text-secondary">{label}</span>
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={4}
      className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
    />
  </label>
);

const CaseDrawer: React.FC<{
  item: CreatorStudioCase;
  onClose: () => void;
  onUseCase: (item: CreatorStudioCase) => void;
}> = ({ item, onClose, onUseCase }) => (
  <Drawer onClose={onClose} title={item.title}>
    <PlaceholderImage src={item.image} alt={item.imageAlt} className="aspect-[4/3] w-full rounded-lg" />
    <div className="mt-4 flex flex-wrap gap-1.5">
      {[item.category, ...item.styles, ...item.scenes].map((tag) => (
        <span key={tag} className="rounded-md bg-surface-raised px-2 py-0.5 text-xs text-secondary">{tag}</span>
      ))}
    </div>
    <div className="mt-4 flex gap-2">
      <button type="button" onClick={() => void copyText(item.prompt)} className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">
        {i18nService.t('creatorCopyPrompt')}
      </button>
      <button type="button" onClick={() => onUseCase(item)} className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary">
        {i18nService.t('creatorUseCase')}
      </button>
    </div>
    <InfoLinks sourceUrl={item.sourceUrl} githubUrl={item.githubUrl} />
    <section className="mt-4">
      <h3 className="text-sm font-semibold">{i18nService.t('creatorFullPrompt')}</h3>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-raised p-3 text-xs leading-5 text-secondary">{item.prompt}</pre>
    </section>
    <p className="mt-4 text-xs leading-5 text-muted">{i18nService.t('creatorDisclaimer')}</p>
  </Drawer>
);

const TemplateDrawer: React.FC<{
  template: CreatorStudioTemplate;
  templateCasesById: Map<number, CreatorStudioCase>;
  onClose: () => void;
  onUseTemplate: (template: CreatorStudioTemplate) => void;
  onOpenExampleCase: (sourceCaseId: number) => void;
}> = ({ template, templateCasesById, onClose, onUseTemplate, onOpenExampleCase }) => (
  <Drawer onClose={onClose} title={getText(template.title)}>
    <PlaceholderImage src={template.cover} alt={getText(template.title)} className="aspect-[4/3] w-full rounded-lg" />
    <p className="mt-4 text-sm leading-6 text-secondary">{getText(template.description)}</p>
    <button type="button" onClick={() => onUseTemplate(template)} className="mt-4 w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">
      {i18nService.t('creatorUseTemplate')}
    </button>
    <TemplateSection title={i18nService.t('creatorUseWhen')} items={[getText(template.useWhen)]} />
    <TemplateSection title={i18nService.t('creatorGuidance')} items={template.guidance[i18nService.getLanguage()]} />
    <TemplateSection title={i18nService.t('creatorPitfalls')} items={template.pitfalls[i18nService.getLanguage()]} />
    <section className="mt-5">
      <h3 className="text-sm font-semibold">{i18nService.t('creatorExampleCaseList')}</h3>
      <div className="mt-2 space-y-2">
        {template.exampleCases.map((sourceCaseId) => {
          const item = templateCasesById.get(sourceCaseId);
          if (!item) return null;
          return (
            <button
              key={sourceCaseId}
              type="button"
              onClick={() => onOpenExampleCase(sourceCaseId)}
              className="flex w-full items-center gap-3 rounded-lg border border-border p-2 text-left transition-colors hover:bg-surface-raised"
            >
              <PlaceholderImage src={item.image} alt={item.imageAlt} className="h-12 w-12 shrink-0 rounded-md" />
              <span className="line-clamp-2 text-sm text-secondary">{item.title}</span>
            </button>
          );
        })}
      </div>
    </section>
  </Drawer>
);

const TemplateSection: React.FC<{
  title: string;
  items: string[];
}> = ({ title, items }) => (
  <section className="mt-5">
    <h3 className="text-sm font-semibold">{title}</h3>
    <ul className="mt-2 space-y-2">
      {items.map((item) => (
        <li key={item} className="rounded-lg bg-surface-raised p-3 text-sm leading-6 text-secondary">{item}</li>
      ))}
    </ul>
  </section>
);

const InfoLinks: React.FC<{
  sourceUrl: string | null;
  githubUrl: string | null;
}> = ({ sourceUrl, githubUrl }) => (
  <div className="mt-4 space-y-2">
    {sourceUrl && <ExternalLink href={sourceUrl} label={i18nService.t('creatorSourceUrl')} />}
    {githubUrl && <ExternalLink href={githubUrl} label={i18nService.t('creatorGithubUrl')} />}
  </div>
);

const ExternalLink: React.FC<{
  href: string;
  label: string;
}> = ({ href, label }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
  >
    {label}
    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
  </a>
);

const Drawer: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div className="absolute inset-0 z-30 flex justify-end bg-black/30">
    <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background shadow-xl">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
          aria-label={i18nService.t('close')}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </aside>
  </div>
);

export default CreatorStudioView;
