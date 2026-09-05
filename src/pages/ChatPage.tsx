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
  // `mutateAsync` is destructured because it is referentially stable while the
  // mutation object is not, and `handleTalkToHuman` below is handed to memoized
  // bubbles — a fresh identity every render would re-render the whole thread on
  // every keystroke.
  const { mutateAsync: sendMessage, isPending: sending } = useSendMessage();
  const { mutate: reactMutate } = useReactToMessage();
  const download = useAttachmentDownload();
  // The thread kind rides along because it decides how long the typing dots are
  // held: only the AI first line writes into a support thread, and it now thinks
  // for two model calls. See TYPING_HOLD_MS.
  const { typing, emitTyping, markRead } = useConversationSocket(
    conversationId,
    userId,
    conversation?.kind,
  );

  // The nonce is what makes the SAME chip work twice: the composer seeds off a
  // string, and two identical strings look to an effect like nothing happened.
  const [composerSeed, setComposerSeed] = React.useState<
    { text: string; n: number } | undefined
  >(undefined);

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

    // NOTHING SURVIVED THE UPLOAD, and there is no text either — so there is no
    // message to post. Posting the empty one anyway is what produced the second
    // red toast: "We couldn't send your voice message…" followed a moment later
    // by "Your message didn't go through…", two failures reported for one.
    //
    // Throwing rather than returning is what puts the recording back in the
    // composer: the composer clears itself optimistically and restores on a
    // rejection, so a swallowed failure here would destroy the clip.
    if (!text && attachments.length === 0) {
      setReplyTo(replyTarget);
      throw new Error('nothing to send');
    }

    try {
      await sendMessage({
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
    } catch (err) {
      toast.error(t('chat.sendFailed'));
      // Give the reply target back too — a failed send that also silently
      // dropped "replying to…" left the retry answering nobody.
      setReplyTo(replyTarget);
      throw err;
    }
  };

  // "Talk to a person", under a reply the first line wrote.
  //
  // It sends an ORDINARY message, and that is the design rather than a shortcut:
  // the backend already recognises a dealer asking for a person and hands the
  // thread back to the unassigned pool with the SLA clock running. There is no
  // route behind this button and there must not be one, because a route would be
  // a second way to reach the same state that could drift from the first.
  //
  // Not disabled while a send is in flight: the optimistic bubble appears the
  // instant it is tapped, so a dealer has no reason to tap twice, and reading
  // `sending` here would cost the stable identity the memoized bubbles need.
  const handleTalkToHuman = React.useCallback(() => {
    if (!conversationId) {
      toast.error(t('chat.stillConnecting'));
      return;
    }
    void sendMessage({
      conversationId,
      body: t('chat.aiTalkToHumanBody'),
    }).catch(() => toast.error(t('chat.sendFailed')));
  }, [conversationId, sendMessage, toast, t]);

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
        failed={messagesQuery.isError}
        onRetry={() => void messagesQuery.refetch()}
        hasMore={!!messagesQuery.hasNextPage}
        loadingMore={messagesQuery.isFetchingNextPage}
        loadMoreFailed={messagesQuery.isFetchNextPageError}
        onLoadMore={() => void messagesQuery.fetchNextPage()}
        onFetchOlder={messagesQuery.fetchNextPage}
        typing={typing}
        onQuickAction={(quick) =>
          setComposerSeed((prev) => ({ text: quick, n: (prev?.n ?? 0) + 1 }))
        }
        showSenderNames={conversation?.kind === 'manager'}
        onAction={handleAction}
        onOpenReactions={handleOpenReactions}
        onReply={handleReply}
        onTalkToHuman={handleTalkToHuman}
      />

      <Composer
        onSend={handleSend}
        onTyping={emitTyping}
        sending={sending}
        initialText={composerSeed?.text}
        initialTextKey={composerSeed?.n}
        disabled={!conversationId}
        replyingTo={replyingTo}
        onCancelReply={cancelReply}
        // Only once the thread has something in it. On an empty thread the
        // empty state is already showing its own three chips.
        showQuickReplies={messages.length > 0}
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
