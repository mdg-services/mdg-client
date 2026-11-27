import { ChevronRight } from 'lucide-react';
import * as React from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { AskMdgButton } from '@/components/kit/AskMdgButton';
import { AsOf } from '@/components/kit/AsOf';
import { EmptyCalm } from '@/components/kit/EmptyCalm';
import { ErrorCard } from '@/components/kit/ErrorCard';
import { HelpChip } from '@/components/kit/HelpChip';
import { PageHeader } from '@/components/kit/PageHeader';
import { SectionCard } from '@/components/kit/SectionCard';
import { SkeletonBlock } from '@/components/kit/SkeletonBlock';
import { StatusPill } from '@/components/kit/StatusPill';
import { Button } from '@/components/ui/Button';
import { isPumpLive } from '@/features/glance/glanceModel';
import { useGuideVideos } from '@/features/help/useGuideVideos';
import { useOpenReport } from '@/features/reports/reportNav';
import { NeedsYouList } from '@/features/services/NeedsYouList';
import { panelFor, type PanelCtx } from '@/features/services/panels';
import { stamp } from '@/features/services/panels/parts';
import { runLine, runTimes } from '@/features/services/runTimes';
import { needFromYouKeys, serviceAboutOf, serviceNameOf } from '@/features/services/serviceCopy';
import { ServiceDayStrip } from '@/features/services/ServiceDayStrip';
import { historyItems, STRIP_SERVICES, stripDays } from '@/features/services/serviceHistoryModel';
import {
  hasServicePage,
  isOwnerOnlyService,
  kindsOfService,
  serviceSpec,
  videoFor,
} from '@/features/services/serviceMap';
import {
  feedReports,
  readable,
  tasksOfService,
  waitingDaysOf,
} from '@/features/services/servicesModel';
import { serviceState, serviceStateWord } from '@/features/services/serviceState';
import { useMeServices } from '@/features/services/useMeServices';
import {
  SERVICE_PAGE_SIZE,
  loadedReports,
  useServiceHistory,
} from '@/features/services/useServiceHistory';
import { useOutletSetup } from '@/features/setup/useOutletSetup';
import { useTodayFeed } from '@/hooks/api/useTodayFeed';
import { cn } from '@/lib/cn';
import { fmtDay } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';
import { useTn } from '@/lib/messages/_plural';
import { useLargeText } from '@/lib/useLargeText';
import { useAuthStore } from '@/store/auth';

/**
 * A service's page (`/services/:serviceId`, spec 4.3, 6.4): "What did this service do for me, what is
 * it saying now, what do I do?" One page for every service, built from the same parts so seventeen
 * services are not seventeen layouts: the name and its state, one sentence of what it does, when it
 * last ran, what needs the owner, the "Right now" panel of that service, its last 30 days, how it
 * works, and a button to ask MDG about it.
 *
 * Honest by construction: the state word comes from `serviceState` (no `/me/services` answer means no
 * word, never a guessed "Working"), a manager never reaches an owner-only service, and an id the app has
 * no name for is "We could not find that service" and never printed. The header is drawn on every
 * state, so a page that fails still has a title and a way out.
 */
export function ServicePage() {
  const params = useParams();
  const serviceId = params.serviceId ?? '';
  const t = useT();
  const tn = useTn();
  const lang = useLang();
  const navigate = useNavigate();
  const openReport = useOpenReport();
  const role = useAuthStore((s) => s.user?.role);
  const large = useLargeText();

  const feedQ = useTodayFeed();
  const meQ = useMeServices();
  const setupQ = useOutletSetup();
  const videosQ = useGuideVideos();

  const feed = feedQ.data ?? null;
  const isOwner = feed ? feed.role === 'owner' : role !== 'dealer-staff';
  const spec = serviceSpec(serviceId);
  const visible = !!spec && hasServicePage(serviceId, isOwner);
  const kinds = visible ? kindsOfService(serviceId) : [];
  const historyQ = useServiceHistory(serviceId, kinds);

  const now = React.useMemo(
    () => new Date(),
    [feedQ.dataUpdatedAt, meQ.dataUpdatedAt, historyQ.dataUpdatedAt],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const history = React.useMemo(() => loadedReports(historyQ.data?.pages), [historyQ.data]);
  const reports = React.useMemo(() => {
    const seen = new Set<string>();
    const out = [];
    for (const r of [...feedReports(feed), ...history]) {
      if (seen.has(r.messageId)) continue;
      seen.add(r.messageId);
      out.push(r);
    }
    return readable(out, isOwner);
  }, [feed, history, isOwner]);

  if (!visible || !spec) {
    // A manager who followed an owner's link to an owner-only service goes to the hub, as a redirect.
    if (spec && isOwnerOnlyService(serviceId) && !isOwner)
      return <Navigate to="/services" replace />;
    return (
      <>
        <PageHeader variant="sub" title={t('svc.page.header')} back={{ to: '/services' }} />
        <div className="flex flex-1 flex-col gap-3 bg-bg p-4">
          <EmptyCalm
            text={t('svc.page.notFound')}
            action={{
              label: t('svc.page.seeAll'),
              onPress: () => navigate('/services', { replace: true }),
            }}
          />
        </div>
      </>
    );
  }

  const name = serviceNameOf(serviceId, lang) || t('svc.page.header');
  const setup = setupQ.data;
  const live = !setup?.active || isPumpLive(setup.stage) !== false;
  const entry = meQ.data?.services.find((s) => s.serviceId === serviceId);
  const tasks = feed?.tasks ?? [];
  const state = serviceState({ serviceId, run: entry?.run, tasks, reports, live });
  const stateLine = state && entry ? runLine(runTimes(entry, lang, now)) : '';
  const needs = tasksOfService(tasks, serviceId).map((task) => ({
    task,
    waitingDays: waitingDaysOf(task.since, now),
  }));

  const ctx: PanelCtx = { serviceId, lang, now, isOwner, t, tn, reports, navigate };
  const panel = panelFor(serviceId, ctx);
  const feedSettled = !!feed || feedQ.isError || feedQ.fetchStatus === 'idle';
  const historySettled = historyQ.status !== 'pending' || historyQ.fetchStatus === 'idle';
  const waitingOnData =
    !panel && (!feedSettled || (kinds.length > 0 && !historySettled && reports.length === 0));

  const items = historyItems(history, { serviceId, isOwner, lang });
  const hasMore = !!historyQ.hasNextPage;
  const stripKey = STRIP_SERVICES[serviceId];
  const strip =
    stripKey && historySettled && !historyQ.isError ? stripDays(items, now, hasMore) : [];

  const template = spec.template ?? 'A';
  const nextAt =
    entry?.nextRunAt && !Number.isNaN(Date.parse(entry.nextRunAt)) ? entry.nextRunAt : null;
  const firstWords = nextAt
    ? t('svc.page.first.withTime', { time: stamp(nextAt, lang, now) })
    : t('svc.page.first.plain');
  const emptyWords =
    template === 'B'
      ? t('svc.page.filedWhenDue')
      : template === 'C'
        ? t('svc.page.askToStart')
        : firstWords;
  const heldNotLive = state?.id === 'ready' && entry?.run === 'held';
  const about = serviceAboutOf(serviceId, lang);

  const pill = state ? (
    <StatusPill status={state.status} word={serviceStateWord(state, lang)} />
  ) : null;
  return (
    <>
      {/* At large text the bar would be a quarter of the screen with the pill on a third line, and it
          stays pinned: there the bar holds only the arrow and the name, scrolls away, and the pill sits
          in the page, above the first thing the page says. */}
      <PageHeader
        variant="sub"
        title={name}
        back={{ to: '/services', label: t('svc.title') }}
        {...(pill && !large ? { subtitle: pill } : {})}
        {...(large ? { className: '!static' } : {})}
      />
      <div className="flex flex-1 flex-col gap-3 bg-bg p-4">
        {pill && large ? <div className="self-start">{pill}</div> : null}
        {about ? (
          <p className="min-w-0 [overflow-wrap:anywhere] text-body text-text">{about}</p>
        ) : null}
        {state && stateLine ? (
          <p className="break-words text-meta text-text-muted">{stateLine}</p>
        ) : null}
        {heldNotLive ? (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
            <p className="break-words text-body text-text">{t('svc.page.setupHint')}</p>
            <Button variant="secondary" onClick={() => navigate('/')}>
              {t('svc.page.setupButton')}
            </Button>
          </div>
        ) : null}

        <NeedsYouList items={needs} />

        <SectionCard title={panel?.title ?? t('svc.page.right')}>
          {waitingOnData ? (
            <SkeletonBlock lines={4} />
          ) : panel ? (
            <div className="flex flex-col gap-3">
              {panel.asOf ? <AsOf at={panel.asOf} /> : null}
              {panel.content}
            </div>
          ) : (
            <EmptyCalm text={emptyWords} />
          )}
        </SectionCard>

        {kinds.length > 0 ? (
          <SectionCard title={t('svc.page.last30')} variant="list">
            {historyQ.isPending && historyQ.fetchStatus !== 'idle' ? (
              <SkeletonBlock lines={4} />
            ) : historyQ.isError && items.length === 0 ? (
              <ErrorCard
                text={t('svc.page.history.error')}
                onRetry={() => void historyQ.refetch()}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {strip.length > 0 ? (
                  <ServiceDayStrip
                    days={strip}
                    subject={t(`svc.strip.${stripKey}` as 'svc.strip.dsr')}
                    now={now}
                    onOpen={(d) =>
                      d.report
                        ? openReport({
                            conversationId: d.report.conversationId,
                            messageId: d.report.messageId,
                            report: d.report,
                          })
                        : undefined
                    }
                  />
                ) : null}
                {items.length === 0 ? (
                  <EmptyCalm text={t('svc.page.history.empty')} />
                ) : (
                  <ul className="divide-y divide-border">
                    {items.map((item) => (
                      <li key={item.report.messageId}>
                        <button
                          type="button"
                          data-testid="service-history-row"
                          onClick={() =>
                            openReport({
                              conversationId: item.report.conversationId,
                              messageId: item.report.messageId,
                              report: item.report,
                            })
                          }
                          className="flex min-h-14 w-full items-center gap-3 rounded-md py-2 text-left active:bg-surface-2"
                        >
                          <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                            <span className="min-w-0 [overflow-wrap:anywhere] text-body font-medium text-text">
                              {fmtDay(item.day, lang, now)}
                            </span>
                            {item.headline ? (
                              <span className="min-w-0 whitespace-pre-line [overflow-wrap:anywhere] text-body text-text-muted">
                                {item.headline}
                              </span>
                            ) : null}
                            {item.corrected ? (
                              <span className="inline-flex min-h-6 items-center rounded-md bg-surface-2 px-2 text-meta font-medium text-text-muted">
                                {t('svc.page.corrected')}
                              </span>
                            ) : null}
                            {item.status !== 'info' ? <StatusPill status={item.status} /> : null}
                          </span>
                          <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {hasMore ? (
                  <Button
                    variant="secondary"
                    loading={historyQ.isFetchingNextPage}
                    onClick={() => void historyQ.fetchNextPage()}
                    className={cn('self-stretch')}
                  >
                    {tn('svc.page.showMore', SERVICE_PAGE_SIZE)}
                  </Button>
                ) : null}
                {historyQ.isError && items.length > 0 ? (
                  <ErrorCard
                    text={t('svc.page.history.error')}
                    onRetry={() => void historyQ.refetch()}
                  />
                ) : null}
              </div>
            )}
          </SectionCard>
        ) : null}

        <SectionCard title={t('svc.page.how')}>
          <div className="flex flex-col items-start gap-3">
            <HelpChip
              {...(videoFor(serviceId, videosQ.data)
                ? { videoId: videoFor(serviceId, videosQ.data)! }
                : {})}
            />
            <h3 className="text-subheading text-text">{t('svc.page.needFromYou')}</h3>
            {needFromYouKeys(serviceId, template).map((key) => (
              <p key={key} className="min-w-0 [overflow-wrap:anywhere] text-body text-text">
                {t(key)}
              </p>
            ))}
          </div>
        </SectionCard>

        <AskMdgButton
          variant="primary"
          label={t('svc.page.ask')}
          draft={t('svc.page.askDraft', { name })}
          className="self-stretch"
        />
      </div>
    </>
  );
}
