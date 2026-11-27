import { CalendarOff, Pencil, RotateCcw } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { EmptyCalm } from '@/components/kit/EmptyCalm';
import { ErrorCard } from '@/components/kit/ErrorCard';
import { Num } from '@/components/kit/Num';
import { PageHeader } from '@/components/kit/PageHeader';
import { SectionCard } from '@/components/kit/SectionCard';
import { SkeletonBlock } from '@/components/kit/SkeletonBlock';
import { StatTile } from '@/components/kit/StatTile';
import { StatusPill } from '@/components/kit/StatusPill';
import { Button, Card, useToast } from '@/components/ui';
import { CallButton } from '@/features/staff/CallButton';
import { useRoleLabel } from '@/features/staff/designation';
import { EditWorkerDialog } from '@/features/staff/EditWorkerDialog';
import { PointsBars } from '@/features/staff/PointsBars';
import {
  changeNumber,
  percentChange,
  personWindow,
  sharePercent,
  workingDays,
} from '@/features/staff/staffInsights';
import { buildWarriorStats, buildWorkMeta } from '@/features/staff/warriorStats';
import { useDealerWorkItems } from '@/hooks/api/useDealerWorkItems';
import {
  useEmployeeLeave,
  useEmployees,
  useEmployeesBetween,
  useRemoveEmployeeLeave,
  useSetEmployeeLeave,
  useUpdateEmployee,
  windowBounds,
} from '@/hooks/api/useEmployees';
import { STAFF_LEDGER_CAP, useStaffLedger } from '@/hooks/api/useStaffPoints';
import { fmtDay, fmtInt } from '@/lib/fmt';
import { pick, useLang, useT } from '@/lib/i18n';
import { useTn } from '@/lib/messages/_plural';
import { fmtPoints, fmtPointsGrouped, istDate, sameDaysLastMonthBounds } from '@/lib/staff';
import { useLargeText } from '@/lib/useLargeText';
import { useAuthStore } from '@/store/auth';
import type { StaffPointAward } from '@dk/shared/types';

/** Works listed under "Top jobs", and entries under "Latest entries". */
const TOP_WORKS = 5;
const LATEST_ENTRIES = 10;

/**
 * One warrior's own page (`/staff/:employeeId`, spec 4.7). A tap on a name in the Warriors list lands
 * here. Top to bottom: who he is (role, phone with a Call button, one-tap Leave), this month's
 * points, his points for each of the last 14 days, the jobs he did most, and his latest entries.
 *
 * The month's points, the leave days and the working days come from the roster (the very rows the
 * list shows, so the two never disagree). The days, the jobs and the entries come from his ledger,
 * one call for him alone (`GET /staff-points?employeeId`), read with the same pure sums the admin
 * app uses. The ledger is cut at 1,000 rows by the server; one person stays far under that, and the
 * page says so if it ever is not. Nothing here is measured against a target.
 *
 * The page always draws its bar, on the loading and the failed screens too, so there is a way out.
 * Each section fails alone: a ledger that did not come never hides the roster's numbers.
 */
export function StaffPersonPage() {
  const t = useT();
  const navigate = useNavigate();
  const { employeeId } = useParams<{ employeeId: string }>();
  const dealerId = useAuthStore((s) => s.user?.dealerId) ?? undefined;
  const [editing, setEditing] = React.useState(false);

  const roster = useEmployees(dealerId, 'month', true);
  const employee = React.useMemo(
    () => roster.data?.find((e) => e.id === employeeId),
    [roster.data, employeeId],
  );

  const back = { to: '/staff', label: t('staff.title') };

  if (roster.isLoading) {
    return (
      <>
        <PageHeader variant="sub" title={t('staff.title')} back={back} />
        <div className="flex flex-1 flex-col p-4">
          <SkeletonBlock lines={5} />
        </div>
      </>
    );
  }

  if (roster.isError) {
    return (
      <>
        <PageHeader variant="sub" title={t('staff.title')} back={back} />
        <div className="flex flex-1 flex-col p-4">
          <ErrorCard text={t('staff.errorTitle')} onRetry={() => void roster.refetch()} />
        </div>
      </>
    );
  }

  if (!employee) {
    return (
      <>
        <PageHeader variant="sub" title={t('staff.title')} back={back} />
        <div className="flex flex-1 flex-col p-4">
          <EmptyCalm
            text={t('warr.person.notFound')}
            action={{
              label: t('warr.person.all'),
              onPress: () => navigate('/staff', { replace: true }),
            }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader variant="sub" title={employee.name} back={back} />
      <PersonBody dealerId={dealerId} employeeId={employee.id} onEdit={() => setEditing(true)} />
      {editing ? (
        <EditWorkerDialog
          dealerId={dealerId}
          employee={employee}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}

function PersonBody({
  dealerId,
  employeeId,
  onEdit,
}: {
  dealerId: string | undefined;
  employeeId: string;
  onEdit: () => void;
}) {
  const t = useT();
  const large = useLargeText();
  const roleLabel = useRoleLabel();
  const lang = useLang();
  const tn = useTn();
  const toast = useToast();

  const today = istDate();
  const win = React.useMemo(() => personWindow(today), [today]);
  const month = windowBounds('month');

  // Same cache entries the list page reads: opening a person costs no extra roster call.
  const roster = useEmployees(dealerId, 'month', true);
  const employee = roster.data?.find((e) => e.id === employeeId);
  const sameDays = sameDaysLastMonthBounds(today);
  const lastMonthSameDays = useEmployeesBetween(dealerId, sameDays.from, sameDays.to, true);
  const previous = lastMonthSameDays.data?.find((e) => e.id === employeeId);

  const ledger = useStaffLedger(dealerId, employeeId, win.from, win.to);
  const leave = useEmployeeLeave(dealerId, win.from, win.to);
  const workItems = useDealerWorkItems(dealerId).data;

  const leaveDates = React.useMemo(
    () => new Set((leave.data ?? []).filter((l) => l.employeeId === employeeId).map((l) => l.date)),
    [leave.data, employeeId],
  );
  const workMeta = React.useMemo(() => buildWorkMeta(workItems), [workItems]);
  const awards = ledger.data;
  const monthStats = React.useMemo(
    () =>
      awards
        ? buildWarriorStats({ awards, from: win.monthFrom, to: win.to, leaveDates, workMeta })
        : null,
    [awards, win, leaveDates, workMeta],
  );
  const barStats = React.useMemo(
    () =>
      awards
        ? buildWarriorStats({ awards, from: win.barsFrom, to: win.to, leaveDates, workMeta })
        : null,
    [awards, win, leaveDates, workMeta],
  );

  const setLeave = useSetEmployeeLeave(dealerId);
  const removeLeave = useRemoveEmployeeLeave(dealerId);
  const update = useUpdateEmployee(dealerId);

  if (!employee) return null;

  const points = employee.pointsInWindow;
  const days = workingDays(employee, month);
  const perDay = days > 0 ? points / days : 0;
  const change = previous ? percentChange(points, previous.pointsInWindow) : null;
  const removed = employee.status === 'INACTIVE';
  const leaveBusy = setLeave.isPending || removeLeave.isPending;
  const capped = (awards?.length ?? 0) >= STAFF_LEDGER_CAP;

  const markLeave = () =>
    setLeave.mutate(
      { id: employee.id },
      { onSuccess: () => toast.success(t('staff.leaveMarked', { name: employee.name })) },
    );
  const clearLeave = () =>
    removeLeave.mutate(
      { id: employee.id, date: today },
      { onSuccess: () => toast.success(t('staff.leaveCleared', { name: employee.name })) },
    );
  const bringBack = () =>
    update.mutate(
      { id: employee.id, input: { status: 'ACTIVE' } },
      { onSuccess: () => toast.success(t('staff.reactivated')) },
    );

  const bars = barStats?.days.map((d) => ({
    label: fmtDay(d.date, lang),
    tick: String(Number(d.date.slice(8))),
    value: d.points,
  }));
  const barsTotal = barStats?.totalPoints ?? 0;
  const barsSummary =
    barStats && barStats.bestDay
      ? t('warr.person.barsSummary', {
          total: fmtPointsGrouped(barsTotal),
          best: fmtPoints(barStats.bestDay.points),
          day: fmtDay(barStats.bestDay.date, lang),
        })
      : t('warr.person.barsNone');
  const latest = (awards ?? []).slice(0, LATEST_ENTRIES);

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-4">
      {/* Who he is, how to reach him, Leave and Edit */}
      <Card className="flex flex-col gap-3 p-4">
        {employee.designation ? (
          <p className="break-words text-body text-text">{roleLabel(employee.designation)}</p>
        ) : null}
        {removed || employee.onLeaveToday ? (
          <div className="flex flex-wrap items-center gap-2">
            {removed ? <StatusPill status="info" word={t('staff.removedSection')} /> : null}
            {!removed && employee.onLeaveToday ? (
              <StatusPill status="info" word={t('staff.onLeave')} />
            ) : null}
          </div>
        ) : null}
        {employee.phone ? (
          <div className="flex flex-col gap-1">
            <p className="text-meta font-medium text-text-muted">{t('warr.person.phone')}</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Num className="break-all text-body text-text">{employee.phone}</Num>
              <CallButton
                name={employee.name}
                phone={employee.phone}
                numberShown
                {...(large ? { className: 'w-full' } : {})}
              />
            </div>
          </div>
        ) : null}
        {removed ? (
          <div className="flex flex-col items-start gap-2">
            <p className="break-words text-body text-text">{t('warr.person.removedNote')}</p>
            <Button
              variant="secondary"
              fullWidth={large}
              leftIcon={<RotateCcw aria-hidden className="h-5 w-5" strokeWidth={2} />}
              loading={update.isPending}
              aria-label={`${t('staff.reactivate')}: ${employee.name}`}
              onClick={bringBack}
            >
              {t('staff.reactivate')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="break-words text-meta text-text-muted">
              {t(employee.onLeaveToday ? 'warr.person.leaveOnHelp' : 'warr.person.leaveHelp')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                fullWidth={large}
                loading={leaveBusy}
                leftIcon={<CalendarOff aria-hidden className="h-5 w-5" strokeWidth={2} />}
                aria-label={t(
                  employee.onLeaveToday ? 'warr.row.clearLeaveName' : 'warr.row.leaveName',
                  { name: employee.name },
                )}
                onClick={employee.onLeaveToday ? clearLeave : markLeave}
              >
                {employee.onLeaveToday ? t('staff.clearLeave') : t('staff.markLeave')}
              </Button>
            </div>
          </div>
        )}
        <Button
          variant="secondary"
          fullWidth={large}
          className="self-start"
          leftIcon={<Pencil aria-hidden className="h-5 w-5" strokeWidth={2} />}
          aria-label={t('warr.person.editName', { name: employee.name })}
          onClick={onEdit}
        >
          {t('warr.person.edit')}
        </Button>
      </Card>

      {/* This month: from the roster, the very numbers of the list */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-3">
        <StatTile
          label={t('warr.person.month')}
          value={<Num>{fmtPointsGrouped(points)}</Num>}
          unit={t('staff.points')}
          {...(change
            ? {
                delta: {
                  dir: change.dir,
                  ...changeNumber(change),
                  against: t('warr.team.against'),
                },
              }
            : {})}
          ariaLabel={`${t('warr.person.month')}: ${fmtPointsGrouped(points)} ${t('staff.points')}`}
          className="col-span-full"
        />
        <StatTile
          label={t('warr.person.avg')}
          value={<Num>{fmtPoints(Math.round(perDay * 10) / 10)}</Num>}
          unit={t('staff.points')}
          ariaLabel={`${t('warr.person.avg')}: ${fmtPoints(Math.round(perDay * 10) / 10)} ${t('staff.points')}`}
        />
        <StatTile
          label={t('warr.person.leave')}
          value={<Num>{fmtInt(employee.leaveDaysInWindow)}</Num>}
          unit={t('warr.person.days')}
          ariaLabel={`${t('warr.person.leave')}: ${fmtInt(employee.leaveDaysInWindow)} ${t('warr.person.days')}`}
        />
      </div>

      {/* The last 14 days, day by day */}
      <SectionCard title={t('warr.person.bars')}>
        {ledger.isLoading ? (
          <SkeletonBlock lines={3} />
        ) : ledger.isError ? (
          <ErrorCard text={t('common.loadFailed')} onRetry={() => void ledger.refetch()} />
        ) : bars ? (
          <PointsBars data={bars} summary={barsSummary} />
        ) : null}
      </SectionCard>

      {/* What he did most this month */}
      <SectionCard title={t('warr.person.top')}>
        {ledger.isLoading ? (
          <SkeletonBlock lines={3} />
        ) : ledger.isError ? (
          <ErrorCard text={t('common.loadFailed')} onRetry={() => void ledger.refetch()} />
        ) : monthStats && monthStats.byWork.length > 0 ? (
          <ol className="divide-y divide-border">
            {monthStats.byWork.slice(0, TOP_WORKS).map((w, i) => (
              <li key={w.key} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span
                  aria-hidden
                  className="w-5 shrink-0 text-center text-meta font-semibold tabular-nums text-text-muted"
                >
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 basis-40 flex-col">
                  <span className="break-words text-body text-text">
                    {pick(lang, w.label, w.labelHi)}
                  </span>
                  <span className="break-words text-meta text-text-muted">
                    {tn('warr.person.times', w.count)}
                    {monthStats.totalPoints > 0
                      ? ` · ${t('warr.person.topShare', {
                          pct: sharePercent(w.points, monthStats.totalPoints),
                        })}`
                      : ''}
                  </span>
                </span>
                <span className="ml-auto flex shrink-0 flex-col items-end">
                  <span className="text-heading tabular-nums text-text">
                    {fmtPointsGrouped(w.points)}
                  </span>
                  <span className="text-meta text-text-muted">{t('staff.points')}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="break-words text-body text-text-muted">{t('warr.person.noEntries')}</p>
        )}
      </SectionCard>

      {/* His latest entries */}
      <SectionCard title={t('warr.person.recent')} variant="list">
        {ledger.isLoading ? (
          <SkeletonBlock lines={4} />
        ) : ledger.isError ? (
          <ErrorCard text={t('common.loadFailed')} onRetry={() => void ledger.refetch()} />
        ) : latest.length === 0 ? (
          <p className="break-words py-3 text-body text-text-muted">{t('warr.person.noEntries')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {latest.map((a) => (
              <EntryRow key={a.id} award={a} />
            ))}
          </ul>
        )}
      </SectionCard>

      {capped ? <p className="px-1 text-body text-text-muted">{t('warr.person.capped')}</p> : null}
    </div>
  );
}

function EntryRow({ award }: { award: StaffPointAward }) {
  const t = useT();
  const lang = useLang();
  const extras: string[] = [fmtDay(award.workDate, lang)];
  if (award.amountRupees !== undefined && award.amountRupees > 0) {
    extras.push(t('warr.person.amount', { n: fmtInt(award.amountRupees) }));
  } else if (award.quantity !== undefined && award.quantity !== 1) {
    extras.push(t('warr.person.qty', { n: fmtPoints(award.quantity) }));
  }
  if (award.splitAmong !== undefined && award.splitAmong > 1) {
    extras.push(t('warr.person.split', { n: award.splitAmong }));
  }
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3">
        <p className="min-w-0 flex-1 break-words text-body text-text">
          {pick(lang, award.workLabelEn, award.workLabelHi)}
        </p>
        <p className="shrink-0 whitespace-nowrap text-body font-semibold tabular-nums text-text">
          {t('warr.person.entryPoints', { points: fmtPointsGrouped(award.points) })}
        </p>
      </div>
      <p className="break-words text-meta text-text-muted">{extras.join(' · ')}</p>
      {award.note ? (
        <p className="break-words text-body italic text-text-muted">{award.note}</p>
      ) : null}
    </li>
  );
}
