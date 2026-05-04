import type { Translator } from './i18n';
import { isOpenAiLanguageModelPolyfillInstalled } from './polyfills/openaiLanguageModel/detect';
import {
  isOpenAiLmPolyfillConfigComplete,
  loadOpenAiLmPolyfillConfig,
} from './polyfills/openaiLanguageModel/storage';
import { languageModelSupported } from './promptApi';

function readOptionalModelName(session: LanguageModel | null): string | null {
  if (!session) return null;
  const rec = session as unknown as Record<string, unknown>;
  for (const key of ['name', 'model', 'modelId', 'languageModelId', 'id', 'label'] as const) {
    const v = rec[key];
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function formatModelName(raw: string, t: Translator): string {
  const lower = raw.toLowerCase();
  if (lower.includes('gemini') && lower.includes('nano')) return t('model.geminiNanoBrand');
  const cleaned = raw.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return raw;
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Label for bubbles and composer: with the OpenAI polyfill and a complete saved config,
 * uses optional `displayAlias`, otherwise the localized default “External AI”, so the UI
 * tracks settings without waiting for a new `LanguageModel` instance. Otherwise reads
 * from the active session, then on-device / fallback strings.
 */
export function modelLabelForSession(session: LanguageModel | null, t: Translator): string {
  if (isOpenAiLanguageModelPolyfillInstalled()) {
    const cfg = loadOpenAiLmPolyfillConfig();
    const alias = cfg?.displayAlias?.trim();
    if (alias) return alias;
    if (cfg && isOpenAiLmPolyfillConfigComplete(cfg)) {
      return t('model.externalAiDefault');
    }
    const fromApi = readOptionalModelName(session);
    if (fromApi) return formatModelName(fromApi, t);
    return t('model.apiEmulationPending');
  }

  const fromApi = readOptionalModelName(session);
  if (fromApi) return formatModelName(fromApi, t);

  if (languageModelSupported()) return t('model.geminiNanoBrand');

  return t('model.fallbackShort');
}
