import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { Attachment, KavachDealerCheck, KavachDealerView } from '@dk/shared/types';

/**
 * The outlet's Kavach, as the dealer sees it (ADR 0057 §11): one call, `GET /v1/kavach/me`.
 *
 * ONE QUERY FOR EVERY SCREEN. The tab's badge, the Kavach page and the Today tile all read this
 * same cache entry, so the badge costs no request of its own. It is asked for again when the
 * server says the outlet's Kavach moved (`kavach:changed`, see `useKavachSocket`), when the app
 * comes back to the front, and after every send.
 */
export const kavachKey = ['kavach', 'me'] as const;
export const kavachCheckKey = (checkId: string) => ['kavach', 'check', checkId] as const;

const ME = '/v1/kavach/me';

export function useKavach() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: kavachKey,
    // The dealer app's own route: an admin who signs in here has no outlet.
    enabled: !!token && role !== 'admin',
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: () => api.get<KavachDealerView>(ME),
  });
}

/** Ask the server again: an event or a send moved something. Cheap when nobody is looking. */
export function invalidateKavach(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: kavachKey });
  // An open row's details are about one check: they follow the same event.
  void qc.invalidateQueries({ queryKey: ['kavach', 'check'] });
}

/** One check with its history, for the sheet a row opens. Asked for only while the sheet is open. */
export function useKavachCheck(checkId: string | null) {
  return useQuery({
    queryKey: kavachCheckKey(checkId ?? ''),
    enabled: !!checkId,
    staleTime: 15_000,
    queryFn: () => api.get<KavachDealerCheck>(`${ME}/checks/${encodeURIComponent(checkId ?? '')}`),
  });
}

/** A short-lived signed link to the sheet MDG made for this check (an inline PDF). */
export function fetchKavachSheet(checkId: string): Promise<{ url: string }> {
  return api.get<{ url: string }>(`${ME}/checks/${encodeURIComponent(checkId)}/sheet`);
}

export interface KavachSendInput {
  /** The check being answered, or the code of a when-it-happens point. */
  target: { checkId: string } | { code: string };
  files: Attachment[];
  note?: string | null;
}

/**
 * Send the files for a check (`POST …/checks/:id/submit`) or for a when-it-happens point
 * (`POST …/events/:code`). Files are uploaded first (scope `kavach`); this only files the
 * answer. Never retried by itself: a send that may have landed must not go twice. The view is
 * asked for again whether it worked or not, so a 409 (the check moved) shows what is true.
 */
export function useKavachSend() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    retry: false,
    // Offline must end in "it did not go" (the caller times it out), not park the send for ever.
    networkMode: 'always',
    mutationFn: ({ target, files, note }: KavachSendInput) => {
      const body = { files, note: note ?? null };
      return 'checkId' in target
        ? api.post<unknown>(`${ME}/checks/${encodeURIComponent(target.checkId)}/submit`, body)
        : api.post<unknown>(`${ME}/events/${encodeURIComponent(target.code)}`, body);
    },
    onSettled: () => invalidateKavach(qc),
  });
}
