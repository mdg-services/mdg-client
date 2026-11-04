import { FileUp } from 'lucide-react';
import * as React from 'react';

import { Spinner, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT, type MessageKey } from '@/lib/i18n';

import {
  MAX_DROP_FILES,
  readDropped,
  sendInBatches,
  snapshotDrop,
  sortDropped,
  type DropSource,
  type ReadResult,
  type SendBatch,
  type SkippedFile,
  type SkipReason,
} from './dropFiles';

const REASON_KEY: Record<SkipReason, MessageKey> = {
  type: 'drop.reason.type',
  audio: 'drop.reason.audio',
  size: 'drop.reason.size',
  empty: 'drop.reason.empty',
  unreadable: 'drop.reason.unreadable',
  upload: 'drop.reason.upload',
};

/** Only a drag that carries files is ours; a dragged piece of text or a link is left alone. */
function carriesFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

interface Progress {
  done: number;
  total: number;
  stopping: boolean;
}

/** What is left on the card when a drop has finished and something was not sent. */
interface Report {
  /** Files that were going to be sent (after the skipped were set aside). */
  total: number;
  sent: number;
  cancelled: boolean;
  truncated: boolean;
  notSent: SkippedFile[];
}

export interface DropToSendProps {
  /** One message's worth of files, through the chat's own upload and post. */
  send: SendBatch;
  /** Which thread this is. Moving to another ends a drop in progress. */
  threadId?: string;
  /** No thread to send into yet. */
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Drag files, or a whole folder, onto a conversation to send them (ADR 0032 §6).
 *
 * Over the conversation a "Drop to send" layer shows while files are being dragged. On
 * the drop the files are checked against what the chat takes, the rest are listed with
 * the reason, and the others go out ten to a message through the screen's own send —
 * one message after another, with a count and a Cancel.
 *
 * THE DOCUMENT-WIDE "IGNORE DROPS" GUARD STAYS (`lib/touchGuards.ts`). It only cancels the
 * browser's own handling of a drop, so a file dropped anywhere else in the app still does
 * nothing; it does not stop the event, so this still hears it.
 *
 * Moving to another thread, or leaving the screen, stops what is left of a drop in
 * progress and clears its card: there is nowhere left on screen to show it.
 */
export function DropToSend({ send, threadId, disabled, className, children }: DropToSendProps) {
  const t = useT();
  const toast = useToast();
  const [dragging, setDragging] = React.useState(false);
  // Enter and leave fire for every child the pointer crosses; the layer stays up
  // until they balance.
  const depth = React.useRef(0);
  const [reading, setReading] = React.useState(false);
  const [progress, setProgress] = React.useState<Progress | null>(null);
  const [report, setReport] = React.useState<Report | null>(null);
  // The drop being worked on. `stale` is a drop whose thread is gone: it says nothing more.
  const active = React.useRef<{ cancelled: boolean; stale: boolean } | null>(null);
  const busy = reading || progress !== null;

  React.useEffect(
    () => () => {
      if (active.current) {
        active.current.cancelled = true;
        active.current.stale = true;
      }
      depth.current = 0;
      setDragging(false);
      setReading(false);
      setProgress(null);
      setReport(null);
    },
    [threadId],
  );

  const run = async (sources: DropSource[]) => {
    const me = { cancelled: false, stale: false };
    active.current = me;
    setReport(null);
    setReading(true);
    let read: ReadResult;
    try {
      read = await readDropped(sources);
    } catch {
      read = { files: [], unreadable: [], truncated: false };
    }
    if (me.stale) return;
    const { accepted, skipped } = sortDropped(read.files);
    const notSent = [...read.unreadable, ...skipped];
    setReading(false);
    if (accepted.length === 0) {
      setReport({ total: 0, sent: 0, cancelled: false, truncated: read.truncated, notSent });
      return;
    }

    setProgress({ done: 0, total: accepted.length, stopping: false });
    const outcome = await sendInBatches(accepted, send, {
      isCancelled: () => me.cancelled,
      onProgress: (done, total) => {
        if (!me.stale) setProgress((p) => (p ? { ...p, done, total } : p));
      },
    });
    if (me.stale) return;
    setProgress(null);
    notSent.push(...outcome.failed);
    if (notSent.length === 0 && !read.truncated && !outcome.cancelled) {
      toast.success(t(outcome.sent === 1 ? 'drop.sentOne' : 'drop.sentAll', { n: outcome.sent }));
      return;
    }
    setReport({
      total: accepted.length,
      sent: outcome.sent,
      cancelled: outcome.cancelled,
      truncated: read.truncated,
      notSent,
    });
  };

  const onDragEnter = (e: React.DragEvent) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    depth.current += 1;
    if (!busy && !disabled) setDragging(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = busy || disabled ? 'none' : 'copy';
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!carriesFiles(e)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (disabled) return;
    if (busy) {
      toast.info(t(reading ? 'drop.busyReading' : 'drop.busy'));
      return;
    }
    // Taken now: the browser empties the drop when this handler returns.
    void run(snapshotDrop(e.dataTransfer));
  };

  const stop = () => {
    if (active.current) active.current.cancelled = true;
    setProgress((p) => (p ? { ...p, stopping: true } : p));
  };

  return (
    <div
      className={cn('relative', className)}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="flex w-full max-w-xs flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand bg-surface px-6 py-10 text-center">
            <FileUp width={32} strokeWidth={1.5} className="text-brand" aria-hidden />
            <p className="text-base font-semibold text-text">{t('drop.title')}</p>
            <p className="text-sm text-text-muted">{t('drop.hint')}</p>
          </div>
        </div>
      ) : null}

      {reading ? (
        // A big folder takes a while to walk: without this a drop looks ignored.
        <div
          role="status"
          className="absolute inset-x-3 top-16 z-30 flex items-center gap-2 rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          <Spinner size={16} />
          <p className="min-w-0 flex-1 text-sm text-text">{t('drop.reading')}</p>
        </div>
      ) : null}

      {progress ? (
        <div
          role="status"
          className="absolute inset-x-3 top-16 z-30 flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          <div className="flex items-center gap-2">
            <Spinner size={16} />
            <p className="min-w-0 flex-1 text-sm text-text">
              {progress.stopping
                ? t('drop.stopping')
                : t('drop.sending', { done: progress.done, total: progress.total })}
            </p>
            <button
              type="button"
              onClick={stop}
              disabled={progress.stopping}
              className="rounded-full border border-border-strong px-3 py-1 text-sm font-medium text-text active:bg-surface-2 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-brand transition-[width]"
              style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {report && !progress ? (
        <div
          role="status"
          className="absolute inset-x-3 top-16 z-30 flex max-h-[60%] flex-col gap-2 overflow-hidden rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          <p className="text-sm font-semibold text-text">
            {report.total === 0
              ? t('drop.noneToSend')
              : report.cancelled
                ? t('drop.stopped', { n: report.sent, total: report.total })
                : t('drop.sentSome', { n: report.sent, total: report.total })}
          </p>
          {report.notSent.length > 0 ? (
            // Every file that was not sent, with its reason: a big folder can leave
            // a hundred, so the list scrolls inside the card and the buttons stay in view.
            <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto text-sm">
              {report.notSent.map((f, i) => (
                <li key={`${i}-${f.name}`} className="min-w-0">
                  <span className="break-all text-text">{f.name}</span>
                  <span className="text-text-muted"> · {t(REASON_KEY[f.reason])}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {report.truncated ? (
            <p className="text-sm text-text-muted">{t('drop.tooMany', { n: MAX_DROP_FILES })}</p>
          ) : null}
          <button
            type="button"
            onClick={() => setReport(null)}
            className="self-end rounded-full border border-border-strong px-3 py-1 text-sm font-medium text-text active:bg-surface-2"
          >
            {t('common.dismiss')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
