import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import * as React from 'react';

import { useToast } from '@/components/ui';
import { messagesQueryKey } from '@/hooks/api/useMessages';
import { useSendMessage } from '@/hooks/api/useSendMessage';
import { fetchTodayFeed, todayFeedKey } from '@/hooks/api/useTodayFeed';
import { copyText } from '@/lib/clipboard';
import { useLang } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import type { Message, TodayFeed, TodayTaskKind } from '@dk/shared/types';

import { askInFeed, askInThread, taskInFeed, type BoxTarget } from './reportChatTargets';
import type { ReportActionContext } from './types';

/**
 * What a report's buttons can do, built once for the report on screen (ADR 0056 §4).
 *
 * The overlay's pinned bar and the buttons inside a kind's body (the supply status rows) all go through the same {@link ReportActionContext}, so they open the chat the same
 * way, copy the same way and say the same thing when something goes wrong. A kind that is drawn
 * with no overlay around it (a test, the history row's glyph) finds no context and falls back to
 * plain behaviour.
 */

/** Where the host (the route or the extension's panel) is asked to take the dealer in the chat. */
export interface ChatTarget {
  conversationId: string;
  /** Scroll to this message. */
  messageId?: string;
  /** Type this in the message box, unsent. */
  draft?: string;
}

const ReportActionsContext = React.createContext<ReportActionContext | null>(null);

export const ReportActionsProvider = ReportActionsContext.Provider;

/** The buttons' context, or null outside an overlay. */
export function useReportActions(): ReportActionContext | null {
  return React.useContext(ReportActionsContext);
}

export interface BuildActionContextArgs {
  /** The report's own chat and message: the place every "open the chat" falls back to. */
  conversationId: string;
  messageId: string;
  onOpenChat: (to: ChatTarget) => void;
  onNavigate: (to: string) => void;
}

/** The feed as the cache holds it; asked for from the server only when the cache has none. */
async function feedNow(qc: ReturnType<typeof useQueryClient>): Promise<TodayFeed | undefined> {
  const cached = qc.getQueryData<TodayFeed>(todayFeedKey);
  if (cached) return cached;
  try {
    return await qc.fetchQuery({ queryKey: todayFeedKey, queryFn: fetchTodayFeed, staleTime: 20_000 });
  } catch {
    return undefined;
  }
}

export function useReportActionContext(args: BuildActionContextArgs): ReportActionContext {
  const { conversationId, messageId, onOpenChat, onNavigate } = args;
  const qc = useQueryClient();
  const lang = useLang();
  const toast = useToast();
  const isOwner = useAuthStore((s) => s.user?.role) === 'dealer-owner';
  const { mutateAsync: sendMessage } = useSendMessage();

  // The latest of everything the callbacks need, so the context keeps one identity while it is open.
  const live = React.useRef({ onOpenChat, onNavigate, conversationId, messageId, sendMessage, toast });
  live.current = { onOpenChat, onNavigate, conversationId, messageId, sendMessage, toast };

  return React.useMemo<ReportActionContext>(() => {
    const here = (): BoxTarget => ({ conversationId: live.current.conversationId, messageId: live.current.messageId });
    const go = (to: BoxTarget) => live.current.onOpenChat({ conversationId: to.conversationId, messageId: to.messageId });
    return {
      lang,
      isOwner,
      now: () => Date.now(),
      navigate: (to) => live.current.onNavigate(to),
      openChatAt: (id) => live.current.onOpenChat({ conversationId: live.current.conversationId, messageId: id }),
      openChatAtAsk: (askRef) => {
        const thread = qc.getQueryData<InfiniteData<Message[]>>(messagesQueryKey(live.current.conversationId));
        const found = askInFeed(qc.getQueryData<TodayFeed>(todayFeedKey), askRef) ?? askInThread(thread, live.current.conversationId, askRef);
        if (found) {
          go(found);
          return;
        }
        // The feed may simply not be loaded yet (a push opened the app straight on this report).
        void feedNow(qc).then((feed) => go(askInFeed(feed, askRef) ?? here()));
      },
      openChatAtTask: (kind: TodayTaskKind) => {
        const cached = taskInFeed(qc.getQueryData<TodayFeed>(todayFeedKey), kind);
        if (cached) {
          go(cached);
          return;
        }
        void feedNow(qc).then((feed) => go(taskInFeed(feed, kind) ?? here()));
      },
      draftInChat: (text) => live.current.onOpenChat({ conversationId: live.current.conversationId, draft: text }),
      copy: copyText,
      toast: {
        success: (m) => void live.current.toast.success(m),
        error: (m) => void live.current.toast.error(m),
      },
      sendChat: async (text) => {
        await live.current.sendMessage({ conversationId: live.current.conversationId, body: text });
      },
    };
  }, [qc, lang, isOwner]);
}
