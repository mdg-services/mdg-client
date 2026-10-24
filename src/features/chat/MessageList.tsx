import { type InfiniteData } from '@tanstack/react-query';
import { ChevronDown, MessageCircleHeart } from 'lucide-react';
import * as React from 'react';

import { EmptyState, Spinner, useToast } from '@/components/ui';
import { isRetiredSetupCard } from '@/features/setup/SetupCard';
import type { ChatAskStates } from '@/hooks/api/useChatAskStates';
import { renderKey } from '@/hooks/api/useMessages';
import { afterOverlayCloses } from '@/lib/afterOverlayCloses';
import { cn } from '@/lib/cn';
import { useAttachmentDownload } from '@/lib/downloadAttachment';
import { useLang, useT } from '@/lib/i18n';
import {
  QUICK_REACTIONS,
  type Attachment,
  type Message,
  type TicketDealerView,
} from '@dk/shared/types';

import { askViewOf } from './askView';
import { MediaViewer } from './MediaViewer';
import { MessageBubble, type AskAnswerHow } from './MessageBubble';
import {
  buildRowMeta,
  buildViewerItems,
  dayLabel,
  orderMessages,
  viewerKey,
  type UnreadOnOpen,
} from './messageRuns';
import { SwipeToReply } from './SwipeToReply';
import { ticketLinesById } from './ticketLine';

/** What the jump-to-quote loop needs back from fetching one older page. */
export interface FetchOlderResult {
  data?: InfiniteData<Message[]>;
  hasNextPage?: boolean;
}

/** How many older pages the jump-to-quote loop will pull in before giving up. */
const JUMP_MAX_PAGES = 10;
/**
 * The same, for a jump to a message the server has just told us exists — a
 * search hit, or "Show in chat" from a picture. Ten pages is 300 messages, and
 * a dealer searching a year-old thread found "1 of 1" in the bar and then "That
 * message is no longer available" for a message that was plainly there. This
 * pages on until it arrives or the thread ends; the cap is only a backstop.
 */
const JUMP_KNOWN_MAX_PAGES = 80;
/** Closer than this (px) to the top, older messages start loading by themselves. */
const NEAR_TOP_PX = 400;
/** Within this many px of the bottom the thread counts as "at the bottom". */
const AT_BOTTOM_PX = 120;
/** Further than this from the bottom, the round "go to latest" button shows. */
const FAB_AFTER_PX = 300;
/** How much of the thread above the unread band stays visible when it opens there. */
const BAND_TOP_GAP_PX = 56;
/** The floating date goes away this long after the last scroll. */
const FLOAT_HIDE_MS = 1000;

export interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  /** Used to abort an in-flight jump-to-quote loop when the thread changes. */
  conversationId?: string;
  loading?: boolean;
  hasMore?: boolean;
  /** Fetch the next older page. Called by itself when the reader nears the top. */
  onLoadMore?: () => void;
  loadingMore?: boolean;
  /** The last attempt to load older messages failed — a small retry chip shows. */
  loadMoreFailed?: boolean;
  typing?: { active: boolean; userName?: string };
  onQuickAction?: (text: string) => void;
  /** Show sender names above others' bubbles (group threads). */
  showSenderNames?: boolean;
  /**
   * The messages currently selected (long-press, then taps). While there is one,
   * a tap on any row adds or removes it and nothing else on the row reacts.
   */
  selectedIds?: ReadonlySet<string>;
  /** Long-press on a bubble, or a tap while selecting: start or change the selection. */
  onToggleSelect?: (message: Message) => void;
  /** Pick one of the six quick reactions from the strip over a lone selected message. */
  onReact?: (message: Message, emoji: string) => void;
  /** Tap on a bubble's reaction chips → the who-reacted sheet. */
  onOpenReactions?: (message: Message) => void;
  /** Swipe-right on a bubble → start replying to it. */
  onReply?: (message: Message) => void;
  /**
   * The conversation's tickets (`Conversation.tickets`). A message that names a
   * ticket in `ai.ticketId` gets a status line under it when that ticket is in
   * here, and none when it is not. Reduced to a status word and a number before
   * it reaches a bubble, so a new array of the same tickets re-renders no bubble.
   */
  tickets?: TicketDealerView[];
  /** Fetch one older page (jump-to-quote auto-load); pass fetchNextPage. */
  onFetchOlder?: () => Promise<FetchOlderResult>;
  /** The history could not be loaded — say so instead of showing an empty thread. */
  failed?: boolean;
  /** Retry that load. */
  onRetry?: () => void;
  /**
   * What was waiting when the thread opened. `undefined`: nobody is tracking it
   * (the thread opens at the bottom). `null`: not known yet — the thread shows
   * what it has at the bottom and moves to the band the moment it is known.
   */
  unread?: UnreadOnOpen | null;
  /** Scroll to this message and flash it. Bump `n` to ask again for the same one. */
  jumpTo?: { id: string; n: number } | null;
  /** The words of an open in-chat search; they are painted in the bubbles. */
  highlight?: string;
  /**
   * Where each request MDG posted in this thread stands (ADR 0019). A message
   * that carries `ask` draws its "Send photo" button, "Sent", or "Received" from
   * this; without it such a message draws only its title and day.
   */
  askStates?: ChatAskStates;
  /** "Send photo" / "Choose file" on a request — called INSIDE the tap. */
  onAskAnswer?: (message: Message, how: AskAnswerHow) => void;
}

/**
 * The thread, drawn the way WhatsApp draws it.
 *
 * Wallpaper behind everything; runs of bubbles from one sender; a date chip that
 * floats at the top while you scroll; an "N unread messages" band that the
 * thread opens at; older history that loads by itself as you near the top
 * without moving what you are reading; a round button back to the latest
 * message; and a selection mode in place of an action sheet.
 */
export function MessageList({
  messages,
  currentUserId,
  conversationId,
  loading,
  hasMore,
  onLoadMore,
  loadingMore,
  loadMoreFailed,
  typing,
  onQuickAction,
  showSenderNames,
  selectedIds,
  onToggleSelect,
  onReact,
  onOpenReactions,
  onReply,
  tickets,
  onFetchOlder,
  failed,
  onRetry,
  unread,
  jumpTo,
  highlight,
  askStates,
  onAskAnswer,
}: MessageListProps) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const download = useAttachmentDownload();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  /**
   * What the reader's position is tied to while content around it changes size.
   *   bottom  — parked at the newest message: stay there when the keyboard opens,
   *             the composer grows, or a picture finishes loading.
   *   divider — the thread opened at the unread band and nobody has touched it:
   *             keep the band where it was put as the pictures above it load.
   *   free    — the reader is somewhere in the history: leave them alone.
   */
  const anchor = React.useRef<'bottom' | 'divider' | 'free'>('bottom');
  // Set by the first touch, wheel or key on the list. Until then every scroll is
  // ours (the thread opening), and none of them may change what we are anchored to.
  const touched = React.useRef(false);
  const positioned = React.useRef<'none' | 'provisional' | 'done'>('none');
  // The height before an older page lands, to put the reader back where they were.
  const pendingPrepend = React.useRef<{ height: number } | null>(null);
  // Where the reader last was. The place to put them back is worked out from
  // THIS and not from whatever `scrollTop` reads after the page has landed: the
  // browser may already have moved it (scroll anchoring does exactly this when
  // content appears above what you are reading), and adding the page's height
  // to a position that has already been corrected would throw them a page too far.
  const lastTop = React.useRef(0);
  // One older-page request at a time. Scroll events arrive far faster than a page
  // does, and each one used to ask again.
  const asking = React.useRef(false);

  // The full-screen viewer: which picture it opened on. Its list is rebuilt from
  // the thread each render, so a picture that arrives while it is open joins it.
  const [openPicture, setOpenPicture] = React.useState<string | null>(null);
  const openImage = React.useCallback(
    (attachment: Attachment, message: Message) =>
      setOpenPicture(viewerKey(message, attachment.storageKey)),
    [],
  );

  // Scroll-to-bottom button: shown when scrolled well off the bottom, with a
  // badge counting the other party's messages that arrived while detached.
  const [offBottom, setOffBottom] = React.useState(false);
  const [newWhileAway, setNewWhileAway] = React.useState(0);

  // The floating date: the day of the message at the top edge, while scrolling.
  const [floatLabel, setFloatLabel] = React.useState('');
  const [floatVisible, setFloatVisible] = React.useState(false);
  const floatTimer = React.useRef<number | null>(null);
  const floatFrame = React.useRef<number>(0);

  const latest = React.useRef({ hasMore, loadingMore, loadMoreFailed, onLoadMore, onFetchOlder });
  latest.current = { hasMore, loadingMore, loadMoreFailed, onLoadMore, onFetchOlder };

  // Display oldest -> newest. Each API page is oldest-first, but pages arrive
  // newest-batch-first and realtime/optimistic messages are prepended, so sort
  // by timestamp for a stable chronological order regardless of insertion point.
  // A message that landed twice (a page refetched under a live one) is drawn once.
  // The retired "which services?" question is not drawn, so it is not a row.
  const ordered = React.useMemo(
    () => orderMessages(messages).filter((m) => !isRetiredSetupCard(m)),
    [messages],
  );

  // ── Older history ───────────────────────────────────────────────────────
  const requestOlder = React.useCallback(() => {
    if (asking.current) return;
    asking.current = true;
    // A request that never changes `loadingMore` (a refused one) must not lock the
    // thread out of older history for good.
    window.setTimeout(() => {
      asking.current = false;
    }, 8000);
    const el = containerRef.current;
    if (el) {
      lastTop.current = el.scrollTop;
      pendingPrepend.current = { height: el.scrollHeight };
    }
    latest.current.onLoadMore?.();
  }, []);

  // The request is over — the page landed, or it failed — and the next may go.
  React.useEffect(() => {
    if (!loadingMore) asking.current = false;
  }, [loadingMore, hasMore, loadMoreFailed, messages.length]);

  const canLoadOlder = () => {
    const l = latest.current;
    return !!l.hasMore && !l.loadingMore && !l.loadMoreFailed && !!l.onLoadMore;
  };

  // ── Where the reader is ─────────────────────────────────────────────────
  const updateFloatingDate = React.useCallback(() => {
    floatFrame.current = 0;
    const el = containerRef.current;
    if (!el) return;
    const rows = el.querySelectorAll<HTMLElement>('[data-day]');
    if (rows.length === 0) return;
    // A day chip that is itself about to reach the top says the same thing, so
    // the floating one steps aside rather than sit on top of it.
    for (const chip of el.querySelectorAll<HTMLElement>('[data-day-chip]')) {
      const at = chip.offsetTop - el.scrollTop;
      if (at > -28 && at < 52) {
        setFloatLabel((prev) => (prev === '' ? prev : ''));
        return;
      }
    }
    // First row whose bottom edge is below the top of the viewport (binary search:
    // rows are in document order, and a long thread has hundreds).
    let lo = 0;
    let hi = rows.length - 1;
    let found = 0;
    const edge = el.scrollTop + 8;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = rows[mid]!;
      if (r.offsetTop + r.offsetHeight > edge) {
        found = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    const label = rows[found]?.dataset.day ?? '';
    setFloatLabel((prev) => (prev === label ? prev : label));
  }, []);

  const onScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    lastTop.current = el.scrollTop;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (touched.current) anchor.current = gap < AT_BOTTOM_PX ? 'bottom' : 'free';
    const off = gap > FAB_AFTER_PX;
    // Functional updates that return the same value let React bail out, so
    // this scroll handler almost never causes a render.
    setOffBottom((prev) => (prev === off ? prev : off));
    if (gap < AT_BOTTOM_PX) setNewWhileAway((c) => (c === 0 ? c : 0));

    // The date at the top shows while the READER moves the thread, and fades a
    // second after. Not for our own scrolling — the thread opening at its band
    // is not the reader reading — so it waits for a first touch.
    if (touched.current) {
      if (!floatFrame.current) floatFrame.current = requestAnimationFrame(updateFloatingDate);
      setFloatVisible((v) => (v ? v : true));
      if (floatTimer.current) window.clearTimeout(floatTimer.current);
      floatTimer.current = window.setTimeout(() => setFloatVisible(false), FLOAT_HIDE_MS);
    }

    // Older messages come in on their own before the reader reaches the top.
    if (el.scrollTop < NEAR_TOP_PX && canLoadOlder()) requestOlder();
  }, [requestOlder, updateFloatingDate]);

  const markTouched = React.useCallback(() => {
    touched.current = true;
  }, []);

  React.useEffect(
    () => () => {
      if (floatTimer.current) window.clearTimeout(floatTimer.current);
      if (floatFrame.current) cancelAnimationFrame(floatFrame.current);
    },
    [],
  );

  const scrollToBottom = React.useCallback(() => {
    anchor.current = 'bottom';
    touched.current = true;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setNewWhileAway(0);
  }, []);

  // ── Opening the thread, and keeping the reader's place ──────────────────
  const alignToBand = React.useCallback((): boolean => {
    const el = containerRef.current;
    const band = el?.querySelector<HTMLElement>('[data-unread-band]');
    if (!el || !band) return false;
    el.scrollTop = Math.max(0, band.offsetTop - BAND_TOP_GAP_PX);
    return true;
  }, []);

  const prevTail = React.useRef<{ id: string; createdAt: string } | null>(null);
  const prevHead = React.useRef<string | undefined>(undefined);
  const hasRows = ordered.length > 0;

  // The head of the thread changed because an OLDER page landed above what the
  // reader is looking at: put them back where they were, before the next paint,
  // so what they are reading does not jump down by a page's worth.
  const headId = ordered[0]?.id;
  React.useLayoutEffect(() => {
    const el = containerRef.current;
    const before = prevHead.current;
    prevHead.current = headId;
    const pending = pendingPrepend.current;
    if (!el || !pending || before === undefined || before === headId) return;
    pendingPrepend.current = null;
    el.scrollTop = lastTop.current + (el.scrollHeight - pending.height);
  }, [headId]);

  React.useLayoutEffect(() => {
    const el = containerRef.current;
    const tail = ordered[ordered.length - 1] ?? null;
    const prev = prevTail.current;
    prevTail.current = tail ? { id: tail.id, createdAt: tail.createdAt } : null;
    if (!el || !tail) return;

    // FIRST PAINT OF THIS THREAD. Where it opens is decided here, once: at the
    // unread band when there is one, at the bottom when there is not.
    if (positioned.current !== 'done') {
      const waiting = unread === null;
      if (positioned.current === 'provisional' && touched.current) {
        positioned.current = 'done';
        return;
      }
      if (unread?.firstId && alignToBand()) {
        anchor.current = 'divider';
        positioned.current = 'done';
        const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
        // The round button opens carrying the unread count, as in WhatsApp.
        setOffBottom(gap > FAB_AFTER_PX);
        setNewWhileAway(gap > FAB_AFTER_PX ? unread.count : 0);
        return;
      }
      el.scrollTop = el.scrollHeight;
      anchor.current = 'bottom';
      positioned.current = waiting ? 'provisional' : 'done';
      return;
    }

    // Compared by row key, not id: a photo the reader sent becomes its real id
    // when the upload confirms — up to a minute later on 2G — and comparing ids
    // read that swap as a NEW message and pulled a reader who had scrolled up to
    // an older report back down to the bottom.
    if (!prev || renderKey(tail.id) === renderKey(prev.id)) return;
    // A message the reader just sent always brings them to the bottom — they
    // want to see it go — wherever they were. So does one that arrives while
    // they are already reading the newest.
    const mineTail = tail.senderId === currentUserId;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (mineTail || anchor.current === 'bottom' || gap < 200) {
      anchor.current = 'bottom';
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      return;
    }
    const prevTime = new Date(prev.createdAt).getTime();
    const arrived = ordered.reduce(
      (n, m) =>
        m.senderId !== currentUserId && new Date(m.createdAt).getTime() > prevTime
          ? n + 1
          : n,
      0,
    );
    if (arrived > 0) setNewWhileAway((c) => c + arrived);
    // `unread` is in the deps because it is what lets a thread that opened from
    // the cache move to its band once the fresh answer arrives.
  }, [ordered, currentUserId, unread, alignToBand]);

  // A thread that does not fill the screen cannot be scrolled, so no scroll event
  // would ever ask for the older messages above it.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || !hasRows) return;
    if (el.scrollHeight <= el.clientHeight + 40 && canLoadOlder()) requestOlder();
  }, [hasRows, ordered.length, hasMore, loadingMore, loadMoreFailed, requestOlder]);

  // Keep the reader's place when the scroll area itself, or what is in it,
  // changes size — the keyboard opening (shrinks the viewport), the composer
  // growing to several lines, or a picture finishing its load and pushing the
  // rows below it down.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (anchor.current === 'bottom') el.scrollTop = el.scrollHeight;
      else if (anchor.current === 'divider') alignToBand();
    });
    ro.observe(el);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [alignToBand, hasRows]);

  // ── Jump to a quoted message ────────────────────────────────────────────
  // Scroll+flash when it's already loaded; otherwise auto-load older pages
  // (capped) with a spinner on the tapped quote. A token guards against the
  // thread changing (or a second jump starting) mid-loop.
  const jumpToken = React.useRef(0);
  const [quoteLoadingId, setQuoteLoadingId] = React.useState<string | null>(null);

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
    // The reader chose where to be: nothing may pull them back to the bottom.
    anchor.current = 'free';
    touched.current = true;
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
      // `fromId === ''` is a jump from outside the thread (search, the viewer,
      // the gallery): the target is known to exist, so keep looking.
      const maxPages = fromId === '' ? JUMP_KNOWN_MAX_PAGES : JUMP_MAX_PAGES;
      try {
        for (let i = 0; i < maxPages; i += 1) {
          const { hasMore: more, onFetchOlder: fetchOlder } = latest.current;
          if (!more || !fetchOlder) break;
          const el = containerRef.current;
          if (el) {
            lastTop.current = el.scrollTop;
            pendingPrepend.current = { height: el.scrollHeight };
          }
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

  // A jump asked for from outside: a search hit, or "Show in chat" from the gallery.
  const jumpKey = jumpTo ? `${jumpTo.id}:${jumpTo.n}` : '';
  React.useEffect(() => {
    if (!jumpTo) return;
    void handleJumpTo(jumpTo.id, '');
    // Re-run only for a NEW request, not because `handleJumpTo` was rebuilt.
  }, [jumpKey]);

  // Per-ticket status for the bubbles, rebuilt only when the conversation's
  // ticket list is replaced (a `conversation:updated` with the new state).
  const ticketLines = React.useMemo(() => ticketLinesById(tickets), [tickets]);

  const selecting = !!selectedIds && selectedIds.size > 0;
  const soleSelected =
    selectedIds && selectedIds.size === 1 ? [...selectedIds][0] : undefined;
  const term = highlight?.trim().toLowerCase() ?? '';

  // Group by day and by run. Memoized so the whole list only rebuilds when the
  // messages, the current user, the selection or the language (t) actually
  // change — not on every parent re-render (typing indicator, viewer open, etc.).
  // Keeping `t` in the deps is required: it changes identity on a language
  // switch so the day chips re-localise. Every callback handed to a bubble is
  // stable, so React.memo on MessageBubble keeps unchanged bubbles from
  // re-rendering.
  const rendered = React.useMemo(() => {
    const meta = buildRowMeta(ordered, unread?.firstId);
    const labels = new Map<string, string>();
    const now = new Date();
    const out: React.ReactNode[] = [];
    ordered.forEach((m, idx) => {
      const rm = meta[idx]!;
      let label = labels.get(rm.dayKey);
      if (label === undefined) {
        label = dayLabel(m.createdAt, t, lang, now);
        labels.set(rm.dayKey, label);
      }
      if (rm.showDay) {
        out.push(
          <div
            key={`d-${rm.dayKey}`}
            data-day-chip=""
            className="flex justify-center px-3 pb-1 pt-3"
          >
            <span className="rounded-lg bg-wa-chip px-3 py-1 text-[12.5px] leading-tight text-wa-chip-text shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
              {label}
            </span>
          </div>,
        );
      }
      if (rm.showUnread && unread) {
        out.push(
          <div
            key="unread-band"
            data-unread-band=""
            className="my-2 w-full bg-wa-chip py-1.5 text-center text-[12.5px] font-medium text-wa-chip-text"
          >
            {unread.count === 1
              ? t('chat.unreadOne')
              : t('chat.unreadMany', { n: unread.count })}
          </div>,
        );
      }
      const mine = m.senderId === currentUserId;
      const pending = m.id.startsWith('temp-');
      const selected = !!selectedIds?.has(m.id);
      const ticketLine = m.ai?.ticketId ? ticketLines.get(m.ai.ticketId) : undefined;
      const askView = m.ask ? askViewOf(m, askStates) : undefined;
      const marks =
        term && m.body && m.body.toLowerCase().includes(term) ? highlight!.trim() : undefined;
      out.push(
        <SwipeToReply
          key={renderKey(m.id)}
          data-mid={m.id}
          data-day={label}
          data-selected={selected ? 'true' : undefined}
          className={cn('px-3', rm.first ? 'pt-2' : 'pt-0.5', selected && 'bg-wa-select')}
          message={m}
          onReply={onReply}
          // A message still being sent cannot be replied to, and while the thread
          // is in selection mode a drag must not start a reply.
          disabled={pending || selecting}
          // While selecting, a tap anywhere on the row — on a picture, a link, a
          // quote, a play button — adds or removes the message, and nothing else
          // on the row reacts. Caught on the way DOWN so the controls inside
          // never see it.
          onClickCapture={
            selecting
              ? (e) => {
                  // The reaction strip is part of selecting, not part of the
                  // message: a tap on it picks a reaction.
                  if ((e.target as HTMLElement).closest('[data-selection-ui]')) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleSelect?.(m);
                }
              : undefined
          }
        >
          <MessageBubble
            message={m}
            mine={mine}
            currentUserId={currentUserId}
            showSender={showSenderNames}
            first={rm.first}
            quoteLoading={quoteLoadingId === m.id}
            highlight={marks}
            onOpenImage={openImage}
            onLongPress={onToggleSelect}
            onOpenReactions={onOpenReactions}
            onJumpTo={handleJumpTo}
            ticketStatus={ticketLine?.status}
            ticketNumber={ticketLine?.number}
            askPhase={askView?.phase}
            askReason={askView?.reason}
            onAskAnswer={onAskAnswer}
            onAskRetry={askStates?.refetch}
          />
          {soleSelected === m.id && onReact ? (
            <ReactionStrip
              message={m}
              mine={mine}
              currentUserId={currentUserId}
              onPick={onReact}
            />
          ) : null}
        </SwipeToReply>,
      );
    });
    return out;
  }, [
    ordered,
    unread,
    currentUserId,
    t,
    lang,
    openImage,
    onToggleSelect,
    onOpenReactions,
    onReply,
    onReact,
    handleJumpTo,
    quoteLoadingId,
    showSenderNames,
    ticketLines,
    selectedIds,
    selecting,
    soleSelected,
    term,
    highlight,
    askStates,
    onAskAnswer,
  ]);

  const viewerItems = React.useMemo(
    () => (openPicture ? buildViewerItems(ordered, currentUserId, t) : []),
    [openPicture, ordered, currentUserId, t],
  );
  const viewerCount = React.useRef(0);
  viewerCount.current = viewerItems.length;

  // THE VIEWER REACHED THE OLDEST PICTURE LOADED. One older page can be thirty
  // messages of plain text with no picture in it — and the viewer asks once per
  // new picture count, so after such a page it never asked again and gave no
  // sign that older pictures existed. Keep paging (a few pages) until a picture
  // arrives or the thread ends.
  const pictureHunt = React.useRef(0);
  const findOlderPictures = React.useCallback(async () => {
    const fetchOlder = latest.current.onFetchOlder;
    if (!fetchOlder) {
      requestOlder();
      return;
    }
    const token = ++pictureHunt.current;
    const before = viewerCount.current;
    const pictures = (pages: Message[][] | undefined) =>
      (pages ?? [])
        .flat()
        .reduce((n, m) => n + m.attachments.filter((a) => a.kind === 'image').length, 0);
    for (let i = 0; i < 5; i += 1) {
      if (!latest.current.hasMore || pictureHunt.current !== token) return;
      const el = containerRef.current;
      if (el) {
        lastTop.current = el.scrollTop;
        pendingPrepend.current = { height: el.scrollHeight };
      }
      let res: FetchOlderResult;
      try {
        res = await fetchOlder();
      } catch {
        return;
      }
      if (pictureHunt.current !== token) return;
      if (pictures(res.data?.pages) > before || res.hasNextPage === false) return;
    }
  }, [requestOlder]);
  const needOlderPictures = React.useCallback(() => void findOlderPictures(), [findOlderPictures]);

  let body: React.ReactNode;
  if (loading && messages.length === 0) {
    body = (
      <div className="relative z-10 flex flex-1 items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  } else if (failed && messages.length === 0) {
    // A THREAD THAT FAILED TO LOAD IS NOT A NEW THREAD.
    //
    // Both arrive here as `messages.length === 0`, and the empty state says "How
    // can we help? Send a message and the MDG team will answer you here" with two
    // starter chips — told to a dealer whose entire correspondence with MDG is
    // sitting on the server, unreachable because a 2G request timed out. The
    // chat list already makes this distinction; the thread did not.
    body = (
      <div className="relative z-10 flex flex-1 items-center justify-center px-4">
        <EmptyState
          icon={<MessageCircleHeart width={28} strokeWidth={1.5} />}
          title={t('chat.historyLoadFailed')}
          description={t('common.helpDesc')}
          cta={
            onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full bg-wa-accent px-4 py-2 text-sm font-medium text-text-inverse active:opacity-90"
              >
                {t('common.retry')}
              </button>
            ) : null
          }
        />
      </div>
    );
  } else if (!loading && messages.length === 0) {
    body = (
      <div className="relative z-10 flex flex-1 items-center justify-center px-4">
        <EmptyState
          icon={<MessageCircleHeart width={28} strokeWidth={1.5} />}
          title={t('chat.emptyTitle')}
          description={t('chat.emptyDesc')}
          cta={
            onQuickAction ? (
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {[t('chat.quickReportIssue'), t('chat.quickRequestService')].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onQuickAction(label)}
                    className="rounded-full bg-wa-chip px-3.5 py-1.5 text-sm text-wa-chip-text shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] active:bg-wa-row-active"
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
  } else {
    body = (
      <>
        <div
          ref={containerRef}
          data-scroller=""
          onScroll={onScroll}
          onTouchStart={markTouched}
          onWheel={markTouched}
          onMouseDown={markTouched}
          onKeyDown={markTouched}
          className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin"
        >
          <div ref={contentRef} className="flex flex-col pb-2">
            {hasMore ? (
              <div className="flex justify-center px-3 pb-1 pt-3">
                {loadMoreFailed ? (
                  // Not silence: a failed load of older messages is not "there
                  // is nothing older", and it says which.
                  <button
                    type="button"
                    onClick={requestOlder}
                    className="rounded-full bg-wa-chip px-3.5 py-1 text-[13px] text-danger shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] active:bg-wa-row-active"
                  >
                    {t('chat.olderFailed')}
                  </button>
                ) : loadingMore ? (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-wa-chip text-wa-meta shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                    <Spinner size={16} />
                  </span>
                ) : (
                  <span className="h-8" aria-hidden />
                )}
              </div>
            ) : null}
            {rendered}
            {typing?.active ? (
              <div className="flex w-full justify-start px-3 pt-2">
                <div className="flex items-center gap-1.5 rounded-md rounded-tl-none bg-wa-in px-3.5 py-3 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
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
        {floatLabel ? (
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center transition-opacity duration-300',
              floatVisible ? 'opacity-100' : 'opacity-0',
            )}
          >
            <span className="rounded-lg bg-wa-chip px-3 py-1 text-[12.5px] leading-tight text-wa-chip-text shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
              {floatLabel}
            </span>
          </div>
        ) : null}
        {offBottom ? (
          <button
            type="button"
            aria-label={
              newWhileAway > 0
                ? t('chat.newMessages', { n: newWhileAway })
                : t('chat.scrollToBottom')
            }
            onClick={scrollToBottom}
            className="absolute bottom-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-wa-chip text-wa-bar-icon shadow-md active:bg-wa-row-active animate-in"
          >
            <ChevronDown width={22} strokeWidth={2} />
            {newWhileAway > 0 ? (
              <span className="absolute -right-0.5 -top-2 min-w-[20px] rounded-full bg-wa-badge px-1 text-center text-[12px] font-semibold leading-[20px] text-text-inverse">
                {newWhileAway > 99 ? '99+' : newWhileAway}
              </span>
            ) : null}
          </button>
        ) : null}
      </>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-wa-wallpaper">
      <Doodles />
      {body}
      {openPicture && viewerItems.length > 0 ? (
        <MediaViewer
          items={viewerItems}
          initialKey={openPicture}
          onClose={() => setOpenPicture(null)}
          onDownload={download}
          hasOlder={!!hasMore}
          loadingOlder={!!loadingMore}
          onNeedOlder={needOlderPictures}
          onShowInChat={(item) => {
            // Close first, jump after the history rewind lands (see
            // `afterOverlayCloses`): the jump scrolls the thread behind the viewer.
            setOpenPicture(null);
            afterOverlayCloses(() => void handleJumpTo(item.source.messageId, ''));
          }}
        />
      ) : null}
    </div>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-wa-meta"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}

/**
 * The wallpaper's faint pattern: a few small shapes of our own, repeated, in the
 * `--wa-doodle` ink. A fixed layer behind the scrolling list, so it stays put as
 * the messages move over it, and plain SVG so it costs a phone nothing.
 */
function Doodles() {
  const ink = { fill: 'none', stroke: 'var(--wa-doodle)' } as const;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      focusable="false"
    >
      <defs>
        <pattern id="wa-doodle-tile" width="84" height="84" patternUnits="userSpaceOnUse">
          <g style={ink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="14" cy="16" r="5" />
            <path d="M52 10l8 8m0-8l-8 8" />
            <path d="M10 56q5-7 10 0t10 0" />
            <path d="M58 54l8 14h-16z" />
            <rect x="38" y="36" width="10" height="10" rx="2" />
            <path d="M70 30q4-5 8 0" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#wa-doodle-tile)" />
    </svg>
  );
}

/**
 * The six quick reactions, floating just above the one message that is selected
 * (below it when it is too near the top of the screen for them to fit).
 */
function ReactionStrip({
  message,
  mine,
  currentUserId,
  onPick,
}: {
  message: Message;
  mine: boolean;
  currentUserId: string;
  onPick: (message: Message, emoji: string) => void;
}) {
  const t = useT();
  const ref = React.useRef<HTMLDivElement>(null);
  const [below, setBelow] = React.useState(false);
  React.useLayoutEffect(() => {
    const row = ref.current?.closest<HTMLElement>('[data-mid]');
    const scroller = row?.closest<HTMLElement>('[data-scroller]');
    if (!row || !scroller) return;
    const roomAbove = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    // jsdom has no layout: everything measures 0, and "no room" must not be the
    // answer there. A phone always measures something.
    setBelow(roomAbove !== 0 && roomAbove < 56);
  }, []);
  const mineEmoji = message.reactions?.find((r) => r.userId === currentUserId)?.emoji;
  return (
    <div
      ref={ref}
      role="group"
      data-selection-ui=""
      aria-label={t('chat.reactions')}
      className={cn(
        'absolute z-20 flex items-center gap-0.5 rounded-full bg-wa-chip px-2 py-1 shadow-lg animate-in',
        below ? 'top-full -mt-1' : '-top-11',
        mine ? 'right-3' : 'left-3',
      )}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={emoji}
          aria-pressed={mineEmoji === emoji}
          onClick={() => onPick(message, emoji)}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full text-[22px] active:bg-wa-row-active',
            mineEmoji === emoji && 'bg-wa-row-active',
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
