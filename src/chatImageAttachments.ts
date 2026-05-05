import type { ChatImageAttachment, ChatMessage } from './types';
import { isChatImageAttachment } from './types';

export function formatImageSizeLimitLabel(maxBytes: number): string {
  return formatBytes(maxBytes);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KiB`;
  const mib = n / (1024 * 1024);
  return mib >= 10 ? `${Math.round(mib)} MiB` : `${Math.round(mib * 10) / 10} MiB`;
}

const IMAGE_MIME_RE = /^image\/(png|jpeg|jpe|jpg|webp|gif)$/i;
const MAX_IMAGE_DIMENSION_PX = 1280;
const PREFERRED_REENCODE_QUALITY = 0.82;

export function isSupportedChatImageMime(mime: string): boolean {
  return IMAGE_MIME_RE.test(mime.trim());
}

/** Image files from paste `clipboardData` (screenshots, copied image files). */
export function collectPastedImageFilesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: File[] = [];
  const pushUnique = (f: File, mimeFromItem?: string) => {
    const mime = (f.type || mimeFromItem || '').trim();
    if (!mime || !isSupportedChatImageMime(mime)) return;
    const key = `${f.name}\0${f.size}\0${mime}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };

  const { items } = data;
  if (items?.length) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (!file) continue;
      pushUnique(file, item.type || undefined);
    }
  }

  if (out.length === 0 && data.files?.length) {
    for (const f of Array.from(data.files)) {
      pushUnique(f);
    }
  }

  return out;
}

export function threadUsesImageInputs(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) => m.role === 'user' && (m.attachments?.some(isChatImageAttachment) ?? false),
  );
}

export async function fileToImageAttachment(file: File): Promise<ChatImageAttachment> {
  const normalizedMime = (file.type || '').trim().toLowerCase();
  const optimized = normalizedMime === 'image/gif' ? null : await optimizeImageFileForAttachment(file);
  const dataUrl = optimized ? optimized.dataUrl : await readFileAsDataUrl(file);
  return {
    id: makeAttachmentId(),
    name: file.name || 'image',
    mime: optimized?.mime || file.type || undefined,
    dataUrl,
  };
}

async function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
        return;
      }
      reject(new Error('read'));
    };
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

async function optimizeImageFileForAttachment(
  file: File,
): Promise<{ dataUrl: string; mime: string } | null> {
  const decoded = await decodeImageFile(file);
  if (!decoded) return null;
  const { width, height, image } = decoded;
  const scale = Math.min(1, MAX_IMAGE_DIMENSION_PX / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  const candidates: Array<{ mime: string; quality?: number }> = [
    { mime: 'image/webp', quality: PREFERRED_REENCODE_QUALITY },
    { mime: 'image/jpeg', quality: PREFERRED_REENCODE_QUALITY },
  ];
  let bestBlob: Blob | null = null;
  let bestMime = '';
  for (const candidate of candidates) {
    const blob = await canvasToBlob(canvas, candidate.mime, candidate.quality);
    if (!blob || !blob.size) continue;
    if (!bestBlob || blob.size < bestBlob.size) {
      bestBlob = blob;
      bestMime = candidate.mime;
    }
  }
  if (!bestBlob || !bestMime) return null;
  const resized = targetWidth !== width || targetHeight !== height;
  const isWorthKeeping = resized || bestBlob.size <= file.size * 0.95;
  if (!isWorthKeeping) return null;
  const dataUrl = await readFileAsDataUrl(bestBlob);
  return { dataUrl, mime: bestMime };
}

async function decodeImageFile(
  file: File,
): Promise<{ width: number; height: number; image: CanvasImageSource } | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('decode'));
      element.src = url;
    });
    if (!img.naturalWidth || !img.naturalHeight) return null;
    return { width: img.naturalWidth, height: img.naturalHeight, image: img };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
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
