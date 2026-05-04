import type { Translator } from './i18n';
import type { ChatAttachment, ChatMessage } from './types';

/** Display line used when a user message has attachments but no typed text. */
export function userAttachmentsOnlyDisplayLine(attachments: ChatAttachment[], t: Translator): string {
  return t('chat.internal.userAttachmentsLine')
    .replace('{n}', String(attachments.length))
    .replace('{names}', attachments.map((p) => p.name).join(', '));
}

/** Plain text the user can edit (empty when the bubble only showed the attachment summary line). */
export function userMessageEditableText(m: ChatMessage, t: Translator): string {
  const atts = m.attachments ?? [];
  if (atts.length > 0 && m.content === userAttachmentsOnlyDisplayLine(atts, t)) return '';
  return m.content;
}

/** Stored `content` for a user message (same rules as the composer when sending). */
export function buildUserMessageDisplayContent(
  text: string,
  attachments: ChatAttachment[],
  t: Translator,
): string {
  const trimmed = text.trim();
  if (trimmed.length > 0) return trimmed;
  if (attachments.length > 0) return userAttachmentsOnlyDisplayLine(attachments, t);
  return '';
}

/** Text sent to the model (trimmed user typing, or the internal “attachments only” body). */
export function modelPromptTextFromUserMessage(m: ChatMessage, t: Translator): string {
  const raw = userMessageEditableText(m, t).trim();
  if (raw.length > 0) return raw;
  return t('chat.internal.attachmentsOnlyBody');
}
