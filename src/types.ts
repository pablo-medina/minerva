export type ThemeMode = 'dark' | 'light';

export type AppLang = 'en' | 'es' | 'es-AR';

/** Image sent with a user message (data URL in memory; stored as Blob in IndexedDB). */
export type ChatImageAttachment = {
  id: string;
  name: string;
  mime?: string;
  dataUrl: string;
};

/** UTF-8 text file attached to a user message (stored as Blob in IndexedDB). */
export type ChatTextAttachment = {
  kind: 'text';
  id: string;
  name: string;
  mime?: string;
  text: string;
};

export type ChatAttachment = ChatImageAttachment | ChatTextAttachment;

export function isChatTextAttachment(a: ChatAttachment): a is ChatTextAttachment {
  return (a as ChatTextAttachment).kind === 'text';
}

export function isChatImageAttachment(a: ChatAttachment): a is ChatImageAttachment {
  return (a as ChatTextAttachment).kind !== 'text';
}

/** Metrics for one assistant turn (Prompt API does not expose usage; values are estimates). */
export type NanoTurnStats = {
  modelId: string;
  totalLatencyMs: number;
  ttftMs?: number;
  approxPromptTokenEstimate: number;
  approxCompletionTokenEstimate: number;
  approxTotalTokenEstimate: number;
  genTps?: number;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  /** Optional files (images and/or UTF-8 text) for this user turn. */
  attachments?: ChatAttachment[];
  /** Present on assistant messages after a completed on-device generation. */
  nanoTurnStats?: NanoTurnStats;
  /** Optional streamed reasoning text from compatible models. */
  reasoning?: string;
  /**
   * Human-facing heading for assistant bubbles (captures composer label at send time).
   * Older persisted threads omit this field; UI falls back to turn stats model id then a neutral label.
   */
  assistantDisplayName?: string;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Denormalized from IndexedDB for sidebar filtering (synced when messages are saved). */
  hasUserMessage?: boolean;
};

export type LocalSettings = {
  /**
   * Unified selection key for Chat AI:
   * - `nano`
   * - `openai:<model-id>`
   * Undefined = none selected.
   */
  chatAiModelKey?: string;
  /**
   * Unified selection key for System AI:
   * - `nano`
   * - `openai:<model-id>`
   * Undefined = none selected.
   */
  systemAiModelKey?: string;
  /** Selected AI for the main chat. Undefined = none selected. */
  chatAiId?: 'nano' | 'openai';
  /** Selected AI for title/summary/refine helpers. Undefined = disabled. */
  systemAiId?: 'nano' | 'openai';
  /** Shared config for OpenAI-compatible providers. */
  openAiConfig?: {
    baseUrl: string;
    apiKey: string;
    modelId: string;
    temperature: number;
    displayAlias?: string;
    supportsVision?: boolean;
  };
  /** If true, auto-generates external model alias with System AI on model change. */
  autoAliasExternalModel: boolean;
  systemPrompt: string;
  /** How the assistant should address the user (sent with the system prompt when a session starts). */
  preferredName: string;
  /**
   * After the first user message, the chat title is generated with on-device AI.
   * If greater than 0, the title is refreshed every N user messages (1, 1+N, 1+2N, …).
   * If 0, only the first automatic title is generated.
   */
  chatTitleRefreshEveryUserMessages: number;
  /**
   * Maximum size of one UTF-8 text attachment in the composer, in MiB (1024² bytes).
   * Clamped when loaded or saved; bounds live in `chatAttachmentConstants.ts`.
   */
  maxTextAttachmentMib: number;
  /**
   * Maximum size of one image attachment in the composer, in MiB (1024² bytes).
   * Clamped when loaded or saved; bounds live in `chatAttachmentConstants.ts`.
   */
  maxImageAttachmentMib: number;
  /**
   * If greater than 0, aborts the chat request when no streamed output has arrived
   * within this many seconds after the model session is ready (does not include
   * model download / `LanguageModel.create()` time). Set to 0 to disable.
   */
  streamFirstChunkTimeoutSec: number;
};
