import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Images, Search } from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { AppBar } from '@/components/AppBar';
import { Spinner, useToast } from '@/components/ui';
import { ChatAvatar } from '@/features/chat/ChatAvatar';
import { ChatSearchBar, ChatSelectionBar } from '@/features/chat/ChatBars';
import { Composer, type ComposerHandle, type ComposerReplyPreview } from '@/features/chat/Composer';
import {
  conversationTitle,
  participantSubtitle,
} from '@/features/chat/conversationLabel';
import type { AskAnswerHow } from '@/features/chat/MessageBubble';
import { MessageInfoSheet } from '@/features/chat/MessageInfoSheet';
import { MessageList } from '@/features/chat/MessageList';
import { ReactionsSheet } from '@/features/chat/ReactionsSheet';
import {
  buildReplyContext,
  replyPreview,
  replySenderLabel,
} from '@/features/chat/replyContext';
import { useConversationSocket } from '@/features/chat/useConversationSocket';
import { useUnreadOnOpen } from '@/features/chat/useUnreadOnOpen';
import { SetupStrip } from '@/features/setup/SetupStrip';
import { useChatAskStates } from '@/hooks/api/useChatAskStates';
import { messagesQueryKey, useMessages } from '@/hooks/api/useMessages';
import { useMessageSearch } from '@/hooks/api/useMessageSearch';
import { useMyConversations } from '@/hooks/api/useMyConversations';
import { useReactToMessage } from '@/hooks/api/useReactToMessage';
import { NothingToSendError, useSendMessage } from '@/hooks/api/useSendMessage';
import { afterOverlayCloses } from '@/lib/afterOverlayCloses';
import { copyText } from '@/lib/clipboard';
import { useAttachmentDownload } from '@/lib/downloadAttachment';
import { useT } from '@/lib/i18n';
import { postChatClose, postChatOpen } from '@/lib/nativeBridge';
import type { OutgoingAttachment } from '@/lib/uploadAttachment';
import { useBackToClose } from '@/lib/useBackToClose';
import { useGoBack } from '@/lib/useGoBack';
import { useAuthStore } from '@/store/auth';
import type { Message } from '@dk/shared/types';

export function ChatPage() {
  const toast = useToast();
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: conversationId } = useParams<{ id: string }>();
  const goBack = useGoBack('/chat');
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;

  const listQuery = useMyConversations();
  const conversation = React.useMemo(
    () => listQuery.data?.find((c) => c.id === conversationId),
    [listQuery.data, conversationId],
  );

  const messagesQuery = useMessages(conversationId);
  // LEAVE ONLY THE NEWEST PAGE BEHIND. Opening a chat refetches it (see
  // `useMessages`), and a refetch asks again for every page in the cache, one
  // after another — a dealer who had read back through a year of reports waited
  // through eleven sequential requests on 2G every time they reopened the chat,
  // with the unread line held back until the last one. The reading position does
  // not survive leaving the screen anyway, so the older pages are only cost.
  const qc = useQueryClient();
  React.useEffect(() => {
    if (!conversationId) return;
    return () => {
      qc.setQueryData<InfiniteData<Message[]>>(messagesQueryKey(conversationId), (d) =>
        d && d.pages.length > 1
          ? { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) }
          : d,
      );
    };
  }, [conversationId, qc]);
  const { mutateAsync: sendMessage } = useSendMessage();
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
  const [reactionsMessage, setReactionsMessage] = React.useState<Message | null>(null);
  const [infoMessage, setInfoMessage] = React.useState<Message | null>(null);
  // The messages picked by long-press, in the order they were picked.
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searchText, setSearchText] = React.useState('');
  // Which hit the search is on, remembered with the term it belongs to so a new
  // search starts again at the newest hit instead of at a stale position.
  const [cursor, setCursor] = React.useState<{ term: string; index: number }>({
    term: '',
    index: 0,
  });
  const [jump, setJump] = React.useState<{ id: string; n: number } | null>(null);

  // Leaving for another thread drops any half-done interaction state.
  React.useEffect(() => {
    setReplyTo(null);
    setReactionsMessage(null);
    setInfoMessage(null);
    setSelectedIds([]);
    setSearching(false);
    setSearchText('');
    setJump(null);
  }, [conversationId]);

  // Tell the phone which chat is on screen. It clears that chat's notifications
  // from the tray (the dealer is reading them) and keeps new ones for it from
  // popping up over the very thread they are in. The cleanup runs before the
  // next effect, so moving from one thread to another closes the first and
  // opens the second. Nothing happens outside the app.
  React.useEffect(() => {
    if (!conversationId) return;
    postChatOpen(conversationId);
    return () => postChatClose();
  }, [conversationId]);

  const handleOpenReactions = React.useCallback((message: Message) => {
    setReactionsMessage(message);
  }, []);

  // Whether the strip above the box was raised by an answer to one of MDG's
  // requests (a photo is already in hand) rather than by the dealer's own swipe.
  // Only the first must keep the keyboard down; a dealer who swipes a request to
  // reply with words is going to type.
  const [quietReply, setQuietReply] = React.useState(false);

  const handleReply = React.useCallback((message: Message) => {
    setQuietReply(false);
    setReplyTo(message);
  }, []);

  // ── Answering one of MDG's requests ─────────────────────────────────────
  // The buttons on a request ("Send photo", "Choose file", "Choose from gallery")
  // open a chooser through the composer's handle. That call MUST be synchronous,
  // inside the tap — the Android System WebView drops a picker opened from an
  // effect or after a render, which is why the old ask bar did exactly this and
  // why nothing is deferred on the way.
  //
  // THE REQUEST IS NOT THE REPLY TARGET YET. A chooser can be left with nothing
  // chosen (a cancelled camera fires no event), and a target set at the tap would
  // stay quoted above the box and claim the next, unrelated photo as its answer.
  // The composer holds the request until a file really arrives and then calls
  // `handleAnswerPicked`; backing out of the preview calls `handleAnswerDropped`.
  // After that the photo is an ordinary one: it goes through the full-screen
  // preview, and `handleSend` below sends it with the request's ref.
  const composerRef = React.useRef<ComposerHandle>(null);
  const handleAskAnswer = React.useCallback((message: Message, how: AskAnswerHow) => {
    const composer = composerRef.current;
    if (how === 'camera') composer?.openCamera(message);
    else if (how === 'gallery') composer?.openGallery(message);
    else composer?.openFiles(message);
  }, []);
  const handleAnswerPicked = React.useCallback((ask: Message) => {
    setQuietReply(true);
    setReplyTo(ask);
  }, []);
  // Only if the strip still shows THAT request: the dealer may have swiped to
  // reply to something else, or cancelled the strip, since the file came in.
  const handleAnswerDropped = React.useCallback((ask: Message) => {
    setReplyTo((current) => (current?.id === ask.id ? null : current));
  }, []);

  const cancelReply = React.useCallback(() => setReplyTo(null), []);

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

  // Where each request MDG posted here stands — what its button, "Sent" or
  // "Received" is drawn from.
  const askStates = useChatAskStates(conversationId, messages);

  // ── Selection ───────────────────────────────────────────────────────────
  const selecting = selectedIds.length > 0;
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const clearSelection = React.useCallback(() => setSelectedIds([]), []);
  // The phone's Back button leaves selection mode, not the screen behind it.
  useBackToClose(clearSelection, selecting);

  const toggleSelect = React.useCallback((message: Message) => {
    // A message still being sent is not the server's yet: it cannot be replied
    // to or looked up, and its id is about to change under the selection.
    if (message.id.startsWith('temp-')) return;
    setSelectedIds((prev) =>
      prev.includes(message.id)
        ? prev.filter((id) => id !== message.id)
        : [...prev, message.id],
    );
  }, []);

  // Oldest first, whatever order they were picked in — it is the order a copied
  // run of messages must read in.
  const selectedMessages = React.useMemo(
    () =>
      messages
        .filter((m) => selectedSet.has(m.id))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages, selectedSet],
  );
  // A selected message that left the thread (an older page dropped, a refetch)
  // must not leave the bar up with nothing in it.
  React.useEffect(() => {
    if (selecting && selectedMessages.length === 0) setSelectedIds([]);
  }, [selecting, selectedMessages.length]);

  const sole = selectedMessages.length === 1 ? selectedMessages[0]! : null;

  const copySelected = async () => {
    const text = selectedMessages
      .map((m) => m.body)
      .filter((b): b is string => !!b)
      .join('\n');
    clearSelection();
    if (!text) return;
    const ok = await copyText(text);
    if (ok) toast.success(t('chat.copied'));
    else toast.error(t('chat.copyFailed'));
  };

  const downloadSelected = async () => {
    if (!sole) return;
    clearSelection();
    const source = { conversationId: sole.conversationId, messageId: sole.id };
    for (const a of sole.attachments) {
      await download(a, source);
    }
  };

  // Info opens a sheet of its own, and the selection that is closing owns a
  // history entry that rewinds asynchronously — so the sheet waits for it.
  const infoForSelected = () => {
    if (!sole) return;
    const target = sole;
    clearSelection();
    afterOverlayCloses(() => setInfoMessage(target));
  };

  const reactFromStrip = React.useCallback(
    (message: Message, emoji: string) => {
      handleToggleReaction(message, emoji);
      setSelectedIds([]);
    },
    [handleToggleReaction],
  );

  // ── Search inside the chat ──────────────────────────────────────────────
  const closeSearch = React.useCallback(() => {
    setSearching(false);
    setSearchText('');
  }, []);
  useBackToClose(closeSearch, searching);

  const search = useMessageSearch(conversationId, searching ? searchText : '');
  const hitIndex = cursor.term === search.term ? cursor.index : 0;
  const hitId = search.hits[hitIndex]?.messageId;
  // Every step — a new term, ↑, ↓ — scrolls to that message, paging older
  // history in when it is not loaded yet.
  React.useEffect(() => {
    if (!searching || !hitId) return;
    setJump((prev) => ({ id: hitId, n: (prev?.n ?? 0) + 1 }));
  }, [searching, hitId, search.term]);

  const stepHit = (delta: number) => {
    const next = hitIndex + delta;
    if (next < 0 || next >= search.hits.length) return;
    setCursor({ term: search.term, index: next });
  };

  let searchStatus: string | null = null;
  let searchTone: 'normal' | 'error' = 'normal';
  const typedLength = searchText.trim().length;
  if (searching && typedLength > 0) {
    if (!search.ready || search.pending) {
      searchStatus = typedLength < 2 ? t('chat.searchHint') : t('chat.searching');
    } else if (search.failed) {
      // A failed search is not "no results" — it says so, and offers the retry.
      searchStatus = t('chat.searchFailed');
      searchTone = 'error';
    } else if (search.loading) {
      searchStatus = t('chat.searching');
    } else if (search.done && search.hits.length === 0) {
      searchStatus = t('chat.searchNone');
    } else if (search.hits.length > 0) {
      searchStatus = t('chat.searchCount', { i: hitIndex + 1, n: search.hits.length });
    }
  }

  // A jump asked for by another screen ("Show in chat" from the gallery). It
  // waits for the thread to be on screen: there is nothing to scroll to before.
  const wantedMessage = (location.state as { jumpToMessageId?: string } | null)
    ?.jumpToMessageId;
  const threadReady = messagesQuery.isFetchedAfterMount;
  React.useEffect(() => {
    if (wantedMessage && threadReady) {
      setJump((prev) => ({ id: wantedMessage, n: (prev?.n ?? 0) + 1 }));
      // Spend the request: it lives in this history entry, and coming back to
      // the chat from its info or media screen would otherwise jump to the same
      // old message again instead of opening at the bottom.
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [wantedMessage, threadReady, navigate, location.pathname]);

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
      // An answer to a request has its photo in hand: not the moment for the keyboard.
      ...(quietReply ? { quiet: true } : {}),
    };
  }, [replyTo, quietReply, userId, t]);

  // WHAT WAS UNREAD WHEN THIS THREAD OPENED — taken before the effect below
  // tells the server it has all been read, or there would be nothing left to
  // show a divider for.
  const unread = useUnreadOnOpen(
    conversationId,
    userId,
    messages,
    messagesQuery.isFetchedAfterMount,
  );

  // Mark the other party's messages read once they're on screen. Covers
  // messages loaded over HTTP (history) as well as anything realtime missed.
  React.useEffect(() => {
    if (!userId) return;
    const unreadIds = messages
      .filter(
        (m) =>
          !m.id.startsWith('temp-') &&
          m.senderId !== userId &&
          !m.readBy.includes(userId),
      )
      .map((m) => m.id);
    if (unreadIds.length > 0) markRead(unreadIds);
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
    // A PHOTO OR PAPER SENT AS A REPLY TO ONE OF MDG's REQUESTS ANSWERS THAT
    // REQUEST — whether the dealer pressed "Send photo" on it or swiped to reply
    // with a photo, the result is the same and the server files it either way.
    // Words alone are a reply, not an answer, and neither is a voice note: they
    // must not claim to be one (the AI first line stands down on a message that
    // names a request, so a claim would leave a question unanswered).
    const answersAsk = files.some((f) => f.kind !== 'audio') ? replyTarget?.ask?.ref : undefined;

    try {
      // The bubble is on screen from here on, pictures and voice notes drawn as
      // themselves; the upload and the post happen behind it.
      await sendMessage({
        conversationId,
        body: text || undefined,
        files,
        onFileFailed: (item) =>
          toast.error(
            item.kind === 'audio'
              ? t('chat.voiceSendFailed')
              : t('chat.fileSendFailed', { name: item.file.name }),
          ),
        ...(replyTarget
          ? {
              replyToMessageId: replyTarget.id,
              replyTo: buildReplyContext(replyTarget),
            }
          : {}),
        ...(answersAsk ? { answersAsk } : {}),
      });
    } catch (err) {
      // Every file failing was already reported one by one; a second "didn't go
      // through" for the same thing is what the dealer saw before.
      if (!(err instanceof NothingToSendError)) toast.error(t('chat.sendFailed'));
      // Give the reply target back too — a failed send that also silently
      // dropped "replying to…" left the retry answering nobody.
      setReplyTo(replyTarget);
      throw err;
    }
  };

  const title = conversation
    ? conversationTitle(conversation, t)
    : t('chat.support');

  // Still resolving which thread this is.
  if (listQuery.isLoading && !conversation) {
    return (
      <>
        <AppBar title={title} onBack={goBack} backLabel={t('chat.backToChats')} />
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={20} />
        </div>
      </>
    );
  }

  // The list loaded but this id isn't one of the member's threads.
  if (listQuery.data && !conversation) {
    return (
      <>
        <AppBar title={t('chat.support')} onBack={goBack} backLabel={t('chat.backToChats')} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
          <p className="text-sm text-text-muted">{t('chat.conversationNotFound')}</p>
          <button
            type="button"
            onClick={() => navigate('/chat', { replace: true })}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-text hover:bg-surface-2"
          >
            {t('chat.backToChats')}
          </button>
        </div>
      </>
    );
  }

  const isGroup = conversation?.kind === 'manager';
  // What sits under the name: who is writing right now (in WhatsApp's green),
  // else the group's members, else who answers in the support chat. There is no
  // "Online" here any more — nothing in this app knows whether anyone is, and a
  // dot that is always on says nothing.
  const baseSubtitle =
    (conversation && participantSubtitle(conversation, userId)) ??
    (isGroup ? undefined : t('chat.barSupportSubtitle'));
  const subtitle: React.ReactNode = typing.active ? (
    <span className="text-wa-accent-strong">
      {isGroup && typing.userName
        ? `${t('chat.isTyping', { name: typing.userName })}…`
        : t('chat.typing')}
    </span>
  ) : (
    baseSubtitle
  );

  const hasWordsSelected = selectedMessages.some((m) => !!m.body);
  const isSoleMine = !!sole && sole.senderId === userId;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selecting ? (
        <ChatSelectionBar
          count={selectedMessages.length}
          onClear={clearSelection}
          onReply={
            sole
              ? () => {
                  clearSelection();
                  handleReply(sole);
                }
              : undefined
          }
          onCopy={hasWordsSelected ? () => void copySelected() : undefined}
          onDownload={sole && sole.attachments.length > 0 ? () => void downloadSelected() : undefined}
          onInfo={sole && isSoleMine ? infoForSelected : undefined}
        />
      ) : searching ? (
        <ChatSearchBar
          value={searchText}
          onChange={setSearchText}
          onClose={closeSearch}
          status={searchStatus}
          statusTone={searchTone}
          onRetry={search.failed ? () => void search.retry() : undefined}
          onOlder={() => stepHit(1)}
          onNewer={() => stepHit(-1)}
          canOlder={hitIndex + 1 < search.hits.length}
          canNewer={hitIndex > 0}
        />
      ) : (
        <AppBar
          onBack={goBack}
          backLabel={t('chat.backToChats')}
          leading={<ChatAvatar kind={conversation?.kind} />}
          title={title}
          subtitle={subtitle}
          onTitleClick={() => navigate(`/chat/${conversationId}/info`)}
          titleLabel={t('chat.openInfo')}
          menu={[
            {
              key: 'media',
              label: t('chat.menuMedia'),
              icon: <Images width={20} strokeWidth={1.75} />,
              onSelect: () => navigate(`/chat/${conversationId}/media`),
            },
            {
              key: 'search',
              label: t('chat.menuSearch'),
              icon: <Search width={20} strokeWidth={1.75} />,
              onSelect: () => setSearching(true),
            },
          ]}
        />
      )}

      {/* The setup strip: where the outlet is on its way to live service. Only
          in the owner's own chat with MDG (the manager group never carries
          setup), and out of the way while picking messages or searching.
          ALWAYS MOUNTED, hiding itself: a child that came and went (`cond ?
          <X/> : null`) would make React rebuild this list of children by key
          — and the list and the composer below both carry the thread's id. */}
      <SetupStrip disabled={isGroup} hidden={selecting || searching} />

      <MessageList
        key={conversationId}
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
        showSenderNames={isGroup}
        selectedIds={selectedSet}
        onToggleSelect={toggleSelect}
        onReact={reactFromStrip}
        onOpenReactions={handleOpenReactions}
        onReply={handleReply}
        tickets={conversation?.tickets}
        unread={unread}
        jumpTo={jump}
        highlight={searching ? search.term : undefined}
        askStates={askStates}
        onAskAnswer={handleAskAnswer}
      />

      <Composer
        ref={composerRef}
        // One composer per thread. Without the key the same instance survives a
        // switch between chats — a push for the group chat opening while the
        // dealer is half-way through a note to MDG — and the draft, the staged
        // photos and an open send preview all went to the other chat on Send.
        key={`composer:${conversationId}`}
        onSend={handleSend}
        onTyping={emitTyping}
        initialText={composerSeed?.text}
        initialTextKey={composerSeed?.n}
        disabled={!conversationId}
        replyingTo={replyingTo}
        onCancelReply={cancelReply}
        onAnswerPicked={handleAnswerPicked}
        onAnswerDropped={handleAnswerDropped}
        // Only once the thread has something in it. On an empty thread the
        // empty state is already showing its own two chips.
        showQuickReplies={messages.length > 0}
      />

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
