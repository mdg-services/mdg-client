import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { invalidateTodayFeed, todayFeedKey } from './useTodayFeed';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('invalidateTodayFeed', () => {
  it('goes through at once the first time', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    invalidateTodayFeed(qc);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: todayFeedKey });
  });

  it('folds a burst of chat events into one more request, not one per message', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    // Ten messages arrive on the Chats tab inside a few seconds.
    for (let i = 0; i < 10; i += 1) {
      invalidateTodayFeed(qc);
      vi.advanceTimersByTime(100);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1500);
    expect(spy).toHaveBeenCalledTimes(2);
    // Quiet again: nothing more is asked for.
    vi.advanceTimersByTime(10_000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('asks again at once after a quiet spell', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    invalidateTodayFeed(qc);
    vi.advanceTimersByTime(5000);
    invalidateTodayFeed(qc);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('keeps each query client to its own window', () => {
    const a = new QueryClient();
    const b = new QueryClient();
    const spyB = vi.spyOn(b, 'invalidateQueries');
    invalidateTodayFeed(a);
    invalidateTodayFeed(b);
    expect(spyB).toHaveBeenCalledTimes(1);
  });
});
