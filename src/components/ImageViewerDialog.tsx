import { useCallback, useEffect, useState } from 'react';

import { formatBytes } from '../chatExportHelpers';
import type { Translator } from '../i18n';
import type { ViewerImage } from '../util/collectChatImages';

import { DraggableDialog } from './DraggableDialog';

type Props = {
  open: boolean;
  onClose: () => void;
  images: ViewerImage[];
  initialIndex: number;
  t: Translator;
};

export function ImageViewerDialog({ open, onClose, images, initialIndex, t }: Props) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!open) return;
    const safe = Math.max(0, Math.min(initialIndex, Math.max(0, images.length - 1)));
    setIndex(safe);
    setZoom(1);
  }, [open, initialIndex, images.length]);

  const current = images[index];

  const goPrev = useCallback(() => {
    setIndex((i) => (images.length ? (i - 1 + images.length) % images.length : 0));
    setZoom(1);
  }, [images.length]);

  const goNext = useCallback(() => {
    setIndex((i) => (images.length ? (i + 1) % images.length : 0));
    setZoom(1);
  }, [images.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)));
      if (e.key === '-' || e.key === '_') setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)));
      if (e.key === '0') setZoom(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, goPrev, goNext]);

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setZoom((prev) => {
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      return Math.max(0.5, Math.min(3, +(prev + delta).toFixed(2)));
    });
  };

  if (!current) return null;

  const title = `${t('chat.imageViewer.title')} · ${index + 1}/${images.length}`;

  return (
    <DraggableDialog
      open={open}
      title={title}
      onClose={onClose}
      width={Math.min(920, typeof window !== 'undefined' ? window.innerWidth - 24 : 920)}
      variant="solid"
      closeAriaLabel={t('dialog.close')}
      mobileBackAriaLabel={t('dialog.back')}
    >
      <div className="image-viewer">
        <div className="image-viewer-overlay-top">
          <div className="image-viewer-overlay-actions image-viewer-overlay-actions-top">
            <span className="image-viewer-counter">
              {images.length > 1 ? `${index + 1}/${images.length}` : ''}
            </span>
            <button
              type="button"
              className="image-viewer-btn image-viewer-btn-round image-viewer-btn-close image-viewer-overlay-close"
              onClick={onClose}
              title={t('dialog.close')}
              aria-label={t('dialog.close')}
            >
              <svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true">
                <path
                  d="M1 1l10 10M11 1L1 11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.65"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <div
          className={`image-viewer-canvas${zoom > 1 ? ' image-viewer-canvas-pannable' : ''}`}
          onWheel={onWheel}
        >
          <img
            src={current.dataUrl}
            alt={current.name}
            className="image-viewer-img"
            style={{ transform: `scale(${zoom})` }}
            onDragStart={(e) => e.preventDefault()}
          />
        </div>
        <div className="image-viewer-overlay-bottom">
          <div className="image-viewer-overlay-actions image-viewer-overlay-actions-bottom">
            <button
              type="button"
              className="image-viewer-btn image-viewer-btn-round"
              onClick={goPrev}
              disabled={images.length < 2}
              title={t('chat.imageViewer.prev')}
              aria-label={t('chat.imageViewer.prev')}
            >
              <span aria-hidden>←</span>
            </button>
            <button
              type="button"
              className="image-viewer-btn image-viewer-btn-round"
              onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
              title={t('chat.imageViewer.zoomOut')}
              aria-label={t('chat.imageViewer.zoomOut')}
            >
              <span aria-hidden>−</span>
            </button>
            <button
              type="button"
              className="image-viewer-btn image-viewer-btn-round image-viewer-btn-fit"
              onClick={() => setZoom(1)}
              title={t('chat.imageViewer.fit')}
              aria-label={t('chat.imageViewer.fit')}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="image-viewer-btn image-viewer-btn-round"
              onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
              title={t('chat.imageViewer.zoomIn')}
              aria-label={t('chat.imageViewer.zoomIn')}
            >
              <span aria-hidden>+</span>
            </button>
            <button
              type="button"
              className="image-viewer-btn image-viewer-btn-round"
              onClick={goNext}
              disabled={images.length < 2}
              title={t('chat.imageViewer.next')}
              aria-label={t('chat.imageViewer.next')}
            >
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>
        <div className="image-viewer-meta">
          <strong title={current.name}>{current.name}</strong>
          <small>
            {(current.mime || '').trim() || t('chat.imageViewer.mimeUnknown')} ·{' '}
            {formatBytes(current.approxBytes)}
          </small>
          <small>{t('chat.imageViewer.shortcuts')}</small>
        </div>
      </div>
    </DraggableDialog>
  );
}
