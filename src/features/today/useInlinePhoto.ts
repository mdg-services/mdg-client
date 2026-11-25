import * as React from 'react';

import { useSendMessage } from '@/hooks/api/useSendMessage';
import { resolveFileType, type OutgoingAttachment } from '@/lib/uploadAttachment';
import type { TodayTask } from '@dk/shared/types';

import { isPhotoTask } from './todayView';

/** Where one photo answer stands. A task with no entry has not been touched. */
export type PhotoState = 'sending' | 'sent' | 'failed';

/** A photo the dealer has picked and not yet sent: it waits for "Send" (or "Choose another"). */
export interface PendingPhoto {
  task: TodayTask;
  item: OutgoingAttachment;
}

interface Entry {
  state: PhotoState;
  /** The ask message and its words when the answer went: a card re-posted by the team is a new ask. */
  messageId?: string;
  subtitle?: string;
}

/**
 * Answering one of MDG's photo asks from Today itself (ADR 0056 §3).
 *
 * The card's button opens the phone's picker; the picked photo is HELD on a small sheet
 * ("Send this photo?", with the photo, "Send" and "Choose another") so a wrong gallery pick or a
 * page shot too small is not filed as the answer on the spot, as the chat's own preview allows.
 * "Send" posts it into that ask's chat as the answer (`answersAsk` = the ask's reference),
 * through the same send the chat's own "Send photo" uses: the photo is shrunk and uploaded
 * behind the message, the chat shows the bubble at once, and the ask turns to "sent" there as
 * well. Here the card turns to "Sent. We are checking."
 *
 * A failed send keeps the picked file, so "Try again" sends the same photo without making
 * the dealer pick it again. The state is the page's, keyed by task, so it survives the feed
 * refreshing underneath (the task can stay listed for a moment after the answer).
 *
 * "SENT" IS ONLY TRUE FOR THE ASK IT WAS SENT FOR. The task id is the ask's reference and stays
 * the same when the team sends the photo back with a reason: the same id returns with a newer
 * message and the reason as its words. The mark remembers the message and the words it was
 * made for, and `stateFor` shows it only while they still match; `prune` forgets a mark when
 * the task leaves the feed or comes back changed, so a re-posted ask starts clean with its
 * "Send photo" button.
 */
export function useInlinePhoto() {
  const { mutateAsync: sendMessage } = useSendMessage();
  const [entries, setEntries] = React.useState<Readonly<Record<string, Entry>>>({});
  const [pending, setPending] = React.useState<PendingPhoto | null>(null);
  const files = React.useRef(new Map<string, OutgoingAttachment>());
  const inFlight = React.useRef(new Set<string>());

  const set = React.useCallback((taskId: string, entry: Entry | null) => {
    setEntries((cur) => {
      const next = { ...cur };
      if (entry) next[taskId] = entry;
      else delete next[taskId];
      return next;
    });
  }, []);

  const sendFile = React.useCallback(
    async (task: TodayTask, item: OutgoingAttachment) => {
      if (!isPhotoTask(task) || inFlight.current.has(task.id)) return;
      inFlight.current.add(task.id);
      files.current.set(task.id, item);
      set(task.id, { state: 'sending' });
      try {
        await sendMessage({
          conversationId: task.conversationId,
          files: [item],
          answersAsk: task.action.askRef,
        });
        files.current.delete(task.id);
        set(task.id, { state: 'sent', messageId: task.messageId, ...(task.subtitle ? { subtitle: task.subtitle } : {}) });
      } catch {
        // The upload failing and the post failing look the same to the dealer: it did not go.
        set(task.id, { state: 'failed' });
      } finally {
        inFlight.current.delete(task.id);
      }
    },
    [sendMessage, set],
  );

  /** Check a file from the picker: a picture, or a PDF where the ask takes one. Null when it is neither. */
  const accept = React.useCallback((task: TodayTask, file: File): OutgoingAttachment | null => {
    if (!isPhotoTask(task)) return null;
    const { kind, contentType } = resolveFileType(file, { assumeImage: !task.action.acceptsFile });
    const wrongKind = kind === 'image' ? false : !(task.action.acceptsFile && contentType === 'application/pdf');
    return wrongKind ? null : { file, kind, contentType };
  }, []);

  /** A file came back from the picker: it is held for the dealer to confirm. Anything that is not a picture or a PDF is refused as "did not go". */
  const pick = React.useCallback(
    (task: TodayTask, file: File) => {
      if (!isPhotoTask(task)) return;
      const item = accept(task, file);
      if (!item) {
        set(task.id, { state: 'failed' });
        return;
      }
      setPending({ task, item });
    },
    [accept, set],
  );

  /** "Choose another" gave a different file: it takes the place of the held one. */
  const replacePending = React.useCallback(
    (file: File) => {
      setPending((cur) => {
        if (!cur) return cur;
        const item = accept(cur.task, file);
        if (!item) {
          set(cur.task.id, { state: 'failed' });
          return null;
        }
        return { task: cur.task, item };
      });
    },
    [accept, set],
  );

  /** "Send": the held photo goes. */
  const confirmPending = React.useCallback(() => {
    if (!pending) return;
    const { task, item } = pending;
    setPending(null);
    void sendFile(task, item);
  }, [pending, sendFile]);

  /** Closing the sheet sends nothing. */
  const cancelPending = React.useCallback(() => setPending(null), []);

  /** "Try again": the same file, when the card still holds it; otherwise false and the caller opens the picker. */
  const retry = React.useCallback(
    (task: TodayTask): boolean => {
      const item = files.current.get(task.id);
      if (!item) {
        set(task.id, null);
        return false;
      }
      void sendFile(task, item);
      return true;
    },
    [sendFile, set],
  );

  /** Where this card's photo answer stands: a "sent" mark counts only for the ask it was made for. */
  const stateFor = React.useCallback(
    (task: TodayTask): PhotoState | undefined => {
      const e = entries[task.id];
      if (!e) return undefined;
      if (e.state === 'sent' && (e.messageId !== task.messageId || (e.subtitle ?? '') !== (task.subtitle ?? ''))) {
        return undefined;
      }
      return e.state;
    },
    [entries],
  );

  /**
   * Forget what the feed no longer backs: a mark for a task that left the feed, and a "sent" mark
   * for a task that is back with a different message or words (the team sent the photo back).
   * A send still going is never touched.
   */
  const prune = React.useCallback((tasks: readonly TodayTask[]) => {
    const byId = new Map(tasks.map((x) => [x.id, x]));
    setEntries((cur) => {
      let changed = false;
      const next: Record<string, Entry> = {};
      for (const [id, e] of Object.entries(cur)) {
        const task = byId.get(id);
        const stale =
          e.state !== 'sending' &&
          (!task ||
            (e.state === 'sent' && (e.messageId !== task.messageId || (e.subtitle ?? '') !== (task.subtitle ?? ''))));
        if (stale) {
          changed = true;
          if (!inFlight.current.has(id)) files.current.delete(id);
        } else {
          next[id] = e;
        }
      }
      return changed ? next : cur;
    });
  }, []);

  return { stateFor, pending, pick, replacePending, confirmPending, cancelPending, retry, prune };
}
