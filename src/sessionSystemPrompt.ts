import { buildUserTurnModelParts } from './userModelParts';
import type { AppLang, ChatMessage, LocalSettings } from './types';

export type SessionGeo = { lat: number; lon: number };

export type SessionSystemContext = {
  appLang: AppLang;
  now: Date;
  timeZone: string;
  geo: SessionGeo | null;
};

/** Best-effort browser geolocation; resolves null on deny, error, or timeout. */
export function resolveApproximateLocation(timeoutMs: number): Promise<SessionGeo | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (value: SessionGeo | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        finish({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        window.clearTimeout(timer);
        finish(null);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 600_000,
        timeout: Math.max(800, timeoutMs - 250),
      },
    );
  });
}

function localeForAppLang(lang: AppLang): string {
  if (lang === 'en') return 'en-US';
  if (lang === 'es-AR') return 'es-AR';
  return 'es';
}

function languageDirective(lang: AppLang): string {
  if (lang === 'es-AR') {
    return 'Conversation language: answer in Spanish (Argentina). Prefer voseo and local wording when it fits naturally. Match the application UI language.';
  }
  if (lang === 'es') {
    return 'Conversation language: answer in Spanish (neutral). Match the application UI language.';
  }
  return 'Conversation language: answer in English. Match the application UI language.';
}

function dateTimeDirective(lang: AppLang, now: Date, timeZone: string): string {
  const locale = localeForAppLang(lang);
  const local = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(now);
  return `User local time (IANA ${timeZone}): ${local}. Same instant (UTC, ISO-8601): ${now.toISOString()}.`;
}

function geoDirective(geo: SessionGeo): string {
  return `Approximate client-reported coordinates (browser geolocation, may be coarse or stale): latitude ${geo.lat.toFixed(5)}, longitude ${geo.lon.toFixed(5)}. Treat as uncertain context only; never assert an exact real-world address.`;
}

/**
 * Builds the full system preamble: UI language, date/time, optional geo, optional
 * preferred name, then the user's optional system prompt.
 */
export function buildSessionSystemContent(settings: LocalSettings, ctx: SessionSystemContext): string {
  const parts: string[] = [languageDirective(ctx.appLang), dateTimeDirective(ctx.appLang, ctx.now, ctx.timeZone)];
  if (ctx.geo) parts.push(geoDirective(ctx.geo));

  const name = settings.preferredName
    .trim()
    .replace(/\r?\n/g, ' ')
    .slice(0, 120)
    .replace(/"/g, "'");
  if (name) {
    parts.push(
      `The user's preferred name is "${name}". Address them by this name when it fits the conversation.`,
    );
  }

  const sys = settings.systemPrompt.trim();
  if (sys) parts.push(sys);

  parts.push(
    'For a fenced block meant as a whole file, you may start with e.g. `// minerva-filename: AuthService.ts` (JS/TS), `# minerva-filename: train.py` (Python), or `<!-- minerva-filename: index.html -->` so the UI suggests that download name; omit for short snippets.',
  );

  return parts.join('\n\n').trim();
}

export type BuildSessionInitialPromptsOptions = {
  /** Shown as the text part when a historical user turn has images but empty text (model input). */
  attachmentsOnlyPrompt: string;
};

export async function buildSessionInitialPromptsAsync(
  settings: LocalSettings,
  history: ChatMessage[],
  ctx: SessionSystemContext,
  opts: BuildSessionInitialPromptsOptions,
): Promise<LanguageModelCreateOptions['initialPrompts']> {
  const sysTrim = buildSessionSystemContent(settings, ctx);
  const out: Array<LanguageModelSystemMessage | LanguageModelMessage> = [];
  if (sysTrim) {
    out.push({ role: 'system', content: sysTrim });
  }
  for (const m of history) {
    if (m.role === 'system') {
      if (!sysTrim) {
        out.push({ role: 'system', content: m.content });
      }
      continue;
    }
    if (m.role === 'assistant') {
      out.push({ role: 'assistant', content: m.content });
      continue;
    }
    if (m.role === 'user') {
      const atts = m.attachments ?? [];
      if (!atts.length) {
        out.push({ role: 'user', content: m.content });
        continue;
      }
      const parts = (await buildUserTurnModelParts({
        modelText: m.content,
        attachments: atts,
        attachmentsOnlyPrompt: opts.attachmentsOnlyPrompt,
      })) as LanguageModelMessageContent[];
      out.push({ role: 'user', content: parts });
    }
  }
  return out.length ? (out as LanguageModelCreateOptions['initialPrompts']) : undefined;
}

export function defaultSessionSystemContext(appLang: AppLang, geo: SessionGeo | null): SessionSystemContext {
  let timeZone = 'UTC';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    /* ignore */
  }
  return {
    appLang,
    now: new Date(),
    timeZone,
    geo,
  };
}
