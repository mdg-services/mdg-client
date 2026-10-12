import { act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { renderHookWithProviders } from '@/test/utils';
import type { MessageSearchHit } from '@dk/shared/types';

import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MAX_CHARS,
  normaliseSearchTerm,
  useMessageSearch,
} from './useMessageSearch';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

const hit = (id: string): MessageSearchHit => ({
  messageId: id,
  senderId: 'x',
  createdAt: '2026-10-12T09:00:00.000Z',
  snippet: 'rate',
});

function mount(initial: string, conversationId: { id: string | undefined } = { id: 'c1' }) {
  return renderHookWithProviders(
    ({ term }: { term: string }) => useMessageSearch(conversationId.id, term),
    { initialProps: { term: initial }, withRouter: false },
  );
}

afterEach(() => {
  vi.mocked(api.get).mockReset();
  vi.useRealTimers();
});

describe('normaliseSearchTerm', () => {
  it('trims, and cuts to the longest word the server accepts', () => {
    expect(normaliseSearchTerm('  dal rate  ')).toBe('dal rate');
    expect(normaliseSearchTerm('x'.repeat(250))).toHaveLength(SEARCH_MAX_CHARS);
    // Cutting must not leave a trailing space behind.
    expect(normaliseSearchTerm(`${'x'.repeat(99)} yyy`)).toBe('x'.repeat(99));
  });
});

describe('useMessageSearch', () => {
  it('asks the server for the thread\'s newest-first hits, with the term as `q`', async () => {
    vi.mocked(api.get).mockResolvedValue([hit('a'), hit('b')]);
    const { result } = mount('rate');
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(api.get).toHaveBeenCalledTimes(1);
    const [path, query] = vi.mocked(api.get).mock.calls[0]!;
    expect(path).toBe('/v1/conversations/c1/messages/search');
    expect(query).toEqual({ q: 'rate' });
    expect(result.current.hits.map((h) => h.messageId)).toEqual(['a', 'b']);
    expect(result.current.term).toBe('rate');
  });

  it('sends nothing for fewer than two letters', async () => {
    const { result, rerender } = mount('r');
    await act(async () => {
      await new Promise((r) => setTimeout(r, SEARCH_DEBOUNCE_MS + 50));
    });
    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.ready).toBe(false);
    expect(result.current.hits).toEqual([]);
    rerender({ term: '   ' });
    expect(api.get).not.toHaveBeenCalled();
  });

  it('sends nothing without a conversation', async () => {
    const { result } = mount('rate', { id: undefined });
    await act(async () => {
      await new Promise((r) => setTimeout(r, SEARCH_DEBOUNCE_MS + 50));
    });
    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.ready).toBe(false);
  });

  it('waits for typing to pause: a word typed letter by letter is ONE request', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const { result, rerender } = mount('r');
    expect(result.current.pending).toBe(false);
    rerender({ term: 'ra' });
    rerender({ term: 'rat' });
    expect(result.current.pending).toBe(true);
    rerender({ term: 'rate' });
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.get).mock.calls[0]![1]).toEqual({ q: 'rate' });
    expect(result.current.pending).toBe(false);
  });

  it('searches again for a new word, and the answer for the old one is not shown as the new one\'s', async () => {
    vi.mocked(api.get).mockImplementation(async (_p, q) =>
      (q as { q: string }).q === 'rate' ? [hit('a')] : [],
    );
    const { result, rerender } = mount('rate');
    await waitFor(() => expect(result.current.hits).toHaveLength(1));
    rerender({ term: 'stock' });
    await waitFor(() => expect(result.current.term).toBe('stock'));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.hits).toEqual([]);
  });

  it('a repeat search for the same word costs nothing (↑ ↓ and back)', async () => {
    vi.mocked(api.get).mockResolvedValue([hit('a')]);
    const { result, rerender } = mount('rate');
    await waitFor(() => expect(result.current.done).toBe(true));
    rerender({ term: 'stock' });
    await waitFor(() => expect(result.current.term).toBe('stock'));
    rerender({ term: 'rate' });
    await waitFor(() => expect(result.current.term).toBe('rate'));
    await waitFor(() => expect(result.current.done).toBe(true));
    // rate, stock — and rate again came from the cache.
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('a FAILED search says failed — it is never an empty result', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('timeout'));
    const { result } = mount('rate');
    await waitFor(() => expect(result.current.failed).toBe(true), { timeout: 4000 });
    expect(result.current.done).toBe(false);
    expect(result.current.hits).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('can be retried after a failure', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x'));
    const { result } = mount('rate');
    await waitFor(() => expect(result.current.failed).toBe(true), { timeout: 4000 });
    vi.mocked(api.get).mockResolvedValue([hit('a')]);
    await act(async () => {
      await result.current.retry();
    });
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.failed).toBe(false);
    expect(result.current.hits).toHaveLength(1);
  });

  it('an honest "nothing found" is done with no hits', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const { result } = mount('zzzz');
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.hits).toEqual([]);
    expect(result.current.failed).toBe(false);
  });

  it('reports loading while the request is out', async () => {
    let finish!: (h: MessageSearchHit[]) => void;
    vi.mocked(api.get).mockReturnValue(new Promise((r) => (finish = r)));
    const { result } = mount('rate');
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.done).toBe(false);
    await act(async () => finish([hit('a')]));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
