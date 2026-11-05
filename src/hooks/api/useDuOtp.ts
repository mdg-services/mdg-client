import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api';
import { uploadDuOtpPaper } from '@/lib/uploadDuOtpPaper';
import { useAuthStore } from '@/store/auth';
import type { DuOtpAnswerInput, DuOtpFileSlot } from '@dk/shared/schemas';
import type { DuOtpAckView } from '@dk/shared/types';

/**
 * Where the outlet's DU OTP acknowledgements stand, for the box MDG posts in the
 * chat (`message.duOtpAck`, ADR 0033).
 *
 * The box is posted once and is never edited, so it keeps no copy of what was
 * true when it was posted: every box in the thread draws this one live view. The
 * server tells the app when it moved (`duOtp:changed`, see `useDuOtpSocket`) and
 * when a new box arrives (`useConversationSocket`), and every answer the owner
 * gives returns the whole view again, which goes straight into the cache.
 *
 * Asked for only by a box that is on screen, so a chat with no box in it never
 * makes the call.
 */
export const duOtpKey = ['du-otp', 'me'] as const;

const VIEW_PATH = '/v1/me/du-otp';
const ANSWER_PATH = '/v1/me/du-otp/answer';

/** How often the box looks again while a robot is working and the socket may have missed it. */
export const DU_OTP_POLL_MS = 5_000;

/**
 * Whether MDG's robot is working on something the box is waiting for: a
 * certificate being fetched from eMaaptaul, or a group being filed on the portal.
 * The socket says when it ends; this is the safety net for a missed event.
 */
export function duOtpIsBusy(view: DuOtpAckView | undefined): boolean {
  if (!view) return false;
  if (view.fetch.state === 'working') return true;
  return view.groups.some((g) => g.state === 'ready' || g.state === 'submitting');
}

export function useDuOtp() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: duOtpKey,
    // The dealer app's own route: an admin who happens to sign in here has no outlet.
    enabled: !!token && role !== 'admin',
    // Long enough that two boxes in one thread share one answer; the socket and
    // every answer replace it right away.
    staleTime: 30_000,
    // The owner steps out to download a certificate and comes back to this chat.
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (duOtpIsBusy(query.state.data) ? DU_OTP_POLL_MS : false),
    queryFn: () => api.get<DuOtpAckView>(VIEW_PATH),
  });
}

/** Ask the server again — an event, an answer or a submit moved something. */
export function invalidateDuOtp(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: duOtpKey });
}

/**
 * Give one answer. The server's reply is the outlet's whole fresh view, so it
 * replaces the cache at once and every box in the thread moves to the next step
 * together. Never retried: an answer that went through twice would walk the
 * steps on past where the owner is.
 *
 * A 409 means the step had already moved (another phone answered, or the portal
 * finished); the box looks again at once so it draws where things really stand.
 */
export function useAnswerDuOtp() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (body: DuOtpAnswerInput) => api.post<DuOtpAckView>(ANSWER_PATH, body),
    onSuccess: (view) => {
      qc.setQueryData(duOtpKey, view);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) invalidateDuOtp(qc);
    },
  });
}

export interface AnswerDuOtpPaperVars {
  /** The outlet the paper belongs to: `DuOtpAckView.dealerId`. */
  dealerId: string;
  group: string;
  slot: DuOtpFileSlot;
  file: File;
}

/**
 * Hand over one paper: put the file in storage with the ordinary presigned
 * upload (scope `du-otp`), then tell the server which key it landed under. One
 * mutation for both, so the box's "uploading" state covers the whole thing, and
 * a failed upload never reaches the server as an answer.
 */
export function useAnswerDuOtpPaper() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async ({ dealerId, group, slot, file }: AnswerDuOtpPaperVars) => {
      const { key, filename } = await uploadDuOtpPaper(file, dealerId);
      return api.post<DuOtpAckView>(ANSWER_PATH, { step: 'file', group, slot, key, filename });
    },
    onSuccess: (view) => {
      qc.setQueryData(duOtpKey, view);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) invalidateDuOtp(qc);
    },
  });
}
