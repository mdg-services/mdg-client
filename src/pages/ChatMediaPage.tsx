import { Link as LinkIcon } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  EmptyCalm,
  ErrorCard,
  ListRow,
  PageHeader,
  PillGroup,
  SectionCard,
  SkeletonBlock,
} from '@/components/kit';
import { Button, Spinner } from '@/components/ui';
import { AttachmentPdfViewer, isPdfAttachment } from '@/features/chat/AttachmentPdfViewer';
import { FileTypeBadge } from '@/features/chat/FileTypeBadge';
import { monthHeading, monthKey, shortDate, viewerWhen } from '@/features/chat/mediaFormat';
import { MediaViewer, type MediaViewerItem } from '@/features/chat/MediaViewer';
import { dealerSideIdsOf, senderDisplayName } from '@/features/chat/replyContext';
import { useOpenReport } from '@/features/reports/reportNav';
import { useConversationMedia } from '@/hooks/api/useConversationMedia';
import { useMyConversations } from '@/hooks/api/useMyConversations';
import { useTodayFeed } from '@/hooks/api/useTodayFeed';
import { afterOverlayCloses } from '@/lib/afterOverlayCloses';
import { cn } from '@/lib/cn';
import {
  useAttachmentDownload,
  type AttachmentSource,
} from '@/lib/downloadAttachment';
import { useLang, useT, type MessageKey, type TFunction } from '@/lib/i18n';
import { formatBytes } from '@/lib/uploadAttachment';
import { useFreshImageSrc } from '@/lib/useFreshImageSrc';
import { useAuthStore } from '@/store/auth';
import type { Lang } from '@/store/lang';
import type {
  Attachment,
  ConversationMediaItem,
  ConversationMediaTab,
} from '@dk/shared/types';

/** Photos, papers, links: the page's three views. The ids are the server's tab names. */
const TABS: { tab: ConversationMediaTab; labelKey: MessageKey }[] = [
  { tab: 'media', labelKey: 'chatl.media.photos' },
  { tab: 'docs', labelKey: 'chatl.media.papers' },
  { tab: 'links', labelKey: 'chatl.media.links' },
];

/** How many reports the lead card shows. */
const LATEST_REPORTS = 3;

const EMPTY_KEYS: Record<ConversationMediaTab, MessageKey> = {
  media: 'chat.noMedia',
  docs: 'chat.noDocs',
  links: 'chat.noLinks',
};

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** One row per URL: a message body can carry several links. */
function linkRows(items: ConversationMediaItem[]) {
  return items.flatMap((item) =>
    (item.urls ?? []).map((url, i) => ({
      key: `${item.messageId}-${i}`,
      url,
      createdAt: item.createdAt,
    })),
  );
}

/** The key the viewer tracks a picture by — the contract's `${messageId}:${storageKey}`. */
function itemKey(item: ConversationMediaItem): string {
  return `${item.messageId}:${item.attachment?.storageKey ?? ''}`;
}

/** Pictures the grid can draw: the server signs the link, and when it could not
 *  there is nothing to show. */
function withPicture(items: ConversationMediaItem[]) {
  return items.filter(
    (i): i is ConversationMediaItem & { attachment: Attachment } => !!i.attachment?.url,
  );
}

/**
 * The server sends newest first, one item per attachment. The viewer wants them
 * oldest first — but a message with three pictures must still show them in the
 * order they were sent, which a plain reverse would turn round. So: reverse the
 * MESSAGES, keep each message's own order.
 */
function oldestFirst<T extends { messageId: string }>(newestFirst: T[]): T[] {
  const runs: T[][] = [];
  for (const item of newestFirst) {
    const last = runs[runs.length - 1];
    if (last && last[0]!.messageId === item.messageId) last.push(item);
    else runs.push([item]);
  }
  return runs.reverse().flat();
}

interface MonthGroup {
  key: string;
  label: string;
  items: (ConversationMediaItem & { attachment: Attachment })[];
}

/** Newest first, one shelf per month: "This month", then "September 2026"… */
function groupByMonth(
  items: (ConversationMediaItem & { attachment: Attachment })[],
  lang: Lang,
  t: TFunction,
): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const item of items) {
    const key = monthKey(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: monthHeading(item.createdAt, lang, t), items: [item] });
  }
  return groups;
}

/**
 * One square in the photo grid, re-signing its own link when it goes stale.
 *
 * The grid is the screen a dealer scrolls to find an older report, so it is the
 * screen most likely to be open past the 900-second life of the links it was
 * handed — and with `loading="lazy"`, a square below the fold first asks for its
 * picture at the moment it is scrolled to. See `useFreshImageSrc`.
 */
function GalleryThumb({
  attachment,
  source,
}: {
  attachment: Attachment;
  source: AttachmentSource;
}) {
  const { src, onError } = useFreshImageSrc(attachment, source);
  return (
    <img
      src={src}
      alt={attachment.filename}
      loading="lazy"
      decoding="async"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onError={onError}
      className="h-full w-full object-cover"
    />
  );
}

/**
 * Calls `onLoad` when the returned sentinel comes within a screen of the visible
 * area — "loads more by itself on scroll". Without an `IntersectionObserver`
 * (an old WebView) it reports `observing: false` and the page shows a button.
 *
 * `enabled` is false while a page is on its way or has just failed, so a failure
 * is a chip the dealer taps rather than a loop: the observer is torn down and
 * rebuilt each time it flips, and a rebuilt one reports the sentinel's current
 * state at once — which on a failing network would be a request per frame.
 */
function useLoadMoreOnScroll(enabled: boolean, onLoad: () => void) {
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const loadRef = React.useRef(onLoad);
  loadRef.current = onLoad;
  const observing = typeof IntersectionObserver !== 'undefined';
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !observing || !enabled) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadRef.current();
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, observing]);
  return { sentinelRef, observing };
}

/**
 * Per-conversation gallery: everything ever shared in the thread, split into
 * Media (a square grid under month headings), Docs (file rows) and Links
 * (extracted from bodies). Routed at /chat/:id/media — OUTSIDE the fixed --vvh
 * chat frame, so it scrolls like a normal page.
 *
 * Tapping a picture opens the same viewer the thread uses, over EVERY picture
 * loaded here, so the reader can swipe on from the one they chose; reaching the
 * oldest asks for the next page.
 */
export function ChatMediaPage() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const { id: conversationId } = useParams<{ id: string }>();
  const userId = useAuthStore((s) => s.user?.id);
  // Anyone outside the dealer's side of the thread is MDG, never named.
  const conversationsQuery = useMyConversations();
  const dealerSideIds = React.useMemo(
    () => dealerSideIdsOf(conversationsQuery.data?.find((c) => c.id === conversationId)),
    [conversationsQuery.data, conversationId],
  );
  const [tab, setTab] = React.useState<ConversationMediaTab>('media');
  const query = useConversationMedia(conversationId, tab);
  const download = useAttachmentDownload();
  const [viewerKey, setViewerKey] = React.useState<string | null>(null);
  /** A PDF from the Docs tab, open in the app's own reader. */
  const [reading, setReading] = React.useState<{ attachment: Attachment; messageId: string } | null>(
    null,
  );

  const items = React.useMemo(
    () => (query.data?.pages ?? []).flat(),
    [query.data],
  );
  const pictures = React.useMemo(
    () => (tab === 'media' ? withPicture(items) : []),
    [items, tab],
  );
  const months = React.useMemo(
    () => groupByMonth(pictures, lang, t),
    [pictures, lang, t],
  );

  // The gallery flattens attachments out of their messages, so each picture
  // keeps the message id it came from: a fresh presign is authorised through the
  // message that carries the key, never by the key alone.
  const viewerItems = React.useMemo<MediaViewerItem[]>(
    () =>
      oldestFirst(pictures).map((item) => ({
        key: itemKey(item),
        attachment: item.attachment,
        source: { conversationId: conversationId!, messageId: item.messageId },
        senderLabel: senderDisplayName(item, userId, t, dealerSideIds),
        createdAt: item.createdAt,
        ...(item.bodySnippet ? { caption: item.bodySnippet } : {}),
      })),
    [pictures, conversationId, userId, t, dealerSideIds],
  );

  // The newest reports MDG sent in THIS chat, from the feed the tab bar and Today already hold (no extra
  // request). A feed that has not answered gives none, and the card then points at Reports.
  const feed = useTodayFeed();
  const openReport = useOpenReport();
  const latestReports = React.useMemo(() => {
    const seen = new Set<string>();
    return [...(feed.data?.reports ?? []), ...(feed.data?.done ?? [])]
      .filter((r) => r.conversationId === conversationId)
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
      .filter((r) => (seen.has(r.messageId) ? false : (seen.add(r.messageId), true)))
      .slice(0, LATEST_REPORTS);
  }, [feed.data?.reports, feed.data?.done, conversationId]);

  // `fetchNextPage` keeps one identity for the life of the query; the query
  // object itself does not, and the viewer's "ask for older" effect reads this.
  const { fetchNextPage } = query;
  const fetchNext = React.useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const canAutoLoad =
    !!query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError;
  const { sentinelRef, observing } = useLoadMoreOnScroll(canAutoLoad, fetchNext);

  /** What sits under the list: more on its way, a retry, or the sentinel. */
  const footer = query.isFetchNextPageError ? (
    // A page that failed to arrive must not take the pages that did with it.
    <div className="flex justify-center py-4">
      <Button variant="secondary" onClick={fetchNext}>
        {t('media.loadMoreFailed')}
      </Button>
    </div>
  ) : query.isFetchingNextPage ? (
    <div className="flex justify-center py-4 text-text-muted">
      <Spinner size={18} />
    </div>
  ) : query.hasNextPage ? (
    <div ref={sentinelRef} className="flex justify-center py-3">
      {observing ? null : (
        <Button variant="secondary" onClick={fetchNext}>
          {t('chat.loadMore')}
        </Button>
      )}
    </div>
  ) : null;

  // "Show in chat": close the viewer, then go. The viewer owns a history entry
  // that closing rewinds asynchronously — navigating at once would push the
  // chat on top of it and cost the dealer an extra Back press. And it REPLACES
  // this screen rather than stacking the chat on top of it, so Back from the
  // message goes where WhatsApp's does — out of the chat — instead of through
  // the gallery and a second copy of the same chat.
  const showInChat = (item: MediaViewerItem) => {
    setViewerKey(null);
    afterOverlayCloses(() =>
      navigate(`/chat/${conversationId}`, {
        replace: true,
        state: { jumpToMessageId: item.source.messageId },
      }),
    );
  };

  let content: React.ReactNode;
  if (query.isLoading) {
    content = (
      <div className="py-4">
        <SkeletonBlock lines={4} />
      </div>
    );
  } else if (query.isError && items.length === 0) {
    // NOT the empty state. A failed request and an empty gallery look identical from
    // `items.length === 0`, and telling a dealer whose every report is in here that there are no
    // photos is a confident wrong answer (the same shape as the "No chats yet" bug). Say what
    // happened, and offer the retry.
    content = <ErrorCard text={t('chatl.media.failed')} onRetry={() => void query.refetch()} />;
  } else if (items.length === 0 || (tab === 'links' && linkRows(items).length === 0)) {
    content = <EmptyCalm text={t(EMPTY_KEYS[tab])} />;
  } else if (tab === 'media') {
    content = (
      <>
        <div aria-label={t('media.gallery')} role="group">
          {months.map((month, m) => (
            <section key={month.key}>
              <h2 className={cn('pb-2 text-meta font-semibold text-text-muted', m === 0 ? 'pt-1' : 'pt-4')}>
                {month.label}
              </h2>
              <div className="grid grid-cols-3 gap-1">
                {month.items.map((item) => (
                  <button
                    key={itemKey(item)}
                    type="button"
                    aria-label={item.attachment.filename}
                    onClick={() => setViewerKey(itemKey(item))}
                    className="block aspect-square overflow-hidden rounded-md bg-surface-2"
                  >
                    <GalleryThumb
                      attachment={item.attachment}
                      source={{
                        conversationId: conversationId!,
                        messageId: item.messageId,
                      }}
                    />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        {footer}
      </>
    );
  } else if (tab === 'docs') {
    content = (
      <>
        <ul className="divide-y divide-border">
          {items.map((item) =>
            item.attachment ? (
              <li key={itemKey(item)}>
                <ListRow
                  leading={
                    <FileTypeBadge
                      filename={item.attachment.filename}
                      contentType={item.attachment.contentType}
                    />
                  }
                  title={item.attachment.filename}
                  subtitle={`${formatBytes(item.attachment.size)} · ${shortDate(item.createdAt, lang)}`}
                  onPress={() => {
                    const attachment = item.attachment!;
                    // A PDF is read here; anything else is saved.
                    if (isPdfAttachment(attachment)) {
                      setReading({ attachment, messageId: item.messageId });
                    } else {
                      void download(attachment, {
                        conversationId: conversationId!,
                        messageId: item.messageId,
                      });
                    }
                  }}
                />
              </li>
            ) : null,
          )}
        </ul>
        {footer}
      </>
    );
  } else {
    content = (
      <>
        <ul className="divide-y divide-border">
          {linkRows(items).map((row) => (
            <li key={row.key}>
              {/* A web link someone typed in the chat: it opens in the phone's browser, as the same
                  link does in the thread (the one allowed exit of this page, see
                  scripts/leavingTheApp.check.mjs). */}
              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-14 w-full items-center gap-3 py-2 active:bg-surface-2"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text">
                  <LinkIcon aria-hidden className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="break-words text-body font-medium text-text">{domainOf(row.url)}</span>
                  <span className="break-all text-meta text-text-muted underline">{row.url}</span>
                  <span className="break-words text-meta text-text-muted">{shortDate(row.createdAt, lang)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        {footer}
      </>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-bg">
      <PageHeader variant="sub" title={t('chatl.media.title')} back={{ to: `/chat/${conversationId ?? ''}`, label: t('chatl.place.chat') }} />

      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        {/* The page leads with the reports MDG sent in this chat (or the way to all of them): a dealer
            digging through a chat is mostly looking for a report. */}
        <SectionCard
          title={t('chatl.media.reports')}
          seeAll={{ label: t('kit.seeAll'), onPress: () => navigate('/reports') }}
          variant="list"
        >
          {latestReports.length > 0 ? (
            latestReports.map((r) => (
              <ListRow
                key={r.messageId}
                title={r.headline}
                subtitle={viewerWhen(r.sentAt, lang, t)}
                onPress={() => openReport({ conversationId: r.conversationId, messageId: r.messageId, report: r })}
              />
            ))
          ) : (
            <>
              <p className="break-words py-2 text-body text-text-muted">{t('chatl.media.reportsNone')}</p>
              <ListRow title={t('chatl.media.reportsOpen')} onPress={() => navigate('/reports')} />
            </>
          )}
        </SectionCard>

        <PillGroup<ConversationMediaTab>
          label={t('chatl.media.show')}
          value={tab}
          onChange={setTab}
          options={TABS.map(({ tab: value, labelKey }) => ({ id: value, label: t(labelKey) }))}
        />

        <div role="group" aria-label={t('chatl.media.show')} className="flex flex-1 flex-col pb-4">
          {content}
        </div>
      </div>

      {viewerKey && tab === 'media' ? (
        <MediaViewer
          items={viewerItems}
          initialKey={viewerKey}
          onClose={() => setViewerKey(null)}
          onDownload={download}
          hasOlder={!!query.hasNextPage}
          loadingOlder={query.isFetchingNextPage}
          onNeedOlder={fetchNext}
          onShowInChat={showInChat}
        />
      ) : null}
      {reading && conversationId ? (
        <AttachmentPdfViewer
          attachment={reading.attachment}
          source={{ conversationId, messageId: reading.messageId }}
          onClose={() => setReading(null)}
        />
      ) : null}
    </div>
  );
}
