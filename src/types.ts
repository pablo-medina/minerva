export type ThemeMode = 'dark' | 'light';

export type AppLang = 'en' | 'es' | 'es-AR';

/** Persisted image sent with a user message (data URL for storage and UI). */
export type ChatImageAttachment = {
  id: string;
  name: string;
  mime?: string;
  dataUrl: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  /** Optional images included in this user turn (on-device multimodal Prompt API). */
  attachments?: ChatImageAttachment[];
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
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
