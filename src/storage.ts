import { LS_ACTIVE, LS_SESSIONS, LS_SETTINGS, MSG_PREFIX, messagesKey } from './constants';
import type { ChatMessage, ChatSession, LocalSettings } from './types';

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

export function loadSettings(): LocalSettings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (!raw?.trim()) return defaultSettings();
    const j = JSON.parse(raw) as Partial<LocalSettings>;
    return {
      systemPrompt: typeof j.systemPrompt === 'string' ? j.systemPrompt : '',
      preferredName: typeof j.preferredName === 'string' ? j.preferredName : '',
      chatTitleRefreshEveryUserMessages: clampTitleInterval(j.chatTitleRefreshEveryUserMessages),
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: LocalSettings): void {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
}

export function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(LS_SESSIONS);
    if (!raw?.trim()) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((row): ChatSession | null => {
        if (!row || typeof row !== 'object') return null;
        const o = row as Record<string, unknown>;
        const id = typeof o.id === 'string' ? o.id : '';
        const title = typeof o.title === 'string' ? o.title : 'Chat';
        const createdAt = typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString();
        const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : createdAt;
        if (!id) return null;
        return { id, title, createdAt, updatedAt };
      })
      .filter((x): x is ChatSession => Boolean(x));
  } catch {
    return [];
  }
}

export function saveSessions(sessions: ChatSession[]): void {
  localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions));
}

export function loadActiveSessionId(): string {
  try {
    return (localStorage.getItem(LS_ACTIVE) ?? '').trim();
  } catch {
    return '';
  }
}

export function saveActiveSessionId(id: string): void {
  if (id.trim()) localStorage.setItem(LS_ACTIVE, id.trim());
  else localStorage.removeItem(LS_ACTIVE);
}

export function loadMessages(sessionId: string): ChatMessage[] {
  if (!sessionId.trim()) return [];
  try {
    const raw = localStorage.getItem(messagesKey(sessionId));
    if (!raw?.trim()) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((row): ChatMessage | null => {
        if (!row || typeof row !== 'object') return null;
        const o = row as Record<string, unknown>;
        const id = typeof o.id === 'string' ? o.id : '';
        const role =
          o.role === 'user' || o.role === 'assistant' || o.role === 'system' ? o.role : null;
        const content = typeof o.content === 'string' ? o.content : '';
        const createdAt = typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString();
        if (!id || !role) return null;
        return { id, role, content, createdAt };
      })
      .filter((x): x is ChatMessage => Boolean(x));
  } catch {
    return [];
  }
}

export function saveMessages(sessionId: string, messages: ChatMessage[]): void {
  if (!sessionId.trim()) return;
  localStorage.setItem(messagesKey(sessionId), JSON.stringify(messages));
}

/** True when the thread has at least one user message (eligible for the chat list). */
export function sessionHasUserMessage(sessionId: string): boolean {
  if (!sessionId.trim()) return false;
  return loadMessages(sessionId).some((m) => m.role === 'user');
}

export function wipeAllMessageKeys(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(MSG_PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function clearAllPersistence(): void {
  wipeAllMessageKeys();
  try {
    localStorage.removeItem(LS_SESSIONS);
    localStorage.removeItem(LS_ACTIVE);
    localStorage.removeItem(LS_SETTINGS);
  } catch {
    /* ignore */
  }
}
