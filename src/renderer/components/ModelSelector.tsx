import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { TokenDance } from '../../shared/tokendance/constants';
import { i18nService } from '../services/i18n';
import { RootState } from '../store';
import type { Model } from '../store/slices/modelSlice';
import {
  getModelIdentityKey,
  isSameModelIdentity,
  setSelectedModel,
} from '../store/slices/modelSlice';
import ChevronRightIcon from './icons/ChevronRightIcon';

interface ModelSelectorProps {
  dropdownDirection?: 'up' | 'down';
  /**
   * Controlled mode: the currently selected Model (or `null` for "default").
   * When provided, the component does NOT read/write Redux global state.
   */
  value?: Model | null;
  /** Controlled mode callback. `null` means the user picked "default". */
  onChange?: (model: Model | null) => void;
  /** Show a "default" option at the top of the dropdown (controlled mode only). */
  defaultLabel?: string;
}

interface ModelProviderGroup {
  key: string;
  label: string;
  models: Model[];
  isServerGroup: boolean;
}

const SERVER_MODEL_GROUP_KEY = '__server_models__';
const SUBMENU_VIEWPORT_MARGIN = 12;
const MODEL_SUBMENU_ESTIMATED_HEIGHT = 320;

const getSubmenuTop = (
  itemElement: HTMLElement | null | undefined,
  menuElement: HTMLElement | null | undefined,
  submenuElement: HTMLElement | null | undefined,
  estimatedHeight: number,
): number => {
  if (!itemElement || !menuElement) return 0;
  const itemRect = itemElement.getBoundingClientRect();
  const menuRect = menuElement.getBoundingClientRect();
  const rawTop = itemRect.top - menuRect.top;
  const submenuHeight = Math.min(
    submenuElement?.offsetHeight || estimatedHeight,
    window.innerHeight - SUBMENU_VIEWPORT_MARGIN * 2,
  );
  const viewportMaxTop = window.innerHeight - SUBMENU_VIEWPORT_MARGIN - submenuHeight - menuRect.top;
  return Math.max(0, Math.min(rawTop, viewportMaxTop));
};

const ModelSelector: React.FC<ModelSelectorProps> = ({
  dropdownDirection = 'down',
  value,
  onChange,
  defaultLabel,
}) => {
  const dispatch = useDispatch();
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const submenuRef = React.useRef<HTMLDivElement>(null);
  const groupItemRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const controlled = onChange !== undefined;
  const globalSelectedModel = useSelector((state: RootState) => state.model.selectedModel);
  const selectedModel = controlled ? value ?? null : globalSelectedModel;
  const availableModels = useSelector((state: RootState) => state.model.availableModels);
  const modelGroups = React.useMemo<ModelProviderGroup[]>(() => {
    const serverModels = availableModels.filter(model => model.isServerModel);
    const userModels = availableModels.filter(model => !model.isServerModel);
    const groups: ModelProviderGroup[] = [];

    if (serverModels.length > 0) {
      groups.push({
        key: SERVER_MODEL_GROUP_KEY,
        label: i18nService.t('modelGroupServer'),
        models: serverModels,
        isServerGroup: true,
      });
    }

    const userGroups = new Map<string, ModelProviderGroup>();
    userModels.forEach((model) => {
      const providerLabel = model.provider?.trim() || i18nService.t('modelGroupUser');
      const providerKey = model.providerKey?.trim() || `provider:${providerLabel}`;
      const existing = userGroups.get(providerKey);
      if (existing) {
        existing.models.push(model);
        return;
      }
      userGroups.set(providerKey, {
        key: providerKey,
        label: providerLabel,
        models: [model],
        isServerGroup: false,
      });
    });

    const tokenDanceGroup = userGroups.get(TokenDance.Provider);
    userGroups.delete(TokenDance.Provider);
    return [...(tokenDanceGroup ? [tokenDanceGroup] : []), ...groups, ...userGroups.values()];
  }, [availableModels]);
  const [activeGroupKey, setActiveGroupKey] = React.useState<string | null>(null);
  const [activeGroupTop, setActiveGroupTop] = React.useState(0);

  const getCompactModelLabel = React.useCallback((model: Model | null): string => {
    if (!model) return defaultLabel ?? '';
    const rawName = model.name || model.id;
    const separatorParts = rawName.split('·').map(part => part.trim()).filter(Boolean);
    return separatorParts.length > 1 ? separatorParts[separatorParts.length - 1] : rawName;
  }, [defaultLabel]);

  const getFullModelLabel = React.useCallback((model: Model | null): string => {
    if (!model) return defaultLabel ?? '';
    if (model.provider && !model.name.toLowerCase().includes(model.provider.toLowerCase())) {
      return `${model.provider} · ${model.name}`;
    }
    return model.name;
  }, [defaultLabel]);

  // 点击外部区域关闭下拉框
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  React.useEffect(() => {
    const handleOpenModelSelector = () => {
      setIsOpen(true);
    };
    window.addEventListener('cowork:open-model-selector', handleOpenModelSelector);
    return () => {
      window.removeEventListener('cowork:open-model-selector', handleOpenModelSelector);
    };
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      setActiveGroupKey(null);
      setActiveGroupTop(0);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!activeGroupKey) return;
    const itemElement = groupItemRefs.current[activeGroupKey];
    setActiveGroupTop(getSubmenuTop(
      itemElement,
      dropdownRef.current,
      submenuRef.current,
      MODEL_SUBMENU_ESTIMATED_HEIGHT,
    ));
  }, [activeGroupKey]);

  const activateGroup = React.useCallback((groupKey: string) => {
    setActiveGroupKey(groupKey);
    setActiveGroupTop(getSubmenuTop(
      groupItemRefs.current[groupKey],
      dropdownRef.current,
      submenuRef.current,
      MODEL_SUBMENU_ESTIMATED_HEIGHT,
    ));
  }, []);

  const handleModelSelect = (model: Model | null) => {
    if (controlled) {
      onChange(model);
    } else if (model) {
      dispatch(setSelectedModel(model));
    }
    setIsOpen(false);
  };

  // 如果没有可用模型，显示提示
  if (availableModels.length === 0) {
    return (
      <div className="px-3 py-1.5 rounded-xl bg-surface text-secondary text-sm">
        {i18nService.t('modelSelectorNoModels')}
      </div>
    );
  }

  const dropdownPositionClass = dropdownDirection === 'up'
    ? 'bottom-full mb-1'
    : 'top-full mt-1';
  const activeGroup = modelGroups.find(group => group.key === activeGroupKey) ?? null;

  const isSelected = (model: Model): boolean => {
    if (!selectedModel) return false;
    return isSameModelIdentity(model, selectedModel);
  };

  const groupHasSelectedModel = (group: ModelProviderGroup): boolean => (
    !!selectedModel && group.models.some(model => isSameModelIdentity(model, selectedModel))
  );

  const renderModelItem = (model: Model) => (
    <button
      key={getModelIdentityKey(model)}
      onClick={() => handleModelSelect(model)}
      title={getFullModelLabel(model)}
      className={`w-full px-3 py-2.5 text-left dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover flex items-center justify-between gap-3 transition-colors ${
        isSelected(model) ? 'dark:bg-claude-darkSurfaceHover/50 bg-claude-surfaceHover/50' : ''
      }`}
    >
      <div className="min-w-0 flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm">{model.name}</span>
          {model.supportsImage && (
            <span className="text-[10px] leading-none px-1.5 py-0.5 rounded-md bg-primary/10 text-primary whitespace-nowrap">
              {i18nService.t('imageInput')}
            </span>
          )}
        </div>
        {model.provider && (
          <span className="text-xs text-secondary">{model.provider}</span>
        )}
      </div>
      {isSelected(model) && (
        <CheckIcon className="h-4 w-4 text-claude-accent" />
      )}
    </button>
  );

  const renderEmptyModels = () => (
    <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-secondary">
      {i18nService.t('modelSelectorProviderNoModels')}
    </div>
  );

  return (
    <div ref={containerRef} className="relative cursor-pointer">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex min-w-0 max-w-[150px] items-center gap-2 rounded-xl px-3 py-1.5 text-foreground transition-colors hover:bg-surface-raised sm:max-w-[180px] ${isOpen ? 'bg-surface-raised' : ''}`}
        title={getFullModelLabel(selectedModel)}
      >
        <span className="min-w-0 truncate text-sm font-medium">{getCompactModelLabel(selectedModel)}</span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className={`absolute ${dropdownPositionClass} right-0 z-50 w-64 overflow-visible rounded-xl border border-border bg-surface shadow-popover popover-enter`}
          onMouseLeave={() => setActiveGroupKey(null)}
        >
          <div className="max-h-72 overflow-y-auto py-1">
            {defaultLabel && (
              <button
                onClick={() => handleModelSelect(null)}
                title={defaultLabel}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-claude-text transition-colors hover:bg-claude-surfaceHover dark:text-claude-darkText dark:hover:bg-claude-darkSurfaceHover ${
                  !selectedModel ? 'dark:bg-claude-darkSurfaceHover/50 bg-claude-surfaceHover/50' : ''
                }`}
              >
                <span className="min-w-0 truncate text-sm">{defaultLabel}</span>
                {!selectedModel && <CheckIcon className="h-4 w-4 text-claude-accent" />}
              </button>
            )}
              {modelGroups.map((group) => {
                const active = group.key === activeGroup?.key;
                const selectedInGroup = groupHasSelectedModel(group);
                return (
                  <button
                    ref={(element) => {
                      groupItemRefs.current[group.key] = element;
                    }}
                    key={group.key}
                    type="button"
                    title={group.label}
                    onMouseEnter={() => activateGroup(group.key)}
                    onFocus={() => activateGroup(group.key)}
                    onClick={() => activateGroup(group.key)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-raised ${
                      active ? 'bg-surface-raised/80 text-foreground' : 'text-secondary'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{group.label}</span>
                      <span className="mt-0.5 block text-xs text-secondary">
                        {group.models.length} {i18nService.t('modelSelectorModelCount')}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {selectedInGroup && <CheckIcon className="h-4 w-4 text-claude-accent" />}
                      <ChevronRightIcon className="h-3.5 w-3.5 text-secondary" />
                    </span>
                  </button>
                );
              })}
          </div>
          {activeGroup && (
            <div
              ref={submenuRef}
              className="absolute right-full z-50 mr-1 w-72 overflow-hidden rounded-xl border border-border bg-surface shadow-popover"
              style={{ top: activeGroupTop }}
            >
              <div className="border-b border-border px-3 py-2 text-xs font-medium text-secondary">
                <span className="block truncate" title={activeGroup.label}>
                  {activeGroup.label}
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {activeGroup.models.length > 0
                  ? activeGroup.models.map(renderModelItem)
                  : renderEmptyModels()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
