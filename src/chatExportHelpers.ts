import type { ChatMessage } from './types';
import type { Translator } from './i18n';

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Approximate decoded byte length of a data URL payload (base64). */
export function estimateDataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf('base64,');
  if (i === -1) return Math.ceil(dataUrl.length / 2);
  const b64 = dataUrl.slice(i + 7);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function bubbleRoleLabel(
  m: ChatMessage,
  preferredName: string,
  assistantModelLabel: string,
  tr: Translator,
): string {
  if (m.role === 'user') {
    const custom = preferredName.trim();
    return custom.length > 0 ? custom : tr('chat.message.roleUser');
  }
  if (m.role === 'assistant') {
    const mid = (m.nanoTurnStats?.modelId ?? '').trim();
    return mid.length > 0 ? mid : assistantModelLabel;
  }
  return m.role;
}
