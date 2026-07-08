import { ChevronLeft } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { AttachmentInput } from '@dk/shared/schemas';

import { Spinner, useToast } from '@/components/ui';
import { Composer } from '@/features/chat/Composer';
import {
  conversationTitle,
  participantSubtitle,
} from '@/features/chat/conversationLabel';
import { MessageList } from '@/features/chat/MessageList';
import { useConversationSocket } from '@/features/chat/useConversationSocket';
import { useMessages } from '@/hooks/api/useMessages';
import { useMyConversations } from '@/hooks/api/useMyConversations';
import { useSendMessage } from '@/hooks/api/useSendMessage';
import { useT } from '@/lib/i18n';
import { uploadAttachment, type OutgoingAttachment } from '@/lib/uploadAttachment';
import { useAuthStore } from '@/store/auth';

export function ChatPage() {
  const toast = useToast();
  const t = useT();
  const navigate = useNavigate();
  const { id: conversationId } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);

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
  const { typing, emitTyping, markRead } = useConversationSocket(
    conversationId,
    user?.id,
  );

  const [composerSeed, setComposerSeed] = React.useState<string | undefined>(
    undefined,
  );

  const messages = React.useMemo(
    () => (messagesQuery.data?.pages ?? []).flat(),
    [messagesQuery.data],
  );

  // Mark the other party's messages read once they're on screen. Covers
  // messages loaded over HTTP (history) as well as anything realtime missed.
  React.useEffect(() => {
    if (!user?.id) return;
    const unread = messages
      .filter(
        (m) =>
          !m.id.startsWith('temp-') &&
          m.senderId !== user.id &&
          !m.readBy.includes(user.id),
      )
      .map((m) => m.id);
    if (unread.length > 0) markRead(unread);
  }, [messages, user?.id, markRead]);

  const handleSend = async (text: string, files: OutgoingAttachment[]) => {
    if (!conversationId) {
      toast.error(t('chat.stillConnecting'));
      return;
    }
    if (!text && files.length === 0) return;

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
    (conversation && participantSubtitle(conversation, user?.id)) ??
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
        currentUserId={user?.id ?? ''}
        loading={messagesQuery.isLoading}
        hasMore={!!messagesQuery.hasNextPage}
        loadingMore={messagesQuery.isFetchingNextPage}
        onLoadMore={() => void messagesQuery.fetchNextPage()}
        typing={typing}
        onQuickAction={(quick) => setComposerSeed(quick)}
      />

      <Composer
        onSend={handleSend}
        onTyping={emitTyping}
        sending={sendMutation.isPending}
        initialText={composerSeed}
        disabled={!conversationId}
      />
    </div>
  );
}
