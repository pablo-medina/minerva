/**
 * Persists OpenAI-compatible endpoint settings for the Prompt API polyfill.
 * Uses localStorage (namespaced) so the module stays self-contained; API keys
 * are as sensitive as any secret in localStorage (XSS / shared machine risk).
 */
const STORAGE_KEY = 'minerva.openaiLmPolyfill.v1';

/** Default sampling temperature for OpenAI-compatible chat completions. */
export const DEFAULT_OPENAI_LM_TEMPERATURE = 0.2;
export const MIN_OPENAI_LM_TEMPERATURE = 0;
export const MAX_OPENAI_LM_TEMPERATURE = 2;

export function clampOpenAiLmTemperature(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_OPENAI_LM_TEMPERATURE;
  return Math.min(MAX_OPENAI_LM_TEMPERATURE, Math.max(MIN_OPENAI_LM_TEMPERATURE, n));
}

export type OpenAiLmPolyfillStored = {
  /** Normalized base including `/v1` (e.g. https://api.openai.com/v1). */
  baseUrl: string;
  apiKey: string;
  modelId: string;
  /** Sampling temperature for chat completions (0–2). */
  temperature: number;
  /** Optional short label for the composer and chat UI (overrides formatted model id). */
  displayAlias?: string;
};

export function normalizeOpenAiLmBaseUrl(raw: string): string {
  let s = raw.trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/\/v1$/i.test(s)) {
    s = `${s}/v1`;
  }
  return s;
}

export function loadOpenAiLmPolyfillConfig(): OpenAiLmPolyfillStored | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const o = parsed as Record<string, unknown>;
    const baseUrl = typeof o.baseUrl === 'string' ? o.baseUrl.trim() : '';
    const apiKey = typeof o.apiKey === 'string' ? o.apiKey : '';
    const modelId = typeof o.modelId === 'string' ? o.modelId.trim() : '';
    if (!baseUrl || !modelId) return null;
    const displayAliasRaw = typeof o.displayAlias === 'string' ? o.displayAlias.trim() : '';
    const displayAlias = displayAliasRaw ? displayAliasRaw : undefined;
    const temperature = clampOpenAiLmTemperature(o.temperature);
    return { baseUrl, apiKey, modelId, temperature, ...(displayAlias ? { displayAlias } : {}) };
  } catch {
    return null;
  }
}

export function isOpenAiLmPolyfillConfigComplete(c: OpenAiLmPolyfillStored | null): c is OpenAiLmPolyfillStored {
  return Boolean(c?.baseUrl?.trim() && c?.modelId?.trim());
}

export function saveOpenAiLmPolyfillConfig(next: {
  baseUrlInput: string;
  apiKey: string;
  modelId: string;
  temperature: number;
  displayAlias?: string;
}): OpenAiLmPolyfillStored {
  const baseUrl = normalizeOpenAiLmBaseUrl(next.baseUrlInput);
  const modelId = next.modelId.trim();
  const apiKey = next.apiKey.trim();
  const temperature = clampOpenAiLmTemperature(next.temperature);
  const aliasTrim = (next.displayAlias ?? '').trim();
  const row: OpenAiLmPolyfillStored = { baseUrl, apiKey, modelId, temperature };
  if (aliasTrim) row.displayAlias = aliasTrim;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(row));
  }
  return row;
}

const LEGACY_MODEL_LIST_CACHE_KEY = 'minerva.openaiLmPolyfill.modelListCache.v1';

export function clearOpenAiLmPolyfillConfig(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_MODEL_LIST_CACHE_KEY);
  } catch {
    /* ignore */
  }
}
