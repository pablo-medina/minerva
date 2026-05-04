/**
 * Persists OpenAI-compatible endpoint settings for the Prompt API polyfill.
 * Uses localStorage (namespaced) so the module stays self-contained; API keys
 * are as sensitive as any secret in localStorage (XSS / shared machine risk).
 */
const STORAGE_KEY = 'minerva.openaiLmPolyfill.v1';

export type OpenAiLmPolyfillStored = {
  /** Normalized base including `/v1` (e.g. https://api.openai.com/v1). */
  baseUrl: string;
  apiKey: string;
  modelId: string;
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
    return { baseUrl, apiKey, modelId, ...(displayAlias ? { displayAlias } : {}) };
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
  displayAlias?: string;
}): OpenAiLmPolyfillStored {
  const baseUrl = normalizeOpenAiLmBaseUrl(next.baseUrlInput);
  const modelId = next.modelId.trim();
  const apiKey = next.apiKey.trim();
  const aliasTrim = (next.displayAlias ?? '').trim();
  const row: OpenAiLmPolyfillStored = { baseUrl, apiKey, modelId };
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
