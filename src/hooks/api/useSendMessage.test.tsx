import { type InfiniteData } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { makeMessage, makeTestQueryClient, renderHookWithProviders, signIn } from '@/test/utils';
import type { Message } from '@dk/shared/types';

import { messagesQueryKey } from './useMessages';
import { useSendMessage } from './useSendMessage';

// Keep every real export; only stub the network call the mutation makes.
vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof import('@/lib/api')>();
  return { ...actual, api: { ...actual.api, post: vi.fn() } };
});

const KEY = messagesQueryKey('c1');
type Pages = InfiniteData<Message[]>;

function seed(messages: Message[]) {
  const qc = makeTestQueryClient();
  qc.setQueryData<Pages>(KEY, { pages: [messages], pageParams: [undefined] });
  const { result } = renderHookWithProviders(() => useSendMessage(), {
    queryClient: qc,
    withRouter: false,
  });
  return { qc, result };
}
const idsIn = (qc: ReturnType<typeof makeTestQueryClient>) =>
  (qc.getQueryData<Pages>(KEY)?.pages.flat() ?? []).map((m) => m.id);

describe('useSendMessage optimistic reconcile', () => {
  afterEach(() => vi.mocked(api.post).mockReset());

  it('onMutate prepends an optimistic temp message', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    vi.mocked(api.post).mockImplementation(() => new Promise(() => {})); // never resolves
    act(() => {
      result.current.mutate({ conversationId: 'c1', body: 'hi' });
    });
    await waitFor(() => {
      const first = qc.getQueryData<Pages>(KEY)!.pages[0][0];
      expect(first.id).toMatch(/^temp-/);
      expect(first.body).toBe('hi');
    });
  });

  it('onError rolls the cache back to the previous state', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([makeMessage({ id: 's1' })]);
    vi.mocked(api.post).mockRejectedValue(new Error('fail'));
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', body: 'hi' }).catch(() => {});
    });
    expect(idsIn(qc)).toEqual(['s1']);
  });

  it('branch 1 — socket echo already inserted the real msg: drops the temp, no duplicate', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    const real = makeMessage({ id: 'real-1', body: 'hi' });
    vi.mocked(api.post).mockImplementation(async () => {
      // The server echo lands (via socket) before the POST resolves.
      qc.setQueryData<Pages>(KEY, (old) => ({
        pages: [[real, ...(old?.pages[0] ?? [])]],
        pageParams: [undefined],
      }));
      return real;
    });
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', body: 'hi' });
    });
    const ids = idsIn(qc);
    expect(ids.filter((id) => id === 'real-1')).toHaveLength(1);
    expect(ids.some((id) => id.startsWith('temp-'))).toBe(false);
  });

  it('branch 2 — temp still present: replaces it in place', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    const real = makeMessage({ id: 'real-2', body: 'hi' });
    vi.mocked(api.post).mockResolvedValue(real);
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', body: 'hi' });
    });
    const ids = idsIn(qc);
    expect(ids).toContain('real-2');
    expect(ids.some((id) => id.startsWith('temp-'))).toBe(false);
  });

  it('branch 3 — temp gone AND real absent (a backfill wiped the pages mid-send): prepends the real msg', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    const real = makeMessage({ id: 'real-3', body: 'hi' });
    vi.mocked(api.post).mockImplementation(async () => {
      // A reconnect refetch replaced the cache with server pages lacking our msg.
      qc.setQueryData<Pages>(KEY, {
        pages: [[makeMessage({ id: 'other' })]],
        pageParams: [undefined],
      });
      return real;
    });
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', body: 'hi' });
    });
    const ids = idsIn(qc);
    expect(ids).toContain('real-3'); // recovered instead of lost
    expect(ids).toContain('other');
    expect(ids.filter((id) => id === 'real-3')).toHaveLength(1); // no double-insert
  });

  it('seeds the cache when it is empty at success time', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    const real = makeMessage({ id: 'real-4' });
    vi.mocked(api.post).mockImplementation(async () => {
      qc.removeQueries({ queryKey: KEY });
      return real;
    });
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', body: 'hi' });
    });
    expect(idsIn(qc)).toEqual(['real-4']);
  });
});
