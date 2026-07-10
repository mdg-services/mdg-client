import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';

import { useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import type { Message, MessageReaction } from '@dk/shared/types';

import { messagesQueryKey } from './useMessages';

export interface ReactVars {
  conversationId: string;
  messageId: string;
  /** The emoji tapped. Ignored by the server on 'remove' (it pulls by user). */
  emoji: string;
  /** 'remove' when the caller's current reaction === the tapped emoji. */
  op: 'add' | 'remove';
}

/**
 * Count of reaction toggles currently in flight for the given message. Used to
 * hold off server-snapshot writes (socket echo / an older toggle's response)
 * that would transiently clobber a NEWER optimistic toggle — the last
 * mutation's onSuccess reconciles to server truth.
 */
export function reactionMutationsPending(qc: QueryClient, messageId: string): number {
  return qc.isMutating({
    mutationKey: ['react'],
    predicate: (m) =>
      (m.state.variables as ReactVars | undefined)?.messageId === messageId,
  });
}

/** Immutably replace one message's reactions across the cached pages. */
function setMessageReactions(
  qc: QueryClient,
  conversationId: string,
  messageId: string,
  reactions: MessageReaction[],
): void {
  qc.setQueryData<InfiniteData<Message[]>>(
    messagesQueryKey(conversationId),
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) =>
          page.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
        ),
      };
    },
  );
}

/**
 * Toggle the caller's reaction on a message. Optimistic: the cache is updated
 * in onMutate (one reaction per user — any previous one is replaced) and rolled
 * back on error with a sticky toast; the server's response and the
 * 'message:reaction' socket echo both reconcile to the authoritative array.
 *
 * Both the snapshot and the rollback are scoped to the TARGET MESSAGE'S
 * reactions only — a whole-cache restore would silently erase everything that
 * landed while the request was in flight (new messages, receipts, other
 * users' reactions), and on 2G a failing toggle can be in flight for a long
 * time. For the same reason there is deliberately NO cancelQueries here: it
 * could abort the socket-reconnect backfill refetch, and an in-flight GET
 * completing over the optimistic write is already reconciled by onSuccess and
 * the 'message:reaction' echo.
 */
export function useReactToMessage() {
  const qc = useQueryClient();
  const t = useT();
  const toast = useToast();
  return useMutation({
    mutationKey: ['react'],
    mutationFn: ({ conversationId, messageId, emoji, op }: ReactVars) =>
      op === 'remove'
        ? api.del<Message>(
            `/v1/conversations/${conversationId}/messages/${messageId}/reactions`,
          )
        : api.post<Message>(
            `/v1/conversations/${conversationId}/messages/${messageId}/reactions`,
            { emoji },
          ),
    onMutate: (vars) => {
      const key = messagesQueryKey(vars.conversationId);
      const previousReactions =
        qc
          .getQueryData<InfiniteData<Message[]>>(key)
          ?.pages.flat()
          .find((m) => m.id === vars.messageId)?.reactions ?? [];
      const me = useAuthStore.getState().user;
      if (me) {
        qc.setQueryData<InfiniteData<Message[]>>(key, (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((m) => {
                if (m.id !== vars.messageId) return m;
                const others = (m.reactions ?? []).filter((r) => r.userId !== me.id);
                const next =
                  vars.op === 'remove'
                    ? others
                    : [
                        ...others,
                        {
                          userId: me.id,
                          userName: me.name,
                          emoji: vars.emoji,
                          createdAt: new Date().toISOString(),
                        },
                      ];
                return { ...m, reactions: next };
              }),
            ),
          };
        });
      }
      return { previousReactions };
    },
    onError: (_e, vars, ctx) => {
      if (ctx) {
        setMessageReactions(qc, vars.conversationId, vars.messageId, ctx.previousReactions);
      }
      toast.error(t('chat.reactionFailed'));
    },
    onSuccess: (msg, vars) => {
      // Server truth wins over the optimistic guess — but only when this is
      // the LAST toggle in flight for the message (the completing mutation
      // itself still counts as pending while onSuccess runs). An older
      // response must not resurrect state a newer optimistic toggle changed.
      if (reactionMutationsPending(qc, vars.messageId) > 1) return;
      setMessageReactions(qc, vars.conversationId, vars.messageId, msg.reactions ?? []);
    },
  });
}
