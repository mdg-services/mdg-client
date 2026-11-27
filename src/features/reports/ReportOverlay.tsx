import { onlineManager } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Ban,
  CalendarCheck,
  Clock,
  FileQuestion,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  PencilLine,
  RefreshCw,
  Share2,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';

import { Button, useToast } from '@/components/ui';
import { reloadInto, useOutlets, useSwitchOutlet } from '@/features/outlets/useOutlets';
import { cn } from '@/lib/cn';
import { useAttachmentDownload } from '@/lib/downloadAttachment';
import { useLang, useT, type MessageKey } from '@/lib/i18n';
import { useLargeText } from '@/lib/useLargeText';
import { useAuthStore } from '@/store/auth';
import { dealerCodeLabel, reportDataForViewer, reportDataOf } from '@dk/shared';
import type { ReportData, ReportDetail, ReportKind, TodayReport } from '@dk/shared/types';

import { familyVar } from './familyVar';
import { kindStyle } from './kindStyle';
import { PictureFallback } from './PictureFallback';
import { viewOfData } from './registry';
import { ReportActionsProvider, useReportActionContext, type ChatTarget } from './reportActions';
import { reportPath, type ReportTarget } from './reportNav';
import { headerPumpCode, otherPumpOf, pumpFactsOf, type OtherPump } from './reportPump';
import {
  asOfInstant,
  asOfLabel,
  dayWords,
  emptyStateFor,
  pickBanner,
  type OverlayBanner,
  type ReportEmptyState,
} from './reportView';
import { shareReportText } from './shareReport';
import { reportVerdict, StatusBadge } from './StatusBadge';
import { sayWords, type OverlayProps, type ReportAction, type ReportStatusKey } from './types';
import { reportLoadProblem, useReport, type ReportLoadProblem } from './useReport';

/**
 * One report, drawn over the screen the dealer came from (ADR 0056 §4).
 *
 * The SHELL is the same for every kind, so the app feels like one thing and a dealer who taps
 * blindly lands in a place they know:
 *
 *   pinned top      Close (with the word) and the family colour rule along the top edge
 *   one banner      at most one strip, in this order: removed, newer exists, corrected,
 *                   partly worked out, offline
 *   body            first the report's icon and name with how it stands (shape + word) right
 *                   beside the name, the day it is about and the "as of" time; then the kind's
 *                   own view (`getKindView(kind).Overlay`), or for a message from before
 *                   snapshots the picture, drawn inline (`PictureFallback`)
 *   pinned bottom   at most two buttons (ADR 0060): the one main thing to do, and "More"
 *                   (the rest: the kind's second button, Share, See in chat). With only one
 *                   thing left over it is drawn as the second button itself, not hidden.
 *
 * It reads `GET /v1/me/reports/:messageId` and never the Today feed, so a report Today no
 * longer lists still opens. A row the caller already holds (`placeholder`) is drawn at once.
 *
 * It owns no history: the host decides what Close, Back, "See newer" and "See in chat" do
 * (`ReportHost` for the route, `ReportModal` for the extension's panel).
 */

export interface ReportOverlayProps {
  conversationId: string;
  messageId: string;
  /** A row the opener already holds; drawn first, then replaced by the server's copy. */
  placeholder?: TodayReport | undefined;
  onClose: () => void;
  /** "See newer": open another report in this one's place. */
  onOpenNewer: (target: ReportTarget) => void;
  /** "See in chat": the chat, at this message. */
  onSeeInChat: (target: ReportTarget) => void;
  /** "Today's page", from a report that cannot be opened. */
  onGoToday: () => void;
  /**
   * The chat, at a place a report's own button names: a box's message, or a sentence to type unsent.
   * Without it the buttons fall back to "See in chat" at the report's message.
   */
  onOpenChat?: ((to: ChatTarget) => void) | undefined;
  /** Go to an address of the app (only a host with a router can). Without it a button that needs it does nothing. */
  onNavigate?: ((to: string) => void) | undefined;
  /** The pump code a link carried (`?outlet=12E`), for a report this login cannot open. */
  outletHint?: string | undefined;
}

// ── focus ────────────────────────────────────────────────────────────────────

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A dialog's focus rules, without owning a history entry (the route does that): focus moves in
 * on open and back to the opener on close, Escape closes, Tab stays inside. Escape is left to the
 * picture viewer and the "More" list while those are open on top.
 */
function useOverlayFocus(onClose: () => void): React.RefObject<HTMLDivElement> {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    const panel = panelRef.current;
    const returnTo = document.activeElement as HTMLElement | null;
    panel?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // The picture viewer and the "More" list own Escape while they are open on top.
        if (panel?.querySelector('[data-no-swipe], [data-more-sheet]')) return;
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, []);
  return panelRef;
}

/** Whether the phone says it has a network. */
function useOnline(): boolean {
  return React.useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
    () => true,
  );
}

// ── pieces ───────────────────────────────────────────────────────────────────

const BANNER_LOOK: Record<
  OverlayBanner['kind'],
  { Icon: LucideIcon; tone: string; key: MessageKey }
> = {
  deleted: { Icon: Ban, tone: 'bg-status-attention-soft text-status-attention-ink', key: 'report.banner.deleted' },
  newer: { Icon: ArrowUpRight, tone: 'bg-status-waiting-soft text-status-waiting-ink', key: 'report.banner.newer' },
  corrected: { Icon: PencilLine, tone: 'bg-status-attention-soft text-status-attention-ink', key: 'report.banner.corrected' },
  partial: { Icon: Clock, tone: 'bg-status-info-soft text-status-info-ink', key: 'report.banner.partial' },
  offline: { Icon: WifiOff, tone: 'bg-status-info-soft text-status-info-ink', key: 'report.banner.offline' },
};

function Banner({ banner, onOpenNewer }: { banner: OverlayBanner; onOpenNewer: (t: ReportTarget) => void }) {
  const t = useT();
  const look = BANNER_LOOK[banner.kind];
  return (
    <div
      role="status"
      data-testid="report-banner"
      data-banner={banner.kind}
      className={cn('shrink-0 border-b border-border', look.tone)}
    >
      <div className="mx-auto flex w-full max-w-md flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 md:max-w-2xl lg:max-w-3xl">
        <look.Icon strokeWidth={2} className="h-[1.375rem] w-[1.375rem] shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 basis-48 text-body font-medium leading-normal">{t(look.key)}</p>
        {banner.kind === 'newer' ? (
          <button
            type="button"
            data-testid="report-see-newer"
            onClick={() => onOpenNewer(banner.target)}
            className="min-h-11 shrink-0 rounded-md px-2 text-cta font-semibold underline underline-offset-4"
          >
            {t('report.banner.seeNewer')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Skeleton() {
  const t = useT();
  return (
    <div role="status" aria-busy="true" data-testid="report-skeleton" className="flex flex-col gap-4 p-4">
      <span className="sr-only">{t('report.loading')}</span>
      <div className="h-8 w-2/3 animate-pulse rounded-md bg-surface-2" />
      <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
    </div>
  );
}

/**
 * A report about another of the person's pumps: one calm line and the existing pump switch.
 * `block` is the whole-screen form (this login cannot open it at all); the strip form sits above a
 * report that did load.
 */
function OtherPumpNotice({
  other,
  target,
  block,
  onClose,
}: {
  other: OtherPump;
  target: ReportTarget;
  block: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const here = reportPath(target.conversationId, target.messageId);
  // The person lands on the same report, now in the other pump's login.
  const switchOutlet = useSwitchOutlet(() => reloadInto(here));
  const choice = other.choice;
  const text = other.code
    ? t('report.otherPump.text', { code: dealerCodeLabel(other.code) })
    : t('report.otherPump.textUnknown');
  const button = (
    <button
      type="button"
      data-testid="report-switch-pump"
      disabled={!choice || switchOutlet.isPending}
      onClick={() => choice && switchOutlet.mutate(choice.userId)}
      className={cn(
        'inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md px-4 text-cta disabled:opacity-60',
        block ? 'bg-brand text-text-inverse' : 'border border-current bg-transparent',
      )}
    >
      <Repeat2 width={20} strokeWidth={2} aria-hidden />
      {switchOutlet.isPending && choice
        ? t('outlets.opening', { code: dealerCodeLabel(choice.code) })
        : t('report.otherPump.switch')}
    </button>
  );
  const failed = switchOutlet.isError ? (
    <p role="alert" className="text-body font-medium text-danger">
      {t('outlets.failed')}
    </p>
  ) : null;
  if (block) {
    return (
      <div
        role="status"
        data-testid="report-other-pump"
        data-state="block"
        className="flex flex-col items-center gap-3 px-6 py-14 text-center"
      >
        <Repeat2 width={40} strokeWidth={1.5} className="text-text-muted" aria-hidden />
        <h2 className="text-heading text-text">{t('report.otherPump.title')}</h2>
        <p className="max-w-sm text-body leading-relaxed text-text-muted">{text}</p>
        <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
          {button}
          {failed}
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-md px-4 text-cta text-text underline underline-offset-4 active:bg-surface-2"
          >
            {t('report.close')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div
      role="status"
      data-testid="report-other-pump"
      data-state="strip"
      className="shrink-0 border-b border-border bg-status-waiting-soft text-status-waiting-ink"
    >
      <div className="mx-auto flex w-full max-w-md flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 md:max-w-2xl lg:max-w-3xl">
        <Repeat2 width={22} strokeWidth={2} className="shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 basis-48 text-body font-medium leading-normal">{text}</p>
        {button}
      </div>
      {failed ? <div className="mx-auto w-full max-w-md px-4 pb-2 md:max-w-2xl lg:max-w-3xl">{failed}</div> : null}
    </div>
  );
}

const EMPTY_LOOK: Record<ReportEmptyState, { Icon: LucideIcon; title: MessageKey; desc: MessageKey }> = {
  gone: { Icon: Ban, title: 'report.gone.title', desc: 'report.gone.desc' },
  owner_only: { Icon: Lock, title: 'report.ownerOnly.title', desc: 'report.ownerOnly.desc' },
  not_here: { Icon: FileQuestion, title: 'report.notHere.title', desc: 'report.notHere.desc' },
  offline: { Icon: WifiOff, title: 'report.offline.title', desc: 'report.offline.desc' },
  error: { Icon: FileQuestion, title: 'report.error.title', desc: 'report.error.desc' },
};

/** A report that will not open: one calm screen, what it means, and the way out. */
function EmptyState({
  state,
  onRetry,
  retrying,
  onGoToday,
  onClose,
}: {
  state: ReportEmptyState;
  onRetry: () => void;
  retrying: boolean;
  onGoToday: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const look = EMPTY_LOOK[state];
  const retryable = state === 'offline' || state === 'error';
  return (
    <div
      role="status"
      data-testid="report-empty"
      data-state={state}
      className="flex flex-col items-center gap-3 px-6 py-14 text-center"
    >
      <look.Icon width={40} strokeWidth={1.5} className="text-text-muted" aria-hidden />
      <h2 className="text-heading text-text">{t(look.title)}</h2>
      <p className="max-w-sm text-body leading-relaxed text-text-muted">{t(look.desc)}</p>
      <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
        {retryable ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-brand px-4 text-cta text-text-inverse disabled:opacity-60"
          >
            <RefreshCw width={18} strokeWidth={2} aria-hidden />
            {t('report.retry')}
          </button>
        ) : null}
        <button
          type="button"
          data-testid="report-go-today"
          onClick={onGoToday}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-cta text-text shadow-sm active:bg-surface-2"
        >
          <CalendarCheck width={18} strokeWidth={2} aria-hidden />
          {t('report.todayPage')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 rounded-md px-4 text-cta text-text underline underline-offset-4 active:bg-surface-2"
        >
          {t('report.close')}
        </button>
      </div>
    </div>
  );
}

/**
 * A kind's view that fails to draw must not take the shell with it: the dealer still has the
 * words, the buttons and the way out.
 */
class KindBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** What an old message without a picture, or a snapshot this app cannot read, has to show. */
function WordsOnly({ headline }: { headline: string | undefined }) {
  const t = useT();
  return (
    <div data-testid="report-words-only" className="flex flex-col gap-3 p-4">
      {headline ? (
        <p className="whitespace-pre-line text-body font-medium leading-relaxed text-text">{headline}</p>
      ) : null}
      <p className="text-body leading-relaxed text-text-muted">{t('report.fallback.words')}</p>
    </div>
  );
}

/** The role as the shared helpers name it. */
function viewerRoleOf(role: string | undefined): 'owner' | 'manager' {
  return role === 'dealer-owner' ? 'owner' : 'manager';
}

// ── the overlay ──────────────────────────────────────────────────────────────

/**
 * The box every kind's view sits in. Whatever a view draws can never be wider than the phone: its
 * flex and grid children may shrink (`min-w-0`), long words break, pictures and drawings are held
 * to the box. A wide table must scroll inside its own card (the kind view's job): the box clips
 * sideways, so the page itself never pans.
 */
const KIND_VIEW_FIT =
  'w-full min-w-0 max-w-full p-4 pb-6 [overflow-wrap:break-word] ' +
  '[&_img]:max-w-full [&_svg]:max-w-full [&_canvas]:max-w-full [&_video]:max-w-full';

/** One thing the footer can do: a button in the footer or a row of its "More" list. */
interface FooterItem {
  id: string;
  testId: string;
  label: string;
  icon?: LucideIcon | undefined;
  /** Drawn greyed out and does nothing (a locked or used-up kind button). */
  off?: boolean;
  /** Working on it: tapping again does nothing. */
  busy?: boolean;
  run: () => void;
}

export function ReportOverlay({
  conversationId,
  messageId,
  placeholder,
  onClose,
  onOpenNewer,
  onSeeInChat,
  onGoToday,
  onOpenChat,
  onNavigate,
  outletHint,
}: ReportOverlayProps) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const role = useAuthStore((s) => s.user?.role);
  const online = useOnline();
  const panelRef = useOverlayFocus(onClose);
  const titleId = React.useId();

  const q = useReport(messageId, {
    ...(placeholder && placeholder.messageId === messageId ? { placeholder } : {}),
  });
  // What was on screen last. A refresh that fails (a slow link, the team deleting the message)
  // must not blank a report the dealer is reading.
  const lastGood = React.useRef<ReportDetail | undefined>(undefined);
  if (q.data) lastGood.current = q.data;
  const detail = q.data ?? lastGood.current;
  // With no network and nothing to draw yet, TanStack parks the request (it is pending and
  // "paused": no data, no error). That is "offline", said plainly with a Retry, never a grey
  // skeleton for good.
  const paused = q.fetchStatus === 'paused' && !detail;
  const problem: ReportLoadProblem | null = q.isError ? reportLoadProblem(q.error) : paused ? 'offline' : null;

  // The kind this overlay is about, even before the answer (a placeholder names it).
  const kind: ReportKind | undefined = detail?.kind ?? placeholder?.kind;
  const style = kind ? kindStyle(kind) : undefined;

  // Not the viewer's to read: the server said so, or the snapshot is the owner's and this is a manager.
  const rawData = detail ? reportDataOf(detail.data, detail.kind) : undefined;
  const data: ReportData | undefined = rawData ? reportDataForViewer(rawData, viewerRoleOf(role)) : undefined;
  const blockedLocally = !!rawData && !data;
  const blocked = problem === 'not_available' || blockedLocally || detail?.live.ownerOnlyBlocked === true;

  const view = data ? viewOfData(data) : undefined;
  const sharePicture = !data && !!detail && detail.attachments.length > 0;

  // Several pumps: the header names the pump, and a report made for the OTHER pump's login says so.
  const outlets = useOutlets();
  const pumpFacts = pumpFactsOf(detail, data, outletHint);
  const otherPump = otherPumpOf(outlets.data, pumpFacts);
  const pumpCode = headerPumpCode(outlets.data, pumpFacts);
  // A login that cannot open the report at all (the server answers "not here") but was told whose it is.
  const wrongPumpBlock = !!otherPump && !detail && !!problem && problem !== 'offline';

  const emptyState: ReportEmptyState | null = (() => {
    if (blocked) return emptyStateFor('not_available', { ...(kind ? { kind } : {}), ...(role ? { role } : {}) });
    if (!detail && problem) return emptyStateFor(problem, { ...(kind ? { kind } : {}), ...(role ? { role } : {}) });
    return null;
  })();

  const banner =
    detail && !emptyState
      ? pickBanner({
          detail,
          data,
          goneNow: problem === 'gone',
          offline: !online || (problem !== null && problem !== 'gone'),
        })
      : null;

  // How it stands: the kind's own verdict first (a problem is a problem), then the report's tag;
  // an older report drops to grey so a stale red is never mistaken for today's.
  let status: ReportStatusKey = 'info';
  let statusWord: string | undefined;
  if (detail && !emptyState) {
    const alert = data && view ? view.alert(data as never, lang) : null;
    if (detail.live.newerMessageId) {
      status = 'info';
      statusWord = t('report.older');
    } else {
      // The same order as the Services rows and the Reports list (an aged alarm is information).
      status = reportVerdict(detail, alert);
    }
  }

  const shownDay = detail?.day;
  const asOf = detail && !emptyState ? asOfLabel(asOfInstant(data, detail.sentAt), new Date(), lang, t) : '';
  const day = dayWords(shownDay, lang);

  const download = useAttachmentDownload();
  const [sharing, setSharing] = React.useState(false);
  const onShare = async () => {
    if (!detail || sharing) return;
    setSharing(true);
    try {
      if (data && view) {
        const text = view.share(data as never, lang);
        const outcome = await shareReportText(text, sayWords(style!.names, lang));
        if (outcome === 'copied') toast.success(t('report.shareCopied'));
        else if (outcome === 'failed') toast.error(t('report.shareFailed'));
      } else if (sharePicture) {
        // An old picture report keeps the picture share: the same save-or-send the chat has.
        const file = detail.attachments.find((a) => a.kind === 'image') ?? detail.attachments[0];
        if (file) await download(file, { conversationId: detail.conversationId, messageId: detail.messageId });
      }
    } finally {
      setSharing(false);
    }
  };
  const retry = () => void q.refetch();
  const name = style ? sayWords(style.names, lang) : t('report.genericName');
  const target: ReportTarget = { conversationId: detail?.conversationId ?? conversationId, messageId };

  // What the report's own buttons can do. A host that gave no `onOpenChat` still gets "See in chat".
  const openChat = React.useCallback(
    (to: ChatTarget) => {
      if (onOpenChat) onOpenChat(to);
      else onSeeInChat({ conversationId: to.conversationId, messageId: to.messageId ?? messageId });
    },
    [onOpenChat, onSeeInChat, messageId],
  );
  const actionCtx = useReportActionContext({
    conversationId: target.conversationId,
    messageId,
    onOpenChat: openChat,
    onNavigate: (to) => onNavigate?.(to),
  });
  // A report the team removed is no longer something to act on: no kind button, no jump to the
  // message (it is gone), only a way back to Today.
  const removed = banner?.kind === 'deleted';
  // The kind's buttons, at most two. A kind whose button logic throws must not take the shell with it.
  const actions: ReportAction[] = (() => {
    if (!detail || emptyState || removed || !data || !view?.actions) return [];
    try {
      return view.actions(data as never, detail, actionCtx).slice(0, 2);
    } catch {
      return [];
    }
  })();
  const [running, setRunning] = React.useState<string | null>(null);
  const [spent, setSpent] = React.useState<ReadonlySet<string>>(() => new Set());
  const runAction = async (a: ReportAction) => {
    if (running || a.disabled || spent.has(a.id)) return;
    setRunning(a.id);
    try {
      await a.run(actionCtx);
      if (a.once) setSpent((cur) => new Set(cur).add(a.id));
    } catch {
      toast.error(t('report.actionFailed'));
    } finally {
      setRunning(null);
    }
  };

  const body = (() => {
    if (wrongPumpBlock && otherPump) {
      return <OtherPumpNotice other={otherPump} target={target} block onClose={onClose} />;
    }
    if (emptyState) {
      return (
        <EmptyState state={emptyState} onRetry={retry} retrying={q.isFetching} onGoToday={onGoToday} onClose={onClose} />
      );
    }
    if (!detail) return <Skeleton />;
    if (data && view) {
      const Overlay = view.Overlay as React.ComponentType<OverlayProps<ReportKind>>;
      return (
        <KindBoundary fallback={<WordsOnly headline={detail.headline} />}>
          <div data-testid="report-kind-view" className={KIND_VIEW_FIT}>
            <Overlay data={data as never} report={detail} lang={lang} />
          </div>
        </KindBoundary>
      );
    }
    if (detail.attachments.some((a) => a.kind !== 'audio')) {
      return (
        <div className={KIND_VIEW_FIT}>
          <PictureFallback
            attachments={detail.attachments}
            conversationId={detail.conversationId}
            messageId={detail.messageId}
            sentAt={detail.sentAt}
            senderLabel={t('chat.senderMdg')}
            {...(detail.headline ? { headline: detail.headline } : {})}
          />
        </div>
      );
    }
    return <WordsOnly headline={detail.headline} />;
  })();

  const showActions = !!detail && !emptyState;
  const canShare = !!data || sharePicture;
  const family = style ? familyVar(style.family) : 'var(--kind-supply)';
  const lockNote = actions.find((a) => a.disabled)?.disabled?.note;
  const when = [pumpCode ? t('report.pump', { code: dealerCodeLabel(pumpCode) }) : '', day, asOf].filter(Boolean);
  const showStatus = !!detail && !emptyState && (status !== 'info' || !!statusWord);
  const largeText = useLargeText();

  // The footer's things to do, most useful first: the kind's own buttons, then Share, then the way
  // out (the chat, or Today's page for a report the team removed). The first is the main button;
  // the rest sit behind "More" (a single one is drawn as the second button).
  const items: FooterItem[] = [];
  if (showActions) {
    for (const a of actions) {
      items.push({
        id: `action-${a.id}`,
        testId: `report-action-${a.id}`,
        label: sayWords(a.label, lang),
        icon: a.icon,
        off: !!a.disabled || spent.has(a.id),
        run: () => void runAction(a),
      });
    }
    if (canShare) {
      items.push({
        id: 'share',
        testId: 'report-share',
        label: sharePicture ? t('report.sharePicture') : t('report.share'),
        icon: Share2,
        busy: sharing,
        run: () => void onShare(),
      });
    }
    items.push(
      removed
        ? { id: 'today', testId: 'report-go-today', label: t('report.todayPage'), icon: CalendarCheck, run: onGoToday }
        : { id: 'chat', testId: 'report-see-in-chat', label: t('report.seeInChat'), icon: MessageCircle, run: () => onSeeInChat(target) },
    );
  }
  const [mainItem, ...restItems] = items;
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreButtonRef = React.useRef<HTMLButtonElement>(null);
  const firstMoreRef = React.useRef<HTMLButtonElement>(null);
  const closeMore = React.useCallback(() => {
    setMoreOpen(false);
    moreButtonRef.current?.focus();
  }, []);
  // The list is closed by Escape (the overlay's own Escape stands aside while it is open) and
  // takes focus in; the report stays where it was, behind a scrim.
  React.useEffect(() => {
    if (!moreOpen) return;
    firstMoreRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeMore();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen, closeMore]);
  // If what was behind "More" disappears (the report was removed while it was open), close it.
  React.useEffect(() => {
    if (restItems.length < 2 && moreOpen) setMoreOpen(false);
  }, [restItems.length, moreOpen]);

  const buttonSize = largeText ? 'tap' : 'lg';
  const footerButton = (item: FooterItem, variant: 'primary' | 'secondary') => {
    const Icon = item.icon;
    return (
      <Button
        key={item.id}
        variant={variant}
        size={buttonSize}
        data-testid={item.testId}
        aria-disabled={item.off || running !== null || item.busy ? true : undefined}
        onClick={() => {
          if (item.busy) return;
          item.run();
        }}
        className={cn('min-w-36 flex-1 text-center [&>span]:min-w-0 [&>span]:break-words', item.off && 'opacity-50')}
        leftIcon={Icon ? <Icon strokeWidth={2} className="h-5 w-5 shrink-0" aria-hidden /> : undefined}
      >
        {item.label}
      </Button>
    );
  };

  return (
    <ReportActionsProvider value={actionCtx}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="report-overlay"
        data-kind={kind}
        className="fixed inset-0 z-40 flex w-full min-w-0 max-w-full flex-col overflow-x-hidden bg-bg outline-none"
      >
        {/* The family is a 3 px rule along the top edge: the report is recognised, the screen stays calm. */}
        <header className="shrink-0 border-b border-border bg-surface text-text" style={{ boxShadow: `inset 0 3px 0 ${family}` }}>
          <div className="mx-auto w-full max-w-md md:max-w-2xl lg:max-w-3xl">
            {/* Only the Close row stays pinned (the title and its status scroll with the report, so large text never squeezes the body to nothing); the row clears the notch and the status bar. */}
            <div data-testid="report-header-row" className="safe-top flex min-w-0 items-center pb-1 pr-3">
              <button
                type="button"
                data-testid="report-close"
                onClick={onClose}
                aria-label={t('report.closeLabel')}
                className="flex min-h-12 min-w-12 max-w-full items-center gap-1.5 rounded-md pl-3 pr-4 text-body font-medium text-text active:bg-surface-2"
              >
                <X strokeWidth={2.25} className="h-6 w-6 shrink-0" aria-hidden />
                {t('report.close')}
              </button>
            </div>
          </div>
        </header>

        {otherPump && detail && !wrongPumpBlock ? (
          <OtherPumpNotice other={otherPump} target={target} block={false} onClose={onClose} />
        ) : null}
        {banner ? <Banner banner={banner} onOpenNewer={onOpenNewer} /> : null}

        <div data-testid="report-body" className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          <div data-testid="report-title-band" className="border-b border-border bg-surface text-text">
            <div className="mx-auto w-full min-w-0 max-w-md md:max-w-2xl lg:max-w-3xl">
              {/* At large text the icon sits above the name, so the text gets the whole width and the left and right margins match. */}
              <div
                data-testid="report-title-row"
                className={cn('flex min-w-0 gap-3.5 px-4 pb-4 pt-3', largeText ? 'flex-col items-start' : 'items-start')}
              >
                {style ? (
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg"
                    style={{ backgroundColor: familyVar(style.family, 'soft'), color: familyVar(style.family, 'ink') }}
                  >
                    <style.Icon strokeWidth={1.75} className="h-[1.375rem] w-[1.375rem]" aria-hidden />
                  </span>
                ) : null}
                <div className="min-w-0 max-w-full flex-1">
                  {/* How it stands sits right beside the name; at large text it wraps under it. */}
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                    <h1 id={titleId} className="min-w-0 max-w-full break-words text-title">
                      {name}
                    </h1>
                    {showStatus ? (
                      <span data-testid="report-status" className="min-w-0 max-w-full">
                        <StatusBadge status={status} lang={lang} {...(statusWord ? { word: statusWord } : {})} />
                      </span>
                    ) : null}
                  </div>
                  {when.length > 0 ? (
                    <p data-testid="report-when" className="mt-1 break-words text-body leading-normal text-text-muted">
                      {when.join(' · ')}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <div className="mx-auto w-full min-w-0 max-w-md md:max-w-2xl lg:max-w-3xl">{body}</div>
        </div>

        {showActions && mainItem ? (
          <footer
            data-testid="report-footer"
            className="safe-bottom max-h-[40vh] shrink-0 overflow-y-auto border-t border-border bg-surface"
          >
            <div className="mx-auto flex w-full max-w-md flex-col gap-2 p-3 md:max-w-2xl lg:max-w-3xl">
              {lockNote ? (
                <p role="status" data-testid="report-action-note" className="text-body leading-normal text-text-muted">
                  {lockNote}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2" data-testid="report-actions">
                {footerButton(mainItem, 'primary')}
                {restItems.length === 1 && restItems[0] ? footerButton(restItems[0], 'secondary') : null}
                {restItems.length > 1 ? (
                  <Button
                    ref={moreButtonRef}
                    variant="secondary"
                    size={buttonSize}
                    data-testid="report-more"
                    aria-haspopup="true"
                    aria-expanded={moreOpen}
                    aria-label={t('rv1.more.label', { items: restItems.map((i) => i.label).join(', ') })}
                    onClick={() => setMoreOpen((open) => !open)}
                    className="min-w-36 flex-1 text-center [&>span]:min-w-0 [&>span]:break-words"
                    leftIcon={<MoreHorizontal strokeWidth={2} className="h-5 w-5 shrink-0" aria-hidden />}
                  >
                    {t('rv1.more')}
                  </Button>
                ) : null}
              </div>
            </div>
          </footer>
        ) : null}

        {moreOpen && restItems.length > 1 ? (
          <div data-more-sheet className="absolute inset-0 z-10 flex flex-col justify-end">
            <div aria-hidden className="absolute inset-0 bg-black/40" data-testid="report-more-scrim" onClick={closeMore} />
            <div
              role="group"
              aria-label={t('rv1.more.sheet')}
              data-testid="report-more-sheet"
              className="safe-bottom relative mx-auto flex max-h-[80vh] w-full max-w-md flex-col gap-1 overflow-y-auto rounded-t-xl border border-b-0 border-border bg-surface p-3 shadow-lg md:max-w-2xl lg:max-w-3xl"
            >
              {restItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.id}
                    ref={index === 0 ? firstMoreRef : undefined}
                    variant="ghost"
                    size={buttonSize}
                    data-testid={item.testId}
                    aria-disabled={item.off || running !== null || item.busy ? true : undefined}
                    onClick={() => {
                      if (item.busy) return;
                      closeMore();
                      item.run();
                    }}
                    className={cn(
                      'w-full justify-start text-left [&>span]:min-w-0 [&>span]:break-words',
                      item.off && 'opacity-50',
                    )}
                    leftIcon={Icon ? <Icon strokeWidth={2} className="h-[1.375rem] w-[1.375rem] shrink-0" aria-hidden /> : undefined}
                  >
                    {item.label}
                  </Button>
                );
              })}
              <Button
                variant="secondary"
                size={buttonSize}
                data-testid="report-more-close"
                onClick={closeMore}
                className="mt-1 w-full"
                aria-label={t('rv1.more.close')}
              >
                {t('kit.close')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </ReportActionsProvider>
  );
}
