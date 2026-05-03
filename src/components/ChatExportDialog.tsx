import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Translator } from '../i18n';
import type { AppLang } from '../types';
import type { ChatMessage } from '../types';
import { getExportCapabilities } from '../util/exportCapabilities';
import {
  type ChatExportFormat,
  type ChatExportProgress,
  runChatExport,
} from '../util/chatExport';

import { DraggableDialog } from './DraggableDialog';

type ChatExportDialogProps = {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  sessionTitle: string;
  chatDisplayName: string;
  assistantExportLabel: string;
  lang: AppLang;
  t: Translator;
  onErrorMessage: (message: string) => void;
};

function phaseLabel(phase: ChatExportProgress['phase'], tr: Translator): string {
  switch (phase) {
    case 'collecting':
      return tr('chat.export.phase.collecting');
    case 'building':
      return tr('chat.export.phase.building');
    case 'packaging':
      return tr('chat.export.phase.packaging');
    case 'renderingPdf':
      return tr('chat.export.phase.renderingPdf');
    case 'done':
      return tr('chat.export.phase.done');
    case 'cancelled':
      return tr('chat.export.phase.cancelled');
    case 'error':
      return tr('chat.export.phase.error');
    default:
      return '';
  }
}

export function ChatExportDialog({
  open,
  onClose,
  messages,
  sessionTitle,
  chatDisplayName,
  assistantExportLabel,
  lang,
  t,
  onErrorMessage,
}: ChatExportDialogProps) {
  const caps = useMemo(() => getExportCapabilities(), []);
  const [format, setFormat] = useState<ChatExportFormat>('html');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ChatExportProgress>({ phase: 'idle', percent: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const closeAfterExportTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setProgress({ phase: 'idle', percent: 0 });
      setFormat('html');
      abortRef.current?.abort();
      abortRef.current = null;
      if (closeAfterExportTimerRef.current != null) {
        window.clearTimeout(closeAfterExportTimerRef.current);
        closeAfterExportTimerRef.current = null;
      }
      return;
    }
    if (!caps.pdf) {
      setFormat((prev) => (prev === 'pdf' ? 'html' : prev));
    }
  }, [open, caps.pdf]);

  const cancelExport = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const startExport = useCallback(() => {
    if (!messages.length || busy) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setProgress({ phase: 'collecting', percent: 0 });
    void (async () => {
      try {
        await runChatExport({
          messages,
          sessionTitle: sessionTitle.trim() || 'Minerva',
          format,
          signal: ac.signal,
          t,
          chatDisplayName,
          assistantExportLabel,
          lang,
          onProgress: setProgress,
        });
        closeAfterExportTimerRef.current = window.setTimeout(() => {
          closeAfterExportTimerRef.current = null;
          onClose();
        }, 400);
      } catch (e: unknown) {
        const name = e instanceof Error ? e.name : '';
        const msg = e instanceof Error ? e.message : '';
        if (name === 'AbortError' || msg === 'aborted') {
          setProgress({ phase: 'cancelled', percent: 0 });
        } else if (msg === 'unsupported') {
          onErrorMessage(t('chat.export.unsupported'));
          setProgress({ phase: 'idle', percent: 0 });
        } else if (msg === 'empty') {
          onErrorMessage(t('chat.export.empty'));
          setProgress({ phase: 'idle', percent: 0 });
        } else {
          onErrorMessage(t('chat.export.error'));
          setProgress({ phase: 'error', percent: 0 });
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    })();
  }, [assistantExportLabel, busy, chatDisplayName, format, lang, messages, onClose, onErrorMessage, sessionTitle, t]);

  const showProgress = busy || progress.phase === 'done' || progress.phase === 'cancelled';

  return (
    <DraggableDialog
      open={open}
      title={t('chat.export.title')}
      onClose={() => {
        if (!busy) onClose();
      }}
      dismissible={!busy}
      width={440}
      closeAriaLabel={t('dialog.close')}
      mobileBackAriaLabel={t('dialog.back')}
    >
      <div className="chat-export-dialog">
        <p className="hint chat-export-hint">{t('chat.export.lead')}</p>

        <fieldset
          className="chat-export-formats"
          disabled={busy}
          aria-labelledby="chat-export-format-heading"
        >
          <div id="chat-export-format-heading" className="chat-export-format-heading">
            {t('chat.export.format')}
          </div>
          <div className="chat-export-radio-list">
          <label className="chat-export-radio">
            <input
              type="radio"
              name="export-format"
              checked={format === 'html'}
              onChange={() => setFormat('html')}
            />
            <span>{t('chat.export.formatHtml')}</span>
          </label>
          <label className="chat-export-radio">
            <input
              type="radio"
              name="export-format"
              checked={format === 'markdown'}
              onChange={() => setFormat('markdown')}
            />
            <span>{t('chat.export.formatMarkdown')}</span>
          </label>
          {caps.pdf ? (
            <label className="chat-export-radio">
              <input
                type="radio"
                name="export-format"
                checked={format === 'pdf'}
                onChange={() => setFormat('pdf')}
              />
              <span>{t('chat.export.formatPdf')}</span>
            </label>
          ) : null}
          </div>
        </fieldset>

        {showProgress ? (
          <div className="chat-export-progress" role="status" aria-live="polite">
            <div className="chat-export-progress-label">
              {phaseLabel(progress.phase, t)}
              {busy || progress.phase === 'done' ? (
                <span className="chat-export-progress-pct">{Math.round(progress.percent)}%</span>
              ) : null}
            </div>
            <div className="chat-export-progress-track" aria-hidden>
              <div
                className="chat-export-progress-fill"
                style={{ width: `${Math.min(100, progress.percent)}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="chat-export-actions">
          {busy ? (
            <button type="button" className="btn btn-ghost" onClick={cancelExport}>
              {t('chat.export.cancel')}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={startExport}>
                {t('chat.export.start')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                {t('dialog.close')}
              </button>
            </>
          )}
        </div>
      </div>
    </DraggableDialog>
  );
}
