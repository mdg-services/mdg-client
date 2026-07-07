import type { Conversation } from '@dk/shared/types';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

/** Cache key for the dealer's own conversation LIST. */
export const myConversationsKey = ['conversations', 'mine'] as const;

/**
 * Every thread the signed-in member participates in: their own support thread
 * (owner) or manager group thread (manager), PLUS any manager/group thread they
 * were added to (an owner also sees the manager chat). Server-sorted newest-first.
 */
export function useMyConversations() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: myConversationsKey,
    enabled: !!token,
    queryFn: () => api.get<Conversation[]>('/v1/conversations/mine'),
    staleTime: 30_000,
  });
}

/**
 * The caller's OWN primary thread (the one they anchor: an owner's support thread
 * or the manager's group thread). Used where a single "message support" entry
 * point is needed (e.g. Kavach). Falls back to the first thread if the primary
 * can't be matched.
 */
export function useMyPrimaryConversation(): {
  data: Conversation | undefined;
  isLoading: boolean;
} {
  const myId = useAuthStore((s) => s.user?.id);
  const q = useMyConversations();
  const data = React.useMemo(
    () => q.data?.find((c) => c.userId === myId) ?? q.data?.[0],
    [q.data, myId],
  );
  return { data, isLoading: q.isLoading };
}
