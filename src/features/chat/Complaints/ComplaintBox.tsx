import { Check, Wrench, X } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { useAnswerComplaint, useComplaints } from '@/hooks/api/useComplaints';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import type { ComplaintAnswerInput } from '@dk/shared/schemas';
import {
  sayIn,
  type ComplaintDealerView,
  type ComplaintOption,
  type ComplaintQuestion,
  type ComplaintStep,
} from '@dk/shared/types';

import {
  BusyLine,
  INPUT_CLASS,
  Notice,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TEXT_BUTTON,
} from '../DuOtpSteps';

import {
  cleanNumber,
  complaintOf,
  complaintsErrorText,
  dayReady,
  isLiveBox,
  stepTime,
  todayInIndia,
} from './complaintsView';
import { VendorMailCard } from './VendorMailCard';

type Send = (body: ComplaintAnswerInput) => void;

/** One option as a big tappable row: the label, and under it the small line (a machine's make and serial). */
const CHIP =
  'flex min-h-11 w-full items-center gap-2 rounded-lg border border-wa-divider bg-wa-chip px-3 py-2 text-left text-[15px] text-wa-bubble-text transition-colors duration-150 active:bg-wa-row-active disabled:opacity-60';

function Chip({
  option,
  busy,
  selected,
  quiet,
  onTap,
}: {
  option: ComplaintOption;
  busy: boolean;
  /** Set only on a many-answers question: the chip toggles and shows its state. */
  selected?: boolean;
  /** The "something else" chip: lighter, so it does not look like a likely answer. */
  quiet?: boolean;
  onTap: () => void;
}) {
  const lang = useLang();
  const hint = option.hint ? sayIn(option.hint, lang) : '';
  const toggles = selected !== undefined;
  return (
    <button
      type="button"
      data-complaint-option={option.id}
      aria-pressed={toggles ? selected : undefined}
      disabled={busy}
      onClick={onTap}
      className={cn(
        CHIP,
        quiet && 'border-dashed text-wa-accent-strong',
        selected && 'border-wa-accent bg-wa-row-active',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="min-w-0 break-words font-medium leading-snug">
          {sayIn(option.label, lang)}
        </span>
        {hint ? (
          <span className="min-w-0 break-words text-[13px] font-normal leading-snug text-wa-meta">
            {hint}
          </span>
        ) : null}
      </span>
      {toggles ? (
        <span
          aria-hidden
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150',
            selected ? 'border-wa-accent bg-wa-accent text-white' : 'border-wa-divider bg-wa-in',
          )}
        >
          {selected ? <Check width={14} strokeWidth={3} /> : null}
        </span>
      ) : null}
    </button>
  );
}

/** A number or a few words, typed in the box: for a question the buttons cannot cover. */
function TypedAnswer({
  question,
  busy,
  onSend,
}: {
  question: ComplaintQuestion;
  busy: boolean;
  onSend: (text: string) => void;
}) {
  const t = useT();
  const [value, setValue] = React.useState('');
  const isNumber = question.input === 'number';
  const ready = isNumber ? cleanNumber(value) : value.trim() || null;
  const go = () => {
    if (ready && !busy) onSend(ready);
  };
  return (
    <div className="flex items-stretch gap-2">
      <input
        data-complaint-input={question.input}
        type="text"
        inputMode={isNumber ? 'decimal' : 'text'}
        enterKeyHint="send"
        value={value}
        maxLength={isNumber ? 12 : 500}
        disabled={busy}
        placeholder={isNumber ? t('chat.complaintsNumberHint') : t('chat.complaintsTextHint')}
        aria-label={isNumber ? t('chat.complaintsNumberHint') : t('chat.complaintsTextHint')}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            go();
          }
        }}
        className={cn(INPUT_CLASS, 'min-h-11 min-w-0 flex-1')}
      />
      <button
        type="button"
        disabled={busy || !ready}
        onClick={go}
        className={cn(PRIMARY_BUTTON, 'w-auto shrink-0 px-4')}
      >
        {busy ? <Spinner size={16} /> : null}
        {t('chat.complaintsSend')}
      </button>
    </div>
  );
}

/** A day, picked in the box: it stops at today, because the e-mail has already been sent. */
function DateAnswer({ busy, onSend }: { busy: boolean; onSend: (day: string) => void }) {
  const t = useT();
  const [value, setValue] = React.useState('');
  const max = todayInIndia();
  const ready = dayReady(value);
  return (
    <div className="flex items-stretch gap-2">
      <input
        data-complaint-input="date"
        type="date"
        value={value}
        max={max}
        disabled={busy}
        aria-label={t('chat.complaintsPickDay')}
        onChange={(e) => setValue(e.target.value)}
        className={cn(INPUT_CLASS, 'min-h-11 min-w-0 flex-1')}
      />
      <button
        type="button"
        disabled={busy || !ready}
        onClick={() => ready && onSend(ready)}
        className={cn(PRIMARY_BUTTON, 'w-auto shrink-0 px-4')}
      >
        {busy ? <Spinner size={16} /> : null}
        {t('chat.complaintsSend')}
      </button>
    </div>
  );
}

/** The one question open now: its words, then its answers as big buttons. */
function Asking({ view, busy, onAnswer }: { view: ComplaintDealerView; busy: boolean; onAnswer: Send }) {
  const t = useT();
  const lang = useLang();
  const q = view.question;
  const [picked, setPicked] = React.useState<string[]>([]);
  if (!q) return null;
  const more = q.moreOptionId;
  const base = { complaintId: view.id, questionId: q.id } as const;
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    // Keyed on the question by the caller: a new question starts with nothing picked.
    <div className="flex flex-col gap-2">
      <p className="break-words text-[15px] font-medium leading-snug">{sayIn(q.prompt, lang)}</p>
      <div className="flex flex-col gap-1.5">
        {q.options.map((o) => {
          const isMore = o.id === more;
          return (
            <Chip
              key={o.id}
              option={o}
              busy={busy}
              quiet={isMore}
              selected={q.multi && !isMore ? picked.includes(o.id) : undefined}
              onTap={() =>
                q.multi && !isMore
                  ? toggle(o.id)
                  : onAnswer({ step: 'option', ...base, optionId: o.id })
              }
            />
          );
        })}
      </div>
      {q.multi ? (
        <button
          type="button"
          disabled={busy || picked.length === 0}
          onClick={() => onAnswer({ step: 'options', ...base, optionIds: picked })}
          className={PRIMARY_BUTTON}
        >
          {busy ? <Spinner size={16} /> : null}
          {t('chat.complaintsDone')}
        </button>
      ) : null}
      {q.input === 'date' ? (
        <DateAnswer busy={busy} onSend={(text) => onAnswer({ step: 'text', ...base, text })} />
      ) : q.input ? (
        <TypedAnswer
          question={q}
          busy={busy}
          onSend={(text) => onAnswer({ step: 'text', ...base, text })}
        />
      ) : null}
    </div>
  );
}

/** The summary, one row per fact, and the three ways to answer it. */
function Confirm({ view, busy, onAnswer }: { view: ComplaintDealerView; busy: boolean; onAnswer: Send }) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="flex flex-col gap-2">
      {view.summary?.length ? (
        <dl className="m-0 flex flex-col divide-y divide-wa-divider rounded-lg bg-wa-in px-3 py-0.5">
          {view.summary.map((row, i) => (
            <div key={i} className="flex flex-col gap-0.5 py-1.5">
              <dt className="text-[12px] leading-snug text-wa-meta">{sayIn(row.label, lang)}</dt>
              <dd className="m-0 min-w-0 break-words text-[14px] leading-snug">
                {sayIn(row.value, lang)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => onAnswer({ step: 'confirm', complaintId: view.id })}
        className={PRIMARY_BUTTON}
      >
        {busy ? <Spinner size={16} /> : null}
        {t('chat.complaintsFile')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onAnswer({ step: 'change', complaintId: view.id })}
        className={SECONDARY_BUTTON}
      >
        {t('chat.complaintsChange')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onAnswer({ step: 'cancel', complaintId: view.id })}
        className={cn(TEXT_BUTTON, 'self-center')}
      >
        {t('chat.complaintsLeave')}
      </button>
    </div>
  );
}

/** One step: a round mark (done, now, still to come, stopped), its words and the time it was reached. */
function StepRow({ step, last }: { step: ComplaintStep; last: boolean }) {
  const lang = useLang();
  const at = stepTime(step.at, lang);
  const { state } = step;
  return (
    <li data-complaint-step={step.key} data-state={state} className="flex gap-2.5">
      <span className="flex flex-col items-center">
        <span
          aria-hidden
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200',
            state === 'done' && 'border-success bg-success text-white',
            state === 'current' && 'border-wa-accent bg-wa-in',
            state === 'todo' && 'border-wa-divider bg-wa-in',
            state === 'failed' && 'border-danger bg-danger text-white',
          )}
        >
          {state === 'done' ? <Check width={12} strokeWidth={3} /> : null}
          {state === 'failed' ? <X width={12} strokeWidth={3} /> : null}
          {state === 'current' ? <span className="size-2 animate-pulse rounded-full bg-wa-accent" /> : null}
        </span>
        {last ? null : (
          <span
            aria-hidden
            className={cn('my-0.5 w-px flex-1', state === 'done' ? 'bg-success' : 'bg-wa-divider')}
          />
        )}
      </span>
      <span className={cn('flex min-w-0 flex-col pb-2', last && 'pb-0')}>
        <span
          className={cn(
            'min-w-0 break-words text-[14px] leading-5',
            state === 'current' && 'font-medium',
            state === 'todo' && 'text-wa-meta',
            state === 'failed' && 'font-medium text-danger',
          )}
        >
          {sayIn(step.label, lang)}
        </span>
        {at ? <span className="text-[12px] leading-snug text-wa-meta">{at}</span> : null}
      </span>
    </li>
  );
}

function Tracker({ steps }: { steps: ComplaintStep[] }) {
  const t = useT();
  if (!steps.length) return null;
  return (
    <ol
      aria-label={t('chat.complaintsStepsLabel')}
      className="m-0 flex list-none flex-col rounded-lg bg-wa-in px-3 py-2.5"
    >
      {steps.map((s, i) => (
        <StepRow key={s.key} step={s} last={i === steps.length - 1} />
      ))}
    </ol>
  );
}

/**
 * The engineer's name and number as plain text the dealer can press and hold to
 * copy. Never a `tel:` link: the build refuses every way out of the app that is
 * not on its short list (`check:leaving-the-app`).
 */
function Engineer({ view }: { view: ComplaintDealerView }) {
  const t = useT();
  const e = view.engineer;
  if (!e || (!e.name && !e.phone && !e.etaHours)) return null;
  return (
    <div data-complaint-engineer className="flex flex-col gap-0.5 rounded-lg bg-wa-in px-3 py-2">
      <span className="text-[12px] leading-snug text-wa-meta">{t('chat.complaintsEngineer')}</span>
      {e.name ? <span className="break-words text-[14px] font-medium leading-snug">{e.name}</span> : null}
      {e.phone ? (
        <span className="select-text break-all text-[14px] leading-snug tabular-nums">{e.phone}</span>
      ) : null}
      {e.etaHours ? (
        <span className="text-[13px] leading-snug text-wa-meta">
          {t('chat.complaintsEta', { hours: e.etaHours })}
        </span>
      ) : null}
    </div>
  );
}

function Screen({
  view,
  busy,
  onAnswer,
}: {
  view: ComplaintDealerView;
  busy: boolean;
  onAnswer: Send;
}) {
  const t = useT();
  const lang = useLang();
  const status = sayIn(view.statusLine, lang);

  switch (view.screen) {
    case 'asking':
    case 'ack_reason':
      return <Asking key={view.question?.id} view={view} busy={busy} onAnswer={onAnswer} />;

    case 'confirm':
      return <Confirm view={view} busy={busy} onAnswer={onAnswer} />;

    case 'filing':
      return <BusyLine text={status || t('chat.complaintsFiling')} />;

    case 'acknowledging':
      return <BusyLine text={status || t('chat.complaintsAcknowledging')} />;

    case 'ack':
      return (
        <div className="flex flex-col gap-2">
          <Tracker steps={view.steps} />
          <Engineer view={view} />
          <p className="break-words text-[15px] font-medium leading-snug">
            {t('chat.complaintsAckQuestion')}
          </p>
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => onAnswer({ step: 'ack', complaintId: view.id, fixed: true })}
            className={PRIMARY_BUTTON}
          >
            {busy ? <Spinner size={16} /> : null}
            {t('chat.complaintsYesFixed')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAnswer({ step: 'ack', complaintId: view.id, fixed: false })}
            className={SECONDARY_BUTTON}
          >
            {t('chat.complaintsNotFixed')}
          </button>
        </div>
      );

    case 'tracking':
    case 'done':
    case 'failed':
    case 'cancelled':
      return (
        <div className="flex flex-col gap-2">
          <Tracker steps={view.steps} />
          {view.screen === 'tracking' ? <Engineer view={view} /> : null}
          {status ? <p className="break-words text-[14px] leading-snug">{status}</p> : null}
          {/* "It has not moved": the step tracker above stays; the question and, when the owner sends
              the reminder himself, the e-mail to copy come under it. */}
          {view.screen === 'tracking' && view.reminderMail ? <VendorMailCard mail={view.reminderMail} /> : null}
          {view.screen === 'tracking' && view.question ? (
            <Asking key={view.question.id} view={view} busy={busy} onAnswer={onAnswer} />
          ) : null}
          {view.screen === 'tracking' && view.canCheckNow ? (
            <button
              type="button"
              data-complaint-check-now
              disabled={busy}
              onClick={() => onAnswer({ step: 'check_now', complaintId: view.id })}
              className={cn(TEXT_BUTTON, 'self-start')}
            >
              {busy ? <Spinner size={14} /> : null}
              {t('chat.complaintsCheckNow')}
            </button>
          ) : null}
        </div>
      );
  }
}

/**
 * When the e-mail to the card machine company is on screen: the dealer's own mail only while
 * the "have you sent it?" questions are open; MDG's one line (it was sent for them) on every screen.
 */
function showMail(view: ComplaintDealerView): boolean {
  const m = view.vendorMail;
  if (!m) return false;
  if (m.who === 'mdg') return true;
  return view.screen === 'asking' && !!view.question?.field.startsWith('vendor_mail');
}

/**
 * The complaint box inside an MDG message (`message.complaint`, ADR 0052).
 *
 * A dealer says in the chat that something is broken; MDG asks what is missing with
 * buttons, shows a summary, files it on IndianOil's portal on the dealer's yes, then
 * follows it and asks "is it working now?" when the engineer is done.
 *
 * THE BOX DRAWS THE COMPLAINT NOW, never what was true when the message was posted
 * (a message cannot be edited), and only the message the view names as
 * `liveMessageId` draws it. Every other message of the same complaint keeps just
 * its own words, which already say what happened: nothing extra, no second set of
 * buttons. It draws from the view's `screen` and never works out what comes next;
 * every answer returns the fresh view.
 *
 * The only thing in the chat that asks for this view, so a chat with no complaint
 * in it never makes the call.
 */
export function ComplaintBox({ complaintId, messageId }: { complaintId: string; messageId: string }) {
  const t = useT();
  const lang = useLang();
  const q = useComplaints();
  const view = complaintOf(q.data, complaintId);

  const answer = useAnswerComplaint();
  const [error, setError] = React.useState<string | null>(null);
  const busy = answer.isPending;

  // A refusal belongs to the step it was given on.
  const where = view ? `${view.screen}:${view.question?.id ?? ''}` : '';
  React.useEffect(() => setError(null), [where]);

  const send: Send = async (body) => {
    setError(null);
    try {
      await answer.mutateAsync(body);
    } catch (err) {
      // A 409 means the step moved; the view is already being asked for again and
      // the box redraws on it, so there is nothing to apologise for.
      if (!(err && typeof err === 'object' && 'status' in err && err.status === 409)) {
        setError(complaintsErrorText(err, t));
      }
    }
  };

  // Without the view the box cannot know whether this is the live message, so it draws
  // nothing: a loading or retry box here would show on every older message of the chat
  // and then vanish (or repeat) when the list answers. Not the live message: its words
  // say it all.
  if (!view || !isLiveBox(view, messageId)) return null;

  return (
    <div
      data-complaint
      data-screen={view.screen}
      // A touch in the box (a pick, a yes) must not select the message or start a
      // reply swipe: neither gesture may see it.
      data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}
      className="mt-1"
    >
      <div className="rounded-lg bg-wa-row-active px-2.5 py-2.5">
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-px flex size-7 shrink-0 items-center justify-center rounded-full bg-wa-in text-wa-accent-strong"
          >
            <Wrench width={15} strokeWidth={2} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[12px] leading-snug text-wa-meta">
              {sayIn(view.routeLabel, lang)}
              {view.number ? ` · ${t('chat.complaintsNumber', { number: view.number })}` : ''}
            </span>
            <span className="min-w-0 break-words text-[15px] font-medium leading-snug">
              {sayIn(view.title, lang)}
            </span>
          </div>
        </div>

        <div key={view.screen} className="animate-in mt-2.5 flex flex-col gap-2">
          {showMail(view) && view.vendorMail ? <VendorMailCard mail={view.vendorMail} /> : null}
          <Screen view={view} busy={busy} onAnswer={(body) => void send(body)} />
          {error ? <Notice text={error} /> : null}
        </div>
      </div>
    </div>
  );
}
