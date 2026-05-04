/**
 * Pluggable Prompt API fallback: OpenAI-compatible `/v1/chat/completions` + `/v1/models`.
 * Import `./register` from the app entry so `LanguageModel` exists before UI code runs.
 */
export { registerOpenAiLanguageModelPolyfill } from './register';
export { isOpenAiLanguageModelPolyfillInstalled } from './detect';
export {
  clearOpenAiLmPolyfillConfig,
  loadOpenAiLmPolyfillConfig,
  normalizeOpenAiLmBaseUrl,
  saveOpenAiLmPolyfillConfig,
  isOpenAiLmPolyfillConfigComplete,
} from './storage';
export type { OpenAiLmPolyfillStored } from './storage';
export { OpenAiPolyfillLanguageModel } from './OpenAiPolyfillLanguageModel';
export { OpenAiLmPolyfillSettingsForm } from './OpenAiLmPolyfillSettingsForm';
export { OPEN_AI_LM_URL_PRESETS } from './urlPresets';
export type { OpenAiLmUrlPreset } from './urlPresets';
