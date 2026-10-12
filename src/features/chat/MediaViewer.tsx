import { ArrowLeft, Download, MoreVertical } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { ZoomableImage } from '@/components/ZoomableImage';
import { cn } from '@/lib/cn';
import { type AttachmentSource } from '@/lib/downloadAttachment';
import { useLang, useT } from '@/lib/i18n';
import {
  dismissOpacity,
  pageDirection,
  rubberBand,
  shouldDismiss,
  type SwipeEnd,
  type SwipeMove,
} from '@/lib/imageZoom';
import { useBackToClose } from '@/lib/useBackToClose';
import { useFreshImageSrc } from '@/lib/useFreshImageSrc';
import type { Attachment } from '@dk/shared/types';

import { viewerWhen } from './mediaFormat';

/** One picture in the viewer's strip. */
export interface MediaViewerItem {
  /** `${messageId}:${storageKey}` — what the viewer tracks the reader's place by. */
  key: string;
  /** `kind === 'image'`. */
  attachment: Attachment;
  /** The message carrying it — how a fresh URL gets presigned. */
  source: AttachmentSource;
  /** "You" / "MDG" / a name — already translated. */
  senderLabel: string;
  /** The message's time (ISO). */
  createdAt: string;
  /** The message body. */
  caption?: string;
}

export interface MediaViewerProps {
  /** Oldest first. */
  items: MediaViewerItem[];
  /** The tapped picture. */
  initialKey: string;
  onClose: () => void;
  onDownload?: (attachment: Attachment, source: AttachmentSource) => void;
  /** More pictures may exist before `items[0]`. */
  hasOlder?: boolean;
  loadingOlder?: boolean;
  /** Called when the reader reaches `items[0]` and `hasOlder`. */
  onNeedOlder?: () => void;
  /** "Show in chat" in the viewer's ⋮. */
  onShowInChat?: (item: MediaViewerItem) => void;
}

/** How long a page turn, a spring-back or a swipe-away takes to settle. */
const SETTLE_MS = 180;

/**
 * One picture of the strip: its own link that re-signs when stale, its own
 * spinner and its own failed state with a button.
 *
 * SAYING SOMETHING. A DSR card is a few hundred kilobytes and the screen behind
 * it is black, so with no spinner the reader could not tell a slow download from
 * a mis-tap, and a picture that never arrived left them looking at nothing at
 * all with no way to ask again. Both states are on screen, in words.
 * `useFreshImageSrc` does the one automatic re-signing; the button is for the
 * person.
 */
function Slide({
  item,
  active,
  onTap,
  onSwipeMove,
  onSwipeEnd,
  onZoomChange,
}: {
  item: MediaViewerItem;
  /** The picture on screen; its neighbours are loaded and waiting. */
  active: boolean;
  onTap: () => void;
  onSwipeMove: (swipe: SwipeMove) => void;
  onSwipeEnd: (swipe: SwipeEnd) => void;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const t = useT();
  const { src, refreshing, failed, onError, retry } = useFreshImageSrc(
    item.attachment,
    item.source,
  );
  // A picture that arrived with no link at all — the live copy of a shared
  // report is posted before anything has signed it — has nothing to fail to
  // load, so `onError` would never fire and it would sit on its spinner for ever.
  // Ask for one through the message straight away.
  const hasLink = !!item.attachment.url;
  React.useEffect(() => {
    if (!hasLink) retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per picture, not per render of `retry`
  }, [hasLink, item.key]);
  // WHICH link has loaded, not whether one has. A flag reset in an effect when
  // the link changes loses a race with a picture that is already in the cache:
  // its `load` fires before that effect runs, the effect then clears the flag,
  // and the spinner stays over a picture that is plainly there. Comparing
  // against the current link has no ordering to get wrong — a refreshed URL is
  // simply a link nobody has loaded yet.
  const [loadedSrc, setLoadedSrc] = React.useState<string | undefined>();
  const loaded = loadedSrc !== undefined && loadedSrc === src;

  return (
    <>
      <ZoomableImage
        flush
        src={src}
        alt={item.attachment.filename}
        onError={onError}
        onLoad={() => setLoadedSrc(src)}
        onTap={active ? onTap : undefined}
        onSwipeMove={active ? onSwipeMove : undefined}
        onSwipeEnd={active ? onSwipeEnd : undefined}
        onZoomChange={active ? onZoomChange : undefined}
        testId={active ? 'viewer-frame' : `viewer-frame-${item.key}`}
      />
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8">
          <p className="text-center text-sm text-white/85">{t('chat.imageFailed')}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-full bg-white/15 px-5 py-2.5 text-sm font-medium text-white active:bg-white/25"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : !loaded || refreshing ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">
          <Spinner size={24} />
        </div>
      ) : null}
    </>
  );
}

/**
 * The full-screen picture viewer, shared by the chat thread and the media
 * gallery: black, edge to edge, and it pages through every picture in the
 * conversation in the order they were sent.
 *
 * ONE DRAG, FOUR MEANINGS
 * -----------------------
 * A finger on the picture can zoom it, pan it, turn the page or throw it away,
 * and which one is decided by two facts only: is the picture zoomed, and which
 * way did the drag start. Zoomed, a drag pans — `ZoomableImage` owns that and
 * never reports it as a swipe. At 1×, a sideways drag carries the strip along
 * and a downward one carries the picture off the screen; `ZoomableImage`
 * reports both and this moves them. So a zoomed card can be explored without
 * flipping to the next one, and a fumbled swipe over an unzoomed card turns a
 * page instead of nudging it off-centre.
 *
 * THE DRAG IS NOT REACT STATE. A finger produces a move event every frame, and
 * re-rendering three images 60 times a second is how a cheap phone starts to
 * stutter. The strip, the backdrop and the bars are moved by writing their
 * `style` straight from the touch handler, and React hears about it only when a
 * page has actually turned (`currentKey`).
 *
 * THE READER'S PLACE IS A KEY, NOT AN INDEX. The thread loads older pages while
 * the viewer is open, which puts new pictures in FRONT of the first one — an
 * index would silently slide the reader onto a different picture. The viewer
 * remembers which picture it is on and looks its position up every render.
 *
 * Back closes it (`useBackToClose`, one history entry however many pictures are
 * turned past). Deliberately NO useScrollLock: /chat/:id lives in the fixed
 * --vvh frame.
 */
export function MediaViewer({
  items,
  initialKey,
  onClose,
  onDownload,
  hasOlder,
  loadingOlder,
  onNeedOlder,
  onShowInChat,
}: MediaViewerProps) {
  const t = useT();
  const lang = useLang();
  // The phone's Back button closes the picture, not the chat behind it.
  useBackToClose(onClose);

  const [currentKey, setCurrentKey] = React.useState<string | undefined>(
    () => (items.find((i) => i.key === initialKey) ?? items[items.length - 1])?.key,
  );
  const lastIndexRef = React.useRef(0);
  const found = items.findIndex((i) => i.key === currentKey);
  // The picture we were on can vanish (an optimistic copy is swapped for the
  // server's, under a new key). Stay at the same place rather than jumping.
  const index = found >= 0 ? found : Math.min(lastIndexRef.current, items.length - 1);
  lastIndexRef.current = Math.max(0, index);
  const current = items[index];
  React.useEffect(() => {
    if (current && current.key !== currentKey) setCurrentKey(current.key);
  }, [current, currentKey]);

  // Nothing left to show (everything it held was removed): leave.
  React.useEffect(() => {
    if (items.length === 0) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only emptiness matters
  }, [items.length === 0]);

  const [barsShown, setBarsShown] = React.useState(true);
  const [zoomed, setZoomed] = React.useState(false);
  const [captionOpen, setCaptionOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  // ── Moving things without React ─────────────────────────────────────────
  const rootRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const backdropRef = React.useRef<HTMLDivElement>(null);
  const fadeRef = React.useRef<HTMLDivElement>(null);
  /** A page turn or a swipe-away is settling: touches are ignored until it lands. */
  const busyRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  /** Put the strip, the backdrop and the bars where they should be, right now
   *  (following a finger) or easing there (settling). */
  const pose = React.useCallback(
    (x: number, y: number, backdrop: number, bars: number, animate: boolean) => {
      const ease = (prop: string) => (animate ? `${prop} ${SETTLE_MS}ms ease-out` : 'none');
      const track = trackRef.current;
      if (track) {
        track.style.transition = ease('transform');
        track.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
      const back = backdropRef.current;
      if (back) {
        back.style.transition = ease('opacity');
        back.style.opacity = String(backdrop);
      }
      const fade = fadeRef.current;
      if (fade) {
        fade.style.transition = ease('opacity');
        fade.style.opacity = String(bars);
      }
    },
    [],
  );

  // A page has turned (or the viewer has just opened): the strip is re-centred
  // on the new picture in the same commit as its slides move, so there is no
  // frame in which the old offset is applied to the new layout.
  React.useLayoutEffect(() => {
    pose(0, 0, 1, 1, false);
  }, [currentKey, pose]);
  React.useEffect(() => {
    setCaptionOpen(false);
    setMenuOpen(false);
    // A neighbour is never zoomed. Only a key press can turn the page while the
    // picture is zoomed (a finger pans it), and the one it lands on starts at 1×.
    setZoomed(false);
  }, [currentKey]);

  // What the touch handlers read. A ref, so they keep one identity while the
  // viewer re-renders around them.
  const live = React.useRef({ items, index, hasOlder, loadingOlder, onNeedOlder, onClose });
  live.current = { items, index, hasOlder, loadingOlder, onNeedOlder, onClose };

  const screenSize = () => ({
    width: rootRef.current?.clientWidth || window.innerWidth || 360,
    height: rootRef.current?.clientHeight || window.innerHeight || 640,
  });

  /** Slide to the next (+1) or previous (−1) picture, then commit to it. */
  const turn = React.useCallback(
    (dir: 1 | -1): boolean => {
      const { items: all, index: at } = live.current;
      const next = all[at + dir];
      if (!next || busyRef.current) return false;
      busyRef.current = true;
      pose(-dir * screenSize().width, 0, 1, 1, true);
      timerRef.current = setTimeout(() => {
        busyRef.current = false;
        setCurrentKey(next.key);
      }, SETTLE_MS);
      return true;
    },
    [pose],
  );

  const onSwipeMove = React.useCallback(
    (swipe: SwipeMove) => {
      if (busyRef.current) return;
      if (swipe.axis === 'x') {
        const { items: all, index: at } = live.current;
        // Against the first or the last picture the strip gives a little and no more.
        const stop = (at === 0 && swipe.dx > 0) || (at === all.length - 1 && swipe.dx < 0);
        pose(stop ? rubberBand(swipe.dx) : swipe.dx, 0, 1, 1, false);
        return;
      }
      // Only DOWN carries the picture away; up is a no-op rather than a wobble.
      const dy = Math.max(0, swipe.dy);
      pose(0, dy, dismissOpacity(dy, screenSize().height), 0, false);
    },
    [pose],
  );

  const onSwipeEnd = React.useCallback(
    (swipe: SwipeEnd) => {
      if (busyRef.current) return;
      const { index: at } = live.current;
      const { width, height } = screenSize();

      if (swipe.axis === 'x') {
        const dir = swipe.cancelled ? 0 : pageDirection(swipe.dx, swipe.vx, width);
        if (dir !== 0 && turn(dir)) return;
        pose(0, 0, 1, 1, true);
        // A pull on the first picture asks again for older ones: the automatic
        // request fires once per arrival and does not retry a page that came
        // back with nothing new, so a deliberate pull is the way to try again.
        const l = live.current;
        if (!swipe.cancelled && dir === -1 && at === 0 && l.hasOlder && !l.loadingOlder) {
          l.onNeedOlder?.();
        }
        return;
      }

      if (!swipe.cancelled && shouldDismiss(swipe.dy, swipe.vy, height)) {
        busyRef.current = true;
        pose(0, height, 0, 0, true);
        timerRef.current = setTimeout(() => {
          busyRef.current = false;
          live.current.onClose();
        }, SETTLE_MS);
        return;
      }
      pose(0, 0, 1, 1, true);
    },
    [pose, turn],
  );

  // A keyboard has the same moves a finger does: ← / → turn the page, Esc closes.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        live.current.onClose();
        return;
      }
      // The message box behind the viewer may still hold focus: its arrow keys
      // are for its caret, not for this.
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea');
      if (typing) return;
      if (e.key === 'ArrowLeft') turn(-1);
      else if (e.key === 'ArrowRight') turn(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn]);

  const onTap = React.useCallback(() => setBarsShown((v) => !v), []);

  // ── Reaching the oldest loaded picture asks for older ones ──────────────
  // Once per arrival, tracked by how many pictures there were when it asked. A
  // request that fails — or comes back with nothing new — leaves the count
  // where it was, and asking again straight away would hammer a dead network.
  const askedAtRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (index > 0) {
      askedAtRef.current = null;
      return;
    }
    if (!hasOlder || loadingOlder || !onNeedOlder) return;
    if (askedAtRef.current === items.length) return;
    askedAtRef.current = items.length;
    onNeedOlder();
  }, [index, hasOlder, loadingOlder, items.length, onNeedOlder]);

  if (!current) return null;

  // The picture, and the one either side of it, are mounted; the rest are not.
  // The neighbours are the preload: they are already loading when the finger
  // arrives.
  const mounted = items
    .map((item, i) => ({ item, i }))
    .filter(({ i }) => Math.abs(i - index) <= 1);

  const barsClass = barsShown ? 'opacity-100' : 'pointer-events-none opacity-0';

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.imagePreview')}
      data-no-swipe
      data-testid="media-viewer"
      className="fixed inset-0 z-50 overflow-hidden"
    >
      <div ref={backdropRef} className="absolute inset-0 bg-wa-viewer" />

      <div ref={trackRef} data-testid="viewer-track" className="absolute inset-0 will-change-transform">
        {mounted.map(({ item, i }) => (
          <div
            key={item.key}
            data-testid="viewer-slide"
            aria-hidden={i !== index}
            className={cn(
              'absolute top-0 flex h-full w-full flex-col',
              i !== index && 'pointer-events-none',
            )}
            style={{ left: `${(i - index) * 100}%` }}
          >
            <Slide
              item={item}
              active={i === index}
              onTap={onTap}
              onSwipeMove={onSwipeMove}
              onSwipeEnd={onSwipeEnd}
              onZoomChange={setZoomed}
            />
          </div>
        ))}
      </div>

      {/* The bars. `fadeRef` is the swipe-down's: it empties them as the picture
          leaves. `barsShown` is the reader's own tap. Two layers, so neither
          overwrites the other's opacity. */}
      <div ref={fadeRef} className="pointer-events-none absolute inset-0">
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-wa-viewer from-40% to-transparent transition-opacity duration-150',
            barsClass,
          )}
        >
          <div className="safe-top pointer-events-auto flex items-center gap-1 pb-4 pl-1 pr-1">
            <button
              type="button"
              aria-label={t('common.back')}
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white active:bg-white/15"
            >
              <ArrowLeft width={24} strokeWidth={2} />
            </button>
            <div className="min-w-0 flex-1 pl-1">
              <p className="truncate text-[17px] font-medium leading-tight text-white">
                {current.senderLabel}
              </p>
              <p className="truncate text-[13px] leading-tight text-white/70">
                {viewerWhen(current.createdAt, lang, t)}
              </p>
            </div>
            {onDownload ? (
              <button
                type="button"
                aria-label={t('chat.download')}
                onClick={() => onDownload(current.attachment, current.source)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white active:bg-white/15"
              >
                <Download width={22} strokeWidth={2} />
              </button>
            ) : null}
            {onShowInChat ? (
              <div className="relative shrink-0">
                <button
                  type="button"
                  aria-label={t('common.moreOptions')}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-white active:bg-white/15"
                >
                  <MoreVertical width={22} strokeWidth={2} />
                </button>
                {menuOpen ? (
                  <>
                    <button
                      type="button"
                      aria-hidden
                      tabIndex={-1}
                      onClick={() => setMenuOpen(false)}
                      className="fixed inset-0 z-10 cursor-default"
                    />
                    <div
                      role="menu"
                      className="absolute right-1 top-full z-20 mt-1 min-w-[200px] overflow-hidden rounded-lg bg-wa-bar py-2 shadow-lg animate-in"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onShowInChat(current);
                        }}
                        className="flex w-full items-center px-5 py-3 text-left text-[15px] text-wa-bar-text active:bg-wa-row-active"
                      >
                        {t('media.viewer.showInChat')}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {current.caption && !zoomed ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-wa-viewer from-40% to-transparent transition-opacity duration-150',
              barsClass,
            )}
          >
            <div className="safe-bottom pointer-events-auto mx-auto w-full max-w-3xl px-4 pt-10">
              <button
                type="button"
                onClick={() => setCaptionOpen((v) => !v)}
                aria-expanded={captionOpen}
                className="block w-full text-left text-[15px] leading-snug text-white"
              >
                <span
                  className={cn(
                    'whitespace-pre-wrap break-words',
                    // No `block` on the clamped one: line-clamp is its own
                    // `display`, and a later `display: block` would undo it.
                    captionOpen ? 'block max-h-[40vh] overflow-y-auto' : 'line-clamp-3',
                  )}
                >
                  {current.caption}
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {loadingOlder && index === 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center">
            <span className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs text-white">
              <Spinner size={14} />
              {t('media.viewer.loadingOlder')}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
