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
  systemPrompt: string;
  /** How the assistant should address the user (sent with the system prompt when a session starts). */
  preferredName: string;
  /**
   * After the first user message, the chat title is generated with on-device AI.
   * If greater than 0, the title is refreshed every N user messages (1, 1+N, 1+2N, …).
   * If 0, only the first automatic title is generated.
   */
  chatTitleRefreshEveryUserMessages: number;
};
