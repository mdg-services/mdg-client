import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ImageOff, Users } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BrandMark } from '@/components/BrandMark';
import {
  ErrorCard,
  ListRow,
  PageHeader,
  SectionCard,
  SkeletonBlock,
  StatusPill,
} from '@/components/kit';
import { Avatar, Card } from '@/components/ui';
import { conversationTitle, isSharedChat, ticketLine } from '@/features/chat/conversationLabel';
import { useConversationMedia } from '@/hooks/api/useConversationMedia';
import { useMyConversations } from '@/hooks/api/useMyConversations';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { pick, useLang, useT, type TFunction } from '@/lib/i18n';
import { useTn } from '@/lib/messages/_plural';
import { useFreshImageSrc } from '@/lib/useFreshImageSrc';
import { useLargeText } from '@/lib/useLargeText';
import { useAuthStore } from '@/store/auth';
import { serviceLabel } from '@dk/shared';
import type {
  ConversationMediaItem,
  ConversationParticipant,
  DealerService,
} from '@dk/shared/types';

/** How many of the newest pictures the media row shows. */
const PEEK_COUNT = 4;

/** How many service names the shortcut row spells out before it says "and N more". */
const SERVICE_NAMES_SHOWN = 3;

/**
 * Services that are never listed to a dealer (spec 4.2, N4). The server hides them from the new
 * `/me/services` route; this page reads the route that exists today (`/dealers/:id/services`), so
 * it keeps its own copy of the list, and works against a server of either age.
 */
const NEVER_LISTED = new Set([
  'sdms-password-reset',
  'sdms-old-password-reset',
  'iras-password-reset',
  'hpcl-account',
  'custom-request',
]);
/** Owner-only services: a manager does not see them (spec 4.2). */
const OWNER_ONLY = new Set(['credit-dod-monitoring', 'calibration-claim']);

function roleText(p: ConversationParticipant, t: TFunction): string | undefined {
  // The server's own title first ("Owner", "Manager"); the role when it sent none.
  if (p.title) return p.title;
  if (p.role === 'dealer-owner') return t('profile.roleOwner');
  if (p.role === 'dealer-staff') return t('profile.roleStaff');
  if (p.role === 'admin') return t('profile.roleAdmin');
  return undefined;
}

/**
 * "Your MDG team": what opens when the chat's name is tapped (spec 4.6). It says who answers, where
 * the dealer's question to MDG stands, what has been shared here (photos, papers, links), and the
 * doors a dealer is usually looking for: Reports, Papers and licences, and the services MDG runs.
 *
 * Nothing here is a guess: the question comes from the chat's own ticket (the same words as the pinned
 * bar in the thread), and the services come from the route the Services screen reads. A part that
 * cannot load says less; it never hides the parts that did.
 */
export function ChatInfoPage() {
  const t = useT();
  const tn = useTn();
  const lang = useLang();
  const navigate = useNavigate();
  const large = useLargeText();
  const { id: conversationId } = useParams<{ id: string }>();
  const chatPath = `/chat/${conversationId ?? ''}`;
  const myId = useAuthStore((s) => s.user?.id);
  const role = useAuthStore((s) => s.user?.role);
  const dealerId = useAuthStore((s) => s.user?.dealerId) ?? undefined;

  const listQuery = useMyConversations();
  const conversation = React.useMemo(
    () => listQuery.data?.find((c) => c.id === conversationId),
    [listQuery.data, conversationId],
  );
  const media = useConversationMedia(conversationId, 'media');
  // The services MDG runs. Only names are read, and a failure only leaves the shortcut without them.
  const servicesQuery = useQuery<DealerService[]>({
    queryKey: ['dealer-services', dealerId],
    enabled: !!dealerId,
    queryFn: () => api.get<DealerService[]>(`/v1/dealers/${dealerId}/services`),
  });

  const bar = (
    <PageHeader
      variant="sub"
      title={t('chatl.info.title')}
      back={{ to: chatPath, label: t('chatl.place.chat') }}
    />
  );

  if (listQuery.isLoading && !conversation) {
    return (
      <>
        {bar}
        <div className="flex flex-1 flex-col gap-3 px-4 py-3">
          <Card className="p-4">
            <SkeletonBlock lines={4} />
          </Card>
        </div>
      </>
    );
  }

  // A FAILED LIST IS NOT A MISSING CHAT. Both leave `conversation` undefined, and saying "this chat is
  // not available" to a dealer whose request timed out is the same lie the empty chat list used to
  // tell. Offline, the list is PAUSED rather than failed: the same answer applies.
  const listPaused = listQuery.status === 'pending' && listQuery.fetchStatus === 'paused';
  if (!conversation && (listQuery.isError || listPaused)) {
    return (
      <>
        {bar}
        <div className="flex flex-1 flex-col gap-3 px-4 py-3">
          <ErrorCard text={t('chatl.error')} onRetry={() => void listQuery.refetch()} />
        </div>
      </>
    );
  }

  if (!conversation) {
    return (
      <>
        {bar}
        <div className="flex flex-1 flex-col gap-3 px-4 py-3">
          <Card className="p-4">
            <p className="break-words text-body text-text-muted">
              {t('chat.conversationNotFound')}
            </p>
          </Card>
        </div>
      </>
    );
  }

  const isGroup = conversation.kind === 'manager';
  const members = conversation.participants ?? [];
  const title = conversationTitle(conversation, t);
  const subtitle = isGroup
    ? t('chat.infoGroupSubtitle', { n: members.length })
    : t('chat.barSupportSubtitle');
  const ticket = ticketLine(conversation, lang);

  const items = (media.data?.pages.flat() ?? []).filter((i) => !!i.attachment);
  const peek = items.slice(0, PEEK_COUNT);
  const count = items.length;
  // A bare number beside an arrow said nothing ("0" of what?), so the count is a sentence under the
  // name: nothing sent, or how many photos, papers and links are in this chat.
  const mediaSub = !media.isSuccess
    ? t('chatl.info.mediaSub')
    : count === 0 && !media.hasNextPage
      ? t('chatl.info.mediaNone')
      : media.hasNextPage
        ? t('chatl.info.mediaMore', { n: count })
        : tn('chatl.info.mediaCount', count);
  const goMedia = () => navigate(`/chat/${conversationId}/media`);

  // The services shortcut says what runs, in the dealer's words, when the list has answered.
  const names = Array.from(
    new Set(
      (servicesQuery.data ?? [])
        .filter(
          (s) =>
            s.status === 'ACTIVE' &&
            !NEVER_LISTED.has(s.serviceId) &&
            (role === 'dealer-owner' || !OWNER_ONLY.has(s.serviceId)),
        )
        .map((s) => {
          const label = serviceLabel(s.serviceId);
          return pick(lang, label.en, label.hi);
        }),
    ),
  );
  const shown = names.slice(0, SERVICE_NAMES_SHOWN).join(', ');
  const rest = names.length - SERVICE_NAMES_SHOWN;
  const servicesSub =
    names.length === 0
      ? t('chatl.info.servicesSub')
      : rest > 0
        ? `${shown} · ${tn('kit.more', rest)}`
        : shown;

  return (
    <>
      {bar}
      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        {isSharedChat(conversation) && members.length > 0 ? (
          <SectionCard title={t('chatl.info.members')} count={members.length} variant="list">
            {members.map((p) => (
              <ListRow
                key={p.userId}
                leading={<Avatar name={p.name} size={44} />}
                title={
                  p.userId === myId ? t('chat.you') : (p.name ?? t('chat.supportFallbackName'))
                }
                {...(roleText(p, t) ? { subtitle: roleText(p, t)! } : {})}
              />
            ))}
          </SectionCard>
        ) : (
          <SectionCard title={t('chatl.info.who')}>
            {/* At large text the picture sits above the words: beside them at 200% it took a third of the width and cut the sentence into lines of two words. */}
            <div className={cn('flex gap-3 py-1', large ? 'flex-col items-start' : 'items-start')}>
              <TeamAvatar group={isGroup} large={large} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="break-words text-body font-medium text-text">{title}</p>
                <p className="break-words text-meta text-text-muted">{subtitle}</p>
                {isGroup ? null : (
                  <p className="break-words text-body text-text">{t('chat.infoWhoAnswers')}</p>
                )}
              </div>
            </div>
          </SectionCard>
        )}

        <SectionCard title={t('chatl.info.ticket')}>
          {ticket ? (
            <div className="py-1">
              <StatusPill status={ticket.status} word={ticket.text} />
            </div>
          ) : (
            <p className="break-words py-1 text-body text-text-muted">{t('chatl.info.noTicket')}</p>
          )}
          {/* Its own button, not a `ListRow`: that row is 56px tall with its words centred, which left an empty strip under "Open this chat" inside the card. */}
          <button
            type="button"
            onClick={() => navigate(chatPath)}
            className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg text-left active:bg-surface-2"
          >
            <span className="min-w-0 flex-1 break-words text-body font-medium text-text">
              {t('chatl.info.openChat')}
            </span>
            <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" />
          </button>
        </SectionCard>

        <Card className="p-4">
          <ListRow title={t('chatl.info.media')} subtitle={mediaSub} onPress={goMedia} />
          {media.isLoading ? (
            <div className="pt-2">
              <SkeletonBlock lines={1} />
            </div>
          ) : media.isError ? (
            // The row above still opens the gallery, which can retry. What is wrong here is only the
            // peek, and it says so instead of vanishing.
            <p className="break-words pt-2 text-meta text-text-muted">
              {t('chat.mediaLoadFailed')}
            </p>
          ) : peek.length > 0 ? (
            <div className="grid grid-cols-4 gap-1 pt-2">
              {peek.map((item) => (
                <PeekPicture
                  key={`${item.messageId}:${item.attachment!.storageKey}`}
                  item={item}
                  conversationId={conversation.id}
                  onOpen={goMedia}
                />
              ))}
            </div>
          ) : null}
        </Card>

        <SectionCard title={t('chatl.info.shortcuts')} variant="list">
          <ListRow
            title={t('chatl.info.reports')}
            subtitle={t('chatl.info.reportsSub')}
            onPress={() => navigate('/reports')}
          />
          <ListRow
            title={t('chatl.info.papers')}
            subtitle={t('chatl.info.papersSub')}
            onPress={() => navigate('/pump/papers')}
          />
          <ListRow
            title={t('chatl.info.services')}
            subtitle={servicesSub}
            onPress={() => navigate('/services')}
          />
        </SectionCard>
      </div>
    </>
  );
}

/** The round picture of who answers: the MDG mark for the support chat, a group glyph for the manager chat. */
function TeamAvatar({ group, large }: { group: boolean; large: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand-soft text-text',
        // 2.5rem is 80px at 200% text; the usual 3rem is 96px.
        large ? 'h-10 w-10' : 'h-12 w-12',
      )}
    >
      {group ? <Users className="h-6 w-6" strokeWidth={1.75} /> : <BrandMark size={32} />}
    </span>
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
      className="relative aspect-square w-full overflow-hidden rounded-md bg-surface-2"
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
        <span className="absolute inset-0 flex items-center justify-center text-text-subtle">
          <ImageOff aria-hidden className="h-5 w-5" strokeWidth={1.5} />
        </span>
      )}
    </button>
  );
}
