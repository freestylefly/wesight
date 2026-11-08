import { CheckIcon, ChevronDownIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';

import { getModelVendor } from '../../shared/models/catalog';
import { MODEL_VENDOR_LABELS, ModelVendor } from '../../shared/models/constants';
import { ProviderName } from '../../shared/providers';
import { i18nService } from '../services/i18n';
import { groupModelsByProvider } from '../services/modelCatalog';
import type { RootState } from '../store';
import { getModelIdentityKey, isSameModelIdentity, type Model, setSelectedModel } from '../store/slices/modelSlice';
import { ModelSelectorEvent, ModelSelectorLayout } from './models/constants';
import { ModelCatalogList } from './models/ModelCatalogList';
import { ModelVendorIcon } from './models/ModelVendorIcon';

interface ModelSelectorProps {
  dropdownDirection?: 'up' | 'down';
  /** Controlled mode preserves the global model; null selects the supplied default. */
  value?: Model | null;
  onChange?: (model: Model | null) => void;
  defaultLabel?: string;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ dropdownDirection = 'down', value, onChange, defaultLabel }) => {
  const dispatch = useDispatch();
  const globalSelectedModel = useSelector((state: RootState) => state.model.selectedModel);
  const availableModels = useSelector((state: RootState) => state.model.availableModels);
  const controlled = onChange !== undefined;
  const selectedModel = controlled ? value ?? null : globalSelectedModel;
  const groups = groupModelsByProvider(availableModels, i18nService.t('modelGroupServer'), i18nService.t('modelGroupUser'));
  const [isOpen, setIsOpen] = useState(false);
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const [position, setPosition] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const activeGroup = groups.find(group => group.key === activeGroupKey)
    ?? groups.find(group => selectedModel && group.models.some(model => isSameModelIdentity(model, selectedModel)))
    ?? groups[0];

  const close = () => {
    setIsOpen(false);
    setActiveGroupKey(null);
  };

  useEffect(() => {
    if (isOpen) popupRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
  }, [isOpen]);

  useEffect(() => {
    const open = () => setIsOpen(true);
    window.addEventListener(ModelSelectorEvent.Open, open);
    return () => window.removeEventListener(ModelSelectorEvent.Open, open);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const outside = (event: MouseEvent) => {
      if (!buttonRef.current?.contains(event.target as Node) && !popupRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveGroupKey(null);
      }
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [isOpen]);

  // A portal avoids clipping inside the composer, dialogs, and scroll containers.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const place = () => {
      const anchor = buttonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const { ViewportMargin: margin, Gap: gap } = ModelSelectorLayout;
      const width = Math.min(ModelSelectorLayout.Width, window.innerWidth - margin * 2);
      const height = Math.min(ModelSelectorLayout.Height, window.innerHeight - margin * 2);
      const above = anchor.top - margin - gap;
      const below = window.innerHeight - anchor.bottom - margin - gap;
      const up = dropdownDirection === 'up' ? above >= Math.min(height, 260) || above > below
        : below < Math.min(height, 260) && above > below;
      const maxHeight = Math.max(120, Math.min(height, up ? above : below));
      setPosition({
        width,
        maxHeight,
        left: Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin)),
        ...(up ? { bottom: window.innerHeight - anchor.top + gap } : { top: anchor.bottom + gap }),
      });
    };
    place();
    window.addEventListener('resize', place);
    const onScroll = (event: Event) => { if (!popupRef.current?.contains(event.target as Node)) place(); };
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [isOpen, dropdownDirection]);

  const fullLabel = (model: Model | null) => {
    if (!model) return defaultLabel ?? '';
    const vendor = model.providerKey === ProviderName.Ciyuan ? getModelVendor(model) : null;
    return [model.provider, vendor && vendor !== ModelVendor.Other ? MODEL_VENDOR_LABELS[vendor] : null, model.name].filter(Boolean).join(' · ');
  };
  const compactLabel = selectedModel
    ? (selectedModel.name || selectedModel.id).split('·').map(part => part.trim()).filter(Boolean).pop()
    : defaultLabel;
  const select = (model: Model | null) => {
    if (controlled) onChange(model);
    else if (model) dispatch(setSelectedModel(model));
    close();
    buttonRef.current?.focus();
  };

  if (availableModels.length === 0) {
    return <div className="rounded-xl bg-surface px-3 py-1.5 text-sm text-secondary">{i18nService.t('modelSelectorNoModels')}</div>;
  }

  return <div className="relative min-w-0">
    <button ref={buttonRef} type="button" aria-expanded={isOpen} aria-controls={popupId} aria-haspopup="dialog"
      onClick={() => { if (isOpen) close(); else setIsOpen(true); }} title={fullLabel(selectedModel)}
      className={`flex min-w-0 max-w-[150px] items-center gap-2 rounded-xl px-3 py-1.5 text-foreground transition-colors hover:bg-surface-raised sm:max-w-[180px] ${isOpen ? 'bg-surface-raised' : ''}`}>
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm font-medium">{compactLabel}</span>
        {selectedModel?.providerKey === ProviderName.Ciyuan && <span className="block truncate text-[10px] text-secondary">
          {selectedModel.provider} · {getModelVendor(selectedModel) === ModelVendor.Other ? i18nService.t('modelCatalogOther') : MODEL_VENDOR_LABELS[getModelVendor(selectedModel)]}
        </span>}
      </span>
      <ChevronDownIcon className={`h-4 w-4 shrink-0 text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
    </button>
    {isOpen && createPortal(<div ref={popupRef} id={popupId} role="dialog" aria-label={i18nService.t('modelCatalogSelect')}
      style={position} className="fixed z-[200] flex flex-col overflow-hidden rounded-xl border border-border bg-surface text-foreground shadow-popover popover-enter"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); buttonRef.current?.focus(); }
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && event.target instanceof HTMLButtonElement) {
          const options = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>('[data-model-option]') ?? []);
          const index = options.indexOf(event.target);
          if (index >= 0 && options.length) {
            event.preventDefault();
            options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
          }
        }
        if (event.key === 'ArrowDown' && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          popupRef.current?.querySelector<HTMLButtonElement>('[data-model-option]')?.focus();
        }
      }}>
      {defaultLabel && <button type="button" onClick={() => select(null)} className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 text-left text-xs hover:bg-surface-hover">
        <span>{defaultLabel}</span>{!selectedModel && <CheckIcon className="h-4 w-4 text-primary" />}
      </button>}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div className="flex max-h-32 shrink-0 flex-col border-b border-border sm:max-h-none sm:w-44 sm:border-b-0 sm:border-r">
          <div className="shrink-0 px-3 pt-3 text-xs font-medium text-secondary">{i18nService.t('modelProviders')}</div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {groups.map(group => <button type="button" key={group.key} aria-pressed={activeGroup?.key === group.key}
              onClick={() => setActiveGroupKey(group.key)} onMouseEnter={() => setActiveGroupKey(group.key)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors ${activeGroup?.key === group.key ? 'bg-primary-muted text-primary' : 'text-foreground hover:bg-surface-hover'}`}>
              <ModelVendorIcon vendor={group.key} />
              <span className="min-w-0 flex-1 truncate" title={group.label}>{group.label}</span>
              {selectedModel && group.models.some(model => isSameModelIdentity(model, selectedModel))
                ? <CheckIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                : <span className="text-[10px] text-secondary">{group.models.length}</span>}
            </button>)}
          </div>
        </div>
        {activeGroup && <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2.5">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2 text-xs font-medium">
            <span className="truncate">{activeGroup.label}</span>
            <span className="shrink-0 text-[10px] font-normal text-secondary">{i18nService.t('modelCatalogModelsCount').replace('{count}', String(activeGroup.models.length))}</span>
          </div>
          <ModelCatalogList key={activeGroup.key} models={activeGroup.models} groupByVendor={activeGroup.key === ProviderName.Ciyuan}
            className="max-h-[280px]" renderModel={model => {
              const selected = !!selectedModel && isSameModelIdentity(model, selectedModel);
              return <button key={getModelIdentityKey(model)} type="button" data-model-option aria-pressed={selected} title={fullLabel(model)} onClick={() => select(model)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-hover ${selected ? 'bg-primary-muted text-primary' : 'text-foreground'}`}>
                <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate text-xs font-medium">{model.name}</span>
                  {model.supportsImage && <span className="shrink-0 rounded-md bg-primary-muted px-1.5 py-0.5 text-[9px] text-primary">{i18nService.t('imageInput')}</span>}
                </span><span className="mt-0.5 block truncate text-[10px] text-secondary">{model.id}</span></span>
                {selected && <CheckIcon className="h-4 w-4 shrink-0 text-primary" />}
              </button>;
            }} />
        </div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
        <button type="button" onClick={() => { close(); window.dispatchEvent(new Event(ModelSelectorEvent.ManageProviders)); }} className="inline-flex items-center gap-1.5 text-xs text-secondary hover:text-primary">
          <Cog6ToothIcon className="h-3.5 w-3.5" />{i18nService.t('modelCatalogManage')}
        </button>
        <span className="text-[10px] text-secondary">{i18nService.t('modelCatalogChooseHint')}</span>
      </div>
    </div>, document.body)}
  </div>;
};

export default ModelSelector;
