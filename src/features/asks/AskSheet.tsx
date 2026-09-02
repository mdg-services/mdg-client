import { FileText } from 'lucide-react';
import * as React from 'react';

import { Button, useToast } from '@/components/ui';
import { pick, useLang, useT } from '@/lib/i18n';
import { formatBytes } from '@/lib/uploadAttachment';
import { prepareAskFile, type DocumentAskMime } from '@/lib/uploadDocumentAsk';
import { useDialog } from '@/lib/useDialog';
import { useOnline } from '@/lib/useOnline';
import { fileToBase64, useAskQueueStore } from '@/store/askQueue';
import { useAuthStore } from '@/store/auth';
import {
  documentPeriodBaseKey,
  documentPeriodLabel,
  type DealerDocumentAskList,
  type DealerDocumentAskRow,
} from '@dk/shared/types';

import { askMatchKey, dayOptions } from './askRules';

/**
 * "Is this the right page, for the right day?" — the one screen between the
 * camera and MDG having the paper.
 *
 * THE DAY IS A SENTENCE THE DEALER CAN REFUSE, NOT A LABEL
 * -------------------------------------------------------
 * A pump does not close at midnight. The man on the night shift at half past two
 * writes on the page he has had open since eight in the evening and calls it
 * yesterday's page, while the app — correctly — calls it today. For the first
 * six hours of every IST day those are two words for the same piece of paper, so
 * this sheet states the day it is about to file the photograph under, in a
 * sentence, and offers to change it. The screen this replaces was already more
 * careful than a bare "आज": `DensityTodayCard` puts the day on the button as
 * well, and that is kept here — the day is on the control the thumb actually
 * presses, because that is the last thing read before a photograph is committed
 * to a date.
 *
 * IT IS A REAL DIALOG, WHICH NONE OF THE OTHER SIX SHEETS IN THIS APP IS
 * ---------------------------------------------------------------------
 * `role="dialog"`, `aria-modal`, focus moved in and handed back, Escape, a Tab
 * cycle and a scroll lock — see `useDialog`, which exists so the other six can
 * be brought up to this without anybody re-deriving the rules. Every control
 * here is at least 44px, which `docs/STYLE_GUIDE_V2.md:22` has always required
 * and which the four chat composer controls (40px) do not meet.
 *
 * SENDING IS ENQUEUEING, ALWAYS
 * -----------------------------
 * The photograph goes into the local queue and the sheet closes; the queue is
 * what talks to the server (`useAskQueueSync`). There is deliberately no second
 * "send it now" path for when the phone happens to have signal: a code path that
 * only runs when the network is good is a code path nobody exercises when it is
 * bad. It also gets the dealer off a spinner — on 2G a direct send holds this
 * sheet open for the best part of a minute, and the page they photographed is
 * already safe by then.
 */
export interface AskSheetProps {
  /** The whole payload: the sheet needs `today` and the other days on offer. */
  list: DealerDocumentAskList;
  /** The row this photograph is meant for, before the dealer gets a say. */
  row: DealerDocumentAskRow;
  file: File;
  contentType: DocumentAskMime;
  kind: 'image' | 'file';
  onClose: () => void;
  /**
   * Drop this photograph and go back to the camera for the same row. It runs in
   * the CALLER, which owns the file input — a picker must be opened inside the
   * tap that asked for it, and a picker opened from here would be opened from a
   * React state change instead.
   */
  onRetake: () => void;
  /** The photograph is in the queue. The row it was filed against is passed back. */
  onQueued: (row: DealerDocumentAskRow) => void;
}

/**
 * A value the retry replays unchanged, so a submit that succeeded while its
 * response was lost is recognised rather than refused as a second send.
 *
 * `crypto.randomUUID` is missing from the Android 8/9 System WebView this app
 * targets, so it is used when present and a time-plus-random string stands in
 * when it is not. Uniqueness only has to hold within one dealer's own queue.
 */
function mintClientRef(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function AskSheet({
  list,
  row,
  file,
  contentType,
  kind,
  onClose,
  onRetake,
  onQueued,
}: AskSheetProps) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const online = useOnline();
  const dealerId = useAuthStore((s) => s.user?.dealerId);
  const enqueue = useAskQueueStore((s) => s.enqueue);
  const panelRef = useDialog(onClose);
  const titleId = React.useId();

  // Which row the photograph will actually be filed against. It starts as the
  // one the dealer tapped and only moves if they say so.
  const [target, setTarget] = React.useState<DealerDocumentAskRow>(row);
  const [choosing, setChoosing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  // One object URL, revoked when the file changes and again on unmount — a
  // low-RAM phone otherwise holds the decoded bitmap for the life of the session.
  React.useEffect(() => {
    if (kind !== 'image') return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, kind]);

  // The other days this same page could belong to. Before six in the morning
  // yesterday comes first — see `dayOptions` for the night shift this is about.
  const days = React.useMemo(
    () => dayOptions(list.rows, target.kindCode, list.today),
    [list.rows, list.today, target.kindCode],
  );
  const hasChoice = days.length > 1;

  const dayLabel = (r: DealerDocumentAskRow): string =>
    documentPeriodLabel(r.periodKind, r.periodKey, lang, list.today);

  const title = pick(lang, target.titleEn, target.titleHi);
  const hint = pick(lang, target.hintEn, target.hintHi);
  const period = dayLabel(target);

  const send = async () => {
    if (busy) return;
    if (!dealerId) {
      // A dealer token always carries a dealerId. If it somehow does not there
      // is nothing to presign against, and no amount of tapping will fix it —
      // so say the one thing that can be acted on rather than spinning.
      toast.error(t('common.helpDesc'));
      return;
    }
    setBusy(true);
    try {
      // Shrunk and named BEFORE it is queued: the queue keeps its bytes in
      // localStorage, and a 6 MB camera JPEG does not fit in a 5 MB quota.
      const photo = await prepareAskFile(file, contentType);
      const base64 = await fileToBase64(photo.file);
      enqueue({
        matchKey: askMatchKey(target),
        clientRef: mintClientRef(),
        dealerId,
        // An `owed` line has no row anywhere, so there is no id yet and the
        // queue mints one before it uploads. `source` is answering "does a
        // server row exist", which is a different question from where to post —
        // that is always `submitVia`, read straight off the row.
        ...(target.source === 'ask' ? { askId: target.id } : {}),
        submitVia: target.submitVia,
        kindCode: target.kindCode,
        periodKind: target.periodKind,
        // The BASE key. Any `:<slug>` suffix is composed by the server from the
        // admin's own words; a client that sent its own would be shipping its
        // own slugifier, and two bundles disagreeing about that silently puts
        // one request into two rows or two into one.
        periodKey: documentPeriodBaseKey(target.periodKey),
        ...(target.label ? { label: target.label } : {}),
        filename: photo.filename,
        contentType,
        kind,
        size: photo.size,
        base64,
        queuedAt: new Date().toISOString(),
        attempts: 0,
        state: 'queued',
      });
      // Two true sentences, and which one is true depends on the network. Never
      // "sent" while the phone is in a dead spot — that is the promise this
      // whole queue exists to avoid making falsely.
      if (online) {
        toast.success(t('asks.sentToast'), { description: t('asks.sentToastDesc') });
      } else {
        toast.info(t('asks.queued'));
      }
      onQueued(target);
      onClose();
    } catch {
      // Reading or shrinking the file failed on the phone itself; nothing has
      // left it. Say what to do next rather than naming the step that broke.
      toast.error(t('asks.notSent'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('common.cancel')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative mx-auto flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl border border-border bg-surface shadow-lg outline-none"
      >
        <div className="flex justify-center pt-2" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-border-strong" />
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-2 pt-3">
          <p id={titleId} className="text-[15px] font-semibold text-text">
            {title}
          </p>

          {kind === 'image' && previewUrl ? (
            <img
              src={previewUrl}
              alt={t('asks.photoAlt')}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className="mt-3 max-h-[46vh] w-full rounded-xl bg-surface-2 object-contain"
            />
          ) : (
            // A PDF has no preview worth drawing on a 360px screen, so it is
            // named and measured instead — enough for the dealer to recognise
            // the file they picked, which is the only question this sheet asks.
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-4">
              <FileText width={22} strokeWidth={1.75} className="shrink-0 text-text-muted" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{t('asks.pdfPicked')}</p>
                <p className="mt-0.5 text-xs text-text-muted">{formatBytes(file.size)}</p>
              </div>
            </div>
          )}

          {/* THE REFUSABLE SENTENCE. A paper with no period of its own (a fire
              NOC) gets the catalog's own question instead — inventing a day for
              it would file it under a period the document does not have. */}
          <p className="mt-3 text-sm text-text">
            {period
              ? t('asks.confirmPeriod', { day: period })
              : pick(lang, target.confirmEn, target.confirmHi)}
          </p>

          {hint ? <p className="mt-2 text-xs text-text-muted">{hint}</p> : null}

          {choosing ? (
            <div className="mt-3 rounded-xl border border-border p-2">
              <p className="px-1 pb-1 text-xs font-medium text-text-muted">
                {t('asks.whichDay')}
              </p>
              {days.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setTarget(option);
                    setChoosing(false);
                  }}
                  aria-pressed={option.id === target.id}
                  className={
                    option.id === target.id
                      ? 'flex min-h-[44px] w-full items-center rounded-lg bg-brand-soft px-3 text-left text-sm font-medium text-text'
                      : 'flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm text-text active:bg-surface-2'
                  }
                >
                  {dayLabel(option)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <footer className="flex flex-col gap-2 border-t border-border p-3">
          {!online ? (
            <p className="px-1 text-center text-xs text-warning-strong">{t('asks.queued')}</p>
          ) : null}

          <Button size="lg" fullWidth loading={busy} onClick={() => void send()}>
            {busy
              ? t('asks.sending')
              : period
                ? t('asks.sendForDay', { day: period })
                : t('asks.sendThis')}
          </Button>

          {/* Only offered when there IS another day. A button that opens a list
              of one is a button that wastes the tap it took to find out. */}
          {hasChoice ? (
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              disabled={busy}
              onClick={() => setChoosing((v) => !v)}
            >
              {t('asks.chooseAnotherDay')}
            </Button>
          ) : null}

          <Button variant="ghost" size="lg" fullWidth disabled={busy} onClick={onRetake}>
            {t('asks.takeAgain')}
          </Button>
        </footer>
      </div>
    </div>
  );
}
