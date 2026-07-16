import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';


import { createEmployeeSchema } from '@dk/shared/schemas';
import type { EmployeeWithPoints } from '@dk/shared/types';

import { Button, Input, useToast } from '@/components/ui';
import {
  useRemoveEmployeeLeave,
  useSetEmployeeLeave,
  useUpdateEmployee,
} from '@/hooks/api/useEmployees';
import { useT } from '@/lib/i18n';
import { istDate } from '@/lib/staff';
import { useScrollLock } from '@/lib/useScrollLock';

interface EditWorkerValues {
  name: string;
  phone?: string;
  designation?: string;
}

/**
 * Rename a worker (name + optional role/phone) or soft-remove them (status →
 * INACTIVE, which keeps their point history). Removal asks for a confirm first.
 */
export function EditWorkerDialog({
  dealerId,
  employee,
  onClose,
}: {
  dealerId: string | undefined;
  employee: EmployeeWithPoints;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const update = useUpdateEmployee(dealerId);
  const setLeave = useSetEmployeeLeave(dealerId);
  const removeLeave = useRemoveEmployeeLeave(dealerId);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  // Lock the StaffPage behind the dialog so its backdrop doesn't scroll the page.
  useScrollLock();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditWorkerValues>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      name: employee.name,
      phone: employee.phone ?? '',
      designation: employee.designation ?? '',
    },
  });

  const onSave = handleSubmit((values) => {
    update.mutate(
      {
        id: employee.id,
        input: {
          name: values.name.trim(),
          phone: values.phone?.trim() || undefined,
          designation: values.designation?.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('staff.workerUpdated'));
          onClose();
        },
      },
    );
  });

  const onRemove = () => {
    update.mutate(
      { id: employee.id, input: { status: 'INACTIVE' } },
      {
        onSuccess: () => {
          toast.success(t('staff.workerRemoved'));
          onClose();
        },
      },
    );
  };

  // Leave (छुट्टी). The primary action is today ("who's off today"); a smaller
  // option covers yesterday, since owners often realise a day late.
  const yesterdayIST = istDate(new Date(Date.now() - 864e5));
  const markLeave = (date?: string) => {
    setLeave.mutate(
      { id: employee.id, date },
      {
        onSuccess: () => {
          toast.success(
            t(date === yesterdayIST ? 'staff.leaveMarkedYesterday' : 'staff.leaveMarked', {
              name: employee.name,
            }),
          );
          onClose();
        },
      },
    );
  };

  const onClearLeave = () => {
    removeLeave.mutate(
      { id: employee.id, date: istDate() },
      {
        onSuccess: () => {
          toast.success(t('staff.leaveCleared', { name: employee.name }));
          onClose();
        },
      },
    );
  };

  const leaveBusy = setLeave.isPending || removeLeave.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('common.cancel')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div className="animate-in relative w-full max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">
            {t('staff.editWorker')}
          </h2>
          <button
            type="button"
            aria-label={t('common.cancel')}
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted active:bg-surface-2"
          >
            <X width={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Leave (छुट्टी) first — a resistant owner glancing at a "0" row needs to
            find this immediately, not scroll past the Save button. */}
        <div className="mb-3 rounded-xl border border-border bg-surface-2/40 p-3">
          {employee.onLeaveToday ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                  {t('staff.onLeave')}
                </span>
                <span className="truncate text-xs text-text-muted">
                  {t('staff.leaveTodayHint')}
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={leaveBusy}
                onClick={onClearLeave}
              >
                {t('staff.clearLeave')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-text-muted">{t('staff.markLeaveHint')}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  fullWidth
                  loading={leaveBusy}
                  onClick={() => markLeave()}
                >
                  {t('staff.markLeave')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={leaveBusy}
                  onClick={() => markLeave(yesterdayIST)}
                >
                  {t('staff.markLeaveYesterday')}
                </Button>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={onSave} className="flex flex-col gap-2" noValidate>
          <label className="px-1 text-xs font-semibold text-text-muted">
            {t('staff.workerName')}
          </label>
          <Input
            autoFocus
            autoCapitalize="words"
            autoComplete="off"
            spellCheck={false}
            invalid={!!errors.name}
            placeholder={t('staff.form.namePlaceholder')}
            {...register('name')}
          />
          {errors.name ? (
            <p className="px-1 text-xs text-danger">
              {t('staff.form.nameRequired')}
            </p>
          ) : null}

          <label className="mt-1 px-1 text-xs font-semibold text-text-muted">
            {t('staff.workerDesignation')}
          </label>
          <Input
            placeholder={t('staff.form.designationPlaceholder')}
            autoCapitalize="words"
            spellCheck={false}
            {...register('designation')}
          />

          <label className="mt-1 px-1 text-xs font-semibold text-text-muted">
            {t('staff.workerPhone')}
          </label>
          <Input
            type="tel"
            inputMode="tel"
            placeholder={t('staff.form.phonePlaceholder')}
            {...register('phone')}
          />

          <Button
            type="submit"
            size="md"
            fullWidth
            className="mt-2"
            loading={update.isPending && !confirmRemove}
          >
            {t('staff.saveChanges')}
          </Button>
        </form>

        <div className="mt-3 border-t border-border pt-3">
          {confirmRemove ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-text-muted">
                {t('staff.removeWorkerConfirm', { name: employee.name })}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="danger"
                  size="md"
                  fullWidth
                  loading={update.isPending}
                  onClick={onRemove}
                >
                  {t('staff.removeWorker')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setConfirmRemove(false)}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="md"
              fullWidth
              className="text-danger"
              onClick={() => setConfirmRemove(true)}
            >
              {t('staff.removeWorker')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
