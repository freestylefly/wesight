import { ArrowPathIcon } from '@heroicons/react/24/outline';

import type { CatalogModel } from '../../../shared/models/catalog';
import { i18nService } from '../../services/i18n';
import PencilIcon from '../icons/PencilIcon';
import PlusCircleIcon from '../icons/PlusCircleIcon';
import TrashIcon from '../icons/TrashIcon';
import { ModelCatalogList } from '../models/ModelCatalogList';
import { ModelCatalogSelect } from '../models/ModelCatalogSelect';

interface Props {
  models: CatalogModel[];
  selected: string;
  enabled: boolean;
  isDefault: boolean;
  refreshing: boolean;
  onSelect: (id: string) => void;
  onMakeDefault: () => void;
  onRefresh: () => void;
  onAdd: () => void;
  onEdit: (model: CatalogModel) => void;
  onDelete: (id: string) => void;
}

export function CiyuanModels({ models, selected, enabled, isDefault, refreshing, onSelect, onMakeDefault, onRefresh, onAdd, onEdit, onDelete }: Props) {
  const t = (key: string) => i18nService.t(key);
  return <div className="space-y-4">
    <div>
      <div className="mb-1.5 text-xs font-medium text-foreground">{t('modelCatalogDefault')}</div>
      <div className="flex flex-wrap gap-2">
        <ModelCatalogSelect models={models} value={selected} onChange={onSelect} />
        <button type="button" disabled={!enabled || !models.some(model => model.id === selected)} onClick={onMakeDefault}
          className="shrink-0 rounded-xl border border-primary px-3 py-2 text-xs text-primary hover:bg-primary-muted disabled:cursor-not-allowed disabled:opacity-50">
          {t(isDefault ? 'modelCatalogDefaultSelected' : 'modelCatalogSetDefault')}
        </button>
      </div>
    </div>
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-medium text-foreground">{t('availableModels')} <span className="ml-1 rounded-md bg-surface px-1.5 text-secondary">{models.length}</span></h4>
        <div className="flex items-center gap-2">
          <button type="button" disabled={refreshing} onClick={onRefresh} className="inline-flex items-center gap-1 text-xs text-secondary hover:text-primary disabled:opacity-50">
            <ArrowPathIcon className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />{t(refreshing ? 'gettingModelList' : 'modelCatalogRefresh')}
          </button>
          <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 text-xs text-primary"><PlusCircleIcon className="h-3.5 w-3.5" />{t('addModel')}</button>
        </div>
      </div>
      <p className="mb-2 text-[11px] text-secondary">{t(models.length ? 'modelCatalogGrouped' : 'ciyuanCatalogHint')}</p>
      <ModelCatalogList models={models} className="max-h-80" renderModel={model => <div key={model.id} className="group flex items-center justify-between gap-2 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground"><span className="truncate">{model.name}</span>
            {model.id === selected && <span className="shrink-0 rounded-md bg-primary-muted px-1.5 py-0.5 text-[10px] text-primary">{t('modelCatalogDefault')}</span>}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-secondary" title={model.id}>{model.id}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {model.supportsImage && <span className="rounded-md bg-primary-muted px-1.5 py-0.5 text-[10px] text-primary">{t('imageInput')}</span>}
          <button type="button" aria-label={t('editModel')} onClick={() => onEdit(model)} className="rounded p-1 text-secondary hover:text-primary"><PencilIcon className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label={t('delete')} onClick={() => onDelete(model.id)} className="rounded p-1 text-secondary hover:text-red-500"><TrashIcon className="h-3.5 w-3.5" /></button>
        </div>
      </div>} />
    </div>
  </div>;
}
