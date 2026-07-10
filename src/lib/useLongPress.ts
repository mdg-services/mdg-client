import * as React from 'react';

/** Hold this long (ms) to trigger a long-press. */
export const LONG_PRESS_MS = 450;
/** Finger drift (px) beyond which the press is treated as a scroll/swipe. */
export const LONG_PRESS_SLOP_PX = 10;
/**
 * How long the ghost-click swallow stays armed after the pointer LIFTS. The
 * trailing click, when the browser emits one, fires within the same task /
 * a few ms of release — so a short grace is enough, and a later legitimate
 * tap is never eaten.
 */
export const GHOST_CLICK_GRACE_MS = 100;

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

/**
 * Pointer-timer long-press (the WebView kills `contextmenu` app-wide via
 * touchGuards, so this is the ONLY long-press path): pointerdown starts a
 * 450ms timer; moving >10px, lifting, a second touch, or pointercancel aborts
 * it. On fire it vibrates and arms a one-shot capture listener that swallows
 * the trailing synthetic click (same ghost-click idiom as the Composer mic),
 * so a long-press never also "taps" whatever is under the finger.
 *
 * The swallow's lifetime is tied to the POINTER SEQUENCE, not a wall clock:
 * it stays armed while the finger is still down (browsers that emit the click
 * only on release), is dropped a short grace after pointerup when no click
 * arrived (browsers that emit none), and is single-shot — so it can never eat
 * a later legitimate tap.
 */
export function useLongPress(
  onLongPress: () => void,
  opts?: { disabled?: boolean },
): LongPressHandlers {
  const cbRef = React.useRef(onLongPress);
  cbRef.current = onLongPress;
  const disabled = opts?.disabled ?? false;

  const timerRef = React.useRef<number | null>(null);
  const startRef = React.useRef<{ x: number; y: number; pointerId: number } | null>(
    null,
  );
  // Set when the press FIRED: which pointer it was and how to drop the armed
  // ghost-click swallow. `graceTimerRef` schedules that drop after release.
  const firedRef = React.useRef<{ pointerId: number; removeSwallow: () => void } | null>(
    null,
  );
  const graceTimerRef = React.useRef<number | null>(null);

  const clear = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const disarmSwallow = React.useCallback(() => {
    if (graceTimerRef.current !== null) {
      window.clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
    firedRef.current?.removeSwallow();
    firedRef.current = null;
  }, []);

  React.useEffect(
    () => () => {
      clear();
      disarmSwallow();
    },
    [clear, disarmSwallow],
  );

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      // Safety net: a swallow that was never consumed (release with no click)
      // must not survive into the next press's tap.
      disarmSwallow();
      if (disabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // A second finger while the timer runs = not a long-press (pinch/scroll).
      if (startRef.current) {
        clear();
        return;
      }
      startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const pointerId = startRef.current?.pointerId ?? e.pointerId;
        startRef.current = null;
        navigator.vibrate?.(10);
        // Swallow the ghost click the ended pointer sequence will emit, so the
        // element under the finger (image, link, play button) isn't activated.
        // Armed until the pointer lifts (+ grace) — consuming it disarms.
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
          disarmSwallow(); // once:true already removed the listener; clear state
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        firedRef.current = {
          pointerId,
          removeSwallow: () =>
            window.removeEventListener('click', swallow, { capture: true }),
        };
        cbRef.current();
      }, LONG_PRESS_MS);
    },
    [disabled, clear, disarmSwallow],
  );

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start || timerRef.current === null) return;
      if (e.pointerId !== start.pointerId) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (dx * dx + dy * dy > LONG_PRESS_SLOP_PX * LONG_PRESS_SLOP_PX) clear();
    },
    [clear],
  );

  // The pointer that fired is lifting/cancelling: the trailing click (if the
  // browser emits one) lands within the same task or a few ms — keep the
  // swallow through a short grace, then drop it so it can't eat a real tap.
  const endPointer = React.useCallback(
    (e: React.PointerEvent) => {
      clear();
      const fired = firedRef.current;
      if (fired && e.pointerId === fired.pointerId) {
        if (graceTimerRef.current !== null) window.clearTimeout(graceTimerRef.current);
        graceTimerRef.current = window.setTimeout(disarmSwallow, GHOST_CLICK_GRACE_MS);
      }
    },
    [clear, disarmSwallow],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
  };
}
