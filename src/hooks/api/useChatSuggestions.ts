import { useQuery, type QueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import type { ChatSuggestions } from '@dk/shared';
import { sayIn } from '@dk/shared/types';

/**
 * The one-tap questions above the chat box, chosen for where this outlet is.
 *
 * While the outlet is being set up they are about that step; once services run they
 * are things the outlet can ask for and has not asked for yet (a stock check, a fuel
 * order). The server chooses (`GET /me/chat-suggestions`) and sends each sentence in
 * all the dealer languages, so a language change needs no second round trip.
 *
 * It follows the setup: `invalidateOutletSetup` also drops this, so the row changes the
 * moment a step is done or MDG's team moves the outlet along.
 *
 * No answer yet, or an error, is an EMPTY list and the box shows no chips. That is
 * deliberate: the old fixed pair was exactly the wrong thing to show a dealer in setup,
 * and a row that appears half a second later is better than one that is wrong.
 */
export const chatSuggestionsKey = ['chat-suggestions', 'me'] as const;

export function useChatSuggestions({ enabled = true }: { enabled?: boolean } = {}): readonly string[] {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const lang = useLang();
  const q = useQuery({
    queryKey: chatSuggestionsKey,
    // The dealer app's own route: an admin who happens to sign in here has no outlet.
    enabled: enabled && !!token && role !== 'admin',
    // What a dealer has already asked for changes slowly; the setup stage changes it at
    // once through the invalidation above.
    staleTime: 60_000,
    // Coming back to the chat after using another app should show today's row.
    refetchOnWindowFocus: true,
    queryFn: () => api.get<ChatSuggestions>('/v1/me/chat-suggestions'),
  });
  const items = q.data?.items;
  return React.useMemo(
    () => (items ?? []).map((words) => sayIn(words, lang)).filter((text) => text !== ''),
    [items, lang],
  );
}

/** Ask the server again — the outlet moved on, or the dealer just asked for something. */
export function invalidateChatSuggestions(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: chatSuggestionsKey });
}
