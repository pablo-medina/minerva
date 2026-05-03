/** Shared options for text input/output (en + es), aligned with the Prompt API docs. */
export const LM_CORE: Pick<LanguageModelCreateCoreOptions, 'expectedInputs' | 'expectedOutputs'> = {
  expectedInputs: [{ type: 'text', languages: ['en', 'es'] }],
  expectedOutputs: [{ type: 'text', languages: ['en', 'es'] }],
};

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
