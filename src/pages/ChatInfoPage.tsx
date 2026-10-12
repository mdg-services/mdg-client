import { ChevronRight, ImageOff } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { AppBar } from '@/components/AppBar';
import { Avatar, EmptyState, Spinner } from '@/components/ui';
import { ChatAvatar } from '@/features/chat/ChatAvatar';
import { conversationTitle } from '@/features/chat/conversationLabel';
import { useConversationMedia } from '@/hooks/api/useConversationMedia';
import { useMyConversations } from '@/hooks/api/useMyConversations';
import { useT, type TFunction } from '@/lib/i18n';
import { useFreshImageSrc } from '@/lib/useFreshImageSrc';
import { useGoBack } from '@/lib/useGoBack';
import { useAuthStore } from '@/store/auth';
import type {
  ConversationMediaItem,
  ConversationParticipant,
} from '@dk/shared/types';

/** How many of the newest pictures the media row shows. */
const PEEK_COUNT = 4;

function roleText(p: ConversationParticipant, t: TFunction): string | undefined {
  // The server's own title first ("Owner", "Manager"); the role when it sent none.
  if (p.title) return p.title;
  if (p.role === 'dealer-owner') return t('profile.roleOwner');
  if (p.role === 'dealer-staff') return t('profile.roleStaff');
  if (p.role === 'admin') return t('profile.roleAdmin');
  return undefined;
}

/**
 * Chat info — what opens when the chat's name is tapped: the picture and name of
 * the chat, a row into Media, links and docs with the newest pictures peeking
 * out of it, and who is in the chat (a group's members, or who answers in the
 * support chat).
 */
export function ChatInfoPage() {
  const t = useT();
  const navigate = useNavigate();
  const { id: conversationId } = useParams<{ id: string }>();
  const goBack = useGoBack(`/chat/${conversationId ?? ''}`);
  const myId = useAuthStore((s) => s.user?.id);

  const listQuery = useMyConversations();
  const conversation = React.useMemo(
    () => listQuery.data?.find((c) => c.id === conversationId),
    [listQuery.data, conversationId],
  );
  const media = useConversationMedia(conversationId, 'media');

  const bar = <AppBar title={t('chat.infoTitle')} onBack={goBack} />;

  if (listQuery.isLoading && !conversation) {
    return (
      <>
        {bar}
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={20} />
        </div>
      </>
    );
  }

  // A FAILED LIST IS NOT A MISSING CHAT. Both leave `conversation` undefined, and
  // saying "this chat is not available" to a dealer whose request timed out is
  // the same lie the empty chat list used to tell.
  // Offline, the list is PAUSED rather than failed — the same answer applies.
  const listPaused = listQuery.status === 'pending' && listQuery.fetchStatus === 'paused';
  if (!conversation && (listQuery.isError || listPaused)) {
    return (
      <>
        {bar}
        <EmptyState
          title={t('chat.listErrorTitle')}
          description={t('chat.listErrorDesc')}
          cta={
            <button
              type="button"
              onClick={() => void listQuery.refetch()}
              className="rounded-full bg-wa-accent px-4 py-2 text-sm font-medium text-text-inverse active:opacity-90"
            >
              {t('common.retry')}
            </button>
          }
        />
      </>
    );
  }

  if (!conversation) {
    return (
      <>
        {bar}
        <EmptyState title={t('chat.conversationNotFound')} />
      </>
    );
  }

  const isGroup = conversation.kind === 'manager';
  const members = conversation.participants ?? [];
  const title = conversationTitle(conversation, t);
  const subtitle = isGroup
    ? t('chat.infoGroupSubtitle', { n: members.length })
    : t('chat.barSupportSubtitle');

  const items = (media.data?.pages.flat() ?? []).filter((i) => !!i.attachment);
  const peek = items.slice(0, PEEK_COUNT);
  const count = items.length;

  return (
    <>
      {bar}
      <div className="flex flex-1 flex-col gap-2 bg-wa-row-active pb-6">
        <section className="flex flex-col items-center bg-wa-bar px-4 pb-6 pt-8">
          <ChatAvatar kind={conversation.kind} size={96} />
          <h1 className="mt-4 text-center text-[22px] font-medium text-wa-bar-text">{title}</h1>
          <p className="mt-1 text-center text-[15px] text-wa-meta">{subtitle}</p>
        </section>

        <section className="bg-wa-bar">
          <button
            type="button"
            onClick={() => navigate(`/chat/${conversationId}/media`)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-wa-row-active"
          >
            <span className="min-w-0 flex-1 text-[16px] text-wa-bar-text">
              {t('chat.menuMedia')}
            </span>
            {media.isSuccess ? (
              <span className="shrink-0 text-[14px] tabular-nums text-wa-meta">
                {count}
                {media.hasNextPage ? '+' : ''}
              </span>
            ) : null}
            <ChevronRight width={20} strokeWidth={1.75} className="shrink-0 text-wa-meta" />
          </button>
          {media.isLoading ? (
            <div className="flex h-[88px] items-center justify-center">
              <Spinner size={18} />
            </div>
          ) : media.isError ? (
            // The row above still opens the gallery, which can retry. What is
            // wrong here is only the peek, and it says so instead of vanishing.
            <p className="px-4 pb-3.5 text-[13px] text-wa-meta">{t('chat.mediaLoadFailed')}</p>
          ) : peek.length > 0 ? (
            <div className="grid grid-cols-4 gap-1 px-4 pb-3.5">
              {peek.map((item) => (
                <PeekPicture
                  key={`${item.messageId}:${item.attachment!.storageKey}`}
                  item={item}
                  conversationId={conversation.id}
                  onOpen={() => navigate(`/chat/${conversationId}/media`)}
                />
              ))}
            </div>
          ) : null}
        </section>

        {isGroup ? (
          <section className="bg-wa-bar pb-1">
            <p className="px-4 pb-1 pt-3.5 text-[14px] text-wa-meta">
              {t('chat.infoMembers', { n: members.length })}
            </p>
            {members.length === 0 ? null : (
              <ul>
                {members.map((p) => (
                  <li key={p.userId} className="flex items-center gap-4 px-4 py-2.5">
                    <Avatar name={p.name} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] text-wa-bar-text">
                        {p.userId === myId ? t('chat.you') : (p.name ?? t('chat.supportFallbackName'))}
                      </span>
                      {roleText(p, t) ? (
                        <span className="block truncate text-[14px] text-wa-meta">
                          {roleText(p, t)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="bg-wa-bar px-4 py-4">
            <p className="text-[15px] leading-snug text-wa-bar-text">{t('chat.infoWhoAnswers')}</p>
          </section>
        )}
      </div>
    </>
  );
}

/** A square thumbnail in the media row. */
function PeekPicture({
  item,
  conversationId,
  onOpen,
}: {
  item: ConversationMediaItem;
  conversationId: string;
  onOpen: () => void;
}) {
  const attachment = item.attachment!;
  const { src, failed, onError } = useFreshImageSrc(attachment, {
    conversationId,
    messageId: item.messageId,
  });
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={attachment.filename}
      className="relative aspect-square w-full overflow-hidden rounded-md bg-wa-row-active"
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={onError}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-wa-meta">
          <ImageOff width={18} strokeWidth={1.5} />
        </span>
      )}
    </button>
  );
}
