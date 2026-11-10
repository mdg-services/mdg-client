import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';
import { queryClient, shouldRetry } from '@/lib/queryClient';

describe('queryClient defaults (low-bandwidth tuning)', () => {
  const queries = queryClient.getDefaultOptions().queries!;
  const mutations = queryClient.getDefaultOptions().mutations!;

  it('uses a 2-minute staleTime and a single retry', () => {
    expect(queries.staleTime).toBe(120_000);
    expect(queries.retry).toBe(shouldRetry);
    expect(shouldRetry(0, new ApiError(0, 'TIMEOUT', 't'))).toBe(true);
    expect(shouldRetry(1, new ApiError(0, 'TIMEOUT', 't'))).toBe(false);
  });

  it('retries what asking again can fix, and not a refusal', () => {
    expect(shouldRetry(0, new ApiError(0, 'NETWORK_ERROR', 'n'))).toBe(true);
    expect(shouldRetry(0, new ApiError(503, 'HTTP_503', 's'))).toBe(true);
    expect(shouldRetry(0, new ApiError(429, 'HTTP_429', 's'))).toBe(true);
    expect(shouldRetry(0, new ApiError(408, 'HTTP_408', 's'))).toBe(true);
    expect(shouldRetry(0, new ApiError(404, 'NOT_FOUND', 'n'))).toBe(false);
    expect(shouldRetry(0, new ApiError(403, 'FORBIDDEN', 'f'))).toBe(false);
    expect(shouldRetry(0, new Error('anything else'))).toBe(true);
  });

  it('disables refetch-on-window-focus (the WebView focus storm)', () => {
    expect(queries.refetchOnWindowFocus).toBe(false);
  });

  it('leaves refetchOnReconnect at its default so the network-drop backfill survives', () => {
    // Not set explicitly → RQ default true. It must NOT be forced to false.
    expect(queries.refetchOnReconnect).not.toBe(false);
  });

  it('disables mutation retries (writes may have already landed)', () => {
    expect(mutations.retry).toBe(0);
  });
});
