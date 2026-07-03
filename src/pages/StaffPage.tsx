import { MessageCircle, Plus, Trophy, UserPlus } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { STAFF_DAILY_POINT_TARGET } from '@dk/shared/types';
import type { EmployeeWithPoints } from '@dk/shared/types';

import { Avatar, Button, EmptyState, Spinner } from '@/components/ui';
import { AddEmployeeForm } from '@/features/staff/AddEmployeeForm';
import { GivePointsFlow } from '@/features/staff/GivePointsFlow';
import { useEmployees, type PointsWindow } from '@/hooks/api/useEmployees';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { fmtPoints } from '@/lib/staff';
import { useAuthStore } from '@/store/auth';

function WindowToggle({
  value,
  onChange,
}: {
  value: PointsWindow;
  onChange: (w: PointsWindow) => void;
}) {
  const t = useT();
  const options: { value: PointsWindow; label: string }[] = [
    { value: 'today', label: t('staff.windowToday') },
    { value: 'month', label: t('staff.windowMonth') },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t('staff.title')}
      className="inline-flex items-center rounded-full bg-surface-2 p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex min-h-[44px] items-center justify-center rounded-full px-4 text-xs font-medium transition-colors',
              active
                ? 'bg-brand text-text-inverse shadow-sm'
                : 'text-text-muted hover:text-text',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function LeaderboardRow({ employee }: { employee: EmployeeWithPoints }) {
  const t = useT();
  const reached = employee.pointsInWindow >= STAFF_DAILY_POINT_TARGET;
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-3">
      <Avatar name={employee.name} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">
          {employee.name}
        </p>
        {employee.designation ? (
          <p className="truncate text-xs text-text-muted">
            {employee.designation}
          </p>
        ) : null}
        {reached ? (
          <span className="mt-1 inline-flex items-center rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
            {t('staff.reached')}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end leading-none">
        <span className="text-2xl font-bold tabular-nums text-text">
          {fmtPoints(employee.pointsInWindow)}
        </span>
        <span className="mt-0.5 text-[11px] text-text-subtle">
          {t('staff.points')}
        </span>
      </div>
    </li>
  );
}

export function StaffPage() {
  const t = useT();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const dealerId = user?.dealerId ?? undefined;

  const [window, setWindow] = React.useState<PointsWindow>('today');
  const [addOpen, setAddOpen] = React.useState(false);
  const [giveOpen, setGiveOpen] = React.useState(false);

  const employeesQuery = useEmployees(dealerId, window);
  const employees = employeesQuery.data ?? [];
  const sorted = React.useMemo(
    () => [...employees].sort((a, b) => b.pointsInWindow - a.pointsInWindow),
    [employees],
  );
  const hasWorkers = employees.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight text-text">
          {t('staff.title')}
        </h1>
        <WindowToggle value={window} onChange={setWindow} />
      </div>

      {employeesQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <Spinner size={20} />
        </div>
      ) : employeesQuery.isError ? (
        <div className="flex flex-1 flex-col gap-4">
          <EmptyState
            icon={<Trophy width={28} strokeWidth={1.5} />}
            title={t('staff.errorTitle')}
            description={t('common.helpDesc')}
            cta={
              <Button
                variant="secondary"
                leftIcon={<MessageCircle width={16} strokeWidth={1.75} />}
                onClick={() => navigate('/chat')}
              >
                {t('staff.messageUs')}
              </Button>
            }
          />
        </div>
      ) : !hasWorkers && !addOpen ? (
        <EmptyState
          icon={<UserPlus width={28} strokeWidth={1.5} />}
          title={t('staff.emptyTitle')}
          description={t('staff.emptyDesc')}
          cta={
            <Button
              leftIcon={<UserPlus width={16} strokeWidth={1.75} />}
              onClick={() => setAddOpen(true)}
            >
              {t('staff.addWorker')}
            </Button>
          }
        />
      ) : (
        <>
          {/* Primary + secondary actions */}
          <div className="flex gap-2">
            <Button
              fullWidth
              size="lg"
              leftIcon={<Plus width={18} strokeWidth={2} />}
              disabled={!hasWorkers}
              onClick={() => setGiveOpen(true)}
            >
              {t('staff.givePoints')}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              leftIcon={<UserPlus width={18} strokeWidth={1.75} />}
              onClick={() => setAddOpen((v) => !v)}
            >
              {t('staff.addWorker')}
            </Button>
          </div>

          {addOpen ? (
            <AddEmployeeForm
              dealerId={dealerId}
              onDone={() => setAddOpen(false)}
              onCancel={() => setAddOpen(false)}
            />
          ) : null}

          <p className="px-1 text-xs text-text-subtle">
            {t('staff.targetLegend')}
          </p>

          {hasWorkers ? (
            <ul className="flex flex-col gap-2">
              {sorted.map((e) => (
                <LeaderboardRow key={e.id} employee={e} />
              ))}
            </ul>
          ) : null}
        </>
      )}

      {giveOpen ? (
        <GivePointsFlow
          dealerId={dealerId}
          employees={sorted}
          onClose={() => setGiveOpen(false)}
        />
      ) : null}
    </div>
  );
}
