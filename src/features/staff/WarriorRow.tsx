import { CalendarOff, ChevronRight } from 'lucide-react';

import { DeltaChip } from '@/components/kit/DeltaChip';
import { ProgressBar } from '@/components/kit/ProgressBar';
import { StatusPill } from '@/components/kit/StatusPill';
import { Button, useToast } from '@/components/ui';
import { StatusShape } from '@/features/reports/StatusBadge';
import {
  useRemoveEmployeeLeave,
  useSetEmployeeLeave,
  type PointsWindow,
} from '@/hooks/api/useEmployees';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { fmtPointsGrouped, istDate } from '@/lib/staff';
import { useLargeText } from '@/lib/useLargeText';
import { STAFF_DAILY_POINT_TARGET } from '@dk/shared/types';
import type { EmployeeWithPoints } from '@dk/shared/types';

import { CallButton } from './CallButton';
import { useRoleLabel } from './designation';
import { pointsChange, sharePercent } from './staffInsights';
import { WarriorAvatar } from './WarriorAvatar';

export interface WarriorRowProps {
  dealerId: string | undefined;
  employee: EmployeeWithPoints;
  /** The standing in the list; left out when nobody has points yet (a rank of 1 for everyone says nothing). */
  rank?: number;
  /** Another warrior has the same points, so the rank is shared: the row says so in words. */
  tied?: boolean;
  window: PointsWindow;
  /** The team's points in this window, for the share bar. */
  teamPoints: number;
  /** This warrior's points on the same days of last month; left out when that is not known. */
  previousPoints?: number;
  /** Set when he is behind: the percent of the team average his points per working day come to. */
  behindPercent?: number;
  onOpen: (employeeId: string) => void;
}

/**
 * One warrior in the list. The name, the points and the arrow are ONE tap target (the person's own
 * page); everything under it is separate, never nested inside a button: the share of the team, the
 * change against last month, "behind", a Call button and a Leave button, each 44px or more. Leave is
 * one tap here (it used to be a pencil, a dialog, then Leave) and one tap undoes it.
 *
 * The 100-point chip and the legend above the list are the owner's decision Q2 and are kept as they
 * were: nothing new on this row is measured against 100.
 */
export function WarriorRow({
  dealerId,
  employee,
  rank,
  tied,
  window,
  teamPoints,
  previousPoints,
  behindPercent,
  onOpen,
}: WarriorRowProps) {
  const t = useT();
  const toast = useToast();
  const setLeave = useSetEmployeeLeave(dealerId);
  const removeLeave = useRemoveEmployeeLeave(dealerId);
  const large = useLargeText();
  const roleLabel = useRoleLabel();

  const points = employee.pointsInWindow;
  const reached = points >= STAFF_DAILY_POINT_TARGET;
  // On leave today explains a 0: he was off, he did not slack.
  const onLeaveToday = window === 'today' && employee.onLeaveToday;
  // Only stand in "on leave" for the number when there is nothing earned to show: leave must never
  // look like it wiped out points he really earned.
  const leaveInsteadOfPoints = onLeaveToday && points <= 0;
  // In the month views, how many days off lie behind a lower total.
  const leaveDays = window !== 'today' ? employee.leaveDaysInWindow : 0;
  const share = sharePercent(points, teamPoints);
  const change =
    window === 'month' && previousPoints !== undefined && !(points === 0 && previousPoints === 0)
      ? pointsChange(points, previousPoints)
      : null;

  const markLeave = () =>
    setLeave.mutate(
      { id: employee.id },
      { onSuccess: () => toast.success(t('staff.leaveMarked', { name: employee.name })) },
    );
  const clearLeave = () =>
    removeLeave.mutate(
      { id: employee.id, date: istDate() },
      { onSuccess: () => toast.success(t('staff.leaveCleared', { name: employee.name })) },
    );
  const leaveBusy = setLeave.isPending || removeLeave.isPending;

  const role = employee.designation ? roleLabel(employee.designation) : null;
  const pointsBlock = leaveInsteadOfPoints ? (
    <span className="text-cta text-text">{t('staff.onLeaveShort')}</span>
  ) : (
    <span className={cn('flex', large ? 'items-baseline gap-2' : 'flex-col items-end')}>
      <span className="text-title tabular-nums text-text">{fmtPointsGrouped(points)}</span>
      <span className="text-meta text-text-muted">{t('staff.points')}</span>
    </span>
  );
  const chevron = <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" />;

  return (
    <li className="px-4">
      {/*
        The name, the points and the arrow are one button. At large text it is two lines: the name on a
        line of its own (rank and avatar would squeeze it to a letter a line), the points under it with
        the arrow at the end. Otherwise: rank, avatar, name, points, arrow in one row.
      */}
      <button
        type="button"
        onClick={() => onOpen(employee.id)}
        className={cn(
          'flex min-h-14 w-full gap-3 py-2 text-left active:bg-surface-2',
          large ? 'flex-col items-stretch gap-1' : 'items-center',
        )}
      >
        {large ? null : (
          <span className="flex shrink-0 items-center gap-2">
            {rank !== undefined ? (
              <span
                aria-hidden
                className="w-5 text-center text-meta font-semibold tabular-nums text-text-muted"
              >
                {rank}
              </span>
            ) : null}
            <WarriorAvatar name={employee.name} />
          </span>
        )}
        <span className="flex min-w-[8rem] flex-1 flex-col">
          <span className="break-words text-body font-medium text-text">
            {large && rank !== undefined ? `${rank}. ` : ''}
            {employee.name}
          </span>
          {role ? <span className="break-words text-meta text-text-muted">{role}</span> : null}
          {rank !== undefined && tied ? (
            <span className="break-words text-meta text-text-muted">
              {t('warr.row.tied', { rank })}
            </span>
          ) : null}
        </span>
        {large ? (
          <span className="flex items-center justify-between gap-2">
            {pointsBlock}
            {chevron}
          </span>
        ) : (
          <>
            <span className="flex shrink-0 items-center text-meta text-text-muted">
              {pointsBlock}
            </span>
            {chevron}
          </>
        )}
      </button>

      <div className="flex flex-col gap-2 pb-3">
        {teamPoints > 0 ? (
          <div
            role="group"
            aria-label={t('warr.row.shareAria', { name: employee.name, pct: share })}
          >
            <ProgressBar
              value={points}
              max={teamPoints}
              text={t('warr.row.share', { pct: share })}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {onLeaveToday ? (
            <StatusPill status="info" word={t('staff.onLeave')} />
          ) : reached ? (
            <StatusPill status="ok" word={t('staff.reached')} />
          ) : leaveDays > 0 ? (
            <StatusPill status="info" word={t('staff.leaveDays', { n: leaveDays })} />
          ) : null}
          {change ? (
            <DeltaChip
              dir={change.dir}
              {...(change.n !== undefined ? { n: change.n } : {})}
              against={t('warr.team.against')}
            />
          ) : null}
        </div>

        {behindPercent !== undefined ? (
          <div className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 flex shrink-0 [&>svg]:h-5 [&>svg]:w-5">
              <StatusShape status="attention" />
            </span>
            <p className="min-w-0 break-words text-body text-text">
              {t('warr.row.behind', { pct: behindPercent })}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <CallButton
            name={employee.name}
            {...(employee.phone ? { phone: employee.phone } : {})}
            {...(large ? { className: 'w-full' } : {})}
          />
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
    </li>
  );
}
