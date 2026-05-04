import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DraggableDialog } from '../../components/DraggableDialog';
import type { Translator } from '../../i18n';
import { isOpenAiLanguageModelPolyfillInstalled } from './detect';
import { fetchOpenAiLmModelIds } from './openAiHttp';
import {
  clearOpenAiLmPolyfillConfig,
  DEFAULT_OPENAI_LM_TEMPERATURE,
  isOpenAiLmPolyfillConfigComplete,
  loadOpenAiLmPolyfillConfig,
  MAX_OPENAI_LM_TEMPERATURE,
  MIN_OPENAI_LM_TEMPERATURE,
  normalizeOpenAiLmBaseUrl,
  saveOpenAiLmPolyfillConfig,
} from './storage';
import { OPEN_AI_LM_URL_PRESETS } from './urlPresets';

function IconFetchModels({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
      />
    </svg>
  );
}

function IconChevronDown({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="openai-lm-model-trigger-chevron-svg">
      <path fill="currentColor" d="M7 10l5 5 5-5H7z" />
    </svg>
  );
}

function mergeModelIdsForPicker(ids: string[], currentId: string): string[] {
  const cur = currentId.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of [cur, ...ids]) {
    const s = x.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export type OpenAiLmPolyfillSettingsFormProps = {
  t: Translator;
  /** Called after save or clear so the host can re-run availability / gate checks. */
  onSaved?: () => void;
  variant?: 'gate' | 'settings';
  /** Gate screen only: second action on the same row as Save (re-run availability check). */
  onGateRecheck?: () => void;
};

export function OpenAiLmPolyfillSettingsForm({
  t,
  onSaved,
  variant = 'settings',
  onGateRecheck,
}: OpenAiLmPolyfillSettingsFormProps) {
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('');
  const [temperature, setTemperature] = useState(DEFAULT_OPENAI_LM_TEMPERATURE);
  const [displayAlias, setDisplayAlias] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const modelPickerWasOpenRef = useRef(false);

  useEffect(() => {
    const c = loadOpenAiLmPolyfillConfig();
    if (!c) return;
    setBaseUrlInput(c.baseUrl.replace(/\/$/, ''));
    setApiKey(c.apiKey);
    setModelId(c.modelId);
    setTemperature(c.temperature);
    setDisplayAlias(c.displayAlias ?? '');
  }, []);

  useEffect(() => {
    setModelPickerOpen(false);
    setModels([]);
    setModelSearch('');
    setModelsError(null);
  }, [baseUrlInput, apiKey]);

  const refreshModels = useCallback(async () => {
    setModelsError(null);
    setModelsBusy(true);
    try {
      const base = normalizeOpenAiLmBaseUrl(baseUrlInput);
      if (!base) {
        setModelsError(t('settings.remoteLm.errorNeedBaseUrl'));
        setModels([]);
        return;
      }
      const ids = await fetchOpenAiLmModelIds({
        baseUrl: base,
        apiKey: apiKey.trim(),
        modelId: modelId.trim() || 'x',
        temperature,
      });
      setModels(ids);
    } catch (e) {
      setModelsError(
        t('settings.remoteLm.modelsError').replace('{message}', e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setModelsBusy(false);
    }
  }, [apiKey, baseUrlInput, modelId, t, temperature]);

  /** When the model popup opens, load the full list from the server (same as refresh). */
  useEffect(() => {
    const wasOpen = modelPickerWasOpenRef.current;
    if (modelPickerOpen && !wasOpen) {
      setModelSearch('');
      void refreshModels();
    }
    modelPickerWasOpenRef.current = modelPickerOpen;
  }, [modelPickerOpen, refreshModels]);

  const mergedIds = useMemo(() => mergeModelIdsForPicker(models, modelId), [models, modelId]);

  const filteredIds = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    if (!q) return mergedIds;
    return mergedIds.filter((id) => id.toLowerCase().includes(q));
  }, [mergedIds, modelSearch]);

  const onSave = useCallback(() => {
    setSaveError(null);
    try {
      const base = normalizeOpenAiLmBaseUrl(baseUrlInput);
      if (!base) {
        setSaveError(t('settings.remoteLm.errorNeedBaseUrl'));
        return;
      }
      const mid = modelId.trim();
      if (!mid) {
        setSaveError(t('settings.remoteLm.errorNeedModel'));
        return;
      }
      saveOpenAiLmPolyfillConfig({ baseUrlInput, apiKey, modelId: mid, temperature, displayAlias });
      onSaved?.();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }, [apiKey, baseUrlInput, displayAlias, modelId, onSaved, t, temperature]);

  const onClear = useCallback(() => {
    clearOpenAiLmPolyfillConfig();
    setBaseUrlInput('');
    setApiKey('');
    setModelId('');
    setTemperature(DEFAULT_OPENAI_LM_TEMPERATURE);
    setDisplayAlias('');
    setModels([]);
    setModelsError(null);
    setSaveError(null);
    setModelPickerOpen(false);
    setModelSearch('');
    onSaved?.();
  }, [onSaved]);

  if (!isOpenAiLanguageModelPolyfillInstalled()) {
    return null;
  }

  const gate = variant === 'gate';

  return (
    <div className={gate ? 'openai-lm-polyfill openai-lm-polyfill--gate' : 'openai-lm-polyfill'}>
      {gate ? (
        <>
          <p className="hint">{t('gate.blockedRemoteHint')}</p>
          <p className="hint openai-lm-remote-offline-note">{t('settings.remoteLm.offlineNote')}</p>
        </>
      ) : (
        <>
          <p className="hint">{t('settings.remoteLm.lead')}</p>
          <p className="hint openai-lm-remote-offline-note">{t('settings.remoteLm.offlineNote')}</p>
        </>
      )}
      <div className="field">
        <div className="field-label-row">
          <label htmlFor="minerva-remote-lm-base">{t('settings.remoteLm.baseUrl')}</label>
          <button
            type="button"
            className="btn btn-ghost openai-lm-presets-trigger"
            onClick={() => setPresetsOpen(true)}
          >
            {t('settings.remoteLm.presets.open')}
          </button>
        </div>
        <input
          id="minerva-remote-lm-base"
          type="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('settings.remoteLm.baseUrlPlaceholder').replace(
            '{knownUrls}',
            t('settings.remoteLm.presets.open'),
          )}
          value={baseUrlInput}
          onChange={(e) => {
            setBaseUrlInput(e.target.value);
            setSaveError(null);
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="minerva-remote-lm-key">{t('settings.remoteLm.apiKey')}</label>
        <input
          id="minerva-remote-lm-key"
          type="password"
          autoComplete="off"
          placeholder={t('settings.remoteLm.apiKeyPlaceholder')}
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setSaveError(null);
          }}
        />
        <p className="hint">{t('settings.remoteLm.securityHint')}</p>
      </div>
      <div className="field">
        <label htmlFor="minerva-remote-lm-model-trigger" id="minerva-remote-lm-model-label">
          {t('settings.remoteLm.model')}
        </label>
        <button
          type="button"
          id="minerva-remote-lm-model-trigger"
          className="openai-lm-model-trigger"
          aria-expanded={modelPickerOpen}
          aria-haspopup="dialog"
          aria-labelledby="minerva-remote-lm-model-label minerva-remote-lm-model-value"
          onClick={() => setModelPickerOpen(true)}
        >
          <span id="minerva-remote-lm-model-value" className="openai-lm-model-trigger-label">
            {modelId.trim() ? modelId.trim() : t('settings.remoteLm.modelPickerChoose')}
          </span>
          <IconChevronDown size={14} />
        </button>
        <p className="hint">{t('settings.remoteLm.modelPickerHint')}</p>
      </div>
      <div className="field">
        <label htmlFor="minerva-remote-lm-temperature-slider">{t('settings.remoteLm.temperature')}</label>
        <div className="settings-mib-control-row openai-lm-temperature-row">
          <input
            id="minerva-remote-lm-temperature-slider"
            type="range"
            min={MIN_OPENAI_LM_TEMPERATURE}
            max={MAX_OPENAI_LM_TEMPERATURE}
            step={0.05}
            value={temperature}
            aria-valuemin={MIN_OPENAI_LM_TEMPERATURE}
            aria-valuemax={MAX_OPENAI_LM_TEMPERATURE}
            aria-valuenow={temperature}
            aria-valuetext={t('settings.remoteLm.temperatureValueAria').replace(
              '{value}',
              temperature.toFixed(2),
            )}
            onChange={(e) => {
              setTemperature(Number(e.target.value));
              setSaveError(null);
            }}
          />
          <span className="openai-lm-temperature-value" aria-hidden="true">
            {temperature.toFixed(2)}
          </span>
        </div>
        <p className="hint">
          {t('settings.remoteLm.temperatureHelp')
            .replace('{default}', String(DEFAULT_OPENAI_LM_TEMPERATURE))
            .replace('{min}', String(MIN_OPENAI_LM_TEMPERATURE))
            .replace('{max}', String(MAX_OPENAI_LM_TEMPERATURE))}
        </p>
      </div>
      <div className="field">
        <label htmlFor="minerva-remote-lm-display-alias">{t('settings.remoteLm.displayAlias')}</label>
        <input
          id="minerva-remote-lm-display-alias"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('settings.remoteLm.displayAliasPlaceholder')}
          value={displayAlias}
          onChange={(e) => {
            setDisplayAlias(e.target.value);
            setSaveError(null);
          }}
        />
        <p className="hint">{t('settings.remoteLm.displayAliasHelp')}</p>
      </div>
      {saveError ? <p className="settings-dialog-error">{saveError}</p> : null}
      <div
        className={`openai-lm-polyfill-actions${gate && onGateRecheck ? ' openai-lm-polyfill-actions--gate' : ''}`}
      >
        <button type="button" className="btn btn-primary" onClick={onSave}>
          {t('settings.remoteLm.save')}
        </button>
        {gate && onGateRecheck ? (
          <button type="button" className="btn btn-outline" onClick={onGateRecheck}>
            {t('gate.retry')}
          </button>
        ) : null}
        {!gate && isOpenAiLmPolyfillConfigComplete(loadOpenAiLmPolyfillConfig()) ? (
          <button type="button" className="btn btn-ghost admin-danger" onClick={onClear}>
            {t('settings.remoteLm.clear')}
          </button>
        ) : null}
      </div>

      <DraggableDialog
        open={modelPickerOpen}
        title={t('settings.remoteLm.modelPickerDialogTitle')}
        closeAriaLabel={t('dialog.close')}
        mobileBackAriaLabel={t('dialog.back')}
        onClose={() => setModelPickerOpen(false)}
        width={440}
        variant="solid"
      >
        <div className="openai-lm-model-dialog-inner">
          <div className="openai-lm-model-picker-toolbar">
            <input
              type="search"
              className="openai-lm-model-picker-search"
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              placeholder={t('settings.remoteLm.modelSearchPlaceholder')}
              aria-label={t('settings.remoteLm.modelSearchPlaceholder')}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              className="openai-lm-fetch-models-btn"
              disabled={modelsBusy}
              aria-busy={modelsBusy}
              title={t('settings.remoteLm.refreshModelsAria')}
              aria-label={t('settings.remoteLm.refreshModelsAria')}
              onClick={() => void refreshModels()}
            >
              <IconFetchModels size={16} />
            </button>
          </div>
          <div
            className="openai-lm-model-picker-list openai-lm-model-picker-list--dialog"
            role="listbox"
            aria-label={t('settings.remoteLm.modelListAria')}
          >
            {modelsBusy ? (
              <div className="openai-lm-model-list-status" role="status">
                {t('settings.remoteLm.modelsLoading')}
              </div>
            ) : filteredIds.length > 0 ? (
              filteredIds.map((id) => {
                const selected = modelId.trim() === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`openai-lm-model-option openai-lm-model-option--picker${selected ? ' openai-lm-model-option--selected' : ''}`}
                    title={id}
                    onClick={() => {
                      setModelId(id);
                      setSaveError(null);
                      setModelPickerOpen(false);
                    }}
                  >
                    <span className="openai-lm-model-option-label">{id}</span>
                  </button>
                );
              })
            ) : (
              <div className="openai-lm-model-list-empty hint">{t('settings.remoteLm.modelPickerListEmpty')}</div>
            )}
          </div>
          {modelsError ? <p className="settings-dialog-error openai-lm-model-picker-error">{modelsError}</p> : null}
        </div>
      </DraggableDialog>

      <DraggableDialog
        open={presetsOpen}
        title={t('settings.remoteLm.presets.title')}
        closeAriaLabel={t('dialog.close')}
        mobileBackAriaLabel={t('dialog.back')}
        onClose={() => setPresetsOpen(false)}
        width={500}
        variant="solid"
      >
        <p className="hint openai-lm-presets-lead">{t('settings.remoteLm.presets.lead')}</p>
        <ul className="openai-lm-preset-list" role="listbox" aria-label={t('settings.remoteLm.presets.title')}>
          {OPEN_AI_LM_URL_PRESETS.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                className="openai-lm-preset-row"
                role="option"
                onClick={() => {
                  setBaseUrlInput(preset.baseUrl);
                  setSaveError(null);
                  setPresetsOpen(false);
                }}
              >
                <span className="openai-lm-preset-row-label">{t(preset.labelKey)}</span>
                <code className="openai-lm-preset-row-url">{preset.baseUrl}</code>
              </button>
            </li>
          ))}
        </ul>
      </DraggableDialog>
    </div>
  );
}
