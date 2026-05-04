import { OpenAiPolyfillLanguageModel } from './OpenAiPolyfillLanguageModel';

/**
 * Installs `globalThis.LanguageModel` when the browser does not provide the Prompt API.
 * Safe to import multiple times; native Chrome `LanguageModel` is never overwritten.
 */
export function registerOpenAiLanguageModelPolyfill(): void {
  if (typeof globalThis === 'undefined') return;
  const g = globalThis as typeof globalThis & { LanguageModel?: unknown };
  if (typeof g.LanguageModel !== 'undefined') return;
  g.LanguageModel = OpenAiPolyfillLanguageModel as unknown as typeof g.LanguageModel;
}

registerOpenAiLanguageModelPolyfill();
