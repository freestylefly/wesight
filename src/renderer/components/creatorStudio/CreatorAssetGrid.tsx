import {
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
  FolderOpenIcon,
  PhotoIcon,
  SparklesIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import { CreatorProductionAssetStatus } from '@shared/creatorStudio/constants';
import type { CreatorProductionAssetRecord } from '@shared/creatorStudio/types';
import React, { useEffect, useState } from 'react';

import { creatorStudioAssetService } from '../../services/creatorStudioAssets';
import { i18nService } from '../../services/i18n';

interface CreatorAssetGridProps {
  onOpenCoworkSession: (sessionId: string) => Promise<boolean>;
  onUseAssetAsReference: (asset: CreatorProductionAssetRecord) => void;
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
  alt: string;
  className?: string;
}> = ({ className = '' }) => (
  <div className={`flex items-center justify-center bg-surface-raised text-muted ${className}`}>
    <PhotoIcon className="h-10 w-10" />
  </div>
);

export const CreatorAssetGrid: React.FC<CreatorAssetGridProps> = ({ onOpenCoworkSession, onUseAssetAsReference }) => {
  const [assets, setAssets] = useState<CreatorProductionAssetRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAssets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await creatorStudioAssetService.listAssets({ limit: 80 });
      setAssets(result.assets);
      setTotal(result.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : i18nService.t('creatorAssetsLoadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAssets();
  }, []);

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
      const source = await creatorStudioAssetService.getAssetSource(asset.id);
      if (!source?.session) {
        dispatchToast(i18nService.t('creatorAssetSourceUnavailable'));
        await loadAssets();
        return;
      }
      const opened = await onOpenCoworkSession(source.session.id);
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
      const updated = await creatorStudioAssetService.setFavorite(asset.id, !asset.favorite);
      if (!updated) return;
      setAssets((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch {
      dispatchToast(i18nService.t('creatorAssetFavoriteFailed'));
    }
  };

  return (
    <section className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{i18nService.t('creatorAssetsTitle')}</h2>
          <p className="mt-1 text-xs text-muted">
            {i18nService.t('creatorAssetsCount').replace('{count}', String(total))}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAssets()}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          {isLoading ? i18nService.t('loading') : i18nService.t('creatorAssetsRefresh')}
        </button>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {assets.map((asset) => (
            <article key={asset.id} className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="relative aspect-[4/3] bg-surface-raised">
                {asset.status === CreatorProductionAssetStatus.Ready ? (
                  <img
                    src={encodeLocalFileSrc(asset.filePath)}
                    alt={asset.fileName}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <PlaceholderImage alt={asset.fileName} className="h-full w-full" />
                )}
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
                  {asset.templateId && (
                    <span className="rounded-md bg-surface-raised px-2 py-0.5 text-[11px] text-secondary">
                      {asset.templateId}
                    </span>
                  )}
                  {asset.caseIds.slice(0, 2).map((caseId) => (
                    <span key={caseId} className="rounded-md bg-surface-raised px-2 py-0.5 text-[11px] text-secondary">
                      {caseId}
                    </span>
                  ))}
                  {asset.messageId && (
                    <span className="rounded-md bg-surface-raised px-2 py-0.5 text-[11px] text-muted">
                      {i18nService.t('creatorAssetMessageTag')}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {new Date(asset.createdAt).toLocaleString()}
                </div>
                {!asset.sourceSessionAvailable && (
                  <div className="text-xs text-muted">{i18nService.t('creatorAssetSourceMissing')}</div>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1 border-t border-border p-2">
                <button
                  type="button"
                  onClick={() => onUseAssetAsReference(asset)}
                  className="inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
                >
                  <SparklesIcon className="h-4 w-4" />
                  {i18nService.t('creatorAssetUseAsReference')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyPrompt(asset)}
                  className="inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
                >
                  <ClipboardDocumentIcon className="h-4 w-4" />
                  {i18nService.t('copy')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenSource(asset)}
                  disabled={!asset.sourceSessionAvailable}
                  className="inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  {i18nService.t('creatorAssetSource')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRevealAsset(asset)}
                  className="inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
                >
                  <FolderOpenIcon className="h-4 w-4" />
                  {i18nService.t('creatorAssetReveal')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
