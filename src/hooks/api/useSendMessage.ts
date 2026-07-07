import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { AttachmentInput } from '@dk/shared/schemas';
import type { Message } from '@dk/shared/types';

import { messagesQueryKey } from './useMessages';

interface SendVars {
  conversationId: string;
  body?: string;
  attachments?: AttachmentInput[];
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    // Tagged so the socket reconnect backfill can skip a full messages refetch
    // while a send is in flight (would otherwise race the optimistic update).
    mutationKey: ['sendMessage'],
    mutationFn: ({ conversationId, body, attachments }: SendVars) =>
      api.post<Message>(`/v1/conversations/${conversationId}/messages`, {
        body,
        attachments: attachments ?? [],
      }),
    onMutate: async (vars) => {
      const key = messagesQueryKey(vars.conversationId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<InfiniteData<Message[]>>(key);
      const tempId = `temp-${Date.now()}`;
      const me = useAuthStore.getState().user;
      const optimistic: Message = {
        id: tempId,
        conversationId: vars.conversationId,
        // Use the real sender id so the bubble renders as "mine" (right-aligned
        // with a pending ✓ clock) before the server echo arrives.
        senderId: me?.id ?? 'me',
        senderRole: me?.role ?? 'dealer-owner',
        body: vars.body,
        attachments: (vars.attachments ?? []).map((a) => ({ ...a })),
        deliveredTo: [],
        readBy: [],
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<InfiniteData<Message[]>>(key, (old) => {
        if (!old) return { pages: [[optimistic]], pageParams: [undefined] };
        const pages = [...old.pages];
        // newest-first list → prepend
        pages[0] = [optimistic, ...(pages[0] ?? [])];
        return { ...old, pages };
      });
      return { previous, tempId };
    },
    onError: (_e, vars, ctx) => {
      if (!ctx) return;
      qc.setQueryData(messagesQueryKey(vars.conversationId), ctx.previous);
    },
    onSuccess: (msg, vars, ctx) => {
      const key = messagesQueryKey(vars.conversationId);
      qc.setQueryData<InfiniteData<Message[]>>(key, (old) => {
        if (!old) return { pages: [[msg]], pageParams: [undefined] };
        // If the socket already pushed the real message, just drop the temp.
        const alreadyHasReal = old.pages.some((p) => p.some((m) => m.id === msg.id));
        if (alreadyHasReal) {
          return {
            ...old,
            pages: old.pages.map((page) => page.filter((m) => m.id !== ctx?.tempId)),
          };
        }
        // Replace the temp with the real one in-place if it is still there.
        const hasTemp = old.pages.some((p) => p.some((m) => m.id === ctx?.tempId));
        if (hasTemp) {
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((m) => (m.id === ctx?.tempId ? msg : m)),
            ),
          };
        }
        // The temp is gone — a refetch (e.g. the socket reconnect backfill) can
        // replace the pages mid-send on a flaky link. Prepend the confirmed
        // message so it appears immediately instead of waiting on the socket
        // echo; onNewMessage dedupes by real id, so no double-insert.
        const pages = [...old.pages];
        pages[0] = [msg, ...(pages[0] ?? [])];
        return { ...old, pages };
      });
    },
  });
}
