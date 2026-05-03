import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type MessageDialogVariant = 'information' | 'confirmation' | 'warning' | 'error';

export type MessageDialogProps = {
  open: boolean;
  variant: MessageDialogVariant;
  title: string;
  message: ReactNode;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  confirmLabel?: string;
  cancelLabel?: string;
  closeAriaLabel?: string;
  dismissible?: boolean;
};

export function MessageDialog({
  open,
  variant,
  title,
  message,
  onClose,
  onConfirm,
  confirmLabel,
  cancelLabel,
  closeAriaLabel = 'Close',
  dismissible = true,
}: MessageDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  const twoActions = variant !== 'information' && Boolean(onConfirm);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => confirmRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, twoActions, onConfirm]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose, dismissible]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const role = twoActions && onConfirm ? 'alertdialog' : 'dialog';

  return createPortal(
    <>
      <div
        className="message-dialog-backdrop"
        onClick={dismissible ? onClose : undefined}
        aria-hidden
      />
      <div
        className={`message-dialog message-dialog--${variant}`}
        role={role}
        aria-modal="true"
        aria-labelledby="message-dialog-title"
        aria-describedby="message-dialog-desc"
      >
        <h2 id="message-dialog-title" className="message-dialog-title">
          {title}
        </h2>
        <div id="message-dialog-desc" className="message-dialog-message">
          {message}
        </div>
        <div className="message-dialog-actions">
          {twoActions && onConfirm ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                {cancelLabel}
              </button>
              <button
                ref={confirmRef}
                type="button"
                className={`btn btn-primary message-dialog-confirm message-dialog-confirm--${variant}`}
                onClick={() => void Promise.resolve(onConfirm())}
              >
                {confirmLabel}
              </button>
            </>
          ) : (
            <button
              ref={confirmRef}
              type="button"
              className="btn btn-primary"
              onClick={onClose}
              aria-label={closeAriaLabel}
            >
              {confirmLabel ?? closeAriaLabel}
            </button>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
