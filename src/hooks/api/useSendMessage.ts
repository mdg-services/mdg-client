import type { AttachmentInput } from '@dk/shared/schemas';
import type { Message } from '@dk/shared/types';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { api } from '@/lib/api';

import { messagesQueryKey } from './useMessages';

interface SendVars {
  conversationId: string;
  body?: string;
  attachments?: AttachmentInput[];
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
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
      const optimistic: Message = {
        id: tempId,
        conversationId: vars.conversationId,
        senderId: 'me',
        senderRole: 'dealer-owner',
        body: vars.body,
        attachments: (vars.attachments ?? []).map((a) => ({ ...a })),
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
        const pages = old.pages.map((page) =>
          page.map((m) => (m.id === ctx?.tempId ? msg : m)),
        );
        return { ...old, pages };
      });
    },
  });
}
