import { useInfiniteQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Message } from '@dk/shared/types';

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
      // each page is oldest-first → the OLDEST item (the cursor) is at index 0
      const oldest = lastPage[0];
      return oldest?.createdAt;
    },
  });
}
