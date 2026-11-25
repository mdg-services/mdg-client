import { onlineManager } from '@tanstack/react-query';
import { Check, FileText, RefreshCw, WifiOff } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { AppBar, type AppBarMenuItem } from '@/components/AppBar';
import { Button, EmptyState } from '@/components/ui';
import { OutletChip } from '@/features/outlets/OutletChip';
import { OutletSheet } from '@/features/outlets/OutletSheet';
import { ALL_GROUP_NAME, KIND_GROUPS, KIND_STYLE, kindsOfGroup, type KindGroup } from '@/features/reports/kindStyle';
import { ReportHistoryRow } from '@/features/reports/ReportHistoryRow';
import { useOpenReport } from '@/features/reports/reportNav';
import { groupHistory, type HistoryRow } from '@/features/reports/reportsHistoryView';
import { sayWords } from '@/features/reports/types';
import { historyItems, useReportHistory } from '@/features/reports/useReportHistory';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import { markFirstScreen } from '@/lib/perfReport';

/**
 * The Reports tab (ADR 0056 §4): every report of the last 30 days, newest first, grouped by the
 * day it was sent, with a chip for each family. A tap opens the report in the same overlay as
 * from Today or the chat, drawn OVER this list, so Back lands on it with its chip and place kept.
 *
 * The list reads `GET /v1/me/reports` a page at a time. More comes in as the dealer nears the
 * end, and a "Show earlier" button does the same by hand, so it works with gloves, a screen
 * reader, or a phone that never reports the end of the page. The page has no actions of its own:
 * its one job is to open a report.
 */
export function ReportsPage() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const openReport = useOpenReport();
  const [group, setGroup] = React.useState<KindGroup | 'all'>('all');
  const kinds = React.useMemo(() => (group === 'all' ? undefined : kindsOfGroup(group)), [group]);
  const q = useReportHistory(kinds);
  const online = React.useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
    () => true,
  );

  const rows = React.useMemo(() => historyItems(q.data?.pages), [q.data]);
  const groups = React.useMemo(() => groupHistory(rows, new Date(), lang, t), [rows, lang, t]);

  const [outletsOpen, setOutletsOpen] = React.useState(false);
  const closeOutlets = React.useCallback(() => setOutletsOpen(false), []);
  const menu = React.useMemo<AppBarMenuItem[]>(
    () => [{ key: 'settings', label: t('chatlist.settings'), onSelect: () => navigate('/settings') }],
    [t, navigate],
  );

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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rows.length]);

  // A page can come back with no report in it and a marker (the server looked through a long run of
  // other messages and stopped): keep going until a report is found or the window is used up, never
  // an empty screen over reports that are still there.
  const keepLooking = rows.length === 0 && !q.isError && (hasNextPage || isFetchingNextPage);
  React.useEffect(() => {
    if (keepLooking && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [keepLooking, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const chips: ReadonlyArray<{ id: KindGroup | 'all'; label: string; Icon: React.ElementType }> = [
    { id: 'all', label: sayWords(ALL_GROUP_NAME, lang), Icon: FileText },
    ...KIND_GROUPS.map((g) => ({
      id: g.group,
      label: sayWords(g.names, lang),
      // The group's own icon is its first kind's.
      Icon: KIND_STYLE[g.kinds[0]!].Icon as React.ElementType,
    })),
  ];
  const groupName = group === 'all' ? '' : sayWords(KIND_GROUPS.find((g) => g.group === group)!.names, lang);

  let body: React.ReactNode;
  // A first load parked by a missing network is as failed as one that errored: say so, with Retry.
  const parked = q.isPending && q.fetchStatus === 'paused';
  if ((q.isError || parked) && rows.length === 0) {
    body = (
      <EmptyState
        icon={<FileText width={28} strokeWidth={1.5} />}
        title={t('reports.error.title')}
        description={t('reports.error.desc')}
        cta={
          <Button
            size="lg"
            onClick={() => void q.refetch()}
            loading={q.isFetching}
            leftIcon={<RefreshCw width={16} strokeWidth={1.75} />}
          >
            {t('report.retry')}
          </Button>
        }
      />
    );
  } else if ((q.isPending && q.fetchStatus !== 'idle') || keepLooking) {
    body = (
      <ul role="status" aria-busy="true" data-testid="reports-skeleton" className="flex flex-col">
        <li className="sr-only">{t('report.loading')}</li>
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="flex h-[72px] items-center gap-3 border-b border-border px-4">
            <span className="h-11 w-11 shrink-0 animate-pulse rounded-[10px] bg-surface-2" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="h-4 w-1/2 animate-pulse rounded bg-surface-2" />
              <span className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
            </span>
          </li>
        ))}
      </ul>
    );
  } else if (rows.length === 0) {
    body =
      group === 'all' ? (
        <EmptyState
          icon={<FileText width={28} strokeWidth={1.5} />}
          title={t('reports.empty.title')}
          description={t('reports.empty.desc')}
          cta={
            <span aria-hidden="true" className="flex gap-3 text-text-muted">
              {KIND_GROUPS.map((g) => {
                const Icon = KIND_STYLE[g.kinds[0]!].Icon;
                return <Icon key={g.group} width={22} strokeWidth={1.75} />;
              })}
            </span>
          }
        />
      ) : (
        <EmptyState
          icon={<FileText width={28} strokeWidth={1.5} />}
          title={t('reports.emptyFiltered', { group: groupName })}
          cta={<Button size="lg" onClick={() => setGroup('all')}>{t('reports.seeAll')}</Button>}
        />
      );
  } else {
    body = (
      <>
        {groups.map((g) => (
          <section key={g.day} aria-label={g.heading}>
            <h2 className="bg-bg px-4 pb-1.5 pt-5 text-meta font-semibold leading-normal text-text-muted">
              {g.heading}
            </h2>
            <ul>
              {g.rows.map((row) => (
                <ReportHistoryRow key={row.report.messageId} row={row} onOpen={open} />
              ))}
            </ul>
          </section>
        ))}
        <div ref={sentinel} aria-hidden="true" className="h-px" />
        {q.hasNextPage ? (
          <div className="flex justify-center px-4 py-4">
            <Button
              size="lg"
              variant="secondary"
              loading={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
              data-testid="reports-show-earlier"
            >
              {t('reports.showEarlier')}
            </Button>
          </div>
        ) : (
          <div data-testid="reports-end" className="flex flex-col items-center gap-3 px-6 py-6 text-center">
            <p className="text-body leading-relaxed text-text-muted">{t('reports.end')}</p>
            <Button size="lg" variant="secondary" onClick={() => navigate('/chat', { replace: true })}>
              {t('reports.openChat')}
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col" data-testid="reports-page">
      <AppBar
        variant="home"
        title={t('tabs.reports')}
        actions={<OutletChip onOpen={() => setOutletsOpen(true)} />}
        menu={menu}
      />
      {outletsOpen ? <OutletSheet onClose={closeOutlets} /> : null}

      <div
        role="group"
        aria-label={t('reports.filterLabel')}
        className="flex gap-2 overflow-x-auto px-4 py-3"
      >
        {chips.map(({ id, label, Icon }) => {
          const on = id === group;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              data-testid={`reports-chip-${id}`}
              onClick={() => setGroup(id)}
              className={cn(
                'inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full border px-4 text-cta',
                on
                  ? 'border-transparent bg-brand text-text-inverse'
                  : 'border-border-strong bg-surface text-text active:bg-surface-2',
              )}
            >
              {on ? <Check width={18} strokeWidth={2.5} aria-hidden /> : <Icon width={18} strokeWidth={2} aria-hidden />}
              {label}
            </button>
          );
        })}
      </div>

      {(!online || q.isError) && rows.length > 0 ? (
        <p
          role="status"
          data-testid="reports-offline"
          className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-status-info-soft px-3 py-2.5 text-body font-medium leading-normal text-status-info-ink"
        >
          <WifiOff width={20} strokeWidth={2} className="shrink-0" aria-hidden />
          {t('reports.offlineBanner')}
        </p>
      ) : null}

      <div className="flex-1">{body}</div>
    </div>
  );
}
