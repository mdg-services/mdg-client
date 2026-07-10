import { describe, expect, it } from 'vitest';

import { LONG_PRESS_MS } from '@/lib/useLongPress';

import {
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
