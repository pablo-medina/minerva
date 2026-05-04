import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Point = { x: number; y: number };
type Size = { width: number; height: number };

type DraggableWindowProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  variant?: 'default' | 'solid';
  closeAriaLabel?: string;
  maximizeAriaLabel?: string;
  restoreAriaLabel?: string;
  mobileBackAriaLabel?: string;
  /** When false, Escape does not close this window (use when a nested overlay handles Escape). */
  closeOnEscape?: boolean;
};

const VIEWPORT_MARGIN = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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

function MaximizeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.5 2.5h11v11h-11z"
      />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 6V2.5h8.5V11H8M5 5h8.5v8.5H5z"
      />
    </svg>
  );
}

export function DraggableWindow({
  open,
  title,
  onClose,
  children,
  width = 760,
  height = 680,
  minWidth = 620,
  minHeight = 520,
  variant = 'default',
  closeAriaLabel = 'Close',
  maximizeAriaLabel = 'Maximize',
  restoreAriaLabel = 'Restore',
  mobileBackAriaLabel,
  closeOnEscape = true,
}: DraggableWindowProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [position, setPosition] = useState<Point | null>(null);
  const [size, setSize] = useState<Size>({ width, height });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const resizeOriginRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const restoreSnapshotRef = useRef<{ position: Point; size: Size } | null>(null);
  const wasOpenRef = useRef(false);
  const mobileBackLabel = mobileBackAriaLabel ?? closeAriaLabel;

  const toggleMaximize = () => {
    if (!maximized) {
      restoreSnapshotRef.current = { position: constrainedPosition, size: normalizedSize };
      setMaximized(true);
      return;
    }
    const snap = restoreSnapshotRef.current;
    if (snap) {
      setPosition(snap.position);
      setSize(snap.size);
    }
    setMaximized(false);
  };

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

  const maxDesktopSize = useMemo(
    () => ({
      width: Math.max(minWidth, window.innerWidth - VIEWPORT_MARGIN * 2),
      height: Math.max(minHeight, window.innerHeight - VIEWPORT_MARGIN * 2),
    }),
    [minHeight, minWidth],
  );

  const normalizedSize = useMemo(
    () => ({
      width: clamp(size.width, minWidth, maxDesktopSize.width),
      height: clamp(size.height, minHeight, maxDesktopSize.height),
    }),
    [maxDesktopSize.height, maxDesktopSize.width, minHeight, minWidth, size.height, size.width],
  );

  const centeredPosition = useMemo<Point>(() => {
    const x = Math.round((window.innerWidth - normalizedSize.width) / 2);
    const y = Math.round((window.innerHeight - normalizedSize.height) / 2);
    return {
      x: clamp(x, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, window.innerWidth - normalizedSize.width - VIEWPORT_MARGIN)),
      y: clamp(y, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, window.innerHeight - normalizedSize.height - VIEWPORT_MARGIN)),
    };
  }, [normalizedSize.height, normalizedSize.width]);

  const constrainedPosition = useMemo(() => {
    const base = position ?? centeredPosition;
    return {
      x: clamp(
        base.x,
        VIEWPORT_MARGIN,
        Math.max(VIEWPORT_MARGIN, window.innerWidth - normalizedSize.width - VIEWPORT_MARGIN),
      ),
      y: clamp(
        base.y,
        VIEWPORT_MARGIN,
        Math.max(VIEWPORT_MARGIN, window.innerHeight - normalizedSize.height - VIEWPORT_MARGIN),
      ),
    };
  }, [centeredPosition, normalizedSize.height, normalizedSize.width, position]);

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [closeOnEscape, onClose, open]);

  useLayoutEffect(() => {
    if (!open || isMobile || maximized) return;
    setSize((prev) => ({
      width: clamp(prev.width, minWidth, Math.max(minWidth, window.innerWidth - VIEWPORT_MARGIN * 2)),
      height: clamp(prev.height, minHeight, Math.max(minHeight, window.innerHeight - VIEWPORT_MARGIN * 2)),
    }));
    setPosition((prev) => prev ?? centeredPosition);
  }, [centeredPosition, isMobile, maximized, minHeight, minWidth, open]);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    if (justOpened) {
      setMaximized(false);
      setDragging(false);
      setResizing(false);
      setSize({
        width: clamp(width, minWidth, Math.max(minWidth, window.innerWidth - VIEWPORT_MARGIN * 2)),
        height: clamp(height, minHeight, Math.max(minHeight, window.innerHeight - VIEWPORT_MARGIN * 2)),
      });
      setPosition(null);
      restoreSnapshotRef.current = null;
    }
    wasOpenRef.current = open;
  }, [height, minHeight, minWidth, open, width]);

  useEffect(() => {
    if (!open || isMobile || (!dragging && !resizing)) return;
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        setPosition({
          x: e.clientX - dragOffsetRef.current.x,
          y: e.clientY - dragOffsetRef.current.y,
        });
      }
      if (resizing && resizeOriginRef.current) {
        const origin = resizeOriginRef.current;
        setSize({
          width: clamp(origin.width + (e.clientX - origin.x), minWidth, maxDesktopSize.width),
          height: clamp(origin.height + (e.clientY - origin.y), minHeight, maxDesktopSize.height),
        });
      }
    };
    const onUp = () => {
      setDragging(false);
      setResizing(false);
      resizeOriginRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, isMobile, maxDesktopSize.height, maxDesktopSize.width, minHeight, minWidth, open, resizing]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const mobileSheet = isMobile;
  const effectivePos = maximized ? { x: VIEWPORT_MARGIN, y: VIEWPORT_MARGIN } : constrainedPosition;
  const effectiveSize = maximized
    ? { width: window.innerWidth - VIEWPORT_MARGIN * 2, height: window.innerHeight - VIEWPORT_MARGIN * 2 }
    : normalizedSize;

  return createPortal(
    <>
      <div
        className={`drag-window-backdrop${mobileSheet ? ' drag-window-backdrop-mobile' : ''}`}
        onClick={onClose}
        aria-hidden
      />
      <section
        className={`drag-window${variant === 'solid' ? ' drag-window-solid' : ''}${mobileSheet ? ' drag-window-mobile drag-window-mobile-sheet' : ''}${maximized ? ' drag-window-maximized' : ''}`}
        style={
          mobileSheet
            ? undefined
            : {
                width: `${effectiveSize.width}px`,
                height: `${effectiveSize.height}px`,
                left: `${effectivePos.x}px`,
                top: `${effectivePos.y}px`,
              }
        }
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header
          className={`drag-window-header${mobileSheet ? ' drag-window-header-mobile' : ''}`}
          onDoubleClick={() => {
            if (mobileSheet) return;
            toggleMaximize();
          }}
          onPointerDown={(e) => {
            if (mobileSheet || maximized) return;
            if ((e.target as HTMLElement).closest('.drag-window-header-actions')) return;
            const base = constrainedPosition;
            dragOffsetRef.current = { x: e.clientX - base.x, y: e.clientY - base.y };
            setDragging(true);
          }}
        >
          {mobileSheet ? (
            <button
              type="button"
              className="drag-window-mobile-back"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label={mobileBackLabel}
            >
              <MobileBackIcon />
            </button>
          ) : null}
          <h2 className="drag-window-title">{title}</h2>
          <div className="drag-window-header-actions">
            {!mobileSheet ? (
              <button
                type="button"
                className="drag-window-control"
                onClick={toggleMaximize}
                aria-label={maximized ? restoreAriaLabel : maximizeAriaLabel}
                title={maximized ? restoreAriaLabel : maximizeAriaLabel}
              >
                {maximized ? <RestoreIcon /> : <MaximizeIcon />}
              </button>
            ) : null}
            {!mobileSheet ? (
              <button
                type="button"
                className="drag-window-control drag-window-control-close"
                onClick={onClose}
                aria-label={closeAriaLabel}
                title={closeAriaLabel}
              >
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
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
          </div>
        </header>
        <div className="drag-window-body">{children}</div>
        {!mobileSheet && !maximized ? (
          <button
            type="button"
            className="drag-window-resize-handle"
            aria-label="Resize"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              resizeOriginRef.current = {
                x: e.clientX,
                y: e.clientY,
                width: normalizedSize.width,
                height: normalizedSize.height,
              };
              setResizing(true);
            }}
          />
        ) : null}
      </section>
    </>,
    document.body,
  );
}

