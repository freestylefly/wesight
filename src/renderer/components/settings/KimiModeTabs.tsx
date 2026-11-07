import { CheckIcon, CircleStackIcon, CodeBracketIcon } from '@heroicons/react/24/outline';
import { type KeyboardEvent, useRef } from 'react';

import { KimiModelMode } from '../../../shared/providers/kimi/constants';
import { i18nService } from '../../services/i18n';

interface KimiModeTabsProps {
  mode: KimiModelMode;
  onChange: (mode: KimiModelMode) => void;
  panelId?: string;
  disabled?: boolean;
}

const options = [
  { value: KimiModelMode.Code, labelKey: 'kimiCodeMode', hintKey: 'kimiCodeModeHint', icon: CodeBracketIcon },
  { value: KimiModelMode.Api, labelKey: 'kimiApiMode', hintKey: 'kimiApiModeHint', icon: CircleStackIcon },
];

export function KimiModeTabs({ mode, onChange, panelId = 'kimi-model-mode-panel', disabled = false }: KimiModeTabsProps) {
  const tabs = useRef<Partial<Record<KimiModelMode, HTMLButtonElement | null>>>({});
  const t = (key: string) => i18nService.t(key);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentMode: KimiModelMode) => {
    let nextMode: KimiModelMode;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowLeft':
        nextMode = currentMode === KimiModelMode.Code ? KimiModelMode.Api : KimiModelMode.Code;
        break;
      case 'Home':
        nextMode = KimiModelMode.Code;
        break;
      case 'End':
        nextMode = KimiModelMode.Api;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(nextMode);
    tabs.current[nextMode]?.focus();
  };

  return <div className="space-y-2">
    <div id={`${panelId}-label`} className="text-xs font-medium text-foreground">{t('kimiAccessMode')}</div>
    <div role="tablist" aria-labelledby={`${panelId}-label`} className="grid grid-cols-2 gap-2">
      {options.map(option => {
        const selected = mode === option.value;
        const Icon = option.icon;
        return <button
          key={option.value}
          ref={element => { tabs.current[option.value] = element; }}
          id={`${panelId}-tab-${option.value}`}
          type="button"
          role="tab"
          aria-selected={selected}
          aria-controls={panelId}
          tabIndex={selected ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          onKeyDown={event => handleKeyDown(event, option.value)}
          className={`relative flex min-w-0 items-start gap-2 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-primary bg-primary-muted' : 'border-border bg-surface hover:bg-surface-raised'}`}
        >
          <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-primary/10 text-primary' : 'bg-surface-raised text-foreground'}`}><Icon className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block pr-4 text-xs font-medium text-foreground">{t(option.labelKey)}</span>
            <span className="mt-1 block text-[10px] leading-4 text-secondary">{t(option.hintKey)}</span>
            <span className="mt-1 block min-h-4">
              {selected && <span className="inline-flex rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] leading-3 text-primary">{t('kimiModeCurrent')}</span>}
            </span>
          </span>
          <span aria-hidden="true" className={`absolute right-2.5 top-2.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary text-white' : 'border-border bg-surface'}`}>
            {selected && <CheckIcon className="h-2.5 w-2.5" strokeWidth={3} />}
          </span>
        </button>;
      })}
    </div>
  </div>;
}
