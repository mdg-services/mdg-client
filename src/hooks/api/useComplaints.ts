import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { ComplaintAnswerInput } from '@dk/shared/schemas';
import type { ComplaintDealerView, ComplaintsMeView } from '@dk/shared/types';

/**
 * Where the outlet's maintenance complaints stand, for the boxes MDG posts in the
 * chat (`message.complaint`, ADR 0052).
 *
 * A box is a message and a message is never edited, so no box keeps a copy of what
 * was true when it was posted: every box draws this one live view, and only the box
 * on the message the view names (`liveMessageId`) draws buttons. The server says
 * when it moved (`complaints:changed`, see `useComplaintsSocket`) and when a new box
 * arrives (`useConversationSocket`); every answer returns the fresh view, which goes
 * straight into the cache.
 *
 * Asked for only by a box that is on screen.
 */
export const complaintsKey = ['complaints', 'me'] as const;

const VIEW_PATH = '/v1/me/complaints';
const ANSWER_PATH = '/v1/me/complaints/answer';

/** How often a box looks again while a robot is working and the socket may have missed it. */
export const COMPLAINTS_POLL_MS = 5_000;

/** A robot is filing, or telling the portal the dealer's answer: the dealer has nothing to do but wait. */
export function complaintIsBusy(view: ComplaintDealerView): boolean {
  return view.screen === 'filing' || view.screen === 'acknowledging';
}

export function useComplaints() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: complaintsKey,
    // The dealer app's own route: an admin who happens to sign in here has no outlet.
    enabled: !!token && role !== 'admin',
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.complaints.some(complaintIsBusy) ? COMPLAINTS_POLL_MS : false,
    queryFn: () => api.get<ComplaintsMeView>(VIEW_PATH),
  });
}

/** Ask the server again: an event, an answer or a run moved something. */
export function invalidateComplaints(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: complaintsKey });
}

/**
 * Put an answer's reply into the cache. The reply is the fresh view: the whole
 * list, or just the one complaint that moved (then it replaces its row, or joins
 * the list if the cache had never heard of it).
 */
export function applyComplaintsReply(
  prev: ComplaintsMeView | undefined,
  reply: ComplaintsMeView | ComplaintDealerView,
): ComplaintsMeView {
  if ('complaints' in reply) return reply;
  const rest = (prev?.complaints ?? []).filter((c) => c.id !== reply.id);
  const had = (prev?.complaints ?? []).some((c) => c.id === reply.id);
  return {
    complaints: had
      ? (prev?.complaints ?? []).map((c) => (c.id === reply.id ? reply : c))
      : [reply, ...rest],
  };
}

/**
 * Give one answer. Never retried: an answer that went through twice would walk the
 * complaint on past where the dealer is. A 409 means the question had already
 * moved (another phone answered, or the robot did); the box looks again at once.
 */
export function useAnswerComplaint() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (body: ComplaintAnswerInput) =>
      api.post<ComplaintsMeView | ComplaintDealerView>(ANSWER_PATH, body),
    onSuccess: (reply) => {
      qc.setQueryData<ComplaintsMeView>(complaintsKey, (prev) => applyComplaintsReply(prev, reply));
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) invalidateComplaints(qc);
    },
  });
}
