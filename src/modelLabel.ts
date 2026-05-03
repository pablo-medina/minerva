import type { Translator } from './i18n';
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

function formatModelName(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('gemini') && lower.includes('nano')) return 'Gemini Nano';
  const cleaned = raw.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return raw;
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Etiqueta para burbujas y compositor: nombre del modelo si la API lo expone; si no, Gemini Nano en entornos Prompt API; si no aplica, IA/AI. */
export function modelLabelForSession(session: LanguageModel | null, t: Translator): string {
  const fromApi = readOptionalModelName(session);
  if (fromApi) return formatModelName(fromApi);
  if (languageModelSupported()) return 'Gemini Nano';
  return t('model.fallbackShort');
}
