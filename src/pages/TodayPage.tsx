import { CalendarCheck, ChevronRight, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { AppBar, type AppBarMenuItem } from '@/components/AppBar';
import { Button, EmptyState } from '@/components/ui';
import { OutletChip } from '@/features/outlets/OutletChip';
import { OutletSheet } from '@/features/outlets/OutletSheet';
import { hasOtherOutlets, useOutlets } from '@/features/outlets/useOutlets';
import { BatteryGuideCard } from '@/features/push/BatteryGuide';
import { PushNotice } from '@/features/push/PushNotice';
import { kindStyle } from '@/features/reports/kindStyle';
import { useOpenReport } from '@/features/reports/reportNav';
import { sayWords } from '@/features/reports/types';
import { BillDueBanner } from '@/features/setup/BillDueBanner';
import { stripVisible } from '@/features/setup/stripView';
import { useOutletSetup } from '@/features/setup/useOutletSetup';
import { AlertCard } from '@/features/today/AlertCard';
import { useGreeting } from '@/features/today/Greeting';
import { PhotoConfirmSheet } from '@/features/today/PhotoConfirmSheet';
import { GhostTile, PumpTile } from '@/features/today/PumpTile';
import { SetupSummary } from '@/features/today/SetupSummary';
import {
  CalmLine,
  DoneRow,
  EarlierRow,
  MoreButton,
  SectionHeading,
  Sheet,
} from '@/features/today/TodayRows';
import { WorkCarousel } from '@/features/today/WorkCarousel';
import { buildAlertsAndCovered, buildTiles, headlineOf } from '@/features/today/todayModel';
import {
  ALERT_LIMIT,
  DONE_LIMIT,
  EARLIER_LIMIT,
  TODAY_META_CLASS,
  doneReports,
  earlierReports,
  feedIsEmpty,
  ghostSlots,
  usableData,
  workTasks,
} from '@/features/today/todayView';
import { useInlinePhoto } from '@/features/today/useInlinePhoto';
import { useTodayFeed } from '@/hooks/api/useTodayFeed';
import { useLang, useT } from '@/lib/i18n';
import { markFirstScreen } from '@/lib/perfReport';
import { getSocket } from '@/lib/socket';
import { isPageVisible } from '@/lib/usePageVisible';
import { useAuthStore } from '@/store/auth';
import { dealerCodeLabel } from '@dk/shared';
import type { ReportKind, TodayReport, TodayTask } from '@dk/shared/types';

/**
 * The app's first screen (ADR 0055, redrawn by ADR 0056 §3), top to bottom:
 *
 *   greeting → bill / notification / battery strips → setup block (until started) →
 *   Your work (what the dealer must do, with the button on the card) →
 *   Needs a look (what is wrong, one big headline each) →
 *   Your pump today (the numbers, as tiles in one fixed order) → See all reports →
 *   Done for you.
 *
 * Every message MDG sends still goes to the chat. This page reads ONE answer
 * (`GET /v1/me/today-feed`) and follows the chat's sockets, so it changes as the chat does.
 * What a report looks like is not decided here: each kind's own view says what its tile and
 * its alert are (`features/reports`), and a tap opens the report screen
 * (`/report/:conversationId/:messageId`). A report from before snapshots existed has no
 * tile and no alert of its own; it stays reachable as an "earlier report".
 *
 * An older "See it on Today" link (`state.focusReport`) never reaches this page: the front door
 * (`App`'s `Home`) turns it into the report's overlay route, so it needs nothing here.
 */
export function TodayPage() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const q = useTodayFeed();
  const setup = useOutletSetup();
  const outlets = useOutlets();
  // Setup is the owner's to follow, in the owner's chat: a manager has no such box.
  const isOwner = useAuthStore((s) => s.user?.role) === 'dealer-owner';
  const setupShown = isOwner && stripVisible(setup.data);
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

  const kindName = React.useCallback(
    (kind: ReportKind) => sayWords(kindStyle(kind).names, lang),
    [lang],
  );

  // Everything the page draws, decided once per answer.
  const model = React.useMemo(() => {
    if (!feed) return null;
    const { items: alerts, covered } = buildAlertsAndCovered(feed, lang, isOwner, kindName);
    // Words-only alerts, and alerts left out because the same work is under "Your work", are not
    // listed again as an earlier report.
    const alertWords = new Set([
      ...alerts.filter((a) => a.fromWords).map((a) => a.report.messageId),
      ...covered,
    ]);
    return {
      tasks: workTasks(feed, setupShown),
      alerts,
      tiles: buildTiles(feed, lang, isOwner),
      earlier: earlierReports(feed, isOwner, alertWords),
      done: doneReports(feed),
    };
  }, [feed, lang, isOwner, setupShown, kindName]);

  // The bar is the same as the chat list's: the pump chip and the ⋮ menu.
  const [outletsOpen, setOutletsOpen] = React.useState(false);
  const closeOutlets = React.useCallback(() => setOutletsOpen(false), []);
  const menu = React.useMemo<AppBarMenuItem[]>(
    () => [
      {
        key: 'settings',
        label: t('chatlist.settings'),
        onSelect: () => navigate('/settings'),
      },
    ],
    [t, navigate],
  );

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

  // ── to the chat ──────────────────────────────────────────────────────────
  const openInChat = React.useCallback(
    (conversationId: string, messageId: string) =>
      navigate(`/chat/${encodeURIComponent(conversationId)}`, {
        state: { jumpToMessageId: messageId },
      }),
    [navigate],
  );
  const openTask = React.useCallback(
    (task: TodayTask) => openInChat(task.conversationId, task.messageId),
    [openInChat],
  );
  const setupTask = feed?.tasks.find((x) => x.kind === 'setup');
  // The Chats tab is a sibling of this page, reached by replacing the entry (as the bar
  // does) so Back from it still leaves the app in one press.
  const openSetup = () => (setupTask ? openTask(setupTask) : navigate('/chat', { replace: true }));

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
   * Every opener (a tile, an alert, a done row, an earlier row) goes through the one door, and hands
   * it the row it already holds: the report screen draws that at once (no grey wait on a slow or
   * missing network) and the server's copy replaces it. The door also ignores a second tap on the
   * report already on show.
   */
  const openReport = React.useCallback(
    (r: TodayReport) => {
      markRead(r);
      openReportScreen({ conversationId: r.conversationId, messageId: r.messageId, report: r });
    },
    [markRead, openReportScreen],
  );

  // ── lists cut short by "N more" ──────────────────────────────────────────
  const [alertsAll, setAlertsAll] = React.useState(false);
  const [doneAll, setDoneAll] = React.useState(false);

  // The greeting is the bar's title (the page's h1), the date line its subtitle: the tab bar
  // already says "Today", and a greeting block under the bar cost the first screen a quarter
  // of its height (owner, 25 Nov 2026).
  const greeting = useGreeting({
    day: feed?.day,
    outletCode: hasOtherOutlets(outlets.data) ? dealerCodeLabel(outlets.data.current.code) : undefined,
    isManager: !isOwner,
  });

  const bar = (
    <>
      <AppBar
        variant="home"
        titleAsHeading
        title={<span data-testid="today-greeting">{greeting.title}</span>}
        subtitle={<span data-testid="today-date-line">{greeting.line}</span>}
        actions={<OutletChip onOpen={() => setOutletsOpen(true)} />}
        menu={menu}
      />
      {outletsOpen ? <OutletSheet onClose={closeOutlets} /> : null}
    </>
  );

  let body: React.ReactNode;
  if (failed) {
    body = (
      <EmptyState
        icon={<CalendarCheck width={28} strokeWidth={1.5} />}
        title={t('today.error.title')}
        description={t('today.error.desc')}
        cta={
          <Button
            onClick={() => void q.refetch()}
            loading={q.isFetching}
            leftIcon={<RefreshCw width={16} strokeWidth={1.75} />}
          >
            {t('chat.retry')}
          </Button>
        }
      />
    );
  } else if (idle) {
    body = (
      <EmptyState
        icon={<CalendarCheck width={28} strokeWidth={1.5} />}
        title={t('today.empty.title')}
        description={t('today.empty.desc')}
      />
    );
  } else if (!feed || !model) {
    body = <Loading />;
  } else if (feedIsEmpty(feed)) {
    // A pump still being set up has its progress card above and its numbers still to come;
    // a second "nothing yet" under it would only repeat itself.
    body = setupShown ? (
      <section aria-labelledby="today-pump">
        <SectionHeading id="today-pump">{t('today.pump.title')}</SectionHeading>
        <GhostGrid isOwner={isOwner} />
      </section>
    ) : (
      <EmptyState
        icon={<CalendarCheck width={28} strokeWidth={1.5} />}
        title={t('today.empty.title')}
        description={t('today.empty.desc')}
      />
    );
  } else {
    const { tasks, alerts, tiles, earlier, done } = model;
    const alertsShown = alertsAll ? alerts : alerts.slice(0, ALERT_LIMIT);
    const doneShown = doneAll ? done : done.slice(0, DONE_LIMIT);
    const earlierShown = earlier.slice(0, EARLIER_LIMIT);
    const hasReports = feed.reports.length + feed.done.length > 0;
    // While setup is running a section with nothing in it stays out of the way.
    const showWork = tasks.length > 0 || !setupShown;
    const showAlerts = alerts.length > 0 || !setupShown;
    const showDone = done.length > 0 || !setupShown;

    body = (
      <>
        {showWork ? (
          <section aria-labelledby="today-work">
            <SectionHeading id="today-work" count={tasks.length}>
              {t('today.work.title')}
            </SectionHeading>
            {tasks.length > 0 ? (
              <WorkCarousel
                tasks={tasks}
                labelledBy="today-work"
                photoFor={photos.stateFor}
                onPhoto={photos.pick}
                onRetry={photos.retry}
                onOpen={openTask}
              />
            ) : (
              <CalmLine testId="today-work-clear">{t('today.work.clear')}</CalmLine>
            )}
          </section>
        ) : null}

        {showAlerts ? (
          <section aria-labelledby="today-attention">
            <SectionHeading id="today-attention" count={alerts.length}>
              {t('today.attention.title')}
            </SectionHeading>
            {alerts.length > 0 ? (
              <>
                <ul
                  aria-labelledby="today-attention"
                  className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface"
                >
                  {alertsShown.map((item) => (
                    <AlertCard key={item.report.messageId} item={item} onOpen={openReport} />
                  ))}
                </ul>
                {alerts.length > ALERT_LIMIT ? (
                  <MoreButton
                    hiddenCount={alerts.length - ALERT_LIMIT}
                    expanded={alertsAll}
                    about={t('today.attention.title')}
                    onToggle={() => setAlertsAll((v) => !v)}
                  />
                ) : null}
              </>
            ) : (
              <CalmLine testId="today-attention-clear">{t('today.attention.clear')}</CalmLine>
            )}
          </section>
        ) : null}

        <section aria-labelledby="today-pump">
          <SectionHeading id="today-pump">{t('today.pump.title')}</SectionHeading>
          {tiles.length > 0 ? (
            <div className={TILE_FRAME}>
              <ul aria-labelledby="today-pump" className={TILE_GRID}>
                {tiles.map((item) => (
                  <PumpTile key={item.slot.id} item={item} today={feed.day} onOpen={openReport} />
                ))}
              </ul>
            </div>
          ) : setupShown ? (
            <GhostGrid isOwner={isOwner} />
          ) : (
            <CalmLine testId="today-pump-empty">{t('today.pump.empty')}</CalmLine>
          )}
          {earlierShown.length > 0 ? (
            <div className="mt-4">
              <h3
                id="today-earlier"
                className="mb-2 px-0.5 text-subheading text-text-muted"
              >
                {t('today.pump.earlier')}
              </h3>
              <Sheet labelledBy="today-earlier">
                {earlierShown.map((r) => (
                  <EarlierRow
                    key={r.messageId}
                    report={r}
                    today={feed.day}
                    onOpen={openReport}
                    onSeeInChat={(x) => openInChat(x.conversationId, x.messageId)}
                  />
                ))}
              </Sheet>
            </div>
          ) : null}
          {hasReports ? (
            <button
              type="button"
              onClick={() => navigate('/reports')}
              className="mt-3 flex min-h-12 w-full items-center justify-center gap-1 rounded-[10px] border border-border-strong bg-surface px-4 py-2.5 text-cta text-text transition-colors duration-150 active:bg-surface-2"
            >
              {t('today.pump.seeAll')}
              <ChevronRight
                className="size-5 shrink-0 rtl:rotate-180"
                strokeWidth={1.75}
                aria-hidden
              />
            </button>
          ) : null}
        </section>

        {showDone ? (
          <section aria-labelledby="today-done">
            <SectionHeading id="today-done" count={done.length}>
              {t('today.done.title')}
            </SectionHeading>
            {done.length > 0 ? (
              <>
                <Sheet labelledBy="today-done">
                  {doneShown.map((r) => (
                    <DoneRow
                      key={r.messageId}
                      report={r}
                      headline={headlineOf(r, usableData(r, isOwner), lang)}
                      today={feed.day}
                      onOpen={openReport}
                    />
                  ))}
                </Sheet>
                {done.length > DONE_LIMIT ? (
                  <MoreButton
                    hiddenCount={done.length - DONE_LIMIT}
                    expanded={doneAll}
                    about={t('today.done.title')}
                    onToggle={() => setDoneAll((v) => !v)}
                  />
                ) : null}
              </>
            ) : (
              <CalmLine testId="today-done-clear">{t('today.done.clear')}</CalmLine>
            )}
          </section>
        ) : null}
      </>
    );
  }

  return (
    <>
      {bar}
      <div className={`flex flex-1 flex-col bg-bg ${TODAY_META_CLASS}`} data-testid="today-page">
        {/* The same three strips the chat list carries, now on the first screen. */}
        <BillDueBanner />
        <PushNotice />
        <BatteryGuideCard />
        <div className="flex flex-1 flex-col gap-7 px-4 pb-10 pt-4">
          {isOwner ? <SetupSummary onOpen={openSetup} /> : null}
          {body}
        </div>
      </div>
      {photos.pending ? (
        <PhotoConfirmSheet
          pending={photos.pending}
          onSend={photos.confirmPending}
          onReplace={photos.replacePending}
          onClose={photos.cancelPending}
        />
      ) : null}
    </>
  );
}

/**
 * The tiles: two to a row on a phone, one at a time when the text is large. The column width
 * is in `rem`, so it grows with the reader's text size and a large-text phone gets one column
 * without a switch of its own.
 */
/**
 * Tiles flow in rem-wide columns (two on a phone, one at large text). Each cell rules its own
 * right and bottom edge; the grid overhangs its frame by one pixel so the outer rules are clipped
 * and only the frame's border shows, whatever the column count.
 */
const TILE_FRAME = 'overflow-hidden rounded-xl border border-border bg-surface';
const TILE_GRID = '-mb-px -mr-px grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]';

/** The dashed stand-ins shown while setup is running, with the one line that says why. */
function GhostGrid({ isOwner }: { isOwner: boolean }) {
  const t = useT();
  return (
    <>
      <div className={TILE_FRAME}>
        <ul aria-labelledby="today-pump" className={TILE_GRID} data-testid="today-ghost-tiles">
          {ghostSlots(isOwner).map((slot) => (
            <GhostTile key={slot.id} slot={slot} />
          ))}
        </ul>
      </div>
      <p className="mt-3 text-body text-text-muted">{t('today.pump.ghost')}</p>
    </>
  );
}

/** Grey blocks where the lists will be, so the page has its shape before the answer comes. */
function Loading() {
  const t = useT();
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{t('today.loading')}</span>
      <div aria-hidden>
        <div className="mb-2.5 h-5 w-32 animate-pulse rounded bg-surface-2" />
        <div className="h-36 animate-pulse rounded-xl border border-border bg-surface" />
      </div>
      <div aria-hidden>
        <div className="mb-2.5 h-5 w-40 animate-pulse rounded bg-surface-2" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-36 animate-pulse rounded-xl border border-border bg-surface ${i === 0 ? 'col-span-full' : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
