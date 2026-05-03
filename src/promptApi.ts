/** Text-only session (summaries, title helper, refine, and chats without images). */
export const LM_CORE: Pick<LanguageModelCreateCoreOptions, 'expectedInputs' | 'expectedOutputs'> = {
  expectedInputs: [{ type: 'text', languages: ['en', 'es'] }],
  expectedOutputs: [{ type: 'text', languages: ['en', 'es'] }],
};

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
