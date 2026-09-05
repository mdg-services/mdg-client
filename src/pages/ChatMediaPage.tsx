import { ChevronLeft, FileText, Image as ImageIcon, Link as LinkIcon } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { EmptyState, Spinner } from '@/components/ui';
import { ImageLightbox } from '@/features/chat/ImageLightbox';
import { useConversationMedia } from '@/hooks/api/useConversationMedia';
import { cn } from '@/lib/cn';
import {
  useAttachmentDownload,
  type AttachmentSource,
} from '@/lib/downloadAttachment';
import { useT, type MessageKey } from '@/lib/i18n';
import { formatBytes } from '@/lib/uploadAttachment';
import { useFreshImageSrc } from '@/lib/useFreshImageSrc';
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

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

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

/**
 * Per-conversation gallery: everything ever shared in the thread, split into
 * Media (image grid), Docs (file rows) and Links (extracted from bodies).
 * Routed at /chat/:id/media — OUTSIDE the fixed --vvh chat frame, so it
 * scrolls like a normal page.
 */
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

export function ChatMediaPage() {
  const t = useT();
  const navigate = useNavigate();
  const { id: conversationId } = useParams<{ id: string }>();
  const [tab, setTab] = React.useState<ConversationMediaTab>('media');
  const query = useConversationMedia(conversationId, tab);
  const download = useAttachmentDownload();
  // The gallery flattens attachments out of their messages, so each item keeps
  // the message id it came from: a fresh presign is authorised through the
  // message that carries the key, never by the key alone.
  const [lightbox, setLightbox] = React.useState<{
    attachment: Attachment;
    source: AttachmentSource;
  } | null>(null);

  const items = React.useMemo(
    () => (query.data?.pages ?? []).flat(),
    [query.data],
  );

  const loadMore = query.hasNextPage ? (
    <div className="flex justify-center py-3">
      <button
        type="button"
        onClick={() => void query.fetchNextPage()}
        disabled={query.isFetchingNextPage}
        className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted hover:bg-surface-2 active:bg-surface-2 disabled:opacity-60"
      >
        {query.isFetchingNextPage ? t('common.loading') : t('chat.loadMore')}
      </button>
    </div>
  ) : null;

  let content: React.ReactNode;
  if (query.isLoading) {
    content = (
      <div className="flex flex-1 items-center justify-center py-20">
        <Spinner size={20} />
      </div>
    );
  } else if (query.isError) {
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
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-text-inverse active:opacity-90"
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
        <div className="grid grid-cols-3 gap-1 p-1">
          {items.map((item) =>
            item.attachment?.url ? (
              <button
                key={`${item.messageId}-${item.attachment.storageKey}`}
                type="button"
                aria-label={item.attachment.filename}
                onClick={() =>
                  setLightbox({
                    attachment: item.attachment!,
                    source: {
                      conversationId: conversationId!,
                      messageId: item.messageId,
                    },
                  })
                }
                className="block aspect-square min-h-[6rem] overflow-hidden rounded-md bg-surface-2"
              >
                <GalleryThumb
                  attachment={item.attachment}
                  source={{
                    conversationId: conversationId!,
                    messageId: item.messageId,
                  }}
                />
              </button>
            ) : null,
          )}
        </div>
        {loadMore}
      </>
    );
  } else if (tab === 'docs') {
    content = (
      <>
        <ul className="divide-y divide-border">
          {items.map((item) =>
            item.attachment ? (
              <li key={`${item.messageId}-${item.attachment.storageKey}`}>
                <button
                  type="button"
                  onClick={() =>
                    void download(item.attachment!, {
                      conversationId: conversationId!,
                      messageId: item.messageId,
                    })
                  }
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 active:bg-surface-2"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-muted">
                    <FileText width={18} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">
                      {item.attachment.filename}
                    </span>
                    <span className="block text-[11px] text-text-subtle">
                      {formatBytes(item.attachment.size)} ·{' '}
                      {formatWhen(item.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ) : null,
          )}
        </ul>
        {loadMore}
      </>
    );
  } else {
    content = (
      <>
        <ul className="divide-y divide-border">
          {linkRows(items).map((row) => (
            <li key={row.key}>
              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-3 px-4 py-3 hover:bg-surface-2 active:bg-surface-2"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-muted">
                  <LinkIcon width={18} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text">
                    {domainOf(row.url)}
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    {row.url}
                  </span>
                  <span className="block text-[11px] text-text-subtle">
                    {formatWhen(row.createdAt)}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        {loadMore}
      </>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-surface px-2 py-2.5">
        <button
          type="button"
          aria-label={t('chat.backToChats')}
          onClick={() => navigate(`/chat/${conversationId}`)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-2 active:bg-surface-2"
        >
          <ChevronLeft width={22} strokeWidth={1.75} />
        </button>
        <p className="min-w-0 flex-1 truncate px-1 text-sm font-semibold text-text">
          {t('chat.mediaTitle')}
        </p>
      </div>

      <div className="px-3 pt-3">
        <div className="flex rounded-full bg-surface-2 p-1">
          {TABS.map(({ tab: value, labelKey }) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                'flex-1 rounded-full py-1.5 text-xs font-medium transition-colors',
                tab === value
                  ? 'bg-surface text-text shadow-sm'
                  : 'text-text-muted hover:text-text active:text-text',
              )}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col pt-2">{content}</div>

      {lightbox ? (
        <ImageLightbox
          attachment={lightbox.attachment}
          source={lightbox.source}
          onClose={() => setLightbox(null)}
          onDownload={download}
        />
      ) : null}
    </div>
  );
}
