import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { istDate, istMonthStart, lastMonthBounds } from '@/lib/staff';
import type {
  CreateEmployeeInput,
  EmployeeLeave,
  EmployeeWithPoints,
  UpdateEmployeeInput,
} from '@dk/shared/types';

/** The leaderboard windows offered on the Staff screen. */
export type PointsWindow = 'today' | 'month' | 'lastMonth';

/** Resolve a window to inclusive IST date bounds. */
export function windowBounds(window: PointsWindow): { from: string; to: string } {
  const to = istDate();
  if (window === 'lastMonth') return lastMonthBounds(to);
  return { from: window === 'month' ? istMonthStart() : to, to };
}

/** Prefix key for every employees list, so mutations can invalidate them all. */
export const employeesQueryKeyRoot = ['staff', 'employees'] as const;

export function employeesQueryKey(dealerId: string | undefined, from: string, to: string) {
  return ['staff', 'employees', dealerId, from, to] as const;
}

/**
 * The roster + each worker's points between two days (inclusive, `YYYY-MM-DD`). Any bounds work
 * (the server takes `from` and `to` as they come), which is how the Warriors page reads "this
 * month" and "the same days last month" with two calls of one route. Pass `includeInactive` to also
 * return removed (soft-deleted) workers so the roster's "Show removed" toggle can list and
 * reactivate them; the caller splits the list by `status`. `enabled: false` waits (a window that
 * is only needed once something else is on screen).
 */
export function useEmployeesBetween(
  dealerId: string | undefined,
  from: string,
  to: string,
  includeInactive = false,
  enabled = true,
) {
  return useQuery<EmployeeWithPoints[]>({
    queryKey: [...employeesQueryKey(dealerId, from, to), includeInactive],
    enabled: !!dealerId && enabled,
    // The roster is the heaviest list in the app. Cache each window for a minute
    // and keep the previous window's rows on screen while the new one loads, so
    // flipping today/month doesn't blank the leaderboard or refetch over 2G every
    // time. Explicit invalidations (add/edit worker, award points) still refetch.
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () =>
      api.get<EmployeeWithPoints[]>(`/v1/dealers/${dealerId}/employees`, {
        from,
        to,
        includeInactive: includeInactive ? 'true' : undefined,
      }),
  });
}

/**
 * The roster + each worker's points in the chosen window (default: today). Backs
 * the leaderboard — one legible list, sorted highest-first by the caller.
 */
export function useEmployees(
  dealerId: string | undefined,
  window: PointsWindow = 'today',
  includeInactive = false,
) {
  const { from, to } = windowBounds(window);
  return useEmployeesBetween(dealerId, from, to, includeInactive);
}

/** Prefix key for every leave list, so setting or clearing leave refreshes them all. */
export const employeeLeaveQueryKeyRoot = ['staff', 'leave'] as const;

/**
 * Every leave day in a window, for every worker (`GET .../employees/leave?from&to`). The person
 * page filters it to one worker; the working-day count of the "average per day" needs it.
 */
export function useEmployeeLeave(
  dealerId: string | undefined,
  from: string,
  to: string,
  enabled = true,
) {
  return useQuery<EmployeeLeave[]>({
    queryKey: [...employeeLeaveQueryKeyRoot, dealerId, from, to],
    enabled: !!dealerId && enabled,
    staleTime: 60_000,
    queryFn: () =>
      api.get<EmployeeLeave[]>(`/v1/dealers/${dealerId}/employees/leave`, { from, to }),
  });
}

/** Add a worker to the roster. */
export function useAddEmployee(dealerId: string | undefined) {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  return useMutation({
    mutationFn: (input: CreateEmployeeInput) =>
      api.post(`/v1/dealers/${dealerId}/employees`, input),
    onSuccess: () => {
      toast.success(t('staff.form.added'));
      void qc.invalidateQueries({ queryKey: employeesQueryKeyRoot });
    },
    onError: () => {
      toast.error(t('staff.form.addFailed'));
    },
  });
}

/**
 * Edit a worker or flip their active/inactive status (rename / soft-remove /
 * reactivate). The generic failure toast is centralized here; callers supply
 * their own specific success toast (renamed / removed / brought back) via the
 * per-call `onSuccess`, so there's exactly one, meaningful message.
 */
export function useUpdateEmployee(dealerId: string | undefined) {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEmployeeInput }) =>
      api.patch(`/v1/dealers/${dealerId}/employees/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: employeesQueryKeyRoot });
    },
    onError: () => {
      toast.error(t('profile.actionFailed'));
    },
  });
}

/**
 * Mark a worker on leave (छुट्टी) for a day — defaults to today when `date` is
 * omitted. Leave carries no points; it just lets a 0-point day read as "on leave"
 * instead of "did no work". The caller supplies its own success toast.
 */
export function useSetEmployeeLeave(dealerId: string | undefined) {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  return useMutation({
    mutationFn: ({ id, date, note }: { id: string; date?: string; note?: string }) =>
      api.post(`/v1/dealers/${dealerId}/employees/${id}/leave`, { date, note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: employeesQueryKeyRoot });
      void qc.invalidateQueries({ queryKey: employeeLeaveQueryKeyRoot });
    },
    onError: () => {
      toast.error(t('profile.actionFailed'));
    },
  });
}

/** Remove a worker's leave for a day (undo "on leave"). */
export function useRemoveEmployeeLeave(dealerId: string | undefined) {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  return useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) =>
      api.del(`/v1/dealers/${dealerId}/employees/${id}/leave/${date}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: employeesQueryKeyRoot });
      void qc.invalidateQueries({ queryKey: employeeLeaveQueryKeyRoot });
    },
    onError: () => {
      toast.error(t('profile.actionFailed'));
    },
  });
}
