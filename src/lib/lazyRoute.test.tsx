import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChunkErrorBoundary } from '@/components/ChunkErrorBoundary';
import { lazyRoute, preloadScreens, reloadForFreshCode } from '@/lib/lazyRoute';

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function Page() {
  return <div>the page</div>;
}

describe('reloadForFreshCode', () => {
  it('reloads once, then refuses for a minute so a broken release cannot loop', () => {
    const reload = vi.fn();
    expect(reloadForFreshCode(reload, 1_000_000)).toBe(true);
    expect(reloadForFreshCode(reload, 1_030_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadForFreshCode(reload, 1_061_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('refuses when the tab cannot remember that it reloaded', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const reload = vi.fn();
    expect(reloadForFreshCode(reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('lazyRoute', () => {
  it('opens a preloaded screen from the same download', async () => {
    const factory = vi.fn().mockResolvedValue({ default: Page });
    const Screen = lazyRoute(factory);
    await Screen.preload();
    render(
      <React.Suspense fallback={<div>loading</div>}>
        <Screen />
      </React.Suspense>,
    );
    expect(await screen.findByText('the page')).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('a failed preload throws nothing, and opening the screen asks again', async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValue({ default: Page });
    const Screen = lazyRoute(factory, () => false);
    await expect(Screen.preload()).resolves.toBeUndefined();
    render(
      <React.Suspense fallback={<div>loading</div>}>
        <Screen />
      </React.Suspense>,
    );
    expect(await screen.findByText('the page')).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('reloads the page instead of showing an error when the code will not load', async () => {
    const reload = vi.fn(() => true);
    const Screen = lazyRoute(
      () => Promise.reject(new Error('Failed to fetch dynamically imported module')),
      reload,
    );
    render(
      <ChunkErrorBoundary onReload={() => {}}>
        <React.Suspense fallback={<div>loading</div>}>
          <Screen />
        </React.Suspense>
      </ChunkErrorBoundary>,
    );
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText(/Something didn.t load/)).not.toBeInTheDocument();
  });

  it('shows the Try again screen when the reload was already spent', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // expected boundary noise
    const Screen = lazyRoute(
      () => Promise.reject(new Error('Failed to fetch dynamically imported module')),
      () => false,
    );
    render(
      <ChunkErrorBoundary onReload={() => {}}>
        <React.Suspense fallback={<div>loading</div>}>
          <Screen />
        </React.Suspense>
      </ChunkErrorBoundary>,
    );
    expect(await screen.findByText(/Something didn.t load/)).toBeInTheDocument();
  });
});

describe('preloadScreens', () => {
  it('downloads the screens one after another once the app is idle', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const make = (name: string) => ({
      preload: vi.fn(async () => {
        order.push(name);
      }),
    });
    const a = make('a');
    const b = make('b');
    preloadScreens([a, b], [a], { delayMs: 100 });
    expect(order).toEqual([]);
    await vi.advanceTimersByTimeAsync(3_200);
    expect(order).toEqual(['a', 'b']);
  });

  it('downloads nothing when the phone is saving data, and stops when cancelled', async () => {
    vi.useFakeTimers();
    const a = { preload: vi.fn(async () => {}) };
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    });
    try {
      preloadScreens([a], [a], { delayMs: 0 });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(a.preload).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
    }
    const cancel = preloadScreens([a], [a], { delayMs: 100 });
    cancel();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(a.preload).not.toHaveBeenCalled();
  });
});
