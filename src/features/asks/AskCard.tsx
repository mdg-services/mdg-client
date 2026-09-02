import { Camera, CheckCircle2, Clock3, FileText, ImageIcon, ShieldCheck } from 'lucide-react';
import * as React from 'react';

import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { pick, useLang, useT } from '@/lib/i18n';
import { useOnline } from '@/lib/useOnline';
import type { QueuedAskPhoto } from '@/store/askQueue';
import { documentPeriodLabel, type DealerDocumentAskRow } from '@dk/shared/types';

/**
 * One paper, as the dealer reads it.
 *
 * THE CARD NEVER SHOWS A RAW DATE, AND THAT IS ENFORCED BY HAVING ONLY ONE WAY
 * TO PRINT ONE. Every period and every due date on this card goes through
 * `documentPeriodLabel` from `shared` — the same function the server's push
 * notification uses — so the card and the notification that opened it can never
 * name the same period two different ways, and a `2026-09-02` cannot reach a
 * forecourt owner's screen. `row.periodLabel` arrives already formatted and is
 * deliberately NOT used: the server formatted it in the language stored on the
 * ACCOUNT, and the dealer may have flipped the toggle on this device since.
 *
 * FOUR FACES, AND THE DIFFERENCES BETWEEN THEM ARE NOT COSMETIC
 * ------------------------------------------------------------
 *  - THEIR TURN. A camera, and the phone's files beside it.
 *  - WAITING TO GO. A photograph is on the phone and has not left it. NO camera
 *    button: a live camera over bytes that are already waiting is an invitation
 *    to photograph the same page twice, and the second one supersedes the first
 *    for no reason.
 *  - WITH MDG. Not a success state and not coloured like one. "The dealer sent
 *    it" and "MDG accepted it" are different facts about different people, and a
 *    green tick on the first is a promise the second may not keep.
 *  - DONE. And it says WHICH promise: a person at MDG looked, or a machine
 *    signal settled it and nobody looked. Collapsing those two publishes a claim
 *    MDG never made.
 */
export interface AskCardProps {
  row: DealerDocumentAskRow;
  /** The IST day the labels are formatted against — the server's, not the phone's. */
  today: string;
  /** This row's photograph, if one is sitting in the local queue. */
  queued?: QueuedAskPhoto;
  onCamera: (row: DealerDocumentAskRow) => void;
  onFiles: (row: DealerDocumentAskRow) => void;
  /** Take the dealer to the Kavach screen, which owns that exchange. */
  onKavach: () => void;
}

export function AskCard({ row, today, queued, onCamera, onFiles, onKavach }: AskCardProps) {
  const t = useT();
  const lang = useLang();
  const online = useOnline();

  const title = pick(lang, row.titleEn, row.titleHi);
  const hint = pick(lang, row.hintEn, row.hintHi);
  const period = documentPeriodLabel(row.periodKind, row.periodKey, lang, today);
  // A due date is a DAY key like any other, so it is printed by the same
  // function. It reaches the payload as `2026-09-05` and must not leave this
  // component that way.
  const due = row.dueOn ? documentPeriodLabel('DAY', row.dueOn, lang, today) : '';

  const rejected = row.state === 'REJECTED';
  const mine = row.waitingOn === 'dealer';
  // `stuck` means the server refused it; the dealer needs the camera back. Only
  // `queued` and `sending` mean "leave it alone, it is on its way".
  const waitingToGo = queued && queued.state !== 'stuck';
  const failed = queued?.state === 'stuck';
  // A photograph that is queued WITH a network is on its way, and the promise
  // about the internet coming back would be a strange thing to read while it
  // is. Only a phone that knows it is offline gets the waiting sentence.
  const goingNow = waitingToGo && (queued?.state === 'sending' || online);

  const tone: Tone = mine ? (rejected ? 'attention' : 'todo') : row.waitingOn === 'mdg' ? 'sent' : 'done';

  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface p-4 shadow-sm',
        tone === 'attention' ? 'border-warning/40' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            TILE[tone],
          )}
          aria-hidden
        >
          <HeadIcon tone={tone} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-text">{title}</p>
          {period ? <p className="mt-0.5 text-xs text-text-muted">{period}</p> : null}
          {/* What MDG actually asked for, in the admin's own words. Required for
              a freeform kind — "A document MDG asked for" tells a dealer
              nothing, which is the hole the staff-points catch-all works had. */}
          {row.label ? (
            <p className="mt-1 text-sm font-medium text-text">{row.label}</p>
          ) : null}
        </div>
        {row.late && mine ? (
          <span className="shrink-0 rounded-full bg-warning-strong px-2 py-0.5 text-[11px] font-medium text-white">
            {t('asks.lateBadge')}
          </span>
        ) : null}
      </div>

      {row.note ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-text-muted">{row.note}</p>
      ) : mine && hint ? (
        <p className="mt-3 text-sm text-text-muted">{hint}</p>
      ) : null}

      {/* MDG's verdict, VERBATIM, and labelled as MDG's words. It is typed by an
          admin, in English, and it is the only thing telling the dealer what a
          second photograph has to show — so paraphrasing it into the app's own
          Hindi voice would delete the instruction, and printing it unlabelled
          would look like the app switching language mid-card. */}
      {rejected && row.rejectReason ? (
        <div className="mt-3 rounded-xl bg-warning-soft px-3 py-2">
          <p className="text-xs font-medium text-warning-strong">{t('asks.rejectedFrom')}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-text">{row.rejectReason}</p>
        </div>
      ) : null}

      {due && mine ? <p className="mt-2 text-xs text-text-muted">{t('asks.dueOn', { day: due })}</p> : null}

      <div className="mt-3">
        {waitingToGo ? (
          <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-text-muted">
            {goingNow ? <Spinner size={14} /> : null}
            {goingNow ? t('asks.sendingShort') : t('asks.queued')}
          </p>
        ) : mine ? (
          <div className="flex flex-col gap-2">
            {/* Never the words "error" or "failed": what the dealer needs is the
                next action, which is a fresh photograph. */}
            {failed ? (
              <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                {t('asks.notSent')}
              </p>
            ) : null}
            {row.source === 'kavach' ? (
              // Answered through the Kavach screen, which already owns that
              // exchange end to end. One tap to the right screen beats a second
              // implementation of it here that can drift from the first.
              <Button size="lg" fullWidth leftIcon={<ShieldCheck width={16} strokeWidth={2} />} onClick={onKavach}>
                {t('asks.openInKavach')}
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  fullWidth
                  leftIcon={<Camera width={16} strokeWidth={2} />}
                  onClick={() => onCamera(row)}
                >
                  {rejected ? t('asks.sendAgain') : t('asks.takePhoto')}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  leftIcon={<ImageIcon width={16} strokeWidth={1.75} />}
                  onClick={() => onFiles(row)}
                >
                  {t('asks.choosePhoto')}
                </Button>
              </>
            )}
          </div>
        ) : row.waitingOn === 'mdg' ? (
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <p className="text-sm font-medium text-info">{t('asks.sentWaiting')}</p>
            <p className="mt-0.5 text-xs text-text-muted">{t('asks.sentWaitingDesc')}</p>
          </div>
        ) : (
          <p className="text-sm font-medium text-success">
            {row.reviewedByKind === 'system'
              ? t('asks.acceptedBySystem')
              : t('asks.acceptedByAdmin')}
          </p>
        )}
      </div>
    </div>
  );
}

type Tone = 'todo' | 'attention' | 'sent' | 'done';

const TILE: Record<Tone, string> = {
  todo: 'bg-surface-2 text-text-muted',
  attention: 'bg-warning-soft text-warning-strong',
  sent: 'bg-info-soft text-info',
  done: 'bg-success-soft text-success',
};

/**
 * The icon in the tile. A paper is a paper whether it is still to send or has
 * come back — the TILE COLOUR is what separates those two, not a second icon —
 * so `todo` and `attention` share one, and only the two settled states get a
 * face of their own.
 */
function HeadIcon({ tone }: { tone: Tone }) {
  if (tone === 'done') return <CheckCircle2 width={20} strokeWidth={2} />;
  if (tone === 'sent') return <Clock3 width={20} strokeWidth={1.75} />;
  return <FileText width={20} strokeWidth={1.75} />;
}
