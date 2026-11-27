import * as React from 'react';

import type { PhotoToConfirm } from '@/features/today/PhotoConfirmSheet';
import { useKavachSend } from '@/hooks/api/useKavach';
import { resolveFileType, type OutgoingAttachment } from '@/lib/uploadAttachment';
import { uploadKavachFile } from '@/lib/uploadKavachPhoto';
import { useAuthStore } from '@/store/auth';
import type { Lang } from '@/store/lang';
import type { KavachDealerItem } from '@dk/shared/types';

import { sentKey, titleOf } from './kavachView';

/** Where one row's send stands. A row with no entry has not been touched. */
export type SendState = 'sending' | 'failed' | 'sent' | 'wrongType';

/** A stalled upload or filing must end in "it did not go", never in a spinner with no way out. */
const UPLOAD_MS = 45_000;
const FILE_MS = 20_000;
/** How long a when-it-happens row says "Sent" before its button comes back for the next one. */
const SENT_SHOWN_MS = 3_000;

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), ms);
    work.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        window.clearTimeout(timer);
        reject(e instanceof Error ? e : new Error('failed'));
      },
    );
  });
}

/** The row an answer belongs to: its check, or the code of a when-it-happens point. */
export const rowKey = (item: Pick<KavachDealerItem, 'checkId' | 'code'>): string =>
  item.checkId ?? `event:${item.code}`;

interface Pending extends PhotoToConfirm {
  item: OutgoingAttachment;
  row: KavachDealerItem;
}

/**
 * Sending a photo for a Kavach point from the Kavach page (ADR 0057 §5).
 *
 * The row's button opens the phone's camera (or the picker); the picked file is HELD on the
 * "Send this photo?" sheet, so a wrong pick is seen before it goes. "Send" uploads it (scope
 * `kavach`), files it with the check, and moves the row to "With MDG" at once. A failed send keeps
 * the picked file, so "Try again" sends the same photo without making the dealer take it again.
 *
 * `sentKeys` is what the page hands to `sectionsOf`: a row is shown as sent from the moment the
 * server took the answer, before the refreshed list comes back.
 */
export function useKavachActions(lang: Lang) {
  const { mutateAsync: send } = useKavachSend();
  const dealerId = useAuthStore((s) => s.user?.dealerId ?? null);
  const [entries, setEntries] = React.useState<Readonly<Record<string, SendState>>>({});
  const [sentKeys, setSentKeys] = React.useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = React.useState<Pending | null>(null);
  const files = React.useRef(new Map<string, { item: OutgoingAttachment; row: KavachDealerItem }>());
  const inFlight = React.useRef(new Set<string>());

  const mark = React.useCallback((key: string, state: SendState | null) => {
    setEntries((cur) => {
      const next = { ...cur };
      if (state) next[key] = state;
      else delete next[key];
      return next;
    });
  }, []);

  const sendFile = React.useCallback(
    async (row: KavachDealerItem, item: OutgoingAttachment) => {
      const key = rowKey(row);
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      files.current.set(key, { item, row });
      mark(key, 'sending');
      try {
        if (!dealerId) throw new Error('No outlet');
        const attachment = await within(uploadKavachFile(item.file, dealerId), UPLOAD_MS);
        await within(send({ target: row.checkId ? { checkId: row.checkId } : { code: row.code }, files: [attachment] }), FILE_MS);
        files.current.delete(key);
        if (row.checkId) {
          setSentKeys((cur) => new Set(cur).add(sentKey(row)));
          mark(key, null);
        } else {
          mark(key, 'sent');
          // A second one the same day needs its button back.
          window.setTimeout(() => setEntries((cur) => {
            if (cur[key] !== 'sent') return cur;
            const next = { ...cur };
            delete next[key];
            return next;
          }), SENT_SHOWN_MS);
        }
      } catch {
        // The upload failing and the filing failing look the same to the dealer: it did not go.
        mark(key, 'failed');
      } finally {
        inFlight.current.delete(key);
      }
    },
    [dealerId, mark, send],
  );

  /** A picture, or a PDF where the point takes one. Null when it is neither. */
  const accept = React.useCallback((row: KavachDealerItem, file: File): OutgoingAttachment | null => {
    const { kind, contentType } = resolveFileType(file, { assumeImage: !row.acceptsFile });
    const ok = kind === 'image' || (row.acceptsFile && contentType === 'application/pdf');
    return ok ? { file, kind, contentType } : null;
  }, []);

  /** A file came back from the camera or the picker: it is held for the dealer to confirm. */
  const pick = React.useCallback(
    (row: KavachDealerItem, file: File) => {
      const item = accept(row, file);
      if (!item) {
        mark(rowKey(row), 'wrongType');
        return;
      }
      mark(rowKey(row), null);
      setPending({ row, item, title: titleOf(row, lang), acceptsFile: row.acceptsFile });
    },
    [accept, lang, mark],
  );

  /** "Choose another" gave a different file: it takes the place of the held one. */
  const replacePending = React.useCallback(
    (file: File) => {
      setPending((cur) => {
        if (!cur) return cur;
        const item = accept(cur.row, file);
        if (!item) {
          mark(rowKey(cur.row), 'wrongType');
          return null;
        }
        return { ...cur, item };
      });
    },
    [accept, mark],
  );

  const confirmPending = React.useCallback(() => {
    if (!pending) return;
    const { row, item } = pending;
    setPending(null);
    void sendFile(row, item);
  }, [pending, sendFile]);

  /** Closing the sheet sends nothing. */
  const cancelPending = React.useCallback(() => setPending(null), []);

  /** "Try again": the same file, when the row still holds it; otherwise false and the caller opens the camera. */
  const retry = React.useCallback(
    (row: KavachDealerItem): boolean => {
      const held = files.current.get(rowKey(row));
      if (!held) {
        mark(rowKey(row), null);
        return false;
      }
      void sendFile(row, held.item);
      return true;
    },
    [mark, sendFile],
  );

  return { entries, sentKeys, pending, pick, replacePending, confirmPending, cancelPending, retry };
}
