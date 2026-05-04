import {
  MINERVA_IDB_SCHEMA_VERSION,
  ensureDbReady,
  getDb,
  type AppSettingsRow,
  type ChatThreadRecord,
  type PersistedAttachment,
  type PersistedChatMessage,
} from './db';
import type { ChatSession } from './types';
import {
  loadAppSettingsRow,
  normalizeAppSettingsRow,
  parseNanoTurnStats,
  replaceAllPersistedState,
} from './storage';

export const MINERVA_BACKUP_FORMAT = 'minerva-backup' as const;

/** JSON envelope version (increment when wire shape changes). */
export const MINERVA_BACKUP_PAYLOAD_VERSION = 1;

/** Hard cap for restore file size (browser memory). */
export const MINERVA_BACKUP_MAX_IMPORT_BYTES = 180 * 1024 * 1024;

export class BackupRestoreError extends Error {
  constructor(public readonly i18nKey: string) {
    super(i18nKey);
    this.name = 'BackupRestoreError';
  }
}

type BackupWireAttachment = {
  id: string;
  name: string;
  mime?: string;
  kind?: 'image' | 'text';
  bytesBase64: string;
};

type BackupWireMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  attachments?: BackupWireAttachment[];
  nanoTurnStats?: unknown;
  reasoning?: string;
  assistantDisplayName?: string;
};

type BackupWireChat = {
  sessionId: string;
  session: ChatSession;
  messages: BackupWireMessage[];
  hasUserMessage: boolean;
};

export type MinervaBackupFileV1 = {
  format: typeof MINERVA_BACKUP_FORMAT;
  payloadVersion: number;
  idbSchemaVersion: number;
  exportedAt: string;
  settings: AppSettingsRow;
  chats: BackupWireChat[];
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error ?? new Error('read'));
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, mime?: string): Blob {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime && mime.trim() ? mime : 'application/octet-stream' });
}

async function persistedMessageToWire(m: PersistedChatMessage): Promise<BackupWireMessage> {
  const base: BackupWireMessage = {
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    ...(m.role === 'assistant' && m.nanoTurnStats ? { nanoTurnStats: m.nanoTurnStats } : {}),
    ...(m.role === 'assistant' && typeof m.reasoning === 'string' ? { reasoning: m.reasoning } : {}),
    ...(m.role === 'assistant' &&
    typeof m.assistantDisplayName === 'string' &&
    m.assistantDisplayName.trim()
      ? { assistantDisplayName: m.assistantDisplayName.trim() }
      : {}),
  };
  if (!m.attachments?.length) return base;
  const attachments: BackupWireAttachment[] = await Promise.all(
    m.attachments.map(async (a) => {
      const kind = a.kind === 'text' ? ('text' as const) : ('image' as const);
      return {
        id: a.id,
        name: a.name,
        mime: a.mime,
        kind,
        bytesBase64: await blobToBase64(a.blob),
      };
    }),
  );
  return { ...base, attachments };
}

function wireAttachmentToPersisted(a: unknown): PersistedAttachment | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  const name = typeof o.name === 'string' ? o.name : '';
  const bytesBase64 = typeof o.bytesBase64 === 'string' ? o.bytesBase64 : '';
  if (!id || !bytesBase64) return null;
  try {
    const mime = typeof o.mime === 'string' ? o.mime : undefined;
    const kind = o.kind === 'text' ? ('text' as const) : ('image' as const);
    const blob = base64ToBlob(bytesBase64, mime);
    return {
      id,
      name: name || (kind === 'text' ? 'file.txt' : 'image'),
      mime,
      kind,
      blob,
    };
  } catch {
    return null;
  }
}

function wireMessageToPersisted(m: unknown): PersistedChatMessage | null {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  const role = o.role;
  const content = typeof o.content === 'string' ? o.content : '';
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : '';
  if (!id || (role !== 'user' && role !== 'assistant' && role !== 'system') || !createdAt) return null;

  const base: PersistedChatMessage = {
    id,
    role,
    content,
    createdAt,
  };

  if (role === 'assistant') {
    const stats = parseNanoTurnStats(o.nanoTurnStats);
    if (stats) base.nanoTurnStats = stats;
    if (typeof o.reasoning === 'string' && o.reasoning.trim()) base.reasoning = o.reasoning;
    if (typeof o.assistantDisplayName === 'string' && o.assistantDisplayName.trim()) {
      base.assistantDisplayName = o.assistantDisplayName.trim();
    }
  }

  const attRaw = o.attachments;
  if (!Array.isArray(attRaw) || attRaw.length === 0) return base;
  const attachments: PersistedAttachment[] = [];
  for (const item of attRaw) {
    const p = wireAttachmentToPersisted(item);
    if (p) attachments.push(p);
  }
  if (attachments.length) base.attachments = attachments;
  return base;
}

function wireChatToRecord(w: unknown): ChatThreadRecord | null {
  if (!w || typeof w !== 'object') return null;
  const o = w as Record<string, unknown>;
  const sessionId = typeof o.sessionId === 'string' ? o.sessionId.trim() : '';
  if (!sessionId) return null;
  const sessionRaw = o.session;
  if (!sessionRaw || typeof sessionRaw !== 'object') return null;
  const s = sessionRaw as Record<string, unknown>;
  const sid = typeof s.id === 'string' ? s.id.trim() : sessionId;
  const title = typeof s.title === 'string' ? s.title : 'Chat';
  const createdAt = typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString();
  const updatedAt = typeof s.updatedAt === 'string' ? s.updatedAt : createdAt;
  if (sid !== sessionId) return null;

  const roleRaw = (s as Record<string, unknown>).activeRoleId;
  const activeRoleId =
    typeof roleRaw === 'string' && roleRaw.trim() ? roleRaw.trim() : undefined;
  const session: ChatSession = {
    id: sid,
    title,
    createdAt,
    updatedAt,
    ...(activeRoleId ? { activeRoleId } : {}),
  };
  const messagesRaw = o.messages;
  if (!Array.isArray(messagesRaw)) return null;
  const messages: PersistedChatMessage[] = [];
  for (const item of messagesRaw) {
    const pm = wireMessageToPersisted(item);
    if (pm) messages.push(pm);
  }
  const hasUserMessage = Boolean(o.hasUserMessage);
  return {
    sessionId,
    session,
    messages,
    hasUserMessage: hasUserMessage || messages.some((m) => m.role === 'user'),
  };
}

export async function buildMinervaBackupObject(): Promise<MinervaBackupFileV1> {
  await ensureDbReady();
  const db = await getDb();
  const settings = await loadAppSettingsRow();
  const rows = await db.getAll('chats');
  const chats: BackupWireChat[] = await Promise.all(
    rows.map(async (r) => ({
      sessionId: r.sessionId,
      session: r.session,
      hasUserMessage: Boolean(r.hasUserMessage),
      messages: await Promise.all((r.messages ?? []).map(persistedMessageToWire)),
    })),
  );
  return {
    format: MINERVA_BACKUP_FORMAT,
    payloadVersion: MINERVA_BACKUP_PAYLOAD_VERSION,
    idbSchemaVersion: MINERVA_IDB_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    chats,
  };
}

export async function downloadMinervaBackupFile(): Promise<void> {
  const payload = await buildMinervaBackupObject();
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `minerva-backup-${stamp}.json`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function parseBackupPayload(parsed: unknown): { settings: AppSettingsRow; chats: ChatThreadRecord[] } {
  if (!parsed || typeof parsed !== 'object') {
    throw new BackupRestoreError('settings.backup.error.invalidFile');
  }
  const root = parsed as Record<string, unknown>;
  if (root.format !== MINERVA_BACKUP_FORMAT) {
    throw new BackupRestoreError('settings.backup.error.invalidFile');
  }
  const payloadVersion = root.payloadVersion;
  if (payloadVersion !== MINERVA_BACKUP_PAYLOAD_VERSION) {
    throw new BackupRestoreError('settings.backup.error.unsupportedVersion');
  }
  const idbSchemaVersion = root.idbSchemaVersion;
  if (idbSchemaVersion !== MINERVA_IDB_SCHEMA_VERSION) {
    throw new BackupRestoreError('settings.backup.error.schemaMismatch');
  }
  const settings = normalizeAppSettingsRow(root.settings as AppSettingsRow);
  const chatsRaw = root.chats;
  if (!Array.isArray(chatsRaw)) {
    throw new BackupRestoreError('settings.backup.error.invalidFile');
  }
  const chats: ChatThreadRecord[] = [];
  for (const item of chatsRaw) {
    const rec = wireChatToRecord(item);
    if (rec) chats.push(rec);
  }
  return { settings, chats };
}

export async function importMinervaBackupFromJsonText(text: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new BackupRestoreError('settings.backup.error.invalidJson');
  }
  const { settings, chats } = parseBackupPayload(parsed);
  await replaceAllPersistedState(settings, chats);
}

export async function importMinervaBackupFromFile(file: File): Promise<void> {
  if (!file.size) {
    throw new BackupRestoreError('settings.backup.error.invalidFile');
  }
  if (file.size > MINERVA_BACKUP_MAX_IMPORT_BYTES) {
    throw new BackupRestoreError('settings.backup.error.fileTooLarge');
  }
  const text = await file.text();
  await importMinervaBackupFromJsonText(text);
}
