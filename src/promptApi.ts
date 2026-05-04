/** Text-only session (summaries, title helper, refine, and chats without images). */
export const LM_CORE: Pick<LanguageModelCreateCoreOptions, 'expectedInputs' | 'expectedOutputs'> = {
  expectedInputs: [{ type: 'text', languages: ['en', 'es'] }],
  expectedOutputs: [{ type: 'text', languages: ['en', 'es'] }],
};

import { isOpenAiLanguageModelPolyfillInstalled } from './polyfills/openaiLanguageModel/detect';
import { isOpenAiLmPolyfillConfigComplete, loadOpenAiLmPolyfillConfig } from './polyfills/openaiLanguageModel/storage';

/** Multimodal chat: text + image in user turns (requires the multimodal Chrome flag). */
export const LM_CORE_MULTIMODAL: Pick<
  LanguageModelCreateCoreOptions,
  'expectedInputs' | 'expectedOutputs'
> = {
  expectedInputs: [
    { type: 'text', languages: ['en', 'es'] },
    { type: 'image' },
  ],
  expectedOutputs: [{ type: 'text', languages: ['en', 'es'] }],
};

export function lmCoreForThreadUsesImages(usesImages: boolean): typeof LM_CORE {
  return usesImages ? LM_CORE_MULTIMODAL : LM_CORE;
}

export async function languageModelImageInputSupported(): Promise<boolean> {
  if (!languageModelSupported()) return false;
  if (isOpenAiLanguageModelPolyfillInstalled()) {
    return isOpenAiLmPolyfillConfigComplete(loadOpenAiLmPolyfillConfig());
  }
  try {
    const a = await LanguageModel.availability(LM_CORE_MULTIMODAL);
    return a !== 'unavailable';
  } catch {
    return false;
  }
}

export function languageModelSupported(): boolean {
  try {
    return (
      typeof LanguageModel !== 'undefined' && typeof LanguageModel.availability === 'function'
    );
  } catch {
    return false;
  }
}

/**
 * True for Chromium-based desktop browsers where on-device Prompt API flags may apply
 * (Chrome, Edge, etc.). Not a guarantee the API exists — use with `languageModelSupported()`.
 */
export function isChromiumBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/Firefox\//i.test(ua)) return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  if (brands?.length) {
    return brands.some((b) =>
      /Chromium|Google Chrome|Microsoft Edge|Opera|Brave/i.test(b.brand),
    );
  }
  return /Chrome\/|Chromium\/|Edg\/|CriOS\//i.test(ua);
}

export async function languageModelAvailability(): Promise<Availability> {
  if (!languageModelSupported()) return 'unavailable';
  try {
    return await LanguageModel.availability(LM_CORE);
  } catch {
    return 'unavailable';
  }
}

/** True cuando Chrome puede usar el modelo en el dispositivo (puede faltar descarga). */
export async function languageModelEntryOk(): Promise<boolean> {
  const a = await languageModelAvailability();
  return a !== 'unavailable';
}
