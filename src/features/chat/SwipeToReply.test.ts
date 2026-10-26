import { fireEvent, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LONG_PRESS_MS } from '@/lib/useLongPress';
import { makeMessage } from '@/test/utils';


import {
  SwipeToReply,
  SWIPE_EDGE_GUARD_PX,
  SWIPE_ENGAGE_PX,
  SWIPE_HOLD_DISARM_MS,
  SWIPE_MAX_PX,
  SWIPE_TRIGGER_PX,
  swipeEngaged,
  swipeHoldExpired,
  swipeOffset,
  swipeTriggered,
} from './SwipeToReply';

describe('swipeEngaged', () => {
  it('requires more than the horizontal threshold', () => {
    expect(swipeEngaged(SWIPE_ENGAGE_PX, 0)).toBe(false);
    expect(swipeEngaged(SWIPE_ENGAGE_PX + 1, 0)).toBe(true);
  });

  it('requires horizontal dominance over vertical (1.8×)', () => {
    expect(swipeEngaged(20, 10)).toBe(true); // 20 > 18
    expect(swipeEngaged(20, 12)).toBe(false); // 20 < 21.6
    expect(swipeEngaged(18, 10)).toBe(false); // exactly 1.8× is not enough
  });

  it('treats leftward travel symmetrically (engagement only)', () => {
    expect(swipeEngaged(-30, 5)).toBe(true);
  });

  it('never engages on a vertical scroll', () => {
    expect(swipeEngaged(4, 80)).toBe(false);
    expect(swipeEngaged(0, 200)).toBe(false);
  });
});

describe('swipeOffset', () => {
  it('ignores leftward drags entirely', () => {
    expect(swipeOffset(-40)).toBe(0);
    expect(swipeOffset(0)).toBe(0);
  });

  it('tracks the finger 1:1 up to the trigger point', () => {
    expect(swipeOffset(30)).toBe(30);
    expect(swipeOffset(SWIPE_TRIGGER_PX)).toBe(SWIPE_TRIGGER_PX);
  });

  it('adds resistance past the trigger point', () => {
    const past = swipeOffset(SWIPE_TRIGGER_PX + 20);
    expect(past).toBeGreaterThan(SWIPE_TRIGGER_PX);
    expect(past).toBeLessThan(SWIPE_TRIGGER_PX + 20);
  });

  it('hard-caps at the maximum', () => {
    expect(swipeOffset(500)).toBe(SWIPE_MAX_PX);
    expect(swipeOffset(10_000)).toBe(SWIPE_MAX_PX);
  });
});

describe('swipeTriggered', () => {
  it('fires exactly at the trigger distance', () => {
    expect(swipeTriggered(SWIPE_TRIGGER_PX - 1)).toBe(false);
    expect(swipeTriggered(SWIPE_TRIGGER_PX)).toBe(true);
    expect(swipeTriggered(SWIPE_MAX_PX)).toBe(true);
  });
});

describe('swipeHoldExpired', () => {
  it('disarms an unengaged touch exactly at the hold threshold', () => {
    expect(swipeHoldExpired(SWIPE_HOLD_DISARM_MS - 1)).toBe(false);
    expect(swipeHoldExpired(SWIPE_HOLD_DISARM_MS)).toBe(true);
    expect(swipeHoldExpired(SWIPE_HOLD_DISARM_MS + 5000)).toBe(true);
  });

  it('expires BEFORE the long-press fires, so one touch can never do both', () => {
    expect(SWIPE_HOLD_DISARM_MS).toBeLessThan(LONG_PRESS_MS);
  });
});

describe('SwipeToReply — the row', () => {
  const message = makeMessage({ id: 'row-1' });
  const row = (
    props: Partial<React.ComponentProps<typeof SwipeToReply>> = {},
    child: React.ReactNode = React.createElement('span', { 'data-testid': 'child' }, 'hi'),
  ) =>
    React.createElement(
      SwipeToReply,
      { message, onReply: () => {}, 'data-mid': 'row-1', ...props } as never,
      child,
    );

  // Starts a little in from the edge: the edge itself is the phone's back swipe.
  const swipeRight = (target: Element, type = 'touch', dx = 90, startX = 40) => {
    fireEvent.pointerDown(target, { pointerType: type, pointerId: 1, clientX: startX, clientY: 0 });
    fireEvent.pointerMove(target, { pointerType: type, pointerId: 1, clientX: startX + dx, clientY: 2 });
    fireEvent.pointerUp(target, { pointerType: type, pointerId: 1, clientX: startX + dx, clientY: 2 });
  };

  it('keeps the caller\'s classes AND the `relative` the reply icon is placed by', () => {
    // The caller's classes used to be thrown away (spread first, className set after),
    // which is what stopped a row from carrying its padding and its selected tint.
    const { container } = render(row({ className: 'px-3 pt-2 bg-wa-select' }));
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('relative');
    expect(el.className).toContain('px-3');
    expect(el.className).toContain('bg-wa-select');
    expect(el.getAttribute('data-mid')).toBe('row-1');
  });

  it('passes other attributes and handlers through to the row', () => {
    const onClickCapture = vi.fn();
    const { container } = render(row({ onClickCapture, 'data-day': 'Today' } as never));
    fireEvent.click(container.querySelector('[data-testid="child"]')!);
    expect(onClickCapture).toHaveBeenCalledTimes(1);
    expect((container.firstElementChild as HTMLElement).getAttribute('data-day')).toBe('Today');
  });

  it('replies to the row\'s message after a rightward swipe by a finger', () => {
    const onReply = vi.fn();
    const { container } = render(row({ onReply }));
    swipeRight(container.firstElementChild!);
    expect(onReply).toHaveBeenCalledWith(message);
  });

  describe('the tick when the reply fires', () => {
    afterEach(() => {
      delete (navigator as unknown as { vibrate?: unknown }).vibrate;
      delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
    });

    it('vibrates where the web view can', () => {
      const vibrate = vi.fn(() => true);
      Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
      const { container } = render(row({ onReply: vi.fn() }));
      swipeRight(container.firstElementChild!);
      expect(vibrate).toHaveBeenCalledWith(10);
    });

    it('asks the shell for a tap on an iPhone, and only when the reply really fires', () => {
      const postMessage = vi.fn();
      (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };
      const { container } = render(row({ onReply: vi.fn() }));
      swipeRight(container.firstElementChild!, 'touch', 30); // too short: no reply, no tick
      expect(postMessage).not.toHaveBeenCalled();
      swipeRight(container.firstElementChild!);
      expect(postMessage.mock.calls.map(([m]) => JSON.parse(m as string))).toEqual([
        { type: 'haptic', style: 'light' },
      ]);
    });
  });

  it('does not reply to a short swipe, a mouse, or a disabled row', () => {
    const onReply = vi.fn();
    const short = render(row({ onReply }));
    swipeRight(short.container.firstElementChild!, 'touch', 30);
    short.unmount();
    const mouse = render(row({ onReply }));
    swipeRight(mouse.container.firstElementChild!, 'mouse');
    mouse.unmount();
    const off = render(row({ onReply, disabled: true }));
    swipeRight(off.container.firstElementChild!);
    expect(onReply).not.toHaveBeenCalled();
  });

  // The phone's back swipe starts at the edge and drags right, just like this
  // gesture. The edge is the phone's; the row only answers a touch that starts
  // clear of it.
  it('ignores a swipe that starts at the left screen edge, where the phone\'s back swipe lives', () => {
    const onReply = vi.fn();
    const { container } = render(row({ onReply }));
    swipeRight(container.firstElementChild!, 'touch', 90, 0);
    swipeRight(container.firstElementChild!, 'touch', 90, SWIPE_EDGE_GUARD_PX - 1);
    expect(onReply).not.toHaveBeenCalled();
    swipeRight(container.firstElementChild!, 'touch', 90, SWIPE_EDGE_GUARD_PX);
    expect(onReply).toHaveBeenCalledWith(message);
  });

  it('stays out of the way of anything marked data-no-swipe (the voice scrubber)', () => {
    const onReply = vi.fn();
    const { container } = render(
      row({ onReply }, React.createElement('div', { 'data-no-swipe': '', 'data-testid': 'scrub' })),
    );
    swipeRight(container.querySelector('[data-testid="scrub"]')!);
    expect(onReply).not.toHaveBeenCalled();
  });
});

