import * as React from 'react';

import type { StaffPointDraftView } from '@dk/shared/types';

import { useSaveStaffDraft } from './useStaffDraft';

import {
  draftSignature,
  useStaffDraftStore,
  type DraftSyncState,
} from '@/store/staffDraft';

/** Debounce window for the autosave PUT — long enough to batch rapid edits. */
const AUTOSAVE_DELAY_MS = 600;
/** Upper bound on flush save-loops, so a pathological mid-flight edit can't spin. */
const MAX_FLUSH_ROUNDS = 4;

/** Result of a forced flush: synced, or couldn't reach the server (offline). */
export type FlushResult = { ok: true } | { ok: false; reason: 'offline' };

/** What the draft-sync layer exposes so Final Submit can coordinate with autosave. */
export interface StaffDraftSync {
  syncState: DraftSyncState;
  /** True when local edits have not yet been confirmed saved by the server. */
  dirty: boolean;
  /**
   * Force any pending/in-flight autosave to run immediately and resolve once the
   * server draft is confirmed in sync (or `{ ok:false, reason:'offline' }` if it
   * couldn't be reached). Awaited before finalize so the ledger commits the
   * latest edits, never a stale server draft.
   */
  flush: () => Promise<FlushResult>;
  /**
   * Suspend/resume autosave for this draft. Finalize suppresses it around the
   * commit so no late/queued PUT can resurrect the draft the server just deleted.
   */
  suppressAutosave: (on: boolean) => void;
}

/**
 * Wires the local draft store to the server: it hydrates from the fetched draft
 * view (server is truth unless local edits are still un-synced) and, whenever the
 * local slice is `dirty`, fires a debounced PUT. All saves are serialized through
 * a single chain so a forced `flush()` and the debounced autosave can never race
 * into two concurrent PUTs. A failed PUT (offline) keeps the slice dirty and
 * flips the status to `offline`; the save retries on the next edit or when
 * connectivity returns (`online` event).
 */
export function useStaffDraftSync(
  dealerId: string | undefined,
  serverView: StaffPointDraftView | null | undefined,
): StaffDraftSync {
  const hydrateFromServer = useStaffDraftStore((s) => s.hydrateFromServer);
  const slice = useStaffDraftStore((s) =>
    dealerId ? s.byDealer[dealerId] : undefined,
  );
  const syncState = useStaffDraftStore((s) =>
    dealerId ? s.sync[dealerId] : undefined,
  );

  const save = useSaveStaffDraft(dealerId);
  // Keep the latest mutation without forcing the save callbacks to re-create
  // (react-query returns a fresh object each render).
  const saveRef = React.useRef(save);
  saveRef.current = save;

  const chainRef = React.useRef<Promise<void>>(Promise.resolve());
  const timerRef = React.useRef<number | undefined>(undefined);
  const suppressRef = React.useRef(false);
  const [onlineTick, setOnlineTick] = React.useState(0);

  // Reconcile with the server whenever a fresh draft view arrives.
  React.useEffect(() => {
    if (!dealerId) return;
    if (serverView === undefined) return; // still loading — nothing to adopt yet
    hydrateFromServer(dealerId, serverView);
  }, [dealerId, serverView, hydrateFromServer]);

  // A back-online signal forces a retry of any pending (dirty) save.
  React.useEffect(() => {
    const onOnline = () => setOnlineTick((n) => n + 1);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  // Save the current snapshot exactly once (no-op when clean or suppressed).
  const runOnce = React.useCallback(async () => {
    if (!dealerId || suppressRef.current) return;
    const store = useStaffDraftStore.getState();
    const current = store.byDealer[dealerId];
    if (!current || !current.dirty) return;
    const sent = draftSignature(current);
    store.setSync(dealerId, 'saving');
    try {
      const view = await saveRef.current.mutateAsync({
        entries: current.entries,
        workDate: current.workDate,
        note: current.note,
      });
      useStaffDraftStore.getState().markSaved(dealerId, sent, view);
    } catch {
      useStaffDraftStore.getState().setSync(dealerId, 'offline');
    }
  }, [dealerId]);

  // Enqueue a save onto the single serialized chain (mutex over PUTs).
  const enqueueSave = React.useCallback((): Promise<void> => {
    const next = chainRef.current.catch(() => {}).then(() => runOnce());
    chainRef.current = next;
    return next;
  }, [runOnce]);

  const suppressAutosave = React.useCallback((on: boolean) => {
    suppressRef.current = on;
    if (on && timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const flush = React.useCallback(async (): Promise<FlushResult> => {
    if (!dealerId) return { ok: true };
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    // Drain: keep saving the latest snapshot until it's clean or we go offline.
    for (let i = 0; i < MAX_FLUSH_ROUNDS; i++) {
      const current = useStaffDraftStore.getState().byDealer[dealerId];
      if (!current || !current.dirty) break;
      await enqueueSave();
      if (useStaffDraftStore.getState().sync[dealerId] === 'offline') break;
    }
    const current = useStaffDraftStore.getState().byDealer[dealerId];
    if (current?.dirty) return { ok: false, reason: 'offline' };
    return { ok: true };
  }, [dealerId, enqueueSave]);

  const dirty = slice?.dirty ?? false;
  const signature = slice ? draftSignature(slice) : '';

  // Debounced autosave: PUT the current snapshot whenever the slice is dirty.
  React.useEffect(() => {
    if (!dealerId || !dirty || suppressRef.current) return;
    timerRef.current = window.setTimeout(() => {
      void enqueueSave();
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
    // `signature` captures entries/workDate/note; re-fires on any edit or when
    // connectivity returns. `enqueueSave` is stable.
  }, [dealerId, dirty, signature, onlineTick, enqueueSave]);

  return {
    syncState: syncState ?? 'idle',
    dirty,
    flush,
    suppressAutosave,
  };
}
