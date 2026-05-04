export type OpenAiUrlPreset = {
  id: string;
  labelKey: string;
  baseUrl: string;
};

export const OPEN_AI_URL_PRESETS: readonly OpenAiUrlPreset[] = [
  { id: 'openai', labelKey: 'settings.remoteLm.preset.openai', baseUrl: 'https://api.openai.com/v1' },
  { id: 'pm-bridge', labelKey: 'settings.remoteLm.preset.pmBridge', baseUrl: 'http://localhost:54821/api/v1' },
  { id: 'ollama', labelKey: 'settings.remoteLm.preset.ollama', baseUrl: 'http://localhost:11434/v1' },
  { id: 'lm-studio', labelKey: 'settings.remoteLm.preset.lmStudio', baseUrl: 'http://localhost:1234/v1' },
  { id: 'openrouter', labelKey: 'settings.remoteLm.preset.openrouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'groq', labelKey: 'settings.remoteLm.preset.groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'together', labelKey: 'settings.remoteLm.preset.together', baseUrl: 'https://api.together.xyz/v1' },
];

