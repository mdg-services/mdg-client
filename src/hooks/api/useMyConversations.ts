import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { Conversation } from '@dk/shared/types';

/** Cache key for the dealer's own conversation LIST. */
export const myConversationsKey = ['conversations', 'mine'] as const;

/**
 * Every thread the signed-in member participates in: their own support thread
 * (owner) or manager group thread (manager), PLUS any manager/group thread they
 * were added to (an owner also sees the manager chat). Server-sorted newest-first.
 *
 * Each carries `unreadCount` — how many messages in it THIS member has not read,
 * the number in the chat list's green pill. The list socket keeps it current
 * between fetches (`useConversationsListSocket`).
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
