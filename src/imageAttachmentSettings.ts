import {
  DEFAULT_MAX_IMAGE_ATTACHMENT_MIB,
  MAX_MAX_IMAGE_ATTACHMENT_MIB,
  MIN_MAX_IMAGE_ATTACHMENT_MIB,
} from './chatAttachmentConstants';
import type { LocalSettings } from './types';

const MIB_DECIMALS = 3;

function roundMib(n: number): number {
  const f = 10 ** MIB_DECIMALS;
  return Math.round(n * f) / f;
}

export function clampMaxImageAttachmentMib(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return DEFAULT_MAX_IMAGE_ATTACHMENT_MIB;
  }
  const v = roundMib(n);
  return Math.min(MAX_MAX_IMAGE_ATTACHMENT_MIB, Math.max(MIN_MAX_IMAGE_ATTACHMENT_MIB, v));
}

export function normalizeMaxImageAttachmentMibFromStored(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return DEFAULT_MAX_IMAGE_ATTACHMENT_MIB;
  const o = raw as Record<string, unknown>;
  const mib = o.maxImageAttachmentMib;
  if (typeof mib === 'number' && Number.isFinite(mib)) return clampMaxImageAttachmentMib(mib);
  return DEFAULT_MAX_IMAGE_ATTACHMENT_MIB;
}

export function maxImageAttachmentBytesFromSettings(settings: LocalSettings): number {
  const mib = clampMaxImageAttachmentMib(settings.maxImageAttachmentMib);
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(mib * 1024 * 1024));
}

/** String for the MiB text field (same precision as text attachments). */
export function formatImageMibForField(mib: number): string {
  return String(roundMib(clampMaxImageAttachmentMib(mib)));
}
