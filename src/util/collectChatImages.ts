import type { ChatImageAttachment, ChatMessage } from '../types';
import { isChatImageAttachment } from '../types';
import { estimateDataUrlBytes } from '../chatExportHelpers';

export type ViewerImage = ChatImageAttachment & { approxBytes: number };

export function collectChatImagesInOrder(messages: ChatMessage[]): ViewerImage[] {
  const out: ViewerImage[] = [];
  for (const m of messages) {
    if (m.role !== 'user' || !m.attachments?.length) continue;
    for (const a of m.attachments) {
      if (!isChatImageAttachment(a)) continue;
      out.push({ ...a, approxBytes: estimateDataUrlBytes(a.dataUrl) });
    }
  }
  return out;
}

export function indexOfAttachmentInChat(all: ViewerImage[], att: ChatImageAttachment): number {
  const i = all.findIndex((x) => x.id === att.id && x.dataUrl === att.dataUrl);
  return i >= 0 ? i : 0;
}
