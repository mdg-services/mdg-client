/**
 * The arithmetic behind pinch-zoom, double-tap-zoom and pan in the full-screen
 * image viewer. Pure on purpose: the component owns the touch plumbing, this
 * owns every number, and the numbers are the part that is worth testing.
 *
 * THE COORDINATE SYSTEM
 * ---------------------
 * The picture is drawn by one CSS transform, `translate(x, y) scale(s)`, on an
 * element whose transform-origin is its own centre. So every point here is
 * measured in pixels FROM THE CENTRE OF THE FRAME, not from its top-left: the
 * centre is where the identity transform puts the middle of the picture, and
 * working from it makes the anchor formula below symmetric (and makes `{0,0}`
 * mean "unmoved" rather than "shoved into the corner").
 *
 * A point `p` on the picture lands on screen at `t + s·p`. Read backwards, the
 * bit of picture currently under a finger at `f` is `(f − t) / s`. Holding that
 * bit of picture under that finger while the scale changes from s₀ to s₁ is the
 * whole of zoom-to-a-point, and it is the one line every function here shares:
 *
 *     t₁ = f − (s₁/s₀)·(f − t₀)
 *
 * Without it, zoom happens about the centre of the screen — you pinch on the
 * variation figure at the bottom of a DSR card and the variation figure is the
 * thing that slides away from you.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  width: number;
  height: number;
}

export interface ZoomState {
  scale: number;
  /** Translation in CSS pixels, applied BEFORE the scale. */
  x: number;
  y: number;
}

/** Unzoomed, unmoved. */
export const IDENTITY: ZoomState = { scale: 1, x: 0, y: 0 };

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;

/**
 * Where one double-tap lands. WhatsApp's is around 2×; a DSR card is a dense
 * table photographed at full width, so the first tap wants to get a row of
 * figures to a readable size in one go rather than in three.
 */
export const DOUBLE_TAP_SCALE = 2.75;

/** How long after a tap a second one still counts as a double-tap. */
export const DOUBLE_TAP_MS = 300;
/** How far apart two taps may land and still count as a double-tap. */
export const DOUBLE_TAP_SLOP_PX = 40;
/** Movement beyond this makes a touch a drag rather than a tap. */
export const TAP_SLOP_PX = 10;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function isZoomed(state: ZoomState): boolean {
  return state.scale > ZOOM_MIN + 0.001;
}

/**
 * Hold the picture against its own edges.
 *
 * `image` is the picture's LAID-OUT size — what `object-contain` sized it to at
 * scale 1, before any transform. Scaled up it measures `image·s`, and the amount
 * of it that can hide off one side of the frame is half of whatever it has that
 * the frame has not. When it is smaller than the frame in an axis there is
 * nothing to pan there, so the allowance is zero and it stays centred: that is
 * what stops a picture at scale 1 from being flicked off the screen, and what
 * keeps a tall card centred horizontally however far up and down it is dragged.
 */
export function clampPan(state: ZoomState, frame: Box, image: Box): ZoomState {
  const maxX = Math.max(0, (image.width * state.scale - frame.width) / 2);
  const maxY = Math.max(0, (image.height * state.scale - frame.height) / 2);
  return {
    scale: state.scale,
    // `+ 0` turns a clamped -0 back into 0. Nothing renders differently either
    // way; it keeps IDENTITY comparable by equality instead of by sign.
    x: clamp(state.x, -maxX, maxX) + 0,
    y: clamp(state.y, -maxY, maxY) + 0,
  };
}

/**
 * Rescale about a fixed point on the screen — the shared anchor formula above.
 * `focus` is relative to the centre of the frame.
 */
export function zoomAt(
  state: ZoomState,
  focus: Point,
  nextScale: number,
  frame: Box,
  image: Box,
): ZoomState {
  const scale = clamp(nextScale, ZOOM_MIN, ZOOM_MAX);
  const k = scale / state.scale;
  return clampPan(
    {
      scale,
      x: focus.x - k * (focus.x - state.x),
      y: focus.y - k * (focus.y - state.y),
    },
    frame,
    image,
  );
}

/** What a pinch was when it started: the transform, the midpoint, the spread. */
export interface PinchStart {
  state: ZoomState;
  focus: Point;
  distance: number;
}

/**
 * The transform partway through a pinch.
 *
 * Two things move at once and both are wanted: the fingers' SPREAD sets the
 * scale, and their MIDPOINT drags the picture — a pinch that also slides should
 * slide the picture, which is what makes zooming into the corner of a card feel
 * like handling paper rather than operating a control.
 */
export function pinchMove(
  start: PinchStart,
  focus: Point,
  distance: number,
  frame: Box,
  image: Box,
): ZoomState {
  const scale =
    start.distance > 0
      ? clamp((start.state.scale * distance) / start.distance, ZOOM_MIN, ZOOM_MAX)
      : start.state.scale;
  const k = scale / start.state.scale;
  return clampPan(
    {
      scale,
      x: focus.x - k * (start.focus.x - start.state.x),
      y: focus.y - k * (start.focus.y - start.state.y),
    },
    frame,
    image,
  );
}

/** The transform partway through a one-finger drag of a zoomed picture. */
export function panMove(
  start: { state: ZoomState; point: Point },
  point: Point,
  frame: Box,
  image: Box,
): ZoomState {
  return clampPan(
    {
      scale: start.state.scale,
      x: start.state.x + (point.x - start.point.x),
      y: start.state.y + (point.y - start.point.y),
    },
    frame,
    image,
  );
}

/**
 * Double-tap: zoom in on the tapped point, or — if already zoomed by any amount,
 * however it got there — go all the way back out.
 *
 * Going back to exactly IDENTITY rather than one step down matters: after a
 * pinch the picture is usually at some untidy scale, off-centre, and the gesture
 * people use to "start again" is a double-tap. Half-undoing it leaves them
 * pinching back out by hand.
 */
export function toggleZoomAt(
  state: ZoomState,
  focus: Point,
  frame: Box,
  image: Box,
): ZoomState {
  if (isZoomed(state)) return IDENTITY;
  return zoomAt(state, focus, DOUBLE_TAP_SCALE, frame, image);
}

/** Midpoint of two touch points. */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Distance between two touch points. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The CSS transform for a state. */
export function toTransform(state: ZoomState): string {
  return `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
}
