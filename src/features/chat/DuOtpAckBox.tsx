import { Check, Fuel } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { useAnswerDuOtp, useAnswerDuOtpPaper, useDuOtp } from '@/hooks/api/useDuOtp';
import { useT, type MessageKey } from '@/lib/i18n';
import type { DuOtpAnswerInput, DuOtpFileSlot } from '@dk/shared/schemas';
import type { DuOtpAckView, DuOtpEntryView, DuOtpGroupView } from '@dk/shared/types';

import { BusyLine, CollectingStep, Notice, PRIMARY_BUTTON, TEXT_BUTTON } from './DuOtpSteps';
import {
  duLine,
  duOtpErrorText,
  groupFailure,
  nozzleText,
  otpDateOf,
  summariseRecent,
} from './duOtpView';

/** What MDG will need, in the order the box asks — said once, before the owner starts. */
const NEED_KEYS: readonly MessageKey[] = [
  'chat.duOtpNeedReasons',
  'chat.duOtpNeedCertificate',
  'chat.duOtpNeedReport',
  'chat.duOtpNeedOther',
  'chat.duOtpNeedRemark',
  'chat.duOtpNeedDate',
];

/** The events of one dispensing unit: which nozzle, and the OTP's date. */
function EntryLines({ entries }: { entries: readonly DuOtpEntryView[] }) {
  const t = useT();
  return (
    <ul className="mt-0.5 flex list-none flex-col gap-0.5 p-0">
      {entries.map((e) => {
        const nozzle = e.nozzleNo.trim();
        const date = otpDateOf(e);
        const text = [
          nozzle ? t('chat.duOtpNozzle', { n: nozzle }) : '',
          date ? t('chat.duOtpOtpDate', { date }) : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <li
            key={e.id}
            data-du-entry={e.id}
            data-state={e.state}
            className="flex items-start gap-1.5 text-[13px] leading-snug text-wa-meta"
          >
            {e.state === 'submitted' ? (
              <Check width={14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-success" aria-hidden />
            ) : null}
            <span className="min-w-0 break-words">{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Do it for me": what MDG will need, and the one button that starts it. One for
 * the whole box — it moves every waiting event to the first question — so it is
 * drawn once, under the events it speaks for, however many dispensing units there
 * are.
 */
function StartBlock() {
  const t = useT();
  const start = useAnswerDuOtp();
  const [error, setError] = React.useState<string | null>(null);

  const go = async () => {
    setError(null);
    try {
      await start.mutateAsync({ step: 'start' });
    } catch (err) {
      setError(duOtpErrorText(err, t, 'answer'));
    }
  };

  return (
    <div data-du-start className="flex flex-col gap-2 border-t border-wa-divider pt-3">
      <p className="text-[14px] font-medium leading-snug">{t('chat.duOtpNeedTitle')}</p>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px] leading-snug">
        {NEED_KEYS.map((key) => (
          <li key={key} className="break-words">
            {t(key)}
          </li>
        ))}
      </ul>
      {error ? <Notice text={error} /> : null}
      <button
        type="button"
        disabled={start.isPending}
        aria-busy={start.isPending}
        onClick={() => void go()}
        className={PRIMARY_BUTTON}
      >
        {start.isPending ? <Spinner size={16} /> : null}
        {t('chat.duOtpStart')}
      </button>
    </div>
  );
}

/** A submit that did not go through: the words, that MDG knows, and one tap to try again. */
function FailedBlock({
  group,
  busy,
  error,
  onRetry,
}: {
  group: DuOtpGroupView;
  busy: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const t = useT();
  return (
    <div data-du-failed className="mt-2 flex flex-col gap-2">
      <Notice text={groupFailure(group) ?? t('chat.duOtpFailedFallback')} />
      <p className="text-[13px] leading-snug text-wa-meta">{t('chat.duOtpTeamTold')}</p>
      {error ? <Notice text={error} /> : null}
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={onRetry}
        className={PRIMARY_BUTTON}
      >
        {busy ? <Spinner size={16} /> : null}
        {t('common.retry')}
      </button>
    </div>
  );
}

/**
 * One dispensing unit, as its own section: which DU and its events, then whatever
 * its state calls for — a step's input, the words of a submit in progress, or the
 * words of one that failed.
 *
 * Each section keeps its own request and error, so two units never share a busy
 * flag, and the step's input is keyed on the step: a step the server has moved on
 * from is a fresh form, never the old one with its text still in it.
 */
function GroupSection({ view, group }: { view: DuOtpAckView; group: DuOtpGroupView }) {
  const t = useT();
  const answer = useAnswerDuOtp();
  const paper = useAnswerDuOtpPaper();
  const [error, setError] = React.useState<string | null>(null);
  const busy = answer.isPending || paper.isPending;

  const send = async (body: DuOtpAnswerInput) => {
    setError(null);
    try {
      await answer.mutateAsync(body);
    } catch (err) {
      setError(duOtpErrorText(err, t, 'answer'));
    }
  };

  const sendPaper = async (slot: DuOtpFileSlot, file: File) => {
    setError(null);
    try {
      await paper.mutateAsync({ dealerId: view.dealerId, group: group.key, slot, file });
    } catch (err) {
      setError(duOtpErrorText(err, t, 'paper'));
    }
  };

  const line = duLine(t, group);

  return (
    <section
      data-du-group={group.key}
      data-state={group.state}
      data-step={group.step ?? ''}
      className="border-t border-wa-divider pt-3 first:border-t-0 first:pt-0"
    >
      {line ? <p className="break-words text-[14px] font-medium leading-snug">{line}</p> : null}
      <EntryLines entries={group.entries} />

      {group.state === 'collecting' ? (
        <CollectingStep
          key={group.step ?? 'reasons'}
          view={view}
          group={group}
          busy={busy}
          uploading={paper.isPending}
          onAnswer={(body) => void send(body)}
          onPaper={(slot, file) => void sendPaper(slot, file)}
        />
      ) : null}

      {group.state === 'ready' || group.state === 'submitting' ? (
        <div data-du-submitting className="mt-2">
          <BusyLine text={t('chat.duOtpSubmitting')} />
        </div>
      ) : null}

      {group.state === 'failed' ? (
        <FailedBlock
          group={group}
          busy={busy}
          error={error}
          onRetry={() => void send({ step: 'submit', group: group.key })}
        />
      ) : null}

      {/* A collecting group draws its error under its step's input. */}
      {error && group.state !== 'failed' ? (
        <div className="mt-2">
          <Notice text={error} />
        </div>
      ) : null}
    </section>
  );
}

/** The events MDG closed in the last two weeks: filed by us, or gone from the portal's list by themselves. */
function RecentLines({ recent }: { recent: DuOtpAckView['recent'] }) {
  const t = useT();
  const lines = summariseRecent(recent);
  if (lines.length === 0) return null;
  return (
    <ul data-du-recent className="m-0 flex list-none flex-col gap-2 p-0">
      {lines.map((l) => {
        const name = [duLine(t, l), nozzleText(t, l.nozzles)].filter(Boolean).join(' · ');
        const date = l.date ?? '—';
        return (
          <li key={l.key} data-state={l.state} className="flex items-start gap-2 text-[13px] leading-snug">
            <Check width={14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-success" aria-hidden />
            <span className="min-w-0 break-words">
              {name ? <span className="block font-medium">{name}</span> : null}
              <span className="block text-wa-meta">
                {l.state === 'submitted'
                  ? t('chat.duOtpDone', { date })
                  : t('chat.duOtpGone', { date })}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The DU OTP Acknowledgement box inside an MDG message (`message.duOtpAck`,
 * ADR 0033).
 *
 * When a dispensing unit is opened with an OTP, IndianOil's portal lists the event
 * and the owner must acknowledge it, or the pump's supply is stopped. MDG reads
 * the list and posts this box; the owner taps "Do it for me" and gives what the
 * portal needs one step at a time — why it was opened, the calibration
 * certificate, the DU service report, any other paper, a remark — then checks it
 * and submits. MDG files it and says so.
 *
 * THE BOX DRAWS THE OUTLET'S STATE NOW, never what was true when it was posted: it
 * is a message, and a message cannot be edited, so it reads the live view and
 * follows it (`useDuOtp`). With several dispensing units open, each is its own
 * section, in order; with nothing open it says so in one quiet line.
 *
 * It is the only thing in the chat that asks for this view, so a chat with no box
 * in it never makes the call.
 */
export function DuOtpAckBox() {
  const t = useT();
  const q = useDuOtp();
  const view = q.data;
  const failed = q.isError && !view;
  const { refetch } = q;

  const open = view?.groups ?? [];
  const recent = view?.recent ?? [];
  const anyPending = open.some((g) => g.state === 'pending');
  const status = failed
    ? 'failed'
    : !view
      ? 'loading'
      : open.length > 0
        ? 'open'
        : recent.length > 0
          ? 'done'
          : 'none';

  return (
    <div
      data-du-otp
      data-status={status}
      // A touch in the box (a tick, a file, the remark) must not select the
      // message or start a reply swipe: neither gesture may see it.
      data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}
      className="mt-1"
    >
      {status === 'none' ? (
        <p className="px-1.5 text-[13px] leading-snug text-wa-meta">{t('chat.duOtpNone')}</p>
      ) : (
        <div className="rounded-md bg-wa-row-active px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 break-words text-[14px] font-medium leading-snug">
              <Fuel width={14} strokeWidth={2} className="shrink-0 text-wa-meta" aria-hidden />
              {t('chat.duOtpTitle')}
            </p>
            {status === 'loading' ? <Spinner size={14} /> : null}
          </div>

          {failed ? (
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-[13px] leading-snug text-wa-meta">{t('chat.askStateFailed')}</span>
              <button type="button" onClick={() => void refetch()} className={TEXT_BUTTON}>
                {t('common.retry')}
              </button>
            </div>
          ) : null}

          {view && open.length > 0 ? (
            <div className="mt-2 flex flex-col gap-3">
              {view.supplyBlockedForOtp === true ? <Notice text={t('chat.duOtpBlocked')} /> : null}
              <div className="flex flex-col gap-3">
                {open.map((group) => (
                  <GroupSection key={group.key} view={view} group={group} />
                ))}
              </div>
              {anyPending ? <StartBlock /> : null}
            </div>
          ) : null}

          {view && recent.length > 0 ? (
            <div className={open.length > 0 ? 'mt-3 border-t border-wa-divider pt-3' : 'mt-2'}>
              <RecentLines recent={recent} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
