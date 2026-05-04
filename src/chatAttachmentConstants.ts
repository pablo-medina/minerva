/** Limits for image attachments in the on-device chat (aligned with typical Prompt API constraints). */
export const MAX_CHAT_IMAGE_ATTACHMENTS = 5;

/** Per-image size in MiB (1024² bytes). User setting is clamped to this inclusive range. */
export const MIN_MAX_IMAGE_ATTACHMENT_MIB = 0.5;
export const MAX_MAX_IMAGE_ATTACHMENT_MIB = 50;
export const DEFAULT_MAX_IMAGE_ATTACHMENT_MIB = 4;

/** Bytes at the default image MiB cap (for static fallbacks where settings are unavailable). */
export const DEFAULT_MAX_IMAGE_ATTACHMENT_BYTES = Math.round(
  DEFAULT_MAX_IMAGE_ATTACHMENT_MIB * 1024 * 1024,
);

/** Text files (UTF-8) attached to a user message; stored in IndexedDB as Blobs. */
export const MAX_CHAT_TEXT_ATTACHMENTS = 5;

/** Per-file text attachment size in MiB (1024² bytes). User setting is clamped to this inclusive range. */
export const MIN_MAX_TEXT_ATTACHMENT_MIB = 0.25;
export const MAX_MAX_TEXT_ATTACHMENT_MIB = 200;
export const DEFAULT_MAX_TEXT_ATTACHMENT_MIB = 5;

/** Max combined image + text attachments per user message. */
export const MAX_CHAT_ATTACHMENTS_TOTAL = 8;

/** `accept` attribute for the composer file input (images + UTF-8 text files). */
export const COMPOSER_FILE_INPUT_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/csv',
  'text/tab-separated-values',
  'text/markdown',
  'text/html',
  'text/css',
  'text/javascript',
  'text/xml',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/x-yaml',
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.json',
  '.log',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.sql',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.cs',
  '.php',
  '.rb',
  '.sh',
  '.ps1',
  '.env',
].join(',');
