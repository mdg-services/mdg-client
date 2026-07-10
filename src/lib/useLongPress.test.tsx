import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GHOST_CLICK_GRACE_MS, LONG_PRESS_MS, useLongPress } from './useLongPress';

function Target({
  onLongPress,
  disabled,
}: {
  onLongPress: () => void;
  disabled?: boolean;
}) {
  const handlers = useLongPress(onLongPress, { disabled });
  return (
    <div data-testid="t" {...handlers}>
      press me
    </div>
  );
}

// jsdom has no PointerEvent constructor — testing-library's fireEvent.pointer*
// falls back to a bare Event and DROPS clientX/clientY. Dispatch MouseEvents
// (which carry coordinates) under the pointer event names instead; React's
// listeners key on the event TYPE, so the synthetic handlers still fire.
function firePointer(
  el: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  { x = 0, y = 0, pointerId = 1 }: { x?: number; y?: number; pointerId?: number } = {},
) {
  const ev = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.assign(ev, { pointerId, pointerType: 'touch' });
  fireEvent(el, ev);
}
const down = (el: Element, x = 10, y = 10) => firePointer(el, 'pointerdown', { x, y });
const move = (el: Element, x: number, y: number) =>
  firePointer(el, 'pointermove', { x, y });

describe('useLongPress', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires after the hold duration', () => {
    const cb = vi.fn();
    render(<Target onLongPress={cb} />);
    down(screen.getByTestId('t'));
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cancels when the pointer lifts before the timer', () => {
    const cb = vi.fn();
    render(<Target onLongPress={cb} />);
    const el = screen.getByTestId('t');
    down(el);
    vi.advanceTimersByTime(200);
    firePointer(el, 'pointerup');
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(cb).not.toHaveBeenCalled();
  });

  it('cancels when the finger drifts past the slop (a scroll, not a press)', () => {
    const cb = vi.fn();
    render(<Target onLongPress={cb} />);
    const el = screen.getByTestId('t');
    down(el, 10, 10);
    move(el, 10, 25); // 15px vertical drift > 10px slop
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(cb).not.toHaveBeenCalled();
  });

  it('tolerates jitter inside the slop', () => {
    const cb = vi.fn();
    render(<Target onLongPress={cb} />);
    const el = screen.getByTestId('t');
    down(el, 10, 10);
    move(el, 14, 13); // ~5px — still a press
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cancels on pointercancel', () => {
    const cb = vi.fn();
    render(<Target onLongPress={cb} />);
    const el = screen.getByTestId('t');
    down(el);
    firePointer(el, 'pointercancel');
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(cb).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const cb = vi.fn();
    render(<Target onLongPress={cb} disabled />);
    down(screen.getByTestId('t'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(cb).not.toHaveBeenCalled();
  });

  it('swallows the trailing ghost click after firing', () => {
    const cb = vi.fn();
    const clickSpy = vi.fn();
    render(
      <button type="button" onClick={clickSpy}>
        <Target onLongPress={cb} />
      </button>,
    );
    const el = screen.getByTestId('t');
    down(el);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(cb).toHaveBeenCalled();
    // The synthetic click that follows the pointer sequence must not activate
    // the underlying control.
    fireEvent.click(el);
    expect(clickSpy).not.toHaveBeenCalled();
    // …but the NEXT genuine click works again.
    vi.advanceTimersByTime(600);
    fireEvent.click(el);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('still swallows a ghost click emitted only on release, long after firing', () => {
    const cb = vi.fn();
    const clickSpy = vi.fn();
    render(
      <button type="button" onClick={clickSpy}>
        <Target onLongPress={cb} />
      </button>,
    );
    const el = screen.getByTestId('t');
    down(el);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(cb).toHaveBeenCalled();
    // Finger stays down well past any fixed TTL (sheet already open) …
    vi.advanceTimersByTime(1050); // ~1.5s into the hold
    // … and the browser emits the trailing click only on release (iOS
    // WKWebView / older Android WebViews).
    firePointer(el, 'pointerup');
    fireEvent.click(el);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('does NOT eat a later legitimate tap when no ghost click was emitted', () => {
    const cb = vi.fn();
    const clickSpy = vi.fn();
    render(
      <button type="button" onClick={clickSpy}>
        <Target onLongPress={cb} />
      </button>,
    );
    const el = screen.getByTestId('t');
    down(el);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(cb).toHaveBeenCalled();
    // Release with NO trailing click (modern Android Chrome after a prevented
    // contextmenu). The swallow must disarm shortly after the release …
    firePointer(el, 'pointerup');
    vi.advanceTimersByTime(GHOST_CLICK_GRACE_MS + 100);
    // … so the user's next real tap (e.g. a quick-reaction emoji) works.
    fireEvent.click(el);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('a new pointerdown clears any stale swallow (safety net)', () => {
    const cb = vi.fn();
    const clickSpy = vi.fn();
    render(
      <button type="button" onClick={clickSpy}>
        <Target onLongPress={cb} />
      </button>,
    );
    const el = screen.getByTestId('t');
    down(el);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    firePointer(el, 'pointerup');
    // Next tap begins INSIDE the grace window — its own click must not be eaten.
    down(el);
    firePointer(el, 'pointerup');
    fireEvent.click(el);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
