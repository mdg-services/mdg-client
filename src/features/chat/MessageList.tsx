import { type InfiniteData } from '@tanstack/react-query';
import { ChevronDown, MessageCircleHeart } from 'lucide-react';
import * as React from 'react';

import { EmptyState, Spinner, useToast } from '@/components/ui';
import { useAttachmentDownload } from '@/lib/downloadAttachment';
import { useT, type TFunction } from '@/lib/i18n';
import type { Attachment, Message } from '@dk/shared/types';

import { ImageLightbox } from './ImageLightbox';
import { MessageBubble } from './MessageBubble';
import { SwipeToReply } from './SwipeToReply';

function dayLabel(iso: string, t: TFunction): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return t('chat.today');
  if (sameDay(d, yesterday)) return t('chat.yesterday');
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

/** What the jump-to-quote loop needs back from fetching one older page. */
export interface FetchOlderResult {
  data?: InfiniteData<Message[]>;
  hasNextPage?: boolean;
}

/** How many older pages the jump-to-quote loop will pull in before giving up. */
const JUMP_MAX_PAGES = 10;

export interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  /** Used to abort an in-flight jump-to-quote loop when the thread changes. */
  conversationId?: string;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  typing?: { active: boolean; userName?: string };
  onQuickAction?: (text: string) => void;
  /** Show sender names above others' bubbles (group threads). */
  showSenderNames?: boolean;
  /** Long-press on a bubble → the message action sheet. */
  onAction?: (message: Message) => void;
  /** Tap on a bubble's reaction chips → the who-reacted sheet. */
  onOpenReactions?: (message: Message) => void;
  /** Swipe-right on a bubble → start replying to it. */
  onReply?: (message: Message) => void;
  /** Fetch one older page (jump-to-quote auto-load); pass fetchNextPage. */
  onFetchOlder?: () => Promise<FetchOlderResult>;
}

export function MessageList({
  messages,
  currentUserId,
  conversationId,
  loading,
  hasMore,
  onLoadMore,
  loadingMore,
  typing,
  onQuickAction,
  showSenderNames,
  onAction,
  onOpenReactions,
  onReply,
  onFetchOlder,
}: MessageListProps) {
  const t = useT();
  const toast = useToast();
  const download = useAttachmentDownload();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  // Whether the user is parked at the bottom of the thread. Kept current on
  // scroll so we know whether to re-pin when the viewport shrinks.
  const stick = React.useRef(true);
  const [lightbox, setLightbox] = React.useState<Attachment | null>(null);
  // Stable so the memoized MessageBubble doesn't re-render on every keystroke.
  const openImage = React.useCallback(
    (attachment: Attachment) => setLightbox(attachment),
    [],
  );

  // Scroll-to-bottom FAB: shown when scrolled well off the bottom, with a
  // badge counting the other party's messages that arrived while detached.
  const [offBottom, setOffBottom] = React.useState(false);
  const [newWhileAway, setNewWhileAway] = React.useState(0);

  const onScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = gap < 120;
    const off = gap > 300;
    // Functional updates that return the same value let React bail out, so
    // this scroll handler almost never causes a render.
    setOffBottom((prev) => (prev === off ? prev : off));
    if (gap < 120) setNewWhileAway((c) => (c === 0 ? c : 0));
  }, []);

  const scrollToBottom = React.useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setNewWhileAway(0);
  }, []);

  // Display oldest -> newest. Each API page is oldest-first, but pages arrive
  // newest-batch-first and realtime/optimistic messages are prepended, so sort
  // by timestamp for a stable chronological order regardless of insertion point.
  const ordered = React.useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [messages],
  );

  // Auto-scroll to bottom when a NEW newest message lands (only if the user is
  // near the bottom). Keyed on the tail id, not the count, so prepending older
  // pages (load-earlier / jump-to-quote) never yanks the view; while detached,
  // arriving messages from the other party feed the FAB badge instead.
  const prevTail = React.useRef<{ id: string; createdAt: string } | null>(null);
  React.useLayoutEffect(() => {
    const tail = ordered[ordered.length - 1] ?? null;
    const prev = prevTail.current;
    prevTail.current = tail ? { id: tail.id, createdAt: tail.createdAt } : null;
    if (!tail || (prev && tail.id === prev.id)) return;
    const el = containerRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 200 || !prev;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const prevTime = new Date(prev!.createdAt).getTime();
    const arrived = ordered.reduce(
      (n, m) =>
        m.senderId !== currentUserId &&
        new Date(m.createdAt).getTime() > prevTime
          ? n + 1
          : n,
      0,
    );
    if (arrived > 0) setNewWhileAway((c) => c + arrived);
  }, [ordered, currentUserId]);

  // Keep the newest message visible when the scroll area itself resizes — the
  // keyboard opening (shrinks the viewport) or the composer growing to multiple
  // lines. Without this, opening the keyboard would leave the last message
  // scrolled out of view above the fold.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Jump to a quoted message ────────────────────────────────────────────
  // Scroll+flash when it's already loaded; otherwise auto-load older pages
  // (capped) with a spinner on the tapped quote. A token guards against the
  // thread changing (or a second jump starting) mid-loop.
  const jumpToken = React.useRef(0);
  const [quoteLoadingId, setQuoteLoadingId] = React.useState<string | null>(null);
  const latest = React.useRef({ hasMore, onFetchOlder });
  latest.current = { hasMore, onFetchOlder };

  React.useEffect(() => {
    jumpToken.current += 1;
    setQuoteLoadingId(null);
    // Cleanup runs on BOTH thread change and unmount: bumping the token stops
    // an in-flight loop after its current await, so leaving the screen can't
    // keep burning 2G bandwidth on older pages or pop the not-found toast on
    // whatever screen the user is looking at by then.
    return () => {
      jumpToken.current += 1;
    };
  }, [conversationId]);

  const flashRow = React.useCallback((id: string): boolean => {
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-mid="${id}"]`,
    );
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Restart the animation cleanly on repeat jumps to the same message.
    el.classList.remove('flash-highlight');
    void el.offsetWidth;
    el.classList.add('flash-highlight');
    window.setTimeout(() => el.classList.remove('flash-highlight'), 2100);
    return true;
  }, []);

  const handleJumpTo = React.useCallback(
    async (targetId: string, fromId: string) => {
      if (flashRow(targetId)) return;
      const token = ++jumpToken.current;
      setQuoteLoadingId(fromId);
      try {
        for (let i = 0; i < JUMP_MAX_PAGES; i += 1) {
          const { hasMore: more, onFetchOlder: fetchOlder } = latest.current;
          if (!more || !fetchOlder) break;
          let res: FetchOlderResult;
          try {
            res = await fetchOlder();
          } catch {
            break; // network hiccup — fall through to the not-found toast
          }
          if (jumpToken.current !== token) return;
          const found = res.data?.pages.some((p) =>
            p.some((m) => m.id === targetId),
          );
          if (found) {
            // Give React a beat to paint the prepended page before querying.
            await new Promise<void>((r) => window.setTimeout(r, 50));
            if (jumpToken.current !== token) return;
            if (flashRow(targetId)) return;
          }
          if (res.hasNextPage === false) break;
        }
        if (jumpToken.current !== token) return;
        if (!flashRow(targetId)) toast.info(t('chat.originalNotFound'));
      } finally {
        if (jumpToken.current === token) setQuoteLoadingId(null);
      }
    },
    [flashRow, toast, t],
  );

  // Group by day. Memoized so the whole list only rebuilds when the messages,
  // the current user, or the language (t) actually change — not on every parent
  // re-render (typing indicator, lightbox open, etc.). Keeping `t` in the deps is
  // required: it changes identity on a language switch so the 'आज'/'कल' dividers
  // re-localise. Every callback handed to a bubble is stable, so React.memo on
  // MessageBubble keeps unchanged bubbles from re-rendering.
  const rendered = React.useMemo(() => {
    const out: React.ReactNode[] = [];
    let lastDay = '';
    ordered.forEach((m, idx) => {
      const dl = dayLabel(m.createdAt, t);
      if (dl !== lastDay) {
        out.push(
          <div
            key={`d-${dl}-${idx}`}
            className="my-2 flex items-center justify-center"
          >
            <span className="rounded-full bg-surface-2 px-3 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-subtle">
              {dl}
            </span>
          </div>,
        );
        lastDay = dl;
      }
      const interactive =
        !m.system && !m.card && !m.id.startsWith('temp-');
      out.push(
        <SwipeToReply
          key={m.id}
          data-mid={m.id}
          message={m}
          onReply={onReply}
          disabled={!interactive}
        >
          <MessageBubble
            message={m}
            mine={m.senderId === currentUserId}
            currentUserId={currentUserId}
            showSender={showSenderNames}
            quoteLoading={quoteLoadingId === m.id}
            onOpenImage={openImage}
            onAction={onAction}
            onOpenReactions={onOpenReactions}
            onJumpTo={handleJumpTo}
          />
        </SwipeToReply>,
      );
    });
    return out;
  }, [
    ordered,
    currentUserId,
    t,
    openImage,
    onAction,
    onOpenReactions,
    onReply,
    handleJumpTo,
    quoteLoadingId,
    showSenderNames,
  ]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  }

  if (!loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <EmptyState
          icon={<MessageCircleHeart width={28} strokeWidth={1.5} />}
          title={t('chat.emptyTitle')}
          description={t('chat.emptyDesc')}
          cta={
            onQuickAction ? (
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {[
                  t('chat.quickReportIssue'),
                  t('chat.quickRequestService'),
                  t('chat.quickTalkSupport'),
                ].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onQuickAction(label)}
                    className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-text hover:bg-surface-2"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 scrollbar-thin"
      >
        {hasMore ? (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted hover:bg-surface-2 disabled:opacity-60"
            >
              {loadingMore ? t('common.loading') : t('chat.loadEarlier')}
            </button>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          {rendered}
          {typing?.active ? (
            <div className="flex w-full justify-start">
              <div className="flex items-center gap-1.5 rounded-3xl rounded-bl-md border border-border bg-surface px-4 py-2.5 text-sm text-text-muted shadow-sm">
                <span className="sr-only">
                  {t('chat.isTyping', {
                    name: typing.userName ?? t('chat.supportName'),
                  })}
                </span>
                <Dot />
                <Dot delay={150} />
                <Dot delay={300} />
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>
      {offBottom ? (
        <button
          type="button"
          aria-label={
            newWhileAway > 0
              ? t('chat.newMessages', { n: newWhileAway })
              : t('chat.scrollToBottom')
          }
          onClick={scrollToBottom}
          className="absolute bottom-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-md hover:bg-surface-2 active:bg-surface-2 animate-in"
        >
          <ChevronDown width={20} strokeWidth={1.75} />
          {newWhileAway > 0 ? (
            <span className="absolute -right-1 -top-1.5 min-w-[18px] rounded-full bg-brand px-1 text-center text-[11px] font-semibold leading-[18px] text-text-inverse">
              {newWhileAway > 99 ? '99+' : newWhileAway}
            </span>
          ) : null}
        </button>
      ) : null}
      {lightbox ? (
        <ImageLightbox
          attachment={lightbox}
          onClose={() => setLightbox(null)}
          onDownload={download}
        />
      ) : null}
    </div>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-text-subtle"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}
