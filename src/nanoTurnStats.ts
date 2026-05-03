import type { ChatMessage, NanoTurnStats } from './types';
import { isChatImageAttachment, isChatTextAttachment } from './types';

function roughTokens(text: string): number {
  return Math.max(0, Math.ceil(text.length / 4));
}

function imageAttachmentOverhead(count: number): number {
  if (count <= 0) return 0;
  // Rough stand-in for multimodal image tokens (not derived from base64 length).
  return count * 320;
}

/**
 * Builds turn metrics for the Prompt API / Gemini Nano path where token usage is unavailable.
 */
export function buildNanoTurnStats(args: {
  modelId: string;
  startedAt: number;
  finishedAt: number;
  firstTokenAt: number | null;
  outputText: string;
  /** History plus the latest user message sent in this request. */
  contextMessages: ChatMessage[];
}): NanoTurnStats {
  const totalLatencyMs = Math.max(0, args.finishedAt - args.startedAt);
  const ttftMs =
    args.firstTokenAt != null ? Math.max(0, args.firstTokenAt - args.startedAt) : undefined;

  let imageCount = 0;
  let textAttachmentChars = 0;
  for (const m of args.contextMessages) {
    for (const a of m.attachments ?? []) {
      if (isChatImageAttachment(a)) imageCount += 1;
      else if (isChatTextAttachment(a)) textAttachmentChars += a.text.length;
    }
  }

  const approxPromptTokenEstimate = Math.max(
    1,
    roughTokens(args.contextMessages.map((m) => m.content).join('\n')) +
      Math.ceil(Math.min(textAttachmentChars, 500_000) / 4) +
      imageAttachmentOverhead(imageCount),
  );

  const approxCompletionTokenEstimate =
    args.outputText.length === 0 ? 0 : Math.max(1, roughTokens(args.outputText));

  const approxTotalTokenEstimate = approxPromptTokenEstimate + approxCompletionTokenEstimate;

  const genStart = args.firstTokenAt ?? args.startedAt;
  const rawGenMs = Math.max(1e-6, args.finishedAt - genStart);
  const hasLateFirstToken =
    args.firstTokenAt != null && rawGenMs < 300 && totalLatencyMs > 900;
  const genMs = hasLateFirstToken ? Math.max(rawGenMs, totalLatencyMs) : rawGenMs;
  const genTps =
    approxCompletionTokenEstimate > 0 ? approxCompletionTokenEstimate / (genMs / 1000) : undefined;

  return {
    modelId: args.modelId,
    totalLatencyMs,
    ttftMs,
    approxPromptTokenEstimate,
    approxCompletionTokenEstimate,
    approxTotalTokenEstimate,
    genTps,
  };
}
