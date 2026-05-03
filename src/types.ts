export type ThemeMode = 'dark' | 'light';

export type AppLang = 'en' | 'es' | 'es-AR';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalSettings = {
  systemPrompt: string;
  /** Cómo querés que el asistente te llame (se envía al modelo junto al prompt del sistema). */
  preferredName: string;
  /**
   * Tras el primer mensaje del usuario, el título se genera con la IA.
   * Si es mayor que 0, se vuelve a generar cada esta cantidad de mensajes del usuario (1, 1+N, 1+2N…).
   * Si es 0, solo el primer título automático.
   */
  chatTitleRefreshEveryUserMessages: number;
};
