import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AwardStaffPointsInput,
  AwardStaffPointsResult,
  EmployeeWithPoints,
  StaffPointsSummary,
  StaffWorkItem,
} from '@dk/shared/types';

import {
  employeesQueryKeyRoot,
  windowBounds,
  type PointsWindow,
} from './useEmployees';
import { staffWorkItemsQueryKey } from './useStaffWorkItems';

import { useToast } from '@/components/ui';
import { api, type ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtPoints, perEmployeePoints, round2 } from '@/lib/staff';


const summaryQueryKeyRoot = ['staff', 'summary'] as const;

/** Leaderboard aggregate for a window (a lighter mirror of the roster totals). */
export function useStaffSummary(
  dealerId: string | undefined,
  window: PointsWindow = 'today',
) {
  const { from, to } = windowBounds(window);
  return useQuery<StaffPointsSummary>({
    queryKey: ['staff', 'summary', dealerId, from, to],
    enabled: !!dealerId,
    queryFn: () =>
      api.get<StaffPointsSummary>(
        `/v1/dealers/${dealerId}/staff-points/summary`,
        { from, to },
      ),
  });
}

interface UndoVars {
  /** Any award row id from the batch. */
  id: string;
  /** `batch` removes every row created by the same award action. */
  scope?: 'batch';
}

/** Undo an award — hard-deletes the row (or the whole batch). No confirm dialog. */
export function useUndoAward(dealerId: string | undefined) {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  return useMutation<void, ApiError, UndoVars>({
    mutationFn: ({ id, scope }) =>
      api.del<void>(
        `/v1/dealers/${dealerId}/staff-points/${id}${
          scope === 'batch' ? '?scope=batch' : ''
        }`,
      ),
    onSuccess: () => {
      toast.success(t('staff.award.undone'));
    },
    onError: () => {
      toast.error(t('staff.award.failed'));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: employeesQueryKeyRoot });
      void qc.invalidateQueries({ queryKey: summaryQueryKeyRoot });
    },
  });
}

/**
 * Award points for a task. Optimistic: each selected worker's leaderboard total
 * ticks up instantly (using the same distribution maths the server applies), then
 * the server truth reconciles on settle. On success a toast confirms who earned
 * what, with an Undo that removes the whole batch (adoption rule: Undo, not a
 * confirm dialog). On error the optimistic bump is rolled back.
 */
export function useAwardStaffPoints(dealerId: string | undefined) {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  const undo = useUndoAward(dealerId);

  return useMutation<
    AwardStaffPointsResult,
    ApiError,
    AwardStaffPointsInput,
    { snapshots: [readonly unknown[], EmployeeWithPoints[] | undefined][] }
  >({
    mutationFn: (input) =>
      api.post<AwardStaffPointsResult>(
        `/v1/dealers/${dealerId}/staff-points`,
        input,
      ),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: employeesQueryKeyRoot });

      const catalog =
        qc.getQueryData<StaffWorkItem[]>(staffWorkItemsQueryKey) ?? [];
      const item = catalog.find((w) => w.code === input.workItemCode);
      const per = item
        ? perEmployeePoints(item, input.employeeIds.length, input.quantity)
        : 0;

      const snapshots = qc.getQueriesData<EmployeeWithPoints[]>({
        queryKey: employeesQueryKeyRoot,
      });

      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData<EmployeeWithPoints[]>(
          key,
          data.map((e) =>
            input.employeeIds.includes(e.id)
              ? {
                  ...e,
                  pointsInWindow: round2(e.pointsInWindow + per),
                  totalPoints: round2(e.totalPoints + per),
                }
              : e,
          ),
        );
      }

      return { snapshots };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.snapshots) {
        for (const [key, data] of ctx.snapshots) qc.setQueryData(key, data);
      }
      toast.error(t('staff.award.failed'));
    },
    onSuccess: (result, input) => {
      const first = result.awards[0];
      const undoAction = first
        ? {
            label: t('staff.award.undo'),
            onClick: () => undo.mutate({ id: first.id, scope: 'batch' }),
          }
        : undefined;

      if (input.employeeIds.length === 1 && first) {
        const name = findEmployeeName(qc, first.employeeId) ?? '';
        toast.success(
          t('staff.award.toastOne', {
            points: fmtPoints(first.points),
            name,
          }),
          { action: undoAction },
        );
      } else {
        toast.success(
          t('staff.award.toastMany', { count: input.employeeIds.length }),
          { action: undoAction },
        );
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: employeesQueryKeyRoot });
      void qc.invalidateQueries({ queryKey: summaryQueryKeyRoot });
    },
  });
}

/** Look up a worker's name from whichever employees list is cached. */
function findEmployeeName(
  qc: ReturnType<typeof useQueryClient>,
  employeeId: string,
): string | undefined {
  const lists = qc.getQueriesData<EmployeeWithPoints[]>({
    queryKey: employeesQueryKeyRoot,
  });
  for (const [, data] of lists) {
    const found = data?.find((e) => e.id === employeeId);
    if (found) return found.name;
  }
  return undefined;
}
