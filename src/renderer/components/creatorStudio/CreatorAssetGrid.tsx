import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  FolderOpenIcon,
  InformationCircleIcon,
  PaperAirplaneIcon,
  PhotoIcon,
  PlusIcon,
  SparklesIcon,
  StarIcon,
  TagIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  CreatorAssetAdoptionStatus,
  type CreatorAssetAdoptionStatus as CreatorAssetAdoptionStatusType,
  CreatorProductionAssetKind,
  CreatorProductionAssetSource,
  CreatorProductionAssetStatus,
  CreatorStudioDefaultProjectId,
} from '@shared/creatorStudio/constants';
import type {
  CreatorProductionAssetRecord,
  CreatorWorkspaceSnapshot,
} from '@shared/creatorStudio/types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import casesData from '../../data/creatorStudio/cases.json';
import { creatorStudioAssetService } from '../../services/creatorStudioAssets';
import { i18nService } from '../../services/i18n';
import type { CreatorStudioCase } from '../../types/creatorStudio';

interface CreatorAssetGridProps {
  onOpenCoworkSession: (sessionId: string) => Promise<boolean>;
  onUseAssetAsReference: (asset: CreatorProductionAssetRecord) => void;
  onSendAssetToCowork: (asset: CreatorProductionAssetRecord) => void;
}

const dispatchToast = (message: string) => {
  window.dispatchEvent(new CustomEvent('app:showToast', { detail: message }));
};

const copyText = async (text: string) => {
  await navigator.clipboard.writeText(text);
  dispatchToast(i18nService.t('copied'));
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

const PlaceholderImage: React.FC<{
  className?: string;
}> = ({ className = '' }) => (
  <div className={`flex items-center justify-center bg-surface-raised text-muted ${className}`}>
    <PhotoIcon className="h-10 w-10" />
  </div>
);

const PreviewImage: React.FC<{
  src: string | null;
  filePath?: string | null;
  alt: string;
  className?: string;
}> = ({ src, filePath, alt, className = '' }) => {
  const [activeSrc, setActiveSrc] = useState(src);
  const [failed, setFailed] = useState(false);
  const [triedDataUrlFallback, setTriedDataUrlFallback] = useState(false);

  useEffect(() => {
    setActiveSrc(src);
    setFailed(false);
    setTriedDataUrlFallback(false);
  }, [filePath, src]);

  const handleError = () => {
    if (filePath && !triedDataUrlFallback) {
      setTriedDataUrlFallback(true);
      void window.electron.dialog.readFileAsDataUrl(filePath)
        .then((result) => {
          if (result.success && result.dataUrl) {
            setActiveSrc(result.dataUrl);
            setFailed(false);
            return;
          }
          setFailed(true);
        })
        .catch(() => {
          setFailed(true);
        });
      return;
    }
    setFailed(true);
  };

  if (!activeSrc || failed) {
    return <PlaceholderImage className={className} />;
  }

  return (
    <img
      src={activeSrc}
      alt={alt}
      loading="lazy"
      onError={handleError}
      className={className}
    />
  );
};

const adoptionStatusOptions = [
  CreatorAssetAdoptionStatus.Unset,
  CreatorAssetAdoptionStatus.Favorite,
  CreatorAssetAdoptionStatus.Shortlisted,
  CreatorAssetAdoptionStatus.Adopted,
  CreatorAssetAdoptionStatus.Rejected,
] as const;

const getAdoptionStatusLabel = (status: CreatorAssetAdoptionStatusType): string => {
  switch (status) {
    case CreatorAssetAdoptionStatus.Favorite:
      return i18nService.t('creatorAssetStatusFavorite');
    case CreatorAssetAdoptionStatus.Shortlisted:
      return i18nService.t('creatorAssetStatusShortlisted');
    case CreatorAssetAdoptionStatus.Adopted:
      return i18nService.t('creatorAssetStatusAdopted');
    case CreatorAssetAdoptionStatus.Rejected:
      return i18nService.t('creatorAssetStatusRejected');
    case CreatorAssetAdoptionStatus.Unset:
    default:
      return i18nService.t('creatorAssetStatusUnset');
  }
};

const getProjectLabel = (projectId: string, name: string): string => (
  projectId === CreatorStudioDefaultProjectId ? i18nService.t('creatorDefaultProject') : name
);

const creatorCases = casesData as CreatorStudioCase[];
const creatorCaseMap = new Map<string, CreatorStudioCase>();
for (const item of creatorCases) {
  creatorCaseMap.set(item.id, item);
  creatorCaseMap.set(`case-${item.sourceCaseId}`, item);
}

const isFileBackedImage = (asset: CreatorProductionAssetRecord): boolean => (
  asset.kind === CreatorProductionAssetKind.Image
);

const isRenderableImage = (asset: CreatorProductionAssetRecord): boolean => (
  isFileBackedImage(asset) && asset.status === CreatorProductionAssetStatus.Ready
);

const getCasePreview = (asset: CreatorProductionAssetRecord): CreatorStudioCase | null => {
  if (asset.kind !== CreatorProductionAssetKind.Case && asset.source !== CreatorProductionAssetSource.CreatorCase) {
    return null;
  }
  for (const caseId of asset.caseIds) {
    const item = creatorCaseMap.get(caseId);
    if (item?.image) return item;
  }
  return null;
};

const getAssetPreview = (asset: CreatorProductionAssetRecord): {
  src: string | null;
  filePath: string | null;
  alt: string;
} => {
  if (isRenderableImage(asset)) {
    return {
      src: encodeLocalFileSrc(asset.filePath),
      filePath: asset.filePath,
      alt: asset.fileName,
    };
  }

  const casePreview = getCasePreview(asset);
  if (casePreview?.image) {
    return {
      src: casePreview.image,
      filePath: null,
      alt: casePreview.imageAlt || casePreview.title,
    };
  }

  return {
    src: null,
    filePath: null,
    alt: asset.fileName,
  };
};

const AssetPreviewImage: React.FC<{
  asset: CreatorProductionAssetRecord;
  className?: string;
}> = ({ asset, className = '' }) => {
  const preview = getAssetPreview(asset);
  return (
    <PreviewImage
      src={preview.src}
      filePath={preview.filePath}
      alt={preview.alt}
      className={className}
    />
  );
};

const getAssetSourceLabel = (source: CreatorProductionAssetSource): string => {
  switch (source) {
    case CreatorProductionAssetSource.CreatorPrompt:
      return i18nService.t('creatorAssetSourcePrompt');
    case CreatorProductionAssetSource.CreatorCase:
      return i18nService.t('creatorAssetSourceCase');
    case CreatorProductionAssetSource.CoworkGeneratedImage:
    default:
      return i18nService.t('creatorAssetSourceCowork');
  }
};

const getAssetCases = (asset: CreatorProductionAssetRecord): CreatorStudioCase[] => (
  asset.caseIds
    .map((caseId) => creatorCaseMap.get(caseId))
    .filter((item): item is CreatorStudioCase => Boolean(item))
);

export const CreatorAssetGrid: React.FC<CreatorAssetGridProps> = ({
  onOpenCoworkSession,
  onUseAssetAsReference,
  onSendAssetToCowork,
}) => {
  const [workspace, setWorkspace] = useState<CreatorWorkspaceSnapshot | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [tag, setTag] = useState('');
  const [adoptionStatus, setAdoptionStatus] = useState('');
  const [source, setSource] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [assets, setAssets] = useState<CreatorProductionAssetRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedAsset, setSelectedAsset] = useState<CreatorProductionAssetRecord | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [licenseNoteDraft, setLicenseNoteDraft] = useState('');
  const [usageNoteDraft, setUsageNoteDraft] = useState('');
  const [collectionTargetId, setCollectionTargetId] = useState('');
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentCollections = useMemo(
    () => workspace?.collections.filter((collection) => collection.projectId === currentProjectId) ?? [],
    [currentProjectId, workspace?.collections]
  );

  const loadWorkspace = useCallback(async () => {
    const nextWorkspace = await creatorStudioAssetService.getWorkspace();
    setWorkspace(nextWorkspace);
    setCurrentProjectId((value) => value || nextWorkspace.currentProjectId);
  }, []);

  const loadAssets = useCallback(async () => {
    const projectId = currentProjectId || workspace?.currentProjectId;
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await creatorStudioAssetService.listAssets({
        projectId,
        ...(collectionId ? { collectionId } : {}),
        ...(templateId.trim() ? { templateId: templateId.trim() } : {}),
        ...(tag.trim() ? { tag: tag.trim() } : {}),
        ...(adoptionStatus ? { adoptionStatus: adoptionStatus as CreatorAssetAdoptionStatusType } : {}),
        ...(source ? { source: source as CreatorProductionAssetSource } : {}),
        ...(favoriteOnly ? { favorite: true } : {}),
        limit: 120,
      });
      setAssets(result.assets);
      setTotal(result.total);
      setSelectedAsset((asset) => {
        if (!asset) return null;
        return result.assets.find((item) => item.id === asset.id) ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : i18nService.t('creatorAssetsLoadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [adoptionStatus, collectionId, currentProjectId, favoriteOnly, source, tag, templateId, workspace?.currentProjectId]);

  useEffect(() => {
    void loadWorkspace().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : i18nService.t('creatorWorkspaceLoadFailed'));
    });
  }, [loadWorkspace]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    if (!selectedAsset) {
      setTagDraft('');
      setLicenseNoteDraft('');
      setUsageNoteDraft('');
      setCollectionTargetId('');
      return;
    }
    setTagDraft(selectedAsset.tags.join(', '));
    setLicenseNoteDraft(selectedAsset.licenseNote ?? '');
    setUsageNoteDraft(selectedAsset.usageNote ?? '');
    setCollectionTargetId('');
  }, [selectedAsset]);

  const handleCreateProject = async () => {
    if (!projectNameDraft.trim()) return;
    setIsCreatingProject(true);
    try {
      const nextWorkspace = await creatorStudioAssetService.createProject({ name: projectNameDraft.trim() });
      setWorkspace(nextWorkspace);
      setCurrentProjectId(nextWorkspace.currentProjectId);
      setCollectionId('');
      setProjectNameDraft('');
      setIsProjectFormOpen(false);
    } catch (createError) {
      dispatchToast(createError instanceof Error ? createError.message : i18nService.t('creatorProjectCreateFailed'));
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleSwitchProject = async (projectId: string) => {
    try {
      const nextWorkspace = await creatorStudioAssetService.setCurrentProject(projectId);
      setWorkspace(nextWorkspace);
      setCurrentProjectId(nextWorkspace.currentProjectId);
      setCollectionId('');
      setSelectedAsset(null);
    } catch (switchError) {
      dispatchToast(switchError instanceof Error ? switchError.message : i18nService.t('creatorProjectSwitchFailed'));
    }
  };

  const handleCreateCollection = async () => {
    if (!currentProjectId) return;
    const name = window.prompt(i18nService.t('creatorCollectionNamePrompt'));
    if (!name?.trim()) return;
    try {
      const nextWorkspace = await creatorStudioAssetService.createCollection({
        projectId: currentProjectId,
        name: name.trim(),
      });
      setWorkspace(nextWorkspace);
    } catch (createError) {
      dispatchToast(createError instanceof Error ? createError.message : i18nService.t('creatorCollectionCreateFailed'));
    }
  };

  const updateAssetInList = (updated: CreatorProductionAssetRecord | null) => {
    if (!updated) return;
    setAssets((items) => items.map((item) => item.id === updated.id ? updated : item));
    setSelectedAsset((asset) => asset?.id === updated.id ? updated : asset);
  };

  const handleCopyPrompt = async (asset: CreatorProductionAssetRecord) => {
    const prompt = asset.promptText.trim()
      || (asset.promptSpec ? JSON.stringify(asset.promptSpec, null, 2) : '');
    if (!prompt) {
      dispatchToast(i18nService.t('creatorAssetPromptMissing'));
      return;
    }
    await copyText(prompt);
  };

  const handleRevealAsset = async (asset: CreatorProductionAssetRecord) => {
    try {
      await creatorStudioAssetService.revealAssetInFolder(asset.id);
    } catch {
      dispatchToast(i18nService.t('creatorAssetFileUnavailable'));
    }
  };

  const handleOpenSource = async (asset: CreatorProductionAssetRecord) => {
    if (!asset.sessionId) {
      dispatchToast(i18nService.t('creatorAssetSourceUnavailable'));
      return;
    }
    try {
      const sourceLookup = await creatorStudioAssetService.getAssetSource(asset.id);
      if (!sourceLookup?.session) {
        dispatchToast(i18nService.t('creatorAssetSourceUnavailable'));
        await loadAssets();
        return;
      }
      const opened = await onOpenCoworkSession(sourceLookup.session.id);
      if (!opened) {
        dispatchToast(i18nService.t('creatorAssetSourceUnavailable'));
        await loadAssets();
      }
    } catch {
      dispatchToast(i18nService.t('creatorAssetSourceUnavailable'));
    }
  };

  const handleToggleFavorite = async (asset: CreatorProductionAssetRecord) => {
    try {
      updateAssetInList(await creatorStudioAssetService.setFavorite(asset.id, !asset.favorite));
    } catch {
      dispatchToast(i18nService.t('creatorAssetFavoriteFailed'));
    }
  };

  const handleToggleSelected = async (asset: CreatorProductionAssetRecord) => {
    try {
      updateAssetInList(await creatorStudioAssetService.updateAsset({
        assetId: asset.id,
        selected: !asset.selected,
      }));
    } catch {
      dispatchToast(i18nService.t('creatorAssetUpdateFailed'));
    }
  };

  const handleChangeAdoptionStatus = async (
    asset: CreatorProductionAssetRecord,
    nextStatus: CreatorAssetAdoptionStatusType
  ) => {
    try {
      updateAssetInList(await creatorStudioAssetService.updateAsset({
        assetId: asset.id,
        adoptionStatus: nextStatus,
        favorite: nextStatus === CreatorAssetAdoptionStatus.Favorite ? true : asset.favorite,
      }));
    } catch {
      dispatchToast(i18nService.t('creatorAssetUpdateFailed'));
    }
  };

  const handleSaveProvenance = async () => {
    if (!selectedAsset) return;
    try {
      const tags = tagDraft.split(',').map((item) => item.trim()).filter(Boolean);
      updateAssetInList(await creatorStudioAssetService.updateAsset({
        assetId: selectedAsset.id,
        tags,
        licenseNote: licenseNoteDraft,
        usageNote: usageNoteDraft,
      }));
      dispatchToast(i18nService.t('creatorAssetSaved'));
    } catch {
      dispatchToast(i18nService.t('creatorAssetUpdateFailed'));
    }
  };

  const handleAddToCollection = async () => {
    if (!selectedAsset || !collectionTargetId) return;
    try {
      updateAssetInList(await creatorStudioAssetService.addAssetToCollection({
        assetId: selectedAsset.id,
        collectionId: collectionTargetId,
      }));
      await loadWorkspace();
      await loadAssets();
      dispatchToast(i18nService.t('creatorAssetAddedToCollection'));
    } catch {
      dispatchToast(i18nService.t('creatorAssetUpdateFailed'));
    }
  };

  const handleClearFilters = () => {
    setCollectionId('');
    setTemplateId('');
    setTag('');
    setAdoptionStatus('');
    setSource('');
    setFavoriteOnly(false);
  };

  const selectedAssetCases = useMemo(
    () => selectedAsset ? getAssetCases(selectedAsset) : [],
    [selectedAsset]
  );
  const selectedAssetCanReveal = Boolean(selectedAsset && isFileBackedImage(selectedAsset));

  return (
    <section className="grid min-h-full gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{i18nService.t('creatorWorkspaceTitle')}</h2>
              <p className="mt-1 text-xs text-muted">
                {i18nService.t('creatorAssetsCount').replace('{count}', String(total))}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsProjectFormOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
              >
                <PlusIcon className="h-4 w-4" />
                {i18nService.t('creatorProjectCreate')}
              </button>
              <button
                type="button"
                onClick={() => void handleCreateCollection()}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
              >
                <PlusIcon className="h-4 w-4" />
                {i18nService.t('creatorCollectionCreate')}
              </button>
              <button
                type="button"
                onClick={() => void loadAssets()}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
              >
                {isLoading ? i18nService.t('loading') : i18nService.t('creatorAssetsRefresh')}
              </button>
            </div>
          </div>
          {isProjectFormOpen && (
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                value={projectNameDraft}
                onChange={(event) => setProjectNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleCreateProject();
                  if (event.key === 'Escape') setIsProjectFormOpen(false);
                }}
                autoFocus
                placeholder={i18nService.t('projectNamePlaceholder')}
                className="h-10 min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                disabled={!projectNameDraft.trim() || isCreatingProject}
                onClick={() => void handleCreateProject()}
                className="h-10 rounded-lg bg-primary px-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {i18nService.t('create')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setProjectNameDraft('');
                  setIsProjectFormOpen(false);
                }}
                className="h-10 rounded-lg border border-border px-3 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
              >
                {i18nService.t('cancel')}
              </button>
            </div>
          )}

          <div className="mt-4 grid gap-2 lg:grid-cols-[180px_170px_160px_1fr_1fr_150px_auto]">
            <select
              value={currentProjectId}
              onChange={(event) => void handleSwitchProject(event.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              aria-label={i18nService.t('creatorProjectSelect')}
            >
              {workspace?.projects.map((project) => (
                <option key={project.id} value={project.id}>{getProjectLabel(project.id, project.name)}</option>
              ))}
            </select>
            <select
              value={collectionId}
              onChange={(event) => setCollectionId(event.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              aria-label={i18nService.t('creatorCollectionFilter')}
            >
              <option value="">{i18nService.t('creatorCollectionAll')}</option>
              {currentCollections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name} ({collection.assetCount})
                </option>
              ))}
            </select>
            <select
              value={adoptionStatus}
              onChange={(event) => setAdoptionStatus(event.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              aria-label={i18nService.t('creatorAssetStatusFilter')}
            >
              <option value="">{i18nService.t('creatorAssetStatusAll')}</option>
              {adoptionStatusOptions.map((status) => (
                <option key={status} value={status}>{getAdoptionStatusLabel(status)}</option>
              ))}
            </select>
            <input
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              placeholder={i18nService.t('creatorTemplateFilterPlaceholder')}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <input
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder={i18nService.t('creatorTagFilterPlaceholder')}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <select
              value={source}
              onChange={(event) => setSource(event.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              aria-label={i18nService.t('creatorAssetSourceFilter')}
            >
              <option value="">{i18nService.t('creatorAssetSourceAll')}</option>
              <option value={CreatorProductionAssetSource.CoworkGeneratedImage}>
                {i18nService.t('creatorAssetSourceCowork')}
              </option>
              <option value={CreatorProductionAssetSource.CreatorPrompt}>
                {i18nService.t('creatorAssetSourcePrompt')}
              </option>
              <option value={CreatorProductionAssetSource.CreatorCase}>
                {i18nService.t('creatorAssetSourceCase')}
              </option>
            </select>
            <button
              type="button"
              onClick={handleClearFilters}
              className="h-10 rounded-lg border border-border px-3 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              {i18nService.t('creatorClearFilters')}
            </button>
          </div>

          <label className="mt-3 inline-flex items-center gap-2 text-xs text-secondary">
            <input
              type="checkbox"
              checked={favoriteOnly}
              onChange={(event) => setFavoriteOnly(event.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {i18nService.t('creatorFavoriteOnly')}
          </label>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
            {error}
          </div>
        )}

        {!isLoading && assets.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface text-center">
            <PhotoIcon className="h-10 w-10 text-muted" />
            <div className="mt-3 text-sm font-medium">{i18nService.t('creatorAssetsEmptyTitle')}</div>
            <div className="mt-1 max-w-md text-xs leading-5 text-muted">{i18nService.t('creatorAssetsEmptyHint')}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {assets.map((asset) => (
              <article key={asset.id} className="overflow-hidden rounded-lg border border-border bg-surface">
                <div className="relative aspect-[4/3] bg-surface-raised">
                  <AssetPreviewImage asset={asset} className="h-full w-full object-contain" />
                  <button
                    type="button"
                    onClick={() => void handleToggleSelected(asset)}
                    className={`absolute left-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background/90 transition-colors hover:bg-surface ${
                      asset.selected ? 'text-primary' : 'text-muted'
                    }`}
                    aria-label={asset.selected ? i18nService.t('creatorAssetUnselect') : i18nService.t('creatorAssetSelect')}
                    title={asset.selected ? i18nService.t('creatorAssetUnselect') : i18nService.t('creatorAssetSelect')}
                  >
                    <CheckCircleIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleFavorite(asset)}
                    className={`absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background/90 transition-colors hover:bg-surface ${
                      asset.favorite ? 'text-amber-500' : 'text-muted'
                    }`}
                    aria-label={i18nService.t('creatorAssetFavorite')}
                  >
                    <StarIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2 p-3">
                  <h3 className="truncate text-sm font-semibold">{asset.fileName}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-md bg-surface-raised px-2 py-0.5 text-[11px] text-secondary">
                      {getAdoptionStatusLabel(asset.adoptionStatus)}
                    </span>
                    <span className="rounded-md bg-surface-raised px-2 py-0.5 text-[11px] text-secondary">
                      {getAssetSourceLabel(asset.source)}
                    </span>
                    {asset.selected && (
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                        {i18nService.t('creatorAssetSelected')}
                      </span>
                    )}
                    {asset.templateId && (
                      <span className="rounded-md bg-surface-raised px-2 py-0.5 text-[11px] text-secondary">
                        {asset.templateId}
                      </span>
                    )}
                    {asset.tags.slice(0, 3).map((assetTag) => (
                      <span key={assetTag} className="inline-flex items-center gap-1 rounded-md bg-surface-raised px-2 py-0.5 text-[11px] text-secondary">
                        <TagIcon className="h-3 w-3" />
                        {assetTag}
                      </span>
                    ))}
                  </div>
                  <select
                    value={asset.adoptionStatus}
                    onChange={(event) => void handleChangeAdoptionStatus(asset, event.target.value as CreatorAssetAdoptionStatusType)}
                    className="h-8 w-full rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                    aria-label={i18nService.t('creatorAssetStatus')}
                  >
                    {adoptionStatusOptions.map((status) => (
                      <option key={status} value={status}>{getAdoptionStatusLabel(status)}</option>
                    ))}
                  </select>
                  <div className="text-xs text-muted">{new Date(asset.createdAt).toLocaleString()}</div>
                  {!asset.sourceSessionAvailable && (
                    <div className="text-xs text-muted">{i18nService.t('creatorAssetSourceMissing')}</div>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-1 border-t border-border p-2">
                  <IconAction label={i18nService.t('creatorAssetUseAsReference')} onClick={() => onUseAssetAsReference(asset)}>
                    <SparklesIcon className="h-4 w-4" />
                  </IconAction>
                  <IconAction label={i18nService.t('creatorAssetSendToCowork')} onClick={() => onSendAssetToCowork(asset)}>
                    <PaperAirplaneIcon className="h-4 w-4" />
                  </IconAction>
                  <IconAction label={i18nService.t('copy')} onClick={() => void handleCopyPrompt(asset)}>
                    <ClipboardDocumentIcon className="h-4 w-4" />
                  </IconAction>
                  <IconAction label={i18nService.t('creatorAssetSource')} onClick={() => void handleOpenSource(asset)} disabled={!asset.sourceSessionAvailable}>
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </IconAction>
                  <IconAction label={i18nService.t('creatorAssetDetails')} onClick={() => setSelectedAsset(asset)}>
                    <InformationCircleIcon className="h-4 w-4" />
                  </IconAction>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <aside className="min-h-0 rounded-lg border border-border bg-surface">
        {selectedAsset ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">{i18nService.t('creatorAssetProvenance')}</h2>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
                aria-label={i18nService.t('close')}
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <AssetPreviewImage asset={selectedAsset} className="aspect-[4/3] w-full rounded-lg bg-surface-raised object-contain" />
              <ProvenanceRow label={i18nService.t('creatorAssetFileName')} value={selectedAsset.fileName} />
              <ProvenanceRow label={i18nService.t('creatorAssetLocalPath')} value={selectedAsset.filePath} />
              <ProvenanceRow label={i18nService.t('creatorAssetSource')} value={getAssetSourceLabel(selectedAsset.source)} />
              <ProvenanceRow label="templateId" value={selectedAsset.templateId || 'none'} />
              <ProvenanceRow label="caseIds" value={selectedAsset.caseIds.length > 0 ? selectedAsset.caseIds.join(', ') : 'none'} />
              <ProvenanceRow label="sessionId" value={selectedAsset.sessionId || 'none'} />
              <ProvenanceRow label="messageId" value={selectedAsset.messageId || 'none'} />
              <ProvenanceRow label="variantOfAssetId" value={selectedAsset.variantOfAssetId || 'none'} />
              <button
                type="button"
                onClick={() => void handleToggleSelected(selectedAsset)}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  selectedAsset.selected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-secondary hover:bg-surface-raised hover:text-foreground'
                }`}
              >
                <CheckCircleIcon className="h-4 w-4" />
                {selectedAsset.selected ? i18nService.t('creatorAssetUnselect') : i18nService.t('creatorAssetSelect')}
              </button>

              {selectedAssetCases.length > 0 && (
                <section className="rounded-lg border border-border p-3">
                  <h3 className="text-xs font-medium text-secondary">{i18nService.t('creatorAssetSourceCases')}</h3>
                  <div className="mt-2 space-y-3">
                    {selectedAssetCases.map((item) => (
                      <div key={item.id} className="rounded-lg bg-surface-raised p-3">
                        <div className="text-xs font-semibold text-foreground">{item.title}</div>
                        <div className="mt-1 text-[11px] text-muted">{item.sourceLabel || i18nService.t('creatorUnknownSource')}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.sourceUrl && <ExternalCaseLink href={item.sourceUrl} label={i18nService.t('creatorSourceUrl')} />}
                          {item.githubUrl && <ExternalCaseLink href={item.githubUrl} label={i18nService.t('creatorGithubUrl')} />}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-muted">{i18nService.t('creatorDisclaimer')}</p>
                </section>
              )}

              <label className="block">
                <span className="text-xs font-medium text-secondary">{i18nService.t('creatorAssetTags')}</span>
                <input
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-secondary">{i18nService.t('creatorAssetLicenseNote')}</span>
                <textarea
                  value={licenseNoteDraft}
                  onChange={(event) => setLicenseNoteDraft(event.target.value)}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-secondary">{i18nService.t('creatorAssetUsageNote')}</span>
                <textarea
                  value={usageNoteDraft}
                  onChange={(event) => setUsageNoteDraft(event.target.value)}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleSaveProvenance()}
                className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
              >
                {i18nService.t('creatorAssetSaveMetadata')}
              </button>

              <div className="rounded-lg border border-border p-3">
                <div className="text-xs font-medium text-secondary">{i18nService.t('creatorCollectionAddAsset')}</div>
                <div className="mt-2 flex gap-2">
                  <select
                    value={collectionTargetId}
                    onChange={(event) => setCollectionTargetId(event.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                  >
                    <option value="">{i18nService.t('creatorCollectionSelect')}</option>
                    {currentCollections.map((collection) => (
                      <option key={collection.id} value={collection.id}>{collection.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!collectionTargetId}
                    onClick={() => void handleAddToCollection()}
                    className="rounded-lg border border-border px-3 text-xs font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {i18nService.t('add')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => onUseAssetAsReference(selectedAsset)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground">
                  {i18nService.t('creatorAssetUseAsReference')}
                </button>
                <button type="button" onClick={() => onSendAssetToCowork(selectedAsset)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground">
                  {i18nService.t('creatorAssetSendToCowork')}
                </button>
                <button type="button" onClick={() => void handleOpenSource(selectedAsset)} disabled={!selectedAsset.sourceSessionAvailable} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
                  {i18nService.t('creatorAssetSource')}
                </button>
                <button type="button" onClick={() => void handleRevealAsset(selectedAsset)} disabled={!selectedAssetCanReveal} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
                  <FolderOpenIcon className="h-4 w-4" />
                  {i18nService.t('creatorAssetReveal')}
                </button>
              </div>

              <section>
                <h3 className="text-xs font-medium text-secondary">{i18nService.t('creatorPromptPreview')}</h3>
                <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-raised p-3 text-xs leading-5 text-secondary">
                  {selectedAsset.promptText || JSON.stringify(selectedAsset.promptSpec, null, 2)}
                </pre>
              </section>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[360px] flex-col items-center justify-center p-6 text-center">
            <InformationCircleIcon className="h-10 w-10 text-muted" />
            <div className="mt-3 text-sm font-medium">{i18nService.t('creatorAssetProvenanceEmptyTitle')}</div>
            <div className="mt-1 text-xs leading-5 text-muted">{i18nService.t('creatorAssetProvenanceEmptyHint')}</div>
          </div>
        )}
      </aside>
    </section>
  );
};

const IconAction: React.FC<{
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, disabled = false, onClick, children }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    title={label}
    className="inline-flex items-center justify-center rounded-lg px-2 py-2 text-xs font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
  >
    {children}
    <span className="sr-only">{label}</span>
  </button>
);

const ExternalCaseLink: React.FC<{
  href: string;
  label: string;
}> = ({ href, label }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
  >
    {label}
    <ArrowTopRightOnSquareIcon className="h-3 w-3" />
  </a>
);

const ProvenanceRow: React.FC<{
  label: string;
  value: string;
}> = ({ label, value }) => (
  <div>
    <div className="text-[11px] font-medium uppercase text-muted">{label}</div>
    <div className="mt-1 break-words rounded-lg bg-surface-raised p-2 text-xs leading-5 text-secondary">{value}</div>
  </div>
);
