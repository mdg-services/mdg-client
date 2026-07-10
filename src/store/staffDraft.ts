import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { istDate } from '@/lib/staff';
import type {
  StaffPointDraftEntry,
  StaffPointDraftLineItem,
  StaffPointDraftView,
} from '@dk/shared/types';


/**
 * Offline safety net for the staff-points draft.
 *
 * The server holds the single source of truth (GET/PUT /staff-points/draft), but
 * everything the owner builds up during a shift is ALSO mirrored here, persisted
 * to localStorage per dealer, so a reload or crash before the final submit never
 * loses work. Each edit updates this store instantly (survives reload) and marks
 * the slice `dirty`; a debounced PUT (see useStaffDraftAutosync) reconciles with
 * the server and clears `dirty` once the sent snapshot lands unchanged.
 */

export type DraftSyncState = 'idle' | 'saving' | 'saved' | 'offline';

/** The last-known draft for one dealer — the working copy the UI renders. */
export interface DealerDraftSlice {
  entries: StaffPointDraftEntry[];
  workDate: string;
  note: string;
  /** True when local edits have not yet been confirmed saved by the server. */
  dirty: boolean;
  /** Last server-resolved line items, kept as a display fallback when offline. */
  serverLines: StaffPointDraftLineItem[];
  updatedAt: string | null;
}

interface StaffDraftState {
  byDealer: Record<string, DealerDraftSlice>;
  /** Transient per-dealer sync status (never persisted; resets on reload). */
  sync: Record<string, DraftSyncState>;

  /** Adopt the server draft as truth, unless local edits are still un-synced. */
  hydrateFromServer: (dealerId: string, view: StaffPointDraftView | null) => void;
  /** Merge new wizard entries into the draft (same worker+work is combined). */
  addEntries: (
    dealerId: string,
    entries: StaffPointDraftEntry[],
    workDate?: string,
  ) => void;
  /** Replace one line's PER_UNIT quantity / rupee amount. */
  updateLine: (
    dealerId: string,
    employeeId: string,
    workItemCode: string,
    patch: { quantity?: number; amountRupees?: number },
  ) => void;
  removeLine: (dealerId: string, employeeId: string, workItemCode: string) => void;
  setWorkDate: (dealerId: string, workDate: string) => void;
  setNote: (dealerId: string, note: string) => void;
  /** Wipe the local draft (after a successful finalize or an explicit clear). */
  clearDraft: (dealerId: string) => void;
  /** Mark the sent snapshot as saved, but only if nothing changed mid-flight. */
  markSaved: (
    dealerId: string,
    sentSignature: string,
    view: StaffPointDraftView,
  ) => void;
  setSync: (dealerId: string, state: DraftSyncState) => void;
}

function emptySlice(): DealerDraftSlice {
  return {
    entries: [],
    workDate: istDate(),
    note: '',
    dirty: false,
    serverLines: [],
    updatedAt: null,
  };
}

/** Read a dealer's slice, always returning a stable empty default. */
export function selectSlice(
  state: Pick<StaffDraftState, 'byDealer'>,
  dealerId: string | undefined,
): DealerDraftSlice {
  if (!dealerId) return emptySlice();
  return state.byDealer[dealerId] ?? emptySlice();
}

/** A stable signature of what a PUT would send — used to detect mid-flight edits. */
export function draftSignature(slice: {
  entries: StaffPointDraftEntry[];
  workDate: string;
  note: string;
}): string {
  return JSON.stringify({
    entries: slice.entries,
    workDate: slice.workDate,
    note: slice.note,
  });
}

const sameEntry =
  (a: StaffPointDraftEntry) => (b: StaffPointDraftEntry) =>
    a.employeeId === b.employeeId && a.workItemCode === b.workItemCode;

/** Sum two optional numbers, returning undefined only when both are absent. */
function addOptional(a?: number, b?: number): number | undefined {
  if (a == null && b == null) return undefined;
  return (a ?? 0) + (b ?? 0);
}

export const useStaffDraftStore = create<StaffDraftState>()(
  persist(
    (set, get) => {
      /** Mutate one dealer's slice, always flipping it dirty (a local edit). */
      const patchSlice = (
        dealerId: string,
        fn: (slice: DealerDraftSlice) => DealerDraftSlice,
      ) => {
        set((s) => {
          const current = s.byDealer[dealerId] ?? emptySlice();
          return {
            byDealer: {
              ...s.byDealer,
              [dealerId]: { ...fn(current), dirty: true },
            },
          };
        });
      };

      return {
        byDealer: {},
        sync: {},

        hydrateFromServer: (dealerId, view) => {
          set((s) => {
            const current = s.byDealer[dealerId];
            // Un-synced local edits are newer than the server — keep them, and
            // only refresh the display fallback. The autosync will PUT them.
            if (current?.dirty) {
              return {
                byDealer: {
                  ...s.byDealer,
                  [dealerId]: {
                    ...current,
                    serverLines: view?.lineItems ?? [],
                  },
                },
              };
            }
            // Otherwise the server is truth.
            return {
              byDealer: {
                ...s.byDealer,
                [dealerId]: {
                  entries: view?.entries ?? [],
                  workDate: view?.workDate ?? istDate(),
                  note: view?.note ?? '',
                  dirty: false,
                  serverLines: view?.lineItems ?? [],
                  updatedAt: view?.updatedAt ?? null,
                },
              },
            };
          });
        },

        addEntries: (dealerId, incoming, workDate) => {
          patchSlice(dealerId, (slice) => {
            const entries = slice.entries.map((e) => ({ ...e }));
            for (const next of incoming) {
              const idx = entries.findIndex(sameEntry(next));
              if (idx >= 0) {
                const prev = entries[idx];
                entries[idx] = {
                  employeeId: prev.employeeId,
                  workItemCode: prev.workItemCode,
                  quantity: addOptional(prev.quantity, next.quantity),
                  amountRupees: addOptional(prev.amountRupees, next.amountRupees),
                };
              } else {
                entries.push({ ...next });
              }
            }
            return {
              ...slice,
              entries,
              workDate: workDate ?? slice.workDate,
            };
          });
        },

        updateLine: (dealerId, employeeId, workItemCode, patch) => {
          patchSlice(dealerId, (slice) => ({
            ...slice,
            entries: slice.entries.map((e) =>
              e.employeeId === employeeId && e.workItemCode === workItemCode
                ? {
                    employeeId,
                    workItemCode,
                    quantity:
                      patch.quantity !== undefined ? patch.quantity : e.quantity,
                    amountRupees:
                      patch.amountRupees !== undefined
                        ? patch.amountRupees
                        : e.amountRupees,
                  }
                : e,
            ),
          }));
        },

        removeLine: (dealerId, employeeId, workItemCode) => {
          patchSlice(dealerId, (slice) => ({
            ...slice,
            entries: slice.entries.filter(
              (e) =>
                !(e.employeeId === employeeId && e.workItemCode === workItemCode),
            ),
          }));
        },

        setWorkDate: (dealerId, workDate) => {
          patchSlice(dealerId, (slice) => ({ ...slice, workDate }));
        },

        setNote: (dealerId, note) => {
          patchSlice(dealerId, (slice) => ({ ...slice, note }));
        },

        clearDraft: (dealerId) => {
          set((s) => {
            const nextByDealer = { ...s.byDealer };
            delete nextByDealer[dealerId];
            const nextSync = { ...s.sync };
            delete nextSync[dealerId];
            return { byDealer: nextByDealer, sync: nextSync };
          });
        },

        markSaved: (dealerId, sentSignature, view) => {
          const current = get().byDealer[dealerId];
          if (!current) return;
          const unchanged = draftSignature(current) === sentSignature;
          set((s) => ({
            byDealer: {
              ...s.byDealer,
              [dealerId]: {
                ...current,
                // Only clear dirty when nothing changed while the PUT was in
                // flight; a mid-flight edit keeps dirty so the next debounce fires.
                dirty: unchanged ? false : current.dirty,
                serverLines: view.lineItems,
                updatedAt: view.updatedAt ?? current.updatedAt,
              },
            },
            sync: { ...s.sync, [dealerId]: unchanged ? 'saved' : 'saving' },
          }));
        },

        setSync: (dealerId, state) => {
          set((s) => ({ sync: { ...s.sync, [dealerId]: state } }));
        },
      };
    },
    {
      name: 'mdg.client.staffDraft',
      // Persist the working copy only; the transient sync status resets on load.
      partialize: (s) => ({ byDealer: s.byDealer }),
    },
  ),
);
