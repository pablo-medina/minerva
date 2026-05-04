/** Text-only session (summaries, title helper, refine, and chats without images). */
export const LM_CORE: Pick<LanguageModelCreateCoreOptions, 'expectedInputs' | 'expectedOutputs'> = {
  expectedInputs: [{ type: 'text', languages: ['en', 'es'] }],
  expectedOutputs: [{ type: 'text', languages: ['en', 'es'] }],
};

/** Multimodal chat: text + image in user turns (Prompt API image input availability varies by Chrome version/channel). */
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

/** True when the Prompt API globals exist (`LanguageModel` + `availability`). Cheap sync probe only. */
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
 * Browsers that may expose Chromium stubs without a usable on-device Gemini Nano session.
 * Uses `navigator.brave.isBrave()` when present; widen if Brave ships working Prompt API.
 */
async function hostAllowsOnDeviceLanguageModel(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } };
    if (typeof nav.brave?.isBrave === 'function' && (await nav.brave.isBrave())) return false;
  } catch {
    /* ignore */
  }
  return true;
}

export async function languageModelImageInputSupported(): Promise<boolean> {
  if (!languageModelSupported()) return false;
  if (!(await hostAllowsOnDeviceLanguageModel())) return false;
  try {
    const a = await LanguageModel.availability(LM_CORE_MULTIMODAL);
    return a !== 'unavailable';
  } catch {
    return false;
  }
}

/**
 * True for Chromium-based desktop browsers where on-device Prompt API flags may apply
 * (Chrome, Edge, etc.). Not a guarantee the API exists — use `languageModelEntryOk()` for gating Nano.
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
  if (!(await hostAllowsOnDeviceLanguageModel())) return 'unavailable';
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
