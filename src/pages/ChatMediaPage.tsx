import { FileText, Image as ImageIcon, Link as LinkIcon } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { AppBar } from '@/components/AppBar';
import { EmptyState, Spinner } from '@/components/ui';
import { FileTypeBadge } from '@/features/chat/FileTypeBadge';
import { monthHeading, monthKey, shortDate } from '@/features/chat/mediaFormat';
import { MediaViewer, type MediaViewerItem } from '@/features/chat/MediaViewer';
import { useConversationMedia } from '@/hooks/api/useConversationMedia';
import { afterOverlayCloses } from '@/lib/afterOverlayCloses';
import { cn } from '@/lib/cn';
import {
  useAttachmentDownload,
  type AttachmentSource,
} from '@/lib/downloadAttachment';
import { useLang, useT, type MessageKey, type TFunction } from '@/lib/i18n';
import { formatBytes } from '@/lib/uploadAttachment';
import { useFreshImageSrc } from '@/lib/useFreshImageSrc';
import { useGoBack } from '@/lib/useGoBack';
import { useAuthStore } from '@/store/auth';
import type { Lang } from '@/store/lang';
import type {
  Attachment,
  ConversationMediaItem,
  ConversationMediaTab,
} from '@dk/shared/types';

const TABS: { tab: ConversationMediaTab; labelKey: MessageKey }[] = [
  { tab: 'media', labelKey: 'chat.tabMedia' },
  { tab: 'docs', labelKey: 'chat.tabDocs' },
  { tab: 'links', labelKey: 'chat.tabLinks' },
];

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
  const goBack = useGoBack(`/chat/${conversationId ?? ''}`);
  const userId = useAuthStore((s) => s.user?.id);
  const [tab, setTab] = React.useState<ConversationMediaTab>('media');
  const query = useConversationMedia(conversationId, tab);
  const download = useAttachmentDownload();
  const [viewerKey, setViewerKey] = React.useState<string | null>(null);

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
        senderLabel:
          userId && item.senderId === userId
            ? t('chat.you')
            : (item.senderName ?? t('chat.supportFallbackName')),
        createdAt: item.createdAt,
        ...(item.bodySnippet ? { caption: item.bodySnippet } : {}),
      })),
    [pictures, conversationId, userId, t],
  );

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
      <button
        type="button"
        onClick={fetchNext}
        className="rounded-full border border-wa-divider bg-wa-chip px-4 py-2 text-[13px] text-wa-meta active:bg-wa-row-active"
      >
        {t('media.loadMoreFailed')}
      </button>
    </div>
  ) : query.isFetchingNextPage ? (
    <div className="flex justify-center py-4 text-wa-meta">
      <Spinner size={18} />
    </div>
  ) : query.hasNextPage ? (
    <div ref={sentinelRef} className="flex justify-center py-3">
      {observing ? null : (
        <button
          type="button"
          onClick={fetchNext}
          className="rounded-full border border-wa-divider bg-wa-chip px-3 py-1 text-xs text-wa-meta active:bg-wa-row-active"
        >
          {t('chat.loadMore')}
        </button>
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
      <div className="flex flex-1 items-center justify-center py-20 text-wa-meta">
        <Spinner size={20} />
      </div>
    );
  } else if (query.isError && items.length === 0) {
    // NOT the empty state. A failed request and an empty gallery look identical
    // from `items.length === 0`, and telling a dealer whose every report is in
    // here that there are no photos is a confident wrong answer — the same
    // shape as the "No chats yet" bug. Say what happened, and offer the retry.
    content = (
      <div className="flex flex-1 items-center justify-center px-4">
        <EmptyState
          icon={<ImageIcon width={28} strokeWidth={1.5} />}
          title={t('chat.mediaLoadFailed')}
          description={t('common.helpDesc')}
          cta={
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="rounded-full bg-wa-accent px-5 py-2 text-sm font-medium text-text-inverse active:opacity-90"
            >
              {t('common.retry')}
            </button>
          }
        />
      </div>
    );
  } else if (
    items.length === 0 ||
    (tab === 'links' && linkRows(items).length === 0)
  ) {
    content = (
      <div className="flex flex-1 items-center justify-center px-4">
        <EmptyState
          icon={
            tab === 'media' ? (
              <ImageIcon width={28} strokeWidth={1.5} />
            ) : tab === 'docs' ? (
              <FileText width={28} strokeWidth={1.5} />
            ) : (
              <LinkIcon width={28} strokeWidth={1.5} />
            )
          }
          title={t(EMPTY_KEYS[tab])}
        />
      </div>
    );
  } else if (tab === 'media') {
    content = (
      <>
        <div aria-label={t('media.gallery')} role="group">
          {months.map((month, m) => (
            <section key={month.key}>
              <h2
                className={cn(
                  'px-4 pb-2 text-[14px] font-medium text-wa-meta',
                  m === 0 ? 'pt-3' : 'pt-5',
                )}
              >
                {month.label}
              </h2>
              <div className="grid grid-cols-3 gap-0.5 px-0.5">
                {month.items.map((item) => (
                  <button
                    key={itemKey(item)}
                    type="button"
                    aria-label={item.attachment.filename}
                    onClick={() => setViewerKey(itemKey(item))}
                    className="block aspect-square overflow-hidden bg-wa-row-active"
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
        <ul>
          {items.map((item) =>
            item.attachment ? (
              <li key={itemKey(item)}>
                <button
                  type="button"
                  onClick={() =>
                    void download(item.attachment!, {
                      conversationId: conversationId!,
                      messageId: item.messageId,
                    })
                  }
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-wa-row-active"
                >
                  <FileTypeBadge
                    filename={item.attachment.filename}
                    contentType={item.attachment.contentType}
                  />
                  <span className="min-w-0 flex-1 border-b border-wa-divider pb-3 pt-0.5">
                    <span className="block truncate text-[15px] text-wa-bubble-text">
                      {item.attachment.filename}
                    </span>
                    <span className="block text-[13px] text-wa-meta">
                      {formatBytes(item.attachment.size)} ·{' '}
                      {shortDate(item.createdAt, lang)}
                    </span>
                  </span>
                </button>
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
        <ul>
          {linkRows(items).map((row) => (
            <li key={row.key}>
              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-3 px-4 py-3 active:bg-wa-row-active"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-wa-row-active text-wa-bar-icon">
                  <LinkIcon width={18} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1 border-b border-wa-divider pb-3 pt-0.5">
                  <span className="block truncate text-[15px] font-medium text-wa-bubble-text">
                    {domainOf(row.url)}
                  </span>
                  <span className="block truncate text-[13px] text-wa-accent-strong">
                    {row.url}
                  </span>
                  <span className="block text-[13px] text-wa-meta">
                    {shortDate(row.createdAt, lang)}
                  </span>
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
    <div className="flex min-h-full flex-1 flex-col bg-surface">
      <AppBar title={t('media.title')} onBack={goBack} />

      {/* WhatsApp's tabs: words on a white bar, the chosen one underlined in the
          accent colour. */}
      <div
        role="tablist"
        className="flex shrink-0 border-b border-wa-divider bg-wa-bar"
      >
        {TABS.map(({ tab: value, labelKey }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              'flex-1 border-b-[3px] py-3 text-[14px] font-medium transition-colors',
              tab === value
                ? 'border-wa-accent-strong text-wa-accent-strong'
                : 'border-transparent text-wa-meta active:bg-wa-row-active',
            )}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex flex-1 flex-col pb-4">
        {content}
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
    </div>
  );
}
