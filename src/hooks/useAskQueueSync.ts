import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { applyAskRow, submitAsk, volunteerAsk } from '@/hooks/api/useAsks';
import { type ApiError } from '@/lib/api';
import { uploadDocumentAsk } from '@/lib/uploadDocumentAsk';
import { base64ToFile, useAskQueueStore, type QueuedAskPhoto } from '@/store/askQueue';
import { useAuthStore } from '@/store/auth';

/**
 * The loop that empties the photograph queue.
 *
 * MODELLED ON `useStaffDraftSync`, which is the one working offline retry in
 * this app: a single serialized chain so nothing races, a `window.online`
 * listener so a returning network is acted on at once, and a failure that leaves
 * the work in the store rather than throwing it away.
 *
 * IT MUST KEEP RUNNING WHEN NOTHING IS ON SCREEN. This hook is called from the
 * ask bar, and the bar renders nothing at all once a photograph is queued (a
 * queued page is not outstanding). A component that returns null is still
 * mounted and its hooks still run — which is exactly why the bar returns null
 * instead of the shell deciding not to render it.
 *
 * THE SEND IS FOUR STEPS AND RESUMES BETWEEN THEM
 * ----------------------------------------------
 *   volunteer (only when no row exists yet) → presign → PUT → submit
 *
 * The row id and the path it hands back are written into the queue entry as soon
 * as they exist, so a failure after the volunteer does not mint a second row on
 * the next attempt. This is the Kavach proof-card bug, avoided: that card
 * retries its second step with nothing in hand, so a failure after a successful
 * upload silently discards the photograph and uploads it all over again.
 */

/** Wait this long after a failure before trying again, doubling each time. */
const RETRY_BASE_MS = 5_000;
/** …but never longer than this. A dealer who walks back into signal should not wait. */
const RETRY_MAX_MS = 60_000;
/**
 * After this many attempts the entry is called stuck.
 *
 * Not a cap on how long a photograph may wait for a network — an outage is not
 * the dealer's fault and `online` restarts the loop from zero delay. It is a
 * guard against an entry that fails for a reason no amount of repeating fixes,
 * so the card stops saying "it will go as soon as the internet is back" about a
 * photograph that never will.
 */
const MAX_ATTEMPTS = 8;

/** What the screens need to know about the queue. */
export interface AskQueueSync {
  /** True while a photograph is actually in flight. */
  sending: boolean;
}

/**
 * Mint the ask row for a photograph that answers a period nobody made a row for.
 *
 * A derived `owed` line is not a record of anything — its id is a label, not a
 * handle — and an upload is filed under `ask/<dealerId>/<askId>/`, so there is
 * nowhere to put the bytes until this has run. The id and the path it hands back
 * are written into the queue entry AT ONCE, so a failure between here and the
 * submit does not mint a second row on the next attempt.
 *
 * The path comes back from the server on the row it just made and is stored as
 * given. A client that composed it would keep posting to the old one the day the
 * route moved, and the dealer's paper would 404 with nothing on their screen
 * explaining why.
 */
async function mintRowFor(
  item: QueuedAskPhoto,
): Promise<{ askId: string; submitVia: string }> {
  const row = await volunteerAsk(item.submitVia, {
    kindCode: item.kindCode,
    periodKind: item.periodKind,
    periodKey: item.periodKey,
    ...(item.label ? { label: item.label } : {}),
  });
  const minted = { askId: row.id, submitVia: row.submitVia };
  useAskQueueStore.getState().patch(item.matchKey, minted);
  return minted;
}

export function useAskQueueSync(): AskQueueSync {
  const qc = useQueryClient();
  const dealerId = useAuthStore((s) => s.user?.dealerId);
  const items = useAskQueueStore((s) => s.items);
  const [sending, setSending] = React.useState(false);

  const runningRef = React.useRef(false);
  const timerRef = React.useRef<number | undefined>(undefined);

  /**
   * Send one entry, all the way or not at all.
   *
   * Returns `true` when the queue should keep going. A `false` means stop this
   * pass: either the phone is off the network or the entry failed, and hammering
   * the next one over the same dead link achieves nothing.
   */
  const sendOne = React.useCallback(
    async (item: QueuedAskPhoto): Promise<boolean> => {
      const store = useAskQueueStore.getState();
      store.patch(item.matchKey, { state: 'sending' });
      try {
        // Resolved into ONE value rather than reassigned through a `let`, so
        // "we have a row to upload against" is a fact the types carry rather
        // than one a reader has to reconstruct from the branch above.
        const { askId, submitVia } = item.askId
          ? { askId: item.askId, submitVia: item.submitVia }
          : await mintRowFor(item);

        const attachment = await uploadDocumentAsk({
          // Already shrunk and named when it was queued — see `prepareAskFile`.
          // Preparing again here would re-encode an image on every retry, and
          // would mean the size the queue persisted and the size the server
          // records were two different numbers.
          photo: {
            file: base64ToFile(item),
            filename: item.filename,
            contentType: item.contentType,
            size: item.size,
          },
          kind: item.kind,
          dealerId: item.dealerId,
          askId,
        });

        const row = await submitAsk(submitVia, {
          attachment,
          // Replayed unchanged on every attempt, so a submit that succeeded
          // while its response was lost is recognised as the same send rather
          // than refused as a second one.
          clientRef: item.clientRef,
        });

        applyAskRow(qc, row);
        useAskQueueStore.getState().remove(item.matchKey);
        return true;
      } catch (err) {
        const status = (err as ApiError)?.status;
        const attempts = item.attempts + 1;
        // A 4xx is a DECISION, not a hiccup: the ask was withdrawn, the period
        // is out of the window, the file is not one MDG accepts. Sending the
        // same bytes again would fail the same way, so the card stops promising
        // it will go and asks for a new photograph instead.
        const refused = typeof status === 'number' && status >= 400 && status < 500;
        useAskQueueStore.getState().patch(item.matchKey, {
          attempts,
          state: refused || attempts >= MAX_ATTEMPTS ? 'stuck' : 'queued',
        });
        return false;
      }
    },
    [qc],
  );

  /** One pass over this dealer's queue, oldest first. Never re-entrant. */
  const drain = React.useCallback(async () => {
    if (runningRef.current || !dealerId) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    runningRef.current = true;
    setSending(true);
    try {
      // Re-read the store between sends rather than closing over a snapshot: a
      // dealer can queue another photograph while the first is going.
      for (;;) {
        const next = useAskQueueStore
          .getState()
          .items.find((i) => i.dealerId === dealerId && i.state === 'queued');
        if (!next) break;
        const ok = await sendOne(next);
        if (!ok) break;
      }
    } finally {
      runningRef.current = false;
      setSending(false);
    }
  }, [dealerId, sendOne]);

  // A NETWORK COMING BACK IS THE SIGNAL THIS WHOLE STORE EXISTS FOR, so it runs
  // the queue AT ONCE rather than nudging the backoff below. A dealer who has
  // walked from the forecourt into the office should not wait out a minute of
  // exponential backoff that was earned by the dead spot they have just left.
  // Same listener, same reason, as `useStaffDraftSync`.
  React.useEffect(() => {
    const onOnline = () => {
      void drain();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [drain]);

  // The waiting COUNT, not the array, so a `patch` that only moves an entry
  // between `queued` and `sending` does not re-fire this effect underneath the
  // pass that made the change.
  const waiting = items.filter((i) => i.dealerId === dealerId && i.state === 'queued').length;
  const attempts = items.reduce((n, i) => n + i.attempts, 0);

  React.useEffect(() => {
    if (waiting === 0) return;
    // Back off after a failure so a flapping 2G link is not hammered, but start
    // immediately for a photograph that has not been tried yet — that one was
    // just taken, and the dealer is watching.
    const delay =
      attempts === 0 ? 0 : Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(attempts, 4));
    timerRef.current = window.setTimeout(() => {
      void drain();
    }, delay);
    return () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, [waiting, attempts, drain]);

  return { sending };
}
