import { useCallback, useEffect, useState } from 'react';
import { DraggableDialog } from '../../components/DraggableDialog';
import { BoolSwitch } from '../../components/BoolSwitch';
import type { Translator } from '../../i18n';
import { fetchOpenAiLmModelIds } from './openAiHttp';
import {
  clampOpenAiTemperature,
  DEFAULT_OPENAI_TEMPERATURE,
  MAX_OPENAI_TEMPERATURE,
  MIN_OPENAI_TEMPERATURE,
  normalizeOpenAiBaseUrl,
  type OpenAiDriverStored,
} from './storage';
import { OPEN_AI_URL_PRESETS } from './urlPresets';

export type OpenAiDriverSettingsFormProps = {
  t: Translator;
  value?: OpenAiDriverStored;
  onChange: (next: OpenAiDriverStored | undefined) => void;
  onSaved?: () => void;
  variant?: 'gate' | 'settings';
  onGateRecheck?: () => void;
};

export function OpenAiDriverSettingsForm({
  t,
  value,
  onChange,
  onSaved,
  variant = 'settings',
  onGateRecheck,
}: OpenAiDriverSettingsFormProps) {
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [temperature, setTemperature] = useState(DEFAULT_OPENAI_TEMPERATURE);
  const [supportsVision, setSupportsVision] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testStatusKind, setTestStatusKind] = useState<'idle' | 'running' | 'ok' | 'error'>('idle');
  const [testing, setTesting] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [testAbortController, setTestAbortController] = useState<AbortController | null>(null);

  useEffect(() => {
    const c = value;
    setBaseUrlInput(c?.baseUrl ?? '');
    setApiKey(c?.apiKey ?? '');
    setTemperature(c?.temperature ?? DEFAULT_OPENAI_TEMPERATURE);
    setSupportsVision(c?.supportsVision === true);
  }, [value]);

  const onSave = useCallback(() => {
    setSaveError(null);
    const base = normalizeOpenAiBaseUrl(baseUrlInput);
    if (!base) {
      setSaveError(t('settings.remoteLm.errorNeedBaseUrl'));
      return;
    }
    const alias = (value?.displayAlias ?? '').trim().replace(/\s+/g, ' ');
    const mid = value?.modelId?.trim() === 'x' ? '' : (value?.modelId?.trim() ?? '');
    onChange({
      baseUrl: base,
      apiKey: apiKey.trim(),
      modelId: mid,
      temperature: clampOpenAiTemperature(temperature),
      ...(supportsVision ? { supportsVision: true } : {}),
      ...(alias ? { displayAlias: alias } : {}),
    });
    onSaved?.();
  }, [apiKey, baseUrlInput, onChange, onSaved, supportsVision, t, temperature, value?.displayAlias, value?.modelId]);

  const onClear = useCallback(() => {
    onChange(undefined);
    onSaved?.();
  }, [onChange, onSaved]);

  const testConnection = useCallback(async () => {
    const base = normalizeOpenAiBaseUrl(baseUrlInput);
    if (!base) {
      setTestStatus(t('settings.remoteLm.errorNeedBaseUrl'));
      setTestStatusKind('error');
      return;
    }
    testAbortController?.abort();
    const ac = new AbortController();
    setTestAbortController(ac);
    setTesting(true);
    setTestStatus(t('settings.remoteLm.testing'));
    setTestStatusKind('running');
    try {
      const ids = await fetchOpenAiLmModelIds({
        baseUrl: base,
        apiKey: apiKey.trim(),
      modelId: value?.modelId?.trim() === 'x' ? '' : (value?.modelId?.trim() ?? ''),
        temperature: clampOpenAiTemperature(temperature),
      }, ac.signal);
      setTestStatus(ids.length ? `${t('settings.remoteLm.testOk')} (${ids.length})` : t('settings.remoteLm.testOk'));
      setTestStatusKind('ok');
    } catch (e) {
      const aborted =
        ac.signal.aborted ||
        (e instanceof DOMException && e.name === 'AbortError') ||
        (e instanceof Error && e.name === 'AbortError');
      if (aborted) {
        setTestStatus(t('settings.remoteLm.testCancelled'));
        setTestStatusKind('idle');
        return;
      }
      setTestStatus(t('settings.remoteLm.testFail').replace('{message}', e instanceof Error ? e.message : String(e)));
      setTestStatusKind('error');
    } finally {
      setTesting(false);
      setTestAbortController((prev) => (prev === ac ? null : prev));
    }
  }, [apiKey, baseUrlInput, t, temperature, value?.modelId, testAbortController]);

  const cancelTestConnection = useCallback(() => {
    testAbortController?.abort();
  }, [testAbortController]);

  useEffect(
    () => () => {
      testAbortController?.abort();
    },
    [testAbortController],
  );

  const gate = variant === 'gate';

  return (
    <div className={gate ? 'openai-lm-driver openai-lm-driver--gate' : 'openai-lm-driver'}>
      <div className="field">
        <div className="field-label-row">
          <label htmlFor="minerva-remote-lm-base">{t('settings.remoteLm.baseUrl')}</label>
          <button type="button" className="btn btn-ghost openai-lm-presets-trigger" onClick={() => setPresetsOpen(true)}>
            {t('settings.remoteLm.presets.open')}
          </button>
        </div>
        <input
          id="minerva-remote-lm-base"
          type="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('settings.remoteLm.baseUrlPlaceholder').replace('{knownUrls}', t('settings.remoteLm.presets.open'))}
          value={baseUrlInput}
          onChange={(e) => setBaseUrlInput(e.target.value)}
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
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>
      <div className="openai-lm-connection-tools">
        <button type="button" className="btn btn-outline" onClick={() => void testConnection()} disabled={testing}>
          {t('settings.remoteLm.test')}
        </button>
        {testing ? (
          <button type="button" className="btn btn-ghost" onClick={cancelTestConnection}>
            {t('settings.remoteLm.testCancel')}
          </button>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor="minerva-remote-lm-temperature-slider">{t('settings.remoteLm.temperature')}</label>
        <input
          id="minerva-remote-lm-temperature-slider"
          type="range"
          min={MIN_OPENAI_TEMPERATURE}
          max={MAX_OPENAI_TEMPERATURE}
          step={0.05}
          value={temperature}
          onChange={(e) => setTemperature(Number(e.target.value))}
        />
      </div>
      <div className="field">
        <div className="settings-switch-row">
          <label id="minerva-remote-lm-vision-label">{t('settings.remoteLm.supportsVision')}</label>
          <BoolSwitch aria-labelledby="minerva-remote-lm-vision-label" checked={supportsVision} onChange={setSupportsVision} />
        </div>
        <p className="hint">{t('settings.remoteLm.supportsVisionHelp')}</p>
      </div>
      {saveError ? <p className="settings-dialog-error">{saveError}</p> : null}
      {testStatus ? (
        <p
          className={
            testStatusKind === 'error'
              ? 'settings-dialog-error'
              : testStatusKind === 'ok'
                ? 'openai-lm-test-status openai-lm-test-status--ok'
                : 'openai-lm-test-status'
          }
        >
          {testStatus}
        </p>
      ) : null}
      <div className={`openai-lm-driver-actions${gate && onGateRecheck ? ' openai-lm-driver-actions--gate' : ''}`}>
        <button type="button" className="btn btn-primary" onClick={onSave}>
          {t('settings.remoteLm.save')}
        </button>
        {gate && onGateRecheck ? (
          <button type="button" className="btn btn-outline" onClick={onGateRecheck}>
            {t('gate.retry')}
          </button>
        ) : null}
        {!gate && value ? (
          <button type="button" className="btn btn-ghost admin-danger" onClick={onClear}>
            {t('settings.remoteLm.clear')}
          </button>
        ) : null}
      </div>
      <DraggableDialog
        open={presetsOpen}
        title={t('settings.remoteLm.presets.title')}
        closeAriaLabel={t('dialog.close')}
        mobileBackAriaLabel={t('dialog.back')}
        onClose={() => setPresetsOpen(false)}
        width={500}
        variant="solid"
      >
        <ul className="openai-lm-preset-list" role="listbox" aria-label={t('settings.remoteLm.presets.title')}>
          {OPEN_AI_URL_PRESETS.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                className="openai-lm-preset-row"
                role="option"
                onClick={() => {
                  setBaseUrlInput(preset.baseUrl);
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

