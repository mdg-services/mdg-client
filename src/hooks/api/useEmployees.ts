import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';


import { useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { istDate, istMonthStart } from '@/lib/staff';
import type {
  CreateEmployeeInput,
  EmployeeWithPoints,
  UpdateEmployeeInput,
} from '@dk/shared/types';

/** The leaderboard windows offered on the Staff screen. */
export type PointsWindow = 'today' | 'month';

/** Resolve a window to inclusive IST date bounds. */
export function windowBounds(window: PointsWindow): { from: string; to: string } {
  const to = istDate();
  return { from: window === 'month' ? istMonthStart() : to, to };
}

/** Prefix key for every employees list, so mutations can invalidate them all. */
export const employeesQueryKeyRoot = ['staff', 'employees'] as const;

export function employeesQueryKey(
  dealerId: string | undefined,
  from: string,
  to: string,
) {
  return ['staff', 'employees', dealerId, from, to] as const;
}

/**
 * The roster + each worker's points in the chosen window (default: today). Backs
 * the leaderboard — one legible list, sorted highest-first by the caller. Pass
 * `includeInactive` to also return removed (soft-deleted) workers so the roster's
 * "Show removed" toggle can list and reactivate them; the caller splits the list
 * by `status`.
 */
export function useEmployees(
  dealerId: string | undefined,
  window: PointsWindow = 'today',
  includeInactive = false,
) {
  const { from, to } = windowBounds(window);
  return useQuery<EmployeeWithPoints[]>({
    queryKey: [...employeesQueryKey(dealerId, from, to), includeInactive],
    enabled: !!dealerId,
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
