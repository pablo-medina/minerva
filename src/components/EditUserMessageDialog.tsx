import { useEffect, useState } from 'react';
import type { ChatAttachment } from '../types';
import { isChatTextAttachment } from '../types';
import { DraggableDialog } from './DraggableDialog';

export type EditUserMessageDialogProps = {
  open: boolean;
  title: string;
  /** Initial plain text (not the attachment-only summary line). */
  initialText: string;
  initialAttachments: ChatAttachment[];
  onClose: () => void;
  onSave: (text: string, attachments: ChatAttachment[]) => void;
  /** When false, Save is disabled (e.g. model busy). */
  canSave: boolean;
  emptyError: string;
  placeholder: string;
  closeAriaLabel: string;
  mobileBackAriaLabel: string;
  saveLabel: string;
  cancelLabel: string;
  attachmentsGroupAria: string;
  removeAttachmentAria: string;
};

export function EditUserMessageDialog({
  open,
  title,
  initialText,
  initialAttachments,
  onClose,
  onSave,
  canSave,
  emptyError,
  placeholder,
  closeAriaLabel,
  mobileBackAriaLabel,
  saveLabel,
  cancelLabel,
  attachmentsGroupAria,
  removeAttachmentAria,
}: EditUserMessageDialogProps) {
  const [text, setText] = useState(initialText);
  const [attachments, setAttachments] = useState<ChatAttachment[]>(initialAttachments);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setAttachments([...initialAttachments]);
    setError(null);
  }, [open, initialText, initialAttachments]);

  const handleSave = () => {
    if (!canSave) return;
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) {
      setError(emptyError);
      return;
    }
    setError(null);
    onSave(trimmed, attachments);
  };

  return (
    <DraggableDialog
      open={open}
      title={title}
      closeAriaLabel={closeAriaLabel}
      mobileBackAriaLabel={mobileBackAriaLabel}
      onClose={onClose}
      width={520}
      variant="solid"
    >
      <div className="edit-user-message-dialog">
        {attachments.length > 0 ? (
          <div className="composer-attachments" aria-label={attachmentsGroupAria}>
            {attachments.map((a) => (
              <div key={a.id} className="attachment-pill">
                {isChatTextAttachment(a) ? (
                  <span className="attachment-pill-text-icon" aria-hidden>
                    TXT
                  </span>
                ) : (
                  <img src={a.dataUrl} alt="" className="attachment-thumb" />
                )}
                <span>{a.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  aria-label={removeAttachmentAria}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <textarea
          className="composer-textarea edit-user-message-textarea"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          disabled={!canSave}
          rows={5}
          spellCheck
        />
        {error ? <p className="edit-user-message-error">{error}</p> : null}
        <div className="edit-user-message-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
            {saveLabel}
          </button>
        </div>
      </div>
    </DraggableDialog>
  );
}
