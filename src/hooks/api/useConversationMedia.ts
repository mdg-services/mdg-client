import { useInfiniteQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { ConversationMediaItem, ConversationMediaTab } from '@dk/shared/types';

const PAGE_SIZE = 30;

export function conversationMediaKey(
  conversationId: string,
  tab: ConversationMediaTab,
) {
  return ['conversation', conversationId, 'media', tab] as const;
}

/**
 * One tab of the per-conversation media/docs/links gallery. Cursor convention
 * matches messages pagination: `before` = the last (oldest) item's createdAt;
 * a full page means there may be more.
 */
export function useConversationMedia(
  conversationId: string | undefined,
  tab: ConversationMediaTab,
) {
  return useInfiniteQuery({
    queryKey: conversationId
      ? conversationMediaKey(conversationId, tab)
      : ['conversation', 'unknown', 'media', tab],
    enabled: !!conversationId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const items = await api.get<ConversationMediaItem[]>(
        `/v1/conversations/${conversationId}/media`,
        { tab, before: pageParam, limit: PAGE_SIZE },
      );
      return items;
    },
    getNextPageParam: (lastPage) => {
      // The server applies `limit` to MESSAGES and then flattens each
      // message's attachments into items, so judge "full page" on distinct
      // messages — a final page inflated past the limit by multi-image
      // messages must not fake a Load-more.
      if (!lastPage) return undefined;
      const messageCount = new Set(lastPage.map((i) => i.messageId)).size;
      if (messageCount < PAGE_SIZE) return undefined;
      // Items are newest-first → the cursor is the LAST (oldest) item.
      return lastPage[lastPage.length - 1]?.createdAt;
    },
  });
}
