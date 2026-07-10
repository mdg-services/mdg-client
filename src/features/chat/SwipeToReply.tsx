import { Reply } from 'lucide-react';
import * as React from 'react';

import type { Message } from '@dk/shared/types';

/** Rightward travel (px) at which releasing triggers a reply. */
export const SWIPE_TRIGGER_PX = 56;
/** Hard cap (px) on how far the row can be dragged. */
export const SWIPE_MAX_PX = 72;
/** Horizontal travel (px) below which the gesture is never engaged. */
export const SWIPE_ENGAGE_PX = 12;
/** Horizontal:vertical dominance required to engage (leaves pan-y scrolling alone). */
export const SWIPE_ENGAGE_RATIO = 1.8;
/**
 * A touch held this long (ms) WITHOUT engaging horizontally is long-press
 * territory (the 450ms action-sheet timer on the bubble): the swipe disarms so
 * one touch can never both open the sheet and fire a reply. Deliberately just
 * under LONG_PRESS_MS so the swipe is dead before the sheet can open.
 */
export const SWIPE_HOLD_DISARM_MS = 400;

/**
 * Whether a pointer delta commits the row to a horizontal swipe: enough
 * horizontal travel AND clearly more horizontal than vertical.
 */
export function swipeEngaged(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_ENGAGE_PX && Math.abs(dx) > SWIPE_ENGAGE_RATIO * Math.abs(dy);
}

/**
 * Whether a not-yet-engaged touch has been held too long to still become a
 * swipe (it is a long-press / stationary hold by now).
 */
export function swipeHoldExpired(heldMs: number): boolean {
  return heldMs >= SWIPE_HOLD_DISARM_MS;
}

/**
 * Visual offset for a rightward drag: 1:1 up to the trigger point, then heavy
 * resistance, hard-capped. Leftward drags don't move the row at all.
 */
export function swipeOffset(dx: number): number {
  if (dx <= 0) return 0;
  if (dx <= SWIPE_TRIGGER_PX) return dx;
  return Math.min(SWIPE_MAX_PX, SWIPE_TRIGGER_PX + (dx - SWIPE_TRIGGER_PX) * 0.3);
}

/** Whether releasing at this offset fires the reply. */
export function swipeTriggered(offset: number): boolean {
  return offset >= SWIPE_TRIGGER_PX;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
  engaged: boolean;
  offset: number;
  raf: number;
}

/**
 * WhatsApp-style swipe-right-to-reply row. Pointer-based with `touch-action:
 * pan-y` (vertical scrolling stays native); once the gesture reads as
 * horizontal the content translates via a rAF-batched transform on a ref — no
 * per-move React state. Releasing past the trigger fires `onReply` + a
 * vibration; anything inside `[data-no-swipe]` (voice-note seek row), a second
 * touch, or `disabled` (system/card/temp messages) opts out.
 */
export const SwipeToReply = React.memo(function SwipeToReply({
  message,
  onReply,
  disabled,
  children,
  ...rest
}: {
  message: Message;
  onReply?: (message: Message) => void;
  disabled?: boolean;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const rowRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const iconRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DragState | null>(null);

  const paint = React.useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    d.raf = 0;
    if (contentRef.current) {
      contentRef.current.style.transform =
        d.offset > 0 ? `translateX(${d.offset}px)` : '';
    }
    if (iconRef.current) {
      iconRef.current.style.opacity = String(Math.min(1, d.offset / SWIPE_TRIGGER_PX));
    }
  }, []);

  const settleBack = React.useCallback(() => {
    const content = contentRef.current;
    if (content) {
      content.style.transition = 'transform 150ms ease-out';
      content.style.transform = '';
      window.setTimeout(() => {
        content.style.transition = '';
      }, 180);
    }
    if (iconRef.current) iconRef.current.style.opacity = '0';
  }, []);

  const endDrag = React.useCallback(
    (fire: boolean) => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      if (d.raf) cancelAnimationFrame(d.raf);
      settleBack();
      if (fire && d.engaged && swipeTriggered(d.offset)) {
        navigator.vibrate?.(10);
        onReply?.(message);
      }
    },
    [message, onReply, settleBack],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !onReply) return;
    if (e.pointerType === 'mouse') return; // touch/pen gesture only
    if (dragRef.current) {
      // Second finger — abort the whole gesture.
      endDrag(false);
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-no-swipe]')) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startedAt: performance.now(),
      engaged: false,
      offset: 0,
      raf: 0,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.engaged) {
      // Held without engaging for long-press territory: the bubble's action
      // sheet is (about to be) open — this touch must not also arm a reply.
      if (swipeHoldExpired(performance.now() - d.startedAt)) {
        dragRef.current = null;
        return;
      }
      if (!swipeEngaged(dx, dy)) return;
      if (dx < 0) {
        // Committed horizontal but leftward — not a reply gesture.
        dragRef.current = null;
        return;
      }
      d.engaged = true;
      try {
        rowRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    d.offset = swipeOffset(dx);
    if (!d.raf) d.raf = requestAnimationFrame(paint);
  };

  return (
    <div
      ref={rowRef}
      {...rest}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => endDrag(true)}
      onPointerCancel={() => endDrag(false)}
      className="relative"
      style={{ touchAction: 'pan-y' }}
    >
      <div
        ref={iconRef}
        aria-hidden
        className="pointer-events-none absolute left-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-surface-2 text-text-muted"
        style={{ opacity: 0 }}
      >
        <Reply width={16} strokeWidth={1.75} />
      </div>
      <div ref={contentRef}>{children}</div>
    </div>
  );
});
