import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import {
  makeTestQueryClient,
  makeUser,
  renderHookWithProviders,
  resetStores,
  signIn,
} from '@/test/utils';

import { useMe } from './useMe';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof import('@/lib/api')>();
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

describe('useMe', () => {
  afterEach(() => {
    vi.mocked(api.get).mockReset();
    resetStores();
  });

  it('does not fetch without a token', () => {
    const { result } = renderHookWithProviders(() => useMe(), { withRouter: false });
    expect(result.current.fetchStatus).toBe('idle');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('fetches /me when a token exists and stores the returned user', async () => {
    signIn({ id: 'u1', name: 'Old' });
    vi.mocked(api.get).mockResolvedValue(makeUser({ id: 'u1', name: 'Fresh' }));
    const { result } = renderHookWithProviders(() => useMe(), { withRouter: false });
    await waitFor(() => expect(result.current.data?.name).toBe('Fresh'));
    expect(useAuthStore.getState().user?.name).toBe('Fresh');
  });

  it('does not refetch within the 10-minute staleTime on remount', async () => {
    signIn({ id: 'u1' });
    vi.mocked(api.get).mockResolvedValue(makeUser({ id: 'u1' }));
    const queryClient = makeTestQueryClient();

    const first = renderHookWithProviders(() => useMe(), {
      withRouter: false,
      queryClient,
    });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    first.unmount();

    // Remount against the same cache: the query's own 10-min staleTime keeps it
    // fresh, so no second /me fetch (overrides the test client's staleTime:0).
    renderHookWithProviders(() => useMe(), { withRouter: false, queryClient });
    await new Promise((r) => setTimeout(r, 20));
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
