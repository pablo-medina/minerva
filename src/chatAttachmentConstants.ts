/** Limits for image attachments in the on-device chat (aligned with typical Prompt API constraints). */
export const MAX_CHAT_IMAGE_ATTACHMENTS = 5;
export const MAX_CHAT_IMAGE_BYTES = 4 * 1024 * 1024;

/** Text files (UTF-8) attached to a user message; stored in IndexedDB as Blobs. */
export const MAX_CHAT_TEXT_ATTACHMENTS = 5;
export const MAX_CHAT_TEXT_BYTES = 512 * 1024;

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
