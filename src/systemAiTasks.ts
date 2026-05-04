import { createDriverSession, isDriverUsable, type AiDriverId } from './aiDrivers';
import { buildChatTitlePrompt, parseChatTitle } from './chatTitleAi';
import {
  buildChatTranscriptForSummary,
  buildLanguageModelSummaryPrompt,
  summarizeChatMessages,
} from './chatSummary';
import { LM_CORE } from './promptApi';
import type { AppLang, ChatMessage, LocalSettings } from './types';

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
  return acc.trim();
}

export async function generateChatTitleWithSystemAi(opts: {
  settings: LocalSettings;
  lang: AppLang;
  messages: ChatMessage[];
  fallback: string;
  signal: AbortSignal;
}): Promise<string | null> {
  const systemAiId = opts.settings.systemAiId;
  if (!systemAiId || !isDriverUsable(opts.settings, systemAiId)) return null;
  if (systemAiId === 'nano') {
    const session = await createDriverSession({
      driverId: 'nano',
      settings: opts.settings,
      create: { ...LM_CORE },
    });
    try {
      const raw = await readTextStream(
        session.promptStreaming(buildChatTitlePrompt(opts.lang, opts.messages), { signal: opts.signal }),
        opts.signal,
      );
      return parseChatTitle(raw, opts.fallback);
    } finally {
      session.destroy();
    }
  }
  const session = await createDriverSession({
    driverId: systemAiId as AiDriverId,
    settings: opts.settings,
    create: { ...LM_CORE },
  });
  try {
    const raw = await readTextStream(
      session.promptStreaming(buildChatTitlePrompt(opts.lang, opts.messages), { signal: opts.signal }),
      opts.signal,
    );
    return parseChatTitle(raw, opts.fallback);
  } catch {
    return null;
  } finally {
    session.destroy();
  }
}

export async function summarizeWithSystemAi(opts: {
  settings: LocalSettings;
  lang: AppLang;
  messages: ChatMessage[];
  signal: AbortSignal;
  onDelta?: (partial: string) => void;
}): Promise<string | null> {
  const systemAiId = opts.settings.systemAiId;
  if (!systemAiId || !isDriverUsable(opts.settings, systemAiId)) return null;
  if (systemAiId === 'nano') {
    return summarizeChatMessages(opts);
  }
  const transcript = buildChatTranscriptForSummary(opts.messages);
  if (!transcript.trim()) return null;
  const prompt = buildLanguageModelSummaryPrompt(opts.lang, transcript);
  const session = await createDriverSession({
    driverId: systemAiId as AiDriverId,
    settings: opts.settings,
    create: { ...LM_CORE },
  });
  try {
    const stream = session.promptStreaming(prompt, { signal: opts.signal });
    let acc = '';
    const reader = stream.getReader();
    try {
      for (;;) {
        if (opts.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        acc += value;
        opts.onDelta?.(acc);
      }
    } finally {
      reader.releaseLock();
    }
    return acc.trim() || null;
  } catch {
    return null;
  } finally {
    session.destroy();
  }
}

