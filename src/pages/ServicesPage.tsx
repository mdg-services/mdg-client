import { ChevronRight } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { AskMdgButton } from '@/components/kit/AskMdgButton';
import { AsOf } from '@/components/kit/AsOf';
import { EmptyCalm } from '@/components/kit/EmptyCalm';
import { ErrorCard } from '@/components/kit/ErrorCard';
import { PageHeader } from '@/components/kit/PageHeader';
import { PillGroup } from '@/components/kit/PillGroup';
import { SectionCard } from '@/components/kit/SectionCard';
import { SkeletonBlock } from '@/components/kit/SkeletonBlock';
import { Card } from '@/components/ui/Card';
import { isPumpLive } from '@/features/glance/glanceModel';
import { HealthCard } from '@/features/services/HealthCard';
import { NeedsYouList } from '@/features/services/NeedsYouList';
import { ServiceIcon } from '@/features/services/ServiceIcon';
import { KAVACH_ROW } from '@/features/services/serviceMap';
import { ServiceRow } from '@/features/services/ServiceRow';
import { buildHub } from '@/features/services/servicesModel';
import { useAttachedServices, useMeServices } from '@/features/services/useMeServices';
import { useOutletSetup } from '@/features/setup/useOutletSetup';
import { useKavach } from '@/hooks/api/useKavach';
import { useTodayFeed } from '@/hooks/api/useTodayFeed';
import { fmtInt } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';
import { useTn } from '@/lib/messages/_plural';
import { useAuthStore } from '@/store/auth';

type Pill = 'services' | 'reports';

/** A query that has an answer, a failure, or will never run (an admin signed in here). */
function settled(q: { status: string; fetchStatus: string }): boolean {
  return q.status !== 'pending' || q.fetchStatus === 'idle';
}

/**
 * The Services door (`/services`, spec 4.2, 6.3): "What is MDG doing for me, and is it working?"
 *
 * Top to bottom: the pill switch `Services | Reports (n)`, the health card ("8 of 9 services
 * running"), "MDG did 28 things for you this week", what needs the owner, the services in plain
 * groups with an honest state, "You could add", and one button to ask MDG for something else.
 *
 * Two reads, and the page is useful with either missing:
 *  - the Today feed (already held): the newest report and the open tasks of every service;
 *  - `GET /v1/me/services` (new): how each service RUNS. Without it there is NO health word and no
 *    "Working": the card is replaced by a neutral line and each row says "Last checked" with the time
 *    of its newest report.
 * A manager never sees an owner-only service, as a row, a count or a page.
 */
export function ServicesPage() {
  const t = useT();
  const tn = useTn();
  const lang = useLang();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);

  const feedQ = useTodayFeed();
  const meQ = useMeServices();
  const attachedQ = useAttachedServices({ enabled: meQ.isError });
  const kavachQ = useKavach();
  const setupQ = useOutletSetup();

  const feed = feedQ.data ?? null;
  const me = meQ.data ?? null;
  const isOwner = feed ? feed.role === 'owner' : role !== 'dealer-staff';
  const setup = setupQ.data;
  const live = !setup?.active || isPumpLive(setup.stage) !== false;

  // "Now" moves when an answer arrives, so "today" and "2 days" are counted from a fresh clock.
  const now = React.useMemo(() => new Date(), [feedQ.dataUpdatedAt, meQ.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const hub = React.useMemo(
    () =>
      buildHub({
        feed,
        me,
        attachedIds: attachedQ.data ?? null,
        isOwner,
        live,
        kavach: kavachQ.data ?? null,
        lang,
        now,
      }),
    [feed, me, attachedQ.data, isOwner, live, kavachQ.data, lang, now],
  );

  const inHand = !!feed || !!me || !!attachedQ.data;
  const ready = settled(feedQ) && settled(meQ) && (!meQ.isError || settled(attachedQ));
  const failed = !inHand && ready && (feedQ.isError || meQ.isError);
  const retry = () => {
    void feedQ.refetch();
    void meQ.refetch();
  };

  const header = (
    <PageHeader
      variant="tab"
      title={t('svc.title')}
      {...(hub.asOf && inHand ? { subtitle: <AsOf at={hub.asOf} /> } : {})}
    />
  );

  const pills = (
    <PillGroup<Pill>
      label={t('svc.pill.label')}
      value="services"
      options={[
        { id: 'services', label: t('svc.pill.services') },
        {
          id: 'reports',
          label: t('svc.pill.reports'),
          ...(hub.look > 0 ? { count: hub.look } : {}),
        },
      ]}
      onChange={(v) => {
        // Between two doors the tap replaces the entry: Back from Reports must not land on Services.
        if (v === 'reports') navigate('/reports', { replace: true });
      }}
    />
  );

  if (role === 'admin') {
    return (
      <>
        {header}
        <div className="flex flex-1 flex-col gap-3 bg-bg p-4">
          <EmptyCalm text={t('svc.empty')} />
        </div>
      </>
    );
  }

  if (!inHand && !failed) {
    return (
      <>
        {header}
        <div className="flex flex-1 flex-col gap-3 bg-bg p-4">
          {pills}
          <SkeletonBlock lines={4} />
          <SkeletonBlock lines={5} />
        </div>
      </>
    );
  }

  if (failed) {
    return (
      <>
        {header}
        <div className="flex flex-1 flex-col gap-3 bg-bg p-4">
          {pills}
          <ErrorCard text={t('svc.error')} onRetry={retry} />
        </div>
      </>
    );
  }

  const open = (id: string) => navigate(`/services/${encodeURIComponent(id)}`);
  const groupTitle = (g: string) => t(`svc.group.${g}` as 'svc.group.daily');

  return (
    <>
      {header}
      <div className="flex flex-1 flex-col gap-3 bg-bg p-4">
        {pills}

        {hub.health ? (
          <HealthCard health={hub.health} asOf={hub.asOf} />
        ) : feed && !(meQ.isPending && meQ.fetchStatus !== 'idle') ? (
          // No health words without the server's word: one neutral fact from the feed instead.
          <p role="status" className="break-words text-body text-text-muted">
            {t('svc.neutral.today', { n: fmtInt(hub.cameToday) })}
          </p>
        ) : null}

        {hub.week !== null && hub.week > 0 ? (
          <Card>
            <button
              type="button"
              onClick={() => navigate('/reports', { replace: true })}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-2 text-left active:bg-surface-2"
            >
              <span className="min-w-0 flex-1 break-words text-body font-medium text-text">
                {t('glance.done.week', { n: fmtInt(hub.week) })}
              </span>
              <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" />
            </button>
          </Card>
        ) : null}

        <NeedsYouList items={hub.needs} />

        {hub.empty ? <EmptyCalm text={t('svc.empty')} /> : null}

        {hub.groups.map(({ group, rows }) => {
          const withKavach = group === 'daily' && hub.kavach !== null;
          if (rows.length === 0 && !withKavach) return null;
          return (
            <SectionCard key={group} title={groupTitle(group)} variant="list">
              <ul className="divide-y divide-border">
                {withKavach ? (
                  <li data-service-row={KAVACH_ROW}>
                    <button
                      type="button"
                      onClick={() => navigate('/kavach')}
                      className="flex min-h-14 w-full items-center gap-3 rounded-md py-3 text-left active:bg-surface-2"
                    >
                      <ServiceIcon serviceId={KAVACH_ROW} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="break-words text-body font-medium text-text">
                          {t('svc.kavach.name')}
                        </span>
                        <span className="break-words text-body text-text-muted">
                          {t('glance.kavach.score', { pct: fmtInt(hub.kavach!.pct) })}
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" />
                    </button>
                  </li>
                ) : null}
                {rows.map((row) => (
                  <ServiceRow key={row.id} row={row} onOpen={open} />
                ))}
              </ul>
            </SectionCard>
          );
        })}

        {hub.feeds ? (
          <SectionCard title={groupTitle('feeds')} variant="list">
            <p data-testid="feeds-line" className="break-words py-2 text-body text-text-muted">
              {hub.feeds.stopped > 0
                ? t('svc.feeds.stopped', { n: hub.feeds.n, m: hub.feeds.stopped })
                : hub.feeds.allRunning
                  ? tn('svc.feeds.running', hub.feeds.n)
                  : tn('svc.feeds.plain', hub.feeds.n)}
            </p>
          </SectionCard>
        ) : null}

        {hub.addable.length > 0 ? (
          <SectionCard title={groupTitle('add')} variant="list">
            <ul className="divide-y divide-border">
              {hub.addable.map((a) => (
                <li key={a.id} data-addable={a.id} className="flex flex-col items-start gap-2 py-3">
                  <span className="flex items-start gap-3">
                    <ServiceIcon serviceId={a.id} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="break-words text-body font-medium text-text-muted">
                        {a.name}
                      </span>
                      {a.about ? (
                        <span className="break-words text-meta text-text-muted">{a.about}</span>
                      ) : null}
                    </span>
                  </span>
                  <AskMdgButton
                    label={t('svc.add.ask')}
                    ariaLabel={t('svc.add.askLabel', { name: a.name })}
                    draft={t('svc.add.draft', { name: a.name })}
                  />
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}

        <AskMdgButton
          label={t('svc.other.button')}
          draft={t('svc.other.draft')}
          className="self-stretch"
        />
      </div>
    </>
  );
}
