import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';

import { ZoomableImage } from './ZoomableImage';

// Unmount BEFORE the shared teardown resets the language store: that reset runs
// first otherwise, and re-renders a still-mounted component outside `act`.
afterEach(() => cleanup());

/**
 * `ZoomableImage` has three callers with three different needs. The density
 * register and the staff hardcopy want what it always did — pinch, pan,
 * double-tap, and a tap on the surround that closes their overlay. The chat's
 * paging viewer wants one-finger drags of an unzoomed picture reported to it.
 * Both must keep working, which is what this file pins.
 *
 * jsdom lays nothing out, so the frame is a 360×720 phone with a 360×480
 * picture in it, and the clock is ours to advance (release speed and the
 * double-tap window are both read from it).
 */

let clock = 0;

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: true });
  clock = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
});

function renderImage(props: Partial<Parameters<typeof ZoomableImage>[0]> = {}) {
  const utils = render(<ZoomableImage src="https://s3.test/card.png" alt="card" {...props} />);
  const frame = screen.getByTestId('zoomable-image');
  const img = screen.getByAltText('card');
  Object.defineProperty(frame, 'clientWidth', { value: 360, configurable: true });
  Object.defineProperty(frame, 'clientHeight', { value: 720, configurable: true });
  frame.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 360, height: 720, right: 360, bottom: 720, x: 0, y: 0 }) as DOMRect;
  Object.defineProperty(img, 'offsetWidth', { value: 360, configurable: true });
  Object.defineProperty(img, 'offsetHeight', { value: 480, configurable: true });
  return { ...utils, frame, img };
}

const touch = (x: number, y: number) => ({ clientX: x, clientY: y });

function tap(frame: HTMLElement, x: number, y: number): void {
  fireEvent.touchStart(frame, { touches: [touch(x, y)] });
  fireEvent.touchEnd(frame, { touches: [] });
}

/** A drag in `steps` moves, `stepMs` apart, ending with a lift. */
function drag(
  frame: HTMLElement,
  from: [number, number],
  to: [number, number],
  { steps = 3, stepMs = 100, lift = true } = {},
): void {
  fireEvent.touchStart(frame, { touches: [touch(...from)] });
  for (let i = 1; i <= steps; i += 1) {
    clock += stepMs;
    fireEvent.touchMove(frame, {
      touches: [touch(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps)],
    });
  }
  if (lift) fireEvent.touchEnd(frame, { touches: [] });
}

function scaleOf(img: HTMLElement): number {
  const m = /scale\(([\d.]+)\)/.exec(img.style.transform);
  return m ? Number(m[1]) : NaN;
}

describe('ZoomableImage — what the register and the hardcopy viewers rely on', () => {
  it('draws the picture padded and rounded, as it always did', () => {
    const { frame, img } = renderImage();
    expect(frame).toHaveClass('p-4');
    expect(img).toHaveClass('rounded-xl');
  });

  it('a tap on the surround dismisses; a tap on the picture does not', () => {
    const onDismiss = vi.fn();
    const { frame, img } = renderImage({ onDismiss });
    fireEvent.click(img);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(frame);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('a drag that ends over the surround does not dismiss', () => {
    const onDismiss = vi.fn();
    const { frame } = renderImage({ onDismiss });
    drag(frame, [180, 360], [300, 500]);
    fireEvent.click(frame);
    expect(onDismiss).not.toHaveBeenCalled();
    // …but a plain tap on the surround afterwards still does.
    fireEvent.click(frame);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('double-tap zooms in and a second one comes all the way out', () => {
    const { frame, img } = renderImage();
    tap(frame, 180, 400);
    tap(frame, 180, 400);
    expect(scaleOf(img)).toBeGreaterThan(2);
    clock += 1000;
    tap(frame, 180, 400);
    tap(frame, 180, 400);
    expect(scaleOf(img)).toBe(1);
  });

  it('pinches, and then pans the zoomed picture', () => {
    const { frame, img } = renderImage();
    fireEvent.touchStart(frame, { touches: [touch(130, 360), touch(230, 360)] });
    fireEvent.touchMove(frame, { touches: [touch(80, 360), touch(280, 360)] });
    fireEvent.touchEnd(frame, { touches: [] });
    expect(scaleOf(img)).toBeCloseTo(2, 5);
    drag(frame, [180, 360], [240, 360], { steps: 1 });
    expect(img.style.transform).toContain('translate3d(60px');
  });

  it('with nobody listening, a drag of an unzoomed picture does nothing at all', () => {
    const { frame, img } = renderImage();
    drag(frame, [180, 360], [40, 120]);
    expect(img.style.transform).toBe('translate3d(0px, 0px, 0) scale(1)');
  });
});

describe('ZoomableImage — one-finger swipes of an unzoomed picture', () => {
  it('reports the drag once its direction is settled, then the lift with its speed', () => {
    const onSwipeMove = vi.fn();
    const onSwipeEnd = vi.fn();
    const { frame } = renderImage({ onSwipeMove, onSwipeEnd });
    // 200px left in three 100ms moves.
    drag(frame, [300, 400], [100, 400], { steps: 3, stepMs: 100 });

    expect(onSwipeMove).toHaveBeenCalled();
    expect(onSwipeMove.mock.calls.every(([s]) => s.axis === 'x')).toBe(true);
    const last = onSwipeMove.mock.calls.at(-1)![0];
    expect(last.dx).toBeCloseTo(-200, 5);
    expect(last.dy).toBe(0);

    expect(onSwipeEnd).toHaveBeenCalledTimes(1);
    const end = onSwipeEnd.mock.calls[0]![0];
    expect(end).toMatchObject({ axis: 'x', cancelled: false });
    expect(end.dx).toBeCloseTo(-200, 5);
    // Over the last 100ms it moved 66.7px: well short of a flick, but moving left.
    expect(end.vx).toBeCloseTo(-200 / 3 / 100, 3);
  });

  it('reports nothing for a movement inside the slop — that is still a tap', () => {
    const onSwipeMove = vi.fn();
    const onSwipeEnd = vi.fn();
    const onTap = vi.fn();
    const { frame } = renderImage({ onSwipeMove, onSwipeEnd, onTap });
    drag(frame, [180, 400], [184, 402], { steps: 1, stepMs: 20 });
    expect(onSwipeMove).not.toHaveBeenCalled();
    expect(onSwipeEnd).not.toHaveBeenCalled();
  });

  it('settles on the first direction and holds it', () => {
    const onSwipeMove = vi.fn();
    const { frame } = renderImage({ onSwipeMove });
    fireEvent.touchStart(frame, { touches: [touch(180, 200)] });
    fireEvent.touchMove(frame, { touches: [touch(184, 260)] }); // down: y
    fireEvent.touchMove(frame, { touches: [touch(40, 280)] }); // then a big drift sideways
    fireEvent.touchEnd(frame, { touches: [] });
    expect(onSwipeMove.mock.calls.map(([s]) => s.axis)).toEqual(['y', 'y']);
  });

  it('never reports a drag of a ZOOMED picture — it pans instead', () => {
    const onSwipeMove = vi.fn();
    const onSwipeEnd = vi.fn();
    const { frame, img } = renderImage({ onSwipeMove, onSwipeEnd });
    fireEvent.touchStart(frame, { touches: [touch(130, 360), touch(230, 360)] });
    fireEvent.touchMove(frame, { touches: [touch(80, 360), touch(280, 360)] });
    fireEvent.touchEnd(frame, { touches: [] });
    onSwipeMove.mockClear();
    onSwipeEnd.mockClear();

    drag(frame, [300, 360], [100, 360]);
    expect(onSwipeMove).not.toHaveBeenCalled();
    expect(onSwipeEnd).not.toHaveBeenCalled();
    expect(img.style.transform).toContain('translate3d(-180px');
  });

  it('a second finger mid-swipe cancels it', () => {
    const onSwipeEnd = vi.fn();
    const { frame } = renderImage({ onSwipeMove: vi.fn(), onSwipeEnd });
    drag(frame, [300, 400], [200, 400], { steps: 2, lift: false });
    fireEvent.touchStart(frame, { touches: [touch(200, 400), touch(260, 400)] });
    expect(onSwipeEnd).toHaveBeenCalledTimes(1);
    expect(onSwipeEnd.mock.calls[0]![0]).toMatchObject({ axis: 'x', cancelled: true });
    // …and the lift of the pinch is not reported as a swipe end.
    fireEvent.touchEnd(frame, { touches: [] });
    expect(onSwipeEnd).toHaveBeenCalledTimes(1);
  });

  it('a touch the system takes away ends the swipe as cancelled', () => {
    const onSwipeEnd = vi.fn();
    const { frame } = renderImage({ onSwipeMove: vi.fn(), onSwipeEnd });
    drag(frame, [300, 400], [200, 400], { steps: 2, lift: false });
    fireEvent.touchCancel(frame, { touches: [] });
    expect(onSwipeEnd).toHaveBeenCalledTimes(1);
    expect(onSwipeEnd.mock.calls[0]![0].cancelled).toBe(true);
  });

  it('a swipe is not a tap, and its click cannot dismiss', async () => {
    const onTap = vi.fn();
    const onDismiss = vi.fn();
    const { frame } = renderImage({ onSwipeMove: vi.fn(), onSwipeEnd: vi.fn(), onTap, onDismiss });
    drag(frame, [300, 400], [100, 400]);
    fireEvent.click(frame);
    expect(onDismiss).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 350));
    expect(onTap).not.toHaveBeenCalled();
  });
});

describe('ZoomableImage — taps', () => {
  it('a single tap arrives only after the double-tap window has passed', async () => {
    const onTap = vi.fn();
    const { frame } = renderImage({ onTap });
    tap(frame, 180, 400);
    expect(onTap).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 350));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('a double-tap zooms and never reports a tap', async () => {
    const onTap = vi.fn();
    const { frame, img } = renderImage({ onTap });
    tap(frame, 180, 400);
    tap(frame, 180, 400);
    expect(scaleOf(img)).toBeGreaterThan(2);
    await new Promise((r) => setTimeout(r, 350));
    expect(onTap).not.toHaveBeenCalled();
  });

  it('a mouse click is a tap at once — there is no touch sequence to wait on', () => {
    const onTap = vi.fn();
    const { img } = renderImage({ onTap });
    fireEvent.click(img);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('the click a touch leaves behind is not read a second time', async () => {
    const onTap = vi.fn();
    const { frame, img } = renderImage({ onTap });
    tap(frame, 180, 400);
    // Browsers follow a tap with a synthetic click on the same element.
    fireEvent.click(img);
    await new Promise((r) => setTimeout(r, 350));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('a pending tap is dropped when the picture changes', async () => {
    const onTap = vi.fn();
    const { frame, rerender } = renderImage({ onTap });
    tap(frame, 180, 400);
    rerender(<ZoomableImage src="https://s3.test/other.png" alt="card" onTap={onTap} />);
    await new Promise((r) => setTimeout(r, 350));
    expect(onTap).not.toHaveBeenCalled();
  });
});

describe('ZoomableImage — telling the caller about zoom', () => {
  it('says when the picture crosses between 1× and zoomed', () => {
    const onZoomChange = vi.fn();
    const { frame } = renderImage({ onZoomChange });
    expect(onZoomChange).toHaveBeenLastCalledWith(false);
    tap(frame, 180, 400);
    tap(frame, 180, 400);
    expect(onZoomChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByText('Fit to screen'));
    expect(onZoomChange).toHaveBeenLastCalledWith(false);
  });
});

describe('ZoomableImage — flush', () => {
  it('drops the padding and the rounding for an edge-to-edge viewer', () => {
    const { frame, img } = renderImage({ flush: true });
    expect(frame).not.toHaveClass('p-4');
    expect(img).not.toHaveClass('rounded-xl');
  });
});
