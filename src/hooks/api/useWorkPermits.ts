import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api';
import { uploadWorkPermitPhoto } from '@/lib/uploadWorkPermitPhoto';
import { useAuthStore } from '@/store/auth';
import type { WorkPermitAnswerInput } from '@dk/shared/schemas';
import type { WorkPermitDealerView, WorkPermitsMeView } from '@dk/shared/types';

/**
 * Where the outlet's work permits stand, for the boxes MDG posts in the chat
 * (`message.workPermit`, ADR 0053). Same shape as the complaint boxes: one live
 * view, only the message it names (`liveMessageId`) draws buttons, every answer
 * returns the fresh view, and the server says when it moved (`workPermits:changed`).
 */
export const workPermitsKey = ['work-permits', 'me'] as const;

const VIEW_PATH = '/v1/me/work-permits';
const ANSWER_PATH = '/v1/me/work-permits/answer';

/** How often a box looks again while a run is working and the socket may have missed it. */
export const WORK_PERMITS_POLL_MS = 5_000;

/** A run is working: the dealer has nothing to do but wait. */
export function workPermitIsBusy(view: WorkPermitDealerView): boolean {
  return view.screen === 'looking_up' || view.screen === 'issuing' || view.screen === 'closing';
}

export function useWorkPermits() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: workPermitsKey,
    enabled: !!token && role !== 'admin',
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.permits.some(workPermitIsBusy) ? WORK_PERMITS_POLL_MS : false,
    queryFn: () => api.get<WorkPermitsMeView>(VIEW_PATH),
  });
}

/** Ask the server again: an event, an answer or a run moved something. */
export function invalidateWorkPermits(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: workPermitsKey });
}

/** Give one answer. Never retried; a 409 means the question moved, so the box looks again at once. */
export function useAnswerWorkPermit() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (body: WorkPermitAnswerInput) => api.post<WorkPermitsMeView>(ANSWER_PATH, body),
    onSuccess: (view) => {
      qc.setQueryData<WorkPermitsMeView>(workPermitsKey, view);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) invalidateWorkPermits(qc);
    },
  });
}

export interface AnswerWorkPermitPhotoVars {
  dealerId: string;
  permitId: string;
  questionId: string;
  file: File;
}

/** One photo: put the file in storage (scope `work-permit`), then tell the server its key. */
export function useAnswerWorkPermitPhoto() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async ({ dealerId, permitId, questionId, file }: AnswerWorkPermitPhotoVars) => {
      const { key } = await uploadWorkPermitPhoto(file, dealerId);
      return api.post<WorkPermitsMeView>(ANSWER_PATH, { step: 'photo', permitId, questionId, key });
    },
    onSuccess: (view) => {
      qc.setQueryData<WorkPermitsMeView>(workPermitsKey, view);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) invalidateWorkPermits(qc);
    },
  });
}

/** A fresh short-lived link to the permit's PDF, or the letter MDG wrote. Asked for at the moment of opening. */
export function fetchWorkPermitFile(
  permitId: string,
  doc: 'pdf' | 'letter',
): Promise<{ url: string }> {
  return api.get<{ url: string }>(`${VIEW_PATH}/${encodeURIComponent(permitId)}/file`, { doc });
}
