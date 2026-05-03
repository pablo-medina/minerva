import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Point = { x: number; y: number };

type DraggableDialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  dismissible?: boolean;
  variant?: 'default' | 'solid';
  closeAriaLabel?: string;
  mobileBackAriaLabel?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const VIEWPORT_MARGIN = 16;

function MobileBackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 18l-6-6 6-6"
      />
    </svg>
  );
}

export function DraggableDialog({
  open,
  title,
  onClose,
  children,
  width = 420,
  dismissible = true,
  variant = 'default',
  closeAriaLabel = 'Close',
  mobileBackAriaLabel,
}: DraggableDialogProps) {
  const [position, setPosition] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dialogHeight, setDialogHeight] = useState(420);
  const [isMobile, setIsMobile] = useState(false);
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const dialogRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const mobileBackLabel = mobileBackAriaLabel ?? closeAriaLabel;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px)');
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  const constrainedPosition = useMemo(() => {
    if (!position) return null;
    const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
    const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - dialogHeight - VIEWPORT_MARGIN);
    return {
      x: clamp(position.x, VIEWPORT_MARGIN, maxX),
      y: clamp(position.y, VIEWPORT_MARGIN, maxY),
    };
  }, [position, width, dialogHeight]);

  const fallbackPosition = useMemo<Point>(() => {
    const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
    const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - dialogHeight - VIEWPORT_MARGIN);
    return {
      x: clamp(Math.round((window.innerWidth - width) / 2), VIEWPORT_MARGIN, maxX),
      y: clamp(Math.round((window.innerHeight - dialogHeight) / 2), VIEWPORT_MARGIN, maxY),
    };
  }, [width, dialogHeight]);

  useLayoutEffect(() => {
    if (!open || !dialogRef.current || isMobile) return;
    const el = dialogRef.current;
    const clampPosition = (point: Point, height: number): Point => {
      const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
      const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
      return {
        x: clamp(point.x, VIEWPORT_MARGIN, maxX),
        y: clamp(point.y, VIEWPORT_MARGIN, maxY),
      };
    };
    const centeredPosition = (height: number): Point => {
      const y = Math.round((window.innerHeight - height) / 2);
      const x = Math.round((window.innerWidth - width) / 2);
      return clampPosition({ x, y }, height);
    };
    const measure = () => {
      const measuredHeight = Math.ceil(el.getBoundingClientRect().height);
      const nextHeight = Math.max(
        160,
        Math.min(measuredHeight, window.innerHeight - VIEWPORT_MARGIN * 2),
      );
      setDialogHeight(nextHeight);
      setPosition((prev) => {
        if (!prev) return centeredPosition(nextHeight);
        return clampPosition(prev, nextHeight);
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [open, width, isMobile]);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    if (justOpened) {
      setPosition(null);
    }
    if (!open) {
      setDragging(false);
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose, dismissible]);

  useEffect(() => {
    if (!open || !dragging) return;

    const onMove = (e: PointerEvent) => {
      setPosition({
        x: e.clientX - dragOffsetRef.current.x,
        y: e.clientY - dragOffsetRef.current.y,
      });
    };
    const onUp = () => setDragging(false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [open, dragging]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const mobileSheet = isMobile;

  return createPortal(
    <>
      <div
        className={`drag-dialog-backdrop${mobileSheet ? ' drag-dialog-backdrop-mobile' : ''}`}
        onClick={dismissible ? onClose : undefined}
        aria-hidden
      />
      <section
        ref={dialogRef}
        className={`drag-dialog${variant === 'solid' ? ' drag-dialog-solid' : ''}${mobileSheet ? ' drag-dialog-mobile drag-dialog-mobile-sheet' : ''}`}
        style={
          mobileSheet
            ? undefined
            : {
                width: `${width}px`,
                left: `${(constrainedPosition ?? fallbackPosition).x}px`,
                top: `${(constrainedPosition ?? fallbackPosition).y}px`,
              }
        }
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header
          className={`drag-dialog-header${mobileSheet ? ' drag-dialog-header-mobile' : ''}`}
          onPointerDown={(e) => {
            if (isMobile) return;
            if ((e.target as HTMLElement).closest('.drag-dialog-close')) return;
            const basePosition = constrainedPosition ?? fallbackPosition;
            dragOffsetRef.current = {
              x: e.clientX - basePosition.x,
              y: e.clientY - basePosition.y,
            };
            setDragging(true);
          }}
        >
          {mobileSheet && dismissible ? (
            <button
              type="button"
              className="drag-dialog-mobile-back"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label={mobileBackLabel}
            >
              <MobileBackIcon />
            </button>
          ) : null}
          <h2 className="drag-dialog-title">{title}</h2>
          {!mobileSheet && dismissible ? (
            <button
              type="button"
              className="drag-dialog-close"
              onClick={onClose}
              aria-label={closeAriaLabel}
              title={closeAriaLabel}
            >
              <svg
                className="drag-dialog-close-icon"
                viewBox="0 0 12 12"
                width="12"
                height="12"
                aria-hidden="true"
              >
                <path
                  d="M1 1l10 10M11 1L1 11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.65"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </header>
        <div className="drag-dialog-body">{children}</div>
      </section>
    </>,
    document.body,
  );
}
