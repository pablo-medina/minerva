import type { AiRole, LocalSettings } from './types';

/** Legacy single-field migration id (stable across imports). */
export const LEGACY_MIGRATED_ROLE_ID = 'migrated-legacy-system-prompt';

export function newAiRoleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `role-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeOne(raw: unknown): AiRole | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  if (!id) return null;
  const name = typeof o.name === 'string' ? o.name : '';
  const description = typeof o.description === 'string' ? o.description : '';
  const chatKeyRaw = typeof o.chatAiModelKey === 'string' ? o.chatAiModelKey.trim() : '';
  const chatAiModelKey = chatKeyRaw || undefined;
  return chatAiModelKey ? { id, name, description, chatAiModelKey } : { id, name, description };
}

export function normalizeAiRolesArray(raw: unknown): AiRole[] {
  if (!Array.isArray(raw)) return [];
  const out: AiRole[] = [];
  for (const item of raw) {
    const r = normalizeOne(item);
    if (r) out.push(r);
  }
  return out;
}

/** Effective system instructions for the session from the selected role (empty = “none”). */
export function resolveRoleSystemPrompt(settings: LocalSettings, activeRoleId?: string | null): string {
  const id = typeof activeRoleId === 'string' ? activeRoleId.trim() : '';
  if (!id) return '';
  const r = settings.aiRoles.find((x) => x.id === id);
  return (r?.description ?? '').trim();
}

type RoleLabelT = (key: string) => string;

export function resolveRoleDisplayLabel(
  settings: LocalSettings,
  activeRoleId: string | undefined | null,
  t: RoleLabelT,
): string {
  const id = typeof activeRoleId === 'string' ? activeRoleId.trim() : '';
  if (!id) return t('roles.none');
  const r = settings.aiRoles.find((x) => x.id === id);
  if (!r) return t('roles.unknown');
  const n = r.name.trim();
  return n || t('roles.unnamed');
}
