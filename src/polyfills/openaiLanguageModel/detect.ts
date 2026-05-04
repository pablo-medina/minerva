/** True when the global `LanguageModel` is this repo’s OpenAI-compatible polyfill (native Prompt API absent). */
export function isOpenAiLanguageModelPolyfillInstalled(): boolean {
  try {
    const LM = (globalThis as { LanguageModel?: { minervaPolyfillKind?: string } }).LanguageModel;
    return LM?.minervaPolyfillKind === 'openai-compatible';
  } catch {
    return false;
  }
}
