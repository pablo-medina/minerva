import { MAX_CHAT_IMAGE_BYTES } from './chatAttachmentConstants';
import type { ChatMessage, ChatImageAttachment } from './types';

export function formatImageSizeLimitLabel(): string {
  return formatBytes(MAX_CHAT_IMAGE_BYTES);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = n / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${Math.round(mb * 10) / 10} MB`;
}

const IMAGE_MIME_RE = /^image\/(png|jpeg|jpe|jpg|webp|gif)$/i;

export function isSupportedChatImageMime(mime: string): boolean {
  return IMAGE_MIME_RE.test(mime.trim());
}

export function threadUsesImageInputs(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === 'user' && (m.attachments?.length ?? 0) > 0);
}

export async function fileToImageAttachment(file: File): Promise<ChatImageAttachment> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string') resolve(r);
      else reject(new Error('read'));
    };
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
  return {
    id: makeAttachmentId(),
    name: file.name || 'image',
    mime: file.type || undefined,
    dataUrl,
  };
}

function makeAttachmentId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function dataUrlToImageBitmap(dataUrl: string): Promise<ImageBitmap> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

export function closeImageBitmaps(parts: readonly { type: string; value: unknown }[]): void {
  for (const p of parts) {
    if (p.type !== 'image') continue;
    const v = p.value;
    if (v instanceof ImageBitmap) {
      try {
        v.close();
      } catch {
        /* ignore */
      }
    }
  }
}
