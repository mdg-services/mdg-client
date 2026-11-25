import { onlineManager } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Ban,
  CalendarCheck,
  Clock,
  FileQuestion,
  Lock,
  MessageCircle,
  Repeat2,
  PencilLine,
  RefreshCw,
  Share2,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';

import { useToast } from '@/components/ui';
import { reloadInto, useOutlets, useSwitchOutlet } from '@/features/outlets/useOutlets';
import { cn } from '@/lib/cn';
import { useAttachmentDownload } from '@/lib/downloadAttachment';
import { useLang, useT, type MessageKey } from '@/lib/i18n';
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
import { StatusBadge } from './StatusBadge';
import { sayWords, type OverlayProps, type ReportAction, type ReportStatusKey } from './types';
import { reportLoadProblem, useReport, type ReportLoadProblem } from './useReport';

/**
 * One report, drawn over the screen the dealer came from (ADR 0056 §4).
 *
 * The SHELL is the same for every kind, so the app feels like one thing and a dealer who taps
 * blindly lands in a place they know:
 *
 *   pinned top      Close (with the word), the family colour band, the report's icon and name,
 *                   the day it is about, the "as of" time, and how it stands (shape + word)
 *   one banner      at most one strip, in this order: removed, newer exists, corrected,
 *                   partly worked out, offline
 *   body            the kind's own view (`getKindView(kind).Overlay`), or for a message from
 *                   before snapshots the picture, drawn inline (`PictureFallback`)
 *   pinned bottom   Share, and See in chat
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
 * picture viewer while that is open on top.
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
        if (panel?.querySelector('[data-no-swipe]')) return;
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
      className={cn('shrink-0 border-b border-wa-divider', look.tone)}
    >
      <div className="mx-auto flex w-full max-w-md flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 md:max-w-2xl lg:max-w-3xl">
        <look.Icon width={22} strokeWidth={2} className="shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 basis-48 text-body font-medium leading-normal">{t(look.key)}</p>
        {banner.kind === 'newer' ? (
          <button
            type="button"
            data-testid="report-see-newer"
            onClick={() => onOpenNewer(banner.target)}
            className="min-h-11 shrink-0 rounded-md px-2 text-cta underline underline-offset-4"
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
        'inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-[10px] px-4 text-cta disabled:opacity-60',
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
        <Repeat2 width={40} strokeWidth={1.5} className="text-wa-meta" aria-hidden />
        <h2 className="text-heading text-text">{t('report.otherPump.title')}</h2>
        <p className="max-w-sm text-body leading-relaxed text-wa-meta">{text}</p>
        <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
          {button}
          {failed}
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-xl px-4 text-cta text-wa-accent-strong"
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
      className="shrink-0 border-b border-wa-divider bg-status-waiting-soft text-status-waiting-ink"
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
      <look.Icon width={40} strokeWidth={1.5} className="text-wa-meta" aria-hidden />
      <h2 className="text-heading text-text">{t(look.title)}</h2>
      <p className="max-w-sm text-body leading-relaxed text-wa-meta">{t(look.desc)}</p>
      <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
        {retryable ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-brand px-4 text-cta text-text-inverse disabled:opacity-60"
          >
            <RefreshCw width={18} strokeWidth={2} aria-hidden />
            {t('report.retry')}
          </button>
        ) : null}
        <button
          type="button"
          data-testid="report-go-today"
          onClick={onGoToday}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] border border-border-strong bg-surface px-4 text-cta text-text active:bg-surface-2"
        >
          <CalendarCheck width={18} strokeWidth={2} aria-hidden />
          {t('report.todayPage')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 rounded-xl px-4 text-cta text-wa-accent-strong"
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
        <p className="whitespace-pre-line text-body font-medium leading-relaxed text-wa-bubble-text">{headline}</p>
      ) : null}
      <p className="text-body leading-relaxed text-wa-meta">{t('report.fallback.words')}</p>
    </div>
  );
}

/** The role as the shared helpers name it. */
function viewerRoleOf(role: string | undefined): 'owner' | 'manager' {
  return role === 'dealer-owner' ? 'owner' : 'manager';
}

// ── the overlay ──────────────────────────────────────────────────────────────

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
    } else if (alert) {
      status = alert.severity;
    } else {
      status = detail.status;
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
          <div className="p-4 pb-6">
            <Overlay data={data as never} report={detail} lang={lang} />
          </div>
        </KindBoundary>
      );
    }
    if (detail.attachments.some((a) => a.kind !== 'audio')) {
      return (
        <div className="p-4 pb-6">
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
        className="fixed inset-0 z-40 flex flex-col bg-bg outline-none"
      >
        {/* The family is a 3 px rule along the top edge: the report is recognised, the screen stays calm. */}
        <header className="shrink-0 border-b border-border bg-surface text-text" style={{ boxShadow: `inset 0 3px 0 ${family}` }}>
          <div className="mx-auto w-full max-w-md md:max-w-2xl lg:max-w-3xl">
            {/* Only the Close row and the badge stay pinned (the title scrolls with the report, so large text never squeezes the body to nothing); the row clears the notch and the status bar. */}
            <div
              data-testid="report-header-row"
              className="safe-top flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pb-1 pr-3"
            >
              <button
                type="button"
                data-testid="report-close"
                onClick={onClose}
                aria-label={t('report.closeLabel')}
                className="flex min-h-14 min-w-14 items-center gap-1.5 pl-3 pr-4 text-body font-medium text-text active:bg-surface-2"
              >
                <X width={24} strokeWidth={2.25} aria-hidden />
                {t('report.close')}
              </button>
              {detail && !emptyState && (status !== 'info' || statusWord) ? (
                <span data-testid="report-status">
                  <StatusBadge status={status} lang={lang} {...(statusWord ? { word: statusWord } : {})} />
                </span>
              ) : null}
            </div>
          </div>
        </header>

        {otherPump && detail && !wrongPumpBlock ? (
          <OtherPumpNotice other={otherPump} target={target} block={false} onClose={onClose} />
        ) : null}
        {banner ? <Banner banner={banner} onOpenNewer={onOpenNewer} /> : null}

        <div data-testid="report-body" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div data-testid="report-title-band" className="border-b border-border bg-surface text-text">
            <div className="mx-auto w-full max-w-md md:max-w-2xl lg:max-w-3xl">
              <div className="flex items-start gap-3.5 px-4 pb-4 pt-3">
                {style ? (
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px]"
                    style={{ backgroundColor: familyVar(style.family, 'soft'), color: familyVar(style.family, 'ink') }}
                  >
                    <style.Icon width={22} strokeWidth={1.75} aria-hidden />
                  </span>
                ) : null}
                <div className="min-w-0 flex-1">
                  <h1 id={titleId} className="break-words text-title">
                    {name}
                  </h1>
                  {when.length > 0 ? (
                    <p data-testid="report-when" className="mt-0.5 break-words text-body leading-normal text-text-muted">
                      {when.join(' · ')}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <div className="mx-auto w-full max-w-md md:max-w-2xl lg:max-w-3xl">{body}</div>
        </div>

        {showActions ? (
          <footer
            data-testid="report-footer"
            className="safe-bottom max-h-[30vh] shrink-0 overflow-y-auto border-t border-border bg-surface"
          >
            <div className="mx-auto flex w-full max-w-md flex-col gap-2 p-3 md:max-w-2xl lg:max-w-3xl">
              {actions.length > 0 ? (
                <div className="flex flex-wrap gap-2" data-testid="report-actions">
                  {actions.map((a) => {
                    const off = !!a.disabled || spent.has(a.id);
                    const Icon = a.icon;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        data-testid={`report-action-${a.id}`}
                        aria-disabled={off || running !== null ? true : undefined}
                        onClick={() => void runAction(a)}
                        className={cn(
                          'inline-flex min-h-12 min-w-36 flex-1 items-center justify-center gap-2 rounded-[10px] bg-brand px-3 text-center text-cta text-text-inverse transition-colors duration-150 active:bg-brand-hover',
                          off && 'opacity-50',
                        )}
                      >
                        {Icon ? <Icon width={20} strokeWidth={2} className="shrink-0" aria-hidden /> : null}
                        <span className="min-w-0 break-words">{sayWords(a.label, lang)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {lockNote ? (
                <p role="status" data-testid="report-action-note" className="text-body leading-normal text-wa-meta">
                  {lockNote}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {canShare ? (
                  <button
                    type="button"
                    data-testid="report-share"
                    onClick={() => void onShare()}
                    disabled={sharing}
                    className="inline-flex min-h-12 min-w-36 flex-1 items-center justify-center gap-2 rounded-[10px] border border-border-strong bg-surface px-3 text-cta text-text transition-colors duration-150 active:bg-surface-2 disabled:opacity-60"
                  >
                    <Share2 width={20} strokeWidth={2} className="shrink-0" aria-hidden />
                    {sharePicture ? t('report.sharePicture') : t('report.share')}
                  </button>
                ) : null}
                {removed ? (
                  <button
                    type="button"
                    data-testid="report-go-today"
                    onClick={onGoToday}
                    className="inline-flex min-h-12 min-w-36 flex-1 items-center justify-center gap-2 rounded-[10px] bg-brand px-3 text-cta text-text-inverse active:bg-brand-hover"
                  >
                    {t('report.todayPage')}
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="report-see-in-chat"
                    onClick={() => onSeeInChat(target)}
                    className={cn(
                      'inline-flex min-h-12 min-w-36 flex-1 items-center justify-center gap-2 rounded-[10px] px-3 text-cta transition-colors duration-150',
                      actions.length > 0
                        ? 'border border-border-strong bg-surface text-text active:bg-surface-2'
                        : 'bg-brand text-text-inverse active:bg-brand-hover',
                    )}
                  >
                    <MessageCircle width={20} strokeWidth={2} className="shrink-0" aria-hidden />
                    {t('report.seeInChat')}
                  </button>
                )}
              </div>
            </div>
          </footer>
        ) : null}
      </div>
    </ReportActionsProvider>
  );
}
