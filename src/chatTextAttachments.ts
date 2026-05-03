import { MAX_CHAT_TEXT_BYTES } from './chatAttachmentConstants';
import { isChatImageAttachment, isChatTextAttachment, type ChatAttachment, type ChatTextAttachment } from './types';

const TEXT_EXT_RE = /\.(txt|csv|tsv|md|markdown|json|log|xml|yaml|yml|toml|ini|env|sql|sh|bat|ps1|py|js|ts|tsx|jsx|c|h|cpp|hpp|java|go|rs|rb|php|html|htm|css|scss|less|vue|svelte)$/i;

const TEXT_MIME_RE =
  /^(text\/(plain|csv|tab-separated-values|html|css|javascript|typescript|markdown|xml|yaml|x-yaml)|application\/(json|xml|x-yaml|yaml|toml|sql|javascript|typescript\+json|ld\+json))$/i;

export function formatTextAttachmentSizeLimitLabel(): string {
  const mb = MAX_CHAT_TEXT_BYTES / (1024 * 1024);
  return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.round(MAX_CHAT_TEXT_BYTES / 1024)} KB`;
}

export function isSupportedTextAttachmentMime(mime: string, fileName: string): boolean {
  const m = mime.trim().toLowerCase();
  if (m && TEXT_MIME_RE.test(m)) return true;
  return TEXT_EXT_RE.test(fileName.trim());
}

function makeAttachmentId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `txt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function fileToTextAttachment(file: File): Promise<ChatTextAttachment> {
  const text = await file.text();
  return {
    kind: 'text',
    id: makeAttachmentId(),
    name: file.name || 'file.txt',
    mime: file.type?.trim() || undefined,
    text,
  };
}

export function countTextAttachments(list: readonly ChatAttachment[]): number {
  return list.filter(isChatTextAttachment).length;
}

export function countImageAttachments(list: readonly ChatAttachment[]): number {
  return list.filter(isChatImageAttachment).length;
}

/** Text files from clipboard paste (same item scan as images; different MIME filter). */
export function collectPastedTextFilesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: File[] = [];
  const pushUnique = (f: File, mimeFromItem?: string) => {
    const mime = (f.type || mimeFromItem || '').trim();
    if (!isSupportedTextAttachmentMime(mime, f.name)) return;
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
