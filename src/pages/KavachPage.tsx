import { onlineManager } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import {
  AsOf,
  EmptyCalm,
  ErrorCard,
  HelpChip,
  PageHeader,
  PillGroup,
  ProgressBar,
  SectionCard,
  SkeletonBlock,
} from '@/components/kit';
import { PdfViewer } from '@/components/PdfViewer';
import { Button } from '@/components/ui';
import { KavachDetailSheet } from '@/features/kavach/KavachDetailSheet';
import { KavachRow } from '@/features/kavach/KavachRow';
import { KavachSummary, type JumpTarget } from '@/features/kavach/KavachSummary';
import {
  DATA_LIMIT,
  UPCOMING_LIMIT,
  WEEK_LIMIT,
  clockWords,
  countsOfSections,
  countsOutOfStep,
  dailyJobsOf,
  dayWords,
  leftWords,
  nextJobAt,
  sectionsOf,
  titleOf,
  worthOf,
  type RowSection,
} from '@/features/kavach/kavachView';
import { rowKey, useKavachActions } from '@/features/kavach/useKavachActions';
import { useKavachEventSends } from '@/features/kavach/useKavachEventSends';
import { PhotoConfirmSheet } from '@/features/today/PhotoConfirmSheet';
import { fetchKavachSheet, useKavach } from '@/hooks/api/useKavach';
import { useLang, useT } from '@/lib/i18n';
import { imageAccept } from '@/lib/imageAccept';
import { tnIn } from '@/lib/messages/_plural';
import { fetchPdfBytes } from '@/lib/pdf';
import { markFirstScreen } from '@/lib/perfReport';
import { useAuthStore } from '@/store/auth';
import type { KavachDealerItem } from '@dk/shared/types';

/** The guide video behind "How this works". The chip hides itself when the video is not in the list. */
const KAVACH_VIDEO = 'kavach_photos';

/** The two views of the checklist, and which one is showing. */
type Tab = 'todo' | 'done';

/**
 * The Kavach door (ADR 0057 §5, spec 4.4): how ready the pump is for an inspection, what costs marks,
 * and what can be finished today.
 *
 * Top to bottom: the score card (ring, points, three counts); "Needs you" (only if a photo was sent back or a
 * job is late, each with MDG's reason and one button); today's jobs ("5 of 9 daily jobs done" and the next
 * deadline); then a switch, To do | Done. To do holds Do today, This week (five, then "N more"), With MDG,
 * what MDG checks from your reports, the other member's jobs (folded), Coming up and When it happens.
 *
 * It reads the one `GET /v1/kavach/me` the door's badge and the Today tile read too. A photo goes out
 * through the camera, the "Send this photo?" sheet and the Kavach upload; the row moves to With MDG at
 * once, and a photo already With MDG can be replaced. The dealer never marks a point done: MDG's check,
 * or our own data, does. The percent is the server's: nothing here recomputes it.
 *
 * Where Kavach is not started for the pump the door is not shown, and this address says so calmly.
 */
export function KavachPage() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const q = useKavach();
  const role = useAuthStore((st) => st.user?.role);
  const isOwner = role === 'dealer-owner';
  const eventSends = useKavachEventSends();
  const actions = useKavachActions(lang, { onEventSent: eventSends.remember });
  const view = q.data;

  const online = React.useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
    () => true,
  );

  // The clock the countdowns and "due today" are read from; it moves every minute.
  const [at, setAt] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setAt(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const settled = !q.isPending || q.isError || q.fetchStatus === 'idle';
  React.useEffect(() => {
    if (settled) markFirstScreen();
  }, [settled]);

  const events = eventSends.items;
  const sections = React.useMemo(
    () => (view ? sectionsOf(view, actions.sentKeys, at, { role, events }) : null),
    [view, actions.sentKeys, at, role, events],
  );
  // The counts under the ring are read from these same sections: one list, one set of numbers.
  const counts = React.useMemo(() => (sections ? countsOfSections(sections) : null), [sections]);
  const daily = React.useMemo(
    () => (view ? dailyJobsOf(view, actions.sentKeys, at, role) : null),
    [view, actions.sentKeys, at, role],
  );

  // One camera input and one picker for the whole page: the row that asked is remembered.
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const chooseRef = React.useRef<HTMLInputElement>(null);
  const target = React.useRef<KavachDealerItem | null>(null);
  const openCamera = React.useCallback((item: KavachDealerItem) => {
    target.current = item;
    cameraRef.current?.click();
  }, []);
  const openChoose = React.useCallback((item: KavachDealerItem) => {
    target.current = item;
    chooseRef.current?.click();
  }, []);
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const row = target.current;
    if (file && row) actions.pick(row, file);
  };
  const { retry } = actions;
  const onRetry = React.useCallback(
    (item: KavachDealerItem) => {
      if (!retry(item)) openCamera(item);
    },
    [retry, openCamera],
  );

  const [tab, setTab] = React.useState<Tab>('todo');
  const [weekAll, setWeekAll] = React.useState(false);
  const [upcomingAll, setUpcomingAll] = React.useState(false);
  const [dataAll, setDataAll] = React.useState(false);
  const [othersOpen, setOthersOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<{ item: KavachDealerItem; section: RowSection } | null>(null);
  // The sheet shows the row as it stands now (MDG may approve or send it back while it is open).
  const live = React.useMemo(() => {
    if (!detail || !sections) return detail;
    for (const sec of ['needs', 'now', 'week', 'others', 'data', 'waiting', 'done', 'upcoming', 'events'] as const) {
      const hit = sections[sec].find((i) => rowKey(i) === rowKey(detail.item));
      if (hit) return { item: hit, section: sec };
    }
    return detail;
  }, [detail, sections]);
  const [sheet, setSheet] = React.useState<KavachDealerItem | null>(null);

  // A count under the ring takes the reader to the list it counts. "Do today" is on the To do switch, so
  // that opens first; the move waits for the page to draw it.
  const jump = React.useCallback((to: JumpTarget) => {
    setTab('todo');
    const id = to === 'needs' ? 'kavach-needs' : 'kavach-now';
    window.requestAnimationFrame(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView?.({ block: 'start' });
      el?.focus?.({ preventScroll: true });
    });
  }, []);

  const row = (item: KavachDealerItem, section: RowSection) => (
    <KavachRow
      key={rowKey(item) + section}
      item={item}
      section={section}
      role={role}
      worth={view ? worthOf(item, view) : null}
      send={actions.entries[rowKey(item)]}
      onCamera={openCamera}
      onChoose={openChoose}
      onSheet={setSheet}
      onRetry={onRetry}
      onOpen={(it) => setDetail({ item: it, section })}
    />
  );

  let body: React.ReactNode;
  const parked = q.isPending && q.fetchStatus === 'paused';
  if ((q.isError || parked) && !view) {
    body = <ErrorCard text={t('kv.error')} onRetry={() => void q.refetch()} />;
  } else if (!view || !sections || !counts) {
    body = (
      <div data-testid="kavach-skeleton">
        <span className="sr-only">{t('kv.loading')}</span>
        <SkeletonBlock lines={6} />
      </div>
    );
  } else if (!view.on) {
    body = (
      <EmptyCalm
        text={t('kv.off')}
        action={{ label: t('kv.off.back'), onPress: () => navigate('/', { replace: true }) }}
      />
    );
  } else {
    const { needs, now, week, others, data, waiting, done, upcoming, events: eventRows } = sections;
    const weekShown = weekAll ? week : week.slice(0, WEEK_LIMIT);
    const dataShown = dataAll ? data : data.slice(0, DATA_LIMIT);
    const upcomingShown = upcomingAll ? upcoming : upcoming.slice(0, UPCOMING_LIMIT);
    const nextAt = nextJobAt(sections);
    const clear = needs.length === 0 && now.length === 0;
    // The server counts something sent back or late that no list shows: say so, never draw a tick over it.
    const outOfStep = clear && countsOutOfStep(view, sections, actions.sentKeys);
    const todoCount = needs.length + now.length + week.length;
    const next = daily?.next ?? null;

    body = (
      <>
        <HelpChip videoId={KAVACH_VIDEO} className="self-start" />

        <KavachSummary view={view} sections={sections} counts={counts} onJump={jump} />

        {needs.length > 0 ? (
          <div id="kavach-needs" tabIndex={-1} className="scroll-mt-4 outline-none" data-testid="kavach-needs">
            <SectionCard variant="tinted" title={t('kv.needs.title')} count={needs.length}>
              <List>{needs.map((i) => row(i, 'needs'))}</List>
            </SectionCard>
          </div>
        ) : null}

        {daily ? (
          <SectionCard title={t('kv.jobs.title')}>
            <div className="flex flex-col gap-2">
              <ProgressBar
                value={daily.done}
                max={daily.total}
                text={tnIn(lang, 'kv.jobs.progress', daily.total, { done: daily.done, total: daily.total })}
              />
              {daily.withMdg > 0 ? (
                <p className="text-meta text-text-muted">{t('kv.jobs.withMdg', { n: daily.withMdg })}</p>
              ) : null}
              {next?.dueAt ? (
                <p className="break-words text-body text-text" data-testid="kavach-next">
                  {t('kv.jobs.next', {
                    title: titleOf(next, lang),
                    time: clockWords(next.dueAt, lang),
                    left: leftWords(next.dueAt, at, lang),
                  })}
                </p>
              ) : null}
            </div>
          </SectionCard>
        ) : null}

        <PillGroup<Tab>
          label={t('kv.switch.label')}
          value={tab}
          onChange={setTab}
          options={[
            { id: 'todo', label: t('kv.switch.todo'), count: todoCount },
            { id: 'done', label: t('kv.switch.done'), count: done.length },
          ]}
        />

        {tab === 'todo' ? (
          <>
            {now.length > 0 ? (
              <div id="kavach-now" tabIndex={-1} className="scroll-mt-4 outline-none">
                <SectionCard title={t('kv.sec.now')} count={now.length}>
                  <List>{now.map((i) => row(i, 'now'))}</List>
                </SectionCard>
              </div>
            ) : outOfStep ? (
              <SectionCard title={t('kv.sec.now')}>
                <div data-testid="kavach-counting">
                  <EmptyCalm
                    className="py-2"
                    text={t('kv.stale')}
                    action={{ label: t('kv.stale.retry'), onPress: () => void q.refetch() }}
                  />
                </div>
              </SectionCard>
            ) : clear ? (
              <SectionCard title={t('kv.sec.now')}>
                <div data-testid="kavach-all-done">
                  <EmptyCalm
                    className="py-2"
                    status="ok"
                    text={
                      waiting.length > 0
                        ? t('kv.waiting.clear')
                        : nextAt
                          ? t('kv.allDone.next', { date: dayWords(nextAt, lang, at) })
                          : t('kv.allDone')
                    }
                  />
                </div>
              </SectionCard>
            ) : null}

            {week.length > 0 ? (
              <SectionCard title={t('kv.sec.week')} count={week.length}>
                <List>{weekShown.map((i) => row(i, 'week'))}</List>
                {week.length > WEEK_LIMIT ? (
                  <MoreButton
                    hiddenCount={week.length - WEEK_LIMIT}
                    expanded={weekAll}
                    about={t('kv.sec.week')}
                    onToggle={() => setWeekAll((v) => !v)}
                  />
                ) : null}
              </SectionCard>
            ) : null}

            {waiting.length > 0 ? (
              <SectionCard title={t('kv.sec.waiting')} count={waiting.length}>
                <List>{waiting.map((i) => row(i, 'waiting'))}</List>
              </SectionCard>
            ) : null}

            {data.length > 0 ? (
              <SectionCard title={t('kv.sec.data')} count={data.length}>
                <List>{dataShown.map((i) => row(i, 'data'))}</List>
                {data.length > DATA_LIMIT ? (
                  <MoreButton
                    hiddenCount={data.length - DATA_LIMIT}
                    expanded={dataAll}
                    about={t('kv.sec.data')}
                    onToggle={() => setDataAll((v) => !v)}
                  />
                ) : null}
              </SectionCard>
            ) : null}

            {others.length > 0 ? (
              <SectionCard title={t(isOwner ? 'kv.sec.managerJobs' : 'kv.sec.ownerJobs')} count={others.length}>
                <Button
                  variant="secondary"
                  fullWidth
                  aria-expanded={othersOpen}
                  aria-controls="kavach-others-list"
                  onClick={() => setOthersOpen((v) => !v)}
                  data-testid="kavach-others-toggle"
                >
                  {t(othersOpen ? 'kv.fold.close' : 'kv.fold.open', {
                    title: t(isOwner ? 'kv.sec.managerJobs' : 'kv.sec.ownerJobs'),
                  })}
                </Button>
                {othersOpen ? (
                  <div id="kavach-others-list">
                    <List>{others.map((i) => row(i, 'others'))}</List>
                  </div>
                ) : null}
              </SectionCard>
            ) : null}

            {upcoming.length > 0 ? (
              <SectionCard title={t('kv.sec.upcoming')} count={upcoming.length}>
                <List>{upcomingShown.map((i) => row(i, 'upcoming'))}</List>
                {upcoming.length > UPCOMING_LIMIT ? (
                  <MoreButton
                    hiddenCount={upcoming.length - UPCOMING_LIMIT}
                    expanded={upcomingAll}
                    about={t('kv.sec.upcoming')}
                    onToggle={() => setUpcomingAll((v) => !v)}
                  />
                ) : null}
              </SectionCard>
            ) : null}

            {eventRows.length > 0 ? (
              <SectionCard title={t('kv.sec.events')} count={eventRows.length}>
                {/* Said once here, not under every row. */}
                <p className="break-words text-body text-text-muted">{t('kv.line.event')}</p>
                <List>{eventRows.map((i) => row(i, 'events'))}</List>
              </SectionCard>
            ) : null}
          </>
        ) : done.length > 0 ? (
          <SectionCard title={t('kv.sec.done')} count={done.length}>
            <List>{done.map((i) => row(i, 'done'))}</List>
          </SectionCard>
        ) : (
          <EmptyCalm text={t('kv.done.none')} />
        )}
      </>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-bg" data-testid="kavach-page">
      <PageHeader
        variant="tab"
        title={t('kv.title')}
        subtitle={view?.on && view.summary ? <AsOf at={view.summary.computedAt} /> : undefined}
      />

      {(!online || q.isError) && view ? (
        <p
          role="status"
          data-testid="kavach-offline"
          className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-status-info-soft px-3 py-2.5 text-body font-medium text-status-info-ink"
        >
          <WifiOff aria-hidden className="h-5 w-5 shrink-0" strokeWidth={2} />
          {t('kv.offline')}
        </p>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 px-4 pb-10 pt-4">{body}</div>

      {/* The pickers: the camera goes straight to the back lens; the other takes a photo or, where the point allows, a PDF. */}
      <input
        ref={cameraRef}
        type="file"
        accept={imageAccept()}
        capture="environment"
        className="hidden"
        data-testid="kavach-camera-input"
        onChange={onFile}
      />
      <input
        ref={chooseRef}
        type="file"
        accept={imageAccept(true)}
        className="hidden"
        data-testid="kavach-choose-input"
        onChange={onFile}
      />

      {actions.pending ? (
        <PhotoConfirmSheet
          pending={actions.pending}
          onSend={actions.confirmPending}
          onReplace={actions.replacePending}
          onClose={actions.cancelPending}
        />
      ) : null}

      {detail && live ? (
        <KavachDetailSheet
          item={live.item}
          section={live.section}
          role={role}
          send={actions.entries[rowKey(live.item)]}
          onClose={() => setDetail(null)}
          onCamera={openCamera}
          onChoose={openChoose}
          onSheet={setSheet}
          onRetry={onRetry}
        />
      ) : null}

      {/* Our own sheet, read inside the app: the file never leaves it. */}
      {sheet?.checkId ? (
        <PdfViewer
          title={titleOf(sheet, lang)}
          load={() => fetchKavachSheet(sheet.checkId as string).then((r) => fetchPdfBytes(r.url))}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}

/** A list of rows inside a card, ruled with hairlines. */
function List({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-border">{children}</ul>;
}

/** "Show 3 more" / "Show fewer": a list that is capped, opened and closed by a 44 px button. */
function MoreButton({
  hiddenCount,
  expanded,
  about,
  onToggle,
}: {
  hiddenCount: number;
  expanded: boolean;
  about: string;
  onToggle: () => void;
}) {
  const t = useT();
  const word = expanded ? t('kv.fewer') : t('kv.more', { n: hiddenCount });
  return (
    <Button
      variant="secondary"
      fullWidth
      aria-expanded={expanded}
      aria-label={`${about}: ${word}`}
      onClick={onToggle}
      className="mt-2"
    >
      {word}
    </Button>
  );
}
