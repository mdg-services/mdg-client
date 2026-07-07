import * as React from 'react';

export interface RetryOptions {
  /** Extra attempts after the first (default 2 → 3 total tries). */
  retries?: number;
  /** Base backoff in ms; attempt n waits baseDelayMs * (n + 1). */
  baseDelayMs?: number;
}

/**
 * Await a dynamic import, retrying a few times before giving up. Target users are
 * on 2G/patchy links where a chunk request can drop; a bare import would fail the
 * whole navigation on the first miss. Exhausting all attempts rethrows the last
 * error so a wrapping error boundary can offer a reload.
 */
export async function retryDynamicImport<T>(
  factory: () => Promise<T>,
  { retries = 2, baseDelayMs = 500 }: RetryOptions = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await factory();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

/**
 * React.lazy with the retry behaviour above, so a dropped route-chunk request on
 * a flaky link doesn't fail the whole navigation.
 */
export function lazyWithRetry<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches React.lazy's own constraint; pages have heterogeneous prop types
  T extends React.ComponentType<any>,
>(
  factory: () => Promise<{ default: T }>,
  options?: RetryOptions,
): React.LazyExoticComponent<T> {
  return React.lazy(() => retryDynamicImport(factory, options));
}
