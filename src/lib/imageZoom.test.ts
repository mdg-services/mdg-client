import { describe, expect, it } from 'vitest';

import {
  DOUBLE_TAP_SCALE,
  IDENTITY,
  RUBBER_BAND,
  SWIPE_LOCK_PX,
  ZOOM_MAX,
  ZOOM_MIN,
  clampPan,
  dismissOpacity,
  distance,
  isZoomed,
  midpoint,
  pageDirection,
  panMove,
  pinchMove,
  releaseVelocity,
  rubberBand,
  shouldDismiss,
  swipeAxis,
  toTransform,
  toggleZoomAt,
  zoomAt,
} from './imageZoom';

/**
 * A phone-sized frame with a DSR card in it: the card is as wide as the frame
 * allows and taller than it is wide, which is the shape that actually arrives.
 */
const frame = { width: 360, height: 720 };
const image = { width: 360, height: 480 };

/** Where a point on the picture lands on screen, given a transform. */
function project(state: { scale: number; x: number; y: number }, p: { x: number; y: number }) {
  return { x: state.x + state.scale * p.x, y: state.y + state.scale * p.y };
}

describe('clampPan', () => {
  it('pins an unzoomed picture dead centre — it cannot be flicked off screen', () => {
    expect(clampPan({ scale: 1, x: 200, y: -400 }, frame, image)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });

  it('allows exactly the overhang and not a pixel more', () => {
    // At 2× the card is 720×960 inside a 360×720 frame: 180px of overhang each
    // way horizontally, 120px vertically.
    expect(clampPan({ scale: 2, x: 999, y: 999 }, frame, image)).toEqual({
      scale: 2,
      x: 180,
      y: 120,
    });
    expect(clampPan({ scale: 2, x: -999, y: -999 }, frame, image)).toEqual({
      scale: 2,
      x: -180,
      y: -120,
    });
  });

  it('keeps an axis centred while it is still smaller than the frame', () => {
    // 1.2× makes the card 432×576 — wider than the frame, still shorter than it.
    const out = clampPan({ scale: 1.2, x: 999, y: 999 }, frame, image);
    expect(out.x).toBe(36);
    expect(out.y).toBe(0);
  });
});

describe('zoomAt', () => {
  it('keeps the tapped point of the picture under the finger', () => {
    // A figure 100px right and 200px below the middle of the screen.
    const focus = { x: 100, y: 200 };
    const before = IDENTITY;
    const content = { x: (focus.x - before.x) / before.scale, y: (focus.y - before.y) / before.scale };
    const after = zoomAt(before, focus, 2, frame, image);
    expect(after.scale).toBe(2);
    // Clamping may pull it back, but only along an axis that had run out of
    // picture; horizontally there is 180px of room, so it holds exactly.
    expect(project(after, content).x).toBeCloseTo(focus.x, 5);
  });

  it('never goes below 1× or above the cap', () => {
    expect(zoomAt(IDENTITY, { x: 0, y: 0 }, 0.2, frame, image).scale).toBe(ZOOM_MIN);
    expect(zoomAt(IDENTITY, { x: 0, y: 0 }, 99, frame, image).scale).toBe(ZOOM_MAX);
  });

  it('re-centres on the way back out', () => {
    const zoomed = zoomAt(IDENTITY, { x: 120, y: 200 }, 3, frame, image);
    expect(zoomed.x).not.toBe(0);
    const out = zoomAt(zoomed, { x: 0, y: 0 }, 1, frame, image);
    expect(out).toEqual(IDENTITY);
  });
});

describe('pinchMove', () => {
  const start = {
    state: IDENTITY,
    focus: { x: 0, y: 0 },
    distance: 100,
  };

  it('scales by the ratio the fingers spread', () => {
    expect(pinchMove(start, { x: 0, y: 0 }, 250, frame, image).scale).toBe(2.5);
    expect(pinchMove(start, { x: 0, y: 0 }, 50, frame, image).scale).toBe(ZOOM_MIN);
  });

  it('drags the picture when the pinch midpoint moves', () => {
    // Spread to 2× and slide the midpoint 60px left at the same time.
    const out = pinchMove(start, { x: -60, y: 0 }, 200, frame, image);
    expect(out.scale).toBe(2);
    expect(out.x).toBe(-60);
  });

  it('survives a degenerate zero-distance start', () => {
    const out = pinchMove({ ...start, distance: 0 }, { x: 0, y: 0 }, 120, frame, image);
    expect(out.scale).toBe(1);
  });
});

describe('panMove', () => {
  it('moves a zoomed picture by the finger delta, clamped to its edges', () => {
    const zoomed = { scale: 2, x: 0, y: 0 };
    const out = panMove(
      { state: zoomed, point: { x: 0, y: 0 } },
      { x: 50, y: 30 },
      frame,
      image,
    );
    expect(out).toEqual({ scale: 2, x: 50, y: 30 });

    const past = panMove(
      { state: zoomed, point: { x: 0, y: 0 } },
      { x: 500, y: 500 },
      frame,
      image,
    );
    expect(past).toEqual({ scale: 2, x: 180, y: 120 });
  });
});

describe('toggleZoomAt', () => {
  it('goes in on the tapped point, then all the way back out', () => {
    const inward = toggleZoomAt(IDENTITY, { x: 80, y: 150 }, frame, image);
    expect(inward.scale).toBe(DOUBLE_TAP_SCALE);
    expect(isZoomed(inward)).toBe(true);

    // Whatever untidy scale a pinch left behind, one double-tap resets it.
    expect(toggleZoomAt({ scale: 1.7, x: 30, y: -12 }, { x: 0, y: 0 }, frame, image)).toEqual(
      IDENTITY,
    );
    expect(toggleZoomAt(inward, { x: 80, y: 150 }, frame, image)).toEqual(IDENTITY);
  });
});

describe('helpers', () => {
  it('measures midpoint and distance', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('writes a GPU-friendly transform', () => {
    expect(toTransform({ scale: 2, x: -10, y: 5 })).toBe(
      'translate3d(-10px, 5px, 0) scale(2)',
    );
  });

  it('does not call a rounding wobble "zoomed"', () => {
    expect(isZoomed(IDENTITY)).toBe(false);
    expect(isZoomed({ scale: 1.0005, x: 0, y: 0 })).toBe(false);
    expect(isZoomed({ scale: 1.2, x: 0, y: 0 })).toBe(true);
  });
});

describe('swipeAxis', () => {
  it('says nothing while the finger is still inside the slop', () => {
    expect(swipeAxis(0, 0)).toBeNull();
    expect(swipeAxis(SWIPE_LOCK_PX - 1, -(SWIPE_LOCK_PX - 1))).toBeNull();
  });

  it('picks the axis the finger has gone furthest along', () => {
    expect(swipeAxis(40, 5)).toBe('x');
    expect(swipeAxis(-40, 5)).toBe('x');
    expect(swipeAxis(5, 40)).toBe('y');
    expect(swipeAxis(5, -40)).toBe('y');
  });

  it('lets a diagonal go to the horizontal, which is the page turn', () => {
    expect(swipeAxis(30, 30)).toBe('x');
  });
});

describe('releaseVelocity', () => {
  it('has no speed from a single point or a pause', () => {
    expect(releaseVelocity([])).toEqual({ vx: 0, vy: 0 });
    expect(releaseVelocity([{ at: 0, x: 0, y: 0 }])).toEqual({ vx: 0, vy: 0 });
    expect(
      releaseVelocity([
        { at: 5, x: 0, y: 0 },
        { at: 5, x: 90, y: 0 },
      ]),
    ).toEqual({ vx: 0, vy: 0 });
  });

  it('averages over the last 100ms, not just the final two points', () => {
    const v = releaseVelocity([
      { at: 0, x: 0, y: 0 },
      { at: 50, x: 100, y: 0 },
      { at: 90, x: 105, y: 0 },
      { at: 120, x: 110, y: 0 },
    ]);
    // From the 50ms sample (the oldest within 100ms of the last): 10px in 70ms.
    expect(v.vx).toBeCloseTo(10 / 70, 5);
    expect(v.vy).toBe(0);
  });

  it('signs follow the direction of travel', () => {
    const v = releaseVelocity([
      { at: 0, x: 200, y: 400 },
      { at: 50, x: 100, y: 400 },
    ]);
    expect(v.vx).toBe(-2);
  });
});

describe('pageDirection', () => {
  it('turns forward when the finger went left and back when it went right', () => {
    expect(pageDirection(-200, 0, 360)).toBe(1);
    expect(pageDirection(200, 0, 360)).toBe(-1);
  });

  it('wants a quarter of the width or a flick, and nothing less', () => {
    expect(pageDirection(-89, 0, 360)).toBe(0);
    expect(pageDirection(-91, 0, 360)).toBe(1);
    // A flick turns a short drag…
    expect(pageDirection(-40, -0.8, 360)).toBe(1);
    // …but a twitch is not a drag, however fast.
    expect(pageDirection(-10, -2, 360)).toBe(0);
  });
});

describe('shouldDismiss', () => {
  it('closes on a long pull down, and never on a pull up', () => {
    expect(shouldDismiss(150, 0, 720)).toBe(true);
    expect(shouldDismiss(100, 0, 720)).toBe(false);
    expect(shouldDismiss(-400, 0, 720)).toBe(false);
  });

  it('closes on a fast flick down even after a short drag', () => {
    expect(shouldDismiss(60, 0.9, 720)).toBe(true);
    expect(shouldDismiss(10, 0.9, 720)).toBe(false);
  });
});

describe('dismissOpacity', () => {
  it('goes from solid black to see-through as the picture is pulled away', () => {
    expect(dismissOpacity(0, 720)).toBe(1);
    expect(dismissOpacity(-50, 720)).toBe(1);
    expect(dismissOpacity(252, 720)).toBeCloseTo(0.5, 5);
    expect(dismissOpacity(2000, 720)).toBe(0);
  });

  it('survives an unmeasured screen', () => {
    expect(dismissOpacity(100, 0)).toBe(1);
  });
});

describe('rubberBand', () => {
  it('shows only a share of the drag against an end stop', () => {
    expect(rubberBand(100)).toBeCloseTo(100 * RUBBER_BAND, 5);
    expect(rubberBand(-100)).toBeCloseTo(-100 * RUBBER_BAND, 5);
  });
});
