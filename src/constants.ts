export const LS_LANG = 'minerva.v1.lang';
export const LS_THEME = 'minerva.v1.theme';
export const LS_SESSIONS = 'minerva.v1.sessions';
export const LS_ACTIVE = 'minerva.v1.activeSession';
export const LS_SETTINGS = 'minerva.v1.settings';
export const MSG_PREFIX = 'minerva.v1.msg.';

export function messagesKey(sessionId: string): string {
  return `${MSG_PREFIX}${sessionId}`;
}
