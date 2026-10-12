import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import type { MessageSearchHit } from '@dk/shared/types';

/** The server refuses anything shorter or longer, so the screen never sends it. */
export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 100;
/** How long the dealer must stop typing before a request goes out (2G: one per word, not per letter). */
export const SEARCH_DEBOUNCE_MS = 300;

export function messageSearchKey(conversationId: string, term: string) {
  return ['conversation', conversationId, 'search', term] as const;
}

/** What the server will be asked for: trimmed and cut to the length it accepts. */
export function normaliseSearchTerm(raw: string): string {
  return raw.trim().slice(0, SEARCH_MAX_CHARS).trim();
}

/** `value`, but only once it has stopped changing for `delayMs`. */
function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return settled;
}

/**
 * Search the words of one thread — `GET /v1/conversations/:id/messages/search`.
 *
 * Newest hit first, at most 50, body text only (never a file name or a picture),
 * the same as searching inside a WhatsApp chat. The server matches the letters
 * literally and ignores case, so what the dealer types is what is looked for.
 *
 * Returns what the search bar needs to tell four things apart, because they must
 * not look alike:
 *   - `ready`     — the term is long enough to search at all (else: a hint)
 *   - `loading`   — a request is out for this very term
 *   - `failed`    — the request failed (never drawn as "no results")
 *   - `done`      — the answer is in; only then is an empty `hits` "no results"
 */
export function useMessageSearch(conversationId: string | undefined, rawTerm: string) {
  const typed = normaliseSearchTerm(rawTerm);
  const term = useSettled(typed, SEARCH_DEBOUNCE_MS);
  const ready = !!conversationId && term.length >= SEARCH_MIN_CHARS;

  const query = useQuery({
    queryKey: conversationId
      ? messageSearchKey(conversationId, term)
      : ['conversation', 'unknown', 'search', term],
    enabled: ready,
    queryFn: ({ signal }) =>
      api.get<MessageSearchHit[]>(
        `/v1/conversations/${conversationId}/messages/search`,
        { q: term },
        signal,
      ),
    // A thread's older words do not change under the dealer, and a repeat search
    // for the same term (↑ ↓ and back) should cost nothing.
    staleTime: 60_000,
    gcTime: 120_000,
    retry: 1,
  });

  const hits = React.useMemo<MessageSearchHit[]>(
    () => (ready && query.data ? query.data : []),
    [ready, query.data],
  );

  return {
    /** The term the results belong to (the settled one, not what is in the box this instant). */
    term: ready ? term : '',
    ready,
    /** The box holds a term that has not been sent yet (still typing). */
    pending: typed !== term,
    loading: ready && query.isFetching && !query.isError,
    failed: ready && query.isError,
    done: ready && query.isSuccess,
    hits,
    retry: query.refetch,
  };
}
