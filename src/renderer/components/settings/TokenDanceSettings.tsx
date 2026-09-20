import { ArrowPathIcon, ArrowTopRightOnSquareIcon, LockClosedIcon, SignalIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';

import { TOKEN_DANCE_MODELS, TokenDance, TokenDanceError, type TokenDanceResult } from '../../../shared/tokendance/constants';
import type { AppConfig } from '../../config';
import { i18nService } from '../../services/i18n';

export type TokenDanceProviderConfig = NonNullable<AppConfig['providers']>[string];
interface Props {
  config: TokenDanceProviderConfig;
  onChange: (patch: Partial<TokenDanceProviderConfig>) => void;
  onMakeDefault: (model: string) => void;
  isDefault: boolean;
}
const buttonClass = 'inline-flex shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs text-foreground hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50';

export function TokenDanceSettings({ config, onChange, onMakeDefault, isDefault }: Props) {
  const t = (key: string) => i18nService.t(key);
  const [connected, setConnected] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const alive = useRef(true);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const models = config.models ?? [...TOKEN_DANCE_MODELS];
  const selected = config.defaultModel ?? TokenDance.DefaultModel;
  const selectionAvailable = models.some(model => model.id === selected);

  useEffect(() => {
    alive.current = true;
    void window.electron.tokendance.status().then(result => {
      if (!alive.current) return;
      const authorized = result.status?.connected ?? false;
      setConnected(authorized);
      onChangeRef.current({ apiKey: authorized ? TokenDance.CredentialRef : '', credentialRef: authorized ? TokenDance.CredentialRef : undefined,
        ...(!authorized ? { enabled: false } : {}) });
      if (!result.success) setNotice({ text: i18nService.t(result.error ?? TokenDanceError.Storage), error: true });
    }).catch(() => { if (alive.current) setNotice({ text: i18nService.t(TokenDanceError.Network), error: true }); });
    return () => { alive.current = false; void window.electron.tokendance.cancel(); };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const result = await window.electron.tokendance.catalog();
      if (!alive.current) return;
      if (result.success && result.models) {
        onChangeRef.current({ models: result.models });
        setMissing(result.missingIds ?? []);
        setNotice({ text: t('tokendanceCatalogUpdated'), error: false });
      } else setNotice({ text: t(result.error ?? TokenDanceError.Catalog), error: true });
    } catch { if (alive.current) setNotice({ text: t(TokenDanceError.Catalog), error: true }); }
    finally { if (alive.current) setRefreshing(false); }
  };

  const authorize = async () => {
    setAuthorizing(true);
    setNotice(null);
    try {
      const result = await window.electron.tokendance.authorize();
      if (!alive.current) return;
      if (result.success && result.status?.connected) {
        setConnected(true);
        onChangeRef.current({ apiKey: TokenDance.CredentialRef, credentialRef: TokenDance.CredentialRef, enabled: true, baseUrl: TokenDance.BaseUrl, apiFormat: 'openai' });
        await refresh();
      } else setNotice({ text: t(result.error ?? TokenDanceError.Authorization), error: true });
    } catch { if (alive.current) setNotice({ text: t(TokenDanceError.Authorization), error: true }); }
    finally { if (alive.current) setAuthorizing(false); }
  };

  const test = async () => {
    setTesting(true);
    setNotice(null);
    try {
      const result: TokenDanceResult = await window.electron.tokendance.test(selected);
      if (alive.current) setNotice({ text: t(result.success ? 'connectionSuccess' : result.error ?? TokenDanceError.Network), error: !result.success });
    } catch { if (alive.current) setNotice({ text: t(TokenDanceError.Network), error: true }); }
    finally { if (alive.current) setTesting(false); }
  };

  return (
    <section className="space-y-4" aria-label={t('tokendanceTitle')}>
      <div className="rounded-xl border border-border bg-surface p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium">
              {t('tokendanceAuthStatus')}
              <span className={`inline-flex items-center gap-1.5 ${connected ? 'text-green-600 dark:text-green-400' : 'text-secondary'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`} />
                {t(connected ? 'tokendanceConnected' : 'tokendanceDisconnected')}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-secondary">{t(connected ? 'tokendanceAccountAuth' : 'tokendanceConnectHint')}</p>
          </div>
          <button type="button" onClick={() => void authorize()} disabled={authorizing || testing}
            className={`${buttonClass} ${connected ? 'border-primary text-primary' : 'border-primary bg-primary text-white hover:bg-primary-hover'}`}>
            {t(authorizing ? 'tokendanceAuthorizing' : connected ? 'tokendanceReauthorize' : 'tokendanceConnect')}
            {!connected && !authorizing && <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />}
          </button>
        </div>
        {authorizing && <div className="flex items-center justify-between gap-2 text-xs text-secondary">
          <span>{t('tokendanceBrowserHint')}</span>
          <button type="button" className="text-primary" onClick={() => void window.electron.tokendance.cancel()}>{t('cancel')}</button>
        </div>}
        {connected && <div className="flex items-center gap-1.5 border-t border-border pt-2 text-[11px] text-secondary"><LockClosedIcon className="h-3.5 w-3.5" />{t('tokendanceKeyStored')}</div>}
      </div>

      <div>
        <label htmlFor="tokendance-default-model" className="mb-1.5 block text-xs font-medium">{t('tokendanceDefaultModel')}</label>
        <div className="flex gap-2">
          <select id="tokendance-default-model" value={selected} onChange={event => onChange({ defaultModel: event.target.value })}
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground">
            {!selectionAvailable && <option value={selected}>{selected} · {t('tokendanceUnavailable')}</option>}
            {models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
          <button type="button" disabled={!connected || !selectionAvailable || !config.enabled} onClick={() => onMakeDefault(selected)} className={`${buttonClass} border-primary text-primary`}>
            {t(isDefault ? 'tokendanceDefaultSelected' : 'tokendanceSetDefault')}
          </button>
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium">{t('tokendanceProtocol')}</div>
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs">{t('tokendanceAuto')}</span><span className="text-[11px] text-secondary">{t('tokendanceAutoHint')}</span></div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-medium">{t('availableModels')} <span className="ml-1 rounded-md bg-surface px-1.5 text-secondary">{models.length}</span></h4>
          <button type="button" onClick={() => void refresh()} disabled={refreshing || authorizing || testing} className="inline-flex items-center gap-1 text-xs text-secondary hover:text-primary disabled:opacity-50">
            <ArrowPathIcon className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />{t('tokendanceRefresh')}
          </button>
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {models.map(model => <div key={model.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0"><div className="text-xs font-medium text-foreground">{model.name}</div><div className="mt-0.5 break-all font-mono text-[10px] text-secondary">{model.id}</div></div>
            {model.id === TokenDance.DefaultModel && <span className="shrink-0 rounded-lg bg-primary-muted px-2 py-1 text-[10px] text-primary">{t('tokendanceRecommended')}</span>}
          </div>)}
          {models.length === 0 && <p className="p-3 text-xs text-secondary">{t('noModelsAvailable')}</p>}
        </div>
        {missing.length > 0 && <p className="mt-2 text-xs text-amber-600">{t('tokendanceMissingModels')} {missing.join(', ')}</p>}
      </div>
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => void test()} disabled={!connected || !selectionAvailable || testing || authorizing || refreshing} className={buttonClass}>
          <SignalIcon className="h-3.5 w-3.5" />{t(testing ? 'testing' : 'testConnection')}
        </button>
        <details className="min-w-0 flex-1 text-xs text-secondary">
          <summary className="cursor-pointer text-right">{t('tokendanceAdvanced')}</summary>
          <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
            <div>{t('baseUrl')}<div className="mt-1 break-all font-mono text-[10px]">{TokenDance.BaseUrl}</div></div>
            <p className="text-[11px]">{t('tokendanceCompatibilityHint')}</p>
            {models.map(model => <div key={model.id} className="text-[10px]"><span className="font-medium">{model.name}</span><div className="break-all">{model.supportedProtocols?.join(' · ')}</div></div>)}
            <button type="button" className="text-primary" onClick={() => void window.electron.shell.openExternal(`${TokenDance.Origin}/keys`)}>{t('tokendanceManageKeys')}</button>
          </div>
        </details>
      </div>
      {notice && <p role="status" className={`rounded-lg p-2 text-xs ${notice.error ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-green-500/10 text-green-700 dark:text-green-400'}`}>{notice.text}</p>}
    </section>
  );
}
