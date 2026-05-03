import { detectBrowserLang } from './i18n';
import type { AppLang, ChatImageAttachment, ChatMessage, ChatSession, LocalSettings, ThemeMode } from './types';
import { ensureDbReady, getDb, type AppSettingsRow, type PersistedChatMessage } from './db';

function parseNanoTurnStats(raw: unknown): import('./types').NanoTurnStats | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  const modelId = typeof s.modelId === 'string' ? s.modelId.trim() : '';
  const totalLatencyMs =
    typeof s.totalLatencyMs === 'number' && Number.isFinite(s.totalLatencyMs) ? s.totalLatencyMs : NaN;
  if (!modelId || !Number.isFinite(totalLatencyMs)) return undefined;
  const ttftMs =
    typeof s.ttftMs === 'number' && Number.isFinite(s.ttftMs) && s.ttftMs >= 0 ? s.ttftMs : undefined;
  const approxPromptTokenEstimate =
    typeof s.approxPromptTokenEstimate === 'number' && Number.isFinite(s.approxPromptTokenEstimate)
      ? Math.max(0, Math.floor(s.approxPromptTokenEstimate))
      : 0;
  const approxCompletionTokenEstimate =
    typeof s.approxCompletionTokenEstimate === 'number' && Number.isFinite(s.approxCompletionTokenEstimate)
      ? Math.max(0, Math.floor(s.approxCompletionTokenEstimate))
      : 0;
  const approxTotalTokenEstimate =
    typeof s.approxTotalTokenEstimate === 'number' && Number.isFinite(s.approxTotalTokenEstimate)
      ? Math.max(0, Math.floor(s.approxTotalTokenEstimate))
      : approxPromptTokenEstimate + approxCompletionTokenEstimate;
  const genTps =
    typeof s.genTps === 'number' && Number.isFinite(s.genTps) && s.genTps > 0 ? s.genTps : undefined;
  return {
    modelId,
    totalLatencyMs,
    ttftMs,
    approxPromptTokenEstimate,
    approxCompletionTokenEstimate,
    approxTotalTokenEstimate,
    genTps,
  };
}

export const DEFAULT_CHAT_TITLE_REFRESH_EVERY_USER_MESSAGES = 8;

const defaultSettings = (): LocalSettings => ({
  systemPrompt: '',
  preferredName: '',
  chatTitleRefreshEveryUserMessages: DEFAULT_CHAT_TITLE_REFRESH_EVERY_USER_MESSAGES,
});

function clampTitleInterval(n: unknown): number {
  if (typeof n === 'number' && Number.isFinite(n)) {
    return Math.min(500, Math.max(0, Math.floor(n)));
  }
  return DEFAULT_CHAT_TITLE_REFRESH_EVERY_USER_MESSAGES;
}

function defaultAppRow(): AppSettingsRow {
  return {
    key: 'app',
    localSettings: defaultSettings(),
    lang: detectBrowserLang(),
    theme: 'dark',
    activeSessionId: '',
  };
}

async function readAppRow(): Promise<AppSettingsRow> {
  await ensureDbReady();
  const db = await getDb();
  const row = await db.get('settings', 'app');
  if (!row) return defaultAppRow();
  return {
    key: 'app',
    localSettings: {
      systemPrompt:
        typeof row.localSettings?.systemPrompt === 'string' ? row.localSettings.systemPrompt : '',
      preferredName:
        typeof row.localSettings?.preferredName === 'string' ? row.localSettings.preferredName : '',
      chatTitleRefreshEveryUserMessages: clampTitleInterval(
        row.localSettings?.chatTitleRefreshEveryUserMessages,
      ),
    },
    lang: row.lang === 'es' || row.lang === 'es-AR' || row.lang === 'en' ? row.lang : 'en',
    theme: row.theme === 'light' || row.theme === 'dark' ? row.theme : 'dark',
    activeSessionId: typeof row.activeSessionId === 'string' ? row.activeSessionId : '',
  };
}

async function writeAppRow(next: AppSettingsRow): Promise<void> {
  await ensureDbReady();
  const db = await getDb();
  await db.put('settings', next);
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

async function serializeMessage(m: ChatMessage): Promise<PersistedChatMessage> {
  const base: PersistedChatMessage = {
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    ...(m.nanoTurnStats ? { nanoTurnStats: m.nanoTurnStats } : {}),
  };
  if (!m.attachments?.length) return base;
  const attachments = await Promise.all(
    m.attachments.map(async (a) => ({
      id: a.id,
      name: a.name,
      mime: a.mime,
      blob: await dataUrlToBlob(a.dataUrl),
    })),
  );
  return { ...base, attachments };
}

async function deserializeMessage(pm: PersistedChatMessage): Promise<ChatMessage> {
  let attachments: ChatImageAttachment[] | undefined;
  if (pm.attachments?.length) {
    const parsed: ChatImageAttachment[] = [];
    for (const a of pm.attachments) {
      if (!a?.blob || typeof a.id !== 'string' || typeof a.name !== 'string') continue;
      const dataUrl = await blobToDataUrl(a.blob);
      if (!dataUrl.startsWith('data:')) continue;
      parsed.push({
        id: a.id,
        name: a.name || 'image',
        mime: typeof a.mime === 'string' ? a.mime : undefined,
        dataUrl,
      });
    }
    if (parsed.length) attachments = parsed;
  }
  const nanoTurnStats = pm.role === 'assistant' ? parseNanoTurnStats(pm.nanoTurnStats) : undefined;
  return {
    id: pm.id,
    role: pm.role,
    content: typeof pm.content === 'string' ? pm.content : '',
    createdAt: typeof pm.createdAt === 'string' ? pm.createdAt : new Date().toISOString(),
    ...(attachments ? { attachments } : {}),
    ...(nanoTurnStats ? { nanoTurnStats } : {}),
  };
}

export async function loadSettings(): Promise<LocalSettings> {
  const row = await readAppRow();
  return row.localSettings;
}

export async function saveSettings(s: LocalSettings): Promise<void> {
  const prev = await readAppRow();
  await writeAppRow({ ...prev, localSettings: s });
}

export async function loadAppPrefs(): Promise<{ lang: AppLang; theme: ThemeMode }> {
  const row = await readAppRow();
  return { lang: row.lang, theme: row.theme };
}

export async function saveAppPrefsLang(lang: AppLang): Promise<void> {
  const prev = await readAppRow();
  await writeAppRow({ ...prev, lang });
}

export async function saveAppPrefsTheme(theme: ThemeMode): Promise<void> {
  const prev = await readAppRow();
  await writeAppRow({ ...prev, theme });
}

export async function loadActiveSessionId(): Promise<string> {
  const row = await readAppRow();
  return row.activeSessionId.trim();
}

export async function saveActiveSessionId(id: string): Promise<void> {
  const prev = await readAppRow();
  await writeAppRow({
    ...prev,
    activeSessionId: id.trim(),
  });
}

export async function loadSessions(): Promise<ChatSession[]> {
  await ensureDbReady();
  const db = await getDb();
  const rows = await db.getAll('chats');
  return rows
    .map((r) => ({
      ...r.session,
      hasUserMessage: Boolean(r.hasUserMessage),
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function saveSessions(sessions: ChatSession[]): Promise<void> {
  await ensureDbReady();
  const db = await getDb();
  const keep = new Set(sessions.map((s) => s.id));
  const existing = await db.getAll('chats');
  const prevById = new Map(existing.map((r) => [r.sessionId, r]));
  const tx = db.transaction('chats', 'readwrite');
  for (const r of existing) {
    if (!keep.has(r.sessionId)) {
      await tx.store.delete(r.sessionId);
    }
  }
  for (const s of sessions) {
    const prev = prevById.get(s.id);
    const { hasUserMessage: _drop, ...sessionOnly } = s as ChatSession & { hasUserMessage?: boolean };
    await tx.store.put({
      sessionId: s.id,
      session: sessionOnly,
      messages: prev?.messages ?? [],
      hasUserMessage: prev?.hasUserMessage ?? false,
    });
  }
  await tx.done;
}

export async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
  if (!sessionId.trim()) return [];
  await ensureDbReady();
  const db = await getDb();
  const row = await db.get('chats', sessionId);
  if (!row?.messages?.length) return [];
  return Promise.all(row.messages.map(deserializeMessage));
}

export async function saveMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
  if (!sessionId.trim()) return;
  await ensureDbReady();
  const db = await getDb();
  const prev = await db.get('chats', sessionId);
  const persisted = await Promise.all(messages.map(serializeMessage));
  const hasUserMessage = messages.some((m) => m.role === 'user');
  const sessionBase: ChatSession =
    prev?.session ??
    ({
      id: sessionId,
      title: 'Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ChatSession);
  await db.put('chats', {
    sessionId,
    session: { ...sessionBase, updatedAt: new Date().toISOString() },
    messages: persisted,
    hasUserMessage,
  });
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  if (!sessionId.trim()) return;
  await ensureDbReady();
  const db = await getDb();
  await db.delete('chats', sessionId);
}

/** Removes every chat thread and resets the active session id in settings (does not clear local settings text). */
export async function wipeAllChatThreads(): Promise<void> {
  await ensureDbReady();
  const db = await getDb();
  const keys = await db.getAllKeys('chats');
  const tx = db.transaction('chats', 'readwrite');
  for (const k of keys) {
    await tx.store.delete(k);
  }
  await tx.done;
  const prev = await readAppRow();
  await writeAppRow({ ...prev, activeSessionId: '' });
}
