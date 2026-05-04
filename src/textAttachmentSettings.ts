import {
  DEFAULT_MAX_TEXT_ATTACHMENT_MIB,
  MAX_MAX_TEXT_ATTACHMENT_MIB,
  MIN_MAX_TEXT_ATTACHMENT_MIB,
} from './chatAttachmentConstants';
import type { LocalSettings } from './types';

const MIB_DECIMALS = 3;

function roundMib(n: number): number {
  const f = 10 ** MIB_DECIMALS;
  return Math.round(n * f) / f;
}

export function clampMaxTextAttachmentMib(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return DEFAULT_MAX_TEXT_ATTACHMENT_MIB;
  }
  const v = roundMib(n);
  return Math.min(MAX_MAX_TEXT_ATTACHMENT_MIB, Math.max(MIN_MAX_TEXT_ATTACHMENT_MIB, v));
}

/** Reads MiB from stored settings, migrating legacy `maxTextAttachmentKib` when present. */
export function normalizeMaxTextAttachmentMibFromStored(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return DEFAULT_MAX_TEXT_ATTACHMENT_MIB;
  const o = raw as Record<string, unknown>;
  const mib = o.maxTextAttachmentMib;
  if (typeof mib === 'number' && Number.isFinite(mib)) return clampMaxTextAttachmentMib(mib);
  const kib = o.maxTextAttachmentKib;
  if (typeof kib === 'number' && Number.isFinite(kib)) return clampMaxTextAttachmentMib(kib / 1024);
  return DEFAULT_MAX_TEXT_ATTACHMENT_MIB;
}

export function maxTextAttachmentBytesFromSettings(settings: LocalSettings): number {
  const mib = clampMaxTextAttachmentMib(settings.maxTextAttachmentMib);
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(mib * 1024 * 1024));
}

/** Human-readable limit for error messages (binary MiB / KiB, same base as `navigator.storage.estimate`). */
export function formatTextAttachmentSizeLimitLabel(maxBytes: number): string {
  const mib = maxBytes / (1024 * 1024);
  if (mib >= 1) {
    const rounded = Math.round(mib * 1000) / 1000;
    const isWhole = Math.abs(rounded - Math.round(rounded)) < 1e-6;
    return isWhole ? `${Math.round(mib)} MiB` : `${rounded} MiB`;
  }
  return `${Math.round(maxBytes / 1024)} KiB`;
}

/** String for the MiB text field (no trailing noise beyond 3 decimals). */
export function formatMibForField(mib: number): string {
  return String(roundMib(clampMaxTextAttachmentMib(mib)));
}

/** Parses user text (`.` or `,` decimal). Returns null if not a finite number. */
export function parseMibFromUserText(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '' || t === '.' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
