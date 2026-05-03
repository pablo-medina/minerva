import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { AppLang, ChatSession, LocalSettings, NanoTurnStats, ThemeMode } from './types';

/** Attachment as stored in IndexedDB (binary, not base64). */
export type PersistedAttachment = {
  id: string;
  name: string;
  mime?: string;
  /** Omit or `image` = legacy image attachment. */
  kind?: 'image' | 'text';
  blob: Blob;
};

export type PersistedChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  attachments?: PersistedAttachment[];
  nanoTurnStats?: NanoTurnStats;
};

export type ChatThreadRecord = {
  sessionId: string;
  session: ChatSession;
  messages: PersistedChatMessage[];
  hasUserMessage: boolean;
};

export type AppSettingsRow = {
  key: 'app';
  localSettings: LocalSettings;
  lang: AppLang;
  theme: ThemeMode;
  activeSessionId: string;
};

export interface MinervaDBSchema extends DBSchema {
  chats: {
    key: string;
    value: ChatThreadRecord;
  };
  settings: {
    key: string;
    value: AppSettingsRow;
  };
}

const MINERVA_DB_NAME = 'minerva_db';

/** Bump when IndexedDB object stores or record shapes change; keep `backupRestore.ts` in sync. */
export const MINERVA_IDB_SCHEMA_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MinervaDBSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<MinervaDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<MinervaDBSchema>(MINERVA_DB_NAME, MINERVA_IDB_SCHEMA_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('chats')) {
          db.createObjectStore('chats', { keyPath: 'sessionId' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

export async function ensureDbReady(): Promise<IDBPDatabase<MinervaDBSchema>> {
  return getDb();
}
