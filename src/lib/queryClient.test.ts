import { describe, expect, it } from 'vitest';

import { queryClient } from '@/lib/queryClient';

describe('queryClient defaults (low-bandwidth tuning)', () => {
  const queries = queryClient.getDefaultOptions().queries!;
  const mutations = queryClient.getDefaultOptions().mutations!;

  it('uses a 2-minute staleTime and a single retry', () => {
    expect(queries.staleTime).toBe(120_000);
    expect(queries.retry).toBe(1);
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
