import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  StaffPointAward,
  StaffPointBatch,
  StaffPointDraftView,
} from '@dk/shared/types';

import { employeesQueryKeyRoot } from './useEmployees';

import { api, type ApiError } from '@/lib/api';

/** Query key for a dealer's single active server draft. */
export function staffDraftQueryKey(dealerId: string | undefined) {
  return ['staff', 'draft', dealerId] as const;
}

/** Query key root for a dealer's finalized submission batches. */
export function staffBatchesQueryKey(dealerId: string | undefined) {
  return ['staff', 'batches', dealerId] as const;
}

const summaryQueryKeyRoot = ['staff', 'summary'] as const;

/** Body accepted by PUT /staff-points/draft (autosave — a full replace). */
export interface SaveStaffDraftInput {
  entries: StaffPointDraftView['entries'];
  workDate?: string;
  note?: string;
}

/** Body accepted by POST /staff-points/draft/finalize. */
export interface FinalizeStaffDraftInput {
  hardCopyImageKey: string;
  workDate?: string;
  note?: string;
}

export interface FinalizeStaffDraftResult {
  batch: StaffPointBatch;
  awards: StaffPointAward[];
}

/**
 * The dealer's server-synced draft (or null when none exists). Kept fresh so a
 * second device / re-open reconciles; the local store mirrors it for instant,
 * offline-safe edits (see useStaffDraftAutosync).
 */
export function useStaffDraft(dealerId: string | undefined) {
  return useQuery<StaffPointDraftView | null>({
    queryKey: staffDraftQueryKey(dealerId),
    enabled: !!dealerId,
    queryFn: () =>
      api.get<StaffPointDraftView | null>(
        `/v1/dealers/${dealerId}/staff-points/draft`,
      ),
  });
}

/**
 * Autosave the draft (debounced by the caller). Safe to call often — the server
 * merges same-(employee, work) entries and never audits a draft write. Writes
 * the fresh view straight into the query cache so the reconciler adopts it.
 */
export function useSaveStaffDraft(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<StaffPointDraftView, ApiError, SaveStaffDraftInput>({
    mutationFn: (input) =>
      api.put<StaffPointDraftView>(
        `/v1/dealers/${dealerId}/staff-points/draft`,
        input,
      ),
    onSuccess: (view) => {
      qc.setQueryData(staffDraftQueryKey(dealerId), view);
    },
  });
}

/** Clear the entire draft (server DELETE → 204). */
export function useClearStaffDraft(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: () =>
      api.del<void>(`/v1/dealers/${dealerId}/staff-points/draft`),
    onSuccess: () => {
      qc.setQueryData(staffDraftQueryKey(dealerId), null);
    },
  });
}

/**
 * Finalize the draft into the immutable award ledger, pinned to a mandatory
 * hardcopy photo. On success the draft is gone (query → null) and the leaderboard
 * refetches so the newly-awarded points appear. On failure NOTHING is lost — the
 * server draft and the local store both stay intact for a retry.
 */
export function useFinalizeStaffDraft(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<FinalizeStaffDraftResult, ApiError, FinalizeStaffDraftInput>(
    {
      mutationFn: (input) =>
        api.post<FinalizeStaffDraftResult>(
          `/v1/dealers/${dealerId}/staff-points/draft/finalize`,
          input,
        ),
      onSuccess: () => {
        qc.setQueryData(staffDraftQueryKey(dealerId), null);
        void qc.invalidateQueries({ queryKey: employeesQueryKeyRoot });
        void qc.invalidateQueries({ queryKey: summaryQueryKeyRoot });
        void qc.invalidateQueries({ queryKey: staffBatchesQueryKey(dealerId) });
      },
    },
  );
}

/**
 * Past finalized submissions (each with a signed hardcopy photo URL). Fetched
 * lazily — pass `enabled: false` until the "Past submissions" section is opened
 * so it doesn't load over 2G on every Staff visit.
 */
export function useStaffBatches(dealerId: string | undefined, enabled = true) {
  return useQuery<StaffPointBatch[]>({
    queryKey: staffBatchesQueryKey(dealerId),
    enabled: !!dealerId && enabled,
    queryFn: () =>
      api.get<StaffPointBatch[]>(
        `/v1/dealers/${dealerId}/staff-points/batches`,
      ),
  });
}
