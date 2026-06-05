import {
  ArrowPathIcon,
  ClipboardDocumentIcon,
  PlayIcon,
  RocketLaunchIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  CreatorBatchTaskStatus,
  CreatorCreativeModelOutputKind,
} from '@shared/creatorStudio/constants';
import type {
  CreatorBatchRunCreateInput,
  CreatorBatchRunRecord,
  CreatorBatchTaskRecord,
  CreatorCreativeModelCapability,
} from '@shared/creatorStudio/types';
import React, { useEffect, useMemo, useState } from 'react';

import { i18nService } from '../../services/i18n';
import type {
  CreatorPromptSpec,
  CreatorStudioTemplate,
} from '../../types/creatorStudio';
import { compileCreatorDirectionPrompt } from '../../utils/creatorPromptCompiler';
import { toCreatorPromptSpecSnapshot } from '../../utils/creatorPromptSpecAdapter';

const getText = (value: { zh: string; en: string }) => value[i18nService.getLanguage()];

const toggleValue = (values: string[], value: string): string[] => (
  values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
);

const statusLabel = (status: CreatorBatchTaskStatus): string => {
  switch (status) {
    case CreatorBatchTaskStatus.Pending:
      return i18nService.t('creatorBatchStatusPending');
    case CreatorBatchTaskStatus.Running:
      return i18nService.t('creatorBatchStatusRunning');
    case CreatorBatchTaskStatus.Completed:
      return i18nService.t('creatorBatchStatusCompleted');
    case CreatorBatchTaskStatus.Failed:
      return i18nService.t('creatorBatchStatusFailed');
    case CreatorBatchTaskStatus.Skipped:
    default:
      return i18nService.t('creatorBatchStatusSkipped');
  }
};

const outputKindLabel = (kind: CreatorCreativeModelOutputKind): string => {
  switch (kind) {
    case CreatorCreativeModelOutputKind.Image:
      return i18nService.t('creatorModelKindImage');
    case CreatorCreativeModelOutputKind.Video:
      return i18nService.t('creatorModelKindVideo');
    case CreatorCreativeModelOutputKind.Text:
    default:
      return i18nService.t('creatorModelKindText');
  }
};

const uniqueValues = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

export const CreatorBatchPanel: React.FC<{
  projectId: string;
  promptSpec: CreatorPromptSpec;
  promptText: string;
  templates: CreatorStudioTemplate[];
  modelCapabilities: CreatorCreativeModelCapability[];
  batchRuns: CreatorBatchRunRecord[];
  activeBatchRun: CreatorBatchRunRecord | null;
  isCreating: boolean;
  onCreateBatchRun: (input: CreatorBatchRunCreateInput) => void;
  onSelectBatchRun: (batchRun: CreatorBatchRunRecord) => void;
  onRefresh: () => void;
  onRetryTask: (taskId: string) => void;
  onSkipTask: (taskId: string) => void;
  onFailTask: (taskId: string) => void;
  onSendTaskToCowork: (task: CreatorBatchTaskRecord) => void;
  onSendBatchToCowork: (batchRun: CreatorBatchRunRecord) => void;
}> = ({
  projectId,
  promptSpec,
  promptText,
  templates,
  modelCapabilities,
  batchRuns,
  activeBatchRun,
  isCreating,
  onCreateBatchRun,
  onSelectBatchRun,
  onRefresh,
  onRetryTask,
  onSkipTask,
  onFailTask,
  onSendTaskToCowork,
  onSendBatchToCowork,
}) => {
  const directions = useMemo(() => (promptSpec.creativeDirections ?? []).slice(0, 6), [promptSpec]);
  const defaultTemplateId = promptSpec.templateId || templates[0]?.id || 'default-template';
  const defaultSize = promptSpec.constraints?.aspectRatio || '1:1';
  const batchCapableModelIds = useMemo(
    () => modelCapabilities.filter((model) => model.supportsBatch).map((model) => model.id),
    [modelCapabilities]
  );
  const [selectedDirectionIds, setSelectedDirectionIds] = useState<string[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [directionFilter, setDirectionFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    setSelectedDirectionIds(directions.map((direction) => direction.id));
  }, [directions]);

  useEffect(() => {
    setSelectedModelIds((current) => current.length > 0 ? current : batchCapableModelIds.slice(0, 2));
  }, [batchCapableModelIds]);

  useEffect(() => {
    setSelectedTemplateIds((current) => current.length > 0 ? current : [defaultTemplateId]);
  }, [defaultTemplateId]);

  useEffect(() => {
    setSelectedSizes((current) => current.length > 0 ? current : [defaultSize]);
  }, [defaultSize]);

  const selectedModels = modelCapabilities.filter((model) => selectedModelIds.includes(model.id));
  const selectedDirections = directions.filter((direction) => selectedDirectionIds.includes(direction.id));
  const selectedTemplates = selectedTemplateIds.length > 0 ? selectedTemplateIds : [defaultTemplateId];
  const sizes = selectedSizes.length > 0 ? selectedSizes : [defaultSize];
  const taskCount = selectedDirections.length * selectedModels.length * selectedTemplates.length * sizes.length;
  const costUnits = selectedDirections.reduce((total) => total + selectedModels.reduce((modelTotal, model) => (
    modelTotal + (model.costUnitEstimate * selectedTemplates.length * sizes.length)
  ), 0), 0);
  const allSizes = uniqueValues([
    defaultSize,
    ...modelCapabilities.flatMap((model) => model.sizes),
  ]);

  const comparisonTasks = useMemo(() => {
    const tasks = activeBatchRun?.tasks ?? [];
    return tasks.filter((task) => (
      (!directionFilter || task.directionId === directionFilter)
      && (!modelFilter || task.modelId === modelFilter)
      && (!templateFilter || task.templateId === templateFilter)
      && (!sizeFilter || task.size === sizeFilter)
      && (!statusFilter || task.status === statusFilter)
    ));
  }, [activeBatchRun, directionFilter, modelFilter, sizeFilter, statusFilter, templateFilter]);

  const createBatchRun = () => {
    if (!projectId || taskCount === 0) return;
    onCreateBatchRun({
      projectId,
      briefTitle: promptSpec.subject || promptSpec.sourceTitle || i18nService.t('creatorBatchDefaultTitle'),
      promptSpec: toCreatorPromptSpecSnapshot(promptSpec),
      promptText,
      directions: selectedDirections.map((direction) => {
        const compiledDirection = compileCreatorDirectionPrompt(promptSpec, direction.id);
        return {
          ...direction,
          promptSpec: compiledDirection.promptSpec,
          promptText: compiledDirection.promptText,
        };
      }),
      modelIds: selectedModels.map((model) => model.id),
      templateIds: selectedTemplates,
      sizes,
    });
  };

  return (
    <section className="grid gap-4 p-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{i18nService.t('creatorBatchPlanTitle')}</h2>
              <p className="mt-1 text-xs leading-5 text-muted">{i18nService.t('creatorBatchPlanHint')}</p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
              aria-label={i18nService.t('creatorBatchRefresh')}
            >
              <ArrowPathIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <SummaryCell label={i18nService.t('creatorBatchSummaryTasks')} value={String(taskCount)} />
            <SummaryCell label={i18nService.t('creatorBatchSummaryModels')} value={String(selectedModels.length)} />
            <SummaryCell label={i18nService.t('creatorBatchSummarySizes')} value={sizes.join(', ')} />
            <SummaryCell label={i18nService.t('creatorBatchSummaryCost')} value={`${costUnits} ${i18nService.t('creatorBatchCostUnits')}`} />
          </div>
          <button
            type="button"
            disabled={isCreating || taskCount === 0}
            onClick={createBatchRun}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-55"
          >
            <RocketLaunchIcon className="h-4 w-4" />
            {isCreating ? i18nService.t('creatorBatchCreating') : i18nService.t('creatorBatchCreate')}
          </button>
        </div>

        <SelectionPanel title={i18nService.t('creatorBatchDirections')}>
          {directions.map((direction) => (
            <CheckRow
              key={direction.id}
              checked={selectedDirectionIds.includes(direction.id)}
              title={direction.title}
              description={direction.promptFocus}
              onChange={() => setSelectedDirectionIds(toggleValue(selectedDirectionIds, direction.id))}
            />
          ))}
        </SelectionPanel>

        <SelectionPanel title={i18nService.t('creatorBatchModels')}>
          {modelCapabilities.map((model) => (
            <label key={model.id} className="block rounded-lg border border-border bg-background p-3">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selectedModelIds.includes(model.id)}
                  disabled={!model.supportsBatch}
                  onChange={() => setSelectedModelIds(toggleValue(selectedModelIds, model.id))}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{model.displayName}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {model.outputKinds.map((kind) => <Badge key={kind}>{outputKindLabel(kind)}</Badge>)}
                    {model.supportsVision && <Badge>{i18nService.t('creatorModelVision')}</Badge>}
                    {model.supportsReferenceImages && <Badge>{i18nService.t('creatorModelReference')}</Badge>}
                    <Badge>{model.supportsBatch ? i18nService.t('creatorModelBatch') : i18nService.t('creatorModelNoBatch')}</Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    {model.sizes.join(', ')} · {model.costUnitEstimate} {model.costUnitLabel}
                  </div>
                </div>
              </div>
            </label>
          ))}
        </SelectionPanel>

        <SelectionPanel title={i18nService.t('creatorBatchTemplates')}>
          {templates.map((template) => (
            <CheckRow
              key={template.id}
              checked={selectedTemplateIds.includes(template.id)}
              title={getText(template.title)}
              description={template.id}
              onChange={() => setSelectedTemplateIds(toggleValue(selectedTemplateIds, template.id))}
            />
          ))}
        </SelectionPanel>

        <SelectionPanel title={i18nService.t('creatorBatchSizes')}>
          <div className="flex flex-wrap gap-2">
            {allSizes.map((size) => (
              <button
                type="button"
                key={size}
                onClick={() => setSelectedSizes(toggleValue(selectedSizes, size))}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedSizes.includes(size)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-secondary hover:bg-surface-raised hover:text-foreground'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </SelectionPanel>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{i18nService.t('creatorBatchRecentRuns')}</h2>
            <div className="text-xs text-muted">{batchRuns.length}</div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {batchRuns.length === 0 ? (
              <div className="text-xs text-muted">{i18nService.t('creatorBatchEmpty')}</div>
            ) : batchRuns.map((run) => (
              <button
                type="button"
                key={run.id}
                onClick={() => onSelectBatchRun(run)}
                className={`min-w-[180px] rounded-lg border p-3 text-left transition-colors ${
                  activeBatchRun?.id === run.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-surface-raised'
                }`}
              >
                <div className="truncate text-xs font-semibold">{run.briefTitle}</div>
                <div className="mt-1 text-[11px] text-muted">{run.summary.taskCount} · {run.status}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{i18nService.t('creatorBatchComparison')}</h2>
                <p className="mt-1 text-xs text-muted">
                  {activeBatchRun
                    ? `${activeBatchRun.summary.taskCount} ${i18nService.t('creatorBatchSummaryTasks')}`
                    : i18nService.t('creatorBatchComparisonEmpty')}
                  </p>
              </div>
              {activeBatchRun && (
                <button
                  type="button"
                  onClick={() => onSendBatchToCowork(activeBatchRun)}
                  className="inline-flex items-center gap-2 rounded-lg border border-primary bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                >
                  <RocketLaunchIcon className="h-4 w-4" />
                  {i18nService.t('creatorBatchSendPending')}
                </button>
              )}
              <div className="flex flex-wrap gap-2">
                <GridFilter value={directionFilter} onChange={setDirectionFilter} label={i18nService.t('creatorBatchFilterDirection')} values={uniqueValues((activeBatchRun?.tasks ?? []).map((task) => task.directionId))} />
                <GridFilter value={modelFilter} onChange={setModelFilter} label={i18nService.t('creatorBatchFilterModel')} values={uniqueValues((activeBatchRun?.tasks ?? []).map((task) => task.modelId))} />
                <GridFilter value={templateFilter} onChange={setTemplateFilter} label={i18nService.t('creatorBatchFilterTemplate')} values={uniqueValues((activeBatchRun?.tasks ?? []).map((task) => task.templateId))} />
                <GridFilter value={sizeFilter} onChange={setSizeFilter} label={i18nService.t('creatorBatchFilterSize')} values={uniqueValues((activeBatchRun?.tasks ?? []).map((task) => task.size))} />
                <GridFilter value={statusFilter} onChange={setStatusFilter} label={i18nService.t('creatorBatchFilterStatus')} values={uniqueValues((activeBatchRun?.tasks ?? []).map((task) => task.status))} />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            {comparisonTasks.length === 0 ? (
              <div className="flex min-h-[240px] items-center justify-center text-sm text-muted">
                {i18nService.t('creatorBatchComparisonEmpty')}
              </div>
            ) : (
              <table className="w-full min-w-[860px] border-collapse text-left text-xs">
                <thead className="bg-surface-raised text-muted">
                  <tr>
                    <Th>{i18nService.t('creatorBatchDirection')}</Th>
                    <Th>{i18nService.t('creatorBatchModel')}</Th>
                    <Th>{i18nService.t('creatorBatchTemplate')}</Th>
                    <Th>{i18nService.t('creatorBatchSize')}</Th>
                    <Th>{i18nService.t('creatorBatchStatus')}</Th>
                    <Th>{i18nService.t('creatorBatchCost')}</Th>
                    <Th>{i18nService.t('creatorBatchResult')}</Th>
                    <Th>{i18nService.t('creatorBatchActions')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonTasks.map((task) => (
                    <tr key={task.id} className="border-t border-border">
                      <Td>{task.directionTitle}</Td>
                      <Td>{task.modelName}</Td>
                      <Td>{task.templateId}</Td>
                      <Td>{task.size}</Td>
                      <Td><StatusPill status={task.status} /></Td>
                      <Td>{task.costEstimateText}</Td>
                      <Td>{task.assetIds.length > 0 ? task.assetIds.length : i18nService.t('creatorBatchNoAssetYet')}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          <IconButton title={i18nService.t('creatorBatchCopyPrompt')} onClick={() => void navigator.clipboard.writeText(task.promptText)}>
                            <ClipboardDocumentIcon className="h-4 w-4" />
                          </IconButton>
                          <IconButton title={i18nService.t('creatorBatchSendTask')} onClick={() => onSendTaskToCowork(task)}>
                            <PlayIcon className="h-4 w-4" />
                          </IconButton>
                          {(task.status === CreatorBatchTaskStatus.Failed || task.status === CreatorBatchTaskStatus.Skipped) && (
                            <IconButton title={i18nService.t('creatorBatchRetry')} onClick={() => onRetryTask(task.id)}>
                              <ArrowPathIcon className="h-4 w-4" />
                            </IconButton>
                          )}
                          {task.status !== CreatorBatchTaskStatus.Completed && task.status !== CreatorBatchTaskStatus.Skipped && (
                            <IconButton title={i18nService.t('creatorBatchSkip')} onClick={() => onSkipTask(task.id)}>
                              <XMarkIcon className="h-4 w-4" />
                            </IconButton>
                          )}
                          {task.status !== CreatorBatchTaskStatus.Completed && task.status !== CreatorBatchTaskStatus.Failed && task.status !== CreatorBatchTaskStatus.Skipped && (
                            <IconButton title={i18nService.t('creatorBatchMarkFailed')} onClick={() => onFailTask(task.id)}>
                              <XMarkIcon className="h-4 w-4" />
                            </IconButton>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const SummaryCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-border bg-background p-3">
    <div className="text-[11px] text-muted">{label}</div>
    <div className="mt-1 truncate font-semibold text-foreground">{value}</div>
  </div>
);

const SelectionPanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-lg border border-border bg-surface p-4">
    <h3 className="text-sm font-semibold">{title}</h3>
    <div className="mt-3 space-y-2">{children}</div>
  </div>
);

const CheckRow: React.FC<{
  checked: boolean;
  title: string;
  description: string;
  onChange: () => void;
}> = ({ checked, title, description, onChange }) => (
  <label className="flex items-start gap-2 rounded-lg border border-border bg-background p-3">
    <input type="checkbox" checked={checked} onChange={onChange} className="mt-1" />
    <span className="min-w-0">
      <span className="block truncate text-sm font-medium">{title}</span>
      <span className="mt-1 line-clamp-2 text-xs text-muted">{description}</span>
    </span>
  </label>
);

const Badge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded-md bg-surface-raised px-1.5 py-0.5 text-[10px] text-secondary">{children}</span>
);

const GridFilter: React.FC<{
  value: string;
  onChange: (value: string) => void;
  label: string;
  values: string[];
}> = ({ value, onChange, label, values }) => (
  <select
    value={value}
    onChange={(event) => onChange(event.target.value)}
    aria-label={label}
    className="h-8 rounded-lg border border-border bg-surface px-2 text-xs outline-none focus:border-primary"
  >
    <option value="">{label}</option>
    {values.map((item) => (
      <option key={item} value={item}>{item}</option>
    ))}
  </select>
);

const StatusPill: React.FC<{ status: CreatorBatchTaskStatus }> = ({ status }) => (
  <span className="rounded-md bg-surface-raised px-2 py-1 text-[11px] text-secondary">
    {statusLabel(status)}
  </span>
);

const IconButton: React.FC<{
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ title, onClick, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
  >
    {children}
  </button>
);

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th className="px-3 py-2 font-medium">{children}</th>
);

const Td: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <td className="px-3 py-2 align-top">{children}</td>
);
