import type { Message } from '@dk/shared/types';
import { useInfiniteQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

const PAGE_SIZE = 30;

export function messagesQueryKey(conversationId: string) {
  return ['conversation', conversationId, 'messages'] as const;
}

export function useMessages(conversationId: string | undefined) {
  return useInfiniteQuery({
    queryKey: conversationId
      ? messagesQueryKey(conversationId)
      : ['conversation', 'unknown', 'messages'],
    enabled: !!conversationId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const items = await api.get<Message[]>(
        `/v1/conversations/${conversationId}/messages`,
        { before: pageParam, limit: PAGE_SIZE },
      );
      return items;
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      // newest-first → use the OLDEST item's createdAt as the cursor
      const oldest = lastPage[lastPage.length - 1];
      return oldest?.createdAt;
    },
  });
}
