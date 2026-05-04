type OpenAiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type OpenAiChatRow =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | OpenAiContentPart[] }
  | { role: 'assistant'; content: string };

async function imageBitmapToPngDataUrl(bitmap: ImageBitmap): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.drawImage(bitmap, 0, 0);
  try {
    return canvas.toDataURL('image/png');
  } finally {
    try {
      bitmap.close();
    } catch {
      /* ignore */
    }
  }
}

async function languageModelContentToOpenAi(
  content: string | LanguageModelMessageContent[],
  signal: AbortSignal,
): Promise<string | OpenAiContentPart[]> {
  if (typeof content === 'string') return content;
  const parts: OpenAiContentPart[] = [];
  for (const p of content) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (p.type === 'text') {
      const text = typeof p.value === 'string' ? p.value : '';
      if (text) parts.push({ type: 'text', text });
      continue;
    }
    if (p.type === 'image' && p.value instanceof ImageBitmap) {
      const url = await imageBitmapToPngDataUrl(p.value);
      parts.push({ type: 'image_url', image_url: { url } });
    }
  }
  if (parts.length === 0) return '';
  if (parts.length === 1 && parts[0]!.type === 'text') return parts[0]!.text;
  return parts;
}

export async function convertInitialPromptsToOpenAi(
  initial: LanguageModelCreateOptions['initialPrompts'] | undefined,
  signal: AbortSignal,
): Promise<OpenAiChatRow[]> {
  if (!initial?.length) return [];
  const out: OpenAiChatRow[] = [];
  for (const m of initial) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (m.role === 'system') {
      const c = await languageModelContentToOpenAi(m.content, signal);
      if (typeof c === 'string' && c.trim()) out.push({ role: 'system', content: c });
      continue;
    }
    if (m.role === 'assistant') {
      const c = await languageModelContentToOpenAi(m.content, signal);
      out.push({ role: 'assistant', content: typeof c === 'string' ? c : '' });
      continue;
    }
    out.push({ role: 'user', content: await languageModelContentToOpenAi(m.content, signal) });
  }
  return out;
}

export async function convertPromptInputToOpenAiUserRows(
  input: LanguageModelPrompt,
  signal: AbortSignal,
): Promise<OpenAiChatRow[]> {
  if (typeof input === 'string') return input.trim() ? [{ role: 'user', content: input }] : [];
  const rows: OpenAiChatRow[] = [];
  for (const m of input) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (m.role === 'user') {
      rows.push({ role: 'user', content: await languageModelContentToOpenAi(m.content, signal) });
      continue;
    }
    if (m.role === 'assistant') {
      const c = await languageModelContentToOpenAi(m.content, signal);
      rows.push({ role: 'assistant', content: typeof c === 'string' ? c : '' });
    }
  }
  return rows;
}

