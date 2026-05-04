import { DEFAULT_MAX_IMAGE_ATTACHMENT_MIB, DEFAULT_MAX_TEXT_ATTACHMENT_MIB } from './chatAttachmentConstants';
import { detectBrowserLang } from './i18n';
import type { AppLang, ChatAttachment, ChatMessage, ChatSession, LocalSettings, ThemeMode } from './types';
import { isChatTextAttachment } from './types';
import { normalizeMaxImageAttachmentMibFromStored } from './imageAttachmentSettings';
import { normalizeMaxTextAttachmentMibFromStored } from './textAttachmentSettings';
import {
  ensureDbReady,
  getDb,
  type AppSettingsRow,
  type ChatThreadRecord,
  type PersistedChatMessage,
} from './db';
import {
  clampOpenAiTemperature,
  normalizeOpenAiBaseUrl,
  type OpenAiDriverStored,
} from './drivers/openaiLanguageModel/storage';
import { getOriginStorageQuotaMib } from './storageEstimate';

export function parseNanoTurnStats(raw: unknown): import('./types').NanoTurnStats | undefined {
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

/** Seconds to wait for the first streamed chunk after the session is ready (default 15; 0 = off). */
export const DEFAULT_STREAM_FIRST_CHUNK_TIMEOUT_SEC = 15;

const defaultSettings = (): LocalSettings => ({
  chatAiModelKey: undefined,
  systemAiModelKey: undefined,
  chatAiId: undefined,
  systemAiId: undefined,
  openAiConfig: undefined,
  autoAliasExternalModel: true,
  systemPrompt: '',
  preferredName: '',
  chatTitleRefreshEveryUserMessages: DEFAULT_CHAT_TITLE_REFRESH_EVERY_USER_MESSAGES,
  maxTextAttachmentMib: DEFAULT_MAX_TEXT_ATTACHMENT_MIB,
  maxImageAttachmentMib: DEFAULT_MAX_IMAGE_ATTACHMENT_MIB,
  streamFirstChunkTimeoutSec: DEFAULT_STREAM_FIRST_CHUNK_TIMEOUT_SEC,
});

function normalizeAiId(raw: unknown): LocalSettings['chatAiId'] | undefined {
  return raw === 'nano' || raw === 'openai' ? raw : undefined;
}

function normalizeOpenAiConfig(raw: unknown): OpenAiDriverStored | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const baseUrl = normalizeOpenAiBaseUrl(typeof o.baseUrl === 'string' ? o.baseUrl : '');
  const modelId = typeof o.modelId === 'string' ? o.modelId.trim() : '';
  if (!baseUrl) return undefined;
  const apiKey = typeof o.apiKey === 'string' ? o.apiKey : '';
  const displayAliasRaw = typeof o.displayAlias === 'string' ? o.displayAlias.trim() : '';
  return {
    baseUrl,
    modelId,
    apiKey,
    temperature: clampOpenAiTemperature(o.temperature),
    ...(o.supportsVision === true ? { supportsVision: true } : {}),
    ...(displayAliasRaw ? { displayAlias: displayAliasRaw } : {}),
  };
}

/** Normalizes stored or user-entered seconds (0 = disabled; otherwise clamped 1–600). */
export function clampStreamFirstChunkTimeoutSec(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const v = Math.round(raw);
    if (v === 0) return 0;
    if (v < 0) return DEFAULT_STREAM_FIRST_CHUNK_TIMEOUT_SEC;
    return Math.min(600, Math.max(1, v));
  }
  return DEFAULT_STREAM_FIRST_CHUNK_TIMEOUT_SEC;
}

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

/** Normalizes the persisted app row (IndexedDB or backup JSON). Exported for backup/restore. */
export function normalizeAppSettingsRow(row: AppSettingsRow | null | undefined): AppSettingsRow {
  if (!row) return defaultAppRow();
  return {
    key: 'app',
    localSettings: {
      chatAiModelKey:
        typeof row.localSettings?.chatAiModelKey === 'string'
          ? row.localSettings.chatAiModelKey.trim() || undefined
          : undefined,
      systemAiModelKey:
        typeof row.localSettings?.systemAiModelKey === 'string'
          ? row.localSettings.systemAiModelKey.trim() || undefined
          : undefined,
      chatAiId: normalizeAiId(row.localSettings?.chatAiId),
      systemAiId: normalizeAiId(row.localSettings?.systemAiId),
      openAiConfig: normalizeOpenAiConfig(row.localSettings?.openAiConfig),
      autoAliasExternalModel:
        typeof row.localSettings?.autoAliasExternalModel === 'boolean'
          ? row.localSettings.autoAliasExternalModel
          : true,
      systemPrompt:
        typeof row.localSettings?.systemPrompt === 'string' ? row.localSettings.systemPrompt : '',
      preferredName:
        typeof row.localSettings?.preferredName === 'string' ? row.localSettings.preferredName : '',
      chatTitleRefreshEveryUserMessages: clampTitleInterval(
        row.localSettings?.chatTitleRefreshEveryUserMessages,
      ),
      maxTextAttachmentMib: normalizeMaxTextAttachmentMibFromStored(row.localSettings),
      maxImageAttachmentMib: normalizeMaxImageAttachmentMibFromStored(row.localSettings),
      streamFirstChunkTimeoutSec: clampStreamFirstChunkTimeoutSec(
        row.localSettings?.streamFirstChunkTimeoutSec,
      ),
    },
    lang: row.lang === 'es' || row.lang === 'es-AR' || row.lang === 'en' ? row.lang : 'en',
    theme: row.theme === 'light' || row.theme === 'dark' ? row.theme : 'dark',
    activeSessionId: typeof row.activeSessionId === 'string' ? row.activeSessionId : '',
  };
}

export async function loadAppSettingsRow(): Promise<AppSettingsRow> {
  await ensureDbReady();
  const db = await getDb();
  const row = await db.get('settings', 'app');
  return normalizeAppSettingsRow(row ?? undefined);
}

/**
 * Replaces every chat thread and the app settings row in one transaction (used by backup restore).
 * Caller must supply already-validated `ChatThreadRecord` values.
 */
export async function replaceAllPersistedState(
  settings: AppSettingsRow,
  chats: ChatThreadRecord[],
): Promise<void> {
  const normalized = normalizeAppSettingsRow(settings);
  const ids = new Set(chats.map((c) => c.sessionId));
  let activeSessionId = normalized.activeSessionId.trim();
  if (activeSessionId && !ids.has(activeSessionId)) {
    activeSessionId = chats[0]?.sessionId ?? '';
  }
  const nextSettings: AppSettingsRow = { ...normalized, activeSessionId };

  await ensureDbReady();
  const db = await getDb();
  const keys = await db.getAllKeys('chats');
  const tx = db.transaction(['chats', 'settings'], 'readwrite');
  const chatStore = tx.objectStore('chats');
  for (const k of keys) {
    chatStore.delete(k);
  }
  for (const row of chats) {
    chatStore.put(row);
  }
  tx.objectStore('settings').put(nextSettings);
  await tx.done;
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
    ...(typeof m.reasoning === 'string' && m.reasoning.trim() ? { reasoning: m.reasoning } : {}),
    ...(m.role === 'assistant' && typeof m.assistantDisplayName === 'string' && m.assistantDisplayName.trim()
      ? { assistantDisplayName: m.assistantDisplayName.trim() }
      : {}),
  };
  if (!m.attachments?.length) return base;
  const attachments = await Promise.all(
    m.attachments.map(async (a) => {
      if (isChatTextAttachment(a)) {
        return {
          id: a.id,
          name: a.name,
          mime: a.mime || 'text/plain;charset=utf-8',
          kind: 'text' as const,
          blob: new Blob([a.text], { type: a.mime || 'text/plain;charset=utf-8' }),
        };
      }
      return {
        id: a.id,
        name: a.name,
        mime: a.mime,
        kind: 'image' as const,
        blob: await dataUrlToBlob(a.dataUrl),
      };
    }),
  );
  return { ...base, attachments };
}

async function deserializeMessage(pm: PersistedChatMessage): Promise<ChatMessage> {
  let attachments: ChatAttachment[] | undefined;
  if (pm.attachments?.length) {
    const parsed: ChatAttachment[] = [];
    for (const a of pm.attachments) {
      if (!a?.blob || typeof a.id !== 'string' || typeof a.name !== 'string') continue;
      const kind = a.kind === 'text' ? 'text' : 'image';
      if (kind === 'text') {
        try {
          const text = await a.blob.text();
          parsed.push({
            kind: 'text',
            id: a.id,
            name: a.name || 'file.txt',
            mime: typeof a.mime === 'string' ? a.mime : undefined,
            text,
          });
        } catch {
          /* skip */
        }
        continue;
      }
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
  const reasoning =
    pm.role === 'assistant' && typeof (pm as unknown as Record<string, unknown>).reasoning === 'string'
      ? ((pm as unknown as Record<string, unknown>).reasoning as string)
      : undefined;
  const assistantDisplayNameRaw =
    pm.role === 'assistant' && typeof pm.assistantDisplayName === 'string' ? pm.assistantDisplayName.trim() : '';
  return {
    id: pm.id,
    role: pm.role,
    content: typeof pm.content === 'string' ? pm.content : '',
    createdAt: typeof pm.createdAt === 'string' ? pm.createdAt : new Date().toISOString(),
    ...(attachments ? { attachments } : {}),
    ...(nanoTurnStats ? { nanoTurnStats } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(assistantDisplayNameRaw ? { assistantDisplayName: assistantDisplayNameRaw } : {}),
  };
}

export async function loadSettings(): Promise<LocalSettings> {
  const row = await loadAppSettingsRow();
  return row.localSettings;
}

export async function saveSettings(s: LocalSettings): Promise<void> {
  const prev = await loadAppSettingsRow();
  await writeAppRow({ ...prev, localSettings: s });
}

export async function loadAppPrefs(): Promise<{ lang: AppLang; theme: ThemeMode }> {
  const row = await loadAppSettingsRow();
  return { lang: row.lang, theme: row.theme };
}

export async function saveAppPrefsLang(lang: AppLang): Promise<void> {
  const prev = await loadAppSettingsRow();
  await writeAppRow({ ...prev, lang });
}

export async function saveAppPrefsTheme(theme: ThemeMode): Promise<void> {
  const prev = await loadAppSettingsRow();
  await writeAppRow({ ...prev, theme });
}

export async function loadActiveSessionId(): Promise<string> {
  const row = await loadAppSettingsRow();
  return row.activeSessionId.trim();
}

export async function saveActiveSessionId(id: string): Promise<void> {
  const prev = await loadAppSettingsRow();
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
  const prev = await loadAppSettingsRow();
  await writeAppRow({ ...prev, activeSessionId: '' });
}

/**
 * Deletes the oldest chat threads (by `updatedAt`) until estimated usage drops below `targetUsageRatio`,
 * never deleting the active session while other threads exist.
 */
export async function pruneOldestChatSessionsExcludingActive(
  activeSessionId: string,
  targetUsageRatio: number,
): Promise<{ deletedIds: string[] }> {
  const deletedIds: string[] = [];
  const target = Math.max(0.08, Math.min(0.95, targetUsageRatio));
  const active = activeSessionId.trim();

  for (let guard = 0; guard < 400; guard++) {
    const q = await getOriginStorageQuotaMib();
    if (q.quotaMib <= 0) break;
    const ratio = q.usedMib / q.quotaMib;
    if (ratio < target) break;

    const sessions = await loadSessions();
    if (sessions.length <= 1) break;

    const sorted = [...sessions].sort(
      (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
    );
    const victim = sorted.find((s) => s.id !== active) ?? sorted[0];
    await deleteChatSession(victim.id);
    deletedIds.push(victim.id);
  }

  return { deletedIds };
}
