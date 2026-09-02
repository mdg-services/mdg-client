import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { askMatchKey } from '@/features/asks/askRules';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { onSocketReconnect } from '@/lib/socketReconnect';
import { useAuthStore } from '@/store/auth';
import type { SubmitDocumentAskInput, VolunteerDocumentAskInput } from '@dk/shared/schemas';
import type { DealerDocumentAskList, DealerDocumentAskRow } from '@dk/shared/types';

/**
 * Everything MDG is asking this dealer for, in one query.
 *
 * ONE REQUEST, not two: the payload carries the rows AND the catalog the "send
 * something" sheet needs, because a second round trip on a forecourt 2G
 * connection is a second chance to fail. It also carries `today` — the IST
 * calendar day the server formatted its labels against — so every date this app
 * prints is anchored to the server's idea of the day rather than to a phone
 * whose clock may be anywhere.
 */
export const askListQueryKey = ['asks', 'me'] as const;

export function useMyAsks() {
  const token = useAuthStore((s) => s.token);
  return useQuery<DealerDocumentAskList>({
    queryKey: askListQueryKey,
    enabled: !!token,
    // Half a minute, matching `useDensityMe`. The socket below is what keeps
    // this fresh in practice; the stale time only decides how often a screen
    // that was left open re-asks on its own.
    staleTime: 30_000,
    queryFn: () => api.get<DealerDocumentAskList>('/v1/asks/me'),
  });
}

/**
 * Fold one server-sent row into the cached list.
 *
 * MATCHED ON `(kindCode, periodKey)`, NOT ON THE ID, and that is the whole
 * reason this is a function rather than three lines at the call site. When a
 * dealer answers a derived `owed` line, the server mints a real ask with a brand
 * new id and broadcasts THAT row; an id match would miss, the list would be
 * invalidated, and a 2G refetch would happen for a row we were already holding.
 *
 * A row that has been closed with nothing owed on either side (`WITHDRAWN`,
 * `EXPIRED`) is REMOVED rather than replaced: the list route does not return
 * those, so leaving one on screen would show the dealer work that no longer
 * exists — and a request MDG has withdrawn is not a request.
 */
export function applyAskRow(qc: QueryClient, row: DealerDocumentAskRow): void {
  const current = qc.getQueryData<DealerDocumentAskList>(askListQueryKey);
  if (!current) {
    void qc.invalidateQueries({ queryKey: askListQueryKey });
    return;
  }
  const key = askMatchKey(row);
  const gone = row.state === 'WITHDRAWN' || row.state === 'EXPIRED';
  const idx = current.rows.findIndex((r) => askMatchKey(r) === key);

  if (gone) {
    if (idx < 0) return;
    qc.setQueryData<DealerDocumentAskList>(askListQueryKey, {
      ...current,
      rows: current.rows.filter((_, i) => i !== idx),
    });
    return;
  }

  if (idx < 0) {
    // A paper we had not heard of — MDG has just asked for something new. The
    // ORDER of this list is decided by the server (whose turn, then how old,
    // then the catalog's own order), so a row is never spliced in at a guessed
    // position; the refetch puts it where it belongs.
    void qc.invalidateQueries({ queryKey: askListQueryKey });
    return;
  }

  const rows = current.rows.slice();
  rows[idx] = row;
  qc.setQueryData<DealerDocumentAskList>(askListQueryKey, { ...current, rows });
}

/**
 * Keep the list live while the dealer holds the phone.
 *
 * "MDG needs last Tuesday's register page" has to arrive in minutes: the person
 * who can find that page is standing at the forecourt now, and by tomorrow
 * morning it is under a week of paperwork. The push notification covers a phone
 * in a pocket; this covers a phone already in a hand, where a silence followed
 * by a list that changed on the next pull-to-refresh reads as a bug.
 *
 * The re-connect refresh is the same guard `useRecordsSocket` carries: events
 * that fired while the socket was down are invisible, and a 2G link drops the
 * socket without ever going `offline`.
 */
export function useAskListSocket(): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;

    const onUpdated = (payload: { row: DealerDocumentAskRow }) => {
      applyAskRow(qc, payload.row);
    };
    const offReconnect = onSocketReconnect(socket, () => {
      void qc.invalidateQueries({ queryKey: askListQueryKey });
    });

    socket.on('document-ask:updated', onUpdated);
    return () => {
      socket.off('document-ask:updated', onUpdated);
      offReconnect();
    };
  }, [qc, token]);
}

/**
 * Mint the row for a period nobody has made one for yet.
 *
 * A derived `owed` line is not a record of anything — there is no row anywhere,
 * which is why its id is a label and not a handle. An upload is filed under
 * `ask/<dealerId>/<askId>/`, so there is nowhere to put the photograph until
 * this has run. The order is therefore volunteer → presign → PUT → submit, and
 * this call is what turns "the rule says you owe Tuesday" into something with an
 * id.
 *
 * `path` comes from the row's own `submitVia`, never from a constant here.
 */
export function volunteerAsk(
  path: string,
  body: VolunteerDocumentAskInput,
): Promise<DealerDocumentAskRow> {
  return api.post<DealerDocumentAskRow>(path, body);
}

/** Hand the paper over. `path` is the row's `submitVia`, chosen by the server. */
export function submitAsk(
  path: string,
  body: SubmitDocumentAskInput,
): Promise<DealerDocumentAskRow> {
  return api.post<DealerDocumentAskRow>(path, body);
}
