import * as React from 'react';

/** How long after one automatic reload another is refused, so a deploy that is
 * genuinely broken shows the "Try again" screen instead of reloading in a loop. */
const RELOAD_GUARD_MS = 60_000;
const RELOAD_KEY = 'dk:freshCodeReloadAt';

/**
 * Reload the page once to pick up the code the server has now, unless that was
 * already done in the last minute. Returns whether a reload was started.
 *
 * Refuses when this tab's storage cannot be written: without the timestamp, the
 * next page could not tell it had just reloaded, and a broken deploy would loop.
 */
export function reloadForFreshCode(
  reload: () => void = () => window.location.reload(),
  now: number = Date.now(),
): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0;
    if (now - last < RELOAD_GUARD_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches React.lazy's own constraint; pages have heterogeneous prop types
export type RouteComponent<T extends React.ComponentType<any>> = React.LazyExoticComponent<T> & {
  /** Download the screen's code now, so opening it later needs no network. Never throws. */
  preload: () => Promise<void>;
};

/**
 * React.lazy for a whole screen, with two things it lacks.
 *
 * `preload()` starts the download ahead of the tap, and the screen then opens
 * from the same promise, so a preloaded screen needs no network when it opens.
 *
 * A screen whose code will not load gets the page RELOADED, once, instead of
 * retried. Retrying is useless: the browser remembers a failed module by its
 * address and fails every later import of it without asking the network again.
 * And the usual cause is not a dropped connection but a new release — the page
 * still running the old one asks for a file the server no longer has. A reload
 * fetches the current index.html, which names the files that do exist. The
 * address bar already holds the screen the dealer tapped, so the reload opens
 * it. While the reload starts, the import stays pending, so the dealer keeps
 * seeing the screen they were on rather than an error. If a reload was already
 * spent in the last minute, the error goes to the app's "Try again" screen.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see RouteComponent
export function lazyRoute<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  reload: () => boolean = reloadForFreshCode,
): RouteComponent<T> {
  let loading: Promise<{ default: T }> | null = null;
  const load = () => {
    if (!loading) {
      loading = factory().catch((err: unknown) => {
        // Forget the failure, so the next attempt asks again (and can reload).
        loading = null;
        throw err;
      });
    }
    return loading;
  };
  const Component = React.lazy(() =>
    load().catch((err: unknown) => {
      if (reload()) return new Promise<never>(() => {});
      throw err;
    }),
  ) as RouteComponent<T>;
  Component.preload = () => load().then(
    () => undefined,
    () => undefined,
  );
  return Component;
}

type Preloadable = { preload: () => Promise<void> };

/**
 * Download the given screens one after another, once the app has drawn its first
 * screen and the phone is idle, so later taps open at once.
 *
 * One at a time, after a pause, so the chat list's own data goes first on a slow
 * link. A dealer who has asked the phone to save data gets none; on a 2G link
 * only the `slowLink` screens come down (the ones opened most).
 */
export function preloadScreens(
  all: Preloadable[],
  slowLink: Preloadable[],
  { delayMs = 2_500 }: { delayMs?: number } = {},
): () => void {
  let cancelled = false;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (connection?.saveData) return () => {};
  const list = /(^|-)2g$/.test(connection?.effectiveType ?? '') ? slowLink : all;

  const idle = (fn: () => void) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 3_000 });
    else window.setTimeout(fn, 0);
  };

  const timer = window.setTimeout(() => {
    idle(async () => {
      for (const screen of list) {
        if (cancelled) return;
        await screen.preload();
      }
    });
  }, delayMs);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
