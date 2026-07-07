import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Longer freshness window: inside the WebView, focus/visibility events fire
      // constantly (soft keyboard, app-switch, screen unlock). A 2-minute window
      // dedupes almost all of the resulting refetches on 2G.
      staleTime: 120_000,
      retry: 1,
      // Never refetch on window focus — in the native WebView this fires on every
      // keyboard open / app-switch and would refetch every mounted query over 2G.
      refetchOnWindowFocus: false,
      // refetchOnReconnect intentionally left at its default (true): it is the
      // backfill that catches messages/records missed while the link was down.
      // Socket-only reconnects (network stayed up) are covered by explicit
      // invalidations in useConversationSocket / useRecordsSocket.
    },
    mutations: { retry: 0 },
  },
});
