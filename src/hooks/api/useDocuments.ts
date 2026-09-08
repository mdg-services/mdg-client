import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { useToast } from '@/components/ui';
import { askListQueryKey } from '@/hooks/api/useAsks';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { getSocket } from '@/lib/socket';
import { onSocketReconnect } from '@/lib/socketReconnect';
import { useAuthStore } from '@/store/auth';
import type { DealerDocumentAskList, DealerDocumentAskRow } from '@dk/shared/types';

/**
 * THE FILING CABINET — every paper MDG holds for this dealer, and how long each
 * one is still good for.
 *
 * A SEPARATE QUERY FROM `useMyAsks`, MIRRORING THE SEPARATE ROUTE, and the
 * split is the server's and worth keeping. `/v1/asks/me` answers "what is
 * outstanding": three sources unioned, capped at 200, settled rows shown for
 * five days, sorted by whose turn it is. `/v1/asks/me/on-file` answers "what do
 * we hold": accepted rows only, up to 500, sorted most-urgent-first. Every one
 * of those choices is right for one question and wrong for the other, and a
 * single query with a mode is a query a caller can get wrong silently.
 *
 * `kinds` comes back DELIBERATELY EMPTY on this route — the catalog the confirm
 * sheet needs rides on `/v1/asks/me`, which the same screen already holds. Do
 * not draw a picker from this payload; it has nothing in it.
 */
export const documentsOnFileQueryKey = ['documents', 'on-file'] as const;

export function useMyDocumentsOnFile() {
  const token = useAuthStore((s) => s.token);
  return useQuery<DealerDocumentAskList>({
    queryKey: documentsOnFileQueryKey,
    enabled: !!token,
    // Five minutes, not the ask list's thirty seconds. A cabinet changes when a
    // person at MDG accepts a paper — a few times a month for one outlet — and
    // the socket below covers the case where that happens while the dealer is
    // looking at it. Re-asking a 500-row list every half minute on a forecourt
    // 2G link would spend the dealer's data to learn nothing.
    staleTime: 5 * 60_000,
    queryFn: () => api.get<DealerDocumentAskList>('/v1/asks/me/on-file'),
  });
}

/**
 * Keep the cabinet live while the dealer is standing in front of it.
 *
 * IT LISTENS TO THE ASK EVENT, because there is no second event: a filed paper
 * IS an accepted ask, so `document-ask:updated` is what fires when one is
 * accepted, when its validity is corrected, and when a renewal is opened
 * against it.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO IS TOUCH THE ASK LIST ON EVERY EVENT.
 * `useAskListSocket` already owns that cache and folds the row into it by
 * `(kindCode, periodKey)` precisely so an update does NOT cost a refetch; that
 * hook is mounted in `AskBar`, which the shell mounts unconditionally on every
 * screen, so it is running whenever this one is. Invalidating `askListQueryKey`
 * from here as well would force the 2G round trip `applyAskRow` exists to
 * avoid. The reconnect path is the exception and invalidates both: events that
 * fired while the socket was down are invisible to both caches, and a 2G link
 * drops the socket without ever firing `offline`.
 *
 * The narrow filter is the other half. Most `document-ask:updated` events are
 * about a paper that is not in the cabinet and never will be — a register page
 * being asked for, sent, rejected — and refetching 500 rows for each of those
 * is the same wasted round trip in a different coat. So the cabinet is only
 * re-read when the event is about a paper that has just been ACCEPTED, or about
 * one it is already holding.
 */
export function useDocumentsOnFileSocket(): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;

    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: documentsOnFileQueryKey });
    };

    const onUpdated = (payload: { row: DealerDocumentAskRow }) => {
      const row = payload.row;
      const held = qc.getQueryData<DealerDocumentAskList>(documentsOnFileQueryKey);
      const known = held?.rows.some((r) => r.id === row.id) ?? false;
      if (row.state === 'ACCEPTED' || known) invalidate();
    };

    const offReconnect = onSocketReconnect(socket, () => {
      invalidate();
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
 * Two short-lived signed URLs for one stored paper.
 *
 * Declared here rather than imported from `shared`, where the only spelling of
 * this shape is `TtSignedFileUrls`. The seam is generic — the server's own
 * `SignedFileUrls` says as much and says why — and naming the papers route's
 * return value after the density service is how a generic thing quietly becomes
 * that service's thing.
 */
interface AskFileUrls {
  /** `inline` disposition — what a dealer tapping a row wants. */
  viewUrl: string;
  /** `attachment` disposition — for a save. Unused here; the shape is the route's. */
  downloadUrl: string;
  filename: string;
  contentType: string;
  expiresIn: number;
}

/**
 * Open a paper the dealer has on file, on a link signed a second ago.
 *
 * THIS ROUTE AND NOT `useAttachmentDownload`. That helper presigns through
 * `/v1/conversations/:cid/messages/:mid/download-url`, because the generic
 * key-prefix route only authorises `avatars/`, `chat/`, `staff/` and `kavach/`
 * — everything under `ask/` answers 403. A filed certificate is not a chat
 * attachment and has no conversation or message to presign through, so it goes
 * through its own route, which resolves the owning dealer from the STORED ROW
 * rather than from the key string. `useOpenRecord` is the same shape for the
 * same reason.
 *
 * SIGNED AT TAP TIME, never when the list loaded. A dealer who opens this
 * screen, is called away to a tanker and comes back to tap a row was otherwise
 * handed to Chrome and shown a page of XML beginning "AccessDenied — Request
 * has expired": outside the app, with no way back but the phone's Back key, and
 * nothing telling them their licence is perfectly fine.
 */
export function useOpenDocumentFile(): (askId: string) => Promise<void> {
  const t = useT();
  const toast = useToast();
  return React.useCallback(
    async (askId: string) => {
      try {
        const urls = await api.get<AskFileUrls>(
          `/v1/asks/me/${encodeURIComponent(askId)}/file-url`,
        );
        if (!urls.viewUrl) throw new Error('no url');
        window.open(urls.viewUrl, '_blank', 'noopener,noreferrer');
      } catch {
        // Never names the step that broke. The route also answers this way when
        // the bytes on file are not the bytes that were sent, which is a real
        // thing to tell somebody about — but not in a toast, and not in words
        // that would read as an accusation.
        toast.error(t('common.loadFailed'));
      }
    },
    [t, toast],
  );
}
