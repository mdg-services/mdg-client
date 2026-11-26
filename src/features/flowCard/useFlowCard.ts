import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api, ApiError } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { onSocketReconnect } from '@/lib/socketReconnect';
import { useAuthStore } from '@/store/auth';
import type { FlowCardAnswer, FlowCardFlow, FlowCardResult, FlowCardView, SomeDealerWords } from '@dk/shared/types';

/**
 * THE LIVING CARD's data (ADR 0059). A card is a message and a message is never edited,
 * so the card is always read from the server as it is NOW (`GET /me/flow-cards/:flow/:ref`)
 * and every message that carries the same card shares one cache entry. Only the message
 * the card names live paints it.
 *
 * The server says when a card moved (`flowcard:changed`, `useFlowCardSocket`); every
 * answer returns the card after the change, which goes straight into the cache. While MDG
 * is placing an order the card looks again every few seconds, in case the socket missed it.
 */
export const flowCardKey = (flow: string, ref: string) => ['flow-card', flow, ref] as const;

/** How often a card looks again while MDG is working on it. */
export const FLOW_CARD_POLL_MS = 4_000;

const path = (flow: string, ref: string) => `/v1/me/flow-cards/${encodeURIComponent(flow)}/${encodeURIComponent(ref)}`;

export function useFlowCard(flow: FlowCardFlow, ref: string) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: flowCardKey(flow, ref),
    enabled: !!token && role !== 'admin',
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => (q.state.data?.status === 'working' ? FLOW_CARD_POLL_MS : false),
    queryFn: () => api.get<FlowCardView>(path(flow, ref)),
  });
}

/** Ask every card again: an event, a reconnect, a new message. Cheap when none is on screen. */
export function invalidateFlowCards(qc: QueryClient, flow?: string, ref?: string): void {
  void qc.invalidateQueries({ queryKey: flow && ref ? flowCardKey(flow, ref) : ['flow-card'] });
}

/** The server's words for a refusal, in every dealer language, when it sent them. */
export function refusalWords(err: unknown): SomeDealerWords | null {
  if (!(err instanceof ApiError)) return null;
  const d = err.details as { words?: SomeDealerWords } | undefined;
  return d?.words && typeof d.words === 'object' ? d.words : null;
}

/**
 * A tap on a pill, or a typed number. Never retried: a second copy of a tap could move
 * the order past where the owner is. A 409 means the card moved (another phone, the
 * order desk): the card looks again at once.
 */
export function useAnswerFlowCard(flow: FlowCardFlow, ref: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FlowCardAnswer) => api.post<FlowCardResult>(`${path(flow, ref)}/answer`, body),
    retry: false,
    onSuccess: (out) => qc.setQueryData(flowCardKey(flow, ref), out.card),
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) invalidateFlowCards(qc, flow, ref);
    },
  });
}

/** A foot button ("Order lagaiye", "Dobara lagaiye"). Sends the stamp the card was drawn with. */
export function useActOnFlowCard(flow: FlowCardFlow, ref: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: string; stamp: string }) => api.post<FlowCardResult>(`${path(flow, ref)}/action`, body),
    retry: false,
    onSuccess: (out) => {
      qc.setQueryData(flowCardKey(flow, ref), out.card);
      // A new card was started ("Dobara lagaiye"): its message arrives by socket.
      if (out.nextRef) invalidateFlowCards(qc, flow, out.nextRef);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) invalidateFlowCards(qc, flow, ref);
    },
  });
}

/**
 * Keep the cards live: the server names the card that moved; that card is asked for
 * again. After a reconnect every card asks, since an event may have been missed.
 * Mounted once in the app frame.
 */
export function useFlowCardSocket() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const dealerId = useAuthStore((s) => s.user?.dealerId ?? null);
  React.useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;
    const onChanged = (p: { dealerId: string; flow: string; ref: string }) => {
      if (dealerId && p.dealerId !== dealerId) return;
      invalidateFlowCards(qc, p.flow, p.ref);
    };
    const offReconnect = onSocketReconnect(socket, () => invalidateFlowCards(qc));
    socket.on('flowcard:changed', onChanged);
    return () => {
      offReconnect();
      socket.off('flowcard:changed', onChanged);
    };
  }, [token, dealerId, qc]);
}
