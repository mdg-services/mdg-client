import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { makeMessage, makeTestQueryClient, renderHookWithProviders } from '@/test/utils';
import type { Message } from '@dk/shared/types';

import { aliasMessageId, messagesQueryKey, renderKey, useMessages } from './useMessages';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

const KEY = messagesQueryKey('c1');
type Pages = InfiniteData<Message[]>;

/** A page of `n` messages, oldest first, ending at minute `endMin`. */
function page(n: number, endMin: number, prefix = 'm'): Message[] {
  return Array.from({ length: n }, (_, i) =>
    makeMessage({
      id: `${prefix}${endMin - n + 1 + i}`,
      createdAt: new Date(2026, 0, 1, 12, endMin - n + 1 + i).toISOString(),
    }),
  );
}

afterEach(() => vi.mocked(api.get).mockReset());

describe('useMessages — paging', () => {
  it('asks for the newest 30, with no cursor', async () => {
    vi.mocked(api.get).mockResolvedValue(page(5, 5));
    const { result } = renderHookWithProviders(() => useMessages('c1'), { withRouter: false });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/v1/conversations/c1/messages', {
      before: undefined,
      limit: 30,
    });
  });

  it('says there is nothing older when the page is short', async () => {
    vi.mocked(api.get).mockResolvedValue(page(29, 29));
    const { result } = renderHookWithProviders(() => useMessages('c1'), { withRouter: false });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('a full page means there may be more, and the cursor is the page\'s OLDEST time', async () => {
    const full = page(30, 40); // minutes 11..40
    vi.mocked(api.get).mockResolvedValueOnce(full);
    const { result } = renderHookWithProviders(() => useMessages('c1'), { withRouter: false });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    vi.mocked(api.get).mockResolvedValueOnce(page(10, 10));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(vi.mocked(api.get).mock.calls[1]![1]).toEqual({
      before: full[0]!.createdAt,
      limit: 30,
    });
  });

  it('a live message put at the FRONT of the only page does not become the cursor', async () => {
    // The socket puts a new message at the start of the newest page. When that
    // is the only page, "index 0" stopped being the oldest, the next request
    // asked for everything before the NEWEST message, and the thread was drawn
    // twice.
    const full = page(30, 40);
    vi.mocked(api.get).mockResolvedValueOnce(full);
    const qc = makeTestQueryClient();
    const { result } = renderHookWithProviders(() => useMessages('c1'), {
      queryClient: qc,
      withRouter: false,
    });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));

    const live = makeMessage({ id: 'live', createdAt: new Date(2026, 0, 1, 12, 59).toISOString() });
    act(() => {
      qc.setQueryData<Pages>(KEY, (old) => ({
        ...old!,
        pages: [[live, ...old!.pages[0]!]],
      }));
    });
    vi.mocked(api.get).mockResolvedValueOnce(page(5, 10));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(vi.mocked(api.get).mock.calls[1]![1]).toEqual({
      before: full[0]!.createdAt, // the oldest of the page, not `live`
      limit: 30,
    });
  });

  it('a bubble still being sent does not make a short page look full', async () => {
    vi.mocked(api.get).mockResolvedValue(page(28, 28));
    const qc = makeTestQueryClient();
    qc.setQueryData<Pages>(KEY, {
      pages: [[makeMessage({ id: 'temp-1-1' }), makeMessage({ id: 'temp-2-2' }), ...page(28, 28)]],
      pageParams: [undefined],
    });
    const { result } = renderHookWithProviders(() => useMessages('c1'), {
      queryClient: qc,
      withRouter: false,
    });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.hasNextPage).toBe(false);
  });
});

describe('useMessages — opening a chat', () => {
  it('always asks the server again, even for a thread cached a moment ago', async () => {
    // The app\'s own freshness window is two minutes. A thread the dealer left a
    // minute ago has heard nothing since, because only the OPEN thread listens.
    const qc = new QueryClient({
      defaultOptions: { queries: { staleTime: 120_000, retry: false, gcTime: Infinity } },
    });
    qc.setQueryData<Pages>(KEY, { pages: [page(3, 3)], pageParams: [undefined] });
    vi.mocked(api.get).mockResolvedValue([...page(3, 3), ...page(2, 5, 'n')]);
    const { result } = renderHookWithProviders(() => useMessages('c1'), {
      queryClient: qc,
      withRouter: false,
    });
    // The cached messages are on screen at once…
    expect(result.current.data?.pages[0]).toHaveLength(3);
    // …and the fresh answer replaces them.
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.data?.pages[0]).toHaveLength(5));
    expect(result.current.isFetchedAfterMount).toBe(true);
  });

  it('does nothing without a conversation', () => {
    renderHookWithProviders(() => useMessages(undefined), { withRouter: false });
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('useMessages — a refetch while a message is still being sent', () => {
  it('keeps the unsent bubble: it is not in the server\'s answer, and must not vanish from under the sender', async () => {
    const temp = makeMessage({ id: 'temp-9-9', body: 'uploading a photo' });
    const qc = makeTestQueryClient();
    qc.setQueryData<Pages>(KEY, { pages: [[temp, ...page(3, 3)]], pageParams: [undefined] });
    vi.mocked(api.get).mockResolvedValue(page(3, 3));
    const { result } = renderHookWithProviders(() => useMessages('c1'), {
      queryClient: qc,
      withRouter: false,
    });
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    const ids = result.current.data!.pages.flat().map((m) => m.id);
    expect(ids).toContain('temp-9-9');
    expect(ids).toEqual(expect.arrayContaining(['m1', 'm2', 'm3']));
  });

  it('only the newest page carries them — older pages are the server\'s alone', async () => {
    const temp = makeMessage({ id: 'temp-1-1' });
    const qc = makeTestQueryClient();
    qc.setQueryData<Pages>(KEY, {
      pages: [[temp, ...page(30, 60)], page(30, 30, 'old')],
      pageParams: [undefined, '2026-01-01T12:31:00.000Z'],
    });
    vi.mocked(api.get).mockImplementation(async (_path, query) =>
      query && (query as { before?: string }).before ? page(30, 30, 'old') : page(30, 60),
    );
    const { result } = renderHookWithProviders(() => useMessages('c1'), {
      queryClient: qc,
      withRouter: false,
    });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    const [newest, older] = result.current.data!.pages;
    expect(newest!.some((m) => m.id === 'temp-1-1')).toBe(true);
    expect(older!.some((m) => m.id.startsWith('temp-'))).toBe(false);
  });
});

describe('renderKey — a confirmed message keeps the row of the placeholder it replaced', () => {
  it('answers with the placeholder\'s id for an aliased message, and the id itself otherwise', () => {
    aliasMessageId('real-a', 'temp-a');
    expect(renderKey('real-a')).toBe('temp-a');
    expect(renderKey('never-aliased')).toBe('never-aliased');
  });

  it('is bounded: a session cannot grow it without end', () => {
    for (let i = 0; i < 260; i += 1) aliasMessageId(`real-${i}`, `temp-${i}`);
    // The oldest were let go; the newest are all still there.
    expect(renderKey('real-0')).toBe('real-0');
    expect(renderKey('real-259')).toBe('temp-259');
  });
});
