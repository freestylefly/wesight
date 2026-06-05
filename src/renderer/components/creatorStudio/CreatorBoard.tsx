import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClipboardDocumentIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  CreatorBoardCardKind,
  CreatorBoardMoveDirection,
  CreatorProductionAssetKind,
} from '@shared/creatorStudio/constants';
import type {
  CreatorBoardCardRecord,
  CreatorBoardDirectionSnapshot,
  CreatorBoardWorkspaceSnapshot,
  CreatorProductionAssetRecord,
} from '@shared/creatorStudio/types';
import React, { useEffect, useMemo, useState } from 'react';

import casesData from '../../data/creatorStudio/cases.json';
import { creatorStudioAssetService } from '../../services/creatorStudioAssets';
import { i18nService } from '../../services/i18n';
import type { CreatorPromptSpec, CreatorStudioCase } from '../../types/creatorStudio';

const cases = casesData as CreatorStudioCase[];

const dispatchToast = (message: string) => {
  window.dispatchEvent(new CustomEvent('app:showToast', { detail: message }));
};

const copyText = async (text: string) => {
  await navigator.clipboard.writeText(text);
  dispatchToast(i18nService.t('copied'));
};

const splitCsv = (value: string): string[] => (
  value.split(',').map((item) => item.trim()).filter(Boolean)
);

const getCardKindLabel = (kind: CreatorBoardCardKind): string => {
  switch (kind) {
    case CreatorBoardCardKind.Asset:
      return i18nService.t('creatorBoardCardAsset');
    case CreatorBoardCardKind.Case:
      return i18nService.t('creatorBoardCardCase');
    case CreatorBoardCardKind.Prompt:
      return i18nService.t('creatorBoardCardPrompt');
    case CreatorBoardCardKind.Direction:
    default:
      return i18nService.t('creatorBoardCardDirection');
  }
};

const getAssetLabel = (asset: CreatorProductionAssetRecord): string => (
  asset.kind === CreatorProductionAssetKind.Image
    ? i18nService.t('creatorBoardGeneratedAsset')
    : asset.fileName
);

interface CreatorBoardProps {
  projectId: string;
  workspace: CreatorBoardWorkspaceSnapshot | null;
  currentPromptSpec: CreatorPromptSpec;
  currentPromptText: string;
  directions: CreatorBoardDirectionSnapshot[];
  onWorkspaceChange: (workspace: CreatorBoardWorkspaceSnapshot) => void;
  onUseContextPack: (contextPack: string) => void;
  onUseDirection: (direction: CreatorBoardDirectionSnapshot) => void;
}

export const CreatorBoard: React.FC<CreatorBoardProps> = ({
  projectId,
  workspace,
  currentPromptSpec,
  currentPromptText,
  directions,
  onWorkspaceChange,
  onUseContextPack,
  onUseDirection,
}) => {
  const [assets, setAssets] = useState<CreatorProductionAssetRecord[]>([]);
  const [caseQuery, setCaseQuery] = useState('');
  const [contextPack, setContextPack] = useState('');
  const [brandColors, setBrandColors] = useState('');
  const [bannedWords, setBannedWords] = useState('');
  const [tone, setTone] = useState('');
  const [visualPreferences, setVisualPreferences] = useState('');
  const [logoPath, setLogoPath] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cards = workspace?.cards ?? [];
  const selectedCards = cards.filter((card) => card.selected);

  useEffect(() => {
    if (!projectId) return;
    void creatorStudioAssetService.listAssets({ projectId, limit: 40 })
      .then((result) => setAssets(result.assets))
      .catch(() => setAssets([]));
  }, [projectId]);

  useEffect(() => {
    if (!workspace?.brandKit) return;
    setBrandColors(workspace.brandKit.colors.join(', '));
    setBannedWords(workspace.brandKit.bannedWords.join(', '));
    setTone(workspace.brandKit.tone);
    setVisualPreferences(workspace.brandKit.visualPreferences);
    setLogoPath(workspace.brandKit.logoPath ?? '');
  }, [workspace?.brandKit]);

  const filteredCases = useMemo(() => {
    const query = caseQuery.trim().toLowerCase();
    return cases
      .filter((item) => !query || [
        item.title,
        item.prompt,
        item.category,
        ...item.styles,
        ...item.scenes,
        ...item.tags,
      ].some((value) => value.toLowerCase().includes(query)))
      .slice(0, 8);
  }, [caseQuery]);

  const reload = async () => {
    if (!projectId) return;
    onWorkspaceChange(await creatorStudioAssetService.getBoardWorkspace(projectId));
  };

  const handleCreateBoard = async () => {
    if (!projectId) return;
    const name = window.prompt(i18nService.t('creatorBoardNamePrompt'));
    if (!name?.trim()) return;
    try {
      onWorkspaceChange(await creatorStudioAssetService.createBoard({ projectId, name: name.trim() }));
    } catch (createError) {
      dispatchToast(createError instanceof Error ? createError.message : i18nService.t('creatorBoardCreateFailed'));
    }
  };

  const handleSwitchBoard = async (boardId: string) => {
    if (!projectId) return;
    try {
      onWorkspaceChange(await creatorStudioAssetService.setCurrentBoard(projectId, boardId));
    } catch (switchError) {
      dispatchToast(switchError instanceof Error ? switchError.message : i18nService.t('creatorBoardSwitchFailed'));
    }
  };

  const addAssetCard = async (asset: CreatorProductionAssetRecord) => {
    if (!workspace?.currentBoardId) return;
    await creatorStudioAssetService.addBoardCard({
      boardId: workspace.currentBoardId,
      kind: CreatorBoardCardKind.Asset,
      title: getAssetLabel(asset),
      assetId: asset.id,
      promptText: asset.promptText,
      promptSpec: asset.promptSpec,
    });
    await reload();
  };

  const addCaseCard = async (item: CreatorStudioCase) => {
    if (!workspace?.currentBoardId) return;
    await creatorStudioAssetService.addBoardCard({
      boardId: workspace.currentBoardId,
      kind: CreatorBoardCardKind.Case,
      title: item.title,
      caseId: item.id,
      promptText: item.prompt,
      promptSpec: {
        sourceType: 'case',
        sourceId: item.id,
        sourceTitle: item.title,
        category: item.category,
        caseIds: [item.id],
        styles: item.styles,
        scenes: item.scenes,
        referencePrompt: item.prompt,
      },
    });
    await reload();
  };

  const addCurrentPrompt = async () => {
    if (!workspace?.currentBoardId) return;
    await creatorStudioAssetService.addBoardCard({
      boardId: workspace.currentBoardId,
      kind: CreatorBoardCardKind.Prompt,
      title: currentPromptSpec.subject || currentPromptSpec.sourceTitle || i18nService.t('creatorPromptAssetDefaultTitle'),
      promptText: currentPromptText,
      promptSpec: { ...currentPromptSpec },
    });
    await reload();
  };

  const addDirection = async (direction: CreatorBoardDirectionSnapshot) => {
    if (!workspace?.currentBoardId) return;
    await creatorStudioAssetService.addBoardCard({
      boardId: workspace.currentBoardId,
      kind: CreatorBoardCardKind.Direction,
      title: direction.title,
      direction,
      promptText: direction.promptFocus,
    });
    await reload();
  };

  const updateCard = async (card: CreatorBoardCardRecord, changes: Partial<CreatorBoardCardRecord>) => {
    await creatorStudioAssetService.updateBoardCard({
      cardId: card.id,
      ...(changes.title !== undefined ? { title: changes.title } : {}),
      ...(changes.groupName !== undefined ? { groupName: changes.groupName } : {}),
      ...(changes.notes !== undefined ? { notes: changes.notes } : {}),
      ...(changes.direction !== undefined ? { direction: changes.direction } : {}),
    });
    await reload();
  };

  const buildContextPack = async () => {
    if (!workspace?.currentBoardId) return;
    if (selectedCards.length === 0) {
      dispatchToast(i18nService.t('creatorBoardSelectionRequired'));
      return;
    }
    try {
      const result = await creatorStudioAssetService.buildBoardContextPack({
        boardId: workspace.currentBoardId,
        cardIds: selectedCards.map((card) => card.id),
      });
      setContextPack(result.contextPack);
      onUseContextPack(result.contextPack);
      dispatchToast(i18nService.t('creatorBoardContextPackReady'));
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : i18nService.t('creatorBoardContextPackFailed'));
    }
  };

  const saveBrandKit = async () => {
    if (!projectId) return;
    try {
      onWorkspaceChange(await creatorStudioAssetService.updateBrandKit({
        projectId,
        colors: splitCsv(brandColors),
        bannedWords: splitCsv(bannedWords),
        tone,
        visualPreferences,
        logoPath: logoPath.trim() || null,
      }));
      dispatchToast(i18nService.t('creatorBrandKitSaved'));
    } catch (saveError) {
      dispatchToast(saveError instanceof Error ? saveError.message : i18nService.t('creatorBrandKitSaveFailed'));
    }
  };

  if (!workspace) {
    return (
      <div className="flex min-h-[360px] items-center justify-center p-6 text-sm text-muted">
        {i18nService.t('loading')}
      </div>
    );
  }

  return (
    <section className="grid gap-4 p-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Panel title={i18nService.t('creatorBoardSources')}>
          <button
            type="button"
            onClick={() => void addCurrentPrompt()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
          >
            <PlusIcon className="h-4 w-4" />
            {i18nService.t('creatorBoardAddCurrentPrompt')}
          </button>
          <div className="mt-3 space-y-2">
            <div className="text-xs font-medium text-secondary">{i18nService.t('creatorCreativeDirections')}</div>
            {directions.map((direction) => (
              <button
                key={direction.id}
                type="button"
                onClick={() => void addDirection(direction)}
                className="w-full rounded-lg border border-border p-2 text-left text-xs transition-colors hover:bg-surface-raised"
              >
                <span className="font-medium">{direction.title}</span>
                <span className="mt-1 block text-muted">{direction.promptFocus}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title={i18nService.t('creatorBoardAssets')}>
          <div className="space-y-2">
            {assets.slice(0, 10).map((asset) => (
              <SourceButton key={asset.id} title={asset.fileName} subtitle={getAssetLabel(asset)} onClick={() => void addAssetCard(asset)} />
            ))}
          </div>
        </Panel>

        <Panel title={i18nService.t('creatorBoardCases')}>
          <input
            value={caseQuery}
            onChange={(event) => setCaseQuery(event.target.value)}
            placeholder={i18nService.t('creatorSearchPlaceholder')}
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 space-y-2">
            {filteredCases.map((item) => (
              <SourceButton key={item.id} title={item.title} subtitle={item.category} onClick={() => void addCaseCard(item)} />
            ))}
          </div>
        </Panel>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{i18nService.t('creatorBoardTitle')}</h2>
              <p className="mt-1 text-xs text-muted">{i18nService.t('creatorBoardHint')}</p>
            </div>
            <div className="flex gap-2">
              <select
                value={workspace.currentBoardId}
                onChange={(event) => void handleSwitchBoard(event.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                aria-label={i18nService.t('creatorBoardSelect')}
              >
                {workspace.boards.map((board) => (
                  <option key={board.id} value={board.id}>{board.name}</option>
                ))}
              </select>
              <button type="button" onClick={() => void handleCreateBoard()} className="rounded-lg border border-border px-3 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground">
                {i18nService.t('creatorBoardCreate')}
              </button>
            </div>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">{error}</div>}

        <div className="space-y-3">
          {cards.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface text-center">
              <SparklesIcon className="h-10 w-10 text-muted" />
              <div className="mt-3 text-sm font-medium">{i18nService.t('creatorBoardEmptyTitle')}</div>
              <div className="mt-1 text-xs text-muted">{i18nService.t('creatorBoardEmptyHint')}</div>
            </div>
          ) : (
            cards.map((card) => (
              <BoardCard
                key={card.id}
                card={card}
                onUpdate={updateCard}
                onMove={(direction) => creatorStudioAssetService.moveBoardCard({ cardId: card.id, direction }).then(reload)}
                onSelect={(selected) => creatorStudioAssetService.selectBoardCard({ cardId: card.id, selected }).then(reload)}
                onRemove={() => creatorStudioAssetService.removeBoardCard(card.id).then(reload)}
                onUseDirection={onUseDirection}
              />
            ))
          )}
        </div>
      </div>

      <div className="space-y-4">
        <Panel title={i18nService.t('creatorBoardSelection')}>
          <div className="space-y-2">
            {selectedCards.length === 0 ? (
              <div className="text-xs leading-5 text-muted">{i18nService.t('creatorBoardSelectionEmpty')}</div>
            ) : (
              selectedCards.map((card) => (
                <div key={card.id} className="rounded-lg bg-surface-raised p-2 text-xs">
                  <div className="font-medium">{card.title}</div>
                  <div className="text-muted">{getCardKindLabel(card.kind)}</div>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            disabled={selectedCards.length === 0}
            title={selectedCards.length === 0 ? i18nService.t('creatorBoardSelectionRequired') : undefined}
            onClick={() => void buildContextPack()}
            className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-55"
          >
            {i18nService.t('creatorBoardBuildContextPack')}
          </button>
          {contextPack && (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-secondary">{i18nService.t('creatorContextPack')}</span>
                <button type="button" onClick={() => void copyText(contextPack)} className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <ClipboardDocumentIcon className="h-4 w-4" />
                  {i18nService.t('copy')}
                </button>
              </div>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-xs leading-5 text-secondary">{contextPack}</pre>
            </div>
          )}
        </Panel>

        <Panel title={i18nService.t('creatorBrandKit')}>
          <BrandInput label={i18nService.t('creatorBrandColors')} value={brandColors} onChange={setBrandColors} />
          <BrandInput label={i18nService.t('creatorBrandLogoPath')} value={logoPath} onChange={setLogoPath} />
          <BrandInput label={i18nService.t('creatorBrandBannedWords')} value={bannedWords} onChange={setBannedWords} />
          <BrandInput label={i18nService.t('creatorBrandTone')} value={tone} onChange={setTone} />
          <label className="block">
            <span className="text-xs font-medium text-secondary">{i18nService.t('creatorBrandVisualPreferences')}</span>
            <textarea value={visualPreferences} onChange={(event) => setVisualPreferences(event.target.value)} rows={4} className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <button type="button" onClick={() => void saveBrandKit()} className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-foreground">
            {i18nService.t('creatorBrandKitSave')}
          </button>
        </Panel>
      </div>
    </section>
  );
};

const Panel: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <section className="rounded-lg border border-border bg-surface p-4">
    <h2 className="text-sm font-semibold">{title}</h2>
    <div className="mt-3">{children}</div>
  </section>
);

const SourceButton: React.FC<{
  title: string;
  subtitle: string;
  onClick: () => void;
}> = ({ title, subtitle, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-start gap-2 rounded-lg border border-border p-2 text-left transition-colors hover:bg-surface-raised"
  >
    <PlusIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
    <span className="min-w-0">
      <span className="line-clamp-2 text-xs font-medium">{title}</span>
      <span className="mt-0.5 block truncate text-[11px] text-muted">{subtitle}</span>
    </span>
  </button>
);

const BoardCard: React.FC<{
  card: CreatorBoardCardRecord;
  onUpdate: (card: CreatorBoardCardRecord, changes: Partial<CreatorBoardCardRecord>) => Promise<void>;
  onMove: (direction: CreatorBoardMoveDirection) => Promise<CreatorBoardCardRecord | null | void>;
  onSelect: (selected: boolean) => Promise<CreatorBoardCardRecord | null | void>;
  onRemove: () => Promise<CreatorBoardCardRecord | null | void>;
  onUseDirection: (direction: CreatorBoardDirectionSnapshot) => void;
}> = ({ card, onUpdate, onMove, onSelect, onRemove, onUseDirection }) => {
  const [title, setTitle] = useState(card.title);
  const [groupName, setGroupName] = useState(card.groupName ?? '');
  const [notes, setNotes] = useState(card.notes ?? '');

  useEffect(() => {
    setTitle(card.title);
    setGroupName(card.groupName ?? '');
    setNotes(card.notes ?? '');
  }, [card]);

  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase text-muted">{getCardKindLabel(card.kind)}</div>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void onUpdate(card, { title })}
            className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-primary"
          />
        </div>
        <div className="flex gap-1">
          <IconButton label={i18nService.t('moveUp')} onClick={() => void onMove(CreatorBoardMoveDirection.Up)}>
            <ArrowUpIcon className="h-4 w-4" />
          </IconButton>
          <IconButton label={i18nService.t('moveDown')} onClick={() => void onMove(CreatorBoardMoveDirection.Down)}>
            <ArrowDownIcon className="h-4 w-4" />
          </IconButton>
          <IconButton label={i18nService.t('delete')} onClick={() => void onRemove()}>
            <TrashIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-secondary">{i18nService.t('creatorBoardGroup')}</span>
          <input value={groupName} onChange={(event) => setGroupName(event.target.value)} onBlur={() => void onUpdate(card, { groupName })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
        </label>
        <label className="inline-flex items-end gap-2 text-sm text-secondary">
          <input type="checkbox" checked={card.selected} onChange={(event) => void onSelect(event.target.checked)} className="h-4 w-4 rounded border-border" />
          {i18nService.t('creatorBoardSelectForContext')}
        </label>
      </div>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-secondary">{i18nService.t('creatorBoardNotes')}</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => void onUpdate(card, { notes })} rows={3} className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
      </label>
      {card.direction && (
        <div className="mt-3 rounded-lg bg-surface-raised p-3 text-xs leading-5 text-secondary">
          <div className="font-medium text-foreground">{card.direction.title}</div>
          <div>{card.direction.template}</div>
          <div>{card.direction.promptFocus}</div>
          <button type="button" onClick={() => onUseDirection(card.direction!)} className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-surface hover:text-foreground">
            {i18nService.t('creatorBoardUseDirection')}
          </button>
        </div>
      )}
      {card.promptText && (
        <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-raised p-3 text-xs leading-5 text-muted">{card.promptText}</pre>
      )}
    </article>
  );
};

const IconButton: React.FC<{
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, onClick, children }) => (
  <button type="button" title={label} onClick={onClick} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-foreground">
    {children}
    <span className="sr-only">{label}</span>
  </button>
);

const BrandInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => (
  <label className="mb-3 block">
    <span className="text-xs font-medium text-secondary">{label}</span>
    <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
  </label>
);
