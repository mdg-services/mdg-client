import { ChevronLeft, Images } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';


import { Spinner, useToast } from '@/components/ui';
import { Composer, type ComposerReplyPreview } from '@/features/chat/Composer';
import {
  conversationTitle,
  participantSubtitle,
} from '@/features/chat/conversationLabel';
import { MessageActionsSheet } from '@/features/chat/MessageActionsSheet';
import { MessageInfoSheet } from '@/features/chat/MessageInfoSheet';
import { MessageList } from '@/features/chat/MessageList';
import { ReactionsSheet } from '@/features/chat/ReactionsSheet';
import {
  buildReplyContext,
  replyPreview,
  replySenderLabel,
} from '@/features/chat/replyContext';
import { useConversationSocket } from '@/features/chat/useConversationSocket';
import { useMessages } from '@/hooks/api/useMessages';
import { useMyConversations } from '@/hooks/api/useMyConversations';
import { useReactToMessage } from '@/hooks/api/useReactToMessage';
import { useSendMessage } from '@/hooks/api/useSendMessage';
import { useAttachmentDownload } from '@/lib/downloadAttachment';
import { useT } from '@/lib/i18n';
import { uploadAttachment, type OutgoingAttachment } from '@/lib/uploadAttachment';
import { useAuthStore } from '@/store/auth';
import type { AttachmentInput } from '@dk/shared/schemas';
import type { Message } from '@dk/shared/types';

export function ChatPage() {
  const toast = useToast();
  const t = useT();
  const navigate = useNavigate();
  const { id: conversationId } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;

  const listQuery = useMyConversations();
  const conversation = React.useMemo(
    () => listQuery.data?.find((c) => c.id === conversationId),
    [listQuery.data, conversationId],
  );
  // Offer a "back to list" affordance when there's genuinely a list — or when the
  // list fetch errored (so a deep-linked opener isn't stranded on one thread).
  const showBack = (listQuery.data?.length ?? 0) > 1 || listQuery.isError;

  const messagesQuery = useMessages(conversationId);
  const sendMutation = useSendMessage();
  const { mutate: reactMutate } = useReactToMessage();
  const download = useAttachmentDownload();
  const { typing, emitTyping, markRead } = useConversationSocket(
    conversationId,
    userId,
  );

  const [composerSeed, setComposerSeed] = React.useState<string | undefined>(
    undefined,
  );

  // WhatsApp-style interactions, all owned here so MessageList/MessageBubble
  // get a single stable callback each (both are memo-sensitive).
  const [replyTo, setReplyTo] = React.useState<Message | null>(null);
  const [actionMessage, setActionMessage] = React.useState<Message | null>(null);
  const [reactionsMessage, setReactionsMessage] = React.useState<Message | null>(null);
  const [infoMessage, setInfoMessage] = React.useState<Message | null>(null);

  // Leaving for another thread drops any half-done interaction state.
  React.useEffect(() => {
    setReplyTo(null);
    setActionMessage(null);
    setReactionsMessage(null);
    setInfoMessage(null);
  }, [conversationId]);

  const handleAction = React.useCallback((message: Message) => {
    setActionMessage(message);
  }, []);

  const handleOpenReactions = React.useCallback((message: Message) => {
    setReactionsMessage(message);
  }, []);

  const handleReply = React.useCallback((message: Message) => {
    setReplyTo(message);
  }, []);

  const cancelReply = React.useCallback(() => setReplyTo(null), []);

  const handleInfo = React.useCallback((message: Message) => {
    setInfoMessage(message);
  }, []);

  const handleToggleReaction = React.useCallback(
    (message: Message, emoji: string) => {
      if (!message.conversationId || message.id.startsWith('temp-')) return;
      const mine = message.reactions?.find((r) => r.userId === userId);
      reactMutate({
        conversationId: message.conversationId,
        messageId: message.id,
        emoji,
        op: mine?.emoji === emoji ? 'remove' : 'add',
      });
    },
    [reactMutate, userId],
  );

  const messages = React.useMemo(
    () => (messagesQuery.data?.pages ?? []).flat(),
    [messagesQuery.data],
  );

  // Sheets hold a message SNAPSHOT; keep them live against the cache so e.g.
  // the who-reacted list updates in place as reactions land.
  const liveReactionsMessage = React.useMemo(
    () =>
      reactionsMessage
        ? (messages.find((m) => m.id === reactionsMessage.id) ?? reactionsMessage)
        : null,
    [messages, reactionsMessage],
  );
  const liveInfoMessage = React.useMemo(
    () =>
      infoMessage
        ? (messages.find((m) => m.id === infoMessage.id) ?? infoMessage)
        : null,
    [messages, infoMessage],
  );

  // Memoized so its identity only changes when the reply target (or language)
  // does — the Composer focuses the textarea on identity change, and a fresh
  // object every render would re-summon the keyboard on unrelated re-renders.
  const replyingTo = React.useMemo<ComposerReplyPreview | null>(() => {
    if (!replyTo) return null;
    const rc = buildReplyContext(replyTo);
    const preview = replyPreview(rc, t);
    return {
      senderLabel: replySenderLabel(rc, userId, t),
      text: preview.text,
      icon: preview.icon,
    };
  }, [replyTo, userId, t]);

  // Mark the other party's messages read once they're on screen. Covers
  // messages loaded over HTTP (history) as well as anything realtime missed.
  React.useEffect(() => {
    if (!userId) return;
    const unread = messages
      .filter(
        (m) =>
          !m.id.startsWith('temp-') &&
          m.senderId !== userId &&
          !m.readBy.includes(userId),
      )
      .map((m) => m.id);
    if (unread.length > 0) markRead(unread);
  }, [messages, userId, markRead]);

  const handleSend = async (text: string, files: OutgoingAttachment[]) => {
    if (!conversationId) {
      toast.error(t('chat.stillConnecting'));
      return;
    }
    if (!text && files.length === 0) return;

    // Capture + clear the reply target up front so the strip resets instantly.
    const replyTarget = replyTo;
    setReplyTo(null);

    try {
      const attachments: AttachmentInput[] = [];
      for (const item of files) {
        try {
          const att = await uploadAttachment(item, conversationId);
          attachments.push(att);
        } catch {
          toast.error(
            item.kind === 'audio'
              ? t('chat.voiceSendFailed')
              : t('chat.fileSendFailed', { name: item.file.name }),
          );
        }
      }
      await sendMutation.mutateAsync({
        conversationId,
        body: text || undefined,
        attachments,
        ...(replyTarget
          ? {
              replyToMessageId: replyTarget.id,
              replyTo: buildReplyContext(replyTarget),
            }
          : {}),
      });
    } catch {
      toast.error(t('chat.sendFailed'));
    }
  };

  // Still resolving which thread this is.
  if (listQuery.isLoading && !conversation) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  }

  // The list loaded but this id isn't one of the member's threads.
  if (listQuery.data && !conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
        <p className="text-sm text-text-muted">{t('chat.conversationNotFound')}</p>
        <button
          type="button"
          onClick={() => navigate('/chat')}
          className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-text hover:bg-surface-2"
        >
          {t('chat.backToChats')}
        </button>
      </div>
    );
  }

  const title = conversation
    ? conversationTitle(conversation, t)
    : t('chat.support');
  const subtitle =
    (conversation && participantSubtitle(conversation, userId)) ??
    t('chat.supportSubtitle');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-surface px-2 py-2.5">
        {showBack ? (
          <button
            type="button"
            aria-label={t('chat.backToChats')}
            onClick={() => navigate('/chat')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-2"
          >
            <ChevronLeft width={22} strokeWidth={1.75} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-semibold text-text">{title}</p>
          <p className="truncate text-xs text-text-subtle">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pr-2">
          <button
            type="button"
            aria-label={t('chat.mediaTitle')}
            onClick={() => navigate(`/chat/${conversationId}/media`)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-2 active:bg-surface-2"
          >
            <Images width={20} strokeWidth={1.75} />
          </button>
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: 'var(--color-online)' }}
            aria-hidden
          />
          <span className="text-xs font-medium text-text-muted">
            {t('chat.online')}
          </span>
        </div>
      </div>

      <MessageList
        messages={messages}
        currentUserId={userId ?? ''}
        conversationId={conversationId}
        loading={messagesQuery.isLoading}
        hasMore={!!messagesQuery.hasNextPage}
        loadingMore={messagesQuery.isFetchingNextPage}
        onLoadMore={() => void messagesQuery.fetchNextPage()}
        onFetchOlder={messagesQuery.fetchNextPage}
        typing={typing}
        onQuickAction={(quick) => setComposerSeed(quick)}
        showSenderNames={conversation?.kind === 'manager'}
        onAction={handleAction}
        onOpenReactions={handleOpenReactions}
        onReply={handleReply}
      />

      <Composer
        onSend={handleSend}
        onTyping={emitTyping}
        sending={sendMutation.isPending}
        initialText={composerSeed}
        disabled={!conversationId}
        replyingTo={replyingTo}
        onCancelReply={cancelReply}
      />

      {actionMessage ? (
        <MessageActionsSheet
          message={actionMessage}
          mine={actionMessage.senderId === userId}
          currentUserId={userId}
          onClose={() => setActionMessage(null)}
          onReply={handleReply}
          onToggleReaction={handleToggleReaction}
          onDownload={download}
          onInfo={handleInfo}
        />
      ) : null}

      {liveReactionsMessage ? (
        <ReactionsSheet
          message={liveReactionsMessage}
          conversation={conversation}
          currentUserId={userId}
          onToggleReaction={handleToggleReaction}
          onClose={() => setReactionsMessage(null)}
        />
      ) : null}

      {liveInfoMessage ? (
        <MessageInfoSheet
          message={liveInfoMessage}
          conversation={conversation}
          onClose={() => setInfoMessage(null)}
        />
      ) : null}
    </div>
  );
}
