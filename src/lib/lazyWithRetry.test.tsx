import { describe, expect, it, vi } from 'vitest';

import { retryDynamicImport } from '@/lib/lazyWithRetry';

// baseDelayMs is tiny so the real backoff timers don't slow the suite.
const FAST = { baseDelayMs: 1 };

describe('retryDynamicImport', () => {
  it('resolves on the first attempt with no retry', async () => {
    const factory = vi.fn().mockResolvedValue({ default: 'X' });
    await expect(retryDynamicImport(factory, FAST)).resolves.toEqual({ default: 'X' });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('retries after failures then succeeds (3 attempts by default)', async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error('drop'))
      .mockRejectedValueOnce(new Error('drop'))
      .mockResolvedValue({ default: 'X' });
    await expect(retryDynamicImport(factory, FAST)).resolves.toEqual({ default: 'X' });
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('rethrows the last error after exhausting all attempts', async () => {
    const factory = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(retryDynamicImport(factory, FAST)).rejects.toThrow('boom');
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('honours a custom retries count (0 retries = single attempt)', async () => {
    const factory = vi.fn().mockRejectedValue(new Error('x'));
    await expect(retryDynamicImport(factory, { retries: 0, baseDelayMs: 1 })).rejects.toThrow('x');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('uses an increasing backoff between attempts', async () => {
    vi.useFakeTimers();
    try {
      const factory = vi
        .fn()
        .mockRejectedValueOnce(new Error('a'))
        .mockRejectedValueOnce(new Error('b'))
        .mockResolvedValue({ default: 'X' });
      const p = retryDynamicImport(factory, { baseDelayMs: 100 });

      // After the 1st failure it waits 100ms (attempt 0 → 100*1).
      await vi.advanceTimersByTimeAsync(99);
      expect(factory).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(factory).toHaveBeenCalledTimes(2);

      // After the 2nd failure it waits 200ms (attempt 1 → 100*2).
      await vi.advanceTimersByTimeAsync(199);
      expect(factory).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(factory).toHaveBeenCalledTimes(3);

      await expect(p).resolves.toEqual({ default: 'X' });
    } finally {
      vi.useRealTimers();
    }
  });
});
