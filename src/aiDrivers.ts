import type { LocalSettings } from './types';
import { languageModelEntryOk } from './promptApi';
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

export async function listAiDriverOptions(
  settings: LocalSettings,
  labels: { nano: string; openAiDefault: string },
): Promise<AiDriverOption[]> {
  const nanoAvailable = await languageModelEntryOk();
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

export async function isDriverUsable(
  settings: LocalSettings,
  driverId: AiDriverId | undefined,
): Promise<boolean> {
  if (!driverId) return false;
  if (driverId === 'nano') return languageModelEntryOk();
  return isOpenAiEndpointConfigured(settings.openAiConfig ?? null);
}

export async function createDriverSession(opts: {
  driverId: AiDriverId;
  settings: LocalSettings;
  create: LanguageModelCreateOptions;
}): Promise<LanguageModel> {
  if (opts.driverId === 'nano') {
    if (!(await languageModelEntryOk())) {
      throw new Error('error.noLm');
    }
    return LanguageModel.create(opts.create);
  }
  const cfg = opts.settings.openAiConfig;
  if (!isOpenAiConfigComplete(cfg ?? null)) {
    throw new Error('error.noLm');
  }
  return OpenAiLanguageModelDriver.createWithConfig(cfg as OpenAiDriverStored, opts.create) as unknown as Promise<LanguageModel>;
}

