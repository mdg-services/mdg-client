import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api';

/**
 * Ask once more only when asking again can help: a timeout, a dropped
 * connection, a server error, or the two "try later" answers. A refusal (401,
 * 403, 404, a bad request) gets the same answer the second time, so retrying it
 * only kept the spinner up for another round trip.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return error.status === 408 || error.status === 429;
  }
  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Longer freshness window: inside the WebView, focus/visibility events fire
      // constantly (soft keyboard, app-switch, screen unlock). A 2-minute window
      // dedupes almost all of the resulting refetches on 2G.
      staleTime: 120_000,
      retry: shouldRetry,
      // Never refetch on window focus — in the native WebView this fires on every
      // keyboard open / app-switch and would refetch every mounted query over 2G.
      refetchOnWindowFocus: false,
      // refetchOnReconnect intentionally left at its default (true): it is the
      // backfill that catches messages missed while the link was down.
      // Socket-only reconnects (network stayed up) are covered by explicit
      // invalidations in useConversationSocket / useConversationsListSocket.
    },
    mutations: { retry: 0 },
  },
});
