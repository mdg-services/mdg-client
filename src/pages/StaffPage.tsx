import { ChevronDown, ChevronUp, MessageCircle, UserPlus } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { EmptyCalm } from '@/components/kit/EmptyCalm';
import { ErrorCard } from '@/components/kit/ErrorCard';
import { SkeletonBlock } from '@/components/kit/SkeletonBlock';
import { StickyAction } from '@/components/kit/StickyAction';
import { SubPageBar } from '@/components/SubPage';
import { Card, Button, useToast } from '@/components/ui';
import { useOpenMyChat } from '@/features/chat/useOpenMyChat';
import { AddEmployeeForm } from '@/features/staff/AddEmployeeForm';
import { GivePointsFlow } from '@/features/staff/GivePointsFlow';
import { PendingSubmissionPanel } from '@/features/staff/PendingSubmissionPanel';
import { PeriodSwitch } from '@/features/staff/PeriodSwitch';
import { RemovedRoster } from '@/features/staff/RemovedRoster';
import { SheetsSent } from '@/features/staff/SheetsSent';
import { activeOnly, rankRows, teamTotal, whoIsBehind } from '@/features/staff/staffInsights';
import { TeamStrip } from '@/features/staff/TeamStrip';
import { useDraftSummary } from '@/features/staff/useDraftSummary';
import { WarriorRow } from '@/features/staff/WarriorRow';
import { useDealerWorkItems } from '@/hooks/api/useDealerWorkItems';
import {
  useEmployees,
  useEmployeesBetween,
  useUpdateEmployee,
  windowBounds,
  type PointsWindow,
} from '@/hooks/api/useEmployees';
import { useStaffDraft } from '@/hooks/api/useStaffDraft';
import { useStaffDraftSync } from '@/hooks/api/useStaffDraftSync';
import { useT } from '@/lib/i18n';
import { fmtPointsGrouped, istDate, sameDaysLastMonthBounds } from '@/lib/staff';
import { useLargeText } from '@/lib/useLargeText';
import { useAuthStore } from '@/store/auth';
import type { EmployeeWithPoints } from '@dk/shared/types';

/**
 * Warriors and points (`/staff`, spec 4.7). It answers one question: "Is my crew pulling, and is there
 * a sheet I must send?" Top to bottom:
 *
 *  1. the team strip: this month's points, against the same days last month, how many earned any;
 *  2. waiting to send (only when something is): "3 warriors, 62 points not sent yet", with the send
 *     button inside the card, because points count only after the sheet is sent;
 *  3. the switch Today | This month | Last month, and the warriors: rank, points, share of the team,
 *     change against last month, who is behind, a Call button and a one-tap Leave; a tap on a name
 *     opens that warrior's own page;
 *  4. the sheets sent, with the days that have none;
 *  5. how points are worked out;
 *  and "Give points" kept on screen at the bottom. Adding a warrior moved into the bar's menu (it
 *  happens once a year; giving points happens every day).
 *
 * The 100-point legend and chip are the owner's decision Q2 and stay exactly as they were. Nothing new
 * is measured against 100: "behind" is against the team average.
 */
export function StaffPage() {
  const t = useT();
  const navigate = useNavigate();
  const openMyChat = useOpenMyChat();
  const toast = useToast();
  const large = useLargeText();
  const user = useAuthStore((s) => s.user);
  const dealerId = user?.dealerId ?? undefined;

  const [period, setPeriod] = React.useState<PointsWindow>('today');
  const [addOpen, setAddOpen] = React.useState(false);
  const [giveOpen, setGiveOpen] = React.useState(false);
  const [showHow, setShowHow] = React.useState(false);

  // Three reads of one route. The roster INCLUDES removed workers so the fold at the foot can list
  // and bring them back; the totals and the list count only the active ones. "This month" is always
  // read (the strip needs it whatever the switch says) and is the same cache entry as the switch's
  // own month view.
  const month = useEmployees(dealerId, 'month', true);
  const sameDays = sameDaysLastMonthBounds(istDate());
  const lastMonthSameDays = useEmployeesBetween(dealerId, sameDays.from, sameDays.to, true);
  const shown = useEmployees(dealerId, period, true);

  const roster = React.useMemo(() => shown.data ?? [], [shown.data]);
  const active = React.useMemo(() => activeOnly(roster), [roster]);
  const removed = React.useMemo(() => roster.filter((e) => e.status === 'INACTIVE'), [roster]);
  const total = teamTotal(active);
  const ranked = React.useMemo(() => rankRows(active), [active]);
  // A standing means something only when the points differ. If everyone has the same, no rank is
  // drawn (three people would each read "1"); if some share a place, those rows say "tied".
  const rankCounts = React.useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of ranked) counts.set(r.rank, (counts.get(r.rank) ?? 0) + 1);
    return counts;
  }, [ranked]);
  const showRanks = total > 0 && !(ranked.length > 1 && rankCounts.size === 1);
  const behind = React.useMemo(
    () =>
      period === 'today' ? new Map<string, number>() : whoIsBehind(roster, windowBounds(period)),
    [roster, period],
  );
  const previousById = React.useMemo(
    () =>
      lastMonthSameDays.data
        ? new Map(lastMonthSameDays.data.map((e) => [e.id, e.pointsInWindow]))
        : null,
    [lastMonthSameDays.data],
  );

  const workItems = useDealerWorkItems(dealerId).data;
  const workList = React.useMemo(() => workItems ?? [], [workItems]);
  const draftQuery = useStaffDraft(dealerId);
  const draftSync = useStaffDraftSync(dealerId, draftQuery.data);
  const month_ = month.data;
  const everyone = React.useMemo(() => month_ ?? roster, [month_, roster]);
  const draft = useDraftSummary(dealerId, workList, everyone);

  const update = useUpdateEmployee(dealerId);
  const [reactivatingId, setReactivatingId] = React.useState<string | null>(null);
  const onReactivate = (e: EmployeeWithPoints) => {
    setReactivatingId(e.id);
    update.mutate(
      { id: e.id, input: { status: 'ACTIVE' } },
      {
        onSuccess: () => toast.success(t('staff.reactivated')),
        onSettled: () => setReactivatingId(null),
      },
    );
  };

  const hasActiveWorkers = active.length > 0;
  const showEmpty = !hasActiveWorkers && !addOpen && !draft.waiting && !shown.isPlaceholderData;
  // The window a reader switched to is not loaded yet: the old rows are kept on screen by the cache so
  // the list does not blank, but they are not "Today" and must not be read as it.
  const switching = shown.isPlaceholderData;
  const ready = !shown.isLoading && !shown.isError;

  const menu = [
    {
      key: 'add',
      label: t('staff.addWorker'),
      onSelect: () => setAddOpen(true),
      icon: <UserPlus aria-hidden className="h-5 w-5" strokeWidth={1.75} />,
    },
  ];

  return (
    <>
      <SubPageBar title={t('staff.title')} menu={menu} />
      <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-4">
        {shown.isLoading ? (
          <SkeletonBlock lines={6} className="py-6" />
        ) : shown.isError ? (
          <div className="flex flex-col items-start gap-3">
            <ErrorCard text={t('staff.errorTitle')} onRetry={() => void shown.refetch()} />
            <Button
              variant="secondary"
              leftIcon={<MessageCircle aria-hidden className="h-5 w-5" strokeWidth={1.75} />}
              onClick={openMyChat}
            >
              {t('staff.messageUs')}
            </Button>
          </div>
        ) : showEmpty ? (
          <EmptyCalm
            text={`${t('staff.emptyTitle')}. ${t('staff.emptyDesc')}`}
            action={{
              label: t('staff.addWorker'),
              onPress: () => setAddOpen(true),
              variant: 'primary',
            }}
          />
        ) : (
          <>
            {addOpen ? (
              <AddEmployeeForm
                dealerId={dealerId}
                onDone={() => setAddOpen(false)}
                onCancel={() => setAddOpen(false)}
              />
            ) : null}

            {month.data ? (
              <TeamStrip month={month.data} previous={lastMonthSameDays.data ?? null} />
            ) : null}

            <PendingSubmissionPanel
              dealerId={dealerId}
              workItems={workList}
              employees={everyone}
              sync={draftSync}
            />

            {/* At large text the button would cover the list when pinned: it is placed here instead. */}
            {large && ready ? (
              <Button
                size="lg"
                fullWidth
                disabled={!hasActiveWorkers}
                onClick={() => setGiveOpen(true)}
              >
                {t('staff.givePoints')}
              </Button>
            ) : null}

            <PeriodSwitch<PointsWindow>
              label={t('warr.window.label')}
              value={period}
              onChange={setPeriod}
              options={[
                { id: 'today', label: t('staff.windowToday') },
                { id: 'month', label: t('staff.windowMonth') },
                { id: 'lastMonth', label: t('warr.window.last') },
              ]}
            />

            {/* The owner's decision Q2: this legend and the "Reached 100" chip stay exactly as they were. */}
            <p className="px-1 text-body text-text-muted">{t('staff.targetLegend')}</p>

            {switching ? (
              <SkeletonBlock lines={4} className="py-4" />
            ) : (
              <>
                {period === 'today' && total === 0 && hasActiveWorkers ? (
                  <p className="px-1 text-body text-text">
                    {draft.waiting
                      ? t('warr.empty.todayWaiting', { points: fmtPointsGrouped(draft.points) })
                      : t('warr.empty.today')}
                  </p>
                ) : null}

                {hasActiveWorkers ? (
                  <Card>
                    <ul className="divide-y divide-border">
                      {ranked.map(({ row, rank }) => (
                        <WarriorRow
                          key={row.id}
                          dealerId={dealerId}
                          employee={row}
                          {...(showRanks ? { rank, tied: (rankCounts.get(rank) ?? 0) > 1 } : {})}
                          window={period}
                          teamPoints={total}
                          {...(period === 'month' && previousById?.has(row.id)
                            ? { previousPoints: previousById.get(row.id)! }
                            : {})}
                          {...(behind.has(row.id) ? { behindPercent: behind.get(row.id)! } : {})}
                          onOpen={(id) => navigate(`/staff/${id}`)}
                        />
                      ))}
                    </ul>
                  </Card>
                ) : null}
              </>
            )}

            <SheetsSent dealerId={dealerId} />

            <RemovedRoster
              employees={removed}
              onReactivate={onReactivate}
              pendingId={reactivatingId}
            />

            <Card className="flex flex-col">
              <button
                type="button"
                aria-expanded={showHow}
                onClick={() => setShowHow((v) => !v)}
                className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-body font-medium text-text active:bg-surface-2"
              >
                <span className="min-w-0 flex-1 break-words">{t('warr.how.link')}</span>
                {showHow ? (
                  <ChevronUp aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" />
                ) : (
                  <ChevronDown aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" />
                )}
              </button>
              {showHow ? (
                <p className="break-words px-4 pb-3 text-body text-text-muted">
                  {t('warr.how.body')}
                </p>
              ) : null}
            </Card>
          </>
        )}
      </div>

      {ready && !showEmpty && !large ? (
        <StickyAction
          label={t('staff.givePoints')}
          disabled={!hasActiveWorkers}
          onPress={() => setGiveOpen(true)}
        />
      ) : null}

      {giveOpen ? (
        <GivePointsFlow
          dealerId={dealerId}
          employees={ranked.map((r) => r.row)}
          onClose={() => setGiveOpen(false)}
        />
      ) : null}
    </>
  );
}
