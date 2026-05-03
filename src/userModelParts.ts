import { dataUrlToImageBitmap } from './chatImageAttachments';
import type { ChatAttachment } from './types';
import { isChatImageAttachment, isChatTextAttachment } from './types';

export type UserTurnModelPart =
  | { type: 'text'; value: string }
  | { type: 'image'; value: ImageBitmap };

/**
 * Builds Prompt API user `content` parts: primary message text, then text file bodies,
 * then image bitmaps. Matches the shape used when sending a new user turn.
 */
export async function buildUserTurnModelParts(opts: {
  modelText: string;
  attachments: ChatAttachment[];
  attachmentsOnlyPrompt: string;
}): Promise<UserTurnModelPart[]> {
  const parts: UserTurnModelPart[] = [];
  const textBody = opts.modelText.trim();
  const textual = opts.attachments.filter(isChatTextAttachment);
  const images = opts.attachments.filter(isChatImageAttachment);

  if (textBody) {
    parts.push({ type: 'text', value: opts.modelText });
  } else if (textual.length > 0 || images.length > 0) {
    parts.push({ type: 'text', value: opts.attachmentsOnlyPrompt });
  }

  for (const f of textual) {
    parts.push({
      type: 'text',
      value: `--- attached file: ${f.name} ---\n${f.text}`,
    });
  }

  for (const img of images) {
    parts.push({ type: 'image', value: await dataUrlToImageBitmap(img.dataUrl) });
  }

  if (parts.length === 0) {
    parts.push({ type: 'text', value: textBody || opts.attachmentsOnlyPrompt });
  }

  return parts;
}
