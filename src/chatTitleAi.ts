import { LM_CORE } from './promptApi';
import type { AppLang, ChatMessage } from './types';
import { AUTO_TITLE_MAX_LEN } from './title';

const TITLE_TRANSCRIPT_MAX_MESSAGES = 28;

function languageHintForTitle(lang: AppLang): string {
  switch (lang) {
    case 'es-AR':
      return 'Spanish as used in Argentina (use vos when it fits naturally).';
    case 'es':
      return 'Spanish.';
    default:
      return 'English.';
  }
}

export function buildChatTitlePrompt(lang: AppLang, messages: ChatMessage[]): string {
  const langHint = languageHintForTitle(lang);
  const slice = messages.slice(-TITLE_TRANSCRIPT_MAX_MESSAGES);
  const transcript = slice
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      let line = `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`;
      if (m.role === 'user' && m.attachments?.length) {
        line += ` [${m.attachments.length} image(s)]`;
      }
      return line;
    })
    .join('\n');

  return `You name chat threads for a sidebar list. Read the conversation and output ONE short title (max ${AUTO_TITLE_MAX_LEN} characters).

Rules:
- Output ONLY the title text: no quotes, no markdown, no labels like "Title:".
- Language: ${langHint}
- Describe the current main topic; be specific when you can.
- Do not invent private details that are not implied by the chat.

--- Conversation (most recent last) ---
${transcript || '(empty)'}
---
Now output only the title:`;
}

export function parseChatTitle(raw: string, fallback: string): string {
  let s = raw.trim();
  s = s.replace(/^["'`]+|["'`]+$/g, '');
  s = s.replace(/^Title:\s*/i, '');
  const nl = s.indexOf('\n');
  if (nl >= 0) s = s.slice(0, nl);
  s = s.trim().replace(/\s+/g, ' ');
  if (!s) return fallback;
  if (s.length > AUTO_TITLE_MAX_LEN) {
    return `${s.slice(0, AUTO_TITLE_MAX_LEN - 1)}…`;
  }
  return s;
}

/** After the first user message (count 1), then every `interval` additional user messages when interval > 0 (e.g. interval 10 → counts 1, 11, 21…). */
export function shouldRefreshChatTitle(userMessageCount: number, interval: number): boolean {
  if (userMessageCount < 1) return false;
  if (userMessageCount === 1) return true;
  if (interval <= 0) return false;
  return (userMessageCount - 1) % interval === 0;
}

async function readTextStream(stream: ReadableStream<string>, signal: AbortSignal): Promise<string> {
  let acc = '';
  const reader = stream.getReader();
  try {
    for (;;) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      if (value) acc += value;
    }
  } finally {
    reader.releaseLock();
  }
  return acc;
}

/**
 * Runs a short-lived on-device session so it does not race with the main chat LanguageModel.
 */
export async function generateChatTitleWithOnDeviceModel(opts: {
  lang: AppLang;
  messages: ChatMessage[];
  fallback: string;
  signal: AbortSignal;
}): Promise<string | null> {
  let session: LanguageModel | null = null;
  try {
    session = await LanguageModel.create({ ...LM_CORE });
    const prompt = buildChatTitlePrompt(opts.lang, opts.messages);
    const stream = session.promptStreaming(prompt, { signal: opts.signal });
    const raw = await readTextStream(stream, opts.signal);
    return parseChatTitle(raw, opts.fallback);
  } catch {
    return null;
  } finally {
    try {
      session?.destroy();
    } catch {
      /* ignore */
    }
  }
}
