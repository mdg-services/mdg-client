import { onlineManager } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, WifiOff } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  AsOf,
  DayStrip,
  EmptyCalm,
  ErrorCard,
  InsightRow,
  PageHeader,
  PillGroup,
  SectionCard,
  SkeletonBlock,
  StatusPill,
  useLastVisit,
} from '@/components/kit';
import { Button } from '@/components/ui';
import { countsOf } from '@/features/glance/glanceModel';
import { ALL_GROUP_NAME, chipGroups, kindsOfGroup, type KindGroup } from '@/features/reports/kindStyle';
import { ReportHistoryRow } from '@/features/reports/ReportHistoryRow';
import { useOpenReport } from '@/features/reports/reportNav';
import {
  groupHistory,
  kindsNeedingLook,
  monthCard,
  readableReports,
  type HistoryRow,
  type MonthCard,
} from '@/features/reports/reportsHistoryView';
import { sayWords } from '@/features/reports/types';
import { historyItems, useReportHistory, useReportSummary } from '@/features/reports/useReportHistory';
import { isServiceVisible, kindsOfService } from '@/features/services/serviceMap';
import { REPORTS_AS_TAB } from '@/features/tabs/tabConfig';
import { useTodayFeed } from '@/hooks/api/useTodayFeed';
import { cn } from '@/lib/cn';
import { fmtDay } from '@/lib/fmt';
import { pick, useLang, useT } from '@/lib/i18n';
import { useTn } from '@/lib/messages/_plural';
import { markFirstScreen } from '@/lib/perfReport';
import { useLargeText } from '@/lib/useLargeText';
import { useAuthStore } from '@/store/auth';
import type { Lang } from '@/store/lang';
import { serviceLabel } from '@dk/shared';
import type { ReportKind } from '@dk/shared/types';

/** What the chips can pick: the reports that need a look, everything, or one family. */
type Filter = 'needs' | 'all' | KindGroup;

/** How many days with no sales report the card names; the rest are counted. */
const MISSING_DAYS_SHOWN = 3;

/** The service a `?service=` address names, when it is one this reader may see and it makes reports. */
function serviceKinds(serviceId: string | null, isOwner: boolean): readonly ReportKind[] | undefined {
  if (!serviceId || !isServiceVisible(serviceId, isOwner)) return undefined;
  const kinds = kindsOfService(serviceId);
  return kinds.length > 0 ? kinds : undefined;
}

/**
 * The Reports pill of the Services door (spec 4.2): the 30-day picture first, then the record.
 *
 * Top to bottom: the header and the `Services | Reports` switch; the "Last 30 days" card (reports that
 * came, how many needed a look, the sales-report days, water checks, papers filed), drawn only once
 * `GET /v1/me/reports/summary` has answered, so an older server or a slow phone loses the card and
 * nothing else; the filter chips, Needs a look first; and the list, one card per BUSINESS day (the day a
 * report is about, not the day it was sent), newest day first. A report that a newer one of its day
 * replaced is folded under "N replaced reports". A tap opens the report in the same overlay as from
 * Today or the chat, drawn OVER this page, so Back lands on it with its chip and place kept.
 *
 * The list reads `GET /v1/me/reports` a page at a time: more comes in as the dealer nears the end, and a
 * "Show earlier" button does the same by hand, so it works with gloves, a screen reader, or a phone
 * that never reports the end of the page. `?filter=needs` opens on Needs a look and `?service=<id>` on
 * one service's reports.
 */
export function ReportsPage() {
  const t = useT();
  const tn = useTn();
  const lang = useLang();
  const navigate = useNavigate();
  const openReport = useOpenReport();
  const [params] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === 'dealer-owner';

  const [filter, setFilter] = React.useState<Filter>(params.get('filter') === 'needs' ? 'needs' : 'all');
  const [serviceId, setServiceId] = React.useState<string | null>(params.get('service'));
  // The page can stay mounted while the address changes (a link into it from the page itself).
  const filterParam = params.get('filter');
  const serviceParam = params.get('service');
  const firstParams = React.useRef(true);
  React.useEffect(() => {
    if (firstParams.current) {
      firstParams.current = false;
      return;
    }
    setFilter(filterParam === 'needs' ? 'needs' : 'all');
    setServiceId(serviceParam);
  }, [filterParam, serviceParam]);

  // ── the 30-day picture and the number on the pill ──
  const summary = useReportSummary();
  const feed = useTodayFeed();
  const look = countsOf({ feed: feed.data, role: isOwner ? 'owner' : 'manager', now: new Date() }).look;

  // ── what to ask the list for ──
  const needsFilter = filter === 'needs';
  const fromService = serviceKinds(serviceId, isOwner);
  const groupKinds = filter !== 'needs' && filter !== 'all' ? kindsOfGroup(filter) : undefined;
  // "Needs a look" asks only for the kinds the summary says have something, so a quiet month costs
  // one page of the right kinds and not every page of every kind. With no summary it asks for all.
  const summarySettled = !summary.isPending || summary.fetchStatus !== 'fetching';
  const needKinds = needsFilter ? kindsNeedingLook(summary.data) : undefined;
  const kinds = React.useMemo<readonly ReportKind[] | undefined>(() => {
    const base = needsFilter ? needKinds : groupKinds;
    if (fromService && base) return base.filter((k) => fromService.includes(k));
    return fromService ?? base;
  }, [needsFilter, needKinds, groupKinds, fromService]);
  const nothingNeedsLook = needsFilter && !!summary.data && (kinds?.length ?? 1) === 0;
  const waitingForSummary = needsFilter && !summarySettled;
  const q = useReportHistory(kinds, { enabled: !nothingNeedsLook && !waitingForSummary });
  const online = React.useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
    () => true,
  );

  // "New" is relative to the last time this page was left, kept in this phone's storage.
  const { since, markSeen } = useLastVisit(user?.id, user?.dealerId ? `reports.${user.dealerId}` : null);
  React.useEffect(() => markSeen, [markSeen]);

  const items = React.useMemo(() => readableReports(historyItems(q.data?.pages), isOwner), [q.data, isOwner]);
  const groups = React.useMemo(
    () => groupHistory(items, new Date(), lang, t, { since, needsOnly: needsFilter }),
    [items, lang, t, since, needsFilter],
  );
  const shown = groups.reduce((n, g) => n + g.rows.length, 0);
  const card = React.useMemo(() => (summary.data ? monthCard(summary.data) : null), [summary.data]);
  // The same "as of" line the Services pill carries (the newest report in hand), so switching pills
  // does not move the page: without it this header was a line shorter.
  const asOf = React.useMemo(() => {
    let newest: string | null = null;
    for (const r of [...(feed.data?.reports ?? []), ...items]) {
      if (!newest || r.sentAt > newest) newest = r.sentAt;
    }
    return newest;
  }, [feed.data, items]);

  const [unfolded, setUnfolded] = React.useState<ReadonlySet<string>>(new Set());
  const toggleFold = (day: string) =>
    setUnfolded((cur) => {
      const next = new Set(cur);
      if (!next.delete(day)) next.add(day);
      return next;
    });

  // "Opening the app" counts up to the first screen: a list, or the plain statement that it
  // could not be had (an admin signed in here never asks, and settles at once).
  const settled = !q.isPending || q.isError || q.fetchStatus === 'idle';
  React.useEffect(() => {
    if (settled) markFirstScreen();
  }, [settled]);

  const open = React.useCallback(
    (row: HistoryRow) =>
      openReport({ conversationId: row.report.conversationId, messageId: row.report.messageId, report: row.report }),
    [openReport],
  );

  // More as the dealer nears the end of what is loaded.
  const sentinel = React.useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  React.useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, shown]);

  // A page can come back with nothing to show and a marker (the server looked through a long run of
  // other messages and stopped, or a "Needs a look" page held only quiet reports): keep going until
  // something is found or the window is used up, never an empty screen over reports still there.
  const keepLooking = shown === 0 && !q.isError && (hasNextPage || isFetchingNextPage);
  React.useEffect(() => {
    if (keepLooking && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [keepLooking, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const chips: ReadonlyArray<{ id: Filter; label: string }> = [
    { id: 'needs', label: t('rep.filter.needs') },
    { id: 'all', label: sayWords(ALL_GROUP_NAME, lang) },
    ...chipGroups(isOwner).map((g) => ({ id: g.group as Filter, label: sayWords(g.names, lang) })),
  ];
  const groupName = chips.find((c) => c.id === filter)?.label ?? '';
  const serviceName = serviceId ? pick(lang, serviceLabel(serviceId).en, serviceLabel(serviceId).hi) : '';

  const parked = q.isPending && q.fetchStatus === 'paused';
  let body: React.ReactNode;
  if (nothingNeedsLook) {
    body = (
      <EmptyCalm
        status="ok"
        text={t('rep.empty.needs')}
        action={{ label: t('kit.seeAll'), onPress: () => setFilter('all') }}
      />
    );
  } else if ((q.isError || parked) && items.length === 0) {
    body = <ErrorCard text={t('rep.error')} onRetry={() => void q.refetch()} />;
  } else if (waitingForSummary || (q.isPending && q.fetchStatus !== 'idle') || keepLooking) {
    body = (
      <div data-testid="reports-skeleton" className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <SkeletonBlock lines={6} />
      </div>
    );
  } else if (shown === 0) {
    // "Needs a look" can come back empty although the card counted something: the card counts every
    // tagged post, the list drops replaced copies and kinds whose own reading is calm. Say so calmly.
    body =
      filter === 'needs' ? (
        <EmptyCalm
          status="ok"
          text={t('rep.empty.needs')}
          action={{ label: t('kit.seeAll'), onPress: () => setFilter('all') }}
        />
      ) : (
        <EmptyCalm
          text={filter === 'all' ? t('rep.empty.all') : t('rep.empty.group', { group: groupName })}
          action={filter === 'all' ? undefined : { label: t('kit.seeAll'), onPress: () => setFilter('all') }}
        />
      );
  } else {
    body = (
      <>
        {q.isError ? <ErrorCard text={t('rep.error.stale')} onRetry={() => void q.refetch()} /> : null}
        {groups.map((g) => {
          const current = g.rows.filter((r) => !r.replaced);
          const replaced = g.rows.filter((r) => r.replaced);
          const unfold = unfolded.has(g.day);
          const headingId = `reports-day-${g.day}`;
          return (
            <section key={g.day} aria-labelledby={headingId} data-testid="reports-day" data-day={g.day}>
              <h2 id={headingId} className="px-1 pb-1.5 text-subheading text-text">
                {g.heading}
              </h2>
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface shadow-sm [&>li:first-child>button]:rounded-t-xl [&>li:last-child>button]:rounded-b-xl">
                {current.map((row) => (
                  <ReportHistoryRow key={row.report.messageId} row={row} onOpen={open} />
                ))}
                {unfold
                  ? replaced.map((row) => <ReportHistoryRow key={row.report.messageId} row={row} onOpen={open} />)
                  : null}
                {replaced.length > 0 ? (
                  <li className="min-w-0">
                    <button
                      type="button"
                      aria-expanded={unfold}
                      data-testid="reports-replaced-toggle"
                      onClick={() => toggleFold(g.day)}
                      className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-cta text-text-muted active:bg-surface-2"
                    >
                      {unfold ? (
                        <ChevronUp aria-hidden="true" className="h-5 w-5 shrink-0" />
                      ) : (
                        <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0" />
                      )}
                      <span className="min-w-0 break-words">
                        {unfold ? t('rep.replaced.hide') : tn('rep.replaced.show', replaced.length)}
                      </span>
                    </button>
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
        <div ref={sentinel} aria-hidden="true" className="h-px" />
        {q.hasNextPage ? (
          <div className="flex justify-center py-2">
            <Button
              size="lg"
              variant="secondary"
              loading={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
              data-testid="reports-show-earlier"
            >
              {t('rep.showEarlier')}
            </Button>
          </div>
        ) : (
          <div data-testid="reports-end" className="flex flex-col items-center gap-3 px-2 py-4 text-center">
            <p className="text-body text-text-muted">{t('rep.end')}</p>
            <Button size="lg" variant="secondary" onClick={() => navigate('/chat', { replace: true })}>
              {t('rep.openChat')}
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col" data-testid="reports-page">
      <PageHeader
        variant="tab"
        title={REPORTS_AS_TAB ? t('shell.tab.reports') : t('shell.tab.services')}
        {...(asOf ? { subtitle: <AsOf at={asOf} /> } : {})}
      />

      <div className="flex flex-col gap-3 px-4 py-3">
        {REPORTS_AS_TAB ? null : (
          <PillGroup
            label={t('svc.pill.label')}
            value="reports"
            options={[
              { id: 'services', label: t('svc.pill.services') },
              { id: 'reports', label: t('svc.pill.reports'), ...(look > 0 ? { count: look } : {}) },
            ]}
            onChange={(v) => {
              if (v === 'services') navigate('/services', { replace: true });
            }}
          />
        )}

        {card ? (
          <MonthCardView card={card} lang={lang} onShowLook={() => setFilter('needs')} />
        ) : null}

        <div role="group" aria-label={t('rep.filter.label')} className="flex flex-wrap gap-2">
          {chips.map(({ id, label }) => {
            const on = id === filter;
            // The count on "Needs a look" is the card's own number, so the chip and the button agree.
            const count = id === 'needs' && card && card.needLook > 0 ? card.needLook : undefined;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                {...(count !== undefined ? { 'aria-label': t('kit.pill.withCount', { label, n: count }) } : {})}
                data-testid={`reports-chip-${id}`}
                onClick={() => setFilter(id)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-1 text-cta',
                  on
                    ? 'border-transparent bg-brand text-text-inverse'
                    : 'border-border bg-surface text-text shadow-sm active:bg-surface-2',
                )}
              >
                {on ? <Check aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2.5} /> : null}
                <span className="min-w-0 break-words text-left">{label}</span>
                {count !== undefined ? (
                  <span data-testid="reports-chip-count" className="shrink-0 text-meta font-semibold tabular-nums">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {fromService ? (
          <div
            data-testid="reports-service-filter"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"
          >
            <span className="min-w-0 break-words text-body text-text">{t('rep.filter.service', { service: serviceName })}</span>
            <Button size="sm" variant="secondary" onClick={() => setServiceId(null)}>
              {t('rep.filter.serviceClear')}
            </Button>
          </div>
        ) : null}

        {(!online || q.isError) && items.length > 0 ? (
          <p
            role="status"
            data-testid="reports-offline"
            className="flex items-start gap-2 rounded-lg bg-status-info-soft px-3 py-2.5 text-body font-medium text-status-info-ink"
          >
            <WifiOff aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} />
            {t('rep.offline')}
          </p>
        ) : null}

        {body}
      </div>
    </div>
  );
}

/**
 * "Last 30 days": what came, what needed a look, and the sales-report days as a strip of dots with the
 * gaps said as facts ("No sales report for Tue 18 Nov"), never "you missed": a gap can be MDG's or the
 * portal's. Every line is a sentence with a shape beside it where it carries a state.
 */
function MonthCardView({ card, lang, onShowLook }: { card: MonthCard; lang: Lang; onShowLook: () => void }) {
  const t = useT();
  const tn = useTn();
  const large = useLargeText();
  const missing = card.missingSalesDays.slice(0, MISSING_DAYS_SHOWN);
  const more = card.missingSalesDays.length - missing.length;
  const first = card.salesStrip?.[0]?.day;
  const last = card.salesStrip?.[card.salesStrip.length - 1]?.day;
  return (
    <div data-testid="reports-month">
      <SectionCard title={t('rep.month.title')} variant="list">
        <InsightRow text={tn('rep.month.came', card.came)} />
        {card.needLook > 0 ? (
          // Its own row (not InsightRow): the word beside the shape never wraps, and at large text the
          // button goes under the sentence at the full width and names what it shows.
          <div data-testid="reports-month-look" className={cn('flex gap-3 py-2', large ? 'flex-col' : 'items-center')}>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <StatusPill status="attention" className="w-fit max-w-full whitespace-nowrap" />
              <span className="min-w-0 break-words text-body text-text">{tn('rep.month.look', card.needLook)}</span>
            </div>
            <Button
              size={large ? 'tap' : 'md'}
              variant="secondary"
              onClick={onShowLook}
              className={large ? 'w-full' : 'shrink-0'}
            >
              {tn('rep.month.showLook', card.needLook)}
            </Button>
          </div>
        ) : (
          <InsightRow status="ok" text={t('rep.month.look.none')} />
        )}
        {card.salesStrip ? (
          <div data-testid="reports-sales-strip" className="flex flex-col gap-1 py-2">
            <p className="text-meta text-text-muted">
              {t('rep.month.salesStrip', {
                from: first ? fmtDay(first, lang) : '',
                to: last ? fmtDay(last, lang) : '',
              })}
            </p>
            <DayStrip days={card.salesStrip} subject={t('rep.month.salesSubject')} />
          </div>
        ) : null}
        {card.salesStrip && missing.length === 0 ? (
          <InsightRow status="ok" text={t('rep.month.salesEvery')} />
        ) : null}
        {missing.map((day) => (
          <InsightRow key={day} status="info" text={t('rep.month.noSales', { day: fmtDay(day, lang) })} />
        ))}
        {more > 0 ? <InsightRow text={tn('rep.month.noSalesMore', more)} /> : null}
        {card.waterDays > 0 ? <InsightRow text={tn('rep.month.water', card.waterDays)} /> : null}
        {card.filings > 0 ? <InsightRow text={tn('rep.month.filings', card.filings)} /> : null}
      </SectionCard>
    </div>
  );
}
