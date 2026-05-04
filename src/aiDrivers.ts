import type { LocalSettings } from './types';
import { languageModelSupported } from './promptApi';
import { OpenAiLanguageModelDriver } from './drivers/openaiLanguageModel/OpenAiLanguageModelDriver';
import {
  isOpenAiConfigComplete,
  isOpenAiEndpointConfigured,
  type OpenAiDriverStored,
} from './drivers/openaiLanguageModel/storage';

export type AiDriverId = 'nano' | 'openai';

export type AiDriverOption = {
  id: AiDriverId;
  label: string;
  available: boolean;
};

export function listAiDriverOptions(
  settings: LocalSettings,
  labels: { nano: string; openAiDefault: string },
): AiDriverOption[] {
  const nanoAvailable = languageModelSupported();
  const openAiAvailable = isOpenAiEndpointConfigured(settings.openAiConfig ?? null);
  return [
    { id: 'nano', label: labels.nano, available: nanoAvailable },
    {
      id: 'openai',
      label: settings.openAiConfig?.modelId?.trim() || labels.openAiDefault,
      available: openAiAvailable,
    },
  ];
}

export function isDriverUsable(settings: LocalSettings, driverId: AiDriverId | undefined): boolean {
  if (!driverId) return false;
  if (driverId === 'nano') return languageModelSupported();
  return isOpenAiEndpointConfigured(settings.openAiConfig ?? null);
}

export async function createDriverSession(opts: {
  driverId: AiDriverId;
  settings: LocalSettings;
  create: LanguageModelCreateOptions;
}): Promise<LanguageModel> {
  if (opts.driverId === 'nano') {
    return LanguageModel.create(opts.create);
  }
  const cfg = opts.settings.openAiConfig;
  if (!isOpenAiConfigComplete(cfg ?? null)) {
    throw new Error('error.noLm');
  }
  return OpenAiLanguageModelDriver.createWithConfig(cfg as OpenAiDriverStored, opts.create) as unknown as Promise<LanguageModel>;
}

