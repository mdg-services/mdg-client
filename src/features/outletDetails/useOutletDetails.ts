import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { SaveOutletDetailsInput } from '@dk/shared/schemas';
import type { OutletDetailsView } from '@dk/shared/types';

import { isOutletDetailsView } from './outletDetailsView';

/**
 * The outlet's Pump details as they stand NOW — what the form in the chat draws
 * (`message.outletDetails`).
 *
 * The message that carries the form is posted once and never edited, so it keeps
 * no answers of its own: every form in the thread draws this one view, and an old
 * message therefore always shows the current answers. A new form arriving, and
 * the window coming back to the front, both ask again, so an answer MDG's team
 * saved for the dealer shows up without a refresh.
 *
 * Asked for only by a form that is on screen.
 */
export const outletDetailsKey = ['outletDetails'] as const;

const PATH = '/v1/me/outlet-details';

export function useOutletDetails() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: outletDetailsKey,
    // The dealer app's own route: an admin who happens to sign in here has no outlet.
    enabled: !!token && role !== 'admin',
    staleTime: 30_000,
    // The app's default is "never" (the WebView fires focus on every keyboard
    // open); this view is small, and it is the thing a dealer comes back to look at.
    refetchOnWindowFocus: true,
    queryFn: () => api.get<OutletDetailsView>(PATH),
  });
}

/** Ask the server again: a new form arrived, or something moved. */
export function invalidateOutletDetails(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: outletDetailsKey });
}

/**
 * Save the answers the owner changed (and only those). Never retried: the server
 * answers with the whole fresh view, which goes straight into the cache so every
 * form in the thread flips at once. An answer that is not a view is asked for
 * again, and the save is not "done" until that is in.
 */
export function useSaveOutletDetails() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (input: SaveOutletDetailsInput) => api.put<unknown>(PATH, input),
    onSuccess: (data) => {
      if (isOutletDetailsView(data)) {
        qc.setQueryData(outletDetailsKey, data);
        return undefined;
      }
      return qc.invalidateQueries({ queryKey: outletDetailsKey });
    },
    // A refused save leaves the form guessing what is kept: read it again.
    onError: () => invalidateOutletDetails(qc),
  });
}
