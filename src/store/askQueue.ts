import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import type { DocumentAskMime } from '@/lib/uploadDocumentAsk';
import type { DocumentPeriodKind } from '@dk/shared/types';

/**
 * Offline safety net for a paper the dealer has photographed but not yet sent.
 *
 * THE SHAPE IS COPIED FROM `staffDraft.ts` ON PURPOSE. That store calls itself
 * "Offline safety net for the staff-points draft": a zustand slice, persisted to
 * localStorage, retried when the browser fires `online`
 * (`useStaffDraftSync.ts`). It is the only offline queue this app has ever had,
 * and it works. There is no service worker here, no IndexedDB, and react-query
 * is configured `mutations: { retry: 0 }` — so a mutation that fails is simply
 * gone unless something like this catches it.
 *
 * WHY A PHOTOGRAPH NEEDS THIS AND A CHAT MESSAGE DOES NOT
 * ------------------------------------------------------
 * A message the dealer retypes costs them ten seconds. The register page they
 * photographed at 06:40 while the tanker was still on the forecourt cannot be
 * retaken at 09:00 — the page has been written on since, the tanker has gone,
 * and the moment is not repeatable. So the bytes are held, not the intention.
 *
 * WHAT IS STORED, AND THE HONEST LIMIT ON IT
 * ------------------------------------------
 * localStorage holds strings, so the photograph is kept as base64. That inflates
 * it by about a third, and the browser's whole quota is around five megabytes —
 * which is why the queue is capped at {@link MAX_QUEUED} entries and why
 * {@link MAX_PERSIST_BYTES} decides what is worth writing down at all. A
 * compressed page photograph is 150–400 KB, so an ordinary one fits several
 * times over; an unusually large one still SENDS in this session (it is in
 * memory like everything else) but is not written to disk, and a reload loses
 * it. That is a real limit and it is stated here rather than hidden: the
 * alternative — writing until the quota throws — loses the whole queue, not one
 * entry of it.
 */

/** At most this many photographs wait at once. Beyond it, the oldest is dropped. */
export const MAX_QUEUED = 3;

/**
 * The largest base64 payload worth persisting, per entry.
 *
 * 1.4 MB of base64 is roughly a 1 MB file — comfortably above the few hundred KB
 * `compressImage` produces, and small enough that {@link MAX_QUEUED} of them
 * still fit inside a five-megabyte quota alongside the app's other stores.
 */
export const MAX_PERSIST_BYTES = 1_400_000;

/** Where an entry is in its life. `sending` is never persisted — see `partialize`. */
export type QueuedAskState = 'queued' | 'sending' | 'stuck';

/** One photograph waiting to go, and everything needed to finish sending it. */
export interface QueuedAskPhoto {
  /**
   * `(kindCode, periodKey)` — see `askMatchKey`. This and not the row id,
   * because an `owed` row's id is replaced by a real ask id the moment the
   * dealer answers it, and the queue must not lose the photograph at exactly
   * that moment.
   */
  matchKey: string;
  /**
   * THE RETRY KEY, minted once per send and replayed unchanged on every attempt.
   *
   * The dangerous failure on a forecourt connection is not an upload that fails;
   * it is a submit that SUCCEEDS while its response is lost. Without this the
   * retry is a second send, the ask is already `SENT`, and the dealer reads a
   * conflict about a paper they sent perfectly well. The server recognises this
   * value and answers with the row it already made.
   */
  clientRef: string;
  /** Whose photograph this is. A queue is per-dealer; a shared phone is not. */
  dealerId: string;
  /**
   * The ask this answers, once one exists. Absent while the row is still only a
   * derived `owed` line — there is no row, so there is nothing to presign
   * against, and the send starts by minting one.
   */
  askId?: string;
  /**
   * WHERE TO POST, read straight off the row the server sent. Never composed
   * here and never chosen by an `if` on the row's source: three sources already
   * post to three different routes, and an app that decided for itself would
   * keep posting to the old one the day a route moved.
   */
  submitVia: string;
  kindCode: string;
  periodKind: DocumentPeriodKind;
  /** The BASE period key. The server composes any `:<slug>` suffix, never a client. */
  periodKey: string;
  /** The admin's words, needed to re-mint a freeform ask. */
  label?: string;
  filename: string;
  contentType: DocumentAskMime;
  kind: 'image' | 'file';
  size: number;
  /** The bytes, base64, so a reload does not lose the photograph. */
  base64: string;
  queuedAt: string;
  attempts: number;
  state: QueuedAskState;
}

interface AskQueueState {
  /** Oldest first, so the one that has waited longest goes first. */
  items: QueuedAskPhoto[];
  /**
   * Take a photograph into the queue, replacing any earlier one for the same
   * period. A dealer who retakes a page means the second photograph, not both.
   */
  enqueue: (item: QueuedAskPhoto) => void;
  /** Move one entry through its states without touching the rest. */
  patch: (matchKey: string, patch: Partial<QueuedAskPhoto>) => void;
  /** It landed. Nothing is kept — the server row is the record now. */
  remove: (matchKey: string) => void;
  /** Sign-out, or a phone handed to somebody at another outlet. */
  clearDealer: (dealerId: string) => void;
}

/**
 * localStorage, but nothing it does can take the app down.
 *
 * Every accessor throws in some real browser: a private window with site data
 * blocked throws on `getItem`, and a full quota throws on `setItem`. A queue
 * whose whole purpose is to survive bad conditions must not be the thing that
 * breaks in them, so a failed write simply means this entry lives in memory for
 * the session.
 */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* Quota, or storage switched off. The in-memory queue still sends. */
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* Same. */
    }
  },
};

export const useAskQueueStore = create<AskQueueState>()(
  persist(
    (set) => ({
      items: [],

      enqueue: (item) =>
        set((s) => {
          const without = s.items.filter((i) => i.matchKey !== item.matchKey);
          // The oldest goes when the queue is full. It is the one most likely to
          // be stuck, and a queue that refused new photographs would leave the
          // dealer holding a camera that does nothing.
          const kept = without.slice(Math.max(0, without.length + 1 - MAX_QUEUED));
          return { items: [...kept, item] };
        }),

      patch: (matchKey, patch) =>
        set((s) => ({
          items: s.items.map((i) => (i.matchKey === matchKey ? { ...i, ...patch } : i)),
        })),

      remove: (matchKey) =>
        set((s) => ({ items: s.items.filter((i) => i.matchKey !== matchKey) })),

      clearDealer: (dealerId) =>
        set((s) => ({ items: s.items.filter((i) => i.dealerId !== dealerId) })),
    }),
    {
      name: 'mdg.client.askQueue',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        items: s.items
          // An oversized photograph is kept in memory and left out of the write.
          // See MAX_PERSIST_BYTES: dropping one entry beats losing the file.
          .filter((i) => i.base64.length <= MAX_PERSIST_BYTES)
          // `sending` describes a request that was in flight when the tab
          // closed. Nothing is in flight after a reload, and rehydrating one as
          // `sending` would park it in a state the sync loop skips — the
          // photograph would sit there for ever, looking busy.
          .map((i) => (i.state === 'sending' ? { ...i, state: 'queued' as const } : i)),
      }),
    },
  ),
);

/**
 * The periods this dealer already has a photograph waiting for.
 *
 * `stuck` entries are deliberately NOT in this set. A stuck photograph is one
 * the server refused, and the dealer's card has to go back to offering a camera
 * — "that photo did not go through, please send it again" with no way to send it
 * again is the shape of a dead end. Only `queued` and `sending` mean "leave it
 * alone, it is on its way".
 */
export function queuedKeysFor(
  items: readonly QueuedAskPhoto[],
  dealerId: string | null | undefined,
): Set<string> {
  if (!dealerId) return new Set();
  return new Set(
    items.filter((i) => i.dealerId === dealerId && i.state !== 'stuck').map((i) => i.matchKey),
  );
}

/** This dealer's waiting photographs, oldest first. */
export function queuedFor(
  items: readonly QueuedAskPhoto[],
  dealerId: string | null | undefined,
): QueuedAskPhoto[] {
  if (!dealerId) return [];
  return items.filter((i) => i.dealerId === dealerId);
}

/* ────────────────────────── Bytes in and out of a string ────────────────────── */

/**
 * Read a picked file as base64.
 *
 * `FileReader` rather than `file.arrayBuffer()` + a hand-rolled encoder, because
 * the Android 8/9 System WebView this app targets has `FileReader` everywhere
 * and `Blob.arrayBuffer` only on the newer builds — and this runs on the phone
 * that is least likely to be new.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      // `readAsDataURL` gives `data:<mime>;base64,<payload>`; only the payload is
      // stored, because the MIME is already on the entry and storing it twice is
      // a way for the two to disagree.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : '');
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Turn a queued entry back into the `File` the upload path expects.
 *
 * Decoded in 8 KB slices rather than one `Uint8Array.from(atob(...))` over the
 * whole string: a megabyte of base64 becomes a million-element intermediate
 * array on a phone with very little headroom, and the chunked version keeps the
 * peak small enough that a 512 MB Android device does not kill the tab.
 */
export function base64ToFile(item: QueuedAskPhoto): File {
  const binary = atob(item.base64);
  // Plain `ArrayBuffer`s rather than the views over them: a `Uint8Array` in
  // TypeScript 5.7+ is generic over its backing buffer and no longer narrows to
  // `BlobPart`, while an `ArrayBuffer` always has.
  const chunks: ArrayBuffer[] = [];
  const SLICE = 8192;
  for (let offset = 0; offset < binary.length; offset += SLICE) {
    const slice = binary.slice(offset, offset + SLICE);
    const buffer = new ArrayBuffer(slice.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < slice.length; i += 1) bytes[i] = slice.charCodeAt(i);
    chunks.push(buffer);
  }
  return new File(chunks, item.filename, { type: item.contentType });
}
