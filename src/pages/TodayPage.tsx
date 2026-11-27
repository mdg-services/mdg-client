import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import {
  AsOf,
  EmptyCalm,
  NoticesRow,
  PageHeader,
  SectionCard,
  VerdictCard,
} from '@/components/kit';
import { Button, Card } from '@/components/ui';
import { ownConversation } from '@/features/chat/useOpenMyChat';
import {
  comingUp,
  isPumpLive,
  pulseOf,
  pumpNowRows,
  verdictOf,
  type ComingUpItem,
  type Glance,
  type GlanceInput,
  type PulseSlot,
  type PumpNowRow,
  type Role,
} from '@/features/glance/glanceModel';
import type { NeedsMeItem } from '@/features/glance/needsMe';
import { tabVisible } from '@/features/kavach/kavachView';
import { OutletChip } from '@/features/outlets/OutletChip';
import { OutletSheet } from '@/features/outlets/OutletSheet';
import { orderLoad, orderSentence, planIsOld } from '@/features/reports/kinds/load_plan';
import { kindStyle } from '@/features/reports/kindStyle';
import { useOpenReport } from '@/features/reports/reportNav';
import { sayWords } from '@/features/reports/types';
import { hasServicePage } from '@/features/services/serviceMap';
import { SetupHero, useSetupHeroActive } from '@/features/setup/SetupHero';
import { useOutletSetup } from '@/features/setup/useOutletSetup';
import { useGreeting } from '@/features/today/Greeting';
import { needsCounts, refineNeedsMe, verdictSentenceOf, verdictWordOf } from '@/features/today/needsView';
import { paperNameOf, paperStatusOf, soonestPaperDays } from '@/features/today/paperNames';
import { PhotoConfirmSheet } from '@/features/today/PhotoConfirmSheet';
import { PulseTiles } from '@/features/today/PulseTiles';
import { ComingUpCard, DoneCard, PumpNowCard } from '@/features/today/TodayCards';
import { useMinuteClock, useOnline } from '@/features/today/todayClock';
import { TODAY_WORK_LAYOUT } from '@/features/today/todayConfig';
import { buildAlertsAndCovered, headlineOf } from '@/features/today/todayModel';
import { doneReports, isPhotoTask, newReportsFor, usableData } from '@/features/today/todayView';
import { useInlinePhoto } from '@/features/today/useInlinePhoto';
import { useTodayNotices } from '@/features/today/useTodayNotices';
import { WorkCarousel } from '@/features/today/WorkCarousel';
import { WorkList } from '@/features/today/WorkList';
import { useKavach } from '@/hooks/api/useKavach';
import { myConversationsKey } from '@/hooks/api/useMyConversations';
import { useTodayFeed } from '@/hooks/api/useTodayFeed';
import { fmtTime, indiaDay } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';
import { markFirstScreen } from '@/lib/perfReport';
import { getSocket } from '@/lib/socket';
import { useLargeText } from '@/lib/useLargeText';
import { isPageVisible } from '@/lib/usePageVisible';
import { useAuthStore } from '@/store/auth';
import type { Conversation, ReportKind, TodayFeed, TodayReport, TodayTask } from '@dk/shared/types';

/**
 * The app's first screen (spec 4.1; ADR 0055/0056 redrawn by ADR 0060), top to bottom:
 *
 *   header → the verdict (or, while the pump is being set up, the setup hero) and its notices →
 *   Needs you → the four numbers → Pump now → Coming up → Done for you.
 *
 * It answers one question: "is my pump OK, and what needs me right now?" Every message MDG sends
 * still goes to the chat. This page reads ONE answer (`GET /v1/me/today-feed`) and follows the
 * chat's sockets, so it changes as the chat does. What it decides is decided in the glance model
 * (`features/glance`): the verdict, the Needs-you list, the four numbers and the two cards' rows, so
 * the tab bar's badge, this card and My pump can never disagree. This file only draws them and wires
 * the taps. Nothing it draws needs a server field that may be absent.
 *
 * An older "See it on Today" link (`state.focusReport`) never reaches this page: the front door
 * (`App`'s `Home`) turns it into the report's overlay route, so it needs nothing here.
 */
export function TodayPage() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const large = useLargeText();
  const q = useTodayFeed();
  // The Kavach figures read the same answer the Kavach tab and its badge do: no request of its own.
  const kavachQuery = useKavach();
  const setup = useOutletSetup();
  const heroActive = useSetupHeroActive();
  const now = useMinuteClock();
  const online = useOnline();
  const isOwner = useAuthStore((s) => s.user?.role) === 'dealer-owner';
  const role: Role = isOwner ? 'owner' : 'manager';
  const feed = q.data;
  const photos = useInlinePhoto();
  const { prune: prunePhotos } = photos;
  const feedTasks = feed?.tasks;
  // A photo mark the feed no longer backs (the ask left, or came back sent back with a reason)
  // is forgotten, so a re-posted ask shows its "Send photo" button again.
  React.useEffect(() => {
    if (feedTasks) prunePhotos(feedTasks);
  }, [feedTasks, prunePhotos]);
  const openReportScreen = useOpenReport();

  // "Opening the app" is counted up to this screen showing its first answer: the
  // feed, or the plain statement that it could not be had. A feed that is never asked
  // for (the query is off for an admin signed in here) is settled too: it has nothing
  // to wait for, so the page says so instead of drawing grey rows for good.
  const failed = !feed && (q.isError || (q.status === 'pending' && q.fetchStatus === 'paused'));
  const idle = !feed && q.status === 'pending' && q.fetchStatus === 'idle';
  const shown = !!feed || failed || idle;
  React.useEffect(() => {
    if (shown) markFirstScreen();
  }, [shown]);

  // Kavach: `undefined` while its own answer is on the way (the fourth number waits, so it never
  // flips from papers to score), `null` when it is off or could not be read.
  const kavachLoading =
    kavachQuery.data === undefined && kavachQuery.isPending === true && kavachQuery.fetchStatus === 'fetching';
  const kavach = kavachQuery.data !== undefined ? (tabVisible(kavachQuery.data) ? kavachQuery.data : null) : kavachLoading ? undefined : null;

  const kindName = React.useCallback((kind: ReportKind) => sayWords(kindStyle(kind).names, lang), [lang]);
  const fetchedAt = q.dataUpdatedAt ? q.dataUpdatedAt : null;
  const stage = setup.data?.stage;

  // Everything the page draws, decided once per answer and per minute.
  const model = React.useMemo(() => {
    const built = feed ? buildAlertsAndCovered(feed, lang, isOwner, kindName) : null;
    const alerts = built ? built.items : [];
    const paperName = (item: Parameters<typeof paperNameOf>[0]) => paperNameOf(item, lang);
    const base = {
      feedFailed: failed,
      fetchedAt,
      online,
      kavach,
      role,
      lang,
      now,
      // The setup hero stands in the verdict's place, so the feed's own setup task is not listed twice.
      pumpLive: heroActive ? false : isPumpLive(stage),
      paperName,
    };
    const rawGlance = glanceOf(feed, alerts, base);
    // One list for everything the page counts and says: the Needs-you list, with the stock-variation
    // line carrying both of its numbers. The verdict's word, its chips, its sentence and the
    // heading above the cards are all read from it, so they cannot disagree.
    const needsMe = refineNeedsMe(rawGlance.needsMe, lang, isOwner);
    const counts = needsCounts(needsMe);
    const input = feed ? { feed, role, lang, now, paperName } : null;
    const pumpNow = input ? safely(() => pumpNowRows(input), []) : [];
    const covered = new Set(alerts.map((a) => a.report.messageId));
    // The one paper rule (under 30 days is "have a look"), for the tile and the row alike.
    const paperDays = (report: TodayReport | undefined): number | null => {
      const data = report ? usableData(report, isOwner) : undefined;
      return data?.kind === 'paper_expiry' ? soonestPaperDays(data, now) : null;
    };
    const supply = pumpNow.find((r) => r.id === 'supply');
    const supplyStopped =
      supply?.status === 'problem' && !needsMe.some((i) => i.report?.kind === 'ro_supply') ? supply.text : undefined;
    const glance: Glance = {
      ...rawGlance,
      needsMe,
      word: verdictWordOf(rawGlance, counts, lang),
      ...(() => {
        const sentence = verdictSentenceOf({ glance: rawGlance, items: needsMe, supplyStopped, lang });
        return sentence ? { sentence } : {};
      })(),
    };
    // With nothing in hand the model has no numbers; the Kavach score still has its own answer.
    const pulseRaw = !feed && kavach?.on ? pulseOf({ feed: EMPTY_FEED, kavach, role, lang, now, alerts: [], paperName }) : glance.pulse;
    const pulse = pulseRaw.map((slot) => {
      if (slot.id !== 'papers' || !slot.report || slot.value === undefined || covered.has(slot.report.messageId)) return slot;
      return { ...slot, status: paperStatusOf(slot.value) };
    });
    return {
      glance,
      counts,
      alertLines: new Map(alerts.map((a) => [a.report.messageId, a.line] as const)),
      pulse,
      pumpNow: pumpNow.map((row) => {
        if (row.id !== 'papers') return row;
        const days = paperDays(row.report);
        return days === null ? row : { ...row, status: paperStatusOf(days) };
      }),
      coming: input ? safely(() => comingUp({ ...input, kavach }), []) : [],
      done: feed ? doneReports(feed).map((report) => ({ report, headline: headlineOf(report, usableData(report, isOwner), lang) })) : [],
      newReports: feed
        ? // Not a report a Needs-you row opens, nor one whose warning is already the box of a task: said once.
          newReportsFor(feed, isOwner, new Set([...needsMe.flatMap((i) => (i.report ? [i.report.messageId] : [])), ...(built?.covered ?? [])])).map((report) => ({
            report,
            headline: headlineOf(report, usableData(report, isOwner), lang),
          }))
        : [],
    };
  }, [feed, failed, fetchedAt, online, kavach, role, isOwner, lang, now, heroActive, stage, kindName]);
  const { glance } = model;

  const { notices, sheet } = useTodayNotices(setup.data, now, isOwner);

  const [outletsOpen, setOutletsOpen] = React.useState(false);
  const closeOutlets = React.useCallback(() => setOutletsOpen(false), []);
  const greeting = useGreeting({ day: feed?.day, isManager: !isOwner, checkedAt: feed ? fetchedAt : null });

  // ── to the chat ──────────────────────────────────────────────────────────
  const openTask = React.useCallback(
    (task: TodayTask) =>
      navigate(`/chat/${encodeURIComponent(task.conversationId)}`, { state: { jumpToMessageId: task.messageId } }),
    [navigate],
  );

  // ── marking a report read ───────────────────────────────────────────────
  // A report the dealer opens here is read: without this the Chats tab and the chat's row
  // keep counting a message they have seen, and the team never gets the "seen" tick.
  // Once per message, and only while the page is on screen ("seen" means a person looked).
  const markedRead = React.useRef(new Set<string>());
  const markRead = React.useCallback((r: Pick<TodayReport, 'conversationId' | 'messageId'>) => {
    if (markedRead.current.has(r.messageId) || !isPageVisible()) return;
    const socket = getSocket();
    if (!socket) return;
    markedRead.current.add(r.messageId);
    socket.emit('read', { conversationId: r.conversationId, messageIds: [r.messageId] });
  }, []);

  // ── to the report screen ────────────────────────────────────────────────
  /**
   * Every opener (an alert, a done row, a new-report row) goes through the one door, and hands it the
   * row it already holds: the report screen draws that at once (no grey wait on a slow or missing
   * network) and the server's copy replaces it. The door also ignores a second tap on the report
   * already on show.
   */
  const openReport = React.useCallback(
    (r: TodayReport) => {
      markRead(r);
      openReportScreen({ conversationId: r.conversationId, messageId: r.messageId, report: r });
    },
    [markRead, openReportScreen],
  );

  const openItem = React.useCallback(
    (item: NeedsMeItem) => {
      if (item.source === 'kavach') navigate('/kavach');
      else if (item.report) openReport(item.report);
    },
    [navigate, openReport],
  );

  /** A service's own page when it has one, else the newest report it sent, else nothing. */
  const pressService = React.useCallback(
    (serviceId: string | null, report?: TodayReport): (() => void) | undefined => {
      if (serviceId === 'kavach') return () => navigate('/kavach');
      if (serviceId === 'tanker-documents') return () => navigate('/pump/papers');
      if (serviceId && hasServicePage(serviceId, isOwner)) return () => navigate(`/services/${serviceId}`);
      if (report) return () => openReport(report);
      return undefined;
    },
    [navigate, openReport, isOwner],
  );

  const openPulse = React.useCallback(
    (slot: PulseSlot) => {
      const serviceId: Record<PulseSlot['id'], string> = {
        sales: 'dsr-report',
        variation: 'dsr-report',
        deposit: 'credit-dod-monitoring',
        water: 'water-ingress-testing',
        score: 'kavach',
        papers: 'tanker-documents',
      };
      pressService(serviceId[slot.id], slot.report)?.();
    },
    [pressService],
  );

  const pumpRowPress = React.useCallback((row: PumpNowRow) => pressService(row.serviceId, row.report), [pressService]);
  const comingPress = React.useCallback((item: ComingUpItem) => pressService(item.serviceId), [pressService]);

  /** "Plan the order": the chat with the plan's own order typed in the box and NOT sent. */
  const planOrder = React.useCallback(
    (row: PumpNowRow) => {
      const report = row.report;
      const data = report ? usableData(report, isOwner) : undefined;
      if (report && data?.kind === 'load_plan' && !planIsOld(data, now.getTime())) {
        const load = orderLoad(data);
        if (load && load.byProduct.length > 0) {
          navigate(`/chat/${encodeURIComponent(report.conversationId)}`, { state: { draftText: orderSentence(load, lang) } });
          return;
        }
      }
      pressService(row.serviceId, report)?.();
    },
    [isOwner, lang, navigate, now, pressService],
  );

  /** "Ask for a stock check": the dealer's own chat with the question typed in the box and NOT sent. */
  const askStock = React.useCallback(() => {
    const userId = useAuthStore.getState().user?.id;
    const own = ownConversation(qc.getQueryData<Conversation[]>(myConversationsKey), userId);
    if (own) navigate(`/chat/${own.id}`, { state: { draftText: t('today.card.askStockDraft') } });
    else navigate('/chat');
  }, [navigate, qc, t]);

  // ── the pieces ───────────────────────────────────────────────────────────
  const counts = [
    { label: t('today.count.needYou'), n: model.counts.needYou },
    { label: t('today.count.look'), n: model.counts.look },
    { label: t('today.count.done'), n: glance.counts.doneToday },
  ].filter((c) => c.n > 0);

  const asOfNode = (() => {
    if (glance.asOf.kind === 'none') return null;
    const refreshFailed = !!feed && (q.isError || !online);
    if (refreshFailed) {
      const at = fetchedAt ?? Date.parse(glance.asOf.at);
      return <span className="text-meta text-text-muted">{t('today.page.checkedOffline', { time: fmtTime(at, lang) })}</span>;
    }
    return <AsOf at={glance.asOf.at} checked={glance.asOf.kind === 'checked'} />;
  })();

  const noticesRow = notices.length > 0 ? <NoticesRow notices={notices} /> : null;

  const verdictCard = heroActive ? (
    <>
      <SetupHero />
      {noticesRow}
    </>
  ) : (
    <VerdictCard
      status={glance.cardStatus}
      word={glance.word}
      sentence={glance.sentence}
      counts={counts}
      asOf={asOfNode}
    >
      {glance.verdict === 'unknown' && !glance.loading ? (
        <div>
          <Button variant="secondary" onClick={() => void q.refetch()} loading={q.isFetching}>
            {t('kit.retry')}
          </Button>
        </div>
      ) : null}
      {noticesRow}
    </VerdictCard>
  );

  const detailFor = (item: NeedsMeItem) => (item.report ? model.alertLines.get(item.report.messageId) || undefined : undefined);
  const needsHeadingId = 'today-needs';
  const needsCount = glance.needsMe.length;
  const showNeeds = !!feed && (needsCount > 0 || (!heroActive && glance.verdict === 'fine'));
  const needs = showNeeds ? (
    <section aria-labelledby={needsHeadingId} data-testid="today-needs">
      <h2 id={needsHeadingId} className={large ? 'sr-only' : 'mb-2 px-0.5 text-heading text-text'}>
        {t('glance.section.needs')}
        {needsCount > 0 ? <span className="ml-2 text-meta font-semibold tabular-nums text-text-muted">{needsCount}</span> : null}
      </h2>
      {needsCount === 0 ? (
        <Card className="p-2">
          <EmptyCalm status="ok" text={t('today.row.clear')} />
        </Card>
      ) : TODAY_WORK_LAYOUT === 'slider' && !large ? (
        // At large text the slider's cards are as tall as the tallest one, so a short card was left with a
        // screen of empty space between its words and its button. The set is stacked instead, each row as
        // tall as its own words (Q1's default stays the slider for normal text).
        <WorkCarousel
          items={glance.needsMe}
          labelledBy={needsHeadingId}
          photoFor={photos.stateFor}
          onPhoto={photos.pick}
          onRetry={photos.retry}
          onOpenTask={openTask}
          onOpenItem={openItem}
          detailFor={detailFor}
        />
      ) : (
        <WorkList
          items={glance.needsMe}
          labelledBy={needsHeadingId}
          photoFor={photos.stateFor}
          onPhoto={photos.pick}
          onRetry={photos.retry}
          onOpenTask={openTask}
          onOpenItem={openItem}
          detailFor={detailFor}
        />
      )}
    </section>
  ) : null;

  const hasReports = !!feed && feed.reports.length + feed.done.length > 0;

  let body: React.ReactNode;
  if (idle) {
    body = (
      <SectionCard title={t('today.empty.title')}>
        <EmptyCalm text={t('today.empty.desc')} />
      </SectionCard>
    );
  } else if (!feed && !failed) {
    body = <Loading />;
  } else {
    body = (
      <>
        {verdictCard}
        {needs}
        <PulseTiles slots={model.pulse} isOwner={isOwner} now={now} onOpen={openPulse} kavach={kavach ?? null} />
        {hasReports ? (
          <PumpNowCard rows={model.pumpNow} pressFor={pumpRowPress} onPlanOrder={planOrder} onAskStock={askStock} />
        ) : null}
        <ComingUpCard items={model.coming} pressFor={comingPress} />
        {feed && hasReports ? (
          <DoneCard
            done={model.done}
            newReports={model.newReports}
            now={now}
            onOpenReport={openReport}
            onSeeReports={() => navigate('/reports')}
            onSeeServices={() => navigate('/services')}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        variant="tab"
        title={greeting.title}
        subtitle={<span data-testid="today-date-line">{greeting.line}</span>}
      />
      {/* No `overflow-x-clip` here: it only ever hid things. Measured with it removed (Hindi, Hinglish and English,
          normal and 200% text, Today and all 18 report overlays at 390 px), nothing on this page or under it
          is wider than the screen. The boxes that read as 717, 823 and 674 px wide were the screen-reader-only
          tables inside the tiles, which are clipped to one pixel by their own box. */}
      <div className="flex flex-1 flex-col bg-bg" data-testid="today-page">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 pb-10 pt-3 md:max-w-2xl lg:max-w-3xl">
          <div className="flex">
            <OutletChip onOpen={() => setOutletsOpen(true)} />
          </div>
          {body}
        </div>
      </div>
      {outletsOpen ? <OutletSheet onClose={closeOutlets} /> : null}
      {sheet}
      {photos.pending ? (
        <PhotoConfirmSheet
          pending={{
            item: photos.pending.item,
            title: photos.pending.task.title,
            acceptsFile: isPhotoTask(photos.pending.task) && photos.pending.task.action.acceptsFile,
          }}
          onSend={photos.confirmPending}
          onReplace={photos.replacePending}
          onClose={photos.cancelPending}
        />
      ) : null}
    </>
  );
}

function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

type GlanceBase = Omit<GlanceInput, 'feed' | 'alerts'>;

/**
 * The verdict, which must never take the page down: a snapshot that has its envelope but not its parts
 * (an older or newer server) could make one number's reader throw. Then the open tasks and problems are
 * still drawn from the feed without its reports; anything else says "Cannot check right now", never
 * "All fine".
 */
function glanceOf(feed: TodayFeed | undefined, alerts: GlanceInput['alerts'], base: GlanceBase): Glance {
  try {
    return verdictOf({ ...base, feed, alerts });
  } catch {
    if (feed) {
      try {
        const g = verdictOf({ ...base, feed: { ...feed, reports: [], done: [] }, alerts: [] });
        if (g.verdict === 'needs_you' || g.verdict === 'setup') return g;
      } catch {
        /* fall through to "cannot check" */
      }
    }
    return verdictOf({ ...base, feed: undefined, feedFailed: true, alerts: [] });
  }
}

/** A feed with nothing in it: what the model is asked about when only the Kavach score is in hand. */
const EMPTY_FEED: TodayFeed = { day: indiaDay(), role: 'owner', tasks: [], reports: [], done: [] };

/** Grey blocks where the verdict and the numbers will be, so the page has its shape before the answer comes. */
function Loading() {
  const t = useT();
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{t('today.loading')}</span>
      <div aria-hidden className="h-28 animate-pulse rounded-xl border border-border bg-surface" />
      <div aria-hidden className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-surface" />
        ))}
      </div>
    </div>
  );
}

