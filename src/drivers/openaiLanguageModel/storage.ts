const STORAGE_KEY = 'minerva.openaiDriver.legacy.v1';

export const DEFAULT_OPENAI_TEMPERATURE = 0.2;
export const MIN_OPENAI_TEMPERATURE = 0;
export const MAX_OPENAI_TEMPERATURE = 2;

export function clampOpenAiTemperature(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_OPENAI_TEMPERATURE;
  return Math.min(MAX_OPENAI_TEMPERATURE, Math.max(MIN_OPENAI_TEMPERATURE, n));
}

export type OpenAiDriverStored = {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  temperature: number;
  displayAlias?: string;
  supportsVision?: boolean;
};

export function normalizeOpenAiBaseUrl(raw: string): string {
  let s = raw.trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/\/v1$/i.test(s)) s = `${s}/v1`;
  return s;
}

export function loadLegacyOpenAiConfig(): OpenAiDriverStored | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const baseUrl = normalizeOpenAiBaseUrl(typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '');
    const modelId = typeof parsed.modelId === 'string' ? parsed.modelId.trim() : '';
    if (!baseUrl) return null;
    const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey : '';
    const displayAliasRaw = typeof parsed.displayAlias === 'string' ? parsed.displayAlias.trim() : '';
    return {
      baseUrl,
      apiKey,
      modelId,
      temperature: clampOpenAiTemperature(parsed.temperature),
      ...(displayAliasRaw ? { displayAlias: displayAliasRaw } : {}),
      ...(parsed.supportsVision === true ? { supportsVision: true } : {}),
    };
  } catch {
    return null;
  }
}

/** Base URL is set; stored `modelId` may be empty when the picker supplies the model id separately. */
export function isOpenAiEndpointConfigured(c: OpenAiDriverStored | null | undefined): boolean {
  return Boolean(c?.baseUrl?.trim());
}

/** Resolved config ready for API calls (base URL plus model id — callers merge picker model into cfg when needed). */
export function isOpenAiConfigComplete(c: OpenAiDriverStored | null | undefined): c is OpenAiDriverStored {
  return Boolean(c?.baseUrl?.trim() && c.modelId?.trim());
}

