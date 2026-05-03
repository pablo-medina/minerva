import { LM_CORE } from './promptApi';
import type { AppLang, ChatMessage } from './types';
import { isChatImageAttachment, isChatTextAttachment } from './types';

const MAX_TRANSCRIPT_MESSAGES = 56;
const MAX_TRANSCRIPT_CHARS = 120_000;

function outputLanguageForSummarizer(lang: AppLang): string {
  return lang === 'en' ? 'en' : 'es';
}

function summaryLanguageHint(lang: AppLang): string {
  switch (lang) {
    case 'es-AR':
      return 'Spanish as used in Argentina (use vos when it fits naturally).';
    case 'es':
      return 'Spanish.';
    default:
      return 'English.';
  }
}

/** Stable fingerprint of the messages that feed the summary (same slice rules as the transcript). */
export function fingerprintForChatSummaryCache(messages: ChatMessage[]): string {
  const slice = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_TRANSCRIPT_MESSAGES);
  let h = 2166136261 >>> 0;
  const step = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
  };
  for (const m of slice) {
    step(m.id);
    step('\n');
    step(m.role);
    step('\n');
    step(m.content);
    step('\n');
    const atts = m.attachments ?? [];
    step(String(atts.length));
    step('\n');
    for (const a of atts) {
      step(a.id);
      step(isChatTextAttachment(a) ? `t:${a.text.length}` : `i:${a.dataUrl?.length ?? 0}`);
      step(';');
    }
    step('\n');
  }
  return `${slice.length}:${h.toString(16)}`;
}

export function buildChatTranscriptForSummary(messages: ChatMessage[]): string {
  const slice = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_TRANSCRIPT_MESSAGES);
  let s = slice
    .map((m) => {
      let line = `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`;
      if (m.role === 'user' && m.attachments?.length) {
        const imgs = m.attachments.filter(isChatImageAttachment).length;
        const txs = m.attachments.filter(isChatTextAttachment).length;
        const bits: string[] = [];
        if (imgs) bits.push(`${imgs} image(s)`);
        if (txs) bits.push(`${txs} text file(s)`);
        if (bits.length) line += ` [${bits.join(', ')}]`;
      }
      return line;
    })
    .join('\n\n');
  if (s.length > MAX_TRANSCRIPT_CHARS) {
    s = s.slice(-MAX_TRANSCRIPT_CHARS);
  }
  return s;
}

async function consumeReadableStringStream(
  stream: ReadableStream<string>,
  signal: AbortSignal,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  try {
    for (;;) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      if (value) onChunk(value);
    }
  } finally {
    reader.releaseLock();
  }
}

function summarizerCoreOptions(lang: AppLang) {
  const outputLanguage = outputLanguageForSummarizer(lang);
  return {
    type: 'key-points' as const,
    format: 'markdown' as const,
    length: 'medium' as const,
    expectedInputLanguages: ['en', 'es'] as string[],
    outputLanguage,
  };
}

async function summarizeWithSummarizerApi(
  transcript: string,
  lang: AppLang,
  signal: AbortSignal,
  onDelta: (partial: string) => void,
): Promise<string | null> {
  if (!('Summarizer' in globalThis)) return null;
  const core = summarizerCoreOptions(lang);
  let availability: Availability;
  try {
    availability = await Summarizer.availability(core);
  } catch {
    return null;
  }
  if (availability === 'unavailable') return null;

  let summarizer: Summarizer | null = null;
  try {
    summarizer = await Summarizer.create({
      ...core,
      signal,
      sharedContext:
        'The input is a transcript of a personal chat between a user and an AI assistant. Produce a useful summary for the user.',
    });
    const stream = summarizer.summarizeStreaming(transcript, {
      signal,
      context: 'Emphasize what the user wanted and what the assistant concluded; skip filler greetings.',
    });
    let acc = '';
    await consumeReadableStringStream(stream, signal, (c) => {
      acc += c;
      onDelta(acc);
    });
    const out = acc.trim();
    return out || null;
  } catch {
    return null;
  } finally {
    try {
      summarizer?.destroy();
    } catch {
      /* ignore */
    }
  }
}

function buildLanguageModelSummaryPrompt(lang: AppLang, transcript: string): string {
  const hint = summaryLanguageHint(lang);
  return `Summarize the chat transcript below for the reader.

Output rules:
- Use Markdown: an optional one-line intro plus a bullet list of 3–12 key points.
- Language: ${hint}
- Stay faithful to the transcript; do not invent facts, names, or numbers that do not appear.

--- Transcript ---
${transcript}
---`;
}

async function summarizeWithLanguageModel(
  transcript: string,
  lang: AppLang,
  signal: AbortSignal,
  onDelta: (partial: string) => void,
): Promise<string | null> {
  let session: LanguageModel | null = null;
  try {
    session = await LanguageModel.create({ ...LM_CORE, signal });
    const prompt = buildLanguageModelSummaryPrompt(lang, transcript);
    const stream = session.promptStreaming(prompt, { signal });
    let acc = '';
    await consumeReadableStringStream(stream, signal, (c) => {
      acc += c;
      onDelta(acc);
    });
    return acc.trim() || null;
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

/**
 * Prefers Chrome's Summarizer API when available; otherwise summarizes via the Prompt API (LanguageModel).
 */
export async function summarizeChatMessages(opts: {
  lang: AppLang;
  messages: ChatMessage[];
  signal: AbortSignal;
  onDelta?: (partial: string) => void;
}): Promise<string | null> {
  const transcript = buildChatTranscriptForSummary(opts.messages);
  if (!transcript.trim()) return null;

  const onDelta = opts.onDelta ?? (() => {});

  const fromBuiltin = await summarizeWithSummarizerApi(transcript, opts.lang, opts.signal, onDelta);
  if (fromBuiltin) return fromBuiltin;

  return summarizeWithLanguageModel(transcript, opts.lang, opts.signal, onDelta);
}
