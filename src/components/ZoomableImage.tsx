import * as React from 'react';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import {
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP_PX,
  IDENTITY,
  TAP_SLOP_PX,
  distance,
  isZoomed,
  midpoint,
  panMove,
  pinchMove,
  toTransform,
  toggleZoomAt,
  zoomAt,
  type Box,
  type PinchStart,
  type Point,
  type ZoomState,
} from '@/lib/imageZoom';

/** A one-finger drag in progress. */
interface PanStart {
  state: ZoomState;
  point: Point;
  /** Screen-space start, for telling a tap from a drag. */
  screen: Point;
  at: number;
}

type Gesture = { kind: 'pan'; start: PanStart } | { kind: 'pinch'; start: PinchStart };

/** React's synthetic Touch and the DOM's differ in optional fields we never
 *  read, so take the two coordinates and nothing else. */
function touchPoint(t: { clientX: number; clientY: number }): Point {
  return { x: t.clientX, y: t.clientY };
}

/** A touch held this long is somebody resting a finger, not tapping. */
const TAP_MAX_MS = 400;

/**
 * A picture the dealer can get closer to.
 *
 * WHY THIS EXISTS
 * ---------------
 * Everything full-screen in this app is a photograph of paper: a DSR card whose
 * variation figure is set in 9pt, a page of the density register, the hardcopy
 * of a staff sheet. All three used to open as a flat `object-contain` image with
 * no way in — the reader's only option was to squint, or to save the file and
 * open it in the gallery, where the gestures they already know actually work.
 *
 * So the gestures are the ones they already know: pinch to zoom, drag to move it
 * about, double-tap to jump in on a spot, double-tap again to come all the way
 * back out. On a laptop, ctrl/⌘ + wheel (a trackpad pinch) does the same.
 * `lib/imageZoom.ts` owns every number; this owns the touches.
 *
 * Written in raw touch events rather than a library because it has to coexist
 * with what this app already does with touches: the swipe-to-reply on chat
 * bubbles, the shell's back gesture, and the WebView hardening that turns off
 * the browser's own double-tap zoom. `touch-action: none` claims the gestures
 * outright, and the caller's overlay carries `data-no-swipe`.
 *
 * WHAT DISMISSES IT
 * -----------------
 * `onDismiss` fires for a tap on the surround, and NOT for a tap on the picture
 * (that is half of a double-tap now), nor at the end of a drag or a pinch. The
 * last is what `movedRef` is for: a pan that finishes with the finger over the
 * surround must not be read as a tap on it.
 */
export function ZoomableImage({
  src,
  alt,
  onError,
  onLoad,
  onDismiss,
  className,
  imageClassName,
  testId = 'zoomable-image',
}: {
  src: string | undefined;
  alt: string;
  onError?: () => void;
  onLoad?: () => void;
  /** A genuine tap on the surround — the caller closes its overlay. */
  onDismiss?: () => void;
  className?: string;
  imageClassName?: string;
  testId?: string;
}) {
  const t = useT();
  const [zoom, setZoom] = React.useState<ZoomState>(IDENTITY);
  // The live transform, readable from a callback that must not be rebuilt on
  // every frame of a pinch (the one-finger handover in `onTouchEnd`).
  const zoomRef = React.useRef(zoom);
  zoomRef.current = zoom;
  const frameRef = React.useRef<HTMLDivElement>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const gestureRef = React.useRef<Gesture | null>(null);
  /** The previous tap, for double-tap detection. */
  const lastTapRef = React.useRef<{ at: number; point: Point } | null>(null);
  /** Set by any gesture that actually moved, so its click cannot dismiss us. */
  const movedRef = React.useRef(false);

  React.useEffect(() => {
    // A new picture always opens unzoomed — carrying a 3× pan over from the
    // last one would land the reader in a corner of a card they have not seen.
    setZoom(IDENTITY);
    gestureRef.current = null;
    lastTapRef.current = null;
    movedRef.current = false;
  }, [src]);

  /**
   * The frame and the picture, measured now.
   *
   * `offsetWidth/Height` is the LAID-OUT size — the image carries
   * `max-h-full max-w-full` and an intrinsic aspect ratio, so it is the painted
   * size too, and CSS transforms do not touch it. Measured per gesture rather
   * than cached because the frame is the visual viewport: it changes when the
   * keyboard opens, when the phone is turned, and when the address bar slides.
   */
  const measure = React.useCallback((): { frame: Box; image: Box } | null => {
    const frameEl = frameRef.current;
    const imgEl = imgRef.current;
    if (!frameEl || !imgEl) return null;
    return {
      frame: { width: frameEl.clientWidth, height: frameEl.clientHeight },
      image: { width: imgEl.offsetWidth, height: imgEl.offsetHeight },
    };
  }, []);

  /** A screen point expressed from the CENTRE of the frame — see imageZoom.ts. */
  const toLocal = React.useCallback((p: Point): Point => {
    const el = frameRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: p.x - (r.left + r.width / 2), y: p.y - (r.top + r.height / 2) };
  }, []);

  const onTouchStart = React.useCallback(
    (e: React.TouchEvent) => {
      const touches = e.touches;
      if (touches.length >= 2) {
        const a = touchPoint(touches[0]);
        const b = touchPoint(touches[1]);
        movedRef.current = true; // a pinch is never a tap
        gestureRef.current = {
          kind: 'pinch',
          start: {
            state: zoom,
            focus: toLocal(midpoint(a, b)),
            distance: distance(a, b),
          },
        };
        return;
      }
      if (touches.length !== 1) return;
      const p = touchPoint(touches[0]);
      movedRef.current = false;
      gestureRef.current = {
        kind: 'pan',
        start: { state: zoom, point: toLocal(p), screen: p, at: Date.now() },
      };
    },
    [toLocal, zoom],
  );

  const onTouchMove = React.useCallback(
    (e: React.TouchEvent) => {
      const gesture = gestureRef.current;
      const box = measure();
      if (!gesture || !box) return;

      if (gesture.kind === 'pinch') {
        if (e.touches.length < 2) return;
        const a = touchPoint(e.touches[0]);
        const b = touchPoint(e.touches[1]);
        setZoom(
          pinchMove(
            gesture.start,
            toLocal(midpoint(a, b)),
            distance(a, b),
            box.frame,
            box.image,
          ),
        );
        return;
      }

      if (e.touches.length < 1) return;
      const p = touchPoint(e.touches[0]);
      if (
        Math.abs(p.x - gesture.start.screen.x) > TAP_SLOP_PX ||
        Math.abs(p.y - gesture.start.screen.y) > TAP_SLOP_PX
      ) {
        movedRef.current = true;
      }
      // A one-finger drag only moves a picture bigger than its frame. At 1× the
      // drag is inert, which is what keeps a fumbled swipe over an unzoomed card
      // from nudging it off-centre.
      if (!isZoomed(gesture.start.state)) return;
      setZoom(panMove(gesture.start, toLocal(p), box.frame, box.image));
    },
    [measure, toLocal],
  );

  const onTouchEnd = React.useCallback(
    (e: React.TouchEvent) => {
      const gesture = gestureRef.current;
      gestureRef.current = null;

      // ONE FINGER LEFT OF A PINCH becomes a drag, immediately.
      //
      // Pinching in and then relaxing to a single finger to follow a row across
      // is the gesture everybody has from WhatsApp, and dropping the gesture
      // here left the picture frozen until the hand lifted off entirely and
      // came back down. Re-seat it as a pan against the CURRENT transform and
      // the current finger, so the picture carries straight on.
      if (e.touches.length === 1) {
        const p = touchPoint(e.touches[0]);
        gestureRef.current = {
          kind: 'pan',
          start: { state: zoomRef.current, point: toLocal(p), screen: p, at: Date.now() },
        };
        movedRef.current = true; // still mid-gesture: no tap can come of this
        return;
      }
      if (!gesture || gesture.kind !== 'pan') return;
      // Fingers still down — not a tap.
      if (e.touches.length > 0) return;

      const now = Date.now();
      if (movedRef.current || now - gesture.start.at >= TAP_MAX_MS) return;
      const tapped = gesture.start.screen;

      const last = lastTapRef.current;
      const isDouble =
        !!last &&
        now - last.at < DOUBLE_TAP_MS &&
        Math.abs(tapped.x - last.point.x) < DOUBLE_TAP_SLOP_PX &&
        Math.abs(tapped.y - last.point.y) < DOUBLE_TAP_SLOP_PX;

      if (!isDouble) {
        lastTapRef.current = { at: now, point: tapped };
        return;
      }
      lastTapRef.current = null;
      const box = measure();
      if (!box) return;
      // The second tap is a gesture, not a tap on whatever lies under it: mark
      // it moved so the click it also fires cannot dismiss the overlay.
      movedRef.current = true;
      const focus = toLocal(tapped);
      setZoom((z) => toggleZoomAt(z, focus, box.frame, box.image));
    },
    [measure, toLocal],
  );

  /** Trackpad pinch / ctrl+wheel on a laptop. */
  const onWheel = React.useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const box = measure();
      if (!box) return;
      const focus = toLocal({ x: e.clientX, y: e.clientY });
      setZoom((z) =>
        zoomAt(z, focus, z.scale * Math.exp(-e.deltaY / 200), box.frame, box.image),
      );
    },
    [measure, toLocal],
  );

  const onFrameClick = React.useCallback(() => {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    onDismiss?.();
  }, [onDismiss]);

  return (
    <div
      ref={frameRef}
      data-testid={testId}
      className={cn(
        'relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden p-4',
        className,
      )}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onWheel={onWheel}
      onClick={onFrameClick}
    >
      {/* Stop taps on the image itself from reaching the surround's dismiss —
          on the picture, a tap is half of a double-tap. */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        decoding="async"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        onError={onError}
        onLoad={onLoad}
        style={{
          transform: toTransform(zoom),
          // Snapping back to 1× should look like a movement; following a finger
          // must not lag behind it.
          transition: gestureRef.current ? undefined : 'transform 160ms ease-out',
        }}
        className={cn(
          'max-h-full max-w-full select-none rounded-xl object-contain will-change-transform',
          imageClassName,
        )}
      />

      {/* The way back out, for anyone who pinched in and does not know a
          double-tap undoes it. Only while there is something to undo. */}
      {isZoomed(zoom) ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setZoom(IDENTITY);
          }}
          className="safe-bottom absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white active:bg-white/25"
        >
          {t('chat.resetZoom')}
        </button>
      ) : null}
    </div>
  );
}
