import {
  ChevronDown,
  ChevronUp,
  ImageIcon,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
  Trophy,
  UserPlus,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { STAFF_DAILY_POINT_TARGET } from '@dk/shared/types';
import type { EmployeeWithPoints } from '@dk/shared/types';

import { Avatar, Button, EmptyState, Spinner, useToast } from '@/components/ui';
import { AddEmployeeForm } from '@/features/staff/AddEmployeeForm';
import { EditWorkerDialog } from '@/features/staff/EditWorkerDialog';
import { GivePointsFlow } from '@/features/staff/GivePointsFlow';
import { PendingSubmissionPanel } from '@/features/staff/PendingSubmissionPanel';
import { useDealerWorkItems } from '@/hooks/api/useDealerWorkItems';
import {
  useEmployees,
  useUpdateEmployee,
  type PointsWindow,
} from '@/hooks/api/useEmployees';
import { useStaffBatches, useStaffDraft } from '@/hooks/api/useStaffDraft';
import { useStaffDraftSync } from '@/hooks/api/useStaffDraftSync';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { fmtPoints } from '@/lib/staff';
import { useAuthStore } from '@/store/auth';
import { useStaffDraftStore } from '@/store/staffDraft';

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

function LeaderboardRow({
  employee,
  onEdit,
}: {
  employee: EmployeeWithPoints;
  onEdit: (e: EmployeeWithPoints) => void;
}) {
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
      <button
        type="button"
        aria-label={t('staff.editWorker')}
        onClick={() => onEdit(employee)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-subtle active:bg-surface-2"
      >
        <Pencil width={16} strokeWidth={1.75} />
      </button>
    </li>
  );
}

function RemovedRoster({
  employees,
  onReactivate,
  pendingId,
}: {
  employees: EmployeeWithPoints[];
  onReactivate: (e: EmployeeWithPoints) => void;
  pendingId: string | null;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  if (employees.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 self-start px-1 text-xs font-semibold text-text-muted active:opacity-70"
      >
        {open ? (
          <ChevronUp width={14} strokeWidth={2} />
        ) : (
          <ChevronDown width={14} strokeWidth={2} />
        )}
        {open ? t('staff.hideRemoved') : t('staff.showRemoved', { n: employees.length })}
      </button>
      {open ? (
        <ul className="flex flex-col gap-1.5">
          {employees.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2/60 px-3 py-2.5"
            >
              <Avatar name={e.name} size={36} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-muted">
                {e.name}
              </span>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<RotateCcw width={14} strokeWidth={1.75} />}
                loading={pendingId === e.id}
                onClick={() => onReactivate(e)}
              >
                {t('staff.reactivate')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PastSubmissions({ dealerId }: { dealerId: string | undefined }) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const batchesQuery = useStaffBatches(dealerId, open);
  const batches = batchesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 self-start px-1 text-xs font-semibold text-text-muted active:opacity-70"
      >
        {open ? (
          <ChevronUp width={14} strokeWidth={2} />
        ) : (
          <ChevronDown width={14} strokeWidth={2} />
        )}
        {t('staff.pastSubmissions')}
      </button>
      {open ? (
        batchesQuery.isLoading ? (
          <div className="flex justify-center py-4">
            <Spinner size={16} />
          </div>
        ) : batches.length === 0 ? (
          <p className="px-1 py-2 text-xs text-text-subtle">
            {t('staff.pastEmpty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {batches.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text">{b.workDate}</p>
                  <p className="text-xs text-text-muted">
                    {t('staff.batchSummary', {
                      points: fmtPoints(b.totalPoints),
                      workers: b.employeeCount,
                    })}
                  </p>
                </div>
                {b.hardCopyImageUrl ? (
                  <a
                    href={b.hardCopyImageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text active:opacity-70"
                  >
                    <ImageIcon width={14} strokeWidth={1.75} />
                    {t('staff.viewHardcopy')}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

export function StaffPage() {
  const t = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const user = useAuthStore((s) => s.user);
  const dealerId = user?.dealerId ?? undefined;

  const [window, setWindow] = React.useState<PointsWindow>('today');
  const [addOpen, setAddOpen] = React.useState(false);
  const [giveOpen, setGiveOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EmployeeWithPoints | null>(null);

  // Roster INCLUDES removed (INACTIVE) workers so the "show removed" toggle can
  // list and reactivate them; the leaderboard shows only the active ones.
  const employeesQuery = useEmployees(dealerId, window, true);
  const employees = employeesQuery.data ?? [];
  const activeEmployees = React.useMemo(
    () => employees.filter((e) => e.status === 'ACTIVE'),
    [employees],
  );
  const removedEmployees = React.useMemo(
    () => employees.filter((e) => e.status === 'INACTIVE'),
    [employees],
  );
  const sorted = React.useMemo(
    () =>
      [...activeEmployees].sort((a, b) => b.pointsInWindow - a.pointsInWindow),
    [activeEmployees],
  );

  const workItemsQuery = useDealerWorkItems(dealerId);
  const workItems = workItemsQuery.data ?? [];

  const draftQuery = useStaffDraft(dealerId);
  const draftSync = useStaffDraftSync(dealerId, draftQuery.data);
  const draftEntries = useStaffDraftStore((s) =>
    dealerId ? s.byDealer[dealerId]?.entries : undefined,
  );
  const hasDraft = (draftEntries?.length ?? 0) > 0;

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

  const hasActiveWorkers = activeEmployees.length > 0;
  const showEmpty = !hasActiveWorkers && !addOpen && !hasDraft;

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
      ) : showEmpty ? (
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
              disabled={!hasActiveWorkers}
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

          <PendingSubmissionPanel
            dealerId={dealerId}
            workItems={workItems}
            employees={employees}
            sync={draftSync}
          />

          <p className="px-1 text-xs text-text-subtle">
            {t('staff.targetLegend')}
          </p>

          {hasActiveWorkers ? (
            <ul className="flex flex-col gap-2">
              {sorted.map((e) => (
                <LeaderboardRow key={e.id} employee={e} onEdit={setEditing} />
              ))}
            </ul>
          ) : null}

          <RemovedRoster
            employees={removedEmployees}
            onReactivate={onReactivate}
            pendingId={reactivatingId}
          />

          <PastSubmissions dealerId={dealerId} />
        </>
      )}

      {giveOpen ? (
        <GivePointsFlow
          dealerId={dealerId}
          employees={sorted}
          onClose={() => setGiveOpen(false)}
        />
      ) : null}

      {editing ? (
        <EditWorkerDialog
          dealerId={dealerId}
          employee={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
